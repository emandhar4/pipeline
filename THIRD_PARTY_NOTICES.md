# Third-party notices

## Gsync / jobsync (MIT)

The `companies` watchlist seed (`supabase/migrations/20261109000200_seed_companies.sql`) uses the Greenhouse, Lever and Ashby board lists from https://github.com/Gsync/jobsync (commit 8c20325c35dbf203334a270cef5aef446f06a774, `src/lib/scraper/*/companies.json`), under this license:

```
MIT License

Copyright (c) 2024 gsync

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## S&P 500 constituents (ODC PDDL)

The same seed uses company names and headquarters locations from https://github.com/datasets/s-and-p-500-companies (commit 05c998c3e714b8dc9b621239bbdef92bccefc376, `data/constituents.csv`), released under the Open Data Commons Public Domain Dedication and License (PDDL 1.0, https://opendatacommons.org/licenses/pddl/1-0/).

## College Scorecard (public domain)

The `schools` seed (`supabase/migrations/20261108000700_seed_schools.sql`) comes from the US Department of Education College Scorecard API (https://collegescorecard.ed.gov/data/documentation/), a US Government work in the public domain. Retrieved 2026-11-08.

## CIP 2020 (public domain)

The `majors` seed (`supabase/migrations/20261108000600_seed_majors.sql`) comes from the Classification of Instructional Programs 2020, National Center for Education Statistics (https://nces.ed.gov/ipeds/cipcode/), a US Government work in the public domain.

## unpdf (MIT)

Resume text extraction uses `unpdf` (https://github.com/unjs/unpdf, MIT), which bundles Mozilla PDF.js (https://github.com/mozilla/pdf.js, Apache-2.0).

## pdf-lib (MIT, dev only)

`pdf-lib` (https://github.com/Hopding/pdf-lib, MIT) is used only in tests to generate sample PDFs. It is not shipped in the app.
