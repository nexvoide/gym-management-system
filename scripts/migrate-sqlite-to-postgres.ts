import Database from "better-sqlite3";
import postgres from "postgres";

process.loadEnvFile?.(".env");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgres")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
}

const sourcePath = process.env.SQLITE_SOURCE_PATH ?? "data/gym.db";
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  ssl: "require",
  connect_timeout: 15,
});

const tableOrder = [
  "gyms",
  "permissions",
  "roles",
  "role_permissions",
  "users",
  "sessions",
  "password_tokens",
  "settings",
  "audit_logs",
  "notifications",
  "notification_reads",
  "trainers",
  "members",
  "membership_plans",
  "memberships",
  "membership_history",
  "membership_freezes",
  "invoices",
  "invoice_items",
  "payments",
  "attendance",
  "expense_categories",
  "expenses",
] as const;

const timestampColumns = new Set([
  "created_at", "updated_at", "expires_at", "used_at", "last_login_at",
  "occurred_at", "read_at", "joining_date", "date_of_birth", "archived_at",
  "starts_at", "ends_at", "cancelled_at", "start_date", "end_date", "resumed_at",
  "issued_at", "due_at", "paid_at", "check_in_at", "check_out_at", "expense_date",
]);
const booleanColumns = new Set(["active", "must_change_password", "override_used"]);
const jsonColumns = new Set(["value", "metadata"]);

type SourceRow = Record<string, unknown>;

function convertRow(row: SourceRow) {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => {
    if (value == null) return [column, null];
    if (timestampColumns.has(column) && typeof value === "number") {
      return [column, new Date(value * 1000)];
    }
    if (booleanColumns.has(column)) return [column, Boolean(value)];
    if (jsonColumns.has(column) && typeof value === "string") {
      return [column, JSON.parse(value)];
    }
    return [column, value];
  }));
}

const sourceCounts = new Map<string, number>();

async function main() {
try {
  await target.begin(async (sql) => {
    for (const table of tableOrder) {
      const rows = (source.prepare(`select * from "${table}"`).all() as SourceRow[]).map(convertRow);
      sourceCounts.set(table, rows.length);
      if (!rows.length) continue;

      const columns = Object.keys(rows[0]);
      for (let offset = 0; offset < rows.length; offset += 250) {
        const batch = rows.slice(offset, offset + 250);
        await sql`insert into ${sql(table)} ${sql(batch, ...columns)} on conflict do nothing`;
      }
    }

    for (const table of tableOrder) {
      const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from ${sql(table)}`;
      const expected = sourceCounts.get(table) ?? 0;
      if (count !== expected) {
        throw new Error(`Reconciliation failed for ${table}: SQLite=${expected}, PostgreSQL=${count}`);
      }
    }

    const [sourceMoney] = source.prepare(`
      select
        (select coalesce(sum(total), 0) from invoices) as invoice_total,
        (select coalesce(sum(paid), 0) from invoices) as invoice_paid,
        (select coalesce(sum(balance), 0) from invoices) as invoice_balance,
        (select coalesce(sum(amount), 0) from payments) as payment_total,
        (select coalesce(sum(amount), 0) from expenses) as expense_total
    `).all() as Record<string, number>[];
    const [targetMoney] = await sql<Record<string, string>[]>`
      select
        (select coalesce(sum(total), 0) from invoices)::text as invoice_total,
        (select coalesce(sum(paid), 0) from invoices)::text as invoice_paid,
        (select coalesce(sum(balance), 0) from invoices)::text as invoice_balance,
        (select coalesce(sum(amount), 0) from payments)::text as payment_total,
        (select coalesce(sum(amount), 0) from expenses)::text as expense_total
    `;
    for (const key of Object.keys(sourceMoney)) {
      if (Number(targetMoney[key]) !== Number(sourceMoney[key])) {
        throw new Error(`Financial reconciliation failed for ${key}`);
      }
    }

    const [{ broken }] = await sql<{ broken: number }[]>`
      select (
        (select count(*) from members m left join gyms g on g.id=m.gym_id where g.id is null) +
        (select count(*) from memberships ms left join members m on m.id=ms.member_id and m.gym_id=ms.gym_id where m.id is null) +
        (select count(*) from invoices i left join members m on m.id=i.member_id and m.gym_id=i.gym_id where m.id is null) +
        (select count(*) from payments p left join invoices i on i.id=p.invoice_id and i.gym_id=p.gym_id where i.id is null) +
        (select count(*) from attendance a left join members m on m.id=a.member_id and m.gym_id=a.gym_id where m.id is null)
      )::int as broken
    `;
    if (broken !== 0) throw new Error(`Relationship reconciliation found ${broken} broken tenant links`);
  });

  console.log("SQLite to PostgreSQL migration: PASS");
  for (const table of tableOrder) console.log(`${table}=${sourceCounts.get(table) ?? 0}`);
  console.log("Financial totals: PASS");
  console.log("Tenant relationships: PASS");
} finally {
  source.close();
  await target.end();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
