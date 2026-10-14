import type { Site } from '@/types/api';

export function listSites(): Promise<Site[]> {
  return window.api.invoke('list_sites') as Promise<Site[]>;
}

export function createSite(payload: {
  name: string;
  description?: string | null;
}): Promise<Site> {
  return window.api.invoke('create_site', payload) as Promise<Site>;
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
