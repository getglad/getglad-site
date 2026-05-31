import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Blog posts. `legacy: true` posts keep their original dated permalink
 * (/YYYY/MM/DD/slug/) to preserve indexed URLs; new posts live at
 * /writing/slug/. The URL is derived centrally in src/utils/postUrl.ts.
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    slug: z.string(),
    categories: z.array(z.string()).default([]),
    legacy: z.boolean().default(false),
    draft: z.boolean().default(false),
    ogImage: z.string().optional(),
    // Multi-part series grouping (e.g. the Overseer-in-the-loop series).
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
  }),
});

const talks = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/talks' }),
  schema: z.object({
    title: z.string(),
    event: z.string(),
    date: z.coerce.date(),
    location: z.string().optional(),
    description: z.string(),
    youtubeId: z.string().optional(),
    slidesUrl: z.string().url().optional(),
    eventUrl: z.string().url().optional(),
    role: z.enum(['speaker', 'organizer', 'speaker+organizer']).default('speaker'),
    upcoming: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(['active', 'open-sourcing', 'series', 'archived']).default('active'),
    tech: z.array(z.string()).default([]),
    repoUrl: z.string().url().optional(),
    link: z.string().url().optional(),
    license: z.string().optional(),
    highlights: z.array(z.string()).default([]),
    order: z.number().default(0),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog, talks, projects };
