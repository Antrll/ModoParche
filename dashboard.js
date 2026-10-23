/* =========================================================
   MODOPARCHE — DASHBOARD  ·  Urbano / Brutalista Premium
   Secciones:
   1. Datos y configuración
   2. Utilidades
   3. Estado y almacenamiento
   4. Skeleton loaders
   5. SVGs de estados vacíos
   6. Render de tarjetas y vistas
   7. Navegación entre vistas
   8. Mapa (Leaflet)
   9. Modales (crear, editar, detalle)
   10. Editar / Eliminar parches
   11. Reservas
   12. Header: buscador, notificaciones, menú móvil
   13. Arranque
   ========================================================= */
(() => {
  'use strict';

  /* =======================================================
     1. DATOS Y CONFIGURACIÓN
  ======================================================= */

  const USER = {
    nombre: 'Camilo Rojas',
    ciudad: 'Villavicencio, Meta',
    intereses: ['Comida', 'Aventura', 'Rumba']
  };

  const MAP_CENTER = [4.142, -73.6266];

  const CATEGORIAS = {
    Rumba:    { emoji: '🎉' },
    Comida:   { emoji: '☕' },
    Aventura: { emoji: '🥾' },
    Deporte:  { emoji: '⚽' },
    Cultura:  { emoji: '🎭' },
    Gaming:   { emoji: '🎮' }
  };

  const CAT_GRADIENTS = {
    Rumba:    'linear-gradient(135deg, #111 0%, #5b1d8f 100%)',
    Comida:   'linear-gradient(135deg, #ff751f 0%, #ffb27a 100%)',
    Aventura: 'linear-gradient(135deg, #0f5132 0%, #4ade80 100%)',
    Deporte:  'linear-gradient(135deg, #0b3d91 0%, #60a5fa 100%)',
    Cultura:  'linear-gradient(135deg, #7a1f3d 0%, #f472b6 100%)',
    Gaming:   'linear-gradient(135deg, #111 0%, #ff751f 100%)'
  };

  const enHoras = (h) => new Date(Date.now() + h * 3600 * 1000);

  const PARCHES_BASE = [
    {
      id: 'p1', titulo: 'Cata de café de origen', categoria: 'Comida',
      ubicacion: 'Los Centauros, Barzal', fecha: enHoras(3), cupos: 8, asistentes: 6,
      match: 92, organizador: 'Café Origen Barzal', lat: 4.1533, lng: -73.6349, img: '',
      descripcion: 'Cinco cafés de fincas del Meta y del Huila, preparados en distintos métodos. Incluye pan artesanal para acompañar.'
    },
    {
      id: 'p2', titulo: 'Caminata al atardecer', categoria: 'Aventura',
      ubicacion: 'Kirpas Ecoparque, vía Catama', fecha: enHoras(2.5), cupos: 12, asistentes: 7,
      match: 87, organizador: 'Llanos Trekking', lat: 4.0912, lng: -73.6035, img: '',
      descripcion: 'Recorrido de dos horas por senderos del ecoparque, con parada en el mirador para ver el atardecer llanero. Lleva agua y repelente.'
    },
    {
      id: 'p3', titulo: 'Trivia + cerveza artesanal', categoria: 'Rumba',
      ubicacion: 'Malecón del Guatiquía', fecha: enHoras(6), cupos: 6, asistentes: 3,
      match: 79, organizador: 'Laura M.', lat: 4.1469, lng: -73.6391, img: '',
      descripcion: 'Trivia por equipos de cultura general y Llanos. Los ganadores se llevan una ronda de cerveza artesanal.'
    },
    {
      id: 'p4', titulo: 'Torneo FIFA 1 vs 1', categoria: 'Gaming',
      ubicacion: 'Centro Comercial Primavera Urbana', fecha: enHoras(26), cupos: 16, asistentes: 11,
      match: 64, organizador: 'Villavo Gamers', lat: 4.1385, lng: -73.6142, img: '',
      descripcion: 'Eliminación directa, partidos de 6 minutos. Consolas y controles incluidos. Inscripción gratuita.'
    },
    {
      id: 'p5', titulo: 'Microfútbol mixto', categoria: 'Deporte',
      ubicacion: 'Parque Los Fundadores', fecha: enHoras(28), cupos: 14, asistentes: 14,
      match: 71, organizador: 'Parche Deportivo', lat: 4.1418, lng: -73.6262, img: '',
      descripcion: 'Partidos rotativos de 20 minutos. Vengan con guayos o tenis de cancha y ganas de sudar.'
    },
    {
      id: 'p6', titulo: 'Noche de salsa y joropo', categoria: 'Rumba',
      ubicacion: 'Bar La Cabaña Llanera', fecha: enHoras(30), cupos: 30, asistentes: 18,
      match: 83, organizador: 'La Cabaña Llanera', lat: 4.1502, lng: -73.6335, img: '',
      descripcion: 'Clase corta de joropo a las 8:00 PM y después pista abierta con música en vivo. Mesa reservada para grupos.'
    },
    {
      id: 'p7', titulo: 'Mercado de artesanos llaneros', categoria: 'Cultura',
      ubicacion: 'Plaza Los Libertadores', fecha: enHoras(50), cupos: 40, asistentes: 22,
      match: 58, organizador: 'Casa de la Cultura', lat: 4.1436, lng: -73.6288, img: '',
      descripcion: 'Talleres de cestería y cerámica, música en vivo y comida típica. Ideal para ir en familia o con amigos.'
    },
    {
      id: 'p8', titulo: 'Rodada al Mirador Buenavista', categoria: 'Aventura',
      ubicacion: 'Mirador Buenavista', fecha: enHoras(52), cupos: 20, asistentes: 9,
      match: 76, organizador: 'Ciclistas del Llano', lat: 4.1789, lng: -73.6117, img: '',
      descripcion: 'Ruta de 18 km a ritmo tranquilo, con hidratación en el camino. Casco obligatorio.'
    }
  ];

  const KEY_RESERVAS = 'mp_reservas';
  const KEY_CREADOS = 'mp_parches_creados';

  /* =======================================================
     2. UTILIDADES
  ======================================================= */

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const esc = (str) => String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const iniciales = (nombre) => nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const mismoDia = (a, b) => a.toDateString() === b.toDateString();

  function formatearFecha(fecha) {
    const hora = fecha.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(/\s?[ap]\.?\s?m\.?/i, (m) => ' ' + (/a/i.test(m) ? 'AM' : 'PM'));
    const hoy = new Date();
    const manana = new Date(); manana.setDate(hoy.getDate() + 1);
    if (mismoDia(fecha, hoy)) return `Hoy · ${hora}`;
    if (mismoDia(fecha, manana)) return `Mañana · ${hora}`;
    const dia = fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${dia} · ${hora}`;
  }

  function paraInputFecha(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const ICONO = {
    lugar: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    reloj: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    gente: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.2.7 3.5 2.6 3.5 5.5"/></svg>'
  };

  /* =======================================================
     3. ESTADO Y ALMACENAMIENTO
  ======================================================= */

  function leerLS(clave, defecto) {
    try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : defecto; }
    catch (e) { return defecto; }
  }

  function guardarLS(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* privado */ }
  }

  const state = {
    parches: [],
    reservas: new Set(leerLS(KEY_RESERVAS, [])),
    filtroCategoria: 'Todos',
    busqueda: '',
    vistaActual: 'inicio',
    modalPrevioFoco: null
  };

  function cargarParches() {
    const creados = leerLS(KEY_CREADOS, []).map((p) => ({ ...p, fecha: new Date(p.fecha) }));
    state.parches = [...creados, ...PARCHES_BASE];
  }

  const porId = (id) => state.parches.find((p) => p.id === id);
  const estaReservado = (p) => state.reservas.has(p.id);
  const totalAsistentes = (p) => p.asistentes + (estaReservado(p) && !p.propio ? 1 : 0);
  const estaLleno = (p) => totalAsistentes(p) >= p.cupos;

  /* =======================================================
     4. SKELETON LOADERS
  ======================================================= */

  function skeletonCardHTML() {
    return `<div class="skeleton-card">
      <div class="skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>`;
  }

  function mostrarSkeletons(gridId, count = 4) {
    const grid = $(gridId);
    if (!grid) return;
    grid.innerHTML = Array.from({ length: count }, () => skeletonCardHTML()).join('');
  }

  /* =======================================================
     5. SVGs DE ESTADOS VACÍOS
  ======================================================= */

  const EMPTY_SVG = {
    explorar: `<div class="empty-svg"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="60" cy="60" r="45" opacity=".15" fill="currentColor" stroke="none"/>
      <circle cx="60" cy="60" r="36"/><path d="M72 48l-8 20-20 8 8-20z" fill="currentColor" opacity=".2"/>
      <path d="M72 48l-8 20-20 8 8-20z"/><circle cx="60" cy="60" r="3" fill="currentColor"/>
    </svg></div>`,
    reservas: `<div class="empty-svg"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="60" cy="60" r="45" opacity=".15" fill="currentColor" stroke="none"/>
      <rect x="28" y="32" width="64" height="58" rx="8"/><path d="M28 50h64"/>
      <path d="M44 24v16M76 24v16"/>
      <circle cx="50" cy="68" r="4" fill="currentColor" opacity=".3"/><circle cx="70" cy="68" r="4" fill="currentColor" opacity=".3"/>
      <circle cx="50" cy="78" r="4" fill="currentColor" opacity=".3"/>
    </svg></div>`,
    busqueda: `<div class="empty-svg"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="60" cy="60" r="45" opacity=".15" fill="currentColor" stroke="none"/>
      <circle cx="52" cy="52" r="22"/><path d="M68 68l18 18" stroke-width="3"/>
      <path d="M42 52h20M52 42v20" opacity=".3"/>
    </svg></div>`,
    inicio: `<div class="empty-svg"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="60" cy="60" r="45" opacity=".15" fill="currentColor" stroke="none"/>
      <path d="M60 30v12M60 78v12M30 60h12M78 60h12"/>
      <circle cx="60" cy="60" r="18"/><path d="M60 48v12l8 4"/>
    </svg></div>`
  };

  /* =======================================================
     6. RENDER DE TARJETAS Y VISTAS
  ======================================================= */

  const estiloPortada = (p) => (p.img ? `style="background-image:url('${esc(p.img)}')"` : '');
  const clasePortada = (p) => (p.img ? '' : `cat-${p.categoria}`);

  function tarjetaHTML(p) {
    const total = totalAsistentes(p);
    const pct = Math.min(100, Math.round((total / p.cupos) * 100));
    const faltan = p.cupos - total;
    const reservado = estaReservado(p);
    const fireBadge = (faltan > 0 && faltan < 3) ? '<span class="fire-badge">🔥</span>' : '';

    return `
      <article class="card">
        <div class="cover ${clasePortada(p)}" ${estiloPortada(p)}>
          <span class="cover-tag">${esc(p.categoria)}</span>
          ${p.match ? `<span class="cover-match">${p.match}% match</span>` : ''}
          ${p.img ? '' : `<span aria-hidden="true">${CATEGORIAS[p.categoria]?.emoji || '✨'}</span>`}
        </div>
        <div class="card-body">
          <h3 class="card-title">${esc(p.titulo)}${fireBadge}</h3>
          <ul class="card-meta">
            <li>${ICONO.lugar}${esc(p.ubicacion)}</li>
            <li>${ICONO.reloj}${formatearFecha(p.fecha)}</li>
          </ul>
          <div class="attendees">
            <div class="attendees-label">
              <span>${total} confirmados</span>
              <span class="left">${faltan > 0 ? `Faltan ${faltan} de ${p.cupos}` : 'Cupos llenos'}${fireBadge && faltan > 0 ? ' · ¡Últimos cupos!' : ''}</span>
            </div>
            <div class="bar"><div class="bar-fill ${faltan <= 0 ? 'full' : ''}" style="width:${pct}%"></div></div>
          </div>
          <div class="card-actions">
            <button class="btn-secondary" data-action="detalle" data-id="${p.id}">Ver detalles</button>
            ${reservado ? '' : (faltan > 0
              ? `<button class="btn-primary" data-action="unirme" data-id="${p.id}">Unirme</button>`
              : '')}
          </div>
        </div>
      </article>`;
  }

  function estadoVacioHTML(tipo, titulo, texto, botonHTML = '') {
    const svg = EMPTY_SVG[tipo] || EMPTY_SVG.inicio;
    return `<div class="empty">${svg}<h3>${titulo}</h3><p>${texto}</p>${botonHTML}</div>`;
  }

  const parchesVigentes = () => state.parches
    .filter((p) => p.fecha.getTime() > Date.now() - 2 * 3600 * 1000)
    .sort((a, b) => a.fecha - b.fecha);

  /* ---------- Inicio (con skeleton) ---------- */
  function renderInicio() {
    const vigentes = parchesVigentes();
    const proximos = vigentes.filter((p) => estaReservado(p));

    $('#stats').innerHTML = `
      <div class="stat"><b>${vigentes.length}</b><span>parches abiertos</span></div>
      <div class="stat"><b>${state.reservas.size}</b><span>reservas tuyas</span></div>
      <div class="stat"><b>${proximos.length ? formatearFecha(proximos[0].fecha).split(' · ')[0] : '—'}</b><span>tu próximo parche</span></div>`;

    const recomendados = [...vigentes]
      .filter((p) => !estaLleno(p) || estaReservado(p))
      .sort((a, b) => (b.match || 0) - (a.match || 0))
      .slice(0, 6);

    if (!state._inicioRendered) {
      mostrarSkeletons('#grid-inicio', Math.min(recomendados.length || 4, 6));
      setTimeout(() => { inyectarTarjetas('#grid-inicio', recomendados, 'inicio'); state._inicioRendered = true; }, 500);
    } else {
      inyectarTarjetas('#grid-inicio', recomendados, 'inicio');
    }
  }

  /* ---------- Explorar ---------- */
  function renderChips() {
    const cats = ['Todos', ...Object.keys(CATEGORIAS)];
    $('#chips').innerHTML = cats.map((c) => `
      <button class="chip ${state.filtroCategoria === c ? 'active' : ''}" data-cat="${c}" aria-pressed="${state.filtroCategoria === c}">${c}</button>
    `).join('');
  }

  function filtrarParches() {
    const q = state.busqueda.trim().toLowerCase();
    return parchesVigentes().filter((p) => {
      const okCat = state.filtroCategoria === 'Todos' || p.categoria === state.filtroCategoria;
      const okTexto = !q || [p.titulo, p.ubicacion, p.categoria, p.descripcion].some((t) => t.toLowerCase().includes(q));
      return okCat && okTexto;
    });
  }

  function renderExplorar() {
    renderChips();
    const lista = filtrarParches();
    $('#result-count').textContent = `${lista.length} ${lista.length === 1 ? 'parche' : 'parches'}`;

    if (!state._explorarRendered) {
      mostrarSkeletons('#grid-explorar', Math.min(lista.length || 4, 6));
      setTimeout(() => { inyectarTarjetas('#grid-explorar', lista, 'explorar'); state._explorarRendered = true; }, 500);
    } else {
      inyectarTarjetas('#grid-explorar', lista, 'explorar');
    }
  }

  function inyectarTarjetas(gridSel, lista, tipo) {
    const grid = $(gridSel);
    if (!grid) return;
    if (lista.length) {
      grid.innerHTML = lista.map(tarjetaHTML).join('');
    } else {
      const textos = {
        inicio: ['Todavía no hay parches', 'Sé el primero en abrir uno.'],
        explorar: ['Nada por aquí', 'No hay parches con ese filtro. Prueba otra categoría o abre el tuyo.']
      };
      const [t, d] = textos[tipo] || textos.inicio;
      grid.innerHTML = estadoVacioHTML(tipo === 'explorar' && state.busqueda ? 'busqueda' : tipo,
        t, d, '<button class="btn-primary" data-action="crear">Abrir el parche</button>');
    }
  }

  /* ---------- Mis reservas ---------- */
  function renderReservas() {
    const mios = state.parches.filter(estaReservado).sort((a, b) => a.fecha - b.fecha);

    $('#reserva-list').innerHTML = mios.length
      ? mios.map((p) => `
        <article class="reserva">
          <div class="reserva-icon ${clasePortada(p)}" ${estiloPortada(p)}>${p.img ? '' : (CATEGORIAS[p.categoria]?.emoji || '✨')}</div>
          <div class="reserva-info">
            <h3>${esc(p.titulo)}</h3>
            <p>${formatearFecha(p.fecha)} · ${esc(p.ubicacion)}</p>
          </div>
          <div class="reserva-actions">
            <button class="btn-secondary" data-action="detalle" data-id="${p.id}">Ver detalles</button>
            ${p.propio ? '' : `<button class="btn-danger" data-action="cancelar" data-id="${p.id}">Abrirse del parche</button>`}
          </div>
        </article>`).join('')
      : estadoVacioHTML('reservas', 'Aún no tienes reservas',
          'Cuando te unas a un parche, aparece aquí.',
          '<button class="btn-primary" data-action="ir-explorar">Explorar parches</button>');
  }

  /* ---------- Perfil ---------- */
  function renderPerfil() {
    const creados = state.parches.filter((p) => p.propio).length;
    $('#profile-card').innerHTML = `
      <div class="profile-side">
        <div class="avatar-lg">${esc(iniciales(USER.nombre))}</div>
        <h3>${esc(USER.nombre)}</h3>
        <p>${esc(USER.ciudad)}</p>
      </div>
      <div class="profile-main">
        <div class="profile-block">
          <h4>Tus intereses</h4>
          <div class="pill-row">${USER.intereses.map((i) => `<span class="pill">${esc(i)}</span>`).join('')}</div>
        </div>
        <div class="profile-block">
          <h4>Tu actividad</h4>
          <div class="profile-stats">
            <div><b>${state.reservas.size}</b><span>parches reservados</span></div>
            <div><b>${creados}</b><span>parches abiertos por ti</span></div>
            <div><b>${USER.intereses.length}</b><span>categorías favoritas</span></div>
          </div>
        </div>
      </div>`;
  }

  function renderTodo() {
    renderInicio();
    renderExplorar();
    renderReservas();
    renderPerfil();
    actualizarContadorReservas();
    if (mapa) actualizarMarcadores();
  }

  function actualizarContadorReservas() {
    const n = state.reservas.size;
    const badge = $('#nav-reservas-count');
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  /* =======================================================
     7. NAVEGACIÓN ENTRE VISTAS
  ======================================================= */

  const VISTAS = ['inicio', 'explorar', 'mapa', 'reservas', 'perfil'];

  function irA(vista, { actualizarHash = true } = {}) {
    if (!VISTAS.includes(vista)) vista = 'inicio';
    state.vistaActual = vista;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${vista}`));
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === vista));
    if (vista === 'mapa') mostrarMapa();
    if (actualizarHash) history.replaceState(null, '', `#${vista}`);
    cerrarSidebar();
    window.scrollTo({ top: 0 });
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-view]');
    if (el) irA(el.dataset.view);
  });

  /* =======================================================
     8. MAPA (Leaflet + OpenStreetMap)
  ======================================================= */

  let mapa = null;
  let capaMarcadores = null;
  let marcadoresPorId = {};

  function mostrarMapa() {
    const contenedor = $('#mapa-parches');
    if (typeof L === 'undefined') {
      contenedor.innerHTML = '<div class="map-fallback"><p>No se pudo cargar el mapa. Revisa tu conexión y recarga la página.</p></div>';
      return;
    }
    if (!mapa) {
      mapa = L.map(contenedor, { zoomControl: true }).setView(MAP_CENTER, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; Colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(mapa);
      capaMarcadores = L.layerGroup().addTo(mapa);
      actualizarMarcadores();
    }
    setTimeout(() => mapa.invalidateSize(), 60);
  }

  function actualizarMarcadores() {
    if (!capaMarcadores) return;
    capaMarcadores.clearLayers();
    marcadoresPorId = {};
    parchesVigentes().forEach((p) => {
      const icono = L.divIcon({
        className: 'pin',
        html: `<div class="pin-body"><i>${CATEGORIAS[p.categoria]?.emoji || '✨'}</i></div>`,
        iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -38]
      });
      const marcador = L.marker([p.lat, p.lng], { icon: icono, title: p.titulo })
        .bindPopup(`
          <div class="pop-title">${esc(p.titulo)}</div>
          <div class="pop-meta">${formatearFecha(p.fecha)} · ${esc(p.ubicacion)}</div>
          <button class="pop-btn" data-action="detalle" data-id="${p.id}">Ver detalles</button>`)
        .addTo(capaMarcadores);
      marcadoresPorId[p.id] = marcador;
    });
  }

  /* =======================================================
     9. MODALES
  ======================================================= */

  function abrirModal(modal) {
    state.modalPrevioFoco = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    const primero = $('input, select, textarea, button.btn-primary, .modal-close', modal);
    setTimeout(() => primero && primero.focus(), 50);
  }

  function cerrarModal(modal) {
    modal.hidden = true;
    if ($$('.modal-backdrop').every((m) => m.hidden)) document.body.classList.remove('no-scroll');
    if (state.modalPrevioFoco) state.modalPrevioFoco.focus?.();
  }

  const cerrarTodosLosModales = () => $$('.modal-backdrop').forEach((m) => { if (!m.hidden) cerrarModal(m); });

  $$('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close]')) cerrarModal(backdrop);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { cerrarTodosLosModales(); cerrarSidebar(); cerrarNotificaciones(); }
  });

  /* ---------- Modal: Crear / Editar parche ---------- */
  const formCrear = $('#form-create');
  let miniMapa = null;
  let miniMapaMarcador = null;
  let coordsSeleccionadas = null;

  // ── MODO EDICIÓN: null = crear nuevo, string = ID del parche a editar ──
  let editandoId = null;

  const VALIDACIONES = {
    titulo:      { msg: 'Dale un nombre a tu parche.',        test: (v) => v.trim().length >= 3 },
    ubicacion:   { msg: 'Indica dónde será el parche.',       test: (v) => v.trim().length >= 3 },
    descripcion: { msg: 'Cuéntale a la gente qué se hará.',   test: (v) => v.trim().length >= 10 },
    fecha:       { msg: 'Elige una fecha futura.',             test: (v) => { const d = new Date(v); return !isNaN(d) && d.getTime() > Date.now(); }},
    cupos:       { msg: 'Mínimo 2 cupos.',                    test: (v) => parseInt(v, 10) >= 2 }
  };

  function validarCampo(name) {
    const input = $(`[name="${name}"]`, formCrear);
    const errSpan = $(`#err-${name}`);
    if (!input || !errSpan) return true;
    const val = input.value;
    const regla = VALIDACIONES[name];
    if (!regla) return true;
    const valido = regla.test(val);
    input.classList.toggle('invalid', !valido);
    errSpan.textContent = valido ? '' : regla.msg;
    errSpan.classList.toggle('visible', !valido);
    return valido;
  }

  function limpiarValidaciones() {
    $$('.field-error', formCrear).forEach((el) => { el.textContent = ''; el.classList.remove('visible'); });
    $$('.invalid', formCrear).forEach((el) => el.classList.remove('invalid'));
  }

  function configurarValidacionInline() {
    Object.keys(VALIDACIONES).forEach((name) => {
      const input = $(`[name="${name}"]`, formCrear);
      if (!input) return;
      input.addEventListener('blur', () => validarCampo(name));
      input.addEventListener('input', () => {
        const regla = VALIDACIONES[name];
        if (regla && regla.test(input.value)) {
          input.classList.remove('invalid');
          const errSpan = $(`#err-${name}`);
          if (errSpan) { errSpan.textContent = ''; errSpan.classList.remove('visible'); }
        }
      });
    });
  }

  function actualizarPreviewCategoria() {
    const sel = $('#f-categoria');
    const preview = $('#create-preview');
    const emoji = $('#create-preview-emoji');
    if (!sel || !preview || !emoji) return;
    const cat = sel.value;
    preview.style.background = CAT_GRADIENTS[cat] || CAT_GRADIENTS.Rumba;
    emoji.textContent = CATEGORIAS[cat]?.emoji || '🎉';
  }

  function inicializarMiniMapa(centroLat, centroLng) {
    if (typeof L === 'undefined') return;
    const contenedor = $('#mini-mapa-crear');
    if (!contenedor) return;

    if (miniMapa) { miniMapa.remove(); miniMapa = null; miniMapaMarcador = null; }
    coordsSeleccionadas = null;

    const centro = [centroLat || MAP_CENTER[0], centroLng || MAP_CENTER[1]];
    const zoom = (centroLat && centroLng) ? 15 : 13;

    setTimeout(() => {
      miniMapa = L.map(contenedor, { zoomControl: false, attributionControl: false }).setView(centro, zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMapa);

      // Si estamos editando, poner marcador en la ubicación existente
      if (centroLat && centroLng) {
        coordsSeleccionadas = { lat: centroLat, lng: centroLng };
        miniMapaMarcador = L.marker(centro, {
          icon: L.divIcon({ className: 'pin', html: '<div class="pin-body"><i>📍</i></div>', iconSize: [40, 40], iconAnchor: [20, 40] })
        }).addTo(miniMapa);
      }

      miniMapa.on('click', (e) => {
        coordsSeleccionadas = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (miniMapaMarcador) {
          miniMapaMarcador.setLatLng(e.latlng);
        } else {
          miniMapaMarcador = L.marker(e.latlng, {
            icon: L.divIcon({ className: 'pin', html: '<div class="pin-body"><i>📍</i></div>', iconSize: [40, 40], iconAnchor: [20, 40] })
          }).addTo(miniMapa);
        }
      });

      miniMapa.invalidateSize();
    }, 250);
  }

  function abrirModalCrear() {
    editandoId = null; // Modo crear
    formCrear.reset();
    $('#modal-create-title').textContent = 'Abrir el parche';
    $('.btn-primary[type="submit"]', formCrear).textContent = 'Publicar parche';

    $('#f-categoria').innerHTML = Object.keys(CATEGORIAS).map((c) => `<option value="${c}">${c}</option>`).join('');
    const min = new Date();
    $('#f-fecha').min = paraInputFecha(min);
    $('#f-fecha').value = paraInputFecha(enHoras(2));

    limpiarValidaciones();
    actualizarPreviewCategoria();
    abrirModal($('#modal-create'));
    inicializarMiniMapa();
  }

  document.addEventListener('change', (e) => {
    if (e.target.id === 'f-categoria') actualizarPreviewCategoria();
  });

  /* ── Submit: crea nuevo o actualiza existente ── */
  formCrear.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(formCrear).entries());

    limpiarValidaciones();
    const campos = ['titulo', 'ubicacion', 'descripcion', 'fecha', 'cupos'];
    const resultados = campos.map(validarCampo);
    if (resultados.some((v) => !v)) return;

    const fecha = new Date(datos.fecha);
    const cupos = parseInt(datos.cupos, 10);

    const lat = coordsSeleccionadas ? coordsSeleccionadas.lat : MAP_CENTER[0] + (Math.random() - 0.5) * 0.04;
    const lng = coordsSeleccionadas ? coordsSeleccionadas.lng : MAP_CENTER[1] + (Math.random() - 0.5) * 0.05;

    if (editandoId) {
      /* ═══ MODO EDITAR: actualizar parche existente ═══ */
      const p = porId(editandoId);
      if (!p) return;

      p.titulo = datos.titulo.trim();
      p.categoria = datos.categoria;
      p.ubicacion = datos.ubicacion.trim();
      p.fecha = fecha;
      p.cupos = cupos;
      p.descripcion = datos.descripcion.trim();
      if (coordsSeleccionadas) { p.lat = lat; p.lng = lng; }

      // Actualizar en localStorage
      const creados = leerLS(KEY_CREADOS, []);
      const idx = creados.findIndex((x) => x.id === editandoId);
      if (idx !== -1) {
        creados[idx] = { ...p, fecha: p.fecha.toISOString() };
        guardarLS(KEY_CREADOS, creados);
      }

      editandoId = null;
      formCrear.reset();
      cerrarModal($('#modal-create'));
      state._inicioRendered = true;
      state._explorarRendered = true;
      renderTodo();
      mostrarToast('Parche actualizado. ¡Los cambios ya están en vivo!');

    } else {
      /* ═══ MODO CREAR: nuevo parche ═══ */
      const nuevo = {
        id: 'u' + Date.now(),
        titulo: datos.titulo.trim(),
        categoria: datos.categoria,
        ubicacion: datos.ubicacion.trim(),
        fecha, cupos,
        asistentes: 1,
        match: null,
        organizador: 'Tú',
        propio: true,
        lat, lng,
        img: '',
        descripcion: datos.descripcion.trim()
      };

      const creados = leerLS(KEY_CREADOS, []);
      creados.unshift({ ...nuevo, fecha: fecha.toISOString() });
      guardarLS(KEY_CREADOS, creados);

      if (window.ModoParcheDB) {
        const catMap = { 'Rumba': 1, 'Comida': 2, 'Aventura': 3, 'Deporte': 4, 'Cultura': 5, 'Gaming': 6 };
        window.ModoParcheDB.crearParche({
          titulo: nuevo.titulo,
          descripcion: nuevo.descripcion,
          categoria_id: catMap[nuevo.categoria] || 1,
          ciudad_id: 1,
          lugar: nuevo.ubicacion,
          fecha: nuevo.fecha.toISOString(),
          cupo: nuevo.cupos,
          precio: nuevo.precio,
          organizador_nombre: nuevo.organizador,
          lat: nuevo.lat,
          lng: nuevo.lng
        }).catch(err => console.warn('Error sincronizando parche con Supabase:', err));
      }
      state.parches.unshift(nuevo);
      state.reservas.add(nuevo.id);
      guardarLS(KEY_RESERVAS, [...state.reservas]);

      state._inicioRendered = true;
      state._explorarRendered = true;

      formCrear.reset();
      cerrarModal($('#modal-create'));
      renderTodo();

      // FlyTo al nuevo marcador
      irA('mapa');
      mostrarToast('Parche publicado. ¡Ya está en el mapa!');

      setTimeout(() => {
        if (mapa) {
          mapa.flyTo([nuevo.lat, nuevo.lng], 16, { duration: 1.2 });
          setTimeout(() => {
            const marcador = marcadoresPorId[nuevo.id];
            if (marcador) marcador.openPopup();
          }, 1400);
        }
      }, 300);
    }
  });

  /* =======================================================
     10. EDITAR / ELIMINAR PARCHES
  ======================================================= */

  function editarParche(id) {
    const p = porId(id);
    if (!p || !p.propio) return;

    cerrarTodosLosModales();
    editandoId = id;

    // Abrir modal de creación en modo edición
    $('#f-categoria').innerHTML = Object.keys(CATEGORIAS).map((c) => `<option value="${c}">${c}</option>`).join('');

    // Pre-llenar campos
    $('#f-titulo').value = p.titulo;
    $('#f-categoria').value = p.categoria;
    $('#f-cupos').value = p.cupos;
    $('#f-fecha').value = paraInputFecha(p.fecha);
    $('#f-fecha').min = paraInputFecha(new Date());
    $('#f-ubicacion').value = p.ubicacion;
    $('#f-descripcion').value = p.descripcion;

    // Cambiar título y botón del modal
    $('#modal-create-title').textContent = 'Editar el parche';
    $('.btn-primary[type="submit"]', formCrear).textContent = 'Guardar cambios';

    limpiarValidaciones();
    actualizarPreviewCategoria();
    abrirModal($('#modal-create'));

    // Mini-mapa centrado en la ubicación del parche
    inicializarMiniMapa(p.lat, p.lng);
  }

  function eliminarParche(id) {
    const p = porId(id);
    if (!p || !p.propio) return;

    const nombre = p.titulo;

    // Quitar del estado
    state.parches = state.parches.filter((x) => x.id !== id);
    state.reservas.delete(id);

    // Limpiar localStorage
    const creados = leerLS(KEY_CREADOS, []).filter((x) => x.id !== id);
    guardarLS(KEY_CREADOS, creados);
    guardarLS(KEY_RESERVAS, [...state.reservas]);

    cerrarTodosLosModales();
    state._inicioRendered = true;
    state._explorarRendered = true;
    renderTodo();
    mostrarToast(`"${nombre}" eliminado. Ya no aparece en ningún lado.`);
  }

  /* ---------- Modal: Detalle (con 👑, editar, eliminar, copy localizado) ---------- */
  function abrirDetalle(id) {
    const p = porId(id);
    if (!p) return;

    const total = totalAsistentes(p);
    const faltan = p.cupos - total;
    const reservado = estaReservado(p);
    const fireBadge = (faltan > 0 && faltan < 3) ? ' <span class="fire-badge">🔥</span>' : '';

    // Botón principal según estado
    let boton;
    if (p.propio) boton = '<button class="btn-primary" disabled>Eres el organizador</button>';
    else if (reservado) boton = `<button class="btn-danger" data-action="cancelar" data-id="${p.id}" data-cerrar="1">Abrirse del parche</button>`;
    else if (faltan <= 0) boton = '<button class="btn-primary" disabled>Cupos llenos</button>';
    else boton = `<button class="btn-primary" data-action="unirme" data-id="${p.id}" data-cerrar="1">Unirme al parche</button>`;

    // Botones de gestión (solo para el organizador)
    const gestionHTML = p.propio ? `
      <div class="detail-manage">
        <button class="btn-secondary" data-action="editar" data-id="${p.id}">✏️ Editar parche</button>
        <button class="btn-danger" data-action="eliminar" data-id="${p.id}">🗑️ Eliminar parche</button>
      </div>` : '';

    $('#detail-body').innerHTML = `
      <div class="cover detail-cover ${clasePortada(p)}" ${estiloPortada(p)}>
        <span class="cover-tag">${esc(p.categoria)}</span>
        ${p.match ? `<span class="cover-match" style="right:60px">${p.match}% match</span>` : ''}
        ${p.img ? '' : `<span aria-hidden="true">${CATEGORIAS[p.categoria]?.emoji || '✨'}</span>`}
      </div>
      <div class="detail-content">
        <h2 id="detail-title">${esc(p.titulo)}${fireBadge}</h2>
        <ul class="card-meta">
          <li>${ICONO.lugar}${esc(p.ubicacion)}</li>
          <li>${ICONO.reloj}${formatearFecha(p.fecha)}</li>
          <li>${ICONO.gente}${total} confirmados de ${p.cupos} cupos</li>
        </ul>
        <p class="detail-desc">${esc(p.descripcion)}</p>
        <p class="detail-org"><span class="org-crown">👑</span> Organiza: <b>${esc(p.organizador)}</b></p>
        <div class="modal-actions" style="justify-content:flex-start">
          ${boton}
          <button class="btn-ghost" data-action="ver-en-mapa" data-id="${p.id}">Ver en el mapa</button>
        </div>
        ${gestionHTML}
      </div>`;

    abrirModal($('#modal-detail'));
  }

  /* =======================================================
     11. RESERVAS
  ======================================================= */

  function unirse(id) {
    const p = porId(id);
    if (!p || estaReservado(p)) return;
    if (estaLleno(p)) return mostrarToast('Este parche ya no tiene cupos.');
    state.reservas.add(id);
    guardarLS(KEY_RESERVAS, [...state.reservas]);
    state._inicioRendered = true;
    state._explorarRendered = true;
    renderTodo();
    mostrarToast(`Listo, quedaste en "${p.titulo}".`);
  }

  function cancelar(id) {
    const p = porId(id);
    if (!p || !estaReservado(p)) return;
    state.reservas.delete(id);
    guardarLS(KEY_RESERVAS, [...state.reservas]);
    state._inicioRendered = true;
    state._explorarRendered = true;
    renderTodo();
    mostrarToast(`Te abriste de "${p.titulo}".`);
  }

  /* ---------- Delegación de eventos ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    switch (action) {
      case 'detalle':
        if (mapa) mapa.closePopup();
        abrirDetalle(id);
        break;
      case 'unirme':
        unirse(id);
        if (btn.dataset.cerrar) cerrarTodosLosModales();
        break;
      case 'cancelar':
        cancelar(id);
        if (btn.dataset.cerrar) cerrarTodosLosModales();
        break;
      case 'crear':
        abrirModalCrear();
        break;
      case 'ir-explorar':
        irA('explorar');
        break;
      case 'ver-en-mapa': {
        const p = porId(id);
        cerrarTodosLosModales();
        irA('mapa');
        if (mapa && p) setTimeout(() => mapa.flyTo([p.lat, p.lng], 15, { duration: .8 }), 150);
        break;
      }
      case 'editar':
        editarParche(id);
        break;
      case 'eliminar':
        eliminarParche(id);
        break;
    }
  }, true);

  /* =======================================================
     12. HEADER: BUSCADOR, NOTIFICACIONES, MENÚ MÓVIL
  ======================================================= */

  $('#chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    state.filtroCategoria = chip.dataset.cat;
    state._explorarRendered = true;
    renderExplorar();
  });

  let temporizadorBusqueda;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      state.busqueda = e.target.value;
      state._explorarRendered = true;
      renderExplorar();
      if (state.busqueda.trim() && state.vistaActual !== 'explorar') irA('explorar');
    }, 200);
  });

  $('#btn-create').addEventListener('click', abrirModalCrear);

  const btnNotif = $('#btn-notif');
  const panelNotif = $('#notif-panel');

  function cerrarNotificaciones() {
    panelNotif.hidden = true;
    btnNotif.setAttribute('aria-expanded', 'false');
  }

  btnNotif.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = panelNotif.hidden;
    panelNotif.hidden = !abrir;
    btnNotif.setAttribute('aria-expanded', String(abrir));
    if (abrir) $('#notif-badge').hidden = true;
  });

  document.addEventListener('click', (e) => {
    if (!panelNotif.hidden && !e.target.closest('.notif-wrap')) cerrarNotificaciones();
  });

  const sidebar = $('#sidebar');
  const overlay = $('#sidebar-overlay');
  const btnMenu = $('#btn-menu');

  function abrirSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    btnMenu.setAttribute('aria-expanded', 'true');
  }

  function cerrarSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    btnMenu.setAttribute('aria-expanded', 'false');
  }

  btnMenu.addEventListener('click', () => (sidebar.classList.contains('open') ? cerrarSidebar() : abrirSidebar()));
  overlay.addEventListener('click', cerrarSidebar);

  /* ---------- Toast ---------- */
  let temporizadorToast;
  function mostrarToast(mensaje) {
    const t = $('#toast');
    t.textContent = mensaje;
    t.classList.add('show');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* =======================================================
     13. ARRANQUE
  ======================================================= */

  function iniciar() {
    $('#avatar-top').textContent = iniciales(USER.nombre);
    $('#name-top').textContent = USER.nombre.split(' ')[0];
    $('#welcome-name').textContent = USER.nombre.split(' ')[0];
    cargarParches();
    configurarValidacionInline();
    renderTodo();
    irA(location.hash.replace('#', '') || 'inicio', { actualizarHash: false });
  }

  iniciar();
})();
