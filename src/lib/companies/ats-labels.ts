import type { Database } from '../database.types'

type AtsKind = Database['public']['Enums']['ats_kind']

/** Display names for the job-board systems Pipeline reads. */
export const ATS_LABELS: Record<AtsKind, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  recruitee: 'Recruitee',
  rippling: 'Rippling',
  personio: 'Personio',
  workable: 'Workable',
  workday: 'Workday',
  other: 'Other',
  unknown: 'Unknown',
}

export type CoverageStatus = Database['public']['Enums']['coverage_status']

/** One line of status text for a watched company. */
export function coverageText(c: { coverage: CoverageStatus; ats: AtsKind; coverage_reason: string | null }): string {
  if (c.coverage === 'covered') return `Covered (${ATS_LABELS[c.ats]})`
  if (c.coverage === 'not_covered') return `Not covered: ${c.coverage_reason ?? 'no job board found'}`
  return 'Checking in the next run'
}
