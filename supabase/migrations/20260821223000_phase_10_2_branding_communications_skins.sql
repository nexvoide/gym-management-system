alter table public.gyms add column if not exists website text;
alter table public.gyms add column if not exists whatsapp_phone text;
alter table public.gyms add column if not exists skin text not null default 'midnight' check (skin in ('midnight','slate','light'));
alter table public.gyms add column if not exists auto_welcome_email boolean not null default true;
alter table public.gyms add column if not exists expiry_reminders_enabled boolean not null default true;
alter table public.gyms add column if not exists expiry_reminder_days jsonb not null default '[7,3]'::jsonb;
alter table public.members add column if not exists email_notifications_enabled boolean not null default true;
alter table public.members add column if not exists whatsapp_notifications_enabled boolean not null default true;
alter table public.invoices add column if not exists gym_logo_snapshot text;

create table if not exists public.communication_logs(
 id text primary key,gym_id text not null references public.gyms(id) on delete cascade,member_id text not null references public.members(id) on delete cascade,membership_id text references public.memberships(id) on delete set null,
 kind text not null check(kind in ('welcome','expiry_7','expiry_3','expiry_1')),channel text not null check(channel in ('email','whatsapp_manual')),status text not null check(status in ('claimed','sent','failed','opened')),dedupe_key text not null,recipient text,sent_at timestamptz,created_by text references public.users(id),created_at timestamptz not null default now(),unique(gym_id,dedupe_key)
);
create index if not exists communication_logs_member_idx on public.communication_logs(gym_id,member_id,created_at desc);
create index if not exists communication_logs_member_fk_idx on public.communication_logs(member_id);
create index if not exists communication_logs_membership_fk_idx on public.communication_logs(membership_id);
create index if not exists communication_logs_created_by_fk_idx on public.communication_logs(created_by);
alter table public.communication_logs enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('gym-branding','gym-branding',false,5242880,array['image/jpeg','image/png','image/webp']::text[]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function private.is_gym_owner(target_gym_id text) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and exists(select 1 from auth.users au join public.users u on lower(u.email)=lower(au.email) join public.roles r on r.id=u.role_id and r.gym_id=u.gym_id where au.id=(select auth.uid()) and u.active=true and u.gym_id=target_gym_id and r.key='owner') $$;
revoke all on function private.is_gym_owner(text) from public,anon; grant execute on function private.is_gym_owner(text) to authenticated;
drop policy if exists gym_branding_select on storage.objects;drop policy if exists gym_branding_insert on storage.objects;drop policy if exists gym_branding_update on storage.objects;drop policy if exists gym_branding_delete on storage.objects;
create policy gym_branding_select on storage.objects for select to authenticated using(bucket_id='gym-branding' and private.has_gym_permission((storage.foldername(name))[1],'settings.read'));
create policy gym_branding_insert on storage.objects for insert to authenticated with check(bucket_id='gym-branding' and (storage.foldername(name))[2]='logo' and private.is_gym_owner((storage.foldername(name))[1]));
create policy gym_branding_update on storage.objects for update to authenticated using(bucket_id='gym-branding' and private.is_gym_owner((storage.foldername(name))[1])) with check(bucket_id='gym-branding' and private.is_gym_owner((storage.foldername(name))[1]));
create policy gym_branding_delete on storage.objects for delete to authenticated using(bucket_id='gym-branding' and private.is_gym_owner((storage.foldername(name))[1]));
