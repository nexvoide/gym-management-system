-- Minimal production recovery for a deployed layout that reads gyms.skin.
alter table public.gyms
  add column if not exists skin text not null default 'midnight';

alter table public.gyms
  drop constraint if exists gyms_skin_check;

alter table public.gyms
  add constraint gyms_skin_check check (skin in ('midnight', 'slate', 'light'));
