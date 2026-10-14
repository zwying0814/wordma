import type { SitePage } from '@/types/api';

export function listPages(siteId: number): Promise<SitePage[]> {
  return window.api.invoke('list_pages', { siteId }) as Promise<SitePage[]>;
}

export function getPage(id: number): Promise<SitePage> {
  return window.api.invoke('get_page', { id }) as Promise<SitePage>;
}

export function createPage(payload: {
  siteId: number;
  title?: string;
  slug?: string;
  content?: string;
  showInNav?: boolean;
  sortOrder?: number;
}): Promise<SitePage> {
  return window.api.invoke('create_page', payload) as Promise<SitePage>;
}

export function updatePage(payload: {
  id: number;
  title?: string;
  content?: string;
  slug?: string;
  showInNav?: boolean;
  sortOrder?: number;
}): Promise<SitePage> {
  return window.api.invoke('update_page', payload) as Promise<SitePage>;
}

export function deletePage(id: number): Promise<void> {
  return window.api.invoke('delete_page', { id }) as Promise<void>;
}
