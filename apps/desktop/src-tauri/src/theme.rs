use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

use pulldown_cmark::{html, Options, Parser};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tera::Tera;

use crate::article::{get_articles_by_site, Article, STATUS_PUBLISHED};
use crate::db::Db;
use crate::media::media_root;
use crate::pages::get_pages_by_site;
use crate::routing::{generate_path, get_routing_rules};
use crate::taxonomy::{get_categories_by_site, get_tags_by_site};
use crate::site::{get_setting, get_site, set_setting, ACTIVE_THEME_KEY_PREFIX};

pub const DEFAULT_THEME_NAME: &str = "default";
/// 首页每页文章数（分页）
pub const INDEX_PAGE_SIZE: usize = 10;
const WEEKDAYS: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const PREVIEW_PORT_KEY: &str = "preview_port";
const PREVIEW_PORT_DEFAULT: u16 = 12739;

/// 预览服务的当前根目录（render 后切换，服务按请求读取，无需重启）
static PREVIEW_DIR: RwLock<Option<PathBuf>> = RwLock::new(None);
/// 当前监听的 (listener, 停止标志)；更换端口时替换（旧 listener 随 drop 关闭）
static PREVIEW_LISTENER: Mutex<Option<(TcpListener, Arc<AtomicBool>)>> =
    Mutex::new(None);

// ===== 内置默认主题（编译进二进制，首次运行落盘，用户可直接改） =====

const BUILTIN_FILES: &[(&str, &str)] = &[
    ("theme.yaml", include_str!("../../../../themes/default/theme.yaml")),
    (
        "templates/base.tera",
        include_str!("../../../../themes/default/templates/base.tera"),
    ),
    (
        "templates/index.tera",
        include_str!("../../../../themes/default/templates/index.tera"),
    ),
    (
        "templates/post.tera",
        include_str!("../../../../themes/default/templates/post.tera"),
    ),
    (
        "templates/archive.tera",
        include_str!("../../../../themes/default/templates/archive.tera"),
    ),
    (
        "templates/taxonomies.tera",
        include_str!("../../../../themes/default/templates/taxonomies.tera"),
    ),
    (
        "templates/page.tera",
        include_str!("../../../../themes/default/templates/page.tera"),
    ),
    (
        "assets/style.css",
        include_str!("../../../../themes/default/assets/style.css"),
    ),
];

pub fn themes_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("themes");
    fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败: {e}"))?;
    Ok(dir)
}

pub fn preview_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("preview");
    fs::create_dir_all(&dir).map_err(|e| format!("创建预览目录失败: {e}"))?;
    Ok(dir)
}

/// 内置默认主题落盘：逐文件检查缺失才写入（保留用户对已有文件的修改，
/// 同时让老安装能拿到新增的模板文件）
pub fn extract_builtin_theme(themes_dir: &Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};

    fn sha256_hex(data: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    #[derive(Debug, Default, Serialize, Deserialize)]
    struct BuiltinManifest {
        #[serde(default)]
        hashes: HashMap<String, String>,
    }

    let dir = themes_dir.join(DEFAULT_THEME_NAME);
    let manifest_path = dir.join(".builtin-manifest.json");
    let mut manifest: BuiltinManifest = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();

    // 旧版 JSON 配置迁移：内容已由 theme.yaml 取代，移除遗留文件
    let legacy_json = dir.join("theme.json");
    if legacy_json.exists() {
        let _ = fs::remove_file(&legacy_json);
        manifest.hashes.remove("theme.json");
    }

    for (rel, builtin) in BUILTIN_FILES {
        let path = dir.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        let builtin_hash = sha256_hex(builtin);
        let on_disk = fs::read_to_string(&path).ok();
        let recorded = manifest.hashes.get(*rel).cloned();

        let should_write = match on_disk.as_deref() {
            // 文件缺失：写入
            None => true,
            Some(disk) => {
                let disk_hash = sha256_hex(disk);
                match recorded.as_deref() {
                    // 无 manifest 的历史安装：与内置版本不同则覆盖迁移
                    None => disk != *builtin,
                    // 上次提取后未被用户修改：内置更新则覆盖
                    Some(rh) => {
                        if disk_hash == *rh {
                            builtin_hash != *rh
                        } else {
                            // 用户改过：保留其修改
                            false
                        }
                    }
                }
            }
        };
        if should_write {
            fs::write(&path, builtin).map_err(|e| format!("写入主题文件失败: {e}"))?;
            manifest.hashes.insert(rel.to_string(), builtin_hash);
        } else if !manifest.hashes.contains_key(*rel) {
            // 未覆盖但补记录，后续内置更新才能识别"未被用户修改"
            if let Some(disk) = &on_disk {
                manifest.hashes.insert(rel.to_string(), sha256_hex(disk));
            }
        }
    }
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("写入主题清单失败: {e}"))?;
    Ok(())
}

// ===== 主题元信息 =====

/// 主题卡片缩略图的预览配色（theme.yaml 可选声明）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreview {
    #[serde(default)]
    pub bg: String,
    #[serde(default)]
    pub chrome_bg: String,
    #[serde(default)]
    pub ink: String,
    #[serde(default)]
    pub muted: String,
    #[serde(default)]
    pub line: String,
    #[serde(default)]
    pub accent: String,
}

/// 设置项类型；未知字符串兜底为 Text（serde(other)，前向兼容）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeSettingType {
    Textarea,
    Number,
    Switch,
    Select,
    Color,
    /// 兜底变体：未知类型与缺省（serde(other) 要求位于最后）
    #[default]
    #[serde(other)]
    Text,
}

/// 主题设置项声明（theme.yaml 的 settings 数组元素；整段可选）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ThemeSetting {
    /// 模板上下文字段名 + 存库键
    #[serde(default)]
    pub key: String,
    /// 表单展示名
    #[serde(default)]
    pub label: String,
    #[serde(rename = "type")]
    pub r#type: ThemeSettingType,
    /// schema 默认值；缺失为 Null，类型不符时按 type 取零值兜底
    #[serde(default)]
    pub default: serde_json::Value,
    /// select 的可选项（value 与展示文案相同）
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeMeta {
    /// 目录名，即主题标识
    pub name: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    /// 卡片布局变体：single | cards | magazine（仅影响列表缩略图绘制）
    #[serde(default)]
    pub layout: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub preview: Option<ThemePreview>,
    /// 主题设置项 schema；缺省即该主题无设置界面
    #[serde(default)]
    pub settings: Vec<ThemeSetting>,
    // 运行时计算的字段：theme.yaml 解析时缺省，序列化时输出给前端
    #[serde(default)]
    pub active: bool,
    /// 非空表示主题结构损坏，卡片只读展示原因
    #[serde(default)]
    pub invalid_message: Option<String>,
    /// 仅激活主题携带：当前站点的预览地址
    #[serde(default)]
    pub preview_url: Option<String>,
}

/// 预览端口（全局设置）；未设置或非法时用默认值
pub fn get_preview_port(conn: &Connection) -> Result<u16, String> {
    let port = get_setting(conn, PREVIEW_PORT_KEY)
        .map_err(|e| format!("读取预览端口失败: {e}"))?
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(PREVIEW_PORT_DEFAULT);
    if (1024..=65535).contains(&port) {
        Ok(port)
    } else {
        Ok(PREVIEW_PORT_DEFAULT)
    }
}

pub fn get_active_theme_name(conn: &Connection, site_id: i64) -> Result<String, String> {
    let key = format!("{ACTIVE_THEME_KEY_PREFIX}{site_id}");
    Ok(get_setting(conn, &key)
        .map_err(|e| format!("读取激活主题失败: {e}"))?
        .unwrap_or_else(|| DEFAULT_THEME_NAME.to_string()))
}

pub fn set_active_theme_name(
    conn: &Connection,
    site_id: i64,
    name: &str,
) -> Result<(), String> {
    let key = format!("{ACTIVE_THEME_KEY_PREFIX}{site_id}");
    set_setting(conn, &key, name).map_err(|e| format!("保存激活主题失败: {e}"))
}

// ===== 主题设置项：schema 加载 / 值合并 / 校验 =====

const THEME_SETTINGS_KEY_PREFIX: &str = "theme_settings:";

fn theme_settings_key(site_id: i64, theme_name: &str) -> String {
    format!("{THEME_SETTINGS_KEY_PREFIX}{site_id}:{theme_name}")
}

/// 读取主题的设置项 schema；theme.yaml 缺失/损坏 → 空（不阻断渲染）
fn load_theme_settings(themes_dir: &Path, theme_name: &str) -> Vec<ThemeSetting> {
    let raw = match fs::read_to_string(themes_dir.join(theme_name).join("theme.yaml")) {
        Ok(raw) => raw,
        Err(_) => return Vec::new(),
    };
    serde_yaml::from_str::<ThemeMeta>(&raw)
        .map(|meta| meta.settings)
        .unwrap_or_default()
}

/// 渲染端合并（宽松）：存储值类型不符 → schema default → 零值；未知 key 忽略。
/// 与 save 路径的严格校验是有意的不对称：自家表单只产出合法值，
/// 宽松只留给 DB / theme.yaml 被手工改坏的场景。
fn resolve_theme_settings(
    schema: &[ThemeSetting],
    stored: Option<&str>,
) -> serde_json::Map<String, serde_json::Value> {
    let stored_map: serde_json::Map<String, serde_json::Value> = stored
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or_default();

    // 宽松读的单类型解析：返回 None 表示无法用该类型表达（走 default）
    let coerce = |setting: &ThemeSetting, v: &serde_json::Value| -> Option<serde_json::Value> {
        let t = &setting.r#type;
        match t {
            ThemeSettingType::Number => v.as_u64().map(|n| serde_json::json!(n)),
            ThemeSettingType::Switch => v.as_bool().map(serde_json::Value::Bool),
            ThemeSettingType::Select => {
                let s = v.as_str()?;
                if setting.options.is_empty() || setting.options.iter().any(|o| o == s) {
                    Some(serde_json::json!(s))
                } else {
                    None // 不在可选项内，走 default
                }
            }
            // text/textarea/color：字符串即用，数字/布尔宽松转为字符串
            _ => match v {
                serde_json::Value::String(s) => Some(serde_json::json!(s)),
                serde_json::Value::Number(n) => Some(serde_json::json!(n.to_string())),
                serde_json::Value::Bool(b) => Some(serde_json::json!(b.to_string())),
                _ => None,
            },
        }
    };

    let mut out = serde_json::Map::new();
    for setting in schema {
        let value = stored_map
            .get(&setting.key)
            .and_then(|v| coerce(setting, v))
            .or_else(|| coerce(setting, &setting.default))
            // 兜底链终端：零值
            .unwrap_or_else(|| match setting.r#type {
                ThemeSettingType::Number => serde_json::json!(0),
                ThemeSettingType::Switch => serde_json::json!(false),
                _ => serde_json::json!(""),
            });
        out.insert(setting.key.clone(), value);
    }
    out
}

/// 内置约定键的取值范围（schema 之外的语义约束）
fn builtin_number_range(key: &str) -> Option<(i64, i64)> {
    match key {
        "postsPerPage" => Some((1, 100)),
        _ => None,
    }
}

/// 保存校验（严格）：仅允许 schema 声明的 key 且类型严格匹配
fn validate_theme_setting_values(
    schema: &[ThemeSetting],
    values: &HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    for (key, value) in values {
        let setting = schema
            .iter()
            .find(|s| s.key == *key)
            .ok_or_else(|| format!("未知的主题设置项: {key}"))?;
        let type_ok = match setting.r#type {
            ThemeSettingType::Number => value.is_u64(),
            ThemeSettingType::Switch => value.is_boolean(),
            _ => value.is_string(),
        };
        if !type_ok {
            return Err(format!("设置项 {key} 的值类型不正确"));
        }
        if let Some((min, max)) = builtin_number_range(key) {
            let n = value.as_u64().unwrap_or(0) as i64;
            if n < min || n > max {
                return Err(format!("设置项 {key} 需在 {min} - {max} 之间"));
            }
        }
    }
    Ok(())
}

/// 主题目录结构校验（导入与列表共用）
pub fn validate_theme_dir(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err("不是目录".into());
    }
    if !path.join("theme.yaml").is_file() {
        return Err("缺少 theme.yaml".into());
    }
    let raw = fs::read_to_string(path.join("theme.yaml"))
        .map_err(|e| format!("读取 theme.yaml 失败: {e}"))?;
    let _: ThemeMeta = serde_yaml::from_str(&raw).map_err(|e| format!("theme.yaml 格式错误: {e}"))?;
    let templates = path.join("templates");
    if !templates.is_dir() {
        return Err("缺少 templates 目录".into());
    }
    // settings 为可选声明，但声明了就要形状正确（给主题作者友好报错）
    if let Ok(raw_json) = fs::read_to_string(path.join("theme.yaml")) {
        if let Ok(meta) = serde_json::from_str::<ThemeMeta>(&raw_json) {
            let mut seen_keys = Vec::new();
            for (i, setting) in meta.settings.iter().enumerate() {
                let key_ok = !setting.key.is_empty()
                    && setting.key.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
                    && setting.key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
                if !key_ok {
                    return Err(format!("settings[{i}].key 含非法字符或为空"));
                }
                if seen_keys.contains(&setting.key) {
                    return Err(format!("settings[{i}].key 重复: {}", setting.key));
                }
                seen_keys.push(setting.key.clone());
                if setting.r#type == ThemeSettingType::Select && setting.options.is_empty() {
                    return Err(format!("settings[{i}]（{}）为 select 类型，options 不能为空", setting.label));
                }
            }
        }
    }
    let has_tera = fs::read_dir(&templates)
        .map_err(|e| format!("读取 templates 失败: {e}"))?
        .any(|entry| {
            entry
                .map(|e| e.path().extension().is_some_and(|ext| ext == "tera"))
                .unwrap_or(false)
        });
    if !has_tera {
        return Err("templates 目录中没有模板".into());
    }
    Ok(())
}

pub fn list_themes(
    app: &AppHandle,
    conn: &Connection,
    site_id: i64,
) -> Result<Vec<ThemeMeta>, String> {
    let themes_dir = themes_root(app)?;
    extract_builtin_theme(&themes_dir)?;
    let active = get_active_theme_name(conn, site_id)?;
    let port = get_preview_port(conn)?;

    let mut out = Vec::new();
    let entries = fs::read_dir(&themes_dir).map_err(|e| format!("扫描主题目录失败: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("扫描主题目录失败: {e}"))?;
        let path = entry.path();
        if !path.is_dir() || !path.join("theme.yaml").exists() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = match validate_theme_dir(&path) {
            Ok(()) => {
                let raw = fs::read_to_string(path.join("theme.yaml"))
                    .map_err(|e| format!("读取 theme.yaml 失败: {e}"))?;
                let mut meta: ThemeMeta = serde_yaml::from_str(&raw)
                    .map_err(|e| format!("解析 theme.yaml 失败（{}）：{e}", path.display()))?;
                meta.name = name.clone();
                if meta.display_name.is_empty() {
                    meta.display_name = meta.name.clone();
                }
                meta.active = meta.name == active;
                if meta.active {
                    meta.preview_url =
                        Some(format!("http://127.0.0.1:{port}/index.html"));
                }
                meta
            }
            Err(message) => {
                // 结构损坏的主题降级为只读卡片，不阻断整个列表
                ThemeMeta {
                    name: name.clone(),
                    display_name: name.clone(),
                    version: String::new(),
                    author: String::new(),
                    description: message.clone(),
                    layout: String::new(),
                    tags: Vec::new(),
                    preview: None,
                    settings: Vec::new(),
                    active: name == active,
                    invalid_message: Some(message),
                    preview_url: None,
                }
            }
        };
        out.push(meta);
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

// ===== 渲染管线 =====

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderReport {
    pub theme: String,
    pub output_dir: String,
    pub files: usize,
}

/// markdown -> html + 字数（非空白字符数，与前端统计口径一致）
fn markdown_to_html(md: &str) -> (String, usize) {
    let parser = Parser::new_ext(md, Options::all());
    let mut html_out = String::new();
    html::push_html(&mut html_out, parser);
    let words = md.chars().filter(|c| !c.is_whitespace()).count();
    (html_out, words)
}

/// 文章的路由变量（日期取自创建时间）
fn post_vars(a: &Article) -> HashMap<String, String> {
    let mut vars = HashMap::new();
    vars.insert("slug".into(), a.slug.clone());
    vars.insert("id".into(), a.id.to_string());
    vars.insert("year".into(), a.created_at.get(0..4).unwrap_or("2026").into());
    vars.insert("month".into(), a.created_at.get(5..7).unwrap_or("01").into());
    vars.insert("day".into(), a.created_at.get(8..10).unwrap_or("01").into());
    vars
}

/// RSS pubDate（RFC 822）时间格式；输入为 ISO UTC 字符串
fn rfc2822_date(iso: &str) -> String {
    let num = |r: std::ops::Range<usize>| iso.get(r).and_then(|v| v.parse::<i64>().ok());
    let (Some(y), Some(mo), Some(d)) = (num(0..4), num(5..7), num(8..10)) else {
        return iso.to_string();
    };
    let (h, mi, s) = (
        num(11..13).unwrap_or(0),
        num(14..16).unwrap_or(0),
        num(17..19).unwrap_or(0),
    );
    // Howard Hinnant 的 civil_from_days：从 Unix 纪元推算星期
    let days = {
        let (y, m) = if mo <= 2 { (y - 1, mo + 12) } else { (y, mo) };
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = y - era * 400;
        let doy = (153 * (m - 3) + 2) / 5 + d - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe - 719468
    };
    let weekday = WEEKDAYS[days.rem_euclid(7) as usize];
    format!(
        "{weekday}, {d:02} {} {y:04} {h:02}:{mi:02}:{s:02} GMT",
        MONTHS[(mo - 1).clamp(0, 11) as usize]
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// 分类/标签的 slug 推导：ASCII 名称转小写中划线，中文名称回退为 id
fn taxonomy_slug(name: &str, id: i64) -> String {
    let slug: String = name.trim().to_lowercase().replace(' ', "-");
    if !slug.is_empty()
        && slug
            .split('-')
            .all(|seg| !seg.is_empty() && seg.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
    {
        slug
    } else {
        id.to_string()
    }
}

/// URL -> dist 内相对路径；目录式路径补 index.html
fn url_to_rel_fs(url: &str) -> Result<String, String> {
    let rel = url.trim_start_matches('/');
    if rel.is_empty() {
        return Ok("index.html".into());
    }
    if rel.contains("..") || rel.contains('\\') {
        return Err(format!("非法的输出路径: {url}"));
    }
    if url.ends_with('/') {
        Ok(format!("{rel}index.html"))
    } else {
        Ok(rel.to_string())
    }
}

fn write_file(dist: &Path, rel: &str, content: &str) -> Result<usize, String> {
    let path = dist.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    fs::write(&path, content).map_err(|e| format!("写入文件失败: {e}"))?;
    Ok(1)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<usize, String> {
    let mut count = 0usize;
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取目录失败: {e}"))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            count += copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| format!("拷贝资源失败: {e}"))?;
            count += 1;
        }
    }
    Ok(count)
}

/// 收集模板目录下的 *.tera，模板名为相对路径（供 extends 引用）
fn collect_templates(
    dir: &Path,
    base: &Path,
    out: &mut Vec<(PathBuf, String)>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| format!("读取模板目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取模板目录失败: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_templates(&path, base, out)?;
        } else if path.extension().is_some_and(|ext| ext == "tera") {
            let rel = path
                .strip_prefix(base)
                .map_err(|e| format!("解析模板路径失败: {e}"))?
                .to_string_lossy()
                .replace('\\', "/");
            out.push((path, rel));
        }
    }
    Ok(())
}

/// 分层加载模板：default 先入底座，主题的同名模板覆盖（最小主题可行）
fn build_tera(themes_dir: &Path, theme_name: &str) -> Result<Tera, String> {
    let mut files: Vec<(PathBuf, String)> = Vec::new();
    if theme_name != DEFAULT_THEME_NAME {
        let default_templates = themes_dir.join(DEFAULT_THEME_NAME).join("templates");
        if default_templates.is_dir() {
            collect_templates(&default_templates, &default_templates, &mut files)?;
        }
    }
    let theme_templates = themes_dir.join(theme_name).join("templates");
    if theme_templates.is_dir() {
        collect_templates(&theme_templates, &theme_templates, &mut files)?;
    }
    if files.is_empty() {
        return Err("主题与默认主题都没有可用模板".into());
    }
    let mut tera = Tera::new();
    tera.add_template_files(files.iter().map(|(p, n)| (p, Some(n))))
        .map_err(|e| format!("解析模板失败: {e}"))?;
    tera.autoescape_on(vec![".tera"]);
    Ok(tera)
}

fn render_page(
    tera: &Tera,
    name: &str,
    base: &serde_json::Value,
    extra: &serde_json::Value,
) -> Result<String, String> {
    let mut obj = base.clone();
    if let (Some(base_obj), Some(extra_obj)) = (obj.as_object_mut(), extra.as_object()) {
        for (k, v) in extra_obj {
            base_obj.insert(k.clone(), v.clone());
        }
    }
    let context = tera::Context::from_serialize(&obj).map_err(|e| format!("构建上下文失败: {e}"))?;
    tera.render(name, &context)
        .map_err(|e| format!("渲染 {name} 失败: {e}"))
}

/// 用激活主题把站点渲染为静态文件
pub fn render_site_to(
    conn: &Connection,
    dist: &Path,
    themes_dir: &Path,
    theme_name: &str,
    site_id: i64,
    include_drafts: bool,
    base_url: &str,
    media_dir: Option<&Path>,
) -> Result<RenderReport, String> {
    let rules = get_routing_rules(conn, site_id)?;
    let site = get_site(conn, site_id)?;
    let tera = build_tera(themes_dir, theme_name)?;

    if dist.exists() {
        fs::remove_dir_all(dist).map_err(|e| format!("清理输出目录失败: {e}"))?;
    }
    fs::create_dir_all(dist).map_err(|e| format!("创建输出目录失败: {e}"))?;

    let articles = get_articles_by_site(conn, site_id)?;
    let pages = get_pages_by_site(conn, site_id)?;
    let tags = get_tags_by_site(conn, site_id)?;
    let categories = get_categories_by_site(conn, site_id)?;
    let category_urls: HashMap<i64, String> = categories
        .iter()
        .map(|c| {
            Ok((
                c.id,
                generate_path(
                    &rules.category,
                    &HashMap::from([
                        ("id".to_string(), c.id.to_string()),
                        ("slug".to_string(), taxonomy_slug(&c.name, c.id)),
                    ]),
                )?,
            ))
        })
        .collect::<Result<HashMap<_, _>, String>>()?;
    let tag_urls: HashMap<i64, String> = tags
        .iter()
        .map(|t| {
            Ok((
                t.id,
                generate_path(
                    &rules.tag,
                    &HashMap::from([
                        ("id".to_string(), t.id.to_string()),
                        ("slug".to_string(), taxonomy_slug(&t.name, t.id)),
                    ]),
                )?,
            ))
        })
        .collect::<Result<HashMap<_, _>, String>>()?;
    // 标签/分类列表暂未进入模板上下文（列表页待做），先不查询

    // 独立页面：路径 + 导航上下文
        let mut used: HashSet<String> = HashSet::new();
    let mut pages_ctx: Vec<serde_json::Value> = Vec::new();
    let mut page_renders: Vec<(String, serde_json::Value)> = Vec::new();
    for p in &pages {
        let url =
            generate_path(&rules.page, &HashMap::from([("slug".to_string(), p.slug.clone())]))?;
        if !used.insert(url.clone()) {
            return Err(format!(
                "路径冲突: {url}（页面「{}」），请修改 slug 或路由规则",
                p.title
            ));
        }
        let (content_html, _) = markdown_to_html(&p.content);
        pages_ctx.push(serde_json::json!({
            "title": p.title,
            "url": url,
            "showInNav": p.show_in_nav,
        }));
        page_renders.push((
            url_to_rel_fs(&url)?,
            serde_json::json!({ "page": { "title": p.title, "contentHtml": content_html } }),
        ));
    }

    // 文章：公开列表仅含已发布；预览模式（include_drafts）额外渲染草稿详情页。
    // 列表按创建时间倒序（平局按 id）
    let published: Vec<&Article> = articles
        .iter()
        .filter(|a| a.status == STATUS_PUBLISHED)
        .collect();
    let mut published_sorted = published.clone();
    published_sorted.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    let renderable: Vec<&Article> = if include_drafts {
        articles.iter().collect()
    } else {
        published.clone()
    };
    let mut posts_ctx: Vec<serde_json::Value> = Vec::new();
    let mut post_renders: Vec<(String, serde_json::Value)> = Vec::new();
    let mut post_urls: HashMap<i64, String> = HashMap::new();
    for a in &renderable {
        let url = generate_path(&rules.post, &post_vars(a))?;
        if !used.insert(url.clone()) {
            return Err(format!(
                "路径冲突: {url}（文章「{}」），请修改 slug 或路由规则",
                a.title
            ));
        }
        post_urls.insert(a.id, url.clone());
        let category_links: Vec<serde_json::Value> = a
            .categories
            .iter()
            .map(|c| {
                serde_json::json!({ "name": c.name, "url": category_urls.get(&c.id).cloned().unwrap_or_default() })
            })
            .collect();
        let tag_links: Vec<serde_json::Value> = a
            .tags
            .iter()
            .map(|t| {
                serde_json::json!({ "name": t.name, "url": tag_urls.get(&t.id).cloned().unwrap_or_default() })
            })
            .collect();
        let (content_html, word_count) = markdown_to_html(&a.content);
        let date = a.created_at.get(0..10).unwrap_or("").to_string();
        let categories_text = a
            .categories
            .iter()
            .map(|c| c.name.clone())
            .collect::<Vec<_>>()
            .join("、");
        let tags_text = a
            .tags
            .iter()
            .map(|t| t.name.clone())
            .collect::<Vec<_>>()
            .join("、");
        // 首页/归档列表只收已发布文章；草稿仅生成详情页（预览模式直链可达）
        if a.status == STATUS_PUBLISHED {
            posts_ctx.push(serde_json::json!({
                "title": a.title,
                "url": url,
                "date": date,
                "categories": category_links,
                "tags": tag_links,
                "categoriesText": categories_text,
                "tagsText": tags_text,
                "wordCount": word_count,
            }));
        }
        post_renders.push((
            url_to_rel_fs(&url)?,
            serde_json::json!({ "post": {
                "title": a.title,
                "date": date,
                "contentHtml": content_html,
                "categories": category_links,
                "tags": tag_links,
                "categoriesText": categories_text,
                "tagsText": tags_text,
                "wordCount": word_count,
            } }),
        ));
    }

    // 归档：按创建年份分组（倒序）
    let mut archive_groups: Vec<(String, Vec<serde_json::Value>)> = Vec::new();
    for a in &published {
        let year = a.created_at.get(0..4).unwrap_or("未知").to_string();
        let date = a.created_at.get(0..10).unwrap_or("").to_string();
        let url = generate_path(&rules.post, &post_vars(a))?;
        let entry = serde_json::json!({ "title": a.title, "url": url, "date": date });
        match archive_groups.iter_mut().find(|(y, _)| *y == year) {
            Some((_, posts)) => posts.push(entry),
            None => archive_groups.push((year, vec![entry])),
        }
    }
    archive_groups.sort_by(|a, b| b.0.cmp(&a.0));

    let site_ctx = serde_json::json!({
        "site": {
            "name": site.name,
            "description": site.description.clone().unwrap_or_default(),
            "url": base_url,
        },
        "urls": {
            "archive": rules.archive,
            "categories": "/categories/",
            "tags": "/tags/",
        },
        "pages": pages_ctx,
    });
    // 主题设置注入（theme 键恒存在；模板消费可选 key 需 | default 兜底）
    let theme_values = resolve_theme_settings(
        &load_theme_settings(themes_dir, theme_name),
        get_setting(conn, &theme_settings_key(site_id, theme_name))
            .map_err(|e| format!("读取主题设置失败: {e}"))?
            .as_deref(),
    );
    let site_ctx = {
        let mut ctx = site_ctx;
        if let Some(obj) = ctx.as_object_mut() {
            obj.insert("theme".into(), serde_json::Value::Object(theme_values.clone()));
        }
        ctx
    };
    // 内置约定：postsPerPage 控制首页分页大小（越界回落默认）
    let page_size = theme_values
        .get("postsPerPage")
        .and_then(|v| v.as_u64())
        .filter(|n| (1..=100).contains(n))
        .map(|n| n as usize)
        .unwrap_or(INDEX_PAGE_SIZE);

    // ===== 分类/标签列表页 =====
    let mut taxonomy_renders: Vec<(String, serde_json::Value)> = Vec::new();
    let taxonomies: Vec<(&str, &str, &str, i64)> = categories
        .iter()
        .map(|c| ("分类", c.name.as_str(), "category", c.id))
        .chain(
            tags.iter()
                .map(|t| ("标签", t.name.as_str(), "tag", t.id)),
        )
        .collect();
    for (kind, name, rule, id) in &taxonomies {
        let url = generate_path(
            if *rule == "category" { &rules.category } else { &rules.tag },
            &HashMap::from([
                ("id".to_string(), id.to_string()),
                ("slug".to_string(), taxonomy_slug(name, *id)),
            ]),
        )?;
        if !used.insert(url.clone()) {
            return Err(format!("路径冲突: {url}（{kind}「{name}」），请修改路由规则"));
        }
        let posts: Vec<serde_json::Value> = published_sorted
            .iter()
            .filter(|a| {
                (a.categories.iter().any(|c| c.id == *id) && *rule == "category")
                    || (a.tags.iter().any(|t| t.id == *id) && *rule == "tag")
            })
            .map(|a| {
                let word_count = a.content.chars().filter(|c| !c.is_whitespace()).count();
                let category_links: Vec<serde_json::Value> = a
                    .categories
                    .iter()
                    .map(|c| {
                        serde_json::json!({
                            "name": c.name,
                            "url": category_urls.get(&c.id).cloned().unwrap_or_default(),
                        })
                    })
                    .collect();
                let tag_links: Vec<serde_json::Value> = a
                    .tags
                    .iter()
                    .map(|t| {
                        serde_json::json!({
                            "name": t.name,
                            "url": tag_urls.get(&t.id).cloned().unwrap_or_default(),
                        })
                    })
                    .collect();
                serde_json::json!({
                    "title": a.title,
                    "url": post_urls.get(&a.id).cloned().unwrap_or_default(),
                    "date": a.created_at.get(0..10).unwrap_or(""),
                    "categories": category_links,
                    "tags": tag_links,
                    "wordCount": word_count,
                })
            })
            .collect();
        taxonomy_renders.push((
            url_to_rel_fs(&url)?,
            serde_json::json!({
                "taxonomy": { "kind": kind, "name": name },
                "posts": posts,
                // 列表页无分页：给默认值避免模板访问未定义变量
                "pagination": { "current": 1, "total": 1, "prevUrl": null, "nextUrl": null },
            }),
        ));
    }

    // ===== 首页分页 =====
    let total_pages = published_sorted.len().div_ceil(page_size).max(1);
    let page_url = |num: usize| -> Result<String, String> {
        if num <= 1 {
            Ok(rules.index.clone())
        } else {
            generate_path(
                &rules.index_pagination,
                &HashMap::from([("num".to_string(), num.to_string())]),
            )
        }
    };
    let mut index_renders: Vec<(String, serde_json::Value)> = Vec::new();
    for page_num in 1..=total_pages {
        let url = page_url(page_num)?;
        if !used.insert(url.clone()) {
            return Err(format!("路径冲突: {url}（首页第 {page_num} 页），请检查分页路由规则"));
        }
        let start = (page_num - 1) * page_size;
        let posts_slice: Vec<serde_json::Value> = posts_ctx
            .iter()
            .skip(start)
            .take(page_size)
            .cloned()
            .collect();
        let prev_url = if page_num > 1 { Some(page_url(page_num - 1)) } else { None };
        let next_url = if page_num < total_pages { Some(page_url(page_num + 1)) } else { None };
        index_renders.push((
            url_to_rel_fs(&url)?,
            serde_json::json!({
                "posts": posts_slice,
                "pagination": {
                    "current": page_num,
                    "total": total_pages,
                    "prevUrl": prev_url.transpose().ok().flatten(),
                    "nextUrl": next_url.transpose().ok().flatten(),
                },
            }),
        ));
    }

    // ===== RSS feed =====
    let mut feed = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\"><channel>",
    );
    feed.push_str(&format!(
        "<title>{}</title><link>{}</link><description>{}</description>",
        xml_escape(&site.name),
        xml_escape(base_url),
        xml_escape(site.description.as_deref().unwrap_or("")),
    ));
    for a in &published {
        let url = post_urls.get(&a.id).cloned().unwrap_or_default();
        let html = markdown_to_html(&a.content).0;
        let link = format!("{base_url}{url}");
        feed.push_str(&format!(
            "<item><title>{}</title><link>{}</link><guid>{}</guid><pubDate>{}</pubDate><description><![CDATA[{}]]></description></item>",
            xml_escape(&a.title),
            xml_escape(&link),
            xml_escape(&link),
            rfc2822_date(&a.created_at),
            html,
        ));
    }
    feed.push_str("</channel></rss>");
    let feed_rel = url_to_rel_fs(&rules.feed)?;

    let mut files = 0usize;

    // 文章详情
    for (rel, extra) in &post_renders {
        let html = render_page(&tera, "post.tera", &site_ctx, extra)?;
        files += write_file(dist, rel, &html)?;
    }

    // 独立页面
    for (rel, extra) in &page_renders {
        let html = render_page(&tera, "page.tera", &site_ctx, extra)?;
        files += write_file(dist, rel, &html)?;
    }

    // 首页（分页：第 1 页走 index 规则，第 2 页起走分页规则）
    for (rel, extra) in &index_renders {
        let html = render_page(&tera, "index.tera", &site_ctx, extra)?;
        files += write_file(dist, rel, &html)?;
    }

    // 分类/标签列表页
    for (rel, extra) in &taxonomy_renders {
        let html = render_page(&tera, "index.tera", &site_ctx, extra)?;
        files += write_file(dist, rel, &html)?;
    }

    // 归档
    let archive_ctx = serde_json::json!({
        "archive": archive_groups
            .iter()
            .map(|(year, posts)| serde_json::json!({ "year": year, "posts": posts }))
            .collect::<Vec<_>>(),
    });
    let html = render_page(&tera, "archive.tera", &site_ctx, &archive_ctx)?;
    files += write_file(dist, &url_to_rel_fs(&rules.archive)?, &html)?;

    // 分类/标签总览页（固定路径，导航入口）：每类一张，列出全部条目
    for (kind, rel) in [("分类", "/categories/"), ("标签", "/tags/")] {
        let is_cat = kind == "分类";
        let items_json: Vec<serde_json::Value> = if is_cat {
            categories
                .iter()
                .map(|c| {
                    let count = published_sorted
                        .iter()
                        .filter(|a| a.categories.iter().any(|x| x.id == c.id))
                        .count();
                    serde_json::json!({
                        "name": c.name,
                        "url": category_urls.get(&c.id).cloned().unwrap_or_default(),
                        "count": count,
                    })
                })
                .collect()
        } else {
            tags
                .iter()
                .map(|t| {
                    let count = published_sorted
                        .iter()
                        .filter(|a| a.tags.iter().any(|x| x.id == t.id))
                        .count();
                    serde_json::json!({
                        "name": t.name,
                        "url": tag_urls.get(&t.id).cloned().unwrap_or_default(),
                        "count": count,
                    })
                })
                .collect()
        };
        let ctx = serde_json::json!({
            "taxonomy": { "kind": kind },
            "items": items_json,
        });
        let html = render_page(&tera, "taxonomies.tera", &site_ctx, &ctx)?;
        files += write_file(dist, &url_to_rel_fs(rel)?, &html)?;
    }

    // RSS feed
    files += write_file(dist, &feed_rel, &feed)?;

    // 主题资源（取激活主题自己的 assets，不回退默认主题的资源）
    let assets = themes_dir.join(theme_name).join("assets");
    if assets.is_dir() {
        files += copy_dir_recursive(&assets, &dist.join("assets"))?;
    }

    // 站点媒体（文章里引用的 /media/xxx）
    if let Some(media_dir) = media_dir {
        if media_dir.is_dir() {
            files += copy_dir_recursive(media_dir, &dist.join("media"))?;
        }
    }

    Ok(RenderReport {
        theme: theme_name.to_string(),
        output_dir: dist.display().to_string(),
        files,
    })
}

// ===== 预览服务（单端口本地静态服务，仅 127.0.0.1） =====

fn mime_by_ext(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn handle_preview_conn(mut stream: TcpStream) {
    let root = match PREVIEW_DIR.read() {
        Ok(dir) => match dir.as_ref() {
            Some(dir) => dir.clone(),
            None => return,
        },
        Err(_) => return,
    };
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).unwrap_or(0);
    if n == 0 {
        return;
    }
    let request_line = String::from_utf8_lossy(&buf[..n]);
    let raw_path = request_line.split_whitespace().nth(1).unwrap_or("/");
    let path = raw_path.split('?').next().unwrap_or("/");
    let rel = path.trim_start_matches('/');
    if rel.contains("..") {
        return;
    }
    let full = root.join(rel);
    let full = if full.is_dir() {
        full.join("index.html")
    } else {
        full
    };
    let ok = full.is_file();
    let mut body = Vec::new();
    if ok {
        if let Ok(mut f) = fs::File::open(&full) {
            let _ = f.read_to_end(&mut body);
        }
    }
    let status_line = if ok { "200 OK" } else { "404 Not Found" };
    if body.is_empty() && !ok {
        body = b"<h1>404 Not Found</h1>".to_vec();
    }
    let head = format!(
        "HTTP/1.1 {status_line}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        mime_by_ext(&full),
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(&body);
    let _ = stream.flush();
}

/// 确保监听在指定端口；端口变更时先停旧监听（释放端口）再绑定新端口。
/// 绑定失败（端口被其他程序占用）返回错误，由前端提示更换。
fn ensure_preview_listener(port: u16) -> Result<(), String> {
    static RUNNING_PORT: AtomicU16 = AtomicU16::new(0);
    if RUNNING_PORT.load(Ordering::Relaxed) == port {
        return Ok(());
    }
    let mut guard = PREVIEW_LISTENER
        .lock()
        .map_err(|_| "预览服务状态异常".to_string())?;
    if RUNNING_PORT.load(Ordering::Relaxed) == port {
        return Ok(());
    }
    // 停旧监听：置停止位 + 取出 listener（drop 即释放端口）
    if let Some((old_listener, stop)) = guard.take() {
        stop.store(true, Ordering::Relaxed);
        let _ = old_listener.set_nonblocking(true);
        RUNNING_PORT.store(0, Ordering::Relaxed);
    }
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|_| format!("预览端口 {port} 被占用，请在设置中更换预览端口"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置监听失败: {e}"))?;
    let stop = Arc::new(AtomicBool::new(false));
    *guard = Some((listener, stop.clone()));
    RUNNING_PORT.store(port, Ordering::Relaxed);
    drop(guard);

    // accept 循环：非阻塞轮询，加锁只发生在单次 accept 内，
    // 端口更换时主线程才能拿到锁并移除监听
    std::thread::spawn(move || loop {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        let accepted = {
            let mut guard = match PREVIEW_LISTENER.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            match guard.as_mut() {
                Some((listener, _)) => listener.accept(),
                None => return,
            }
        };
        match accepted {
            Ok((stream, _)) => {
                std::thread::spawn(move || handle_preview_conn(stream));
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return,
        }
    });
    Ok(())
}

// ===== Tauri commands =====

/// 前端设置表单载荷：schema + 已解析值
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettingsPayload {
    pub schema: Vec<ThemeSetting>,
    pub values: serde_json::Map<String, serde_json::Value>,
}

#[tauri::command]
pub fn get_theme_settings_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
    name: String,
) -> Result<ThemeSettingsPayload, String> {
    let themes_dir = themes_root(&app)?;
    if !themes_dir.join(&name).join("theme.yaml").exists() {
        return Err(format!("主题不存在: {name}"));
    }
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    let schema = load_theme_settings(&themes_dir, &name);
    let values = resolve_theme_settings(
        &schema,
        get_setting(&conn, &theme_settings_key(site_id, &name))
            .map_err(|e| format!("读取主题设置失败: {e}"))?
            .as_deref(),
    );
    Ok(ThemeSettingsPayload { schema, values })
}

#[tauri::command]
pub fn set_theme_settings_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
    name: String,
    values: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    let themes_dir = themes_root(&app)?;
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    // 仅激活主题可修改设置（与 UI 入口一致，双保险）
    if get_active_theme_name(&conn, site_id)? != name {
        return Err("只有当前启用中的主题才能修改设置".into());
    }
    let schema = load_theme_settings(&themes_dir, &name);
    validate_theme_setting_values(&schema, &values)?;
    let json = serde_json::to_string(&values).map_err(|e| e.to_string())?;
    set_setting(&conn, &theme_settings_key(site_id, &name), &json)
        .map_err(|e| format!("保存主题设置失败: {e}"))
}

/// 编辑器实时预览用：单篇 markdown → HTML（同发布渲染引擎）
#[tauri::command]
pub fn markdown_to_html_cmd(markdown: String) -> Result<String, String> {
    Ok(markdown_to_html(&markdown).0)
}

/// 渲染单篇文章预览页：完整 HTML（内联主题样式与媒体图片，供 iframe srcDoc）
#[tauri::command]
pub fn preview_markdown_html_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
    markdown: String,
) -> Result<String, String> {
    let themes_dir = themes_root(&app)?;
    extract_builtin_theme(&themes_dir)?;
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    let active = get_active_theme_name(&conn, site_id)?;
    let rules = get_routing_rules(&conn, site_id)?;
    let site = get_site(&conn, site_id)?;
    let pages = get_pages_by_site(&conn, site_id)?;
    let theme_values = resolve_theme_settings(
        &load_theme_settings(&themes_dir, &active),
        get_setting(&conn, &theme_settings_key(site_id, &active))
            .map_err(|e| format!("读取主题设置失败: {e}"))?
            .as_deref(),
    );
    let theme_dir = themes_dir.join(&active);
    let mut tera = build_tera(&themes_dir, &active)?;
    tera.autoescape_on(vec![".html"]);
    let (content_html, word_count) = markdown_to_html(&markdown);
    let pages_ctx: Vec<serde_json::Value> = pages
        .iter()
        .filter(|p| p.show_in_nav)
        .map(|p| {
            Ok(serde_json::json!({
                "title": p.title,
                "url": generate_path(
                    &rules.page,
                    &HashMap::from([("slug".to_string(), p.slug.clone())]),
                )?,
                "showInNav": true,
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let site_ctx = serde_json::json!({
        "site": { "name": site.name, "description": site.description.clone().unwrap_or_default() },
        "urls": { "archive": rules.archive, "categories": "/categories/", "tags": "/tags/" },
        "pages": pages_ctx,
        "theme": theme_values,
        "post": { "title": "", "date": "", "contentHtml": content_html, "wordCount": word_count },
    });
    let html = render_page(&tera, "post.html", &site_ctx, &serde_json::json!({}))?;

    // srcDoc iframe 无站点根：主题样式内联、媒体图片内联为 data URL
    let css = fs::read_to_string(theme_dir.join("assets").join("style.css"))
        .unwrap_or_default();
    let mut out = html.replace(
        r#"<link rel="stylesheet" href="/assets/style.css">"#,
        &format!("<style>{css}</style>"),
    );
    let media_dir = media_root(&app)?.join(site_id.to_string());
    if let Ok(entries) = fs::read_dir(&media_dir) {
        use base64::Engine as _;
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let filename = entry.file_name().to_string_lossy().to_string();
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let mime = match ext.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "svg" => "image/svg+xml",
                _ => continue,
            };
            if let Ok(data) = fs::read(&path) {
                use base64::engine::general_purpose::STANDARD as BASE64;
                let data_url = format!("data:{mime};base64,{}", BASE64.encode(&data));
                out = out.replace(&format!("/media/{filename}"), &data_url);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn list_themes_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
) -> Result<Vec<ThemeMeta>, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    list_themes(&app, &conn, site_id)
}

#[tauri::command]
pub fn open_preview_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
    article_id: Option<i64>,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    let port = get_preview_port(&conn)?;
    // 传了文章 id：按路由规则计算该文章的预览路径
    let target = match article_id {
        Some(id) => {
            let a = crate::article::get_article(&conn, id)?;
            let rules = get_routing_rules(&conn, site_id)?;
            generate_path(&rules.post, &post_vars(&a))?
        }
        None => "index.html".to_string(),
    };
    drop(conn);
    let dist = preview_root(&app)?.join(site_id.to_string());
    let rel = url_to_rel_fs(&target)?;
    if !dist.join(&rel).is_file() {
        return Err("还没有生成预览，请先点击「生成预览」".into());
    }
    ensure_preview_listener(port)?;
    if let Ok(mut dir) = PREVIEW_DIR.write() {
        *dir = Some(dist);
    }
    let url = format!("http://127.0.0.1:{port}/{target}");
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("打开浏览器失败: {e}"))?;
    Ok(url)
}

#[tauri::command]
pub fn get_preview_port_cmd(db: State<Db>) -> Result<u16, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_preview_port(&conn)
}

#[tauri::command]
pub fn set_preview_port_cmd(db: State<Db>, port: u16) -> Result<(), String> {
    if !(1024..=65535).contains(&port) {
        return Err("端口需在 1024 - 65535 之间".into());
    }
    // 先试绑定（端口被占用时在此报错，由前端提示更换）
    ensure_preview_listener(port)?;
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    set_setting(&conn, PREVIEW_PORT_KEY, &port.to_string())
        .map_err(|e| format!("保存预览端口失败: {e}"))
}

#[tauri::command]
pub fn set_active_theme_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
    name: String,
) -> Result<(), String> {
    let themes_dir = themes_root(&app)?;
    if !themes_dir.join(&name).join("theme.yaml").exists() {
        return Err(format!("主题不存在: {name}"));
    }
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    set_active_theme_name(&conn, site_id, &name)
}

#[tauri::command]
pub fn open_themes_dir_cmd(app: AppHandle) -> Result<(), String> {
    let themes_dir = themes_root(&app)?;
    extract_builtin_theme(&themes_dir)?;
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(themes_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("打开主题目录失败: {e}"))
}

#[tauri::command]
pub fn delete_theme_cmd(app: AppHandle, db: State<Db>, name: String) -> Result<(), String> {
    if name == DEFAULT_THEME_NAME {
        return Err("内置默认主题不能删除".into());
    }
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    // 任一站点正在使用时拒绝删除
    let sites = crate::site::get_all_sites(&conn).map_err(|e| format!("查询站点失败: {e}"))?;
    for site in &sites {
        if get_active_theme_name(&conn, site.id)? == name {
            return Err(format!("主题正被站点「{}」使用，请先切换后再删除", site.name));
        }
    }
    let dir = themes_root(&app)?.join(&name);
    if dir.is_dir() {
        fs::remove_dir_all(&dir).map_err(|e| format!("删除主题失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn render_site_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
) -> Result<RenderReport, String> {
    let themes_dir = themes_root(&app)?;
    extract_builtin_theme(&themes_dir)?;
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    let active = get_active_theme_name(&conn, site_id)?;
    let port = get_preview_port(&conn)?;
    let base_url = format!("http://127.0.0.1:{port}");
    let dist = preview_root(&app)?.join(site_id.to_string());
    let media_dir = media_root(&app)?;
    let report = render_site_to(&conn, &dist, &themes_dir, &active, site_id, true, &base_url, Some(&media_dir))?;
    if let Ok(mut dir) = PREVIEW_DIR.write() {
        *dir = Some(dist);
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::article::{insert_article, update_article};
    use crate::db::run_migrations;
    use crate::pages::insert_page;
    use crate::routing::RoutingRules;
    use crate::site::insert_site;
    use crate::taxonomy::{insert_category, insert_tag};

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn builtin_update_overwrites_unmodified_and_keeps_user_edits() {
        let tmp = std::env::temp_dir().join(format!("wordma-theme-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let themes_dir = tmp.join("themes");

        // 首次落盘
        extract_builtin_theme(&themes_dir).unwrap();
        let base = themes_dir.join("default").join("templates").join("base.tera");
        let original = fs::read_to_string(&base).unwrap();

        // 用户修改 base.tera → 再次落盘应保留
        fs::write(&base, "用户自定义的模板").unwrap();
        extract_builtin_theme(&themes_dir).unwrap();
        assert_eq!(fs::read_to_string(&base).unwrap(), "用户自定义的模板");

        // 删除新模板文件（模拟老安装缺少新增文件）→ 补写
        let taxonomies = themes_dir.join("default").join("templates").join("taxonomies.tera");
        fs::remove_file(&taxonomies).unwrap();
        extract_builtin_theme(&themes_dir).unwrap();
        assert!(taxonomies.is_file());

        // 旧版 JSON 配置迁移：遗留 theme.json 被移除，theme.yaml 就位
        let legacy = themes_dir.join("default").join("theme.json");
        fs::write(&legacy, "{\"name\": \"default\"}").unwrap();
        extract_builtin_theme(&themes_dir).unwrap();
        assert!(!legacy.exists());
        assert!(themes_dir.join("default").join("theme.yaml").is_file());

        // manifest 记录被改回内置指纹（模拟"未被用户修改"）→ 内置内容覆盖
        let manifest_path = themes_dir.join("default").join(".builtin-manifest.json");
        let manifest = fs::read_to_string(&manifest_path).unwrap();
        let mut value: serde_json::Value = serde_json::from_str(&manifest).unwrap();
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update("用户自定义的模板".as_bytes());
        value["hashes"]["templates/base.tera"] =
            serde_json::Value::String(format!("{:x}", hasher.finalize()));
        fs::write(&manifest_path, serde_json::to_string(&value).unwrap()).unwrap();
        extract_builtin_theme(&themes_dir).unwrap();
        assert_eq!(fs::read_to_string(&base).unwrap(), original);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn settings_schema_parsing_fallbacks() {
        let tmp = std::env::temp_dir().join(format!("wordma-schema-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let theme_dir = tmp.join("t1");
        fs::create_dir_all(theme_dir.join("templates")).unwrap();
        fs::write(theme_dir.join("templates").join("index.tera"), "x").unwrap();

        // 无 settings → 空 schema
        fs::write(theme_dir.join("theme.yaml"), "name: t1\n").unwrap();
        assert!(load_theme_settings(&tmp, "t1").is_empty());

        // 缺 type → Text；未知 type → Text（serde other）；缺 default → Null
        fs::write(
            theme_dir.join("theme.yaml"),
            "name: t1\nsettings:\n  - key: a\n    label: A\n  - key: b\n    label: B\n    type: gallery\n  - key: c\n    label: C\n    type: text\n",
        )
        .unwrap();
        let schema = load_theme_settings(&tmp, "t1");
        assert_eq!(schema.len(), 3);
        assert_eq!(schema[0].r#type, ThemeSettingType::Text);
        assert_eq!(schema[1].r#type, ThemeSettingType::Text);
        assert_eq!(schema[2].default, serde_json::Value::Null);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn resolve_theme_settings_merge_and_fallback() {
        let schema = vec![
            ThemeSetting { key: "footerText".into(), label: "页脚".into(), r#type: ThemeSettingType::Text, default: serde_json::json!("由 Wordma 驱动"), options: vec![] },
            ThemeSetting { key: "postsPerPage".into(), label: "每页".into(), r#type: ThemeSettingType::Number, default: serde_json::json!(10), options: vec![] },
            ThemeSetting { key: "showTags".into(), label: "标签".into(), r#type: ThemeSettingType::Switch, default: serde_json::json!(true), options: vec![] },
            ThemeSetting { key: "style".into(), label: "风格".into(), r#type: ThemeSettingType::Select, default: serde_json::json!("简约"), options: vec!["简约".into(), "杂志".into()] },
        ];

        // 无存储值 → 全默认，键序 = 声明序
        let resolved = resolve_theme_settings(&schema, None);
        let keys: Vec<&String> = resolved.keys().collect();
        assert_eq!(keys, vec!["footerText", "postsPerPage", "showTags", "style"]);
        assert_eq!(resolved["postsPerPage"], serde_json::json!(10));

        // 类型宽松读：number 存字符串 → 回落默认；text 存数字 → 转字符串
        let stored = r#"{"postsPerPage":"5","footerText":123}"#;
        let resolved = resolve_theme_settings(&schema, Some(stored));
        assert_eq!(resolved["postsPerPage"], serde_json::json!(10));
        assert_eq!(resolved["footerText"], serde_json::json!("123"));

        // switch 存字符串 → 回落默认；select 越选项 → 回落默认；未知 key 忽略
        let stored = r#"{"showTags":"true","style":"不存在","unknown":1}"#;
        let resolved = resolve_theme_settings(&schema, Some(stored));
        assert_eq!(resolved["showTags"], serde_json::json!(true));
        assert_eq!(resolved["style"], serde_json::json!("简约"));

        // 存储损坏 → 全默认
        let resolved = resolve_theme_settings(&schema, Some("{broken"));
        assert_eq!(resolved["footerText"], serde_json::json!("由 Wordma 驱动"));
    }

    #[test]
    fn validate_theme_setting_values_rejects_bad_input() {
        let schema = vec![
            ThemeSetting { key: "postsPerPage".into(), label: "每页".into(), r#type: ThemeSettingType::Number, default: serde_json::json!(10), options: vec![] },
            ThemeSetting { key: "showTags".into(), label: "标签".into(), r#type: ThemeSettingType::Switch, default: serde_json::json!(true), options: vec![] },
        ];
        let mut values = HashMap::new();
        values.insert("unknown".to_string(), serde_json::json!(1));
        assert!(validate_theme_setting_values(&schema, &values).is_err());

        let mut values = HashMap::new();
        values.insert("postsPerPage".to_string(), serde_json::json!("50"));
        assert!(validate_theme_setting_values(&schema, &values).is_err());
        values.insert("postsPerPage".to_string(), serde_json::json!(0));
        assert!(validate_theme_setting_values(&schema, &values).is_err());
        values.insert("postsPerPage".to_string(), serde_json::json!(101));
        assert!(validate_theme_setting_values(&schema, &values).is_err());
        values.insert("postsPerPage".to_string(), serde_json::json!(3.5));
        assert!(validate_theme_setting_values(&schema, &values).is_err());

        values.insert("postsPerPage".to_string(), serde_json::json!(50));
        assert!(validate_theme_setting_values(&schema, &values).is_ok());

        let mut values = HashMap::new();
        values.insert("showTags".to_string(), serde_json::json!("true"));
        assert!(validate_theme_setting_values(&schema, &values).is_err());
    }

    #[test]
    fn render_site_applies_theme_settings() {
        let conn = mem_db();
        let site = insert_site(&conn, "分页站", None).unwrap();
        for i in 1..=11 {
            let art = insert_article(&conn, site.id, &format!("第{}篇", i)).unwrap();
            update_article(
                &conn,
                art.id,
                None,
                None,
                Some(STATUS_PUBLISHED),
                None,
                &[],
                &[],
            )
            .unwrap();
        }
        // 按站点×主题写入设置值（页脚文案 + 每页 3 篇）
        crate::site::set_setting(
            &conn,
            &format!("{}{}:default", THEME_SETTINGS_KEY_PREFIX, site.id),
            r#"{"footerText":"由 Wordma 测试驱动","postsPerPage":3}"#,
        )
        .unwrap();

        let tmp = std::env::temp_dir().join(format!("wordma-tsettings-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let themes_dir = tmp.join("themes");
        extract_builtin_theme(&themes_dir).unwrap();
        let dist = tmp.join("preview").join(site.id.to_string());

        render_site_to(
            &conn,
            &dist,
            &themes_dir,
            "default",
            site.id,
            false,
            "http://127.0.0.1:12739",
            None,
        )
        .unwrap();

        // 页脚使用自定义文案
        let index = fs::read_to_string(dist.join("index.html")).unwrap();
        assert!(index.contains("由 Wordma 测试驱动"));
        // 首页分页大小为 3：第 1 页是最新 3 篇（第11/10/9）
        assert!(index.contains("第11篇"));
        assert!(index.contains("第9篇"));
        assert!(!index.contains("第8篇"));
        // 第 2/4 页存在，第 4 页含最早的两篇
        let page2 = fs::read_to_string(dist.join("page").join("2").join("index.html")).unwrap();
        assert!(page2.contains("第8篇"));
        let page4 = fs::read_to_string(dist.join("page").join("4").join("index.html")).unwrap();
        assert!(page4.contains("第1篇"));

        // postsPerPage 越界（0）→ 回落默认每页 10 篇
        crate::site::set_setting(
            &conn,
            &format!("{}{}:default", THEME_SETTINGS_KEY_PREFIX, site.id),
            r#"{"postsPerPage":0}"#,
        )
        .unwrap();
        let _ = fs::remove_dir_all(&dist);
        render_site_to(
            &conn,
            &dist,
            &themes_dir,
            "default",
            site.id,
            false,
            "http://127.0.0.1:12739",
            None,
        )
        .unwrap();
        let index = fs::read_to_string(dist.join("index.html")).unwrap();
        assert!(index.contains("第10篇")); // 第 1 页 10 篇（第11..第2）
        assert!(!dist.join("page").join("3").join("index.html").exists());
        assert!(dist.join("page").join("2").join("index.html").is_file());

        // 无设置的站点 → 页脚回落默认文案
        let site2 = insert_site(&conn, "另一站", None).unwrap();
        let dist2 = tmp.join("preview").join(site2.id.to_string());
        render_site_to(
            &conn,
            &dist2,
            &themes_dir,
            "default",
            site2.id,
            false,
            "http://127.0.0.1:12739",
            None,
        )
        .unwrap();
        let index2 = fs::read_to_string(dist2.join("index.html")).unwrap();
        assert!(index2.contains("由 Wordma 驱动"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn render_site_writes_expected_files() {
        let conn = mem_db();
        let site = insert_site(&conn, "我的博客", Some("安静写作")).unwrap();
        let tag = insert_tag(&conn, site.id, "徒步").unwrap();
        let cat = insert_category(&conn, site.id, "户外").unwrap();
        let a = insert_article(&conn, site.id, "山中一日").unwrap();
        update_article(
            &conn,
            a.id,
            None,
            Some("## 山\n\n**出发**了。"),
            Some(STATUS_PUBLISHED),
            None,
            &[cat.id],
            &[tag.id],
        )
        .unwrap();
        let draft = insert_article(&conn, site.id, "草稿箱里的文章"); // 未发布
        let draft = draft.unwrap();
        let _ = insert_page(&conn, site.id, "关于我", "about").unwrap();

        let tmp = std::env::temp_dir().join(format!("wordma-render-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let themes_dir = tmp.join("themes");
        extract_builtin_theme(&themes_dir).unwrap();
        let dist = tmp.join("preview").join(site.id.to_string());

        let report = render_site_to(&conn, &dist, &themes_dir, "default", site.id, false, "http://127.0.0.1:12739", None).unwrap();
        assert!(report.files >= 5);

        // 首页：含发布文章与站点名，不含草稿；导航含独立页面
        let index = fs::read_to_string(dist.join("index.html")).unwrap();
        assert!(index.contains("山中一日"));
        assert!(index.contains("由 Wordma 驱动")); // 默认页脚文案
        assert!(index.contains("我的博客"));
        assert!(index.contains("关于我"));
        assert!(!index.contains("草稿箱里的文章"));

        // 文章页：markdown 已转 HTML，slug 路由生效，标签文本在列
        let post_path = dist.join("post").join(format!("{}.html", a.slug));
        let post_html = fs::read_to_string(post_path).unwrap();
        assert!(post_html.contains("<h2>山</h2>"));
        assert!(post_html.contains("<strong>出发</strong>"));
        assert!(post_html.contains("徒步"));

        // 独立页面按 page 规则输出
        let page_html = fs::read_to_string(dist.join("about.html")).unwrap();
        assert!(page_html.contains("关于我"));

        // 导航含分类/标签入口，总览页列出条目并可跳转
        assert!(index.contains("/categories/"));
        assert!(index.contains("/tags/"));
        let categories_page =
            fs::read_to_string(dist.join("categories").join("index.html")).unwrap();
        assert!(categories_page.contains("户外"));
        assert!(categories_page.contains("/category/1/"));
        let tags_page = fs::read_to_string(dist.join("tags").join("index.html")).unwrap();
        assert!(tags_page.contains("徒步"));
        assert!(tags_page.contains("/tag/1/"));

        // 归档与主题资源
        let archive =
            fs::read_to_string(dist.join("archive").join("index.html")).unwrap();
        assert!(archive.contains("山中一日"));
        assert!(dist.join("assets").join("style.css").is_file());

        // 预览模式渲染草稿详情页，但列表仍只显示已发布
        let dist2 = tmp.join("preview2");
        render_site_to(&conn, &dist2, &themes_dir, "default", site.id, true, "http://127.0.0.1:12739", None).unwrap();
        let draft_html =
            fs::read_to_string(dist2.join("post").join(format!("{}.html", draft.slug)))
                .unwrap();
        assert!(draft_html.contains("草稿箱里的文章"));
        let index2 = fs::read_to_string(dist2.join("index.html")).unwrap();
        assert!(!index2.contains("草稿箱里的文章"));

        // 路由规则导致路径冲突时整体失败：两篇同月发布的文章使用同一路径
        let b = insert_article(&conn, site.id, "第二篇").unwrap();
        update_article(&conn, b.id, None, None, Some(STATUS_PUBLISHED), None, &[], &[])
            .unwrap();
        let rules = RoutingRules { post: "/[year]/[month].html".into(), ..Default::default() };
        crate::routing::set_routing_rules(&conn, site.id, &rules).unwrap();
        let err = render_site_to(&conn, &dist, &themes_dir, "default", site.id, false, "http://127.0.0.1:12739", None).unwrap_err();
        assert!(err.contains("路径冲突"));

        let _ = fs::remove_dir_all(&tmp);
    }
}
