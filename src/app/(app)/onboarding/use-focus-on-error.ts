'use client';

import { useEffect, type RefObject } from 'react';

/**
 * After a failed submit, moves focus to the first invalid control in the form, or to the
 * form-level message when no field is flagged, and scrolls it to the middle of the screen.
 * Runs whenever `trigger` changes to a new object while `active` is true.
 */
export function useFocusOnError(
  form: RefObject<HTMLFormElement | null>,
  trigger: unknown,
  active: boolean,
) {
  useEffect(() => {
    if (!active || !form.current) return;
    const target = form.current.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-invalid], [data-form-error], .field-error',
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only for a new result
  }, [trigger]);
}
