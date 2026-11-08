# Third-party notices

## Gsync / jobsync (MIT)

Pipeline borrows ideas and MIT-licensed data from Gsync/jobsync. The license text and a list of what was borrowed will be added here when data is first imported (Phase 3).

## College Scorecard (public domain)

The `schools` seed (`supabase/migrations/20261108000700_seed_schools.sql`) comes from the US Department of Education College Scorecard API (https://collegescorecard.ed.gov/data/documentation/), a US Government work in the public domain. Retrieved 2026-11-08.

## CIP 2020 (public domain)

The `majors` seed (`supabase/migrations/20261108000600_seed_majors.sql`) comes from the Classification of Instructional Programs 2020, National Center for Education Statistics (https://nces.ed.gov/ipeds/cipcode/), a US Government work in the public domain.

## unpdf (MIT)

Resume text extraction uses `unpdf` (https://github.com/unjs/unpdf, MIT), which bundles Mozilla PDF.js (https://github.com/mozilla/pdf.js, Apache-2.0).

## pdf-lib (MIT, dev only)

`pdf-lib` (https://github.com/Hopding/pdf-lib, MIT) is used only in tests to generate sample PDFs. It is not shipped in the app.
