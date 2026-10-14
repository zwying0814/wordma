import type { Article } from '@/types/api';

export function listArticles(siteId: number): Promise<Article[]> {
  return window.api.invoke('list_articles', { siteId }) as Promise<Article[]>;
}

export function getArticle(id: number): Promise<Article> {
  return window.api.invoke('get_article', { id }) as Promise<Article>;
}

export function createArticle(payload: {
  siteId: number;
  title?: string;
  content?: string;
  status?: 'draft' | 'published';
  slug?: string;
  categoryIds?: number[];
  tagIds?: number[];
}): Promise<Article> {
  return window.api.invoke('create_article', payload) as Promise<Article>;
}

export function updateArticle(payload: {
  id: number;
  title?: string;
  content?: string;
  status?: 'draft' | 'published';
  slug?: string;
  categoryIds?: number[];
  tagIds?: number[];
}): Promise<Article> {
  return window.api.invoke('update_article', payload) as Promise<Article>;
}

export function deleteArticle(id: number): Promise<void> {
  return window.api.invoke('delete_article', { id }) as Promise<void>;
}
