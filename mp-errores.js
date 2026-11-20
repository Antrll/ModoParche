/* =====================================================================
   ModoParche · mp-errores.js
   Monitoreo de errores en producción, sin terceros: cuando algo falla en
   el navegador de alguien, se guarda en la tabla errores_cliente de
   Supabase y el equipo lo ve en el panel admin (Bitácora > Errores).

   - Máximo 5 reportes por visita y sin repetir el mismo error.
   - No manda datos personales: solo página, mensaje, archivo:línea y
     navegador. Las rutas con tokens (/seguro/, /p/) se recortan.
   - Ignora ruido conocido: extensiones del navegador, "Script error."
     de otros dominios y avisos de ResizeObserver.
   - Si falla el reporte, no pasa nada (nunca rompe la página).
===================================================================== */
(function () {
  'use strict';
  var URL_SB = 'https://quxqqxnowlwiahorifpy.supabase.co/rest/v1/errores_cliente';
  var LLAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1eHFxeG5vd2x3aWFob3JpZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MzMzMTIsImV4cCI6MjEwODIwOTMxMn0.rO4W027LLI5CR-wz753KFzyYiLAn-I-avLre7nbVoII'; // pública (anon)
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return; // en desarrollo no se reporta

  var enviados = 0, vistos = {};
  var RUIDO = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection|AbortError|The user aborted|Load failed|Failed to fetch|NetworkError/i;

  function pagina() { return location.pathname.replace(/\/(seguro|p)\/[^/]+/, '/$1/…').slice(0, 200); }

  function reportar(mensaje, detalle) {
    mensaje = String(mensaje || 'Error sin mensaje').slice(0, 500);
    if (RUIDO.test(mensaje) || RUIDO.test(detalle || '')) return;
    if (enviados >= 5 || vistos[mensaje]) return;
    vistos[mensaje] = 1; enviados++;
    try {
      var cuerpo = JSON.stringify({ pagina: pagina(), mensaje: mensaje, detalle: String(detalle || '').slice(0, 2000) || null, navegador: navigator.userAgent.slice(0, 300) });
      fetch(URL_SB, {
        method: 'POST', keepalive: true,
        headers: { apikey: LLAVE, Authorization: 'Bearer ' + LLAVE, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: cuerpo,
      }).catch(function () { /* sin red: se pierde y ya */ });
    } catch (e) { /* nunca romper la página */ }
  }

  window.addEventListener('error', function (e) {
    if (!e) return;
    // Recursos que no cargan (imágenes, scripts) llegan sin message
    if (!e.message && e.target && e.target !== window) {
      var t = e.target, src = t.src || t.href || '';
      if (/\/src\/assets\//.test(src)) reportar('No cargó un recurso: ' + (t.tagName || '').toLowerCase(), src.replace(location.origin, ''));
      return;
    }
    var donde = e.filename ? e.filename.replace(location.origin, '') + ':' + e.lineno + ':' + e.colno : '';
    reportar(e.message, [donde, e.error && e.error.stack ? String(e.error.stack).split('\n').slice(0, 6).join('\n') : ''].filter(Boolean).join('\n'));
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var msg = r && (r.message || r.error_description) ? (r.message || r.error_description) : String(r);
    reportar('Promesa sin manejar: ' + msg, r && r.stack ? String(r.stack).split('\n').slice(0, 6).join('\n') : '');
  });

  /* ---------- Aviso de conexión ----------
     Si se cae el internet, una barra lo dice (así nadie cree que la app se
     dañó) y avisa cuando vuelve. Estilos en línea: no depende de ningún CSS. */
  var barra = null, ocultar = 0;
  function aviso(sinRed) {
    if (!document.body) return;
    if (!barra) {
      barra = document.createElement('div');
      barra.setAttribute('role', 'status');
      barra.setAttribute('aria-live', 'polite');
      barra.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));z-index:99999;transform:translate(-50%,140%);'
        + 'max-width:calc(100vw - 32px);padding:11px 18px;border-radius:999px;font:600 14px/1.35 Inter,system-ui,sans-serif;'
        + 'box-shadow:0 10px 30px -12px rgba(0,0,0,.6);transition:transform .35s cubic-bezier(.23,1,.32,1);pointer-events:none;text-align:center;';
      document.body.appendChild(barra);
    }
    clearTimeout(ocultar);
    barra.style.background = sinRed ? '#111' : '#0e6f31';
    barra.style.color = '#fff';
    barra.textContent = sinRed ? 'Sin conexión. Lo que hagas se guarda cuando vuelva el internet.' : 'Volvió la conexión.';
    requestAnimationFrame(function () { barra.style.transform = 'translate(-50%,0)'; });
    if (!sinRed) ocultar = setTimeout(function () { barra.style.transform = 'translate(-50%,140%)'; }, 2600);
  }
  window.addEventListener('offline', function () { aviso(true); });
  window.addEventListener('online', function () { aviso(false); });
  if (navigator.onLine === false) document.addEventListener('DOMContentLoaded', function () { aviso(true); });

  window.MPErrores = { reportar: reportar };
})();
