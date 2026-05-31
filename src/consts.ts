/** Site-wide constants. Single source of truth for metadata. */
export const SITE_URL = 'https://getglad.me';
export const SITE_TITLE = 'Matthew Gladney';
/** Default <title> for the home page / pages without their own title. */
export const SITE_TITLE_FULL = 'Matthew Gladney - Cloud & AI Security.';
export const SITE_DESCRIPTION =
  'I write software that secures cloud providers and AI agents - with AI agents. Cloud and AI security engineering, at scale.';
export const SITE_AUTHOR = 'Matthew Gladney';
export const SITE_TAGLINE =
  'Hi, I’m Matthew. I write software that secures cloud providers and AI agents, with AI agents.';

/** Primary navigation. The wordmark links home; keep this list tight. */
export const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Writing', href: '/writing/' },
  { label: 'Projects', href: '/projects/' },
  { label: 'About', href: '/about/' },
];
