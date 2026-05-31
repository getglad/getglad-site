export type SocialIcon = 'github' | 'linkedin' | 'stackoverflow';

export interface Social {
  label: string;
  href: string;
  icon: SocialIcon;
}

/** Profiles linked in the header, footer, and About page. */
export const socials: Social[] = [
  { label: 'GitHub', href: 'https://github.com/getglad', icon: 'github' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mgladney', icon: 'linkedin' },
  {
    label: 'Stack Overflow',
    href: 'https://stackoverflow.com/users/1886901',
    icon: 'stackoverflow',
  },
];
