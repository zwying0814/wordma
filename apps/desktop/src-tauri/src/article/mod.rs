//! 文章（article）能力：落盘模型与 Tauri 命令。
//!
//! 文章即「当前空间 content 目录下的一个 .mdx 文件」，没有独立注册表——
//! 目录就是真相源，列表/删除都直接操作磁盘文件。名称（不含扩展名）即唯一键。

pub mod commands;
pub mod model;
