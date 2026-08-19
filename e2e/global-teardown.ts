import { rmSync } from "node:fs";
import postgres from "postgres";

export default async function teardown() {
  process.loadEnvFile?.(".env");
  const url = process.env.DATABASE_URL;
  if (url?.startsWith("postgres")) {
    const sql = postgres(url, { prepare: false, max: 1, ssl: "require", connect_timeout: 15 });
    try {
      await sql.begin(async tx => {
        await tx`delete from audit_logs where gym_id in (select gym_id from users where email like 'registered-%@example.com')`;
        await tx`delete from settings where gym_id in (select gym_id from users where email like 'registered-%@example.com')`;
        await tx`delete from role_permissions where role_id in (select r.id from roles r join users u on u.gym_id=r.gym_id where u.email like 'registered-%@example.com')`;
        await tx`delete from users where email like 'registered-%@example.com'`;
        await tx`delete from roles where gym_id in (select id from gyms where slug like 'browser-registered-gym-%')`;
        await tx`delete from gyms where slug like 'browser-registered-gym-%'`;
        await tx`delete from notification_reads where user_id like 'e2e_%' or notification_id in (select id from notifications where gym_id like 'e2e_gym_%')`;
        await tx`delete from password_tokens where user_id like 'e2e_%'`;
        await tx`delete from sessions where user_id like 'e2e_%'`;
        await tx`delete from invoice_items where invoice_id in (select id from invoices where gym_id like 'e2e_gym_%')`;
        for (const table of ["membership_freezes", "membership_history", "attendance", "payments", "invoices", "memberships", "members", "membership_plans", "expenses", "expense_categories", "notifications", "audit_logs", "trainers", "settings"])
          await tx`delete from ${tx(table)} where gym_id like 'e2e_gym_%'`;
        await tx`delete from role_permissions where role_id like 'e2e_%'`;
        await tx`delete from users where gym_id like 'e2e_gym_%'`;
        await tx`delete from roles where gym_id like 'e2e_gym_%'`;
        await tx`delete from gyms where id like 'e2e_gym_%'`;
        await tx`delete from auth.users where email like '%@e2e.test' or email like 'registered-%@example.com'`;
      });
    } finally {
      await sql.end();
    }
  }
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(`.tmp/form-e2e.db${suffix}`, { force: true });
}
