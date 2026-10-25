import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import {
  YamlParseError,
  parsePageFrontmatter,
  parseSiteConfig,
  parseThemeManifest,
  parseYaml,
  parseYamlFile,
} from '../packages/content/src/index';

const root = path.resolve(import.meta.dirname, '..');
const fixturesRoot = path.join(root, 'fixtures');

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function relative(filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

let failed = 0;

function expectOk(label: string, run: () => void): void {
  try {
    run();
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(error);
  }
}

function expectFailWith(
  label: string,
  run: () => void,
  predicate: (error: unknown) => boolean,
): void {
  try {
    run();
    failed += 1;
    console.error(`✗ ${label}（本应失败）`);
  } catch (error) {
    if (predicate(error)) {
      console.log(`✓ ${label}`);
      return;
    }

    failed += 1;
    console.error(`✗ ${label}（错误类型不符合预期）`);
    console.error(error);
  }
}

function readFrontmatter(filePath: string): unknown {
  const source = readFileSync(filePath, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    throw new Error(`${relative(filePath)} 缺少 frontmatter`);
  }

  return parseYaml(match[1], { filePath });
}

const files = walk(fixturesRoot);

for (const filePath of files.filter((file) => file.endsWith('wordma.site.yaml'))) {
  const label = `site: ${relative(filePath)}`;

  if (relative(filePath).includes('broken/bad-yaml/')) {
    expectFailWith(
      label,
      () => parseSiteConfig(parseYamlFile(filePath)),
      (error) =>
        error instanceof YamlParseError &&
        error.diagnostics.some(
          (diagnostic) => diagnostic.code === 'DUPLICATE_KEY',
        ),
    );
  } else {
    expectOk(label, () => parseSiteConfig(parseYamlFile(filePath)));
  }
}

for (const filePath of files.filter((file) => file.endsWith('theme.yaml'))) {
  const label = `theme: ${relative(filePath)}`;

  if (relative(filePath).includes('broken/bad-theme/')) {
    expectFailWith(
      label,
      () => parseThemeManifest(parseYamlFile(filePath)),
      (error) => error instanceof Error && error.name === 'ZodError',
    );
  } else {
    expectOk(label, () => parseThemeManifest(parseYamlFile(filePath)));
  }
}

for (const filePath of files.filter((file) => file.endsWith('.mdx'))) {
  expectOk(`frontmatter: ${relative(filePath)}`, () =>
    parsePageFrontmatter(readFrontmatter(filePath)),
  );
}

// 主题切换 fixture 必须同时保留两个命名空间。
expectOk('theme-switch 保留两个主题命名空间', () => {
  const data = parsePageFrontmatter(
    readFrontmatter(
      path.join(fixturesRoot, 'theme-switch/content/posts/switching.mdx'),
    ),
  );
  const namespaces = Object.keys(data.theme ?? {});

  if (
    !namespaces.includes('wordma-theme-journal') ||
    !namespaces.includes('wordma-theme-minimal')
  ) {
    throw new Error(`命名空间不完整：${namespaces.join(', ')}`);
  }
});

// 自定义页面类型必须能解析出动态路由占位符。
expectOk('custom-pages 的 [slug] 路由', () => {
  const theme = parseThemeManifest(
    parseYamlFile(
      path.join(
        fixturesRoot,
        'custom-pages/themes/wordma-theme-custom-pages/theme.yaml',
      ),
    ),
  );
  const route = theme.content?.pageTypes.project?.route;

  if (!route || !route.includes('[slug]')) {
    throw new Error(`project 路由缺少 [slug]：${route ?? '(missing)'}`);
  }
});

if (failed > 0) {
  console.error(`\n${failed} 个 fixture 校验失败`);
  process.exit(1);
}

console.log('\n全部 fixture 校验通过');
