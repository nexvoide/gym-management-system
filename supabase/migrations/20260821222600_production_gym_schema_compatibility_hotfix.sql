-- Minimal additive compatibility for deployed Phase 10.2 gym reads.
-- The complete Phase 10.2 migration remains separately gated.
set lock_timeout = '5s';

alter table public.gyms add column if not exists website text;
alter table public.gyms add column if not exists whatsapp_phone text;
alter table public.gyms add column if not exists auto_welcome_email boolean not null default true;
alter table public.gyms add column if not exists expiry_reminders_enabled boolean not null default true;
alter table public.gyms add column if not exists expiry_reminder_days jsonb not null default '[7,3]'::jsonb;
