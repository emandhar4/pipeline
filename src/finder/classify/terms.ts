const SEASON = '(spring|summer|fall|autumn|winter)';
const SEASON_LIST = `${SEASON}(?:\\s*(?:/|,|&|and|or)\\s*${SEASON})*`;
const FORWARD = new RegExp(`\\b(${SEASON_LIST})[\\s,]*(?:of\\s+)?(20\\d\\d)\\b`, 'gi');
const BACKWARD = new RegExp(`\\b(20\\d\\d)[\\s,]*(${SEASON_LIST})\\b`, 'gi');
const ORDER = ['Spring', 'Summer', 'Fall', 'Winter'];

function canon(season: string): string {
  const s = season.toLowerCase();
  const name = s === 'autumn' ? 'fall' : s;
  return name[0].toUpperCase() + name.slice(1);
}

/** "Summer 2027", "2027 Summer", "Fall/Winter 2026" become sorted `"<Season> <YYYY>"` strings. */
export function termsFromText(text: string): string[] {
  const found = new Map<string, [number, number]>();
  const add = (seasons: string, year: string) => {
    for (const s of seasons.match(/spring|summer|fall|autumn|winter/gi) ?? []) {
      const season = canon(s);
      found.set(`${season} ${year}`, [Number(year), ORDER.indexOf(season)]);
    }
  };
  for (const m of text.matchAll(FORWARD)) add(m[1], m[m.length - 1]);
  for (const m of text.matchAll(BACKWARD)) add(m[2], m[1]);
  return [...found.entries()]
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1])
    .map(([k]) => k);
}
