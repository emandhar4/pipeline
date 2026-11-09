import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

type Field = { category_slug: string | null; label: string; weight: 'primary' | 'secondary' };

type Profile = {
  career_stage: 'intern' | 'new_grad' | 'experienced' | 'career_switcher' | null;
  work_style: 'in_person' | 'either' | 'remote_only' | null;
  work_states: string[];
  work_anywhere_us: boolean;
  work_countries: string[];
  season: string | null;
};

const BASE: Profile = {
  career_stage: 'intern',
  work_style: 'in_person',
  work_states: ['CA'],
  work_anywhere_us: false,
  work_countries: [],
  season: 'Summer 2027',
};

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
  let user: TestUser;
  let n = 0;

  beforeAll(async () => {
    user = await createTestUser('match');
  });

  afterAll(async () => {
    // posting_matches cascade from postings and from the user.
    if (postingIds.length) await admin.from('postings').delete().in('id', postingIds);
    if (user) await deleteTestUser(user.id, user.email);
  });

  async function setProfile(patch: Partial<Profile> = {}, fields: Field[] = [SWE]) {
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
    expect((await row(paid))?.base_score).toBeNull();
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
});
