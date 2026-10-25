import type { CSSProperties, ReactNode } from 'react';

import { WordmaBodyEnd, WordmaHead } from '@wordma/theme';

import type { DefaultPageContext } from '../types';

type RootLayoutProps = DefaultPageContext & {
  children?: ReactNode;
};

export function RootLayout({
  site,
  page,
  theme,
  helpers,
  children,
}: RootLayoutProps) {
  const accent = theme.accent ?? '#3563d9';

  return (
    <html lang={site.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>
          {page.title ? `${page.title} · ${site.title}` : site.title}
        </title>
        {page.description && (
          <meta name="description" content={page.description} />
        )}
        <WordmaHead />
      </head>
      <body style={{ '--wordma-accent': accent } as CSSProperties}>
        <header className="site-header">
          <a className="site-title" href={helpers.url('/')}>
            {site.title}
          </a>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <span>{site.title}</span>
        </footer>
        <WordmaBodyEnd />
      </body>
    </html>
  );
}
