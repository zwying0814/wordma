/** 字数统计：剥除空白后的非空白字符数（与 Rust 版口径一致） */
export function countWords(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** 文章正文字数：先剥 HTML 标签（文章以 HTML 存储），再按同一口径计数 */
export function countWordsInHtml(html: string): number {
  return countWords(html.replace(/<[^>]*>/g, ''));
}
