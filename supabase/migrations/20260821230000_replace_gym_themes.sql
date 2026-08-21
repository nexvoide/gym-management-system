-- Replace obsolete Phase 10.2 skin names while preserving each gym's closest visual preference.
alter table public.gyms drop constraint if exists gyms_skin_check;
update public.gyms set skin = case skin when 'light' then 'titanium' when 'slate' then 'carbon' else 'midnight' end;
alter table public.gyms add constraint gyms_skin_check check (skin in ('midnight','titanium','carbon'));
alter table public.gyms alter column skin set default 'midnight';
