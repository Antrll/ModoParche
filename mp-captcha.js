/* =====================================================================
   ModoParche · mp-captcha.js
   Cloudflare Turnstile contra bots en registro, inicio de sesión,
   recuperar contraseña y reenviar confirmación.

   Cómo funciona:
   - Casi siempre es invisible. Solo si Cloudflare duda aparece un recuadro
     "Confirma que eres humano" junto al botón.
   - El token se manda a Supabase Auth (options.captchaToken) y Supabase lo
     verifica con la llave SECRETA, que vive solo en el panel de Supabase.

   Activarlo (en este orden):
   1. Cloudflare > Turnstile > Add widget. Dominio: el de Vercel (y localhost
      para probar). Modo: Managed. Copia la Site Key aquí abajo.
   2. Supabase > Authentication > Attack Protection > Enable Captcha
      protection > Cloudflare Turnstile y pega la Secret Key.
   Si la llave de aquí está vacía, el captcha no se carga y todo sigue igual.
===================================================================== */
(function () {
  'use strict';

  var SITE_KEY = ''; // ← Site Key PÚBLICA de Turnstile (empieza por 0x4…). Nunca la Secret Key.

  var cargando = null;
  function cargar() {
    if (window.turnstile) return Promise.resolve();
    if (cargando) return cargando;
    cargando = new Promise(function (ok, falla) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { cargando = null; falla(new Error('CAPTCHA_NO_CARGA')); };
      document.head.appendChild(s);
    });
    return cargando;
  }

  // Un recuadro por formulario, justo antes del botón de enviar
  function cajaDe(form) {
    var caja = form.querySelector('.mp-captcha');
    if (caja) return caja;
    caja = document.createElement('div');
    caja.className = 'mp-captcha';
    var boton = form.querySelector('[type="submit"]') || form.querySelector('.btn');
    // En filas de botones (registro por pasos, recuperar clave) va encima de la fila
    var antes = boton && (boton.closest('.wz-actions, .forgot-row') || boton);
    if (antes && antes.parentNode) antes.parentNode.insertBefore(caja, antes);
    else form.appendChild(caja);
    return caja;
  }

  var widgets = new WeakMap();

  /**
   * Devuelve un token de un solo uso, o undefined si el captcha no está activo.
   * Rechaza con CAPTCHA_* si Cloudflare no lo pudo verificar.
   */
  function token(form) {
    if (!SITE_KEY || !form) return Promise.resolve(undefined);
    return cargar().then(function () {
      return new Promise(function (ok, falla) {
        var caja = cajaDe(form);
        var w = widgets.get(form);
        var reloj = setTimeout(function () { falla(new Error('CAPTCHA_TIEMPO')); }, 90000);
        var listo = function (fn, v) { clearTimeout(reloj); fn(v); };
        if (!w) {
          w = {};
          widgets.set(form, w);
          w.id = window.turnstile.render(caja, {
            sitekey: SITE_KEY,
            execution: 'execute',          // se pide solo al enviar
            appearance: 'interaction-only', // invisible salvo que haga falta
            language: 'es',
            theme: document.documentElement.classList.contains('is-dark') ? 'dark' : 'light',
            action: form.id || 'form',
            callback: function (t) { if (w.ok) w.ok(t); },
            'error-callback': function () { if (w.err) w.err(new Error('CAPTCHA_ERROR')); return true; },
            'expired-callback': function () { window.turnstile.reset(w.id); },
          });
        } else {
          window.turnstile.reset(w.id); // los tokens sirven una sola vez
        }
        w.ok = function (t) { listo(ok, t); };
        w.err = function (e) { listo(falla, e); };
        window.turnstile.execute(w.id);
      });
    });
  }

  function mensaje(err) {
    var m = String((err && err.message) || err || '');
    if (/CAPTCHA_NO_CARGA/.test(m)) return ['No cargó la verificación', 'Revisa tu conexión o desactiva el bloqueador de anuncios para este sitio y vuelve a intentar.'];
    if (/CAPTCHA_TIEMPO/.test(m)) return ['La verificación tardó mucho', 'Vuelve a tocar el botón.'];
    return ['No pudimos confirmar que eres una persona', 'Vuelve a intentar. Si sigue pasando, recarga la página.'];
  }

  window.MPCaptcha = { activo: function () { return !!SITE_KEY; }, token: token, mensaje: mensaje };
})();
