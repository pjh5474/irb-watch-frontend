# IRB Watch (web app)

**English** | [한국어](README.ko.md)

The web app of IRB Watch: a place where clinical research coordinators see what changed on hospital IRB (research ethics office) boards, read AI summaries, compare versions and download the original files. Admins manage sources, study accounts and members, and see at a glance whether the daily scans are healthy.

| | |
|---|---|
| **This repository** | the **web app** (Next.js) |
| **Backend repository** | [pjh5474/irb-watch](https://github.com/pjh5474/irb-watch): the FastAPI server, the database schema (Supabase migrations) and the main docs |
| **Running app** | <https://irb-watch-frontend.vercel.app> · API: <https://irb-api.warwarsn.online> |

The app reads the Supabase database **directly, as the signed-in user**, so row-level security decides what each person sees. Everything that writes, scans, summarizes, sends mail or hands out file links goes through the backend API. The backend repository is the source of truth for the schema and the decisions behind it.

## What it does

- **Sign in** (accounts are created by an admin; there is no sign-up). Korean by default, English available.
- **Overview**: key numbers (documents saved, sources watched, new and updated in 30 days, last scan), recently added documents, and the change feed. A number that cannot be loaded shows "—" and a notice, never 0.
- **Sources**: each source with a health signal, its documents (page by page, "only new" filter), and a notice when its data may be out of date.
- **Document page**: version history, a word-level diff between versions, attached files with signed download links, and an AI summary written as a short README (admins can re-summarize).
- **Settings**: turn the daily email digest on or off. A public **unsubscribe page** works from the link in the mail without signing in.
- **Admin**: add sources, scan one or all, switch AI per source, turn a source into a members-only study (store the hospital account, assign members), see status lights (healthy, scanning, needs attention, problem), send a test email and a weekly report preview to yourself.
- **Feel**: loading skeletons, a server-status dot, blocked double clicks, subtle CSS-only motion (off for reduced motion), links underlined on hover only.

Members-only studies are visible only to admins and assigned members; for everyone else the source does not exist.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · next-intl (ko, en) · `@supabase/ssr` · TanStack Query · react-markdown with remark-gfm (restricted rendering) · Vitest and Testing Library · Playwright config for end-to-end tests.

This Next.js version differs from what many tools and models remember; read `AGENTS.md` and the docs in `node_modules/next/dist/docs/` before changing framework code.

## Setup

Requires Node.js and a running backend (local or the hosted one).

```bash
npm install
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
# fill in .env.local; never commit it
npm run dev                    # http://localhost:3000
```

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's **publishable** (public) key |
| `NEXT_PUBLIC_API_URL` | the backend address, for example `http://127.0.0.1:8000` or the hosted API |

Never put the service-role or secret key in this app: everything with `NEXT_PUBLIC_` is sent to browsers. For local development the backend's `FRONTEND_ORIGINS` must include `http://localhost:3000`.

## Commands

```bash
npm run dev            # development server
npm run build          # production build
npm run lint           # eslint
npm test               # vitest, offline
npm run test:e2e       # playwright
npm run gen:api-types  # regenerate API types from the hosted API's /openapi.json
npm run gen:db-types   # regenerate database types from the Supabase project
```

## Deployment

Vercel, from the `main` branch. Set the three variables above in the Vercel project. The backend must list the app's exact origin (for example `https://irb-watch-frontend.vercel.app`, no trailing slash) in its `FRONTEND_ORIGINS` setting, or the browser blocks the calls. Backend deployment is described in the backend repository's `docs/deploy-ec2.md`.

## Project layout

```
src/
  app/[locale]/        pages: sign-in, overview, sources, documents, settings, admin, unsubscribe
  components/          UI: dashboard, document and source views, admin screens, status dot, ui/ (shadcn)
  lib/                 API client, Supabase clients, access and health rules, helpers
  i18n/                next-intl routing and navigation
  proxy.ts             session refresh and which pages are public
messages/              ko.json and en.json (every visible text)
tests/                 Vitest tests
docs/                  frontend plan and decisions (copies of the backend docs for reference)
```

Plans and reasons: `docs/frontend-plan.md` and `docs/frontend-decisions.md` here; the full project decisions are in the backend repository's `docs/decisions.md`.

## License

All rights reserved. No license is granted yet.
