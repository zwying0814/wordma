import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { WordmaSeo } from './seo';
import type { SeoMeta } from '../types/seo';

function render(seo: SeoMeta): string {
  return renderToStaticMarkup(<WordmaSeo seo={seo} />);
}

describe('WordmaSeo', () => {
  it('输出完整 title、canonical、OG 与 Twitter 标签', () => {
    const html = render({
      title: 'Hello · Site',
      description: 'Description',
      canonical: 'https://example.com/docs/posts/hello/',
      openGraph: {
        title: 'Hello · Site',
        description: 'Description',
        type: 'article',
        url: 'https://example.com/docs/posts/hello/',
        image: 'https://example.com/docs/assets/cover.png',
        siteName: 'Site',
        locale: 'zh-CN',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Hello · Site',
        description: 'Description',
        image: 'https://example.com/docs/assets/cover.png',
      },
    });

    expect(html).toContain('<title>Hello · Site</title>');
    expect(html).toContain(
      '<meta name="description" content="Description"/>',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://example.com/docs/posts/hello/"/>',
    );
    expect(html).toContain(
      '<meta property="og:type" content="article"/>',
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://example.com/docs/assets/cover.png"/>',
    );
    expect(html).toContain(
      '<meta property="og:site_name" content="Site"/>',
    );
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image"/>',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://example.com/docs/assets/cover.png"/>',
    );

    expect(html.indexOf('<title>')).toBeLessThan(
      html.indexOf('canonical'),
    );
    expect(html.indexOf('canonical')).toBeLessThan(
      html.indexOf('og:type'),
    );
    expect(html.indexOf('og:type')).toBeLessThan(
      html.indexOf('twitter:card'),
    );
  });

  it('省略可选字段', () => {
    const html = render({
      title: 'Site',
      openGraph: {
        title: 'Site',
        type: 'website',
        siteName: 'Site',
      },
      twitter: {
        card: 'summary',
        title: 'Site',
      },
    });

    expect(html).toContain('<title>Site</title>');
    expect(html).not.toContain('name="description"');
    expect(html).not.toContain('canonical');
    expect(html).not.toContain('og:description');
    expect(html).not.toContain('og:url');
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('og:locale');
    expect(html).not.toContain('twitter:description');
    expect(html).not.toContain('twitter:image');
  });
});
