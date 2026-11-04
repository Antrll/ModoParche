/* =====================================================================
   ModoParche · legal.js
   1. Datos legales en UN solo lugar. Cambia aquí los campos "POR
      COMPLETAR" y se actualizan en todas las páginas (términos,
      privacidad, pie de página, pagos…).
   2. Aviso de cookies (solo informa: el sitio no usa cookies de
      publicidad ni de rastreo).
===================================================================== */
(function () {
  'use strict';

  var LEGAL = {
    marca: 'ModoParche',
    // ---------- Responsable ----------
    responsable: 'Modo Parche - Proyecto Académico Universitario',
    tipoPersona: 'Persona natural · prototipo estudiantil universitario sin ánimo de lucro (no es una sociedad comercial ni una S.A.S.)',
    // Las cédulas de los integrantes no se publican en el sitio (protección de datos personales)
    documento: 'Proyecto académico sin NIT (no es una empresa constituida)',
    direccion: 'Carrera 22 con Calle 1a, Vía Puerto López, Campus Aguas Claras',
    telefono: '311 236 3903 · 321 388 0771',
    representante: 'No aplica: opera como persona natural con fines estrictamente académicos',
    pasarela: 'Wompi (Bancolombia), en modo de pruebas: no se cobra dinero real',
    // ---------- ya definidos ----------
    ciudad: 'Villavicencio, Meta, Colombia',
    correo: 'modoparcheoficial@gmail.com',
    correoDatos: 'modoparcheoficial@gmail.com',
    instagram: '@modoparcheoficial',
    sitio: 'modoparche-hazel.vercel.app',
    version: '1.0',
    vigencia: '30 de octubre de 2026',
    edadMinima: '18',
  };
  window.MP_LEGAL = LEGAL;

  function fill() {
    document.querySelectorAll('[data-legal]').forEach(function (el) {
      var v = LEGAL[el.getAttribute('data-legal')];
      if (v == null) return;
      el.textContent = v;
      var pend = /^POR COMPLETAR/.test(v);
      el.classList.toggle('por-completar', pend);
      if (pend) el.setAttribute('title', 'Falta este dato: se cambia en legal.js');
      if (el.tagName === 'A' && el.hasAttribute('data-legal-mail')) el.href = 'mailto:' + v;
    });
  }

  // ---------- Aviso de cookies ----------
  var KEY = 'mp_aviso_cookies_v1';
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } }
  function mark() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* sin almacenamiento */ } }
  function banner() {
    if (seen() || document.body.hasAttribute('data-sin-aviso-cookies')) return;
    var base = document.body.getAttribute('data-raiz') || '';
    var box = document.createElement('section');
    box.className = 'mp-cookies';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Aviso de cookies');
    box.innerHTML =
      '<p><b>Sin rastreo.</b> Solo guardamos en tu navegador lo necesario para que inicies sesión y el sitio funcione. ' +
      'No usamos cookies de publicidad ni de analítica. <a href="' + base + 'cookies.html">Ver detalles</a></p>' +
      '<button type="button" class="mp-cookies-ok">Entendido</button>';
    document.body.appendChild(box);
    requestAnimationFrame(function () { box.classList.add('is-in'); });
    box.querySelector('button').addEventListener('click', function () {
      mark(); box.classList.remove('is-in'); box.classList.add('is-out');
      setTimeout(function () { box.remove(); }, 400);
    });
  }

  // Índice de los documentos legales: marca la sección que estás leyendo
  function toc() {
    var links = document.querySelectorAll('.legal-toc a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('is-on'); a.removeAttribute('aria-current'); });
        var a = byId[e.target.id];
        if (a) { a.classList.add('is-on'); a.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.legal-doc > section[id]').forEach(function (s) { io.observe(s); });
  }

  function init() { fill(); banner(); toc(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
