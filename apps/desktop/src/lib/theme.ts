import { invoke } from "@tauri-apps/api/core";

/** 主题卡片缩略图的预览配色（theme.json 可选声明） */
export interface ThemePreview {
  bg: string;
  chromeBg: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
}

export interface ThemeMeta {
  name: string;
  displayName: string;
  version: string;
  author: string;
  description: string;
  /** 卡片布局变体：single | cards | magazine */
  layout: string;
  tags: string[];
  preview: ThemePreview | null;
  active: boolean;
  /** 非空表示主题结构损坏，卡片只读展示原因 */
  invalidMessage: string | null;
  /** 仅激活主题携带：当前站点的预览地址 */
  previewUrl: string | null;
}

export interface RenderReport {
  theme: string;
  outputDir: string;
  files: number;
}

export const listThemes = (siteId: number): Promise<ThemeMeta[]> =>
  invoke("list_themes_cmd", { siteId });

export const setActiveTheme = (siteId: number, name: string): Promise<void> =>
  invoke("set_active_theme_cmd", { siteId, name });

export const renderSite = (siteId: number): Promise<RenderReport> =>
  invoke("render_site_cmd", { siteId });

export const openPreview = (
  siteId: number,
  articleId?: number,
): Promise<string> =>
  invoke("open_preview_cmd", { siteId, articleId: articleId ?? null });

export const openThemesDir = (): Promise<void> =>
  invoke("open_themes_dir_cmd");

export const deleteTheme = (name: string): Promise<void> =>
  invoke("delete_theme_cmd", { name });

export const getPreviewPort = (): Promise<number> =>
  invoke("get_preview_port_cmd");

export const setPreviewPort = (port: number): Promise<void> =>
  invoke("set_preview_port_cmd", { port });
