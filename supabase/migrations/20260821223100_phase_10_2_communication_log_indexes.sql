-- Cover communication-log foreign keys used for cleanup and relationship checks.
create index if not exists communication_logs_member_fk_idx on public.communication_logs(member_id);
create index if not exists communication_logs_membership_fk_idx on public.communication_logs(membership_id);
create index if not exists communication_logs_created_by_fk_idx on public.communication_logs(created_by);
