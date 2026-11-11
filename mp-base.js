/* =====================================================================
   ModoParche - mp-base.js
   Comportamiento compartido: navegación, menú móvil, entradas,
   imágenes con estado de carga, contraseñas, formularios y "volver arriba".
===================================================================== */
(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.add('mp-js');

  /* ---------- Navegación: cambia de color al hacer scroll ---------- */
  function initNav() {
    const nav = $('.nav');
    if (!nav) return;
    let ticking = false;
    const update = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 24);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ---------- Menú móvil ---------- */
  function initMenu() {
    const burger = $('.nav-burger');
    const menu = $('#mobileMenu');
    if (!burger || !menu) return;

    const setOpen = open => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('menu-open', open);
      if (open) { const first = $('a', menu); if (first) setTimeout(() => first.focus(), 250); }
    };

    burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 1140) setOpen(false); });
  }

  /* ---------- Entradas al hacer scroll ---------- */
  function initReveal() {
    // Escalonado dentro de cada grupo
    $$('[data-reveal-group]').forEach(group => {
      const step = Number(group.dataset.revealGroup) || 80;
      $$('[data-reveal]', group).forEach((el, i) => el.style.setProperty('--d', (i * step) + 'ms'));
    });
    $$('.line-mask').forEach(mask => {
      const parent = mask.parentElement;
      const siblings = $$('.line-mask', parent);
      const i = siblings.indexOf(mask);
      if (!mask.style.getPropertyValue('--d')) mask.querySelector('span')?.style.setProperty('--d', (i * 110) + 'ms');
    });

    const targets = $$('[data-reveal], [data-reveal-lines]');
    if (!targets.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(t => t.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach(t => io.observe(t));

    // Red de seguridad: nada se queda escondido
    window.addEventListener('load', () => {
      setTimeout(() => targets.forEach(t => {
        const r = t.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) t.classList.add('is-in');
      }), 1200);
    });
  }

  /* ---------- Imágenes con estado de carga y de error ---------- */
  function initMedia() {
    $$('.media img').forEach(img => {
      const box = img.closest('.media');
      const done = () => box.classList.add('is-loaded');
      const fail = () => { box.classList.add('is-error'); if (!box.dataset.error) box.dataset.error = 'No pudimos cargar esta imagen'; };
      if (img.complete && img.naturalWidth) done();
      else if (img.complete && !img.naturalWidth && img.currentSrc) fail();
      else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', fail, { once: true }); }
    });
  }

  /* ---------- Volver arriba ---------- */
  function initTop() {
    const btn = $('.to-top');
    const go = () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    $$('[data-to-top]').forEach(b => b.addEventListener('click', go));
    if (!btn) return;
    let ticking = false;
    const update = () => { btn.classList.toggle('is-visible', window.scrollY > 700); ticking = false; };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    btn.addEventListener('click', go);
    update();
  }

  /* ---------- Mostrar / ocultar contraseña ---------- */
  // Un par de ojos: cerrados (párpados naranja) mientras la clave está oculta,
  // se abren con un parpadeo al mostrarla y las pupilas siguen lo que escribes.
  function svgOjos() {
    const ojo = cx => `
      <g class="ojo-abierto">
        <circle class="ojo-blanco" cx="${cx}" cy="10" r="7"/>
        <g class="ojo-mira"><circle class="ojo-iris" cx="${cx}" cy="10" r="3.6"/><circle class="ojo-pupila" cx="${cx}" cy="10" r="1.9"/><circle class="ojo-brillo" cx="${cx + 1.3}" cy="8.6" r=".95"/></g>
      </g>
      <path class="ojo-cerrado" d="M${cx - 6} 9 q6 5.4 12 0 M${cx - 4.6} 11.6 l-1.4 2.2 M${cx} 12.6 v2.5 M${cx + 4.6} 11.6 l1.4 2.2"/>`;
    return `<svg class="ojos" viewBox="0 0 36 20" aria-hidden="true" focusable="false">${ojo(9)}${ojo(27)}</svg>`;
  }

  function initPasswords() {
    $$('.pass-toggle').forEach(btn => {
      const input = btn.parentElement.querySelector('input');
      if (!input) return;
      try { btn.innerHTML = svgOjos(); btn.classList.add('pass-toggle--ojos'); } catch (e) { /* deja el ícono que traía */ }

      // Las pupilas miran hacia donde va el cursor dentro del campo
      const mirar = () => {
        if (input.type === 'password') return;
        const largo = Math.max(1, input.value.length);
        const pos = typeof input.selectionStart === 'number' ? input.selectionStart : largo;
        const x = (Math.min(pos, 24) / 24) * 3.4 - 2.6; // de izquierda (-2.6) a derecha (+0.8)
        btn.style.setProperty('--mx', x.toFixed(2) + 'px');
      };
      ['input', 'keyup', 'click', 'focus'].forEach(ev => input.addEventListener(ev, mirar));
      input.addEventListener('blur', () => btn.style.setProperty('--mx', '0px'));

      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
        btn.classList.remove('is-parpadeo');
        if (show && !reduceMotion) { void btn.offsetWidth; btn.classList.add('is-parpadeo'); }
        if (show) mirar(); else btn.style.setProperty('--mx', '0px');
      });
    });
  }

  /* ---------- Campos que solo aceptan cierto tipo de caracteres ----------
     data-solo="numeros": cédula, celular, NIT (quita puntos, espacios, letras;
     sirve al pegar "1.121.234.567"). data-solo="letras": nombres (sin números
     ni símbolos raros). Si se quitó algo, se avisa un momento bajo el campo. */
  const FILTROS = {
    numeros: { re: /\D+/g, aviso: 'Solo números, sin puntos ni espacios.' },
    letras: { re: /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+/g, aviso: 'Solo letras y espacios.' },
    usuario: { re: /[^A-Za-z0-9._@]+/g, aviso: 'Solo letras, números, punto y guion bajo.' },
    nit: { re: /[^0-9-]+/g, aviso: 'Solo números y el guion del dígito de verificación.' },
  };
  function initSoloCaracteres() {
    $$('input[data-solo]').forEach(input => {
      const f = FILTROS[input.dataset.solo];
      if (!f) return;
      let reloj = 0;
      const limpiar = () => {
        const antes = input.value;
        let v = antes.replace(f.re, '');
        if (input.dataset.solo === 'letras') v = v.replace(/ {2,}/g, ' ').replace(/^ +/, '');
        if (input.maxLength > 0) v = v.slice(0, input.maxLength);
        if (v === antes) return;
        const pos = Math.max(0, (input.selectionStart || v.length) - (antes.length - v.length));
        input.value = v;
        try { input.setSelectionRange(pos, pos); } catch (e) { /* tipo sin cursor */ }
        const field = fieldOf(input);
        if (!field) return;
        let nota = field.querySelector('.field-filtro');
        if (!nota) { nota = document.createElement('p'); nota.className = 'field-filtro'; nota.setAttribute('aria-live', 'polite'); field.appendChild(nota); }
        nota.textContent = f.aviso;
        clearTimeout(reloj); reloj = setTimeout(() => { nota.textContent = ''; }, 2200);
      };
      input.addEventListener('input', limpiar);
      input.addEventListener('blur', () => { if (input.dataset.solo === 'letras') input.value = input.value.trim(); });
    });
  }

  /* ---------- Errores en línea para formularios ---------- */
  function fieldOf(input) { return input.closest('.field'); }

  function validateField(input) {
    const field = fieldOf(input);
    if (!field) return input.checkValidity();
    const ok = input.checkValidity();
    field.classList.toggle('has-error', !ok);
    let msg = $('.field-error', field);
    if (!ok) {
      if (!msg) {
        msg = document.createElement('p');
        msg.className = 'field-error';
        msg.id = (input.id || input.name || 'f') + '-err';
        field.appendChild(msg);
      }
      msg.textContent = input.dataset.error || input.validationMessage;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', msg.id);
    } else {
      input.removeAttribute('aria-invalid');
    }
    return ok;
  }

  function validateWithin(scope) {
    const inputs = $$('input[required], select[required], textarea[required], input[pattern], input[type="email"]', scope);
    let firstBad = null;
    inputs.forEach(i => { if (!validateField(i) && !firstBad) firstBad = i; });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function initLiveValidation() {
    $$('form[data-validate]').forEach(form => {
      form.setAttribute('novalidate', '');
      $$('input, select, textarea', form).forEach(input => {
        input.addEventListener('blur', () => { if (input.value !== '' || fieldOf(input)?.classList.contains('has-error')) validateField(input); });
        input.addEventListener('input', () => { if (fieldOf(input)?.classList.contains('has-error')) validateField(input); });
      });
    });
  }

  /* Formularios sin backend (alianza, contacto): carga → éxito */
  function initDemoForms() {
    $$('form[data-demo-form]').forEach(form => {
      const btn = $('button[type="submit"]', form);
      const status = $('.status', form);
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (!validateWithin(form)) return;
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
        status && status.classList.remove('is-visible');
        setTimeout(() => {
          btn.classList.remove('is-loading');
          btn.removeAttribute('aria-busy');
          if (status) {
            $('.status-text', status).innerHTML = form.dataset.success || 'Listo.';
            status.classList.add('is-visible');
            status.focus({ preventScroll: true });
          }
          form.reset();
          $$('.field.has-error', form).forEach(f => f.classList.remove('has-error'));
        }, 1100);
      });
    });
  }

  /* ---------- Año en el footer ---------- */
  function initYear() { $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); }); }

  // API mínima para otras páginas
  window.MP = { validateField, validateWithin, reduceMotion };

  function init() {
    initNav();
    initMenu();
    initReveal();
    initMedia();
    initTop();
    initPasswords();
    initSoloCaracteres();
    initLiveValidation();
    initDemoForms();
    initYear();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
