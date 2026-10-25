import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  PageAssetsProvider,
  WordmaBodyEnd,
  WordmaHead,
} from './assets';
import type { PageAssets } from './assets';

function render(assets: PageAssets): string {
  return renderToStaticMarkup(
    <PageAssetsProvider assets={assets}>
      <html>
        <head>
          <WordmaHead />
        </head>
        <body>
          <WordmaBodyEnd />
        </body>
      </html>
    </PageAssetsProvider>,
  );
}

describe('WordmaHead / WordmaBodyEnd', () => {
  it('注入样式、importmap 与 module 脚本', () => {
    const html = render({
      styles: ['/style.css', '/island.css'],
      importMap: {
        react: '/assets/react.js',
        'react-dom/client': '/assets/react.js',
      },
      bodyScripts: ['/assets/mount.js'],
    });

    expect(html).toContain(
      '<link rel="stylesheet" href="/style.css"/>',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="/island.css"/>',
    );
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain('{"imports":{');
    expect(html).toContain(
      '"react":"/assets/react.js"',
    );
    expect(html).toContain(
      '<script type="module" src="/assets/mount.js"></script>',
    );
    expect(html.indexOf('type="importmap"')).toBeLessThan(
      html.indexOf('type="module"'),
    );
  });

  it('空资产不输出任何标签', () => {
    const html = render({
      styles: [],
      bodyScripts: [],
    });

    expect(html).not.toContain('stylesheet');
    expect(html).not.toContain('importmap');
    expect(html).not.toContain('type="module"');
  });

  it('importmap 中的 < 被转义', () => {
    const html = render({
      styles: [],
      importMap: {
        react: '/assets/react.js?x=<tag>',
      },
      bodyScripts: [],
    });

    expect(html).not.toContain('<tag>');
    expect(html).toContain('\\u003ctag>');
  });
});
