import Database from "better-sqlite3";
const database=new Database(process.env.DATABASE_URL??"./data/gym.db");database.pragma("foreign_keys = ON");
database.exec(`
create table if not exists attendance (id text primary key not null,gym_id text not null references gyms(id),member_id text not null references members(id),membership_id text references memberships(id),local_date text not null,check_in_at integer not null,check_out_at integer,method text not null,override_used integer not null default 0,override_reason text,staff_user_id text not null references users(id),notes text,created_at integer not null);
create index if not exists attendance_gym_date_idx on attendance(gym_id,local_date);
create index if not exists attendance_member_checkin_idx on attendance(gym_id,member_id,check_in_at);
create unique index if not exists attendance_one_open_visit on attendance(gym_id,member_id) where check_out_at is null;
`);
console.log("Phase 4 attendance schema migrated.");
