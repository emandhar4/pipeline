import type { ReactNode } from 'react';

/** Two-segment progress bar with "N of 2". The steps are a real sequence, so they are counted. */
export function StepMarker({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className="flex gap-1.5" aria-hidden="true">
        {[1, 2].map((n) => (
          <span
            key={n}
            className={`h-1 w-8 rounded-full ${n <= step ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </span>
      <span>{step} of 2</span>
    </div>
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
  ...input
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [hint ? `${name}-hint` : null, error ? errorId(name) : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
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
