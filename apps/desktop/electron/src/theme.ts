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

/** 首次启动提取内置默认主题（已存在则跳过；精细覆盖归二期指纹机制 T20） */
export function ensureBuiltinThemes(): void {
  const dir = path.join(themesDir(), DEFAULT_THEME_NAME);
  if (existsSync(dir)) return;

  mkdirSync(path.join(dir, 'templates'), { recursive: true });
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeFileSync(path.join(dir, 'theme.yaml'), BUILTIN_THEME_YAML);
  for (const [filename, content] of Object.entries(BUILTIN_THEME_TEMPLATES)) {
    writeFileSync(path.join(dir, 'templates', filename), content);
  }
  writeFileSync(path.join(dir, 'assets', 'style.css'), STYLE_CSS);
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
