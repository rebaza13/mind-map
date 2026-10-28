-- Shared workspaces: members, email invites, live updates.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  email text not null default '',
  name text not null default '',
  avatar_url text not null default '',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  invited_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists invites_unique on public.workspace_invites (workspace_id, lower(email));

alter table public.maps add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.nodes add column if not exists assignee_id uuid references auth.users(id) on delete set null;

-- Membership checks run as definer so the policies below never recurse into themselves.
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid())
$$;

create or replace function public.map_member(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.maps mp join public.workspace_members wm on wm.workspace_id = mp.workspace_id
    where mp.id = m and wm.user_id = auth.uid())
$$;

create or replace function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare w uuid; meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb); em text := coalesce(auth.jwt() ->> 'email', '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.workspaces (name, owner_id) values (coalesce(nullif(trim(p_name), ''), 'My workspace'), auth.uid()) returning id into w;
  insert into public.workspace_members (workspace_id, user_id, role, email, name, avatar_url)
  values (w, auth.uid(), 'owner', em,
    coalesce(meta ->> 'full_name', meta ->> 'name', split_part(em, '@', 1)),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture', ''));
  return w;
end $$;

-- Called on every sign-in: joins any workspace that invited this email and refreshes the profile picture/name.
create or replace function public.claim_invites() returns void
language plpgsql security definer set search_path = public as $$
declare meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb); em text := lower(coalesce(auth.jwt() ->> 'email', '')); nm text; av text;
begin
  if auth.uid() is null then return; end if;
  nm := coalesce(meta ->> 'full_name', meta ->> 'name', split_part(em, '@', 1));
  av := coalesce(meta ->> 'avatar_url', meta ->> 'picture', '');
  insert into public.workspace_members (workspace_id, user_id, role, email, name, avatar_url)
    select workspace_id, auth.uid(), 'member', em, nm, av from public.workspace_invites where lower(email) = em
    on conflict do nothing;
  delete from public.workspace_invites where lower(email) = em;
  update public.workspace_members set name = nm, email = em, avatar_url = case when av <> '' then av else avatar_url end where user_id = auth.uid();
end $$;

revoke execute on function public.create_workspace(text), public.claim_invites() from public, anon;
grant execute on function public.create_workspace(text), public.claim_invites() to authenticated;
revoke execute on function public.is_member(uuid), public.map_member(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.map_member(uuid) to authenticated;

-- Existing data: every user who already has maps gets a personal workspace that holds them.
do $$ declare r record; w uuid; begin
  for r in select distinct m.user_id, u.email, u.raw_user_meta_data as meta from public.maps m join auth.users u on u.id = m.user_id where m.workspace_id is null loop
    insert into public.workspaces (name, owner_id) values ('My workspace', r.user_id) returning id into w;
    insert into public.workspace_members (workspace_id, user_id, role, email, name, avatar_url)
    values (w, r.user_id, 'owner', coalesce(r.email, ''),
      coalesce(r.meta ->> 'full_name', r.meta ->> 'name', split_part(coalesce(r.email, ''), '@', 1)),
      coalesce(r.meta ->> 'avatar_url', r.meta ->> 'picture', ''));
    update public.maps set workspace_id = w where user_id = r.user_id and workspace_id is null;
  end loop;
end $$;
alter table public.maps alter column workspace_id set not null;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists "ws read" on public.workspaces;
drop policy if exists "ws rename" on public.workspaces;
drop policy if exists "ws delete" on public.workspaces;
create policy "ws read" on public.workspaces for select to authenticated using (public.is_member(id) or owner_id = auth.uid());
create policy "ws rename" on public.workspaces for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "ws delete" on public.workspaces for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members read" on public.workspace_members;
drop policy if exists "members leave" on public.workspace_members;
create policy "members read" on public.workspace_members for select to authenticated using (public.is_member(workspace_id));
create policy "members leave" on public.workspace_members for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

drop policy if exists "invites read" on public.workspace_invites;
drop policy if exists "invites add" on public.workspace_invites;
drop policy if exists "invites remove" on public.workspace_invites;
create policy "invites read" on public.workspace_invites for select to authenticated using (public.is_member(workspace_id) or lower(email) = lower(auth.jwt() ->> 'email'));
create policy "invites add" on public.workspace_invites for insert to authenticated with check (public.is_member(workspace_id) and invited_by = auth.uid());
create policy "invites remove" on public.workspace_invites for delete to authenticated using (public.is_member(workspace_id));

-- Maps and nodes now follow workspace membership instead of single ownership.
drop policy if exists "own rows" on public.maps;
drop policy if exists "own rows" on public.nodes;
drop policy if exists "workspace maps" on public.maps;
drop policy if exists "workspace nodes" on public.nodes;
create policy "workspace maps" on public.maps for all to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "workspace nodes" on public.nodes for all to authenticated using (public.map_member(map_id)) with check (public.map_member(map_id));

-- Live updates.
do $$ begin
  alter publication supabase_realtime add table public.nodes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.maps;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.workspace_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.workspace_invites;
exception when duplicate_object then null; end $$;
