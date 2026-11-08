import { describe, expect, it } from 'vitest'
import { parseCareersUrl, slugCandidates } from '@/lib/companies/careers-url'

describe('parseCareersUrl', () => {
  it.each([
    ['https://boards.greenhouse.io/acme', { ats: 'greenhouse', token: 'acme', meta: {} }],
    ['https://job-boards.greenhouse.io/acme/jobs/123', { ats: 'greenhouse', token: 'acme', meta: {} }],
    ['https://jobs.lever.co/acme', { ats: 'lever', token: 'acme', meta: {} }],
    ['https://jobs.eu.lever.co/acme', { ats: 'lever', token: 'acme', meta: { region: 'eu' } }],
    ['https://jobs.ashbyhq.com/acme', { ats: 'ashby', token: 'acme', meta: {} }],
    ['https://careers.smartrecruiters.com/Acme', { ats: 'smartrecruiters', token: 'Acme', meta: {} }],
    ['https://acme.recruitee.com/', { ats: 'recruitee', token: 'acme', meta: {} }],
    ['https://apply.workable.com/acme/', { ats: 'workable', token: 'acme', meta: {} }],
    [
      'https://acme.wd5.myworkdayjobs.com/en-US/External',
      { ats: 'workday', token: 'acme', meta: { host: 'acme.wd5.myworkdayjobs.com', tenant: 'acme', site: 'External' } },
    ],
    [
      'https://acme.wd1.myworkdayjobs.com/Careers',
      { ats: 'workday', token: 'acme', meta: { host: 'acme.wd1.myworkdayjobs.com', tenant: 'acme', site: 'Careers' } },
    ],
  ])('parses %s', (url, expected) => {
    expect(parseCareersUrl(url)).toEqual(expected)
  })

  it.each([
    'javascript:alert(1)',
    'http://boards.greenhouse.io/x',
    'https://evil.test/boards.greenhouse.io/x',
    'https://boards.greenhouse.io/',
    'https://www.recruitee.com/',
    'https://acme.wd5.myworkdayjobs.com/',
    'https://example.com/careers',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(parseCareersUrl(url)).toBeNull()
  })
})

describe('slugCandidates', () => {
  it('gives compact and hyphenated forms, never a bare first word', () => {
    expect(slugCandidates('Acme Robotics, Inc.')).toEqual(['acmerobotics', 'acme-robotics'])
    expect(slugCandidates('Bank of America')).not.toContain('bank')
  })
  it('dedupes single words and handles empty input', () => {
    expect(slugCandidates('Stripe')).toEqual(['stripe'])
    expect(slugCandidates('')).toEqual([])
  })
})
