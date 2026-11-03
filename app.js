import { db, configured, initializeDatabase, demo, loadHeroes, FALLBACK_HEROES, escapeHTML as esc, heroImageSources } from './db.js';
import { createTournamentController } from './tournament.js';
import {loadHeroProfile, fallbackProfile, heroReferenceUrl} from './hero-profile.js';
const $ = (id) => document.getElementById(id);
const state = { view: 'register', heroes: [], selected: [], roster: [], registrations: [], broadcast: null, isAdmin: false, adminStatus: 'all', heroFocus: '', heroCompendium: {}, heroCompendiumOnline: false, heroCompendiumLoading: false, heroCompendiumError: '' };
const tournament = createTournamentController({isAdmin:()=>state.isAdmin,getRegistrations:()=>state.registrations});
const message = (id, text, type = 'ok') => { const el = $(id); el.textContent = text; el.className = `message ${type}`; };
const errorText = (err) => {
  if (err?.code === '23505') return 'Такой никнейм уже зарегистрирован.';
  if (err?.code === '23514' || err?.code === '22001') return 'Проверьте длину полей и выбранных героев.';
  return err?.message || 'Неизвестная ошибка. Повторите попытку.';
};
function setView(view, updateHash = true) {
  if (!['register', 'roster', 'teams', 'bracket', 'admin'].includes(view)) view = 'register';
  state.view = view;
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== `view-${view}`);
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('pageIntro').hidden = view !== 'register';
  if (updateHash) history.replaceState(null, '', `#${view}`);
  if (view === 'roster') renderRoster();
  if (view === 'teams' || view === 'bracket') tournament.loadPublic();
  if (view === 'admin') refreshAdmin();
  window.scrollTo({top: 0, behavior: 'smooth'});
}
function imageMarkup(hero, klass = '') {
  if (!hero) return '';
  const sources = heroImageSources(hero);
  const [url, ...alternates] = sources;
  return url ? `<img class="${esc(klass)}" loading="lazy" referrerpolicy="no-referrer" src="${esc(url)}" alt="${esc(hero.name)}" data-hero-image data-alternates="${esc(encodeURIComponent(JSON.stringify(alternates)))}">` : '';
}
// Событие error не всплывает: слушаем его в фазе захвата.
// Переключаемся на следующий проверенный домен при битых ссылках.
function enableImageFallbacks() {
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-hero-image')) return;
    try {
      const remaining = JSON.parse(decodeURIComponent(img.dataset.alternates || '%5B%5D'));
      const next = remaining.shift();
      if (next) {
        img.dataset.alternates = encodeURIComponent(JSON.stringify(remaining));
        img.src = next;
        return;
      }
    } catch { /* Игнорируем повреждённый атрибут */ }
    const card = img.closest('.hero-card');
    if (card) card.classList.add('no-image');
    else { img.style.display = 'none'; img.parentElement?.classList.add('portrait-missing'); }
  }, true);
}

const heroKey = (name='') => String(name || '').trim().toLocaleLowerCase();
function getHero(name) { return state.heroes.find(h => heroKey(h.name) === heroKey(name)); }
function getHeroDetails(name) { return state.heroCompendium[heroKey(name)] || null; }
function heroPortraitHTML(name) {
  const detail = getHeroDetails(name);
  const hero = getHero(name) || {name};
  const sources = [detail?.portrait, ...heroImageSources(hero)].filter(Boolean);
  const [url, ...alternates] = [...new Set(sources)];
  return url ? `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer" data-hero-image data-alternates="${esc(encodeURIComponent(JSON.stringify(alternates)))}">` : `<span>${esc(String(name || 'D').slice(0,2).toUpperCase())}</span>`;
}
function setHeroFocus(name) {
  const next = name || state.selected[0] || '';
  if (state.heroFocus === next) return;
  state.heroFocus = next;
  if (next && !state.heroCompendium[heroKey(next)]) state.heroCompendium[heroKey(next)] = fallbackProfile(next);
  renderHeroDossier();
  window.dispatchEvent(new CustomEvent('deadlock:focus-hero', {detail: {name: next}}));
}
function renderHeroDossier() {
  const name = state.heroFocus || state.selected[0] || '';
  const details = getHeroDetails(name);
  $('heroSpotlightName').textContent = name || 'ВЫБЕРИ ГЕРОЯ';
  $('heroSpotlightTag').textContent = details ? 'CITY ARCHIVE' : 'HERO INTEL';
  $('heroSpotlightPortrait').innerHTML = name ? heroPortraitHTML(name) : '<span>D//</span>';
  const playstyle = details?.playstyle || (name ? 'Описание загружается отдельно по кнопке. Выбрать героя можно без подключения к справочнику.' : 'Нажми на героя в каталоге, чтобы открыть его досье.');
  const lore = details?.lore || (name ? 'Нажми «Загрузить описание». Если источник недоступен, открой справочник в новой вкладке.' : 'Предыстория и способности не влияют на регистрацию.');
  $('heroSpotlightPlaystyle').textContent = playstyle;
  $('heroSpotlightLore').textContent = lore;
  const abilities = details?.abilities || [];
  const loading = state.heroCompendiumLoading;
  const error = !!state.heroCompendiumError;
  $('heroAbilityList').innerHTML = abilities.length
    ? abilities.map(a => `<article class="dc-ability-card"><div class="dc-ability-icon">${a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(String(a.slot))}</span>`}</div><div class="dc-ability-copy"><div class="dc-ability-name"><b>${esc(a.name || `Способность ${a.slot}`)}</b><span>${esc(`SLOT ${a.slot}`)}</span></div><div class="dc-ability-desc">${esc(a.description || 'Описание способности временно недоступно.')}</div></div></article>`).join('')
    : `<div class="dc-abilities-empty">${!name ? 'Выбери героя слева.' : loading ? 'Получаем сведения о способностях…' : error ? 'Источник способностей недоступен. Краткое описание героя уже показано выше.' : 'При наличии данных способности появятся после нажатия «Обновить данные».'}</div>`;
  $('heroDossierStatus').textContent = !name
    ? 'Нажми на карточку героя'
    : loading ? 'Получаем актуальные данные…'
    : error ? 'Краткий обзор доступен, API не отвечает'
    : state.heroCompendiumOnline && abilities.length ? 'Актуальные игровые сведения' : 'Краткий обзор · без загрузки';
  $('heroDossierRetry').hidden = true;
  $('heroDossierFetch').disabled = !name || loading;
  $('heroDossierFetch').textContent = loading ? 'ОБНОВЛЕНИЕ...' : 'ОБНОВИТЬ ДАННЫЕ ГЕРОЯ';
  const heroSlug = encodeURIComponent(name.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''));
  $('heroDossierExternal').href = heroReferenceUrl(name || 'Deadlock');

}

function renderHeroes({resetScroll = false} = {}) {
  const grid = $('heroesGrid');
  const savedScroll = resetScroll ? 0 : grid.scrollTop;
  const query = $('heroSearch').value.toLocaleLowerCase().trim();
  const filtered = state.heroes.filter(h => h.name.toLocaleLowerCase().includes(query));
  $('heroCounter').textContent = `${state.selected.length} / 3 ВЫБРАНО`;
  $('selectedHeroes').innerHTML = state.selected.length ? state.selected.map(n => `<span class="selected-chip">✓ ${esc(n)}</span>`).join('') : '<span class="text-muted">Ещё не выбран герой</span>';
  grid.innerHTML = filtered.length ? filtered.map(h => {
    const selected = state.selected.includes(h.name);
    const sources = heroImageSources(h);
    const [url, ...alternates] = sources;
    return `<button type="button" class="hero-card ${selected ? 'selected' : ''}" data-hero="${esc(h.name)}" aria-pressed="${selected}">
      ${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hero-image data-alternates="${esc(encodeURIComponent(JSON.stringify(alternates)))}">` : ''}
      <div class="image-fallback" ${url ? '' : 'style="display:flex"'}>${esc(h.name.slice(0, 2).toUpperCase())}</div>
      <span class="hero-name">${esc(h.name)}</span>${selected ? '<span class="hero-check">✓</span>' : ''}</button>`;
  }).join('') : '<div class="empty-mini">Ничего не найдено.</div>';
  grid.scrollTop = savedScroll;
}
function getRosterForDemo() {
  return demo.getRegistrations().filter(r => r.status !== 'rejected').map(r => ({nickname: r.nickname}));
}
async function fetchRoster() {
  if (configured) {
    let {data, error} = await db.rpc('get_public_avatar_roster');
    if (error) {
      // Older tournament databases have the original public_roster table.
      const basic = await db.from('public_roster').select('nickname').order('nickname');
      if (basic.error) throw basic.error;
      data = basic.data;
    }
    state.roster = data || [];
  } else state.roster = getRosterForDemo();
  $('navCount').textContent = state.roster.length;
  $('sideCount').textContent = String(state.roster.length).padStart(2, '0');
  $('rosterCount').textContent = state.roster.length;
  renderRoster();
}
function steamAvatarMarkup(url) {
  try { const u=new URL(url); if(u.protocol!=='https:' || !['avatars.steamstatic.com','avatars.fastly.steamstatic.com','avatars.akamai.steamstatic.com','avatars.cloudflare.steamstatic.com','steamcdn-a.akamaihd.net','cdn.akamai.steamstatic.com'].includes(u.hostname)) return ''; return `<img class="dc-steam-avatar" src="${esc(u.href)}" alt="" loading="lazy" referrerpolicy="no-referrer">`; } catch {return '';}
}
function renderRoster() {
  const query = $('rosterSearch').value.toLocaleLowerCase().trim();
  const roster = state.roster.filter(r => r.nickname.toLocaleLowerCase().includes(query));
  $('rosterGrid').innerHTML = roster.length ? roster.map((r, i) => `<div class="roster-entry"><span class="roster-index">${String(i + 1).padStart(2, '0')}</span>${steamAvatarMarkup(r.avatar_url)}<span class="roster-name">${esc(r.nickname)}</span></div>`).join('') : '<div class="empty-mini">Пока нет участников с таким ником.</div>';
}
async function submitRegistration(event) {
  event.preventDefault();
  message('registerMessage', '');
  if (state.selected.length < 1 || state.selected.length > 3) return message('registerMessage', 'Выбери от одного до трёх героев.', 'error');
  const nickname = $('nickname').value.trim();
  const discord = $('discord').value.trim();
  const hours = Number($('hours').value);
  if (nickname.length < 2 || nickname.length > 32 || discord.length < 2 || discord.length > 100 || !Number.isInteger(hours) || hours < 0 || hours > 10000) {
    return message('registerMessage', 'Проверь ник, Discord и количество часов.', 'error');
  }
  const row = { nickname, discord, steam_profile: $('steam').value.trim(), hours, region: $('region').value,
    notes: $('notes').value.trim(), hero_names: [...state.selected], steam_avatar_opt_in: $('steamAvatarOptIn').checked };
  const submit = $('registerSubmit'); submit.disabled = true; submit.textContent = 'ОТПРАВКА...';
  try {
    if (configured) {
      // Не вызывайте .select(): обычный посетитель не имеет прав читать личные анкеты.
      const { error } = await db.from('registrations').insert(row);
      if (error) {
        // Older schema: let registration proceed, without publishing a Steam avatar.
        const missingOptIn = String(error.message || '').includes('steam_avatar_opt_in');
        if (!missingOptIn) throw error;
        const {steam_avatar_opt_in, ...legacyRow} = row;
        const retried = await db.from('registrations').insert(legacyRow);
        if (retried.error) throw retried.error;
      }
    } else {
      const rows = demo.getRegistrations();
      if (rows.some(r => r.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase())) throw Object.assign(new Error('Такой ник уже зарегистрирован.'), {code:'23505'});
      rows.unshift({id:crypto.randomUUID(), ...row, status:'pending', submitted_at: new Date().toISOString()});
      demo.saveRegistrations(rows);
    }
    $('registerForm').reset(); $('hours').value = '0'; state.selected = []; renderHeroes(); setHeroFocus('');
    message('registerMessage', 'Заявка успешно отправлена! Твой ник появится в списке участников.');
    await fetchRoster();
    if (state.isAdmin) await fetchRegistrations();
  } catch (err) { message('registerMessage', errorText(err), 'error'); }
  finally { submit.disabled = false; submit.innerHTML = 'ОТПРАВИТЬ ЗАЯВКУ <span>↗</span>'; }
}
function downloadFile(filename, body, mime) {
  const blob = new Blob([body], {type: mime}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function csvEscape(value) { return `"${String(value ?? '').replace(/\r?\n/g, ' ').replaceAll('"', '""')}"`; }
function exportData(format) {
  if (!state.isAdmin) return;
  const rows = state.registrations;
  if (format === 'json') {
    downloadFile('deadlock-participants-private.json', JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
  } else {
    const columns = ['nickname', 'discord', 'steam_profile', 'hours', 'region', 'hero_names', 'notes', 'status', 'submitted_at'];
    const csv = '\ufeff' + columns.join(';') + '\r\n' + rows.map(r => columns.map(c => csvEscape(c === 'hero_names' ? (r[c] || []).join(', ') : r[c])).join(';')).join('\r\n');
    downloadFile('deadlock-participants-private.csv', csv, 'text/csv;charset=utf-8');
  }
}
async function verifyAdmin() {
  if (!configured) { state.isAdmin = true; $('adminLogin').hidden = true; $('adminDashboard').hidden = false; await refreshAdmin(); return; }
  try {
    const { data: {session} } = await db.auth.getSession();
    if (!session) { state.isAdmin = false; $('adminLogin').hidden = false; $('adminDashboard').hidden = true; return; }
    const {data, error} = await db.rpc('is_admin');
    if (error || data !== true) { state.isAdmin = false; $('adminLogin').hidden = false; $('adminDashboard').hidden = true; await db.auth.signOut(); return; }
    state.isAdmin = true; $('adminLogin').hidden = true; $('adminDashboard').hidden = false;
    await refreshAdmin();
  } catch (err) { message('loginMessage', errorText(err), 'error'); }
}
async function signIn(event) {
  event.preventDefault(); message('loginMessage', '');
  if (!configured) return verifyAdmin();
  const {error} = await db.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
  if (error) return message('loginMessage', 'Неверные данные входа или учётная запись не активирована.', 'error');
  const {data, error: roleError} = await db.rpc('is_admin');
  if (roleError || data !== true) { await db.auth.signOut(); return message('loginMessage', 'У этой учётной записи нет прав администратора.', 'error'); }
  $('loginPassword').value = '';
  await verifyAdmin();
}
async function logout() {
  if (configured) await db.auth.signOut();
  state.isAdmin = false; state.registrations = [];
  $('adminLogin').hidden = false; $('adminDashboard').hidden = true;
  message('loginMessage', 'Вы вышли из панели управления.');
}
async function refreshAdmin() { if (state.isAdmin) { await Promise.all([fetchRegistrations(), fetchBroadcast()]); await tournament.loadAdmin(); } }
async function fetchRegistrations() {
  try {
    if (configured) {
      let {data, error} = await db.from('registrations').select('id,nickname,discord,steam_profile,steam_avatar_opt_in,steam_avatar_url,hours,region,hero_names,notes,status,submitted_at').order('submitted_at', {ascending:false});
      if (error && /steam_avatar_(opt_in|url)/.test(String(error.message || ''))) {
        const basic = await db.from('registrations').select('id,nickname,discord,steam_profile,hours,region,hero_names,notes,status,submitted_at').order('submitted_at', {ascending:false});
        data = (basic.data || []).map(r => ({...r, steam_avatar_opt_in:false, steam_avatar_url:''}));
        error = basic.error;
      }
      if (error) throw error;
      state.registrations = data || [];
    } else state.registrations = demo.getRegistrations();
    renderAdmin();
  } catch (err) { $('adminRows').textContent = `Ошибка загрузки анкет: ${errorText(err)}`; }
}
function statusLabel(s) { return s === 'approved' ? 'ПРИНЯТ' : s === 'rejected' ? 'ОТКЛОНЁН' : 'ОЖИДАЕТ'; }
function renderAdmin() {
  const rows = state.registrations;
  $('metricAll').textContent = rows.length;
  $('metricPending').textContent = rows.filter(r => r.status === 'pending').length;
  $('metricApproved').textContent = rows.filter(r => r.status === 'approved').length;
  $('metricRejected').textContent = rows.filter(r => r.status === 'rejected').length;
  const needle = $('adminSearch').value.toLocaleLowerCase().trim();
  const filtered = rows.filter(r => (state.adminStatus === 'all' || r.status === state.adminStatus) &&
    (r.nickname.toLocaleLowerCase().includes(needle) || r.discord.toLocaleLowerCase().includes(needle)));
  $('adminRows').innerHTML = filtered.length ? filtered.map(r => {
    const heroes = (r.hero_names || []).map(name => {
      const hero = state.heroes.find(h => h.name === name);
      return `<span class="hero-mini">${imageMarkup(hero)}${esc(name)}</span>`;
    }).join('');
    return `<article class="player-record" data-id="${esc(r.id)}"><div>
       <div class="player-record-head">${steamAvatarMarkup(r.steam_avatar_url)}<strong>${esc(r.nickname)}</strong><span class="state ${esc(r.status)}">${statusLabel(r.status)}</span></div>
       <div class="player-details"><div><span>DISCORD / PRIVATE</span>${esc(r.discord)}</div><div><span>РЕГИОН</span>${esc(r.region)}</div><div><span>ИГРОВЫХ ЧАСОВ</span>${Number(r.hours)}</div>
       <div class="wide"><span>STEAM / PRIVATE</span>${esc(r.steam_profile || 'Не указан')}</div>
       ${r.notes ? `<div class="wide"><span>КОММЕНТАРИЙ / PRIVATE</span>${esc(r.notes)}</div>` : ''}
       <div class="wide"><span>ДАТА РЕГИСТРАЦИИ</span>${esc(new Date(r.submitted_at).toLocaleString('ru-RU'))}</div></div>
       <div class="record-heroes">${heroes}</div></div>
       <div class="record-actions">${r.steam_profile && r.steam_avatar_opt_in ? `<button class="action-btn dc-steam-sync" data-action="steam-avatar" data-id="${esc(r.id)}" type="button">↻ STEAM ФОТО</button>` : ''}<button class="action-btn" data-action="approved" data-id="${esc(r.id)}">✓ ПРИНЯТЬ</button><button class="action-btn" data-action="rejected" data-id="${esc(r.id)}">× ОТКЛОНИТЬ</button><button class="action-btn danger" data-action="delete" data-id="${esc(r.id)}">УДАЛИТЬ</button></div></article>`;
  }).join('') : '<div class="empty-mini">Анкет нет или ни одна не соответствует фильтру.</div>';
  const eligible = rows.filter(r => r.status !== 'rejected');
  ['leftPlayer', 'rightPlayer'].forEach(id => {
    const current = $(id).value || state.broadcast?.[id === 'leftPlayer' ? 'left_nickname' : 'right_nickname'] || '';
    $(id).innerHTML = '<option value="">— Выберите участника —</option>' + eligible.map(r => `<option value="${esc(r.nickname)}">${esc(r.nickname)}</option>`).join('');
    $(id).value = eligible.some(r => r.nickname === current) ? current : '';
  });
}
// Extract the actual response from Supabase Edge Function errors instead of
// hiding it behind the generic "non-2xx" message.
async function functionErrorText(error) {
  const status = error?.context?.status;
  let text = '';
  try {
    const details = error?.context && typeof error.context.json === 'function'
      ? await error.context.json() : null;
    text = String(details?.error || details?.message || details?.msg || '');
  } catch { /* An empty/invalid response is still an error */ }
  const fallback = error?.message || 'Неизвестная ошибка функции';
  const code = status ? `HTTP ${status}: ` : '';
  return code + (text || fallback);
}
async function requestSteamAvatar(registrationId) {
  const {data, error} = await db.functions.invoke('steam-avatar', {
    body: {registration_id: registrationId}
  });
  if (error) throw new Error(await functionErrorText(error));
  if (!data?.ok) throw new Error(String(data?.error || 'Функция не подтвердила получение аватара.'));
  return data;
}

async function setStatus(id, action) {
  if (!state.isAdmin || !['approved','rejected','delete','steam-avatar'].includes(action)) return;
  if(action === 'steam-avatar') {
    try {
      if(!configured)throw new Error('В деморежиме Steam API недоступен.');
      await requestSteamAvatar(id);
      message('adminSyncMessage','Аватар Steam обновлён.','ok');
      await fetchRegistrations(); await tournament.loadAdmin();
    } catch(e){message('adminSyncMessage',`Steam: ${errorText(e)}`,'error');}
    return;
  }
  if (action === 'delete' && !confirm('Безвозвратно удалить анкету участника?')) return;
  try {
    if (configured) {
      const query = action === 'delete' ? db.from('registrations').delete().eq('id', id) : db.from('registrations').update({status: action}).eq('id', id);
      const {error} = await query;
      if (error) throw error;
    } else {
      const rows = demo.getRegistrations();
      demo.saveRegistrations(action === 'delete' ? rows.filter(r => r.id !== id) : rows.map(r => r.id === id ? {...r, status:action} : r));
    }
    await Promise.all([fetchRegistrations(), fetchRoster()]);
    await tournament.loadAdmin();
    // Auto-sync after accepting a player; failure does not roll back approval.
    const player=state.registrations.find(r=>r.id===id);
    if(action==='approved' && configured && player?.steam_avatar_opt_in && player.steam_profile){
      try {
        await requestSteamAvatar(id);
        message('adminSyncMessage','Заявка принята, Steam-аватар синхронизирован.');
        await fetchRegistrations(); await tournament.loadAdmin();
      } catch (steamError) {
        message('adminSyncMessage',`Заявка принята, но Steam-аватар не загрузился: ${errorText(steamError)}. Можно повторить кнопкой «STEAM ФОТО».`,'error');
      }
    }
  } catch (err) { alert(`Ошибка: ${errorText(err)}`); }
}
async function fetchBroadcast() {
  try {
    if (configured) {
      const {data, error} = await db.from('broadcast_state').select('*').eq('id', 1).single();
      if (error) throw error; state.broadcast = data;
    } else state.broadcast = demo.getBroadcast();
    const b = state.broadcast;
    $('roundLabel').value = b.round_label || '';
    $('scoreLeft').value = b.score_left;
    $('scoreRight').value = b.score_right;
    $('broadcastVisible').checked = !!b.visible;
    renderAdmin();
  } catch (err) { message('broadcastMessage', errorText(err), 'error'); }
}
async function saveBroadcast(event) {
  event.preventDefault(); if (!state.isAdmin) return;
  const left = $('leftPlayer').value, right = $('rightPlayer').value;
  const scoreLeft = Number($('scoreLeft').value), scoreRight = Number($('scoreRight').value);
  if ((left && left === right) || !Number.isInteger(scoreLeft) || !Number.isInteger(scoreRight) || Math.min(scoreLeft, scoreRight) < 0 || Math.max(scoreLeft, scoreRight) > 99) {
    return message('broadcastMessage', 'Проверь выбранных игроков и счёт (0–99).', 'error');
  }
  const payload = { left_nickname:left, right_nickname:right, score_left:scoreLeft,
    score_right:scoreRight, round_label:$('roundLabel').value.trim(), visible:$('broadcastVisible').checked };
  try {
    if (configured) { const {error} = await db.from('broadcast_state').update(payload).eq('id',1); if (error) throw error; }
    else demo.saveBroadcast({id:1, ...payload});
    state.broadcast = {id:1, ...payload};
    message('broadcastMessage', 'Табло обновлено. Изменения появятся в OBS при следующем опросе (до 5 секунд).');
  } catch (err) { message('broadcastMessage', errorText(err), 'error'); }
}
const overlayUrl = mode => new URL(`./overlay.html?mode=${encodeURIComponent(mode)}`, location.href).href;
async function copyOverlay(mode) {
  const url = overlayUrl(mode);
  try { await navigator.clipboard.writeText(url); message('copyMessage', `Адрес скопирован: ${url}`); }
  catch { message('copyMessage', `Скопируй адрес вручную: ${url}`); }
}
let heroCompendiumAttempt = 0;
async function reloadHeroCompendium() {
  const targetName = state.heroFocus;
  if (!targetName) return;
  const attempt = ++heroCompendiumAttempt;
  state.heroCompendiumLoading = true;
  state.heroCompendiumError = '';
  renderHeroDossier();
  try {
    const {profile, online, error} = await loadHeroProfile(targetName,{force:true});
    if(attempt !== heroCompendiumAttempt) return;
    state.heroCompendium[heroKey(targetName)] = profile || fallbackProfile(targetName);
    state.heroCompendiumOnline = !!online;
    state.heroCompendiumError = online ? '' : (error || 'Нет соединения с API.');
  } catch (err) {
    if(attempt !== heroCompendiumAttempt) return;
    state.heroCompendium[heroKey(targetName)] ||= fallbackProfile(targetName);
    state.heroCompendiumOnline = false;
    state.heroCompendiumError = 'Не удалось получить актуальные данные.';
  } finally {
    if(attempt === heroCompendiumAttempt) {
      state.heroCompendiumLoading = false;
      renderHeroDossier();
    }
  }
}

async function init() {
  enableImageFallbacks();
  $('demoBanner').hidden = configured;
  tournament.init();
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  $('heroRegister').addEventListener('click', () => { setView('register'); $('registerForm').scrollIntoView({behavior:'smooth'}); });
  $('heroRoster').addEventListener('click', () => setView('roster'));
  $('sideRoster').addEventListener('click', () => setView('roster'));
  $('rosterSearch').addEventListener('input', renderRoster);
  $('heroSearch').addEventListener('input', () => renderHeroes({resetScroll: true}));
  $('heroesGrid').addEventListener('click', event => {
    const item = event.target.closest('[data-hero]'); if (!item) return;
    const name = item.dataset.hero;
    if (state.selected.includes(name)) state.selected = state.selected.filter(n => n !== name);
    else if (state.selected.length < 3) state.selected.push(name);
    else {
      // Даже если уже выбрано 3 героя, можно читать досье других.
      setHeroFocus(name);
      return message('registerMessage', 'Можно выбрать максимум трёх героев. Досье доступно — сними один из текущих выборов, чтобы добавить этого героя.', 'error');
    }
    renderHeroes();
    setHeroFocus(name);
  });

  $('registerForm').addEventListener('submit', submitRegistration);
  $('loginForm').addEventListener('submit', signIn);
  $('logout').addEventListener('click', logout);
  $('exportJson').addEventListener('click', () => exportData('json'));
  $('exportCsv').addEventListener('click', () => exportData('csv'));
  $('adminStatusFilter').addEventListener('change', e => { state.adminStatus = e.target.value; renderAdmin(); });
  $('adminSearch').addEventListener('input', renderAdmin);
  $('adminRows').addEventListener('click', e => { const action = e.target.closest('[data-action]'); if (action) setStatus(action.dataset.id, action.dataset.action); });
  $('broadcastForm').addEventListener('submit', saveBroadcast);
  document.querySelectorAll('[data-copy-overlay]').forEach(el => el.addEventListener('click', () => copyOverlay(el.dataset.copyOverlay)));
  // Сразу показываем выбор героев, не ожидая внешних API и CDN.
  state.heroes = FALLBACK_HEROES;
  renderHeroes();
  renderHeroDossier();
  window.dispatchEvent(new CustomEvent('deadlock:heroes',{detail:state.heroes}));
  $('heroLoadStatus').textContent = `${state.heroes.length} героев доступны сразу. Обновляем портреты...`;
  loadHeroes().then(({heroes, online}) => {
    // API никогда не должен скрывать выбранного игроком героя.
    const selection = state.selected.map(name => state.heroes.find(h => h.name === name)).filter(Boolean);
    state.heroes = [...heroes, ...selection.filter(h => !heroes.some(r => r.name === h.name))]
      .sort((a,b) => a.name.localeCompare(b.name, 'en'));
    renderHeroes();
    renderHeroDossier();
    window.dispatchEvent(new CustomEvent('deadlock:heroes',{detail:state.heroes}));
    $('heroLoadStatus').textContent = online
      ? `Героев в каталоге: ${state.heroes.length}. Портреты обновлены.`
      : `Героев в каталоге: ${state.heroes.length}. API временно недоступен — выбор героев работает.`;
  }).catch(() => {
    $('heroLoadStatus').textContent = `Героев в каталоге: ${state.heroes.length}. Резервный список работает без API.`;
  });

  $('heroDossierFetch').addEventListener('click', () => reloadHeroCompendium());
  $('heroDossierRetry').addEventListener('click', () => reloadHeroCompendium());

  setView(location.hash.slice(1) || 'register', false);
  try {
    if (configured) await initializeDatabase();
  } catch (err) {
    message('registerMessage', `Сайт отображается, но база данных не подключена: ${errorText(err)}`, 'error');
    $('registerSubmit').disabled = true;
    $('rosterGrid').textContent = 'Нет подключения к Supabase — регистрация пока недоступна.';
    $('adminLogin').hidden = false;
    $('adminDashboard').hidden = true;
    console.error('Supabase initialization failed', err);
    return;
  }
  try { await fetchRoster(); } catch (e) {
    $('rosterGrid').textContent = `Ошибка подключения: ${errorText(e)}`;
    message('registerMessage', `Ошибка соединения с базой: ${errorText(e)}`, 'error');
  }
  await verifyAdmin();
  await tournament.loadPublic();
  setInterval(async () => { try { await fetchRoster(); } catch {} }, 15000);
  setInterval(() => tournament.loadPublic(), 15000);
  // Вкладка организатора обновляет частные данные раз в 15 сек, если она открыта.
  setInterval(async () => { if (state.isAdmin && state.view === 'admin') await fetchRegistrations(); }, 15000);
  if (configured) db.auth.onAuthStateChange((_event, session) => {
    if (!session && state.isAdmin) { state.isAdmin = false; state.registrations = [];
      $('adminLogin').hidden = false; $('adminDashboard').hidden = true; }
  });
}
init().catch(e => console.error('Ошибка загрузки', e));
