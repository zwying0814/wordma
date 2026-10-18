import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { runMigrations } from './migrations';

let db: DatabaseSync | null = null;
let dataDir: string | null = null;

/**
 * 单站点库：当前打开的库对应的站点目录。
 * media/themes/preview/publish 等磁盘布局都挂在这个目录下（一一站点一目录）。
 */
export function getDataDir(): string {
  if (!dataDir) throw new Error('站点库尚未打开');
  return dataDir;
}

/** 为站点目录打开 wordma.db（目录不存在则创建）并跑建表迁移 */
export function openSiteDb(siteDir: string): void {
  mkdirSync(siteDir, { recursive: true });
  dataDir = siteDir;
  db = new DatabaseSync(path.join(siteDir, 'wordma.db'));
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('站点库尚未打开');
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export function all<T = Record<string, unknown>>(
  sql: string,
  ...params: SQLInputValue[]
): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = Record<string, unknown>>(
  sql: string,
  ...params: SQLInputValue[]
): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(
  sql: string,
  ...params: SQLInputValue[]
): { changes: number; lastInsertRowid: number } {
  const result = getDb().prepare(sql).run(...params);
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

/** 手工事务（node:sqlite 无 .transaction() 助手） */
export function tx<T>(fn: () => T): T {
  getDb().exec('BEGIN');
  try {
    const result = fn();
    getDb().exec('COMMIT');
    return result;
  } catch (error) {
    getDb().exec('ROLLBACK');
    throw error;
  }
}
