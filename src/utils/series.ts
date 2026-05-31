import type { CollectionEntry } from 'astro:content';
import { postUrl } from './postUrl';

/** Editorial blurbs for each series (the post bodies carry the detail). */
const SERIES_META: Record<string, { blurb: string }> = {
  'Agent Auto Mode': {
    blurb:
      'Building Claude Code-style “auto mode” on a fully open-source stack, one layer at a time - the agent loop, the action classifier, policy-as-code sandboxing, and the red-team results.',
  },
};

export interface SeriesPart {
  n: number;
  title: string;
  date: Date;
  done: boolean;
  url: string;
}
export interface SeriesView {
  name: string;
  blurb: string;
  status: string;
  parts: SeriesPart[];
}

/** Group posts into series (by `series` frontmatter), ordered by `seriesOrder`. */
export function getSeries(posts: CollectionEntry<'blog'>[]): SeriesView[] {
  const byName = new Map<string, CollectionEntry<'blog'>[]>();
  for (const p of posts) {
    if (!p.data.series) continue;
    const list = byName.get(p.data.series) ?? [];
    list.push(p);
    byName.set(p.data.series, list);
  }

  return [...byName.entries()].map(([name, entries]) => {
    entries.sort((a, b) => (a.data.seriesOrder ?? 0) - (b.data.seriesOrder ?? 0));
    return {
      name,
      blurb: SERIES_META[name]?.blurb ?? '',
      status: `${entries.length} parts`,
      parts: entries.map((e) => ({
        n: e.data.seriesOrder ?? 0,
        title: e.data.title,
        date: e.data.pubDate,
        done: !e.data.draft,
        url: postUrl(e.data),
      })),
    };
  });
}

/** Posts that are not part of any series. */
export function oneOffs(posts: CollectionEntry<'blog'>[]): CollectionEntry<'blog'>[] {
  return posts.filter((p) => !p.data.series);
}
