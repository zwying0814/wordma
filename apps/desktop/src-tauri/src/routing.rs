use std::collections::HashMap;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::site::{get_setting, set_setting};

/// 每个站点一条设置键（settings 表为全局 kv，按站点拼键）
const RULES_KEY_PREFIX: &str = "routing_rules:";

/// 路由规则表（对应设计稿/Typecho 的路由设置）；
/// 占位符语法 [var]，渲染期替换为具体值
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct RoutingRules {
    pub index: String,
    pub index_pagination: String,
    pub post: String,
    pub page: String,
    pub category: String,
    pub tag: String,
    pub archive: String,
    pub feed: String,
}

impl Default for RoutingRules {
    fn default() -> Self {
        Self {
            index: "/".into(),
            index_pagination: "/page/[num]/".into(),
            post: "/post/[slug].html".into(),
            page: "/[slug].html".into(),
            category: "/category/[slug]/".into(),
            tag: "/tag/[slug]/".into(),
            archive: "/archive/".into(),
            feed: "/feed.xml".into(),
        }
    }
}

impl RoutingRules {
    pub fn iter(&self) -> [(&'static str, &String); 8] {
        [
            ("index", &self.index),
            ("indexPagination", &self.index_pagination),
            ("post", &self.post),
            ("page", &self.page),
            ("category", &self.category),
            ("tag", &self.tag),
            ("archive", &self.archive),
            ("feed", &self.feed),
        ]
    }
}

/// 每类路由允许的占位符
fn allowed_vars(route: &str) -> &'static [&'static str] {
    match route {
        "post" => &["slug", "id", "year", "month", "day"],
        "page" | "category" | "tag" => &["slug", "id"],
        "indexPagination" => &["num"],
        _ => &[],
    }
}

/// 提取模式中的占位符，如 "/post/[slug].html" -> ["slug"]
fn extract_vars(pattern: &str) -> Vec<String> {
    pattern
        .split('[')
        .skip(1)
        .filter_map(|seg| seg.split(']').next().map(str::to_string))
        .collect()
}

fn is_reserved_prefix(pattern: &str) -> bool {
    let first = pattern.split('/').find(|s| !s.is_empty()).unwrap_or("");
    first == "assets" // 主题资源目录
}

/// 单条路由模式校验；Err 为面向用户的提示
pub fn validate_pattern(route: &str, pattern: &str) -> Result<(), String> {
    if route == "index" {
        if pattern != "/" {
            return Err("首页路由必须是 /".into());
        }
        return Ok(());
    }
    if !pattern.starts_with('/') {
        return Err("路径必须以 / 开头".into());
    }
    if pattern.contains('\\') || pattern.contains("..") {
        return Err("路径包含非法字符".into());
    }
    if !pattern
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || " /[]-._".contains(c))
    {
        return Err("路径只能包含字母、数字、/ - _ . [ ]".into());
    }
    if pattern.contains("//") {
        return Err("存在空的路径段".into());
    }
    if is_reserved_prefix(pattern) {
        return Err("assets 为主题资源保留目录，不能作为内容路径前缀".into());
    }

    if route == "indexPagination" && !extract_vars(pattern).contains(&"num".to_string()) {
        return Err("分页路由必须包含 [num]".into());
    }
    if route == "feed" && !extract_vars(pattern).is_empty() {
        return Err("feed 路由不支持占位符".into());
    }

    let allowed = allowed_vars(route);
    let mut seen = Vec::new();
    for var in extract_vars(pattern) {
        if !allowed.contains(&var.as_str()) {
            return Err(format!(
                "路由 [{var}] 不受支持，可用变量：{}",
                allowed.join(", ")
            ));
        }
        if seen.contains(&var) {
            return Err(format!("路由变量 [{var}] 重复使用"));
        }
        seen.push(var);
    }
    Ok(())
}

/// 单条路由校验结果（供前端可视化）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteCheck {
    pub route: String,
    pub ok: bool,
    pub message: Option<String>,
    pub example: Option<String>,
}

fn example_vars(route: &str) -> HashMap<String, String> {
    let mut vars = HashMap::new();
    vars.insert("slug".into(), "hello-world".into());
    vars.insert("id".into(), "1".into());
    vars.insert("year".into(), "2026".into());
    vars.insert("month".into(), "10".into());
    vars.insert("day".into(), "04".into());
    let _ = route;
    vars
}

/// 校验整套规则；逐条给出结果与示例路径
pub fn validate_rules(rules: &RoutingRules) -> Vec<RouteCheck> {
    let mut checks = Vec::new();
    for (route, pattern) in rules.iter() {
        let check = match validate_pattern(route, pattern) {
            Ok(()) => {
                let example = if route == "index" {
                    "/".to_string()
                } else {
                    generate_path(pattern, &example_vars(route)).unwrap_or_default()
                };
                RouteCheck {
                    route: route.to_string(),
                    ok: true,
                    message: None,
                    example: Some(example),
                }
            }
            Err(message) => RouteCheck {
                route: route.to_string(),
                ok: false,
                message: Some(message),
                example: None,
            },
        };
        checks.push(check);
    }
    checks
}

/// 按模式生成最终路径；未提供的占位符视为规则错误
pub fn generate_path(
    pattern: &str,
    vars: &HashMap<String, String>,
) -> Result<String, String> {
    let mut out = pattern.to_string();
    for var in extract_vars(pattern) {
        let value = vars.get(&var).ok_or_else(|| format!("缺少变量 [{var}]"))?;
        out = out.replace(&format!("[{var}]"), value);
    }
    Ok(out)
}

// ===== 存取 =====

pub fn get_routing_rules(conn: &Connection, site_id: i64) -> Result<RoutingRules, String> {
    let key = format!("{RULES_KEY_PREFIX}{site_id}");
    match get_setting(conn, &key).map_err(|e| format!("读取路由规则失败: {e}"))? {
        Some(json) => Ok(serde_json::from_str(&json).unwrap_or_default()),
        None => Ok(RoutingRules::default()),
    }
}

/// 保存前先整体校验，非法则拒绝写入
pub fn set_routing_rules(
    conn: &Connection,
    site_id: i64,
    rules: &RoutingRules,
) -> Result<(), String> {
    for (route, pattern) in rules.iter() {
        validate_pattern(route, pattern).map_err(|e| format!("{route}: {e}"))?;
    }
    let key = format!("{RULES_KEY_PREFIX}{site_id}");
    let json = serde_json::to_string(rules).map_err(|e| format!("序列化失败: {e}"))?;
    set_setting(conn, &key, &json).map_err(|e| format!("保存路由规则失败: {e}"))
}

// ===== Tauri commands =====

#[tauri::command]
pub fn get_routing_rules_cmd(db: State<Db>, site_id: i64) -> Result<RoutingRules, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_routing_rules(&conn, site_id)
}

#[tauri::command]
pub fn set_routing_rules_cmd(
    db: State<Db>,
    site_id: i64,
    rules: RoutingRules,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    set_routing_rules(&conn, site_id, &rules)
}

#[tauri::command]
pub fn validate_routing_cmd(rules: RoutingRules) -> Vec<RouteCheck> {
    validate_rules(&rules)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn defaults_when_unset_and_roundtrip() {
        let conn = mem_db();
        assert_eq!(get_routing_rules(&conn, 1).unwrap(), RoutingRules::default());

        let rules = RoutingRules {
            post: "/[year]/[month]/[slug].html".into(),
            ..RoutingRules::default()
        };
        set_routing_rules(&conn, 1, &rules).unwrap();
        assert_eq!(get_routing_rules(&conn, 1).unwrap(), rules);
        // 站点隔离
        assert_eq!(get_routing_rules(&conn, 2).unwrap(), RoutingRules::default());
    }

    #[test]
    fn pattern_validation() {
        assert!(validate_pattern("post", "/post/[slug].html").is_ok());
        assert!(validate_pattern("post", "/[year]/[month]/[slug]/").is_ok());
        assert!(validate_pattern("post", "post/[slug]").is_err()); // 缺开头 /
        assert!(validate_pattern("post", "/post/../../[slug]").is_err()); // 穿越
        assert!(validate_pattern("post", "/post/[foo]/").is_err()); // 未知变量
        assert!(validate_pattern("post", "/post/[slug]/[slug]").is_err()); // 重复变量
        assert!(validate_pattern("post", "/assets/[slug]").is_err()); // 保留前缀
        assert!(validate_pattern("post", "/post//[slug]").is_err()); // 空段
        assert!(validate_pattern("index", "/").is_ok());
        assert!(validate_pattern("index", "/home").is_err()); // 首页必须是 /
        assert!(validate_pattern("page", "/[year]").is_err()); // page 只允许 slug/id
    }

    #[test]
    fn generate_and_rules_validation() {
        let mut vars = HashMap::new();
        vars.insert("slug".to_string(), "hello".to_string());
        vars.insert("year".to_string(), "2026".to_string());
        vars.insert("month".to_string(), "10".to_string());
        assert_eq!(
            generate_path("/[year]/[month]/[slug].html", &vars).unwrap(),
            "/2026/10/hello.html"
        );
        assert!(generate_path("/[day]/[slug].html", &vars).is_err()); // 缺 day

        let rules = RoutingRules {
            post: "/posts/[oops]".into(),
            ..RoutingRules::default()
        };
        let checks = validate_rules(&rules);
        let post = checks.iter().find(|c| c.route == "post").unwrap();
        assert!(!post.ok);
        let index = checks.iter().find(|c| c.route == "index").unwrap();
        assert!(index.ok);
    }
}
