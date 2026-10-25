import { z } from 'zod';

import type { SiteConfig } from '../types/site';
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

export const SiteConfigSchema = z.strictObject({
  site: SiteMetaSchema,
  theme: ThemeSelectionSchema.default({
    id: 'wordma-theme-default',
    settings: {},
  }),
  navigation: z.array(NavigationItemSchema).default([]),
});

export function parseSiteConfig(input: unknown): SiteConfig {
  return SiteConfigSchema.parse(input);
}
