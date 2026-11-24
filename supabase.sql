-- Jardin d'Étude : sauvegardes en ligne.
-- À coller une fois dans Supabase › SQL Editor › New query, puis « Run ».

-- Une ligne par joueur : toute sa sauvegarde (l'objet S du site) en JSON.
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Accès par l'API du site : seulement les joueurs connectés, jamais les visiteurs anonymes.
revoke all on public.saves from anon, authenticated; -- Supabase donne tout par défaut : on ne garde que le nécessaire
grant select, insert, update on public.saves to authenticated;

-- Sécurité : la clé publique du site ne donne accès qu'à sa propre sauvegarde.
alter table public.saves enable row level security;

drop policy if exists "lire sa sauvegarde" on public.saves;
drop policy if exists "créer sa sauvegarde" on public.saves;
drop policy if exists "modifier sa sauvegarde" on public.saves;

create policy "lire sa sauvegarde" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "créer sa sauvegarde" on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "modifier sa sauvegarde" on public.saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
