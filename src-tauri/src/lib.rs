// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn is_dir_empty(path: &str) -> Result<bool, String> {
    let path = std::path::Path::new(path);
    if !path.exists() {
         return Err("该路径不存在".into());
    }
    if !path.is_dir() {
        return Err("该路径不是文件夹".into());
    }
    match std::fs::read_dir(path) {
        Ok(mut entries) => {
            // Check if there is at least one entry
            Ok(entries.next().is_none())
        },
        Err(e) => Err(e.to_string()),
    }
}

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_site_table",
            sql: "CREATE TABLE IF NOT EXISTS site (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            app.handle().plugin(
                tauri_plugin_sql::Builder::default()
                    .add_migrations("sqlite:wordma.db", migrations)
                    .build(),
            )?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, is_dir_empty])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
