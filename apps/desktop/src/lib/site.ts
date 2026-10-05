import { invoke } from "@tauri-apps/api/core";

export interface Site {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

export function listSites(): Promise<Site[]> {
  return invoke("list_sites");
}

export function createSite(
  name: string,
  description: string | null,
): Promise<Site> {
  return invoke("create_site", { name, description });
}

export function getActiveSite(): Promise<number | null> {
  return invoke("get_active_site");
}

export function setActiveSite(siteId: number): Promise<void> {
  return invoke("set_active_site", { siteId });
}

export function updateSite(
  siteId: number,
  name: string,
  description: string | null,
): Promise<Site> {
  return invoke("update_site_cmd", { siteId, name, description });
}
