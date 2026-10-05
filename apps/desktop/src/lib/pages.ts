import { invoke } from "@tauri-apps/api/core";

export interface SitePage {
  id: number;
  siteId: number;
  title: string;
  slug: string;
  content: string;
  showInNav: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const listPages = (siteId: number): Promise<SitePage[]> =>
  invoke("list_pages", { siteId });

export const getPage = (id: number): Promise<SitePage> =>
  invoke("get_page_cmd", { id });

export const createPage = (
  siteId: number,
  title: string,
  slug: string,
): Promise<SitePage> => invoke("create_page", { siteId, title, slug });

export const updatePage = (
  id: number,
  patch: { title: string; content: string; slug: string; showInNav: boolean },
): Promise<SitePage> => invoke("update_page_cmd", { id, ...patch });

export const deletePage = (id: number): Promise<void> =>
  invoke("delete_page_cmd", { id });
