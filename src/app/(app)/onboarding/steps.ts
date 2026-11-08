/**
 * Where a step in the onboarding marker links, or null when it is not a link: the current step,
 * and "What you want" (2) until step 1 has been saved (`savedStep >= 1`). The resume step and
 * "Who you are" are always reachable.
 */
export function stepHref(n: 0 | 1 | 2, current: 0 | 1 | 2, savedStep: number): string | null {
  if (n === current) return null;
  if (n === 0) return '/onboarding?step=resume';
  if (n === 1) return '/onboarding?step=1';
  return savedStep >= 1 ? '/onboarding?step=2' : null;
}
