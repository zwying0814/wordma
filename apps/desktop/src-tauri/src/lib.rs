mod engine;
mod workspace;
mod workspace_fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(engine::EngineManager::default())
        .invoke_handler(tauri::generate_handler![
            workspace::load_workspaces,
            workspace::open_workspace,
            workspace::remove_recent_workspace,
            workspace::set_auto_open_last,
            engine::engine_start_dev,
            engine::engine_stop,
            engine::engine_build,
            engine::engine_inspect,
            workspace_fs::workspace_read,
            workspace_fs::workspace_write,
            workspace_fs::workspace_create_note,
            workspace_fs::workspace_delete_note,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. }
                | tauri::RunEvent::Exit
        ) {
            engine::shutdown(app_handle);
        }
    });
}
