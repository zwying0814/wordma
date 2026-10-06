mod article;
mod db;
mod media;
mod pages;
mod routing;
mod site;
mod taxonomy;
mod theme;

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
            site::update_site_cmd,
            article::list_articles,
            article::get_article_cmd,
            article::create_article,
            article::update_article_cmd,
            article::delete_article_cmd,
            taxonomy::list_tags,
            taxonomy::create_tag,
            taxonomy::rename_tag_cmd,
            taxonomy::delete_tag_cmd,
            taxonomy::list_categories,
            taxonomy::create_category,
            taxonomy::rename_category_cmd,
            taxonomy::delete_category_cmd,
            routing::get_routing_rules_cmd,
            routing::set_routing_rules_cmd,
            routing::validate_routing_cmd,
            pages::list_pages,
            pages::get_page_cmd,
            pages::create_page,
            pages::update_page_cmd,
            pages::delete_page_cmd,
            theme::list_themes_cmd,
            theme::set_active_theme_cmd,
            theme::render_site_cmd,
            media::list_media,
            media::upload_media,
            media::delete_media_cmd,
            theme::open_preview_cmd,
            theme::open_themes_dir_cmd,
            theme::delete_theme_cmd,
            theme::get_preview_port_cmd,
            theme::get_theme_settings_cmd,
            theme::set_theme_settings_cmd,
            theme::set_preview_port_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
