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
    if path.components().any(|c| c == std::path::Component::ParentDir) {
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultConfig {
    pub id: String,
    pub name: String,
    pub path: String,
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
    Ok(store.get("vault_path").and_then(|v| v.as_str().map(|s| s.to_string())))
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

fn collect_notes(dir: &PathBuf, notes: &mut Vec<NoteFile>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_path = entry.path();
        if file_path.is_dir() {
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

#[tauri::command]
pub async fn list_notes(vault_path: String) -> Result<Vec<NoteFile>, String> {
    let path = PathBuf::from(&vault_path);
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    let mut notes = Vec::new();
    collect_notes(&path, &mut notes)?;
    Ok(notes)
}

#[tauri::command]
pub async fn read_note(file_path: String) -> Result<String, String> {
    let path = validate_path(&file_path)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_note(file_path: String, content: String) -> Result<(), String> {
    let path = validate_path(&file_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_asset(vault_path: String, filename: String, data: Vec<u8>) -> Result<String, String> {
    let vault = PathBuf::from(&vault_path);
    let assets_dir = vault.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    // Sanitize filename: allow only alphanumeric, dash, underscore, dot
    let safe_name: String = filename
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect();

    let dest = assets_dir.join(&safe_name);
    fs::write(&dest, data).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
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
            }
        }
    });

    Ok(())
}
