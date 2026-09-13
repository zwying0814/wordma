//! 应用唯一的库：`<app_config_dir>/wordma.db` 的建库、打开与识别。
//!
//! ## 为什么是「一个库」而不是「一个空间一个库」
//!
//! 空间独立成文件时，身份、路径、去重、存在性判断全要围着文件系统转：要写
//! `meta.app_id` 认领身份，要比规范化路径判断「这个空间是不是已经在列表里」，
//! 还要处理「用户把文件挪走了」这种状态。这些东西本身不产生任何用户价值。
//!
//! 收进一个库之后：
//!  - 空间就是 `spaces` 表的一行，**不存在「找不到空间」这种状态**；
//!  - 文章靠 `space_id` 归属，**不可能出现孤儿正文**；
//!  - 删除空间 = 删一行 + 级联删文章，语义干净（代价见下）；
//!  - 跨空间查询（比如以后做「全部笔记」搜索）变成一句 SQL。
//!
//! 代价是失去了「把单个空间拷给同事」的能力——要分享得走导出。这是明确的取舍。
//!
//! ## 表结构
//!
//! - `meta`：键值表。`app_id = 'wordma'` 认领身份，`active_space_id` 记住当前空间。
//! - `spaces`：空间列表（取代旧的「注册表 + 每库一份 space.json」）。
//! - `articles`：文章。主键是 **(space_id, slug)** —— slug 只需在自己的空间内唯一。
//! - `tags`：标签，(space_id, slug, tag)，复合外键指回 `articles`。
//! - `articles_fts`：FTS5 外部内容表，索引 `articles` 的标题与正文。
//!
//! 历史版本遗留的 `spaces.legacy_source` 列（旧版导入标记）由 v2 迁移删除。
//!
//! ## 几个必须记住的细节
//!
//! 1. **`slug` 声明了 `COLLATE NOCASE`。** 这让主键本身成为大小写不敏感的，
//!    与「Windows 时代留下的习惯」以及 `exists()` 的查询语义**完全一致**。
//!    不声明的话，主键是 BINARY 排序，`Note` 与 `note` 能同时存在，
//!    而 `exists()` 又查得出冲突——两者会互相矛盾（旧版就是这样）。
//!    `tags.slug` 必须跟着一起声明，否则复合外键按不同排序规则比较会失效。
//! 2. **写入只能用 `ON CONFLICT DO UPDATE`，不能用 `INSERT OR REPLACE`。**
//!    REPLACE 的隐式删除不触发 delete 触发器，FTS 会留下指向旧 rowid 的孤儿条目；
//!    平时被 `JOIN f.rowid = a.rowid` 挡住看不出异常，但 **rowid 一旦被复用**
//!    （文章删光后再建），旧正文的命中就会落到一篇无关的新文章上。
//!    实测与回归用例见 `article::store` 的模块注释。
//! 3. **触发器里的 FTS 删除要用 `VALUES('delete', ...)` 特殊写法**，
//!    这是 FTS5 外部内容表的约定，不是普通 DELETE。
//! 4. 建表顺序有讲究：索引必须写在对应的表**之后**（`tags` 的索引写前面会直接报
//!    `no such table`，这是实测踩到的）。
//!
//! ## 已知限制
//!
//! `tokenize = 'trigram'` 是为中文选的：中文没有空格，默认的 `unicode61` 会把
//! 一整串汉字当成一个 token，导致搜「电池」匹配不到「固态锂电池」。trigram 按
//! 三字滑窗建索引，中文子串检索可用，**代价是少于 3 个字符的查询命不中**
//! （搜「锂电」无效，搜「锂电池」有效）。短词由 `article::store` 用 `LIKE` 兜底。

use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::db::{self, DbError};

/// 应用库的文件名（`<app_config_dir>/wordma.db`）。
pub const APP_DB_FILE: &str = "wordma.db";

/// 迁移脚本列表。**只在末尾追加，绝不修改已发布的历史项**——
/// 老库里前面的版本已经跑过，改了不会重跑，只会让新旧库结构分叉。
pub const APP_MIGRATIONS: &[&str] = &[APP_V1, APP_V2];

/// v1：应用库的完整结构。
const APP_V1: &str = r#"
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 认领身份。字面量必须与 Rust 常量 APP_ID 一致——放在迁移里而不是每次 open 时
-- UPSERT，是因为它只需要发生一次，没必要让每次打开库都写一个事务。
INSERT INTO meta (key, value) VALUES ('app_id', 'wordma');

CREATE TABLE spaces (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  icon           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  last_opened_at INTEGER NOT NULL,
  legacy_source  TEXT
);

CREATE TABLE articles (
  space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL COLLATE NOCASE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  date       TEXT,
  sort_at    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  size       INTEGER NOT NULL,
  draft      INTEGER NOT NULL DEFAULT 0,
  pinned     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (space_id, slug)
);

CREATE INDEX idx_articles_sort ON articles(space_id, pinned DESC, sort_at DESC, slug);

CREATE TABLE tags (
  space_id TEXT NOT NULL,
  slug     TEXT NOT NULL COLLATE NOCASE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (space_id, slug, tag),
  FOREIGN KEY (space_id, slug) REFERENCES articles(space_id, slug) ON DELETE CASCADE
);

CREATE INDEX idx_tags_tag ON tags(space_id, tag);

CREATE VIRTUAL TABLE articles_fts USING fts5(
  title,
  body,
  content = 'articles',
  content_rowid = 'rowid',
  tokenize = 'trigram'
);

CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO articles_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
"#;

/// v2：删除旧版导入专用的 `spaces.legacy_source` 列。
/// 旧版 wordma 数据导入能力已移除，这列不再有任何读写方。
const APP_V2: &str = "ALTER TABLE spaces DROP COLUMN legacy_source;";

/// 应用库的绝对路径。目录不存在会被创建——这是应用自己的数据目录，
/// 与「用户随手选一个路径」不同，凭空创建是预期行为。
pub fn path_for(app: &AppHandle) -> Result<PathBuf, DbError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| DbError::Unavailable(format!("拿不到应用配置目录：{e}")))?;
    fs::create_dir_all(&dir)
        .map_err(|e| DbError::Unavailable(format!("创建应用配置目录失败：{e}")))?;
    Ok(dir.join(APP_DB_FILE))
}

/// 打开应用库：按需建库、跑迁移。**这是访问数据的唯一入口。**
pub fn open(app: &AppHandle) -> Result<Connection, DbError> {
    let path = path_for(app)?;
    let conn = db::open(&path)?;
    db::migrate(&conn, APP_MIGRATIONS)?;
    Ok(conn)
}
