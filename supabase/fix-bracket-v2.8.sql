-- DEADLOCK CUP v2.8: исправление PostgreSQL safe-update для сетки.
-- Без удаления команд, анкет или уже сохранённых результатов.
-- Просто переопределяем функции: существующие матчи не меняются.

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

