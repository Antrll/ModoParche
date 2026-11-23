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
    sitio: 'modoparche.vercel.app',
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
      'No usamos cookies de publicidad; medimos visitas de forma agregada y sin cookies. <a href="' + base + 'cookies.html">Ver detalles</a></p>' +
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

  // ---------- Consentimiento de mayoría de edad (+18) ----------
  var KEY_EDAD = 'mp_mayor18_v1';
  var RUTAS_SIN_EDAD = /^\/(dashboard|empresa-dashboard|admin|terminos|privacidad|cookies|pagos|legal|pitch|offline)(\.html|\/|$)/i;
  function esMayorConfirmado() { try { return localStorage.getItem(KEY_EDAD) === '1'; } catch (e) { return true; } }
  function guardarMayor() { try { localStorage.setItem(KEY_EDAD, '1'); } catch (e) { /* sin almacenamiento */ } }
  function avisoEdad() {
    if (esMayorConfirmado() || RUTAS_SIN_EDAD.test(location.pathname) || document.body.hasAttribute('data-sin-aviso-edad')) return;
    if (document.getElementById('mp-edad')) return;
    var base = document.body.getAttribute('data-raiz') || '';
    var capa = document.createElement('div');
    capa.id = 'mp-edad';
    capa.className = 'mp-edad';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-labelledby', 'mp-edad-titulo');
    capa.innerHTML =
      '<svg class="mp-edad-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
        '<filter id="mp-edad-goo">' +
          '<feGaussianBlur in="SourceGraphic" stdDeviation="4.6" result="blur"/>' +
          '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo"/>' +
          '<feComposite in="SourceGraphic" in2="goo" operator="atop"/>' +
        '</filter>' +
      '</defs></svg>' +
      '<div class="mp-edad-card">' +
        '<div class="mp-edad-top">' +
          '<span class="mp-edad-logo" aria-hidden="true">' +
            '<span class="mp-edad-tinta mp-edad-tinta--logo"><i></i><i></i><i></i><i></i></span>' +
            '<img src="' + base + 'src/assets/web/isotipo-light-96.png" alt="" width="40" height="40">' +
          '</span>' +
          '<span class="mp-edad-badge">' +
            '<span class="mp-edad-tinta mp-edad-tinta--badge" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
            '<b>+18</b>' +
          '</span>' +
        '</div>' +
        '<div class="mp-edad-body" id="mp-edad-paso-1">' +
          '<p class="mp-edad-kicker">Acceso responsable · Villavicencio</p>' +
          '<h2 class="mp-edad-title" id="mp-edad-titulo">Solo para mayores de 18</h2>' +
          '<p class="mp-edad-desc">ModoParche conecta personas en planes presenciales, bares y eventos locales. Confirma que eres mayor de edad para continuar.</p>' +
          '<div class="mp-edad-acts">' +
            '<button type="button" class="mp-edad-ok" id="mp-edad-si">' +
              '<span class="mp-edad-tinta mp-edad-tinta--btn" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
              '<span class="mp-edad-ok-txt">Tengo más de 18 años</span>' +
            '</button>' +
            '<button type="button" class="mp-edad-no" id="mp-edad-no">Soy menor de 18 años</button>' +
          '</div>' +
          '<p class="mp-edad-foot">Al entrar aceptas nuestros <a href="' + base + 'terminos.html">Términos</a> y <a href="' + base + 'privacidad.html">Privacidad</a>.</p>' +
        '</div>' +
        '<div class="mp-edad-body" id="mp-edad-paso-2" hidden>' +
          '<p class="mp-edad-kicker">Acceso restringido</p>' +
          '<h2 class="mp-edad-title">Te esperamos cuando cumplas 18</h2>' +
          '<p class="mp-edad-desc">Por seguridad y normativa local, ModoParche es exclusivo para personas mayores de edad.</p>' +
          '<div class="mp-edad-acts">' +
            '<a class="mp-edad-ok" href="https://www.google.com">' +
              '<span class="mp-edad-tinta mp-edad-tinta--btn" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
              '<span class="mp-edad-ok-txt">Salir del sitio</span>' +
            '</a>' +
            '<button type="button" class="mp-edad-no" id="mp-edad-volver">Me equivoqué, volver</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.classList.add('mp-edad-abierto');
    document.body.appendChild(capa);
    requestAnimationFrame(function () {
      capa.classList.add('is-in');
      var ok = document.getElementById('mp-edad-si');
      if (ok) ok.focus({ preventScroll: true });
    });
    document.getElementById('mp-edad-si').addEventListener('click', function () {
      guardarMayor();
      capa.classList.remove('is-in');
      capa.classList.add('is-out');
      document.documentElement.classList.remove('mp-edad-abierto');
      setTimeout(function () { capa.remove(); }, 380);
    });
    document.getElementById('mp-edad-no').addEventListener('click', function () {
      document.getElementById('mp-edad-paso-1').hidden = true;
      document.getElementById('mp-edad-paso-2').hidden = false;
    });
    document.getElementById('mp-edad-volver').addEventListener('click', function () {
      document.getElementById('mp-edad-paso-2').hidden = true;
      document.getElementById('mp-edad-paso-1').hidden = false;
    });
  }

  function init() { fill(); avisoEdad(); banner(); toc(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
