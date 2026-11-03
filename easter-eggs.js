/* Deadlock Cup v3.12 — all 11 supplied artworks, public views only. */
(() => {
  'use strict';
  const ASSETS = './easter-eggs/';
  const STORAGE = 'deadlock_cup_artifacts_v312';
  const relics = [
    {id:'archmother-mask',file:'archmother-mask.png',title:'Архиматерь',label:'Лик Архиматери',detail:'Узнаваемый силуэт в отблеске холодного света.',size:'mask',anchor:'intro-a',area:'intro'},
    {id:'hidden-king-mask',file:'hidden-king-mask.png',title:'Скрытый король',label:'Взгляд из тьмы',detail:'Иногда самое важное скрывается за маской.',size:'mask',anchor:'intro-b',area:'intro'},
    {id:'archmother-sigil',file:'archmother-sigil.png',title:'Архиматерь',label:'Знак Архиматери',detail:'Маленькая метка на полях объявления.',size:'sigil',anchor:'quote',area:'quote'},
    {id:'guided-hand',file:'guided-hand.png',title:'Направляющая длань',label:'The Guided Hand',detail:'Кому-то здесь явно нравится оставлять подписи.',size:'wordmark',anchor:'info',area:'info'},
    {id:'archmother-name',file:'archmother-name.png',title:'Архиматерь',label:'ARCHMOTHER',detail:'Тайное имя среди турнирных анкет.',size:'wordmark',anchor:'team',area:'team'},
    {id:'hidden-king-sigil',file:'hidden-king-sigil.png',title:'Скрытый король',label:'Тайный знак',detail:'Никто не заметит его, если не присмотреться.',size:'sigil',anchor:'roster-a',area:'roster'},
    {id:'hidden-king-name',file:'hidden-king-name.png',title:'Скрытый король',label:'HIDDEN KING',detail:'Имя осталось там, где его меньше всего ждут.',size:'wordmark',anchor:'roster-b',area:'roster'},
    {id:'broken-crown',file:'broken-crown.png',title:'Сломанная корона',label:'The Broken Crown',detail:'Короны ломаются, но легенды остаются.',size:'wordmark',anchor:'teams-a',area:'teams'},
    {id:'patron',file:'patron.png',title:'Покровитель',label:'Нечто в тени',detail:'Кто знает, кто наблюдает за составами команд?',size:'mask',anchor:'teams-b',area:'teams'},
    {id:'doorman',file:'doorman.png',title:'Привратник',label:'Знак Привратника',detail:'Не всякая дверь ведёт туда, куда ожидаешь.',size:'portrait',anchor:'bracket-a',area:'bracket'},
    {id:'drifter-name',file:'drifter-name.png',title:'Скиталец',label:'DRIFTER',detail:'Призрачная надпись среди будущих матчей.',size:'wordmark',anchor:'bracket-b',area:'bracket'}
  ];
  let discovered = new Set();
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    if (Array.isArray(value)) discovered = new Set(value.filter(v => relics.some(r => r.id === v)));
  } catch(_) { /* browsing without storage remains possible */ }

  const random = (min,max) => min + Math.random()*(max-min);
  const byId = id => document.getElementById(id);
  let modal, dialog, previousFocus;

  function imageFor(item, className, extra) {
    const img = document.createElement('img');
    img.src = ASSETS + item.file;
    img.className = className;
    img.alt = extra ? item.label : '';
    img.loading = extra ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'same-origin';
    return img;
  }

  function makeModal() {
    modal = document.createElement('div');
    modal.className = 'dc-egg-backdrop';
    modal.id='dcEasterEggOverlay';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="dc-egg-dialog" role="dialog" aria-modal="true" aria-labelledby="dcEasterEggTitle">
        <button class="dc-egg-close" type="button" aria-label="Закрыть">×</button>
        <div class="dc-egg-eyebrow">THE CURSED CITY / НАЙДЕН АРТЕФАКТ</div>
        <div class="dc-egg-art-stage" id="dcEasterEggArtStage"></div>
        <h2 id="dcEasterEggTitle"></h2>
        <p class="dc-egg-description" id="dcEasterEggDescription"></p>
        <div class="dc-egg-progress" id="dcEasterEggProgress"></div>
        <div class="dc-egg-footer">Все 11 изображений спрятаны в публичных разделах сайта.</div>
      </section>`;
    dialog=modal.querySelector('.dc-egg-dialog');
    modal.addEventListener('pointerdown', ev=>{if(ev.target===modal) close();});
    modal.querySelector('.dc-egg-close').addEventListener('click',close);
    document.body.append(modal);
  }
  function onKey(event){
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      event.preventDefault();
      modal.querySelector('.dc-egg-close').focus();
    }
  }
  function close(){
    if(!modal || modal.hidden) return;
    modal.hidden=true;
    document.body.classList.remove('dc-egg-modal-open');
    document.removeEventListener('keydown',onKey);
    if(previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
  }
  function open(item){
    if(!modal) makeModal();
    previousFocus=document.activeElement;
    const stage=byId('dcEasterEggArtStage');
    stage.replaceChildren();
    const img=imageFor(item,'dc-egg-art dc-egg-art-'+item.size,true);
    const fallback=document.createElement('div');
    fallback.className='dc-egg-art-fallback';
    fallback.hidden=true;
    fallback.textContent='Изображение не найдено. Проверь файл: /easter-eggs/'+item.file;
    img.addEventListener('error',()=>{
      img.remove(); fallback.hidden=false;
      console.warn('Deadlock Cup: missing Easter egg image',img.src);
    },{once:true});
    const completeDiscovery=()=>{
      if (!discovered.has(item.id)) {
        discovered.add(item.id);
        try{localStorage.setItem(STORAGE,JSON.stringify([...discovered]));}catch(_){}
      }
      byId('dcEasterEggProgress').textContent=`НАЙДЕНО: ${discovered.size} ИЗ ${relics.length}`;
    };
    img.addEventListener('load',completeDiscovery,{once:true});
    stage.append(img,fallback);
    if(img.complete && img.naturalWidth>0) completeDiscovery();
    byId('dcEasterEggTitle').textContent=item.title+' · '+item.label;
    byId('dcEasterEggDescription').textContent=item.detail;
    byId('dcEasterEggProgress').textContent=`НАЙДЕНО: ${discovered.size} ИЗ ${relics.length}`;
    modal.hidden=false;
    document.body.classList.add('dc-egg-modal-open');
    document.addEventListener('keydown',onKey);
    modal.querySelector('.dc-egg-close').focus({preventScroll:true});
  }

  function marker(item){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='dc-egg-piece dc-egg-'+item.size+' dc-egg-'+item.anchor;
    btn.dataset.relic=item.id;
    btn.title=item.label+' — исследовать';
    btn.setAttribute('aria-label','Найти артефакт: '+item.label);
    btn.style.setProperty('--egg-rotation',random(-9,9).toFixed(1)+'deg');
    btn.style.setProperty('--egg-jitter-x',random(-5,5).toFixed(0)+'px');
    btn.style.setProperty('--egg-jitter-y',random(-5,5).toFixed(0)+'px');
    const img=imageFor(item,'dc-egg-piece-img',false);
    const fallback=document.createElement('span');
    fallback.className='dc-egg-piece-fallback';
    fallback.textContent='✧';
    fallback.hidden=true;
    img.addEventListener('error',()=>{
      img.remove(); fallback.hidden=false;
      console.warn('Deadlock Cup: missing Easter egg image',img.src);
    },{once:true});
    btn.append(img,fallback);
    btn.addEventListener('click',()=>open(item));
    return btn;
  }

  function cluster(host, className){
    const el=document.createElement('div');
    el.className='dc-egg-cluster '+className;
    host.append(el);
    return el;
  }

  function init(){
    // Safeguard: never mount anything in the administrator section.
    const intro=document.querySelector('#pageIntro .hero-right');
    if(intro){
      intro.classList.add('dc-egg-ready');
      const c=cluster(intro,'dc-egg-intro-cluster');
      ['intro-a','intro-b'].forEach(key=>c.append(marker(relics.find(r=>r.anchor===key))));
    }
    const quote=document.querySelector('#view-register .info-quote');
    if(quote) cluster(quote,'dc-egg-quote-cluster').append(marker(relics.find(r=>r.anchor==='quote')));
    const info=document.querySelector('#view-register .info-panel');
    if(info) cluster(info,'dc-egg-info-trail').append(marker(relics.find(r=>r.anchor==='info')));
    const teamHead=document.querySelector('#teamRegistration .panel-heading');
    if(teamHead) cluster(teamHead,'dc-egg-team-seal').append(marker(relics.find(r=>r.anchor==='team')));
    for(const area of ['roster','teams','bracket']){
      const hero=document.querySelector(`#view-${area} .dc-view-hero`);
      if(!hero) continue;
      const c=cluster(hero,'dc-egg-banner-cluster');
      relics.filter(r=>r.area===area).forEach(r=>c.append(marker(r)));
    }
    // Deliberately no #view-admin, no admin controls, and no changes to Supabase.
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
