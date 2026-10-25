import { z } from 'zod';

import {
  DEFAULT_PAGINATION,
  DEFAULT_ROUTES,
  type SiteConfig,
  type SiteRoutes,
} from '../types/site';
import { PackageNameSchema } from './common';

export const SiteMetaSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().optional(),
  url: z.url().optional(),
  language: z.string().min(1).default('zh-CN'),
  basePath: z
    .string()
    .default('')
    .refine(
      (value) => value === '' || (value.startsWith('/') && !value.endsWith('/')),
      'basePath 必须为空，或以 / 开头且不以 / 结尾',
    ),
});

export const ThemeSelectionSchema = z.strictObject({
  id: PackageNameSchema,
  settings: z.record(z.string(), z.unknown()).default({}),
});

export const NavigationItemSchema = z.strictObject({
  label: z.string().min(1),
  path: z.string().min(1),
});

function placeholderNames(value: string): string[] {
  return [...value.matchAll(/\[([a-zA-Z0-9_]+)\]/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
}

function routePattern(
  required: string[] = [],
  allowPlaceholders = true,
) {
  let schema = z
    .string()
    .min(1)
    .regex(/^\//, '路由必须以 / 开头');

  for (const name of required) {
    schema = schema.regex(
      new RegExp(`\\[${name}\\]`),
      `路由必须包含 [${name}]`,
    );
  }

  return schema
    .refine(
      (value) => !value.split('/').includes('..'),
      '路由不能包含 ..',
    )
    .refine(
      (value) => !/[?#]/.test(value),
      '路由不能包含 query 或 hash',
    )
    .refine(
      (value) => allowPlaceholders || !/\[[^\]]+\]/.test(value),
      '该路由不能包含占位符',
    );
}

export const SiteRoutesSchema = z
  .strictObject({
    post: routePattern(['slug']).default(DEFAULT_ROUTES.post),
    page: routePattern(['slug']).default(DEFAULT_ROUTES.page),
    collection: routePattern([
      'collection',
      'slug',
    ]).default(DEFAULT_ROUTES.collection),
    archive: routePattern([], false).default(DEFAULT_ROUTES.archive),
    categories: routePattern([], false).default(
      DEFAULT_ROUTES.categories,
    ),
    category: routePattern(['slug']).default(DEFAULT_ROUTES.category),
    tags: routePattern([], false).default(DEFAULT_ROUTES.tags),
    tag: routePattern(['slug']).default(DEFAULT_ROUTES.tag),
    pagination: routePattern(['page']).default(
      DEFAULT_ROUTES.pagination,
    ),
  })
  .superRefine((routes, ctx) => {
    const allowed: Record<keyof SiteRoutes, string[]> = {
      post: ['slug'],
      page: ['slug'],
      collection: ['collection', 'slug'],
      archive: [],
      categories: [],
      category: ['slug'],
      tags: [],
      tag: ['slug'],
      pagination: ['page'],
    };

    for (const [key, value] of Object.entries(routes)) {
      const routeKey = key as keyof SiteRoutes;
      for (const name of placeholderNames(value)) {
        if (!allowed[routeKey].includes(name)) {
          ctx.addIssue({
            code: 'custom',
            message: `不支持的占位符 [${name}]`,
            path: [key],
          });
        }
      }
    }
  });

export const PaginationConfigSchema = z.strictObject({
  pageSize: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_PAGINATION.pageSize),
});

export const SiteConfigSchema = z.strictObject({
  site: SiteMetaSchema,
  theme: ThemeSelectionSchema.default({
    id: 'wordma-theme-default',
    settings: {},
  }),
  navigation: z.array(NavigationItemSchema).default([]),
  routes: SiteRoutesSchema.default(DEFAULT_ROUTES),
  pagination: PaginationConfigSchema.default(DEFAULT_PAGINATION),
});

export function parseSiteConfig(input: unknown): SiteConfig {
  return SiteConfigSchema.parse(input);
}
