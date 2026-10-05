mod article;
mod db;
mod site;

use tauri::Manager;

use db::Db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 应用启动时初始化 SQLite（应用数据目录），连接放入全局状态
            let conn = db::init_db(app.handle())?;
            app.manage(Db(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            site::list_sites,
            site::create_site,
            site::get_active_site,
            site::set_active_site,
            article::list_articles,
            article::get_article_cmd,
            article::create_article,
            article::update_article_cmd,
            article::delete_article_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
