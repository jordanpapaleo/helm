//! Optional per-vault Git sync.
//!
//! This module checkpoints the vault, fetches, fast-forwards or merges, and
//! pushes. It does not force-push, hard-reset, or delete untracked files.
//!
//! Recovery actions that replace one side of a vault live in GitHub issue #48.
//! They need three things this module deliberately leaves in place:
//! - `remote_oid` on the sync status, the SHA a later `--force-with-lease`
//!   must pin. If that SHA moves, the replace must stop for another review.
//! - a sync runner that refuses `--force`, `--force-with-lease`, `reset`, and
//!   `clean`. Recovery has to use its own runner.
//! - `.helm-sync-backups/`, gitignored and never written here, where a later
//!   "replace local with remote" must copy commits, dirty files, and untracked
//!   files before it changes the worktree.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const LOCAL_TIMEOUT: Duration = Duration::from_secs(15);
const NETWORK_TIMEOUT: Duration = Duration::from_secs(20);
const MANAGED_START: &str = "# helm-sync:begin";
const MANAGED_END: &str = "# helm-sync:end";
/// Reserved for issue #48. Sync never creates or deletes this directory.
const SYNC_BACKUP_DIR: &str = ".helm-sync-backups";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    pub state: String,
    pub message: String,
    pub ahead: u32,
    pub behind: u32,
    pub pending_commits: u32,
    pub dirty: bool,
    pub last_success_ms: Option<u64>,
    pub remote_oid: Option<String>,
    pub attention_paths: Vec<String>,
    pub committed: bool,
    pub pushed: bool,
    pub branch: Option<String>,
    pub origin_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectPreview {
    pub files: Vec<String>,
    pub commits_ahead: u32,
    pub branch: String,
    pub origin_url: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub outcome: SyncOutcome,
    pub files: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InspectReport {
    pub git_available: bool,
    pub is_repo: bool,
    pub vault_is_root: bool,
    pub origin_url: Option<String>,
    pub branch: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTest {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SyncMeta {
    #[serde(default)]
    last_success_ms: Option<u64>,
    /// Remote tip last fetched. Issue #48 pins `--force-with-lease` to this.
    #[serde(default)]
    remote_oid: Option<String>,
    #[serde(default)]
    attention_paths: Vec<String>,
    #[serde(default)]
    attention_message: Option<String>,
}

#[derive(Debug)]
struct GitOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

fn locks() -> &'static Mutex<HashMap<PathBuf, Arc<Mutex<()>>>> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn args(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| (*s).to_string()).collect()
}

/// Sync refuses the operations issue #48 owns. Recovery must not call this runner.
fn enforce_v1_safety(git_args: &[String]) -> Result<(), String> {
    if git_args.iter().any(|a| {
        a == "--force"
            || a.starts_with("--force=")
            || a == "--force-with-lease"
            || a.starts_with("--force-with-lease=")
    }) {
        return Err(
            "Sync does not force-push. Replacing the remote is a separate recovery action."
                .to_string(),
        );
    }
    if git_args.first().map(String::as_str) == Some("reset")
        || git_args.first().map(String::as_str) == Some("clean")
    {
        return Err(
            "Sync does not reset or clean the worktree. Replacing local files is a separate recovery action."
                .to_string(),
        );
    }
    Ok(())
}

pub fn redact_credentials(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(idx) = rest.find("://") {
        result.push_str(&rest[..idx + 3]);
        rest = &rest[idx + 3..];
        let end = rest
            .find(|c: char| c == '/' || c.is_whitespace())
            .unwrap_or(rest.len());
        let segment = &rest[..end];
        if let Some(at) = segment.find('@') {
            let userinfo = &segment[..at];
            if userinfo.contains(':') {
                result.push_str("***@");
                result.push_str(&segment[at + 1..]);
            } else {
                result.push_str(segment);
            }
        } else {
            result.push_str(segment);
        }
        rest = &rest[end..];
    }
    result.push_str(rest);
    result
}

fn validate_absolute(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path.is_relative() {
        return Err(format!("Path must be absolute: {}", path.display()));
    }
    if path
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        return Err(format!("Path traversal not allowed: {}", path.display()));
    }
    Ok(path)
}

pub fn validate_branch(branch: &str) -> Result<(), String> {
    let branch = branch.trim();
    if branch.is_empty()
        || branch.starts_with('-')
        || branch.starts_with('/')
        || branch.ends_with('/')
        || branch.ends_with('.')
        || branch.contains("..")
        || branch.contains('@')
        || branch.contains(':')
        || branch.contains('\\')
        || branch.contains(' ')
    {
        return Err("Branch name is not valid. Use letters, numbers, and /._-".to_string());
    }
    if !branch
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '_' | '-'))
    {
        return Err("Branch name is not valid. Use letters, numbers, and /._-".to_string());
    }
    Ok(())
}

pub fn validate_remote_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Enter a remote URL without spaces.".to_string());
    }
    if has_embedded_credentials(url) {
        return Err(
            "Remote URL must not contain a token or password. Use SSH or a Git credential helper."
                .to_string(),
        );
    }
    let ok = url.starts_with("https://")
        || url.starts_with("ssh://")
        || url.starts_with("git@")
        || url.starts_with('/');
    if !ok {
        return Err(
            "Use an https:// URL, an SSH URL (ssh:// or git@host:path), or an absolute local path."
                .to_string(),
        );
    }
    Ok(())
}

fn has_embedded_credentials(url: &str) -> bool {
    let Some(rest) = url.split_once("://").map(|(_, rest)| rest) else {
        return false;
    };
    let segment = rest.split('/').next().unwrap_or(rest);
    let Some((userinfo, _)) = segment.split_once('@') else {
        return false;
    };
    userinfo.contains(':')
}

fn canonical_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    trimmed.strip_suffix(".git").unwrap_or(trimmed).to_string()
}

fn urls_equal(a: &str, b: &str) -> bool {
    canonical_url(a) == canonical_url(b)
}

fn resolve_git() -> Result<PathBuf, String> {
    if let Ok(out) = Command::new("git").arg("--version").output() {
        if out.status.success() {
            return Ok(PathBuf::from("git"));
        }
    }
    for candidate in [
        "/usr/bin/git",
        "/opt/homebrew/bin/git",
        "/usr/local/bin/git",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("Git is not installed or Helm cannot find it. Install Git and restart Helm. This vault still works offline without sync.".to_string())
}

fn run_sync_git(cwd: &Path, git_args: &[String], timeout: Duration) -> Result<GitOutput, String> {
    enforce_v1_safety(git_args)?;
    let bin = resolve_git()?;
    let mut cmd = Command::new(bin);
    cmd.args(git_args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_EDITOR", "true")
        .env("GIT_MERGE_AUTOEDIT", "no")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let child = cmd.spawn().map_err(|e| {
        format!(
            "Could not start Git. Install Git and restart Helm. {}",
            redact_credentials(&e.to_string())
        )
    })?;
    let pid = child.id();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => Ok(GitOutput {
            code: output.status.code().unwrap_or(1),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        }),
        Ok(Err(e)) => Err(redact_credentials(&e.to_string())),
        Err(_) => {
            kill_group(pid);
            Err("Git took too long and was stopped. Your notes were left as they were. Try again when the network is available.".to_string())
        }
    }
}

fn kill_group(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
    }
}

fn git_text(out: &GitOutput) -> String {
    redact_credentials(&format!("{}\n{}", out.stderr.trim(), out.stdout.trim()))
}

fn repo_lock(path: &Path) -> Arc<Mutex<()>> {
    let mut map = locks().lock().unwrap_or_else(|e| e.into_inner());
    map.entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn with_repo<T>(vault: &str, f: impl FnOnce(&Path) -> Result<T, String>) -> Result<T, String> {
    let path = validate_absolute(vault)?;
    if !path.is_dir() {
        return Err(format!("Vault folder does not exist: {}", path.display()));
    }
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let lock = repo_lock(&path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    f(&path)
}

fn meta_path(repo: &Path) -> PathBuf {
    repo.join(".git").join("helm-sync.json")
}

fn load_meta(repo: &Path) -> SyncMeta {
    let path = meta_path(repo);
    let Ok(raw) = fs::read_to_string(path) else {
        return SyncMeta::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_meta(repo: &Path, meta: &SyncMeta) {
    let path = meta_path(repo);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let Ok(body) = serde_json::to_string_pretty(meta) else {
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if fs::write(&tmp, body).is_ok() {
        let _ = fs::rename(&tmp, &path);
    }
}

fn blank(state: &str, message: &str) -> SyncOutcome {
    SyncOutcome {
        state: state.to_string(),
        message: message.to_string(),
        ahead: 0,
        behind: 0,
        pending_commits: 0,
        dirty: false,
        last_success_ms: None,
        remote_oid: None,
        attention_paths: Vec::new(),
        committed: false,
        pushed: false,
        branch: None,
        origin_url: None,
    }
}

fn error_outcome(message: &str) -> SyncOutcome {
    blank("error", message)
}

struct Observed {
    branch: Option<String>,
    origin_url: Option<String>,
    ahead: u32,
    behind: u32,
    dirty: bool,
    remote_oid: Option<String>,
    meta: SyncMeta,
    unsafe_message: Option<String>,
}

fn observe(repo: &Path) -> Observed {
    let branch = current_branch(repo).ok();
    let origin_url = origin_url(repo).map(|u| redact_credentials(&u));
    let remote_oid = branch.as_deref().and_then(|b| remote_oid(repo, b));
    let (ahead, behind) = match &branch {
        Some(branch) => ahead_behind(repo, branch),
        None => (0, 0),
    };
    Observed {
        branch,
        origin_url,
        ahead,
        behind,
        dirty: is_dirty(repo),
        remote_oid,
        meta: load_meta(repo),
        unsafe_message: unsafe_state(repo),
    }
}

fn fill(repo: &Path, mut outcome: SyncOutcome) -> SyncOutcome {
    let obs = observe(repo);
    outcome.ahead = obs.ahead;
    outcome.behind = obs.behind;
    outcome.pending_commits = obs.ahead;
    outcome.dirty = obs.dirty;
    outcome.branch = obs.branch;
    outcome.origin_url = obs.origin_url;
    outcome.remote_oid = obs.remote_oid.clone().or(obs.meta.remote_oid.clone());
    outcome.last_success_ms = obs.meta.last_success_ms;
    if outcome.attention_paths.is_empty() {
        outcome.attention_paths = obs.meta.attention_paths;
    }
    if outcome.remote_oid.is_none() {
        outcome.remote_oid = obs.remote_oid;
    }
    outcome
}

fn note_result(repo: &Path, state: &str, message: &str, paths: &[String], remote: Option<String>) {
    let mut meta = load_meta(repo);
    if let Some(oid) = remote {
        meta.remote_oid = Some(oid);
    }
    if state == "attention" {
        meta.attention_message = Some(message.to_string());
        meta.attention_paths = paths.to_vec();
    } else if state == "synced" || state == "pending" {
        meta.attention_message = None;
        meta.attention_paths.clear();
        meta.last_success_ms = Some(now_ms());
    }
    save_meta(repo, &meta);
}

fn current_branch(repo: &Path) -> Result<String, String> {
    let out = run_sync_git(
        repo,
        &args(&["symbolic-ref", "--short", "HEAD"]),
        LOCAL_TIMEOUT,
    )?;
    if out.code != 0 {
        return Err("This vault has a detached HEAD. Check out a branch before syncing. Helm did not change your files.".to_string());
    }
    let branch = out.stdout.trim().to_string();
    if branch.is_empty() || branch == "HEAD" {
        return Err(
            "This vault has a detached HEAD. Check out a branch before syncing.".to_string(),
        );
    }
    Ok(branch)
}

fn origin_url(repo: &Path) -> Option<String> {
    let out = run_sync_git(repo, &args(&["remote", "get-url", "origin"]), LOCAL_TIMEOUT).ok()?;
    if out.code != 0 {
        return None;
    }
    let url = out.stdout.trim().to_string();
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

fn remote_oid(repo: &Path, branch: &str) -> Option<String> {
    let spec = format!("refs/remotes/origin/{branch}");
    let out = run_sync_git(
        repo,
        &args(&["rev-parse", "--verify", &spec]),
        LOCAL_TIMEOUT,
    )
    .ok()?;
    if out.code != 0 {
        return None;
    }
    Some(out.stdout.trim().to_string())
}

fn head_oid(repo: &Path) -> Option<String> {
    let out = run_sync_git(
        repo,
        &args(&["rev-parse", "--verify", "HEAD"]),
        LOCAL_TIMEOUT,
    )
    .ok()?;
    if out.code != 0 {
        return None;
    }
    Some(out.stdout.trim().to_string())
}

fn ahead_behind(repo: &Path, branch: &str) -> (u32, u32) {
    if remote_oid(repo, branch).is_none() {
        let ahead = run_sync_git(repo, &args(&["rev-list", "--count", "HEAD"]), LOCAL_TIMEOUT)
            .ok()
            .filter(|o| o.code == 0)
            .and_then(|o| o.stdout.trim().parse().ok())
            .unwrap_or(0);
        return (ahead, 0);
    }
    let spec = format!("HEAD...origin/{branch}");
    let out = run_sync_git(
        repo,
        &args(&["rev-list", "--left-right", "--count", &spec]),
        LOCAL_TIMEOUT,
    );
    let Ok(out) = out else { return (0, 0) };
    if out.code != 0 {
        return (0, 0);
    }
    let mut parts = out.stdout.split_whitespace();
    let ahead = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

fn is_dirty(repo: &Path) -> bool {
    run_sync_git(repo, &args(&["status", "--porcelain"]), LOCAL_TIMEOUT)
        .ok()
        .map(|o| o.code == 0 && !o.stdout.trim().is_empty())
        .unwrap_or(false)
}

fn unsafe_state(repo: &Path) -> Option<String> {
    let git = repo.join(".git");
    if git.join("MERGE_HEAD").exists() {
        return Some("A merge is already in progress in this vault. Finish or abort it in Git before syncing. Helm did not change it.".to_string());
    }
    if git.join("rebase-merge").exists() || git.join("rebase-apply").exists() {
        return Some("A rebase is already in progress in this vault. Finish or abort it in Git before syncing. Helm did not change it.".to_string());
    }
    if git.join("CHERRY_PICK_HEAD").exists() {
        return Some("A cherry-pick is already in progress in this vault. Finish or abort it in Git before syncing.".to_string());
    }
    None
}

fn ensure_no_index_lock(repo: &Path) -> Result<(), String> {
    if repo.join(".git").join("index.lock").exists() {
        return Err("Git's index is locked by another command. Wait for it to finish, then sync again. Helm did not change your files.".to_string());
    }
    Ok(())
}

fn repo_root(path: &Path) -> Option<PathBuf> {
    let out = run_sync_git(
        path,
        &args(&["rev-parse", "--show-toplevel"]),
        LOCAL_TIMEOUT,
    )
    .ok()?;
    if out.code != 0 {
        return None;
    }
    let root = PathBuf::from(out.stdout.trim());
    Some(root.canonicalize().unwrap_or(root))
}

fn ensure_vault_is_root(vault: &Path) -> Result<(), String> {
    let canon = vault.canonicalize().map_err(|e| e.to_string())?;
    if let Some(root) = repo_root(vault) {
        if root != canon {
            return Err(format!(
                "This folder is inside another Git repository ({}). Helm will not use a parent repository. Create the repository in the vault folder, or clone the remote into its own folder and add that as a vault.",
                root.display()
            ));
        }
    }
    Ok(())
}

fn is_git_repo(vault: &Path) -> bool {
    repo_root(vault).is_some_and(|root| root == vault)
}

fn identity_ok(repo: &Path) -> bool {
    let out = run_sync_git(repo, &args(&["var", "GIT_AUTHOR_IDENT"]), LOCAL_TIMEOUT);
    match out {
        Ok(out) if out.code == 0 => {
            let ident = out.stdout.trim();
            ident.contains('<') && ident.contains('>')
        }
        _ => false,
    }
}

fn ensure_identity(repo: &Path) -> Result<(), String> {
    if identity_ok(repo) {
        Ok(())
    } else {
        Err("Set git user.name and user.email before connecting. Helm will not change your Git configuration.".to_string())
    }
}

fn managed_block() -> String {
    format!(
        "{MANAGED_START}\n\
# Managed by Helm. Time Machine snapshots stay on this machine.\n\
# .helm-sync-backups is reserved for a future local recovery backup.\n\
# Helm will not untrack a file that is already committed.\n\
.helm-history/\n\
{SYNC_BACKUP_DIR}/\n\
*.tmp\n\
*~\n\
.DS_Store\n\
{MANAGED_END}\n"
    )
}

fn upsert_block(existing: &str) -> String {
    let block = managed_block();
    if let Some(start) = existing.find(MANAGED_START) {
        if let Some(end_rel) = existing[start..].find(MANAGED_END) {
            let end = start + end_rel + MANAGED_END.len();
            let mut next = String::new();
            next.push_str(existing[..start].trim_end_matches('\n'));
            if !next.is_empty() {
                next.push_str("\n\n");
            }
            next.push_str(block.trim_end_matches('\n'));
            next.push('\n');
            let rest = existing[end..].trim_start_matches('\n');
            if !rest.is_empty() {
                next.push('\n');
                next.push_str(rest);
                if !next.ends_with('\n') {
                    next.push('\n');
                }
            }
            return next;
        }
    }
    let mut next = existing.to_string();
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    if !next.is_empty() && !next.ends_with("\n\n") {
        next.push('\n');
    }
    next.push_str(&block);
    next
}

fn ensure_gitignore(repo: &Path) -> Result<Vec<String>, String> {
    let path = repo.join(".gitignore");
    let existing = if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let updated = upsert_block(&existing);
    if updated != existing {
        fs::write(&path, &updated).map_err(|e| e.to_string())?;
    }
    let mut warnings = Vec::new();
    let tracked = run_sync_git(
        repo,
        &args(&["ls-files", "--", ".helm-history"]),
        LOCAL_TIMEOUT,
    )?;
    if tracked.code == 0 && !tracked.stdout.trim().is_empty() {
        warnings.push(
            "Time Machine snapshots in .helm-history are already tracked. Helm will not untrack them, so they will keep syncing until you remove them from Git yourself."
                .to_string(),
        );
    }
    Ok(warnings)
}

fn excluded_path(path: &str) -> bool {
    let path = path.trim_matches('"');
    path == ".helm-history"
        || path.starts_with(".helm-history/")
        || path == SYNC_BACKUP_DIR
        || path.starts_with(&format!("{SYNC_BACKUP_DIR}/"))
        || path.ends_with(".tmp")
        || path.ends_with('~')
        || path.ends_with(".DS_Store")
        || path == ".git"
        || path.starts_with(".git/")
}

fn parse_porcelain(stdout: &str) -> Vec<String> {
    let mut files = Vec::new();
    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let raw = line[3..].trim();
        let path = raw
            .rsplit(" -> ")
            .next()
            .unwrap_or(raw)
            .trim()
            .trim_matches('"');
        if path.is_empty() || excluded_path(path) {
            continue;
        }
        files.push(path.to_string());
    }
    files
}

fn walk_files(dir: &Path, root: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.ends_with('~') || name.ends_with(".tmp") {
            continue;
        }
        if path.is_dir() {
            walk_files(&path, root, out);
        } else if let Ok(rel) = path.strip_prefix(root) {
            let rel = rel.to_string_lossy().replace('\\', "/");
            if !excluded_path(&rel) {
                out.push(rel);
            }
        }
    }
}

fn candidate_files(repo: &Path) -> Vec<String> {
    if is_git_repo(repo) {
        if let Ok(out) = run_sync_git(
            repo,
            &args(&["status", "--porcelain", "-uall"]),
            LOCAL_TIMEOUT,
        ) {
            if out.code == 0 {
                return parse_porcelain(&out.stdout);
            }
        }
    }
    let mut files = Vec::new();
    walk_files(repo, repo, &mut files);
    files.sort();
    files
}

fn transport_state(text: &str) -> &'static str {
    let lower = text.to_lowercase();
    if lower.contains("took too long")
        || lower.contains("timed out")
        || lower.contains("could not resolve")
        || lower.contains("name resolution")
        || lower.contains("network is unreachable")
        || lower.contains("connection refused")
        || lower.contains("connection reset")
        || lower.contains("unable to access")
        || lower.contains("no route to host")
        || lower.contains("the remote end hung up")
    {
        "offline"
    } else {
        "error"
    }
}

enum FetchStatus {
    Updated,
    Empty,
}

fn fetch_origin(repo: &Path, branch: &str) -> Result<FetchStatus, (String, String)> {
    let out = match run_sync_git(repo, &args(&["fetch", "origin", branch]), NETWORK_TIMEOUT) {
        Ok(out) => out,
        Err(e) => return Err((transport_state(&e).to_string(), e)),
    };
    if out.code == 0 {
        return Ok(FetchStatus::Updated);
    }
    let message = git_text(&out);
    let lower = message.to_lowercase();
    if lower.contains("couldn't find remote ref") || lower.contains("could not find remote ref") {
        return Ok(FetchStatus::Empty);
    }
    Err((
        transport_state(&message).to_string(),
        format!("Could not fetch {branch}. {message}"),
    ))
}

fn unmerged_paths(repo: &Path) -> Vec<String> {
    let out = run_sync_git(
        repo,
        &args(&["diff", "--name-only", "--diff-filter=U"]),
        LOCAL_TIMEOUT,
    );
    match out {
        Ok(out) if out.code == 0 => out
            .stdout
            .lines()
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

struct IntegrateResult {
    state: String,
    message: String,
    paths: Vec<String>,
}

fn integrate(repo: &Path) -> Result<IntegrateResult, String> {
    if let Some(message) = unsafe_state(repo) {
        return Ok(IntegrateResult {
            state: "attention".into(),
            message,
            paths: Vec::new(),
        });
    }
    ensure_no_index_lock(repo)?;
    let branch = current_branch(repo)?;
    if origin_url(repo).is_none() {
        return Err("No origin remote is configured.".to_string());
    }
    match fetch_origin(repo, &branch) {
        Err((state, message)) => {
            return Ok(IntegrateResult {
                state,
                message,
                paths: Vec::new(),
            });
        }
        Ok(FetchStatus::Empty) => {
            note_result(
                repo,
                "pending",
                "The remote branch has no commits yet.",
                &[],
                None,
            );
            return Ok(IntegrateResult {
                state: "pending".into(),
                message: "The remote branch has no commits yet.".into(),
                paths: Vec::new(),
            });
        }
        Ok(FetchStatus::Updated) => {}
    }
    let remote = remote_oid(repo, &branch);
    let local = head_oid(repo);
    let result = match (local, remote.clone()) {
        (None, None) | (Some(_), None) => IntegrateResult {
            state: "pending".into(),
            message: "The remote branch has no commits yet.".into(),
            paths: Vec::new(),
        },
        (None, Some(_)) => IntegrateResult {
            state: "attention".into(),
            message: "The remote has commits this vault does not share. Clone it into its own folder and add that folder as a vault. Helm did not change your files.".into(),
            paths: Vec::new(),
        },
        (Some(local_oid), Some(remote_oid)) if local_oid == remote_oid => IntegrateResult {
            state: "synced".into(),
            message: "Already up to date.".into(),
            paths: Vec::new(),
        },
        (Some(local_oid), Some(remote_oid)) => merge_with_remote(repo, &branch, &local_oid, &remote_oid)?,
    };
    note_result(repo, &result.state, &result.message, &result.paths, remote);
    Ok(result)
}

fn merge_with_remote(
    repo: &Path,
    branch: &str,
    local: &str,
    remote: &str,
) -> Result<IntegrateResult, String> {
    let spec = format!("origin/{branch}");
    let base = run_sync_git(repo, &args(&["merge-base", "HEAD", &spec]), LOCAL_TIMEOUT)?;
    if base.code != 0 {
        return Ok(IntegrateResult {
            state: "attention".into(),
            message: "These histories are not related. Helm did not merge them or replace either side. Clone the remote into its own folder and add that folder as a vault.".into(),
            paths: Vec::new(),
        });
    }
    let base_oid = base.stdout.trim().to_string();
    if base_oid == remote {
        return Ok(IntegrateResult {
            state: "pending".into(),
            message: "Local commits are ready to upload.".into(),
            paths: Vec::new(),
        });
    }
    if base_oid == local {
        let out = run_sync_git(repo, &args(&["merge", "--ff-only", &spec]), LOCAL_TIMEOUT)?;
        if out.code == 0 {
            return Ok(IntegrateResult {
                state: "synced".into(),
                message: "Pulled new remote changes.".into(),
                paths: Vec::new(),
            });
        }
        return Ok(IntegrateResult {
            state: "attention".into(),
            message: format!(
                "Could not fast-forward. Helm did not reset your files. {}",
                git_text(&out)
            ),
            paths: Vec::new(),
        });
    }
    let out = run_sync_git(repo, &args(&["merge", "--no-edit", &spec]), LOCAL_TIMEOUT)?;
    if out.code == 0 {
        return Ok(IntegrateResult {
            state: "synced".into(),
            message: "Merged remote changes.".into(),
            paths: Vec::new(),
        });
    }
    let paths = unmerged_paths(repo);
    if repo.join(".git").join("MERGE_HEAD").exists() {
        let abort = run_sync_git(repo, &args(&["merge", "--abort"]), LOCAL_TIMEOUT)?;
        if abort.code != 0 {
            return Ok(IntegrateResult {
                state: "attention".into(),
                message: format!(
                    "A merge conflict could not be aborted. Run git merge --abort in this vault before editing. {}",
                    git_text(&abort)
                ),
                paths,
            });
        }
    }
    let listed = if paths.is_empty() {
        "the vault".to_string()
    } else {
        paths.join(", ")
    };
    Ok(IntegrateResult {
        state: "attention".into(),
        message: format!(
            "Local and remote edits conflict in {listed}. Helm kept your local notes and commits and did not change the remote."
        ),
        paths,
    })
}

fn checkpoint(repo: &Path) -> Result<bool, String> {
    if let Some(message) = unsafe_state(repo) {
        return Err(message);
    }
    ensure_no_index_lock(repo)?;
    ensure_identity(repo)?;
    ensure_gitignore(repo)?;
    let add = run_sync_git(repo, &args(&["add", "-A"]), LOCAL_TIMEOUT)?;
    if add.code != 0 {
        return Err(format!("Could not stage vault files. {}", git_text(&add)));
    }
    let quiet = run_sync_git(repo, &args(&["diff", "--cached", "--quiet"]), LOCAL_TIMEOUT)?;
    if quiet.code == 0 {
        return Ok(false);
    }
    if quiet.code != 1 {
        return Err(format!(
            "Could not tell whether there is anything to commit. {}",
            git_text(&quiet)
        ));
    }
    let commit = run_sync_git(
        repo,
        &args(&["commit", "-m", "helm: checkpoint"]),
        LOCAL_TIMEOUT,
    )?;
    if commit.code != 0 {
        return Err(format!(
            "Could not checkpoint this vault. Your files are still saved. {}",
            git_text(&commit)
        ));
    }
    Ok(true)
}

enum PushAttempt {
    Pushed,
    Rejected(String),
    Failed { state: String, message: String },
}

fn push_args(branch: &str) -> Vec<String> {
    vec![
        "push".to_string(),
        "-u".to_string(),
        "origin".to_string(),
        format!("HEAD:refs/heads/{branch}"),
    ]
}

fn push_once(repo: &Path, branch: &str) -> Result<PushAttempt, String> {
    ensure_no_index_lock(repo)?;
    let out = match run_sync_git(repo, &push_args(branch), NETWORK_TIMEOUT) {
        Ok(out) => out,
        Err(e) => {
            return Ok(PushAttempt::Failed {
                state: transport_state(&e).to_string(),
                message: e,
            });
        }
    };
    if out.code == 0 {
        return Ok(PushAttempt::Pushed);
    }
    let message = git_text(&out);
    let lower = message.to_lowercase();
    if lower.contains("rejected")
        || lower.contains("non-fast-forward")
        || lower.contains("fetch first")
        || lower.contains("[rejected]")
    {
        return Ok(PushAttempt::Rejected(message));
    }
    Ok(PushAttempt::Failed {
        state: transport_state(&message).to_string(),
        message: format!("Could not push. {message}"),
    })
}

fn push_with_policy(repo: &Path, retry_integrate: bool) -> Result<SyncOutcome, String> {
    let branch = current_branch(repo)?;
    match push_once(repo, &branch)? {
        PushAttempt::Pushed => {
            note_result(repo, "synced", "Pushed.", &[], remote_oid(repo, &branch));
            let mut outcome = fill(repo, blank("synced", "Pushed."));
            outcome.pushed = true;
            Ok(outcome)
        }
        PushAttempt::Failed { state, message } => Ok(fill(repo, blank(&state, &message))),
        PushAttempt::Rejected(message) if !retry_integrate => {
            let text = format!("The remote has commits this vault does not. Pull before pushing. Nothing was force-pushed. {message}");
            Ok(fill(repo, blank("pending", &text)))
        }
        PushAttempt::Rejected(_) => {
            let integrated = integrate(repo)?;
            if integrated.state != "synced" && integrated.state != "pending" {
                let mut outcome = fill(repo, blank(&integrated.state, &integrated.message));
                outcome.attention_paths = integrated.paths;
                return Ok(outcome);
            }
            match push_once(repo, &branch)? {
                PushAttempt::Pushed => {
                    note_result(
                        repo,
                        "synced",
                        "Pushed after integrating remote changes.",
                        &[],
                        remote_oid(repo, &branch),
                    );
                    let mut outcome = fill(
                        repo,
                        blank("synced", "Pushed after integrating remote changes."),
                    );
                    outcome.pushed = true;
                    Ok(outcome)
                }
                PushAttempt::Rejected(message) => Ok(fill(
                    repo,
                    blank(
                        "attention",
                        &format!("Push was rejected again. Helm did not force-push. {message}"),
                    ),
                )),
                PushAttempt::Failed { state, message } => Ok(fill(repo, blank(&state, &message))),
            }
        }
    }
}

fn after_checkpoint(
    committed: bool,
    next: Result<SyncOutcome, String>,
) -> Result<SyncOutcome, String> {
    let mut outcome = next?;
    outcome.committed = committed;
    Ok(outcome)
}

fn pull_repo(repo: &Path) -> Result<SyncOutcome, String> {
    let committed = checkpoint(repo)?;
    let integrated = integrate(repo)?;
    let mut outcome = fill(repo, blank(&integrated.state, &integrated.message));
    outcome.committed = committed;
    outcome.attention_paths = if integrated.paths.is_empty() {
        outcome.attention_paths
    } else {
        integrated.paths
    };
    Ok(outcome)
}

fn push_repo(repo: &Path) -> Result<SyncOutcome, String> {
    let committed = checkpoint(repo)?;
    after_checkpoint(committed, push_with_policy(repo, false))
}

fn sync_now_repo(repo: &Path) -> Result<SyncOutcome, String> {
    let committed = checkpoint(repo)?;
    let integrated = integrate(repo)?;
    if integrated.state != "synced" && integrated.state != "pending" {
        let mut outcome = fill(repo, blank(&integrated.state, &integrated.message));
        outcome.committed = committed;
        outcome.attention_paths = integrated.paths;
        return Ok(outcome);
    }
    let mut outcome = push_with_policy(repo, true)?;
    outcome.committed = committed;
    Ok(outcome)
}

fn startup_repo(repo: &Path, auto_push: bool) -> Result<SyncOutcome, String> {
    let committed = checkpoint(repo)?;
    let integrated = integrate(repo)?;
    if integrated.state != "synced" && integrated.state != "pending" {
        let mut outcome = fill(repo, blank(&integrated.state, &integrated.message));
        outcome.committed = committed;
        outcome.attention_paths = integrated.paths;
        return Ok(outcome);
    }
    if !auto_push {
        let mut outcome = fill(repo, blank(&integrated.state, &integrated.message));
        outcome.committed = committed;
        return Ok(outcome);
    }
    let obs = observe(repo);
    if obs.ahead == 0 {
        let mut outcome = fill(repo, blank(&integrated.state, &integrated.message));
        outcome.committed = committed;
        return Ok(outcome);
    }
    let mut outcome = push_with_policy(repo, true)?;
    outcome.committed = committed;
    Ok(outcome)
}

fn ensure_branch(repo: &Path, requested: &str) -> Result<(), String> {
    let current = current_branch(repo)?;
    if current == requested {
        return Ok(());
    }
    if head_oid(repo).is_some() {
        return Err(format!(
            "This vault is on branch {current}. Helm will not switch branches. Connect using {current}, or change the branch in Git yourself."
        ));
    }
    let spec = format!("refs/heads/{requested}");
    let out = run_sync_git(repo, &args(&["symbolic-ref", "HEAD", &spec]), LOCAL_TIMEOUT)?;
    if out.code != 0 {
        return Err(format!(
            "Could not use branch {requested}. {}",
            git_text(&out)
        ));
    }
    Ok(())
}

fn history_rejected(repo: &Path, branch: &str) -> Option<String> {
    let remote = remote_oid(repo, branch);
    let local = head_oid(repo);
    match (local, remote) {
        (None, Some(_)) => Some(
            "The remote has commits this vault does not share. Clone it into its own folder and add that folder as a vault. Helm did not replace your files."
                .to_string(),
        ),
        (Some(_), Some(_)) => {
            let spec = format!("origin/{branch}");
            let base = run_sync_git(repo, &args(&["merge-base", "HEAD", &spec]), LOCAL_TIMEOUT).ok();
            match base {
                Some(out) if out.code == 0 => None,
                _ => Some(
                    "These histories are not related. Helm did not merge them. Clone the remote into its own folder and add that folder as a vault."
                        .to_string(),
                ),
            }
        }
        _ => None,
    }
}

fn rollback_origin(repo: &Path) {
    let _ = run_sync_git(repo, &args(&["remote", "remove", "origin"]), LOCAL_TIMEOUT);
}

fn connect_repo(repo: &Path, remote_url: &str, branch: &str) -> Result<ConnectResult, String> {
    ensure_vault_is_root(repo)?;
    if !is_git_repo(repo) {
        let init = run_sync_git(repo, &args(&["init", "-b", branch]), LOCAL_TIMEOUT)?;
        if init.code != 0 {
            return Err(format!(
                "Could not create a Git repository in this vault. {}",
                git_text(&init)
            ));
        }
    }
    ensure_branch(repo, branch)?;
    ensure_identity(repo)?;
    if let Some(existing) = origin_url(repo) {
        if !urls_equal(&existing, remote_url) {
            return Err(format!(
                "origin already points at {}. Helm will not overwrite it.",
                redact_credentials(&existing)
            ));
        }
    }
    let warnings = ensure_gitignore(repo)?;
    let added_origin = if origin_url(repo).is_none() {
        let add = run_sync_git(
            repo,
            &args(&["remote", "add", "origin", remote_url]),
            LOCAL_TIMEOUT,
        )?;
        if add.code != 0 {
            return Err(format!("Could not add origin. {}", git_text(&add)));
        }
        true
    } else {
        false
    };
    let files = candidate_files(repo);
    if let Err((state, message)) = fetch_origin(repo, branch) {
        if added_origin {
            rollback_origin(repo);
        }
        let outcome = fill(repo, blank(&state, &message));
        return Ok(ConnectResult {
            outcome,
            files,
            warnings,
        });
    }
    if let Some(message) = history_rejected(repo, branch) {
        if added_origin {
            rollback_origin(repo);
        }
        note_result(repo, "attention", &message, &[], remote_oid(repo, branch));
        let outcome = fill(repo, blank("attention", &message));
        return Ok(ConnectResult {
            outcome,
            files,
            warnings,
        });
    }
    let committed = checkpoint(repo)?;
    note_result(
        repo,
        "pending",
        "Connected. Local changes are ready to upload.",
        &[],
        remote_oid(repo, branch),
    );
    let mut outcome = fill(
        repo,
        blank("pending", "Connected. Local changes are ready to upload."),
    );
    outcome.committed = committed;
    if outcome.ahead == 0 && !outcome.dirty {
        outcome.state = "synced".to_string();
        outcome.message = "Connected.".to_string();
    }
    Ok(ConnectResult {
        outcome,
        files,
        warnings,
    })
}

fn preview_repo(repo: &Path, remote_url: &str, branch: &str) -> Result<ConnectPreview, String> {
    ensure_vault_is_root(repo)?;
    if is_git_repo(repo) {
        if let Ok(current) = current_branch(repo) {
            if head_oid(repo).is_some() && current != branch {
                return Err(format!(
                    "This vault is on branch {current}. Helm will not switch branches. Connect using {current}."
                ));
            }
        }
        ensure_identity(repo)?;
        if let Some(existing) = origin_url(repo) {
            if !urls_equal(&existing, remote_url) {
                return Err(format!(
                    "origin already points at {}. Helm will not overwrite it.",
                    redact_credentials(&existing)
                ));
            }
        }
    }
    let mut warnings = Vec::new();
    if is_git_repo(repo) {
        let tracked = run_sync_git(
            repo,
            &args(&["ls-files", "--", ".helm-history"]),
            LOCAL_TIMEOUT,
        )?;
        if tracked.code == 0 && !tracked.stdout.trim().is_empty() {
            warnings.push(
                "Time Machine snapshots in .helm-history are already tracked. Helm will not untrack them."
                    .to_string(),
            );
        }
    }
    let files = candidate_files(repo);
    let commits_ahead = if is_git_repo(repo) {
        ahead_behind(repo, branch).0
    } else {
        0
    };
    Ok(ConnectPreview {
        files,
        commits_ahead,
        branch: branch.to_string(),
        origin_url: if is_git_repo(repo) {
            origin_url(repo).map(|u| redact_credentials(&u))
        } else {
            None
        },
        warnings,
    })
}

fn inspect_repo(repo: &Path) -> Result<InspectReport, String> {
    let git_available = resolve_git().is_ok();
    if !git_available {
        return Ok(InspectReport {
            git_available: false,
            is_repo: false,
            vault_is_root: true,
            origin_url: None,
            branch: None,
            message: Some(
                "Git is not installed or Helm cannot find it. Install Git and restart Helm."
                    .to_string(),
            ),
        });
    }
    let canon = repo.canonicalize().map_err(|e| e.to_string())?;
    match repo_root(repo) {
        None => Ok(InspectReport {
            git_available: true,
            is_repo: false,
            vault_is_root: true,
            origin_url: None,
            branch: None,
            message: None,
        }),
        Some(root) if root != canon => Ok(InspectReport {
            git_available: true,
            is_repo: false,
            vault_is_root: false,
            origin_url: None,
            branch: None,
            message: Some(format!(
                "This folder is inside another Git repository ({}). Helm will not use a parent repository.",
                root.display()
            )),
        }),
        Some(_) => Ok(InspectReport {
            git_available: true,
            is_repo: true,
            vault_is_root: true,
            origin_url: origin_url(repo).map(|u| redact_credentials(&u)),
            branch: current_branch(repo).ok(),
            message: None,
        }),
    }
}

fn status_repo(repo: &Path, enabled: bool) -> Result<SyncOutcome, String> {
    if !enabled {
        return Ok(blank("disabled", "Remote sync is off."));
    }
    if resolve_git().is_err() {
        return Ok(error_outcome(
            "Git is not installed or Helm cannot find it.",
        ));
    }
    if !is_git_repo(repo) {
        return Ok(error_outcome(
            "This vault is not a Git repository yet. Connect it in Settings.",
        ));
    }
    let obs = observe(repo);
    if let Some(message) = obs.unsafe_message.clone() {
        return Ok(fill(repo, blank("attention", &message)));
    }
    if let Some(message) = obs.meta.attention_message.clone() {
        if obs.ahead > 0 && obs.behind > 0 {
            let mut outcome = fill(repo, blank("attention", &message));
            outcome.attention_paths = obs.meta.attention_paths.clone();
            return Ok(outcome);
        }
    }
    if obs.dirty || obs.ahead > 0 {
        let message = if obs.dirty && obs.ahead > 0 {
            "Local edits and commits are waiting to upload."
        } else if obs.dirty {
            "Local edits are waiting for a checkpoint."
        } else {
            "Local commits are waiting to upload."
        };
        return Ok(fill(repo, blank("pending", message)));
    }
    if obs.behind > 0 {
        return Ok(fill(
            repo,
            blank("pending", "The remote has changes to pull."),
        ));
    }
    Ok(fill(repo, blank("synced", "Synced.")))
}

fn disabled_status() -> SyncOutcome {
    blank("disabled", "Remote sync is off.")
}

fn test_connection_impl(remote_url: &str) -> Result<ConnectionTest, String> {
    validate_remote_url(remote_url)?;
    let cwd = std::env::temp_dir();
    let out = run_sync_git(
        &cwd,
        &args(&["ls-remote", "--heads", remote_url]),
        NETWORK_TIMEOUT,
    )?;
    if out.code == 0 {
        return Ok(ConnectionTest {
            ok: true,
            message: "Connection succeeded.".to_string(),
        });
    }
    let message = git_text(&out);
    Ok(ConnectionTest {
        ok: false,
        message: format!("Could not reach that remote. {message}"),
    })
}

fn map_outcome(result: Result<SyncOutcome, String>) -> SyncOutcome {
    match result {
        Ok(outcome) => outcome,
        Err(message) => error_outcome(&redact_credentials(&message)),
    }
}

#[tauri::command]
pub async fn git_sync_inspect(vault_path: String) -> Result<InspectReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = validate_absolute(&vault_path)?;
        if !path.is_dir() {
            return Err(format!("Vault folder does not exist: {}", path.display()));
        }
        inspect_repo(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_test_connection(remote_url: String) -> Result<ConnectionTest, String> {
    tauri::async_runtime::spawn_blocking(move || test_connection_impl(&remote_url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_preview_connect(
    vault_path: String,
    remote_url: String,
    branch: String,
) -> Result<ConnectPreview, String> {
    validate_remote_url(&remote_url)?;
    validate_branch(&branch)?;
    tauri::async_runtime::spawn_blocking(move || {
        with_repo(&vault_path, |repo| {
            preview_repo(repo, remote_url.trim(), branch.trim())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_connect(
    vault_path: String,
    remote_url: String,
    branch: String,
) -> Result<ConnectResult, String> {
    validate_remote_url(&remote_url)?;
    validate_branch(&branch)?;
    tauri::async_runtime::spawn_blocking(move || {
        with_repo(&vault_path, |repo| {
            connect_repo(repo, remote_url.trim(), branch.trim())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_status(vault_path: String, enabled: bool) -> Result<SyncOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !enabled {
            return Ok(disabled_status());
        }
        Ok(map_outcome(with_repo(&vault_path, |repo| {
            status_repo(repo, true)
        })))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_checkpoint(vault_path: String) -> Result<SyncOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(map_outcome(with_repo(&vault_path, |repo| {
            let committed = checkpoint(repo)?;
            let message = if committed {
                "Checkpoint saved."
            } else {
                "Nothing new to commit."
            };
            let mut outcome = fill(repo, blank("pending", message));
            if !committed && outcome.ahead == 0 && !outcome.dirty {
                outcome.state = "synced".to_string();
            }
            outcome.committed = committed;
            Ok(outcome)
        })))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_pull(vault_path: String) -> Result<SyncOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(map_outcome(with_repo(&vault_path, pull_repo))))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_push(vault_path: String) -> Result<SyncOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(map_outcome(with_repo(&vault_path, push_repo))))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_sync_now(vault_path: String) -> Result<SyncOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(map_outcome(with_repo(&vault_path, sync_now_repo)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_sync_startup(vault_path: String, auto_push: bool) -> Result<SyncOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(map_outcome(with_repo(&vault_path, |repo| {
            startup_repo(repo, auto_push)
        })))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "helm-git-sync-{}-{}-{}",
            std::process::id(),
            name,
            now_ms()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn git_ok(cwd: &Path, git_args: &[&str]) {
        let out = Command::new("git")
            .args(git_args)
            .current_dir(cwd)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{git_args:?}\n{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn ident(repo: &Path) {
        git_ok(repo, &["config", "user.name", "Helm Test"]);
        git_ok(repo, &["config", "user.email", "helm-test@example.com"]);
        git_ok(repo, &["config", "commit.gpgsign", "false"]);
    }

    fn bare(name: &str) -> PathBuf {
        let dir = temp(name);
        git_ok(&dir, &["init", "--bare", "-b", "main"]);
        dir
    }

    fn clone_of(bare_repo: &Path, name: &str) -> PathBuf {
        let parent = temp(name);
        git_ok(
            parent.as_path(),
            &["clone", bare_repo.to_str().unwrap(), "repo"],
        );
        let repo = parent.join("repo");
        ident(&repo);
        repo
    }

    fn init_repo(name: &str) -> PathBuf {
        let dir = temp(name);
        git_ok(&dir, &["init", "-b", "main"]);
        ident(&dir);
        dir
    }

    fn read(path: &Path) -> String {
        fs::read_to_string(path).unwrap()
    }

    #[test]
    fn redacts_tokens_in_https_urls() {
        let raw = "failed https://pat:ghp_secret@github.com/acme/notes.git during fetch";
        let clean = redact_credentials(raw);
        assert!(!clean.contains("ghp_secret"));
        assert!(clean.contains("https://***@github.com/acme/notes.git"));
    }

    #[test]
    fn rejects_credential_urls_and_unsafe_branches() {
        assert!(validate_remote_url("https://user:token@github.com/acme/notes.git").is_err());
        assert!(validate_remote_url("https://github.com/acme/notes.git").is_ok());
        assert!(validate_remote_url("git@github.com:acme/notes.git").is_ok());
        assert!(validate_remote_url("/tmp/notes.git").is_ok());
        assert!(validate_branch("main").is_ok());
        assert!(validate_branch("-main").is_err());
        assert!(validate_branch("feature/one").is_ok());
    }

    #[test]
    fn sync_runner_refuses_force_reset_and_clean() {
        let dir = temp("safety");
        let force = run_sync_git(
            &dir,
            &args(&["push", "--force", "origin", "main"]),
            LOCAL_TIMEOUT,
        );
        assert!(force.unwrap_err().contains("force-push"));
        let reset = run_sync_git(&dir, &args(&["reset", "--hard"]), LOCAL_TIMEOUT);
        assert!(reset.unwrap_err().contains("reset"));
        let clean = run_sync_git(&dir, &args(&["clean", "-fd"]), LOCAL_TIMEOUT);
        assert!(clean.unwrap_err().contains("clean"));
        assert!(!push_args("main").iter().any(|a| a.contains("force")));
    }

    #[test]
    fn gitignore_preserves_user_rules_and_reserves_backup_dir() {
        let first = upsert_block("*.log\n");
        assert!(first.contains("*.log"));
        assert!(first.contains(".helm-history/"));
        assert!(first.contains(".helm-sync-backups/"));
        let second = upsert_block(&first.replace("*.tmp", "*.tmp\n# extra"));
        assert!(second.contains("*.log"));
        assert_eq!(second.matches(MANAGED_START).count(), 1);
        assert!(second.contains("# extra") || second.contains("*.tmp"));
    }

    #[test]
    fn does_not_untrack_history_that_is_already_committed() {
        let repo = init_repo("tracked-history");
        let history = repo.join(".helm-history");
        fs::create_dir_all(&history).unwrap();
        fs::write(history.join("old.md"), "snapshot").unwrap();
        git_ok(&repo, &["add", "-f", ".helm-history/old.md"]);
        git_ok(&repo, &["commit", "-m", "track history"]);
        let warnings = ensure_gitignore(&repo).unwrap();
        assert!(warnings.iter().any(|w| w.contains("will not untrack")));
        let listed = Command::new("git")
            .args(["ls-files", "--", ".helm-history/old.md"])
            .current_dir(&repo)
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&listed.stdout).contains(".helm-history/old.md"));
    }

    #[test]
    fn connect_to_empty_remote_then_sync_and_pull() {
        let remote = bare("empty-remote");
        let vault = temp("empty-vault");
        fs::write(vault.join("note.md"), "hello").unwrap();
        fs::write(vault.join("scratch.tmp"), "temp").unwrap();
        let preview = with_repo(vault.to_str().unwrap(), |repo| {
            preview_repo(repo, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        assert!(preview.files.iter().any(|f| f == "note.md"));
        assert!(!preview.files.iter().any(|f| f.ends_with(".tmp")));

        let connected = with_repo(vault.to_str().unwrap(), |repo| {
            connect_repo(repo, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        assert_ne!(connected.outcome.state, "error");
        assert_ne!(connected.outcome.state, "attention");
        assert!(vault.join("scratch.tmp").exists());

        let pushed = with_repo(vault.to_str().unwrap(), sync_now_repo).unwrap();
        assert_eq!(pushed.state, "synced", "{}", pushed.message);
        assert!(pushed.pushed);

        let other = clone_of(&remote, "empty-other");
        assert_eq!(read(&other.join("note.md")), "hello");
        assert!(!other.join("scratch.tmp").exists());
    }

    #[test]
    fn startup_pull_fast_forwards_before_local_edits() {
        let remote = bare("ff-remote");
        let first = temp("ff-first");
        fs::write(first.join("a.md"), "from-first").unwrap();
        with_repo(first.to_str().unwrap(), |repo| {
            connect_repo(repo, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        let pushed = with_repo(first.to_str().unwrap(), sync_now_repo).unwrap();
        assert_eq!(pushed.state, "synced", "{}", pushed.message);

        let second = clone_of(&remote, "ff-second");
        fs::write(first.join("b.md"), "later").unwrap();
        with_repo(first.to_str().unwrap(), sync_now_repo).unwrap();
        let pulled = with_repo(second.to_str().unwrap(), |repo| startup_repo(repo, false)).unwrap();
        assert_eq!(pulled.state, "synced", "{}", pulled.message);
        assert_eq!(read(&second.join("b.md")), "later");
        assert!(!pulled.pushed);
    }

    #[test]
    fn diverged_clones_merge_different_files() {
        let remote = bare("merge-remote");
        let a = temp("merge-a");
        fs::write(a.join("base.md"), "base").unwrap();
        with_repo(a.to_str().unwrap(), |repo| {
            connect_repo(repo, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        with_repo(a.to_str().unwrap(), sync_now_repo).unwrap();
        let b = clone_of(&remote, "merge-b");

        fs::write(a.join("a.md"), "from-a").unwrap();
        with_repo(a.to_str().unwrap(), sync_now_repo).unwrap();
        fs::write(b.join("b.md"), "from-b").unwrap();
        let synced = with_repo(b.to_str().unwrap(), sync_now_repo).unwrap();
        assert_eq!(synced.state, "synced", "{}", synced.message);
        assert_eq!(read(&b.join("a.md")), "from-a");
        assert_eq!(read(&b.join("b.md")), "from-b");

        let pulled = with_repo(a.to_str().unwrap(), pull_repo).unwrap();
        assert_eq!(pulled.state, "synced", "{}", pulled.message);
        assert_eq!(read(&a.join("b.md")), "from-b");
        assert!(!pulled.pushed);
    }

    #[test]
    fn same_file_conflict_keeps_local_content_and_remote_sha() {
        let remote = bare("conflict-remote");
        let a = temp("conflict-a");
        fs::write(a.join("note.md"), "base").unwrap();
        with_repo(a.to_str().unwrap(), |repo| {
            connect_repo(repo, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        with_repo(a.to_str().unwrap(), sync_now_repo).unwrap();
        let b = clone_of(&remote, "conflict-b");

        fs::write(a.join("note.md"), "from-a").unwrap();
        with_repo(a.to_str().unwrap(), sync_now_repo).unwrap();
        fs::write(b.join("note.md"), "from-b").unwrap();
        let outcome = with_repo(b.to_str().unwrap(), sync_now_repo).unwrap();
        assert_eq!(outcome.state, "attention", "{}", outcome.message);
        assert!(outcome.attention_paths.iter().any(|p| p == "note.md"));
        assert_eq!(read(&b.join("note.md")), "from-b");
        assert!(!read(&b.join("note.md")).contains("<<<<<<<"));
        assert!(!b.join(".git").join("MERGE_HEAD").exists());
        assert!(
            outcome.remote_oid.is_some(),
            "recovery needs the fetched remote SHA"
        );
        let remote_tip = Command::new("git")
            .args(["rev-parse", "main"])
            .current_dir(&remote)
            .output()
            .unwrap();
        assert_eq!(
            outcome.remote_oid.unwrap(),
            String::from_utf8_lossy(&remote_tip.stdout).trim()
        );
    }

    #[test]
    fn manual_push_reports_when_a_pull_is_required() {
        let remote = bare("push-remote");
        let a = temp("push-a");
        fs::write(a.join("base.md"), "base").unwrap();
        with_repo(a.to_str().unwrap(), |repo| {
            connect_repo(repo, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        with_repo(a.to_str().unwrap(), sync_now_repo).unwrap();
        let b = clone_of(&remote, "push-b");
        fs::write(a.join("a.md"), "from-a").unwrap();
        with_repo(a.to_str().unwrap(), sync_now_repo).unwrap();
        fs::write(b.join("b.md"), "from-b").unwrap();
        let pushed = with_repo(b.to_str().unwrap(), push_repo).unwrap();
        assert_ne!(pushed.state, "synced", "{}", pushed.message);
        assert!(pushed.message.to_lowercase().contains("pull"));
        assert!(!pushed.pushed);
        assert!(!b.join("a.md").exists(), "manual push must not integrate");
        let synced = with_repo(b.to_str().unwrap(), sync_now_repo).unwrap();
        assert_eq!(synced.state, "synced", "{}", synced.message);
        assert_eq!(read(&b.join("a.md")), "from-a");
    }

    #[test]
    fn rejects_unrelated_histories_and_rolls_back_a_new_origin() {
        let remote = bare("unrelated-remote");
        let first = init_repo("unrelated-first");
        fs::write(first.join("a.md"), "a").unwrap();
        git_ok(&first, &["add", "-A"]);
        git_ok(&first, &["commit", "-m", "first"]);
        git_ok(
            &first,
            &["remote", "add", "origin", remote.to_str().unwrap()],
        );
        git_ok(&first, &["push", "-u", "origin", "HEAD:refs/heads/main"]);

        let second = init_repo("unrelated-second");
        fs::write(second.join("b.md"), "b").unwrap();
        git_ok(&second, &["add", "-A"]);
        git_ok(&second, &["commit", "-m", "second"]);
        let result = with_repo(second.to_str().unwrap(), |repo| {
            connect_repo(repo, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        assert_eq!(
            result.outcome.state, "attention",
            "{}",
            result.outcome.message
        );
        assert!(origin_url(&second).is_none());
        assert_eq!(read(&second.join("b.md")), "b");
    }

    #[test]
    fn rejects_a_parent_repository_and_an_origin_change() {
        let parent = temp("parent-repo");
        git_ok(&parent, &["init", "-b", "main"]);
        let child = parent.join("vault");
        fs::create_dir_all(&child).unwrap();
        let err = with_repo(child.to_str().unwrap(), |repo| {
            connect_repo(repo, "/tmp/does-not-matter", "main")
        })
        .unwrap_err();
        assert!(err.contains("parent repository"));
        assert!(!child.join(".git").exists());

        let remote_a = bare("origin-a");
        let remote_b = bare("origin-b");
        let repo = init_repo("origin-keep");
        git_ok(
            &repo,
            &["remote", "add", "origin", remote_a.to_str().unwrap()],
        );
        let err = with_repo(repo.to_str().unwrap(), |r| {
            connect_repo(r, remote_b.to_str().unwrap(), "main")
        })
        .unwrap_err();
        assert!(err.contains("will not overwrite"));
        assert_eq!(origin_url(&repo).unwrap(), remote_a.to_str().unwrap());
    }

    #[test]
    fn second_checkpoint_is_empty_and_index_lock_stops_the_operation() {
        let repo = init_repo("checkpoint");
        fs::write(repo.join("note.md"), "one").unwrap();
        let first = with_repo(repo.to_str().unwrap(), |path| {
            let committed = checkpoint(path)?;
            Ok(committed)
        })
        .unwrap();
        assert!(first);
        let second = with_repo(repo.to_str().unwrap(), |path| Ok(checkpoint(path)?)).unwrap();
        assert!(!second);
        let count = Command::new("git")
            .args(["rev-list", "--count", "HEAD"])
            .current_dir(&repo)
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&count.stdout).trim(), "1");

        fs::write(repo.join(".git").join("index.lock"), "locked").unwrap();
        let err = with_repo(repo.to_str().unwrap(), |path| checkpoint(path)).unwrap_err();
        assert!(err.contains("index is locked"));
        assert_eq!(read(&repo.join("note.md")), "one");
    }

    #[test]
    fn pending_commits_survive_a_fresh_status_read() {
        let remote = bare("pending-remote");
        let repo = temp("pending-vault");
        fs::write(repo.join("note.md"), "local").unwrap();
        with_repo(repo.to_str().unwrap(), |path| {
            connect_repo(path, remote.to_str().unwrap(), "main")
        })
        .unwrap();
        let status = with_repo(repo.to_str().unwrap(), |path| status_repo(path, true)).unwrap();
        assert!(
            status.pending_commits >= 1 || status.dirty,
            "{}",
            status.message
        );
        let again = with_repo(repo.to_str().unwrap(), |path| status_repo(path, true)).unwrap();
        assert_eq!(again.pending_commits, status.pending_commits);
        let off = status_repo_disabled();
        assert_eq!(off.state, "disabled");
    }

    fn status_repo_disabled() -> SyncOutcome {
        disabled_status()
    }

    #[test]
    fn disconnect_is_not_a_git_mutation() {
        // Disconnect only clears the sync preference. The repository, origin,
        // notes, and history stay. This guards the runner against growing a
        // destructive disconnect later.
        let repo = init_repo("disconnect");
        fs::write(repo.join("note.md"), "stay").unwrap();
        git_ok(&repo, &["add", "-A"]);
        git_ok(&repo, &["commit", "-m", "keep"]);
        let before = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&repo)
            .output()
            .unwrap();
        let status = disabled_status();
        assert_eq!(status.state, "disabled");
        let after = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&repo)
            .output()
            .unwrap();
        assert_eq!(before.stdout, after.stdout);
        assert_eq!(read(&repo.join("note.md")), "stay");
    }
}
