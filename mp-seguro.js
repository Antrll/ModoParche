/* =====================================================================
   ModoParche - mp-seguro.js
   Ayudas de seguridad que usan varias páginas:
   - tipoCuenta(): qué es esta cuenta según la BASE (admins / negocios),
     nunca según los metadatos, que el propio usuario puede editar.
   - safeUrl(): deja pasar solo enlaces https o rutas del sitio.
   - celdaCSV(): evita que Excel ejecute una celda como fórmula.
===================================================================== */
(function () {
  'use strict';

  /* { tipo: 'admin' | 'negocio' | 'persona', rol } */
  function tipoCuenta(sb, user) {
    var respaldo = function () {
      // Base sin la migración de seguridad: mismo comportamiento de antes
      return Promise.resolve(sb.rpc('soy_admin')).then(function (r) {
        if (!r.error && r.data === true) return { tipo: 'admin', rol: null };
        return { tipo: user && user.user_metadata && user.user_metadata.tipo === 'empresa' ? 'negocio' : 'persona', rol: null };
      }).catch(function () {
        return { tipo: user && user.user_metadata && user.user_metadata.tipo === 'empresa' ? 'negocio' : 'persona', rol: null };
      });
    };
    if (!sb) return Promise.resolve({ tipo: 'persona', rol: null });
    return Promise.resolve(sb.rpc('mi_tipo_cuenta')).then(function (r) {
      if (r.error || !r.data || !r.data.tipo) return respaldo();
      return r.data;
    }).catch(respaldo);
  }

  function safeUrl(u, opciones) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return '';
    if (opciones && opciones.imagen && /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(s)) return s;
    if (/^blob:/i.test(s) && opciones && opciones.imagen) return s;
    if (/^\/(?!\/)/.test(s) || /^src\/assets\//.test(s)) return s;
    try {
      var x = new URL(s);
      return x.protocol === 'https:' && !x.username && !x.password ? x.href : '';
    } catch (e) { return ''; }
  }

  /* Excel ejecuta celdas que empiezan por = + - @ tab o enter. Los números reales no se tocan. */
  function celdaCSV(v, separador) {
    if (typeof v === 'number') return String(v);
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return new RegExp('["\\r\\n' + (separador || ';') + ']').test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  window.MPSeguro = { tipoCuenta: tipoCuenta, safeUrl: safeUrl, celdaCSV: celdaCSV };
})();
