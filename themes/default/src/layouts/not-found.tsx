import type { DefaultPageContext } from '../types';

export function NotFoundLayout({ site }: DefaultPageContext) {
  return (
    <section className="not-found">
      <h1>404</h1>
      <p>页面不存在。</p>
      <a href="/">返回 {site.title}</a>
    </section>
  );
}
