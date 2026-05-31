import type { CollectionEntry } from 'astro:content';

type BlogData = CollectionEntry<'blog'>['data'];

/** Zero-pad to two digits. */
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Canonical path for a blog post (always trailing-slashed).
 *
 * - `legacy` posts resolve to their original dated permalink
 *   `/YYYY/MM/DD/slug/` so previously-indexed URLs keep working.
 * - New posts resolve to `/writing/slug/`.
 *
 * UTC date accessors are used so a post dated 2024-06-01 never renders as
 * /2024/05/31/ in a negative-offset timezone.
 */
export function postUrl(data: Pick<BlogData, 'legacy' | 'pubDate' | 'slug'>): string {
  if (data.legacy) {
    const d = data.pubDate;
    return `/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${data.slug}/`;
  }
  return `/writing/${data.slug}/`;
}
