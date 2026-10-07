/** 文章字数：忽略空白字符后的字符数（中文场景够用，Markdown 符号暂不剔除） */
export function countWords(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/** ISO 时间串取日期部分，如 2026-10-04T... -> 2026-10-04 */
export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** HTML 内容的字数：剥掉标签后统计非空白字符数 */
export function countWordsHtml(html: string): number {
  return countWords(html.replace(/<[^>]*>/g, " "));
}
