import { all, get, run } from './db';

export type Tag = {
  id: number;
  siteId: number;
  name: string;
  createdAt: string;
  articleCount: number;
};

export type Category = Tag;

type TaxonomyRow = {
  id: number;
  site_id: number;
  name: string;
  created_at: string;
  article_count: number;
};

const NAME_MAX = 20;

function validateName(name: string, kind: '标签' | '分类'): void {
  if (!name || name.trim().length === 0) {
    throw new Error(`${kind}名称不能为空`);
  }
  if (name.length > NAME_MAX) {
    throw new Error(`${kind}名称不能超过 ${NAME_MAX} 个字符`);
  }
}

function assertSiteExists(siteId: number): void {
  const site = get<{ id: number }>('SELECT id FROM sites WHERE id = ?', siteId);
  if (!site) throw new Error('站点不存在');
}

export function listTags(siteId: number): Tag[] {
  return all<TaxonomyRow>(
    `SELECT t.*, (SELECT COUNT(*) FROM article_tags at2 WHERE at2.tag_id = t.id) AS article_count
     FROM tags t WHERE t.site_id = ? ORDER BY t.created_at, t.id`,
    siteId
  ).map(toTaxonomy);
}

export function listCategories(siteId: number): Category[] {
  return all<TaxonomyRow>(
    `SELECT c.*, (SELECT COUNT(*) FROM article_categories ac WHERE ac.category_id = c.id) AS article_count
     FROM categories c WHERE c.site_id = ? ORDER BY c.created_at, c.id`,
    siteId
  ).map(toTaxonomy);
}

function toTaxonomy(row: TaxonomyRow): Tag {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    createdAt: row.created_at,
    articleCount: row.article_count,
  };
}

/** 创建标签。重名时复用已有行（对齐 Rust 版语义）。 */
export function createTag(payload: { siteId: number; name: string }): Tag {
  validateName(payload.name, '标签');
  assertSiteExists(payload.siteId);

  const existing = get<TaxonomyRow>(
    'SELECT * FROM tags WHERE site_id = ? AND name = ?',
    payload.siteId,
    payload.name
  );
  if (existing) return toTaxonomy(existing);

  const { lastInsertRowid } = run(
    'INSERT INTO tags (site_id, name) VALUES (?, ?)',
    payload.siteId,
    payload.name
  );
  return getTag(lastInsertRowid);
}

/** 创建分类。重名时复用已有行。 */
export function createCategory(payload: { siteId: number; name: string }): Category {
  validateName(payload.name, '分类');
  assertSiteExists(payload.siteId);

  const existing = get<TaxonomyRow>(
    'SELECT * FROM categories WHERE site_id = ? AND name = ?',
    payload.siteId,
    payload.name
  );
  if (existing) return toTaxonomy(existing);

  const { lastInsertRowid } = run(
    'INSERT INTO categories (site_id, name) VALUES (?, ?)',
    payload.siteId,
    payload.name
  );
  return getCategory(lastInsertRowid);
}

export function renameTag(payload: { id: number; name: string }): Tag {
  validateName(payload.name, '标签');
  const existing = get<TaxonomyRow>('SELECT * FROM tags WHERE id = ?', payload.id);
  if (!existing) throw new Error('标签不存在');

  const conflict = get<TaxonomyRow>(
    'SELECT * FROM tags WHERE site_id = ? AND name = ? AND id != ?',
    existing.site_id,
    payload.name,
    payload.id
  );
  if (conflict) throw new Error('标签名称已存在');

  run('UPDATE tags SET name = ? WHERE id = ?', payload.name, payload.id);
  return getTag(payload.id);
}

export function renameCategory(payload: { id: number; name: string }): Category {
  validateName(payload.name, '分类');
  const existing = get<TaxonomyRow>('SELECT * FROM categories WHERE id = ?', payload.id);
  if (!existing) throw new Error('分类不存在');

  const conflict = get<TaxonomyRow>(
    'SELECT * FROM categories WHERE site_id = ? AND name = ? AND id != ?',
    existing.site_id,
    payload.name,
    payload.id
  );
  if (conflict) throw new Error('分类名称已存在');

  run('UPDATE categories SET name = ? WHERE id = ?', payload.name, payload.id);
  return getCategory(payload.id);
}

export function deleteTag(id: number): void {
  const result = run('DELETE FROM tags WHERE id = ?', id);
  if (result.changes === 0) throw new Error('标签不存在');
}

export function deleteCategory(id: number): void {
  const result = run('DELETE FROM categories WHERE id = ?', id);
  if (result.changes === 0) throw new Error('分类不存在');
}

function getTag(id: number): Tag {
  const row = get<TaxonomyRow>(
    `SELECT t.*, (SELECT COUNT(*) FROM article_tags at2 WHERE at2.tag_id = t.id) AS article_count
     FROM tags t WHERE t.id = ?`,
    id
  );
  if (!row) throw new Error('标签不存在');
  return toTaxonomy(row);
}

function getCategory(id: number): Category {
  const row = get<TaxonomyRow>(
    `SELECT c.*, (SELECT COUNT(*) FROM article_categories ac WHERE ac.category_id = c.id) AS article_count
     FROM categories c WHERE c.id = ?`,
    id
  );
  if (!row) throw new Error('分类不存在');
  return toTaxonomy(row);
}
