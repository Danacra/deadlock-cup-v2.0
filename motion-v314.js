/* Deadlock Cup v3.14 — non-blocking entry animations. No database or state changes. */
(() => {
  'use strict';
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animated = new WeakSet();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (!animated.has(entry.target)) {
        animated.add(entry.target);
        entry.target.classList.add('dc-appear');
      }
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -25px 0px' });
  const find = () => {
    document.querySelectorAll('.view:not([hidden]) .panel, .view:not([hidden]) .t-team-card, .view:not([hidden]) .t-placeholder, .view:not([hidden]) .roster-entry, .view:not([hidden]) .t-match-card').forEach(el => {
      if (!animated.has(el)) observer.observe(el);
    });
  };
  const run = () => { find(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true });
  else run();
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => requestAnimationFrame(find)));
  // Newly rendered cards are observed automatically; debounce using one animation frame.
  let scheduled=false;
  const mo=new MutationObserver(() => {
    if (scheduled) return;
    scheduled=true;
    requestAnimationFrame(() => {scheduled=false;find();});
  });
  mo.observe(document.querySelector('main') || document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
})();
