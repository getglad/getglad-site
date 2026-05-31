// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Custom Shiki theme matching the "quiet editorial" warm-dark code block:
// charcoal ground, soft-green keywords, warm strings, dim comments.
const warmDark = {
  name: 'getglad-warm',
  colors: { 'editor.background': '#2b2a26', 'editor.foreground': '#e9e5db' },
  settings: [
    { settings: { background: '#2b2a26', foreground: '#e9e5db' } },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#9a9488', fontStyle: 'italic' },
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'keyword.control',
        'constant.language',
        'variable.language',
      ],
      settings: { foreground: '#8fc7a6' },
    },
    {
      scope: ['string', 'string.quoted', 'constant.other.symbol', 'meta.attribute.python string'],
      settings: { foreground: '#d6a55f' },
    },
    { scope: ['constant.numeric', 'constant'], settings: { foreground: '#d6a55f' } },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function-call'],
      settings: { foreground: '#e9e5db' },
    },
    {
      scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class'],
      settings: { foreground: '#8fc7a6' },
    },
    { scope: ['entity.name.tag'], settings: { foreground: '#8fc7a6' } },
    { scope: ['punctuation', 'meta.brace'], settings: { foreground: '#b8b2a6' } },
  ],
};

// https://astro.build/config
export default defineConfig({
  site: 'https://getglad.me',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Speaking is kept in the project but unpublished: excluded from the sitemap
  // and marked noindex (see speaking.astro). It still builds but isn't surfaced.
  integrations: [mdx(), sitemap({ filter: (page) => !page.includes('/speaking/') })],
  markdown: {
    // Off so `--`/`---` and quotes render literally (no auto em/en dashes).
    smartypants: false,
    shikiConfig: { theme: warmDark, wrap: false },
  },
});
