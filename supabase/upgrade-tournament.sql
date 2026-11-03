-- DEADLOCK CUP · Дополнение для команд (до 6 игроков) и сетки single elimination.
-- Для УЖЕ РАБОТАЮЩЕГО Supabase запустите только этот файл в SQL Editor → Run.
-- Не удаляет registrations, public_roster, broadcast_state, app_admins.
-- Нужна ранее созданная функция public.is_admin().

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 36),
  created_at timestamptz not null default now()
);
create unique index if not exists tournament_teams_name_key on public.tournament_teams (lower(btrim(name)));
alter table public.tournament_teams enable row level security;
revoke all on public.tournament_teams from anon, authenticated;
grant select on public.tournament_teams to anon, authenticated;
grant insert (name), update (name), delete on public.tournament_teams to authenticated;
drop policy if exists "Public can see teams" on public.tournament_teams;
create policy "Public can see teams" on public.tournament_teams for select to anon, authenticated using (true);
drop policy if exists "Admin creates teams" on public.tournament_teams;
create policy "Admin creates teams" on public.tournament_teams for insert to authenticated with check (public.is_admin());
drop policy if exists "Admin edits teams" on public.tournament_teams;
create policy "Admin edits teams" on public.tournament_teams for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin deletes teams" on public.tournament_teams;
create policy "Admin deletes teams" on public.tournament_teams for delete to authenticated using (public.is_admin());

create table if not exists public.team_members (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists team_members_team_idx on public.team_members(team_id);
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;
grant select, insert (registration_id, team_id), update (team_id), delete on public.team_members to authenticated;
drop policy if exists "Admin sees assignments" on public.team_members;
create policy "Admin sees assignments" on public.team_members for select to authenticated using (public.is_admin());
drop policy if exists "Admin assigns players" on public.team_members;
create policy "Admin assigns players" on public.team_members for insert to authenticated with check (public.is_admin());
drop policy if exists "Admin moves players" on public.team_members;
create policy "Admin moves players" on public.team_members for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin removes players" on public.team_members;
create policy "Admin removes players" on public.team_members for delete to authenticated using (public.is_admin());

-- В одной команде максимум 6 подтверждённых игроков.
create or replace function public.validate_team_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare player_status text;
begin
  select r.status into player_status from public.registrations r where r.id = NEW.registration_id;
  if player_status is distinct from 'approved' then
    raise exception 'В команду можно добавлять только принятых участников';
  end if;
  -- Блокировка строки команды сериализует одновременные изменения состава.
  perform 1 from public.tournament_teams t where t.id = NEW.team_id for update;
  if (select count(*) from public.team_members m
      where m.team_id = NEW.team_id and m.registration_id <> NEW.registration_id) >= 6 then
    raise exception 'В команде уже 6 игроков';
  end if;
  return NEW;
end;
$$;
revoke all on function public.validate_team_member() from public, anon, authenticated;
drop trigger if exists team_member_validate on public.team_members;
create trigger team_member_validate before insert or update on public.team_members
  for each row execute function public.validate_team_member();

-- Отклонённый игрок не должен оставаться в составе.
create or replace function public.remove_ineligible_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if NEW.status <> 'approved' then
    delete from public.team_members where registration_id = NEW.id;
  end if;
  return NEW;
end;
$$;
revoke all on function public.remove_ineligible_member() from public, anon, authenticated;
drop trigger if exists registrations_remove_member on public.registrations;
create trigger registrations_remove_member after update of status on public.registrations
  for each row when (NEW.status <> 'approved') execute function public.remove_ineligible_member();

-- Безопасная публичная проекция: возвращает ТОЛЬКО ID команды и ник.
-- Полные registrations и team_members остаются недоступны гостям.
create or replace function public.get_public_team_roster()
returns table(team_id uuid, nickname text)
language sql stable security definer set search_path = '' as $$
  select m.team_id, r.nickname from public.team_members m
  join public.registrations r on r.id = m.registration_id
  where r.status = 'approved'
  order by lower(r.nickname);
$$;
revoke all on function public.get_public_team_roster() from public, anon, authenticated;
grant execute on function public.get_public_team_roster() to anon, authenticated;

-- Сетка: все её поля публичны. Никаких Discord, Steam и т. п.
create table if not exists public.tournament_matches (
  round_no integer not null check (round_no between 1 and 6),
  match_no integer not null check (match_no between 1 and 32),
  left_team uuid references public.tournament_teams(id) on delete restrict,
  right_team uuid references public.tournament_teams(id) on delete restrict,
  score_left integer not null default 0 check (score_left between 0 and 99),
  score_right integer not null default 0 check (score_right between 0 and 99),
  winner uuid references public.tournament_teams(id) on delete restrict,
  primary key(round_no, match_no),
  check (left_team is distinct from right_team or left_team is null),
  check (winner is null or winner = left_team or winner = right_team)
);
alter table public.tournament_matches enable row level security;
revoke all on public.tournament_matches from anon, authenticated;
grant select on public.tournament_matches to anon, authenticated;
drop policy if exists "Public can see bracket" on public.tournament_matches;
create policy "Public can see bracket" on public.tournament_matches for select to anon, authenticated using (true);
-- Запись матчей доступна только через проверенные функции ниже.

-- Создаёт всю сетку атомарно. p_slots: расставленные команды + NULL для BYE.
-- Размер массива — 2,4,8,16 или 32. У каждой пары первого раунда есть хотя бы одна команда.
create or replace function public.generate_tournament_bracket(p_slots uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  n integer := coalesce(array_length(p_slots, 1), 0);
  present_count integer;
  rounds integer := 0;
  r integer; m integer; pair_count integer;
  lt uuid; rt uuid; win uuid;
begin
  if not public.is_admin() then raise exception 'Недостаточно прав'; end if;
  if n not in (2,4,8,16,32) then raise exception 'Недопустимый размер сетки'; end if;
  select count(*), count(distinct v) into present_count, m
    from unnest(p_slots) v where v is not null;
  if present_count < 2 or present_count <> m then
    raise exception 'Нужно минимум 2 команды; команды не могут повторяться';
  end if;
  if exists (select 1 from unnest(p_slots) v where v is not null
             and not exists (select 1 from public.tournament_teams t where t.id = v)) then
    raise exception 'Одна из команд не существует';
  end if;
  for m in 1..(n / 2) loop
    if p_slots[2*m-1] is null and p_slots[2*m] is null then
      raise exception 'Две пустые позиции в матче первого раунда';
    end if;
  end loop;
  perform pg_advisory_xact_lock(19317, 12011);
  delete from public.tournament_matches where round_no >= 1;
  pair_count := n / 2;
  while pair_count >= 1 loop
    rounds := rounds + 1;
    for m in 1..pair_count loop
      lt := case when rounds = 1 then p_slots[2*m-1] else null end;
      rt := case when rounds = 1 then p_slots[2*m] else null end;
      insert into public.tournament_matches(round_no,match_no,left_team,right_team)
        values (rounds,m,lt,rt);
    end loop;
    pair_count := pair_count / 2;
  end loop;
  -- Автоматически пройти BYE в следующий раунд.
  if rounds > 1 then
    for m in 1..(n / 2) loop
      lt := p_slots[2*m-1]; rt := p_slots[2*m];
      if lt is null or rt is null then
        win := coalesce(lt,rt);
        update public.tournament_matches set winner = win where round_no = 1 and match_no = m;
        if m % 2 = 1 then
          update public.tournament_matches set left_team = win where round_no = 2 and match_no = (m+1)/2;
        else
          update public.tournament_matches set right_team = win where round_no = 2 and match_no = m/2;
        end if;
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.generate_tournament_bracket(uuid[]) from public, anon, authenticated;
grant execute on function public.generate_tournament_bracket(uuid[]) to authenticated;

-- Счёт/победитель и проход дальше изменяются ОДНОЙ транзакцией.
-- p_clear=true отменяет результат; если следующая встреча уже завершена,
-- сначала нужно отменить её результат (защита от некорректной сетки).
create or replace function public.set_tournament_result(
  p_round integer, p_match integer, p_left integer, p_right integer, p_clear boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  cur public.tournament_matches%rowtype;
  next_match public.tournament_matches%rowtype;
  winning uuid;
  next_no integer;
  next_round integer;
begin
  if not public.is_admin() then raise exception 'Недостаточно прав'; end if;
  perform pg_advisory_xact_lock(19317, 12011);
  select * into cur from public.tournament_matches
    where round_no = p_round and match_no = p_match for update;
  if not found then raise exception 'Матч не найден'; end if;
  if not p_clear then
    if cur.left_team is null or cur.right_team is null then
      raise exception 'Ожидается соперник или матч является BYE';
    end if;
    if p_left is null or p_right is null or p_left not between 0 and 99
       or p_right not between 0 and 99 or p_left = p_right then
      raise exception 'Счёт должен быть 0–99, ничья недопустима';
    end if;
    winning := case when p_left > p_right then cur.left_team else cur.right_team end;
  end if;
  next_round := p_round + 1;
  next_no := (p_match+1) / 2;
  select * into next_match from public.tournament_matches
    where round_no = next_round and match_no = next_no for update;
  if found then
    if next_match.winner is not null and (p_clear or next_match.winner is distinct from winning) then
      raise exception 'Сначала отмените результат следующего матча';
    end if;
    -- При редактировании одного матча нельзя переписывать соседнюю сторону.
    if p_match % 2 = 1 then
      update public.tournament_matches set left_team = winning, score_left = 0, score_right = 0
      where round_no = next_round and match_no = next_no
        and (left_team is distinct from winning);
    else
      update public.tournament_matches set right_team = winning, score_left = 0, score_right = 0
      where round_no = next_round and match_no = next_no
        and (right_team is distinct from winning);
    end if;
  end if;
  update public.tournament_matches
    set score_left = case when p_clear then 0 else p_left end,
        score_right = case when p_clear then 0 else p_right end,
        winner = winning
    where round_no = p_round and match_no = p_match;
end;
$$;
revoke all on function public.set_tournament_result(integer,integer,integer,integer,boolean) from public, anon, authenticated;
grant execute on function public.set_tournament_result(integer,integer,integer,integer,boolean) to authenticated;

-- Отмена всей сетки (составы команд сохраняются).
create or replace function public.clear_tournament_bracket()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Недостаточно прав'; end if;
  perform pg_advisory_xact_lock(19317, 12011);
  delete from public.tournament_matches where round_no >= 1;
end;
$$;
revoke all on function public.clear_tournament_bracket() from public, anon, authenticated;
grant execute on function public.clear_tournament_bracket() to authenticated;

-- Выбранный организатором матч для OBS (только публичные ID и флаг показа).
create table if not exists public.tournament_broadcast (
  id integer primary key check (id = 1),
  round_no integer,
  match_no integer,
  visible boolean not null default false,
  check ((round_no is null and match_no is null) or (round_no is not null and match_no is not null))
);
insert into public.tournament_broadcast (id) values (1) on conflict (id) do nothing;
alter table public.tournament_broadcast enable row level security;
revoke all on public.tournament_broadcast from anon, authenticated;
grant select on public.tournament_broadcast to anon, authenticated;
grant update (round_no, match_no, visible) on public.tournament_broadcast to authenticated;
drop policy if exists "Everyone sees chosen public match" on public.tournament_broadcast;
create policy "Everyone sees chosen public match" on public.tournament_broadcast
  for select to anon, authenticated using (true);
drop policy if exists "Admin chooses streamed match" on public.tournament_broadcast;
create policy "Admin chooses streamed match" on public.tournament_broadcast
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
