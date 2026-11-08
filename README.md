# Pipeline

Pipeline is a hosted, multi-user job search website. For each user it finds every posting that fits them, every day, without anyone's laptop being on; tells them what to do today; and tracks their whole pipeline from posting to offer.

Signup is **invite-only**: an email can create an account only if it is on the invite list. Nothing is ever auto-applied.

## What works today

- Invite-only sign-in (email link for the owner; Google once its OAuth client is set up).
- Two-step onboarding at `/onboarding`: who you are, then the fields you want (primary or secondary), industries to prefer or avoid, pay floor and season. Edit it later at `/profile`.
- The dashboard: Today, New postings worth it, and Pipeline health. Each panel shows your own data or an empty state; the daily finder that fills postings comes next.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind) on Vercel; hosted Supabase (Postgres, Auth, Storage); a daily finder on GitHub Actions.

## Running locally

1. `npm ci`
2. Copy `.env.example` to `.env.local` and fill in the Supabase project values (there is no Docker or local database; development targets the hosted project).
3. `npm run dev`

Other commands: `npm run lint`, `npm run typecheck`, `npm test` (unit + integration; integration needs the Supabase secret key), `npm run test:e2e`.

## CI

GitHub Actions runs lint, typecheck, unit tests, a production build and a client-bundle secret check on every push and on pull requests to `main`. Integration tests run on pushes to `main` only.

## More

- Design spec: [`docs/superpowers/specs/2026-11-07-pipeline-design.md`](docs/superpowers/specs/2026-11-07-pipeline-design.md)
- Decisions log: [`DECISIONS.md`](DECISIONS.md)
- Third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
