-- Phase 10: default Standard membership and private, tenant-scoped member photos.
-- Existing plan prices and membership records are not changed.

insert into public.membership_plans (
  id, gym_id, name, description, duration_days, price, active
)
select gen_random_uuid()::text, g.id, 'Standard',
  'Default membership for new members', 30, 0, true
from public.gyms g
where not exists (
  select 1 from public.membership_plans mp
  where mp.gym_id = g.id and lower(mp.name) = 'standard' and mp.archived_at is null
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-photos', 'member-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.has_gym_permission(target_gym_id text, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from auth.users au
    join public.users u on lower(u.email) = lower(au.email)
    join public.roles r on r.id = u.role_id and r.gym_id = u.gym_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where au.id = (select auth.uid())
      and u.active = true
      and u.gym_id = target_gym_id
      and p.key = required_permission
  );
$$;
revoke all on function private.has_gym_permission(text, text) from public, anon;
grant execute on function private.has_gym_permission(text, text) to authenticated;

create or replace function private.can_read_member_photo(target_gym_id text, target_member_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from auth.users au
    join public.users u on lower(u.email) = lower(au.email)
    join public.roles r on r.id = u.role_id and r.gym_id = u.gym_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.key = 'members.read'
    where au.id = (select auth.uid())
      and u.active = true
      and u.gym_id = target_gym_id
      and (
        r.key <> 'trainer'
        or exists (
          select 1 from public.trainers t
          join public.members m on m.trainer_id = t.id and m.gym_id = t.gym_id
          where t.gym_id = target_gym_id and t.user_id = u.id and m.id = target_member_id
        )
      )
  );
$$;
revoke all on function private.can_read_member_photo(text, text) from public, anon;
grant execute on function private.can_read_member_photo(text, text) to authenticated;

drop policy if exists member_photos_select on storage.objects;
drop policy if exists member_photos_insert on storage.objects;
drop policy if exists member_photos_update on storage.objects;
drop policy if exists member_photos_delete on storage.objects;

create policy member_photos_select on storage.objects
for select to authenticated
using (
  bucket_id = 'member-photos'
  and (storage.foldername(name))[2] = 'members'
  and private.can_read_member_photo((storage.foldername(name))[1], (storage.foldername(name))[3])
);

create policy member_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'member-photos'
  and (storage.foldername(name))[2] = 'members'
  and private.has_gym_permission((storage.foldername(name))[1], 'members.write')
);

create policy member_photos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'member-photos'
  and (storage.foldername(name))[2] = 'members'
  and private.has_gym_permission((storage.foldername(name))[1], 'members.write')
)
with check (
  bucket_id = 'member-photos'
  and (storage.foldername(name))[2] = 'members'
  and private.has_gym_permission((storage.foldername(name))[1], 'members.write')
);

create policy member_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'member-photos'
  and (storage.foldername(name))[2] = 'members'
  and private.has_gym_permission((storage.foldername(name))[1], 'members.write')
);
