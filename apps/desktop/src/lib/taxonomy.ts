import { invoke } from "@tauri-apps/api/core";

export interface Tag {
  id: number;
  siteId: number;
  name: string;
  createdAt: string;
  articleCount: number;
}

export interface Category {
  id: number;
  siteId: number;
  name: string;
  createdAt: string;
  articleCount: number;
}

export const listTags = (siteId: number): Promise<Tag[]> =>
  invoke("list_tags", { siteId });

export const createTag = (siteId: number, name: string): Promise<Tag> =>
  invoke("create_tag", { siteId, name });

export const renameTag = (id: number, name: string): Promise<Tag> =>
  invoke("rename_tag_cmd", { id, name });

export const deleteTag = (id: number): Promise<void> =>
  invoke("delete_tag_cmd", { id });

export const listCategories = (siteId: number): Promise<Category[]> =>
  invoke("list_categories", { siteId });

export const createCategory = (siteId: number, name: string): Promise<Category> =>
  invoke("create_category", { siteId, name });

export const renameCategory = (id: number, name: string): Promise<Category> =>
  invoke("rename_category_cmd", { id, name });

export const deleteCategory = (id: number): Promise<void> =>
  invoke("delete_category_cmd", { id });
