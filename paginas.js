/* =====================================================================
   ModoParche - paginas.js
   1. Preguntas: búsqueda en vivo, filtros por tema y acordeón animado
   2. Marca: copiar colores con un clic
===================================================================== */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ---------- 1. PREGUNTAS ---------- */
  function initFaq() {
    const list = $('#faqList');
    if (!list) return;
    const items = $$('.qa', list);
    const search = $('#faqSearch');
    const empty = $('#faqEmpty');
    let topic = 'todas';

    function apply() {
      const q = norm(search.value.trim());
      let shown = 0;
      items.forEach(it => {
        const okTopic = topic === 'todas' || it.dataset.topic === topic;
        const okText = !q || q.split(/\s+/).every(w => norm(it.textContent).includes(w));
        const on = okTopic && okText;
        it.hidden = !on;
        if (on) { it.style.setProperty('--d', (shown * 35) + 'ms'); shown++; }
      });
      list.classList.remove('is-filtering'); void list.offsetWidth; list.classList.add('is-filtering');
      empty.hidden = shown > 0;
      // Al buscar, abre la primera coincidencia
      if (q && shown) { const first = items.find(i => !i.hidden); if (first && !first.open) first.open = true; }
    }

    search.addEventListener('input', apply);
    $$('.faq-filter').forEach(b => b.addEventListener('click', () => {
      topic = b.dataset.topic;
      $$('.faq-filter').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
      apply();
    }));
    $('#faqClear')?.addEventListener('click', () => {
      search.value = ''; topic = 'todas';
      $$('.faq-filter').forEach(x => { const on = x.dataset.topic === 'todas'; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
      apply(); search.focus();
    });

    // Acordeón: anima la altura al abrir y cerrar (WAAPI, interrumpible)
    items.forEach(det => {
      const sum = $('summary', det), body = $('.qa-a', det);
      let anim = null;
      sum.addEventListener('click', e => {
        if (reduce) return;
        e.preventDefault();
        if (anim) anim.cancel();
        const opening = !det.open;
        if (opening) det.open = true;
        const full = body.scrollHeight;
        det.classList.toggle('is-open', opening);
        anim = body.animate(
          opening ? [{ height: '0px', opacity: 0 }, { height: full + 'px', opacity: 1 }] : [{ height: full + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
          { duration: opening ? 320 : 220, easing: 'cubic-bezier(.23, 1, .32, 1)' }
        );
        anim.onfinish = () => { anim = null; if (!opening) det.open = false; };
      });
      det.classList.toggle('is-open', det.open);
      det.addEventListener('toggle', () => det.classList.toggle('is-open', det.open));
    });

    // Enlace directo a un tema: preguntas.html#negocios
    const h = location.hash.slice(1);
    const pre = $(`.faq-filter[data-topic="${h}"]`);
    if (pre) pre.click();
  }

  /* ---------- 2. MARCA: copiar colores ---------- */
  function initSwatches() {
    const sw = $$('[data-copy]');
    if (!sw.length) return;
    const toast = $('#copyToast');
    let t = null;
    const say = msg => {
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('is-on');
      clearTimeout(t); t = setTimeout(() => toast.classList.remove('is-on'), 1600);
    };
    sw.forEach(b => b.addEventListener('click', async () => {
      const v = b.dataset.copy;
      try { await navigator.clipboard.writeText(v); say(`Copiado ${v}`); }
      catch (e) { say(v); }
      b.classList.remove('is-copied'); void b.offsetWidth; b.classList.add('is-copied');
    }));
  }

  function init() { initFaq(); initSwatches(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
