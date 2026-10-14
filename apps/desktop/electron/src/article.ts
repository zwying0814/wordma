import { all, get, run, tx } from './db';

export type ArticleRef = { id: number; name: string };

export type Article = {
  id: number;
  siteId: number;
  slug: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  categories: ArticleRef[];
  tags: ArticleRef[];
  createdAt: string;
  updatedAt: string;
};

type ArticleRow = {
  id: number;
  site_id: number;
  slug: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
};

type RefRow = { id: number; name: string };

const SLUG_MAX = 80;
// 段非空、无首尾连字符的小写字母/数字/连字符组合
const SLUG_RE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SLUG_RANDOM_ATTEMPTS = 5;

export function validateSlug(slug: string): void {
  if (!slug) throw new Error('slug 不能为空');
  if (slug.length > SLUG_MAX) {
    throw new Error(`slug 不能超过 ${SLUG_MAX} 个字符`);
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      'slug 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾'
    );
  }
}

function generateSlug(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

function slugExists(siteId: number, slug: string, excludeId?: number): boolean {
  const row = get<{ id: number }>(
    'SELECT id FROM articles WHERE site_id = ? AND slug = ? AND id != ?',
    siteId,
    slug,
    excludeId ?? 0
  );
  return row !== undefined;
}

/** 生成随机 slug，撞库重试 ≤5 次（对齐 Rust 版） */
function uniqueSlug(siteId: number): string {
  for (let attempt = 0; attempt < SLUG_RANDOM_ATTEMPTS; attempt += 1) {
    const slug = generateSlug();
    if (!slugExists(siteId, slug)) return slug;
  }
  throw new Error('无法生成唯一 slug，请重试');
}

function loadCategories(articleId: number): ArticleRef[] {
  return all<RefRow>(
    'SELECT c.id, c.name FROM article_categories ac JOIN categories c ON c.id = ac.category_id WHERE ac.article_id = ? ORDER BY c.id',
    articleId
  );
}

function loadTags(articleId: number): ArticleRef[] {
  return all<RefRow>(
    'SELECT t.id, t.name FROM article_tags at2 JOIN tags t ON t.id = at2.tag_id WHERE at2.article_id = ? ORDER BY t.id',
    articleId
  );
}

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    siteId: row.site_id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    status: row.status,
    categories: loadCategories(row.id),
    tags: loadTags(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listArticles(siteId: number): Article[] {
  return all<ArticleRow>(
    'SELECT * FROM articles WHERE site_id = ? ORDER BY updated_at DESC, id DESC',
    siteId
  ).map(toArticle);
}

export function getArticle(id: number): Article {
  const row = get<ArticleRow>('SELECT * FROM articles WHERE id = ?', id);
  if (!row) throw new Error('文章不存在');
  return toArticle(row);
}

function assertStatus(status: string): void {
  if (status !== 'draft' && status !== 'published') {
    throw new Error("文章状态只能是 'draft' 或 'published'");
  }
}

/**
 * 创建文章。slug 省略时自动生成（8 位随机小写字母，撞库重试 ≤5 次）；
 * categoryIds/tagIds 提供时建立关联。
 */
export function createArticle(payload: {
  siteId: number;
  title?: string;
  content?: string;
  status?: 'draft' | 'published';
  slug?: string;
  categoryIds?: number[];
  tagIds?: number[];
}): Article {
  const site = get<{ id: number }>('SELECT id FROM sites WHERE id = ?', payload.siteId);
  if (!site) throw new Error('站点不存在');

  const title = payload.title ?? '未命名文章';
  const content = payload.content ?? '';
  const status = payload.status ?? 'draft';
  assertStatus(status);

  return tx(() => {
    const slug = payload.slug
      ? (validateSlug(payload.slug), slugExists(payload.siteId, payload.slug) ? (() => {
          throw new Error(`slug '${payload.slug}' 已被本站点其他文章使用`);
        })() : payload.slug)
      : uniqueSlug(payload.siteId);

    const { lastInsertRowid } = run(
      'INSERT INTO articles (site_id, slug, title, content, status) VALUES (?, ?, ?, ?, ?)',
      payload.siteId,
      slug,
      title,
      content,
      status
    );
    const articleId = lastInsertRowid;

    if (payload.categoryIds) {
      syncCategories(articleId, payload.siteId, payload.categoryIds);
    }
    if (payload.tagIds) {
      syncTags(articleId, payload.siteId, payload.tagIds);
    }

    return getArticle(articleId);
  });
}

/** 更新文章。title/content/status/slug 提供时覆盖；categoryIds/tagIds 提供时全量替换关联。 */
export function updateArticle(payload: {
  id: number;
  title?: string;
  content?: string;
  status?: 'draft' | 'published';
  slug?: string;
  categoryIds?: number[];
  tagIds?: number[];
}): Article {
  const existing = get<ArticleRow>('SELECT * FROM articles WHERE id = ?', payload.id);
  if (!existing) throw new Error('文章不存在');

  return tx(() => {
    if (payload.slug !== undefined) {
      validateSlug(payload.slug);
      if (slugExists(existing.site_id, payload.slug, payload.id)) {
        throw new Error(`slug '${payload.slug}' 已被本站点其他文章使用`);
      }
      run('UPDATE articles SET slug = ? WHERE id = ?', payload.slug, payload.id);
    }
    if (payload.title !== undefined) {
      run('UPDATE articles SET title = ? WHERE id = ?', payload.title, payload.id);
    }
    if (payload.content !== undefined) {
      run('UPDATE articles SET content = ? WHERE id = ?', payload.content, payload.id);
    }
    if (payload.status !== undefined) {
      assertStatus(payload.status);
      run('UPDATE articles SET status = ? WHERE id = ?', payload.status, payload.id);
    }
    run(
      "UPDATE articles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      payload.id
    );

    if (payload.categoryIds) {
      syncCategories(payload.id, existing.site_id, payload.categoryIds);
    }
    if (payload.tagIds) {
      syncTags(payload.id, existing.site_id, payload.tagIds);
    }

    return getArticle(payload.id);
  });
}

export function deleteArticle(id: number): void {
  const result = run('DELETE FROM articles WHERE id = ?', id);
  if (result.changes === 0) throw new Error('文章不存在');
}

function syncCategories(articleId: number, siteId: number, categoryIds: number[]): void {
  run('DELETE FROM article_categories WHERE article_id = ?', articleId);
  for (const categoryId of categoryIds) {
    const category = get<{ id: number }>(
      'SELECT id FROM categories WHERE id = ? AND site_id = ?',
      categoryId,
      siteId
    );
    if (!category) throw new Error(`分类 ${categoryId} 不存在或不属于当前站点`);
    run(
      'INSERT INTO article_categories (article_id, category_id) VALUES (?, ?)',
      articleId,
      categoryId
    );
  }
}

function syncTags(articleId: number, siteId: number, tagIds: number[]): void {
  run('DELETE FROM article_tags WHERE article_id = ?', articleId);
  for (const tagId of tagIds) {
    const tag = get<{ id: number }>(
      'SELECT id FROM tags WHERE id = ? AND site_id = ?',
      tagId,
      siteId
    );
    if (!tag) throw new Error(`标签 ${tagId} 不存在或不属于当前站点`);
    run('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)', articleId, tagId);
  }
}
