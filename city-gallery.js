import {heroImageSources, FALLBACK_HEROES} from './db.js';
/* Independent decorative layer: a failed image never affects forms or tournament. */
const cast = {
  register: ['Infernus','Haze','McGinnis'],
  roster: ['Seven','Ivy','Paradox'],
  teams: ['Abrams','Dynamo','Yamato'],
  bracket: ['Shiv','Lady Geist','Wraith'],
  admin: ['Bebop','Vindicta','Kelvin'],
  gallery: ['Abrams','Haze','Infernus','Lady Geist','Paradox','Wraith']
};
let heroes = FALLBACK_HEROES;
const findHero = name => heroes.find(h=>h.name.toLowerCase()===name.toLowerCase()) || {name};
function image(name, className, index=0) {
  const sources=heroImageSources(findHero(name));
  const element=document.createElement('img');
  element.alt=''; element.loading=index===0?'eager':'lazy'; element.decoding='async';
  element.referrerPolicy='no-referrer';
  element.className=className; element.setAttribute('aria-hidden','true');
  let attempt=0;
  element.onerror=()=>{ attempt++; if(attempt<sources.length) element.src=sources[attempt]; else element.classList.add('dc-image-missing');};
  if(sources.length) element.src=sources[0]; else element.classList.add('dc-image-missing');
  return element;
}
function sceneImages() {
 for(const [scene,names] of Object.entries(cast)) {
   const host=document.querySelector(`[data-deadlock-scene="${scene}"]`);
   if(!host) continue;
   host.replaceChildren(...names.map((name,i)=>{
     const block=document.createElement('div');
     block.className='dc-scene-person dc-scene-person-'+i;
     block.appendChild(image(name,'dc-scene-img',i));
     if(scene==='gallery') {
       const label=document.createElement('span'); label.textContent=name;block.appendChild(label);
     }
     return block;
   }));
 }
}
window.addEventListener('deadlock:heroes', e=>{
  if(Array.isArray(e.detail) && e.detail.length) heroes=e.detail;
  sceneImages();
});
sceneImages();
