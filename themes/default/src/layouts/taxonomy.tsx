import type { DefaultPageContext } from '../types';

export function TaxonomyLayout({
  page,
  taxonomy,
  helpers,
}: DefaultPageContext) {
  const view = taxonomy.view;

  if (!view) {
    return (
      <section>
        <h1>{page.title}</h1>
        <p className="lead">没有分类或标签数据。</p>
      </section>
    );
  }

  if (!('term' in view)) {
    const terms =
      view.kind === 'categories'
        ? taxonomy.categories
        : taxonomy.tags;
    const label = view.kind === 'categories' ? '分类' : '标签';

    return (
      <section>
        <h1>{page.title}</h1>
        {terms.length === 0 ? (
          <p className="lead">还没有{label}。</p>
        ) : (
          <ul className="taxonomy-list">
            {terms.map((term) => (
              <li key={term.slug}>
                <a href={term.url ? helpers.url(term.url) : '#'}>
                  {term.name}
                </a>
                <span className="taxonomy-count">
                  ({term.count})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section>
      <h1>{page.title}</h1>
      {view.posts.length === 0 ? (
        <p className="lead">没有文章。</p>
      ) : (
        <ul className="post-list">
          {view.posts.map((post) => (
            <li key={post.id}>
              <a href={post.url ? helpers.url(post.url) : '#'}>
                {post.title}
              </a>
              {post.date && (
                <time dateTime={post.date}>{post.date}</time>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
