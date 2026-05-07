create table if not exists public.route_tracking_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  encrypted_route bytea not null,
  point_count integer not null default 0,
  view_mode text,
  source text default 'google_maps',
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_route_tracking_user_recorded
  on public.route_tracking_history (user_id, recorded_at desc);
alter table public.route_tracking_history enable row level security;
drop policy if exists "Owner reads own routes" on public.route_tracking_history;
create policy "Owner reads own routes" on public.route_tracking_history
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Command tier reads all routes" on public.route_tracking_history;
create policy "Command tier reads all routes" on public.route_tracking_history
  for select to authenticated using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'oic'::app_role)
    or public.has_role(auth.uid(), '2ic'::app_role)
    or public.has_role(auth.uid(), 'staff_officer'::app_role)
    or public.has_role(auth.uid(), 'supervisor'::app_role)
  );
drop policy if exists "Owner inserts own routes" on public.route_tracking_history;
create policy "Owner inserts own routes" on public.route_tracking_history
  for insert to authenticated with check (user_id = auth.uid());

create table if not exists public.map_access_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null,
  view_mode text,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_map_access_audit_user on public.map_access_audit (user_id, occurred_at desc);
alter table public.map_access_audit enable row level security;
drop policy if exists "Self insert map audit" on public.map_access_audit;
create policy "Self insert map audit" on public.map_access_audit
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Command tier reads map audit" on public.map_access_audit;
create policy "Command tier reads map audit" on public.map_access_audit
  for select to authenticated using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'oic'::app_role)
    or public.has_role(auth.uid(), '2ic'::app_role)
    or public.has_role(auth.uid(), 'staff_officer'::app_role)
    or public.has_role(auth.uid(), 'supervisor'::app_role)
  );