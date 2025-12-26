# PLAN to MVP — SERP Checklists

This doc is the practical, sequenced plan to ship an MVP given the current repo state and the agreed scope:

- **In scope**: core templates + runs, public sharing, **public user profiles**
- **Out of scope (cut for MVP)**: **Pages**, **Affiliate**, **Billing/subscriptions**

## Status (what’s left)

Already handled in this repo:
- ✅ Removed Pages + Affiliate + Billing surfaces/code paths.
- ✅ Slugs are unique; seed data includes stable slugs + usernames.
- ✅ Public template lookup by slug works (`/checklists/:slug`) and start-run routes to `/run/:id`.
- ✅ Public content rendering is hardened (no raw HTML; URL sanitization).
- ✅ R2 uploads endpoint exists and `R2_UPLOADS` binding is wired (avatars + template assets).

Remaining to ship:
- Set production secrets + bindings (real `JWT_SECRET`, real D1 `database_id`, and R2 bucket binding in the deployed Pages/Worker environment).
- Apply `migrations/0005_backfill_template_slugs.sql` to remote if you have older templates with missing slugs.

## 0) MVP definition (what “done” means)

### Core user flows (must work end-to-end)
1. **Auth**: user can register/login/logout.
2. **Templates**: user can create/edit/delete templates with:
   - multiple **sections**
   - item **descriptions**
   - item **contents** (markdown text, image URL, video URL, embeds, sub-items)
   - public/private visibility
3. **Public sharing**:
   - public template page loads by **unique slug**
   - public page renders content safely (no XSS)
4. **Runs**:
   - logged-in user can start a run from a template
   - completion state persists (refresh, reopen later)
   - run content stays intact (descriptions/contents/sub-items)
5. **Profiles (public)**:
   - `GET /profile/:username` shows user profile + user’s public templates
   - template cards show author (username) and link to profile
6. **No Billing**: app runs free-only (no subscriptions).

### Non-goals for MVP (explicit cuts)
- No `/pages` authoring or public pages.
- No affiliate tracking, referral attribution, or affiliate dashboards.
- No general file uploads beyond avatar (defer any “attachments” feature).

## 1) Reality check: current state (what’s already good)

- Tech stack is coherent: React + Vite + Tailwind/shadcn + React Query; Cloudflare Pages Functions + D1; Vitest + Wrangler integration tests.
- Core API handlers exist and tests pass: `functions/api/handlers/auth.ts`, `functions/api/handlers/templates.ts`, `functions/api/handlers/checklists.ts`.
- Public templates + library UI exist.

## 2) MVP blockers (must fix before shipping)

### A) Data integrity: templates + runs lose structure/content
**Symptom**: creating templates and runs flattens sections into `{id,title,completed}` and drops rich fields (descriptions/contents/sub-items). Runs re-hydrate from a flat list after reload.

**Primary location**: `src/contexts/TemplatesContext.tsx`

**Fix direction**:
- Store and update **full `sections`** structure via API (backend already supports storing JSON).
- Persist run progress by storing **full run sections with completion state**, not a flat list.

### B) Broken route after starting from public template
**Bug**: `src/pages/PublicTemplate.tsx` navigates to `/checklist/:id` but the app route is `/run/:id` (`src/App.tsx`).

### C) Slug uniqueness
**Risk**: API generates slugs from title without uniqueness enforcement (`functions/api/handlers/templates.ts`).

**Fix direction**:
- Make slug unique (append `-<shortId>` or enforce uniqueness in DB + regenerate).
- Add an endpoint for template lookup by slug (see section 4).

### D) XSS exposure on public content
**Risk**: unsafe HTML rendering paths exist (e.g. `dangerouslySetInnerHTML`).

**Known locations**:
- `src/components/shared/ContentRenderer.tsx`
- `src/pages/ChecklistRun.tsx`
- `src/components/ui/chart.tsx`

**Fix direction**: sanitize any HTML before rendering (or eliminate HTML mode; prefer markdown).

## 3) Scope cuts (Pages + Affiliate)

### Pages = NO
**Current**: removed from UI and routing (no `/pages` surfaces in the app).

**MVP action**:
- Remove `/pages` routes from `src/App.tsx` (private) and `/pages/:slug` (public).
- Remove “Pages” from nav in `src/components/Layout.tsx`.
- Remove/ignore unused page backup utilities (keep code but don’t expose via UI).

### Affiliate = NO
**Current**: removed (no affiliate tracking hook or account UI).

**MVP action**:
- Remove `useAffiliateTracking()` mount from `src/App.tsx`.
- Remove `AffiliateStats` section from `src/pages/Account.tsx`.
- (Optional) delete dead code paths later; for MVP just remove UI surface.

## 4) Profiles = YES (required backend + frontend)

### Backend endpoints required
Already present:
- `GET /api/profiles/by-username?username=...` (`functions/api/handlers/auth.ts`)

Missing for MVP UX:
1. **Get public profile by user id** (for template cards / UserInfo):
   - `GET /api/profiles/by-id?userId=...` → `{ id, username, full_name, avatar_url, created_at }`
2. **List public templates for a user**:
   - `GET /api/templates/public?userId=...` (or `GET /api/users/:id/templates?public=1`)
3. **Template-by-slug lookup** (needed for reliable public sharing):
   - `GET /api/templates/slug/:slug`

### Frontend changes required
- Fix author link target: `src/components/shared/UserInfo.tsx` currently links to `"/@username"`; should link to `"/profile/:username"`.
- Implement actual fetch in `src/pages/UserProfile.tsx`:
  - resolve profile by username
  - fetch public templates for that user
  - compute stats from returned templates
- Decide avatar strategy:
  - MVP: **no file upload** (remove editable avatar upload UI, or accept URL field only)

## 6) Milestones (sequenced work)

### Milestone 1 — Core correctness + safety (ship-blockers)
Deliverables:
- Templates and runs persist full structure + content; progress persists.
- Public template start-run navigates correctly.
- Slugs are unique and public templates resolve by slug.
- XSS mitigations in all public rendering paths.

Acceptance:
- Create template with multiple sections + descriptions + sub-items, publish it, refresh, content remains intact.
- Start a run, complete items + sub-items, refresh, completion remains.
- Two templates with same title still get unique slugs and load correctly.

Primary files likely touched:
- `src/contexts/TemplatesContext.tsx`
- `functions/api/handlers/templates.ts`
- `functions/api/handlers/checklists.ts`
- `src/pages/PublicTemplate.tsx`
- `src/components/shared/ContentRenderer.tsx`, `src/pages/ChecklistRun.tsx`

### Milestone 2 — Remove cut surfaces (Pages + Affiliate)
Deliverables:
- No Pages routes or nav.
- No affiliate tracking or affiliate UI shown.

Primary files:
- `src/App.tsx`
- `src/components/Layout.tsx`
- `src/pages/Account.tsx`

### Milestone 3 — Profiles MVP
Deliverables:
- Public profile page loads by username and shows user’s public templates.
- Template cards display author and link to profile.

Primary files:
- `functions/api/handlers/auth.ts` (+ new profile endpoints)
- `functions/api/handlers/templates.ts` (+ filter by userId and public)
- `src/pages/UserProfile.tsx`
- `src/components/shared/UserInfo.tsx`

## 7) Test plan (what to run + what to add)

Run existing suite:
- `pnpm run test:run`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

Add/extend tests where risk is high:
- Integration tests for:
  - template create stores sections (not flattened)
  - template-by-slug endpoint
- Unit tests for profile page data mapping.

---

If you want, I can turn this into an implementation PR sequence (actual code changes) starting with Milestone 1 (data integrity + route + slug uniqueness + XSS), then do the scope cuts, then profiles.
