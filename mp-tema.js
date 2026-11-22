/* =====================================================================
   ModoParche - mp-tema.js
   Modo claro / oscuro para las páginas públicas.

   - Botón sol/luna en la barra (se agrega solo en todas las páginas).
   - Guarda la elección en localStorage 'mp_tema' ('claro' | 'oscuro'),
     la misma llave que usa el dashboard: lo que elijas aquí se respeta allá.
   - Transición "tinta que se riega": el tema nuevo entra por una mancha
     irregular que crece desde el botón. Idea inspirada en
     codemure-official/ink-bleed-theme-changer, hecha desde cero sin WebGL
     ni dependencias: View Transitions API + una máscara dibujada en canvas.
     Sin soporte (o con "reducir movimiento") cambia con un fundido o al instante.
   - Logo: mide el fondo real detrás de cada isotipo y muestra la versión que
     se ve (naranja, para claro o para oscuro). Si una imagen no carga, prueba
     la siguiente opción y, si ninguna sirve, deja solo el texto del logo.
===================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const LLAVE = 'mp_tema';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Tres modos: claro (casi todo claro), mixto (el diseño de marca: blanco,
  // negro y naranja; en los paneles, barras oscuras) y oscuro (casi todo oscuro).
  const TEMAS = ['claro', 'mixto', 'oscuro'];
  const NOMBRE = { claro: 'Modo claro', mixto: 'Modo mixto', oscuro: 'Modo oscuro' };
  const esOscuro = () => root.classList.contains('is-dark');
  const temaActual = () => esOscuro() ? 'oscuro' : root.classList.contains('is-mixto') ? 'mixto' : 'claro';
  const siguienteTema = t => TEMAS[(TEMAS.indexOf(t) + 1) % TEMAS.length];
  // Paneles (usuario, negocio, admin): sus colores oscuros viven en su CSS,
  // así que no se marcan superficies fijas ni se toca el logo de la barra pública.
  const PANEL = root.hasAttribute('data-tema-panel');

  function guardar(tema) {
    try { localStorage.setItem(LLAVE, tema); } catch (e) { /* modo privado o sin almacenamiento */ }
  }

  /* ---------- Colores ---------- */
  const pintor = (() => {
    try { return document.createElement('canvas').getContext('2d'); } catch (e) { return null; }
  })();

  // Convierte cualquier color CSS (#hex, rgb(), nombre) a [r, g, b, a]. null si no se entiende.
  function rgba(str) {
    if (!str) return null;
    str = String(str).trim();
    let m = str.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (!m && pintor) {
      pintor.fillStyle = '#010203';
      pintor.fillStyle = str;
      const n = pintor.fillStyle;
      if (n === '#010203' && !/^#010203$/i.test(str)) return null;
      if (n[0] === '#') return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16), 1];
      m = n.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    }
    if (!m) return null;
    let a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (m[4] && m[4].endsWith('%')) a /= 100;
    return [+m[1], +m[2], +m[3], a];
  }

  function luminancia([r, g, b]) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  // 'naranja' | 'claro' | 'oscuro' según el color de fondo
  function tipoDeFondo(c) {
    if (!c) return esOscuro() ? 'oscuro' : 'claro';
    const [r, g, b] = c;
    if (r > 200 && g > 50 && g < 150 && b < 90 && r - b > 140) return 'naranja';
    return luminancia(c) > 0.4 ? 'claro' : 'oscuro';
  }

  // Primer fondo opaco detrás de un elemento (subiendo por sus padres)
  function fondoDetras(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.5) return c;
    }
    return rgba(getComputedStyle(document.body).backgroundColor) || rgba(getComputedStyle(root).backgroundColor);
  }

  /* ---------- Superficies que conservan su color (.mp-fijo) ---------- */
  // Solo lo naranja se queda como en modo claro (el texto sobre naranja sigue
  // negro). Todo lo demás se invierte: lo negro pasa a claro y lo blanco a oscuro.
  // Texto naranja sobre un bloque que era negro: en modo oscuro ese bloque queda
  // crema y el naranja de marca no se lee (2,8:1). Se marca para usar el naranja
  // profundo solo en el texto; los fondos naranjas no se tocan.

  /* ---------- Superficies ----------
     Los bloques que cambian con el tema vienen marcados en el HTML
     (.mp-fijo, .mp-tinta-bloque, .mp-tinta-papel, .mp-naranja-texto).
     Así el tema no recorre ni mide la página al cargar. */

  /* ---------- Logo de la barra ---------- */
  const ORDEN_LOGO = {
    naranja: ['lm--naranja', 'lm--blanco'],
    claro: ['lm--blanco', 'lm--naranja'],
    oscuro: ['lm--negro'],
  };

  function elegirLogoBarra() {
    const nav = document.querySelector('.nav');
    const marca = nav && nav.querySelector('.logo-mark');
    if (!marca) return;
    const cs = getComputedStyle(nav);
    // Se lee el color de destino (variable), no el que está a mitad de la transición
    const destino = rgba(cs.getPropertyValue('--nav-bg')) || rgba(cs.getPropertyValue('--paper')) || fondoDetras(nav);
    const tipo = tipoDeFondo(destino);
    const imgs = Array.from(marca.querySelectorAll('.lm'));
    const sirve = cls => imgs.find(i => i.classList.contains(cls) && !i.classList.contains('lm-falla'));
    const elegida = ORDEN_LOGO[tipo].map(sirve).find(Boolean) || null;
    imgs.forEach(i => i.classList.toggle('lm-on', i === elegida));
    nav.dataset.logo = elegida ? tipo : 'texto';
    marca.hidden = !elegida;

    // Color de la barra del navegador del celular
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && destino) {
      if (!meta.dataset.original) meta.dataset.original = meta.content;
      meta.content = `rgb(${destino[0]}, ${destino[1]}, ${destino[2]})`;
    }
  }

  function vigilarLogosBarra() {
    document.querySelectorAll('.logo-mark .lm').forEach(img => {
      const falla = () => { img.classList.add('lm-falla'); programarLogos(); };
      if (img.complete && img.naturalWidth === 0 && img.currentSrc) falla();
      else img.addEventListener('error', falla, { once: true });
    });
  }

  /* ---------- Logos dentro de la página ---------- */
  // Familias de isotipo: versión para fondo claro, oscuro y naranja.
  const FAMILIAS = [
    { claro: 'logo-isotipo.webp', oscuro: 'logo-isotipo-negro.webp', naranja: 'logo-isotipo-naranja.webp' },
    { claro: 'isotipo.png', oscuro: 'isotipo-negro.png', naranja: 'isotipo-naranja.png' },
    { claro: 'isotipo-96.png', oscuro: 'isotipo-negro-96.png', naranja: 'isotipo-naranja-96.png' },
    { claro: 'logo-imagotipo.webp', oscuro: 'logo-imagotipo-light.webp' },
  ];
  const nombreDe = src => (src || '').split(/[?#]/)[0].split('/').pop();
  function familiaDe(src) {
    const n = nombreDe(src);
    return FAMILIAS.find(f => Object.values(f).includes(n)) || null;
  }

  // Las piezas de marca.html muestran el logo a propósito sobre un fondo fijo: no se tocan.
  // .logo-dk / .logo-lt: el dashboard ya trae las dos versiones y su CSS muestra la correcta.
  const NO_TOCAR = '.nav, .logo-card, .logo-rules, .donts, [data-logo-fijo], .logo-dk, .logo-lt';

  function ajustarLogosPagina() {
    document.querySelectorAll('img').forEach(img => {
      if (img.closest(NO_TOCAR)) return;
      const original = img.dataset.logoOriginal || img.getAttribute('src');
      const fam = familiaDe(original);
      if (!fam) return;
      if (!img.dataset.logoOriginal) img.dataset.logoOriginal = original;

      // En modo mixto todo queda como se diseñó
      if (temaActual() === 'mixto' && !PANEL) { cambiarSrc(img, original); return; }

      const tipo = tipoDeFondo(fondoDetras(img.parentElement || img));
      const nombreOriginal = nombreDe(original);
      const tipoOriginal = Object.keys(fam).find(k => fam[k] === nombreOriginal);
      // Si la versión original ya sirve para ese fondo, se respeta
      if (tipoOriginal === tipo || (tipo === 'naranja' && !fam.naranja && tipoOriginal === 'claro')) { cambiarSrc(img, original); return; }
      const nombre = fam[tipo] || (tipo === 'naranja' ? fam.claro : null);
      if (!nombre) { cambiarSrc(img, original); return; }
      const base = original.slice(0, original.lastIndexOf(nombreOriginal));
      cambiarSrc(img, base + nombre);
    });
  }

  function cambiarSrc(img, src) {
    if (img.getAttribute('src') === src) return;
    const original = img.dataset.logoOriginal;
    // Si la versión nueva no carga, vuelve a la original en vez de dejar un hueco
    img.addEventListener('error', () => { if (img.getAttribute('src') !== original) img.setAttribute('src', original); }, { once: true });
    img.setAttribute('src', src);
  }

  let logosPendiente = 0;
  function programarLogos() {
    cancelAnimationFrame(logosPendiente);
    logosPendiente = requestAnimationFrame(() => {
      try { elegirLogoBarra(); } catch (e) { console.warn('[tema] logo barra', e); }
    });
  }

  /* ---------- Aplicar el tema ---------- */
  // tema: 'claro' | 'mixto' | 'oscuro' (también acepta true/false por compatibilidad)
  function aplicar(tema) {
    if (tema === true) tema = 'oscuro';
    if (tema === false) tema = 'claro';
    if (!TEMAS.includes(tema)) tema = 'claro';
    root.classList.toggle('is-dark', tema === 'oscuro');
    root.classList.toggle('is-mixto', tema === 'mixto');
    sincronizar();
    // Avisa a la página (el dashboard marca su selector de tema)
    try { document.dispatchEvent(new CustomEvent('mp-tema', { detail: { oscuro: tema === 'oscuro', tema } })); } catch (e) { /* navegador viejo */ }
  }

  // Deja el botón, los logos y la barra del navegador acordes con el tema actual,
  // venga el cambio de este botón, de los ajustes del panel o de otra pestaña.
  function sincronizar() {
    const tema = temaActual(), oscuro = tema === 'oscuro', luego = siguienteTema(tema);
    document.querySelectorAll('.tema-toggle').forEach(btn => {
      btn.dataset.temaActual = tema;
      btn.setAttribute('aria-pressed', String(tema !== 'claro'));
      btn.setAttribute('aria-label', `${NOMBRE[tema]}. Cambiar a ${NOMBRE[luego].toLowerCase()}`);
      btn.title = `${NOMBRE[tema]} · toca para ${NOMBRE[luego].toLowerCase().replace('modo ', 'el modo ')}`;
    });
    if (PANEL) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        if (!meta.dataset.original) meta.dataset.original = meta.content;
        meta.content = oscuro ? '#121214' : tema === 'mixto' ? '#111111' : meta.dataset.original;
      }
    } else {
      try { elegirLogoBarra(); } catch (e) { console.warn('[tema] logo barra', e); }
    }
    try { ajustarLogosPagina(); } catch (e) { console.warn('[tema] logos', e); }
  }

  /* ---------- Máscara de tinta ---------- */
  // Mancha irregular: borde con ondas de varias frecuencias, unas cuantas "venas"
  // que se adelantan y gotas sueltas alrededor. Se dibuja una vez por clic.
  const LADO = 768;
  const RADIO_MIN = 0.2; // radio mínimo de la mancha respecto al lado del lienzo

  function dibujarMancha() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = LADO;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const c = LADO / 2;
    const base = LADO * 0.29;
    const ondas = Array.from({ length: 7 }, (_, i) => ({ k: 3 + i * 2 + Math.floor(Math.random() * 2), a: (0.09 / (i + 1)) * (0.6 + Math.random()), f: Math.random() * Math.PI * 2 }));
    const venas = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, () => ({ t: Math.random() * Math.PI * 2, w: 0.05 + Math.random() * 0.08, l: 0.12 + Math.random() * 0.22 }));
    const radio = t => {
      let r = 1;
      for (const o of ondas) r += o.a * Math.sin(o.k * t + o.f);
      for (const v of venas) {
        let d = Math.abs(t - v.t); d = Math.min(d, Math.PI * 2 - d);
        r += v.l * Math.exp(-(d * d) / (2 * v.w * v.w));
      }
      return Math.max(r, RADIO_MIN / 0.29) * base;
    };
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 6; // borde apenas suave, como tinta en papel
    ctx.beginPath();
    const pasos = 360;
    for (let i = 0; i <= pasos; i++) {
      const t = (i / pasos) * Math.PI * 2;
      const r = Math.min(radio(t), c - 8);
      const x = c + Math.cos(t) * r, y = c + Math.sin(t) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // Gotas que saltan delante del borde
    for (let i = 0; i < 26; i++) {
      const t = Math.random() * Math.PI * 2;
      const r = Math.min(radio(t) * (1.04 + Math.random() * 0.22), c - 12);
      ctx.beginPath();
      ctx.arc(c + Math.cos(t) * r, c + Math.sin(t) * r, 1.5 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return cv;
  }

  let siguienteMascara = null; // Promise<string|null> con la URL de la próxima mancha
  function prepararMascara() {
    siguienteMascara = new Promise(resolve => {
      try {
        const cv = dibujarMancha();
        if (!cv || !cv.toBlob) return resolve(null);
        cv.toBlob(blob => {
          if (!blob) return resolve(null);
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.src = url;
          (img.decode ? img.decode() : Promise.resolve()).then(() => resolve(url), () => resolve(null));
        }, 'image/png');
      } catch (e) { resolve(null); }
    });
  }

  let transicion = null;
  let urlEnUso = null;

  function centroBoton(btn, evento) {
    if (evento && evento.clientX && evento.clientY) return { x: evento.clientX, y: evento.clientY };
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function cambiarConFundido(tema) {
    if (reduceMotion.matches) { aplicar(tema); return; }
    root.classList.add('mp-tema-fade');
    aplicar(tema);
    setTimeout(() => root.classList.remove('mp-tema-fade'), 420);
  }

  let esperando = false;
  const MASK = (window.CSS && CSS.supports && CSS.supports('mask-size', '1px 1px'))
    ? { size: 'maskSize', pos: 'maskPosition' }
    : { size: 'webkitMaskSize', pos: 'webkitMaskPosition' };

  // Toques muy seguidos: se ignoran los que llegan a menos de 250 ms del anterior
  let ultimoToque = 0, generacion = 0, ultimoCambio = -1e9;
  function terminarTinta() {
    const t = transicion;
    transicion = null;
    if (t) { try { t.skipTransition(); } catch (e) { /* ya terminó */ } }
    root.classList.remove('mp-tinta', 'mp-tema-ya');
  }

  async function alternar(btn, evento) {
    const ahora = performance.now();
    if (ahora - ultimoToque < 250) return;
    ultimoToque = ahora;
    // Cada toque pasa al siguiente: claro -> mixto -> oscuro -> claro
    const oscuro = siguienteTema(temaActual());
    guardar(oscuro);
    const mia = ++generacion; // solo cuenta el último toque

    // Si la tinta anterior sigue corriendo (o preparándose), no se apila otra:
    // se termina de una y el modo nuevo entra con un fundido corto.
    // Toques seguidos (menos de 1,5 s): fundido rápido, sin tinta, para que no se trabe
    const seguido = ahora - ultimoCambio < 1500;
    ultimoCambio = ahora;
    if (transicion || esperando || seguido) { terminarTinta(); cambiarConFundido(oscuro); return; }

    if (!document.startViewTransition || reduceMotion.matches) { cambiarConFundido(oscuro); return; }

    if (!siguienteMascara) prepararMascara();
    esperando = true;
    let url = null;
    try { url = await siguienteMascara; } finally { esperando = false; }
    prepararMascara(); // la próxima mancha queda lista desde ya
    if (mia !== generacion) return; // otro toque llegó mientras se preparaba la mancha
    if (!url) { cambiarConFundido(oscuro); return; }

    const { x, y } = centroBoton(btn, evento);
    const w = document.documentElement.clientWidth, h = window.innerHeight;
    const lejos = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
    const D = Math.ceil(lejos / RADIO_MIN) + 40; // tamaño final: el borde más corto ya pasó la esquina más lejana

    root.style.setProperty('--mp-tinta', `url("${url}")`);
    root.classList.add('mp-tinta', 'mp-tema-ya');

    try {
      transicion = document.startViewTransition(() => aplicar(oscuro));
    } catch (e) {
      root.classList.remove('mp-tinta', 'mp-tema-ya');
      cambiarConFundido(oscuro);
      return;
    }
    const t = transicion;

    // Durante la tinta el navegador manda los toques a la transición, no a la
    // página: cualquier toque la termina de una (y si fue en el botón, cambia de modo).
    const alTocar = e => {
      if (transicion !== t) return;
      const r = btn.getBoundingClientRect();
      const enBoton = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      terminarTinta();
      if (enBoton) { e.preventDefault(); ultimoToque = 0; alternar(btn, e).catch(() => {}); }
    };
    document.addEventListener('pointerdown', alTocar, true);

    t.ready.then(() => {
      root.animate({
        [MASK.size]: ['0px 0px', `${D}px ${D}px`],
        [MASK.pos]: [`${x}px ${y}px`, `${x - D / 2}px ${y - D / 2}px`],
      }, {
        duration: 1300,
        easing: 'cubic-bezier(.5, .05, .3, 1)', // arranca como una gota y se riega despacio al final
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      });
    }).catch(() => { /* la transición se saltó: el tema ya quedó aplicado */ });

    t.finished.catch(() => {}).finally(() => {
      document.removeEventListener('pointerdown', alTocar, true);
      // Un clic nuevo pudo empezar otra mancha: solo la última limpia
      if (transicion === t) { transicion = null; root.classList.remove('mp-tinta', 'mp-tema-ya'); }
      if (urlEnUso && urlEnUso !== url) URL.revokeObjectURL(urlEnUso);
      urlEnUso = url;
    });
  }

  /* ---------- Botón ---------- */
  // Modo mixto: un círculo mitad lleno (mitad claro, mitad oscuro)
  const MEDIO = '<g class="tema-medio"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></g>';
  function asegurarIconoMixto(btn) {
    const svg = btn && btn.querySelector('svg');
    if (svg && !svg.querySelector('.tema-medio')) svg.insertAdjacentHTML('beforeend', MEDIO);
  }
  const ICONO = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <mask id="mp-tema-luna"><rect x="-6" y="-6" width="36" height="36" fill="#fff"/><circle class="tema-sombra" cx="30" cy="-6" r="5" fill="#000"/></mask>
    <circle class="tema-disco" cx="12" cy="12" r="5" fill="currentColor" mask="url(#mp-tema-luna)"/>
    <g class="tema-rayos" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M12 1.5v2.2M12 20.3v2.2M1.5 12h2.2M20.3 12h2.2M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5"/>
    </g>
    ${MEDIO}
  </svg>`;

  function crearBoton() {
    // El botón ya viene en el HTML (así no mueve la barra al cargar): solo se activa
    const existente = document.querySelector('.tema-toggle');
    if (existente) {
      if (!existente.querySelector('svg')) existente.innerHTML = ICONO;
      if (!existente.dataset.listo) {
        existente.dataset.listo = '1';
        existente.addEventListener('click', e => { alternar(existente, e).catch(err => { console.warn('[tema]', err); cambiarConFundido(siguienteTema(temaActual())); }); });
      }
      return existente;
    }
    // Respaldo: si una página no lo trae, se crea. Paneles: el lugar lo marca data-tema-slot
    const slot = document.querySelector('[data-tema-slot]');
    if (slot) {
      let b = slot.querySelector('.tema-toggle');
      if (b) return b;
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'tema-toggle' + (PANEL ? ' tema-toggle--panel' : '');
      b.innerHTML = ICONO;
      slot.insertBefore(b, slot.firstElementChild);
      b.addEventListener('click', e => { alternar(b, e).catch(err => { console.warn('[tema]', err); cambiarConFundido(siguienteTema(temaActual())); }); });
      return b;
    }
    let lugar = document.querySelector('.nav .nav-right');
    const fila = document.querySelector('.nav .nav-row');
    if (!lugar && fila) {
      // Barras sin grupo derecho (login, empresa): el botón va junto a "Volver"
      lugar = document.createElement('div');
      lugar.className = 'nav-right';
      const volver = fila.querySelector('.auth-back');
      fila.appendChild(lugar);
      if (volver) lugar.appendChild(volver);
    }
    if (!lugar || lugar.querySelector('.tema-toggle')) return lugar && lugar.querySelector('.tema-toggle');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tema-toggle';
    btn.innerHTML = ICONO;
    const antes = lugar.querySelector('.nav-login, .nav-cta, .auth-back, .nav-burger');
    lugar.insertBefore(btn, antes || null);
    btn.addEventListener('click', e => { alternar(btn, e).catch(err => { console.warn('[tema]', err); cambiarConFundido(siguienteTema(temaActual())); }); });
    return btn;
  }

  /* ---------- Inicio ---------- */
  function init() {
    try { crearBoton(); document.querySelectorAll('.tema-toggle').forEach(asegurarIconoMixto); } catch (e) { console.warn('[tema] botón', e); }
    vigilarLogosBarra();
    sincronizar();

    // Si otra parte de la página cambia el tema (ajustes del dashboard), el botón se entera
    if ('MutationObserver' in window) {
      let antes = temaActual();
      new MutationObserver(() => { const ahora = temaActual(); if (ahora !== antes) { antes = ahora; sincronizar(); } })
        .observe(root, { attributes: true, attributeFilter: ['class'] });
    }
    // Otra pestaña cambió el tema: se aplica aquí también
    window.addEventListener('storage', e => {
      if (e.key !== LLAVE) return;
      const t = e.newValue;
      const tema = TEMAS.includes(t) ? t : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
      if (tema !== temaActual()) aplicar(tema);
    });

    // El logo de la barra cambia cuando la barra cambia de fondo (scroll, menú, tema)
    const nav = document.querySelector('.nav');
    if (nav && 'MutationObserver' in window) {
      const mo = new MutationObserver(programarLogos);
      mo.observe(nav, { attributes: true, attributeFilter: ['class'] });
      mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    // Si el sistema cambia y la persona nunca eligió, se sigue al sistema
    const sistema = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiarSistema = () => {
      let t = null;
      try { t = localStorage.getItem(LLAVE); } catch (e) { /* nada */ }
      if (!TEMAS.includes(t)) aplicar(sistema.matches ? 'oscuro' : 'claro');
    };
    try { sistema.addEventListener('change', alCambiarSistema); } catch (e) { /* navegador viejo */ }

    let r = 0;
    window.addEventListener('resize', () => { clearTimeout(r); r = setTimeout(() => { try { ajustarLogosPagina(); } catch (e) { /* nada */ } }, 300); });

    if (document.startViewTransition && !reduceMotion.matches) {
      ('requestIdleCallback' in window ? requestIdleCallback : setTimeout)(prepararMascara);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
