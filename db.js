import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
export const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_');
// Не загружаем Supabase через top-level await: при недоступном CDN это
// блокировало запуск ВСЕГО интерфейса, включая карточки героев.
export let db = null;
let initialization = null;
async function importWithTimeout(url, milliseconds = 6500) {
  let timeout;
  try {
    return await Promise.race([
      import(url),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Превышено время загрузки библиотеки Supabase')), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
export async function initializeDatabase() {
  if (!configured) return false;
  if (db) return true;
  if (!initialization) {
    initialization = (async () => {
      let library;
      try {
        library = await importWithTimeout('https://esm.sh/@supabase/supabase-js@2.49.8');
      } catch (firstError) {
        // Резервный CDN, если основной заблокирован/временно недоступен.
        try {
          library = await importWithTimeout('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm');
        } catch {
          throw new Error('Не удалось загрузить Supabase. Проверь интернет, блокировщики и доступ к esm.sh / jsdelivr.net.');
        }
      }
      db = library.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      return true;
    })().catch(error => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

const SAMPLE = [
  ['Nova', 'Haze', 420], ['Healing rite', 'Dynamo', 310],
  ['Raven', 'Abrams', 140], ['Vortex', 'Infernus', 500],
  ['Nox', 'Seven', 225], ['Eclipse', 'Wraith', 380]
];
const get = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const put = (key, value) => localStorage.setItem(key, JSON.stringify(value));
export const demo = {
  getRegistrations() {
    return get('deadlock_demo_registrations', SAMPLE.map(([nickname, hero, hours], i) => ({
      id: `sample-${i}`, nickname, discord: `${nickname.toLowerCase().replaceAll(' ', '_')}#0000`,
      steam_profile: '', hours, region: 'EU', notes: 'Демонстрационная анкета',
      hero_names: [hero], steam_avatar_opt_in: false, steam_avatar_url:'', status: i < 3 ? 'approved' : 'pending', submitted_at: new Date().toISOString()
    })));
  },
  saveRegistrations(rows) { put('deadlock_demo_registrations', rows); },
  getBroadcast() { return get('deadlock_demo_broadcast', {
    id: 1, left_nickname: 'Nova', right_nickname: 'Healing rite',
    score_left: 1, score_right: 0, round_label: 'ФИНАЛ · BO3', visible: true
  }); },
  saveBroadcast(state) { put('deadlock_demo_broadcast', state); }
};

export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
export const safeImage = (url) => {
  try {
    const p = new URL(url);
    return p.protocol === 'https:' && [
      'assets.deadlock-api.com', 'assets-bucket.deadlock-api.com',
      'media.githubusercontent.com', 'raw.githubusercontent.com', 'deadlock.wiki'
    ].includes(p.hostname) ? p.href : '';
  } catch { return ''; }
};
const assetCardUrl = (name) => {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g,'');
  return `https://assets.deadlock-api.com/images/heroes/${slug}_card.webp`;
};
const portraitFromSlug = (name) =>
  `https://media.githubusercontent.com/media/0xThiagoAmaral/deadlock-open-assets/main/images/deadlock/heroes_circle/${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g,'')}.png`;
// У новых героев Baba и Violet нет файлов с этими именами в старом
// репозитории. В Deadlock Wiki есть оригинальные игровые карточки 280x380.
// MediaWiki Special:Redirect/file работает без знания внутреннего хэша файла.
const wikiCardUrl = (name) =>
  ['Baba', 'Violet'].includes(name)
    ? `https://deadlock.wiki/Special:Redirect/file/${encodeURIComponent(name + ' card.png')}`
    : '';
// Список адресов для одного изображения: переключаемся, если сервер
// ответил 404 или не смог загрузить картинку. Никогда не подставляем
// случайное изображение другого героя.
export function heroImageSources(hero) {
  if (!hero?.name) return [];
  const urls = [hero.image, ...(hero.imageAlternates || []), assetCardUrl(hero.name), wikiCardUrl(hero.name), portraitFromSlug(hero.name)];
  return [...new Set(urls.map(safeImage).filter(Boolean))];
}
// Все 44 играбельных героя на 02.11.2026. Каталог доступен без API.
// API используется для обновления портретов и будущих героев, но не может
// удалить игроков из этого резервного списка из-за неполного ответа сервиса.
export const FALLBACK_HEROES = [
  'Abrams', 'Apollo', 'Baba', 'Bebop', 'Billy', 'Calico', 'Celeste',
  'Deadman Danny', 'Drifter', 'Dynamo', 'Graves', 'Grey Talon', 'Haze',
  'Holliday', 'Infernus', 'Ivy', 'Kelvin', 'Lady Geist', 'Lash',
  'McGinnis', 'Mina', 'Mirage', 'Mo & Krill', 'Nurse Harrow', 'Paige',
  'Paradox', 'Pocket', 'Rat King', 'Rem', 'Seven', 'Shiv', 'Silver',
  'Sinclair', 'Solomon', 'The Doorman', 'Venator', 'Victor',
  'Vindicta', 'Viscous', 'Violet', 'Vyper', 'Warden', 'Wraith', 'Yamato'
].map((name) => ({ name, image: assetCardUrl(name), imageAlternates: [wikiCardUrl(name),portraitFromSlug(name)] }));

const heroKey = name => String(name).toLowerCase()
  .replace(/\b(and)\b/g, '&').replace(/[^a-z0-9а-яё]+/g, '');

// Объединяем резервный список с данными API; API имеет приоритет для картинок.

export function mergeHeroes(apiHeroes = []) {
  const combined = new Map(FALLBACK_HEROES.map(hero => [heroKey(hero.name), hero]));
  for (const hero of apiHeroes) {
    if (!hero?.name || hero.disabled) continue;
    const key = heroKey(hero.name);
    const existing = combined.get(key);
    combined.set(key, {
      name: existing?.name || hero.name,
      image: safeImage(hero.image) || existing?.image || '',
      imageAlternates: [
        ...(hero.imageAlternates || []), ...(existing?.imageAlternates || []),
        existing?.image || ''
      ].map(safeImage).filter(Boolean)
    });
  }
  return [...combined.values()].sort((a,b) => a.name.localeCompare(b.name, 'en'));
}

export async function loadHeroes() {
  // Портреты из последнего успешного ответа доступны и при временном сбое API.
  let cached = [];
  try { cached = JSON.parse(localStorage.getItem('deadlock_heroes_cache_v31') || '[]'); }
  catch { /* Нет сохранённого каталога */ }
  if (!Array.isArray(cached)) cached = [];
  const cachedList = cached.filter(h => h && typeof h.name === 'string' && typeof h.image === 'string');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch('https://api.deadlock-api.com/v1/assets/heroes?only_active=true', {signal: controller.signal});
    if (!response.ok) throw new Error(`Deadlock API вернул HTTP ${response.status}`);
    const payload = await response.json();
    const arr = Array.isArray(payload) ? payload : Object.values(payload ?? {});
    const heroes = arr.filter(h => h?.name && !h.disabled && !h.in_development)
      .map(h => ({
        name: String(h.name),
        image: [h.images?.icon_hero_card_webp, h.images?.icon_hero_card,
          h.images?.icon_hero_portrait_webp, h.images?.icon_hero_portrait,
          h.images?.selection_image, h.images?.icon_hero_vertical,
          h.images?.icon_hero_vertical_webp].map(safeImage).find(Boolean) ||
          wikiCardUrl(h.name) || portraitFromSlug(h.name),
        imageAlternates: [h.images?.icon_hero_card, h.images?.icon_hero_portrait,
          h.images?.selection_image, h.images?.icon_hero_vertical].map(safeImage).filter(Boolean)
      }));
    if (heroes.length < 10) throw new Error('Deadlock API вернул неполный каталог');
    const merged = mergeHeroes(heroes);
    try { localStorage.setItem('deadlock_heroes_cache_v31', JSON.stringify(heroes)); }
    catch { /* Блокировка localStorage не должна ломать каталог */ }
    return {heroes: merged, online: true};
  } catch {
    return {heroes: mergeHeroes(cachedList), online: false};
  } finally {
    clearTimeout(timeout);
  }
}
