# IRB Watch frontend: plan

Reasons: `docs/frontend-decisions.md`. Backend API and schema: `docs/plan.md`, `docs/runbook.md`.

## Target structure
```
irb-watch-frontend/
  package.json            npm
  .env.example            NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL
  src/
    app/
      [locale]/           ko | en
        login/
        (app)/            signed-in layout, auth guard
          page.tsx        feed
          sources/        list, follow, locked-source access form
          documents/[id]/ detail, version picker, diff, files, summary
          admin/          users, sources, credentials (admin guard)
    lib/
      supabase/           server.ts, client.ts, middleware helper (@supabase/ssr)
      api/                typed fetch wrapper: adds Bearer token, maps 401/403 to sign-out
      types/              generated: api.d.ts, database.d.ts
    components/           shadcn/ui + feature components
    i18n/                 ko.json, en.json
  tests/                  vitest; e2e/ playwright
  scripts/                gen-types, seed-fake-changes
```

## Status (2026-11-09)
Steps 1 and 3 (partly) done: scaffold, i18n routing (ko/en), `src/proxy.ts` (locale + session refresh + login redirect), Supabase browser/server clients, API wrapper with sign-out on 401/403, login page, placeholder feed, Vitest. `npm run build`, `lint`, `test` pass. Not done: shadcn/ui init, Playwright config, generated types (need the publishable key and a reachable API), sign-out button, language toggle, admin guard. Nothing has run against a real Supabase project yet.

Update (later 2026-11-09): `.env.local` set; types generated (`npm run gen:db-types`, `gen:api-types`; rerun after the backend migration is applied). Built: app shell (header, language toggle, sign-out), feed (step 5) with source dropdown, typed Supabase clients. Admin link is hidden until step 8. **Seed data decision:** `audit_logs` is append-only, so fake cards could never be deleted from the only Supabase project. No seeding; the dev DB already holds real document cards from live backend tests. Card `payload` really holds `files, text_changed, title_changed, version_no` (no `category`). Backend CORS allows only GET/POST/PATCH/DELETE: `PUT /admin/credentials` needs `PUT` added before step 8.

Update (document detail, step 7): `/documents/[id]` built: version picker (links, `?v=N`, resaved hidden), word diff against the previous visible version (`diff` package, 20,000-word cap like the backend), title-change line, files with click-to-download, whole-document summary panel with 429/503 handling. Feed titles link to it. Verified only by `tsc`, lint and unit tests; **not seen in a browser**, and no document in the DB has more than one version yet, so the diff view has never shown a real diff. Not built: pick-by-date control. 429/503 on summaries can only be shown after the first click (the API has no "is AI on / quota left" endpoint). The deployed API's docs still say "subscribers"; it follows the backend migration.

Login bugs fixed 2026-11-09: message keys must not contain dots (breaks next-intl, page never hydrates); `allowedDevOrigins` for `127.0.0.1`; login form uses `method="post"` so credentials can never land in the URL.

## Steps
1. **Scaffold.** Next.js, TypeScript strict, Tailwind, shadcn/ui, TanStack Query, Vitest, Playwright, i18n routing (ko default), `.env.example`.
2. **Types.** Scripts: `openapi-typescript` against `https://irb-api.warwarsn.online/openapi.json`, `supabase gen types --linked`. Commit output.
3. **Auth.** Supabase email+password login, cookie session via middleware, `/login`, sign-out. API wrapper: any 401/403 signs out and redirects with a message. Admin guard reads role from `profiles` (UI only; the server re-checks).
4. **Seed data.** Script that inserts fake sources, documents, versions and cards into the dev project so the feed has content. Confirm card field names first.
5. **Feed.** Cards from `audit_logs` (all readable, newest first; source dropdown is the only filter): summary, priority badge, category, source, date. "Removed" mark, small `needs_review` hint. Empty and loading states.
6. **Sources.** Read-only list (no follow). Members-only without proof: locked card + access form (`POST /sources/{id}/access`; handle 429 limits, wrong password, 503 when keys unset). Never render error text or login label for non-admins.
7. **Document detail.** Version picker by number or date (hide `resaved`), word-level diff view, files list with click-to-download (fetch link, open at once), on-demand summary button (disabled with reason on 429/503, cached shown).
8. **Admin.** Users (create, list, role, soft delete, restore; surface 409 lock-out messages). Sources (add, rename, activate, scan, run-all; poll `GET /admin/sources` for status). Credentials (list labels/dates; write-only password form; 409 when the API's store is not `database`).
9. **Quality.** Vitest for the API wrapper, diff rendering, error mapping. Playwright for login, feed, access form, download flow. Run against seeded data.
10. **Deploy.** Vercel project, env vars, set `FRONTEND_ORIGINS` on the EC2 `.env` to the Vercel origin, restart API, check CORS.

## Verification
- `npm run build`, `npm test`, `npm run lint`, Playwright green on seeded data.
- Real-user checks (also verify backend RLS): a non-admin sees public sources and only proven members-only ones (after the backend migration is applied), a deleted user is signed out, a non-owner access proof works, a Korean filename downloads in a real browser.

## Risks
- Hospital password crosses the browser to the API: HTTPS only, no logging, no storing, cleared after submit.
- Backend flows never tested with real tokens may return unexpected statuses; handle unknown errors with a generic message.
- Feed is meaningless until seed data or a real change exists.
