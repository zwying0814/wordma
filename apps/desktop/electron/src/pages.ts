import { all, get, run, tx } from './db';
import { getCurrentSiteId } from './site';

export type SitePage = {
  id: number;
  siteId: number;
  title: string;
  slug: string;
  content: string;
  showInNav: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type PageRow = {
  id: number;
  title: string;
  slug: string;
  content: string;
  show_in_nav: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const TITLE_MAX = 60;
const SLUG_MAX = 80;
const SLUG_RE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SLUG_RANDOM_ATTEMPTS = 5;

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function generateSlug(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return out;
}

function validateTitle(title: string): void {
  if (!title || title.trim().length === 0) {
    throw new Error('页面标题不能为空');
  }
  if (title.length > TITLE_MAX) {
    throw new Error(`页面标题不能超过 ${TITLE_MAX} 个字符`);
  }
}

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

function slugExists(slug: string, excludeId?: number): boolean {
  const row = get<{ id: number }>(
    'SELECT id FROM pages WHERE slug = ? AND id != ?',
    slug,
    excludeId ?? 0
  );
  return row !== undefined;
}

function uniqueSlug(): string {
  for (let attempt = 0; attempt < SLUG_RANDOM_ATTEMPTS; attempt += 1) {
    const slug = generateSlug();
    if (!slugExists(slug)) return slug;
  }
  throw new Error('无法生成唯一 slug，请重试');
}

function toPage(row: PageRow): SitePage {
  return {
    id: row.id,
    siteId: getCurrentSiteId(),
    title: row.title,
    slug: row.slug,
    content: row.content,
    showInNav: row.show_in_nav === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPages(): SitePage[] {
  return all<PageRow>(
    'SELECT * FROM pages ORDER BY sort_order, id'
  ).map(toPage);
}

export function getPage(id: number): SitePage {
  const row = get<PageRow>('SELECT * FROM pages WHERE id = ?', id);
  if (!row) throw new Error('页面不存在');
  return toPage(row);
}

export function createPage(payload: {
  title?: string;
  slug?: string;
  content?: string;
  showInNav?: boolean;
  sortOrder?: number;
}): SitePage {
  const title = payload.title ?? '未命名页面';
  validateTitle(title);

  return tx(() => {
    const slug = payload.slug
      ? (validateSlug(payload.slug), slugExists(payload.slug) ? (() => {
          throw new Error(`slug '${payload.slug}' 已被本站点其他页面使用`);
        })() : payload.slug)
      : uniqueSlug();

    const { lastInsertRowid } = run(
      'INSERT INTO pages (title, slug, content, show_in_nav, sort_order) VALUES (?, ?, ?, ?, ?)',
      title,
      slug,
      payload.content ?? '',
      payload.showInNav === false ? 0 : 1,
      payload.sortOrder ?? 0
    );
    return getPage(lastInsertRowid);
  });
}

export function updatePage(payload: {
  id: number;
  title?: string;
  content?: string;
  slug?: string;
  showInNav?: boolean;
  sortOrder?: number;
}): SitePage {
  const existing = get<PageRow>('SELECT * FROM pages WHERE id = ?', payload.id);
  if (!existing) throw new Error('页面不存在');

  return tx(() => {
    if (payload.title !== undefined) {
      validateTitle(payload.title);
      run('UPDATE pages SET title = ? WHERE id = ?', payload.title, payload.id);
    }
    if (payload.slug !== undefined) {
      validateSlug(payload.slug);
      if (slugExists(payload.slug, payload.id)) {
        throw new Error(`slug '${payload.slug}' 已被本站点其他页面使用`);
      }
      run('UPDATE pages SET slug = ? WHERE id = ?', payload.slug, payload.id);
    }
    if (payload.content !== undefined) {
      run('UPDATE pages SET content = ? WHERE id = ?', payload.content, payload.id);
    }
    if (payload.showInNav !== undefined) {
      run(
        'UPDATE pages SET show_in_nav = ? WHERE id = ?',
        payload.showInNav ? 1 : 0,
        payload.id
      );
    }
    if (payload.sortOrder !== undefined) {
      run('UPDATE pages SET sort_order = ? WHERE id = ?', payload.sortOrder, payload.id);
    }
    run(
      "UPDATE pages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      payload.id
    );
    return getPage(payload.id);
  });
}

export function deletePage(id: number): void {
  const result = run('DELETE FROM pages WHERE id = ?', id);
  if (result.changes === 0) throw new Error('页面不存在');
}
