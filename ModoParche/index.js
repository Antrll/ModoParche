/* =====================================================================
   ModoParche - index.js
   1. Radar interactivo (carga, filtro en vivo, estado vacío, apartar cupo)
   2. Acordeón de etapas ("Cómo funciona")
   3. Pestañas ("Un parche para cada quien")
   4. Visor de campaña (con estado de carga y teclado)
===================================================================== */
(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ------------------------------------------------------------------
     1. RADAR EN VIVO (muestra interactiva de Villavicencio)
  ------------------------------------------------------------------ */
  const PLANS = [
    {
      id: 'cafe-centauros',
      title: 'Cata de café de origen y charla',
      place: 'Los Centauros',
      when: 'hoy',
      whenLabel: 'Hoy · 5:00 p. m.',
      price: 25000,
      priceLabel: '$25.000',
      cat: 'Comida',
      spots: 3,
      baseMatch: 94
    },
    {
      id: 'kirpas-amanecer',
      title: 'Caminata y avistamiento al amanecer',
      place: 'Kirpas Ecoparque',
      when: 'finde',
      whenLabel: 'Sáb · 6:00 a. m.',
      price: 0,
      priceLabel: 'Gratis',
      cat: 'Aventura',
      spots: 5,
      baseMatch: 91
    },
    {
      id: 'salsa-grama',
      title: 'Vinilos y salsa brava en terraza',
      place: 'La Grama',
      when: 'hoy',
      whenLabel: 'Hoy · 8:30 p. m.',
      price: 20000,
      priceLabel: '$20.000',
      cat: 'Rumba',
      spots: 2,
      baseMatch: 92
    },
    {
      id: 'futbol-siete',
      title: 'Cotejo 5 vs 5 sintética nocturna',
      place: 'Siete de Agosto',
      when: 'hoy',
      whenLabel: 'Hoy · 7:00 p. m.',
      price: 15000,
      priceLabel: '$15.000',
      cat: 'Deporte',
      spots: 2,
      baseMatch: 88
    },
    {
      id: 'cristo-rey',
      title: 'Subida a Cristo Rey + pola fría al bajar',
      place: 'Centro · Mirador',
      when: 'finde',
      whenLabel: 'Dom · 4:30 p. m.',
      price: 12000,
      priceLabel: '$12.000',
      cat: 'Aventura',
      spots: 6,
      baseMatch: 89
    },
    {
      id: 'burger-barzal',
      title: 'Ruta de hamburguesas artesanales (2x1)',
      place: 'El Barzal',
      when: 'finde',
      whenLabel: 'Vie · 7:30 p. m.',
      price: 38000,
      priceLabel: '$38.000',
      cat: 'Comida',
      spots: 4,
      baseMatch: 90
    },
    {
      id: 'cine-fundadores',
      title: 'Cine al aire libre y conversatorio',
      place: 'Parque Los Fundadores',
      when: 'finde',
      whenLabel: 'Sáb · 6:30 p. m.',
      price: 0,
      priceLabel: 'Gratis',
      cat: 'Cultura',
      spots: 9,
      baseMatch: 86
    },
    {
      id: 'smash-primavera',
      title: 'Torneo relámpago de Mario Kart y Smash',
      place: 'La Primavera',
      when: 'hoy',
      whenLabel: 'Hoy · 6:00 p. m.',
      price: 18000,
      priceLabel: '$18.000',
      cat: 'Gaming',
      spots: 3,
      baseMatch: 87
    },
    {
      id: 'perreo-caudal',
      title: 'Noche de clásicos y reggaetón viejo',
      place: 'Caudal Oriental',
      when: 'finde',
      whenLabel: 'Sáb · 9:30 p. m.',
      price: 45000,
      priceLabel: '$45.000',
      cat: 'Rumba',
      spots: 4,
      baseMatch: 85
    }
  ];

  function initRadar() {
    const form  = $('#radarFilters');
    const list  = $('#radarList');
    const empty = $('#radarEmpty');
    const count = $('#radarCount');
    const label = $('#radarCountLabel');
    const reset = $('#radarReset');
    if (!form || !list || !empty) return;

    const joined = new Set();
    let timer = null;

    function readFilters() {
      const cats = $$('input[name="cat"]:checked', form).map(i => i.value);
      const budget = Number(($('input[name="budget"]:checked', form) || {}).value ?? 999999);
      const when = ($('input[name="when"]:checked', form) || {}).value || 'todo';
      return { cats, budget, when };
    }

    function showSkeleton() {
      list.setAttribute('aria-busy', 'true');
      empty.hidden = true;
      list.hidden = false;
      list.innerHTML = [0, 1, 2].map(() => `
        <li class="plan-skel" aria-hidden="true">
          <span class="skeleton s-circle"></span>
          <div class="s-lines">
            <span class="skeleton s-line-1"></span>
            <span class="skeleton s-line-2"></span>
          </div>
        </li>
      `).join('');
    }

    function render(immediate) {
      clearTimeout(timer);
      const run = () => {
        const { cats, budget, when } = readFilters();
        const matches = PLANS
          .filter(p => cats.includes(p.cat))
          .filter(p => p.price <= budget)
          .filter(p => when === 'todo' || p.when === when)
          .map(p => {
            const bonus = (p.price === 0 ? 2 : 0) + (when !== 'todo' && p.when === when ? 3 : 0);
            return { ...p, match: Math.min(99, p.baseMatch + bonus) };
          })
          .sort((a, b) => b.match - a.match);

        list.setAttribute('aria-busy', 'false');
        count.textContent = String(matches.length);
        label.textContent = matches.length === 1 ? 'parche para ti' : 'parches para ti';

        if (!matches.length) {
          list.innerHTML = '';
          list.hidden = true;
          empty.hidden = false;
          return;
        }

        empty.hidden = true;
        list.hidden = false;
        list.innerHTML = matches.slice(0, 4).map(p => {
          const isJoined = joined.has(p.id);
          const spotsLeft = isJoined ? Math.max(1, p.spots - 1) : p.spots;
          return `
            <li class="plan">
              <div class="plan-match"><b>${p.match}%</b><span>match</span></div>
              <div class="plan-body">
                <div class="plan-top">
                  <span class="plan-cat">${p.cat}</span>
                  <span class="plan-spots">Quedan ${spotsLeft} cupos</span>
                </div>
                <h3 class="plan-title">${p.title}</h3>
                <p class="plan-meta">${p.place} · ${p.whenLabel} · ${p.priceLabel}</p>
              </div>
              <button type="button" class="plan-join ${isJoined ? 'is-joined' : ''}" data-plan="${p.id}" aria-pressed="${isJoined}">
                ${isJoined ? 'Cupo apartado' : 'Me sumo'}
              </button>
            </li>
          `;
        }).join('');
      };

      if (immediate || (window.MP && window.MP.reduceMotion)) {
        run();
      } else {
        showSkeleton();
        timer = setTimeout(run, 210);
      }
    }

    form.addEventListener('change', () => render(false));

    list.addEventListener('click', e => {
      const btn = e.target.closest('[data-plan]');
      if (!btn) return;
      const id = btn.dataset.plan;
      if (joined.has(id)) joined.delete(id);
      else joined.add(id);
      render(true);
    });

    if (reset) {
      reset.addEventListener('click', () => {
        $$('input[name="cat"]', form).forEach((c, i) => { c.checked = i < 3; });
        const b = $('input[name="budget"][value="50000"]', form);
        if (b) b.checked = true;
        const w = $('input[name="when"][value="todo"]', form);
        if (w) w.checked = true;
        render(false);
      });
    }

    render(true);
  }

  /* ------------------------------------------------------------------
     2. ACORDEÓN DE ETAPAS ("Cómo funciona")
  ------------------------------------------------------------------ */
  function initStages() {
    const wrap = $('#stages');
    if (!wrap) return;
    const stages = $$('.stage', wrap);

    function openStage(target) {
      stages.forEach(s => {
        const on = s === target;
        s.classList.toggle('is-open', on);
        const btn = $('.stage-tab', s);
        if (btn) btn.setAttribute('aria-expanded', String(on));
      });
    }

    stages.forEach(s => {
      const btn = $('.stage-tab', s);
      if (btn) btn.addEventListener('click', () => openStage(s));
      s.addEventListener('click', e => {
        if (!s.classList.contains('is-open') && !e.target.closest('a, button')) openStage(s);
      });
    });
  }

  /* ------------------------------------------------------------------
     3. PESTAÑAS ("Un parche para cada quien")
  ------------------------------------------------------------------ */
  function initTabs() {
    const tablist = $('#whoTabs');
    if (!tablist) return;
    const tabs = $$('[role="tab"]', tablist);

    function select(tab, focus) {
      tabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) {
          panel.hidden = !on;
          panel.classList.toggle('is-active', on);
        }
      });
      if (focus) tab.focus();
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', e => {
        let next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft')  next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') next = tabs[0];
        if (e.key === 'End')  next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
  }

  /* ------------------------------------------------------------------
     4. VISOR DE CAMPAÑA (Lightbox)
  ------------------------------------------------------------------ */
  function initLightbox() {
    const wrap = $('#prints');
    const box  = $('#lightbox');
    if (!wrap || !box) return;

    const frame = $('.lb-frame', box);
    const lbImg = $('#lbImg');
    const lbCap = $('#lbCap');
    const lbCount = $('#lbCount');
    const items = $$('.print', wrap);
    let index = 0;
    let lastFocus = null;

    function show(i) {
      index = (i + items.length) % items.length;
      const fig = items[index];
      const img = $('img', fig);
      const src = img.currentSrc || img.src;
      frame.classList.add('is-loading');
      lbImg.onload = () => frame.classList.remove('is-loading');
      lbImg.onerror = () => frame.classList.remove('is-loading');
      lbImg.src = src;
      lbImg.alt = img.alt;
      lbCap.textContent = $('figcaption', fig)?.textContent || '';
      lbCount.textContent = `${index + 1} / ${items.length}`;
    }

    function open(i) {
      lastFocus = document.activeElement;
      show(i);
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      $('#lbClose')?.focus();
    }

    function close() {
      box.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }

    items.forEach((fig, i) => {
      $('.print-btn', fig)?.addEventListener('click', () => open(i));
    });

    $('#lbClose')?.addEventListener('click', close);
    $('#lbPrev')?.addEventListener('click', () => show(index - 1));
    $('#lbNext')?.addEventListener('click', () => show(index + 1));
    box.addEventListener('click', e => { if (e.target === box) close(); });

    document.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'Tab') {
        const focusables = $$('button', box);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function init() {
    initRadar();
    initStages();
    initTabs();
    initLightbox();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
