# Production operations

## Architecture and environment

The production application is a Next.js 16 Node server using Supabase Auth SSR cookies and Drizzle over the Supabase transaction pooler. A specific hosting provider is not yet selected. Production must set `NODE_ENV=production`, `DATABASE_URL` (pooler port 6543), `DATABASE_POOL_SIZE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, canonical HTTPS `APP_URL`, and the server-only mail variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME`.

Never set a service-role key, database password, SMTP password, or private token in a `NEXT_PUBLIC_*` variable. Production has no SQLite fallback. E2E credentials and fixture setup must exist only in the test job.

`SUPABASE_SECRET_KEY` is server-only and is used exclusively for authorized staff-account deletion through the Supabase Admin API. It must never be exposed to client code. Staff with immutable attendance or expense attribution cannot be deleted; deactivate them instead.

## Deployment and rollback

1. Validate required environment variables and confirm the database URL identifies the production project.
2. Install the lockfile with `npm ci`; run typecheck, lint, tests, and `npm run build`.
3. Review migrations for destructive SQL, take/verify the required backup, and run `supabase db push --dry-run` against the explicit target.
4. Apply migrations before deploying code that depends on them.
5. Deploy with `npm run start`, request `/api/health`, and run the controlled production smoke test.
6. Confirm login, logout, tenant isolation, and the owner dashboard.

Rollback application code to the previous artifact. Prefer forward-fix migrations; never reset production. For an incompatible schema change, use its separately reviewed compensating migration. A failed migration stops deployment.

## Health, logs, and monitoring

`GET /api/health` returns 200 `{status:"ok"}` only when the app can query PostgreSQL, otherwise 503 with no diagnostics. Configure the eventual hosting monitor to probe it at least every minute and alert after consecutive failures. Hosted uptime/error monitoring is **not configured** in this repository.

Logs are JSON and redact keys that look like passwords, tokens, cookies, secrets, or keys. Platform log retention and alert routing remain hosting decisions. Do not log member records, credentials, reset links, or raw database errors.

## Supabase Auth and SMTP

Set the Supabase Site URL to `APP_URL`; allow only required HTTPS redirect URLs. Configure confirmation/recovery email templates for the SSR callback and custom SMTP with a verified sender domain, SPF, DKIM, and DMARC. Test registration, invitation, and recovery delivery to a non-team mailbox. Until that succeeds, production SMTP is **not configured**.

Staff invitations are sent directly by the server through the same Brevo SMTP account. `SMTP_FROM_EMAIL` must be a verified Brevo sender or belong to a verified sending domain. Invitation links are built exclusively from `APP_URL`; production must use the canonical HTTPS domain. SMTP credentials must never use a `NEXT_PUBLIC_` name.

In Auth password settings, use at least 12 characters and enable leaked-password protection where the project plan supports it. Confirm Auth rate limits for signup, recovery, and token refresh. The application also applies shared PostgreSQL limits to login, registration, and recovery requests.

## Backups and recovery

Backup availability is plan-dependent and must be verified in Supabase Dashboard > Database > Backups. Pro currently documents daily backups with seven-day retention; PITR is a separate paid add-on. The current project's plan, retained restore points, and PITR status are **not verified**.

Before launch, record the plan and earliest restore point, create an encrypted logical off-site backup, and restore it into a separate non-production project. Reapply/verify committed migrations, reconcile table counts and financial totals, and document recovery time. Never test restoration against production. The project owner initiates Dashboard restoration; application operators then verify migrations, health, authentication, tenant isolation, and financial reconciliation.

## Smoke test

Use an isolated QA gym. Verify health, login/logout, protected redirects, owner dashboard, member search/create, attendance, membership and payment workflows, all four roles, and cross-gym direct-ID denial. Delete only the isolated QA tenant afterward. Do not run destructive fixtures against real gym data.

## Storage and external services

There is no binary upload or Supabase Storage integration. Profile photos and receipts are external URLs; no storage credential is present. Email is the only planned external service beyond Supabase. Reassess authorization, MIME/size limits, private buckets, tenant-prefixed keys, timeouts, and retries before adding uploads or webhooks.
