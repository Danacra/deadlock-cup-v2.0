// Deadlock Cup: lightweight hero descriptions, no large catalogue downloads.
// Text below is an independently written short overview, not a copy of game lore.
const overviews = {
  'Abrams':'Крепкий фронтовой боец, который выдерживает давление и помогает союзникам удерживать позиции.',
  'Apollo':'Быстрый дуэлянт, предпочитающий точные атаки и грамотные перемещения.',
  'Baba':'Необычный мистический герой; игровые навыки и предыстория могут меняться с обновлениями.',
  'Bebop':'Механический боец, умеющий нарушать строй противников и создавать опасные комбинации.',
  'Billy':'Агрессивный персонаж, который стремится навязать сопернику собственный темп сражения.',
  'Calico':'Ловкая героиня, использующая хитрость и мобильность для обхода соперников.',
  'Celeste':'Героиня с театральным образом и приёмами, меняющими ход столкновения.',
  'Deadman Danny':'Необычный персонаж с собственным стилем ведения боя.',
  'Drifter':'Опасный охотник, предпочитающий внезапные появления и давление на одиночные цели.',
  'Dynamo':'Командный инициатор: поддерживает союзников и помогает организовывать совместные действия.',
  'Graves':'Мистическая героиня, умеющая влиять на пространство боя.',
  'Grey Talon':'Точный стрелок дальнего боя, использующий дистанцию и удачный момент для атаки.',
  'Haze':'Незаметная убийца, ищущая возможность застать соперника врасплох.',
  'Holliday':'Меткий боец с характерным ковбойским стилем.',
  'Infernus':'Наносит продолжительный огненный урон и быстро сближается с противниками.',
  'Ivy':'Гибкая командная героиня, помогающая союзникам с мобильностью и защитой.',
  'Kelvin':'Контролирует пространство, замедляет противников и помогает своей команде.',
  'Lady Geist':'Использует собственное здоровье и мистическую энергию в рискованных столкновениях.',
  'Lash':'Подвижный инициатор, умеющий неожиданно атаковать и перемещать врагов.',
  'McGinnis':'Инженер поддержки: укрепляет позиции, ставит устройства и помогает удерживать территорию.',
  'Mina':'Мобильная героиня, создающая давление на отдельных противников.',
  'Mirage':'Пустынный странник, умеющий управлять дистанцией и ловить момент для нападения.',
  'Mo & Krill':'Парный герой, ориентированный на ближний бой и внезапные атаки.',
  'Nurse Harrow':'Таинственная героиня с навыками, влияющими на состояние целей.',
  'Paige':'Героиня поддержки с необычным магическим арсеналом.',
  'Paradox':'Тактическая героиня, которая полагается на точный расчёт и перемещения.',
  'Pocket':'Неуловимый боец, способный внезапно появляться и скрываться.',
  'Rat King':'Нестандартный персонаж со своим стилем контроля столкновений.',
  'Rem':'Мистический герой, использующий особые способы взаимодействия с противниками.',
  'Seven':'Наносит электрический урон по области и угрожает группам врагов.',
  'Shiv':'Боец ближней дистанции, опасный при продолжительном давлении на цель.',
  'Silver':'Мобильный герой с собственным набором боевых приёмов.',
  'Sinclair':'Иллюзионист, использующий ловкость и неожиданные решения.',
  'Solomon':'Тактический герой, чьи способности связаны с шахматными фигурами.',
  'The Doorman':'Персонаж, способный менять маршруты перемещения и позиции.',
  'Venator':'Герой с охотничьей специализацией и сильным давлением на одиночную цель.',
  'Victor':'Мистический персонаж с уникальными боевыми инструментами.',
  'Vindicta':'Летающий снайпер, сильный на открытых линиях огня.',
  'Viscous':'Контролирует пространство и защищает союзников с помощью вязкой субстанции.',
  'Violet':'Героиня с необычными мистическими навыками.',
  'Vyper':'Очень подвижный персонаж, который полагается на скорость и скольжение.',
  'Warden':'Плотный фронтовой боец, ограничивающий передвижение врагов.',
  'Wraith':'Мобильная героиня, использующая карты и телекинетические приёмы.',
  'Yamato':'Ближний боец, особенно опасный при грамотном использовании способностей.'
};

const safeText = (input, max = 360) => String(input || '')
  .replace(/<br\s*\/?\s*>/gi,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/\{[^}]+\}/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,max);
const safeImage = url => { try {
  const u = new URL(url);
  return u.protocol === 'https:' && ['assets.deadlock-api.com', 'assets-bucket.deadlock-api.com', 'raw.githubusercontent.com'].includes(u.hostname) ? u.href : '';
} catch { return ''; } };
export const fallbackProfile = name => ({
  name, playstyle: overviews[name] || 'Герой Deadlock с собственными уникальными способностями и ролью в команде.',
  lore: 'Сведения о предыстории доступны в игровом справочнике. Для новых героев описания могут обновляться вместе с патчами.',
  abilities: [], descriptionSource: 'Краткий обзор сайта',
  portrait: ''
});
const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
async function getJSON(url, timeoutMs = 5200) {
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try { const response = await fetch(url, {signal:controller.signal, cache:'no-store'});
    if(!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}
const pick = (...values) => values.find(v => typeof v==='string' && v.trim() && !/^hero_[a-z_]+_(lore|playstyle)$/.test(v)) || '';
const extractText = value => typeof value==='string' ? value : pick(value?.russian, value?.byLanguage?.russian, value?.byLanguage?.english, value?.english, value?.name, value?.description);
function mapAbilities(data) {
  const list = Array.isArray(data) ? data : data && typeof data==='object' ? Object.values(data) : [];
  return list.filter(a=>a && typeof a==='object')
    .filter(a=>/ability|signature/i.test(String(a.type || a.slot || 'ability')))
    .slice(0,4).map((ability,i)=>({
      slot: i+1, name:safeText(pick(extractText(ability.name),extractText(ability.display_name),extractText(ability.displayName)),52) || `Способность ${i+1}`,
      description:safeText(pick(extractText(ability.description),extractText(ability.desc), extractText(ability.ability_description)),210),
      icon:safeImage(pick(ability.image_webp,ability.image,ability.icon_webp,ability.icon,ability.assets?.icon?.url))
    }));
}
function normalize(raw, name) {
  const d = raw?.data || raw?.hero || raw || {};
  const skills = mapAbilities(d.abilities || d.signature_abilities || d.items?.abilities || []);
  const hero = fallbackProfile(name);
  return {...hero,
    playstyle:safeText(pick(extractText(d.playstyle),extractText(d.description),extractText(d.hero_description),extractText(d.playstyle_description)),300) || hero.playstyle,
    lore:safeText(pick(extractText(d.lore),extractText(d.backstory),extractText(d.bio)),320) || hero.lore,
    abilities:skills,
    descriptionSource:'Deadlock community game-data API',
    portrait:safeImage(pick(d.images?.selection_image,d.images?.icon_hero_card_webp,d.images?.icon_hero_card))
  };
}
const cache = new Map();
export async function loadHeroProfile(name, {force=false}={}) {
  const heroName = String(name || '').trim();
  const key = heroName.toLowerCase();
  if(!force && cache.has(key)) return cache.get(key);
  const fallback = fallbackProfile(heroName);
  if(!heroName) return {profile:fallback,online:false};
  try {
    const raw = await getJSON(`https://api.deadlock-api.com/v1/assets/heroes/by-name/${encodeURIComponent(heroName)}?language=russian`);
    const profile = normalize(raw,heroName);
    const result = {profile, online:true}; cache.set(key,result);
    return result;
  } catch (first) {
    try {
      const raw = await getJSON(`https://deadlock-data-api.iainfox.dev/heroes/${encodeURIComponent(slug(heroName))}`,3800);
      const profile=normalize(raw,heroName);
      const result={profile,online:true};cache.set(key,result);return result;
    } catch (second) {
      return {profile:fallback,online:false,error:'Оба источника временно недоступны. Основной обзор остаётся доступен.'};
    }
  }
}
export const heroReferenceUrl = name => `https://deadlock.wiki/${encodeURIComponent(String(name || '').replaceAll(' ','_'))}`;
