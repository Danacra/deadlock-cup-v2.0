/* Deadlock Cup v3.11 — reliably discoverable lore Easter eggs; no data or Supabase dependency. */
(() => {
  'use strict';
  const ASSET_ROOT = './easter-eggs/';
  const RECORD_KEY = 'deadlock_cup_discoveries_v39';
  const archive = [
    {
      id: 'archmother', title: 'Архиматерь',
      image: 'archmother-mask.png', trigger: 'archmother-sigil.png',
      logo: 'archmother-name.png', submark: 'guided-hand.png',
      accent: '#a5cfe0',
      message: 'Из темноты за тобой наблюдают. Кому принадлежит этот знак — и зачем он оставлен здесь?'
    },
    {
      id: 'hidden-king', title: 'Скрытый король',
      image: 'hidden-king-mask.png', trigger: 'hidden-king-sigil.png',
      logo: 'hidden-king-name.png', submark: 'broken-crown.png',
      accent: '#ffc15c',
      message: 'Корона сломана. Но тот, кто её носил, ещё не рассказал свою последнюю историю.'
    },
    {
      id: 'patron', title: 'Покровитель',
      image: 'patron.png', trigger: 'patron.png',
      logo: null, submark: null,
      accent: '#d8ba73',
      message: 'Нечто шевелится там, куда не падает свет. Этот знак появляется только внимательным.'
    },
    {
      id: 'doorman', title: 'Привратник',
      image: 'doorman.png', trigger: 'doorman.png',
      logo: null, submark: null,
      accent: '#82e6e2',
      message: 'В этом городе почти у каждой двери есть ключ. А некоторые двери сами выбирают, кого впустить.'
    },
    {
      id: 'drifter', title: 'Скиталец',
      image: 'drifter-name.png', trigger: 'drifter-name.png',
      logo: 'drifter-name.png', submark: null,
      accent: '#edf2e8',
      message: 'Незнакомое имя на стене. Оно было здесь всё это время — или появилось только сейчас?'
    }
  ];

  // All slots are decorative areas. No free-floating hit targets over forms or admin controls.
  const slots = [
    {selector:'#pageIntro .hero-right', kind:'intro'},
    {selector:'#view-register .info-quote', kind:'quote'},
    {selector:'#view-roster .dc-view-hero', kind:'banner'},
    {selector:'#view-teams .dc-view-hero', kind:'banner'},
    {selector:'#view-bracket .dc-view-hero', kind:'banner'},
    {selector:'#view-admin .dc-view-hero', kind:'banner'}
  ];
  const rand = (min,max) => min + Math.random() * (max-min);
  const shuffle = a => {
    const copy=[...a];
    for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
    return copy;
  };
  let overlay, panel, lastFocus, onModalKeydown;
  let found = new Set();
  try {
    const value = JSON.parse(localStorage.getItem(RECORD_KEY) || '[]');
    if (Array.isArray(value)) found = new Set(value.filter(v=>archive.some(a=>a.id===v)));
  } catch (_error) { /* local storage can be disabled; Easter eggs still work */ }

  function image(src, className, alt) {
    const el=document.createElement('img');
    el.src=ASSET_ROOT+src;
    el.className=className;
    el.alt=alt;
    el.decoding='async';
    return el;
  }

  function makeOverlay() {
    overlay=document.createElement('div');
    overlay.className='dc-egg-backdrop';
    overlay.id='dcEasterEggOverlay';
    overlay.hidden=true;
    overlay.addEventListener('pointerdown',ev=>{if(ev.target===overlay) close();});
    panel=document.createElement('section');
    panel.className='dc-egg-dialog';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','dcEasterEggTitle');
    const closeBtn=document.createElement('button');
    closeBtn.type='button';closeBtn.className='dc-egg-close';closeBtn.textContent='×';
    closeBtn.setAttribute('aria-label','Закрыть найденную пасхалку');
    closeBtn.addEventListener('click',close);
    const eyebrow=document.createElement('div');eyebrow.className='dc-egg-eyebrow';
    eyebrow.textContent='THE CURSED CITY / ОБНАРУЖЕН СЛЕД';
    const stage=document.createElement('div');stage.className='dc-egg-art-stage';stage.id='dcEasterEggArtStage';
    const logoContainer=document.createElement('div');logoContainer.id='dcEasterEggLogo';
    const title=document.createElement('h2');title.id='dcEasterEggTitle';
    const desc=document.createElement('p');desc.className='dc-egg-description';desc.id='dcEasterEggDescription';
    const submarkContainer=document.createElement('div');submarkContainer.id='dcEasterEggSubmark';
    const progress=document.createElement('div');progress.className='dc-egg-progress';progress.id='dcEasterEggProgress';
    const footer=document.createElement('div');footer.className='dc-egg-footer';footer.textContent='Пасхалки — декоративная часть сайта. На турнир они не влияют.';
    panel.append(closeBtn,eyebrow,stage,logoContainer,title,desc,submarkContainer,progress,footer);
    overlay.append(panel);document.body.append(overlay);
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden=true;
    document.body.classList.remove('dc-egg-modal-open');
    document.removeEventListener('keydown',onModalKeydown);
    if(lastFocus && lastFocus.isConnected) lastFocus.focus({preventScroll:true});
  }

  function open(item) {
    if (!overlay) makeOverlay();
    lastFocus=document.activeElement;
    found.add(item.id);
    try {localStorage.setItem(RECORD_KEY,JSON.stringify([...found]));} catch (_error) {}
    panel.style.setProperty('--dc-egg-accent',item.accent);
    const stage=document.getElementById('dcEasterEggArtStage');
    const logo=document.getElementById('dcEasterEggLogo');
    const submark=document.getElementById('dcEasterEggSubmark');
    stage.replaceChildren(image(item.image,'dc-egg-art'+(item.id==='doorman'?' dc-egg-portrait':''),item.title));
    logo.replaceChildren(...(item.logo && item.logo !== item.image ? [image(item.logo,'dc-egg-wordmark',item.title)] : []));
    submark.replaceChildren(...(item.submark ? [image(item.submark,'dc-egg-submark','Символ фракции')] : []));
    document.getElementById('dcEasterEggTitle').textContent=item.title;
    document.getElementById('dcEasterEggDescription').textContent=item.message;
    document.getElementById('dcEasterEggProgress').textContent=`НАЙДЕНО СЕКРЕТОВ: ${found.size} / ${archive.length}`;
    overlay.hidden=false;document.body.classList.add('dc-egg-modal-open');
    onModalKeydown=(event)=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        // The close button is the only interactive control inside the modal.
        event.preventDefault(); panel.querySelector('.dc-egg-close').focus();
      }
    };
    document.addEventListener('keydown',onModalKeydown);
    panel.querySelector('.dc-egg-close').focus({preventScroll:true});
  }

  function place(item,slot) {
    const host=document.querySelector(slot.selector);
    if(!host) return;
    const btn=document.createElement('button');
    btn.type='button';btn.className='dc-egg-marker';
    btn.setAttribute('aria-label','Найти скрытый знак');
    btn.title='Странный знак. Нажми, чтобы исследовать.';
    btn.dataset.eggId=item.id;
    btn.style.setProperty('--dc-egg-tilt',`${rand(-12,12).toFixed(1)}deg`);
    if(slot.kind==='intro'){
      btn.style.left=rand(40,78).toFixed(1)+'%';
      btn.style.top=rand(26,66).toFixed(1)+'%';
    } else if(slot.kind==='quote'){
      // Always in the right upper corner, away from the quote and its signature.
      // Pixel-based positioning keeps the glyph inside narrow quote cards.
      btn.classList.add('dc-egg-quote');
      btn.style.right=rand(12,23).toFixed(0)+'px';
      btn.style.top=rand(12,25).toFixed(0)+'px';
    } else {
      // The text occupies the left side of banners: keep symbols to the right.
      btn.classList.add('dc-egg-banner');
      btn.style.right=rand(21,57).toFixed(0)+'px';
      btn.style.top=rand(32,63).toFixed(1)+'%';
    }
    if(item.id==='drifter') btn.classList.add('dc-egg-wide');
    const icon=image(item.trigger,'','Скрытый знак');icon.alt='';icon.setAttribute('aria-hidden','true');
    // A clearly visible glyph remains if PNG assets were uploaded to the wrong GitHub folder.
    const fallback=document.createElement('span');fallback.className='dc-egg-fallback';fallback.textContent='✧';fallback.hidden=true;
    icon.addEventListener('error',()=>{icon.hidden=true;fallback.hidden=false;},{once:true});
    btn.append(icon,fallback);btn.addEventListener('click',()=>open(item));
    host.append(btn);
  }

  function init() {
    const available=slots.filter(s=>document.querySelector(s.selector));
    if(!available.length) return;
    // Every section has one marker, including the quote on the registration page.
    // All five unique secrets remain discoverable in any session.
    // Six slots means one random secret can appear in two different sections.
    const ordered=shuffle(archive);
    const assignments=shuffle([...ordered,ordered[Math.floor(Math.random()*ordered.length)]]);
    available.forEach((slot,i)=>place(assignments[i % assignments.length],slot));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
