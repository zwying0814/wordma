/** 字数统计：剥除 HTML 标签后非空白字符数（与 Rust 版口径一致） */
export function countWords(text: string): number {
  return text.replace(/\s/g, '').length;
}
