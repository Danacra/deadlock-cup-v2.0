import {db, configured, initializeDatabase, demo, escapeHTML as esc} from './db.js';
const mode = ['match','roster','lowerthird','teams'].includes(new URL(location.href).searchParams.get('mode')) ? new URL(location.href).searchParams.get('mode') : 'match';
const root = document.getElementById('obsRoot');
document.getElementById('overlayDemo').hidden = configured;
let lastMarkup = null;
async function update() {
  try {
    let markup = '';
    if (mode === 'teams') {
      let focus, matches, teams;
      if (configured) {
        const [f,m,t] = await Promise.all([
          db.from('tournament_broadcast').select('round_no,match_no,visible').eq('id',1).single(),
          db.from('tournament_matches').select('round_no,match_no,left_team,right_team,score_left,score_right,winner'),
          db.from('tournament_teams').select('id,name,team_color,logo_url')
        ]);
        for (const result of [f,m,t]) if (result.error) throw result.error;
        focus=f.data;matches=m.data||[];teams=t.data||[];
      } else {
        const saved=JSON.parse(localStorage.getItem('deadlock_tournament_demo_v1')||'null');
        focus=saved?.broadcast||{visible:false};matches=saved?.matches||[];teams=saved?.teams||[];
      }
      const match=matches.find(m=>m.round_no===focus.round_no&&m.match_no===focus.match_no);
      const teamName=id=>teams.find(t=>t.id===id)?.name||'TBD';
      const teamIcon=id=>{
        const team=teams.find(t=>t.id===id);
        try {const u=new URL(team?.logo_url||'');if(u.protocol==='https:' && u.hostname.endsWith('.supabase.co') && u.pathname.includes('/storage/v1/object/public/team-logos/'))return `<img class="dc-obs-team-logo" src="${esc(u.href)}" alt="">`;}catch{}
        return '';
      };
      const teamColor=id=>/^#[0-9a-f]{6}$/i.test(teams.find(t=>t.id===id)?.team_color||'') ? teams.find(t=>t.id===id).team_color : '#B6FF00';
      if (!focus.visible||!match) markup='';
      else markup=`<div class="scorebug team-scorebug"><div class="score-name" style="--obs-accent:${teamColor(match.left_team)}">${teamIcon(match.left_team)}<small>КОМАНДА 01</small><span>${esc(teamName(match.left_team))}</span></div><div class="score-center"><small>РАУНД ${Number(match.round_no)} · МАТЧ ${Number(match.match_no)}</small><strong>${Number(match.score_left)}:${Number(match.score_right)}</strong></div><div class="score-name" style="--obs-accent:${teamColor(match.right_team)}">${teamIcon(match.right_team)}<small>КОМАНДА 02</small><span>${esc(teamName(match.right_team))}</span></div></div><div class="round">DEADLOCK CUP · КОМАНДНЫЙ МАТЧ</div>`;
    } else if (mode === 'roster') {
      let roster;
      if (configured) {
        const {data, error} = await db.from('public_roster').select('nickname').order('nickname').limit(200);
        if (error) throw error; roster = data || [];
      } else roster = demo.getRegistrations().filter(r => r.status !== 'rejected').map(r => ({nickname:r.nickname}));
      markup = `<section class="roster-overlay"><div class="roster-header"><strong>УЧАСТНИКИ ТУРНИРА</strong><small>${roster.length} ИГРОКОВ</small></div><div class="roster-overgrid">${roster.slice(0,32).map((r,i) => `<div class="item"><small>${String(i+1).padStart(2,'0')}</small>${esc(r.nickname)}</div>`).join('')}</div></section>`;
    } else {
      let state;
      if (configured) {
        const {data,error} = await db.from('broadcast_state').select('left_nickname,right_nickname,score_left,score_right,round_label,visible').eq('id',1).single();
        if (error) throw error; state = data;
      } else state = demo.getBroadcast();
      if (!state.visible) markup = '';
      else if (mode === 'lowerthird') markup = `<div class="lowerthird"><span class="tag">DEADLOCK / CUP</span><span class="names">${esc(state.left_nickname || 'TBA')}<b>VS</b>${esc(state.right_nickname || 'TBA')}</span><span class="roundname">${esc(state.round_label)}</span></div>`;
      else markup = `<div class="scorebug"><div class="score-name"><small>PLAYER 01</small><span>${esc(state.left_nickname || 'TBA')}</span></div><div class="score-center"><small>SCORE</small><strong>${Number(state.score_left)}:${Number(state.score_right)}</strong></div><div class="score-name"><small>PLAYER 02</small><span>${esc(state.right_nickname || 'TBA')}</span></div></div><div class="round">${esc(state.round_label)}</div>`;
    }
    if (lastMarkup !== markup) {root.innerHTML = markup; lastMarkup = markup;}
  } catch (e) { console.error('OBS overlay update failed', e); }
}
async function startOverlay() {
  try { if (configured) await initializeDatabase(); }
  catch (error) { console.error('Не удалось подключить OBS к Supabase', error); return; }
  await update();
  setInterval(update, 5000);
}
startOverlay();
// При включении Browser Source OBS страница получает свежие данные независимо от ПК организатора.
