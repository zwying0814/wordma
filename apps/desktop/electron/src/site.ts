import { all, get, run } from './db';
import { getSetting, setSetting } from './settings';

export type Site = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
};

type SiteRow = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};

const SITE_NAME_MAX = 30;
const SITE_DESCRIPTION_MAX = 100;

function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

function validateSiteInput(name: string, description?: string | null): void {
  if (!name || name.trim().length === 0) {
    throw new Error('站点名称不能为空');
  }
  if (name.length > SITE_NAME_MAX) {
    throw new Error(`站点名称不能超过 ${SITE_NAME_MAX} 个字符`);
  }
  if (description && description.length > SITE_DESCRIPTION_MAX) {
    throw new Error(`站点描述不能超过 ${SITE_DESCRIPTION_MAX} 个字符`);
  }
}

export function listSites(): Site[] {
  return all<SiteRow>('SELECT * FROM sites ORDER BY id').map(toSite);
}

export function getSite(id: number): Site {
  const row = get<SiteRow>('SELECT * FROM sites WHERE id = ?', id);
  if (!row) throw new Error('站点不存在');
  return toSite(row);
}

export function createSite(payload: {
  name: string;
  description?: string | null;
}): Site {
  validateSiteInput(payload.name, payload.description);
  const { lastInsertRowid } = run(
    'INSERT INTO sites (name, description) VALUES (?, ?)',
    payload.name,
    payload.description ?? null
  );
  return getSite(lastInsertRowid);
}

export function updateSite(payload: {
  id: number;
  name: string;
  description?: string | null;
}): Site {
  validateSiteInput(payload.name, payload.description);
  const result = run(
    'UPDATE sites SET name = ?, description = ? WHERE id = ?',
    payload.name,
    payload.description ?? null,
    payload.id
  );
  if (result.changes === 0) throw new Error('站点不存在');
  return getSite(payload.id);
}

export function deleteSite(id: number): void {
  const result = run('DELETE FROM sites WHERE id = ?', id);
  if (result.changes === 0) throw new Error('站点不存在');

  // 若删除的是激活站点，清理激活标记（与 Rust 版一致：下次 get 返回 null）
  if (getSetting('active_site_id') === String(id)) {
    run('DELETE FROM settings WHERE key = ?', 'active_site_id');
  }
}

export function getActiveSite(): Site | null {
  const raw = getSetting('active_site_id');
  if (!raw) return null;
  const row = get<SiteRow>('SELECT * FROM sites WHERE id = ?', Number(raw));
  return row ? toSite(row) : null;
}

export function setActiveSite(payload: { id: number }): void {
  const site = get<SiteRow>('SELECT id FROM sites WHERE id = ?', payload.id);
  if (!site) throw new Error('站点不存在');
  setSetting('active_site_id', String(payload.id));
}
