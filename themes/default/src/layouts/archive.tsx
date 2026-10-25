import type { DefaultPageContext } from '../types';

export function ArchiveLayout({
  page,
  archive,
  helpers,
}: DefaultPageContext) {
  const postUrl = (url: string | undefined): string =>
    url ? helpers.url(url) : '#';

  return (
    <section>
      <h1>{page.title}</h1>

      {!archive || archive.length === 0 ? (
        <p className="lead">还没有文章。</p>
      ) : (
        archive.map((group) => (
          <section key={group.year} className="archive">
            <h2 className="archive-year">{group.year}</h2>
            <ul className="post-list">
              {group.posts.map((post) => (
                <li key={post.id}>
                  <a href={postUrl(post.url)}>{post.title}</a>
                  {post.date && (
                    <time dateTime={post.date}>{post.date}</time>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
