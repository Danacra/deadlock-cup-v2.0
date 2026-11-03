import { FALLBACK_HEROES, heroImageSources } from './db.js';

// Direct GLB links are listed on deadlock.wiki/Category:3D_Models/Heroes.
// We link to the original CDN instead of bundling/reuploading copyrighted game assets.
const $ = id => document.getElementById(id);
const options = [...FALLBACK_HEROES].sort((a,b) => a.name.localeCompare(b.name,'en'));
const picker = $('heroPicker');
picker.replaceChildren(...options.map(hero => {
  const option = document.createElement('option');
  option.value = hero.name;
  option.textContent = hero.name;
  return option;
}));

const requested = new URLSearchParams(location.search).get('hero');
const selected = options.some(h => h.name === requested) ? requested : options[0]?.name;
if (selected) picker.value = selected;
const status = (text, error=false) => {
  const element = $('viewerStatus');
  element.textContent = text;
  element.classList.toggle('error', error);
};
let manifest = {};
let localFileUrl = null;
let libraryReady = false;
let libraryPromise = null;
let token = 0;
let modelElement = null;
let timeoutId = null;
let rotating = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const currentAbortTimeout = () => { if(timeoutId) clearTimeout(timeoutId); timeoutId=null; };

async function loadLibrary() {
  if (libraryReady) return true;
  if (!libraryPromise) libraryPromise = (async () => {
    const locations = [
      'https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js'
    ];
    for (const url of locations) {
      let deadline;
      try {
        await Promise.race([
          import(url),
          new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Timeout')), 9000); })
        ]);
        if (customElements.get('model-viewer')) { libraryReady=true; return true; }
      } catch { /* Try another CDN */ }
      finally { clearTimeout(deadline); }
    }
    return false;
  })();
  return libraryPromise;
}
function validModelUrl(value) {
  if(typeof value !== 'string') return '';
  try {
    const url = new URL(value,location.href);
    const validHost = url.origin===location.origin || url.hostname === 'cdn.deadlock.wiki';
    return url.protocol==='https:' && validHost && /\.glb$/i.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}
function destroyModel() {
  currentAbortTimeout();
  if (modelElement) { modelElement.remove(); modelElement=null; }
  $('emptyModel').hidden=false;
  $('viewerHeroPoster').hidden=!$('viewerHeroPoster').getAttribute('src');
}
function showPlaceholder(title, desc) {
  $('modelPlaceholderTitle').textContent=title;
  $('modelPlaceholderText').textContent=desc;
  $('emptyModel').hidden=false;
}
async function presentModel(source, fromLocal=false) {
  const request=++token;
  destroyModel();
  showPlaceholder('ПОДКЛЮЧАЕМ 3D-МОДЕЛЬ', 'Загружается реальный 3D-файл персонажа. Если сервер Wiki недоступен, открой оригинальный просмотрщик кнопкой справа.');
  status(fromLocal?'Открываю локальную модель…':'Загружаю модель с Deadlock Wiki…');
  if (!await loadLibrary()) {
    if (request!==token) return;
    showPlaceholder('НЕ УДАЛОСЬ ЗАПУСТИТЬ 3D', 'Библиотека 3D-просмотра недоступна. Открой модель на Deadlock Wiki.');
    status('Не удалось загрузить компонент 3D. Воспользуйся ссылкой на Wiki.',true);
    return;
  }
  if (request!==token) return;
  const model=document.createElement('model-viewer');
  model.src=source;
  model.setAttribute('camera-controls','');
  model.setAttribute('shadow-intensity','0.9');
  model.setAttribute('exposure','1.1');
  model.setAttribute('environment-image','neutral');
  model.setAttribute('interaction-prompt','none');
  model.setAttribute('loading','eager');
  model.setAttribute('alt',`3D-модель героя ${picker.value}`);
  if(rotating) model.setAttribute('auto-rotate','');
  model.addEventListener('load',()=>{
    if(model!==modelElement)return;
    currentAbortTimeout();
    $('emptyModel').hidden=true;
    $('viewerHeroPoster').hidden=true;
    status('3D-модель готова. Вращай мышью и приближай колесом.');
  });
  model.addEventListener('error',()=>{
    if(model!==modelElement)return;
    destroyModel();
    showPlaceholder('НЕ УДАЛОСЬ ЗАГРУЗИТЬ МОДЕЛЬ','Возможно, сервер Wiki ограничивает загрузку файлов на сторонних сайтах. Открой оригинальную модель на Wiki.');
    status('3D-файл не загрузился. Открой персонажа напрямую на Deadlock Wiki.',true);
  });
  modelElement=model;
  $('modelStage').append(model);
  timeoutId=setTimeout(()=>{
    if(model!==modelElement)return;
    destroyModel();
    showPlaceholder('СЕРВЕР 3D НЕ ОТВЕЧАЕТ','Загрузка превысила 22 секунды. Открой оригинальную модель на Deadlock Wiki.');
    status('Превышено время загрузки модели. Воспользуйся ссылкой Wiki.',true);
  },22000);
}
function releaseLocal() {
  if(localFileUrl){URL.revokeObjectURL(localFileUrl);localFileUrl=null;}
}
function selectHero(name) {
  $('heroName').textContent=name;
  $('heroIdLabel').textContent='HERO / '+String(options.findIndex(h=>h.name===name)+1).padStart(3,'0');
  releaseLocal();
  $('modelFile').value='';
  const wikiUrl=new URL(name.replaceAll(' ','_'),'https://deadlock.wiki/');
  wikiUrl.hash='3D_models';
  $('wikiModelLink').href=wikiUrl.href;
  const hero=options.find(h=>h.name===name);
  const portrait=hero && heroImageSources(hero)[0];
  if(portrait){ $('viewerHeroPoster').src=portrait; $('viewerHeroPoster').hidden=false; }
  else { $('viewerHeroPoster').removeAttribute('src'); $('viewerHeroPoster').hidden=true; }
  const source=validModelUrl(manifest[name]);
  if(source) void presentModel(source);
  else {
    ++token;
    destroyModel();
    showPlaceholder('НЕТ ОПУБЛИКОВАННОЙ 3D-МОДЕЛИ','В текущем каталоге Deadlock Wiki файл для этого персонажа не найден. Можешь проверить страницу героя на Wiki.');
    status('Для этого героя 3D-модель пока не опубликована. Проверь обновления Wiki.');
  }
  const address=new URL(location.href);
  address.searchParams.set('hero',name);
  history.replaceState(null,'',address);
}

picker.addEventListener('change',()=>selectHero(picker.value));
$('modelFile').addEventListener('change',()=>{
  const file=$('modelFile').files?.[0];
  if(!file)return;
  if(!/\.glb$/i.test(file.name))return status('Выбери файл .glb.',true);
  if(file.size>80*1024*1024)return status('Файл больше 80 МБ.',true);
  releaseLocal();
  localFileUrl=URL.createObjectURL(file);
  void presentModel(localFileUrl,true);
});
$('viewerHeroPoster').addEventListener('error',()=>{ $('viewerHeroPoster').hidden=true; });
$('toggleRotation').addEventListener('click',()=>{
  rotating=!rotating;
  $('toggleRotation').textContent=rotating?'ПАУЗА ВРАЩЕНИЯ':'ВКЛЮЧИТЬ ВРАЩЕНИЕ';
  $('toggleRotation').setAttribute('aria-pressed',String(rotating));
  if(modelElement){ if(rotating)modelElement.setAttribute('auto-rotate','');else modelElement.removeAttribute('auto-rotate'); }
});
$('resetCamera').addEventListener('click',()=>{
  if(!modelElement)return;
  modelElement.cameraOrbit='auto auto auto';
  modelElement.fieldOfView='auto';
  modelElement.jumpCameraToGoal?.();
});
$('closeViewer').addEventListener('click',()=>{
  window.close();
  setTimeout(()=>{if(!window.closed)location.href='./index.html#register';},180);
});
window.addEventListener('pagehide',()=>{releaseLocal();currentAbortTimeout();});
(async()=>{
  try{
    const response=await fetch('./models.json',{cache:'no-store'});
    if(response.ok){
      const content=await response.json();
      if(content && typeof content==='object' && !Array.isArray(content))manifest=content;
    }
  }catch{ status('Каталог моделей временно недоступен.'); }
  if(selected)selectHero(selected);
})();
