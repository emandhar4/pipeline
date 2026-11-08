import type { JobLevel } from './types';

const INTERN_RE = /\b(intern(ship)?s?|co-?ops?|summer analyst|summer associate)\b/i;
const NEW_GRAD_RE =
  /\b(new[- ]?grads?|new college grad\w*|recent grad\w*|early[- ]careers?|university grad\w*|entry[- ]level|graduate (program|programme|scheme|trainee)|college hire|campus hire|class of 20\d\d|associate product manager|apm)\b|\bgrad(uate)?s?\b(?!\s+(school|degree|student))/i;
const EXPERIENCED_RE = /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp)\b/i;

/** Title wins for early-career words; hints fill in for neutral titles; experienced words come last. */
export function classifyLevel(
  title: string,
  hints: { commitment?: string; employmentType?: string; simplify?: 'intern' | 'newgrad' } = {},
): JobLevel {
  if (INTERN_RE.test(title)) return 'internship';
  if (NEW_GRAD_RE.test(title)) return 'new_grad';
  if (hints.simplify === 'intern') return 'internship';
  if (hints.simplify === 'newgrad') return 'new_grad';
  for (const h of [hints.employmentType, hints.commitment]) {
    if (h && INTERN_RE.test(h)) return 'internship';
  }
  if (EXPERIENCED_RE.test(title)) return 'experienced';
  return 'unknown';
}
