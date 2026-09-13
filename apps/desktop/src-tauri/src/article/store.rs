//! 文章在应用库里的读写。
//!
//! 数据库取代了旧版的两套东西：`<空间>/content/*.mdx` 文件，以及
//! `.wordma/articles.index.json` 那份元数据缓存。排序、分页、标签过滤、全文检索
//! 现在都由 SQL 直接完成——「目录 mtime 三级失效」「改一次重写整个 JSON」
//! 那一整套缓存维护逻辑连同它的 O(n) 写一并消失了。
//!
//! ## 所有查询都必须带 `space_id`
//!
//! 整个应用只有一个库，各空间的文章在同一张表里。**漏掉 `space_id` 条件就是串数据**：
//! `article_page` 会把别的空间的笔记列出来，`article_delete` 会删错人。
//! 所以本模块每个函数的第一个参数都是 `space_id`，没有「全库」这种默认语义。
//!
//! ## 写入必须用 UPSERT，不能用 `INSERT OR REPLACE`
//!
//! REPLACE 为避免冲突会先隐式删除旧行，而隐式删除**不触发** delete 触发器
//! （除非开 `recursive_triggers`），`articles_fts` 里就会留下一条指向旧 rowid 的
//! 孤儿条目。危险的不是「占地方」——`JOIN f.rowid = a.rowid` 平时会把孤儿过滤掉，
//! 所以覆盖后搜索**看不出异常**；真正的破口是 **rowid 复用**：
//! 文章删光后再建一篇，SQLite 会把空出来的 rowid 重新发出去，那条孤儿条目
//! 就会把旧正文的命中算到一篇毫不相干的新文章头上。
//!
//! 已实测（Python sqlite3，同 schema）：走 REPLACE 时「覆盖正文 → 删文章 → 新建无关文章」
//! 之后搜旧正文会**误命中 1 条**；走 UPSERT 是 0 条。
//! 回归用例见本文件 `db_tests::upsert_never_contaminates_an_unrelated_article`。
//!
//! ## 检索为什么是「FTS + LIKE 混合」
//!
//! `articles_fts` 用的是 `trigram` 分词器（为中文选的，见 `space::db`），
//! **少于 3 个字符的词检索不到**。如果直接把「电池 界面」丢给 FTS，前一个词永远
//! 匹配不上，整条 AND 查询会归零——用户只会看到「什么都没有」。
//! 所以这里把查询词按长度分流：≥3 字的走 FTS（带 bm25 相关度排序），
//! 更短的退回 `LIKE %词%` 兜底。

use std::collections::HashMap;

use rusqlite::{params, Connection};

use super::model::{ArticleMeta, ArticlePageData, ArticleRecord};
use crate::db::DbError;
use crate::time;

/// 分页默认与上限。上限用于兜住前端传错参数，避免一次拉走全量。
pub const DEFAULT_PAGE_SIZE: usize = 20;
pub const MAX_PAGE_SIZE: usize = 200;

/// trigram 分词器的最小可检索长度。
const TRIGRAM_MIN: usize = 3;

/// 元信息列（正文单独取），顺序与 [`map_meta`] 一一对应。
const META_SELECT: &str =
    "a.slug, a.title, a.date, a.created_at, a.updated_at, a.size, a.draft, a.pinned";

/// 写入语句。**必须是 UPSERT**，理由见模块头注释。
/// 冲突目标是 `(space_id, slug)`——slug 只需在自己的空间内唯一。
const UPSERT_ARTICLE: &str = "
INSERT INTO articles (space_id, slug, title, body, date, sort_at, created_at, updated_at, size, draft, pinned)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
ON CONFLICT(space_id, slug) DO UPDATE SET
  title      = excluded.title,
  body       = excluded.body,
  date       = excluded.date,
  sort_at    = excluded.sort_at,
  updated_at = excluded.updated_at,
  size       = excluded.size,
  draft      = excluded.draft,
  pinned     = excluded.pinned";

/// 新建文章要写入的字段（时间戳由本模块算）。
pub struct NewArticle<'a> {
    pub slug: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub date: Option<&'a str>,
    pub tags: &'a [String],
    pub draft: bool,
    pub pinned: bool,
}

/// 「原样写入」的输入：时间戳由调用方给出，不重新计算。
/// 对外入口 [`insert`] / [`insert_in`] 都在这里统一算时间，
/// 这个结构只是 `write_row` 的内部参数载体。
struct RawArticle<'a> {
    pub slug: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub date: Option<&'a str>,
    pub tags: &'a [String],
    pub draft: bool,
    pub pinned: bool,
    pub sort_at: i64,
    pub created_at: u64,
    pub updated_at: u64,
}

// ===== 读 =====

/// 分页列出某个空间的文章。排序：置顶优先 → 日期倒序 → slug 升序。
///
/// 请求页码越界会被夹到有效范围，并以返回的 `page` 为准（前端据此修正 UI）。
pub fn page(
    conn: &Connection,
    space_id: &str,
    page: usize,
    page_size: usize,
) -> Result<ArticlePageData, DbError> {
    let total = count(conn, space_id)?;
    let (page_size, page, start) = normalize_paging(total, page, page_size);

    // LIMIT/OFFSET 直接内联：它们是我们自己算出来的整数，不存在注入面，
    // 而混进下面那些字符串参数里反而要处理类型。space_id 仍然走绑定参数。
    let sql = format!(
        "SELECT {META_SELECT} FROM articles a
         WHERE a.space_id = ?1
         ORDER BY a.pinned DESC, a.sort_at DESC, a.slug ASC
         LIMIT {page_size} OFFSET {start}"
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([space_id], map_meta)?;
    let mut articles = Vec::new();
    for row in rows {
        articles.push(row?);
    }
    attach_tags(conn, space_id, &mut articles)?;

    Ok(ArticlePageData {
        articles,
        total,
        page,
        page_size,
    })
}

/// 全文检索（FTS5 + LIKE 混合，见模块头注释）。分页语义与 [`page`] 一致。
pub fn search(
    conn: &Connection,
    space_id: &str,
    query: &str,
    page: usize,
    page_size: usize,
) -> Result<ArticlePageData, DbError> {
    let plan = SearchPlan::parse(query);

    // 全是空白 / 只有被丢掉的字符 → 返回空，而不是退化成一查全量
    if plan.is_empty() {
        return Ok(ArticlePageData {
            articles: Vec::new(),
            total: 0,
            page: 1,
            page_size: DEFAULT_PAGE_SIZE,
        });
    }

    let mut joins = String::new();
    // 空间作用域永远排在第一个占位符上，`binds` 的顺序必须与它一致
    let mut wheres: Vec<String> = vec!["a.space_id = ?".to_string()];
    let mut binds: Vec<String> = vec![space_id.to_string()];

    if let Some(fts) = &plan.fts {
        joins.push_str(" JOIN articles_fts f ON f.rowid = a.rowid");
        wheres.push("articles_fts MATCH ?".to_string());
        binds.push(fts.clone());
    }
    for term in &plan.likes {
        wheres.push("(a.title LIKE ? ESCAPE '\\' OR a.body LIKE ? ESCAPE '\\')".to_string());
        binds.push(like_pattern(term));
        binds.push(like_pattern(term));
    }

    let where_sql = wheres.join(" AND ");

    let count_sql = format!("SELECT count(*) FROM articles a{joins} WHERE {where_sql}");
    let matched: i64 =
        conn.query_row(&count_sql, rusqlite::params_from_iter(binds.iter()), |row| {
            row.get(0)
        })?;
    // count(*) 不可能为负，这里只是把 SQL 的 i64 收成与 `page()` / 前端契约一致的 usize。
    let total = matched.max(0) as usize;

    let (page_size, page, start) = normalize_paging(total, page, page_size);

    // 只有真的用了 FTS 才有 `rank` 这个隐式列，否则必须换回常规排序——
    // 拼接时写错会直接是一条 SQL 语法错误。
    let order = if plan.fts.is_some() {
        "rank ASC, a.slug ASC"
    } else {
        "a.pinned DESC, a.sort_at DESC, a.slug ASC"
    };

    let sql = format!(
        "SELECT {META_SELECT} FROM articles a{joins}
         WHERE {where_sql}
         ORDER BY {order}
         LIMIT {page_size} OFFSET {start}"
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(binds.iter()), map_meta)?;
    let mut articles = Vec::new();
    for row in rows {
        articles.push(row?);
    }
    attach_tags(conn, space_id, &mut articles)?;

    Ok(ArticlePageData {
        articles,
        total,
        page,
        page_size,
    })
}

/// 取单篇（含正文）。不存在返回 `Ok(None)`。
pub fn get(conn: &Connection, space_id: &str, slug: &str) -> Result<Option<ArticleRecord>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {META_SELECT}, a.body FROM articles a
         WHERE a.space_id = ?1 AND a.slug = ?2"
    ))?;

    let mut rows = stmt.query(params![space_id, slug])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    let mut meta = map_meta(row)?;
    let body: String = row.get(8)?;
    drop(rows);

    let mut one = [meta];
    attach_tags(conn, space_id, &mut one)?;
    meta = one[0].clone();

    Ok(Some(ArticleRecord { article: meta, body }))
}

/// slug 是否已存在。
///
/// 不带 `COLLATE NOCASE` 也是有意的——`articles.slug` 在表定义里就声明了
/// `COLLATE NOCASE`，主键索引本身就是大小写不敏感的，所以 `=` 直接走索引。
/// 旧版这里靠查询时加 `COLLATE` 而主键仍是 BINARY，两者会互相矛盾（见 `space::db`）。
pub fn exists(conn: &Connection, space_id: &str, slug: &str) -> Result<bool, DbError> {
    let n: i64 = conn.query_row(
        "SELECT count(*) FROM articles WHERE space_id = ?1 AND slug = ?2",
        params![space_id, slug],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

/// 某个空间的文章总数。
pub fn count(conn: &Connection, space_id: &str) -> Result<usize, DbError> {
    let n: i64 = conn.query_row(
        "SELECT count(*) FROM articles WHERE space_id = ?1",
        [space_id],
        |row| row.get(0),
    )?;
    Ok(n.max(0) as usize)
}

// ===== 写 =====

/// 新建（或整体覆盖）一篇文章。返回落库后的元信息。
///
/// 写入包在一个事务里，文章行与标签要么全成、要么全不成。
pub fn insert(
    conn: &Connection,
    space_id: &str,
    input: NewArticle<'_>,
) -> Result<ArticleMeta, DbError> {
    let tx = conn.unchecked_transaction()?;
    let meta = insert_in(&tx, space_id, input)?;
    tx.commit()?;
    Ok(meta)
}

/// 无事务版本，供需要在同一事务里做多步写入的调用方复用。
/// 单独调用时应走 [`insert`]，否则文章行与标签的写入会失去原子性。
pub fn insert_in(
    conn: &Connection,
    space_id: &str,
    input: NewArticle<'_>,
) -> Result<ArticleMeta, DbError> {
    let now = time::now_millis();
    // 排序时间戳：有 date 就取它，否则回退创建时间。在写入时算好存成整数，
    // 排序就不必在 SQL 里做日期解析。
    let sort_at = input.date.and_then(time::date_to_millis).unwrap_or(now as i64);

    write_row(
        conn,
        space_id,
        RawArticle {
            slug: input.slug,
            title: input.title,
            body: input.body,
            date: input.date,
            tags: input.tags,
            draft: input.draft,
            pinned: input.pinned,
            sort_at,
            created_at: now,
            updated_at: now,
        },
    )?;

    Ok(ArticleMeta {
        slug: input.slug.to_string(),
        title: input.title.to_string(),
        date: input.date.map(str::to_string),
        created_at: now,
        updated_at: now,
        size: input.body.len() as u64,
        tags: input.tags.to_vec(),
        draft: input.draft,
        pinned: input.pinned,
    })
}

/// 文章行 + 标签的实际写入。
fn write_row(conn: &Connection, space_id: &str, input: RawArticle<'_>) -> Result<(), DbError> {
    conn.execute(
        UPSERT_ARTICLE,
        params![
            space_id,
            input.slug,
            input.title,
            input.body,
            input.date,
            input.sort_at,
            input.created_at as i64,
            input.updated_at as i64,
            input.body.len() as i64,
            input.draft as i64,
            input.pinned as i64,
        ],
    )?;

    // 标签整体替换：先清后插，语义简单且不会残留旧标签
    conn.execute(
        "DELETE FROM tags WHERE space_id = ?1 AND slug = ?2",
        params![space_id, input.slug],
    )?;
    for tag in input.tags {
        conn.execute(
            "INSERT INTO tags (space_id, slug, tag) VALUES (?1, ?2, ?3)
             ON CONFLICT(space_id, slug, tag) DO NOTHING",
            params![space_id, input.slug, tag],
        )?;
    }

    Ok(())
}

/// 置顶 / 取消置顶。文章不存在返回 `Ok(None)`。
pub fn set_pinned(
    conn: &Connection,
    space_id: &str,
    slug: &str,
    pinned: bool,
) -> Result<Option<ArticleMeta>, DbError> {
    let now = time::now_millis();
    let n = conn.execute(
        "UPDATE articles SET pinned = ?3, updated_at = ?4 WHERE space_id = ?1 AND slug = ?2",
        params![space_id, slug, pinned as i64, now as i64],
    )?;
    if n == 0 {
        return Ok(None);
    }
    get_meta(conn, space_id, slug)
}

/// 更新正文（编辑器「保存」）。文章不存在返回 `Ok(None)`。
///
/// `articles_fts` 由 UPDATE 触发器（`articles_au`）同步——旧条目按 delete 语义移除、
/// 新正文重新入索引，所以保存后立即「新内容搜得到、旧内容搜不到」。
/// `size` 与 `updated_at` 在同一句 UPDATE 里刷新，避免出现两次写入。
pub fn update_body(
    conn: &Connection,
    space_id: &str,
    slug: &str,
    body: &str,
) -> Result<Option<ArticleMeta>, DbError> {
    let now = time::now_millis();
    let n = conn.execute(
        "UPDATE articles SET body = ?3, size = ?4, updated_at = ?5
         WHERE space_id = ?1 AND slug = ?2",
        params![space_id, slug, body, body.len() as i64, now as i64],
    )?;
    if n == 0 {
        return Ok(None);
    }
    get_meta(conn, space_id, slug)
}

/// 删除一篇文章；返回是否确实删掉了。
///
/// `tags` 靠 `ON DELETE CASCADE` 自动清理（依赖连接上的 `PRAGMA foreign_keys = ON`，
/// 见 `crate::db::tune`），`articles_fts` 由 delete 触发器同步。
pub fn delete(conn: &Connection, space_id: &str, slug: &str) -> Result<bool, DbError> {
    let n = conn.execute(
        "DELETE FROM articles WHERE space_id = ?1 AND slug = ?2",
        params![space_id, slug],
    )?;
    Ok(n > 0)
}

/// 取单篇元信息（不含正文）。
pub fn get_meta(conn: &Connection, space_id: &str, slug: &str) -> Result<Option<ArticleMeta>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {META_SELECT} FROM articles a WHERE a.space_id = ?1 AND a.slug = ?2"
    ))?;
    let mut rows = stmt.query(params![space_id, slug])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let meta = map_meta(row)?;
    drop(rows);

    let mut one = [meta];
    attach_tags(conn, space_id, &mut one)?;
    Ok(Some(one[0].clone()))
}

// ===== 内部实现 =====

fn map_meta(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArticleMeta> {
    Ok(ArticleMeta {
        slug: row.get(0)?,
        title: row.get(1)?,
        date: row.get(2)?,
        created_at: row.get::<_, i64>(3)? as u64,
        updated_at: row.get::<_, i64>(4)? as u64,
        size: row.get::<_, i64>(5)? as u64,
        draft: row.get::<_, i64>(6)? != 0,
        pinned: row.get::<_, i64>(7)? != 0,
        tags: Vec::new(),
    })
}

/// 批量补标签。一页最多 200 条，一条 `IN` 查询足够，不做 N+1。
fn attach_tags(
    conn: &Connection,
    space_id: &str,
    articles: &mut [ArticleMeta],
) -> Result<(), DbError> {
    if articles.is_empty() {
        return Ok(());
    }

    let placeholders = vec!["?"; articles.len()].join(",");
    let sql = format!(
        "SELECT slug, tag FROM tags
         WHERE space_id = ? AND slug IN ({placeholders})
         ORDER BY tag ASC"
    );
    let mut stmt = conn.prepare(&sql)?;

    // 第一个绑定是 space_id，其余是这一页的 slug
    let mut binds: Vec<&str> = Vec::with_capacity(articles.len() + 1);
    binds.push(space_id);
    binds.extend(articles.iter().map(|a| a.slug.as_str()));

    let rows = stmt.query_map(rusqlite::params_from_iter(binds), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut by_slug: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (slug, tag) = row?;
        by_slug.entry(slug).or_default().push(tag);
    }

    for article in articles.iter_mut() {
        if let Some(tags) = by_slug.remove(&article.slug) {
            article.tags = tags;
        }
    }
    Ok(())
}

/// 分页归一化：夹住 page_size、把越界页码夹回有效范围、算出 OFFSET。
fn normalize_paging(total: usize, page: usize, page_size: usize) -> (usize, usize, usize) {
    let page_size = if page_size == 0 {
        DEFAULT_PAGE_SIZE
    } else {
        page_size.min(MAX_PAGE_SIZE)
    };
    let total_pages = if total == 0 {
        1
    } else {
        total.div_ceil(page_size)
    };
    let page = page.clamp(1, total_pages);
    let start = (page - 1) * page_size;
    (page_size, page, start)
}

/// 检索计划：把用户输入拆成「走 FTS 的长词」与「走 LIKE 的短词」。
struct SearchPlan {
    /// FTS5 的 MATCH 表达式；没有长词时为 None（此时查询里不能出现 `rank`）
    fts: Option<String>,
    /// 少于 3 个字符的词，用 `LIKE %词%` 兜底
    likes: Vec<String>,
}

impl SearchPlan {
    fn parse(raw: &str) -> Self {
        let mut long: Vec<String> = Vec::new();
        let mut short: Vec<String> = Vec::new();

        for term in raw.split_whitespace() {
            // 用户可能顺手输入引号；这里统一剥掉，避免被当成 FTS5 语法
            let term = term.trim_matches('"').trim();
            if term.is_empty() {
                continue;
            }
            if term.chars().count() >= TRIGRAM_MIN {
                // 整词包成短语，并把内部引号按 FTS5 约定翻倍转义，
                // 这样 `*`、`(`、`AND` 之类的输入都只会被当字面量。
                long.push(format!("\"{}\"", term.replace('"', "\"\"")));
            } else {
                short.push(term.to_string());
            }
        }

        Self {
            fts: if long.is_empty() {
                None
            } else {
                // 多个词之间显式 AND：默认的空格在 FTS5 里也是 AND，写明确一点更好读
                Some(long.join(" AND "))
            },
            likes: short,
        }
    }

    fn is_empty(&self) -> bool {
        self.fts.is_none() && self.likes.is_empty()
    }
}

/// 构造 `LIKE` 模式串，转义 `%` / `_` / `\`（配合 SQL 里的 `ESCAPE '\'`）。
fn like_pattern(term: &str) -> String {
    let mut out = String::with_capacity(term.len() + 2);
    out.push('%');
    for ch in term.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(ch);
    }
    out.push('%');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_plan_splits_by_length() {
        let plan = SearchPlan::parse("电解质 电池");
        assert_eq!(plan.fts.as_deref(), Some("\"电解质\""));
        assert_eq!(plan.likes, vec!["电池"]);

        let only_short = SearchPlan::parse("电 池");
        assert!(only_short.fts.is_none());
        assert_eq!(only_short.likes.len(), 2);

        let only_long = SearchPlan::parse("固态锂电池");
        assert_eq!(only_long.fts.as_deref(), Some("\"固态锂电池\""));
        assert!(only_long.likes.is_empty());
    }

    #[test]
    fn search_plan_neutralizes_fts_syntax() {
        // 用户输入里的通配符 / 引号必须被包进短语当字面量，而不是改写查询语义
        let star = SearchPlan::parse("固态*");
        assert_eq!(star.fts.as_deref(), Some("\"固态*\""));

        // 成对的引号被剥掉，不影响词面
        let quoted = SearchPlan::parse("\"固态电池\"");
        assert_eq!(quoted.fts.as_deref(), Some("\"固态电池\""));

        // 词内部的引号按 FTS5 约定翻倍转义
        let inner = SearchPlan::parse("固\"态电池");
        assert_eq!(inner.fts.as_deref(), Some("\"固\"\"态电池\""));
    }

    #[test]
    fn search_plan_ignores_blank() {
        assert!(SearchPlan::parse("   ").is_empty());
        assert!(SearchPlan::parse("").is_empty());
    }

    #[test]
    fn like_pattern_escapes_wildcards() {
        assert_eq!(like_pattern("100%"), "%100\\%%");
        assert_eq!(like_pattern("a_b"), "%a\\_b%");
        assert_eq!(like_pattern("c\\d"), "%c\\\\d%");
        assert_eq!(like_pattern("普通"), "%普通%");
    }

    #[test]
    fn paging_clamps_out_of_range() {
        assert_eq!(normalize_paging(100, 1, 20), (20, 1, 0));
        assert_eq!(normalize_paging(100, 5, 20), (20, 5, 80));
        // 越界页码夹到最后一页
        assert_eq!(normalize_paging(100, 99, 20), (20, 5, 80));
        // 空结果也有 1 页
        assert_eq!(normalize_paging(0, 3, 20), (20, 1, 0));
        // page_size 为 0 用默认值，超上限则截断
        assert_eq!(normalize_paging(100, 1, 0), (DEFAULT_PAGE_SIZE, 1, 0));
        assert_eq!(normalize_paging(1000, 1, 9999), (MAX_PAGE_SIZE, 1, 0));
    }
}

/// 打真库的用例。
///
/// 上面那组只覆盖纯函数（检索分流、分页夹取），碰不到 schema、触发器和 FTS5 分词器
/// ——而这三样恰恰是踩过坑的地方。这里每个用例都建一个**真的**应用库文件，
/// 走 `space::db::APP_MIGRATIONS` 的正式建表路径，所以 DDL 一旦写错会立刻炸出来。
///
/// 用临时文件而不是 `:memory:`：要验证的 `PRAGMA foreign_keys = ON`（级联删除）
/// 和 WAL 都在 `db::open` 里设，走同一入口才不会出现「测试里开了、线上没开」的假绿。
///
/// ⚠️ 每个空间都建两个（`SPACE` / `OTHER`）来跑同一批断言：整个应用只有一个库，
/// **跨空间串数据**是这次改造引入的最大风险，必须有用例钉住。
#[cfg(test)]
mod db_tests {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::space::model::Space;
    use crate::space::{db as space_db, store as space_store};

    const SPACE: &str = "space-a";
    const OTHER: &str = "space-b";

    /// 独立的临时应用库。`Drop` 时会先关连接再删目录
    /// （Windows 上有打开的文件句柄就删不掉）。
    struct TempDb {
        conn: Option<Connection>,
        dir: PathBuf,
    }

    impl TempDb {
        fn new() -> Self {
            static SEQ: AtomicUsize = AtomicUsize::new(0);
            let dir = std::env::temp_dir().join(format!(
                "wordma-store-test-{}-{}",
                std::process::id(),
                SEQ.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&dir).expect("建临时目录");

            let conn = crate::db::open(&dir.join(space_db::APP_DB_FILE)).expect("建应用库");
            crate::db::migrate(&conn, space_db::APP_MIGRATIONS).expect("跑迁移");

            // 两个空间：断言跨空间不串数据
            for id in [SPACE, OTHER] {
                space_store::insert_space(
                    &conn,
                    &Space {
                        id: id.to_string(),
                        name: format!("空间 {id}"),
                        icon: "book".to_string(),
                        description: String::new(),
                        created_at: 1_700_000_000_000,
                        last_opened_at: 1_700_000_000_000,
                    },
                )
                .expect("建空间行");
            }

            Self {
                conn: Some(conn),
                dir,
            }
        }

        fn conn(&self) -> &Connection {
            self.conn.as_ref().expect("连接尚未关闭")
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            self.conn.take(); // 先关文件句柄
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    /// 省掉每次都要写的样板字段。
    fn article<'a>(
        slug: &'a str,
        title: &'a str,
        body: &'a str,
        date: Option<&'a str>,
        tags: &'a [String],
    ) -> NewArticle<'a> {
        NewArticle {
            slug,
            title,
            body,
            date,
            tags,
            draft: false,
            pinned: false,
        }
    }

    /// 建库迁移出来的结构必须已写入身份凭据 `app_id`（由迁移脚本写入），
    /// 且迁移包含 v2（`legacy_source` 列应已删除）。
    #[test]
    fn fresh_db_is_claimed_by_the_migration() {
        let t = TempDb::new();
        assert_eq!(
            crate::db::get_meta(t.conn(), "app_id").unwrap().as_deref(),
            Some("wordma")
        );
        let has_legacy_col: i64 = t
            .conn()
            .query_row(
                "SELECT count(*) FROM pragma_table_info('spaces') WHERE name = 'legacy_source'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(has_legacy_col, 0, "v2 迁移应删掉旧版导入用的 legacy_source 列");
        assert_eq!(space_store::load_spaces(t.conn()).unwrap().len(), 2);
    }

    /// 排序契约：置顶 → 日期倒序 → slug 升序；越界页码夹回最后一页；
    /// 标签跟着文章一起回来。
    #[test]
    fn page_orders_pinned_then_date_then_slug() {
        let t = TempDb::new();
        let c = t.conn();
        let tags = vec!["电池".to_string(), "电解质".to_string()];

        insert(c, SPACE, article("b", "B", "b", Some("2026-03-01"), &[])).unwrap();
        insert(c, SPACE, article("a", "A", "a", Some("2026-05-01"), &tags)).unwrap();
        insert(
            c,
            SPACE,
            NewArticle {
                pinned: true,
                ..article("c", "C", "c", Some("2025-01-01"), &[])
            },
        )
        .unwrap();

        let first = page(c, SPACE, 1, 2).unwrap();
        assert_eq!(first.total, 3);
        assert_eq!(first.page_size, 2);
        let slugs: Vec<&str> = first.articles.iter().map(|a| a.slug.as_str()).collect();
        assert_eq!(slugs, vec!["c", "a"], "置顶应排最前，其余按日期倒序");

        // 标签批量补全，按 UTF-8 字节序："电池" < "电解质"
        assert_eq!(first.articles[1].tags, tags);

        let second = page(c, SPACE, 2, 2).unwrap();
        assert_eq!(second.articles.len(), 1);
        assert_eq!(second.articles[0].slug, "b");

        let clamped = page(c, SPACE, 99, 2).unwrap();
        assert_eq!(clamped.page, 2, "越界页码应夹到最后一页");
        assert_eq!(clamped.articles[0].slug, "b");
    }

    /// 两个空间用**同一个 slug** 互不干扰：分页、取单篇、存在性都不能串。
    ///
    /// 这是「一个库装所有空间」最核心的正确性要求——主键必须是
    /// `(space_id, slug)` 而不是 `slug`。
    #[test]
    fn spaces_are_isolated_even_with_identical_slugs() {
        let t = TempDb::new();
        let c = t.conn();

        insert(c, SPACE, article("note", "A 的笔记", "A 的正文", Some("2026-01-01"), &[])).unwrap();
        insert(c, OTHER, article("note", "B 的笔记", "B 的正文", Some("2026-01-01"), &[])).unwrap();

        assert_eq!(count(c, SPACE).unwrap(), 1);
        assert_eq!(count(c, OTHER).unwrap(), 1);

        let a = get(c, SPACE, "note").unwrap().unwrap();
        assert_eq!(a.article.title, "A 的笔记");
        assert_eq!(a.body, "A 的正文");

        let b = get(c, OTHER, "note").unwrap().unwrap();
        assert_eq!(b.article.title, "B 的笔记");
        assert_eq!(b.body, "B 的正文");

        // 删 A 的不该动到 B
        assert!(delete(c, SPACE, "note").unwrap());
        assert_eq!(count(c, SPACE).unwrap(), 0);
        assert_eq!(count(c, OTHER).unwrap(), 1);
        assert!(!exists(c, SPACE, "note").unwrap());
        assert!(exists(c, OTHER, "note").unwrap());

        // 搜索也必须只在目标空间内命中
        insert(c, SPACE, article("x", "别的", "固态电解质", Some("2026-01-01"), &[])).unwrap();
        insert(c, OTHER, article("y", "别的", "固态电解质", Some("2026-01-01"), &[])).unwrap();
        assert_eq!(search(c, SPACE, "固态电解质", 1, 20).unwrap().total, 1);
        assert_eq!(search(c, OTHER, "固态电解质", 1, 20).unwrap().total, 1);
        let hit = search(c, SPACE, "固态电解质", 1, 20).unwrap();
        assert_eq!(hit.articles[0].slug, "x", "不能命中另一个空间的同名正文");
    }

    /// 检索分流要真的按字符数走：≥3 字命中 FTS5 trigram 索引，
    /// 更短的字只能靠 LIKE 兜底（trigram 索引不到，这是分词器的硬限制）。
    #[test]
    fn search_uses_fts_for_long_terms_and_like_for_short_ones() {
        let t = TempDb::new();
        let c = t.conn();

        insert(
            c,
            SPACE,
            article("solid", "固态锂电池", "复合聚合物电解质界面工程", Some("2026-01-01"), &[]),
        )
        .unwrap();
        insert(c, SPACE, article("other", "无关", "无关内容", Some("2026-01-01"), &[])).unwrap();

        let long = search(c, SPACE, "界面工程", 1, 20).unwrap();
        assert_eq!(long.total, 1);
        assert_eq!(long.articles[0].slug, "solid");

        // 「电池」只有 2 个字：FTS5 命中不了，必须由 LIKE 捞回来
        let short = search(c, SPACE, "电池", 1, 20).unwrap();
        assert_eq!(short.total, 1);
        assert_eq!(short.articles[0].slug, "solid");

        // 长短混填：长词走 FTS、短词走 LIKE，两条 WHERE 用 AND 串起来仍应命中
        let mixed = search(c, SPACE, "聚合物 电池", 1, 20).unwrap();
        assert_eq!(mixed.total, 1);

        // 只有空白不该退化成一查全量
        assert_eq!(search(c, SPACE, "   ", 1, 20).unwrap().total, 0);
        assert_eq!(search(c, SPACE, "不存在的词", 1, 20).unwrap().total, 0);
    }

    /// 这条用例钉的是「为什么必须 UPSERT」——用 `INSERT OR REPLACE` 会静默产生错误结果。
    ///
    /// 复现路径（已用 Python sqlite3 实测确认 REPLACE 会误命中）：
    /// 覆盖正文 → 删掉文章 → 新建一篇无关文章（rowid 被复用）。
    /// REPLACE 留在这条 rowid 上的孤儿 FTS 条目，会把旧正文算到新文章头上。
    /// 走 `insert`（UPSERT）则正文与索引一起被正确更新，搜旧正文应为 0 条。
    #[test]
    fn upsert_never_contaminates_an_unrelated_article() {
        let t = TempDb::new();
        let c = t.conn();

        insert(c, SPACE, article("a", "标题", "固态电解质", Some("2026-01-01"), &[])).unwrap();
        insert(c, SPACE, article("a", "标题", "界面阻抗", Some("2026-02-01"), &[])).unwrap();
        assert_eq!(count(c, SPACE).unwrap(), 1, "同 slug 覆盖不该多出一行");

        delete(c, SPACE, "a").unwrap();
        insert(
            c,
            SPACE,
            article("b", "无关文章", "讲的是电池包装工艺", Some("2026-03-01"), &[]),
        )
        .unwrap();

        assert_eq!(
            search(c, SPACE, "固态电解质", 1, 20).unwrap().total,
            0,
            "旧正文不该还能搜到，更不该算到新文章头上"
        );
        assert_eq!(
            search(c, SPACE, "界面阻抗", 1, 20).unwrap().total,
            0,
            "被覆盖的正文应已消失"
        );
        assert_eq!(search(c, SPACE, "电池包装工艺", 1, 20).unwrap().total, 1);
    }

    /// 删除要三处一起干净：文章行、`tags`（外键级联）、`articles_fts`（delete 触发器）。
    #[test]
    fn delete_cleans_tags_and_fts_index() {
        let t = TempDb::new();
        let c = t.conn();
        let tags = vec!["电池".to_string(), "电解质".to_string()];

        insert(c, SPACE, article("a", "固态锂电池", "复合聚合物电解质", Some("2026-01-01"), &tags))
            .unwrap();
        assert!(delete(c, SPACE, "a").unwrap());
        assert!(!delete(c, SPACE, "a").unwrap(), "重复删除应返回 false 而不是报错");
        assert_eq!(count(c, SPACE).unwrap(), 0);
        assert!(!exists(c, SPACE, "a").unwrap());

        let orphans: i64 = c
            .query_row("SELECT count(*) FROM tags", [], |r| r.get(0))
            .unwrap();
        assert_eq!(orphans, 0, "tags 靠外键级联删除，依赖 PRAGMA foreign_keys = ON");

        assert_eq!(
            search(c, SPACE, "复合聚合物", 1, 20).unwrap().total,
            0,
            "fts 由 delete 触发器清理，漏了就会「已删除的文章还能被搜到」"
        );
    }

    /// 删除空间要把它名下的文章与标签一起带走（`ON DELETE CASCADE`），
    /// 别的空间必须毫发无伤。
    #[test]
    fn deleting_a_space_cascades_its_articles() {
        let t = TempDb::new();
        let c = t.conn();
        let tags = vec!["电池".to_string()];

        insert(c, SPACE, article("a", "A", "固态电解质", Some("2026-01-01"), &tags)).unwrap();
        insert(c, OTHER, article("b", "B", "固态电解质", Some("2026-01-01"), &tags)).unwrap();

        assert!(space_store::delete_space(c, SPACE).unwrap());
        assert_eq!(count(c, SPACE).unwrap(), 0);
        assert_eq!(count(c, OTHER).unwrap(), 1, "另一个空间不该被牵连");

        let tag_rows: i64 = c.query_row("SELECT count(*) FROM tags", [], |r| r.get(0)).unwrap();
        assert_eq!(tag_rows, 1, "被删空间的标签要级联清掉，另一空间的要留着");

        // 空间没了，它的文章也不该还能被搜到
        assert_eq!(search(c, SPACE, "固态电解质", 1, 20).unwrap().total, 0);
        assert_eq!(search(c, OTHER, "固态电解质", 1, 20).unwrap().total, 1);
    }

    /// slug 大小写不敏感——表定义里声明了 `COLLATE NOCASE`，主键与 `exists()` 语义一致。
    ///
    /// 旧版这里是不一致的（主键 BINARY、查询 NOCASE），能同时存在 `Note` 与 `note`。
    #[test]
    fn slug_uniqueness_is_case_insensitive_in_the_schema() {
        let t = TempDb::new();
        let c = t.conn();
        insert(c, SPACE, article("Note", "N", "n", None, &[])).unwrap();

        assert!(exists(c, SPACE, "note").unwrap());
        assert!(exists(c, SPACE, "NOTE").unwrap());
        assert!(!exists(c, SPACE, "other").unwrap());

        // 大小写不同的同 slug 必须撞主键——而不是静默多出一行
        let dup = insert(c, SPACE, article("note", "小写", "覆盖", None, &[]));
        assert!(dup.is_ok(), "UPSERT 应当直接覆盖，而不是报唯一约束错");
        assert_eq!(count(c, SPACE).unwrap(), 1, "不该出现 Note 与 note 两行");
        assert_eq!(get(c, SPACE, "NOTE").unwrap().unwrap().article.title, "小写");
    }

    /// 日期参与排序，所以 `sort_at` 的换算必须真的按年月日比较，
    /// 而不是按字符串或写入顺序。这里刻意让写入顺序与日期顺序相反。
    #[test]
    fn sort_at_reflects_the_date_not_the_insert_order() {
        let t = TempDb::new();
        let c = t.conn();

        insert(c, SPACE, article("old", "旧", "x", Some("2024-12-31"), &[])).unwrap();
        insert(c, SPACE, article("new", "新", "x", Some("2026-01-01"), &[])).unwrap();
        insert(c, SPACE, article("mid", "中", "x", Some("2025-06-15"), &[])).unwrap();

        let got = page(c, SPACE, 1, 10).unwrap();
        let ordered: Vec<&str> = got.articles.iter().map(|a| a.slug.as_str()).collect();
        assert_eq!(ordered, vec!["new", "mid", "old"]);
    }

    /// 没有 `date` 的文章按创建时间排，且不能因为缺日期就报错或排到最前。
    #[test]
    fn articles_without_a_date_fall_back_to_creation_time() {
        let t = TempDb::new();
        let c = t.conn();
        insert(c, SPACE, article("dated", "有日期", "x", Some("2020-01-01"), &[])).unwrap();
        insert(c, SPACE, article("undated", "无日期", "x", None, &[])).unwrap();

        let got = page(c, SPACE, 1, 10).unwrap();
        assert_eq!(got.total, 2);
        // 无日期 → sort_at 取「现在」，必然比 2020 年新，所以排前面
        assert_eq!(got.articles[0].slug, "undated");
        assert_eq!(got.articles[0].date, None);
    }

    /// 取单篇要带正文，且不存在时是 `Ok(None)` 而不是报错。
    #[test]
    fn get_returns_the_body_and_misses_cleanly() {
        let t = TempDb::new();
        let c = t.conn();
        let tags = vec!["电池".to_string()];
        insert(c, SPACE, article("a", "标题", "正文内容", Some("2026-01-01"), &tags)).unwrap();

        let record = get(c, SPACE, "a").unwrap().expect("应能取到");
        assert_eq!(record.article.slug, "a");
        assert_eq!(record.article.tags, tags);
        assert_eq!(record.body, "正文内容");
        assert_eq!(record.article.size as usize, "正文内容".len());

        assert!(get(c, SPACE, "missing").unwrap().is_none());
    }

    /// 置顶开关要能来回切，且作用在不存在的 slug 上返回 `None`。
    #[test]
    fn set_pinned_toggles_and_reports_missing_slugs() {
        let t = TempDb::new();
        let c = t.conn();
        insert(c, SPACE, article("a", "A", "a", Some("2026-01-01"), &[])).unwrap();
        insert(c, SPACE, article("b", "B", "b", Some("2026-02-01"), &[])).unwrap();

        let pinned = set_pinned(c, SPACE, "a", true).unwrap().expect("应返回更新后的元信息");
        assert!(pinned.pinned);
        assert_eq!(page(c, SPACE, 1, 10).unwrap().articles[0].slug, "a", "置顶后应排最前");

        let unpinned = set_pinned(c, SPACE, "a", false).unwrap().unwrap();
        assert!(!unpinned.pinned);
        assert_eq!(page(c, SPACE, 1, 10).unwrap().articles[0].slug, "b");

        assert!(set_pinned(c, SPACE, "missing", true).unwrap().is_none());
    }

    /// 保存正文要四处一起对：正文更新、`size`/`updated_at` 刷新、FTS 立即重索引
    /// （新内容搜得到、旧内容搜不到）、跨空间不串。UPDATE 触发器负责索引，
    /// 漏了就是「改完却搜不到」这种静默错误。
    #[test]
    fn update_body_reindexes_fts_and_bumps_size() {
        let t = TempDb::new();
        let c = t.conn();
        insert(c, SPACE, article("a", "标题", "第一版正文", Some("2026-01-01"), &[])).unwrap();
        let before = get_meta(c, SPACE, "a").unwrap().unwrap();

        let updated = update_body(c, SPACE, "a", "第二版讨论固态电解质")
            .unwrap()
            .expect("应返回更新后的元信息");
        assert_eq!(
            get(c, SPACE, "a").unwrap().unwrap().body,
            "第二版讨论固态电解质"
        );
        assert_eq!(
            updated.size as usize,
            "第二版讨论固态电解质".len(),
            "保存要同步正文字节数"
        );
        assert!(
            updated.updated_at >= before.updated_at,
            "保存不该把修改时间改小"
        );
        assert_eq!(
            updated.created_at, before.created_at,
            "保存不该动创建时间"
        );

        // FTS 已重索引：旧正文搜不到，新正文搜得到
        assert_eq!(search(c, SPACE, "第一版正文", 1, 20).unwrap().total, 0);
        assert_eq!(search(c, SPACE, "固态电解质", 1, 20).unwrap().total, 1);

        // 不存在的 slug：返回 None 而不是报错
        assert!(update_body(c, SPACE, "missing", "x").unwrap().is_none());

        // 换个空间保存同一 slug 不得命中：这批 UPDATE 全部白做，原文章原封不动
        assert!(update_body(c, OTHER, "a", "跨空间入侵").unwrap().is_none());
        assert_eq!(
            get(c, SPACE, "a").unwrap().unwrap().body,
            "第二版讨论固态电解质"
        );
    }

    /// 同一个 slug 重复写入要幂等（按 slug 覆盖，不产生重复行），
    /// 且 UPSERT 的冲突分支**不能把 `created_at` 洗成新时间**。
    #[test]
    fn rewriting_the_same_slug_is_idempotent() {
        let t = TempDb::new();
        let c = t.conn();

        insert(c, SPACE, article("a", "标题", "第一版", Some("2020-01-01"), &[])).unwrap();
        let first = get_meta(c, SPACE, "a").unwrap().unwrap();

        // 覆盖时改动正文，但 created_at 必须保持首次创建的值
        insert(c, SPACE, article("a", "标题", "第二版", Some("2020-01-01"), &[])).unwrap();

        assert_eq!(count(c, SPACE).unwrap(), 1);
        assert_eq!(get(c, SPACE, "a").unwrap().unwrap().body, "第二版");
        let second = get_meta(c, SPACE, "a").unwrap().unwrap();
        assert_eq!(
            second.created_at, first.created_at,
            "UPSERT 的冲突分支刻意不更新 created_at"
        );
    }
}
