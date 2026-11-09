/** Suffix words dropped from the end of a company name. Keep in sync with the SQL `normalize_company`. */
const SUFFIXES = new Set([
  'inc', 'llc', 'ltd', 'corp', 'corporation', 'co', 'company', 'plc', 'group', 'holdings',
]);

/**
 * Canonical company name used for matching. Pure; the SQL `normalize_company` must agree.
 * Algorithm, in order:
 *  1. lowercase;
 *  2. delete apostrophes (' and ’) and dots; replace `&` with ` and `;
 *  3. replace every character that is not a letter or digit (Unicode `\p{L}`, `\p{N}`) with a space;
 *  4. split on whitespace;
 *  5. while more than one token remains and the last token is one of
 *     inc, llc, ltd, corp, corporation, co, company, plc, group, holdings: drop it, and if the
 *     token before it is then `and` (more than one token left), drop that too ("Bain & Co" -> "bain");
 *  6. join with single spaces (empty input gives '').
 */
export function normalizeCompany(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
    if (tokens.length > 1 && tokens[tokens.length - 1] === 'and') tokens.pop();
  }
  return tokens.join(' ');
}
