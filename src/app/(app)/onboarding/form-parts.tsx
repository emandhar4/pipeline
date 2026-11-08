import type { ReactNode } from 'react';

const STEP_NAMES = ['Resume (optional)', 'Who you are', 'What you want'] as const;

/** Three named steps with a bar each; the current one is marked. The resume step is optional. */
export function StepMarker({ step }: { step: 0 | 1 | 2 }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
        {STEP_NAMES.map((name, n) => (
          <li
            key={name}
            aria-current={n === step ? 'step' : undefined}
            className={`flex flex-col gap-2 ${n === step ? 'font-medium text-foreground' : 'text-muted'}`}
          >
            <span
              aria-hidden="true"
              className={`h-1 rounded-full ${n <= step ? 'bg-accent' : 'bg-line'}`}
            />
            <span>{name}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function badgeId(name: string) {
  return `${name}-badge`;
}

/** A small tag beside a field label, e.g. "from resume". Fields list it in aria-describedby. */
export function FieldBadge({ name, children }: { name: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <span id={badgeId(name)} className="combo-badge">
      {children}
    </span>
  );
}

export function errorId(name: string) {
  return `${name}-error`;
}

export function FieldError({ name, error }: { name: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={errorId(name)} className="field-error" tabIndex={-1}>
      {error}
    </p>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      tabIndex={-1}
      data-form-error
      className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

/** A calm note at the top of a form that says what came from the user's resume. */
export function PrefillNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm"
    >
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </p>
  );
}

/** One line beside the submit button after a failed submit; announced to screen readers. */
export function SubmitSummary({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {count === 1 ? '1 answer needs attention above.' : `${count} answers need attention above.`}
    </p>
  );
}

/** A labelled text input with an optional hint and inline error. */
export function TextField({
  name,
  label,
  hint,
  error,
  badge,
  ...input
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  badge?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [
    badge ? badgeId(name) : null,
    hint ? `${name}-hint` : null,
    error ? errorId(name) : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        <FieldBadge name={name}>{badge}</FieldBadge>
      </div>
      <input
        id={name}
        name={name}
        className="field"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {hint ? (
        <p id={`${name}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
      <FieldError name={name} error={error} />
    </div>
  );
}

function hintId(name: string, value: string) {
  return `${name}-${value}-hint`;
}

/** A radio group drawn as bordered rows; the native radio stays visible. An option's hint shows under its label. */
export function ChoiceGroup({
  name,
  legend,
  options,
  defaultValue,
  error,
  columns = 1,
  onChange,
}: {
  name: string;
  legend: ReactNode;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string | null;
  error?: string;
  columns?: 1 | 2 | 3;
  onChange?: (value: string) => void;
}) {
  const grid = { 1: '', 2: 'sm:grid-cols-2', 3: 'grid-cols-3' }[columns];
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error ? errorId(name) : undefined}
    >
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((o) => (
          <label key={o.value} className="choice">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              data-invalid={error ? true : undefined}
              aria-describedby={
                [o.hint ? hintId(name, o.value) : '', error ? errorId(name) : ''].filter(Boolean).join(' ') ||
                undefined
              }
              onChange={onChange ? () => onChange(o.value) : undefined}
            />
            {o.hint ? (
              <span className="flex flex-col">
                <span>{o.label}</span>
                {/* Read as the option's description, not part of its name. */}
                <span id={hintId(name, o.value)} className="hint" aria-hidden="true">
                  {o.hint}
                </span>
              </span>
            ) : (
              <span>{o.label}</span>
            )}
          </label>
        ))}
      </div>
      <FieldError name={name} error={error} />
    </fieldset>
  );
}
