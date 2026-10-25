import type { CSSProperties, ReactNode } from 'react';

import {
  WordmaBodyEnd,
  WordmaHead,
  WordmaSeo,
} from '@wordma/theme';

import type { DefaultPageContext } from '../types';

type RootLayoutProps = DefaultPageContext & {
  children?: ReactNode;
};

export function RootLayout({
  site,
  theme,
  helpers,
  seo,
  children,
}: RootLayoutProps) {
  const accent = theme.accent ?? '#3563d9';

  return (
    <html lang={site.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <WordmaSeo seo={seo} />
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
