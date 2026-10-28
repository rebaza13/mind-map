alter table public.nodes add column if not exists assignee text not null default '';
alter table public.nodes add column if not exists due date;
alter table public.nodes add column if not exists priority text not null default '';
