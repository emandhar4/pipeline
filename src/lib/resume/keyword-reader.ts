import 'server-only';
import { isUsState } from '@/lib/onboarding/regions';
import { searchMajors, searchSchools } from '@/lib/onboarding/lookups';
import { FIELD_KEYWORDS } from './field-keywords';
import {
  findGradDate,
  findHomeLocation,
  findMajorPhrases,
  findSchoolPhrases,
  suggestFields,
} from './parse';
import type { ResumeReader } from './reader';
import type { ResumeSuggestions } from './types';

/** True when the lookup name (or its part before "-", e.g. a campus suffix) and the phrase contain one another. */
function sameName(hitName: string, phrase: string): boolean {
  const p = phrase.toLowerCase().trim();
  const full = hitName.toLowerCase().trim();
  const base = full.split('-')[0].trim();
  return [full, base].some((n) => n.length > 0 && (p.includes(n) || n.includes(p)));
}

/** Rule-based reader: regex heuristics plus the school and major lookup tables. */
export const keywordResumeReader: ResumeReader = async (text, { client, today, categoryOrder }) => {
  let school: ResumeSuggestions['school'] = null;
  for (const phrase of findSchoolPhrases(text)) {
    const [hit] = await searchSchools(client, phrase, 1);
    if (hit && sameName(hit.name, phrase)) {
      const state = hit.state && isUsState(hit.state) ? hit.state : null;
      school = { id: hit.id, name: hit.name, city: hit.city, state };
      break;
    }
  }

  let major: ResumeSuggestions['major'] = null;
  const majorPhrases = findMajorPhrases(text);
  for (const phrase of majorPhrases) {
    const [hit] = await searchMajors(client, phrase, 1);
    if (hit && sameName(hit.title, phrase)) {
      major = { cip: hit.cip, title: hit.title };
      break;
    }
  }
  if (!major && majorPhrases.length > 0) major = { cip: null, title: majorPhrases[0] };

  const home = findHomeLocation(text);
  return {
    version: 1,
    school,
    major,
    grad_date: findGradDate(text, today),
    home_location: home?.location ?? null,
    home_state: home?.state ?? null,
    // LLM-UPGRADE: role/field inference is the main gain from the API.
    fields: suggestFields(text, FIELD_KEYWORDS, categoryOrder),
  };
};
