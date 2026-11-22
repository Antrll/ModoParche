/* =====================================================================
   ModoParche - mp-utils.js
   Utilidades que comparten los paneles de usuarios, negocios y admin.
===================================================================== */
(function () {
  'use strict';
  var nf = new Intl.NumberFormat('es-CO');
  var MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAPA[c]; }); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function int(n) { return nf.format(Math.round(Number(n) || 0)); }
  function money(n) { return '$' + int(n); }

  /* ---------- Barra de aviso fija (versión nueva, sin conexión) ----------
     Una sola por id. Se cierra sola si se llama con texto vacío. */
  function barra(id, texto, boton, alTocar, doc) {
    doc = doc || document;
    var b = doc.getElementById(id);
    if (!texto) { if (b) b.remove(); return null; }
    if (!b) {
      b = doc.createElement('div');
      b.id = id; b.className = 'mp-barra'; b.setAttribute('role', 'status');
      doc.body.appendChild(b);
    }
    b.replaceChildren();
    var t = doc.createElement('span'); t.textContent = texto; b.appendChild(t);
    if (boton) {
      var btn = doc.createElement('button');
      btn.type = 'button'; btn.className = 'mp-barra-btn'; btn.textContent = boton;
      btn.addEventListener('click', function () { if (alTocar) alTocar(btn); });
      b.appendChild(btn);
    }
    return b;
  }

  /* ---------- Service worker con aviso de versión nueva ----------
     La versión nueva queda "esperando" (sw.js no la activa sola). Cuando hay
     una, se llama alHaberNueva(aplicar); aplicar() la activa y recarga una
     sola vez cuando ya tomó el control. Devuelve la promesa del registro. */
  function registrarSW(opciones, nav, win) {
    opciones = opciones || {};
    nav = nav || (typeof navigator !== 'undefined' ? navigator : null);
    win = win || (typeof window !== 'undefined' ? window : null);
    var sw = nav && nav.serviceWorker;
    var seguro = win && win.location && (win.location.protocol === 'https:' || ['localhost', '127.0.0.1'].indexOf(win.location.hostname) >= 0);
    if (!sw || !seguro) return Promise.resolve(null);
    var habiaControl = !!sw.controller, recargando = false, avisado = false;
    sw.addEventListener('controllerchange', function () {
      // La primera instalación también toma el control: ahí no se recarga nada
      if (!habiaControl || recargando) { habiaControl = true; return; }
      recargando = true;
      win.location.reload();
    });
    return sw.register(opciones.ruta || '/sw.js', { scope: '/' }).then(function (reg) {
      var avisar = function (w) {
        if (!w || avisado || !sw.controller) return;
        avisado = true;
        if (opciones.alHaberNueva) opciones.alHaberNueva(function () { w.postMessage({ tipo: 'ACTUALIZAR' }); });
      };
      if (reg.waiting) avisar(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed') avisar(w); });
      });
      // Revisa si hay versión nueva al volver a la app
      if (win.document && win.document.addEventListener) {
        win.document.addEventListener('visibilitychange', function () {
          if (win.document.visibilityState === 'visible' && reg.update) reg.update().catch(function () {});
        });
      }
      return reg;
    });
  }

  /* ---------- Cola de cambios hechos sin conexión ----------
     Guarda la última acción por clave (p. ej. parche+persona): si marcan la
     llegada y luego la deshacen sin señal, solo se envía lo último. */
  function colaAgregar(cola, item) {
    var lista = Array.isArray(cola) ? cola.filter(function (x) { return x && x.clave !== item.clave; }) : [];
    lista.push(item);
    return lista.slice(-500);
  }

  window.MPUtil = { esc: esc, norm: norm, int: int, money: money, barra: barra, registrarSW: registrarSW, colaAgregar: colaAgregar };
})();
