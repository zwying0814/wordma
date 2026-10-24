mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            workspace::load_workspaces,
            workspace::open_workspace,
            workspace::remove_recent_workspace,
            workspace::set_auto_open_last,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
