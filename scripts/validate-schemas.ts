import { readFileSync } from 'node:fs';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');

function readJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(path.join(root, relativePath), 'utf8'),
  ) as unknown;
}

function readYaml(relativePath: string): unknown {
  return parse(readFileSync(path.join(root, relativePath), 'utf8')) as unknown;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateSite = ajv.compile(
  readJson('packages/content/schema/site.schema.json'),
);
const validateTheme = ajv.compile(
  readJson('packages/theme/schema/theme.schema.json'),
);

let failed = 0;

function check(
  label: string,
  validate: ValidateFunction,
  data: unknown,
  expected: boolean,
): void {
  const valid = validate(data);
  if (valid === expected) {
    console.log(`✓ ${label}`);
    return;
  }

  failed += 1;
  console.error(`✗ ${label}（期望 ${expected}，实际 ${valid}）`);
  if (validate.errors) {
    console.error(validate.errors);
  }
}

check(
  'fixtures/minimal/wordma.site.yaml',
  validateSite,
  readYaml('fixtures/minimal/wordma.site.yaml'),
  true,
);

check(
  'themes/default/theme.yaml',
  validateTheme,
  readYaml('themes/default/theme.yaml'),
  true,
);

check(
  '站点缺少 title 应被拒绝',
  validateSite,
  { site: {} },
  false,
);

check(
  '主题缺少 displayName 应被拒绝',
  validateTheme,
  {
    id: 'wordma-theme-test',
    version: '1.0.0',
    engines: { wordma: '*' },
  },
  false,
);

check(
  'select 字段缺少 options 应被拒绝',
  validateTheme,
  {
    id: 'wordma-theme-test',
    displayName: 'Test',
    version: '1.0.0',
    engines: { wordma: '*' },
    content: {
      version: 1,
      post: {
        fields: [{ key: 'hero', type: 'select', label: 'Hero' }],
      },
    },
  },
  false,
);

if (failed > 0) {
  console.error(`\n${failed} 个 JSON Schema 校验失败`);
  process.exit(1);
}

console.log('\n全部 JSON Schema 校验通过');
