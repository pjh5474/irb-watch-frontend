# IRB Watch frontend: decisions

Recorded 2026-11-09 from an interview. Backend decisions are in `docs/decisions.md` (copied from the backend repo; do not edit them here).

| Topic | Decision | Note |
|---|---|---|
| Framework | Next.js App Router with SSR, `@supabase/ssr` cookie session | Server components read Supabase as the signed-in user |
| Language | TypeScript strict | |
| UI | Tailwind + shadcn/ui, plain defaults, no brand | |
| Client data | TanStack Query | |
| Tests | Vitest (unit) + Playwright (e2e) | |
| Package manager | npm | |
| Hosting | Vercel | `FRONTEND_ORIGINS` on the API must equal the deployed origin exactly, no trailing slash |
| UI language | Korean + English toggle | Document content and summaries stay in their stored language |
| Audience | Desktop-first, few staff | Responsive, not mobile-optimized |
| Data path | Reads: supabase-js under RLS. Actions: FastAPI with `Authorization: Bearer <token>` | Users are read-only (no subscriptions, see backend "No subscriptions", 2026-11-09). Summary, download link, access proof and all admin calls go to FastAPI |
| Types | Generated: `openapi-typescript` from the API's OpenAPI spec, `supabase gen types` for tables | Never hand-edit generated files |
| User screens (MVP) | Login, feed, sources (read-only list + access form), document detail + version diff | Changed 2026-11-09: follow/unfollow removed |
| Admin screens (MVP) | Users, Sources + scans, Credentials | |
| Feed | All cards the user may read (RLS decides: public sources, plus members-only ones with valid proof; admins all), newest first | Changed 2026-11-09. Earlier "followed only" answer is void. One filter only: by source (dropdown). No priority/category filters |
| Follow / unfollow | Removed. Do not build or call `subscriptions` | Backend revoked `insert` for users |
| Removed documents | Cards stay, marked "removed"; history and downloads still work | Backend keeps history |
| `resaved` versions | Hidden from the version picker | Version numbers may skip |
| `needs_review` | Small hint in the feed; reason on the detail page only | |
| Members-only source without valid proof | (Any user, no follow needed.) Locked card + "verify access" form posting the user's hospital ID/password to `POST /sources/{id}/access` | Password held in memory only, never stored, logged or put in a URL; HTTPS only |
| On-demand summary | Button disabled with reason on 503 (AI off) and 429 (daily limit); cached summaries always shown; 404 = document not readable by this user (no subscription rule any more) | |
| Downloads | Click, then `POST /files/{id}/download-url`, then open at once | Never pre-fetch or cache links (60 s expiry, 200/day cap). 404/429/503 show a message |
| Auth failure | Any 401/403 from API or Supabase: sign out, go to login with a message | Refresh-token behaviour after a ban is unverified on the backend |
| Credentials screen | Write-only password field, never prefilled, cleared after submit, no show toggle, autocomplete off | List shows labels and dates only |
| Docs location | Frontend docs live in this repo's `docs/` as `frontend-*.md` | Assumed, not confirmed |
| Assistant panel (2026-11-09) | **Built, offline tests only; the real stream has not run.** A button bottom-right on every signed-in page opens a right-hand drawer (full screen on phones): conversation list (open, delete with confirm), New chat, streamed answer (`lib/api/agent.ts` reads the server-sent events by hand with `fetch`, because EventSource cannot send the login header), Stop button, a line saying what it is looking up, the usage ("3 of 30 messages in the last 24 hours"), a 2,000-character limit, Enter sends and Shift+Enter breaks the line (not while a Korean/Japanese/Chinese character is still being composed). **Page hint:** a chip "Asking about document #12: <title>" the user can remove; only the kind and number are sent, the title is read from the page for the user's eyes only; pages other than a source or document send nothing. **Errors:** a refusal before the stream (limit, size, switched off) shows the server's reason; an `error` event after it started shows its reason and drops the half answer; a cut-off stream says so; the saved question is reloaded either way. A 403 on the stream is shown, not treated as the end of the session (unlike `apiFetch`). **Admin proposals:** a card with Confirm and Dismiss; Confirm runs the normal admin route with the admin's own login, once per card even on a double click; a card from the history, or from an answer that is no longer the newest, is plain text ("Suggested: ..."), because the server does not store whether it was confirmed. **Limit editor:** `/admin` redirects to the sources page, so it is a second tab, `/admin/assistant` (new tab bar in the admin layout: Sources, Assistant): two numbers, 0 to 1000, 0 = off for that account type | Owner chose a drawer, a removable page chip, read-only old cards and a limit editor on the admin page. Not verified: the real stream through Caddy and Vercel, how the drawer looks on a phone and in dark mode |
| Paging (2026-11-09) | 10 per page, Previous / numbered pages / Next (`components/pagination.tsx`, helpers in `lib/paging.ts`). Main page: Changes (`?cp=`) and Recent documents (`?rp=`) page on their own and keep the source filter and each other's page in their links; `/sources` (`?page=`); `/admin/sources` pages in the browser (state, no address). One source's documents stay 50 per page. Page 1 leaves the parameter out; a stale page number shows the last page, not an error. Recent documents count every source first (cheap counts), page the sources that have new documents, then fetch titles only for the page | Owner asked for it so pages do not grow too long. The main-page changes feed used to stop at the newest 50 with no way to see older ones. Server pages are not covered by tests (they read Supabase); the pager and helpers are |

## Open items
- Backend migration `20261108235959_drop_subscription_requirement.sql` is written but **not applied**. Until it is, RLS and the summary/download endpoints still require a subscription, and users cannot create one. Real-user checks wait for it.
- Seed data: the feed is empty until a real change happens. Need fake changes (script or SQL) in the dev Supabase project.
- Supabase publishable (anon) key for the frontend; also unblocks the backend's unverified real-user RLS checks.
- Non-admins can read `sources` including error text and scanning-login label (backend known gap). UI must not render those fields for non-admins.
- Card fields, read from the migrations 2026-11-09: `audit_logs` has `id, created_at, category, event_type, source_id, document_id, title, summary, priority (low|medium|high), payload jsonb`. Feed = `category = 'document'`. `event_type` values: `document.new`, `document.updated`, `document.removed`, `document.needs_review` (reappeared name unconfirmed). The `payload` keys (`category`, `summary_source`, `ai_note`) come only from `runbook.md`; the migrations do not define them. Confirm against a real row before relying on them.
- `sources` rows are readable by every signed-in user and include `config` (may hold the scanning `login_user`), `last_scan_error`, `scans_paused_reason`. RLS cannot hide columns, so the UI must select explicit safe columns (`id, name, url, requires_login, is_active, last_scan_at`) for non-admins. Real fix is a backend view; noted as a backend gap.
- Scaffold change: removed `cacheComponents` and `partialPrefetching` from `next.config.ts` (every page reads the user's cookies). Next 16 renamed `middleware` to `proxy`; session refresh and locale routing live in `src/proxy.ts`.
- `document_versions` has no `files` column any more; files are in `document_version_files` (`filename, size_label, sha256, storage_path, text_content, hash_only_reason, extract_note`). Versions also carry `category, summary_source, document_summary`.
