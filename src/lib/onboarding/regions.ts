const STATE_LIST = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
] as const;

export type UsState = (typeof STATE_LIST)[number][0];

/** The 50 states plus DC, alphabetical by name. No territories. */
export const US_STATES: readonly { code: UsState; name: string }[] = STATE_LIST.map(([code, name]) => ({
  code,
  name,
}));

const STATE_ORDER = new Map<string, number>(US_STATES.map((s, i) => [s.code, i]));
const STATE_BY_NAME = new Map<string, UsState>(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));

export function isUsState(s: string): s is UsState {
  return STATE_ORDER.has(s);
}

/** BEA regions. */
export const AREAS: readonly { key: string; label: string; states: UsState[] }[] = [
  { key: 'new-england', label: 'New England', states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'] },
  { key: 'mid-atlantic', label: 'Mid-Atlantic', states: ['DE', 'DC', 'MD', 'NJ', 'NY', 'PA'] },
  { key: 'great-lakes', label: 'Great Lakes', states: ['IL', 'IN', 'MI', 'OH', 'WI'] },
  { key: 'plains', label: 'Plains', states: ['IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'] },
  {
    key: 'southeast',
    label: 'Southeast',
    states: ['AL', 'AR', 'FL', 'GA', 'KY', 'LA', 'MS', 'NC', 'SC', 'TN', 'VA', 'WV'],
  },
  { key: 'southwest', label: 'Southwest', states: ['AZ', 'NM', 'OK', 'TX'] },
  { key: 'rocky-mountain', label: 'Rocky Mountain', states: ['CO', 'ID', 'MT', 'UT', 'WY'] },
  { key: 'far-west', label: 'West Coast, Alaska and Hawaii', states: ['AK', 'CA', 'HI', 'NV', 'OR', 'WA'] },
];

/** Removes every state in `group` if all are selected, otherwise adds the missing ones. Sorted, deduped. */
export function toggleStates(selected: UsState[], group: UsState[]): UsState[] {
  const set = new Set(selected);
  if (group.every((s) => set.has(s))) {
    for (const s of group) set.delete(s);
  } else {
    for (const s of group) set.add(s);
  }
  return [...set].sort((a, b) => STATE_ORDER.get(a)! - STATE_ORDER.get(b)!);
}

/** Reads the part after the last comma (or the whole text); accepts a USPS code or full state name. */
export function stateFromLocation(text: string): UsState | null {
  const part = text.slice(text.lastIndexOf(',') + 1).trim();
  if (!part) return null;
  const upper = part.toUpperCase();
  if (isUsState(upper)) return upper;
  return STATE_BY_NAME.get(part.toLowerCase()) ?? null;
}

const EXCLUDED_COUNTRIES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']);

/** ISO 3166-1 alpha-2 officially assigned codes, minus the US and its territories. */
export const COUNTRIES: readonly string[] = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
)
  .split(' ')
  .filter((c) => !EXCLUDED_COUNTRIES.has(c));

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryName(code: string): string {
  return regionNames.of(code) ?? code;
}
