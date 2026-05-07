// Prevents an additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn find_ds_tui() -> Option<std::path::PathBuf> {
    // Look for ds-tui.exe in several locations relative to the app
    let candidates = [
        // Development: alongside the Tauri source
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("target").join("debug").join("ds-tui.exe")),
        // Development: alternative path
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("target").join("release").join("ds-tui.exe")),
        // Bundled: alongside the desktop app
        Some(
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("ds-tui.exe"),
        ),
    ];

    for candidate in candidates.iter().flatten() {
        if candidate.exists() {
            return Some(candidate.clone());
        }
    }
    None
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let _app_handle = app.handle().clone();

            // Try to find and start the backend ds-tui process
            if let Some(ds_tui_path) = find_ds_tui() {
                println!("Found ds-tui at: {:?}", ds_tui_path);

                match Command::new(&ds_tui_path)
                    .args(["serve", "--http"])
                    .env("DS_LOCALE", "zh-Hans")
                    .spawn()
                {
                    Ok(child) => {
                        println!("ds-tui serve started with PID: {}", child.id());
                        app.manage(BackendProcess(Mutex::new(Some(child))));
                    }
                    Err(e) => {
                        eprintln!("Failed to start ds-tui: {}", e);
                        app.manage(BackendProcess(Mutex::new(None)));
                    }
                }
            } else {
                eprintln!("ds-tui.exe not found!");
                app.manage(BackendProcess(Mutex::new(None)));
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the backend process when the window is closed
                if let Some(state) = window.try_state::<BackendProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(ref mut child) = *guard {
                            let _ = child.kill();
                            let _ = child.wait();
                            println!("ds-tui process terminated");
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DS Code desktop");
}
