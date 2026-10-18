import type { Site } from '@/types/api';

export function listSites(): Promise<Site[]> {
  return window.api.invoke('list_sites') as Promise<Site[]>;
}

export function createSite(payload: {
  name: string;
  description?: string | null;
  /** 站点数据根目录（创建时选择；已有 Wordma 数据的目录则视为重开） */
  dir: string;
}): Promise<Site> {
  return window.api.invoke('create_site', payload) as Promise<Site>;
}

/** 打开系统目录选择对话框，选中返回绝对路径（取消返回 null） */
export function selectDirectory(): Promise<string | null> {
  return window.api.invoke('select_directory') as Promise<string | null>;
}

export function updateSite(payload: {
  id: number;
  name: string;
  description?: string | null;
}): Promise<Site> {
  return window.api.invoke('update_site', payload) as Promise<Site>;
}

export function deleteSite(id: number): Promise<void> {
  return window.api.invoke('delete_site', { id }) as Promise<void>;
}

export function getActiveSite(): Promise<Site | null> {
  return window.api.invoke('get_active_site') as Promise<Site | null>;
}

export function setActiveSite(id: number): Promise<void> {
  return window.api.invoke('set_active_site', { id }) as Promise<void>;
}
