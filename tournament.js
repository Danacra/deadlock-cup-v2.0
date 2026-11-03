// Турнир: публичные команды и single-elimination сетка, приватная панель составов.
import {db, configured, demo, escapeHTML as esc, FALLBACK_HEROES} from './db.js';
const $ = id => document.getElementById(id);
const key = 'deadlock_tournament_demo_v1';
function demoRead() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && Array.isArray(saved.teams)) return {...saved, guestMembers:saved.guestMembers||[], teamRequests:saved.teamRequests||[]};
  } catch { /* first visit */ }
  return {
    teams: [{id:'demo-team-one',name:'HEALING RITE',team_color:'#B6FF00',logo_url:'',created_at:'2026-01-01'},
      {id:'demo-team-two',name:'NIGHT SHIFT',team_color:'#8EA86E',logo_url:'',created_at:'2026-01-02'}],
    members: [{registration_id:'sample-0',team_id:'demo-team-one'},
      {registration_id:'sample-1',team_id:'demo-team-one'},
      {registration_id:'sample-2',team_id:'demo-team-two'}],
    guestMembers: [], teamRequests: [], matches: [], broadcast: {id:1,round_no:null,match_no:null,visible:false}
  };
}
const demoSave = d => localStorage.setItem(key,JSON.stringify(d));
const sortName = (a,b) => a.name.localeCompare(b.name,'ru',{sensitivity:'base'});
const roundName = (round, last) => round === last ? 'ФИНАЛ' : round === last-1 ? 'ПОЛУФИНАЛ' : round === last-2 ? 'ЧЕТВЕРТЬФИНАЛ' : `РАУНД ${round}`;
const errorMessage = error => {
  const raw = error?.message || 'Не удалось сохранить изменения';
  if (/DELETE requires a WHERE clause/i.test(raw)) return 'Supabase отклонил очистку матчей. Открой SQL Editor и выполни supabase/fix-bracket-v2.8.sql, затем повтори создание сетки.';
  return raw;
};
const matchupKey = m => `${m.round_no}-${m.match_no}`;

export function createTournamentController({isAdmin, getRegistrations, onTeamsChanged}) {
  const data = {teams: [], publicMembers: [], members: [], guests: [], requests: [], matches: [], broadcast: null};
  let active = false;
  const flash = (message, type='ok', target='tournamentMessage') => {
    const el = $(target); if (!el) return;
    el.textContent = message; el.className = `message ${type}`;
  };
  const teamName = id => data.teams.find(t=>t.id===id)?.name || 'ОЖИДАЕТСЯ';
  const colorFor = team => /^#[0-9a-f]{6}$/i.test(team?.team_color||'') ? team.team_color : '#D9B47B';
  const avatarMarkup = url => {
    try { const u = new URL(url); return u.protocol==='https:' && ['avatars.steamstatic.com','avatars.fastly.steamstatic.com','avatars.akamai.steamstatic.com','avatars.cloudflare.steamstatic.com','steamcdn-a.akamaihd.net','cdn.akamai.steamstatic.com'].includes(u.hostname)
      ? `<img class="dc-team-avatar" src="${esc(u.href)}" alt="" loading="lazy">` : ''; } catch { return ''; }
  };
  const logoMarkup = (team, cls='dc-team-logo') => {
    const url=team?.logo_url||'';
    if (!url) return `<span class="${cls} dc-logo-placeholder">✦</span>`;
    if (!configured && url.startsWith('data:image/')) return `<img class="${cls}" src="${esc(url)}" alt="">`;
    try {const u=new URL(url);
      if(u.protocol==='https:' && u.pathname.includes('/storage/v1/object/public/team-logos/') && u.hostname.endsWith('.supabase.co'))
        return `<img class="${cls}" src="${esc(u.href)}" alt="">`;
    } catch {} return `<span class="${cls} dc-logo-placeholder">✦</span>`;
  };
  const teamPlayers = id => data.publicMembers.filter(m=>m.team_id===id).sort((a,b)=>Boolean(b.is_captain)-Boolean(a.is_captain) || a.nickname.localeCompare(b.nickname,'ru'));
  const adminsPlayers = id => data.members.filter(m=>m.team_id===id)
    .map(m=>getRegistrations().find(r=>r.id===m.registration_id)).filter(Boolean)
    .sort((a,b)=>a.nickname.localeCompare(b.nickname,'ru'));
  // Display the selected captain first in admin rosters (including team-application players).
  // The public roster already applies the same captain-first ordering.
  const adminTeamPlayers = id => {
    const captain = String(data.teams.find(t=>t.id===id)?.captain_nickname || '').trim().toLocaleLowerCase();
    const players = [
      ...adminsPlayers(id).map(r=>({...r,guest:false})),
      ...data.guests.filter(g=>g.team_id===id).map(g=>({...g,guest:true}))
    ];
    return players.sort((a,b)=>{
      const aCaptain = Boolean(captain) && String(a.nickname||'').trim().toLocaleLowerCase()===captain;
      const bCaptain = Boolean(captain) && String(b.nickname||'').trim().toLocaleLowerCase()===captain;
      return Number(bCaptain)-Number(aCaptain) || String(a.nickname||'').localeCompare(String(b.nickname||''),'ru',{sensitivity:'base'});
    });
  };
  const eligible = () => getRegistrations().filter(r=>r.status==='approved')
    .sort((a,b)=>a.nickname.localeCompare(b.nickname,'ru'));

  function renderPublicTeams() {
    $('publicTeamCount').textContent = data.teams.length;
    $('teamsPublicGrid').innerHTML = data.teams.length ? data.teams.map((team,i) => {
      const players = teamPlayers(team.id);
      return `<article class="t-team-card" style="--team-accent:${colorFor(team)}"><div class="t-team-heading"><span class="t-team-number">${String(i+1).padStart(2,'0')}</span>${logoMarkup(team)}
        <div><h3>${esc(team.name)}</h3><small>${players.length} / 6 ИГРОКОВ</small></div><span class="t-team-mark">D//</span></div>
        <div class="t-team-playerlist">${players.length ? players.map((p,k)=>`<div class="t-team-player"><span>${String(k+1).padStart(2,'0')}</span>${avatarMarkup(p.avatar_url)}<b>${esc(p.nickname)}</b>${p.is_captain?'<span class="team-captain-tag">★ КАПИТАН</span>':''}</div>`).join('') : '<div class="t-team-empty">Состав пока не заполнен</div>'}</div></article>`;
    }).join('') : '<div class="t-placeholder">Команды ещё не сформированы. Как только организатор создаст составы, они появятся здесь.</div>';
  }
  function bracketHtml(admin=false) {
    if (!data.matches.length) return '<div class="t-placeholder">Турнирная сетка ещё не сформирована. Для её создания нужны минимум 2 команды. Организатор нажимает «СФОРМИРОВАТЬ СЕТКУ» — тогда матчи появятся и здесь, и в публичной вкладке.</div>';
    const last = Math.max(...data.matches.map(m=>m.round_no));
    const champion = data.matches.find(m=>m.round_no===last && m.winner)?.winner;
    const rounds = [...new Set(data.matches.map(m=>m.round_no))];
    return `<div class="t-bracket-wrap"><div class="t-bracket">${rounds.map(round=>`<div class="t-bracket-round">
      <div class="t-bracket-round-title"><span>${String(round).padStart(2,'0')}</span><b>${roundName(round,last)}</b></div>
      <div class="t-round-matchlist">${data.matches.filter(m=>m.round_no===round).sort((a,b)=>a.match_no-b.match_no).map(m=>{
        const bye = round===1 && (!!m.left_team !== !!m.right_team);
        const label = `МАТЧ ${m.match_no}`;
        const renderSide = (team,score,opponent) => `<div class="t-match-side ${m.winner===team && team?'is-winner':''}">
          ${team ? logoMarkup(data.teams.find(t=>t.id===team),'dc-match-logo') : ''}<span class="t-match-name">${team ? esc(teamName(team)) : (bye ? 'BYE' : 'TBD')}</span>
          <strong>${team && opponent ? Number(score) : '—'}</strong></div>`;
        const controls = admin ? `<div class="t-match-controls" data-round="${m.round_no}" data-match="${m.match_no}">
          <div class="t-match-score-edit"><label><span>СЧЁТ</span><input type="number" min="0" max="99" value="${m.score_left}" aria-label="Счёт слева"></label>
          <span class="t-separator">:</span><label><span>СЧЁТ</span><input type="number" min="0" max="99" value="${m.score_right}" aria-label="Счёт справа"></label></div>
          <div class="t-match-buttons"><button type="button" class="t-mini-action" data-t-action="save-result" ${(!m.left_team||!m.right_team)?'disabled':''}>✓ ИТОГ</button>
          <button type="button" class="t-mini-action t-muted-action" data-t-action="reset-result" ${!m.winner||bye?'disabled':''}>СБРОС</button>
          <button type="button" class="t-mini-action t-onair" data-t-action="on-air" ${(data.broadcast?.visible && data.broadcast.round_no===m.round_no && data.broadcast.match_no===m.match_no)?'data-selected="true"':''}>● OBS</button></div></div>`:'';
        return `<article class="t-match-card ${m.winner?'finished':''}" style="--team-accent:${colorFor(data.teams.find(t=>t.id===m.winner)||data.teams.find(t=>t.id===m.left_team))}" data-match-key="${matchupKey(m)}">
          <div class="t-match-top"><span>${label}</span>${m.winner?'<span class="t-finished">ЗАВЕРШЁН</span>':(bye?'<span class="t-bye">BYE</span>':'<span>ОЖИДАЕТСЯ</span>')}</div>
          ${renderSide(m.left_team,m.score_left,m.right_team)}${renderSide(m.right_team,m.score_right,m.left_team)}${controls}</article>`;
      }).join('')}</div></div>`).join('')}</div></div>${champion?`<div class="t-champion">🏆 ЧЕМПИОН ТУРНИРА <strong>${esc(teamName(champion))}</strong></div>`:''}`;
  }
  function renderPublicBracket() { $('bracketPublic').innerHTML = bracketHtml(false); }
  function renderAdminTeams() {
    const entries = eligible();
    const assigned = new Set(data.members.map(m=>m.registration_id));
    const spare = entries.filter(r=>!assigned.has(r.id));
    $('adminTeamCount').textContent = data.teams.length;
    $('tournamentPlayerStats').textContent = `${assigned.size+data.guests.length} В СОСТАВАХ / ${spare.length} В РЕЗЕРВЕ`;
    const options = (selected) => `<option value="">— РЕЗЕРВ —</option>` + data.teams.map(t=>`<option value="${esc(t.id)}" ${selected===t.id?'selected':''}>${esc(t.name)} (${adminTeamPlayers(t.id).length}/6)</option>`).join('');
    $('unassignedPlayers').innerHTML = spare.length ? spare.map(r=>`<div class="t-player-pill" draggable="true" data-player-id="${esc(r.id)}">
      <span class="t-drag-handle">⠿</span>${avatarMarkup(r.steam_avatar_url)}<b>${esc(r.nickname)}</b><select class="t-assignment-select" data-player-id="${esc(r.id)}" aria-label="Назначить команду игроку ${esc(r.nickname)}"><option value="">В КОМАНДУ...</option>${data.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></div>`).join('') : '<div class="t-empty-short">Нет свободных принятых игроков.</div>';
    $('adminTeamsGrid').innerHTML = data.teams.length ? data.teams.map(t=>{
      const players=adminTeamPlayers(t.id);
      return `<section class="t-admin-team" data-team-id="${esc(t.id)}" style="--team-accent:${colorFor(t)}"><div class="t-admin-team-head">${logoMarkup(t)}<div><h3>${esc(t.name)}</h3><small>${players.length} / 6 МЕСТ ЗАНЯТО</small></div>
      <div class="t-admin-team-actions"><button type="button" data-t-action="edit-team" data-team-id="${esc(t.id)}" title="Цвет и эмблема">◈</button><button type="button" data-t-action="rename-team" data-team-id="${esc(t.id)}" title="Переименовать">✎</button>
      <button type="button" data-t-action="delete-team" data-team-id="${esc(t.id)}" title="Удалить">×</button></div></div>
      <div class="t-team-dropzone" data-drop-team="${esc(t.id)}">${players.map((r,i)=>`<div class="t-player-pill ${r.guest?'t-guest-row':''}" ${r.guest?'':`draggable="true" data-player-id="${esc(r.id)}"`}>
      <div class="t-roster-primary"><span class="t-drag-handle">${r.guest?'◇':'⠿'}</span>${avatarMarkup(r.steam_avatar_url)}<b class="t-roster-name"><small>${i+1}.</small> ${esc(r.nickname)}</b></div>
      <div class="t-roster-actions">
      ${t.captain_nickname?.trim().toLocaleLowerCase()===r.nickname.trim().toLocaleLowerCase()?'<span class="team-captain-tag">★ КАПИТАН</span>':''}
      ${r.guest?`<button type="button" class="t-guest-action" data-t-action="remove-guest" data-guest-id="${esc(r.id)}" title="Убрать игрока из команды">УБРАТЬ</button>`:`<select class="t-assignment-select" data-player-id="${esc(r.id)}" aria-label="Команда игрока ${esc(r.nickname)}">${options(t.id)}</select>`}
      ${!t.captain_nickname?.trim() || t.captain_nickname.trim().toLocaleLowerCase()===r.nickname.trim().toLocaleLowerCase() ? `<button type="button" class="t-captain-action dc-captain-icon ${t.captain_nickname?.trim().toLocaleLowerCase()===r.nickname.trim().toLocaleLowerCase()?'is-active':''}" data-t-action="captain" data-team-id="${esc(t.id)}" data-nickname="${esc(r.nickname)}" aria-label="${t.captain_nickname?.trim().toLocaleLowerCase()===r.nickname.trim().toLocaleLowerCase()?'Снять капитана':'Сделать капитаном'}: ${esc(r.nickname)}" title="${t.captain_nickname?.trim().toLocaleLowerCase()===r.nickname.trim().toLocaleLowerCase()?'Снять капитана':'Сделать капитаном'}" aria-pressed="${t.captain_nickname?.trim().toLocaleLowerCase()===r.nickname.trim().toLocaleLowerCase()}">★</button>` : ''}
      </div></div>`).join('')}
      ${Array.from({length:Math.max(0,6-players.length)},()=>'<div class="t-slot-empty">+ Перетащите игрока сюда</div>').join('')}</div></section>`;
    }).join('') : '<div class="t-placeholder">Создайте первую команду. Затем распределите принятых игроков из резерва.</div>';
    $('adminBracket').innerHTML = bracketHtml(true);
    $('stopOnAir').disabled = !data.broadcast?.visible;
  }
  function refreshUI(){ renderPublicTeams();renderPublicBracket();if(isAdmin())renderAdminTeams(); }

  async function loadPublic() {
    if (!active) return;
    try {
      if (configured) {
        let [teams,roster,matches,broadcast] = await Promise.all([
          db.from('tournament_teams').select('id,name,team_color,logo_url,captain_nickname,created_at').order('created_at'),
          db.rpc('get_public_team_roster_v35'),
          db.from('tournament_matches').select('round_no,match_no,left_team,right_team,score_left,score_right,winner').order('round_no').order('match_no'),
          db.from('tournament_broadcast').select('id,round_no,match_no,visible').eq('id',1).single()
        ]);
        if (teams.error && /team_color|logo_url|captain_nickname/.test(String(teams.error.message || ''))) {
          const basic = await db.from('tournament_teams').select('id,name,created_at').order('created_at');
          teams = {...basic, data:(basic.data || []).map(t=>({...t,team_color:'#B6FF00',logo_url:'',captain_nickname:''}))};
        }
        if (roster.error && /get_public_team_roster_v35|function .* does not exist/i.test(String(roster.error.message||''))) {
          roster = await db.rpc('get_public_team_roster');
        }
        for (const part of [teams,roster,matches,broadcast]) if(part.error)throw part.error;
        data.teams=teams.data||[];data.publicMembers=roster.data||[];data.matches=matches.data||[];data.broadcast=broadcast.data;
      } else {
        const saved=demoRead();
        data.teams=saved.teams;data.matches=saved.matches;data.broadcast=saved.broadcast;
        data.publicMembers=[...saved.members.map(m=>({team_id:m.team_id,nickname:demo.getRegistrations().find(r=>r.id===m.registration_id&&r.status==='approved')?.nickname})).filter(m=>m.nickname), ...(saved.guestMembers||[]).map(g=>({team_id:g.team_id,nickname:g.nickname,is_guest:true}))].map(m=>({...m,is_captain:saved.teams.find(t=>t.id===m.team_id)?.captain_nickname?.toLowerCase()===m.nickname.toLowerCase()}));
      }
      renderPublicTeams();renderPublicBracket();
      $('tournamentMigrationNotice').hidden=true;
    } catch (error) {
      $('teamsPublicGrid').innerHTML='<div class="t-placeholder">Не удалось загрузить команды. Возможно, ещё не установлен SQL-модуль турнира.</div>';
      $('bracketPublic').innerHTML='<div class="t-placeholder">Сетка пока недоступна.</div>';
      $('tournamentMigrationNotice').hidden=false;
      $('tournamentMigrationNotice').textContent=`Проверьте выполнение supabase/upgrade-tournament.sql. ${errorMessage(error)}`;
    }
  }
  async function loadAdmin() {
    if(!active||!isAdmin())return;
    try {
      if (configured) {
        const {data:members,error}=await db.from('team_members').select('registration_id,team_id');
        if(error)throw error;data.members=members||[];
        const {data:guests,error:ge}=await db.from('team_guest_members').select('id,team_id,nickname,discord,steam_profile,hours,region,hero_names,notes,created_at');
        if(ge && !/does not exist|team_guest_members/i.test(ge.message||''))throw ge;
        data.guests=guests||[];
      } else { const saved=demoRead(); data.members=saved.members; data.guests=saved.guestMembers||[]; }
      await loadPublic();
      renderAdminTeams();
      await loadTeamRequests();
      if (typeof onTeamsChanged==='function') onTeamsChanged();
    } catch(error) { flash(`Не удалось открыть ростер: ${errorMessage(error)}`,'error'); }
  }
  async function action(operation,success,target='tournamentMessage') {
    if(!isAdmin())return false;
    flash('','ok',target);
    try {
      await operation();
      await loadAdmin();
      if(success)flash(success,'ok',target);
      return true;
    } catch(e) {
      flash(errorMessage(e),'error',target);
      // Восстанавливаем прежние значения выпадающих списков после ошибки.
      // Иначе пользователь видит выбранную команду, хотя запись не сохранилась.
      if (target==='tournamentRosterMessage') {
        try { await loadAdmin(); } catch { /* основная ошибка уже показана */ }
      }
      return false;
    }
  }
  async function createTeam(ev) {
    ev.preventDefault();const name=$('newTeamName').value.trim();
    if(name.length<2||name.length>36)return flash('Название команды: от 2 до 36 символов.','error');
    await action(async()=>{
      if(configured){const {error}=await db.from('tournament_teams').insert({name});if(error)throw error;}
      else{const d=demoRead();if(d.teams.some(t=>t.name.toLowerCase()===name.toLowerCase()))throw new Error('Команда с таким названием уже существует');d.teams.push({id:crypto.randomUUID(),name,team_color:'#B6FF00',logo_url:'',created_at:new Date().toISOString()});demoSave(d);}
      $('newTeamName').value='';
    },'Команда создана.');
  }
  async function renameTeam(id) {
    const team=data.teams.find(t=>t.id===id);if(!team)return;
    const changed=prompt('Новое название команды:',team.name)?.trim();if(!changed||changed===team.name)return;
    if(changed.length<2||changed.length>36)return flash('Название должно содержать 2–36 символов','error');
    await action(async()=>{
      if(configured){const {error}=await db.from('tournament_teams').update({name:changed}).eq('id',id);if(error)throw error;}
      else{const d=demoRead();d.teams.find(t=>t.id===id).name=changed;demoSave(d);}
    },'Название команды обновлено.');
  }
  const editPanel=$('dcTeamEditor');
  let editingId=null;
  function closeEditor(){editPanel.hidden=true;editingId=null;$('dcTeamLogoFile').value='';}
  function openEditor(id){
    const team=data.teams.find(t=>t.id===id);if(!team)return;
    editingId=id;
    $('dcEditingName').textContent=team.name;
    $('dcTeamColor').value=colorFor(team);
    $('dcTeamLogoFile').value='';
    $('dcTeamLogoFile').disabled=false;
    editPanel.hidden=false;
    editPanel.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function saveDesign(ev){
    ev.preventDefault();if(!editingId||!isAdmin())return;
    const teamId=editingId;const color=$('dcTeamColor').value;
    const file=$('dcTeamLogoFile').files?.[0];
    if(!/^#[a-f0-9]{6}$/i.test(color))return flash('Некорректный цвет.','error','dcTeamEditorMessage');
    if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024))
      return flash('Эмблема: PNG, JPEG или WebP до 2 МБ.','error','dcTeamEditorMessage');
    await action(async()=>{
      let logo_url=data.teams.find(t=>t.id===teamId)?.logo_url||'';
      if(file&&configured){
        const extension={ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp' }[file.type];
        const key=`teams/${teamId}/${crypto.randomUUID()}.${extension}`;
        const uploaded=await db.storage.from('team-logos').upload(key,file,{contentType:file.type,upsert:false});
        if(uploaded.error)throw uploaded.error;
        logo_url=db.storage.from('team-logos').getPublicUrl(key).data.publicUrl;
      } else if(file){
        // Demo: encode a small 96x96 thumbnail instead of storing a large upload in localStorage.
        const bitmap=await createImageBitmap(file);
        const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
        const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,96,96);bitmap.close();
        logo_url=canvas.toDataURL('image/webp',.75);
      }
      if(configured){
        const {error}=await db.from('tournament_teams').update({team_color:color,logo_url}).eq('id',teamId);
        if(error)throw error;
      }else{const d=demoRead();const target=d.teams.find(t=>t.id===teamId);target.team_color=color;target.logo_url=logo_url;demoSave(d);}
      closeEditor();
    },'Оформление команды сохранено.','tournamentRosterMessage');
  }
  async function clearTeamLogo(){
    if(!editingId)return;
    const id=editingId;
    await action(async()=>{
      if(configured){const {error}=await db.from('tournament_teams').update({logo_url:''}).eq('id',id);if(error)throw error;}
      else{const d=demoRead();d.teams.find(t=>t.id===id).logo_url='';demoSave(d);}
      closeEditor();
    },'Эмблема удалена.','tournamentRosterMessage');
  }
  // The FK in team_registration_requests uses ON DELETE SET NULL: retain an
  // audit record of approved applications while removing team-only private
  // profiles (team_guest_members cascade). Independently registered people
  // stay in registrations and return to the reserve.
  async function deleteTeam(id, origin='roster') {
    const target=origin==='applications'?'teamApplicationMessage':'tournamentMessage';
    const team=data.teams.find(t=>t.id===id);
    if(!team)return flash('Команда уже удалена или не найдена. Обнови список заявок.','error',target);
    if(data.matches.some(m=>[m.left_team,m.right_team,m.winner].includes(id)))
      return flash('Сначала очисти турнирную сетку: команда уже участвует в матчах. Результаты других команд не будут удалены автоматически.','error',target);
    if(!confirm(`Удалить принятую команду «${team.name}»?\n\nЕё командные анкеты исчезнут из списка участников. Самостоятельные анкеты останутся в базе и вернутся в резерв. Запись об исходной командной заявке сохранится как «УДАЛЕНА».`))return;
    return action(async()=>{
      if(configured){
        const {data:deleted,error}=await db.from('tournament_teams').delete().eq('id',id).select('id');
        if(error)throw error;
        if(!deleted?.some(row=>row.id===id))throw new Error('Удаление не подтверждено. Проверь права администратора в Supabase.');
      }else{
        const d=demoRead();
        if(d.matches.some(m=>[m.left_team,m.right_team,m.winner].includes(id)))throw new Error('Сначала очистите турнирную сетку');
        d.teams=d.teams.filter(t=>t.id!==id);
        d.members=d.members.filter(m=>m.team_id!==id);
        d.guestMembers=(d.guestMembers||[]).filter(g=>g.team_id!==id);
        // Mirror the database ON DELETE SET NULL behavior.
        (d.teamRequests||[]).forEach(q=>{if(q.approved_team_id===id)q.approved_team_id=null;});
        demoSave(d);
      }
    },'Команда удалена. Индивидуальные анкеты игроков сохранены.',target);
  }
  const pendingMoves=new Set();
  async function movePlayer(playerId,teamId) {
    if(!isAdmin()||pendingMoves.has(playerId))return;
    const player=eligible().find(r=>r.id===playerId);
    if(!player)return flash('Перемещать можно только принятых игроков.','error','tournamentRosterMessage');
    if(teamId&&!data.teams.some(t=>t.id===teamId))return flash('Выбранная команда не найдена.','error','tournamentRosterMessage');
    const existing=data.members.find(m=>m.registration_id===playerId);
    if((existing?.team_id||'')===teamId)return;
    if(teamId && data.guests.some(g=>g.team_id===teamId && g.nickname.toLowerCase()===player.nickname.toLowerCase())) return flash('В составе уже есть этот ник из командной заявки. Сначала нажми «УБРАТЬ» у гостевого ника, затем добавь зарегистрированного игрока.','error','tournamentRosterMessage');
    pendingMoves.add(playerId);
    try {
      await action(async()=>{
        if(configured){
          // НЕ использовать upsert: он пытается обновить также registration_id,
          // хотя из соображений безопасности у администратора есть право
          // UPDATE только на team_id. INSERT/UPDATE/DELETE нужны раздельно.
          let result;
          if(!teamId){
            result=await db.from('team_members').delete()
              .eq('registration_id',playerId).select('registration_id');
          } else if(existing){
            result=await db.from('team_members').update({team_id:teamId})
              .eq('registration_id',playerId).select('registration_id');
          } else {
            result=await db.from('team_members').insert({registration_id:playerId,team_id:teamId})
              .select('registration_id');
          }
          if(result.error)throw result.error;
          // RLS может дать пустой ответ без явной ошибки (0 обновлённых строк).
          if(!result.data?.some(row=>row.registration_id===playerId))
            throw new Error('Изменение не сохранилось. Проверь права администратора и политики RLS в Supabase.');
        }else{
          const d=demoRead();
          d.members=d.members.filter(m=>m.registration_id!==playerId);
          if(teamId){
            if(d.members.filter(m=>m.team_id===teamId).length+(d.guestMembers||[]).filter(g=>g.team_id===teamId).length>=6)throw new Error('В команде уже 6 игроков');
            d.members.push({registration_id:playerId,team_id:teamId});
          }
          demoSave(d);
        }
      },teamId?`Игрок «${player.nickname}» добавлен в команду «${teamName(teamId)}».`:`Игрок «${player.nickname}» отправлен в резерв.`,'tournamentRosterMessage');
    } finally {pendingMoves.delete(playerId);}
  }
  // One small star per eligible player. When a captain exists, only their
  // active star remains visible; clicking it again removes the appointment.
  function captainActionForPlayer(playerId) {
    const member=data.members.find(m=>m.registration_id===playerId);
    const team=member&&data.teams.find(t=>t.id===member.team_id);
    const player=member&&getRegistrations().find(r=>r.id===playerId);
    if(!team || !player || player.status!=='approved')return '';
    const current=String(team.captain_nickname||'').trim().toLocaleLowerCase();
    const selected=Boolean(current)&&current===player.nickname.trim().toLocaleLowerCase();
    if(current&&!selected)return '';
    const label=selected?'Снять капитана':'Сделать капитаном';
    return `<button type="button" class="action-btn dc-captain-icon ${selected?'is-active':''}" data-action="captain" data-id="${esc(playerId)}" aria-label="${label}: ${esc(player.nickname)}" title="${label}" aria-pressed="${selected}">★</button>`;
  }
  const pendingCaptains=new Set();
  async function setCaptain(teamId,nickname) {
    if(!isAdmin()||pendingCaptains.has(teamId))return false;
    const team=data.teams.find(t=>t.id===teamId);
    if(!team)return flash('Команда не найдена.','error','tournamentRosterMessage');
    const current=String(team.captain_nickname||'').trim().toLocaleLowerCase();
    const selected=current===nickname.trim().toLocaleLowerCase();
    if(current&&!selected)return flash('В команде уже назначен капитан. Сначала нажми ★ у текущего капитана, чтобы снять его.','error','tournamentRosterMessage');
    const success=selected?`Капитан команды «${teamName(teamId)}» снят. Можно выбрать другого игрока.`:`★ ${nickname} назначен капитаном команды «${teamName(teamId)}».`;
    pendingCaptains.add(teamId);
    try {
      return await action(async()=>{
        if(configured){
          const {error}=await db.rpc('toggle_team_captain_v37',{p_team_id:teamId,p_nickname:nickname});
          if(error){
            if(/toggle_team_captain_v37|does not exist|schema cache|could not find the function/i.test(String(error.message||'')))
              throw new Error('Требуется миграция Supabase: выполни supabase/upgrade-captain-toggle-v3.7.sql в SQL Editor.');
            throw error;
          }
        } else {
          const d=demoRead(), t=d.teams.find(t=>t.id===teamId);
          if(!t)throw new Error('Команда не найдена');
          const value=String(t.captain_nickname||'').trim().toLocaleLowerCase();
          if(value&&value!==nickname.trim().toLocaleLowerCase())throw new Error('Капитан уже назначен');
          t.captain_nickname=value?'':nickname;demoSave(d);
        }
      },success,'tournamentRosterMessage');
    } finally {pendingCaptains.delete(teamId);}
  }
  async function setCaptainForPlayer(playerId) {
    if(!isAdmin())return false;
    const member=data.members.find(m=>m.registration_id===playerId);
    const player=getRegistrations().find(r=>r.id===playerId);
    if(!member || !player){flash('Сначала добавь игрока в команду, затем назначь капитаном.','error','tournamentRosterMessage');return false;}
    return await setCaptain(member.team_id,player.nickname);
  }
  async function removeGuest(guestId) {
    if(!isAdmin())return;
    await action(async()=>{
      if(configured){const {error}=await db.rpc('remove_team_guest_v35',{p_guest_id:guestId});if(error)throw error;}
      else {const d=demoRead();const g=d.guestMembers.find(g=>g.id===guestId);if(!g)return;d.guestMembers=d.guestMembers.filter(g=>g.id!==guestId);const t=d.teams.find(t=>t.id===g.team_id);if(t?.captain_nickname===g.nickname)t.captain_nickname='';demoSave(d);}
    },'Ник удалён из команды. Теперь можно назначить зарегистрированного игрока.','tournamentRosterMessage');
  }
  function initTeamMemberForms(){
    const host=$('teamMemberForms');if(!host)return;
    const heroOptions='<option value="">— Выбрать героя —</option>'+[...FALLBACK_HEROES].sort((a,b)=>a.name.localeCompare(b.name,'en')).map(h=>`<option value="${esc(h.name)}">${esc(h.name)}</option>`).join('');
    host.innerHTML=Array.from({length:6},(_,i)=>`<section class="team-profile-card" data-slot="${i}">
      <div class="team-profile-card-heading"><strong>${String(i+1).padStart(2,'0')} · ${i===0?'КАПИТАН':'ИГРОК'}</strong><span>${i<2?'ОБЯЗАТЕЛЬНАЯ АНКЕТА':'НЕОБЯЗАТЕЛЬНЫЙ СЛОТ'}</span></div>
      <div class="team-profile-grid">
        <label class="field"><span>Ник в Deadlock ${i<2?'<b>*</b>':''}</span><input class="member-nickname" ${i===0?'id="requestCaptain"':''} ${i<2?'required':''} minlength="2" maxlength="32" autocomplete="off" placeholder="Игровой ник"></label>
        <label class="field"><span>Discord ${i<2?'<b>*</b>':''}</span><input class="member-discord" ${i===0?'id="requestDiscord"':''} ${i<2?'required':''} minlength="2" maxlength="100" autocomplete="off" placeholder="Имя в Discord"></label>
        <label class="field full"><span>Ссылка на Steam <small>необязательно</small></span><input class="member-steam" type="text" maxlength="200" autocomplete="off" placeholder="https://steamcommunity.com/id/..."></label>
        <label class="field"><span>Часов в Deadlock</span><input class="member-hours" type="number" inputmode="numeric" value="0" min="0" max="10000" step="1"></label>
        <label class="field"><span>Регион игрока</span><select class="member-region"><option value="EU">Европа</option><option value="NA">Северная Америка</option><option value="ASIA">Азия</option><option value="OTHER">Другой</option></select></label>
        <div class="field full"><span>Любимые герои — от 1 до 3 для заполненного слота</span><div class="team-profile-heroes"><select class="member-hero" aria-label="Первый герой игрока ${i+1}">${heroOptions}</select><select class="member-hero" aria-label="Второй герой игрока ${i+1}">${heroOptions}</select><select class="member-hero" aria-label="Третий герой игрока ${i+1}">${heroOptions}</select></div></div>
        <label class="field full"><span>Комментарий по игроку <small>необязательно</small></span><textarea class="member-notes" maxlength="800" rows="2" placeholder="Роль, опыт, расписание"></textarea></label>
      </div></section>`).join('');
    $('requestRegion').addEventListener('change',()=>{host.querySelectorAll('.member-region').forEach(select=>select.value=$('requestRegion').value);});
  }
  function getTeamMemberProfiles(){
    const profiles=[];
    for(const card of document.querySelectorAll('.team-profile-card')){
      const slot=Number(card.dataset.slot);
      const get=sel=>card.querySelector(sel).value.trim();
      const nickname=get('.member-nickname'),discord=get('.member-discord'),steam_profile=get('.member-steam'),notes=get('.member-notes');
      const rawHours=get('.member-hours');const hours=Number(rawHours);
      const region=get('.member-region');
      const hero_names=[...card.querySelectorAll('.member-hero')].map(s=>s.value).filter(Boolean);
      const filled=slot<2||Boolean(nickname||discord||steam_profile||notes||hero_names.length||(rawHours!==''&&hours!==0));
      if(!filled)continue;
      const msg=(what)=>{throw new Error(`Игрок ${slot+1}: ${what}`);};
      if(nickname.length<2||nickname.length>32)msg('укажи ник длиной 2–32 символа.');
      if(discord.length<2||discord.length>100)msg('укажи Discord длиной 2–100 символов.');
      if(steam_profile.length>200)msg('ссылка Steam слишком длинная.');
      if(!rawHours||!Number.isInteger(hours)||hours<0||hours>10000)msg('количество часов должно быть от 0 до 10000.');
      if(!['EU','NA','ASIA','OTHER'].includes(region))msg('выбери корректный регион.');
      if(hero_names.length<1||hero_names.length>3||new Set(hero_names).size!==hero_names.length||hero_names.join(',').length>150)msg('выбери 1–3 разных героев.');
      if(notes.length>800)msg('комментарий слишком длинный.');
      profiles.push({nickname,discord,steam_profile,hours,region,hero_names,notes});
    }
    if(profiles.length<2||profiles.length>6)throw new Error('Заполни данные капитана и ещё минимум одного игрока (всего 2–6).');
    if(new Set(profiles.map(p=>p.nickname.toLocaleLowerCase())).size!==profiles.length)throw new Error('Никнеймы участников не должны повторяться.');
    return profiles;
  }
  async function submitTeamRequest(ev) {
    ev.preventDefault();
    const button=$('requestTeamSubmit'), box=$('requestTeamMessage');
    const show=(text,type='ok')=>{box.textContent=text;box.className=`message ${type}`;};
    const team_name=$('requestTeamName').value.trim(),note=$('requestNote').value.trim(),region=$('requestRegion').value;
    if(team_name.length<2||team_name.length>36||note.length>800)return show('Проверь название команды и комментарий.','error');
    if(!$('requestConsent').checked)return show('Нужно подтвердить разрешение всех игроков на передачу данных.','error');
    let profiles;
    try{profiles=getTeamMemberProfiles();}catch(error){show(error.message,'error');return;}
    const payload={team_name,region,note,captain_nickname:profiles[0].nickname,captain_discord:profiles[0].discord,member_nicknames:profiles.map(p=>p.nickname),member_profiles:profiles};
    button.disabled=true;button.textContent='ОТПРАВКА...';
    try{
      if(configured){const {error}=await db.from('team_registration_requests').insert(payload);if(error)throw error;}
      else{const d=demoRead();d.teamRequests.unshift({id:crypto.randomUUID(),...payload,status:'pending',created_at:new Date().toISOString()});demoSave(d);}
      $('teamRequestForm').reset();$('requestRegion').dispatchEvent(new Event('change'));
      show('Анкеты команды отправлены организатору. После одобрения состав появится на сайте.');
      if(isAdmin())await loadTeamRequests();
    }catch(e){
      const reason=errorMessage(e);
      show(/member_profiles|column.*not found|schema cache/i.test(reason)?'Сначала выполни SQL-миграцию supabase/upgrade-team-profiles-v3.6.sql в Supabase. '+reason:reason,'error');
    }finally{button.disabled=false;button.textContent='ОТПРАВИТЬ КОМАНДУ НА ПРОВЕРКУ ↗';}
  }

  const privateSteamLabel=value=>{
    try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='steamcommunity.com'?`<a href="${esc(url.href)}" rel="noopener noreferrer" target="_blank">${esc(value)}</a>`:esc(value||'—');}
    catch{return esc(value||'—');}
  };
  const infoCells=profile=>`<dl class="team-profile-private-details">
    <div><dt>Discord</dt><dd>${esc(profile.discord||'—')}</dd></div>
    <div><dt>Steam</dt><dd>${privateSteamLabel(profile.steam_profile)}</dd></div>
    <div><dt>Часы</dt><dd>${Number.isFinite(Number(profile.hours))?Number(profile.hours):'—'}</dd></div>
    <div><dt>Регион</dt><dd>${esc(profile.region||'—')}</dd></div>
    <div class="wide"><dt>Герои</dt><dd>${esc((profile.hero_names||[]).join(' · ')||'—')}</dd></div>
    <div class="wide"><dt>Комментарий</dt><dd>${esc(profile.notes||'—')}</dd></div>
  </dl>`;
  function renderTeamRequests(){
    const host=$('teamApplicationsList');if(!host)return;
    const requests=[...data.requests].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    host.innerHTML=requests.length?requests.map(q=>{
      const profiles=Array.isArray(q.member_profiles)&&q.member_profiles.length?q.member_profiles:q.member_nicknames.map((nickname,i)=>({nickname,discord:i===0?q.captain_discord:'',hero_names:[]}));
      return `<article class="team-application">
        <div class="team-application-head"><div><h4>${esc(q.team_name)}</h4><small>${new Date(q.created_at).toLocaleString('ru-RU')} · ${esc(q.region)} · ${q.member_nicknames?.length||0}/6 игроков</small></div><span class="state ${esc(q.status==='approved'&&!q.approved_team_id?'deleted':q.status)}">${q.status==='pending'?'ОЖИДАЕТ':q.status==='approved'?(q.approved_team_id?'ПРИНЯТА':'УДАЛЕНА'):'ОТКЛОНЕНА'}</span></div>
        <div class="team-application-profiles">${profiles.map((p,i)=>`<details class="team-application-profile" ${i===0?'open':''}>
          <summary><b>${i===0?'★ КАПИТАН':'ИГРОК '+(i+1)}</b><span>${esc(p.nickname)}</span><small>Данные анкеты ▾</small></summary>
          ${infoCells(p)}
        </details>`).join('')}</div>
        ${q.note?`<div class="team-application-private">Комментарий по команде: ${esc(q.note)}</div>`:''}
        ${!Array.isArray(q.member_profiles)||!q.member_profiles.length?'<p class="team-profile-old">Это старая заявка v3.5: полные данные игроков капитан тогда не заполнял.</p>':''}
        ${q.status==='pending'?`<div class="team-application-actions"><button class="btn btn-primary" type="button" data-t-action="accept-request" data-request-id="${esc(q.id)}">✓ ПРИНЯТЬ КОМАНДУ</button><button class="btn btn-outline" type="button" data-t-action="reject-request" data-request-id="${esc(q.id)}">ОТКЛОНИТЬ</button></div>`:q.status==='approved'&&q.approved_team_id?`<div class="team-application-actions"><button class="btn btn-outline dc-delete-approved-team" type="button" data-t-action="delete-approved-request" data-request-id="${esc(q.id)}">× УДАЛИТЬ ПРИНЯТУЮ КОМАНДУ</button></div>`:q.status==='approved'?'<p class="team-profile-old">Команда удалена. Заявка сохранена в истории.</p>':''}
      </article>`;
    }).join(''):'<div class="empty-mini">Заявок на команды пока нет.</div>';
  }
  function openGuestInfo(id){
    if(!isAdmin())return;
    const g=data.guests.find(g=>g.id===id);
    if(!g)return;
    $('guestInfoContent').innerHTML=`<h4>${esc(g.nickname)}</h4>${infoCells(g)}<p class="team-profile-old">Поля указаны капитаном. Данные уже зарегистрированного игрока хранятся в его собственной анкете.</p>`;
    $('guestInfoPanel').hidden=false;
    $('guestInfoPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  async function loadTeamRequests(){
    if(!isAdmin())return;
    try{
      if(configured){const {data:requests,error}=await db.from('team_registration_requests').select('id,team_name,captain_nickname,captain_discord,region,member_nicknames,member_profiles,note,status,created_at,approved_team_id').order('created_at',{ascending:false}).limit(100);if(error)throw error;data.requests=requests||[];}
      else data.requests=demoRead().teamRequests||[];
      renderTeamRequests();
    }catch(e){$('teamApplicationMessage').textContent=`Заявки команд: ${errorMessage(e)}. Проверь миграцию upgrade-team-registration-v3.5.sql`;}
  }
  async function reviewRequest(id,approve){
    if(!isAdmin())return;
    const box=$('teamApplicationMessage');box.textContent='';box.className='message';
    try{
      if(configured){const {error}=await db.rpc('review_team_registration',{p_request_id:id,p_approve:approve});if(error)throw error;}
      else{
        const d=demoRead(),q=d.teamRequests.find(q=>q.id===id);
        if(!q||q.status!=='pending')throw new Error('Заявка уже обработана');
        if(approve){if(d.teams.some(t=>t.name.toLowerCase()===q.team_name.toLowerCase()))throw new Error('Название команды занято');
          const idNew=crypto.randomUUID();
          const guestMembers=[];const registered=[];
          for(const nickname of q.member_nicknames){const r=demo.getRegistrations().find(x=>x.nickname.toLowerCase()===nickname.toLowerCase()&&x.status==='approved');
            if(r){if(d.members.some(m=>m.registration_id===r.id))throw new Error(`Игрок ${nickname} уже состоит в команде`);registered.push({registration_id:r.id,team_id:idNew});}
            else {const profile=(q.member_profiles||[]).find(p=>p.nickname.toLocaleLowerCase()===nickname.toLocaleLowerCase())||{};guestMembers.push({id:crypto.randomUUID(),team_id:idNew,nickname,...profile});}}
          if((d.guestMembers||[]).some(g=>guestMembers.some(n=>n.nickname.toLowerCase()===g.nickname.toLowerCase())))throw new Error('Один из ников уже занят');
          d.teams.push({id:idNew,name:q.team_name,captain_nickname:q.captain_nickname,team_color:'#B6FF00',logo_url:'',created_at:new Date().toISOString()});
          d.members.push(...registered);d.guestMembers.push(...guestMembers);q.status='approved';q.approved_team_id=idNew;
        } else q.status='rejected';demoSave(d);
      }
      box.textContent=approve?'Команда одобрена и опубликована.':'Заявка команды отклонена.';
      await loadAdmin();
    }catch(e){box.textContent=errorMessage(e);box.className='message error';}
  }

  // Стандартное размещение сида: 1–8, 4–5, 2–7, 3–6 и т. п.
  function seeding(teamIds) {
    let size=2;while(size<teamIds.length)size*=2;
    let seeds=[1,2];for(let n=4;n<=size;n*=2)seeds=seeds.flatMap(s=>[s,n+1-s]);
    return seeds.map(seed=>teamIds[seed-1]||null);
  }
  function shuffle(a) {
    const arr=[...a];for(let i=arr.length-1;i>0;i--){const x=new Uint32Array(1);crypto.getRandomValues(x);const j=x[0]%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;
  }
  function localGenerate(slots) {
    const n=slots.length;const matches=[];let round=1;
    for(let count=n/2;count>=1;count/=2,round++)for(let m=1;m<=count;m++)matches.push({round_no:round,match_no:m,left_team:round===1?slots[(m-1)*2]:null,right_team:round===1?slots[(m-1)*2+1]:null,score_left:0,score_right:0,winner:null});
    if(n>2)for(const match of matches.filter(m=>m.round_no===1)){
      if(!!match.left_team===!!match.right_team)continue;
      match.winner=match.left_team||match.right_team;
      const next=matches.find(m=>m.round_no===2&&m.match_no===Math.ceil(match.match_no/2));
      if(match.match_no%2)next.left_team=match.winner;else next.right_team=match.winner;
    }
    return matches;
  }
  async function generateBracket() {
    let teams=[...data.teams].sort(sortName);
    if(teams.length<2){flash('Для создания сетки необходимо минимум 2 команды. Создай вторую команду в разделе «Составы команд».','error');$('tournamentMessage')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if(teams.length>32)return flash('Максимум 32 команды в одной сетке.','error');
    if(data.matches.length&&!confirm('Пересоздать сетку? ВСЕ ранее внесённые результаты исчезнут.'))return;
    if($('seedSort').value==='random')teams=shuffle(teams);
    const slots=seeding(teams.map(t=>t.id));
    await action(async()=>{
      if(configured){const {error}=await db.rpc('generate_tournament_bracket',{p_slots:slots});if(error)throw error;}
      else {const d=demoRead();d.matches=localGenerate(slots);d.broadcast={id:1,round_no:null,match_no:null,visible:false};demoSave(d);}
    },'Сетка сформирована и доступна всем участникам.');
  }
  async function clearBracket() {
    if(!data.matches.length)return;
    if(!confirm('Очистить всю сетку и результаты матчей? Команды и составы сохранятся.'))return;
    await action(async()=>{
      if(configured){const [{error},{error:be}]=await Promise.all([db.rpc('clear_tournament_bracket'),db.from('tournament_broadcast').update({round_no:null,match_no:null,visible:false}).eq('id',1)]);if(error||be)throw error||be;}
      else{const d=demoRead();d.matches=[];d.broadcast={id:1,round_no:null,match_no:null,visible:false};demoSave(d);}
    },'Турнирная сетка очищена.');
  }
  async function setMatchResult(round,match,left,right,clear=false) {
    const current=data.matches.find(m=>m.round_no===round&&m.match_no===match);
    if(!current)return;
    await action(async()=>{
      if(configured){const {error}=await db.rpc('set_tournament_result',{p_round:round,p_match:match,p_left:left,p_right:right,p_clear:clear});if(error)throw error;}
      else{
        const d=demoRead();const m=d.matches.find(x=>x.round_no===round&&x.match_no===match);
        if(!clear&&(!m.left_team||!m.right_team||!Number.isInteger(left)||!Number.isInteger(right)||left<0||right<0||left>99||right>99||left===right))throw new Error('Выберите счёт 0–99, без ничьей');
        const winner=clear?null:(left>right?m.left_team:m.right_team);
        const next=d.matches.find(x=>x.round_no===round+1&&x.match_no===Math.ceil(match/2));
        if(next){if(next.winner&&(clear||next.winner!==winner))throw new Error('Сначала отмените результат следующего матча');if(match%2)next.left_team=winner;else next.right_team=winner;next.score_left=0;next.score_right=0;}
        m.score_left=clear?0:left;m.score_right=clear?0:right;m.winner=winner;demoSave(d);
      }
    },clear?'Результат отменён.':'Результат сохранён. Победитель прошёл в следующий раунд.');
  }
  async function broadcastMatch(round,match,visible) {
    await action(async()=>{
      const b={round_no:visible?round:null,match_no:visible?match:null,visible};
      if(configured){const {error}=await db.from('tournament_broadcast').update(b).eq('id',1);if(error)throw error;}
      else{const d=demoRead();d.broadcast={id:1,...b};demoSave(d);}
    },visible?'Матч выбран для OBS.':'Командный виджет OBS скрыт.');
  }
  function listen() {
    $('createTeamForm').addEventListener('submit',createTeam);
    initTeamMemberForms();
    $('teamRequestForm').addEventListener('submit',submitTeamRequest);
    $('closeGuestInfo').addEventListener('click',()=>{$('guestInfoPanel').hidden=true;});
    $('refreshTeamApplications').addEventListener('click',loadTeamRequests);
    $('dcTeamEditorForm').addEventListener('submit',saveDesign);
    $('dcCloseEditor').addEventListener('click',closeEditor);
    $('dcClearTeamLogo').addEventListener('click',clearTeamLogo);
    $('generateBracket').addEventListener('click',generateBracket);
    $('clearBracket').addEventListener('click',clearBracket);
    $('stopOnAir').addEventListener('click',()=>broadcastMatch(null,null,false));
    const adminArea=$('tournamentAdmin');
    adminArea.addEventListener('click',e=>{
      const btn=e.target.closest('[data-t-action]');if(!btn)return;
      const type=btn.dataset.tAction;
      if(type==='edit-team')return openEditor(btn.dataset.teamId);
      if(type==='rename-team')return renameTeam(btn.dataset.teamId);
      if(type==='delete-team')return deleteTeam(btn.dataset.teamId);
      if(type==='captain')return setCaptain(btn.dataset.teamId,btn.dataset.nickname);
      if(type==='remove-guest')return removeGuest(btn.dataset.guestId);
      if(type==='guest-info')return openGuestInfo(btn.dataset.guestId);
      const wrap=btn.closest('.t-match-controls');if(!wrap)return;
      const round=Number(wrap.dataset.round),match=Number(wrap.dataset.match);
      if(type==='on-air')return broadcastMatch(round,match,true);
      if(type==='reset-result')return setMatchResult(round,match,0,0,true);
      if(type==='save-result'){
        const inputs=[...wrap.querySelectorAll('input[type=number]')];
        return setMatchResult(round,match,Number(inputs[0].value),Number(inputs[1].value));
      }
    });
    $('teamApplicationsList').addEventListener('click',e=>{
      const btn=e.target.closest('[data-t-action]');if(!btn)return;
      if(btn.dataset.tAction==='accept-request')return reviewRequest(btn.dataset.requestId,true);
      if(btn.dataset.tAction==='reject-request')return reviewRequest(btn.dataset.requestId,false);
      if(btn.dataset.tAction==='delete-approved-request'){
        const request=data.requests.find(q=>q.id===btn.dataset.requestId);
        if(!request || request.status!=='approved' || !request.approved_team_id)return flash('Принятая команда уже удалена. Обнови заявки.','error','teamApplicationMessage');
        return deleteTeam(request.approved_team_id,'applications');
      }
    });
    adminArea.addEventListener('change',e=>{
      const dropdown=e.target.closest('.t-assignment-select');
      if(dropdown)movePlayer(dropdown.dataset.playerId,dropdown.value);
    });
    adminArea.addEventListener('dragstart',e=>{
      const pill=e.target.closest('[data-player-id]');
      if(!pill||e.target.closest('select'))return;
      e.dataTransfer.setData('text/plain',pill.dataset.playerId);
      e.dataTransfer.effectAllowed='move';
    });
    adminArea.addEventListener('dragover',e=>{
      const zone=e.target.closest('[data-drop-team]');
      if(zone){e.preventDefault();e.dataTransfer.dropEffect='move';}
    });
    adminArea.addEventListener('drop',e=>{
      const zone=e.target.closest('[data-drop-team]');if(!zone)return;
      e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(id)movePlayer(id,zone.dataset.dropTeam);
    });
    $('unassignedDropzone').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
    $('unassignedDropzone').addEventListener('drop',e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(id)movePlayer(id,'');});
  }
  function getApprovedTeamGuestProfiles() {
    if(!isAdmin())return [];
    return data.guests.filter(g=>data.teams.some(t=>t.id===g.team_id)).map(g=>{
      const team=data.teams.find(t=>t.id===g.team_id);
      return {...g,team_name:team.name,is_captain:String(team.captain_nickname||'').trim().toLocaleLowerCase()===String(g.nickname||'').trim().toLocaleLowerCase()};
    });
  }
  function init() { active=true;listen(); }
  return {init,loadPublic,loadAdmin,renderAdminTeams,setCaptainForPlayer,captainActionForPlayer,getApprovedTeamGuestProfiles};
}
