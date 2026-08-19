import Database from "better-sqlite3";

const database = new Database(process.env.DATABASE_URL ?? "./data/gym.db");
database.pragma("foreign_keys = ON");

function addColumn(table: string, definition: string) {
  const column = definition.split(/\s+/)[0];
  const exists = database.prepare(`PRAGMA table_info(${table})`).all().some((row) => (row as { name: string }).name === column);
  if (!exists) database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

database.transaction(() => {
  addColumn("gyms", "country TEXT NOT NULL DEFAULT 'US'");
  addColumn("users", "must_change_password INTEGER NOT NULL DEFAULT 0");
  addColumn("trainers", "user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  database.exec(`
    UPDATE roles SET key='owner', name='Owner', description='Full gym ownership access' WHERE key='super_admin';
    CREATE UNIQUE INDEX IF NOT EXISTS trainers_user_unique ON trainers(user_id) WHERE user_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS password_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS password_tokens_user_idx ON password_tokens(user_id, expires_at);
  `);

  const checks = [
    ["users", "role_id", "roles"], ["members", "trainer_id", "trainers"],
    ["memberships", "member_id", "members"], ["memberships", "plan_id", "membership_plans"], ["memberships", "created_by", "users"],
    ["membership_history", "member_id", "members"], ["membership_history", "membership_id", "memberships"], ["membership_history", "performed_by", "users"],
    ["membership_freezes", "membership_id", "memberships"], ["membership_freezes", "created_by", "users"],
    ["invoices", "member_id", "members"], ["invoices", "membership_id", "memberships"],
    ["payments", "member_id", "members"], ["payments", "invoice_id", "invoices"], ["payments", "recorded_by", "users"],
    ["attendance", "member_id", "members"], ["attendance", "membership_id", "memberships"], ["attendance", "staff_user_id", "users"],
    ["expenses", "category_id", "expense_categories"], ["expenses", "created_by", "users"],
    ["audit_logs", "user_id", "users"], ["trainers", "user_id", "users"],
  ] as const;
  for (const [table, column, parent] of checks) {
    for (const event of ["INSERT", "UPDATE"] as const) {
      const suffix = event === "INSERT" ? "insert" : "update";
      database.exec(`CREATE TRIGGER IF NOT EXISTS tenant_${table}_${column}_${suffix}
        BEFORE ${event} ON ${table} WHEN NEW.${column} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE p.id=NEW.${column} AND p.gym_id=NEW.gym_id)
        BEGIN SELECT RAISE(ABORT, 'cross-gym relationship rejected'); END;`);
    }
  }
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS tenant_notification_reads_insert BEFORE INSERT ON notification_reads
    WHEN NOT EXISTS (SELECT 1 FROM notifications n JOIN users u ON u.id=NEW.user_id WHERE n.id=NEW.notification_id AND n.gym_id=u.gym_id)
    BEGIN SELECT RAISE(ABORT, 'cross-gym relationship rejected'); END;
    CREATE TRIGGER IF NOT EXISTS tenant_notification_reads_update BEFORE UPDATE ON notification_reads
    WHEN NOT EXISTS (SELECT 1 FROM notifications n JOIN users u ON u.id=NEW.user_id WHERE n.id=NEW.notification_id AND n.gym_id=u.gym_id)
    BEGIN SELECT RAISE(ABORT, 'cross-gym relationship rejected'); END;
  `);
})();

console.log("Phase 9 migration complete: owner role, account tokens, trainer identities, and tenant relationship guards are ready.");
