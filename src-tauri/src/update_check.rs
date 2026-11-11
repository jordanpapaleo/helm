//! Read the GitHub release and updater manifest for Check for Updates.
//!
//! The webview cannot read the manifest. `releases/latest/download/latest.json`
//! redirects to `release-assets.githubusercontent.com`, and that response has
//! no `Access-Control-Allow-Origin`, so `fetch` throws before an HTTP status
//! exists. CSP is not involved (`csp` is null). This command follows the
//! redirect and returns GitHub's status. A connection failure is an error;
//! a 403 is a status, so the dialog can tell them apart.
//!
//! Error strings stay generic. Redirect targets are signed asset URLs, and the
//! manifest body contains update signatures. Neither belongs in a log or an error.

use std::time::Duration;

/// KEEP IN SYNC with `RELEASES_LATEST_API_URL` in `src/lib/updater-manifest.mjs`.
const RELEASES_LATEST_API_URL: &str =
    "https://api.github.com/repos/jordanpapaleo/helm/releases/latest";

/// KEEP IN SYNC with `UPDATER_MANIFEST_URL` in `src/lib/updater-manifest.mjs`.
const UPDATER_MANIFEST_URL: &str =
    "https://github.com/jordanpapaleo/helm/releases/latest/download/latest.json";

const NETWORK_ERROR: &str = "Could not reach GitHub to check for updates.";

/// The manifest is a few hundred bytes and the release JSON is a few kilobytes.
/// Anything larger is not a document this command is willing to hold.
const MAX_UPDATE_BODY: usize = 1024 * 1024;

const MAX_REDIRECTS: usize = 5;

const USER_AGENT: &str = "Helm-Desktop-App";

#[derive(Debug)]
struct RedirectRejected;

impl std::fmt::Display for RedirectRejected {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("redirect rejected")
    }
}

impl std::error::Error for RedirectRejected {}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub struct UpdateDocument {
    pub status: u16,
    pub body: String,
}

fn is_update_document_url(url: &str) -> bool {
    url == RELEASES_LATEST_API_URL || url == UPDATER_MANIFEST_URL
}

fn is_update_redirect_host(host: &str) -> bool {
    host == "github.com" || host == "api.github.com" || host.ends_with(".githubusercontent.com")
}

fn is_allowed_redirect(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(is_update_redirect_host)
}

fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS || !is_allowed_redirect(attempt.url()) {
            attempt.error(RedirectRejected)
        } else {
            attempt.follow()
        }
    })
}

fn accept_header(url: &str) -> &'static str {
    if url.starts_with("https://api.github.com/") {
        "application/vnd.github+json"
    } else {
        "application/json"
    }
}

fn update_client() -> Result<reqwest::Client, String> {
    client_with_timeout(Duration::from_secs(10), Duration::from_secs(20))
}

fn client_with_timeout(connect: Duration, total: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(redirect_policy())
        .connect_timeout(connect)
        .timeout(total)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| NETWORK_ERROR.to_string())
}

async fn read_update_document(
    client: &reqwest::Client,
    url: &str,
) -> Result<UpdateDocument, String> {
    // Drop the reqwest error. Its Display includes the URL, and a redirect
    // target is a signed asset URL.
    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, accept_header(url))
        .send()
        .await
        .map_err(|_| NETWORK_ERROR.to_string())?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|_| NETWORK_ERROR.to_string())?;
    if body.len() > MAX_UPDATE_BODY {
        return Err(NETWORK_ERROR.to_string());
    }
    Ok(UpdateDocument { status, body })
}

async fn fetch_allowed_document(url: &str) -> Result<UpdateDocument, String> {
    if !is_update_document_url(url) {
        return Err(NETWORK_ERROR.to_string());
    }
    let client = update_client()?;
    read_update_document(&client, url).await
}

#[tauri::command]
pub async fn fetch_update_document(url: String) -> Result<UpdateDocument, String> {
    fetch_allowed_document(&url).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn only_the_two_helm_documents_are_allowed() {
        assert!(is_update_document_url(RELEASES_LATEST_API_URL));
        assert!(is_update_document_url(UPDATER_MANIFEST_URL));
        assert!(!is_update_document_url(
            "https://api.github.com/repos/other/helm/releases/latest"
        ));
        assert!(!is_update_document_url(
            "http://api.github.com/repos/jordanpapaleo/helm/releases/latest"
        ));
        assert!(!is_update_document_url(&format!(
            "{RELEASES_LATEST_API_URL}?x=1"
        )));
        assert!(!is_update_document_url(&format!(
            "https://user:token@{host}",
            host = RELEASES_LATEST_API_URL.trim_start_matches("https://")
        )));
    }

    #[test]
    fn redirects_stay_on_https_github_hosts() {
        let allow = [
            "https://github.com/jordanpapaleo/helm/releases/download/v1.12.0/latest.json",
            "https://api.github.com/repos/jordanpapaleo/helm/releases/latest",
            "https://release-assets.githubusercontent.com/asset",
            "https://objects.githubusercontent.com/asset",
        ];
        for url in allow {
            let parsed = reqwest::Url::parse(url).unwrap();
            assert!(is_allowed_redirect(&parsed), "{url}");
        }
        let reject = [
            "http://github.com/jordanpapaleo/helm/releases/latest",
            "https://example.com/latest.json",
            "https://github.com.evil.test/latest.json",
            "https://release-assets.githubusercontent.com.evil.test/asset",
            "https://notgithubusercontent.com/asset",
        ];
        for url in reject {
            let parsed = reqwest::Url::parse(url).unwrap();
            assert!(!is_allowed_redirect(&parsed), "{url}");
        }
    }

    #[test]
    fn the_network_error_has_no_document_or_url() {
        assert!(!NETWORK_ERROR.contains("signature"));
        assert!(!NETWORK_ERROR.contains("http"));
        assert!(!NETWORK_ERROR.contains("github.com"));
    }

    fn serve_once(raw: String) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let mut buf = [0_u8; 2048];
            let _ = stream.read(&mut buf);
            let _ = stream.write_all(raw.as_bytes());
            let _ = stream.flush();
        });
        format!("http://{addr}/doc")
    }

    fn http_response(status: u16, reason: &str, extra: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n{body}",
            body.len()
        )
    }

    fn test_client() -> reqwest::Client {
        client_with_timeout(Duration::from_secs(2), Duration::from_secs(2)).unwrap()
    }

    #[tokio::test]
    async fn a_github_status_is_returned_with_its_body() {
        let body = "{\"message\":\"nope\"}";
        let url = serve_once(http_response(403, "Forbidden", "", body));
        let document = read_update_document(&test_client(), &url).await.unwrap();
        assert_eq!(document.status, 403);
        assert_eq!(document.body, body);
    }

    #[tokio::test]
    async fn a_rejected_redirect_is_a_network_error_without_the_target() {
        let secret = "signature-SECRET-do-not-leak";
        let url = serve_once(http_response(
            302,
            "Found",
            "Location: https://example.com/latest.json\r\n",
            secret,
        ));
        let err = read_update_document(&test_client(), &url)
            .await
            .expect_err("redirect host is not GitHub");
        assert_eq!(err, NETWORK_ERROR);
        assert!(!err.contains(secret));
        assert!(!err.contains("example.com"));
    }

    #[tokio::test]
    async fn a_refused_url_is_not_requested() {
        let err = fetch_allowed_document("https://example.com/latest.json")
            .await
            .expect_err("url is not an update document");
        assert_eq!(err, NETWORK_ERROR);
        assert!(!err.contains("example.com"));
    }

    #[tokio::test]
    async fn a_closed_port_is_a_network_error() {
        let err = read_update_document(&test_client(), "http://127.0.0.1:1/doc")
            .await
            .expect_err("nothing is listening");
        assert_eq!(err, NETWORK_ERROR);
    }

    /// Confirms the real release and manifest are readable, including the
    /// redirect the webview cannot follow. Not part of `cargo test`.
    #[tokio::test]
    #[ignore = "reaches GitHub"]
    async fn live_release_and_manifest_are_readable() {
        let release = fetch_allowed_document(RELEASES_LATEST_API_URL)
            .await
            .expect("release api");
        assert_eq!(release.status, 200);
        let release_json: serde_json::Value =
            serde_json::from_str(&release.body).unwrap_or_else(|_| panic!("release was not json"));
        let tag = release_json["tag_name"].as_str().expect("tag_name");
        assert!(tag.starts_with('v'));

        let manifest = fetch_allowed_document(UPDATER_MANIFEST_URL)
            .await
            .expect("manifest");
        assert_eq!(manifest.status, 200);
        let manifest_json: serde_json::Value = serde_json::from_str(&manifest.body)
            .unwrap_or_else(|_| panic!("manifest was not json"));
        let version = manifest_json["version"].as_str().expect("version");
        assert_eq!(version, tag.trim_start_matches('v'));
    }
}
