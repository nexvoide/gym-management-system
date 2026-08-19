create table public.request_limits (
  key text primary key,
  count integer not null default 0 check (count >= 0),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index request_limits_expires_idx on public.request_limits(expires_at);
alter table public.request_limits enable row level security;
revoke all on table public.request_limits from anon, authenticated;

comment on table public.request_limits is 'Server-only shared throttles and short operational leases.';
