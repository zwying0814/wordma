import { normalizeSlug } from './slug';
import type { TaxonomyTerm } from './types/common';
import type { ContentEntry } from './types/content';

type TermCount = {
  name: string;
  slug: string;
  count: number;
};

function collectTerms(
  values: string[],
  counts: Map<string, TermCount>,
): void {
  const seenInEntry = new Set<string>();

  for (const raw of values) {
    const name = raw.trim();
    if (!name) continue;

    let slug: string;
    try {
      slug = normalizeSlug(name);
    } catch {
      continue;
    }

    // 同一篇文章里重复的 tag/category 只计一次。
    if (seenInEntry.has(slug)) continue;
    seenInEntry.add(slug);

    const existing = counts.get(slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(slug, { name, slug, count: 1 });
    }
  }
}

function toTerms(counts: Map<string, TermCount>): TaxonomyTerm[] {
  return [...counts.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name, 'zh-CN'),
    )
    .map(({ name, slug, count }) => ({ name, slug, count }));
}

export function buildTaxonomy(entries: ContentEntry[]): {
  tags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
} {
  const tags = new Map<string, TermCount>();
  const categories = new Map<string, TermCount>();

  for (const entry of entries) {
    collectTerms(entry.meta.tags, tags);
    collectTerms(entry.meta.categories, categories);
  }

  return {
    tags: toTerms(tags),
    categories: toTerms(categories),
  };
}
