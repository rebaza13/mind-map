-- Nebula Mind: schema. Everything is locked to a single owner email via RLS.
create or replace function public.is_owner() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'rebazawat10@gmail.com'
$$;

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Untitled map',
  created_at timestamptz not null default now()
);

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.nodes(id) on delete cascade,
  title text not null default 'New idea',
  notes text not null default '',
  color text not null default '#7c5cff',
  done boolean not null default false,
  x double precision,
  y double precision,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  project text not null default '',
  summary text not null default '',
  url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists nodes_map_idx on public.nodes(map_id);

alter table public.maps enable row level security;
alter table public.nodes enable row level security;
alter table public.chat_sessions enable row level security;

do $$ declare t text; begin
  foreach t in array array['maps','nodes','chat_sessions'] loop
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format('create policy "owner all" on public.%I for all to authenticated using (public.is_owner() and user_id = auth.uid()) with check (public.is_owner() and user_id = auth.uid())', t);
  end loop;
end $$;
