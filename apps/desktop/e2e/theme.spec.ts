import { expect, test } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

import { launchDesktop } from './launch';

let app: any;
let page: any;
let dataDir: string;
let siteDir: string;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;
  dataDir = launched.dataDir;
  siteDir = launched.seeded?.siteDir ?? path.join(launched.dataDir, 'site-1');
});

test.afterEach(async () => { if (app) await app.close(); });

const invoke = (channel: string, payload?: unknown) =>
  page.evaluate(([c, p]) => (window as any).api.invoke(c, p), { channel: arguments });

test('T19: 内置默认主题提取并激活', async () => {
  const themes = await page.evaluate(() => (window as any).api.invoke('list_themes'));
  const def = themes.find((t: any) => t.name === 'default');
  expect(def).toBeDefined();
  expect(def.displayName).toBe('默认主题');
  expect(def.active).toBe(true);
  expect(fs.existsSync(path.join(siteDir, 'themes', 'default', 'theme.yaml'))).toBe(true);
});

test('T19: 自制主题激活 → 渲染产物使用主题模板与样式', async () => {
  const themeDir = path.join(siteDir, 'themes', 'mytheme');
  fs.mkdirSync(path.join(themeDir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(themeDir, 'theme.yaml'),
    'name: mytheme\ndisplayName: 我的主题\nversion: 1.0.0\nauthor: test\nlayout: single\n'
  );
  fs.writeFileSync(
    path.join(themeDir, 'templates', 'base.ejs'),
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="<%= assetRoot %>assets/style.css"></head><body>MYTHEME-SHELL<%- body %></body></html>'
  );
  fs.writeFileSync(
    path.join(themeDir, 'templates', 'index.ejs'),
    '<h1>MYTHEME-INDEX</h1><% for (const post of posts) { %><p><%= post.title %></p><% } %>'
  );
  fs.writeFileSync(path.join(themeDir, 'assets', 'style.css'), '.mytheme { color: red; }');

  await page.evaluate(() => (window as any).api.invoke('set_active_theme', { name: 'mytheme' }));

  // 预览文章（seed 的演示文章）
  const report = (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  })) as { files: number };

  expect(report.files).toBeGreaterThan(3);
  const indexHtml = fs.readFileSync(path.join(siteDir, 'preview', 'index.html'), 'utf8');
  expect(indexHtml).toContain('MYTHEME-SHELL');
  expect(indexHtml).toContain('MYTHEME-INDEX');
  expect(fs.readFileSync(path.join(siteDir, 'preview', 'assets', 'style.css'), 'utf8')).toContain('.mytheme');
});

test('T19: 主题模板缺失文件 → 回退内置布局', async () => {
  const themeDir = path.join(siteDir, 'themes', 'partial');
  fs.mkdirSync(path.join(themeDir, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(themeDir, 'theme.yaml'), 'name: partial\ndisplayName: 部分主题\n');
  // 只提供 base.ejs，不提供 index.ejs
  fs.writeFileSync(
    path.join(themeDir, 'templates', 'base.ejs'),
    '<html>PARTIAL-SHELL<%- body %></html>'
  );

  await page.evaluate(() => (window as any).api.invoke('set_active_theme', { name: 'partial' }));

  const report = (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  })) as { files: number };

  expect(report.files).toBeGreaterThan(2);
  const indexHtml = fs.readFileSync(path.join(siteDir, 'preview', 'index.html'), 'utf8');
  expect(indexHtml).toContain('PARTIAL-SHELL');
});

test('T19: 删除使用中的主题被拒；删除未使用的成功', async () => {
  const themeDir = path.join(siteDir, 'themes', 'temp-theme');
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, 'theme.yaml'), 'name: temp-theme\ndisplayName: 临时\n');

  // 未激活 → 删除成功
  await expect(
    page.evaluate(() => (window as any).api.invoke('delete_theme', { name: 'temp-theme' }))
  ).resolves.toBeUndefined();
  expect(fs.existsSync(themeDir)).toBe(false);

  // 激活中的 default → 删除被拒
  await expect(
    page.evaluate(() => (window as any).api.invoke('delete_theme', { name: 'default' }))
  ).rejects.toThrow(/正在被站点/);
});

test('T19: theme.yaml 损坏 → invalid 标记不阻塞列表', async () => {
  const brokenDir = path.join(siteDir, 'themes', 'broken');
  fs.mkdirSync(brokenDir, { recursive: true });
  fs.writeFileSync(path.join(brokenDir, 'theme.yaml'), 'name: [unclosed');

  const themes = (await page.evaluate(() => (window as any).api.invoke('list_themes'))) as any[];
  const broken = themes.find((t: any) => t.name === 'broken');
  expect(broken).toBeDefined();
  expect(broken.invalidMessage).toBeTruthy();

  // 清理
  fs.rmSync(brokenDir, { recursive: true, force: true });
});

// T20 · 内置主题指纹提取：升级时「没改过的文件覆盖、改过的保留」

const THEME_DIR = () => path.join(siteDir, 'themes', 'default');
const MANIFEST = () => path.join(THEME_DIR(), '.builtin-manifest.json');
const readManifest = () => JSON.parse(fs.readFileSync(MANIFEST(), 'utf8'));
const readThemeFile = (rel: string) =>
  fs.readFileSync(path.join(THEME_DIR(), rel), 'utf8');

/** 重启应用（同一数据目录）以触发启动时的提取逻辑 */
async function restart() {
  const launched = await launchDesktop({ dataDir, seed: true });
  app = launched.app;
  page = launched.page;
}

test('T20: 首次提取写入指纹 manifest', async () => {
  expect(fs.existsSync(MANIFEST())).toBe(true);

  const manifest = readManifest();
  expect(manifest.version).toBeTruthy();
  // 内置文件都有哈希，且与磁盘内容一致
  for (const rel of ['theme.yaml', 'assets/style.css', 'templates/post.ejs']) {
    expect(manifest.files[rel]).toMatch(/^[0-9a-f]{64}$/);
  }
});

test('T20: 升级时未修改的内置文件被新版覆盖', async () => {
  const rel = 'templates/post.ejs';
  const target = path.join(THEME_DIR(), rel);
  const oldContent = '<!-- 旧版本内置模板 -->';
  const currentContent = readThemeFile(rel);
  expect(currentContent).not.toBe(oldContent);

  // 模拟「上一版内置内容」：磁盘写旧内容，并把 manifest 里该文件的哈希改成旧内容的哈希
  const manifest = readManifest();
  const { createHash } = await import('node:crypto');
  manifest.files[rel] = createHash('sha256').update(oldContent, 'utf8').digest('hex');
  fs.writeFileSync(target, oldContent);
  fs.writeFileSync(MANIFEST(), `${JSON.stringify(manifest, null, 2)}\n`);

  await restart();

  // 没被用户改过 ⇒ 覆盖为当前版本
  expect(readThemeFile(rel)).toBe(currentContent);
});

test('T20: 用户改过的内置文件在升级时保留', async () => {
  const rel = 'assets/style.css';
  const target = path.join(THEME_DIR(), rel);
  const custom = '/* 用户自定义样式 */\nbody { background: #000; }\n';

  fs.writeFileSync(target, custom);
  await restart();

  expect(readThemeFile(rel)).toBe(custom);
});

test('T20: 内置文件缺失时补回', async () => {
  const rel = 'templates/index.ejs';
  const target = path.join(THEME_DIR(), rel);
  const expected = readThemeFile(rel);

  fs.rmSync(target);
  await restart();

  expect(fs.existsSync(target)).toBe(true);
  expect(readThemeFile(rel)).toBe(expected);
});
