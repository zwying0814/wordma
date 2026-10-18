import { all, get, run } from './db';
import { getCurrentSiteId } from './site';

/**
 * 单站点库：tags/categories 天然属于当前站点，不再有 site_id 列。
 * Tag/Category.siteId 仅在返回给渲染层时来自登记表（getCurrentSiteId）。
 */
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

export function listTags(): Tag[] {
  return all<TaxonomyRow>(
    `SELECT t.*, (SELECT COUNT(*) FROM article_tags at2 WHERE at2.tag_id = t.id) AS article_count
     FROM tags t ORDER BY t.created_at, t.id`
  ).map(toTaxonomy);
}

export function listCategories(): Category[] {
  return all<TaxonomyRow>(
    `SELECT c.*, (SELECT COUNT(*) FROM article_categories ac WHERE ac.category_id = c.id) AS article_count
     FROM categories c ORDER BY c.created_at, c.id`
  ).map(toTaxonomy);
}

function toTaxonomy(row: TaxonomyRow): Tag {
  return {
    id: row.id,
    siteId: getCurrentSiteId(),
    name: row.name,
    createdAt: row.created_at,
    articleCount: row.article_count,
  };
}

/** 创建标签。重名时复用已有行（对齐 Rust 版语义）。 */
export function createTag(payload: { name: string }): Tag {
  validateName(payload.name, '标签');

  const existing = get<TaxonomyRow>(
    'SELECT * FROM tags WHERE name = ?',
    payload.name
  );
  if (existing) return toTaxonomy(existing);

  const { lastInsertRowid } = run(
    'INSERT INTO tags (name) VALUES (?)',
    payload.name
  );
  return getTag(lastInsertRowid);
}

/** 创建分类。重名时复用已有行。 */
export function createCategory(payload: { name: string }): Category {
  validateName(payload.name, '分类');

  const existing = get<TaxonomyRow>(
    'SELECT * FROM categories WHERE name = ?',
    payload.name
  );
  if (existing) return toTaxonomy(existing);

  const { lastInsertRowid } = run(
    'INSERT INTO categories (name) VALUES (?)',
    payload.name
  );
  return getCategory(lastInsertRowid);
}

export function renameTag(payload: { id: number; name: string }): Tag {
  validateName(payload.name, '标签');
  const existing = get<TaxonomyRow>('SELECT * FROM tags WHERE id = ?', payload.id);
  if (!existing) throw new Error('标签不存在');

  const conflict = get<TaxonomyRow>(
    'SELECT * FROM tags WHERE name = ? AND id != ?',
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
    'SELECT * FROM categories WHERE name = ? AND id != ?',
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
