-- Phase 9.7 PostgreSQL baseline. The application uses Supabase Auth sessions;
-- public Data API roles receive no table privileges. RLS remains enabled as a
-- deny-by-default defense if grants are changed later.

create table public.gyms (
  id text primary key,
  name text not null,
  slug text not null unique,
  phone text,
  email text,
  address text,
  logo_url text,
  country text not null default 'US',
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id)
);

create table public.permissions (
  id text primary key,
  key text not null unique,
  description text not null
);

create table public.roles (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete cascade,
  key text not null check (key in ('owner','manager','receptionist','trainer')),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, key),
  unique (id, gym_id)
);

create table public.role_permissions (
  role_id text not null references public.roles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.users (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  role_id text not null,
  name text not null,
  email text not null unique,
  password_hash text not null,
  avatar_url text,
  active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, gym_id),
  foreign key (role_id, gym_id) references public.roles(id, gym_id) on delete restrict
);

create table public.sessions (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_expires_idx on public.sessions(user_id, expires_at);

create table public.password_tokens (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  purpose text not null check (purpose in ('staff_setup','password_reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_tokens_user_idx on public.password_tokens(user_id, expires_at);

create table public.settings (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete cascade,
  category text not null check (category in ('gym','membership','payment','notification')),
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, key),
  unique (id, gym_id)
);

create table public.audit_logs (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (id, gym_id),
  foreign key (user_id, gym_id) references public.users(id, gym_id) on delete set null (user_id)
);
create index audit_logs_gym_created_idx on public.audit_logs(gym_id, created_at desc);

create table public.notifications (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete cascade,
  type text not null check (type in ('membership_expiring','membership_expired','payment_overdue','payment_received')),
  title text not null,
  body text not null,
  entity_type text not null,
  entity_id text not null,
  href text not null,
  channel text not null default 'in_app' check (channel in ('in_app','email','whatsapp','sms')),
  dedupe_key text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (gym_id, dedupe_key),
  unique (id, gym_id)
);
create index notifications_gym_occurred_idx on public.notifications(gym_id, occurred_at desc);

create table public.notification_reads (
  notification_id text not null references public.notifications(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index notification_reads_user_idx on public.notification_reads(user_id, read_at desc);

create table public.trainers (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  user_id text,
  name text not null,
  photo_url text,
  phone text,
  email text,
  specialization text,
  joining_date timestamptz,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (id, gym_id),
  foreign key (user_id, gym_id) references public.users(id, gym_id) on delete set null (user_id)
);
create index trainers_gym_status_idx on public.trainers(gym_id, status);

create table public.members (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  member_number text not null,
  first_name text not null,
  last_name text not null,
  profile_photo_url text,
  date_of_birth timestamptz,
  gender text check (gender in ('female','male','non_binary','prefer_not_to_say')),
  phone text,
  email text,
  address text,
  notes text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  trainer_id text,
  status text not null default 'active' check (status in ('active','frozen','cancelled')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, member_number),
  unique (id, gym_id),
  foreign key (trainer_id, gym_id) references public.trainers(id, gym_id) on delete set null (trainer_id)
);
create index members_gym_name_idx on public.members(gym_id, last_name, first_name);
create index members_gym_phone_idx on public.members(gym_id, phone);
create index members_gym_email_idx on public.members(gym_id, email);
create unique index members_active_email_unique on public.members(gym_id, lower(email)) where archived_at is null and email is not null;
create unique index members_active_phone_unique on public.members(gym_id, phone) where archived_at is null and phone is not null;

create table public.membership_plans (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  name text not null,
  description text,
  duration_days integer not null check (duration_days > 0),
  price numeric(14,2) not null check (price >= 0),
  access_description text,
  notes text,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, name),
  unique (id, gym_id)
);
create index membership_plans_gym_active_idx on public.membership_plans(gym_id, active);

create table public.memberships (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  member_id text not null,
  plan_id text not null,
  status text not null check (status in ('active','expired','frozen','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  base_price numeric(14,2) not null default 0 check (base_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  final_price numeric(14,2) not null default 0 check (final_price >= 0),
  notes text,
  created_by text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, gym_id),
  check (ends_at >= starts_at),
  check (discount <= base_price),
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete restrict,
  foreign key (plan_id, gym_id) references public.membership_plans(id, gym_id) on delete restrict,
  foreign key (created_by, gym_id) references public.users(id, gym_id) on delete set null (created_by)
);
create index memberships_gym_member_idx on public.memberships(gym_id, member_id);
create index memberships_gym_end_idx on public.memberships(gym_id, ends_at);

create table public.membership_history (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  member_id text not null,
  membership_id text not null,
  action text not null check (action in ('created','activated','renewed','frozen','resumed','expired','cancelled')),
  from_status text,
  to_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  performed_by text,
  created_at timestamptz not null default now(),
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete restrict,
  foreign key (membership_id, gym_id) references public.memberships(id, gym_id) on delete restrict,
  foreign key (performed_by, gym_id) references public.users(id, gym_id) on delete set null (performed_by)
);
create index membership_history_member_idx on public.membership_history(gym_id, member_id, created_at desc);

create table public.membership_freezes (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  membership_id text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  days integer not null check (days > 0),
  reason text,
  status text not null check (status in ('scheduled','active','completed','cancelled')),
  created_by text,
  resumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date),
  foreign key (membership_id, gym_id) references public.memberships(id, gym_id) on delete restrict,
  foreign key (created_by, gym_id) references public.users(id, gym_id) on delete set null (created_by)
);
create index membership_freezes_membership_idx on public.membership_freezes(membership_id, start_date);

create table public.invoices (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  member_id text not null,
  membership_id text,
  invoice_number text not null,
  issued_at timestamptz not null,
  due_at timestamptz not null,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null check (total >= 0),
  paid numeric(14,2) not null default 0 check (paid >= 0),
  balance numeric(14,2) not null check (balance >= 0),
  status text not null check (status in ('paid','partially_paid','unpaid','overdue','refunded')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, invoice_number),
  unique (id, gym_id),
  check (paid <= total),
  check (balance = total - paid),
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete restrict,
  foreign key (membership_id, gym_id) references public.memberships(id, gym_id) on delete set null (membership_id)
);
create index invoices_gym_member_idx on public.invoices(gym_id, member_id);
create index invoices_gym_status_idx on public.invoices(gym_id, status, due_at);

create table public.invoice_items (
  id text primary key,
  invoice_id text not null references public.invoices(id) on delete restrict,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);

create table public.payments (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  member_id text not null,
  invoice_id text not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null,
  paid_at timestamptz not null,
  reference text,
  notes text,
  recorded_by text,
  created_at timestamptz not null default now(),
  unique (id, gym_id),
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete restrict,
  foreign key (invoice_id, gym_id) references public.invoices(id, gym_id) on delete restrict,
  foreign key (recorded_by, gym_id) references public.users(id, gym_id) on delete set null (recorded_by)
);
create index payments_gym_member_idx on public.payments(gym_id, member_id, paid_at desc);
create index payments_invoice_idx on public.payments(invoice_id, paid_at desc);

create table public.attendance (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  member_id text not null,
  membership_id text,
  local_date date not null,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  method text not null check (method in ('manual_search','member_id')),
  override_used boolean not null default false,
  override_reason text,
  staff_user_id text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, gym_id),
  check (check_out_at is null or check_out_at >= check_in_at),
  check (not override_used or override_reason is not null),
  foreign key (member_id, gym_id) references public.members(id, gym_id) on delete restrict,
  foreign key (membership_id, gym_id) references public.memberships(id, gym_id) on delete set null (membership_id),
  foreign key (staff_user_id, gym_id) references public.users(id, gym_id) on delete restrict
);
create index attendance_gym_date_idx on public.attendance(gym_id, local_date);
create index attendance_member_checkin_idx on public.attendance(gym_id, member_id, check_in_at desc);
create unique index attendance_one_open_visit on public.attendance(gym_id, member_id) where check_out_at is null;

create table public.expense_categories (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, name),
  unique (id, gym_id)
);

create table public.expenses (
  id text primary key,
  gym_id text not null references public.gyms(id) on delete restrict,
  category_id text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  expense_date timestamptz not null,
  payment_method text not null,
  vendor text,
  receipt_url text,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, gym_id) references public.expense_categories(id, gym_id) on delete restrict,
  foreign key (created_by, gym_id) references public.users(id, gym_id) on delete restrict
);
create index expenses_gym_date_idx on public.expenses(gym_id, expense_date desc);
create index expenses_gym_category_idx on public.expenses(gym_id, category_id);

-- Indirect tenant relationship guards for join tables without gym_id.
create function public.enforce_notification_read_tenant() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.notifications n join public.users u on u.id = new.user_id
    where n.id = new.notification_id and n.gym_id = u.gym_id
  ) then raise exception 'cross-gym relationship rejected' using errcode = '23514'; end if;
  return new;
end $$;
create trigger notification_reads_tenant_guard before insert or update on public.notification_reads
for each row execute function public.enforce_notification_read_tenant();

-- Deny browser/Data API access. The server uses a direct PostgreSQL connection
-- and retains all application permission and gym predicates.
do $$ declare t text; begin
  foreach t in array array[
    'gyms','permissions','roles','role_permissions','users','sessions','password_tokens','settings',
    'audit_logs','notifications','notification_reads','trainers','members','membership_plans','memberships',
    'membership_history','membership_freezes','invoices','invoice_items','payments','attendance',
    'expense_categories','expenses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on function public.enforce_notification_read_tenant() from public, anon, authenticated;
