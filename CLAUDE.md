# Char'd Pizza

Operating system for a small two-partner pizza business: public site, customer ordering, admin/kitchen/handoff dashboards, payments, finance. Full design in `docs/BLUEPRINT.md`. Read it before touching schema or order logic.

## Stack
- Next.js 16 App Router (note: `src/proxy.ts`, not middleware), React 19, TypeScript, Tailwind v4.
- Supabase: Postgres + Auth + Realtime. Migrations in `supabase/migrations/`, applied with `npm run db:push`.
- Zod validates every incoming payload. Money is integer cents. Timestamps are UTC; business time zone is in `settings`.

## Rules
- Customers never touch the database directly. Public pages and checkout use the server-only client in `src/lib/supabase/admin.ts`. Admin pages use `src/lib/supabase/server.ts` (RLS, signed-in admin).
- Never trust client-sent prices, totals, or capacity. Recompute on the server.
- Never delete transactional rows (orders, payments, audit). Change status instead.
- Capacity is computed from live orders via the `*_availability` views, never stored counters.
- `.env.local` holds secrets; never print or commit it. `.env.example` lists the keys.
- Build is done step by step with the owner; propose each step before building it. Warn before anything that costs money.

## Commands
- `npm run dev` — local dev server
- `npm run build` — typecheck + build (generates `PageProps`/`LayoutProps` types)
- `npm run db:push` — apply migrations to the Supabase project (needs `DATABASE_URL`)
