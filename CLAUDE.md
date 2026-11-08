# Pipeline

Pipeline is a hosted, multi-user job search website. For each user it finds every posting that fits them, every day, without anyone's laptop being on; tells them what to do today; and tracks their whole pipeline from posting to offer. The first test user is a student targeting Summer 2027 internships, but the product must work for anyone (other majors, career stages and fields). Nothing about the first user is hard-coded.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind) on Vercel; hosted Supabase (Postgres, Auth, Storage); daily finder on GitHub Actions (TypeScript, Node 24).

## Commands

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint`
- `npm run typecheck` (`next typegen && tsc --noEmit`)
- `npm test` (Vitest: `tests/unit`, `tests/integration`)
- `npm run test:e2e` (Playwright)
- CI (`.github/workflows/ci.yml`): lint, typecheck, unit tests, build and `node scripts/check-bundle-secrets.mjs` on every push (any branch) and PR to `main`; integration tests only on push to `main`.

## Constraints

- Nothing may depend on the user's laptop being on. Every runtime piece is Vercel, Supabase or GitHub Actions.
- The GitHub repo is **public**: no personal data is ever committed (no real profile, offer, resume or tracker data). Real data enters through the app, or through a gitignored `supabase/seed.local.sql`. Committed seed data is fictional.
- No secret in the browser or the repo. `SUPABASE_SECRET_KEY` is used only in server-only modules (`import 'server-only'`) and in CI/Vercel secrets.
- Every per-user table has RLS enabled, with policies keyed to `auth.uid()`. Global tables are readable by `authenticated` and writable only by the service role.
- Signup is invite-only: an email can create an account only if it is in `invites` (compared case-insensitively).
- Supabase's built-in email only delivers to project team members, so magic-link email works for the project owner only. Invitees sign in with Google OAuth (or custom SMTP later).
- Free tiers only, no paid services.
- **No Docker.** Database commands target the linked hosted project (`supabase ... --linked`; check flags with `--help` for CLI 3.0).
- Integration tests run against the hosted project, which also holds real data. They touch only their own `@example.test` users and delete them in `afterAll`. They never read, modify or truncate other rows.
- Never auto-apply to anything. Never scrape sites whose terms forbid it.
- Supabase project ref: `lxrtmkipbtdwjercczmt`. Vercel project: `pipeline-agent`.

## Where things live

- Spec: `docs/superpowers/specs/2026-11-07-pipeline-design.md`
- Plans: `docs/superpowers/plans/`
- Decisions log: `DECISIONS.md`
- Third-party attributions: `THIRD_PARTY_NOTICES.md`

## Working rules

- Use Context7 for current library docs before writing code against a library (Next 16, Supabase, Vitest, Tailwind 4 differ from older versions).
- Read `node_modules/next/dist/docs/` for Next.js specifics (see `AGENTS.md`).
- Keep `DECISIONS.md` and this file up to date.
