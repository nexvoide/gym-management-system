alter table public.trainers add column if not exists salary_amount numeric(18,3);
alter table public.trainers add column if not exists salary_currency text;
alter table public.trainers add column if not exists salary_period text;
alter table public.trainers add constraint trainers_salary_nonnegative check (salary_amount is null or salary_amount >= 0);
alter table public.trainers add constraint trainers_salary_currency_check check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$');
alter table public.trainers add constraint trainers_salary_period_check check (salary_period is null or salary_period in ('hourly','per_session','weekly','monthly'));

alter table public.expenses add column if not exists trainer_id text references public.trainers(id) on delete set null;
alter table public.expenses add column if not exists currency text;
update public.expenses e set currency=g.currency from public.gyms g where g.id=e.gym_id and e.currency is null;
alter table public.expenses alter column currency set not null;
alter table public.expenses alter column currency set default 'USD';
alter table public.expenses alter column amount type numeric(18,3);
alter table public.expenses add constraint expenses_currency_check check (currency ~ '^[A-Z]{3}$');
create index if not exists expenses_gym_trainer_date_idx on public.expenses(gym_id,trainer_id,expense_date desc);
