import Database from "better-sqlite3";
const database=new Database(process.env.DATABASE_URL??"./data/gym.db");database.pragma("foreign_keys = ON");
database.exec(`create table if not exists invoice_items (id text primary key not null,invoice_id text not null references invoices(id),description text not null,quantity real not null default 1,unit_price real not null,amount real not null,created_at integer not null);create index if not exists invoice_items_invoice_idx on invoice_items(invoice_id);`);
console.log("Phase 5 invoice item schema migrated.");
