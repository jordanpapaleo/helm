mod vault;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use vault::*;
use tauri::menu::{
    AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Label of the primary window.
const MAIN_WINDOW: &str = "main";

/// How long the backend waits for the frontend to finish its close handshake
/// (flush debounced saves → `exit_app`) before quitting on its own.
///
/// The frontend bounds its own flush at 2s (`CLOSE_FLUSH_TIMEOUT_MS` in
/// `src/lib/window-close.ts`) and then invokes `exit_app`, so a healthy close
/// completes in ~2s plus an IPC round trip. 8s is several times that margin;
/// if it elapses, the frontend is not coming back and no legitimate save is
/// still in flight.
const CLOSE_WATCHDOG: Duration = Duration::from_secs(8);

/// Fully quit the process. Needed because the quick-capture window is only
/// hidden (not destroyed) on dismiss — closing the main window alone would
/// leave a headless process alive.
#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

/// What the backend should do about a close request on the main window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CloseAction {
    /// First request: give the frontend a chance to flush, but arm a watchdog.
    AwaitFrontend,
    /// The user asked again while the first request was still unresolved —
    /// stop waiting on the frontend and quit now.
    ForceExit,
}

/// Counts close requests for the main window.
///
/// Tauri auto-prevents the native close whenever the webview has a
/// `tauri://close-requested` listener (`api.prevent_close()` in Tauri's own
/// window manager, before any user handler runs). So with the frontend
/// handler registered, closing depends *entirely* on JS invoking `exit_app`.
/// If the webview is wedged — a dead dev server, a hung IPC bridge, a crashed
/// renderer — the window becomes unclosable with no escape hatch. This
/// counter is that escape hatch.
///
/// It never resets, because Helm's close handler never cancels a close: every
/// close request is meant to end the process. If a "you have unsaved changes,
/// cancel?" flow is ever added, this must gain a reset on the cancel path.
#[derive(Default)]
struct CloseTracker {
    requests: AtomicUsize,
}

impl CloseTracker {
    fn record_request(&self) -> CloseAction {
        if self.requests.fetch_add(1, Ordering::SeqCst) == 0 {
            CloseAction::AwaitFrontend
        } else {
            CloseAction::ForceExit
        }
    }
}

/// Show (or lazily create) the always-on-top quick-capture window.
fn open_capture_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("capture") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let result = tauri::WebviewWindowBuilder::new(
        app,
        "capture",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Quick Capture")
    .inner_size(560.0, 200.0)
    .resizable(false)
    .always_on_top(true)
    .center()
    .build();
    if let Err(e) = result {
        eprintln!("Failed to create capture window: {e}");
    }
}

/// Backstop for a frontend that never completes the close handshake.
///
/// Two independent triggers, neither of which can fire during a normal close:
///  1. A repeat close request. A healthy close ends with the process gone, so
///     there is never a second request to see; one can only arrive from a
///     fresh, deliberate user action after the first did nothing.
///  2. A watchdog thread armed on the first request. A healthy close exits the
///     process seconds before the timer elapses, taking the sleeping thread
///     with it, so the timer can only ever fire on a close that has already
///     failed.
fn handle_main_window_close(tracker: &CloseTracker, app: &AppHandle) {
    match tracker.record_request() {
        CloseAction::ForceExit => {
            eprintln!("Repeat close request; frontend did not quit — forcing exit.");
            app.exit(0);
        }
        CloseAction::AwaitFrontend => {
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(CLOSE_WATCHDOG);
                eprintln!(
                    "Frontend did not quit within {}s of the close request — forcing exit.",
                    CLOSE_WATCHDOG.as_secs()
                );
                app.exit(0);
            });
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared with the window-event handler below; see `CloseTracker`.
    let close_tracker = Arc::new(CloseTracker::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(move |window, event| {
            // Only the main window quits the app; closing quick-capture just
            // dismisses it.
            if window.label() != MAIN_WINDOW {
                return;
            }
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                handle_main_window_close(&close_tracker, window.app_handle());
            }
        })
        .setup(|app| {
            // ── Global quick-capture shortcut (⌘⇧Space / Ctrl+Shift+Space) ─
            let capture_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        if event.state() == ShortcutState::Pressed && shortcut == &capture_shortcut {
                            open_capture_window(app);
                        }
                    })
                    .build(),
            )?;
            if let Err(e) = app.global_shortcut().register(capture_shortcut) {
                // Another app may own the combo — capture is unavailable but
                // Helm must still start.
                eprintln!("Failed to register quick-capture shortcut: {e}");
            }

            // ── Helm (app) menu ───────────────────────────────────────────
            let about_metadata = AboutMetadataBuilder::new()
                .version(Some(app.package_info().version.to_string()))
                .copyright(Some("© 2026 Jordan Papaleo".to_string()))
                .website(Some("https://github.com/jordanpapaleo/helm".to_string()))
                .website_label(Some("GitHub".to_string()))
                .build();

            let settings_item = MenuItemBuilder::new("Settings…")
                .id("open_settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let check_updates_item = MenuItemBuilder::new("Check for Updates…")
                .id("check_for_updates")
                .build(app)?;

            let quit_item = MenuItemBuilder::new("Quit Helm")
                .id("quit")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;

            let app_menu = SubmenuBuilder::new(app, "Helm")
                .item(&PredefinedMenuItem::about(app, Some("About Helm"), Some(about_metadata))?)
                .item(&check_updates_item)
                .separator()
                .item(&settings_item)
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, Some("Hide Helm"))?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&quit_item)
                .build()?;

            // ── File menu ─────────────────────────────────────────────────
            let new_note_item = MenuItemBuilder::new("New Note")
                .id("new_note")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;

            let add_vault_item = MenuItemBuilder::new("Add Vault…")
                .id("add_vault")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_note_item)
                .separator()
                .item(&add_vault_item)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            // ── Edit menu ─────────────────────────────────────────────────
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            // ── Format menu ───────────────────────────────────────────────
            let heading_1 = MenuItemBuilder::new("Heading 1")
                .id("heading_1")
                .accelerator("CmdOrCtrl+1")
                .build(app)?;
            let heading_2 = MenuItemBuilder::new("Heading 2")
                .id("heading_2")
                .accelerator("CmdOrCtrl+2")
                .build(app)?;
            let heading_3 = MenuItemBuilder::new("Heading 3")
                .id("heading_3")
                .accelerator("CmdOrCtrl+3")
                .build(app)?;
            let heading_4 = MenuItemBuilder::new("Heading 4")
                .id("heading_4")
                .accelerator("CmdOrCtrl+4")
                .build(app)?;
            let heading_5 = MenuItemBuilder::new("Heading 5")
                .id("heading_5")
                .accelerator("CmdOrCtrl+5")
                .build(app)?;
            let heading_6 = MenuItemBuilder::new("Heading 6")
                .id("heading_6")
                .accelerator("CmdOrCtrl+6")
                .build(app)?;
            let paragraph_fmt = MenuItemBuilder::new("Paragraph")
                .id("paragraph_fmt")
                .build(app)?;

            let format_menu = SubmenuBuilder::new(app, "Format")
                .item(&heading_1)
                .item(&heading_2)
                .item(&heading_3)
                .item(&heading_4)
                .item(&heading_5)
                .item(&heading_6)
                .separator()
                .item(&paragraph_fmt)
                .build()?;

            // ── View > Theme submenu ──────────────────────────────────────
            let theme_defs = [
                ("light", "Light"),
                ("dark", "Dark"),
                ("cyberpunk", "Cyberpunk"),
                ("synthwave", "Synthwave"),
                ("lofi", "Lo-Fi"),
                ("cmyk", "CMYK"),
                ("garden", "Garden"),
                ("nord", "Nord"),
                ("dracula", "Dracula"),
                ("abyss", "Abyss"),
                ("corporate", "Corporate"),
                ("retro", "Retro"),
                ("dim", "Dim"),
                ("sunset", "Sunset"),
                ("winter", "Winter"),
            ];

            let theme_items = theme_defs
                .iter()
                .map(|(id, name)| {
                    MenuItemBuilder::new(*name)
                        .id(format!("set_theme_{id}"))
                        .build(app)
                })
                .collect::<Result<Vec<_>, _>>()?;

            let mut theme_submenu = SubmenuBuilder::new(app, "Theme");
            for item in &theme_items {
                theme_submenu = theme_submenu.item(item);
            }
            let theme_submenu = theme_submenu.build()?;

            let toggle_markdown = MenuItemBuilder::new("Toggle Markdown Mode")
                .id("toggle_markdown")
                .accelerator("CmdOrCtrl+M")
                .build(app)?;

            let font_increase = MenuItemBuilder::new("Increase Font Size")
                .id("font_size_increase")
                .accelerator("CmdOrCtrl+=")
                .build(app)?;

            let font_decrease = MenuItemBuilder::new("Decrease Font Size")
                .id("font_size_decrease")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;

            let font_reset = MenuItemBuilder::new("Reset Font Size")
                .id("font_size_reset")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&toggle_markdown)
                .separator()
                .item(&theme_submenu)
                .separator()
                .item(&font_increase)
                .item(&font_decrease)
                .item(&font_reset)
                .build()?;

            // ── Help menu ─────────────────────────────────────────────────
            let mcp_setup_item = MenuItemBuilder::new("MCP Setup")
                .id("mcp_setup")
                .build(app)?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&mcp_setup_item)
                .build()?;

            // ── Assemble menu bar ─────────────────────────────────────────
            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&format_menu)
                .item(&view_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let id = event.id().as_ref();
                match id {
                    "quit" => { let _ = app_handle.emit("quit-app", ()); }
                    "new_note" => { let _ = app_handle.emit("new-note", ()); }
                    "toggle_markdown" => { let _ = app_handle.emit("toggle-markdown", ()); }
                    "open_settings" => { let _ = app_handle.emit("open-settings", ()); }
                    "check_for_updates" => { let _ = app_handle.emit("check-for-updates", ()); }
                    "add_vault" => { let _ = app_handle.emit("add-vault", ()); }
                    "mcp_setup" => { let _ = app_handle.emit("show-mcp-setup", ()); }
                    "font_size_increase" => { let _ = app_handle.emit("font-size-change", "increase"); }
                    "font_size_decrease" => { let _ = app_handle.emit("font-size-change", "decrease"); }
                    "font_size_reset" => { let _ = app_handle.emit("font-size-change", "reset"); }
                    "heading_1" => { let _ = app_handle.emit("format-heading", 1u8); }
                    "heading_2" => { let _ = app_handle.emit("format-heading", 2u8); }
                    "heading_3" => { let _ = app_handle.emit("format-heading", 3u8); }
                    "heading_4" => { let _ = app_handle.emit("format-heading", 4u8); }
                    "heading_5" => { let _ = app_handle.emit("format-heading", 5u8); }
                    "heading_6" => { let _ = app_handle.emit("format-heading", 6u8); }
                    "paragraph_fmt" => { let _ = app_handle.emit("format-paragraph", ()); }
                    other if other.starts_with("set_theme_") => {
                        let theme_id = &other["set_theme_".len()..];
                        let _ = app_handle.emit("set-theme", theme_id);
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            exit_app,
            get_vault_path,
            set_vault_path,
            get_vaults,
            set_vaults,
            list_notes,
            read_note,
            write_note,
            delete_note,
            rename_note,
            watch_vault,
            write_asset,
            delete_asset,
            snapshot_note,
            list_note_history,
            list_folders,
            create_folder,
            delete_folder,
            rename_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    // Only the decision logic is unit-testable here. `handle_main_window_close`
    // itself needs a live `AppHandle` and an event loop (its two effects are
    // `app.exit(0)` and sleeping a real thread), so it is exercised manually,
    // not by a test that would only assert that a mock was called.

    #[test]
    fn first_close_request_waits_for_the_frontend() {
        let tracker = CloseTracker::default();
        assert_eq!(tracker.record_request(), CloseAction::AwaitFrontend);
    }

    #[test]
    fn a_repeat_close_request_forces_the_exit() {
        let tracker = CloseTracker::default();
        tracker.record_request();
        assert_eq!(tracker.record_request(), CloseAction::ForceExit);
    }

    #[test]
    fn every_request_after_the_first_forces_the_exit() {
        let tracker = CloseTracker::default();
        assert_eq!(tracker.record_request(), CloseAction::AwaitFrontend);
        for _ in 0..5 {
            assert_eq!(tracker.record_request(), CloseAction::ForceExit);
        }
    }

    #[test]
    fn exactly_one_of_many_concurrent_requests_waits() {
        let tracker = Arc::new(CloseTracker::default());
        let waiters = Arc::new(AtomicUsize::new(0));
        let mut handles = Vec::new();
        for _ in 0..16 {
            let tracker = Arc::clone(&tracker);
            let waiters = Arc::clone(&waiters);
            handles.push(std::thread::spawn(move || {
                if tracker.record_request() == CloseAction::AwaitFrontend {
                    waiters.fetch_add(1, Ordering::SeqCst);
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        // Exactly one watchdog thread is ever armed, no matter the race.
        assert_eq!(waiters.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn the_watchdog_outlasts_the_frontend_flush_budget() {
        // Frontend bound: 2s flush timeout + an IPC round trip. The watchdog
        // must be comfortably longer or a healthy close could be truncated.
        assert!(CLOSE_WATCHDOG >= Duration::from_secs(5));
    }
}
