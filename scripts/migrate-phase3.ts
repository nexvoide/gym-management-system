import Database from "better-sqlite3";

const database=new Database(process.env.DATABASE_URL??"./data/gym.db");
const columns=(table:string)=>new Set((database.prepare(`pragma table_info(${table})`).all() as {name:string}[]).map(column=>column.name));
const add=(table:string,column:string,declaration:string)=>{if(!columns(table).has(column))database.exec(`alter table ${table} add column ${column} ${declaration}`)};

database.transaction(()=>{
  add("membership_plans","description","text");add("membership_plans","access_description","text");add("membership_plans","notes","text");add("membership_plans","archived_at","integer");
  add("memberships","base_price","real not null default 0");add("memberships","discount","real not null default 0");add("memberships","final_price","real not null default 0");add("memberships","notes","text");add("memberships","created_by","text references users(id)");add("memberships","cancelled_at","integer");
  database.exec("update memberships set base_price=(select price from membership_plans where membership_plans.id=memberships.plan_id), final_price=(select price from membership_plans where membership_plans.id=memberships.plan_id) where base_price=0");
  database.exec(`
    create table if not exists membership_history (id text primary key not null,gym_id text not null references gyms(id),member_id text not null references members(id),membership_id text not null references memberships(id),action text not null,from_status text,to_status text,starts_at integer,ends_at integer,notes text,performed_by text references users(id),created_at integer not null);
    create table if not exists membership_freezes (id text primary key not null,gym_id text not null references gyms(id),membership_id text not null references memberships(id),start_date integer not null,end_date integer not null,days integer not null,reason text,status text not null,created_by text references users(id),resumed_at integer,created_at integer not null,updated_at integer not null);
    create table if not exists invoices (id text primary key not null,gym_id text not null references gyms(id),member_id text not null references members(id),membership_id text references memberships(id),invoice_number text not null,issued_at integer not null,due_at integer not null,subtotal real not null,discount real not null default 0,tax real not null default 0,total real not null,paid real not null default 0,balance real not null,status text not null,notes text,created_at integer not null,updated_at integer not null);
    create table if not exists payments (id text primary key not null,gym_id text not null references gyms(id),member_id text not null references members(id),invoice_id text not null references invoices(id),amount real not null,method text not null,paid_at integer not null,reference text,notes text,recorded_by text references users(id),created_at integer not null);
    create unique index if not exists membership_plans_gym_name_unique on membership_plans(gym_id,name);
    create index if not exists membership_plans_gym_active_idx on membership_plans(gym_id,active);
    create index if not exists memberships_gym_member_idx on memberships(gym_id,member_id);
    create index if not exists memberships_gym_end_idx on memberships(gym_id,ends_at);
    create index if not exists membership_history_member_idx on membership_history(gym_id,member_id,created_at);
    create index if not exists membership_freezes_membership_idx on membership_freezes(membership_id,start_date);
    create unique index if not exists invoices_gym_number_unique on invoices(gym_id,invoice_number);
    create index if not exists invoices_gym_member_idx on invoices(gym_id,member_id);
    create index if not exists payments_gym_member_idx on payments(gym_id,member_id,paid_at);
  `);
})();
console.log("Phase 3 additive columns migrated without dropping membership data.");
