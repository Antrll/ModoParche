/* =====================================================================
   ModoParche · mp-asistente.js
   Parce, el asistente virtual de los PANELES (personas y negocios). Habla
   con la Edge Function "asistente" con la sesión de la cuenta: la llave de
   Groq vive en Supabase y nunca llega al navegador. La conversación solo
   existe mientras la página esté abierta.
===================================================================== */
(function () {
  'use strict';
  var URL_IA = '/api/asistente';
  var URL_SB = (window.MP_SUPABASE && window.MP_SUPABASE.url) || 'https://quxqqxnowlwiahorifpy.supabase.co';
  var MAX = 500;
  var NEGOCIO = /^\/empresa-dashboard/.test(location.pathname);
  var SUGERENCIAS = NEGOCIO
    ? ['¿Cuánto me cobran por cliente?', '¿Cómo funciona el Modo Puerta?', '¿Cómo creo un cupón?', '¿Cómo pago mi estado de cuenta?']
    : ['¿Cómo abro un parche?', '¿Cómo verifico mi cédula?', '¿Cómo funcionan los cupones?', '¿Es seguro?'];
  var ERRORES = {
    DEMASIADOS: 'Vas muy rápido, parce. Espera unos minutos y me vuelves a preguntar.',
    OCUPADO: 'Estoy con mucha gente en este momento. Inténtalo en un ratico.',
    SIN_SESION: 'Tu sesión venció. Recarga la página o vuelve a entrar y seguimos.',
    SIN_CONFIGURAR: 'Todavía me están preparando. Mientras tanto, mira /preguntas o escríbenos a modoparcheoficial@gmail.com.',
    TIEMPO: 'Me demoré más de la cuenta pensando. Inténtalo otra vez.',
    SIN_MENSAJE: 'Escríbeme tu pregunta para poder ayudarte.',
    ORIGEN: 'Recarga la página para volver a hablar conmigo.',
  };
  var FALLO = 'Ahora no pude responder. Puedes mirar /preguntas o escribirnos a modoparcheoficial@gmail.com.';
  var ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>';
  var CERRAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var ENVIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  var historial = [], ocupado = false, raiz, panel, lista, campo, boton, sug;

  function burbuja(texto, quien) {
    var d = document.createElement('div');
    d.className = 'pa-msg pa-msg--' + quien;
    d.textContent = texto; // nunca como HTML: la respuesta viene de una IA
    lista.appendChild(d);
    lista.scrollTop = lista.scrollHeight;
    return d;
  }
  function escribiendo(on) {
    var t = lista.querySelector('.pa-escribe');
    if (!on) { if (t) t.remove(); return; }
    if (t) return;
    t = document.createElement('div');
    t.className = 'pa-msg pa-msg--bot pa-escribe';
    t.setAttribute('aria-label', 'Parce está escribiendo');
    t.innerHTML = '<i></i><i></i><i></i>';
    lista.appendChild(t);
    lista.scrollTop = lista.scrollHeight;
  }
  async function obtenerToken() {
    var t = window.MPErrores && window.MPErrores.tokenSesion ? window.MPErrores.tokenSesion(URL_SB) : null;
    if (t) return t;
    if (window.mpSupabase && window.mpSupabase.auth && window.mpSupabase.auth.getSession) {
      try {
        var r = await window.mpSupabase.auth.getSession();
        return r && r.data && r.data.session && r.data.session.access_token ? r.data.session.access_token : null;
      } catch (_e) { return null; }
    }
    return null;
  }
  async function preguntar(texto) {
    texto = String(texto || '').trim().slice(0, MAX);
    if (!texto || ocupado) return;
    ocupado = true; boton.disabled = true;
    if (sug) { sug.remove(); sug = null; }
    burbuja(texto, 'yo');
    historial.push({ rol: 'user', texto: texto });
    campo.value = '';
    escribiendo(true);
    var respuesta = '';
    try {
      // La sesión de la cuenta (la guarda supabase-js; mp-errores.js sabe leerla)
      var token = await obtenerToken();
      if (!token) throw new Error('SIN_CUENTA');
      var cab = { 'Content-Type': 'application/json' };
      if (token) cab.Authorization = 'Bearer ' + token;
      var r = await fetch(URL_IA, {
        method: 'POST', headers: cab,
        body: JSON.stringify({ panel: NEGOCIO ? 'negocio' : 'persona', mensajes: historial.slice(-8) }), signal: AbortSignal.timeout(20000),
      });
      var d = await r.json().catch(function () { return null; });
      if (d && d.ok && d.respuesta) { respuesta = d.respuesta; historial.push({ rol: 'assistant', texto: respuesta }); }
      else { historial.pop(); respuesta = (d && ERRORES[d.codigo]) || FALLO; }
    } catch (e) {
      historial.pop();
      respuesta = e && e.message === 'SIN_CUENTA' ? 'Respondo cuando entras con tu cuenta. En el panel de ejemplo no estoy activo.'
        : navigator.onLine === false ? 'Estás sin conexión. Cuando vuelva el internet seguimos.' : FALLO;
    }
    escribiendo(false);
    burbuja(respuesta, 'bot');
    ocupado = false; boton.disabled = false;
    if (panel.classList.contains('is-abierto') && matchMedia('(pointer: fine)').matches) campo.focus();
  }
  function abrir(on) {
    panel.hidden = false;
    raiz.classList.toggle('is-abierto', on);
    panel.classList.toggle('is-abierto', on);
    raiz.querySelector('.pa-fab').setAttribute('aria-expanded', String(on));
    raiz.querySelector('.pa-fab').setAttribute('aria-label', on ? 'Cerrar el asistente' : 'Abrir el asistente virtual');
    if (on) { if (matchMedia('(pointer: fine)').matches) setTimeout(function () { campo.focus(); }, 180); }
    else { setTimeout(function () { if (!panel.classList.contains('is-abierto')) panel.hidden = true; }, 240); raiz.querySelector('.pa-fab').focus({ preventScroll: true }); }
  }
  function iniciar() {
    if (document.getElementById('pa-asistente')) return;
    raiz = document.createElement('div');
    raiz.id = 'pa-asistente';
    raiz.className = 'pa' + (document.getElementById('toasts') || document.querySelector('.bottom-nav') ? ' pa--panel' : '');
    raiz.innerHTML =
      '<section class="pa-panel" role="dialog" aria-label="Parce, asistente virtual de ModoParche" hidden>' +
        '<header class="pa-head"><span class="pa-sello" aria-hidden="true">' + ICONO + '</span><div><b>Parce</b><small>Asistente con IA de ModoParche</small></div>' +
        '<button type="button" class="pa-x" aria-label="Cerrar el asistente">' + CERRAR + '</button></header>' +
        '<div class="pa-lista" role="log" aria-live="polite"></div>' +
        '<div class="pa-sug"></div>' +
        '<form class="pa-form" autocomplete="off"><label class="sr-only" for="pa-campo">Escribe tu pregunta</label>' +
        '<input id="pa-campo" maxlength="' + MAX + '" placeholder="Pregúntame lo que quieras"><button type="submit" aria-label="Enviar">' + ENVIAR + '</button></form>' +
        '<p class="pa-nota">Puede equivocarse. No escribas cédula, claves ni datos de pago.</p>' +
      '</section>' +
      '<button type="button" class="pa-fab" aria-expanded="false" aria-label="Abrir a Parce, asistente virtual">' + ICONO + '<span class="pa-fab-txt">Parce</span></button>';
    document.body.appendChild(raiz);
    panel = raiz.querySelector('.pa-panel'); lista = raiz.querySelector('.pa-lista');
    campo = raiz.querySelector('input'); boton = raiz.querySelector('.pa-form button'); sug = raiz.querySelector('.pa-sug');
    burbuja(NEGOCIO ? '¡Quiubo! Soy Parce. Te ayudo con tus parches, cupones, el Modo Puerta y los cobros.' : '¡Quiubo! Soy Parce. Te ayudo a armar planes, verificar tu cuenta y usar la app.', 'bot');
    SUGERENCIAS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = t;
      b.addEventListener('click', function () { preguntar(t); });
      sug.appendChild(b);
    });
    raiz.querySelector('.pa-fab').addEventListener('click', function () { abrir(!panel.classList.contains('is-abierto')); });
    raiz.querySelector('.pa-x').addEventListener('click', function () { abrir(false); });
    raiz.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); preguntar(campo.value); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('is-abierto')) abrir(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
