import type { DefaultPageContext } from '../types';

export function NotFoundLayout({
  site,
  helpers,
}: DefaultPageContext) {
  return (
    <section className="not-found">
      <h1>404</h1>
      <p>页面不存在。</p>
      <a href={helpers.url('/')}>返回 {site.title}</a>
    </section>
  );
}
