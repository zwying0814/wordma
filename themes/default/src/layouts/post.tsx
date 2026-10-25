import type { DefaultPageContext } from '../types';

export function PostLayout({ page, content, theme }: DefaultPageContext) {
  return (
    <article className="prose">
      <h1>{page.title}</h1>
      {page.date && <time dateTime={page.date}>{page.date}</time>}
      {theme.showDescription !== false && page.description && (
        <p className="lead">{page.description}</p>
      )}
      <div dangerouslySetInnerHTML={{ __html: content.html }} />
    </article>
  );
}
