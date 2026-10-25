import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import {
  SiteConfigSchema,
  ThemeManifestSchema,
} from '../packages/content/src/index';

const root = path.resolve(import.meta.dirname, '..');

type SchemaMeta = {
  id: string;
  title: string;
  description: string;
};

function writeSchema(
  relativePath: string,
  schema: z.ZodType,
  meta: SchemaMeta,
): void {
  // io: 'input' 让带默认值的字段在 YAML 里保持可选。
  const json = z.toJSONSchema(schema, { io: 'input' });
  const document = {
    $id: meta.id,
    title: meta.title,
    description: meta.description,
    ...json,
  };

  const output = path.join(root, relativePath);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);

  console.log(`generated ${relativePath}`);
}

writeSchema('packages/content/schema/site.schema.json', SiteConfigSchema, {
  id: 'https://wordma.dev/schema/site.json',
  title: 'Wordma site configuration',
  description:
    'Schema for wordma.site.yaml. Generated from @wordma/content SiteConfigSchema; do not edit by hand.',
});

writeSchema('packages/theme/schema/theme.schema.json', ThemeManifestSchema, {
  id: 'https://wordma.dev/schema/theme.json',
  title: 'Wordma theme manifest',
  description:
    'Schema for theme.yaml. Generated from @wordma/content ThemeManifestSchema; do not edit by hand.',
});
