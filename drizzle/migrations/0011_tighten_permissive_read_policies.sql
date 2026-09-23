-- Helper: caller is a real staff member of this service (has a profile row).
create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles p where p.user_id = auth.uid());
$$;

revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;

-- ── Reference / configuration data: readable by staff of this service only ──
drop policy if exists "Authenticated can read tag counters" on public.asset_tag_counters;
create policy "Staff can read tag counters" on public.asset_tag_counters
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Anyone authed can read attendance window settings" on public.attendance_window_settings;
create policy "Staff can read attendance window settings" on public.attendance_window_settings
  for select to authenticated using (public.is_active_staff());

drop policy if exists "biodata_custom_columns_read" on public.biodata_custom_columns;
create policy "biodata_custom_columns_read" on public.biodata_custom_columns
  for select to authenticated using (public.is_active_staff());

drop policy if exists "biodata_custom_fields_read" on public.biodata_custom_fields;
create policy "biodata_custom_fields_read" on public.biodata_custom_fields
  for select to authenticated using (public.is_active_staff());

drop policy if exists "biodata_custom_tables_read" on public.biodata_custom_tables;
create policy "biodata_custom_tables_read" on public.biodata_custom_tables
  for select to authenticated using (public.is_active_staff());

drop policy if exists "biodata_option_sets_read" on public.biodata_option_sets;
create policy "biodata_option_sets_read" on public.biodata_option_sets
  for select to authenticated using (public.is_active_staff());

drop policy if exists "biodata_options_read" on public.biodata_options;
create policy "biodata_options_read" on public.biodata_options
  for select to authenticated using (public.is_active_staff());

drop policy if exists "command_rank_visibility_read" on public.command_rank_visibility;
create policy "command_rank_visibility_read" on public.command_rank_visibility
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Anyone can view departments" on public.departments;
create policy "Staff can view departments" on public.departments
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Authenticated staff can read Ghana districts" on public.ghana_districts;
create policy "Staff can read Ghana districts" on public.ghana_districts
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Authenticated staff can read regional capitals" on public.ghana_regional_capitals;
create policy "Staff can read regional capitals" on public.ghana_regional_capitals
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Anyone can view holidays" on public.holidays;
create policy "Staff can view holidays" on public.holidays
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Authenticated can read interlink branding" on public.interlink_branding;
create policy "Staff can read interlink branding" on public.interlink_branding
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Anyone can view ranks" on public.ranks;
create policy "Staff can view ranks" on public.ranks
  for select to authenticated using (public.is_active_staff());

drop policy if exists "rank_categories_read" on public.rank_categories;
create policy "rank_categories_read" on public.rank_categories
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Anyone can view shifts" on public.shifts;
create policy "Staff can view shifts" on public.shifts
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Authenticated can read exclusions" on public.shift_rotation_exclusions;
create policy "Staff can read exclusions" on public.shift_rotation_exclusions
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Portfolios are viewable by authenticated" on public.portfolios;
create policy "Portfolios are viewable by staff" on public.portfolios
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Assignments viewable by authenticated" on public.profile_portfolios;
create policy "Assignments viewable by staff" on public.profile_portfolios
  for select to authenticated using (public.is_active_staff());

drop policy if exists "Authenticated can read leave entitlements" on public.leave_entitlements;
create policy "Staff can read leave entitlements" on public.leave_entitlements
  for select to authenticated using (public.is_active_staff());

drop policy if exists "All authenticated view inventory" on public.medical_inventory;
create policy "Staff view inventory" on public.medical_inventory
  for select to authenticated using (public.is_active_staff());

drop policy if exists "All authenticated view services" on public.healthcare_services;
create policy "Staff view services" on public.healthcare_services
  for select to authenticated using (public.is_active_staff());

-- M&E framework configuration: staff-scoped reads
drop policy if exists "me_forms_read" on public.me_form_templates;
create policy "me_forms_read" on public.me_form_templates
  for select to authenticated using (public.is_active_staff());

drop policy if exists "me_pillars_read" on public.me_pillars;
create policy "me_pillars_read" on public.me_pillars
  for select to authenticated using (public.is_active_staff());

drop policy if exists "me_frameworks_read" on public.me_frameworks;
create policy "me_frameworks_read" on public.me_frameworks
  for select to authenticated using (public.is_active_staff());

drop policy if exists "me_fwrows_read" on public.me_framework_rows;
create policy "me_fwrows_read" on public.me_framework_rows
  for select to authenticated using (public.is_active_staff());

drop policy if exists "me_periods_read" on public.me_reporting_periods;
create policy "me_periods_read" on public.me_reporting_periods
  for select to authenticated using (public.is_active_staff());

drop policy if exists "me_deps_read" on public.me_dependencies;
create policy "me_deps_read" on public.me_dependencies
  for select to authenticated using (public.is_active_staff());

-- ── Sensitive operational data: oversight / functional roles only ──
drop policy if exists "Authenticated can view sanctions" on public.ipse_sanctions;
create policy "Oversight can view sanctions" on public.ipse_sanctions
  for select to authenticated using (
    public.is_command_tier(auth.uid())
    or public.has_role(auth.uid(), 'ipse_supervisor'::app_role)
    or public.has_role(auth.uid(), 'ipse_deputy_supervisor'::app_role)
  );

drop policy if exists "Authenticated can read procurement budgets" on public.procurement_budgets;
create policy "Oversight can read procurement budgets" on public.procurement_budgets
  for select to authenticated using (
    public.is_command_tier(auth.uid()) or public.can_manage_procurement(auth.uid())
  );

drop policy if exists "Authenticated can read maintenance records" on public.fleet_maintenance_records;
create policy "Fleet and command can read maintenance records" on public.fleet_maintenance_records
  for select to authenticated using (
    public.is_command_tier(auth.uid()) or public.can_manage_fleet(auth.uid())
  );

drop policy if exists "Authenticated can read maintenance schedules" on public.fleet_maintenance_schedules;
create policy "Fleet and command can read maintenance schedules" on public.fleet_maintenance_schedules
  for select to authenticated using (
    public.is_command_tier(auth.uid()) or public.can_manage_fleet(auth.uid())
  );

drop policy if exists "Authenticated can view commands" on public.confidentiality_commands;
create policy "Command tier can view commands" on public.confidentiality_commands
  for select to authenticated using (
    public.is_command_tier(auth.uid()) or public.has_role(auth.uid(), 'admin'::app_role)
  );

drop policy if exists "Authenticated can read shift connection permissions" on public.shift_connection_permissions;
create policy "Shift leadership can read connection permissions" on public.shift_connection_permissions
  for select to authenticated using (
    public.is_command_tier(auth.uid())
    or public.has_role(auth.uid(), 'shift_supervisor'::app_role)
    or public.has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
    or public.has_role(auth.uid(), 'shift_leader'::app_role)
    or public.has_role(auth.uid(), 'deputy_shift_leader'::app_role)
  );

-- ── Inserts must belong to the caller ──
drop policy if exists "me_incidents_insert" on public.me_incidents;
create policy "me_incidents_insert" on public.me_incidents
  for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "me_results_insert" on public.me_results;
create policy "me_results_insert" on public.me_results
  for insert to authenticated with check (auth.uid() = reported_by);