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
  path: string;
  created_at?: string;
}

export async function createSite(site: Omit<Site, 'id' | 'created_at'>): Promise<number> {
  const db = await getDb();
  // Check unique constraints
  const existing = await db.select<Site[]>('SELECT id, name, path FROM site WHERE name = $1 OR path = $2', [site.name, site.path]);
  
  if (existing.length > 0) {
     const isNameDuplicate = existing.some(s => s.name === site.name);
     if (isNameDuplicate) {
       throw new Error(`站点名称 "${site.name}" 已存在`);
     }
     throw new Error(`存储路径 "${site.path}" 已被其他站点使用`);
  }

  // Using verify_path approach for security is not strictly needed here as we are in app context, 
  // but parametrized queries are a must to prevent SQL injection.
  const result = await db.execute(
    'INSERT INTO site (name, description, path) VALUES ($1, $2, $3)',
    [site.name, site.description, site.path]
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

export async function checkSitePathExists(path: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.select<{count: number}[]>('SELECT count(*) as count FROM site WHERE path = $1', [path]);
  return result[0].count > 0;
}
