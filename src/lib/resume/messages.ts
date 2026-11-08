/** User-facing resume messages. Pure, so the browser-side checks reuse the exact wording. */
export const UPLOAD_FAILED = 'Upload failed. Try again in a minute, or skip this step.';

export const RESUME_MESSAGES = {
  too_big: 'That file is over 5 MB. Upload a smaller PDF, or skip this step.',
  not_pdf: "That file isn't a PDF. Upload a PDF, or skip this step.",
  too_many_pages: 'That PDF is over 10 pages. Upload just your resume, or skip this step.',
  unreadable:
    "We couldn't open that PDF. It may be password-protected. Try another file, or skip this step.",
  no_text:
    "We couldn't find any text in that PDF (it may be a scanned image). Skip this step and fill in your answers by hand.",
} as const;
