import { z } from 'zod';

import type { PageFrontmatter } from '../types/content';
import { PackageNameSchema } from './common';

export const PageFrontmatterSchema = z.strictObject({
  title: z.string().min(1),
  slug: z.string().min(1).optional(),
  date: z.string().min(1).optional(),
  updated: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  categories: z.array(z.string().min(1)).default([]),
  draft: z.boolean().default(false),
  cover: z.string().min(1).optional(),
  type: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]*$/,
      '页面类型 key 必须以小写字母开头，只能包含小写字母、数字和连字符',
    )
    .optional(),
  theme: z
    .record(PackageNameSchema, z.record(z.string(), z.unknown()))
    .optional(),
});

export function parsePageFrontmatter(input: unknown): PageFrontmatter {
  return PageFrontmatterSchema.parse(input);
}
