import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

export async function getDb() {
  if (!dbInstance) {
    try {
        dbInstance = await Database.load('sqlite:wordma.db');
    } catch (e) {
        console.error('Failed to load database:', e);
        throw e;
    }
  }
  return dbInstance;
}

export interface Site {
  id?: number;
  name: string;
  description: string;
  created_at?: string;
}

export interface Article {
  id: number;
  title: string;
  content: string;
  type: 'richtext' | 'markdown';
  summary?: string;
  cover?: string;
  status: 'published' | 'draft';
  created_at: string;
  updated_at: string;
}

export async function createSite(site: Omit<Site, 'id' | 'created_at'>): Promise<number> {
  const db = await getDb();
  // Check unique site name only
  const existing = await db.select<Site[]>('SELECT id, name FROM site WHERE name = $1', [site.name]);
  if (existing.length > 0) {
    throw new Error(`站点名称 "${site.name}" 已存在`);
  }

  const result = await db.execute(
    'INSERT INTO site (name, description) VALUES ($1, $2)',
    [site.name, site.description]
  );
  return result.lastInsertId ?? 0;
}

export async function getAllSites(): Promise<Site[]> {
  const db = await getDb();
  return await db.select<Site[]>('SELECT * FROM site ORDER BY created_at DESC');
}

export async function hasSites(): Promise<boolean> {
  const db = await getDb();
  const result = await db.select<{count: number}[]>('SELECT count(*) as count FROM site');
  return result[0].count > 0;
}

export async function checkSiteNameExists(name: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.select<{count: number}[]>('SELECT count(*) as count FROM site WHERE name = $1', [name]);
  return result[0].count > 0;
}

export async function getAllArticles(): Promise<Article[]> {
  const db = await getDb();
  return await db.select<Article[]>('SELECT * FROM article ORDER BY created_at DESC');
}

export async function getLastSiteId(): Promise<number | null> {
  const db = await getDb();
  const result = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['last_site_id']);
  if (result.length > 0 && result[0].value) {
    return Number(result[0].value);
  }
  return null;
}

export async function setLastSiteId(id: number): Promise<void> {
  const db = await getDb();
  // SQLite supports INSERT OR REPLACE
  await db.execute(
    'INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)',
    ['last_site_id', String(id)]
  );
}
