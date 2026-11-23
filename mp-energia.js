/* =====================================================================
   ModoParche · mp-energia.js
   Le da vida a las páginas públicas con POCAS piezas del branding en
   movimiento y cintas de frases. Reglas:
   - Pocas: máximo 1 por sección y un tope por página (4 en computador,
     2 en tablet y celular, 1 en las páginas legales).
   - Nunca encima de nada: mide cada línea de texto real (no solo
     etiquetas), fotos, botones y tarjetas, con un margen igual a lo que
     se mueve la animación. En pantallas anchas usa los márgenes vacíos a
     los lados del contenido. Si no hay un lugar libre, no pone nada.
   - Se reubican cuando cambia el alto de la página (fotos que cargan
     tarde) o el ancho de la pantalla.
   - Se apagan con "reducir movimiento" (quedan quietas) y al imprimir.
===================================================================== */
(function () {
  'use strict';
  var STK = function (n) { return '/src/assets/web/stk/' + n + '.webp'; };
  var VIVOS = ['coronanaranjabrochaarmador', 'chispasnaranjasimpactoesquina', 'fuego-2-naranja'];
  var SOBRE_NARANJA = ['estrellablancagrunge5puntas', 'estrellanegratrazografiti', 'coronablancabrochabasquiat'];
  // Lo que una pieza nunca puede tapar (además de cada línea de texto)
  var SOLIDOS = 'img:not(.mp-stk img),video,canvas,svg,iframe,input,select,textarea,button,a,figure,form,table,details,article,[class*="card"],[class*="tile"],.media,.plan-main,.plan-tier,.member,.photo-card,.value,.stage,.manifesto-block';
  var CINTAS = { '': '.how', equipo: '.team-hero', preguntas: '.faq-hero' };
  var FRASES = ['Sal', 'Encuentra', 'Conecta', '¿Qué se arma hoy?', 'Hecho en Villavo'];
  var LECTURA = ['pagos', 'legal', 'privacidad', 'terminos', 'cookies'];
  var MARGEN = 26; // lo que se mueve la animación + aire alrededor
  var pagina = location.pathname.replace(/^\/+|\.html$/g, '').replace(/^index$/, '');

  function choca(a, b, m) { return a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m; }
  function esNaranja(el) {
    var c = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return c.length >= 3 && c[0] > 215 && c[1] > 60 && c[1] < 125 && c[2] < 70;
  }
  function visible(r) { return r.width > 0 && r.height > 0; }

  // Cajas de todo lo que hay en la sección Y alrededor (menús que sobresalen,
  // sellos que giran, el pie de página justo debajo): cada línea de texto y
  // cada elemento sólido de la página que quede cerca de la sección.
  function obstaculos(sec) {
    var zona = sec.getBoundingClientRect(), cerca = 160, cajas = [];
    var dentro = function (r) { return visible(r) && r.bottom > zona.top - cerca && r.top < zona.bottom + cerca; };
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        return n.nodeValue.trim() && p && !p.closest('.mp-stk,script,style,noscript') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var rango = document.createRange(), n;
    while ((n = w.nextNode())) {
      rango.selectNodeContents(n);
      Array.prototype.forEach.call(rango.getClientRects(), function (r) { if (dentro(r)) cajas.push(r); });
    }
    document.querySelectorAll(SOLIDOS + ',.nav,.mp-cinta').forEach(function (e) {
      if (e.closest('.mp-stk')) return;
      var r = e.getBoundingClientRect(); if (dentro(r)) cajas.push(r);
    });
    return cajas;
  }

  // Busca un cuadro libre para una pieza de lado x lado dentro de la sección
  function lugarLibre(sec, lado, preferirLado) {
    var caja = sec.getBoundingClientRect();
    if (caja.height < lado + 2 * MARGEN + 40) return null;
    var cajas = obstaculos(sec);
    var libre = function (x, y) {
      var r = { left: caja.left + x, right: caja.left + x + lado, top: caja.top + y, bottom: caja.top + y + lado };
      return cajas.every(function (o) { return !choca(r, o, MARGEN); });
    };
    var candidatos = [];
    // 1) Márgenes vacíos a los lados del contenido (pantallas anchas)
    var wrap = sec.querySelector('.wrap');
    if (wrap) {
      var c = wrap.getBoundingClientRect(), izq = c.left - caja.left, der = caja.right - c.right;
      if (izq >= lado + 2 * MARGEN) candidatos.push(['izq', (izq - lado) / 2]);
      if (der >= lado + 2 * MARGEN) candidatos.push(['der', caja.width - der + (der - lado) / 2]);
    }
    // 2) Esquinas de la sección
    candidatos.push(['izq', MARGEN], ['der', caja.width - lado - MARGEN]);
    candidatos.sort(function (a, b) { return (a[0] === preferirLado ? 0 : 1) - (b[0] === preferirLado ? 0 : 1); });
    var paso = Math.max(24, Math.round(lado / 2)), alto = caja.height - lado - MARGEN;
    for (var k = 0; k < candidatos.length; k++) {
      var x = Math.round(candidatos[k][1]);
      if (x < 0 || x + lado > caja.width) continue;
      // De arriba hacia abajo, empezando un poco abajo del borde
      for (var y = MARGEN + 16; y <= alto; y += paso) if (libre(x, y)) return { x: x, y: y };
    }
    return null;
  }

  var observador = null, piezas = [];
  function limpiar() { piezas.forEach(function (p) { if (observador) observador.unobserve(p); p.remove(); }); piezas = []; }

  function repartir() {
    limpiar();
    var ancho = window.innerWidth, lectura = LECTURA.indexOf(pagina) >= 0;
    var tope = lectura ? 1 : ancho >= 1180 ? 4 : 2;
    var lado = ancho < 760 ? 46 : ancho < 1180 ? 60 : Math.round(Math.min(92, Math.max(70, ancho * .055)));
    var secciones = Array.prototype.slice.call(document.querySelectorAll(lectura ? 'main .legal-hero' : 'main > section'));
    var puestas = 0, salto = 0;
    for (var i = 0; i < secciones.length && puestas < tope; i++) {
      var sec = secciones[i];
      // Una sección sí y la siguiente no: así nunca se amontonan
      if (salto > 0) { salto--; continue; }
      if (getComputedStyle(sec).position === 'static') sec.style.position = 'relative';
      sec.classList.add('mp-con-stk');
      var sitio = lugarLibre(sec, lado, puestas % 2 ? 'izq' : 'der');
      if (!sitio) continue;
      var banco = esNaranja(sec) ? SOBRE_NARANJA : VIVOS;
      var s = document.createElement('span'), img = document.createElement('img');
      s.className = 'mp-stk mp-stk--' + (puestas % 3);
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = 'left:' + sitio.x + 'px;top:' + sitio.y + 'px;width:' + lado + 'px;--giro:' + ((i % 2 ? 1 : -1) * (6 + (i * 5) % 9)) + 'deg;--d:-' + (i * .9).toFixed(1) + 's';
      img.src = STK(banco[(i + puestas) % banco.length]); img.alt = ''; img.width = lado; img.height = lado; img.loading = 'lazy'; img.decoding = 'async';
      s.appendChild(img); sec.appendChild(s); piezas.push(s);
      if (observador) observador.observe(s); else s.classList.add('is-vivo');
      puestas++; salto = 1;
    }
  }

  function cinta() {
    var ref = CINTAS[pagina];
    var sec = ref && document.querySelector('main ' + ref);
    if (!sec || document.querySelector('.mp-cinta')) return;
    var d = document.createElement('div'), t = document.createElement('div');
    d.className = 'mp-cinta mp-fijo marquee'; d.setAttribute('aria-hidden', 'true');
    t.className = 'marquee-track';
    for (var v = 0; v < 6; v++) FRASES.forEach(function (x) {
      var s = document.createElement('span'); s.textContent = x; t.appendChild(s);
      t.appendChild(document.createElement('i'));
    });
    d.appendChild(t); sec.after(d);
  }

  function etiquetarTablas() {
    document.querySelectorAll('.legal-table').forEach(function (t) {
      var cab = Array.prototype.map.call(t.querySelectorAll('thead th'), function (x) { return x.textContent.trim(); });
      t.querySelectorAll('tbody tr').forEach(function (fila) {
        Array.prototype.forEach.call(fila.children, function (td, i) { if (cab[i]) td.setAttribute('data-col', cab[i]); });
      });
    });
  }

  function iniciar() {
    etiquetarTablas();
    cinta();
    // Solo se animan las que se ven (ahorra batería)
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.target.classList.toggle('is-vivo', e.isIntersecting); });
      }, { rootMargin: '80px' });
    }
    repartir();
    // Se reubican si cambia el ancho o el alto de la página (fotos que terminan de cargar)
    var anchoAntes = window.innerWidth, altoAntes = document.documentElement.scrollHeight, t = 0;
    var revisar = function () {
      var ancho = window.innerWidth, alto = document.documentElement.scrollHeight;
      if (ancho === anchoAntes && Math.abs(alto - altoAntes) < 40) return; // la barra del celular solo cambia el alto visible
      anchoAntes = ancho; altoAntes = alto;
      clearTimeout(t); t = setTimeout(repartir, 260);
    };
    window.addEventListener('resize', revisar);
    if ('ResizeObserver' in window) new ResizeObserver(revisar).observe(document.body);
  }
  // Se mide cuando ya están las fuentes y las imágenes principales
  var arrancar = function () {
    var listo = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    listo.then(function () { (window.requestIdleCallback || function (f) { setTimeout(f, 120); })(iniciar, { timeout: 900 }); });
  };
  if (document.readyState === 'complete') arrancar(); else window.addEventListener('load', arrancar);
})();
