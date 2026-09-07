mod space;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            space::commands::space_ping,
            space::commands::space_list,
            space::commands::space_create,
            space::commands::space_open,
            space::commands::space_scan,
            space::commands::space_set_active,
            space::commands::space_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
