-- The application uses server-side Supabase Auth sessions.
-- Explicit deny policies document that Data API roles have no application data
-- path; table grants were also revoked in the baseline migration.
do $$ declare t text; begin
  foreach t in array array[
    'gyms','permissions','roles','role_permissions','users','sessions','password_tokens','settings',
    'audit_logs','notifications','notification_reads','trainers','members','membership_plans','memberships',
    'membership_history','membership_freezes','invoices','invoice_items','payments','attendance',
    'expense_categories','expenses'
  ] loop
    execute format(
      'create policy deny_data_api on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end $$;

-- Referencing-side indexes support actual joins and prevent parent
-- update/delete checks from degrading into sequential scans.
create index users_gym_idx on public.users(gym_id);
create index users_role_tenant_idx on public.users(role_id, gym_id);
create index role_permissions_permission_idx on public.role_permissions(permission_id);
create index audit_logs_user_tenant_idx on public.audit_logs(user_id, gym_id);
create index trainers_user_tenant_idx on public.trainers(user_id, gym_id);
create index members_trainer_tenant_idx on public.members(trainer_id, gym_id);
create index memberships_member_tenant_idx on public.memberships(member_id, gym_id);
create index memberships_plan_tenant_idx on public.memberships(plan_id, gym_id);
create index memberships_creator_tenant_idx on public.memberships(created_by, gym_id);
create index membership_history_member_tenant_idx on public.membership_history(member_id, gym_id);
create index membership_history_membership_tenant_idx on public.membership_history(membership_id, gym_id);
create index membership_history_actor_tenant_idx on public.membership_history(performed_by, gym_id);
create index membership_freezes_membership_tenant_idx on public.membership_freezes(membership_id, gym_id);
create index membership_freezes_creator_tenant_idx on public.membership_freezes(created_by, gym_id);
create index invoices_member_tenant_idx on public.invoices(member_id, gym_id);
create index invoices_membership_tenant_idx on public.invoices(membership_id, gym_id);
create index payments_member_tenant_idx on public.payments(member_id, gym_id);
create index payments_invoice_tenant_idx on public.payments(invoice_id, gym_id);
create index payments_recorder_tenant_idx on public.payments(recorded_by, gym_id);
create index attendance_member_tenant_idx on public.attendance(member_id, gym_id);
create index attendance_membership_tenant_idx on public.attendance(membership_id, gym_id);
create index attendance_staff_tenant_idx on public.attendance(staff_user_id, gym_id);
create index expenses_category_tenant_idx on public.expenses(category_id, gym_id);
create index expenses_creator_tenant_idx on public.expenses(created_by, gym_id);
