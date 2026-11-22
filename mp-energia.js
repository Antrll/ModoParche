/* =====================================================================
   ModoParche · mp-energia.js
   Le da vida a las páginas públicas: piezas de branding en los espacios
   libres de cada sección (nunca encima del contenido), cintas en
   movimiento y barra de avance. Se apaga con "reducir movimiento".
===================================================================== */
(function () {
  'use strict';
  var STK = function (n) { return '/src/assets/web/stk/' + n + '.webp'; };
  var VIVOS = ['coronanaranjabrochaarmador', 'chispasnaranjasimpactoesquina', 'fuego-2-naranja'];
  var SOBRE_NARANJA = ['estrellablancagrunge5puntas', 'estrellanegratrazografiti', 'coronablancabrochabasquiat'];
  var CONTENIDO = 'h1,h2,h3,h4,p,li,a,button,input,select,textarea,img:not(.mp-stk img),figure,article,dl,summary,svg,table,label';
  var TEXTOS = 'h1,h2,h3,h4,p,li,a,button,input,select,textarea,label,dt,dd,summary';
  var ANCLAS = 'figure.media,.plan-main,.plan-tier,.cobro-caso,.manifesto-block,.member,.biz-join-card,.photo-card,.value,.stage';
  var CINTAS = { '': '.how', equipo: '.team-hero', preguntas: '.faq-hero', marca: '.br-hero' };
  var FRASES = ['Sal', 'Encuentra', 'Conecta', '¿Qué se arma hoy?', 'Hecho en Villavo'];
  var LECTURA = ['pagos', 'legal', 'privacidad', 'terminos', 'cookies'];
  var reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pagina = location.pathname.replace(/^\/+|\.html$/g, '').replace(/^index$/, '');

  // Azar repetible: la misma página siempre se ve igual
  function azar(semilla) { var x = semilla * 9301 + 49297; return function () { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
  function choca(a, b, m) { return a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m; }
  function esNaranja(el) {
    var c = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return c.length >= 3 && c[0] > 215 && c[1] > 60 && c[1] < 125 && c[2] < 70;
  }

  var observador = null, enVista = new Set();
  function poner(sec, i, lectura) {
    sec.querySelectorAll(':scope > .mp-stk').forEach(function (x) { x.remove(); });
    var ancho = window.innerWidth, chico = ancho < 760;
    var caja = sec.getBoundingClientRect();
    if (caja.height < 170) return;
    var maxStk = lectura ? (chico ? 1 : 3) : chico ? 2 : Math.min(6, Math.max(3, Math.round(caja.height / 240)));
    var lado = chico ? 56 : Math.round(Math.min(124, Math.max(84, ancho * .075)));
    var ocupados = Array.prototype.filter.call(sec.querySelectorAll(CONTENIDO), function (e) {
      if (e.closest('.mp-stk')) return false;
      var r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).map(function (e) { return e.getBoundingClientRect(); });
    // Tampoco encima de la cinta ni debajo de la barra de navegación
    document.querySelectorAll('.mp-cinta, .marquee, .nav').forEach(function (e) { ocupados.push(e.getBoundingClientRect()); });
    var rnd = azar(i + 7), celdas = [], cols = chico ? 4 : 9, filas = Math.max(3, Math.round(caja.height / (lado * 1.25)));
    for (var f = 0; f < filas; f++) for (var c = 0; c < cols; c++) celdas.push([c, f, rnd()]);
    celdas.sort(function (a, b) { return a[2] - b[2]; });
    var banco = esNaranja(sec) ? SOBRE_NARANJA : VIVOS, puestos = [], usado = 0;
    for (var k = 0; k < celdas.length && puestos.length < maxStk; k++) {
      var x = (celdas[k][0] + .1 + rnd() * .3) * ((caja.width - lado) / Math.max(1, cols - 1));
      var y = 8 + celdas[k][1] * ((caja.height - lado - 16) / Math.max(1, filas - 1));
      x = Math.max(4, Math.min(caja.width - lado - 4, x));
      var r = { left: caja.left + x, right: caja.left + x + lado, top: caja.top + y, bottom: caja.top + y + lado };
      if (ocupados.some(function (o) { return choca(r, o, 20); }) || puestos.some(function (o) { return choca(r, o, lado * .55); })) continue;
      puestos.push(r);
      var s = document.createElement('span'), img = document.createElement('img');
      s.className = 'mp-stk mp-stk--' + (usado % 3);
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = 'left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;width:' + lado + 'px;--giro:' + Math.round(rnd() * 34 - 17) + 'deg;--d:' + (-rnd() * 6).toFixed(2) + 's;--vel:' + (.03 + rnd() * .07).toFixed(3);
      img.src = STK(banco[(i * 3 + usado) % banco.length]); img.alt = ''; img.width = lado; img.height = lado; img.loading = 'lazy'; img.decoding = 'async';
      s.appendChild(img); sec.appendChild(s); usado++;
      if (observador) observador.observe(s);
    }
    if (!lectura) pegar(sec, i, VIVOS, i * 3 + usado + 2);
  }

  // Stickers "pegados" en la esquina de fotos y tarjetas, sin tapar ningún texto
  function pegar(sec, i, banco, inicio) {
    var chico = window.innerWidth < 760, lado = chico ? 50 : 76, caja = sec.getBoundingClientRect();
    var textos = Array.prototype.filter.call(sec.querySelectorAll(TEXTOS), function (e) {
      if (e.closest('.mp-stk')) return false;
      var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    }).map(function (e) { return e.getBoundingClientRect(); });
    document.querySelectorAll('.mp-cinta, .marquee, .nav').forEach(function (e) { textos.push(e.getBoundingClientRect()); });
    var puestos = Array.prototype.map.call(sec.querySelectorAll(':scope > .mp-stk'), function (e) { return e.getBoundingClientRect(); });
    var anclas = Array.prototype.slice.call(sec.querySelectorAll(ANCLAS)), max = chico ? 2 : 4, n = 0;
    for (var a = 0; a < anclas.length && n < max; a++) {
      var b = anclas[a].getBoundingClientRect();
      if (b.width < 120 || b.height < 110) continue;
      var esquinas = [[b.right, b.top], [b.left, b.bottom], [b.right, b.bottom], [b.left, b.top]];
      for (var e = 0; e < 4; e++) {
        var q = esquinas[(a + i + e) % 4], x = q[0] - caja.left - lado * (q[0] === b.right ? .62 : .38), y = q[1] - caja.top - lado * (q[1] === b.bottom ? .62 : .38);
        if (x < 2 || y < 2 || x + lado > caja.width - 2 || y + lado > caja.height - 2) continue;
        var r = { left: caja.left + x, right: caja.left + x + lado, top: caja.top + y, bottom: caja.top + y + lado };
        if (textos.some(function (o) { return choca(r, o, 6); }) || puestos.some(function (o) { return choca(r, o, lado * .7); })) continue;
        puestos.push(r);
        var s = document.createElement('span'), img = document.createElement('img');
        s.className = 'mp-stk mp-stk--pega mp-stk--' + ((n + 1) % 3);
        s.setAttribute('aria-hidden', 'true');
        s.style.cssText = 'left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;width:' + lado + 'px;--giro:' + ((a % 2 ? 1 : -1) * (6 + a * 3 % 11)) + 'deg;--d:-' + (a * .7).toFixed(1) + 's;--vel:.015';
        img.src = STK(banco[(inicio + n) % banco.length]); img.alt = ''; img.width = lado; img.height = lado; img.loading = 'lazy'; img.decoding = 'async';
        s.appendChild(img); sec.appendChild(s); n++;
        if (observador) observador.observe(s);
        break;
      }
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

  function barra() {
    var b = document.createElement('div'); b.className = 'mp-avance'; b.setAttribute('aria-hidden', 'true'); document.body.appendChild(b);
    return function () {
      var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
      b.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, h.scrollTop / max) : 0) + ')';
    };
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
    var lectura = LECTURA.indexOf(pagina) >= 0;
    var secciones = Array.prototype.slice.call(document.querySelectorAll(lectura ? 'main .legal-hero' : 'main > section'));
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.target.classList.toggle('is-vivo', e.isIntersecting); if (e.isIntersecting) enVista.add(e.target); else enVista.delete(e.target); });
      }, { rootMargin: '80px' });
    }
    var repartir = function () {
      secciones.forEach(function (sec, i) {
        if (getComputedStyle(sec).position === 'static') sec.style.position = 'relative';
        sec.classList.add('mp-con-stk');
        poner(sec, i, lectura);
      });
    };
    repartir();
    var anchoAntes = window.innerWidth, t = 0;
    window.addEventListener('resize', function () {
      if (window.innerWidth === anchoAntes) return; // la barra del celular cambia solo el alto
      anchoAntes = window.innerWidth; clearTimeout(t); t = setTimeout(repartir, 260);
    });
    var pintarBarra = barra(), pendiente = false;
    var alScroll = function () {
      pintarBarra();
      if (!reducir) enVista.forEach(function (s) {
        var r = s.getBoundingClientRect(), v = Number(s.style.getPropertyValue('--vel')) || .05;
        s.style.transform = 'translate3d(0,' + Math.round((r.top + r.height / 2 - window.innerHeight / 2) * -v) + 'px,0)';
      });
      pendiente = false;
    };
    window.addEventListener('scroll', function () { if (!pendiente) { pendiente = true; requestAnimationFrame(alScroll); } }, { passive: true });
    alScroll();
  }
  // Se mide cuando ya están las fuentes y las imágenes principales
  var arrancar = function () {
    var listo = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    listo.then(function () { (window.requestIdleCallback || function (f) { setTimeout(f, 120); })(iniciar, { timeout: 900 }); });
  };
  if (document.readyState === 'complete') arrancar(); else window.addEventListener('load', arrancar);
})();
