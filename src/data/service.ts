export interface ServiceEntry {
  org: string;
  role: string;
  period?: string;
  href?: string;
}

/** Community service / working-group memberships. */
export const service: ServiceEntry[] = [
  {
    org: 'fwd:cloudsec',
    role: 'Organizing committee',
    period: '2026-present',
    href: 'https://fwdcloudsec.org/',
  },
  {
    org: 'CVE Artificial Intelligence Working Group',
    role: 'Member',
    href: 'https://www.cve.org/ProgramOrganization/WorkingGroups',
  },
];
