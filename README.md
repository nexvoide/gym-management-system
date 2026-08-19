# Form Gym Management

A lean, universal gym operations system with PostgreSQL-backed multi-gym isolation.

## Stack

- Next.js 16 App Router, React, TypeScript
- Drizzle ORM with PostgreSQL 17 on Supabase; the transaction pooler uses `prepare: false`
- Supabase Auth with SSR cookie sessions and protected App Router routes
- bcrypt password hashing and Zod validation
- Custom responsive component and design system

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Set `DATABASE_URL` to the Supabase transaction-pooler URL on port 6543, with the password URL-encoded. Also set the project URL and publishable key. Never expose the database password, secret key, or legacy service-role key to browser code.

Apply the committed files in `supabase/migrations/` before starting the app. For a one-time migration from the legacy SQLite database:

```bash
npm run db:migrate:postgres
npm run db:migrate:auth
```

Both commands are idempotent and reconcile their results. Keep `data/gym.db` as a rollback archive until production acceptance. SQLite remains a development-only dependency solely for the one-time importer and isolated fixture generation; it is not an application runtime fallback.

Demo data is opt-in and blocked in production: `DEMO_SEED=true npm run db:seed`.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test --project=chromium
```

Production deployment, recovery, SMTP, health monitoring, rollback, and smoke-test requirements are documented in [docs/production-operations.md](docs/production-operations.md). Platform-dependent items are deliberately marked unverified until validated in the selected production environment.

## Implemented phases

- Phase 1: organization-aware schema, authentication, RBAC, protected routes, responsive shell, design primitives, audit foundation, and regional settings.
- Phase 2: searchable and paginated member directory, derived member status, registration, editing, profile, contact and emergency details, trainer assignment, internal notes, and member activity.
- Phase 3: configurable plans, membership activation and renewal, price snapshots, invoices and initial payments, freezes and resume adjustments, cancellations, expiration status, and complete membership history.
- Phase 4: reception search, membership-aware check-in, check-out, manager overrides with reasons, duplicate-entry protection, attendance history, member visits, and daily/weekly/monthly totals.
- Phase 5: invoice line items, printable invoices, configured payment methods, immutable payment history, partial payments, outstanding balances, overdue status, and member financial summaries.
- Phase 6: trainer profiles and member assignments, trainer directory and detail views, expense categories, dated expense records, payment methods, receipt links, operating-cost summaries, filtering, and role-aware management.
- Phase 7: live dashboard KPIs, selectable revenue trends, needs-attention links, recent activity, transparent revenue/expense/profit summaries, member, attendance, financial, and membership reports, date filters, CSV exports, and print-friendly views.
- Phase 8: durable in-app notifications for expiring and expired memberships, overdue and received payments, role-aware visibility, per-user read state, unread indicators, extensible delivery channels, and a searchable, filterable audit log with affected-record links.
- Phase 9: multi-gym ownership, tenant-aware application authorization, composite database constraints, and Supabase Auth.
- Phase 9.7: PostgreSQL 17 production schema, RLS defense in depth, pooled server access, complete SQLite and Auth migration, reconciliation, and PostgreSQL-backed automated/E2E tests.

Email, WhatsApp, and SMS delivery remain extension points; no external provider is falsely presented as connected. Deeper accounting and optional modules remain outside the universal core.
