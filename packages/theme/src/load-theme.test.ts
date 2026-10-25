import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { loadThemePackage } from './load-theme';

const root = path.resolve(import.meta.dirname, '../../..');

describe('loadThemePackage', () => {
  it('加载默认主题并校验入口', () => {
    const theme = loadThemePackage(path.join(root, 'themes/default'));

    expect(theme.manifest.id).toBe('wordma-theme-default');
    expect(theme.entry).toBe('./src/index.tsx');
    expect(theme.entryPath.endsWith('src/index.tsx')).toBe(true);
    expect(theme.manifest.settings.map((setting) => setting.key)).toContain(
      'accent',
    );
  });

  it('拒绝非法主题 manifest', () => {
    expect(() =>
      loadThemePackage(
        path.join(root, 'fixtures/broken/bad-theme/themes/bad'),
      ),
    ).toThrow();
  });
});
