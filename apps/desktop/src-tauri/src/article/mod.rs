//! 文章（article）能力：库里的文章读写与 Tauri 命令。
//!
//! 一篇文章是 `articles` 表里的一行，唯一键是 **(space_id, slug)** ——
//! 整个应用只有一个库，各空间的文章在同一张表里，靠 `space_id` 区分。
//! **不再有 `content/` 目录，也再没有独立的元数据索引缓存**——
//! 数据库本身就是索引，旧版 `.wordma/articles.index.json` 那套
//! 「目录 mtime 三级失效」的维护逻辑随本次改造一并删除。
//!
//! 模块分工：
//!  - [`store`]：文章在库里的增删改查、分页与全文检索（SQL 都在这里）
//!  - [`import`]：单篇导出成 MDX 文件
//!  - [`commands`]：对外命令；slug 校验、标签与日期归一化在这一层
//!
//! 旧版 MDX 的批量导入与 frontmatter 解析已随旧版数据格式一并移除；
//! `MDX_EXT` 仅剩导出这一个用途。

pub mod commands;
pub mod import;
pub mod model;
pub mod store;

/// 导出文件的扩展名（不含点）。仅导出用，不再是存储格式。
pub const MDX_EXT: &str = "mdx";
