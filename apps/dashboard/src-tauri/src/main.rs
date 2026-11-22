// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn get_workstation_telemetry() -> serde_json::Value {
    serde_json::json!({
        "node_name": "OMEN-16",
        "gpu": "NVIDIA GeForce RTX 5060 (8GB)",
        "docker_daemon": "healthy",
        "active_threads": 12,
        "database": "Google Cloud Firestore"
    })
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Build system tray menu
            let quit_i = MenuItem::with_id(app, "quit", "Quit PHOENIX", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Open Command Center", true, None::<&str>)?;
            let pause_i = MenuItem::with_id(app, "pause", "Emergency Pause Fleet", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &pause_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_workstation_telemetry])
        .run(tauri::generate_context!())
        .expect("error while running PHOENIX desktop application");
}
