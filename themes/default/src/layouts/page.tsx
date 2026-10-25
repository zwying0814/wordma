import type { DefaultPageContext } from '../types';

export function PageLayout({ page, content, theme }: DefaultPageContext) {
  return (
    <article className="prose">
      <h1>{page.title}</h1>
      {theme.showDescription !== false && page.description && (
        <p className="lead">{page.description}</p>
      )}
      <div dangerouslySetInnerHTML={{ __html: content.html }} />
    </article>
  );
}
