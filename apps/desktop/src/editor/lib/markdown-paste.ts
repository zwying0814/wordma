const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s+/m,
  /^\s*[-*+]\s+/m,
  /^\s*\d+\.\s+/m,
  /^\s*>\s+/m,
  /\*\*.+?\*\*/,
  /\*[^*]+\*/,
  /`[^`]+`/,
  /^```/m,
  /^\s*---\s*$/m,
  /\[.+?\]\(.+?\)/,
  /!\[.*?\]\(.+?\)/,
];

export function looksLikeMarkdown(text: string): boolean {
  let matches = 0;
  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(text) && ++matches >= 2) return true;
  }
  return (
    /!\[.*?\]\(.+?\)/.test(text) ||
    /^```/m.test(text) ||
    /^\s*---\s*$/m.test(text)
  );
}

/** 管道行之间的空行会破坏表格解析，粘贴前清掉 */
export function fixMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isRow = trimmed.startsWith("|") && trimmed.endsWith("|");
    if (trimmed === "" && inTable) continue;
    if (isRow) inTable = true;
    else inTable = false;
    result.push(line);
  }
  return result.join("\n");
}
