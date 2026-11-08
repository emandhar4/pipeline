import { PDFDocument, StandardFonts } from 'pdf-lib';

/** A made-up person. Never real data: this repo is public. */
export const FICTIONAL_RESUME_LINES: string[] = [
  'Jordan Example | Columbus, OH | jordan@example.test',
  'Education',
  'Georgia Institute of Technology – Atlanta, GA',
  'Bachelor of Science in Industrial Engineering, Expected May 2027',
  'Experience',
  'Operations Intern, Acme Distribution Co. – June 2025 – August 2025',
  '- Mapped supply chain flows across three warehouse sites and cut logistics lead time 12%',
  '- Supported procurement and sourcing for 40 suppliers; rebuilt inventory reorder points',
  '- Wrote SQL queries and built a Tableau dashboard in place of weekly Excel reports',
];

/**
 * Builds a PDF with pdf-lib: `lines` on the first page (Helvetica, WinAnsi only), then
 * empty pages up to `pages`. `blank` draws no text at all.
 */
export async function makeResumePdf(
  lines: string[],
  opts: { pages?: number; blank?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = Math.max(1, opts.pages ?? 1);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    if (opts.blank) continue;
    const pageLines = i === 0 ? lines : [`Page ${i + 1}`];
    pageLines.forEach((line, n) => {
      page.drawText(line, { x: 50, y: 740 - n * 16, size: 10, font });
    });
  }
  return doc.save();
}
