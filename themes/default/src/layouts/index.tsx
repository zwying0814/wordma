import type { DefaultPageContext } from '../types';

export function IndexLayout({
  site,
  page,
  collections,
  pagination,
  helpers,
}: DefaultPageContext) {
  const posts = collections.posts;
  const pageSize =
    pagination?.pageSize ?? Math.max(posts.length, 1);
  const currentPage = pagination?.currentPage ?? 1;
  const items = pagination
    ? posts.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      )
    : posts;

  const postUrl = (url: string | undefined): string =>
    url ? helpers.url(url) : '#';

  return (
    <section>
      <h1>{page.title || site.title}</h1>
      {page.description && <p className="lead">{page.description}</p>}

      {items.length === 0 ? (
        <p className="lead">还没有文章。</p>
      ) : (
        <ul className="post-list">
          {items.map((post) => (
            <li key={post.id}>
              <a href={postUrl(post.url)}>{post.title}</a>
              {post.date && (
                <time dateTime={post.date}>{post.date}</time>
              )}
            </li>
          ))}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav className="pagination">
          {pagination.prevUrl ? (
            <a href={pagination.prevUrl}>上一页</a>
          ) : (
            <span />
          )}
          <span>
            {pagination.currentPage} / {pagination.totalPages}
          </span>
          {pagination.nextUrl ? (
            <a href={pagination.nextUrl}>下一页</a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
