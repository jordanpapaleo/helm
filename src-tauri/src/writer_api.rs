//! Direct API transport. Secrets remain in the OS credential store and Rust.
use crate::writer::{WriterEvent, INSTRUCTIONS};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::ipc::Channel;

fn require_main(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Writer credentials are available only in the main window".into())
    }
}
fn validate_provider(provider: &str) -> Result<(), String> {
    if matches!(provider, "codex" | "claude") {
        Ok(())
    } else {
        Err("Unknown API provider".into())
    }
}
fn credential(provider: &str) -> Result<keyring::Entry, String> {
    validate_provider(provider)?;
    keyring::Entry::new("com.jordanpapaleo.helm.writer", provider)
        .map_err(|_| "System credential store is unavailable".into())
}
fn load_key(provider: &str) -> Result<String, String> {
    credential(provider)?
        .get_password()
        .map_err(|error| match error {
            keyring::Error::NoEntry => "No API key saved for this provider".into(),
            _ => "Cannot unlock the system credential store. Unlock it and try again.".into(),
        })
}
#[tauri::command]
pub async fn writer_key_status(
    window: tauri::WebviewWindow,
    provider: String,
) -> Result<bool, String> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || match credential(&provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Cannot access the system credential store".into()),
    })
    .await
    .map_err(|_| "Credential check failed".to_string())?
}
#[tauri::command]
pub async fn writer_key_set(
    window: tauri::WebviewWindow,
    provider: String,
    key: String,
) -> Result<(), String> {
    require_main(&window)?;
    if key.trim().len() < 10 || key.len() > 1024 || key.chars().any(char::is_whitespace) {
        return Err("Enter a valid API key without spaces".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        credential(&provider)?
            .set_password(&key)
            .map_err(|_| "Could not save API key in the system credential store".into())
    })
    .await
    .map_err(|_| "Could not save API key".to_string())?
}
#[tauri::command]
pub async fn writer_key_remove(
    window: tauri::WebviewWindow,
    provider: String,
) -> Result<(), String> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || match credential(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove API key from the system credential store".into()),
    })
    .await
    .map_err(|_| "Could not remove API key".to_string())?
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|_| "Could not prepare secure API connection".into())
}
fn request(
    client: &reqwest::Client,
    provider: &str,
    key: &str,
    path: &str,
) -> reqwest::RequestBuilder {
    if provider == "codex" {
        client
            .request(
                reqwest::Method::GET,
                format!("https://api.openai.com/v1/{path}"),
            )
            .bearer_auth(key)
    } else {
        client
            .request(
                reqwest::Method::GET,
                format!("https://api.anthropic.com/v1/{path}"),
            )
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
    }
}
fn http_error(status: reqwest::StatusCode) -> String {
    match status.as_u16() {
        401 | 403 => "API access denied. Check the saved key and model permissions.",
        429 => "API rate or spending limit reached. Check your provider's API billing and retry.",
        400 | 404 => "This model or request is not supported. Choose a text model available to your API account.",
        _ => "The API provider is unavailable. Please retry later.",
    }.into()
}
#[tauri::command]
pub async fn writer_api_models(
    window: tauri::WebviewWindow,
    provider: String,
) -> Result<Vec<String>, String> {
    require_main(&window)?;
    validate_provider(&provider)?;
    let p = provider.clone();
    let key = tauri::async_runtime::spawn_blocking(move || load_key(&p))
        .await
        .map_err(|_| "Could not read API credential")??;
    let client = client()?;
    let mut ids = Vec::new();
    let mut after = None;
    for _ in 0..20 {
        let mut req = request(&client, &provider, &key, "models");
        if provider == "claude" {
            req = req.query(&[("limit", "100")]);
        }
        if let Some(ref id) = after {
            req = req.query(&[("after_id", id)]);
        }
        let response = req
            .send()
            .await
            .map_err(|_| "Could not reach API provider")?;
        if !response.status().is_success() {
            return Err(http_error(response.status()));
        }
        let data: Value = response
            .json()
            .await
            .map_err(|_| "Invalid model catalog from provider")?;
        for model in data["data"].as_array().ok_or("Invalid model catalog")? {
            if let Some(id) = model["id"].as_str() {
                if id.len() <= 160 {
                    ids.push(id.to_owned());
                }
            }
        }
        if provider != "claude" || data["has_more"] != true {
            break;
        }
        after = Some(
            data["last_id"]
                .as_str()
                .ok_or("Incomplete model catalog")?
                .to_owned(),
        );
    }
    ids.sort();
    ids.dedup();
    Ok(ids)
}
fn body(provider: &str, model: &str, prompt: &str) -> Value {
    if provider == "codex" {
        json!({"model":model,"instructions":INSTRUCTIONS,"input":[{"role":"user","content":prompt}],"stream":true,"store":false})
    } else {
        json!({"model":model,"system":INSTRUCTIONS,"messages":[{"role":"user","content":prompt}],"max_tokens":4096,"stream":true})
    }
}
// SSE is framed by blank lines, not HTTP chunks. Buffer raw bytes so split UTF-8
// sequences are decoded only after a complete event has arrived.
#[derive(Default)]
struct Sse {
    bytes: Vec<u8>,
}
impl Sse {
    fn push(&mut self, chunk: &[u8]) -> Result<Vec<Value>, String> {
        self.bytes.extend_from_slice(chunk);
        if self.bytes.len() > 1_048_576 {
            return Err("API stream event exceeded the size limit".into());
        }
        let mut events = Vec::new();
        loop {
            let boundary = self
                .bytes
                .windows(2)
                .position(|w| w == b"\n\n")
                .map(|i| (i, 2))
                .into_iter()
                .chain(
                    self.bytes
                        .windows(4)
                        .position(|w| w == b"\r\n\r\n")
                        .map(|i| (i, 4)),
                )
                .min_by_key(|(i, _)| *i);
            let Some((end, length)) = boundary else {
                break;
            };
            let raw: Vec<_> = self.bytes.drain(..end + length).collect();
            let text = std::str::from_utf8(&raw).map_err(|_| "Invalid text in API stream")?;
            let data = text
                .lines()
                .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
                .collect::<Vec<_>>()
                .join("\n");
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            events.push(serde_json::from_str(&data).map_err(|_| "Invalid event in API stream")?);
        }
        Ok(events)
    }
}
fn decode(provider: &str, event: &Value) -> Option<(&'static str, String)> {
    let kind = event["type"].as_str()?;
    if kind == "error" || kind == "response.failed" || kind == "response.incomplete" {
        return Some(("failed", "The API did not complete this reply. Partial text is preserved; check model access and usage limits.".into()));
    }
    if provider == "codex" {
        match kind {
            "response.output_text.delta" | "response.refusal.delta" => {
                Some(("text", event["delta"].as_str()?.to_owned()))
            }
            "response.completed" => Some(("completed", String::new())),
            _ => None,
        }
    } else {
        match kind {
            "content_block_delta" if event["delta"]["type"] == "text_delta" => {
                Some(("text", event["delta"]["text"].as_str()?.to_owned()))
            }
            "message_delta" if event["delta"]["stop_reason"] == "max_tokens" => Some((
                "failed",
                "Reply reached its output limit. Partial text is preserved.".into(),
            )),
            "message_stop" => Some(("completed", String::new())),
            _ => None,
        }
    }
}
pub async fn run(
    provider: &str,
    model: &str,
    prompt: &str,
    cancelled: Arc<AtomicBool>,
    id: &str,
    events: Channel<WriterEvent>,
) -> Result<(), String> {
    validate_provider(provider)?;
    if model.is_empty() || model.len() > 160 || model.chars().any(char::is_whitespace) {
        return Err("Select an API model in Settings → Tools".into());
    }
    let p = provider.to_owned();
    let key = tauri::async_runtime::spawn_blocking(move || load_key(&p))
        .await
        .map_err(|_| "Could not read API credential")??;
    let client = client()?;
    let endpoint = if provider == "codex" {
        "responses"
    } else {
        "messages"
    };
    // Only the fixed official origin is used; no redirects or key-bearing URLs.
    let req = request(&client, provider, &key, endpoint)
        .build()
        .map_err(|_| "Could not prepare API request")?;
    let mut req = req;
    *req.method_mut() = reqwest::Method::POST;
    *req.body_mut() = Some(reqwest::Body::from(
        serde_json::to_vec(&body(provider, model, prompt)).map_err(|_| "Invalid request")?,
    ));
    req.headers_mut().insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    let send = client.execute(req);
    tokio::pin!(send);
    let emit = |kind, text| {
        events
            .send(WriterEvent {
                request_id: id.into(),
                kind,
                text,
            })
            .is_ok()
    };
    let mut tick = tokio::time::interval(Duration::from_millis(100));
    let response = loop {
        tokio::select! {
            _ = tick.tick() => if cancelled.load(Ordering::Relaxed) { emit("cancelled", String::new()); return Ok(()); },
            result = &mut send => break result.map_err(|_| "API connection failed or timed out")?,
        }
    };
    if !response.status().is_success() {
        return Err(http_error(response.status()));
    }
    let mut stream = response.bytes_stream();
    let mut parser = Sse::default();
    let mut size = 0;
    loop {
        tokio::select! {
            _ = tick.tick() => if cancelled.load(Ordering::Relaxed) { emit("cancelled", String::new()); return Ok(()); },
            chunk = stream.next() => {
                let Some(chunk) = chunk else { return Err("API stream ended before completion. Partial reply is preserved.".into()); };
                for event in parser.push(&chunk.map_err(|_| "API stream interrupted")?)? {
                    if let Some((kind, text)) = decode(provider, &event) {
                        size += text.len();
                        if size > 100_000 { return Err("API reply exceeded the size limit".into()); }
                        if !emit(kind, text) || kind != "text" { return Ok(()); }
                    }
                }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_fragmented_unicode_crlf_and_multiple_events() {
        let bytes = "event: text\r\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"héllo\"}\r\n\r\ndata: {\"type\":\"response.completed\"}\n\n".as_bytes();
        let mut parser = Sse::default();
        let mut output = Vec::new();
        for byte in bytes {
            output.extend(parser.push(&[*byte]).unwrap());
        }
        assert_eq!(decode("codex", &output[0]), Some(("text", "héllo".into())));
        assert_eq!(decode("codex", &output[1]).unwrap().0, "completed");
    }
    #[test]
    fn rejects_bad_events_and_redacts_provider_errors() {
        assert!(Sse::default().push(b"data: nope\n\n").is_err());
        assert!(!decode(
            "claude",
            &json!({"type":"error","error":{"message":"secret"}})
        )
        .unwrap()
        .1
        .contains("secret"));
        assert!(validate_provider("http://evil").is_err());
    }
    #[test]
    fn requests_are_explicit_and_dont_enable_tools() {
        let openai = body("codex", "my-model", "hello");
        assert_eq!(openai["store"], false);
        assert_eq!(openai["stream"], true);
        assert!(openai.get("tools").is_none());
        assert_eq!(body("claude", "my-model", "hello")["max_tokens"], 4096);
    }
}
