export interface Patent {
  id: string;
  title: string;
  year: number;
  assignee: string;
  href: string;
}

/** Granted/published patents (public record on Google Patents). */
export const patents: Patent[] = [
  {
    id: 'US12021900B1',
    title: 'Using cached summaries for efficient access analysis for cloud provider entities',
    year: 2024,
    assignee: 'Rapid7',
    href: 'https://patents.google.com/patent/US12021900B1',
  },
  {
    id: 'US20210250306A1',
    title:
      'Providing on-demand production of graph-based relationships in a cloud computing environment',
    year: 2021,
    assignee: 'Capital One',
    href: 'https://patents.google.com/patent/US20210250306A1',
  },
];
