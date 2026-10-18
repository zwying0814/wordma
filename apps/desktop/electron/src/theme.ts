import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

import { getDataDir } from './db';
import { listSites } from './site';
import { getSetting, setSetting } from './settings';
import {
  BUILTIN_THEME_TEMPLATES,
  BUILTIN_THEME_YAML,
  STYLE_CSS,
} from './templates';

export type ThemeSettingType = 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'color';

export type ThemeSettingSchema = {
  key: string;
  label: string;
  type: ThemeSettingType;
  default?: string | number | boolean;
  options?: string[];
};

export type ThemePreview = Record<string, string>;

export type ThemeMeta = {
  name: string;
  displayName: string;
  version: string;
  author: string;
  description: string;
  layout: string;
  tags: string[];
  preview: ThemePreview;
  settings: ThemeSettingSchema[];
  /** 当前站点是否激活了该主题 */
  active: boolean;
  /** 主题损坏时的可读原因 */
  invalidMessage?: string;
};

export function themesDir(): string {
  return path.join(getDataDir(), 'themes');
}

export const DEFAULT_THEME_NAME = 'default';

/** 内置主题指纹文件：记录每个内置文件的 SHA-256，用于区分「用户改过」与「只是旧版本」 */
const BUILTIN_MANIFEST_FILE = '.builtin-manifest.json';

type BuiltinManifest = {
  /** 生成该 manifest 时的内置主题版本（theme.yaml 的 version） */
  version: string;
  /** 相对主题根目录的路径 → 内容 SHA-256 */
  files: Record<string, string>;
};

/** 内置默认主题的全部文件（相对路径 → 内容） */
function builtinThemeFiles(): Record<string, string> {
  const files: Record<string, string> = {
    'theme.yaml': BUILTIN_THEME_YAML,
    'assets/style.css': STYLE_CSS,
  };

  for (const [name, content] of Object.entries(BUILTIN_THEME_TEMPLATES)) {
    files[`templates/${name}`] = content;
  }

  return files;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function readBuiltinManifest(manifestPath: string): BuiltinManifest | null {
  if (!existsSync(manifestPath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as BuiltinManifest;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.files !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    // 损坏的 manifest 按「没有」处理，下次提取会重建
    return null;
  }
}

function builtinThemeVersion(): string {
  const match = /^version:\s*(.+)$/m.exec(BUILTIN_THEME_YAML);
  return match?.[1]?.trim() ?? '';
}

function writeBuiltinFile(dir: string, rel: string, content: string): void {
  const target = path.join(dir, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/**
 * 提取 / 更新内置默认主题（启动时调用）。
 *
 * 主题目录里存一份 `.builtin-manifest.json`（每个内置文件的 SHA-256）。逐文件比对：
 * - 磁盘内容与 manifest 记录一致 ⇒ 用户没动过 ⇒ 用当前版本覆盖（升级生效）
 * - 不一致 ⇒ 用户改过 ⇒ 保留
 * - 文件缺失 ⇒ 补回
 *
 * 没有 manifest（首次提取，或从没有该机制的旧版本升级上来）时无法判断哪些文件被改过，
 * 此时只补缺失文件、不覆盖已存在的，并写入 manifest 供以后比对。
 */
export function ensureBuiltinThemes(): void {
  const dir = path.join(themesDir(), DEFAULT_THEME_NAME);
  const files = builtinThemeFiles();
  const manifestPath = path.join(dir, BUILTIN_MANIFEST_FILE);
  const previous = readBuiltinManifest(manifestPath);

  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel);

    if (!existsSync(target)) {
      writeBuiltinFile(dir, rel, content);
      continue;
    }

    const current = readFileSync(target, 'utf8');
    if (current === content) continue;

    const known = previous?.files[rel];
    if (known && sha256(current) === known) {
      writeBuiltinFile(dir, rel, content);
    }
  }

  const next: BuiltinManifest = {
    version: builtinThemeVersion(),
    files: Object.fromEntries(
      Object.entries(files).map(([rel, content]) => [rel, sha256(content)])
    ),
  };
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== serialized) {
    writeFileSync(manifestPath, serialized);
  }
}

export function getActiveThemeName(siteId: number): string {
  const name = getSetting(`active_theme:${siteId}`);
  return name ?? DEFAULT_THEME_NAME;
}

export function setActiveTheme(siteId: number, name: string): void {
  if (!themeExists(name)) throw new Error(`主题「${name}」不存在`);
  setSetting(`active_theme:${siteId}`, name);
}

export function themeExists(name: string): boolean {
  return existsSync(path.join(themesDir(), name, 'theme.yaml'));
}

/** 扫描主题目录，解析 theme.yaml（损坏主题标记 invalid，不阻塞列表） */
export function listThemes(siteId: number): ThemeMeta[] {
  const dir = themesDir();
  if (!existsSync(dir)) return [];
  const active = getActiveThemeName(siteId);

  const out: ThemeMeta[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const themePath = path.join(dir, entry.name);
    const yamlPath = path.join(themePath, 'theme.yaml');
    if (!existsSync(yamlPath)) continue;

    try {
      const parsed = yaml.parse(readFileSync(yamlPath, 'utf8')) as Partial<ThemeMeta>;
      out.push({
        name: entry.name,
        displayName: parsed.displayName ?? entry.name,
        version: parsed.version ?? '0.0.0',
        author: parsed.author ?? '',
        description: parsed.description ?? '',
        layout: parsed.layout ?? 'single',
        tags: parsed.tags ?? [],
        preview: parsed.preview ?? {},
        settings: parsed.settings ?? [],
        active: entry.name === active,
      });
    } catch (err) {
      out.push({
        name: entry.name,
        displayName: entry.name,
        version: '',
        author: '',
        description: '',
        layout: 'single',
        tags: [],
        preview: {},
        settings: [],
        active: false,
        invalidMessage: `theme.yaml 解析失败：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return out;
}

export function deleteTheme(name: string): void {
  // 使用中保护：任何站点的激活主题都不允许删除
  // （未显式激活的站点回退使用 default，因此删除 default 同样被拒）
  for (const site of listSites()) {
    if (getActiveThemeName(site.id) === name) {
      throw new Error(`主题「${name}」正在被站点「${site.name}」使用，无法删除`);
    }
  }
  rmSync(path.join(themesDir(), name), { recursive: true, force: true });
}

/** 主题设置解析（宽松）：合并 schema 默认值与存储值，坏值回退默认 */
export function resolveThemeSettings(
  themeName: string,
  siteId: number
): Record<string, string | number | boolean> {
  const dir = path.join(themesDir(), themeName);
  const out: Record<string, string | number | boolean> = {};

  // schema 默认值
  const yamlPath = path.join(dir, 'theme.yaml');
  if (existsSync(yamlPath)) {
    try {
      const meta = yaml.parse(readFileSync(yamlPath, 'utf8')) as {
        settings?: ThemeSettingSchema[];
      };
      for (const setting of meta.settings ?? []) {
        if (setting.default !== undefined) {
          out[setting.key] = setting.default;
        }
      }
    } catch {
      /* 解析失败回退空 */
    }
  }

  // 存储值覆盖默认
  try {
    const raw = getSetting(`theme_settings:${siteId}:${themeName}`);
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, string | number | boolean>;
      for (const [key, value] of Object.entries(stored)) {
        out[key] = value;
      }
    }
  } catch {
    /* 忽略损坏的存储 */
  }

  return out;
}
