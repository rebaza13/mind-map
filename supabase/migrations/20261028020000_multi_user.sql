-- Anyone who signs in can use the app, but each person only ever sees their own rows.
do $$ declare t text; begin
  foreach t in array array['maps','nodes','chat_sessions'] loop
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
drop function if exists public.is_owner();
