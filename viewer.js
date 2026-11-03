import { FALLBACK_HEROES } from './db.js';

const $ = id => document.getElementById(id);
const options = [...FALLBACK_HEROES].sort((a,b) => a.name.localeCompare(b.name,'en'));
const picker = $('heroPicker');
picker.replaceChildren(...options.map(hero => {
  const option = document.createElement('option');
  option.value = hero.name; option.textContent = hero.name;
  return option;
}));
const requested = new URLSearchParams(location.search).get('hero');
const selected = options.some(h => h.name === requested) ? requested : options[0]?.name;
if (selected) picker.value = selected;
const status = text => { $('viewerStatus').textContent = text; };
let manifest = {};
let localFileUrl = null;
let libraryReady = false;
let token = 0;
let modelElement = null;

async function loadLibrary() {
  if (libraryReady) return true;
  try {
    await Promise.race([
      import('https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Недоступен 3D-модуль')), 9000))
    ]);
    libraryReady = true;
    return true;
  } catch { status('Не удалось загрузить 3D-модуль. Проверь соединение с интернетом.'); return false; }
}
function urlForModel(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value, location.href);
    if (url.protocol !== 'https:' && url.origin !== location.origin) return '';
    if (!/\.(glb|gltf)$/i.test(url.pathname)) return '';
    return url.href;
  } catch { return ''; }
}

function destroyModel() {
  if (modelElement) { modelElement.remove(); modelElement = null; }
}
async function presentModel(source, fromLocal = false) {
  const request = ++token;
  destroyModel();
  $('emptyModel').hidden = false;
  status(fromLocal ? 'Открываю локальную 3D-модель...' : 'Загружаю 3D-модель...');
  if (!await loadLibrary()) return;
  if (request !== token) return;
  const model = document.createElement('model-viewer');
  model.src = source;
  model.setAttribute('camera-controls','');
  model.setAttribute('auto-rotate','');
  model.setAttribute('shadow-intensity','1');
  model.setAttribute('exposure','1.0');
  model.setAttribute('interaction-prompt','none');
  model.setAttribute('loading','eager');
  model.setAttribute('alt',`Трёхмерная модель героя ${picker.value}`);
  model.addEventListener('load', () => { if (model === modelElement) { $('emptyModel').hidden=true; status('3D-модель загружена. Можешь вращать персонажа и приближать камеру.'); } });
  model.addEventListener('error', () => { if(model === modelElement) { destroyModel();$('emptyModel').hidden=false;status('Файл не открылся. Проверь формат GLB, путь к файлу и доступность CORS.'); } });
  modelElement = model;
  $('modelStage').append(model);
}
function releaseLocal() {
  if (localFileUrl) { URL.revokeObjectURL(localFileUrl);localFileUrl = null; }
}
function selectHero(name) {
  $('heroName').textContent = name;
  $('heroIdLabel').textContent = 'HERO / ' + String(options.findIndex(h => h.name === name)+1).padStart(3,'0');
  releaseLocal();
  $('modelFile').value = '';
  const url = urlForModel(manifest[name]);
  if (url) void presentModel(url);
  else { token++;destroyModel();$('emptyModel').hidden=false;status('Для этого героя модель пока не подключена. Можно выбрать локальный .glb для проверки.'); }
  const address = new URL(location.href);
  address.searchParams.set('hero',name);
  history.replaceState(null,'',address);
}

picker.addEventListener('change',() => selectHero(picker.value));
$('modelFile').addEventListener('change', () => {
  const file = $('modelFile').files?.[0];
  if (!file) return;
  if (!/\.glb$/i.test(file.name)) return status('Выбери файл .glb, желательно со встроенными текстурами.');
  if (file.size > 80*1024*1024) return status('Файл слишком большой (более 80 МБ).');
  releaseLocal();
  localFileUrl = URL.createObjectURL(file);
  void presentModel(localFileUrl, true);
});
$('closeViewer').addEventListener('click',() => {
  window.close();
  setTimeout(() => { if (!window.closed) location.href='./index.html#register'; }, 180);
});
window.addEventListener('pagehide',releaseLocal);

(async () => {
  try {
    const response = await fetch('./models.json', {cache:'no-store'});
    if (response.ok) { const content = await response.json();if (content && typeof content === 'object' && !Array.isArray(content)) manifest=content; }
  } catch { /* No configured 3D models — viewer remains usable for local uploads. */ }
  if (selected) selectHero(selected);
})();
