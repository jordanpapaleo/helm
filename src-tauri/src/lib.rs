mod vault;
use vault::*;
use tauri::menu::{
    AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
                .item(&PredefinedMenuItem::quit(app, Some("Quit Helm"))?)
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
