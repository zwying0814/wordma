const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const SLUG_MAX = 80;
// 段非空、无首尾连字符的小写字母/数字/连字符组合（与服务端一致）
const SLUG_RE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** 生成 8 位随机小写字母 slug（与服务端同款） */
export function generateSlug(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return out;
}

export function isValidSlug(slug: string): boolean {
  return slug.length <= SLUG_MAX && SLUG_RE.test(slug);
}
