# Pipeline: design

Status: draft for approval, 2026-11-07
Source brief: the user's prompt (`~/Downloads/Job_Search_Website_Claude_Code_Prompt.md`); this doc supersedes it where they differ.

## 1. Intent

Pipeline is a hosted, multi-user job search website. For each user it:
1. finds every posting that fits them, every day, without anyone's laptop being on;
2. tells them what to do today; and
3. tracks their whole pipeline from posting to offer.

The first test user is a student targeting internships. **The product must work for anyone else**: other majors, career stages (intern, new grad, experienced, career switcher) and fields. Nothing about the first user is hard-coded; their data is seed data and one test profile.

### Success looks like
- Opening the home screen answers in a few seconds: what to do today, which new postings are worth it, and how the pipeline is doing.
- A new user finishes onboarding steps 1–2 in about 2 minutes, and their first search runs right away.
- The daily finder runs unattended in the cloud and reports which sources/companies it covered and which it couldn't.

### Goals
- Broad, deduplicated posting coverage from public, terms-respecting sources.
- Scoring against the user's profile, with an optional "bar" from an offer already held.
- A pipeline with aging rules, a ranked Today list, and import of existing applications.
- A resume engine that tailors from the user's own experience bank under editable rules, and verifies the PDF.
- Later: Gmail/Calendar sync, contacts and outreach drafts, school-based company suggestions.

### Non-goals
- **Auto-applying to anything. Ever.**
- Scraping sites whose terms forbid it (LinkedIn especially), or bypassing bot detection or CAPTCHAs.
- Being a general CRM, ATS, or job board for employers.
- A native mobile app (the site should be responsive, that's all).

### Anti-goals (would be a failure even if it "works")
- Any part depending on the user's laptop being on.
- Labeling silence as a rejection. Silence is "stale" at 30 days and "no response" at 45.
- Inventing experience in a resume, or claiming anything on the user's "never claim" list.
- An unhandled 429 / error silently reported as "0 postings" for a board.
- The first user's personal resume rules or targets shipped as the defaults.
- A generic-looking template UI.
- An AI API key in the browser or the repo.
- A surprise bill: every paid service must have a hard cap or be on a free tier.

## 2. Decisions made

| Decision | Choice | Who decided |
|---|---|---|
| Name | "Pipeline" (placeholder) | user |
| Fork vs. fresh | Fresh build. Borrow ideas and MIT-licensed data from Gsync/jobsync, with attribution in `DECISIONS.md` and a `THIRD_PARTY_NOTICES` file. | user approved Claude's recommendation |
| Web app | Next.js (App Router, TypeScript) on Vercel free tier | user approved |
| Database / auth / files | Supabase (Postgres 17, Supabase Auth, Supabase Storage). Already linked: project `pipeline-agent`, ref `lxrtmkipbtdwjercczmt`. Vercel project `pipeline-agent` already linked. | user approved |
| Daily finder | GitHub Actions cron, TypeScript (Node 24). JobSpy (Python) is an optional later step, only for boards whose terms allow it. | user approved |
| Google Drive | Optional connection for files only (resume uploads, generated PDFs, exports). Never the database. | user |
| AI, stage 1 | AI steps run as **Claude cloud routines** on the user's Claude plan ($0 extra). The site writes a work queue; routines read it and write results back. Local desktop scheduled tasks don't qualify (laptop must be able to be off). | user (cloud constraint), Claude (routines) |
| AI, stage 2 | Anthropic API key with a monthly spend cap, server-side only. Haiku for scoring/drafting, Sonnet for resume tailoring. Switch is a config change. | user |
| Workflow | Work in 7 phases; demo each working before the next. Keep `DECISIONS.md` and `CLAUDE.md` in the repo. | user |
| Audience (v1) | **The first test user + a few invited users.** Invite-only signup (no open registration). Size everything for roughly ≤ 25 users. | user |
| AI per audience | Stage 1 routines (the owner's Claude plan) process **the owner's queue only**. Other users get the deterministic score and no AI features until stage 2 (API key) is switched on. The AI layer must be able to enable stage 2 per user or globally. | user |
| Coverage | **Internships and new grad** at launch. Phase 3 adds and vets new-grad sources (e.g. SimplifyJobs/New-Grad-Positions and any current jobright-ai new-grad repos), each with a terms check. Experienced/career-switcher users rely on the ATS watchlist in v1 (known gap). | user |
| GitHub repo | **Public** (unlimited free Actions minutes). Consequence: **no personal data in the repo, ever**: no real seed data, resumes, offers or tracker exports. | user |
| Test-user seed | **Real data in the hosted database**: the first user's real profile and any held offer, and their existing tracker imported in Phase 5. Loaded through the app's own onboarding/import flows or a gitignored local seed file, never a committed one. The repo's committed seed is fictional demo data. | user |
| Alerts (v1) | In-app only (dashboard + Today). Email digest is a later option (needs a free-tier sending provider). | Claude's call |
| Google OAuth | Stays in "testing" mode (≤ 100 named test users; fits invite-only). Drive uses the narrow file-only scope (`drive.file`) and lands in Phase 6 with the resume engine. Gmail/Calendar in Phase 7 use read-only scopes. Public verification is out of scope for v1. | Claude's call |

Why Supabase over Firebase (for the record): the data is relational (postings → applications → contacts → companies); the free tier has hard limits whereas Firebase Cloud Functions require pay-as-you-go with no hard cap; Supabase's 7-day inactivity pause is a non-issue because the finder writes daily. Main free-tier constraint: 500 MB database, so postings store a description **snippet**, not full text, and "gone" postings older than a retention window are pruned (builder sets the window).

## 3. Product

### 3.1 Home screen = dashboard
Three panels, readable in seconds:
1. **Today** — a ranked to-do list: assessments due, interviews, follow-ups owed, outreach to send, postings closing soon. Each item links to the thing to act on and can be marked done/snoozed.
2. **New postings worth it** — fresh postings that clear the user's bar, each with a fit score and its reasons, a "confirm pay" flag where pay is unknown, and (once those phases land) a tailored resume and a suggested recruiter/contact.
3. **Pipeline health** — funnel by stage (applied → screened → interviewed → final → offer), cold vs. referral conversion rates, and what's aging out.

### 3.2 Onboarding (in this order)
Step 0 is optional and Steps 1 and 2 are the fast path (~2 minutes); search starts after step 2. Steps 3–6 can be done later from the profile and show as Today items until done.
0. **Resume (optional):** upload a PDF resume to private storage. Text is extracted server-side with deterministic keyword matching (no LLM yet) to pre-fill school, major, graduation date, location and suggested fields; the user reviews everything before saving. "Skip for now" saves nothing.
1. **Who you are:** career stage, school, major, graduation date, work authorization, home location, school location, states they can work in (or anywhere in the US), other countries, and how they want to work: in person only, in person or remote, or remote only. In-state status is derived from home and school state. These set the search regions (home region, school region, or both) and grad-window eligibility.
2. **What you want:** fields picked from a category list (seeded from intern-list.com's categories) plus free text. Each field is **primary** (search hard) or **secondary** (show a few of the best, ranked lower). Plus preferred industries (a score bonus), industries to avoid (exclusion), pay floor, and season/term.
3. **Your bar (optional):** an offer already held (company, role, pay). Becomes apply/skip rules: a posting must clearly beat it on function, pay and brand. Industry preference is a bonus, not a gate.
4. **What you have:** resume upload, parsed into an experience bank (roles, projects, metrics, tools), and a "never claim" list.
5. **People and companies:** dream companies, companies that capped or rejected the user this cycle (suppressed or down-ranked), contacts/referrals by company.
6. **Automation and alerts:** alert style, import existing applications (paste a Handshake applied list, or CSV), and later Gmail/Calendar connection.

### 3.3 Posting finder (daily, cloud)
- **Sources:**
  - intern-list.com category lists matching users' fields (its robots.txt allows crawling; find the lowest-load way to read it; check whether detail pages link to the employer's apply URL and prefer that URL).
  - GitHub lists: SimplifyJobs/Summer2027-Internships, and the jobright-ai category repos (e.g. `2026-Business-Analyst-Internship`, `2026-Data-Analysis-Internship`, `2026-Product-Management-Internship`, `2026-Consultant-Internship`; use whichever year's repos are current for the user's season).
  - Public ATS endpoints for a watchlist: Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Rippling, Personio, Workable, Workday (POST endpoint).
  - New-grad sources (vetted in Phase 3): SimplifyJobs/New-Grad-Positions and current jobright-ai new-grad repos.
  - JobSpy boards later, terms permitting; never LinkedIn scraping.
- **Watchlist** is built automatically from: users' targets/dream companies, Fortune 500, big employers in each user's regions, and jobsync's Greenhouse/Lever/Ashby company directories. For each user, this includes large employers in their home and school regions. Each company records its detected ATS and board token, or "not covered" with a reason.
- **Normalize** every posting to: company, title, locations, source, source_url, apply_url, posted_date, first_seen, pay range, season, description snippet.
- **Dedupe** across sources; mark each posting `new`, `seen`, or `gone`. Keep every source a posting was found on.
- **Polite crawling:** per-host rate limits, an identifying user agent with a contact URL, robots.txt respected, retries with backoff on 429/5xx, and **a failed board is recorded as failed, not as empty**.
- **Run report:** each run writes per-source and per-company counts (fetched, new, seen, gone, failed + reason). Phase 3 shows the first run's numbers to the user before the cron is turned on.
- One shared crawl serves all users: postings are global; matching and scoring are per user.

### 3.4 Scoring and the bar
- **Filter** (hard): exclusions (avoided industries, capped/rejected companies), grad-window/eligibility, season, location vs. regions and relocation willingness, work authorization where the posting states it.
- **Score** (soft): field weight (primary ≫ secondary), keyword match against fields and experience bank, preferred-industry bonus, dream-company bonus, recency.
- **Pay:** below the floor → drop; unknown → keep, flagged "confirm pay".
- **Bar:** if the user has an offer, a posting is "worth it" only if it clearly beats it on function, pay and brand. How "clearly beats" is computed is left to the builder, but it must be explainable on the card in one line.
- Two-tier scoring: a cheap deterministic score on every posting, then AI fit scoring on only the top candidates per user (keeps AI cost bounded; idea borrowed from jobsync).

### 3.5 Applications pipeline
- Stages: saved → applied → screened → interviewed → final → offer, plus closed outcomes (rejected, withdrawn, no response, declined offer, accepted).
- Channel per application: cold vs. referral (for conversion rates).
- **Aging:** 30 days with no activity → "stale" (prompts a follow-up in Today); 45 days → auto-closed as "no response". Never labeled a rejection.
- **Import:** paste a Handshake applied list or upload CSV; map columns; dedupe against existing applications and postings.

### 3.6 Resume engine
- Default rule set ships with the site, built from current ATS practice: single column; standard section headers; consistent dates; 1–2 line bullets in XYZ format mirroring the posting's keywords; acronyms expanded; never invent experience.
- Each user can edit their rules. The first user's rules are seed data for their profile, not the defaults.
- Tailored resumes draw only from the user's experience bank and never use "never claim" items.
- Every generated PDF is verified by text extraction: the extracted text must appear in the intended order and section structure; a failed check blocks the download and shows why.

### 3.7 Later phase (7)
- Gmail and Calendar sync (Google OAuth, read-mostly) to detect application emails, assessments and interviews, feeding stages and Today.
- Contacts, and outreach drafts. **Drafts only; the user sends.**
- School-based company suggestions: start with a manually seeded list per school; report what data is realistically available (career-fair exhibitor lists, Handshake employer activity, alumni concentration).

## 4. Architecture

```
            ┌──────────────── Vercel (Next.js) ────────────────┐
 browser ──▶│ pages, server actions, API routes                │
            │ AI layer interface ─┬─ QueueProvider (stage 1)   │
            └──────────┬──────────┴─ AnthropicProvider (stg 2) ┘
                       │ supabase-js (user JWT, RLS)
            ┌──────────▼──────────── Supabase ──────────────────┐
            │ Postgres (RLS on every user table) · Auth · Storage│
            │ ai_jobs queue table                                │
            └───▲───────────────────────────────▲───────────────┘
   service key  │                               │ scoped access
   ┌────────────┴───────────┐        ┌──────────┴──────────────┐
   │ GitHub Actions (daily) │        │ Claude cloud routines   │
   │ finder: fetch→normalize│        │ read ai_jobs, write     │
   │ →dedupe→score→report   │        │ results (stage 1 only)  │
   └────────────────────────┘        └─────────────────────────┘
```

- **Data isolation:** every per-user table has Row Level Security keyed to `auth.uid()`. Global tables (companies, postings, sources, run reports) are readable by signed-in users and writable only by the service role.
- **Secrets:** Supabase secret key lives in Vercel env and GitHub Actions secrets only. Firecrawl key in GitHub Actions secrets. No secret in the repo or the browser. `.env.local` is gitignored (already).
- **AI layer:** one TypeScript interface (e.g. `scoreFit`, `tailorResume`, `draftOutreach`, `parseResume`) with two providers selected by config. Stage 1 `QueueProvider` inserts an `ai_jobs` row and the UI shows "pending" until a routine fills the result. Stage 2 `AnthropicProvider` calls the API directly, server-side, with model per task (Haiku vs. Sonnet).
- **Known risk to test before Phase 4 depends on it:** whether Claude cloud routines can reach Supabase. If they can, give them the narrowest credential that works (a dedicated Postgres role or a narrow API route limited to `ai_jobs` read/claim/complete). If not, move to stage 2 sooner (that's the user's call; ask then).

## 5. Data model (Phase 1)

Entity list; exact columns are the builder's, except where stated in §3.

- `profiles` (1:1 with auth user): career stage, school, major, grad date, work auth, home/school state, in-state flag (derived), school_id, major_cip, work_states, work_anywhere_us, work_countries, work_style, pay floor, season, alert style, onboarding progress.
- `profile_fields`: field/category, free-text label, weight (`primary` | `secondary`).
- `profile_industries`: industry, preference (`prefer` | `avoid`).
- `bars`: held offer (company, role, pay) and the derived rules.
- `companies` (global): name, aliases, ATS type, board token/tenant, regions, Fortune 500 flag, coverage status + reason.
- `user_companies`: per-user relation to a company (`dream` | `target` | `capped` | `rejected`).
- `postings` (global): the normalized fields from §3.3, status `new|seen|gone`, dedupe key.
- `posting_sources`: posting × source with source_url and first/last seen.
- `posting_matches` (per user): posting × user, filter result, scores, reasons, bar verdict, "confirm pay" flag, hidden/saved.
- `applications`: user × posting (or free-form company/title for imports), stage, channel, dates, last activity, outcome.
- `application_events`: stage changes and activity, for the funnel and aging.
- `contacts`: per user, by company, with referral flag; linked to applications.
- `tasks`: Today items (type, due, source object, status, snooze).
- `resume_rules`: default set (global) + per-user overrides.
- `experience_items`: experience bank (roles, projects, metrics, tools) + `never_claim` items.
- `resumes`: uploaded and generated files (Storage paths), with text-extraction check result.
- `ai_jobs`: queue (type, input, status, result, claimed_by, timestamps).
- `finder_runs` / `finder_run_items`: per run, per source/company counts and failures.
- `schools` / `school_companies`: seeded list for later suggestions.

## 6. Phases (each demoed before the next)

1. Repo setup (public GitHub repo), Next.js + Supabase wiring, data model + migrations + RLS, invite-only auth, `CLAUDE.md`, `DECISIONS.md`, deploy to Vercel. Then run Claude Code Setup recommendations.
2. Onboarding steps 1–2, dashboard shell showing the user's real rows and honest empty states (real data only: no fictional seed rows in shared tables); the first user then onboards themselves with real data on the hosted site.
3. Daily finder on GitHub Actions, internship + new-grad sources. First run's per-source numbers shown to the user **before** scheduling the cron.
4. Scoring, bar engine, "New postings worth it" panel; AI queue + routines (or the stage 2 decision).
5. Applications pipeline, aging rules, Today list, import (including the first user's existing tracker).
6. Resume engine (experience bank, user rules, tailored PDF with extraction check).
7. Gmail/Calendar sync, contacts and outreach drafts, school-based suggestions.

## 7. Left to the builder

- UI library and component choices (must not look templated; use the frontend-design guidance), charts library.
- Exact schema columns, indexes, dedupe key algorithm, retention window for `gone` postings.
- Score formula and weights, and the "clearly beats the bar" computation (must be explainable in one line).
- Rate-limit values, retry policy, user-agent string.
- How intern-list.com is read (Firecrawl vs. plain HTTP), as long as it's polite and low-load.
- Testing approach per phase (unit tests for finder normalizers/dedupe/scoring/aging at minimum; Playwright for UI flows).
- Default resume rule wording.
