/* =====================================================================
   ModoParche · mp-checkin.js
   Verificar que el parche sí se hizo, sin gastar servidor:

   - QR de llegada del organizador: el código cambia cada 30 segundos y se
     calcula en su celular (SHA-256 del secreto del parche + la ventana de
     tiempo). Un pantallazo enviado por WhatsApp deja de servir enseguida.
     Se dibuja con qrcode-generator (misma librería que ya usa el panel de
     negocios).
   - Escáner del asistente: html5-qrcode abre la cámara del celular. El
     servidor solo recibe una línea: "el usuario X escaneó el parche Y"
     (función checkin_qr de Supabase).

   Las librerías se cargan solo cuando se necesitan.
===================================================================== */
(function () {
  'use strict';

  var LIB_QR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  var LIB_SCAN = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  var PREFIJO = 'MPCHK';
  var PASO = 30; // segundos

  var cargas = {};
  function cargar(src, listo) {
    if (listo()) return Promise.resolve();
    if (!cargas[src]) {
      cargas[src] = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = src; s.async = true; s.crossOrigin = 'anonymous';
        s.onload = function () { listo() ? res() : rej(new Error('La librería no cargó')); };
        s.onerror = function () { delete cargas[src]; rej(new Error('Sin conexión para cargar la librería')); };
        document.head.appendChild(s);
      });
    }
    return cargas[src];
  }

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  // Mismo cálculo que private.codigo_checkin() en la base de datos
  function codigo(secreto, ventana) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('Este navegador no puede generar el QR (necesita HTTPS).'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(secreto + ':' + ventana))
      .then(function (h) { return hex(h).slice(0, 10); });
  }

  function texto(parcheId, cod) { return PREFIJO + '|' + parcheId + '|' + cod; }
  function parsear(raw) {
    var t = String(raw || '').trim();
    var m = /^MPCHK\|([0-9a-f-]{36}|[a-z0-9]{3,40})\|([0-9a-f]{10})$/i.exec(t);
    return m ? { parcheId: m[1], codigo: m[2].toLowerCase() } : null;
  }

  function qrSVG(text) {
    var q = window.qrcode(0, 'M');
    q.addData(text); q.make();
    var n = q.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    // Margen blanco de 2 módulos para que cualquier cámara lo lea
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" role="img" aria-label="Código QR de llegada">'
      + '<rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#ffffff"/><path fill="#111111" d="' + d + '"/></svg>';
  }

  /* Muestra el QR que rota cada 30 s.
     opts.clave: { secreto, ahora } (de la función mi_clave_checkin)
     opts.qr: elemento donde va el QR; opts.cuenta: elemento con los segundos;
     opts.codigo: elemento que muestra el código corto para escribirlo a mano.
     Devuelve una función para detenerlo. */
  function mostrarQR(opts) {
    var desfase = opts.clave.ahora ? opts.clave.ahora - Date.now() : 0; // reloj del servidor
    var vivo = true, ventanaActual = null, timer = null;
    function tick() {
      if (!vivo) return;
      var ahora = Date.now() + desfase;
      var w = Math.floor(ahora / 1000 / PASO);
      var quedan = PASO - Math.floor((ahora / 1000) % PASO);
      if (opts.cuenta) opts.cuenta.textContent = quedan + ' s';
      if (opts.barra) opts.barra.style.transform = 'scaleX(' + (quedan / PASO) + ')';
      if (w !== ventanaActual) {
        ventanaActual = w;
        codigo(opts.clave.secreto, w).then(function (cod) {
          if (!vivo || w !== ventanaActual) return;
          opts.qr.innerHTML = qrSVG(texto(opts.parcheId, cod));
          if (opts.codigo) opts.codigo.textContent = cod.replace(/(.{5})/, '$1 ');
        }).catch(function (e) {
          opts.qr.innerHTML = '<p class="qr-err">' + (e.message || 'No pudimos generar el QR.') + '</p>';
        });
      }
      timer = setTimeout(tick, 1000);
    }
    return cargar(LIB_QR, function () { return typeof window.qrcode === 'function'; }).then(function () {
      tick();
      return function detener() { vivo = false; clearTimeout(timer); };
    });
  }

  /* Abre la cámara y avisa cuando lee un QR de llegada válido.
     Devuelve { detener } . onLeido({ parcheId, codigo }) */
  function escanear(elId, onLeido, onError) {
    var lector = null, parado = false, yaLeyo = false;
    var api = {
      detener: function () {
        parado = true;
        if (!lector) return Promise.resolve();
        var l = lector; lector = null;
        return l.stop().catch(function () { /* ya estaba detenido */ }).then(function () { try { l.clear(); } catch (e) { /* nada */ } });
      },
    };
    cargar(LIB_SCAN, function () { return typeof window.Html5Qrcode === 'function'; }).then(function () {
      if (parado) return;
      lector = new window.Html5Qrcode(elId, { verbose: false });
      return lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: function (w, h) { var s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } },
        function (raw) {
          if (yaLeyo) return;
          var r = parsear(raw);
          if (!r) { if (onError) onError(new Error('Ese QR no es de ModoParche.'), true); return; }
          yaLeyo = true;
          api.detener().then(function () { onLeido(r); });
        },
        function () { /* sin QR en este cuadro */ });
    }).catch(function (e) {
      var msg = /NotAllowed|Permission/i.test(String(e && (e.name || e.message || e)))
        ? 'Sin permiso de cámara. Actívalo en el candado del navegador o escribe el código.'
        : /NotFound|no camera/i.test(String(e && (e.name || e.message || e))) ? 'No encontramos una cámara. Escribe el código que ve el organizador.'
          : (e && e.message) || 'No pudimos abrir la cámara.';
      if (onError) onError(new Error(msg), false);
    });
    return api;
  }

  window.MPCheckin = { codigo: codigo, texto: texto, parsear: parsear, mostrarQR: mostrarQR, escanear: escanear, PASO: PASO };
})();
