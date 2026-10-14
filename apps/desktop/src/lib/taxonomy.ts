import type { Category, Tag } from '@/types/api';

export function listTags(siteId: number): Promise<Tag[]> {
  return window.api.invoke('list_tags', { siteId }) as Promise<Tag[]>;
}

export function createTag(payload: {
  siteId: number;
  name: string;
}): Promise<Tag> {
  return window.api.invoke('create_tag', payload) as Promise<Tag>;
}

export function renameTag(payload: { id: number; name: string }): Promise<Tag> {
  return window.api.invoke('rename_tag', payload) as Promise<Tag>;
}

export function deleteTag(id: number): Promise<void> {
  return window.api.invoke('delete_tag', { id }) as Promise<void>;
}

export function listCategories(siteId: number): Promise<Category[]> {
  return window.api.invoke('list_categories', { siteId }) as Promise<Category[]>;
}

export function createCategory(payload: {
  siteId: number;
  name: string;
}): Promise<Category> {
  return window.api.invoke('create_category', payload) as Promise<Category>;
}

export function renameCategory(payload: {
  id: number;
  name: string;
}): Promise<Category> {
  return window.api.invoke('rename_category', payload) as Promise<Category>;
}

export function deleteCategory(id: number): Promise<void> {
  return window.api.invoke('delete_category', { id }) as Promise<void>;
}
