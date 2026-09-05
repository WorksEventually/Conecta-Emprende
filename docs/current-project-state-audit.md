# Current Project State Audit — TradeArc

Branch: `docs/deep-project-audit-trello-plan`

Base audited state: normalization branch `refactor/normalize-database-3nf`.

This audit is intentionally strict. Features are marked complete only when they are wired through the current app path with real persistence or clear backend support. Frontend-only, localStorage, seed-only, or demo-only behavior is called out explicitly.

## 1. Repository and Architecture Overview

| Area | Current state | Evidence |
|---|---|---|
| Frontend framework | React 19 + React Router + Vite. | `package.json`, `src/App.tsx`, `src/main.tsx` |
| Backend/server | Express server bundled with Vite dev middleware. | `server.ts`, `package.json` scripts |
| Database | PostgreSQL. | `docker-compose.yml`, `.env.example`, `prisma/schema.prisma` |
| ORM | Prisma Client. | `prisma/schema.prisma`, `src/lib/db.ts`, `prisma/seed.ts` |
| Docker usage | Docker Compose has `db` and `app` services; app depends on healthy Postgres. | `docker-compose.yml` |
| Auth/session | Real email/password auth exists with JWT access/refresh cookies and refresh token DB table. Google OAuth route skeleton exists. | `server.ts`, `src/lib/auth.ts`, `src/stores/auth-store.ts` |
| State management | Zustand stores. Real auth/providers/quotes stores coexist with `useMvpStore` localStorage seed store. | `src/stores/*.ts` |
| API adapters | Some typed adapters exist, but many pages call `fetch` directly. | `src/api/*.ts`, `src/pages/*.tsx` |
| Seed data | Two seed systems exist: Prisma DB seed and frontend/localStorage MVP seed. | `prisma/seed.ts`, `src/lib/mvp-data.ts`, `src/auth/demoProfiles.ts` |
| Tests/scripts | TypeScript contract scripts and Playwright scripts. No single `npm test` command. | `scripts/*`, `package.json` |
| Docs | Existing architecture/product/auth docs plus recent normalization docs. | `README.md`, `ARCHITECTURE.md`, `AUTH.md`, `docs/*` |
| Build/lint | `npm run lint`, `npm run build`, `npm run db:seed`. | `package.json` |

## 2. Current MVP Functionality

### Auth and login

Current status: Partial.

What works:

- Registration and login routes exist and create JWT cookies.
- Refresh-token flow exists and stores hashed refresh tokens.
- `/api/auth/me` loads the current user and provider list.
- Login/register pages are real forms.

What is incomplete/risky:

- DB role enum has only `USER`, `PROVIDER`, `ADMIN`; the serializable contract and demo data also use `REQUESTER`, `ADMIN_REVIEWER`, and `SUPER_ADMIN`.
- Frontend admin guarding checks only `user.role === "ADMIN"` in `ProtectedRoute`, while `useCurrentUser` treats role labels as admin too.
- Demo profile switcher can inject frontend auth users when `VITE_ENABLE_DEMO_PROFILE_SWITCHER=true`.
- README still mentions old `VITE_BOOTSTRAP_ADMIN=false`, while `.env.example` uses `VITE_ENABLE_DEMO_PROFILE_SWITCHER=false`.

Evidence:

- `server.ts` auth routes.
- `src/lib/auth.ts`.
- `src/stores/auth-store.ts`.
- `src/components/auth/ProtectedRoute.tsx`.
- `src/hooks/use-current-user.ts`.
- `src/components/dev/DemoProfileSwitcher.tsx`.
- `src/auth/demoProfiles.ts`.
- `.env.example`, `README.md`.

### Requester profile

Current status: Partial / mostly missing as a distinct product surface.

What works:

- A logged-in requester can land on `/me`.
- If the user has no provider profile, `/me` shows a create-business CTA.

What is incomplete:

- There is no rich requester profile page for buyer/requester identity.
- Requester account info, saved providers, request history, review history, preferences, and trust/account signals are not organized as a requester dashboard.
- `/me` is currently provider-centric, not a context-aware account/profile hub.

Evidence:

- `src/pages/MyProfileDashboardPage.tsx`.
- `src/App.tsx` routes `/me`, `/profile/me`, `/provider/me`.

### Provider profile

Current status: Partial.

What works:

- Provider creation/edit flow exists.
- Public provider page exists.
- Owner can edit profile.
- Catalog management pages exist.
- Trust, commercial/profile-quality signals, medals, reviews, and catalog are displayed. Legal/MIPYME formalization is not an active MVP signal.
- Seeded DB providers are real database records.

What is incomplete/risky:

- Provider status concepts like draft/active/suspended/banned exist in frontend demo data but not as a DB-backed provider lifecycle.
- Public profile does not block request CTA for own profile.
- Report profile UI opens a dialog, but backend report persistence is not wired.
- Some catalog item types in public filters do not match backend item type values.

Evidence:

- `src/pages/EditPublicProfilePage.tsx`.
- `src/pages/ProviderPage.tsx`.
- `src/pages/OfferPages.tsx`.
- `server.ts` provider/catalog routes.
- `prisma/schema.prisma`.

### Search and map

Current status: Partial, with strong MVP UI.

What works:

- Provider search route exists.
- Search page supports text intent, city, category, price and trust filters. Legal/MIPYME formalization is intentionally not an active search filter.
- Map is Nicaragua-focused and shows touchable provider points with preview panel.
- Mobile list/map switch exists.

What is incomplete/risky:

- The “Disponible ahora” checkbox is hardcoded and does nothing.
- Search fetch effect in `SearchPage` has empty dependencies; changing URL params does not always refetch.
- Search is partly frontend filtering/ranking over server results; server-side filtering is limited.
- Map uses OpenStreetMap tiles and can show broader map exploration; product decision needed if Nicaragua-only viewport should be enforced.
- Demo profile switcher has high z-index and may overlap mobile map/search UI when enabled.

Evidence:

- `src/pages/SearchPage.tsx`.
- `src/components/map/MvpProviderMap.tsx`.
- `src/components/map/ProviderMap.css`.
- `src/index.css`.
- `src/lib/providers-service.ts`.

### Requests and chat

Current status: Partial / risky.

What works:

- Request creation page exists.
- Quote/request thread model exists in Prisma as `QuoteThread` and `QuoteMessage`.
- Chat page exists and messages can be added.
- Requests are linked to provider and optional catalog item.
- Bilateral completion fields exist in DB.

What is broken/risky:

- `/api/quotes`, `/api/quotes/:id/messages`, and `/api/quotes/:id` are not protected by `authenticate`.
- `POST /api/quotes` can fall back to `senderId = "anonymous"`, which can fail FK constraints or create bad behavior.
- API does not currently prevent requesting your own provider profile.
- API does not verify requester/provider participant before reading/updating threads.
- Frontend uses `useState(() => sideEffect)` in `RequestPages.tsx`, which should be `useEffect`; this can make data loading brittle.
- Request detail confirmation buttons appear disabled incorrectly: “Confirmar como cliente” is disabled unless `user.role === "PROVIDER"`.

Evidence:

- `server.ts` quote routes.
- `src/lib/quotes-service.ts`.
- `src/stores/quotes-store.ts`.
- `src/pages/RequestPages.tsx`.
- `src/pages/ChatPage.tsx`.

### Reviews, rating, trust score

Current status: Partial.

What works:

- Review creation now requires auth.
- Review creation validates request exists, is completed, reviewer is sender, and no self-review.
- `Review.requestId` has a relation to `QuoteThread`.
- `ReviewAnalysis` exists.
- `ProviderMetrics` and `TrustScoreSnapshot` exist.
- Provider page calculates average review from returned reviews.

What is incomplete/risky:

- Trust score is not recalculated from full source-of-truth after each relevant event.
- Review route updates only average rating and total review count in `ProviderMetrics`, not final trust score.
- The latest `TrustScore` compatibility table and `ProviderMetrics.trustScore` can diverge.
- Existing UI can display trust score from multiple sources.
- Review duplicate conflict is DB-level but route does not return a friendly duplicate-review message.

Evidence:

- `server.ts` `/api/reviews`.
- `prisma/schema.prisma`.
- `src/lib/providers-service.ts`.
- `src/domain/rating/*`.
- `src/pages/ProviderPage.tsx`.

### Risk reports and anti-inflation

Current status: Mocked/partial.

What works:

- Risk scoring utility exists.
- `RiskReport` DB model exists after normalization.
- Seed creates risk reports without private data.
- Admin report page exists visually.

What is not real:

- Admin report page uses `useMvpStore` frontend/localStorage reports, not DB `RiskReport`.
- `src/api/adminApi.ts` references `/api/admin/risk-reports`, but there are no backend routes for those endpoints.
- Suspicious activity reports are not generated automatically from request/review behavior.
- No DB-backed admin review workflow or audit logs exist.

Evidence:

- `src/domain/risk/calculateRiskScore.ts`.
- `prisma/schema.prisma`.
- `prisma/seed.ts`.
- `src/pages/AdminReportsPage.tsx`.
- `src/api/adminApi.ts`.
- `server.ts` route list.

### Admin reviewer and super admin

Current status: Mocked/partial.

What works:

- Route guard exists for `ADMIN`.
- Seed users include two ADMIN users.
- Demo identity layer includes `ADMIN_REVIEWER` and `SUPER_ADMIN`.

What is incomplete:

- DB role enum does not distinguish `ADMIN_REVIEWER` from `SUPER_ADMIN`.
- There are no backend-enforced admin routes for report review, role assignment, suspension, ban, or audit logs.
- Admin page mutates `useMvpStore`, not database.
- Super admin concepts are frontend contract/demo only.

Evidence:

- `prisma/schema.prisma`.
- `prisma/seed.ts`.
- `src/lib/identity.ts`.
- `src/lib/mvp-data.ts`.
- `src/pages/AdminReportsPage.tsx`.
- `src/components/auth/ProtectedRoute.tsx`.

### Database normalization status

Current status: Partial but recently improved.

What works:

- `Department`, `City`, `Category`, `ProviderCategory`, `CatalogItemCategory`, `ProviderMetrics`, `CatalogItemMetrics`, `ReviewAnalysis`, `TrustScoreSnapshot`, `RiskReport`, `FormalizationStep`, and `QuoteOffer` exist.
- Seeded providers are real DB records.
- Backend provider/catalog mappings prefer normalized relations and fall back to legacy fields.

What remains:

- Physical request/chat models are still `QuoteThread` and `QuoteMessage`.
- Legacy duplicated source-of-truth fields remain in `Provider` and `CatalogItem`.
- No full backfill script for non-seeded existing data.
- Removing old fields must wait until UI/API adapters are fully migrated.

Evidence:

- `prisma/schema.prisma`.
- `prisma/migrations/20260708163000_normalize_database_3nf/migration.sql`.
- `docs/database-normalization-*`.

## 3. Current Problems and Risks

### P1. Request/chat API is not protected by backend auth

- Evidence/files: `server.ts` routes `/api/quotes`, `/api/quotes/:id/messages`, `/api/quotes/:id`.
- Why it matters: anyone can read/update threads if they know provider or sender IDs; messages can be posted with arbitrary `authorRole`.
- Risk level: Critical.
- Suggested fix: add `authenticate`, validate participant access for reads/writes, remove request body sender/author fallbacks.
- Blocks other tasks: blocks verified review reliability, trust score integrity, real production testing.

### P2. Request creation can use `anonymous` sender

- Evidence/files: `server.ts` `POST /api/quotes`.
- Why it matters: `QuoteThread.senderId` references `User`; `"anonymous"` can fail DB constraints or create inconsistent request flow.
- Risk level: Critical.
- Suggested fix: require authenticated user for request creation and use token user ID only.
- Blocks other tasks: request/chat/review end-to-end.

### P3. Own-provider requests are not prevented in backend

- Evidence/files: `server.ts`, `src/pages/ProviderPage.tsx`, `src/pages/SearchPage.tsx`.
- Why it matters: self-request can inflate completion/review metrics or create nonsensical conversations.
- Risk level: High.
- Suggested fix: backend check `provider.userId !== requesterUserId`; frontend disable CTA for own profile.
- Blocks other tasks: trust score/risk integrity.

### P4. Admin review UI is localStorage/mock, not DB-backed

- Evidence/files: `src/pages/AdminReportsPage.tsx`, `src/stores/mvp-store.ts`, `src/api/adminApi.ts`, `server.ts`.
- Why it matters: admins are not reviewing real `RiskReport` records; status changes vanish or diverge from DB.
- Risk level: High.
- Suggested fix: implement `/api/admin/risk-reports` routes with backend ADMIN permission checks and update page to use API.
- Blocks other tasks: risk workflow, admin reviewer testing.

### P5. Admin role model is inconsistent

- Evidence/files: `prisma/schema.prisma`, `src/lib/identity.ts`, `src/auth/demoProfiles.ts`, `src/components/auth/ProtectedRoute.tsx`.
- Why it matters: frontend knows `ADMIN_REVIEWER`/`SUPER_ADMIN`; DB stores only `ADMIN`. Permissions cannot be expressed precisely.
- Risk level: High.
- Suggested fix: decide DB role model: either extend enum or create `RoleAssignment` table; enforce server-side.
- Blocks other tasks: admin reviewer/super admin split.

### P6. Demo/localStorage data coexists with real backend and can mask bugs

- Evidence/files: `src/stores/mvp-store.ts`, `src/lib/mvp-data.ts`, `src/stores/providers-store.ts`, `src/components/dev/DemoProfileSwitcher.tsx`.
- Why it matters: manual tests may pass on mock data while DB-backed behavior is broken.
- Risk level: High.
- Suggested fix: make demo mode visibly isolated; route all production flows through API; remove provider fallback except for explicit demo IDs.
- Blocks other tasks: QA reliability.

### P7. Several pages use `useState` for side effects

- Evidence/files: `src/pages/RequestPages.tsx`.
- Why it matters: data loading is tied to initial render rather than dependency changes; navigation state can go stale.
- Risk level: Medium.
- Suggested fix: replace side-effect initializers with `useEffect`.
- Blocks other tasks: request/chat QA, route reliability.

### P8. Request detail confirmation buttons have wrong role gating

- Evidence/files: `src/pages/RequestPages.tsx`.
- Why it matters: requester may be unable to confirm as client, and provider can trigger both paths from UI.
- Risk level: High.
- Suggested fix: derive participant role from thread/user and enable only the relevant confirmation.
- Blocks other tasks: bilateral completion and verified reviews.

### P9. Trust score sources can diverge

- Evidence/files: `prisma/schema.prisma`, `src/lib/providers-service.ts`, `server.ts`.
- Why it matters: UI may show `TrustScore`, `ProviderMetrics.trustScore`, or frontend seed score depending on path.
- Risk level: Medium.
- Suggested fix: define one read model for current score and one audit history model; recalculate on review/completion/risk events.
- Blocks other tasks: trustworthy rating display.

### P10. Legacy duplicated DB fields remain

- Evidence/files: `prisma/schema.prisma`, `docs/database-normalization-summary.md`.
- Why it matters: category/location/metrics can diverge between normalized and legacy fields.
- Risk level: Medium.
- Suggested fix: backfill, migrate UI/API fully, then remove legacy columns later.
- Blocks other tasks: clean data model work.

### P11. No DB-backed profile status lifecycle

- Evidence/files: `src/auth/demoProfiles.ts`, `src/lib/mvp-data.ts`, `prisma/schema.prisma`.
- Why it matters: draft/suspended/banned states are test/demo concepts but not backend-enforced.
- Risk level: Medium.
- Suggested fix: add provider/account status model and enforce visibility/actions.
- Blocks other tasks: moderation/admin workflow.

### P12. Report profile UI is not persisted

- Evidence/files: `src/pages/ProviderPage.tsx`, `src/stores/mvp-store.ts`, `server.ts`.
- Why it matters: user report action does not become a real moderation object.
- Risk level: Medium.
- Suggested fix: add `/api/reports` or `/api/risk-reports/manual` route with validation.
- Blocks other tasks: admin review workflow.

### P13. Environment documentation is stale in places

- Evidence/files: `README.md`, `.env.example`, `docs/profile-auth-rating-contract.md`.
- Why it matters: developers may configure old `VITE_BOOTSTRAP_ADMIN` instead of current demo switcher.
- Risk level: Low.
- Suggested fix: update README to current auth/demo state.
- Blocks other tasks: onboarding clarity.

### P14. Build size warning

- Evidence/files: `npm run build`.
- Why it matters: main JS bundle is >500 kB after minification; acceptable for MVP but should be tracked.
- Risk level: Low.
- Suggested fix: code-split map/admin/chat pages later.
- Blocks other tasks: no.

## 4. Complete / Partial / Mocked / Missing Matrix

| Area | Current status | Evidence/files | Completion level | Notes |
|---|---|---|---|---|
| Auth/login | Real but incomplete | `server.ts`, `src/stores/auth-store.ts`, `src/lib/auth.ts` | Partial | Email/password works; role granularity incomplete. |
| Requester profile | Provider-centric fallback | `src/pages/MyProfileDashboardPage.tsx` | Partial | No distinct requester dashboard. |
| Provider profile | DB-backed with demo fallback | `src/pages/ProviderPage.tsx`, `server.ts` | Partial | Public/edit flow works; lifecycle incomplete. |
| Provider catalog | DB-backed | `src/pages/OfferPages.tsx`, `server.ts` | Partial | CRUD exists; item type/category mapping needs cleanup. |
| Search | Backend + frontend ranking | `src/pages/SearchPage.tsx`, `src/lib/providers-service.ts` | Partial | Good MVP; filters partly frontend-only. |
| Map | Interactive MVP | `src/components/map/MvpProviderMap.tsx` | Partial | Points/previews work; viewport/product limits need decision. |
| Request creation | Exists but unsafe backend | `server.ts`, `src/pages/RequestPages.tsx` | Broken | Routes lack auth/participant validation. |
| Request-linked chat | Exists but unsafe backend | `server.ts`, `src/pages/ChatPage.tsx` | Partial/Broken | Chat is linked to request, but API is unauthenticated. |
| Seeded providers | Real DB plus frontend mocks | `prisma/seed.ts`, `src/lib/mvp-data.ts` | Partial | DB seed real; frontend has separate 50-provider seed. |
| Verified reviews | Backend validation started | `server.ts`, `prisma/schema.prisma` | Partial | Requires completed request; duplicate error UX incomplete. |
| Average rating | Calculated in places | `src/lib/providers-service.ts`, `ProviderPage.tsx` | Partial | Multiple sources. |
| Trust score | Persistent + frontend demo | `TrustScore`, `ProviderMetrics`, `TrustScoreSnapshot` | Partial | No full event-driven recalculation. |
| Risk reports | DB model + seeded + mock admin UI | `RiskReport`, `AdminReportsPage.tsx` | Stubbed/Mocked | No backend admin API. |
| Admin reviewer | Demo/front-end concept | `identity.ts`, `demoProfiles.ts`, `AdminReportsPage.tsx` | Mocked | DB only has `ADMIN`. |
| Super admin | Demo/front-end concept | `identity.ts`, `mvp-data.ts` | Mocked | No real backend capability. |
| Database normalization | Additive normalization applied | `prisma/schema.prisma`, migration docs | Partial | Legacy fields remain. |
| Formalization roadmap support | Checklist/roadmap only | `FormalizationChecklist`, `FormalizationStep`, page | Partial | Correctly not legal integration. |
| Testing | Scripts exist, no unified test command | `scripts/*`, `package.json` | Partial | Playwright scripts need running dev server. |
| Documentation | Good but inconsistent | `docs/*`, `README.md` | Partial | Needs current-state alignment. |

## Most Important Current State Summary

The app is now past a static mock: it has real auth, Prisma/Postgres, DB-backed providers/catalog/requests/reviews, and normalized schema support. However, it still has a split brain between real backend data and frontend MVP localStorage data. The highest-risk production blocker is that request/chat routes are not backend-protected, while verified reviews and trust score depend on that flow being trustworthy.
