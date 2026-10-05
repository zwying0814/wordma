import { invoke } from "@tauri-apps/api/core";

export type ArticleStatus = "draft" | "published";

/** 文章关联的分类/标签引用 */
export interface ArticleRef {
  id: number;
  name: string;
}

export interface Article {
  id: number;
  siteId: number;
  slug: string;
  title: string;
  content: string;
  status: ArticleStatus;
  categories: ArticleRef[];
  tags: ArticleRef[];
  createdAt: string;
  updatedAt: string;
}

export function listArticles(siteId: number): Promise<Article[]> {
  return invoke("list_articles", { siteId });
}

export function getArticle(id: number): Promise<Article> {
  return invoke("get_article_cmd", { id });
}

export function createArticle(siteId: number, title: string): Promise<Article> {
  return invoke("create_article", { siteId, title });
}

export interface ArticlePatch {
  title?: string;
  content?: string;
  status?: ArticleStatus;
  slug?: string;
  categoryIds?: number[];
  tagIds?: number[];
}

export function updateArticle(id: number, patch: ArticlePatch): Promise<Article> {
  return invoke("update_article_cmd", { id, ...patch });
}

export function deleteArticle(id: number): Promise<void> {
  return invoke("delete_article_cmd", { id });
}
