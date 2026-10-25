import type { DefaultPageContext } from '../types';

export function IndexLayout({
  site,
  page,
  collections,
}: DefaultPageContext) {
  return (
    <section>
      <h1>{page.title || site.title}</h1>
      {page.description && <p className="lead">{page.description}</p>}

      <ul className="post-list">
        {collections.posts.map((post) => (
          <li key={post.id}>
            <a href={post.url ?? `/posts/${post.slug}/`}>{post.title}</a>
            {post.date && <time dateTime={post.date}>{post.date}</time>}
          </li>
        ))}
      </ul>
    </section>
  );
}
