/* Deadlock Cup v3.13 — 11 easter eggs scattered across public sections, never admin. */
(() => {
  'use strict';
  const ASSETS = './easter-eggs/';
  const STORAGE = 'deadlock_cup_artifacts_v312'; // Keep prior discovery history across updates.
  const relics = [
    {id:'archmother-mask',file:'archmother-mask.png',title:'Архиматерь',label:'Лик Архиматери',detail:'Узнаваемый силуэт в отблеске холодного света.',size:'mask',anchor:'intro',area:'intro'},
    {id:'hidden-king-mask',file:'hidden-king-mask.png',title:'Скрытый король',label:'Взгляд из тьмы',detail:'Иногда самое важное скрывается за маской.',size:'mask',anchor:'footer',area:'footer'},
    {id:'archmother-sigil',file:'archmother-sigil.png',title:'Архиматерь',label:'Знак Архиматери',detail:'Маленькая метка на полях объявления.',size:'sigil',anchor:'quote',area:'quote'},
    {id:'guided-hand',file:'guided-hand.png',title:'Направляющая длань',label:'The Guided Hand',detail:'Кому-то здесь явно нравится оставлять подписи.',size:'wordmark',anchor:'solo-bottom',area:'solo'},
    {id:'archmother-name',file:'archmother-name.png',title:'Архиматерь',label:'ARCHMOTHER',detail:'Тайное имя среди турнирных анкет.',size:'wordmark',anchor:'team-bottom',area:'team'},
    {id:'hidden-king-sigil',file:'hidden-king-sigil.png',title:'Скрытый король',label:'Тайный знак',detail:'Никто не заметит его, если не присмотреться.',size:'sigil',anchor:'roster-upper',area:'roster'},
    {id:'hidden-king-name',file:'hidden-king-name.png',title:'Скрытый король',label:'HIDDEN KING',detail:'Имя осталось там, где его меньше всего ждут.',size:'wordmark',anchor:'roster-lower',area:'roster'},
    {id:'broken-crown',file:'broken-crown.png',title:'Сломанная корона',label:'The Broken Crown',detail:'Короны ломаются, но легенды остаются.',size:'wordmark',anchor:'teams-upper',area:'teams'},
    {id:'patron',file:'patron.png',title:'Покровитель',label:'Нечто в тени',detail:'Кто знает, кто наблюдает за составами команд?',size:'mask',anchor:'teams-lower',area:'teams'},
    {id:'doorman',file:'doorman.png',title:'Привратник',label:'Знак Привратника',detail:'Не всякая дверь ведёт туда, куда ожидаешь.',size:'portrait',anchor:'bracket-upper',area:'bracket'},
    {id:'drifter-name',file:'drifter-name.png',title:'Скиталец',label:'DRIFTER',detail:'Призрачная надпись среди будущих матчей.',size:'wordmark',anchor:'bracket-lower',area:'bracket'}
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
    img.loading = 'eager';
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
    btn.style.setProperty('--egg-rotation',random(-7,7).toFixed(1)+'deg');
    btn.style.setProperty('--egg-jitter-x',random(-12,12).toFixed(0)+'px');
    btn.style.setProperty('--egg-jitter-y',random(-4,4).toFixed(0)+'px');
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

  function placeAfter(target, item, spot, alignment='left') {
    if (!target || !item) return;
    const lane=document.createElement('div');
    lane.className='dc-egg-trail dc-egg-trail--'+spot+' dc-egg-align-'+alignment;
    lane.dataset.eggSpot=spot;
    lane.append(marker(item));
    target.insertAdjacentElement('afterend',lane);
    return lane;
  }
  function placeBefore(target,item,spot,alignment='left'){
    if(!target || !item) return;
    const lane=document.createElement('div');
    lane.className='dc-egg-trail dc-egg-trail--'+spot+' dc-egg-align-'+alignment;
    lane.dataset.eggSpot=spot;
    lane.append(marker(item));
    target.insertAdjacentElement('beforebegin',lane);
    return lane;
  }
  function placeInside(host,item,spot,alignment='right'){
    if(!host || !item) return;
    const lane=document.createElement('div');
    lane.className='dc-egg-trail dc-egg-trail--'+spot+' dc-egg-align-'+alignment;
    lane.dataset.eggSpot=spot;
    lane.append(marker(item));
    host.append(lane);
    return lane;
  }
  function init(){
    const relic=(id)=>relics.find(r=>r.id===id);

    // Hero art: exactly ONE piece, not a cluster of portraits.
    const heroRight=document.querySelector('#pageIntro .hero-right');
    if(heroRight){
      const host=document.createElement('div');
      host.className='dc-egg-intro-corner';
      host.dataset.eggSpot='intro';
      host.append(marker(relic('archmother-mask')));
      heroRight.append(host);
    }

    // Registration: one piece in the quote, the other at the very bottom of the long form.
    const quote=document.querySelector('#view-register #soloRegistration .info-quote');
    if(quote){
      const seal=document.createElement('div');
      seal.className='dc-egg-quote-stamp';
      seal.dataset.eggSpot='quote';
      seal.append(marker(relic('archmother-sigil')));
      quote.append(seal);
    }
    placeInside(document.querySelector('#registerForm'),relic('guided-hand'),'solo-bottom','right');

    // Team registration: below the submit form, not on its heading or the inputs.
    placeInside(document.querySelector('#teamRegistration'),relic('archmother-name'),'team-bottom','left');

    // Player list: one near the beginning, another below the entire panel.
    const rosterHead=document.querySelector('#view-roster .roster-head');
    placeAfter(rosterHead,relic('hidden-king-sigil'),'roster-upper','right');
    placeAfter(document.querySelector('#view-roster .roster-panel'),relic('hidden-king-name'),'roster-lower','left');

    // Teams: separate margins BEFORE and AFTER the roster cards.
    const teamsGrid=byId('teamsPublicGrid');
    placeBefore(teamsGrid,relic('broken-crown'),'teams-upper','right');
    placeAfter(teamsGrid,relic('patron'),'teams-lower','left');

    // Bracket: one mark before the grid, and another all the way below it.
    const bracket=byId('bracketPublic');
    placeBefore(bracket,relic('doorman'),'bracket-upper','left');
    placeAfter(bracket,relic('drifter-name'),'bracket-lower','right');

    // Footer: independent bottom-of-page artifact, strictly hidden in Organiser view.
    const footer=document.querySelector('footer.footer');
    const footerSlot=placeInside(footer,relic('hidden-king-mask'),'footer','right');
    const admin=byId('view-admin');
    if(footerSlot && admin){
      const syncFooter=()=>{ footerSlot.hidden=!admin.hidden; };
      new MutationObserver(syncFooter).observe(admin,{attributes:true,attributeFilter:['hidden']});
      syncFooter();
    }
    // No art elements are ever added inside #view-admin, including dynamic editor content.
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
