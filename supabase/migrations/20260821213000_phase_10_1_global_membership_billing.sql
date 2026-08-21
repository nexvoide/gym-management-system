-- Phase 10.1: additive global membership and historical billing snapshots.
alter table public.gyms add column if not exists date_format text not null default 'medium';
alter table public.gyms add column if not exists first_day_of_week integer not null default 1 check (first_day_of_week between 0 and 6);
alter table public.gyms add column if not exists tax_enabled boolean not null default false;
alter table public.gyms add column if not exists tax_name text;
alter table public.gyms add column if not exists tax_percentage numeric(6,3) not null default 0 check (tax_percentage between 0 and 100);

alter table public.membership_plans add column if not exists duration integer;
alter table public.membership_plans add column if not exists duration_unit text;
alter table public.membership_plans add column if not exists currency text;
alter table public.membership_plans add column if not exists signup_fee numeric(18,3) not null default 0;
alter table public.membership_plans add column if not exists recurring boolean not null default false;
update public.membership_plans mp set duration=mp.duration_days, duration_unit='days', currency=g.currency from public.gyms g where g.id=mp.gym_id and (mp.duration is null or mp.duration_unit is null or mp.currency is null);
alter table public.membership_plans alter column duration set not null;
alter table public.membership_plans alter column duration set default 30;
alter table public.membership_plans alter column duration_unit set not null;
alter table public.membership_plans alter column duration_unit set default 'days';
alter table public.membership_plans alter column currency set not null;
alter table public.membership_plans alter column currency set default 'USD';
alter table public.membership_plans add constraint membership_plans_duration_positive check (duration > 0);
alter table public.membership_plans add constraint membership_plans_duration_unit_check check (duration_unit in ('days','weeks','months','years'));
alter table public.membership_plans add constraint membership_plans_currency_check check (currency ~ '^[A-Z]{3}$');

alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships add constraint memberships_status_check check (status in ('pending','active','expired','frozen','cancelled'));
alter table public.memberships add column if not exists currency text;
alter table public.memberships add column if not exists signup_fee numeric(18,3) not null default 0;
alter table public.memberships add column if not exists discount_type text not null default 'fixed' check (discount_type in ('fixed','percentage'));
alter table public.memberships add column if not exists discount_value numeric(18,3) not null default 0;
alter table public.memberships add column if not exists tax_name text;
alter table public.memberships add column if not exists tax_rate numeric(6,3) not null default 0 check (tax_rate between 0 and 100);
alter table public.memberships add column if not exists tax numeric(18,3) not null default 0;
update public.memberships ms set currency=coalesce(mp.currency,g.currency) from public.membership_plans mp, public.gyms g where mp.id=ms.plan_id and g.id=ms.gym_id and ms.currency is null;
alter table public.memberships alter column currency set not null;
alter table public.memberships alter column currency set default 'USD';

alter table public.invoices add column if not exists currency text;
alter table public.invoices add column if not exists member_name text;
alter table public.invoices add column if not exists member_number_snapshot text;
alter table public.invoices add column if not exists member_email text;
alter table public.invoices add column if not exists member_phone text;
alter table public.invoices add column if not exists gym_name text;
alter table public.invoices add column if not exists gym_address text;
alter table public.invoices add column if not exists gym_email text;
alter table public.invoices add column if not exists gym_phone text;
alter table public.invoices add column if not exists tax_name text;
alter table public.invoices add column if not exists tax_rate numeric(6,3) not null default 0;
update public.invoices i set currency=g.currency, member_name=m.first_name||' '||m.last_name, member_number_snapshot=m.member_number, member_email=m.email, member_phone=m.phone, gym_name=g.name, gym_address=g.address, gym_email=g.email, gym_phone=g.phone from public.members m, public.gyms g where m.id=i.member_id and g.id=i.gym_id and i.currency is null;
alter table public.invoices alter column currency set not null;
alter table public.invoices alter column currency set default 'USD';
alter table public.invoices alter column member_name set not null;
alter table public.invoices alter column member_number_snapshot set not null;
alter table public.invoices alter column gym_name set not null;
alter table public.invoices add constraint invoices_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.invoices add constraint invoices_id_currency_unique unique (id,currency);

alter table public.payments add column if not exists currency text;
update public.payments p set currency=i.currency from public.invoices i where i.id=p.invoice_id and p.currency is null;
alter table public.payments alter column currency set not null;
alter table public.payments alter column currency set default 'USD';
alter table public.payments add constraint payments_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.payments add constraint payments_invoice_currency_fk foreign key (invoice_id,currency) references public.invoices(id,currency) on delete restrict;

alter table public.membership_plans alter column price type numeric(18,3);
alter table public.memberships alter column base_price type numeric(18,3), alter column discount type numeric(18,3), alter column final_price type numeric(18,3);
alter table public.invoices alter column subtotal type numeric(18,3), alter column discount type numeric(18,3), alter column tax type numeric(18,3), alter column total type numeric(18,3), alter column paid type numeric(18,3), alter column balance type numeric(18,3);
alter table public.invoice_items alter column unit_price type numeric(18,3), alter column amount type numeric(18,3);
alter table public.payments alter column amount type numeric(18,3);

create index if not exists invoices_gym_currency_issued_idx on public.invoices(gym_id,currency,issued_at desc);
create index if not exists payments_gym_currency_paid_idx on public.payments(gym_id,currency,paid_at desc);
