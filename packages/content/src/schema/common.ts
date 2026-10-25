import { z } from 'zod';

export const PackageNameSchema = z
  .string()
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/,
    '必须是合法的 npm 包名（小写，可带 scope）',
  );

export const SemverSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
    '必须是合法的 semver 版本号',
  );

export const RoutePathSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('/'), '路由必须以 / 开头');

export const ThemeOptionSchema = z.strictObject({
  label: z.string().min(1),
  value: z.string().min(1),
});
