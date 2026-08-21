-- Minimal additive compatibility for deployed invoice reads on member profiles.
set lock_timeout = '5s';

alter table public.invoices add column if not exists gym_logo_snapshot text;
