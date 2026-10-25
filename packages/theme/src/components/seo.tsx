import type { SeoMeta } from '../types/seo';

export type WordmaSeoProps = {
  seo: SeoMeta;
};

/**
 * 输出 title、canonical、Open Graph 与 Twitter 元数据。
 */
export function WordmaSeo({ seo }: WordmaSeoProps) {
  const { openGraph, twitter } = seo;

  return (
    <>
      <title>{seo.title}</title>
      {seo.description && (
        <meta
          name="description"
          content={seo.description}
        />
      )}
      {seo.canonical && (
        <link rel="canonical" href={seo.canonical} />
      )}
      <meta property="og:type" content={openGraph.type} />
      <meta property="og:title" content={openGraph.title} />
      {openGraph.description && (
        <meta
          property="og:description"
          content={openGraph.description}
        />
      )}
      {openGraph.url && (
        <meta property="og:url" content={openGraph.url} />
      )}
      {openGraph.image && (
        <meta property="og:image" content={openGraph.image} />
      )}
      <meta
        property="og:site_name"
        content={openGraph.siteName}
      />
      {openGraph.locale && (
        <meta
          property="og:locale"
          content={openGraph.locale}
        />
      )}
      <meta name="twitter:card" content={twitter.card} />
      <meta
        name="twitter:title"
        content={twitter.title}
      />
      {twitter.description && (
        <meta
          name="twitter:description"
          content={twitter.description}
        />
      )}
      {twitter.image && (
        <meta name="twitter:image" content={twitter.image} />
      )}
    </>
  );
}
