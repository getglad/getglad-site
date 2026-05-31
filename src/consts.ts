/** Site-wide constants. Single source of truth for metadata. */
export const SITE_URL = 'https://getglad.me';
export const SITE_TITLE = 'Matthew Gladney';
export const SITE_DESCRIPTION =
  'Cloud security and agentic security research. I write software and try to secure cloud providers.';
export const SITE_AUTHOR = 'Matthew Gladney';
export const SITE_TAGLINE = 'I write software and try to secure cloud providers.';

/** Primary navigation. The wordmark links home; keep this list tight. */
export const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Writing', href: '/writing/' },
  { label: 'Projects', href: '/projects/' },
  { label: 'About', href: '/about/' },
];
