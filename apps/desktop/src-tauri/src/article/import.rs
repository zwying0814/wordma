//! 把文章导出成 MDX 文件。
//!
//! MDX 不再是存储格式，只是「拿走一篇文章」时的输出格式。
//! 元信息（标题/日期/标签/置顶/草稿）全部存在数据库里，导出文件**不带
//! frontmatter**——正文本身以 `# 标题` 开头（见 `commands::default_body`），
//! 任何 Markdown 编辑器都能直接打开。

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::model::{ArticleError, ArticleErrorCode};
use super::store;
use super::MDX_EXT;

/// 把一篇文章导出成 `.mdx` 文件（纯 Markdown，无 frontmatter），返回写出的路径。
///
/// 目标目录不存在会自动创建；同名文件**直接覆盖**——导出是「拿走一份」，
/// 用户既然指定了这个位置，多半就是想要最新的内容。
pub fn export_article(
    conn: &Connection,
    space_id: &str,
    slug: &str,
    dest_dir: &Path,
) -> Result<PathBuf, ArticleError> {
    let record = store::get(conn, space_id, slug)?.ok_or_else(|| {
        ArticleError::new(ArticleErrorCode::NotFound, format!("文章「{slug}」不存在"))
    })?;

    fs::create_dir_all(dest_dir).map_err(|e| super::model::from_io_error(&e, "创建导出目录失败"))?;

    let path = dest_dir.join(format!("{slug}.{MDX_EXT}"));
    fs::write(&path, to_markdown(&record.body))
        .map_err(|e| super::model::from_io_error(&e, "写入导出文件失败"))?;

    Ok(path)
}

/// 导出内容 = 正文本身。末尾统一补一个换行，避免文件以半行结束。
fn to_markdown(body: &str) -> String {
    format!("{}\n", body.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_body_is_trimmed_and_newline_terminated() {
        assert_eq!(to_markdown("# 标题\n\n正文\n\n\n"), "# 标题\n\n正文\n");
        assert_eq!(to_markdown("正文"), "正文\n");
    }

    #[test]
    fn export_missing_article_is_not_found() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn, crate::space::db::APP_MIGRATIONS).unwrap();

        // 空库（迁移刚跑完、还没有文章行）：导出必须报 NotFound，而不是写出空文件。
        let dir = std::env::temp_dir().join(format!("wordma-export-test-{}", std::process::id()));
        let err = export_article(&conn, "no-such-space", "a", &dir).unwrap_err();
        assert_eq!(err.code, ArticleErrorCode::NotFound);
    }
}
