/* =====================================================================
   ModoParche · mp-verificacion.js
   Verificación de identidad con cédula colombiana (frente y respaldo).
   Costo $0: todo el trabajo pesado pasa en el navegador.

   1. comprimirImagen(): <canvas> + toBlob. Ancho máximo 1200 px (sin
      deformar), WebP (o JPEG si el navegador no tiene WebP), calidad 0.7
      como punto de partida y ajuste hasta quedar entre 80 KB y 100 KB.
      Nunca se sube la foto cruda de la cámara (3 a 6 MB).
   2. leerNumero(): saca el número de la cédula del respaldo.
        a) BarcodeDetector nativo (Chrome Android) para PDF417 y QR.
        b) ZXing-js por CDN (PDF417 de la cédula amarilla, QR de la digital).
        c) Tesseract.js (OCR) si el código no se deja leer: respaldo y,
           como último intento, el frente.
      El número leído se compara con la cédula que la persona digitó en su
      registro (perfiles_privados.cedula).
   3. Subida al bucket PRIVADO documentos_identidad en
      cedulas/{usuario_id}/ y llamada a verificar_mi_cedula(), que marca
      cedula_verificada = true.

   Uso:
     MPVerificacion.abrir({ sb, uid, cedula, demo, motivo, abrirModal, cerrarModal })
       -> Promise<boolean>  (true si quedó verificada)
===================================================================== */
(function () {
  'use strict';

  /* ---------- Librerías por CDN (solo se cargan cuando hacen falta) ---------- */
  var LIB_ZXING = '/src/vendor/zxing.min.js';
  // Tesseract.js 5.1.1 servido desde el propio sitio (copia exacta del paquete de npm)
  var LIB_TESSERACT = '/src/vendor/tesseract/tesseract.min.js';
  var WORKER_TESSERACT = '/src/vendor/tesseract/worker.min.js';
  var BUCKET = 'documentos_identidad';

  var cargas = {};
  function cargarScript(src, listo) {
    if (listo()) return Promise.resolve();
    if (!cargas[src]) {
      cargas[src] = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = src; s.async = true; s.crossOrigin = 'anonymous';
        s.onload = function () { listo() ? res() : rej(new Error('La librería no cargó')); };
        s.onerror = function () { delete cargas[src]; rej(new Error('Sin conexión para cargar el lector')); };
        document.head.appendChild(s);
      });
    }
    return cargas[src];
  }

  /* =====================================================================
     1. COMPRESIÓN EN EL NAVEGADOR
  ===================================================================== */
  var soportaWebp = (function () {
    try { return document.createElement('canvas').toDataURL('image/webp', 0.5).indexOf('data:image/webp') === 0; }
    catch (e) { return false; }
  })();

  // Abre la foto respetando la orientación EXIF (las fotos del celular vienen giradas)
  function abrirImagen(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return abrirConImg(file); });
    }
    return abrirConImg(file);
  }
  function abrirConImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('No pudimos abrir esa foto. Prueba con otra.')); };
      img.src = url;
    });
  }
  function lienzo(src, ancho) {
    var w = src.width, h = src.height, k = Math.min(1, ancho / w);
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff'; // fondo blanco por si la imagen trae transparencia (JPEG no la tiene)
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function aBlob(canvas, tipo, calidad) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) { b ? res(b) : rej(new Error('No pudimos comprimir la foto.')); }, tipo, calidad);
    });
  }

  /* Comprime una foto para subirla.
     opts: { maxAncho: 1200, minKB: 80, maxKB: 100, calidad: 0.7 }
     Devuelve { blob, tipo, ancho, alto, kb, lectura } donde "lectura" es un
     canvas más grande y sin pérdida para leer el código de barras. */
  function comprimirImagen(file, opts) {
    opts = opts || {};
    var maxAncho = opts.maxAncho || 1200, minB = (opts.minKB || 80) * 1024, maxB = (opts.maxKB || 100) * 1024;
    var tipo = soportaWebp ? 'image/webp' : 'image/jpeg';
    if (!file || !/^image\//.test(file.type || 'image/')) return Promise.reject(new Error('Ese archivo no es una foto.'));
    if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error('La foto pesa más de 25 MB. Prueba con otra.'));

    return abrirImagen(file).then(function (src) {
      var lectura = lienzo(src, 2400); // para el lector: más resolución para PDF417 densos, sin compresión
      var ancho = Math.min(maxAncho, src.width);

      // Busca la calidad que deja el archivo entre minKB y maxKB (búsqueda binaria)
      function probar(anchoActual, intento) {
        var c = lienzo(src, anchoActual);
        return aBlob(c, tipo, opts.calidad || 0.7).then(function (b) {
          if (b.size >= minB && b.size <= maxB) return { blob: b, c: c };
          var lo = 0.3, hi = 0.95, mejor = b.size <= maxB ? b : null, vueltas = 0;
          function paso() {
            if (vueltas++ >= 7) return Promise.resolve(mejor);
            var q = (lo + hi) / 2;
            return aBlob(c, tipo, q).then(function (bb) {
              if (bb.size > maxB) hi = q;
              else { lo = q; if (!mejor || bb.size > mejor.size) mejor = bb; if (bb.size >= minB) return mejor; }
              return paso();
            });
          }
          return paso().then(function (m) {
            if (m) return { blob: m, c: c };
            // Ni con calidad baja cabe en 100 KB: se reduce un poco el tamaño
            if (intento >= 6) return aBlob(c, tipo, 0.3).then(function (bb) { return { blob: bb, c: c }; });
            return probar(Math.round(anchoActual * 0.85), intento + 1);
          });
        });
      }
      return probar(ancho, 0).then(function (r) {
        if (src.close) try { src.close(); } catch (e) { /* nada */ }
        return { blob: r.blob, tipo: tipo, ancho: r.c.width, alto: r.c.height, kb: Math.round(r.blob.size / 1024), lectura: lectura, url: URL.createObjectURL(r.blob) };
      });
    });
  }

  /* =====================================================================
     2. LECTURA DEL NÚMERO DE CÉDULA
  ===================================================================== */
  var soloDigitos = function (s) { return String(s || '').replace(/\D/g, ''); };
  var sinCeros = function (s) { return soloDigitos(s).replace(/^0+/, ''); };

  /* Normaliza confusiones típicas de OCR solo dentro de bloques numéricos
     (por ejemplo "1.121.O00.456" o "I.121.000.4S6" -> "1121000456") sin
     alterar palabras normales como "COLOMBIA". */
  var MAPA_OCR = { O: '0', o: '0', Q: '0', D: '0', I: '1', i: '1', l: '1', '|': '1', Z: '2', z: '2', S: '5', s: '5', G: '6', B: '8' };
  function normalizarOcr(raw) {
    return String(raw || '').replace(/[0-9OoQDIil|ZzSsGB][0-9OoQDIil|ZzSsGB.\s,'’\-]{4,}/g, function (seg) {
      var digitos = (seg.match(/\d/g) || []).length;
      if (digitos < 4) return seg;
      return seg.replace(/[OoQDIil|ZzSsGB]/g, function (ch) { return MAPA_OCR[ch] || ch; });
    });
  }

  function buscarCedulaEnTexto(raw, ced) {
    if (sinCeros(raw.substring(48, 58)) === ced) return true;
    var unido = raw.replace(/(\d)[.\s,'’\-](?=\d)/g, '$1'); // 1.121.000.456 -> 1121000456
    var bloques = unido.match(/\d+/g) || [];
    return bloques.some(function (b) {
      var bb = b.replace(/^0+/, '');
      if (bb === ced) return true;
      if (ced.length >= 6 && bb.indexOf(ced) >= 0) return true; // MRZ con dígito verificador al final o prefijo
      return b.length > ced.length && b.length - ced.length <= 12 && b.slice(-ced.length) === ced;
    });
  }

  /* ¿El texto leído trae esta cédula?
     - Cédula amarilla (PDF417): el número va en las posiciones 48 a 58,
       relleno con ceros, y a veces pegado al código de la tarjeta.
     - Cédula digital (QR / zona MRZ): el número aparece suelto o seguido
       de un dígito verificador en la zona MRZ.
     - OCR del frente: "1.121.000.456" (con puntos, espacios o confusiones O/0, I/1). */
  function contieneCedula(texto, cedula) {
    var ced = sinCeros(cedula);
    if (ced.length < 5) return false;
    var raw = String(texto || '');
    if (buscarCedulaEnTexto(raw, ced)) return true;
    var norm = normalizarOcr(raw);
    return norm !== raw && buscarCedulaEnTexto(norm, ced);
  }

  /* ¿Un código leído parece realmente otra cédula (y no el QR cifrado/URL de
     la cédula digital)? Evita mostrar "El número no coincide" por error. */
  function pareceOtraCedula(texto) {
    var raw = String(texto || '').trim();
    if (!raw) return false;
    if (/^PubDSK/i.test(raw)) return true;
    var pos = sinCeros(raw.substring(48, 58));
    if (pos.length >= 6 && pos.length <= 10) return true;
    if (/^https?:\/\//i.test(raw)) return false;
    // Si es un payload largo en base64/hex (típico QR firmado), no asumir que es otra cédula
    if (raw.length > 60 && /^[A-Za-z0-9+/=_\-\s]+$/.test(raw)) return false;
    var bloques = raw.replace(/(\d)[.\s,'’\-](?=\d)/g, '$1').match(/\d+/g) || [];
    return bloques.some(function (b) {
      var bb = b.replace(/^0+/, '');
      return bb.length >= 7 && bb.length <= 10;
    });
  }

  // Variantes del canvas: girado, recortado y con contraste adaptable
  function rotado(c, grados) {
    var r = document.createElement('canvas');
    var gira = grados % 180 !== 0;
    r.width = gira ? c.height : c.width; r.height = gira ? c.width : c.height;
    var ctx = r.getContext('2d');
    ctx.translate(r.width / 2, r.height / 2);
    ctx.rotate(grados * Math.PI / 180);
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    return r;
  }
  function recortarCentro(c, fx, fy) {
    var r = document.createElement('canvas');
    var sw = Math.max(1, Math.round(c.width * fx));
    var sh = Math.max(1, Math.round(c.height * fy));
    var sx = Math.round((c.width - sw) / 2);
    var sy = Math.round((c.height - sh) / 2);
    r.width = sw; r.height = sh;
    r.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    return r;
  }
  // Recorta la franja inferior del respaldo (zona MRZ de la cédula digital, sin el QR encima)
  function recortarFranjaInferior(c, desde) {
    var r = document.createElement('canvas');
    var sy = Math.round(c.height * desde);
    var sh = Math.max(1, c.height - sy);
    r.width = c.width; r.height = sh;
    r.getContext('2d').drawImage(c, 0, sy, c.width, sh, 0, 0, c.width, sh);
    return r;
  }
  function grises(c, contraste) {
    var ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
    var g = new Uint8ClampedArray(c.width * c.height);
    for (var i = 0, j = 0; i < px.length; i += 4, j++) {
      var y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (contraste) y = Math.max(0, Math.min(255, (y - 128) * 1.6 + 128));
      g[j] = y;
    }
    return g;
  }
  // Auto-niveles (percentiles 5% y 95%): funciona bien con poca luz, reflejos y fondo amarillo
  function paraOCR(c) {
    var o = lienzo(c, 1800), ctx = o.getContext('2d');
    var d = ctx.getImageData(0, 0, o.width, o.height), px = d.data;
    var hist = new Uint32Array(256), total = o.width * o.height;
    var lum = new Uint8Array(total);
    for (var i = 0, j = 0; i < px.length; i += 4, j++) {
      var y = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
      lum[j] = y; hist[y]++;
    }
    var lowCut = total * 0.05, highCut = total * 0.95, acc = 0, lo = 0, hi = 255;
    for (var b = 0; b < 256; b++) { acc += hist[b]; if (acc >= lowCut) { lo = b; break; } }
    acc = 0;
    for (var b2 = 0; b2 < 256; b2++) { acc += hist[b2]; if (acc >= highCut) { hi = b2; break; } }
    var span = Math.max(30, hi - lo);
    for (var i2 = 0, j2 = 0; i2 < px.length; i2 += 4, j2++) {
      var v = Math.max(0, Math.min(255, Math.round(((lum[j2] - lo) * 255) / span)));
      px[i2] = px[i2 + 1] = px[i2 + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return o;
  }

  // a) Lector nativo del navegador (prueba 0°, 90° y 270° por si la foto salió vertical)
  function leerNativo(c) {
    if (!('BarcodeDetector' in window)) return Promise.resolve(null);
    return Promise.resolve(window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : ['pdf417', 'qr_code'])
      .then(function (fmts) {
        var quiero = ['pdf417', 'qr_code'].filter(function (f) { return fmts.indexOf(f) >= 0; });
        if (!quiero.length) return null;
        var det = new window.BarcodeDetector({ formats: quiero });
        var grados = [0, 90, 270];
        var idx = 0;
        function probar() {
          if (idx >= grados.length) return Promise.resolve(null);
          var g = grados[idx++];
          var cv = g ? rotado(c, g) : c;
          return det.detect(cv).then(function (r) {
            if (r && r.length) return r.map(function (x) { return x.rawValue; }).join('\n');
            return probar();
          }).catch(function () { return probar(); });
        }
        return probar();
      })
      .catch(function () { return null; });
  }

  // b) ZXing-js: PDF417 y QR, en varias orientaciones y recorte central (sin congelar la UI)
  function leerZXing(c) {
    return cargarScript(LIB_ZXING, function () { return !!(window.ZXing && window.ZXing.MultiFormatReader); }).then(function () {
      var Z = window.ZXing;
      var hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.PDF_417, Z.BarcodeFormat.QR_CODE]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      var reader = new Z.MultiFormatReader();
      reader.setHints(hints);
      var base = lienzo(c, 2200);
      var centro = recortarCentro(base, 0.78, 0.72);
      var tareas = [
        function () { return base; },
        function () { return rotado(base, 90); },
        function () { return rotado(base, 270); },
        function () { return rotado(base, 180); },
        function () { return centro; },
        function () { return rotado(centro, 90); },
      ];
      var i = 0;
      function siguiente() {
        if (i >= tareas.length) return Promise.resolve(null);
        var cv = tareas[i++]();
        for (var k = 0; k < 2; k++) {
          try {
            var lum = new Z.RGBLuminanceSource(grises(cv, k === 1), cv.width, cv.height);
            var bin = k === 0 ? new Z.HybridBinarizer(lum) : new Z.GlobalHistogramBinarizer(lum);
            var res = reader.decode(new Z.BinaryBitmap(bin));
            if (res && res.getText()) return Promise.resolve(res.getText());
          } catch (e) { /* no se encontró en esta variante */ }
          reader.reset && reader.reset();
        }
        return new Promise(function (res) { setTimeout(res, 0); }).then(siguiente);
      }
      return siguiente();
    }).catch(function () { return null; });
  }

  // c) Tesseract.js: OCR de números (respaldo y, si hace falta, el frente)
  // Un solo lector por revisión: se crea una vez y lee el respaldo y el
  // frente seguidos. Si no se puede descargar el lector o su modelo, el
  // error dice "sin conexión" (no es culpa de la foto).
  var ERROR_RED = 'OCR_SIN_RED';
  function errorDeRed(e) {
    var err = new Error(ERROR_RED);
    err.causa = e;
    return err;
  }
  function crearLectorOCR(onEstado) {
    var worker = null, creando = null;
    function asegurar() {
      if (worker) return Promise.resolve(worker);
      if (creando) return creando;
      creando = cargarScript(LIB_TESSERACT, function () { return !!(window.Tesseract && window.Tesseract.createWorker); })
        .then(function () {
          return window.Tesseract.createWorker('eng', 1, {
            workerPath: new URL(WORKER_TESSERACT, location.href).href,
            workerBlobURL: false,
            logger: function (m) {
              if (onEstado && m && m.status === 'recognizing text') onEstado('Leyendo el número... ' + Math.round((m.progress || 0) * 100) + ' %');
            },
          });
        })
        .then(function (w) {
          return w.setParameters({ tessedit_char_whitelist: '0123456789.,-<ABCDEFGHIJKLMNOPQRSTUVWXYZ ' }).then(function () { worker = w; return w; });
        })
        // No cargó la librería, el núcleo o el modelo de idioma: es la conexión
        .catch(function (e) { creando = null; throw errorDeRed(e); });
      return creando;
    }
    return {
      // Prueba lienzos uno a uno y se detiene apenas encuentra la cédula
      buscar: function (pasos, cedula) {
        return asegurar().then(function (w) {
          var i = 0;
          function siguiente() {
            if (i >= pasos.length) return Promise.resolve(false);
            var p = pasos[i++];
            if (!p || !p.canvas) return siguiente();
            if (onEstado && p.aviso) onEstado(p.aviso);
            return w.recognize(paraOCR(p.canvas))
              .then(function (r) {
                var txt = (r && r.data && r.data.text) || '';
                return contieneCedula(txt, cedula) ? true : siguiente();
              }, function () { return siguiente(); });
          }
          return siguiente();
        });
      },
      cerrar: function () {
        var w = worker;
        worker = null; creando = null;
        if (w) { try { return Promise.resolve(w.terminate()).catch(function () {}); } catch (e) { /* ya estaba cerrado */ } }
        return Promise.resolve();
      },
    };
  }

  /* Lee el número y dice si coincide con la cédula del registro.
     Devuelve { ok, metodo: 'codigo' | 'ocr' | null, leido, sinRed } */
  function leerNumero(trasera, frontal, cedula, onEstado) {
    var estado = onEstado || function () {};
    var lector = null;
    estado('Buscando el código de barras o QR del respaldo...');
    return leerNativo(trasera).then(function (t) {
      if (t && contieneCedula(t, cedula)) return { ok: true, metodo: 'codigo' };
      return leerZXing(trasera).then(function (t2) {
        if (t2 && contieneCedula(t2, cedula)) return { ok: true, metodo: 'codigo' };
        var leido = pareceOtraCedula(t) || pareceOtraCedula(t2);
        estado('Leyendo el número en tu cédula (puede tardar unos segundos)...');
        lector = crearLectorOCR(estado);
        // En la cédula amarilla el número legible está en el frente; en la digital está en el frente
        // y en las 3 líneas MRZ de la parte inferior del respaldo (el QR viene firmado y no trae el número plano).
        var pasos = [];
        if (frontal) {
          pasos.push({ canvas: frontal, aviso: 'Leyendo el número en el frente...' });
        }
        if (trasera) {
          pasos.push({ canvas: recortarFranjaInferior(trasera, 0.52), aviso: 'Leyendo el código MRZ del respaldo...' });
          pasos.push({ canvas: trasera, aviso: 'Leyendo el texto del respaldo...' });
        }
        if (frontal) {
          pasos.push({ canvas: rotado(frontal, 90), aviso: 'Probando el frente girado...' });
          pasos.push({ canvas: rotado(frontal, 270), aviso: 'Probando el frente en otra orientación...' });
        }
        if (trasera) {
          var t90 = rotado(trasera, 90), t270 = rotado(trasera, 270);
          pasos.push({ canvas: recortarFranjaInferior(t90, 0.52), aviso: 'Probando el respaldo girado...' });
          pasos.push({ canvas: recortarFranjaInferior(t270, 0.52), aviso: 'Probando el respaldo en otra orientación...' });
        }
        return lector.buscar(pasos, cedula).then(function (encontrado) {
          if (encontrado) return { ok: true, metodo: 'ocr' };
          return { ok: false, metodo: null, leido: leido };
        }).catch(function (e) {
          if (e && e.message === ERROR_RED) return { ok: false, metodo: null, leido: leido, sinRed: true };
          return { ok: false, metodo: null, leido: leido };
        });
      });
    }).then(function (r) {
      if (!lector) return r;
      return lector.cerrar().then(function () { return r; });
    });
  }

  /* =====================================================================
     3. MODAL Y SUBIDA
  ===================================================================== */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var ctx = null;          // datos de la sesión actual del modal
  var fotos = { frontal: null, trasera: null };
  var lectura = { ok: false, metodo: null, para: null };
  var resolver = null;
  var enlazado = false;

  var ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
  var ICON_ERR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17h.01"/></svg>';
  var ICON_LOAD = '<span class="vf-spin" aria-hidden="true"></span>';
  var ICON_INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

  function estado(tipo, titulo, texto, accion) {
    var box = $('#vf-status');
    if (!box) return;
    if (!tipo) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.className = 'vf-status vf-status--' + tipo;
    box.innerHTML = ({ ok: ICON_OK, error: ICON_ERR, info: ICON_INFO }[tipo] || ICON_LOAD)
      + '<div><b></b>' + (texto ? '<small></small>' : '') + '</div>';
    box.querySelector('b').textContent = titulo;
    if (texto) box.querySelector('small').textContent = texto;
    if (accion && accion.texto && accion.alClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'vf-status-act';
      b.textContent = accion.texto;
      b.addEventListener('click', accion.alClick);
      box.querySelector('div').appendChild(b);
    }
  }

  function pintarSlot(lado) {
    var slot = $('.vf-slot[data-lado="' + lado + '"]'), f = fotos[lado];
    if (!slot) return;
    var img = $('.vf-prev', slot);
    slot.classList.toggle('has-photo', !!f);
    slot.classList.toggle('is-ok', lado === 'trasera' && lectura.ok);
    if (f) { img.src = f.url; img.hidden = false; } else { img.hidden = true; img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='; }
    $('.vf-meta', slot).textContent = f ? 'Comprimida a ' + f.kb + ' KB · ' + f.ancho + ' x ' + f.alto + ' px · ' + (f.tipo === 'image/webp' ? 'WebP' : 'JPEG') : '';
    $$('.vf-step').forEach(function (s) {
      var n = s.dataset.paso;
      s.classList.toggle('is-done', (n === '1' && !!fotos.frontal) || (n === '2' && lectura.ok) || (n === '3' && false));
    });
    actualizarBoton();
  }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  function actualizarBoton() {
    var btn = $('#vf-submit');
    if (btn) btn.disabled = !(fotos.frontal && fotos.trasera && lectura.ok && $('#vf-consent').checked);
  }

  var subiendo = false;
  /* Al cerrar el modal: suelta las fotos de la cédula de la memoria (vistas
     previas blob: y lienzos). Si se están subiendo, espera a la próxima vez. */
  function liberar() {
    if (subiendo) return;
    ['frontal', 'trasera'].forEach(function (l) { if (fotos[l] && fotos[l].url) URL.revokeObjectURL(fotos[l].url); fotos[l] = null; });
    lectura = { ok: false, metodo: null, para: null };
    pintarSlot('frontal'); pintarSlot('trasera'); // las <img> sueltan la foto
  }
  function limpiar() {
    ['frontal', 'trasera'].forEach(function (l) { if (fotos[l] && fotos[l].url) URL.revokeObjectURL(fotos[l].url); fotos[l] = null; });
    lectura = { ok: false, metodo: null, para: null };
    $('#vf-consent').checked = false;
    $('#vf-form').hidden = false;
    $('#vf-done').hidden = true;
    estado(null);
    pintarSlot('frontal'); pintarSlot('trasera');
  }

  function activarManual(turno) {
    if (lectura.para !== turno) return;
    lectura = { ok: true, metodo: 'ocr', para: turno };
    estado('info', 'Listo para revisión manual', 'Enviaremos tus dos fotos al equipo para confirmar tu cédula. Marca la autorización y toca "Verificar mi identidad".');
    pintarSlot('trasera');
  }

  function revisarLectura() {
    if (!fotos.trasera) return Promise.resolve();
    var turno = {};
    lectura = { ok: false, metodo: null, para: turno };
    pintarSlot('trasera');
    estado('cargando', 'Leyendo tu cédula', 'Esto pasa en tu celular. No se envía nada todavía.');
    return leerNumero(fotos.trasera.lectura, fotos.frontal && fotos.frontal.lectura, ctx.cedula, function (t) {
      if (lectura.para === turno) estado('cargando', 'Leyendo tu cédula', t);
    }).then(function (r) {
      if (lectura.para !== turno) return;
      lectura = { ok: r.ok, metodo: r.metodo, para: turno };
      var opcionManual = fotos.frontal ? { texto: 'Enviar de todas formas a revisión manual', alClick: function () { activarManual(turno); } } : null;
      if (r.ok) {
        estado('ok', 'El número coincide con tu registro', 'Cédula terminada en ' + String(ctx.cedula).slice(-3) + '. Ya puedes verificar.');
      } else if (r.sinRed && !r.leido) {
        estado('error', 'No se pudo descargar el lector automático',
          fotos.frontal
            ? 'Parece un problema de conexión. Puedes intentar de nuevo o enviar tus fotos a revisión manual.'
            : 'Parece un problema de conexión. Sube también el frente para enviarla a revisión manual.',
          opcionManual);
      } else if (r.leido) {
        estado('error', 'El número no coincide con tu registro', 'Revisa que sea tu cédula. Si la digitaste mal al registrarte, escríbenos a modoparcheoficial@gmail.com.');
      } else {
        estado('error', 'No pudimos leer el número automáticamente',
          fotos.frontal
            ? 'Si tus dos fotos se ven claras y completas, puedes repetir la del respaldo o enviarlas a revisión manual.'
            : 'Sube también el frente de tu cédula o repite el respaldo con mejor luz y sin reflejos.',
          opcionManual);
      }
      pintarSlot('trasera');
    });
  }

  function elegirFoto(lado, file) {
    if (!file) return;
    var slot = $('.vf-slot[data-lado="' + lado + '"]');
    slot.classList.add('is-loading');
    estado('cargando', lado === 'frontal' ? 'Preparando el frente' : 'Preparando el respaldo', 'Comprimiendo la foto en tu celular...');
    comprimirImagen(file, { maxAncho: 1200, minKB: 80, maxKB: 100, calidad: 0.7 }).then(function (f) {
      if (fotos[lado] && fotos[lado].url) URL.revokeObjectURL(fotos[lado].url);
      fotos[lado] = f;
      slot.classList.remove('is-loading');
      pintarSlot(lado);
      if (lado === 'trasera' || (lado === 'frontal' && fotos.trasera && !lectura.ok)) return revisarLectura();
      estado(null);
      if (!fotos.trasera) estado('info', 'Frente listo', 'Ahora toma la foto del respaldo, donde está el código de barras o el QR.');
    }).catch(function (e) {
      slot.classList.remove('is-loading');
      estado('error', 'No pudimos usar esa foto', e.message || 'Prueba con otra.');
    });
  }

  function subir(lado, f) {
    var ext = f.tipo === 'image/webp' ? 'webp' : 'jpg';
    var path = 'cedulas/' + ctx.uid + '/' + lado + '-' + Date.now() + '.' + ext;
    return ctx.sb.storage.from(BUCKET).upload(path, f.blob, { contentType: f.tipo, upsert: false, cacheControl: '0' })
      .then(function (r) { if (r.error) throw r.error; return path; });
  }

  function mensajeError(err) {
    var m = String((err && (err.message + ' ' + (err.hint || ''))) || '');
    if (/NO_COINCIDE/.test(m)) return ['El número no coincide', 'La cédula de la foto no es la de tu registro.'];
    if (/SIN_CEDULA/.test(m)) return ['Tu cuenta no tiene cédula', 'Escríbenos a modoparcheoficial@gmail.com para agregarla.'];
    if (/SOLO_PERSONAS/.test(m)) return ['Solo cuentas personales', 'Los negocios no necesitan esta verificación.'];
    if (/row-level security|violates|policy/i.test(m)) return ['Ya subiste muchas fotos', 'Escríbenos y te ayudamos a terminar la verificación.'];
    if (/Bucket not found|PGRST202|Could not find the function/i.test(m)) return ['La verificación todavía no está activa', 'Falta correr la migración de verificación en Supabase.'];
    if (/exceeded|too large|maximum allowed size/i.test(m)) return ['La foto quedó muy pesada', 'Vuelve a tomarla e intenta otra vez.'];
    if (/fetch|network/i.test(m)) return ['Sin conexión', 'Revisa tu internet e intenta de nuevo.'];
    return ['No pudimos verificarte', m.trim() || 'Intenta de nuevo en unos segundos.'];
  }

  function enviar() {
    var btn = $('#vf-submit');
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add('is-loading');
    subiendo = true;
    estado('cargando', 'Subiendo tus fotos', 'Van comprimidas (' + (fotos.frontal.kb + fotos.trasera.kb) + ' KB en total) a un espacio privado.');
    var fin = function () { subiendo = false; btn.classList.remove('is-loading'); actualizarBoton(); };

    if (ctx.demo || !ctx.sb) {
      setTimeout(function () { fin(); exito(); }, 700);
      return;
    }
    var subidas = [];
    subir('frontal', fotos.frontal).then(function (p1) {
      subidas.push(p1);
      return subir('trasera', fotos.trasera).then(function (p2) { subidas.push(p2); return [p1, p2]; });
    }).then(function (paths) {
      estado('cargando', 'Confirmando tu identidad', 'Un momento...');
      return ctx.sb.rpc('verificar_mi_cedula', { p_frontal: paths[0], p_trasera: paths[1], p_numero_leido: ctx.cedula, p_metodo: lectura.metodo || 'codigo' });
    }).then(function (r) {
      if (r.error) throw r.error;
      fin(); exito(r.data);
    }).catch(function (err) {
      // Si algo falló, no dejamos fotos sueltas en el bucket
      if (subidas.length) ctx.sb.storage.from(BUCKET).remove(subidas).catch(function () { /* nada */ });
      fin();
      var e = mensajeError(err);
      estado('error', e[0], e[1]);
    });
  }

  // El servidor decide: con revisión humana queda "pendiente" y aún no da el sello
  function exito(data) {
    var pendiente = !!(data && data.pendiente);
    ctx.verificado = !pendiente;
    $('#vf-form').hidden = true;
    $('#vf-done').hidden = false;
    $('#vf-done h3').textContent = pendiente ? 'Recibimos tu cédula' : 'Ya eres Parcero Verificado';
    $('#vf-done p').textContent = pendiente
      ? 'El equipo la revisa y te avisamos por notificación. Cuando quede aprobada podrás abrir parches y llevar el sello.'
      : 'Tu sello sale en tu perfil y en los chats. Ya puedes abrir parches.';
    $('#vf-done-cta').textContent = pendiente ? 'Entendido' : (ctx.motivo === 'crear' ? 'Abrir el parche' : 'Ver mi insignia');
    if (pendiente && ctx.alPendiente) ctx.alPendiente();
    setTimeout(function () { var b = $('#vf-done-cta'); if (b) b.focus(); }, 80);
  }

  function enlazar() {
    if (enlazado) return;
    enlazado = true;
    var modal = $('#modal-verificacion');
    modal.addEventListener('change', function (e) {
      var inp = e.target.closest('input[type="file"][data-lado]');
      if (inp) { var f = inp.files && inp.files[0]; inp.value = ''; elegirFoto(inp.dataset.lado, f); return; }
      if (e.target.id === 'vf-consent') actualizarBoton();
    });
    $('#vf-submit').addEventListener('click', enviar);
    $('#vf-done-cta').addEventListener('click', function () { ctx.cerrarModal(); });
    var demoBtn = $('#vf-demo');
    if (demoBtn) demoBtn.addEventListener('click', function () {
      lectura = { ok: true, metodo: 'codigo', para: {} };
      estado('ok', 'Lectura simulada', 'En el modo demo no se lee ni se sube nada.');
      pintarSlot('trasera');
    });
    // Cuando el modal se cierra (X, fondo, Esc o el botón final) se resuelve la promesa
    new MutationObserver(function () {
      if (modal.hidden && resolver) { var r = resolver; resolver = null; r(!!(ctx && ctx.verificado)); }
    }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  }

  function abrir(opciones) {
    ctx = Object.assign({ motivo: 'insignia', verificado: false }, opciones);
    if (!ctx.cedula) return Promise.reject(new Error('SIN_CEDULA'));
    enlazar();
    limpiar();
    $('#vf-kicker').textContent = ctx.motivo === 'crear' ? 'Paso obligatorio para organizar parches' : 'Insignia Parcero Verificado';
    $('#vf-lede').textContent = ctx.motivo === 'crear'
      ? 'Quien abre un parche recibe a gente que no conoce. Por eso pedimos una sola vez las dos caras de tu cédula.'
      : 'Toma las dos caras de tu cédula. Leemos el número aquí mismo y lo comparamos con el de tu registro.';
    var demoBtn = $('#vf-demo');
    if (demoBtn) demoBtn.hidden = !ctx.demo;
    return new Promise(function (res) {
      resolver = res;
      ctx.abrirModal();
    });
  }

  window.MPVerificacion = {
    abrir: abrir,
    liberar: liberar,
    comprimirImagen: comprimirImagen,
    leerNumero: leerNumero,
    contieneCedula: contieneCedula,
    pareceOtraCedula: pareceOtraCedula,
  };
})();
