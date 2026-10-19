use notify::{recommended_watcher, Event, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::thread;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

fn validate_path(file_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path);
    // Reject relative paths
    if path.is_relative() {
        return Err(format!("Path must be absolute: {}", file_path));
    }
    // Reject paths with .. components
    if path
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        return Err(format!("Path traversal not allowed: {}", file_path));
    }
    Ok(path)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteFile {
    pub path: String,
    pub file_name: String,
    pub content: String,
}

fn default_true() -> bool {
    true
}

/// Per-vault remote-sync preferences. Missing on configs saved before sync
/// existed; `Default` keeps those vaults disconnected.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultSyncPrefs {
    /// Remote sync is off until the user connects a remote.
    #[serde(default)]
    pub enabled: bool,
    /// Pull when the app opens, once sync is enabled.
    #[serde(default = "default_true")]
    pub pull_on_startup: bool,
    /// Push after a local checkpoint, once sync is enabled.
    #[serde(default = "default_true")]
    pub auto_push: bool,
}

impl Default for VaultSyncPrefs {
    fn default() -> Self {
        Self {
            enabled: false,
            pull_on_startup: true,
            auto_push: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    /// Optional Git remote sync. Absent in older config files.
    #[serde(default)]
    pub sync: VaultSyncPrefs,
}

#[tauri::command]
pub async fn get_vaults(app: AppHandle) -> Result<Vec<VaultConfig>, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    if let Some(v) = store.get("vaults") {
        let vaults: Vec<VaultConfig> = serde_json::from_value(v).map_err(|e| e.to_string())?;
        Ok(vaults)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn set_vaults(app: AppHandle, vaults: Vec<VaultConfig>) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let val = serde_json::to_value(&vaults).map_err(|e| e.to_string())?;
    store.set("vaults", val);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_vault_path(app: AppHandle) -> Result<Option<String>, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    Ok(store
        .get("vault_path")
        .and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
pub async fn set_vault_path(app: AppHandle, path: String) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    store.set("vault_path", path);
    store.save().map_err(|e| e.to_string())
}

fn collect_folders(dir: &PathBuf, folders: &mut Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') || name_str == "assets" {
                continue; // skip hidden dirs and the assets directory
            }
            folders.push(path.to_string_lossy().to_string());
            collect_folders(&path, folders)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_folders(vault_path: String) -> Result<Vec<String>, String> {
    let path = validate_path(&vault_path)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut folders = Vec::new();
    collect_folders(&path, &mut folders)?;
    Ok(folders)
}

/// KEEP IN SYNC with src/lib/projects.ts PROJECT_META_FILENAME.
const PROJECT_META_FILENAME: &str = "helm-project.json";

#[derive(Debug, Serialize, Clone)]
pub struct ProjectFile {
    pub path: String,
    pub content: String,
}

fn collect_project_files(dir: &PathBuf, out: &mut Vec<ProjectFile>) -> Result<(), String> {
    let marker = dir.join(PROJECT_META_FILENAME);
    if marker.is_file() {
        let content = fs::read_to_string(&marker).map_err(|e| e.to_string())?;
        out.push(ProjectFile {
            path: marker.to_string_lossy().to_string(),
            content,
        });
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        // Hidden dirs (.git, .helm-history) are not part of the vault.
        if name_str.starts_with('.') || name_str == "assets" {
            continue;
        }
        collect_project_files(&path, out)?;
    }
    Ok(())
}

fn list_project_files_impl(vault_path: &str) -> Result<Vec<ProjectFile>, String> {
    let path = validate_path(vault_path)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut files = Vec::new();
    collect_project_files(&path, &mut files)?;
    Ok(files)
}

#[tauri::command]
pub async fn list_project_files(vault_path: String) -> Result<Vec<ProjectFile>, String> {
    list_project_files_impl(&vault_path)
}

fn collect_notes(dir: &PathBuf, notes: &mut Vec<NoteFile>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_path = entry.path();
        if file_path.is_dir() {
            // Skip hidden dirs (.git, .helm-history, .obsidian, …) — their .md
            // files are not vault notes.
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            collect_notes(&file_path, notes)?;
        } else if file_path.extension().and_then(|e| e.to_str()) == Some("md") {
            let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
            notes.push(NoteFile {
                path: file_path.to_string_lossy().to_string(),
                file_name: entry.file_name().to_string_lossy().to_string(),
                content,
            });
        }
    }
    Ok(())
}

fn list_notes_impl(vault_path: &str) -> Result<Vec<NoteFile>, String> {
    let path = validate_path(vault_path)?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    let mut notes = Vec::new();
    collect_notes(&path, &mut notes)?;
    Ok(notes)
}

#[tauri::command]
pub async fn list_notes(vault_path: String) -> Result<Vec<NoteFile>, String> {
    list_notes_impl(&vault_path)
}

#[tauri::command]
pub async fn read_note(file_path: String) -> Result<String, String> {
    let path = validate_path(&file_path)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

// Crash-safe write: write to a temp file in the same directory, then rename
// over the target. Rename is atomic on POSIX, so a crash mid-write can never
// leave the note truncated — the old content survives until the rename lands.
fn atomic_write(path: &std::path::Path, content: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Path has no parent directory: {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let file_name = path
        .file_name()
        .ok_or_else(|| format!("Path has no file name: {}", path.display()))?;
    let tmp = parent.join(format!(
        ".{}.tmp-{}",
        file_name.to_string_lossy(),
        std::process::id()
    ));

    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

#[tauri::command]
pub async fn write_note(file_path: String, content: String) -> Result<(), String> {
    let path = validate_path(&file_path)?;
    atomic_write(&path, content.as_bytes())
}

fn write_asset_impl(vault_path: &str, filename: &str, data: &[u8]) -> Result<String, String> {
    let vault = validate_path(vault_path)?;
    let assets_dir = vault.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    // Drop any directory components, then sanitize what remains:
    // allow only alphanumeric, dash, underscore, dot.
    let base_name = std::path::Path::new(filename)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let safe_name: String = base_name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe_name = safe_name.trim_matches('.').to_string();
    if safe_name.is_empty() {
        return Err(format!("Invalid asset filename: {}", filename));
    }

    let dest = assets_dir.join(&safe_name);
    atomic_write(&dest, data)?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn write_asset(
    vault_path: String,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    write_asset_impl(&vault_path, &filename, &data)
}

/// True when any path component is a dot-directory/file (".helm-history", ".git", …).
fn is_hidden_path(path: &std::path::Path) -> bool {
    path.components().any(|c| match c {
        std::path::Component::Normal(name) => name.to_string_lossy().starts_with('.'),
        _ => false,
    })
}

/// A working-tree change worth checkpointing. Git metadata and dot-directories
/// (including `.helm-history` and `.helm-sync-backups`) are not user edits.
fn is_user_vault_change(vault: &std::path::Path, path: &std::path::Path) -> bool {
    match path.strip_prefix(vault) {
        Ok(rel) => !rel.as_os_str().is_empty() && !is_hidden_path(rel),
        Err(_) => false,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    /// Snapshot time as unix epoch milliseconds (also the filename stem)
    pub ts_ms: u64,
    pub path: String,
}

fn history_dir(vault: &std::path::Path, note_id: &str) -> Result<PathBuf, String> {
    // Note ids are ULIDs (alphanumeric); reject anything else so an id can
    // never become a path traversal vector.
    if note_id.is_empty() || !note_id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("Invalid note id: {}", note_id));
    }
    Ok(vault.join(".helm-history").join(note_id))
}

fn list_note_history_impl(vault_path: &str, note_id: &str) -> Result<Vec<HistoryEntry>, String> {
    let vault = validate_path(vault_path)?;
    let dir = history_dir(&vault, note_id)?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        if let Some(ts_ms) = path
            .file_stem()
            .and_then(|s| s.to_str())
            .and_then(|s| s.parse::<u64>().ok())
        {
            entries.push(HistoryEntry {
                ts_ms,
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    entries.sort_by(|a, b| b.ts_ms.cmp(&a.ts_ms));
    Ok(entries)
}

/// Snapshot the note's current on-disk content into the vault's history dir.
/// Skips when the newest snapshot is younger than `min_age_secs` (coalescing
/// rapid autosaves) and prunes the history to the `max_keep` newest entries.
fn snapshot_note_impl(
    vault_path: &str,
    note_id: &str,
    file_path: &str,
    min_age_secs: u64,
    max_keep: usize,
) -> Result<(), String> {
    let vault = validate_path(vault_path)?;
    let src = validate_path(file_path)?;
    if !src.exists() {
        return Ok(()); // nothing to snapshot (new note)
    }
    let dir = history_dir(&vault, note_id)?;

    let existing = list_note_history_impl(vault_path, note_id)?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    if let Some(newest) = existing.first() {
        if now_ms.saturating_sub(newest.ts_ms) < min_age_secs * 1000 {
            return Ok(());
        }
    }

    let content = fs::read(&src).map_err(|e| e.to_string())?;
    // Bump the timestamp if a snapshot already landed in this millisecond
    let mut ts = now_ms;
    while dir.join(format!("{}.md", ts)).exists() {
        ts += 1;
    }
    atomic_write(&dir.join(format!("{}.md", ts)), &content)?;

    let mut entries = list_note_history_impl(vault_path, note_id)?;
    if entries.len() > max_keep {
        for old in entries.split_off(max_keep) {
            let _ = fs::remove_file(&old.path);
        }
    }
    Ok(())
}

/// How long a snapshot must age before a newer one is taken (coalesces autosaves).
const HISTORY_MIN_AGE_SECS: u64 = 300;
/// Maximum snapshots kept per note.
const HISTORY_MAX_KEEP: usize = 50;

#[tauri::command]
pub async fn snapshot_note(
    vault_path: String,
    note_id: String,
    file_path: String,
) -> Result<(), String> {
    snapshot_note_impl(
        &vault_path,
        &note_id,
        &file_path,
        HISTORY_MIN_AGE_SECS,
        HISTORY_MAX_KEEP,
    )
}

#[tauri::command]
pub async fn list_note_history(
    vault_path: String,
    note_id: String,
) -> Result<Vec<HistoryEntry>, String> {
    list_note_history_impl(&vault_path, &note_id)
}

fn delete_asset_impl(file_path: &str) -> Result<(), String> {
    let path = validate_path(file_path)?;
    if path.extension().and_then(|e| e.to_str()) == Some("md") {
        return Err(format!(
            "Refusing to delete a note file as an asset: {}",
            file_path
        ));
    }
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_asset(file_path: String) -> Result<(), String> {
    delete_asset_impl(&file_path)
}

#[tauri::command]
pub async fn delete_note(file_path: String) -> Result<(), String> {
    let path = validate_path(&file_path)?;
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_note(old_path: String, new_path: String) -> Result<(), String> {
    let old = validate_path(&old_path)?;
    let new = validate_path(&new_path)?;
    fs::rename(&old, &new).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_folder(path: String) -> Result<(), String> {
    let p = validate_path(&path)?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_folder(path: String) -> Result<(), String> {
    let p = validate_path(&path)?;
    fs::remove_dir_all(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_folder(old_path: String, new_path: String) -> Result<(), String> {
    let old = validate_path(&old_path)?;
    let new_p = validate_path(&new_path)?;
    fs::rename(&old, &new_p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("helm-vault-test-{}", name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_write_creates_file_with_content() {
        let dir = temp_dir("atomic-create");
        let path = dir.join("note.md");
        atomic_write(&path, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
    }

    #[test]
    fn atomic_write_overwrites_existing_file() {
        let dir = temp_dir("atomic-overwrite");
        let path = dir.join("note.md");
        fs::write(&path, "old").unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    }

    #[test]
    fn atomic_write_leaves_no_temp_files() {
        let dir = temp_dir("atomic-clean");
        let path = dir.join("note.md");
        atomic_write(&path, b"content").unwrap();
        let entries: Vec<_> = fs::read_dir(&dir).unwrap().collect();
        assert_eq!(entries.len(), 1, "only the target file should remain");
    }

    #[test]
    fn list_notes_impl_rejects_relative_path() {
        assert!(list_notes_impl("relative/path").is_err());
    }

    #[test]
    fn list_notes_impl_rejects_parent_traversal() {
        assert!(list_notes_impl("/tmp/../etc").is_err());
    }

    #[test]
    fn write_asset_impl_rejects_relative_vault_path() {
        assert!(write_asset_impl("relative/vault", "img.png", &[1, 2, 3]).is_err());
    }

    #[test]
    fn write_asset_impl_strips_path_components_from_filename() {
        let dir = temp_dir("asset-sanitize");
        let dest = write_asset_impl(dir.to_str().unwrap(), "../../evil.png", &[1]).unwrap();
        let dest_path = PathBuf::from(&dest);
        // Must land inside <vault>/assets, regardless of traversal attempts
        assert!(dest_path.starts_with(dir.join("assets")));
        assert!(dest_path.exists());
    }

    #[test]
    fn list_notes_impl_skips_hidden_directories() {
        let dir = temp_dir("skip-hidden");
        fs::write(dir.join("real.md"), "real note").unwrap();
        let hidden = dir.join(".helm-history").join("01ABC");
        fs::create_dir_all(&hidden).unwrap();
        fs::write(hidden.join("123.md"), "old snapshot").unwrap();

        let notes = list_notes_impl(dir.to_str().unwrap()).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].file_name, "real.md");
    }

    #[test]
    fn snapshot_note_copies_current_content_into_history() {
        let dir = temp_dir("snap-basic");
        let note = dir.join("note.md");
        fs::write(&note, "version one").unwrap();

        snapshot_note_impl(
            dir.to_str().unwrap(),
            "01ABC",
            note.to_str().unwrap(),
            0,
            50,
        )
        .unwrap();

        let entries = list_note_history_impl(dir.to_str().unwrap(), "01ABC").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(fs::read_to_string(&entries[0].path).unwrap(), "version one");
    }

    #[test]
    fn snapshot_note_is_a_noop_when_the_file_does_not_exist() {
        let dir = temp_dir("snap-missing");
        let note = dir.join("nope.md");
        snapshot_note_impl(
            dir.to_str().unwrap(),
            "01ABC",
            note.to_str().unwrap(),
            0,
            50,
        )
        .unwrap();
        let entries = list_note_history_impl(dir.to_str().unwrap(), "01ABC").unwrap();
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn snapshot_note_coalesces_snapshots_younger_than_min_age() {
        let dir = temp_dir("snap-coalesce");
        let note = dir.join("note.md");
        fs::write(&note, "v1").unwrap();
        snapshot_note_impl(
            dir.to_str().unwrap(),
            "01ABC",
            note.to_str().unwrap(),
            300,
            50,
        )
        .unwrap();
        fs::write(&note, "v2").unwrap();
        // Second snapshot within the 300s window is skipped
        snapshot_note_impl(
            dir.to_str().unwrap(),
            "01ABC",
            note.to_str().unwrap(),
            300,
            50,
        )
        .unwrap();

        let entries = list_note_history_impl(dir.to_str().unwrap(), "01ABC").unwrap();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn snapshot_note_prunes_to_max_keep_oldest_first() {
        let dir = temp_dir("snap-prune");
        let note = dir.join("note.md");
        for i in 0..5 {
            fs::write(&note, format!("v{}", i)).unwrap();
            snapshot_note_impl(dir.to_str().unwrap(), "01ABC", note.to_str().unwrap(), 0, 3)
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let entries = list_note_history_impl(dir.to_str().unwrap(), "01ABC").unwrap();
        assert_eq!(entries.len(), 3);
        // Newest first; the newest snapshot holds the most recent pre-save content
        assert_eq!(fs::read_to_string(&entries[0].path).unwrap(), "v4");
    }

    #[test]
    fn list_note_history_returns_newest_first() {
        let dir = temp_dir("snap-order");
        let note = dir.join("note.md");
        fs::write(&note, "a").unwrap();
        snapshot_note_impl(
            dir.to_str().unwrap(),
            "01ABC",
            note.to_str().unwrap(),
            0,
            50,
        )
        .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        fs::write(&note, "b").unwrap();
        snapshot_note_impl(
            dir.to_str().unwrap(),
            "01ABC",
            note.to_str().unwrap(),
            0,
            50,
        )
        .unwrap();

        let entries = list_note_history_impl(dir.to_str().unwrap(), "01ABC").unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries[0].ts_ms > entries[1].ts_ms);
        assert_eq!(fs::read_to_string(&entries[0].path).unwrap(), "b");
    }

    #[test]
    fn hidden_paths_are_detected() {
        assert!(is_hidden_path(std::path::Path::new(
            "/v/.helm-history/01A/1.md"
        )));
        assert!(is_hidden_path(std::path::Path::new("/v/.git/x.md")));
        assert!(!is_hidden_path(std::path::Path::new("/v/notes/real.md")));
    }

    #[test]
    fn user_vault_changes_ignore_git_and_history() {
        let vault = std::path::Path::new("/vault");
        assert!(is_user_vault_change(
            vault,
            std::path::Path::new("/vault/note.md")
        ));
        assert!(is_user_vault_change(
            vault,
            std::path::Path::new("/vault/assets/pic.png")
        ));
        assert!(!is_user_vault_change(
            vault,
            std::path::Path::new("/vault/.git/index")
        ));
        assert!(!is_user_vault_change(
            vault,
            std::path::Path::new("/vault/.helm-history/01/1.md")
        ));
        assert!(!is_user_vault_change(
            vault,
            std::path::Path::new("/vault/.helm-sync-backups/1/note.md"),
        ));
        assert!(!is_user_vault_change(
            vault,
            std::path::Path::new("/other/note.md")
        ));
    }

    #[test]
    fn delete_asset_impl_refuses_markdown_files() {
        let dir = temp_dir("asset-refuse-md");
        let md = dir.join("note.md");
        fs::write(&md, "content").unwrap();
        assert!(delete_asset_impl(md.to_str().unwrap()).is_err());
        assert!(md.exists(), "markdown file must not be deleted");
    }

    #[test]
    fn vault_config_without_sync_stays_disconnected() {
        let raw = r#"{"id":"v1","name":"Vault","path":"/tmp/vault"}"#;
        let cfg: VaultConfig = serde_json::from_str(raw).unwrap();
        assert!(!cfg.sync.enabled);
        assert!(cfg.sync.pull_on_startup);
        assert!(cfg.sync.auto_push);
        assert_eq!(cfg.id, "v1");
    }

    #[test]
    fn vault_config_preserves_explicit_sync_prefs() {
        let raw = r#"{"id":"v1","name":"Vault","path":"/tmp/vault","sync":{"enabled":true,"pullOnStartup":false,"autoPush":false}}"#;
        let cfg: VaultConfig = serde_json::from_str(raw).unwrap();
        assert!(cfg.sync.enabled);
        assert!(!cfg.sync.pull_on_startup);
        assert!(!cfg.sync.auto_push);
    }

    #[test]
    fn list_project_files_impl_finds_project_metadata_and_skips_hidden_dirs() {
        let dir = temp_dir("project-files");
        fs::write(
            dir.join("helm-project.json"),
            r#"{"id":"p1","name":"Vault Root","mainPageId":"m1"}"#,
        )
        .unwrap();
        let nested = dir.join("kitchen");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("helm-project.json"), "{\"id\":\"p2\"}").unwrap();
        let hidden = dir.join(".git");
        fs::create_dir(&hidden).unwrap();
        fs::write(hidden.join("helm-project.json"), "{\"id\":\"hidden\"}").unwrap();

        let found = list_project_files_impl(dir.to_str().unwrap()).unwrap();
        let paths: Vec<String> = found.iter().map(|file| file.path.clone()).collect();
        assert!(paths
            .iter()
            .any(|path| path.ends_with("kitchen/helm-project.json")));
        assert!(paths
            .iter()
            .any(|path| path.ends_with(&format!("{}/helm-project.json", dir.to_string_lossy()))));
        assert!(found.iter().all(|file| !file.path.contains("/.git/")));
    }

    #[test]
    fn delete_asset_impl_deletes_non_markdown_file() {
        let dir = temp_dir("asset-delete");
        let img = dir.join("img.png");
        fs::write(&img, [1, 2, 3]).unwrap();
        delete_asset_impl(img.to_str().unwrap()).unwrap();
        assert!(!img.exists());
    }
}

#[tauri::command]
pub async fn watch_vault(app: AppHandle, vault_path: String) -> Result<(), String> {
    let app_clone = app.clone();

    thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel::<Result<Event, notify::Error>>();

        let mut watcher = match recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(std::path::Path::new(&vault_path), RecursiveMode::Recursive) {
            eprintln!("Failed to watch vault: {}", e);
            return;
        }

        for result in rx {
            if let Ok(event) = result {
                let md_paths: Vec<String> = event
                    .paths
                    .iter()
                    .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
                    // Ignore .md files under hidden dirs (history snapshots, .git, …)
                    .filter(|p| {
                        !p.strip_prefix(&vault_path)
                            .map(is_hidden_path)
                            .unwrap_or(false)
                    })
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if !md_paths.is_empty() {
                    // Treat Remove and Rename-from as deletions. On macOS, a
                    // file rename emits Modify(Name(From)) for the old path and
                    // Modify(Name(To)) for the new path — neither is EventKind::Remove.
                    let is_deletion = matches!(event.kind, notify::EventKind::Remove(_))
                        || matches!(
                            event.kind,
                            notify::EventKind::Modify(notify::event::ModifyKind::Name(
                                notify::event::RenameMode::From
                            ))
                        );
                    if is_deletion {
                        let _ = app_clone.emit("vault-note-deleted", &md_paths);
                    } else {
                        let _ = app_clone.emit("vault-changed", &md_paths);
                    }
                }

                // Emit for directory create/remove so the frontend refreshes its folder list
                let has_dir_event = event.paths.iter().any(|p| p.is_dir())
                    || matches!(
                        event.kind,
                        notify::EventKind::Create(notify::event::CreateKind::Folder)
                            | notify::EventKind::Remove(notify::event::RemoveKind::Folder)
                    );
                if has_dir_event {
                    let _ = app_clone.emit("vault-dirs-changed", &vault_path);
                }

                // Notes, assets, and external/MCP edits. Hidden paths (.git,
                // .helm-history) are ignored so a checkpoint cannot loop on
                // its own metadata.
                let vault = std::path::Path::new(&vault_path);
                let mutated = event.paths.iter().any(|p| is_user_vault_change(vault, p));
                if mutated {
                    let _ = app_clone.emit("vault-mutated", &vault_path);
                }
            }
        }
    });

    Ok(())
}
