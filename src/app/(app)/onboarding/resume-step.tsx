'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, useTransition } from 'react';
import { RESUME_MESSAGES, UPLOAD_FAILED } from '@/lib/resume/messages';
import { newResumePath, RESUME_BUCKET, RESUME_MAX_BYTES } from '@/lib/resume/paths';
import { createBrowserClient } from '@/lib/supabase/client';
import { FormMessage } from './form-parts';
import { readResume } from './resume-actions';

const PDF_MAGIC = '%PDF-';

const noSubscribe = () => () => {};

/** False in the server HTML and until hydration, so a file picked too early is not dropped silently. */
function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** The same first checks the server makes, so a wrong file is caught before it is uploaded. */
async function checkFile(file: File): Promise<string | null> {
  if (file.size > RESUME_MAX_BYTES) return RESUME_MESSAGES.too_big;
  if (file.type && file.type !== 'application/pdf') return RESUME_MESSAGES.not_pdf;
  const head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer());
  if (String.fromCharCode(...head) !== PDF_MAGIC) return RESUME_MESSAGES.not_pdf;
  return null;
}

/**
 * Optional first onboarding step: upload a PDF resume to the user's own storage folder, have
 * the server read it, then go on to step 1 with the answers pre-filled. Nothing is saved to the
 * profile here.
 */
export function ResumeStep({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const hydrated = useHydrated();
  const busy = pending || !hydrated;

  function read(file: File | undefined) {
    if (!file || busy) return;
    setMessage(undefined);
    startTransition(async () => {
      const problem = await checkFile(file);
      if (problem) {
        setMessage(problem);
        return;
      }
      const path = newResumePath(userId, crypto.randomUUID());
      const { error } = await createBrowserClient()
        .storage.from(RESUME_BUCKET)
        .upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (error) {
        setMessage(UPLOAD_FAILED);
        return;
      }
      const result = await readResume(path);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      startTransition(() => router.push('/onboarding?step=1'));
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <FormMessage message={message} />
      {/* Always mounted so the change is announced. */}
      <p role="status" className="sr-only">
        {pending ? 'Reading your resume…' : ''}
      </p>

      <label
        htmlFor="resume-file"
        className="dropzone"
        data-dragging={dragging}
        aria-disabled={pending}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(e) => {
          // Moving onto a child also fires dragleave; only leaving the zone itself counts.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          read(e.dataTransfer.files[0]);
        }}
      >
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full bg-accent/10 text-accent"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
            <path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 13.5V15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5" />
          </svg>
        </span>
        {pending ? (
          <span className="font-medium" aria-hidden="true">
            Reading your resume…
          </span>
        ) : (
          <>
            <span className="font-medium">
              <span className="text-accent underline underline-offset-4">Choose a PDF</span> or drop it
              here
            </span>
            <span className="hint">Your resume as a PDF, up to 5 MB. It stays private to you.</span>
          </>
        )}
        <input
          id="resume-file"
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            read(e.target.files?.[0]);
            // Clear it so picking the same file again still fires a change.
            e.target.value = '';
          }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <Link href="/onboarding?step=1" className="btn-secondary min-w-32">
          Skip for now
        </Link>
        <p className="text-sm text-muted">You can answer everything by hand instead.</p>
      </div>
    </div>
  );
}
