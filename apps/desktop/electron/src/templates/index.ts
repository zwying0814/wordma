/**
 * 内置单布局模板（EJS 字符串模块，随 esbuild bundle 打包）。
 * 两段式渲染：内容模板输出 body 片段 → base 模板包壳。
 */

export const BASE_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><%= title %></title>
  <link rel="stylesheet" href="<%= assetRoot %>assets/style.css" />
  <link rel="alternate" type="application/rss+xml" title="RSS" href="<%= assetRoot %>feed.xml" />
</head>
<body>
  <header class="site-header">
    <a class="site-name" href="<%= assetRoot %>"><%= site.name %></a>
    <nav class="site-nav">
      <% for (const p of navPages) { %>
        <a href="<%= p.url %>"><%= p.title %></a>
      <% } %>
      <a href="<%= urls.archive %>">归档</a>
      <a href="<%= urls.categories %>">分类</a>
      <a href="<%= urls.tags %>">标签</a>
    </nav>
  </header>
  <main class="site-main">
  <%- body %>
  </main>
  <footer class="site-footer">
    <p><%= footerText %> · <a href="<%= urls.feed %>">RSS</a></p>
  </footer>
</body>
</html>`;

export const POST_TEMPLATE = `<article class="post">
  <h1 class="post-title"><%= post.title %></h1>
  <div class="post-meta">
    <time datetime="<%= post.date %>"><%= post.date %></time>
    <% if (post.categoriesText) { %><span> · <%= post.categoriesText %></span><% } %>
    <% if (post.tagsText) { %><span> · <%= post.tagsText %></span><% } %>
    <span> · <%= post.wordCount %> 字</span>
  </div>
  <div class="post-content">
    <%- post.contentHtml %>
  </div>
</article>`;

export const PAGE_TEMPLATE = `<article class="page">
  <h1 class="page-title"><%= page.title %></h1>
  <div class="page-content">
    <%- page.contentHtml %>
  </div>
</article>`;

export const INDEX_TEMPLATE = `<div class="post-list">
  <% if (typeof taxonomy !== 'undefined' && taxonomy) { %>
    <h1 class="list-title"><%= taxonomy.kind === 'category' ? '分类' : '标签' %>：<%= taxonomy.name %></h1>
  <% } else { %>
    <h1 class="list-title">最新文章</h1>
  <% } %>
  <% for (const post of posts) { %>
    <article class="post-item">
      <h2><a href="<%= post.url %>"><%= post.title %></a></h2>
      <div class="post-item-meta">
        <time datetime="<%= post.date %>"><%= post.date %></time>
        <% if (post.categoriesText) { %><span> · <%= post.categoriesText %></span><% } %>
        <% if (post.tagsText) { %><span> · <%= post.tagsText %></span><% } %>
      </div>
    </article>
  <% } %>
  <% if (pagination.total > 1) { %>
    <nav class="pagination">
      <% if (pagination.prevUrl) { %><a href="<%= pagination.prevUrl %>">上一页</a><% } %>
      <span><%= pagination.current %> / <%= pagination.total %></span>
      <% if (pagination.nextUrl) { %><a href="<%= pagination.nextUrl %>">下一页</a><% } %>
    </nav>
  <% } %>
</div>`;

export const ARCHIVE_TEMPLATE = `<div class="archive">
  <h1 class="list-title">归档</h1>
  <% for (const group of groups) { %>
    <h2 class="archive-year"><%= group.year %></h2>
    <ul>
      <% for (const post of group.posts) { %>
        <li>
          <time datetime="<%= post.date %>"><%= post.date %></time>
          <a href="<%= post.url %>"><%= post.title %></a>
        </li>
      <% } %>
    </ul>
  <% } %>
</div>`;

export const TAXONOMIES_TEMPLATE = `<div class="taxonomies">
  <h1 class="list-title"><%= heading %></h1>
  <ul class="taxonomy-list">
    <% for (const item of items) { %>
      <li>
        <a href="<%= item.url %>"><%= item.name %></a>
        <span class="taxonomy-count">(<%= item.count %>)</span>
      </li>
    <% } %>
  </ul>
</div>`;

export const STYLE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: 'Geist', 'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif;
  color: #1f2328;
  background: #ffffff;
  line-height: 1.75;
}
.site-header {
  display: flex; align-items: center; justify-content: space-between;
  max-width: 720px; margin: 0 auto; padding: 20px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.site-name { font-weight: 700; font-size: 18px; color: #1f2328; text-decoration: none; }
.site-nav { display: flex; gap: 14px; flex-wrap: wrap; }
.site-nav a { color: #6b7280; text-decoration: none; font-size: 14px; }
.site-nav a:hover { color: #1f2328; }
.site-main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
.site-footer {
  max-width: 720px; margin: 0 auto; padding: 16px;
  border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 13px;
}
.site-footer a { color: inherit; }
.post-title, .page-title, .list-title { font-size: 30px; line-height: 1.3; margin: 0 0 8px; }
.post-meta, .post-item-meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
.post-item { padding: 16px 0; border-bottom: 1px solid #f3f4f6; }
.post-item h2 { margin: 0 0 4px; font-size: 19px; }
.post-item h2 a { color: #1f2328; text-decoration: none; }
.post-item h2 a:hover { text-decoration: underline; }
.post-content img { max-width: 100%; height: auto; border-radius: 8px; }
.post-content pre { background: #f6f8fa; padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 14px; }
.post-content code { font-family: 'Geist Mono', ui-monospace, monospace; }
.post-content :not(pre) > code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
.post-content blockquote { margin: 16px 0; padding: 4px 16px; border-left: 3px solid #d1d5db; color: #4b5563; }
.post-content table { border-collapse: collapse; width: 100%; }
.post-content th, .post-content td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
.pagination { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 32px; }
.pagination a { color: #3563d9; text-decoration: none; }
.archive-year { margin: 24px 0 8px; font-size: 20px; }
.archive ul { list-style: none; padding: 0; margin: 0; }
.archive li { padding: 4px 0; }
.archive time { color: #6b7280; font-size: 14px; margin-right: 12px; }
.taxonomy-list { list-style: none; padding: 0; }
.taxonomy-list li { padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
.taxonomy-list a { color: #1f2328; text-decoration: none; }
.taxonomy-count { color: #6b7280; font-size: 14px; }
kbd {
  border: 1px solid #d1d5db; border-bottom-width: 2px; border-radius: 4px;
  padding: 1px 5px; font-size: 0.85em; font-family: ui-monospace, monospace;
}
mark { background: #fef3c7; padding: 0 2px; }
`;
