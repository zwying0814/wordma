import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { runMigrations } from './migrations';

let db: DatabaseSync | null = null;
let dataDir: string | null = null;

/** 当前数据目录（media/preview 等磁盘布局的根） */
export function getDataDir(): string {
  if (!dataDir) throw new Error('数据目录尚未初始化');
  return dataDir;
}

/** 初始化数据目录与数据库连接（主进程启动时调用一次） */
export function initDataDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  dataDir = dir;
  db = new DatabaseSync(path.join(dir, 'wordma.db'));
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('数据库尚未初始化');
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
