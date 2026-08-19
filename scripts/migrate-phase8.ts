import Database from "better-sqlite3";

const database = new Database(process.env.DATABASE_URL ?? "./data/gym.db");
database.pragma("foreign_keys = ON");
database.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY NOT NULL,
    gym_id TEXT NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    href TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'in_app',
    dedupe_key TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS notifications_gym_dedupe_unique ON notifications(gym_id, dedupe_key);
  CREATE INDEX IF NOT EXISTS notifications_gym_occurred_idx ON notifications(gym_id, occurred_at);
  CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS notification_reads_unique ON notification_reads(notification_id, user_id);
  CREATE INDEX IF NOT EXISTS notification_reads_user_idx ON notification_reads(user_id, read_at);
`);
console.log("Phase 8 migration complete: notifications and per-user read state are ready.");
