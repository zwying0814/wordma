//! wordma 桌面端主入口。
//!
//! 存储已从「文件夹 + MDX 文件」改为 **SQLite**，且**整个应用只有一个库**
//! （`<app_config_dir>/wordma.db`）：空间是库里的 `spaces` 表，文章靠 `space_id` 归属。
//!  - [`db`]：连接、PRAGMA 与迁移运行器（全项目唯一直接依赖 rusqlite 的地方）
//!  - [`time`]：时间戳与日期换算
//!  - [`space`]：应用库的表结构、空间列表
//!  - [`article`]：文章读写、分页与全文检索
//!
//! 历史版本的存储格式（文件夹空间 / 单库空间 / 旧注册表）已停止支持，
//! 迁移代码（`space::legacy`）与 MDX frontmatter 解析（`article::frontmatter`）已移除。

mod article;
mod db;
mod space;
mod time;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            space::commands::space_list,
            space::commands::space_create,
            space::commands::space_set_active,
            space::commands::space_article_count,
            space::commands::space_remove,
            space::commands::space_backup,
            article::commands::article_page,
            article::commands::article_search,
            article::commands::article_get,
            article::commands::article_create,
            article::commands::article_update,
            article::commands::article_set_pinned,
            article::commands::article_delete,
            article::commands::article_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
