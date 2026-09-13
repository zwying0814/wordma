//! wordma-slug：把「标题 → URL/文件名友好 slug」的逻辑编译成 WebAssembly，
//! 供前端（`apps/desktop`）直接 import 调用，**不再依赖 Tauri 后端命令**。
//!
//! 实现与 `apps/desktop/src-tauri/src/article/commands.rs::article_slugify` 保持同源：
//!   1. `pinyin-converter` 做词典最长匹配分词 → 转拼音 → 去声调（ü→v）→ 去标点 → `-` 连接；
//!   2. `rslug` 做小写化、清理、以及截断到 128 字符。
//!
//! 例：
//! - `我的第一篇文章`  → `wo-de-di-yi-pian-wen-zhang`
//! - `你好世界 & Rust` → `ni-hao-shi-jie-rust`
//! - `Hello World!`    → `hello-world`

use rslug::Slugifier;

// 包名 `pinyin-converter`，但库 target 名为 `pinyin`（见该包 Cargo.toml 的 `[lib] name`）
use pinyin::Pinyin;

use wasm_bindgen::prelude::*;

/// slug（即文件名）最大长度，与前端 `MAX_ARTICLE_NAME_LENGTH` / 后端 `MAX_NAME_LENGTH` 一致。
const MAX_NAME_LENGTH: usize = 128;

/// 核心逻辑：与平台无关，便于原生单测。
///
/// 先经 `Pinyin::permalink` 把汉字转成以 `-` 连接的拼音、并清理标点；
/// 再交给 `rslug` 统一小写化 / 折叠 / 截断，产出可直接作文件名的 ASCII 串。
pub fn slugify_impl(input: &str) -> String {
    let transliterated = Pinyin::permalink(input.trim());
    Slugifier::new()
        .truncate(MAX_NAME_LENGTH)
        .slugify(&transliterated)
}

/// 由标题生成 slug（导出给 JavaScript）。
///
/// 入参：任意标题字符串（可含中文、英文、符号）。
/// 返回：ASCII、小写、以 `-` 分隔的文件名安全 slug。
#[wasm_bindgen]
pub fn slugify(input: &str) -> String {
    slugify_impl(input)
}

/// 库版本号，便于前端排查 wasm 产物版本。
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::slugify_impl;

    #[test]
    fn chinese_title_to_pinyin_slug() {
        assert_eq!(slugify_impl("我的第一篇文章"), "wo-de-di-yi-pian-wen-zhang");
    }

    #[test]
    fn mixed_cjk_and_latin() {
        assert_eq!(slugify_impl("你好世界 & Rust"), "ni-hao-shi-jie-rust");
    }

    #[test]
    fn latin_and_symbols() {
        assert_eq!(slugify_impl("Hello World!"), "hello-world");
    }

    #[test]
    fn trims_and_collapses() {
        assert_eq!(slugify_impl("   多   空格   "), "duo-kong-ge");
    }
}
