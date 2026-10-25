import { z } from 'zod';

import type { ThemeManifest } from '../types/theme';
import {
  PackageNameSchema,
  RoutePathSchema,
  SemverSchema,
} from './common';
import {
  FieldDescriptorSchema,
  ThemeSettingDescriptorSchema,
} from './fields';

const PageTypeKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, '页面类型 key 必须以小写字母开头，只能包含小写字母、数字和连字符');

export const PageTypeDeclarationSchema = z.strictObject({
  label: z.string().min(1),
  route: RoutePathSchema,
  layout: z.string().min(1),
  collection: z.string().min(1).optional(),
  fields: z.array(FieldDescriptorSchema).default([]),
});

export const ThemePageDeclarationSchema = z.strictObject({
  id: PageTypeKeySchema,
  path: RoutePathSchema,
  layout: z.string().min(1),
});

const ContentFieldsSchema = z.strictObject({
  fields: z.array(FieldDescriptorSchema).default([]),
});

export const ThemeContentSchema = z.strictObject({
  version: z.number().int().positive().default(1),
  post: ContentFieldsSchema.default({ fields: [] }),
  page: ContentFieldsSchema.default({ fields: [] }),
  pageTypes: z
    .record(PageTypeKeySchema, PageTypeDeclarationSchema)
    .default({}),
});

export const ThemePreviewSchema = z.strictObject({
  image: z.string().min(1).optional(),
  colors: z.record(z.string(), z.string()).default({}),
});

const ThemeManifestBaseSchema = z.strictObject({
  id: PackageNameSchema,
  displayName: z.string().min(1),
  version: SemverSchema,
  engines: z.strictObject({
    wordma: z.string().min(1),
  }),
  preview: ThemePreviewSchema.optional(),
  settings: z.array(ThemeSettingDescriptorSchema).default([]),
  content: ThemeContentSchema.optional(),
  pages: z.array(ThemePageDeclarationSchema).default([]),
});

function checkUniqueKeys(
  values: string[],
  path: (string | number)[],
  label: string,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      ctx.addIssue({
        code: 'custom',
        message: `${label}重复：${value}`,
        path: [...path, index],
      });
    }
    seen.add(value);
  });
}

export const ThemeManifestSchema = ThemeManifestBaseSchema.superRefine(
  (manifest, ctx) => {
    checkUniqueKeys(
      manifest.settings.map((setting) => setting.key),
      ['settings'],
      '主题设置 key',
      ctx,
    );

    checkUniqueKeys(
      manifest.pages.map((page) => page.id),
      ['pages'],
      '主题页面 id',
      ctx,
    );

    checkUniqueKeys(
      manifest.pages.map((page) => page.path),
      ['pages'],
      '主题页面 path',
      ctx,
    );

    if (!manifest.content) return;

    checkUniqueKeys(
      manifest.content.post.fields.map((field) => field.key),
      ['content', 'post', 'fields'],
      '文章字段 key',
      ctx,
    );

    checkUniqueKeys(
      manifest.content.page.fields.map((field) => field.key),
      ['content', 'page', 'fields'],
      '页面字段 key',
      ctx,
    );

    for (const [pageTypeId, pageType] of Object.entries(
      manifest.content.pageTypes,
    )) {
      checkUniqueKeys(
        pageType.fields.map((field) => field.key),
        ['content', 'pageTypes', pageTypeId, 'fields'],
        `页面类型 ${pageTypeId} 的字段 key`,
        ctx,
      );
    }
  },
);

export function parseThemeManifest(input: unknown): ThemeManifest {
  return ThemeManifestSchema.parse(input);
}
