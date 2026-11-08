# Decisions

Each entry: decision, why, who decided. Source: design spec section 2.

## 2026-11-07

### Name
- **Decision:** "Pipeline" (placeholder name).
- **Why:** Needed a working name; easy to change later.
- **Who decided:** user

### Fork vs. fresh build
- **Decision:** Fresh build. Borrow ideas and MIT-licensed data from Gsync/jobsync, with attribution here and in `THIRD_PARTY_NOTICES.md`.
- **Why:** The product must serve many users and fields; a fresh design avoids inheriting single-user assumptions while still reusing useful open data.
- **Who decided:** user approved Claude's recommendation

### Web app
- **Decision:** Next.js (App Router, TypeScript) on the Vercel free tier.
- **Why:** Hosted, free, fits the cloud-only constraint.
- **Who decided:** user approved

### Database / auth / files
- **Decision:** Supabase (Postgres 17, Supabase Auth, Supabase Storage). Project `pipeline-agent`, ref `lxrtmkipbtdwjercczmt`; Vercel project `pipeline-agent`; both already linked.
- **Why:** The data is relational (postings, applications, contacts, companies). The free tier has hard limits, whereas Firebase Cloud Functions require pay-as-you-go with no hard cap. Supabase's 7-day inactivity pause is a non-issue because the finder writes daily. Main constraint: 500 MB database, so postings store a description snippet and "gone" postings older than a retention window are pruned.
- **Who decided:** user approved

### Daily finder
- **Decision:** GitHub Actions cron, TypeScript (Node 24). JobSpy (Python) is an optional later step, only for boards whose terms allow it.
- **Why:** Runs unattended in the cloud for free on a public repo.
- **Who decided:** user approved

### Google Drive
- **Decision:** Optional connection for files only (resume uploads, generated PDFs, exports). Never the database.
- **Why:** Keeps the database authoritative and Drive access minimal.
- **Who decided:** user

### AI, stage 1
- **Decision:** AI steps run as Claude cloud routines on the user's Claude plan ($0 extra). The site writes a work queue; routines read it and write results back. Local desktop scheduled tasks do not qualify.
- **Why:** No extra cost, and the laptop must be able to be off.
- **Who decided:** user (cloud constraint), Claude (routines)

### AI, stage 2
- **Decision:** Anthropic API key with a monthly spend cap, server-side only. Haiku for scoring/drafting, Sonnet for resume tailoring. Switching is a config change.
- **Why:** Scales AI features to other users without a surprise bill.
- **Who decided:** user

### Workflow
- **Decision:** Work in 7 phases; demo each working before the next. Keep `DECISIONS.md` and `CLAUDE.md` in the repo.
- **Why:** Keeps scope controlled and gives the user a checkpoint per phase.
- **Who decided:** user

### Audience (v1)
- **Decision:** The first user plus a few invited users. Invite-only signup (no open registration). Size everything for roughly 25 users or fewer.
- **Why:** Limits cost, support burden and abuse surface.
- **Who decided:** user

### AI per audience
- **Decision:** Stage 1 routines process the first user's queue only. Other users get the deterministic score and no AI features until stage 2 is switched on. The AI layer must be able to enable stage 2 per user or globally.
- **Why:** Routines run on one person's Claude plan.
- **Who decided:** user

### Coverage
- **Decision:** Internships and new grad at launch. Phase 3 adds and vets new-grad sources (e.g. SimplifyJobs/New-Grad-Positions and current jobright-ai new-grad repos), each with a terms check. Experienced and career-switcher users rely on the ATS watchlist in v1 (known gap).
- **Why:** Matches the first users while keeping source vetting manageable.
- **Who decided:** user

### GitHub repo
- **Decision:** Public (unlimited free Actions minutes). No personal data in the repo, ever: no real seed data, resumes, offers or tracker exports.
- **Why:** Free CI minutes; the consequence is strict data hygiene.
- **Who decided:** user

### Test-user seed
- **Decision:** Real data lives in the hosted database: the first user's real profile and held offer, and their existing tracker imported in Phase 5. Loaded through the app's own onboarding/import flows or a gitignored local seed file, never a committed one. The committed seed is fictional demo data.
- **Why:** Realistic testing without leaking personal data into a public repo.
- **Who decided:** user

### Alerts (v1)
- **Decision:** In-app only (dashboard and Today). Email digest is a later option (needs a free-tier sending provider).
- **Why:** Avoids a sending-provider dependency in v1.
- **Who decided:** Claude's call

### Google OAuth
- **Decision:** Stays in "testing" mode (up to 100 named test users; fits invite-only). Drive uses the narrow file-only scope (`drive.file`) and lands in Phase 6 with the resume engine. Gmail/Calendar in Phase 7 use read-only scopes. Public verification is out of scope for v1.
- **Why:** Verification is slow and unnecessary for an invite-only audience.
- **Who decided:** Claude's call

### Invite-only signup hook
- **Decision:** `before_user_created` hook is `public.hook_require_invite` (invites table, case-insensitive match via lowercase-enforced emails). The migration and `supabase/config.toml` are committed. The hook was enabled on the hosted project on 2026-11-08 (via the dashboard, not `supabase config push`, which would also change unrelated remote auth/pooler/storage settings; do not run it). The Auth Admin API bypasses the hook, so the invite-reject test uses the public `signUp`. The git history was scrubbed of personal data before the first push.
- **Why:** config push overwrites everything config.toml declares, not just the hook.
- **Pending (owner, manual):** Google OAuth provider setup, deferred by the owner. Until it is done, only the owner can sign in (magic link); invitees cannot.
- **Pending:** `vercel git connect` needs a GitHub Login Connection on Vercel. Until then deploys are manual (`vercel --prod`).
- **Who decided:** Claude's call, per controller ruling

### Auth sessions under Cache Components
- **Decision:** Keep `cacheComponents` and `partialPrefetching` on. Session reads sit behind `<Suspense>`; `getCurrentUser()` (`src/lib/auth.ts`) calls `connection()` before `getClaims()` because JWT verification compares expiry to the clock, which Cache Components flags during runtime prefetch. The proxy (`src/proxy.ts`) refreshes the session with `getClaims()` and is default-deny: everything except `/login` and `/auth/*` redirects signed-out users to `/login?next=<path>`. The `(app)` layout re-verifies with `getClaims()` (never `getSession()`).
- **Why:** Follows the Next 16 "Authentication with Cache Components" guide and the Supabase SSR example without disabling caching; default-deny means new routes are protected automatically.
- **Who decided:** Claude (Task 5)

### Redirect targets and sign-out
- **Decision:** Every `next` parameter goes through `safeNext()` (single leading `/`, no backslashes or control characters, same-origin after URL parsing). Sign-out is `POST /auth/signout` only. Login errors are fixed codes mapped to fixed copy; query text is never reflected.
- **Why:** Prevents open redirects, cross-site sign-out via links/prefetch, and reflected content.
- **Who decided:** Claude (Task 5)

### CI design
- **Decision:** `.github/workflows/ci.yml` runs on every push and on pull requests to `main`: lint, typecheck, unit tests (`tests/unit`), build, bundle secret check. Build-time `NEXT_PUBLIC_*` vars are placeholders in the workflow (env validation needs well-formed values, not real ones). Integration tests are a separate job that runs only on `push` to `main` with repo secrets, since they hit the hosted project and PRs must not depend on secrets.
- **Why:** Fast feedback on every branch without exposing secrets to PR runs or touching the hosted database from feature branches.
- **Who decided:** Claude's call, per controller ruling

### Client bundle secret check
- **Decision:** `scripts/check-bundle-secrets.mjs` fails CI if any file in `.next/static` contains the name `SUPABASE_SECRET_KEY` or (when set) its value. In CI it can only match the name (the secret is not set in the build job); the value check runs locally, where the secret is set. Verified by temporarily referencing the secret in a client component (exit 1), then reverting.
- **Why:** A cheap last-line guard against the service key reaching the browser, beyond `server-only` imports.
- **Who decided:** Claude (Task 7)

### Production URL and preview limitation
- **Decision:** Production alias is `https://pipeline-agent-peach.vercel.app`. `NEXT_PUBLIC_SITE_URL` is set to it for both production and preview (the env schema requires a valid URL), so sign-ins started from a preview deployment redirect back to production. Supabase Auth `site_url` and redirect allow-list contain localhost and the production URL only. `vercel.json` pins the framework to Next.js and `engines.node` to 24.x. Deploys are currently done with `vercel --prod` because `vercel git connect` needs a GitHub login connection on the Vercel account (manual step).
- **Why:** Free tier, single auth redirect target; preview auth is not a goal in Phase 1.
- **Who decided:** Claude (Task 7)
