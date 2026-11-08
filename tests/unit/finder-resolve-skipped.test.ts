import { describe, expect, it, vi } from 'vitest'
import type { Http } from '@/finder/http'
import { resolveCompany } from '@/finder/resolve'

vi.mock('@/finder/sources', () => ({
  fetchBoard: async () => ({
    scope: 's', source: 'x', companyId: null, status: 'skipped', reason: 'no adapter', fetched: 0, complete: false, postings: [],
  }),
}))

describe('resolveCompany with a skipped board', () => {
  it('counts skipped as not found', async () => {
    const http = {} as Http
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: null })).toEqual({
      notCovered: 'No public job board found from the name. Add its careers page link.',
    })
  })
})
