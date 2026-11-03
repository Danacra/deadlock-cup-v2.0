-- DEADLOCK CUP v2.6 • Выполни после upgrade-tournament.sql
-- Без удаления заявок, команд или результатов. Рекомендуется сделать резервную копию.

-- Steam avatar requires explicit player consent.
alter table public.registrations
  add column if not exists steam_avatar_opt_in boolean not null default false,
  add column if not exists steam_avatar_url text not null default '';
grant insert (steam_avatar_opt_in) on public.registrations to anon, authenticated;
-- Старая колонка steam_profile остаётся приватной; новые картинки не публичны напрямую.
-- Public grants on registrations unchanged (SELECT only admins via RLS).

-- Команды: безопасные настройки цвета и эмблемы.
alter table public.tournament_teams
  add column if not exists team_color text not null default '#B6FF00',
  add column if not exists logo_url text not null default '';
alter table public.tournament_teams drop constraint if exists t_color_valid;
alter table public.tournament_teams
  add constraint t_color_valid check (team_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.tournament_teams drop constraint if exists t_logo_url_length;
alter table public.tournament_teams
  add constraint t_logo_url_length check (char_length(logo_url) <= 1024);
grant insert (name,team_color), update (team_color,logo_url)
  on public.tournament_teams to authenticated;

-- Only allowed public data: nickname and an avatar, when the player opted in.
create or replace function public.get_public_avatar_roster()
returns table(nickname text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select r.nickname,
    case when r.status = 'approved' and r.steam_avatar_opt_in
      then r.steam_avatar_url else '' end as avatar_url
  from public.registrations r
  where r.status <> 'rejected'
  order by lower(r.nickname);
$$;
revoke all on function public.get_public_avatar_roster() from public, anon, authenticated;
grant execute on function public.get_public_avatar_roster() to anon, authenticated;

-- Изменяем тип результата функции: DROP затем CREATE (старые данные не удаляются).
drop function if exists public.get_public_team_roster();
create function public.get_public_team_roster()
returns table(team_id uuid, nickname text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select m.team_id, r.nickname,
    case when r.steam_avatar_opt_in then r.steam_avatar_url else '' end as avatar_url
  from public.team_members m
  join public.registrations r on r.id=m.registration_id
  where r.status='approved'
  order by lower(r.nickname);
$$;
revoke all on function public.get_public_team_roster() from public, anon, authenticated;
grant execute on function public.get_public_team_roster() to anon, authenticated;

-- Bucket for team emblems. Public only image files; admins alone can upload.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('team-logos','team-logos',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=2097152,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Deadlock admin can upload team logos" on storage.objects;
create policy "Deadlock admin can upload team logos"
  on storage.objects for insert to authenticated
  with check (bucket_id='team-logos' and public.is_admin());
drop policy if exists "Deadlock admin can remove team logos" on storage.objects;
create policy "Deadlock admin can remove team logos"
  on storage.objects for delete to authenticated
  using (bucket_id='team-logos' and public.is_admin());
drop policy if exists "Deadlock public can read team logos" on storage.objects;
create policy "Deadlock public can read team logos"
  on storage.objects for select to anon, authenticated
  using (bucket_id='team-logos');
