export type SeoOpenGraph = {
  title: string;
  description?: string;
  type: 'article' | 'website';
  url?: string;
  image?: string;
  siteName: string;
  locale?: string;
};

export type SeoTwitter = {
  card: 'summary' | 'summary_large_image';
  title: string;
  description?: string;
  image?: string;
};

export type SeoMeta = {
  title: string;
  description?: string;
  canonical?: string;
  openGraph: SeoOpenGraph;
  twitter: SeoTwitter;
};
