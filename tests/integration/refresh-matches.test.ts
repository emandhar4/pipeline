import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { adminClient, createTestUser, deleteTestUser } from './helpers';
import { normalizeCompany } from '@/lib/companies/normalize';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

type Field = { category_slug: string | null; label: string; weight: 'primary' | 'secondary' };

type Profile = {
  career_stage: 'intern' | 'new_grad' | 'experienced' | 'career_switcher' | null;
  work_style: 'in_person' | 'either' | 'remote_only' | null;
  work_states: string[];
  work_anywhere_us: boolean;
  work_countries: string[];
  season: string | null;
  pay_floor_cents: number | null;
  pay_floor_period: 'hour' | 'year' | null;
  work_auth: 'citizen_or_pr' | 'no_sponsorship_needed' | 'needs_sponsorship' | null;
};

const BASE: Profile = {
  career_stage: 'intern',
  work_style: 'in_person',
  work_states: ['CA'],
  work_anywhere_us: false,
  work_countries: [],
  season: 'Summer 2027',
  pay_floor_cents: null,
  pay_floor_period: null,
  work_auth: null,
};

const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

const SWE: Field = {
  category_slug: 'software-engineering',
  label: 'Software Engineering',
  weight: 'primary',
};

// Postings default to a CA onsite Software Engineering internship with no terms.
const POSTING = {
  company_name: 'Test Co',
  title: 'Software Engineering Intern',
  locations: ['San Jose, CA'],
  states: ['CA'],
  countries: ['US'],
  remote: 'onsite',
  level: 'internship',
  terms: [] as string[],
  field_slugs: ['software-engineering'],
  location_unknown: false,
};

describe('refresh_matches', () => {
  const admin = adminClient();
  const suffix = randomBytes(4).toString('hex');
  const postingIds: string[] = [];
  const companyIds: string[] = [];
  let user: TestUser;
  let n = 0;

  beforeAll(async () => {
    user = await createTestUser('match');
  });

  afterAll(async () => {
    // posting_matches cascade from postings and from the user.
    if (postingIds.length) await admin.from('postings').delete().in('id', postingIds);
    if (user) await deleteTestUser(user.id, user.email);
    // user_companies cascade from the user; then the test companies can go.
    if (companyIds.length) await admin.from('companies').delete().in('id', companyIds);
  });

  /** Resets the whole profile, including industries, company relations and the bar. */
  async function setProfile(patch: Partial<Profile> = {}, fields: Field[] = [SWE]) {
    for (const table of ['profile_industries', 'user_companies', 'bars']) {
      const cleared = await admin.from(table).delete().eq('user_id', user.id);
      expect(cleared.error).toBeNull();
    }
    const upd = await admin
      .from('profiles')
      .update({ ...BASE, ...patch })
      .eq('user_id', user.id);
    expect(upd.error).toBeNull();
    const del = await admin.from('profile_fields').delete().eq('user_id', user.id);
    expect(del.error).toBeNull();
    if (fields.length) {
      const ins = await admin
        .from('profile_fields')
        .insert(fields.map((f) => ({ ...f, user_id: user.id })));
      expect(ins.error).toBeNull();
    }
  }

  async function makePosting(extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin
      .from('postings')
      .insert({ ...POSTING, dedupe_key: `test:match-${n++}-${suffix}`, ...extra })
      .select('id')
      .single();
    expect(error).toBeNull();
    postingIds.push(data!.id);
    return data!.id as string;
  }

  async function refresh(): Promise<string> {
    const { data, error } = await user.client.rpc('refresh_matches', { p_user: user.id });
    expect(error).toBeNull();
    return data as string;
  }

  async function row(postingId: string) {
    const { data, error } = await admin
      .from('posting_matches')
      .select('*')
      .eq('user_id', user.id)
      .eq('posting_id', postingId)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  async function passed(postingId: string): Promise<boolean> {
    return (await row(postingId))?.passed_filter ?? false;
  }

  it('null work_style is incomplete', async () => {
    await makePosting();
    await setProfile({ work_style: null });
    expect(await refresh()).toBe('incomplete');
    const { count, error } = await admin
      .from('posting_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('other missing answers are incomplete', async () => {
    await setProfile({ career_stage: null });
    expect(await refresh()).toBe('incomplete');
    await setProfile({ season: null });
    expect(await refresh()).toBe('incomplete');
    await setProfile({}, [{ ...SWE, weight: 'secondary' }]);
    expect(await refresh()).toBe('incomplete');
  });

  it('in_person with no places is incomplete; remote_only with no places is complete', async () => {
    await setProfile({ work_style: 'in_person', work_states: [] });
    expect(await refresh()).toBe('incomplete');
    await setProfile({ work_style: 'either', work_states: [] });
    expect(await refresh()).toBe('incomplete');
    await setProfile({ work_style: 'remote_only', work_states: [] });
    expect(await refresh()).toBe('ok');
  });

  it('remote_only gets only remote US postings', async () => {
    const onsite = await makePosting();
    const remoteUs = await makePosting({ locations: ['Remote - US'], states: [], remote: 'remote' });
    const remoteGb = await makePosting({
      locations: ['Remote - UK'], states: [], countries: ['GB'], remote: 'remote',
    });
    const remoteAny = await makePosting({ locations: ['Remote'], states: [], countries: [], remote: 'remote' });

    // First as an in-person CA user, so the onsite posting gets a row.
    await setProfile();
    expect(await refresh()).toBe('ok');
    expect(await passed(onsite)).toBe(true);

    await setProfile({ work_style: 'remote_only', work_states: [] });
    expect(await refresh()).toBe('ok');
    const r = await row(onsite);
    expect(r?.passed_filter).toBe(false);
    expect(r?.filter_reasons).toEqual(['place']);
    expect(await passed(remoteUs)).toBe(true);
    expect(await passed(remoteAny)).toBe(true);
    expect(await passed(remoteGb)).toBe(false);
  });

  it('either takes in-place postings and remote US postings', async () => {
    const onsiteNy = await makePosting({ locations: ['New York, NY'], states: ['NY'] });
    const onsiteCa = await makePosting();
    const remoteUs = await makePosting({ locations: ['Remote - US'], states: [], remote: 'remote' });
    await setProfile({ work_style: 'either' });
    await refresh();
    expect(await passed(onsiteCa)).toBe(true);
    expect(await passed(remoteUs)).toBe(true);
    expect(await passed(onsiteNy)).toBe(false);
  });

  it('anywhere in the US passes any US state', async () => {
    const tx = await makePosting({ locations: ['Austin, TX'], states: ['TX'] });
    const ca = await makePosting({ locations: ['Toronto, Canada'], states: [], countries: ['CA'] });
    await setProfile({ work_states: [], work_anywhere_us: true });
    expect(await refresh()).toBe('ok');
    expect(await passed(tx)).toBe(true);
    expect(await passed(ca)).toBe(false);
  });

  it('a chosen country passes postings there', async () => {
    const toronto = await makePosting({ locations: ['Toronto, Canada'], states: [], countries: ['CA'] });
    await setProfile({ work_states: [], work_countries: ['CA'] });
    expect(await refresh()).toBe('ok');
    expect(await passed(toronto)).toBe(true);
  });

  it('in_person excludes fully remote postings (no states)', async () => {
    const remote = await makePosting({ locations: ['Remote - US'], states: [], remote: 'remote' });
    await setProfile();
    await refresh();
    expect(await passed(remote)).toBe(false);
  });

  it('in_person anywhere in the US excludes fully remote US postings but keeps offices with a remote option', async () => {
    const remote = await makePosting({ locations: ['Remote - US'], states: [], remote: 'remote' });
    const office = await makePosting({ locations: ['San Jose, CA', 'Remote - US'], remote: 'remote' });
    await setProfile({ work_states: [], work_anywhere_us: true });
    expect(await refresh()).toBe('ok');
    expect(await passed(remote)).toBe(false);
    expect(await passed(office)).toBe(true);
  });

  it('either anywhere in the US passes fully remote US postings', async () => {
    const remote = await makePosting({ locations: ['Remote - US'], states: [], remote: 'remote' });
    await setProfile({ work_style: 'either', work_states: [], work_anywhere_us: true });
    expect(await refresh()).toBe('ok');
    expect(await passed(remote)).toBe(true);
  });

  it('in_person with a country passes an onsite office there but not a remote posting', async () => {
    const london = await makePosting({
      locations: ['London, UK'], states: [], countries: ['GB'], remote: 'onsite',
    });
    const remoteUk = await makePosting({
      locations: ['Remote - UK'], states: [], countries: ['GB'], remote: 'remote',
    });
    await setProfile({ work_states: [], work_countries: ['GB'] });
    expect(await refresh()).toBe('ok');
    expect(await passed(london)).toBe(true);
    expect(await passed(remoteUk)).toBe(false);
  });

  it('a posting in CA with a remote option passes both an in_person CA user and a remote_only user', async () => {
    const both = await makePosting({ locations: ['San Jose, CA', 'Remote - US'], remote: 'remote' });
    await setProfile();
    await refresh();
    expect(await passed(both)).toBe(true);
    await setProfile({ work_style: 'remote_only', work_states: [] });
    await refresh();
    expect(await passed(both)).toBe(true);
  });

  it('intern with Summer 2027 skips a Fall 2026 internship but passes one with no terms', async () => {
    const fall = await makePosting({ terms: ['Fall 2026'] });
    const none = await makePosting({ terms: [] });
    const summer = await makePosting({ terms: ['Summer 2027', 'Fall 2027'] });
    await setProfile();
    await refresh();
    expect(await passed(fall)).toBe(false);
    expect(await passed(none)).toBe(true);
    expect(await passed(summer)).toBe(true);
  });

  it('intern with Full-time season still matches internships only', async () => {
    const fall = await makePosting({ terms: ['Fall 2026'] });
    const newGrad = await makePosting({ title: 'Software Engineer, New Grad', level: 'new_grad' });
    await setProfile({ season: 'Full-time' });
    await refresh();
    expect(await passed(fall)).toBe(true);
    expect(await passed(newGrad)).toBe(false);
  });

  it('level follows career stage', async () => {
    const intern = await makePosting();
    const newGrad = await makePosting({ level: 'new_grad', terms: ['Fall 2026'] });
    const experienced = await makePosting({ level: 'experienced' });
    const unknown = await makePosting({ level: 'unknown' });

    // First as an intern, so the internship gets a row.
    await setProfile();
    await refresh();
    expect(await passed(intern)).toBe(true);

    await setProfile({ career_stage: 'new_grad', season: 'Full-time' });
    await refresh();
    expect(await passed(newGrad)).toBe(true);
    expect(await passed(intern)).toBe(false);
    expect(await passed(unknown)).toBe(false);

    await setProfile({ career_stage: 'career_switcher', season: 'Full-time' });
    await refresh();
    expect(await passed(experienced)).toBe(true);
    expect(await passed(unknown)).toBe(true);
    expect(await passed(newGrad)).toBe(false);
    const r = await row(intern);
    expect(r?.passed_filter).toBe(false);
    expect(r?.filter_reasons).toEqual(['level']);
  });

  it("free-text field 'Actuarial' matches title 'Actuarial Intern' and not 'Factual Reporting Intern'", async () => {
    const actuarial = await makePosting({ title: 'Actuarial Intern', field_slugs: [] });
    const factual = await makePosting({ title: 'Factual Reporting Intern', field_slugs: [] });
    await setProfile({}, [SWE, { category_slug: null, label: 'Actuarial', weight: 'secondary' }]);
    await refresh();
    const r = await row(actuarial);
    expect(r?.passed_filter).toBe(true);
    expect(r?.reasons).toMatchObject({
      fields: [{ label: 'Actuarial', weight: 'secondary' }],
      weight: 'secondary',
      location_unknown: false,
    });
    expect(await passed(factual)).toBe(false);
  });

  it('free-text labels with regex characters match literally', async () => {
    const cpp = await makePosting({ title: 'C++ Developer Intern', field_slugs: [] });
    const c = await makePosting({ title: 'C Developer Intern', field_slugs: [] });
    const rd = await makePosting({ title: 'R&D Intern (Materials)', field_slugs: [] });
    const dot = await makePosting({ title: 'Generalist Intern', field_slugs: [] });
    await setProfile({}, [
      { category_slug: null, label: 'C++', weight: 'primary' },
      { category_slug: null, label: 'r&d', weight: 'secondary' },
      { category_slug: null, label: '.*', weight: 'secondary' },
    ]);
    expect(await refresh()).toBe('ok');
    expect(await passed(cpp)).toBe(true);
    expect(await passed(c)).toBe(false);
    expect(await passed(rd)).toBe(true);
    expect(await passed(dot)).toBe(false);
  });

  it('category matches record primary and secondary fields', async () => {
    const both = await makePosting({
      title: 'Data Intern',
      field_slugs: ['data-analysis', 'software-engineering'],
    });
    await setProfile({}, [
      { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' },
      SWE,
    ]);
    await refresh();
    const r = await row(both);
    expect(r?.passed_filter).toBe(true);
    expect(r?.reasons).toMatchObject({
      fields: [
        { label: 'Software Engineering', weight: 'primary' },
        { label: 'Data Analysis', weight: 'secondary' },
      ],
      weight: 'primary',
    });
  });

  it('location_unknown passes with reason', async () => {
    const unknown = await makePosting({
      locations: [], states: [], countries: [], remote: 'unknown', location_unknown: true,
    });
    await setProfile({ work_states: ['NY'] });
    await refresh();
    const r = await row(unknown);
    expect(r?.passed_filter).toBe(true);
    expect(r?.reasons).toMatchObject({ location_unknown: true });
  });

  it('confirm_pay is set when the posting has no pay', async () => {
    const noPay = await makePosting();
    const paid = await makePosting({ pay_min_cents: 3000, pay_max_cents: 4000, pay_period: 'hour' });
    await setProfile();
    await refresh();
    expect((await row(noPay))?.confirm_pay).toBe(true);
    expect((await row(paid))?.confirm_pay).toBe(false);
    // Phase 4: a passing row is scored (primary 40 + new 20 + pay known, no floor 5).
    expect((await row(paid))?.base_score).toBe(65);
  });

  it('saved state survives a refresh that fails the posting', async () => {
    const p = await makePosting();
    await setProfile();
    await refresh();
    expect(await passed(p)).toBe(true);
    const saved = await user.client
      .from('posting_matches')
      .update({ state: 'saved' })
      .eq('user_id', user.id)
      .eq('posting_id', p);
    expect(saved.error).toBeNull();

    await setProfile({ work_states: ['NY'] });
    await refresh();
    const r = await row(p);
    expect(r?.state).toBe('saved');
    expect(r?.passed_filter).toBe(false);
    expect(r?.filter_reasons).toEqual(['place']);
  });

  it('cannot refresh another user', async () => {
    const { error } = await user.client.rpc('refresh_matches', { p_user: randomUUID() });
    expect(error).not.toBeNull();
  });

  it('gone postings are not matched', async () => {
    const gone = await makePosting({ status: 'gone' });
    await setProfile();
    await refresh();
    expect(await row(gone)).toBeNull();
  });

  it('runs as the service role for any user', async () => {
    const p = await makePosting();
    await setProfile();
    const { data, error } = await admin.rpc('refresh_matches', { p_user: user.id });
    expect(error).toBeNull();
    expect(data).toBe('ok');
    expect(await passed(p)).toBe(true);
  });

  // ---- Phase 4: filters, score and the bar ----

  async function makeCompany(label: string, extra: Record<string, unknown> = {}) {
    const name = `Test- ${label} ${suffix}`;
    const { data, error } = await admin
      .from('companies')
      .insert({ name, normalized_name: normalizeCompany(name), ...extra })
      .select('id')
      .single();
    expect(error).toBeNull();
    companyIds.push(data!.id);
    return { id: data!.id as string, name };
  }

  async function setIndustries(rows: { industry: string; preference: 'prefer' | 'avoid' }[]) {
    const { error } = await admin
      .from('profile_industries')
      .insert(rows.map((r) => ({ ...r, user_id: user.id })));
    expect(error).toBeNull();
  }

  async function setRelation(companyId: string, relation: 'target' | 'dream' | 'capped' | 'rejected') {
    const { error } = await admin
      .from('user_companies')
      .insert({ user_id: user.id, company_id: companyId, relation });
    expect(error).toBeNull();
  }

  async function setBar(bar: {
    company?: string | null;
    role?: string | null;
    pay_cents?: number | null;
    pay_period?: 'hour' | 'year' | null;
    role_field_slugs?: string[];
  }) {
    const { error } = await admin.from('bars').insert({ user_id: user.id, ...bar });
    expect(error).toBeNull();
  }

  /** A fresh posting (explicit first_seen) for the scoring cases. */
  function fresh(extra: Record<string, unknown> = {}) {
    return makePosting({ first_seen: daysAgo(1), ...extra });
  }

  it('avoid industry excludes a company with that industry', async () => {
    const widgets = await makeCompany('Widget Works', { industry: 'Test Sector / Widgets' });
    const bank = await makeCompany('Bank', { industry: 'Financials / Test Banks' });
    const factory = await makeCompany('Factory', { industry: 'Industrials / Test Things' });
    const pw = await fresh({ company_id: widgets.id });
    const pb = await fresh({ company_id: bank.id });
    const pf = await fresh({ company_id: factory.id });
    await setProfile();
    await refresh();
    expect(await passed(pw)).toBe(true);

    await setProfile();
    // 'Widgets' with its s dropped begins a word; 'Finance' matches 'Financials'; 'Art' is not a word start.
    await setIndustries([
      { industry: 'widgets', preference: 'avoid' },
      { industry: 'Finance', preference: 'avoid' },
      { industry: 'Art', preference: 'avoid' },
    ]);
    await refresh();
    const r = await row(pw);
    expect(r?.passed_filter).toBe(false);
    expect(r?.filter_reasons).toEqual(['industry']);
    expect(r?.base_score).toBeNull();
    expect(await passed(pb)).toBe(false);
    expect(await passed(pf)).toBe(true);
  });

  it('avoid industry ignores unknown industry', async () => {
    const unknown = await makeCompany('No Industry');
    const p = await fresh({ company_id: unknown.id });
    const noCompany = await fresh();
    await setProfile();
    await setIndustries([{ industry: 'Widgets', preference: 'avoid' }]);
    await refresh();
    expect(await passed(p)).toBe(true);
    expect(await passed(noCompany)).toBe(true);
  });

  it('rejected company is filtered and capped company scores 25 lower', async () => {
    const rejected = await makeCompany('Rejected');
    const capped = await makeCompany('Capped');
    const pr = await fresh({ company_id: rejected.id });
    const pc = await fresh({ company_id: capped.id });
    const plain = await fresh();
    await setProfile();
    await refresh();
    expect(await passed(pr)).toBe(true);

    await setProfile();
    await setRelation(rejected.id, 'rejected');
    await setRelation(capped.id, 'capped');
    await refresh();
    const r = await row(pr);
    expect(r?.passed_filter).toBe(false);
    expect(r?.filter_reasons).toEqual(['company']);
    const c = await row(pc);
    expect(c?.passed_filter).toBe(true);
    expect(c?.reasons).toMatchObject({ capped: true, dream: false });
    const base = (await row(plain))?.base_score;
    expect(base).toBe(60);
    expect(c?.base_score).toBe(35);
  });

  it('hourly posting vs yearly floor', async () => {
    const low = await fresh({ pay_min_cents: 1800, pay_max_cents: 2000, pay_period: 'hour' });
    const high = await fresh({ pay_min_cents: 3000, pay_max_cents: null, pay_period: 'hour' });
    await setProfile();
    await refresh();
    expect(await passed(low)).toBe(true);

    await setProfile({ pay_floor_cents: 5_000_000, pay_floor_period: 'year' });
    await refresh();
    const l = await row(low);
    expect(l?.passed_filter).toBe(false);
    expect(l?.filter_reasons).toEqual(['pay']);
    const h = await row(high);
    expect(h?.passed_filter).toBe(true);
    expect(h?.confirm_pay).toBe(false);
    expect(h?.reasons).toMatchObject({ pay_ok: true });
  });

  it('zero pay is unknown', async () => {
    const zero = await fresh({ pay_min_cents: 0, pay_max_cents: 0, pay_period: 'year' });
    await setProfile({ pay_floor_cents: 5_000_000, pay_floor_period: 'year' });
    await refresh();
    const r = await row(zero);
    expect(r?.passed_filter).toBe(true);
    expect(r?.confirm_pay).toBe(true);
    expect(r?.reasons).toMatchObject({ pay_ok: null });
    expect(r?.base_score).toBe(60);
  });

  it("needs_sponsorship fails 'none' and 'citizens_only', passes null; no_sponsorship_needed fails only 'citizens_only'", async () => {
    const none = await fresh({ sponsorship: 'none' });
    const citizens = await fresh({ sponsorship: 'citizens_only' });
    const offers = await fresh({ sponsorship: 'offers' });
    const unknown = await fresh({ sponsorship: null });
    await setProfile({ work_auth: 'citizen_or_pr' });
    await refresh();
    for (const p of [none, citizens, offers, unknown]) expect(await passed(p)).toBe(true);

    await setProfile({ work_auth: 'needs_sponsorship' });
    await refresh();
    expect((await row(none))?.filter_reasons).toEqual(['work_auth']);
    expect((await row(citizens))?.filter_reasons).toEqual(['work_auth']);
    expect(await passed(offers)).toBe(true);
    expect(await passed(unknown)).toBe(true);

    await setProfile({ work_auth: 'no_sponsorship_needed' });
    await refresh();
    expect(await passed(none)).toBe(true);
    expect(await passed(citizens)).toBe(false);
    expect(await passed(offers)).toBe(true);
    expect(await passed(unknown)).toBe(true);
  });

  it('score adds up', async () => {
    const dream = await makeCompany('Dream', { industry: 'Test Sector / Widgets' });
    const p = await makePosting({
      company_id: dream.id,
      first_seen: daysAgo(2),
      pay_min_cents: 6_000_000,
      pay_max_cents: null,
      pay_period: 'year',
    });
    await setProfile({ pay_floor_cents: 5_000_000, pay_floor_period: 'year' });
    await setIndustries([{ industry: 'Widget', preference: 'prefer' }]);
    await setRelation(dream.id, 'dream');
    await refresh();
    const r = await row(p);
    expect(r?.passed_filter).toBe(true);
    expect(r?.base_score).toBe(95); // 40 primary + 20 fresh + 20 dream + 10 industry + 5 pay
    expect(r?.confirm_pay).toBe(false);
    expect(r?.bar_verdict).toBe('no_bar');
    expect(r?.reasons).toEqual({
      fields: [{ label: 'Software Engineering', weight: 'primary' }],
      weight: 'primary',
      location_unknown: false,
      age_days: 2,
      dream: true,
      capped: false,
      preferred_industry: 'Widget',
      pay_ok: true,
      bar: null,
    });
  });

  it('a secondary field on a 40-day-old posting scores 15', async () => {
    const p = await makePosting({
      title: 'Data Intern',
      field_slugs: ['data-analysis'],
      first_seen: daysAgo(40),
    });
    await setProfile({}, [SWE, { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' }]);
    await refresh();
    const r = await row(p);
    expect(r?.base_score).toBe(15);
    expect(r?.reasons).toMatchObject({ weight: 'secondary', age_days: 40, pay_ok: null });
  });

  it('age uses the newer of posted_date and first_seen', async () => {
    const posted = new Date(Date.now() - 5 * DAY_MS).toISOString().slice(0, 10);
    const p = await makePosting({ first_seen: daysAgo(20), posted_date: posted });
    await setProfile();
    await refresh();
    const r = await row(p);
    expect(r?.reasons).toMatchObject({ age_days: 5 });
    expect(r?.base_score).toBe(55); // 40 + 15
  });

  it('bar beats on pay', async () => {
    const better = await fresh({ pay_min_cents: 6_000_000, pay_period: 'year' });
    const same = await fresh({ pay_min_cents: 5_500_000, pay_period: 'year' });
    const worse = await fresh({ pay_min_cents: 5_000_000, pay_period: 'year' });
    const unknown = await fresh();
    await setProfile();
    await setBar({ pay_cents: 2500, pay_period: 'hour' }); // $52,000 a year
    await refresh();
    const b = await row(better);
    expect(b?.bar_verdict).toBe('beats');
    expect(b?.reasons.bar).toEqual({ pay: 'better', pay_pct: 15, brand: 'same', function: 'same' });
    const s = await row(same);
    expect(s?.bar_verdict).toBe('does_not_beat');
    expect(s?.reasons.bar).toEqual({ pay: 'same', pay_pct: 6, brand: 'same', function: 'same' });
    const w = await row(worse);
    expect(w?.bar_verdict).toBe('does_not_beat');
    expect(w?.reasons.bar).toEqual({ pay: 'worse', pay_pct: -4, brand: 'same', function: 'same' });
    const u = await row(unknown);
    expect(u?.bar_verdict).toBe('does_not_beat');
    expect(u?.reasons.bar).toEqual({ pay: null, pay_pct: null, brand: 'same', function: 'same' });
  });

  it('bar loses on brand', async () => {
    const sp = await makeCompany('Offer SP', { is_fortune500: true });
    const p = await fresh({ pay_min_cents: 6_000_000, pay_period: 'year' });
    await setProfile();
    await setBar({ company: sp.name, pay_cents: 2500, pay_period: 'hour' });
    await refresh();
    const r = await row(p);
    expect(r?.bar_verdict).toBe('does_not_beat');
    expect(r?.reasons.bar).toEqual({ pay: 'better', pay_pct: 15, brand: 'worse', function: 'same' });
  });

  it('bar beats on function', async () => {
    const p = await fresh();
    await setProfile({}, [SWE, { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' }]);
    await setBar({ role: 'Data Analyst Intern', role_field_slugs: ['data-analysis'] });
    await refresh();
    const r = await row(p);
    expect(r?.bar_verdict).toBe('beats');
    expect(r?.reasons.bar).toMatchObject({ function: 'better', brand: 'same', pay: null });
  });

  it('bar with only company', async () => {
    const offer = await makeCompany('Only Offer', { is_fortune500: true });
    const dream = await makeCompany('Only Dream');
    const peer = await makeCompany('Only Peer', { is_fortune500: true });
    const atDream = await fresh({ company_id: dream.id });
    const atPeer = await fresh({ company_id: peer.id });
    await setProfile();
    await setRelation(dream.id, 'dream');
    await setBar({ company: offer.name });
    await refresh();
    const d = await row(atDream);
    expect(d?.bar_verdict).toBe('beats');
    expect(d?.reasons.bar).toEqual({ pay: null, pay_pct: null, brand: 'better', function: 'same' });
    const s = await row(atPeer);
    expect(s?.bar_verdict).toBe('does_not_beat');
    expect(s?.reasons.bar).toEqual({ pay: null, pay_pct: null, brand: 'same', function: 'same' });
  });

  it('bar company unknown', async () => {
    const sp = await makeCompany('Unknown Bar SP', { is_fortune500: true });
    const atSp = await fresh({ company_id: sp.id });
    const atNone = await fresh();
    await setProfile();
    await setBar({ company: `Test- Nowhere ${suffix}` }); // no companies row: tier 0
    await refresh();
    const s = await row(atSp);
    expect(s?.bar_verdict).toBe('beats');
    expect(s?.reasons.bar).toMatchObject({ brand: 'better' });
    const n0 = await row(atNone);
    expect(n0?.bar_verdict).toBe('does_not_beat');
    expect(n0?.reasons.bar).toMatchObject({ brand: 'same', function: 'same', pay: null });
  });

  it('a dream offer company is tier 2', async () => {
    const offer = await makeCompany('Dream Offer');
    const sp = await makeCompany('Dream Offer SP', { is_fortune500: true });
    const p = await fresh({ company_id: sp.id });
    await setProfile();
    await setRelation(offer.id, 'dream');
    await setBar({ company: offer.name });
    await refresh();
    const r = await row(p);
    expect(r?.bar_verdict).toBe('does_not_beat');
    expect(r?.reasons.bar).toMatchObject({ brand: 'worse' });
  });

  it('no bar', async () => {
    const p = await fresh();
    await setProfile();
    await refresh();
    const r = await row(p);
    expect(r?.bar_verdict).toBe('no_bar');
    expect(r?.reasons.bar).toBeNull();
  });

  it('state survives refresh', async () => {
    const saved = await fresh();
    const hidden = await fresh();
    await setProfile();
    await refresh();
    for (const [id, state] of [[saved, 'saved'], [hidden, 'hidden']] as const) {
      const u = await user.client
        .from('posting_matches')
        .update({ state })
        .eq('user_id', user.id)
        .eq('posting_id', id);
      expect(u.error).toBeNull();
    }
    const old = await row(saved);
    const ai = await admin
      .from('posting_matches')
      .update({ ai_score: 8, reasons: { ...old!.reasons, ai_reason: 'Strong fit.' } })
      .eq('user_id', user.id)
      .eq('posting_id', saved);
    expect(ai.error).toBeNull();

    // A profile edit that changes the score, then a refresh.
    await setProfile({ pay_floor_cents: 5_000_000, pay_floor_period: 'year' });
    await setBar({ pay_cents: 2500, pay_period: 'hour' });
    await refresh();
    const s = await row(saved);
    expect(s?.state).toBe('saved');
    expect(s?.ai_score).toBe(8);
    expect(s?.reasons).toMatchObject({ ai_reason: 'Strong fit.', bar: { pay: null } });
    expect(s?.bar_verdict).toBe('does_not_beat');
    const h = await row(hidden);
    expect(h?.state).toBe('hidden');
    expect(h?.passed_filter).toBe(true);
  });
});
