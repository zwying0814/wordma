// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn compile_mdx(content: String) -> Result<String, String> {
    let options = mdxjs::Options {
        jsx: false,
        ..Default::default()
    };
    
    match mdxjs::compile(&content, &options) {
        Ok(code) => Ok(code),
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
            description: "ensure_tables_exist",
            sql: "CREATE TABLE IF NOT EXISTS site (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS article (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT,
                type TEXT NOT NULL DEFAULT 'markdown',
                summary TEXT,
                cover TEXT,
                status TEXT DEFAULT 'draft',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO article (title, content, type, summary, status)
            SELECT '欢迎使用 Wordma', '# Hello Wordma\n\n这是一个示例 Markdown 文章。你可以在这里开始你的写作之旅！', 'markdown', '这是第一篇文章的摘要', 'published'
            WHERE NOT EXISTS (SELECT 1 FROM article);
            INSERT INTO site (name, description)
            SELECT '默认站点', '这是初始化创建的站点描述'
            WHERE NOT EXISTS (SELECT 1 FROM site);
            ",
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
        .invoke_handler(tauri::generate_handler![greet, compile_mdx])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
