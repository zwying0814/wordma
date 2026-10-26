use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const MAX_NOTE_BYTES: u64 = 8 * 1024 * 1024;
static WRITE_LOCK: Mutex<()> = Mutex::new(());
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl WorkspaceError {
    fn new(
        code: &str,
        message: impl Into<String>,
        path: Option<&str>,
    ) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            path: path.map(str::to_owned),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReadResult {
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCreateResult {
    pub path: String,
}

fn invalid_path(path: &str, message: &str) -> WorkspaceError {
    WorkspaceError::new("INVALID_PATH", message, Some(path))
}

fn canonical_root(root: &str) -> Result<PathBuf, WorkspaceError> {
    let canonical = dunce::canonicalize(root).map_err(|_| {
        WorkspaceError::new(
            "INVALID_ROOT",
            format!("工作区不存在或无法访问：{root}"),
            Some(root),
        )
    })?;

    if !canonical.is_dir() {
        return Err(WorkspaceError::new(
            "INVALID_ROOT",
            format!("工作区不是目录：{root}"),
            Some(root),
        ));
    }

    Ok(canonical)
}

fn canonical_content(root: &Path) -> Result<PathBuf, WorkspaceError> {
    let content = root.join("content");

    dunce::canonicalize(&content).map_err(|_| {
        WorkspaceError::new(
            "MISSING_CONTENT_DIR",
            "工作区缺少 content 目录",
            Some("content"),
        )
    })
}

fn relative_note_path(
    root: &Path,
    content: &Path,
    relative: &str,
) -> Result<PathBuf, WorkspaceError> {
    if relative.is_empty() {
        return Err(invalid_path(relative, "路径不能为空"));
    }
    if relative.contains('\0') {
        return Err(invalid_path(relative, "路径包含非法字符"));
    }

    let path = Path::new(relative);
    if path.is_absolute() {
        return Err(invalid_path(relative, "不允许绝对路径"));
    }

    for component in path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(invalid_path(
                relative,
                "路径不能包含 ..、根目录或系统前缀",
            ));
        }
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension != "md" && extension != "mdx" {
        return Err(WorkspaceError::new(
            "NOT_A_NOTE",
            "只能操作 .md / .mdx 笔记",
            Some(relative),
        ));
    }

    let candidate = root.join(path);

    if !candidate.starts_with(content) {
        return Err(WorkspaceError::new(
            "UNSAFE_PATH",
            "路径必须位于 content 目录内",
            Some(relative),
        ));
    }

    Ok(candidate)
}

fn resolve_existing_note(
    root: &Path,
    relative: &str,
) -> Result<PathBuf, WorkspaceError> {
    let content = canonical_content(root)?;
    let candidate = relative_note_path(root, &content, relative)?;
    let link_metadata = fs::symlink_metadata(&candidate).map_err(|_| {
        WorkspaceError::new(
            "NOT_FOUND",
            "笔记不存在",
            Some(relative),
        )
    })?;

    if link_metadata.file_type().is_symlink() {
        return Err(WorkspaceError::new(
            "UNSAFE_PATH",
            "不允许操作符号链接",
            Some(relative),
        ));
    }

    let canonical = dunce::canonicalize(&candidate).map_err(|_| {
        WorkspaceError::new(
            "NOT_FOUND",
            "笔记不存在",
            Some(relative),
        )
    })?;

    if !canonical.starts_with(&content) || !canonical.is_file() {
        return Err(WorkspaceError::new(
            "UNSAFE_PATH",
            "笔记路径不在 content 内",
            Some(relative),
        ));
    }

    Ok(canonical)
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

fn write_atomic(
    target: &Path,
    content: &str,
) -> Result<(), WorkspaceError> {
    let _guard = WRITE_LOCK.lock().map_err(|_| {
        WorkspaceError::new(
            "WRITE_FAILED",
            "写入锁失败",
            target.to_str(),
        )
    })?;
    let parent = target.parent().ok_or_else(|| {
        WorkspaceError::new(
            "INVALID_PATH",
            "笔记路径无效",
            target.to_str(),
        )
    })?;
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("note");
    let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp = parent.join(format!(
        ".{file_name}.wordma-{}-{}-{}.tmp",
        std::process::id(),
        now_nanos(),
        sequence
    ));

    fs::write(&temp, content).map_err(|error| {
        WorkspaceError::new(
            "WRITE_FAILED",
            format!("写入笔记失败：{error}"),
            target.to_str(),
        )
    })?;

    #[cfg(windows)]
    if target.exists() {
        fs::remove_file(target).map_err(|error| {
            let _ = fs::remove_file(&temp);
            WorkspaceError::new(
                "WRITE_FAILED",
                format!("替换笔记失败：{error}"),
                target.to_str(),
            )
        })?;
    }

    if let Err(error) = fs::rename(&temp, target) {
        let _ = fs::remove_file(&temp);
        return Err(WorkspaceError::new(
            "WRITE_FAILED",
            format!("保存笔记失败：{error}"),
            target.to_str(),
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn workspace_read(
    root: String,
    path: String,
) -> Result<WorkspaceReadResult, WorkspaceError> {
    let root = canonical_root(&root)?;
    let note = resolve_existing_note(&root, &path)?;
    let metadata = fs::metadata(&note).map_err(|_| {
        WorkspaceError::new("NOT_FOUND", "笔记不存在", Some(&path))
    })?;

    if metadata.len() > MAX_NOTE_BYTES {
        return Err(WorkspaceError::new(
            "TOO_LARGE",
            "笔记超过 8MB，无法打开",
            Some(&path),
        ));
    }

    let content = fs::read_to_string(&note).map_err(|error| {
        WorkspaceError::new(
            "INVALID_ENCODING",
            format!("笔记不是有效 UTF-8：{error}"),
            Some(&path),
        )
    })?;

    Ok(WorkspaceReadResult { content })
}

#[tauri::command]
pub fn workspace_write(
    root: String,
    path: String,
    content: String,
) -> Result<(), WorkspaceError> {
    let root = canonical_root(&root)?;
    let note = resolve_existing_note(&root, &path)?;

    if content.len() as u64 > MAX_NOTE_BYTES {
        return Err(WorkspaceError::new(
            "TOO_LARGE",
            "笔记超过 8MB，无法保存",
            Some(&path),
        ));
    }

    write_atomic(&note, &content)
}

fn validate_segment(
    value: &str,
    label: &str,
) -> Result<(), WorkspaceError> {
    if value.is_empty() {
        return Err(WorkspaceError::new(
            "INVALID_SEGMENT",
            format!("{label}不能为空"),
            Some(value),
        ));
    }

    if value.len() > 120 {
        return Err(WorkspaceError::new(
            "INVALID_SEGMENT",
            format!("{label}过长"),
            Some(value),
        ));
    }

    if value.chars().any(|character| {
        character.is_control()
            || matches!(
                character,
                '/' | '\\'
                    | ':'
                    | '*'
                    | '?'
                    | '"'
                    | '<'
                    | '>'
                    | '|'
            )
    }) {
        return Err(WorkspaceError::new(
            "INVALID_SEGMENT",
            format!("{label}包含非法字符"),
            Some(value),
        ));
    }

    if value.starts_with('.')
        || value.ends_with('.')
        || value.ends_with(' ')
        || value == ".."
    {
        return Err(WorkspaceError::new(
            "INVALID_SEGMENT",
            format!("{label}不能以点开头/结尾或包含尾随空格"),
            Some(value),
        ));
    }

    Ok(())
}

fn validate_collection(collection: &str) -> Result<(), WorkspaceError> {
    let mut characters = collection.chars();
    let first = characters.next();

    if !matches!(first, Some(value) if value.is_ascii_lowercase()) {
        return Err(WorkspaceError::new(
            "INVALID_COLLECTION",
            "collection 必须以小写字母开头",
            Some(collection),
        ));
    }

    if !characters.all(|character| {
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || character == '_'
            || character == '-'
    }) {
        return Err(WorkspaceError::new(
            "INVALID_COLLECTION",
            "collection 只能包含小写字母、数字、_ 和 -",
            Some(collection),
        ));
    }

    Ok(())
}

fn validate_slug(slug: &str) -> Result<(), WorkspaceError> {
    validate_segment(slug, "slug")?;

    let lower = slug.to_ascii_lowercase();
    if lower.ends_with(".md") || lower.ends_with(".mdx") {
        return Err(WorkspaceError::new(
            "INVALID_SLUG",
            "slug 不需要包含 .md/.mdx 扩展名",
            Some(slug),
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn workspace_create_note(
    root: String,
    collection: String,
    slug: String,
    title: String,
    page_type: Option<String>,
) -> Result<WorkspaceCreateResult, WorkspaceError> {
    let root = canonical_root(&root)?;
    let content = canonical_content(&root)?;

    validate_collection(&collection)?;
    validate_slug(&slug)?;

    let title = title.trim();
    if title.is_empty() {
        return Err(WorkspaceError::new(
            "INVALID_TITLE",
            "标题不能为空",
            None,
        ));
    }
    if title.chars().count() > 200 {
        return Err(WorkspaceError::new(
            "INVALID_TITLE",
            "标题不能超过 200 个字符",
            None,
        ));
    }
    if title.chars().any(char::is_control) {
        return Err(WorkspaceError::new(
            "INVALID_TITLE",
            "标题不能包含换行或控制字符",
            None,
        ));
    }

    if let Some(page_type) = &page_type {
        let mut characters = page_type.chars();
        let first = characters.next();
        if !matches!(first, Some(value) if value.is_ascii_lowercase()) {
            return Err(WorkspaceError::new(
                "INVALID_PAGE_TYPE",
                "pageType 必须以小写字母开头",
                Some(page_type),
            ));
        }
        if !characters.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '-'
        }) {
            return Err(WorkspaceError::new(
                "INVALID_PAGE_TYPE",
                "pageType 只能包含小写字母、数字和 -",
                Some(page_type),
            ));
        }
    }

    let collection_dir = content.join(&collection);
    let canonical_collection = dunce::canonicalize(&collection_dir)
        .map_err(|_| {
            WorkspaceError::new(
                "MISSING_COLLECTION",
                format!("collection 不存在：{collection}"),
                Some(&collection),
            )
        })?;

    if !canonical_collection.starts_with(&content)
        || !canonical_collection.is_dir()
    {
        return Err(WorkspaceError::new(
            "MISSING_COLLECTION",
            format!("collection 不存在：{collection}"),
            Some(&collection),
        ));
    }

    let file_name = format!("{slug}.mdx");
    let target = canonical_collection.join(&file_name);

    if target.exists() {
        return Err(WorkspaceError::new(
            "ALREADY_EXISTS",
            format!("笔记已存在：{file_name}"),
            target.to_str(),
        ));
    }

    let relative = target
        .strip_prefix(&root)
        .map_err(|_| {
            WorkspaceError::new(
                "UNSAFE_PATH",
                "笔记路径不在工作区",
                target.to_str(),
            )
        })?
        .to_string_lossy()
        .replace('\\', "/");

    let title_yaml = serde_json::to_string(title)
        .map_err(|error| {
            WorkspaceError::new(
                "INVALID_TITLE",
                format!("标题序列化失败：{error}"),
                None,
            )
        })?;
    let frontmatter = match &page_type {
        Some(value) => format!(
            "---\ntitle: {title_yaml}\ntype: {value}\n---\n\n# {title}\n"
        ),
        None => format!(
            "---\ntitle: {title_yaml}\n---\n\n# {title}\n"
        ),
    };

    write_atomic(&target, &frontmatter)?;

    Ok(WorkspaceCreateResult {
        path: relative,
    })
}

#[tauri::command]
pub fn workspace_delete_note(
    root: String,
    path: String,
) -> Result<(), WorkspaceError> {
    let root = canonical_root(&root)?;
    let note = resolve_existing_note(&root, &path)?;

    fs::remove_file(&note).map_err(|error| {
        WorkspaceError::new(
            "DELETE_FAILED",
            format!("删除笔记失败：{error}"),
            Some(&path),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    fn make_root() -> tempfile::TempDir {
        let root = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("content/posts"))
            .expect("content");
        fs::create_dir_all(root.path().join("content/pages"))
            .expect("pages");
        root
    }

    fn root_string(root: &tempfile::TempDir) -> String {
        root.path().to_string_lossy().into_owned()
    }

    #[test]
    fn read_write_roundtrip_is_atomic() {
        let root = make_root();
        let path = root.path().join("content/posts/a.mdx");
        fs::write(&path, "old").unwrap();

        workspace_write(
            root_string(&root),
            "content/posts/a.mdx".to_string(),
            "new content".to_string(),
        )
        .expect("write");

        let read = workspace_read(
            root_string(&root),
            "content/posts/a.mdx".to_string(),
        )
        .expect("read");

        assert_eq!(read.content, "new content");
        assert!(
            fs::read_dir(root.path().join("content/posts"))
                .unwrap()
                .all(|entry| !entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .contains(".wordma-"))
        );
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        let root = make_root();

        for path in [
            "../outside.mdx",
            "content/../../outside.mdx",
            "/tmp/outside.mdx",
        ] {
            let error = workspace_read(
                root_string(&root),
                path.to_string(),
            )
            .expect_err("path should fail");
            assert_eq!(error.code, "INVALID_PATH");
        }
    }

    #[test]
    fn rejects_non_note_and_missing_files() {
        let root = make_root();
        fs::write(
            root.path().join("content/posts/raw.txt"),
            "x",
        )
        .unwrap();

        let error = workspace_read(
            root_string(&root),
            "content/posts/raw.txt".to_string(),
        )
        .expect_err("non note");
        assert_eq!(error.code, "NOT_A_NOTE");

        let error = workspace_read(
            root_string(&root),
            "content/posts/missing.mdx".to_string(),
        )
        .expect_err("missing");
        assert_eq!(error.code, "NOT_FOUND");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let root = make_root();
        let outside = tempfile::tempdir().expect("outside");
        let outside_file = outside.path().join("secret.mdx");
        fs::write(&outside_file, "secret").unwrap();
        symlink(
            &outside_file,
            root.path().join("content/posts/leak.mdx"),
        )
        .unwrap();

        let error = workspace_read(
            root_string(&root),
            "content/posts/leak.mdx".to_string(),
        )
        .expect_err("symlink");
        assert_eq!(error.code, "UNSAFE_PATH");
    }

    #[test]
    fn creates_and_deletes_note() {
        let root = make_root();

        let created = workspace_create_note(
            root_string(&root),
            "posts".to_string(),
            "hello".to_string(),
            "Hello: World".to_string(),
            Some("project".to_string()),
        )
        .expect("create");

        assert_eq!(created.path, "content/posts/hello.mdx");
        let source = fs::read_to_string(
            root.path().join("content/posts/hello.mdx"),
        )
        .unwrap();
        assert!(source.contains("title: \"Hello: World\""));
        assert!(source.contains("type: project"));

        let duplicate = workspace_create_note(
            root_string(&root),
            "posts".to_string(),
            "hello".to_string(),
            "Hello".to_string(),
            None,
        )
        .expect_err("duplicate");
        assert_eq!(duplicate.code, "ALREADY_EXISTS");

        workspace_delete_note(
            root_string(&root),
            created.path.clone(),
        )
        .expect("delete");
        assert!(
            !root
                .path()
                .join("content/posts/hello.mdx")
                .exists()
        );
    }

    #[test]
    fn rejects_invalid_collection_slug_and_title() {
        let root = make_root();

        let error = workspace_create_note(
            root_string(&root),
            "../posts".to_string(),
            "hello".to_string(),
            "Hello".to_string(),
            None,
        )
        .expect_err("collection");
        assert_eq!(error.code, "INVALID_COLLECTION");

        let error = workspace_create_note(
            root_string(&root),
            "posts".to_string(),
            "../hello".to_string(),
            "Hello".to_string(),
            None,
        )
        .expect_err("slug");
        assert_eq!(error.code, "INVALID_SEGMENT");

        let error = workspace_create_note(
            root_string(&root),
            "posts".to_string(),
            "hello".to_string(),
            "   ".to_string(),
            None,
        )
        .expect_err("title");
        assert_eq!(error.code, "INVALID_TITLE");

        let error = workspace_create_note(
            root_string(&root),
            "missing".to_string(),
            "hello".to_string(),
            "Hello".to_string(),
            None,
        )
        .expect_err("collection missing");
        assert_eq!(error.code, "MISSING_COLLECTION");
    }

    #[test]
    fn concurrent_writes_leave_one_complete_payload() {
        let root = make_root();
        let target = root.path().join("content/posts/a.mdx");
        fs::write(&target, "base").unwrap();
        fs::write(&target, "base").unwrap();

        let payloads = (0..8)
            .map(|index| {
                format!("payload-{index}-{}", "x".repeat(64 * 1024))
            })
            .collect::<Vec<_>>();
        let target = Arc::new(target);
        let payloads = Arc::new(payloads);

        let handles = (0..8)
            .map(|index| {
                let target = Arc::clone(&target);
                let payloads = Arc::clone(&payloads);
                thread::spawn(move || {
                    write_atomic(
                        &target,
                        &payloads[index],
                    )
                    .expect("write");
                })
            })
            .collect::<Vec<_>>();

        for handle in handles {
            handle.join().expect("join");
        }

        let content = fs::read_to_string(&*target).unwrap();
        assert!(payloads.iter().any(|item| item == &content));
    }
}
