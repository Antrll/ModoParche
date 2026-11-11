/* =====================================================================
   ModoParche · dashboard.js
   Panel del usuario en Vanilla JS + Leaflet + Supabase.

   1.  Utilidades
   2.  Catálogos: categorías, lugares reales, gente de ejemplo
   3.  Datos: modo demo (2 parches) y persistencia
   4.  Cálculos
   5.  Plantillas
   6.  Navegación y vistas
   7.  Mapa y GPS
   8.  Crear, editar, unirse y cancelar
   9.  Mis parches + chat
   10. Perfil: foto opcional, datos e insignias
   11. Toasts y modales
   12. Supabase
   13. Eventos e inicio (14. Gestos y microinteracciones va antes)
===================================================================== */
(() => {
  'use strict';

  /* =====================================================================
     1. UTILIDADES
  ===================================================================== */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const pad = n => String(n).padStart(2, '0');
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
  const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

  const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const todayKey = () => dayKey(Date.now());
  const offsetKey = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return dayKey(d); };
  const keyToDate = k => new Date(k + 'T12:00:00');
  const daysFromToday = k => Math.round((keyToDate(k) - keyToDate(todayKey())) / (24 * HOUR));
  const tsFrom = (fecha, hora) => new Date(`${fecha}T${hora || '00:00'}:00`).getTime();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtHora = ts => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(ts);
  const weekdayLong = k => new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(keyToDate(k));
  const shortDate = k => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(keyToDate(k)).replace('.', '');
  function fmtDia(ts) {
    const k = dayKey(ts), d = daysFromToday(k);
    if (d === 0) return 'Hoy';
    if (d === 1) return 'Mañana';
    if (d === -1) return 'Ayer';
    return `${cap(weekdayLong(k)).slice(0, 3)} ${shortDate(k)}`;
  }
  const fmtCuando = ts => `${fmtDia(ts)} · ${fmtHora(ts)}`;

  const soon = mins => Math.ceil((Date.now() + mins * MIN) / (5 * MIN)) * 5 * MIN;
  const at = (days, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.getTime(); };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  function haversine(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Con sesión todo se lee y guarda en Supabase. Modo demo (?demo=1 o sin conexión): en este navegador.
  const sb = window.mpSupabase || null;
  const DEMO = !sb || new URLSearchParams(window.location.search).has('demo');
  let me = null;
  const isRemote = p => !DEMO && p && !p.local;

  /* =====================================================================
     2. CATÁLOGOS
  ===================================================================== */
  const CENTER = [4.1420, -73.6266]; // Villavicencio
  const KEYS = { state: 'mp_dash_state_v5', perfil: 'mp_dash_perfil_v4' };

  const CATS = [
    { id: 'rumba', label: 'Rumba y bares', icon: 'i-cat-rumba', art: 'rumba-coctel', tone: '' },
    { id: 'comida', label: 'Comida y antojos', icon: 'i-cat-comida', art: 'comida-asado', tone: '' },
    { id: 'chill', label: 'Planes chill', icon: 'i-cat-chill', art: 'chill-juegosmesa', tone: 'is-olive' },
    { id: 'pueblear', label: 'Pueblear y miradores', icon: 'i-cat-pueblear', art: 'aventura-camping', tone: 'is-olive' },
    { id: 'rio', label: 'Río y naturaleza', icon: 'i-cat-rio', art: 'aventura-camara', tone: 'is-olive' },
    { id: 'deportes', label: 'Deportes y recocha', icon: 'i-cat-deportes', art: 'deporte-balon-fuego', tone: 'is-ink' },
    { id: 'conciertos', label: 'Conciertos y toques', icon: 'i-cat-conciertos', art: 'corona-principal', tone: 'is-ink' },
    { id: 'pet', label: 'Pet friendly', icon: 'i-cat-pet', art: 'parceros', tone: '' },
    { id: 'cultura', label: 'Cultura y talleres', icon: 'i-cat-cultura', art: 'chill-cine', tone: '' },
    { id: 'gaming', label: 'Gaming y tecnología', icon: 'i-cat-gaming', art: 'ruleta', tone: 'is-ink' },
  ];
  const catById = id => CATS.find(c => c.id === id) || CATS[2];

  // Coordenadas reales verificadas
  const LUGARES = [
    { id: 'capachos', nombre: 'Discoteca Los Capachos', ref: 'Km 4 Vía Acacías', lat: 4.1165, lng: -73.6508 },
    { id: 'primavera', nombre: 'C.C. Primavera Urbana', ref: 'Calle 15 # 40-01', lat: 4.1348, lng: -73.6206 },
    { id: 'fundadores', nombre: 'Parque Los Fundadores', ref: 'Entrada sur, Av. 40', lat: 4.1242, lng: -73.6395 },
    { id: 'piedra', nombre: 'Mirador La Piedra del Amor', ref: 'Buenavista, Vía Antigua a Bogotá', lat: 4.1585, lng: -73.6540 },
    { id: 'siete', nombre: 'Parque Siete de Agosto', ref: 'Barrio Siete de Agosto', lat: 4.1462, lng: -73.6335 },
    { id: 'viva', nombre: 'C.C. Viva Villavicencio', ref: 'Av. 40', lat: 4.125621, lng: -73.638716 },
    { id: 'hacha', nombre: 'Parque del Hacha', ref: 'Centro', lat: 4.1488, lng: -73.6382 },
    { id: 'carmen', nombre: 'Vereda El Carmen', ref: 'Inicio del sendero ecológico', lat: 4.1410, lng: -73.6615 },
  ];
  const lugar = id => LUGARES.find(l => l.id === id);

  // Solo personas con cuenta real: no hay gente de ejemplo
  const peopleCache = new Map(); // perfiles reales por uuid
  const personById = id => peopleCache.get(id);

  // Colores de las iniciales, todos de la marca
  const AV_TONES = [['#FF5A1F', '#111111'], ['#111111', '#ffffff'], ['#86895d', '#111111'], ['#fff1ea', '#b83709'], ['#eef0e3', '#55583a']];


  /* =====================================================================
     3. DATOS: MODO DEMO Y PERSISTENCIA
  ===================================================================== */
  const FOTO_VACIA = { src: '', zoom: 1, x: 0, y: 0 };
  const PERFIL_DEF = {
    nombre: 'Camilo Rojas', primer: 'Camilo', tel: '3104567890', mail: 'camilo.rojas@gmail.com', ciudad: 'Villavicencio', cedula: '1121000456',
    mostrar_foto_real: false, foto_encuadre: Object.assign({}, FOTO_VACIA),
    cedula_verificada: false, cedula_verificada_en: null,
    rating: 0, resenas: 0, // las calificaciones arrancan en 0 hasta que alguien califique
    intereses: ['rumba', 'conciertos'], contacto_nombre: '', contacto_tel: '',
  };
  let perfil = Object.assign({}, PERFIL_DEF, DEMO ? store.get(KEYS.perfil, {}) : {});
  const ME = () => {
    const [a, b] = String(perfil.nombre || 'Parcero').split(/\s+/);
    return { nombre: b ? `${a} ${b.charAt(0)}.` : a };
  };

  function normalizeParche(p) {
    return Object.assign({
      confirmados: [], unido: false, propio: false, chat: [], checkin: false,
      creadorId: null, creadorNombre: '', barrio: '', descripcion: '', costo: 0, presupuesto: 0,
      oficial: false, info: {}, llegaron: [], locs: {}, localidad: '', imagen: '',
      viajes: [], encuestas: {}, album: [],
    }, p);
  }

  // Solo dos parches de ejemplo y sin gente simulada: uno de un negocio aliado y uno que armaste tú
  function buildSeeds() {
    const L = id => { const l = lugar(id); return { lugar: l.nombre, barrio: l.ref, lat: l.lat, lng: l.lng }; };
    return [
      { id: 'd1', titulo: 'Hora feliz 2x1 en la terraza del C.C. Viva', categoria: 'rumba', ...L('viva'), inicio: soon(70), costo: 0, presupuesto: 25000, cuposMax: 20, creadorNombre: 'Terraza C.C. Viva', aliado: true, imagen: 'src/assets/web/discoteca.jpg', promo: '2x1 en cócteles', descripcion: '2x1 en cócteles mientras dure la hora feliz. Terraza al aire libre y buena música.' },
      { id: 'd2', titulo: 'Atardecer en la Piedra del Amor', categoria: 'pueblear', ...L('piedra'), inicio: at(1, 16, 30), costo: 0, presupuesto: 15000, cuposMax: 12, creadorId: 'me', propio: true, unido: true, creadoPorMi: false, descripcion: 'Subimos al mirador de Buenavista a ver cómo se prende Villavo. Salimos en grupo desde el Parque del Hacha.' },
    ].map(normalizeParche).map(p => {
      p.chat = [{ tipo: 'sys', texto: isMine(p) ? 'Abriste el parche. Cuando alguien se una, aparece aquí.' : `${creatorName(p)} abrió el parche`, ts: Date.now() - 26 * HOUR }];
      return p;
    }).concat(oficialDemo());
  }
  // Datos de la boletería oficial (La Tiquetera). En la base los guarda un admin.
  const OFICIAL_CEPEDA = {
    artista: 'Andrés Cepeda', mes: 'Noviembre', boleteria: 'La Tiquetera',
    horario: 'Puertas 7:00 p. m. · Andrés Cepeda 10:00 p. m.', edad_minima: 14,
    localidades: [{ nombre: 'General', precio: 100000 }, { nombre: 'VIP', precio: 160000 }, { nombre: 'Platino menores', precio: 255000 }],
    entrada_precio: 100000, entrada_url: 'https://latiquetera.com/event/andres-cepeda-en-villavicencio',
    palco_precio: 3100000, palco_hasta: 4200000, palco_personas: 10, palco_url: 'https://latiquetera.com/event/andres-cepeda-en-villavicencio',
  };
  // Parche oficial del mes en el modo demo (en la base lo crea un admin)
  function oficialDemo() {
    const p = normalizeParche({
      id: 'd0', oficial: true, titulo: 'Andrés Cepeda en Villavo', categoria: 'conciertos',
      descripcion: 'El parche oficial de noviembre. Vamos en combo a cantar con Andrés Cepeda: en el chat armamos la previa, la llegada y la vaca para el transporte. Compra tu entrada o tu palco en la boletería oficial y cáele al parche.',
      inicio: new Date('2026-11-28T19:00:00-05:00').getTime(), lugar: 'Coliseo Las Malocas', barrio: 'Parque Las Malocas', lat: 4.12287, lng: -73.574447,
      costo: 0, presupuesto: 0, cuposMax: 1000, creadorNombre: 'Equipo ModoParche',
      info: OFICIAL_CEPEDA, imagen: 'src/assets/web/oficiales/andres-cepeda.webp',
    });
    p.chat = [{ tipo: 'sys', texto: 'El equipo de ModoParche abrió este parche oficial. Aquí armamos la llegada, la vaca y la previa.', ts: Date.now() - 48 * HOUR }];
    return p;
  }

  const state = { parches: [], view: 'inicio', search: '', time: 'hoy', misTab: 'unido', chatId: null, mesas: [], misMesas: [],
    filtro: 'todos', chatFiltro: 'todo', calificados: new Set(), historial: [],
    espera: new Set(), parceros: null, invitarId: null, abiertoTransporte: false };

  // Modo Mesa de ejemplo (solo en ?demo=1)
  function demoMesas() {
    const lc = lugar('capachos'), pri = lugar('primavera');
    return [
      { id: 'm1', titulo: 'Mesa de 6: botella de la casa', beneficio: 'Botella de aguardiente de cortesía si llegan 6 o más', descripcion: 'Reserva tu mesa y llega con tu gente. Válido de jueves a sábado.', min_personas: 6, max_personas: 12, dias: [4, 5, 6], hora_desde: '20:00', hora_hasta: '02:00',
        negocio: { id: 'n1', nombre: 'Discoteca Los Capachos', direccion: lc.ref, barrio: 'Vía Acacías', lat: lc.lat, lng: lc.lng, verificado: true } },
      { id: 'm2', titulo: 'Combo parche de 4', beneficio: '4 hamburguesas y una jarra de limonada a precio de 3', descripcion: 'Para grupos de 4 a 8. Mesa guardada 20 minutos.', min_personas: 4, max_personas: 8, dias: [0, 1, 2, 3, 4, 5, 6], hora_desde: '12:00', hora_hasta: '22:00',
        negocio: { id: 'n2', nombre: 'Patio de comidas Primavera', direccion: pri.ref, barrio: 'Primavera', lat: pri.lat, lng: pri.lng, verificado: false } },
    ];
  }

  function loadDemo() {
    const saved = store.get(KEYS.state, null);
    if (saved && saved.day === todayKey() && Array.isArray(saved.parches)) state.parches = saved.parches.map(normalizeParche);
    else {
      const mios = (saved && saved.parches || []).filter(p => p.creadoPorMi && p.inicio > Date.now() - 6 * HOUR).map(normalizeParche);
      state.parches = buildSeeds().concat(mios);
    }
    const viejo = state.parches.findIndex(p => p.id === 'd0');
    if (viejo >= 0) state.parches[viejo] = Object.assign(oficialDemo(), { unido: state.parches[viejo].unido, chat: state.parches[viejo].chat });
    else if (!state.parches.some(p => p.oficial)) state.parches.push(oficialDemo());
  }
  function save() {
    if (!DEMO) return;
    // El álbum del demo no se guarda: las fotos pesan demasiado para el navegador
    store.set(KEYS.state, { day: todayKey(), parches: state.parches.map(p => { const c = Object.assign({}, p); delete c._drop; delete c.album; return c; }) });
  }
  const savePerfil = () => { if (DEMO && !store.set(KEYS.perfil, perfil)) toast('No se pudo guardar', 'La foto es muy pesada para este navegador.', { type: 'error' }); };

  /* =====================================================================
     4. CÁLCULOS
  ===================================================================== */
  let userPos = null, userAcc = null;
  const origin = () => userPos || CENTER;
  const findP = id => state.parches.find(p => p.id === id);
  const ocupados = p => p.confirmados.length + (p.unido ? 1 : 0);
  const libres = p => Math.max(0, p.cuposMax - ocupados(p));
  const isFull = p => ocupados(p) >= p.cuposMax;
  const isMine = p => p.propio || p.creadorId === 'me';
  const inside = p => p.unido || isMine(p);
  const distKm = p => haversine(origin(), [p.lat, p.lng]);
  const fmtKm = km => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
  const precio = p => Math.max(Number(p.costo) || 0, Number(p.presupuesto) || 0);
  const isPast = p => p.inicio < Date.now() - 3 * HOUR;
  // Un parche oficial sin sitio confirmado no se pone en el mapa
  const sinLugar = p => p.oficial && /^por confirmar$/i.test(String(p.lugar || '').trim());
  const enMapa = p => !sinLugar(p);
  const activeList = () => state.parches.filter(p => p.inicio > Date.now() - 90 * MIN);
  function creatorName(p) {
    if (p.oficial) return 'Equipo ModoParche';
    if (p.creadorId === 'me') return ME().nombre;
    if (p.creadorId) return personById(p.creadorId)?.nombre || 'Parcero';
    if (p.demo && !p.aliado) return 'ModoParche';
    return p.creadorNombre || 'Local aliado';
  }
  function matchesSearch(p) {
    if (!state.search) return true;
    const hay = norm([p.titulo, p.lugar, p.barrio, catById(p.categoria).label].join(' '));
    return norm(state.search).split(/\s+/).every(w => hay.includes(w));
  }
  function timeMatch(p) {
    const k = dayKey(p.inicio);
    if (state.time === 'todos') return true;
    if (state.time === 'hoy') return k === todayKey();
    return k === offsetKey(1);
  }
  const timeLabel = () => ({ hoy: 'hoy', manana: 'mañana', todos: 'en total' }[state.time]);
  const nextMine = () => state.parches.filter(p => inside(p) && p.inicio > Date.now() - 60 * MIN).sort((a, b) => a.inicio - b.inicio)[0];

  /* =====================================================================
     5. PLANTILLAS
  ===================================================================== */
  const STK = n => `src/assets/web/stk/${n}.webp`;
  const initial = n => (String(n || '?').trim().charAt(0) || '?').toUpperCase();
  const photoImg = f => `<span class="av-photo"><img src="${esc(f.src)}" alt="" style="transform:translate(${+f.x || 0}%, ${+f.y || 0}%) scale(${+f.zoom || 1})"></span>`;

  function avHTML(who, cls = '') {
    const meToo = who === 'me';
    const person = meToo ? { nombre: perfil.nombre, foto: perfil.mostrar_foto_real && perfil.foto_encuadre && perfil.foto_encuadre.src ? perfil.foto_encuadre : null }
      : (typeof who === 'string' ? personById(who) : who) || { nombre: 'Parcero' };
    if (person.foto && person.foto.src) return `<span class="av ${cls}" title="${esc(person.nombre)}">${photoImg(person.foto)}</span>`;
    const [bg, fg] = meToo ? AV_TONES[0] : AV_TONES[hash(person.nombre) % AV_TONES.length];
    return `<span class="av ${cls}" style="--av:${bg};--avc:${fg}" title="${esc(person.nombre)}">${esc(initial(person.nombre))}</span>`;
  }

  const priceTag = p => `<span class="tag tag--price tnum">${precio(p) === 0 ? 'Gratis' : money(precio(p))}</span>`;

  function joinButton(p, { small = false } = {}) {
    const sz = small ? ' btn--sm' : ' btn--sm';
    if (isMine(p)) return `<span class="own-actions"><button class="icon-btn icon-btn--danger" data-action="cancelar" data-id="${p.id}" aria-label="Eliminar ${esc(p.titulo)}" title="Eliminar parche">${ic('i-trash')}</button><button class="btn btn--ghost${sz}" data-action="editar" data-id="${p.id}">${ic('i-edit')} Editar</button></span>`;
    if (p.unido) return `<button class="btn btn--ink${sz}" data-action="chat" data-id="${p.id}">${ic('i-chat')} Chat</button>`;
    if (isFull(p)) return state.espera.has(p.id)
      ? `<button class="btn btn--olive${sz}" data-action="espera" data-id="${p.id}" aria-pressed="true">${ic('i-check')} En lista de espera</button>`
      : `<button class="btn btn--ghost${sz}" data-action="espera" data-id="${p.id}">${ic('i-users')} Avísame si se libera</button>`;
    return holdButton(p, sz);
  }
  // Mantener presionado para confirmar asistencia (ver initHold)
  function holdButton(p, sz) {
    const label = `${ic('i-bolt')}<span>Caerle</span>`;
    return `<button class="btn btn--hold${sz}" data-hold="join" data-id="${p.id}" aria-label="Caerle a ${esc(p.titulo)}: mantén presionado para confirmar">
      <span class="hold-label">${label}</span><span class="hold-fill" aria-hidden="true">${label}</span>
      <span class="hold-tip" aria-hidden="true">Mantén presionado</span>
    </button>`;
  }

  function coverHTML(p) {
    const cat = catById(p.categoria);
    const tags = `<div class="card-tags">
        ${p.aliado ? `<span class="tag tag--ally">${ic('i-crown')} Aliado</span>${p.verificado ? `<span class="tag tag--verif">${ic('i-check')} Verificado</span>` : ''}` : `<span class="tag">${ic(cat.icon)} ${esc(cat.label)}</span>`}
        ${p.promo ? `<span class="tag tag--promo">${esc(p.promo)}</span>` : ''}
        ${priceTag(p)}
      </div>`;
    const share = `<button type="button" class="cover-share" data-action="compartir" data-id="${p.id}" aria-label="Compartir ${esc(p.titulo)}" title="Compartir">${ic('i-share')}</button>`;
    if (p.imagen) return `<figure class="card-cover"><img src="${esc(p.imagen)}" alt="Foto de ${esc(p.titulo)}" loading="lazy" decoding="async" onerror="this.remove()">${tags}${share}</figure>`;
    return `<figure class="card-cover card-cover--art ${cat.tone}"><img src="${STK(cat.art)}" alt="" loading="lazy" decoding="async">${tags}${share}</figure>`;
  }

  function cuposHTML(p) {
    const free = libres(p), full = isFull(p), hot = !full && free <= 3;
    const txt = full ? 'Lleno' : hot ? (free === 1 ? 'Último cupo' : `Últimos ${free} cupos`) : `${free} cupos libres`;
    return `<li class="${hot ? 'is-hot' : ''}">${ic(hot ? 'i-flame' : 'i-users')}<span class="tnum">${txt}</span><span class="muted tnum">${ocupados(p)}/${p.cuposMax}</span></li>`;
  }

  function cardHTML(p, delay = 0) {
    const pct = Math.round(ocupados(p) / p.cuposMax * 100);
    const hot = !isFull(p) && libres(p) <= 3;
    const ids = (inside(p) ? ['me'] : []).concat(p.confirmados).slice(0, 4);
    return `<article class="card" style="--d:${delay}ms">
      ${coverHTML(p)}
      <div class="card-body">
        <h3 class="card-title">${esc(p.titulo)}</h3>
        <p class="card-desc">${esc(p.descripcion)}</p>
        <ul class="meta">
          <li>${ic('i-clock')}<span class="tnum">${esc(fmtCuando(p.inicio))}</span></li>
          <li>${ic('i-pin')}<span>${esc(p.lugar)}</span><span class="muted tnum">${fmtKm(distKm(p))}</span></li>
          ${cuposHTML(p)}
        </ul>
        <div class="fill ${hot ? 'is-hot' : ''}" aria-hidden="true"><span style="--w:${pct}%"></span></div>
        <div class="card-foot">
          <span class="who">${ids.length ? `<span class="stack">${ids.map(id => avHTML(id, 'av--sm')).join('')}</span>` : ''}<span>${ids.length ? 'de' : 'Sé el primero · de'} <b>${esc(creatorName(p))}</b></span></span>
          ${joinButton(p)}
        </div>
        <button class="link-btn" data-action="ver-mapa" data-id="${p.id}">${ic('i-map')} Ver en el mapa</button>
      </div>
    </article>`;
  }

  const emptyHTML = ({ art = 'clima', title, text, cta = 'Abrir un parche', action = 'crear' }) =>
    `<div class="empty"><img src="${STK(art)}" alt="" loading="lazy"><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta ? `<button class="btn btn--sm" data-action="${action}">${ic(action === 'crear' ? 'i-plus' : 'i-arrow')} ${esc(cta)}</button>` : ''}</div>`;

  function popupHTML(p) {
    const cat = catById(p.categoria);
    return `<div class="pop">
      <div class="pop-cover">${p.imagen ? `<img src="${esc(p.imagen)}" alt="">` : `<div class="card-cover card-cover--art ${cat.tone}" style="height:100%"><img src="${STK(cat.art)}" alt=""></div>`}</div>
      <div class="pop-body">
        <h3 class="pop-title">${esc(p.titulo)}</h3>
        <ul class="meta">
          <li>${ic('i-clock')}<span class="tnum">${esc(fmtCuando(p.inicio))}</span></li>
          <li>${ic('i-pin')}<span>${esc(p.lugar)}</span><span class="muted tnum">${fmtKm(distKm(p))}</span></li>
          ${cuposHTML(p)}
        </ul>
        <div class="pop-actions">${joinButton(p, { small: true })}</div>
      </div>
    </div>`;
  }

  /* =====================================================================
     6. NAVEGACIÓN Y VISTAS
  ===================================================================== */
  // Píldora que se desliza bajo la opción activa
  /* Liquid gooey: la píldora vive en una capa con un filtro SVG (desenfoque +
     contraste alto). Una gota "rezagada" la sigue más lento; mientras se
     separan, el filtro las funde y la píldora se estira como líquido. */
  function gooey(container) {
    if (container._goo || reduceMotion) return;
    const pill = container.querySelector('.tabs-pill, .seg-pill');
    if (!pill) return;
    ensureGooFilter();
    const layer = document.createElement('span');
    layer.className = 'goo-layer';
    layer.setAttribute('aria-hidden', 'true');
    const trail = document.createElement('span');
    trail.className = 'goo-trail';
    container.insertBefore(layer, pill);
    layer.append(trail, pill);
    container._goo = trail;
  }
  function movePill(container, instant = false) {
    if (!container) return;
    gooey(container);
    const pill = container.querySelector('.tabs-pill, .seg-pill');
    const trail = container._goo;
    const active = container.querySelector('.is-active');
    if (!pill) return;
    const set = el => {
      if (!el) return;
      if (!active || !active.offsetWidth) { el.style.width = '0px'; return; }
      if (instant) el.style.transition = 'none';
      el.style.width = active.offsetWidth + 'px';
      el.style.transform = `translateX(${active.offsetLeft}px)`;
      if (instant) { el.offsetWidth; el.style.transition = ''; }
    };
    set(pill); set(trail);
  }

  function go(view, { scroll = true } = {}) {
    if (!$('#view-' + view)) return;
    const changed = state.view !== view;
    state.view = view;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + view));
    $$('.tab, .bn').forEach(b => {
      const on = b.dataset.nav === view;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#me-chip').classList.toggle('is-active', view === 'perfil');
    movePill($('#tabs'));
    if (scroll && changed) window.scrollTo({ top: 0, behavior: 'auto' });
    if (view === 'inicio') renderInicio(changed);
    if (view === 'mapa') { renderTimeSeg(); renderLiveMap(); loadLeaflet().then(ok => ok && setTimeout(() => { initLiveMap(); liveMap && liveMap.invalidateSize(); renderLiveMap(); }, 40)); }
    if (view === 'mis') renderMis();
    if (view === 'perfil') renderPerfil();
  }

  function saludo() {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }

  function renderInicio(animate = false) {
    $('#hello-name').textContent = perfil.primer || 'parcero';
    const hoy = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    $('#hello-date').textContent = `${saludo()} · ${cap(hoy)}`;
    const nHoy = activeList().filter(p => dayKey(p.inicio) === todayKey()).length;
    $('#hello-sub').textContent = nHoy
      ? `Hay ${nHoy} ${nHoy === 1 ? 'parche abierto' : 'parches abiertos'} hoy en ${perfil.ciudad || 'Villavo'}. Cáele a uno o abre el tuyo.`
      : 'Hoy está calmado. Abre tu propio plan y deja que la gente se sume.';
    renderOficial(animate);
    renderQuick();
    renderNext();
    renderCalificar();
    renderConsejo();
    renderMesas();
    renderParaTi();
    renderCards(animate);
    renderHistorial();
  }

  function renderQuick() {
    const total = activeList().length;
    const mios = state.parches.filter(p => inside(p) && !isPast(p)).length;
    $('#qk-map').textContent = `${total} ${total === 1 ? 'parche' : 'parches'} en el mapa`;
    $('#qk-mis').textContent = mios ? `${mios} ${mios === 1 ? 'plan' : 'planes'} con chat` : 'Aún no te has unido';
  }

  function renderNext() {
    const p = nextMine();
    const slot = $('#next-slot');
    if (!p) { slot.innerHTML = ''; return; }
    const d = new Date(p.inicio);
    slot.innerHTML = `<div class="next">
      <div class="next-when"><small>${esc(fmtDia(p.inicio))}</small><b class="tnum">${pad(d.getHours() % 12 || 12)}:${pad(d.getMinutes())}</b><small>${d.getHours() < 12 ? 'a. m.' : 'p. m.'}</small></div>
      <div class="next-copy">
        <p class="eyebrow">Tu próximo parche</p>
        <h3>${esc(p.titulo)}</h3>
        <p>${esc(p.lugar)} · ${ocupados(p)} ${ocupados(p) === 1 ? 'confirmado' : 'confirmados'}</p>
      </div>
      <div class="next-actions">
        <button class="btn btn--ghost btn--sm" data-action="ver-mapa" data-id="${p.id}">${ic('i-map')} Mapa</button>
        <button class="btn btn--ink btn--sm" data-action="chat" data-id="${p.id}">${ic('i-chat')} Chat</button>
      </div>
    </div>`;
  }

  function renderCards(animate = false) {
    renderFiltros();
    const list = activeList().filter(p => !p.oficial).filter(matchesSearch).filter(filtroMatch).sort((a, b) => a.inicio - b.inicio);
    $('#open-count').innerHTML = state.search
      ? `<b>${list.length}</b> para "${esc(state.search)}"`
      : userPos ? `<b>${list.length}</b> ${list.length === 1 ? 'plan' : 'planes'} · distancias desde tu ubicación` : `<b>${list.length}</b> ${list.length === 1 ? 'plan' : 'planes'} en Villavicencio`;
    const grid = $('#cards');
    grid.classList.toggle('is-static', !animate);
    grid.innerHTML = list.length
      ? list.map((p, i) => cardHTML(p, animate ? 120 + i * 90 : 0)).join('')
      : emptyHTML(state.search
        ? { art: 'radar', title: `Nada para "${state.search}"`, text: 'Prueba con otro nombre o lugar de Villavicencio.', cta: '' }
        : state.filtro !== 'todos'
        ? { art: 'radar', title: 'Nada con ese filtro', text: 'Prueba con otro o mira todos los parches abiertos.', cta: 'Ver todos', action: 'filtro-todos' }
        : { title: 'Nadie ha armado parche', text: 'Sé quien arranca: abre tu plan y la gente se suma.' });
  }

  /* ---------- Parche oficial del mes: arriba, grande y con boletería ---------- */
  const oficialActual = () => state.parches.filter(p => p.oficial && p.inicio > Date.now() - 3 * HOUR).sort((a, b) => a.inicio - b.inicio)[0];
  function faltaTxt(ts) {
    const d = daysFromToday(dayKey(ts));
    if (d <= 0) return ts > Date.now() ? `Hoy a las ${fmtHora(ts)}` : 'En curso';
    return d === 1 ? 'Es mañana' : `Faltan ${d} días`;
  }
  function boletaHTML(tipo, precio, url, extra = '', detalle = '') {
    const nombre = tipo === 'palco' ? 'Palco' : 'Entrada';
    const valor = precio ? `Desde ${money(precio)}` : 'Precio por confirmar';
    const inner = `<span class="of-tk-k">${ic(tipo === 'palco' ? 'i-crown' : 'i-ticket')} ${nombre}${extra ? ` <small>${esc(extra)}</small>` : ''}</span>
      <b class="tnum">${valor}</b>
      ${detalle}
      <span class="of-tk-go">${url ? `Comprar ${tipo === 'palco' ? 'palco' : 'entrada'} ${ic('i-out')}` : 'Pronto a la venta'}</span>`;
    return url
      ? `<a class="of-tk of-tk--${tipo}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Comprar ${nombre.toLowerCase()} en la boletería oficial (se abre en otra pestaña)">${inner}</a>`
      : `<div class="of-tk of-tk--${tipo} is-off" aria-label="${nombre}: pronto a la venta">${inner}</div>`;
  }
  function renderOficial(animate = false) {
    const slot = $('#oficial-slot');
    if (!slot) return;
    const p = oficialActual();
    if (!p) { slot.innerHTML = ''; return; }
    const i = p.info || {}, d = new Date(p.inicio);
    const locs = (Array.isArray(i.localidades) ? i.localidades : []).filter(l => l && l.nombre && l.precio);
    const van = ocupados(p);
    const cuando = `${cap(new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(d))} · ${fmtHora(p.inicio)}`;
    const mes = i.mes || cap(new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(d));
    const accion = p.unido
      ? `<button class="btn btn--ink" data-action="chat" data-id="${p.id}">${ic('i-chat')} Ir al chat del parche</button>`
      : isFull(p) ? `<button class="btn btn--ghost" disabled>Parche lleno</button>` : holdButton(p, '');
    const poster = p.imagen ? `<figure class="of-poster"><img src="${esc(p.imagen)}" alt="Afiche oficial: ${esc(i.artista || p.titulo)}, ${esc(cuando)}" decoding="async"></figure>` : '';
    slot.innerHTML = `<section class="oficial ${p.imagen ? 'has-poster' : ''} ${animate ? 'is-in' : ''}" aria-labelledby="of-title">
      ${poster}
      <div class="of-art" aria-hidden="true">
        <img class="of-stk of-stk--corona" src="${STK('coronanaranjabrochaarmador')}" alt="" loading="lazy">
        <img class="of-stk of-stk--fuego" src="${STK('fuego-2-naranja')}" alt="" loading="lazy">
        <img class="of-stk of-stk--chispa" src="${STK('chispasnaranjasimpactoesquina')}" alt="" loading="lazy">
      </div>
      <div class="of-copy">
        <p class="of-badge">${ic('i-crown')} Parche oficial de ${esc(mes.toLowerCase())}</p>
        <h2 class="of-title" id="of-title">${esc(i.artista || p.titulo)}${i.artista ? `<span>${esc(p.titulo.replace(i.artista, '').trim() || 'en Villavo')}</span>` : ''}</h2>
        <p class="of-desc">${esc(p.descripcion)}</p>
        <ul class="of-meta">
          <li>${ic('i-calendar')}<span>${esc(cuando)}</span></li>
          ${i.horario ? `<li>${ic('i-clock')}<span>${esc(i.horario)}</span></li>` : ''}
          <li>${ic('i-pin')}<span>${sinLugar(p) ? 'Lugar por confirmar' : esc(p.lugar + (p.barrio ? ', ' + p.barrio : ''))}</span></li>
          <li>${ic('i-users')}<span class="tnum">${van ? `${van} ${van === 1 ? 'parcero va' : 'parceros van'}` : 'Sé de los primeros'} · ${p.cuposMax.toLocaleString('es-CO')} cupos${i.edad_minima ? ` · Desde ${i.edad_minima} años` : ''}</span></li>
        </ul>
      </div>
      <div class="of-side">
        <p class="of-count tnum">${esc(faltaTxt(p.inicio))}</p>
        <div class="of-tickets">
          ${boletaHTML('entrada', i.entrada_precio || (locs.length ? Math.min(...locs.map(l => l.precio)) : 0), i.entrada_url, '',
            locs.length ? `<ul class="of-locs">${locs.map(l => `<li><span>${esc(l.nombre)}</span><b class="tnum">${money(l.precio)}</b></li>`).join('')}</ul>` : '')}
          ${boletaHTML('palco', i.palco_precio, i.palco_url, i.palco_personas ? `para ${i.palco_personas}` : '',
            i.palco_hasta && i.palco_hasta > (i.palco_precio || 0) ? `<p class="of-locs-note tnum">Hasta ${money(i.palco_hasta)} según la ubicación${i.palco_personas ? ` · ${money(Math.round((i.palco_precio || 0) / i.palco_personas))} por persona` : ''}</p>` : '')}
        </div>
        ${i.boleteria ? `<p class="of-sold">Venta oficial en <b>${esc(i.boleteria)}</b>. Los precios los fija la boletería y pueden cambiar.</p>` : ''}
        <div class="of-actions">${accion}<button class="icon-btn of-share" data-action="compartir" data-id="${p.id}" aria-label="Compartir el parche oficial" title="Compartir">${ic('i-share')}</button>${enMapa(p) ? `<button class="hello-link of-map" data-action="ver-mapa" data-id="${p.id}">Ver en el mapa ${ic('i-arrow')}</button>` : ''}</div>
        <p class="of-note">${ic('i-info')} Las boletas se compran en la boletería oficial. ModoParche no cobra ni recibe ese dinero.</p>
      </div>
    </section>`;
  }

  /* ---------- Filtros: Hoy, Gratis, Cerca de mí y categorías ---------- */
  const CERCA_KM = 3;
  function filtroMatch(p) {
    const f = state.filtro;
    if (f === 'todos') return true;
    if (f === 'hoy') return dayKey(p.inicio) === todayKey();
    if (f === 'gratis') return precio(p) === 0;
    if (f === 'cerca') return !!userPos && distKm(p) <= CERCA_KM;
    return p.categoria === f;
  }
  function renderFiltros() {
    const box = $('#filtros');
    if (!box) return;
    const base = activeList().filter(p => !p.oficial).filter(matchesSearch);
    const cuenta = f => { const prev = state.filtro; state.filtro = f; const n = base.filter(filtroMatch).length; state.filtro = prev; return n; };
    const opts = [['todos', 'Todos', 'i-bolt'], ['hoy', 'Hoy', 'i-clock'], ['gratis', 'Gratis', 'i-tag']];
    if (userPos) opts.push(['cerca', `A ${CERCA_KM} km`, 'i-locate']);
    [...new Set(base.map(p => p.categoria))].forEach(c => { const k = catById(c); opts.push([c, k.label.split(' ')[0], k.icon]); });
    if (!opts.some(o => o[0] === state.filtro)) state.filtro = 'todos';
    box.innerHTML = opts.map(([k, l, i]) => {
      const n = k === 'todos' ? base.length : cuenta(k);
      return `<button type="button" class="fchip" data-filtro="${k}" aria-pressed="${state.filtro === k}" ${n || k === 'todos' ? '' : 'disabled'}>${ic(i)}<span>${esc(l)}</span><b class="tnum">${n}</b></button>`;
    }).join('');
  }

  /* ---------- Calificar después del parche ---------- */
  function porCalificar() {
    const now = Date.now();
    return state.parches
      .filter(p => p.checkin && p.inicio <= now && p.inicio > now - 7 * 24 * HOUR)
      .map(p => ({ p, gente: p.confirmados.filter(id => !state.calificados.has(p.id + ':' + id)) }))
      .filter(x => x.gente.length);
  }
  function renderCalificar() {
    const slot = $('#calificar-slot');
    if (!slot) return;
    const x = porCalificar()[0];
    if (!x) { slot.innerHTML = ''; return; }
    const n = x.gente.length;
    slot.innerHTML = `<div class="rate-card">
      <span class="rate-ic">${ic('i-star')}</span>
      <div><p class="eyebrow">¿Cómo estuvo?</p><h3>${esc(x.p.titulo)}</h3><p>Califica a ${n === 1 ? 'la persona' : `las ${n} personas`} con quien fuiste. Ayuda a que los buenos parceros se noten.</p></div>
      <button class="btn btn--ink btn--sm" data-action="calificar" data-id="${x.p.id}">${ic('i-star')} Calificar</button>
    </div>`;
  }
  let calParche = null;
  function abrirCalificar(id) {
    const x = porCalificar().find(y => y.p.id === id);
    if (!x) return;
    calParche = id;
    $('#cal-title').textContent = x.p.titulo;
    $('#cal-msg').textContent = '';
    $('#cal-list').innerHTML = x.gente.map(uid => {
      const nombre = personById(uid)?.nombre || 'Parcero';
      return `<li class="cal-row" data-uid="${esc(uid)}" data-v="0">
        <div class="cal-who">${avHTML(uid, 'av--sm')}<span><b>${esc(nombre)}</b>${x.p.llegaron.includes(uid) ? '<small>Llegó al punto</small>' : '<small>Estaba en el parche</small>'}</span></div>
        <div class="stars-in" role="radiogroup" aria-label="Estrellas para ${esc(nombre)}">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star-btn" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} ${n === 1 ? 'estrella' : 'estrellas'}">${ic('i-star')}</button>`).join('')}
        </div>
        <button type="button" class="cal-volver" aria-pressed="false">${ic('i-check')} Volvería a parchar</button>
      </li>`;
    }).join('');
    openModal('modal-calificar');
  }
  function marcarEstrellas(btn) {
    const row = btn.closest('.cal-row'), v = Number(btn.dataset.star);
    row.dataset.v = v;
    $$('.star-btn', row).forEach(b => { const on = Number(b.dataset.star) <= v; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(Number(b.dataset.star) === v)); });
    if (!reduceMotion) { btn.classList.remove('is-pop'); void btn.offsetWidth; btn.classList.add('is-pop'); }
    buzz(6);
  }
  async function enviarCalificaciones() {
    const p = findP(calParche);
    if (!p) return;
    const filas = $$('#cal-list .cal-row').filter(r => Number(r.dataset.v) > 0).map(r => ({
      parche_id: p.id, calificado_id: r.dataset.uid, estrellas: Number(r.dataset.v), volver: r.querySelector('.cal-volver').getAttribute('aria-pressed') === 'true',
    }));
    if (!filas.length) { $('#cal-msg').textContent = 'Toca las estrellas de al menos una persona.'; return; }
    const btn = $('#cal-send'); btn.classList.add('is-loading');
    if (isRemote(p)) {
      const { error } = await sb.from('calificaciones').insert(filas);
      btn.classList.remove('is-loading');
      if (error) {
        const m = `${error.message} ${error.hint || ''}`;
        $('#cal-msg').textContent = /NO_ESTABA/.test(m) ? 'Una de esas personas no estaba en el parche.' : /FUERA_DE_TIEMPO/.test(m) ? 'Este parche ya no se puede calificar (pasaron más de 7 días).' : /row-level|permission/i.test(m) ? 'Solo califica quien hizo check-in en el parche.' : /duplicate/i.test(m) ? 'Ya habías calificado a alguien de la lista.' : dbMsg(error);
        return;
      }
    } else btn.classList.remove('is-loading');
    filas.forEach(f => state.calificados.add(f.parche_id + ':' + f.calificado_id));
    ringBurst(btn);
    closeModal('modal-calificar');
    toast('¡Gracias por calificar!', `Enviaste ${filas.length} ${filas.length === 1 ? 'calificación' : 'calificaciones'}.`, { icon: 'i-star' });
    renderCalificar();
  }

  /* ---------- Historial de parches oficiales ---------- */
  function renderHistorial() {
    const slot = $('#hist-slot');
    if (!slot) return;
    const h = state.historial || [];
    if (!h.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<section class="block hist" aria-labelledby="t-hist">
      <div class="block-head"><div><h2 class="block-title" id="t-hist">Oficiales anteriores</h2><p class="block-sub">Los parches grandes que ya armamos con la comunidad.</p></div></div>
      <div class="hist-row">${h.map(x => `<article class="hist-card">
        <figure>${x.imagen ? `<img src="${esc(x.imagen)}" alt="Afiche de ${esc(x.info.artista || x.titulo)}" loading="lazy">` : `<img src="${STK('corona-principal')}" alt="" loading="lazy" class="is-art">`}</figure>
        <div><small>${esc(cap(new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(x.inicio)))}</small><b>${esc(x.titulo)}</b><span class="tnum">${x.van ? `${x.van} ${x.van === 1 ? 'parcero fue' : 'parceros fueron'}` : esc(x.lugar)}</span></div>
      </article>`).join('')}</div>
    </section>`;
  }

  /* ---------- Compartir un parche ---------- */
  const linkParche = p => isRemote(p) && isUuid(p.id) ? `${location.origin}/p/${p.id}` : `${location.origin}/dashboard?parche=${encodeURIComponent(p.id)}`;
  const textoShare = p => `${p.oficial ? '👑 ' : ''}${p.titulo} · ${fmtCuando(p.inicio)} · ${sinLugar(p) ? 'lugar por confirmar' : p.lugar}. ¿Le caes? Únete en ModoParche:`;
  const waLink = p => `https://wa.me/?text=${encodeURIComponent(textoShare(p) + ' ' + linkParche(p))}`;
  async function compartir(id) {
    const p = findP(id);
    if (!p) return;
    if (navigator.share) {
      try { await navigator.share({ title: p.titulo, text: textoShare(p), url: linkParche(p) }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(`${textoShare(p)} ${linkParche(p)}`);
      toast('Enlace copiado', 'Pégalo en tu grupo o mándalo directo por WhatsApp.', { icon: 'i-share', action: { label: 'WhatsApp', act: 'wa', id } });
    } catch (e) { window.open(waLink(p), '_blank', 'noopener'); }
  }

  function renderMeChip() {
    $('#me-chip').innerHTML = `${avHTML('me')}<span class="me-name">${esc(perfil.primer || 'Yo')}</span>`;
  }
  function renderNavCount() {
    const n = state.parches.filter(p => inside(p) && !isPast(p)).length;
    const el = $('#tab-count');
    const before = el.textContent;
    el.hidden = !n; el.textContent = n;
    if (String(n) !== before && n && !reduceMotion) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    movePill($('#tabs'), true);
  }

  /* ---------- Modo Mesa: promos para grupos que ya van juntos ---------- */
  const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const horaTxt = hhmm => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return fmtHora(d); };
  function diasTxt(dias) {
    const d = [...(dias || [])].sort();
    if (d.length === 7) return 'Todos los días';
    if (d.join() === '1,2,3,4,5') return 'Lunes a viernes';
    return d.map(x => DIAS_CORTOS[x]).join(', ');
  }
  const ESTADO_MESA = {
    pendiente: ['Esperando al local', ''], confirmada: ['Confirmada', 'is-ok'], rechazada: ['No disponible', 'is-off'],
    cancelada: ['Cancelada', 'is-off'], llego: ['Llegaron', 'is-ok'], no_llego: ['No llegaron', 'is-off'],
  };
  function renderMesas() {
    const block = $('#mesa-block');
    if (!block) return;
    const promos = state.mesas || [], mias = (state.misMesas || []).filter(r => r.llegada > Date.now() - 3 * HOUR && r.estado !== 'cancelada');
    block.hidden = !promos.length && !mias.length;
    if (block.hidden) return;
    $('#mesa-mias').innerHTML = mias.sort((a, b) => a.llegada - b.llegada).map(r => {
      const [txt, cls] = ESTADO_MESA[r.estado] || ESTADO_MESA.pendiente;
      const viva = ['pendiente', 'confirmada'].includes(r.estado) && r.llegada > Date.now();
      return `<li class="mesa-mia">
        <span class="mesa-mia-ic">${ic('i-table')}</span>
        <div><b>${esc(r.titulo)}</b><small>${esc(r.negocio.nombre)} · ${esc(fmtCuando(r.llegada))} · ${r.personas} personas</small></div>
        <span class="mesa-pill ${cls}">${esc(txt)}</span>
        <span class="mesa-code tnum" title="Muéstralo al llegar">${esc(r.codigo)}</span>
        ${viva ? `<button class="btn btn--ghost btn--xs" data-action="mesa-cancelar" data-id="${esc(r.id)}">Cancelar</button>` : '<span></span>'}
      </li>`;
    }).join('');
    $('#mesa-list').innerHTML = promos.map(m => {
      const n = m.negocio || {}, dist = n.lat != null ? fmtKm(haversine(origin(), [n.lat, n.lng])) : '';
      return `<article class="mesa-card">
        <div class="mesa-card-top">
          <span class="mesa-local">${esc(n.nombre || 'Local aliado')}${n.verificado ? `<span class="tag tag--verif">${ic('i-check')} Verificado</span>` : ''}</span>
          ${dist ? `<span class="muted tnum">${dist}</span>` : ''}
        </div>
        <h3 class="mesa-title">${esc(m.titulo)}</h3>
        <p class="mesa-ben">${ic('i-tag')}<span>${esc(m.beneficio)}</span></p>
        <ul class="meta">
          <li>${ic('i-users')}<span class="tnum">De ${m.min_personas} a ${m.max_personas} personas</span></li>
          <li>${ic('i-clock')}<span>${esc(diasTxt(m.dias))} · ${esc(horaTxt(m.hora_desde))} a ${esc(horaTxt(m.hora_hasta))}</span></li>
          ${n.direccion ? `<li>${ic('i-pin')}<span>${esc(n.direccion)}${n.barrio ? ', ' + esc(n.barrio) : ''}</span></li>` : ''}
        </ul>
        <div class="mesa-card-foot">
          ${n.lat != null ? `<button class="link-btn" data-action="mesa-mapa" data-id="${esc(m.id)}">${ic('i-map')} Ver en el mapa</button>` : '<span></span>'}
          <button class="btn btn--sm" data-action="mesa-reservar" data-id="${esc(m.id)}">${ic('i-table')} Reservar mesa</button>
        </div>
      </article>`;
    }).join('');
  }

  function refresh() {
    if (state.view === 'inicio') { renderOficial(); renderQuick(); renderNext(); renderCalificar(); renderMesas(); renderParaTi(); renderCards(); renderHistorial(); }
    if (state.view === 'mapa') renderLiveMap();
    if (state.view === 'mis') renderMis();
    renderNavCount();
  }

  /* =====================================================================
     7. MAPA Y GPS
  ===================================================================== */
  let liveMap = null, createMap = null, createMarker = null, meMarker = null, meCircle = null, createMe = null;
  const liveMarkers = new Map();
  // Leaflet pesa ~150 KB: se carga la primera vez que se abre un mapa
  let leafletP = null;
  function loadLeaflet() {
    if (typeof L !== 'undefined') return Promise.resolve(true);
    if (leafletP) return leafletP;
    leafletP = new Promise(res => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; css.crossOrigin = '';
      document.head.insertBefore(css, document.querySelector('link[href="dashboard.css"]'));
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; js.crossOrigin = '';
      js.onload = () => { res(true); updateUserMarker(); };
      js.onerror = () => { leafletP = null; toast('El mapa no cargó', 'Revisa tu conexión para ver el mapa.', { type: 'error' }); res(false); };
      document.head.appendChild(js);
    });
    return leafletP;
  }
  const tiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

  const pinIcon = p => L.divIcon({
    className: 'pin-icon',
    html: `<div class="pin ${isMine(p) ? 'pin--own' : ''} ${p.aliado ? 'pin--ally' : ''} ${p.oficial ? 'pin--oficial' : ''} ${isFull(p) ? 'pin--full' : ''} ${p._drop ? 'pin--drop' : ''}" title="${esc(p.titulo)}">${ic(p.oficial ? 'i-crown' : catById(p.categoria).icon)}</div>`,
    iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40],
  });
  const meIcon = () => L.divIcon({ className: 'me-icon', html: '<div class="me-dot"><span class="me-label">Tú</span></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

  // Lugares sugeridos que coinciden con lo que se busca (salen primero en el buscador)
  const lugaresQue = q => LUGARES.filter(l => norm(l.nombre + ' ' + l.ref).includes(norm(q)))
    .map(l => ({ nombre: l.nombre, detalle: l.ref, lat: l.lat, lng: l.lng, id: l.id }));
  let searchMarker = null;

  function initLiveMap() {
    if (liveMap || typeof L === 'undefined') return;
    liveMap = L.map('live-map', { zoomControl: false }).setView(CENTER, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(liveMap);
    tiles().addTo(liveMap);
    // Buscar cualquier lugar o dirección de Villavo y volar hasta allá
    if (window.MPMapa) window.MPMapa.buscador(liveMap, {
      placeholder: 'Busca un lugar o dirección',
      extras: lugaresQue,
      onElegir: r => {
        if (searchMarker) liveMap.removeLayer(searchMarker);
        searchMarker = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: 'pin-icon', html: '<div class="pin pin--search">' + ic('i-pin') + '</div>', iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40] }) })
          .bindPopup(`<div class="pop-search"><b>${esc(r.nombre)}</b>${r.detalle ? `<small>${esc(r.detalle)}</small>` : ''}<button class="btn btn--xs" data-action="crear-aqui" data-lat="${r.lat}" data-lng="${r.lng}" data-nombre="${esc(r.nombre)}">${ic('i-plus')} Abrir un parche aquí</button></div>`, { className: 'mp-popup' })
          .addTo(liveMap);
        liveMap.once('moveend', () => searchMarker && searchMarker.openPopup());
      },
    });
    if (userPos) updateUserMarker();
  }

  function renderTimeSeg() {
    $$('#time-seg .seg-btn').forEach(b => { const on = b.dataset.time === state.time; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    requestAnimationFrame(() => movePill($('#time-seg')));
  }

  function renderLiveMap() {
    const list = activeList().filter(timeMatch).filter(enMapa);
    if (liveMap) {
      const ids = new Set(list.map(p => p.id));
      liveMarkers.forEach((m, id) => { if (!ids.has(id)) { liveMap.removeLayer(m); liveMarkers.delete(id); } });
      list.forEach(p => {
        let m = liveMarkers.get(p.id);
        if (!m) {
          m = L.marker([p.lat, p.lng], { icon: pinIcon(p), riseOnHover: true });
          m.bindPopup(() => popupHTML(findP(p.id) || p), { className: 'mp-popup', minWidth: 260, maxWidth: 260, autoPanPadding: [30, 90] });
          m.addTo(liveMap);
          liveMarkers.set(p.id, m);
        } else {
          m.setLatLng([p.lat, p.lng]);
          m.setIcon(pinIcon(p));
          if (m.isPopupOpen()) m.getPopup().update();
        }
        delete p._drop;
      });
    }
    $('#map-counter').innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'parche' : 'parches'} ${timeLabel()}`;
    const empty = $('#map-empty');
    if (!list.length) {
      empty.hidden = false;
      empty.innerHTML = emptyHTML({ art: 'radar', title: `Nada ${state.time === 'todos' ? 'todavía' : timeLabel()}`, text: 'Ese día está libre. Arma el plan y la gente se suma.', cta: 'Ser el primero' });
    } else empty.hidden = true;
  }

  function flyToParche(id) {
    const p = findP(id);
    if (!p) return;
    if (!enMapa(p)) { toast('Lugar por confirmar', 'Apenas el equipo confirme el sitio, el parche aparece en el mapa.', { icon: 'i-pin' }); return; }
    closeAllModals();
    if (!timeMatch(p)) state.time = dayKey(p.inicio) === todayKey() ? 'hoy' : dayKey(p.inicio) === offsetKey(1) ? 'manana' : 'todos';
    const wasMap = state.view === 'mapa';
    if (!wasMap) go('mapa'); else renderTimeSeg();
    loadLeaflet().then(ok => ok && setTimeout(() => {
      initLiveMap();
      if (!liveMap) return;
      liveMap.invalidateSize();
      renderLiveMap();
      const m = liveMarkers.get(id);
      if (reduceMotion) { liveMap.setView([p.lat, p.lng], 16); m && m.openPopup(); }
      else { liveMap.flyTo([p.lat, p.lng], 16, { duration: 1.4 }); if (m) liveMap.once('moveend', () => m.openPopup()); }
    }, wasMap ? 60 : 140));
  }

  let watchId = null, flyOnFix = false;
  const setGeoStatus = html => { $('#geo-status').innerHTML = html; };
  function startGeo({ fly = false } = {}) {
    if (!('geolocation' in navigator)) {
      setGeoStatus(`${ic('i-info')} Tu navegador no comparte ubicación. Medimos desde el centro de Villavicencio.`);
      if (fly) toast('Sin GPS', 'Este navegador no permite compartir la ubicación.', { type: 'error' });
      return;
    }
    flyOnFix = flyOnFix || fly;
    if (fly && userPos) flyToUser();
    const opts = { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 };
    navigator.geolocation.getCurrentPosition(onPos, onGeoErr, opts);
    if (watchId === null) watchId = navigator.geolocation.watchPosition(onPos, onGeoErr, opts);
    if (!userPos) setGeoStatus(`${ic('i-locate')} Buscando tu ubicación...`);
  }
  function onPos(pos) {
    const p = [pos.coords.latitude, pos.coords.longitude];
    const moved = !userPos || haversine(userPos, p) > 0.08;
    userPos = p; userAcc = pos.coords.accuracy;
    updateUserMarker();
    setGeoStatus(`${ic('i-locate')} Ubicación en vivo · precisión ${Math.round(userAcc)} m`);
    $('#map-locate').classList.add('is-on');
    if (flyOnFix) { flyOnFix = false; flyToUser(); }
    if (moved) { if (state.view === 'inicio') renderCards(); if (state.view === 'mapa') renderLiveMap(); }
  }
  function onGeoErr(err) {
    const msg = err && err.code === 1 ? 'No diste permiso de ubicación.' : 'No pudimos leer tu ubicación.';
    setGeoStatus(`${ic('i-info')} ${msg} Medimos desde el centro de Villavicencio.`);
    if (flyOnFix) { flyOnFix = false; toast('Sin ubicación', msg + ' Actívala en el candado de la barra de direcciones.', { type: 'error' }); }
  }
  function updateUserMarker() {
    if (!userPos || typeof L === 'undefined') return;
    if (liveMap) {
      if (!meMarker) {
        meMarker = L.marker(userPos, { icon: meIcon(), zIndexOffset: 1000, interactive: false }).addTo(liveMap);
        meCircle = L.circle(userPos, { radius: userAcc || 30, color: '#1f6feb', weight: 1.5, fillColor: '#1f6feb', fillOpacity: .1 }).addTo(liveMap);
      } else { meMarker.setLatLng(userPos); meCircle.setLatLng(userPos).setRadius(userAcc || 30); }
    }
    if (createMap) {
      if (!createMe) createMe = L.marker(userPos, { icon: meIcon(), interactive: false }).addTo(createMap);
      else createMe.setLatLng(userPos);
    }
  }
  function flyToUser() {
    if (state.view !== 'mapa') go('mapa');
    loadLeaflet().then(ok => ok && setTimeout(() => {
      initLiveMap();
      if (!liveMap || !userPos) return;
      liveMap.invalidateSize();
      updateUserMarker();
      liveMap.flyTo(userPos, 15, { duration: reduceMotion ? 0 : 1.2 });
    }, 120));
  }

  /* Mini mapa del formulario */
  function initCreateMap() {
    if (typeof L === 'undefined') return;
    if (!createMap) {
      createMap = L.map('create-map', { attributionControl: false, zoomControl: false }).setView(CENTER, 13);
      L.control.zoom({ position: 'bottomright' }).addTo(createMap);
      tiles().addTo(createMap);
      createMap.on('click', e => { setCreatePin(e.latlng.lat, e.latlng.lng); selectPlaceChip(null); autoLugar(e.latlng.lat, e.latlng.lng); });
      if (window.MPMapa) window.MPMapa.buscador(createMap, {
        placeholder: 'Busca el sitio exacto',
        extras: lugaresQue,
        onElegir: r => {
          if (r.id) { choosePlace(r.id); return; }
          setCreatePin(r.lat, r.lng); selectPlaceChip(null);
          F('lugar').value = String(r.nombre).slice(0, 60); draft.autoLugar = true;
          draft.barrio = String(r.detalle || '').split(',')[0].trim().slice(0, 40);
          touched.add('lugar'); validate('lugar'); syncCreateUI();
        },
      });
      updateUserMarker();
    }
    createMap.invalidateSize();
    if (draft.lat != null) { setCreatePin(draft.lat, draft.lng, true); createMap.setView([draft.lat, draft.lng], 15); }
    else { if (createMarker) { createMap.removeLayer(createMarker); createMarker = null; } createMap.setView(userPos || CENTER, 13); }
  }
  function setCreatePin(lat, lng, silent = false) {
    draft.lat = +(+lat).toFixed(6); draft.lng = +(+lng).toFixed(6);
    const icon = pinIcon({ categoria: F('categoria').value || 'chill', propio: true, cuposMax: 10, confirmados: [], unido: true, titulo: 'Punto de encuentro' });
    if (!createMarker) {
      createMarker = L.marker([draft.lat, draft.lng], { icon, draggable: true }).addTo(createMap);
      createMarker.on('dragend', () => { const ll = createMarker.getLatLng(); setCreatePin(ll.lat, ll.lng); selectPlaceChip(null); autoLugar(ll.lat, ll.lng); });
    } else { createMarker.setLatLng([draft.lat, draft.lng]); createMarker.setIcon(icon); }
    $('#create-coords').textContent = `Punto marcado · a ${fmtKm(haversine(origin(), [draft.lat, draft.lng]))} de ti`;
    if (!silent) { touched.add('map'); validate('map'); }
  }
  // Al soltar el pin buscamos la dirección real del punto y llenamos el lugar
  // (solo si la persona no escribió uno a mano)
  let autoLugarTurno = 0;
  function autoLugar(lat, lng) {
    if (!window.MPMapa) return;
    const turno = ++autoLugarTurno;
    $('#create-coords').textContent = 'Punto marcado · buscando la dirección...';
    window.MPMapa.inverso(lat, lng).then(r => {
      if (turno !== autoLugarTurno || draft.lat == null) return;
      const lejos = `a ${fmtKm(haversine(origin(), [draft.lat, draft.lng]))} de ti`;
      if (!r) { $('#create-coords').textContent = `Punto marcado · ${lejos}`; return; }
      $('#create-coords').textContent = `${r.texto || 'Punto marcado'} · ${lejos}`;
      draft.barrio = String(r.barrio || draft.barrio || '').slice(0, 40);
      const actual = F('lugar').value.trim();
      if (!actual || draft.autoLugar) {
        const nombre = r.lugar || r.direccion || r.barrio;
        if (nombre) { F('lugar').value = nombre.slice(0, 60); draft.autoLugar = true; touched.add('lugar'); validate('lugar'); }
      }
      syncCreateUI();
    });
  }

  /* =====================================================================
     8. CREAR, EDITAR, UNIRSE Y CANCELAR
  ===================================================================== */
  let editingId = null;
  const draft = { lat: null, lng: null, barrio: '' };
  const touched = new Set();
  const F = name => $(`#form-create [name="${name}"]`);

  const RULES = {
    titulo: v => !v.trim() ? 'Ponle un nombre a tu parche.' : v.trim().length < 5 ? 'Mínimo 5 caracteres.' : '',
    categoria: v => !v ? 'Elige una categoría.' : '',
    cupos: v => {
      const n = Number(v);
      if (v === '' || !Number.isInteger(n)) return 'Escribe un número entero.';
      if (n < 2) return 'Mínimo 2 cupos.';
      if (n > 60) return 'Máximo 60 cupos.';
      const p = editingId && findP(editingId);
      return p && n < ocupados(p) ? `Ya hay ${ocupados(p)} confirmados.` : '';
    },
    fecha: v => !v ? 'Elige la fecha.' : v < todayKey() ? 'Esa fecha ya pasó.' : daysFromToday(v) > 60 ? 'Máximo 60 días hacia adelante.' : '',
    hora: v => {
      if (!v) return 'Elige la hora.';
      const f = F('fecha').value;
      return f === todayKey() && tsFrom(f, v) < Date.now() + 5 * MIN ? 'Esa hora ya pasó.' : '';
    },
    costo: v => v === '' || Number(v) < 0 ? 'Usa 0 si es gratis.' : '',
    descripcion: v => v.trim().length < 10 ? 'Cuenta un poco más (mínimo 10 caracteres).' : '',
    lugar: v => v.trim().length < 3 ? 'Escribe el lugar o elige uno sugerido.' : '',
    map: () => draft.lat == null ? 'Toca el mapa o elige un lugar para marcar el punto.' : '',
  };
  function setFieldState(field, msg) {
    field.classList.toggle('is-error', !!msg);
    const out = $('.field-msg', field);
    if (out) out.innerHTML = msg ? `${ic('i-alert')} ${esc(msg)}` : '';
  }
  function validate(name) {
    const field = name === 'map' ? $('#field-map') : F(name)?.closest('.field');
    if (!field) return true;
    const msg = RULES[name](name === 'map' ? '' : F(name).value);
    if (name !== 'map') { if (msg) F(name).setAttribute('aria-invalid', 'true'); else F(name).removeAttribute('aria-invalid'); }
    setFieldState(field, msg);
    return !msg;
  }
  function clearValidation() {
    touched.clear();
    $$('#form-create .field').forEach(f => { f.classList.remove('is-error'); const m = $('.field-msg', f); if (m) m.innerHTML = ''; });
  }

  function renderPlaceChips() {
    $('#place-chips').innerHTML = LUGARES.map(l => `<button type="button" class="chip" data-place="${l.id}" aria-pressed="false">${ic('i-pin')} ${esc(l.nombre)}</button>`).join('');
  }
  function selectPlaceChip(id) {
    $$('#place-chips .chip').forEach(c => {
      const on = c.dataset.place === id;
      c.setAttribute('aria-pressed', String(on));
      // El lugar elegido queda a la vista dentro de la fila
      if (on) c.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }
  function choosePlace(id) {
    const l = lugar(id);
    if (!l) return;
    F('lugar').value = l.nombre;
    draft.barrio = l.ref;
    draft.autoLugar = false;
    selectPlaceChip(id);
    touched.add('lugar'); validate('lugar');
    if (createMap) { setCreatePin(l.lat, l.lng); createMap.flyTo([l.lat, l.lng], 16, { duration: reduceMotion ? 0 : .8 }); }
    syncCreateUI();
  }

  /* ---------- Formulario de crear: selector, atajos y vista previa ---------- */
  function renderCatPicker() {
    $('#cat-picker').innerHTML = CATS.map(c => `<button type="button" class="cat-opt ${c.tone}" role="radio" aria-checked="false" data-cat-pick="${c.id}">
      <img src="${STK(c.art)}" alt="" loading="lazy" decoding="async"><span>${esc(c.label)}</span></button>`).join('');
  }
  function nextWeekday(dow) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7)); return dayKey(d); }
  function renderQuickDates() {
    const opts = [['Hoy', todayKey()], ['Mañana', offsetKey(1)], ['Este viernes', nextWeekday(5)], ['Este sábado', nextWeekday(6)]];
    const seen = new Set();
    $('#quick-date').innerHTML = opts.filter(([, k]) => !seen.has(k) && seen.add(k))
      .map(([l, k]) => `<button type="button" class="qchip" data-qdate="${k}">${l}</button>`).join('');
  }
  function syncCreateUI() {
    const cat = F('categoria').value, fecha = F('fecha').value, costo = Number(F('costo').value) || 0;
    $$('#cat-picker .cat-opt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.catPick === cat)));
    $$('#quick-date .qchip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.qdate === fecha)));
    $$('[data-qprice]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.qprice) === costo)));
    $$('[data-count-for]').forEach(c => { const i = $('#' + c.dataset.countFor); c.textContent = `${i.value.length}/${i.maxLength}`; c.classList.toggle('is-near', i.value.length > i.maxLength * .9); });
    const c = catById(cat), cupos = clamp(Number(F('cupos').value) || 0, 0, 60);
    const ts = fecha && F('hora').value ? tsFrom(fecha, F('hora').value) : null;
    const titulo = F('titulo').value.trim() || 'Tu parche';
    const when = ts ? fmtCuando(ts) : 'Elige fecha y hora';
    const precioTxt = costo ? money(costo) : 'Gratis';
    renderFotoParche();
    $('#create-preview').innerHTML = `
      <div class="cpv-cover ${c.tone} ${draft.foto ? 'has-photo' : ''}"><img src="${draft.foto ? esc(draft.foto) : STK(c.art)}" alt=""><span class="tag">${ic(c.icon)} ${esc(c.label)}</span><span class="tag tag--price tnum">${precioTxt}</span></div>
      <div class="cpv-body">
        <b>${esc(titulo)}</b>
        <ul class="meta">
          <li>${ic('i-clock')}<span class="tnum">${esc(when)}</span></li>
          <li>${ic('i-pin')}<span>${esc(F('lugar').value.trim() || 'Sin lugar todavía')}</span></li>
          <li>${ic('i-users')}<span class="tnum">${cupos} cupos · tú eres el primero</span></li>
        </ul>
      </div>`;
    $('#create-summary').textContent = ts ? `${when} · ${cupos} cupos · ${precioTxt}` : '';
  }

  /* ---------- Foto del parche (opcional, para cualquier persona) ---------- */
  function renderFotoParche() {
    const box = $('#c-foto-box');
    if (!box) return;
    box.classList.toggle('has-photo', !!draft.foto);
    $('#c-foto-img').src = draft.foto || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    $('#c-foto-quitar').hidden = !draft.foto;
    $('#c-foto-txt').textContent = draft.foto ? 'Cambiar foto' : 'Agregar foto';
  }
  // Achica la foto en el celular antes de subirla (máx. 1280 px, JPEG ~80 %)
  function comprimirFoto(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res(cv.toDataURL('image/jpeg', .8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('FOTO')); };
      img.src = url;
    });
  }
  async function elegirFotoParche(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Eso no es una foto', 'Elige una imagen JPG, PNG o WebP.', { type: 'error' }); return; }
    try {
      draft.foto = await comprimirFoto(file);
      if (draft.foto.length > 1.9 * 1024 * 1024 * 1.37) throw new Error('FOTO');
      syncCreateUI();
    } catch (e) { draft.foto = ''; toast('No pudimos usar esa foto', 'Prueba con otra más liviana.', { type: 'error' }); syncCreateUI(); }
  }

  function openCreate({ id = null, punto = null } = {}) {
    editingId = id;
    draft.autoLugar = false;
    const p = id ? findP(id) : null;
    $('#form-create').reset();
    clearValidation();
    $('#create-title').textContent = p ? 'Editar parche' : 'Abrir el parche';
    $('#create-kicker').textContent = p ? 'Cambios para los que ya van' : 'Nuevo plan en Villavo';
    renderQuickDates();
    $('#create-submit span').textContent = p ? 'Guardar cambios' : 'Publicar parche';
    const del = $('#create-delete');
    if (del) { del.hidden = !p; del.dataset.id = p ? p.id : ''; }
    if (p) {
      F('titulo').value = p.titulo; F('categoria').value = p.categoria; F('cupos').value = p.cuposMax;
      F('fecha').value = dayKey(p.inicio);
      const d = new Date(p.inicio); F('hora').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      F('costo').value = precio(p); F('descripcion').value = p.descripcion; F('lugar').value = p.lugar;
      draft.lat = p.lat; draft.lng = p.lng; draft.barrio = p.barrio || '';
      draft.foto = p.imagen || '';
    } else {
      F('categoria').value = 'chill';
      F('fecha').value = todayKey();
      const h = new Date(Date.now() + 90 * MIN);
      F('hora').value = h.getDate() === new Date().getDate() ? `${pad(h.getHours())}:00` : '23:00';
      F('cupos').value = 8; F('costo').value = 0;
      draft.lat = null; draft.lng = null; draft.barrio = '';
      draft.foto = '';
      // "Abrir un parche aquí" desde el buscador del mapa
      if (punto) { draft.lat = +(+punto.lat).toFixed(6); draft.lng = +(+punto.lng).toFixed(6); F('lugar').value = String(punto.nombre || '').slice(0, 60); draft.autoLugar = true; }
    }
    F('fecha').min = todayKey();
    const match = p && LUGARES.find(l => l.lat === p.lat && l.lng === p.lng);
    selectPlaceChip(match ? match.id : null);
    $('#create-coords').textContent = draft.lat != null ? 'Punto marcado' : 'Toca el mapa para soltar el pin';
    syncCreateUI();
    openModal('modal-create');
    loadLeaflet().then(ok => {
      if (!ok) return;
      setTimeout(initCreateMap, 120);
      setTimeout(() => createMap && createMap.invalidateSize(), 420);
    });
  }

  function draftParche() {
    const base = editingId ? findP(editingId) : null;
    const costo = Math.max(0, Number(F('costo').value) || 0);
    return normalizeParche({
      id: editingId || 'u' + Date.now().toString(36),
      titulo: F('titulo').value.trim(), categoria: F('categoria').value, descripcion: F('descripcion').value.trim(),
      inicio: tsFrom(F('fecha').value, F('hora').value),
      lugar: F('lugar').value.trim(), barrio: draft.barrio, lat: draft.lat, lng: draft.lng,
      costo, presupuesto: costo, cuposMax: clamp(Number(F('cupos').value) || 2, 2, 60),
      imagen: draft.foto || '',
      confirmados: base ? base.confirmados : [], chat: base ? base.chat : [],
      unido: true, propio: true, creadorId: 'me', creadoPorMi: true, checkin: base ? base.checkin : false,
    });
  }

  async function submitCreate(e) {
    e.preventDefault();
    const names = Object.keys(RULES);
    names.forEach(n => touched.add(n));
    const bad = names.filter(n => !validate(n));
    if (bad.length) {
      const first = bad[0] === 'map' ? $('#create-map') : F(bad[0]);
      first.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      if (bad[0] !== 'map') setTimeout(() => first.focus({ preventScroll: true }), 250);
      return;
    }
    const btn = $('#create-submit');
    btn.classList.add('is-loading');
    const d = draftParche();
    let id = d.id;
    if (!DEMO) {
      id = await saveParcheRemote(d, editingId);
      btn.classList.remove('is-loading');
      if (!id) return;
    } else {
      await new Promise(r => setTimeout(r, 450));
      btn.classList.remove('is-loading');
      if (editingId) Object.assign(findP(editingId), d);
      else {
        d.chat = [{ tipo: 'sys', texto: 'Abriste el parche. Comparte el enlace para que la gente caiga.', ts: Date.now() }];
        state.parches.push(d);
      }
      save();
    }
    const p = findP(id);
    if (p && !editingId) p._drop = true;
    closeModal('modal-create');
    toast(editingId ? 'Parche actualizado' : '¡Parche publicado!', editingId ? 'Los confirmados ya ven los cambios.' : `Ya está en el mapa: ${p ? fmtCuando(p.inicio) : ''}`, { icon: editingId ? 'i-check' : 'i-bolt' });
    renderNavCount();
    if (p) flyToParche(id);
  }

  async function toggleJoin(id) {
    const p = findP(id);
    if (!p || isMine(p)) return;
    const salir = p.unido;
    if (!salir && isFull(p)) { toast('Parche lleno', 'Ya no quedan cupos en este plan.', { type: 'error' }); return; }
    p.unido = !salir; // interfaz optimista
    if (!isRemote(p)) p.chat.push({ tipo: 'sys', texto: `${ME().nombre} ${salir ? 'se abrió del parche' : 'le cayó al parche'}`, ts: Date.now() });
    toast(salir ? 'Te abriste del parche' : '¡Le caíste al parche!', salir ? `Liberaste tu cupo en ${p.titulo}.` : `Ya puedes escribir en el chat de ${p.titulo}.`, { icon: salir ? 'i-logout' : 'i-bolt', action: salir ? null : { label: 'Chat', act: 'chat', id } });
    save(); refresh();
    if (liveMap && liveMap.closePopup) { const m = liveMarkers.get(id); if (m && m.isPopupOpen()) m.getPopup().update(); }
    if (state.chatId === id) renderChat();
    if (!isRemote(p)) return;
    const res = salir
      ? await sb.from('parche_miembros').delete().eq('parche_id', id).eq('usuario_id', me.id)
      : await sb.from('parche_miembros').insert({ parche_id: id });
    if (res.error) {
      p.unido = salir; refresh();
      toast('No se pudo guardar', dbMsg(res.error), { type: 'error' });
    }
    await reloadParche(id);
  }

  function askLeave(id) {
    const p = findP(id);
    if (!p) return;
    $('#confirm-title').textContent = '¿Salirte del parche?';
    $('#confirm-text').textContent = `Liberas tu cupo en "${p.titulo}" y dejas de ver el chat.`;
    $('#confirm-ok').textContent = 'Sí, salirme';
    $('#confirm-ok').onclick = () => { closeModal('modal-confirm'); toggleJoin(id); };
    openModal('modal-confirm');
  }

  function askDelete(id) {
    const p = findP(id);
    if (!p) return;
    if (!isMine(p)) return;
    const n = p.confirmados.length;
    $('#confirm-title').textContent = '¿Eliminar el parche?';
    $('#confirm-text').textContent = `"${p.titulo}" se borra del mapa, de la lista y su chat. ${n ? `Les avisamos a ${n === 1 ? 'la persona que iba' : `las ${n} personas que iban`}.` : 'Nadie se había unido todavía.'} No se puede deshacer.`;
    $('#confirm-ok').textContent = 'Sí, eliminar';
    $('#confirm-ok').onclick = async () => {
      if (isRemote(p)) {
        const { error } = await sb.from('parches').delete().eq('id', id);
        if (error) { toast('No se pudo cancelar', dbMsg(error), { type: 'error' }); return; }
      }
      removeParcheLocal(id);
      save();
      closeAllModals();
      toast('Parche eliminado', 'Lo quitamos del mapa, de la lista y del chat.', { icon: 'i-trash' });
    };
    openModal('modal-confirm');
  }
  function removeParcheLocal(id) {
    state.parches = state.parches.filter(x => x.id !== id);
    const m = liveMarkers.get(id);
    if (m && liveMap) { liveMap.removeLayer(m); liveMarkers.delete(id); }
    if (state.chatId === id) { state.chatId = null; $('#mis-wrap').classList.remove('is-chat'); }
    refresh();
  }

  /* =====================================================================
     9. MIS PARCHES + CHAT
  ===================================================================== */
  const typing = { on: false };
  function misList() {
    const l = state.misTab === 'propios'
      ? state.parches.filter(p => isMine(p) && !isPast(p))
      : state.parches.filter(p => p.unido && !isMine(p) && !isPast(p));
    return l.sort((a, b) => a.inicio - b.inicio);
  }
  function renderMis() {
    $$('#mis-seg .seg-btn').forEach(b => { const on = b.dataset.mis === state.misTab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    requestAnimationFrame(() => movePill($('#mis-seg')));
    const list = misList();
    $('#mis-list').innerHTML = list.length ? list.map((p, i) => `
      <li class="mis-row" data-id="${p.id}">
        <div class="mis-actions" aria-hidden="true">${misActionsHTML(p)}</div>
        <button class="mis-item ${state.chatId === p.id ? 'is-active' : ''}" data-action="chat" data-id="${p.id}" style="--d:${i * 60}ms">
          <span class="mis-ic ${isMine(p) ? 'is-own' : ''}">${ic(catById(p.categoria).icon)}</span>
          <span><b>${esc(p.titulo)}</b><small class="tnum">${esc(fmtCuando(p.inicio))} · ${ocupados(p)}/${p.cuposMax}</small></span>
        </button>
      </li>`).join('')
      : `<li class="mis-empty">${state.misTab === 'propios'
          ? emptyHTML({ art: 'corona-armador', title: 'Aún no armas uno', text: 'Abre tu primer parche y gánate la insignia de El armador.' })
          : emptyHTML({ art: 'sneaker', title: 'Aún no te unes', text: 'Mira lo que hay abierto y cáele a un plan.', cta: 'Ver parches', action: 'go-inicio' })}</li>`;
    const current = state.chatId && findP(state.chatId);
    if (!current && !isMobile() && list.length) { openChat(list[0].id, { quiet: true }); return; }
    renderChat();
    hintReveal();
  }

  // Acciones que aparecen al deslizar un parche hacia la izquierda
  function misActionsHTML(p) {
    const b = (act, icon, label, cls = '') => `<button class="mis-act ${cls}" data-action="${act}" data-id="${p.id}" tabindex="-1">${ic(icon)}<span>${label}</span></button>`;
    return isMine(p)
      ? b('ver-mapa', 'i-map', 'Mapa') + b('editar', 'i-edit', 'Editar', 'is-ink') + b('cancelar', 'i-trash', 'Eliminar', 'is-danger')
      : b('ver-mapa', 'i-map', 'Mapa') + b('salir', 'i-logout', 'Salir', 'is-danger');
  }

  function openChat(id, { quiet = false } = {}) {
    const p = findP(id);
    if (!p) return;
    closeAllModals();
    state.misTab = isMine(p) ? 'propios' : 'unido';
    if (state.chatId !== id) { replyTo = null; state.chatFiltro = 'todo'; }
    state.chatId = id;
    if (state.view !== 'mis') go('mis');
    else { $$('.mis-item').forEach(b => b.classList.toggle('is-active', b.dataset.id === id)); renderChat(); }
    if (!quiet || isMobile()) $('#mis-wrap').classList.toggle('is-chat', isMobile());
    if (isRemote(p)) { loadChat(id); cargarExtras(id); }
  }

  // Llave estable de cada mensaje: id de la base o una local para el modo demo
  const msgKey = m => m.id != null ? 'i' + m.id : (m.key || (m.key = 'k' + m.ts + Math.random().toString(36).slice(2, 6)));
  const autorNombre = a => a === 'me' ? 'Tú' : a === 'bot' ? 'Bot del parche' : personById(a)?.nombre || 'Parcero';
  // Lo que se cita: copia guardada (demo y recién enviado) o el mensaje original por id
  function citaDe(m, list) {
    if (m.reply) return m.reply;
    if (m.replyId == null) return null;
    const o = (list || []).find(x => x.id === m.replyId);
    return o ? { key: msgKey(o), autor: o.tipo === 'bot' ? 'bot' : o.autor, texto: o.texto } : { key: 'i' + m.replyId, autor: null, texto: 'Mensaje anterior' };
  }
  const quoteHTML = q => q ? `<button type="button" class="msg-quote" data-action="ir-msg" data-key="${esc(q.key)}"><b>${esc(q.autor ? autorNombre(q.autor) : 'Respuesta')}</b><span>${esc(String(q.texto).slice(0, 140))}</span></button>` : '';

  function msgHTML(m, i, list) {
    const t = `<time>${fmtHora(m.ts)}</time>`;
    if (m.tipo === 'sys') return `<div class="msg msg--sys"><div class="bubble">${esc(m.texto)}</div></div>`;
    if (m.tipo === 'alerta') return `<div class="msg msg--sys msg--alert"><div class="bubble">${esc(m.texto)}</div></div>`;
    if (m.tipo === 'encuesta') return encuestaHTML(m);
    const k = msgKey(m);
    const replyBtn = `<button class="msg-act" data-action="responder" data-key="${esc(k)}" aria-label="Responder este mensaje" title="Responder">${ic('i-reply')}</button>`;
    const swipeIc = `<span class="msg-swipe-ic" aria-hidden="true">${ic('i-reply')}</span>`;
    if (m.tipo === 'bot') return `<div class="msg msg--bot" data-key="${esc(k)}">${swipeIc}<span class="bot-ic">${ic('i-bot')}</span><div class="bubble"><small>Bot del parche</small>${esc(m.texto)}${t}</div>${replyBtn}</div>`;
    const mine = m.autor === 'me';
    const rep = !mine && m.id != null && /^\d+$/.test(String(m.id)) ? `<button class="msg-rep" data-action="reportar" data-tipo="mensaje" data-id="${m.id}" aria-label="Reportar este mensaje" title="Reportar mensaje">${ic('i-flag')}</button>` : '';
    const pc = state.chatId && findP(state.chatId);
    const loc = pc && pc.oficial && pc.locs[m.autor] ? `<em class="msg-loc">${esc(pc.locs[m.autor])}</em>` : '';
    return `<div class="msg ${mine ? 'msg--me' : ''}" data-key="${esc(k)}">${swipeIc}${avHTML(m.autor, 'av--sm')}<div class="bubble">${mine ? '' : `<small>${esc(personById(m.autor)?.nombre || 'Parcero')}${sello(m.autor)}${loc}</small>`}${quoteHTML(citaDe(m, list))}${esc(m.texto)}${t}</div>${replyBtn}${rep}</div>`;
  }
  /* ---------- Parches grandes: anuncios y subgrupos por localidad ---------- */
  const esAnuncio = m => m.tipo === 'sys' || m.tipo === 'bot' || m.tipo === 'alerta';
  // Consejo de seguridad fijo arriba del chat cuando el parche es pronto
  const consejoChatHTML = p => p.inicio - Date.now() < 30 * HOUR && p.inicio > Date.now() - 6 * HOUR
    ? `<p class="chat-tip">${ic('i-shield')}<span><b>Consejo:</b> ${esc(consejoDelDia(2))} <button type="button" class="link-inline" data-action="seguridad" data-id="${p.id}">Ayuda</button></span></p>` : '';
  function chatLista(p) {
    if (!p.oficial || state.chatFiltro === 'todo') return p.chat;
    if (state.chatFiltro === 'anuncios') return p.chat.filter(esAnuncio);
    return p.chat.filter(m => esAnuncio(m) || m.autor === 'me' || (p.localidad && p.locs[m.autor] === p.localidad));
  }
  const chatVacioHTML = () => state.chatFiltro === 'local'
    ? '<p class="chat-vacio">Aún nadie de tu localidad escribe. ¡Arranca tú!</p>'
    : state.chatFiltro === 'anuncios' ? '<p class="chat-vacio">Todavía no hay anuncios del equipo.</p>' : '';
  function chatTabsHTML(p) {
    if (!p.oficial) return '';
    const t = (k, l) => `<button type="button" class="ctab" role="tab" data-chatf="${k}" aria-selected="${state.chatFiltro === k}">${l}</button>`;
    return `<div class="chat-tabs" role="tablist" aria-label="Qué mensajes ver">${t('todo', 'Todo')}${t('anuncios', 'Anuncios')}${p.localidad ? t('local', esc(p.localidad)) : ''}</div>`;
  }
  const opcionesLocalidad = p => (Array.isArray(p.info.localidades) ? p.info.localidades.map(l => l.nombre) : []).concat(p.info.palco_precio ? ['Palco'] : []);
  function localidadHTML(p) {
    if (!p.oficial || !inside(p)) return '';
    const ops = opcionesLocalidad(p);
    if (!ops.length) return '';
    return `<div class="loc-pick"><span>${p.localidad ? 'Tu localidad' : '¿En qué localidad vas?'}</span>${ops.map(o => `<button type="button" class="loc-chip" data-loc="${esc(o)}" aria-pressed="${p.localidad === o}">${esc(o)}</button>`).join('')}</div>`;
  }
  async function setLocalidad(loc) {
    const p = state.chatId && findP(state.chatId);
    if (!p || !inside(p)) return;
    const antes = p.localidad;
    p.localidad = p.localidad === loc ? '' : loc;
    if (p.localidad) p.locs.me = p.localidad; else delete p.locs.me;
    if (!p.localidad && state.chatFiltro === 'local') state.chatFiltro = 'todo';
    renderChat();
    if (!isRemote(p)) { save(); return; }
    const { error } = await sb.from('parche_miembros').update({ localidad: p.localidad || null }).eq('parche_id', p.id).eq('usuario_id', me.id);
    if (error) {
      p.localidad = antes; if (antes) p.locs.me = antes; else delete p.locs.me;
      renderChat();
      toast('No se guardó tu localidad', /localidad/.test(error.message) ? 'Falta activar esta función en la base de datos.' : dbMsg(error), { type: 'error' });
    }
  }

  // Barra "Respondiendo a ..." encima del campo de texto
  let replyTo = null, replyFresh = false;
  function replyBarHTML() {
    if (!replyTo) return '';
    const fresh = replyFresh; replyFresh = false;
    return `<div class="reply-bar ${fresh ? 'is-in' : ''}" id="reply-bar">
      <span class="reply-bar-ic">${ic('i-reply')}</span>
      <div class="reply-bar-txt"><b>Respondiendo a ${esc(autorNombre(replyTo.autor))}</b><span>${esc(String(replyTo.texto).slice(0, 140))}</span></div>
      <button type="button" class="reply-bar-x" data-action="reply-cancel" aria-label="Cancelar respuesta">${ic('i-close')}</button>
    </div>`;
  }
  function setReply(key) {
    const p = state.chatId && findP(state.chatId);
    const m = p && p.chat.find(x => msgKey(x) === key);
    if (!m || !inside(p)) return;
    replyTo = { key, id: m.id ?? null, autor: m.tipo === 'bot' ? 'bot' : m.autor, texto: m.texto };
    replyFresh = true;
    const slot = $('#reply-slot');
    if (slot) slot.innerHTML = replyBarHTML();
    const inp = $('#chat-input');
    if (inp) inp.focus({ preventScroll: true });
  }
  function clearReply({ animate = true } = {}) {
    if (!replyTo) return;
    replyTo = null;
    const bar = $('#reply-bar');
    if (!bar) return;
    if (!animate || reduceMotion) { bar.remove(); return; }
    bar.removeAttribute('id');
    bar.classList.add('is-out');
    setTimeout(() => bar.remove(), 200);
  }
  // Ir al mensaje citado y hacerlo brillar un momento
  function irAMensaje(key) {
    const el = $(`#chat-msgs .msg[data-key="${CSS.escape(key)}"]`);
    if (!el) { toast('Mensaje muy antiguo', 'Ese mensaje ya no está cargado en el chat.', { icon: 'i-info' }); return; }
    el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
  }
  // Sello de Parcero Verificado junto al nombre
  const sello = id => (id === 'me' ? perfil.cedula_verificada : personById(id)?.verificado)
    ? `<span class="sello" title="Parcero Verificado" aria-label="Parcero Verificado">${ic('i-shield')}</span>` : '';

  function renderChat() {
    const box = $('#chat');
    const p = state.chatId && findP(state.chatId);
    if (!p) {
      box.innerHTML = `<div class="chat-placeholder"><img src="${STK('parceros')}" alt=""><h3>Elige un parche</h3><p>Aquí ves el chat del grupo, quiénes van y la vaca.</p></div>`;
      return;
    }
    const keepText = $('#chat-input')?.value || '';
    const trPanel = $('[data-panel="transporte"]');
    if (trPanel) state.abiertoTransporte = trPanel.open;
    const vacaOpen = $('#vaca')?.open || false;
    const vacaVal = $('#vaca-total')?.value || '';
    const ids = (inside(p) ? ['me'] : []).concat(p.confirmados);
    const names = ids.map(id => id === 'me' ? 'Tú' : personById(id)?.nombre || 'Parcero');
    box.innerHTML = `
      <div class="chat-head">
        <div class="chat-head-top">
          <button class="icon-btn chat-back" data-action="chat-back" aria-label="Volver a la lista">${ic('i-back')}</button>
          <div>
            <h2>${esc(p.titulo)}</h2>
            <p class="tnum">${esc(p.lugar)} · ${esc(fmtCuando(p.inicio))}</p>
          </div>
          <div class="chat-head-actions">
            <button class="icon-btn icon-btn--sos" data-action="seguridad" data-id="${p.id}" aria-label="Ayuda y seguridad" title="Ayuda y seguridad">${ic('i-shield')}</button>
            <button class="icon-btn" data-action="compartir" data-id="${p.id}" aria-label="Compartir el parche" title="Compartir">${ic('i-share')}</button>
            ${enMapa(p) ? `<button class="icon-btn" data-action="ver-mapa" data-id="${p.id}" aria-label="Ver en el mapa" title="Ver en el mapa">${ic('i-map')}</button>` : ''}
            ${isMine(p)
              ? `<button class="icon-btn" data-action="editar" data-id="${p.id}" aria-label="Editar parche" title="Editar parche">${ic('i-edit')}</button>
                 <button class="icon-btn icon-btn--danger" data-action="cancelar" data-id="${p.id}" aria-label="Eliminar parche" title="Eliminar parche">${ic('i-trash')}</button>`
              : p.unido ? `<button class="icon-btn" data-action="salir" data-id="${p.id}" aria-label="Salirme del parche" title="Salirme del parche">${ic('i-logout')}</button>` : ''}
            ${!isMine(p) && isRemote(p) ? `<button class="icon-btn" data-action="reportar" data-tipo="parche" data-id="${p.id}" aria-label="Reportar este parche" title="Reportar parche">${ic('i-flag')}</button>` : ''}
          </div>
        </div>
        <details class="attendees">
          <summary><span class="stack">${ids.slice(0, 5).map(id => avHTML(id, 'av--sm')).join('')}</span><span class="tnum">${ocupados(p)} de ${p.cuposMax} van</span>${ic('i-chev-down')}</summary>
          <div class="att-list">${ids.map((id, i) => `<span>${avHTML(id, 'av--sm')}${esc(names[i])}${sello(id)}${id !== 'me' && /^[0-9a-f-]{36}$/i.test(String(id)) ? `<button class="att-rep" data-action="reportar" data-tipo="persona" data-id="${id}" aria-label="Reportar a ${esc(names[i])}" title="Reportar">${ic('i-flag')}</button>` : ''}</span>`).join('')}</div>
        </details>
      </div>
      ${chatTabsHTML(p)}
      <div class="chat-msgs" id="chat-msgs">${consejoChatHTML(p)}${chatLista(p).map(m => msgHTML(m, 0, p.chat)).join('') || chatVacioHTML()}${typing.on ? '<div class="typing" aria-label="Escribiendo"><i></i><i></i><i></i></div>' : ''}</div>
      <div class="chat-foot">${inside(p) ? `
        <div class="chat-tools">
          <details class="vaca" id="vaca" ${vacaOpen ? 'open' : ''}>
            <summary>${ic('i-cash')} Hacer la vaca ${ic('i-chev-down')}</summary>
            <div class="vaca-body">
              <div class="input-wrap">${ic('i-cash')}<input class="input tnum" id="vaca-total" type="number" min="0" step="1000" inputmode="numeric" placeholder="Gasto total del grupo" value="${esc(vacaVal)}"></div>
              <div class="vaca-result"><span class="tnum" id="vaca-split"></span><b class="tnum" id="vaca-each">$0</b></div>
              <button class="btn btn--ghost btn--xs" data-action="vaca-send">${ic('i-send')} Mandar al chat</button>
            </div>
          </details>
          ${transporteHTML(p)}
          <div class="chat-acts">
            <button type="button" class="chip-btn" data-action="invitar" data-id="${p.id}">${ic('i-users')} Invitar parceros</button>
            <button type="button" class="chip-btn" data-action="encuesta">${ic('i-chart')} Encuesta</button>
            <button type="button" class="chip-btn" data-action="album">${ic('i-camera')} Álbum${(p.album || []).length ? ` <b class="tnum">${p.album.length}</b>` : ''}</button>
          </div>
        </div>
        ${checkinHTML(p)}
        ${localidadHTML(p)}
        <div class="reply-slot" id="reply-slot">${replyBarHTML()}</div>
        <form class="chat-form" id="chat-form" autocomplete="off">
          <label class="sr-only" for="chat-input">Mensaje</label>
          <input class="input" id="chat-input" maxlength="400" placeholder="Escríbele al parche..." value="${esc(keepText)}">
          <button class="icon-btn" type="submit" aria-label="Enviar">${ic('i-send')}</button>
        </form>`
        : `<p class="chat-locked">Cáele al parche para entrar al chat.</p>${joinButton(p)}`}
      </div>`;
    updateVaca();
    scrollChat(false);
  }
  function renderChatMsgs() {
    const p = state.chatId && findP(state.chatId);
    const box = $('#chat-msgs');
    if (!p || !box) return;
    box.innerHTML = consejoChatHTML(p) + (chatLista(p).map(m => msgHTML(m, 0, p.chat)).join('') || chatVacioHTML()) + (typing.on ? '<div class="typing"><i></i><i></i><i></i></div>' : '');
    scrollChat();
  }
  function scrollChat(smooth = true) {
    const box = $('#chat-msgs');
    if (box) requestAnimationFrame(() => box.scrollTo({ top: box.scrollHeight, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' }));
  }
  function updateVaca() {
    const p = state.chatId && findP(state.chatId);
    const inp = $('#vaca-total');
    if (!p || !inp) return;
    const n = Math.max(1, ocupados(p)), total = Math.max(0, Number(inp.value) || 0);
    $('#vaca-split').textContent = `${money(total)} entre ${n}`;
    $('#vaca-each').textContent = money(Math.ceil(total / n / 100) * 100) + ' c/u';
  }

  async function sendChat(text) {
    const p = state.chatId && findP(state.chatId);
    if (!p || !text.trim()) return;
    const msg = { tipo: 'user', autor: 'me', texto: text.trim().slice(0, 400), ts: Date.now() };
    const resp = replyTo;
    if (resp) { msg.reply = { key: resp.key, autor: resp.autor, texto: resp.texto }; clearReply(); }
    p.chat.push(msg);
    renderChatMsgs();
    if (isRemote(p)) {
      const row = { parche_id: p.id, texto: msg.texto };
      if (resp && resp.id != null) row.responde_a = resp.id;
      let { data, error } = await sb.from('mensajes').insert(row).select('id').single();
      // Si la base aún no tiene la columna responde_a, el mensaje sale igual (sin la cita guardada)
      if (error && row.responde_a != null && /responde_a|PGRST204|42703/i.test(`${error.message} ${error.code}`)) {
        delete row.responde_a;
        ({ data, error } = await sb.from('mensajes').insert(row).select('id').single());
      }
      if (error) { p.chat = p.chat.filter(m => m !== msg); renderChatMsgs(); toast('No se envió', dbMsg(error), { type: 'error' }); }
      else msg.id = data.id;
      return;
    }
    save();
  }

  /* ---------- Verificar que el parche sí se hizo ----------
     Opción 1: QR del organizador (cambia cada 30 s) que el asistente escanea.
     Opción 2: GPS del navegador a menos de 200 m del punto.
     El servidor vuelve a revisar todo (checkin_qr y checkin_gps). */
  const CHECKIN_RADIO = 200; // metros
  const ventanaCheckin = p => Date.now() >= p.inicio - 90 * MIN && Date.now() <= p.inicio + 6 * HOUR;
  function checkinHTML(p) {
    if (p.checkin) return `<div class="checkin-row"><span class="checkin-done">${ic('i-check')} Ya llegaste: tu asistencia quedó confirmada</span></div>`;
    const abre = p.inicio - 90 * MIN > Date.now();
    const botones = isMine(p)
      ? `<button class="btn btn--ink btn--sm" data-action="qr-mostrar" data-id="${p.id}" ${isRemote(p) || DEMO ? '' : 'disabled'}>${ic('i-qr')} Mostrar QR de llegada</button>
         <button class="btn btn--ghost btn--sm" data-action="checkin-gps" data-id="${p.id}">${ic('i-pin')} Ya llegué al punto</button>`
      : `<button class="btn btn--ink btn--sm" data-action="checkin-gps" data-id="${p.id}">${ic('i-pin')} Ya llegué al punto</button>
         <button class="btn btn--ghost btn--sm" data-action="qr-escanear" data-id="${p.id}">${ic('i-scan')} Escanear QR</button>`;
    return `<div class="checkin-row">${botones}
      <p class="checkin-msg" id="checkin-msg" role="status" aria-live="polite">${abre ? `El check-in se abre ${esc(fmtCuando(p.inicio - 90 * MIN).toLowerCase())}` : ''}</p></div>`;
  }
  function checkinMsg(texto, tipo = '') {
    const el = $('#checkin-msg');
    if (!el) return;
    el.className = 'checkin-msg' + (tipo ? ' is-' + tipo : '');
    el.innerHTML = texto ? `${ic(tipo === 'error' ? 'i-alert' : tipo === 'ok' ? 'i-check' : 'i-locate')} ${esc(texto)}` : '';
  }
  // Mensajes de error del servidor (vienen en el "hint")
  const rpcMsg = err => (err && (err.hint || err.message)) || 'Intenta de nuevo en unos segundos.';

  function llegadaOk(p, metodo) {
    p.checkin = true;
    toast('Llegada confirmada', metodo === 'qr' ? 'Escaneaste el QR del organizador.' : 'Tu GPS confirmó que estás en el punto.', { icon: 'i-flag' });
    if (!isRemote(p)) p.chat.push({ tipo: 'sys', texto: `${ME().nombre} llegó al punto (${metodo === 'qr' ? 'QR' : 'GPS'})`, ts: Date.now() });
    save();
    if (state.chatId === p.id) renderChat();
    renderInsignias();
  }

  async function checkinGps(id, btn) {
    const p = findP(id);
    if (!p || p.checkin) return;
    if (!ventanaCheckin(p)) { checkinMsg(Date.now() < p.inicio ? 'El check-in se abre 90 minutos antes del parche.' : 'El check-in de este parche ya cerró.', 'error'); return; }
    if (!window.MPMapa) { checkinMsg('No pudimos cargar el GPS. Recarga la página.', 'error'); return; }
    if (btn) btn.classList.add('is-loading');
    checkinMsg('Buscando tu ubicación exacta...');
    let pos;
    try {
      pos = await window.MPMapa.ubicar({ objetivo: 30, maxMs: 12000, onProgreso: m => checkinMsg(`Afinando el GPS · precisión ${Math.round(m.precision)} m`) });
    } catch (e) {
      if (btn) btn.classList.remove('is-loading');
      checkinMsg(e.message || 'No pudimos leer tu ubicación.', 'error');
      return;
    }
    const dist = window.MPMapa.distancia(pos, { lat: p.lat, lng: p.lng });
    if (pos.precision > CHECKIN_RADIO) {
      if (btn) btn.classList.remove('is-loading');
      checkinMsg(`El GPS está muy impreciso (${Math.round(pos.precision)} m). Sal a un lugar abierto o usa el QR del organizador.`, 'error');
      return;
    }
    if (dist > CHECKIN_RADIO) {
      if (btn) btn.classList.remove('is-loading');
      checkinMsg(`Estás a ${fmtKm(dist / 1000)} del punto. Acércate a menos de ${CHECKIN_RADIO} m.`, 'error');
      return;
    }
    if (isRemote(p)) {
      const { error } = await sb.rpc('checkin_gps', { p_parche: id, p_lat: pos.lat, p_lng: pos.lng, p_precision: pos.precision });
      if (btn) btn.classList.remove('is-loading');
      if (error) { checkinMsg(rpcMsg(error), 'error'); return; }
    } else if (btn) btn.classList.remove('is-loading');
    llegadaOk(p, 'gps');
  }

  // El organizador muestra el QR que rota cada 30 s
  let detenerQR = null;
  async function mostrarQR(id) {
    const p = findP(id);
    if (!p || !isMine(p) || !window.MPCheckin) return;
    $('#qr-sub').innerHTML = `Que cada persona abra el chat de <b>${esc(p.titulo)}</b>, toque <b>Escanear QR</b> y apunte aquí.`;
    $('#qr-box').innerHTML = '<span class="qr-wait" aria-label="Generando el QR"></span>';
    openModal('modal-qr');
    let clave;
    if (isRemote(p)) {
      const { data, error } = await sb.rpc('mi_clave_checkin', { p_parche: id });
      if (error) { $('#qr-box').innerHTML = `<p class="qr-err">${esc(rpcMsg(error))}</p>`; return; }
      clave = data;
    } else {
      // Modo demo: secreto local solo para ver cómo se ve
      clave = { secreto: store.get('mp_demo_qr_' + id, null) || Math.random().toString(36).slice(2) + Date.now().toString(36), ahora: Date.now() };
      store.set('mp_demo_qr_' + id, clave.secreto);
    }
    if (detenerQR) detenerQR();
    try {
      detenerQR = await window.MPCheckin.mostrarQR({ clave, parcheId: id, qr: $('#qr-box'), cuenta: $('#qr-count'), codigo: $('#qr-code'), barra: $('#qr-bar') });
    } catch (e) { $('#qr-box').innerHTML = `<p class="qr-err">${esc(e.message || 'No pudimos dibujar el QR.')}</p>`; }
  }

  // El asistente escanea el QR con la cámara (o escribe el código)
  let escaner = null, escanerParche = null;
  function abrirEscaner(id) {
    const p = findP(id);
    if (!p || !window.MPCheckin) return;
    if (!ventanaCheckin(p)) { checkinMsg(Date.now() < p.inicio ? 'El check-in se abre 90 minutos antes del parche.' : 'El check-in de este parche ya cerró.', 'error'); return; }
    escanerParche = id;
    $('#scan-msg').textContent = ''; $('#scan-msg').className = 'checkin-msg';
    $('#scan-code').value = '';
    $('#qr-reader').innerHTML = '';
    openModal('modal-escaner');
    setTimeout(() => {
      escaner = window.MPCheckin.escanear('qr-reader',
        r => enviarQR(r.parcheId, r.codigo),
        (e, sigue) => { const m = $('#scan-msg'); m.className = 'checkin-msg is-error'; m.innerHTML = `${ic('i-alert')} ${esc(e.message)}`; if (!sigue) $('#scan-code').focus(); });
    }, 120);
  }
  function cerrarEscaner() { if (escaner) { escaner.detener(); escaner = null; } }
  async function enviarQR(parcheId, codigo) {
    const m = $('#scan-msg');
    const id = escanerParche;
    if (parcheId !== id) { m.className = 'checkin-msg is-error'; m.innerHTML = `${ic('i-alert')} Ese QR es de otro parche. Abre el chat del parche correcto.`; reiniciarEscaner(); return; }
    const p = findP(id);
    if (!p) return;
    m.className = 'checkin-msg'; m.innerHTML = `${ic('i-locate')} Confirmando tu llegada...`;
    if (isRemote(p)) {
      const { error } = await sb.rpc('checkin_qr', { p_parche: id, p_codigo: codigo });
      if (error) { m.className = 'checkin-msg is-error'; m.innerHTML = `${ic('i-alert')} ${esc(rpcMsg(error))}`; reiniciarEscaner(); return; }
    }
    closeModal('modal-escaner');
    llegadaOk(p, 'qr');
  }
  function reiniciarEscaner() {
    cerrarEscaner();
    setTimeout(() => {
      if ($('#modal-escaner').hidden) return;
      escaner = window.MPCheckin.escanear('qr-reader', r => enviarQR(r.parcheId, r.codigo),
        (e, sigue) => { if (!sigue) { const m = $('#scan-msg'); m.className = 'checkin-msg is-error'; m.innerHTML = `${ic('i-alert')} ${esc(e.message)}`; } });
    }, 1600);
  }

  /* ---------- Modo Mesa: reservar ---------- */
  const mesaState = { promo: null, dia: null };
  const minutos = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  const cruzaMedianoche = m => minutos(m.hora_hasta) <= minutos(m.hora_desde);
  // Timestamp de llegada: si la promo cruza la medianoche, la madrugada cae al día siguiente
  function llegadaTs(m, diaKey, hora) {
    if (!diaKey || !hora) return null;
    let ts = tsFrom(diaKey, hora);
    if (cruzaMedianoche(m) && minutos(hora) <= minutos(m.hora_hasta)) ts += 24 * HOUR;
    return ts;
  }
  function horaEnFranja(m, hora) {
    const h = minutos(hora), a = minutos(m.hora_desde), b = minutos(m.hora_hasta);
    return cruzaMedianoche(m) ? (h >= a || h <= b) : (h >= a && h <= b);
  }
  function abrirMesa(id) {
    const m = (state.mesas || []).find(x => x.id === id);
    if (!m) return;
    mesaState.promo = m;
    $('#form-mesa').reset();
    $('#mesa-local').textContent = m.negocio.nombre;
    $('#mesa-title').textContent = m.titulo;
    $('#mesa-benefit').innerHTML = `${ic('i-tag')} ${esc(m.beneficio)}`;
    $('#mesa-p-rango').textContent = `Esta promo es para grupos de ${m.min_personas} a ${m.max_personas} personas.`;
    const pin = $('#mesa-personas');
    pin.min = m.min_personas; pin.max = m.max_personas;
    pin.value = clamp(4, m.min_personas, m.max_personas);
    // Días disponibles (los próximos 7 que la promo cubre)
    const dias = [];
    for (let i = 0; i < 8 && dias.length < 5; i++) {
      const k = offsetKey(i), dow = keyToDate(k).getDay();
      if (!m.dias.includes(dow)) continue;
      // Hoy solo si todavía queda franja
      if (i === 0 && !cruzaMedianoche(m) && Date.now() + 15 * MIN > tsFrom(k, m.hora_hasta)) continue;
      dias.push({ k, txt: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${cap(weekdayLong(k)).slice(0, 3)} ${shortDate(k)}` });
    }
    $('#mesa-dias').innerHTML = dias.map(d => `<button type="button" class="qchip" data-mesa-dia="${d.k}" aria-pressed="false">${esc(d.txt)}</button>`).join('')
      || '<p class="mini-note">No hay días disponibles esta semana.</p>';
    mesaState.dia = dias[0] ? dias[0].k : null;
    $('#mesa-error').textContent = '';
    $('#mesa-dia-msg').innerHTML = ''; $('#mesa-hora-msg').innerHTML = '';
    syncMesa(true);
    openModal('modal-mesa');
  }
  function syncMesa(reiniciarHora = false) {
    const m = mesaState.promo;
    if (!m) return;
    $$('#mesa-dias [data-mesa-dia]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mesaDia === mesaState.dia)));
    // Horas sugeridas: cada hora dentro de la franja, sin las que ya pasaron
    const a = minutos(m.hora_desde), dur = (minutos(m.hora_hasta) - a + 24 * 60) % (24 * 60) || 24 * 60;
    const horas = [];
    for (let t = a; t <= a + dur && horas.length < 7; t += 60) {
      const hh = `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
      const ts = llegadaTs(m, mesaState.dia, hh);
      if (ts && ts > Date.now() + 15 * MIN) horas.push(hh);
    }
    const inp = $('#mesa-hora');
    if (reiniciarHora || !inp.value || !horas.includes(inp.value) && !horaEnFranja(m, inp.value)) inp.value = horas[0] || '';
    $('#mesa-horas').innerHTML = horas.map(h => `<button type="button" class="qchip" data-mesa-hora="${h}" aria-pressed="${h === inp.value}">${esc(horaTxt(h))}</button>`).join('');
    const ts = llegadaTs(m, mesaState.dia, inp.value), n = Number($('#mesa-personas').value) || 0;
    $('#mesa-summary').textContent = ts ? `${n} personas · ${fmtCuando(ts)}` : '';
  }
  function validarMesa() {
    const m = mesaState.promo, n = Number($('#mesa-personas').value), hora = $('#mesa-hora').value;
    const ts = llegadaTs(m, mesaState.dia, hora);
    const setMsg = (sel, t) => { $(sel).innerHTML = t ? `${ic('i-alert')} ${esc(t)}` : ''; };
    let ok = true;
    if (!Number.isInteger(n) || n < m.min_personas || n > m.max_personas) { $('#mesa-error').textContent = `Esta promo es para grupos de ${m.min_personas} a ${m.max_personas} personas.`; ok = false; }
    else $('#mesa-error').textContent = '';
    if (!mesaState.dia) { setMsg('#mesa-dia-msg', 'Elige el día.'); ok = false; } else setMsg('#mesa-dia-msg', '');
    if (!hora) { setMsg('#mesa-hora-msg', 'Elige a qué hora llegan.'); ok = false; }
    else if (!horaEnFranja(m, hora)) { setMsg('#mesa-hora-msg', `La promo aplica de ${horaTxt(m.hora_desde)} a ${horaTxt(m.hora_hasta)}.`); ok = false; }
    else if (!ts || ts < Date.now() + 15 * MIN) { setMsg('#mesa-hora-msg', 'Elige una hora al menos 15 minutos desde ahora.'); ok = false; }
    else setMsg('#mesa-hora-msg', '');
    return ok ? { n, ts } : null;
  }
  async function submitMesa(e) {
    e.preventDefault();
    const m = mesaState.promo, v = m && validarMesa();
    if (!v) return;
    const btn = $('#mesa-submit');
    btn.classList.add('is-loading');
    const nota = $('#mesa-nota').value.trim().slice(0, 140);
    let reserva;
    if (DEMO || !sb) {
      await new Promise(r => setTimeout(r, 450));
      reserva = { id: 'r' + Date.now().toString(36), codigo: 'MESA-' + Math.random().toString(36).slice(2, 7).toUpperCase(), estado: 'pendiente' };
    } else {
      const { data, error } = await sb.rpc('reservar_mesa', { p_promo: m.id, p_personas: v.n, p_llegada: new Date(v.ts).toISOString(), p_nota: nota });
      if (error) { btn.classList.remove('is-loading'); $('#mesa-error').textContent = rpcMsg(error); return; }
      reserva = data;
    }
    btn.classList.remove('is-loading');
    state.misMesas = (state.misMesas || []).concat([{ ...reserva, personas: v.n, llegada: v.ts, nota, titulo: m.titulo, beneficio: m.beneficio, negocio: m.negocio }]);
    if (DEMO) store.set('mp_demo_mesas', state.misMesas);
    closeModal('modal-mesa');
    toast('Mesa reservada', `Tu código es ${reserva.codigo}. Te avisamos cuando ${m.negocio.nombre} la confirme.`, { icon: 'i-table', ms: 6500 });
    renderMesas();
  }
  async function cancelarMesa(id) {
    const r = (state.misMesas || []).find(x => x.id === id);
    if (!r) return;
    $('#confirm-title').textContent = '¿Cancelar la mesa?';
    $('#confirm-text').textContent = `Le avisamos a ${r.negocio.nombre} que ya no van (${r.personas} personas, ${fmtCuando(r.llegada)}).`;
    $('#confirm-ok').textContent = 'Sí, cancelar';
    $('#confirm-ok').onclick = async () => {
      if (!DEMO && sb) {
        const { error } = await sb.rpc('cancelar_mi_mesa', { p_id: id });
        if (error) { closeModal('modal-confirm'); toast('No se pudo cancelar', rpcMsg(error), { type: 'error' }); return; }
      }
      r.estado = 'cancelada';
      if (DEMO) store.set('mp_demo_mesas', state.misMesas);
      closeModal('modal-confirm');
      toast('Mesa cancelada', 'Ya le avisamos al local.', { icon: 'i-table' });
      renderMesas();
    };
    openModal('modal-confirm');
  }
  let mesaMarker = null;
  function mesaEnMapa(id) {
    const m = (state.mesas || []).find(x => x.id === id);
    if (!m || m.negocio.lat == null) return;
    if (state.view !== 'mapa') go('mapa');
    loadLeaflet().then(ok => ok && setTimeout(() => {
      initLiveMap();
      if (!liveMap) return;
      liveMap.invalidateSize();
      if (mesaMarker) liveMap.removeLayer(mesaMarker);
      mesaMarker = L.marker([m.negocio.lat, m.negocio.lng], { icon: L.divIcon({ className: 'pin-icon', html: `<div class="pin pin--mesa">${ic('i-table')}</div>`, iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40] }) })
        .bindPopup(`<div class="pop-search"><b>${esc(m.negocio.nombre)}</b><small>${esc(m.titulo)}</small><button class="btn btn--xs" data-action="mesa-reservar" data-id="${esc(m.id)}">${ic('i-table')} Reservar mesa</button></div>`, { className: 'mp-popup' })
        .addTo(liveMap);
      liveMap.flyTo([m.negocio.lat, m.negocio.lng], 16, { duration: reduceMotion ? 0 : 1.1 });
      liveMap.once('moveend', () => mesaMarker && mesaMarker.openPopup());
    }, 140));
  }
  async function cargarMesas() {
    if (DEMO || !sb) {
      state.mesas = demoMesas();
      state.misMesas = (store.get('mp_demo_mesas', []) || []).filter(r => r && r.negocio);
      return;
    }
    try {
      const [a, b] = await Promise.all([sb.rpc('mesas_disponibles'), sb.rpc('mis_mesas')]);
      if (!a.error) state.mesas = a.data || [];
      if (!b.error) state.misMesas = (b.data || []).map(r => ({ ...r, llegada: Date.parse(r.llegada) }));
    } catch (e) { /* Modo Mesa todavía no activo en la base: el bloque no se muestra */ }
  }

  /* =====================================================================
     10. PERFIL: FOTO OPCIONAL, DATOS E INSIGNIAS
  ===================================================================== */
  let crop = Object.assign({}, FOTO_VACIA);
  let editingPhoto = false;

  function maskCedula(c) {
    if (!c) return 'Sin registrar';
    const s = String(c);
    return '•••• ' + s.slice(-3);
  }

  function renderPerfil() {
    $('#id-name').textContent = perfil.nombre;
    $('#id-sub').textContent = `${perfil.ciudad} · Cuenta activa`;
    $('#id-cedula').textContent = maskCedula(perfil.cedula);
    $('#id-mail').textContent = perfil.mail || '-';
    $('#id-mail').title = perfil.mail || '';
    if (!editingPhoto) crop = Object.assign({}, FOTO_VACIA, perfil.mostrar_foto_real ? perfil.foto_encuadre : {});
    renderPhoto();
    $('#p-tel').value = perfil.tel || ''; $('#p-city').value = perfil.ciudad; $('#p-pass').value = '';
    renderInsignias();
    renderVerify();
    renderRating();
    const pa = $('#p-anuncios'); if (pa) pa.checked = !!perfil.recibe_anuncios;
  }

  // Calificación: empieza en 0 y solo sube cuando alguien te califica
  function renderRating() {
    const el = $('#id-rating');
    if (!el) return;
    const n = Number(perfil.resenas) || 0, r = n ? Number(perfil.rating) || 0 : 0;
    const txt = r.toFixed(1).replace('.', ',');
    el.classList.toggle('is-empty', !n);
    el.innerHTML = `${ic('i-star')}<b class="tnum">${txt}</b><span>${n ? `${n} ${n === 1 ? 'calificación' : 'calificaciones'}` : 'Aún nadie te ha calificado'}</span>`;
  }

  /* ---------- Parcero Verificado (verificación progresiva) ----------
     El registro solo pide el número de cédula. Las fotos se piden aquí, y
     solo cuando hacen falta: al abrir un parche o al pedir la insignia. */
  function renderVerify() {
    const card = $('#verify-card');
    if (!card) return;
    const ok = !!perfil.cedula_verificada;
    card.classList.toggle('is-verified', ok);
    $('#verify-text').textContent = ok
      ? `Verificaste tu cédula${perfil.cedula_verificada_en ? ' el ' + new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(perfil.cedula_verificada_en)) : ''}. Tu sello sale en tu perfil y en los chats.`
      : 'Verifica tu cédula una sola vez para abrir parches y llevar el sello. Tus fotos quedan privadas.';
    $('#verify-btn').hidden = ok;
  }

  async function pedirVerificacion(motivo) {
    if (perfil.cedula_verificada) return true;
    if (!window.MPVerificacion) { toast('No cargó la verificación', 'Recarga la página e intenta de nuevo.', { type: 'error' }); return false; }
    if (!perfil.cedula) {
      toast('Tu cuenta no tiene cédula', 'Escríbenos a modoparcheoficial@gmail.com para agregarla y poder verificarte.', { type: 'error', ms: 7000 });
      return false;
    }
    closeAllModals();
    const ok = await window.MPVerificacion.abrir({
      sb, uid: me && me.id, cedula: perfil.cedula, demo: DEMO, motivo,
      abrirModal: () => openModal('modal-verificacion'),
      cerrarModal: () => closeModal('modal-verificacion'),
    });
    if (!ok) return false;
    perfil.cedula_verificada = true;
    perfil.cedula_verificada_en = new Date().toISOString();
    savePerfil();
    renderVerify(); renderMeChip();
    toast('Ya eres Parcero Verificado', motivo === 'crear' ? 'Arma tu parche: ya puedes publicarlo.' : 'Tu insignia ya sale en tu perfil.', { icon: 'i-shield', ms: 5200 });
    return true;
  }

  // "Abrir el parche": si la cédula no está verificada, primero el candado
  async function abrirCrear(opts) {
    if (!perfil.cedula_verificada) {
      const ok = await pedirVerificacion('crear');
      if (!ok) return;
      await new Promise(r => setTimeout(r, reduceMotion ? 0 : 240)); // deja cerrar el modal anterior
    }
    closeAllModals();
    openCreate(opts);
  }

  function renderPhoto() {
    const img = $('#photo-img');
    const has = !!crop.src;
    if (has) { if (img.getAttribute('src') !== crop.src) img.src = crop.src; img.hidden = false; }
    else img.hidden = true;
    img.style.transform = `translate(${crop.x}%, ${crop.y}%) scale(${crop.zoom})`;
    $('#photo-initials').textContent = initial(perfil.nombre);
    $('#photo-initials').hidden = has;
    $('#photo-frame').classList.toggle('is-editing', editingPhoto);
    $('#photo-edit').hidden = !editingPhoto;
    $('#photo-zoom').value = crop.zoom;
    $('#photo-note').hidden = editingPhoto || has;
    $('#photo-remove').hidden = editingPhoto || !has;
  }

  /* Insignias: se ganan por cómo parchas */
  const enCategoria = cat => () => state.parches.some(p => inside(p) && p.categoria === cat);
  const INSIGNIAS = [
    { img: 'medalla-el-armador', nombre: 'El armador', como: 'Arma tu primer parche', ok: () => state.parches.some(isMine) },
    { img: 'medalla-firme-parche', nombre: 'Firme al parche', como: 'Únete a 3 parches', ok: () => state.parches.filter(p => p.unido).length >= 3 },
    { img: 'medalla-cero-fantasma', nombre: 'Cero fantasma', como: 'Haz check-in al llegar', ok: () => state.parches.some(p => p.checkin) },
    { img: 'medalla-buena-vibra', nombre: 'Buena vibra', como: 'Recibe 3 buenas calificaciones', ok: () => (perfil.resenas || 0) >= 3 && (perfil.rating || 0) >= 4.5 },
    { img: 'medalla-rumbero-oficial', nombre: 'Rumbero oficial', como: 'Cáele a un parche de rumba', ok: enCategoria('rumba') },
    { img: 'medalla-catador-bajon', nombre: 'Catador del bajón', como: 'Cáele a un parche de comida', ok: enCategoria('comida') },
    { img: 'medalla-crack-deporte', nombre: 'Crack del deporte', como: 'Cáele a un parche de deporte', ok: enCategoria('deportes') },
    { img: 'medalla-rey-mirador', nombre: 'Rey del mirador', como: 'Sube a un mirador con el parche', ok: enCategoria('pueblear') },
  ];
  function renderInsignias() {
    const lista = INSIGNIAS.map(b => ({ ...b, ganada: !!b.ok() }));
    const n = lista.filter(b => b.ganada).length;
    $('#badges-count').textContent = `${n} de ${lista.length}`;
    const bar = $('#badge-bar');
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = (n / lista.length * 100) + '%'; }));
    // Primero las ganadas
    lista.sort((a, b) => b.ganada - a.ganada);
    $('#badges').innerHTML = lista.map((b, i) => `<li class="badge ${b.ganada ? 'is-on' : ''}" style="--d:${120 + i * 50}ms" title="${esc(b.ganada ? b.nombre : b.como)}">
        <img src="${STK(b.img)}" alt="" loading="lazy" decoding="async">
        <b>${esc(b.nombre)}</b><small>${b.ganada ? 'Ganada' : esc(b.como)}</small>
      </li>`).join('');
  }

  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function downscale(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = rej;
      r.onload = async () => {
        try {
          const im = await loadImg(r.result), k = Math.min(1, 640 / Math.max(im.width, im.height));
          const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { rej(e); }
      };
      r.readAsDataURL(file);
    });
  }

  function afterIdentityChange() {
    savePerfil(); renderMeChip(); renderPerfil(); refresh();
    if (state.chatId) renderChat();
  }

  function initPerfil() {
    $('#photo-file').addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('Archivo no válido', 'Sube una imagen JPG o PNG.', { type: 'error' }); return; }
      if (f.size > 12 * 1024 * 1024) { toast('Foto muy pesada', 'Usa una imagen de menos de 12 MB.', { type: 'error' }); return; }
      try { crop = { src: await downscale(f), zoom: 1, x: 0, y: 0 }; editingPhoto = true; renderPhoto(); }
      catch (err) { toast('No pudimos leer la foto', 'Prueba con otra imagen.', { type: 'error' }); }
    });
    $('#photo-zoom').addEventListener('input', e => { crop.zoom = Number(e.target.value); renderPhoto(); });
    const frame = $('#photo-frame');
    let drag = null;
    frame.addEventListener('pointerdown', e => { if (!editingPhoto) return; drag = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y }; frame.setPointerCapture(e.pointerId); });
    frame.addEventListener('pointermove', e => {
      if (!drag) return;
      const w = frame.clientWidth;
      crop.x = clamp(drag.cx + (e.clientX - drag.x) / w * 100, -50, 50);
      crop.y = clamp(drag.cy + (e.clientY - drag.y) / w * 100, -50, 50);
      renderPhoto();
    });
    const endDrag = () => { drag = null; };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);

    $('#photo-cancel').addEventListener('click', () => { editingPhoto = false; renderPerfil(); });
    $('#photo-save').addEventListener('click', async e => {
      const btn = e.currentTarget;
      if (!DEMO) {
        btn.classList.add('is-loading');
        try {
          if (crop.src.startsWith('data:')) crop.src = await uploadFoto(crop.src, 'perfil');
          await updatePerfilRemote({ foto_encuadre: crop, mostrar_foto_real: true });
        } catch (err) { btn.classList.remove('is-loading'); toast('No se guardó la foto', dbMsg(err), { type: 'error' }); return; }
        btn.classList.remove('is-loading');
      }
      perfil.foto_encuadre = Object.assign({}, crop);
      perfil.mostrar_foto_real = true;
      editingPhoto = false;
      afterIdentityChange();
      toast('Foto guardada', 'Ya sale en tus parches y en el chat.', { icon: 'i-camera' });
    });
    $('#photo-remove').addEventListener('click', async () => {
      if (!DEMO) {
        try { await updatePerfilRemote({ mostrar_foto_real: false }); }
        catch (err) { toast('No se quitó la foto', dbMsg(err), { type: 'error' }); return; }
      }
      perfil.mostrar_foto_real = false;
      perfil.foto_encuadre = Object.assign({}, FOTO_VACIA);
      afterIdentityChange();
      toast('Foto quitada', 'Ahora mostramos tu inicial.', { icon: 'i-user' });
    });

    // Datos
    const form = $('#form-perfil');
    const RULES_P = {
      'p-tel': v => v && !/^3\d{9}$/.test(v) ? 'Celular de 10 dígitos que empiece por 3.' : '',
      'p-pass': v => v && (v.length < 8 || !/[A-Z]/.test(v)) ? 'Mínimo 8 caracteres y una mayúscula.' : '',
    };
    const check = id => { const inp = $('#' + id), msg = RULES_P[id](inp.value); setFieldState(inp.closest('.field'), msg); return !msg; };
    $('#p-tel').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
    $('#p-tel').addEventListener('blur', () => check('p-tel'));
    $('#p-pass').addEventListener('blur', () => { if ($('#p-pass').value) check('p-pass'); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (![check('p-tel'), check('p-pass')].every(Boolean)) return;
      const tel = $('#p-tel').value, ciudad = $('#p-city').value, pass = $('#p-pass').value;
      const btn = $('button[type="submit"]', form);
      btn.classList.add('is-loading');
      if (!DEMO) {
        try {
          const r1 = await sb.from('perfiles_privados').update({ telefono: tel || null }).eq('id', me.id);
          if (r1.error) throw r1.error;
          await updatePerfilRemote({ ciudad });
          if (pass) { const r2 = await sb.auth.updateUser({ password: pass }); if (r2.error) throw r2.error; }
        } catch (err) { btn.classList.remove('is-loading'); toast('No se guardaron los datos', dbMsg(err), { type: 'error' }); return; }
      } else await new Promise(r => setTimeout(r, 400));
      btn.classList.remove('is-loading');
      perfil.tel = tel; perfil.ciudad = ciudad;
      savePerfil(); renderMeChip(); renderPerfil();
      toast('Datos guardados', pass ? 'Actualizamos tus datos y tu contraseña.' : 'Tus datos quedaron al día.', { icon: 'i-check' });
    });
  }

  /* =====================================================================
     11. TOASTS Y MODALES
  ===================================================================== */
  /* Aviso que cae como una gota desde la barra superior: una gota grande cae,
     se aplasta y se abre en tarjeta, y una gotita rezagada se funde con ella
     (filtro gooey). Se cierra solo, con la X o deslizándolo de lado. */
  function toast(title, text = '', { icon = 'i-check', type = '', action = null, ms = 4200 } = {}) {
    const box = $('#toasts');
    ensureGooFilter();
    const el = document.createElement('div');
    el.className = `toast ${type ? 'toast--' + type : ''}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-goo" aria-hidden="true"><i class="toast-blob"></i><i class="toast-drip"></i></span>
      <span class="toast-ic">${ic(type === 'error' ? 'i-alert' : icon)}</span>
      <div class="toast-txt"><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>
      ${action ? `<button class="btn btn--xs" data-action="${action.act || 'ver-mapa'}" data-id="${esc(action.id)}">${esc(action.label)}</button>` : '<span></span>'}
      <button class="toast-x" aria-label="Cerrar aviso">${ic('i-close')}</button>`;

    // Los avisos de abajo bajan suave para hacerle campo al nuevo (FLIP)
    const sibs = [...box.children].filter(x => !x.classList.contains('is-out'));
    const before = sibs.map(x => x.getBoundingClientRect().top);
    box.prepend(el);
    if (!reduceMotion) sibs.forEach((x, i) => {
      const d = before[i] - x.getBoundingClientRect().top;
      if (d && !x.classList.contains('is-dragging')) x.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 460, easing: SPRING });
    });
    sibs.slice(2).forEach(x => x._kill && x._kill());

    // Tiempo: se pausa con el mouse encima o mientras se arrastra
    let left = ms, t0 = 0, timer = null, gone = false;
    const run = () => { clearTimeout(timer); t0 = Date.now(); timer = setTimeout(() => kill(), left); };
    const pause = () => { clearTimeout(timer); left = Math.max(1200, left - (Date.now() - t0)); };
    function kill(dir = 0, fromX = 0) {
      if (gone) return;
      gone = true; clearTimeout(timer);
      el.classList.add('is-out');
      const done = () => el.remove();
      if (reduceMotion) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).onfinish = done; return; }
      const w = el.offsetWidth, h = el.offsetHeight;
      const out = dir
        ? [{ translate: `${fromX}px 0`, opacity: Math.max(0, 1 - Math.abs(fromX) / w) }, { translate: `${dir * (w + 40)}px 0`, opacity: 0 }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(.94)' }];
      el.animate(out, { duration: dir ? 240 : 220, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'forwards' }).onfinish = () => {
        // Se recoge el espacio que dejó para que los demás suban sin salto
        el.animate([{ height: h + 'px', marginBottom: '0px' }, { height: '0px', marginBottom: '-8px' }], { duration: 200, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }).onfinish = done;
      };
    }
    el._kill = kill;
    el.querySelector('.toast-x').addEventListener('click', () => kill());
    if (action) el.querySelector('[data-action]').addEventListener('click', () => kill());
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !gone) pause(); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !gone && !el.classList.contains('is-dragging')) run(); });
    el.addEventListener('pointerdown', e => {
      if (gone) return;
      trackX(e, el, {
        onLock() { pause(); el.classList.add('is-dragging'); },
        onMove(dx) {
          const w = el.offsetWidth;
          el.style.translate = `${dx}px 0`;
          el.style.opacity = String(Math.max(.15, 1 - Math.abs(dx) / (w * .9)));
        },
        onEnd(dx, vx) {
          el.classList.remove('is-dragging');
          const w = el.offsetWidth;
          if (Math.abs(dx) > w * .32 || (Math.abs(vx) > .45 && Math.sign(vx) === Math.sign(dx))) { el.style.translate = ''; el.style.opacity = ''; kill(Math.sign(dx) || 1, dx); return; }
          springBack(el, dx);
          el.style.opacity = '';
          run();
        },
      });
    });
    if (!reduceMotion) setTimeout(() => el.classList.add('is-settled'), 760);
    else el.classList.add('is-settled');
    run();
  }
  // Regresa un elemento arrastrado a su sitio con un resorte
  function springBack(el, fromX) {
    el.style.translate = '';
    if (reduceMotion || !fromX) return;
    el.animate([{ translate: `${fromX}px 0` }, { translate: '0 0' }], { duration: 420, easing: SPRING });
  }

  const modalStack = [];
  /* ---------- Reportar: llega al equipo de ModoParche ---------- */
  let reportTarget = null;
  function openReport(tipo, id) {
    reportTarget = { tipo, id };
    const form = $('#report-form'); form.reset();
    $('#report-msg').textContent = '';
    const quien = tipo === 'persona' ? (personById(id)?.nombre || 'esta persona') : '';
    $('#report-title').textContent = tipo === 'mensaje' ? 'Reportar mensaje' : tipo === 'parche' ? 'Reportar parche' : `Reportar a ${quien}`;
    openModal('modal-report');
  }
  async function sendReport(e) {
    e.preventDefault();
    const motivo = ($('#report-form').querySelector('input[name="motivo"]:checked') || {}).value;
    if (!motivo) { $('#report-msg').textContent = 'Elige qué pasó.'; return; }
    if (DEMO || !sb) { closeModal('modal-report'); toast('Reporte de ejemplo', 'En el modo demo no se envía nada.', { icon: 'i-flag' }); return; }
    const btn = $('#report-send'); btn.disabled = true;
    const { error } = await sb.rpc('reportar', { p_tipo: reportTarget.tipo, p_objetivo: String(reportTarget.id), p_motivo: motivo, p_detalle: $('#report-detalle').value.trim() });
    btn.disabled = false;
    if (error) {
      const m = `${error.message} ${error.hint || ''}`;
      $('#report-msg').textContent = /DEMASIADOS/.test(m) ? 'Ya enviaste muchos reportes hoy. Intenta mañana.' : /A_TI_MISMO/.test(m) ? 'No te puedes reportar a ti mismo.' : /PGRST202|Could not find/.test(m) ? 'Los reportes todavía no están activos. Intenta más tarde.' : 'No pudimos enviar el reporte. Intenta de nuevo.';
      return;
    }
    closeModal('modal-report');
    toast('Reporte enviado', 'Gracias por cuidar la comunidad. El equipo lo revisa pronto.', { icon: 'i-flag', ms: 5200 });
  }

  function openModal(id) {
    const m = $('#' + id);
    if (!m || (!m.hidden && !m.classList.contains('is-closing'))) return;
    clearTimeout(m._t);
    m.hidden = false; m.classList.remove('is-closing');
    const panel = $('.modal-panel', m);
    panel.setAttribute('tabindex', '-1');
    modalStack.push({ id, ret: document.activeElement });
    document.body.classList.add('no-scroll');
    setTimeout(() => { (id === 'modal-create' && !isMobile() ? F('titulo') : panel).focus({ preventScroll: true }); }, 60);
  }
  function closeModal(id) {
    const m = $('#' + id);
    if (!m || m.hidden || m.classList.contains('is-closing')) return;
    m.classList.add('is-closing');
    m._t = setTimeout(() => { m.hidden = true; m.classList.remove('is-closing'); }, reduceMotion ? 0 : 210);
    const i = modalStack.findIndex(x => x.id === id);
    const entry = i >= 0 ? modalStack.splice(i, 1)[0] : null;
    if (id === 'modal-qr' && detenerQR) { detenerQR(); detenerQR = null; }
    if (id === 'modal-escaner') cerrarEscaner();
    if (id === 'modal-qrscan') cerrarLectorQR();
    if (id === 'modal-qrid') clearTimeout(qridTimer);
    if (!modalStack.length) document.body.classList.remove('no-scroll');
    if (entry && entry.ret && document.contains(entry.ret)) entry.ret.focus({ preventScroll: true });
  }
  const closeAllModals = () => [...modalStack].reverse().forEach(x => closeModal(x.id));

  /* =====================================================================
     12. SUPABASE
  ===================================================================== */
  const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
  const shortName = n => { const [a, b] = String(n || 'Parcero').trim().split(/\s+/); return b ? `${a} ${b.charAt(0)}.` : a; };

  function dbMsg(err) {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/DEMASIADO_RAPIDO/.test(m)) return (err && err.hint) || 'Vas muy rápido. Espera un momento.';
    if (/failed to fetch|network/i.test(m)) return 'Sin conexión. Revisa tu internet.';
    if (/jwt expired|invalid jwt/i.test(m)) return 'Tu sesión venció. Vuelve a entrar.';
    if (/PARCHE_LLENO/.test(m)) return 'Alguien tomó el último cupo antes que tú.';
    if (/SIN_VERIFICAR/.test(m)) return 'Verifica tu cédula para abrir parches.';
    if (/permission denied|row-level security/i.test(m)) return 'No tienes permiso para hacer eso.';
    if (/PGRST205|42P01|Could not find the table/i.test(m)) return 'Faltan las tablas en Supabase.';
    return m || 'Intenta de nuevo en unos segundos.';
  }
  const setBoot = t => { const el = $('#boot-text'); if (el) el.textContent = t; };
  const hideBoot = () => { const b = $('#boot'); if (b) { b.classList.add('is-done'); setTimeout(() => b.remove(), 500); } };
  function bootError(err) {
    const sql = /PGRST205|42P01|Could not find the table/i.test(String(err && (err.code + ' ' + err.message)));
    setBoot(sql ? 'Faltan las tablas en Supabase. Corre los archivos de supabase/migrations en el SQL Editor y recarga.' : `No pudimos cargar tus parches. ${dbMsg(err)}`);
    const box = $('#boot-actions');
    box.hidden = false;
    box.innerHTML = `<button class="btn btn--ink" data-boot="retry">${ic('i-refresh')} Reintentar</button>
      <a class="btn btn--ghost" href="dashboard.html?demo=1">Ver el modo demo</a>
      <button class="btn btn--ghost" data-boot="logout">${ic('i-logout')} Cerrar sesión</button>`;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-boot]');
      if (!b) return;
      if (b.dataset.boot === 'retry') window.location.reload(); else logout();
    });
  }
  /* ---------- Derechos sobre tus datos (Ley 1581 de 2012) ---------- */
  async function cambiarAnuncios(on) {
    perfil.recibe_anuncios = on;
    if (DEMO || !sb) { toast(on ? 'Anuncios activados' : 'Te diste de baja', 'En el modo demo no se guarda.', { icon: 'i-check' }); return; }
    const { error } = await sb.rpc('cambiar_anuncios', { p_recibir: on });
    if (error) { perfil.recibe_anuncios = !on; $('#p-anuncios').checked = !on; toast('No se pudo guardar', dbMsg(error), { type: 'error' }); return; }
    toast(on ? 'Anuncios activados' : 'Te diste de baja de los anuncios', on ? 'Te avisaremos de novedades y planes especiales.' : 'Ya no te llegarán anuncios. Los avisos de tus parches siguen igual.', { icon: 'i-check' });
  }
  async function descargarMisDatos(btn) {
    let datos;
    if (DEMO || !sb) datos = { aviso: 'Modo demo: estos datos solo existen en este navegador.', perfil, parches: state.parches.filter(isMine) };
    else {
      btn.disabled = true;
      const { data, error } = await sb.rpc('mis_datos');
      btn.disabled = false;
      if (error) { toast('No pudimos preparar el archivo', dbMsg(error), { type: 'error' }); return; }
      datos = data;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    a.download = 'mis-datos-modoparche-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Archivo descargado', 'Ahí está todo lo que tenemos de tu cuenta.', { icon: 'i-check' });
  }
  function askBorrarCuenta() {
    $('#confirm-title').textContent = '¿Borrar tu cuenta?';
    $('#confirm-text').textContent = 'Se borran tu perfil, tus datos, tus fotos y los parches que creaste. Tus mensajes en otros parches quedan sin tu nombre. No se puede deshacer.';
    $('#confirm-ok').textContent = 'Sí, borrar todo';
    $('#confirm-ok').onclick = async () => {
      const b = $('#confirm-ok'); b.disabled = true;
      if (DEMO || !sb) { try { localStorage.clear(); } catch (e) { /* nada */ } window.location.replace('index.html'); return; }
      // Las fotos se borran con la API de Storage (cada quien solo puede borrar su carpeta)
      try {
        const { data: files } = await sb.storage.from('fotos').list(me.id, { limit: 1000 });
        if (files && files.length) await sb.storage.from('fotos').remove(files.map(f => me.id + '/' + f.name));
      } catch (e) { /* seguimos con la cuenta */ }
      // Fotos de la cédula (bucket privado): también se borran
      try {
        const carpeta = 'cedulas/' + me.id;
        const { data: docs } = await sb.storage.from('documentos_identidad').list(carpeta, { limit: 100 });
        if (docs && docs.length) await sb.storage.from('documentos_identidad').remove(docs.map(f => carpeta + '/' + f.name));
      } catch (e) { /* seguimos con la cuenta */ }
      const { error } = await sb.rpc('borrar_mi_cuenta');
      b.disabled = false;
      if (error) { closeModal('modal-confirm'); toast('No se pudo borrar', dbMsg(error), { type: 'error' }); return; }
      try { await sb.auth.signOut(); } catch (e) { /* la sesión ya no existe */ }
      try { localStorage.clear(); } catch (e) { /* nada */ }
      window.location.replace('index.html?cuenta=borrada');
    };
    openModal('modal-confirm');
  }

  async function logout() {
    if (DEMO || !sb) { window.location.href = 'login.html'; return; }
    try { await sb.auth.signOut(); } catch (e) { /* salimos igual */ }
    window.location.replace('login.html');
  }

  const personFromRow = r => ({
    id: r.id, nombre: shortName(r.nombre), verificado: !!r.verificado,
    foto: r.mostrar_foto_real && r.foto_encuadre && r.foto_encuadre.src ? r.foto_encuadre : null,
  });
  let colVerificado = true; // false si la migración de verificación no se ha corrido
  async function cachePeople(ids) {
    const faltan = [...new Set(ids.filter(id => isUuid(id) && id !== (me && me.id) && !peopleCache.has(id)))];
    if (!faltan.length) return;
    const cols = 'id, nombre, mostrar_foto_real, foto_encuadre' + (colVerificado ? ', verificado' : '');
    let { data, error } = await sb.from('perfiles').select(cols).in('id', faltan);
    if (error && colVerificado && /verificado/.test(error.message)) {
      colVerificado = false;
      ({ data, error } = await sb.from('perfiles').select('id, nombre, mostrar_foto_real, foto_encuadre').in('id', faltan));
    }
    if (error) { console.warn('[perfiles]', error.message); return; }
    data.forEach(r => peopleCache.set(r.id, personFromRow(r)));
  }

  function applyPerfilRow(p, priv) {
    const meta = (me && me.user_metadata) || {};
    p = p || { nombre: meta.nombre || (me.email || '').split('@')[0], ciudad: 'Villavicencio' };
    perfil = Object.assign({}, PERFIL_DEF, {
      nombre: p.nombre, primer: String(p.nombre || 'Parcero').split(' ')[0], ciudad: p.ciudad || 'Villavicencio',
      mostrar_foto_real: !!p.mostrar_foto_real,
      foto_encuadre: Object.assign({}, FOTO_VACIA, p.foto_encuadre || {}),
      tel: (priv && priv.telefono) || '', cedula: (priv && priv.cedula) || '', mail: me.email || '',
      rating: Number(p.rating) || 0, resenas: Number(p.resenas) || 0,
      intereses: Array.isArray(p.intereses) ? p.intereses : [],
      contacto_nombre: (priv && priv.contacto_nombre) || '', contacto_tel: (priv && priv.contacto_tel) || '',
      recibe_anuncios: !!p.recibe_anuncios,
      cedula_verificada: !!(priv && priv.cedula_verificada), cedula_verificada_en: (priv && priv.cedula_verificada_en) || null,
    });
  }

  function fromRow(r, miembros, prev) {
    const mia = miembros.find(m => m.usuario_id === me.id);
    const propio = r.creador_id === me.id;
    return normalizeParche({
      id: r.id, titulo: r.titulo, categoria: r.categoria, descripcion: r.descripcion,
      inicio: Date.parse(r.inicio), lugar: r.lugar, barrio: r.barrio, lat: r.lat, lng: r.lng,
      costo: r.costo, presupuesto: r.presupuesto, cuposMax: r.cupos_max,
      confirmados: miembros.filter(m => m.usuario_id !== me.id).map(m => m.usuario_id), // solo cuentas reales
      unido: !!mia, propio, creadorId: propio ? 'me' : r.creador_id, creadorNombre: r.creador_nombre,
      checkin: !!(mia && mia.checkin), demo: r.demo, chat: prev ? prev.chat : [],
      aliado: !!r.aliado, verificado: !!r.verificado, imagen: r.imagen || '', promo: r.promo || '',
      oficial: !!r.oficial, info: r.oficial_info || {},
      llegaron: miembros.filter(m => m.checkin).map(m => m.usuario_id === me.id ? 'me' : m.usuario_id),
      locs: Object.fromEntries(miembros.filter(m => m.localidad).map(m => [m.usuario_id === me.id ? 'me' : m.usuario_id, m.localidad])),
      localidad: (mia && mia.localidad) || '',
    });
  }
  // Mensajes de personas de ejemplo (sin cuenta) no se muestran
  const isRealMsg = r => r.tipo !== 'user' || !!r.autor_id;
  const msgFromRow = r => ({ id: r.id, tipo: r.tipo, texto: r.texto, ts: Date.parse(r.creado_en), autor: r.autor_id ? (r.autor_id === me.id ? 'me' : r.autor_id) : r.autor_demo, replyId: r.responde_a ?? null, encuestaId: r.encuesta_id ?? null });

  // De los parches de ejemplo de la base de datos solo mostramos dos
  const DEMO_LIMIT = 2;
  let demoIds = null;
  function keepRows(rows) {
    const demos = rows.filter(r => r.demo).sort((a, b) => (b.aliado - a.aliado) || (Date.parse(a.inicio) - Date.parse(b.inicio)));
    const upcoming = demos.filter(r => Date.parse(r.inicio) > Date.now() - 90 * MIN);
    demoIds = new Set((upcoming.length ? upcoming : demos).slice(0, DEMO_LIMIT).map(r => r.id));
    return rows.filter(r => !r.demo || demoIds.has(r.id));
  }

  // Columnas de parche_miembros: "localidad" existe desde la migración de noviembre
  let MIEMBRO_COLS = 'parche_id, usuario_id, checkin, localidad';
  async function selMiembros(q) {
    let r = await q(MIEMBRO_COLS);
    if (r.error && /localidad/.test(String(r.error.message))) { MIEMBRO_COLS = 'parche_id, usuario_id, checkin'; r = await q(MIEMBRO_COLS); }
    return r;
  }
  // Calificaciones que ya hice (para no pedirlas dos veces)
  async function cargarCalificados() {
    const r = await sb.from('calificaciones').select('parche_id, calificado_id').eq('autor_id', me.id);
    if (!r.error) state.calificados = new Set((r.data || []).map(x => x.parche_id + ':' + x.calificado_id));
  }
  // Parches oficiales que ya pasaron (historial)
  async function cargarHistorial() {
    const r = await sb.from('parches').select('id, titulo, inicio, lugar, imagen, oficial_info, parche_miembros(count)')
      .eq('oficial', true).lt('inicio', new Date(Date.now() - 3 * HOUR).toISOString()).order('inicio', { ascending: false }).limit(8);
    state.historial = r.error ? [] : (r.data || []).map(x => ({ id: x.id, titulo: x.titulo, inicio: Date.parse(x.inicio), lugar: x.lugar, imagen: x.imagen || '', info: x.oficial_info || {}, van: (x.parche_miembros && x.parche_miembros[0] && x.parche_miembros[0].count) || 0 }));
  }

  async function loadRemote() {
    const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
    const [pf, pv, ps] = await Promise.all([
      sb.from('perfiles').select('*').eq('id', me.id).maybeSingle(),
      sb.from('perfiles_privados').select('*').eq('id', me.id).maybeSingle(),
      sb.from('parches').select('*').gte('inicio', since).order('inicio'),
    ]);
    for (const r of [pf, pv, ps]) if (r.error) throw r.error;
    const rows = keepRows(ps.data || []);
    let miembros = [];
    if (rows.length) {
      const mm = await selMiembros(c => sb.from('parche_miembros').select(c).in('parche_id', rows.map(r => r.id)));
      if (mm.error) throw mm.error;
      miembros = mm.data;
    }
    await cachePeople(rows.map(r => r.creador_id).concat(miembros.map(m => m.usuario_id)));
    applyPerfilRow(pf.data, pv.data);
    state.parches = rows.map(r => fromRow(r, miembros.filter(m => m.parche_id === r.id)));
    await Promise.all([cargarMesas(), cargarCalificados(), cargarHistorial(), cargarEspera(), cargarParceros()]);
  }

  async function fetchParche(id, drop = false) {
    const [{ data: row, error }, mm] = await Promise.all([
      sb.from('parches').select('*').eq('id', id).maybeSingle(),
      selMiembros(c => sb.from('parche_miembros').select(c).eq('parche_id', id)),
    ]);
    if (error) { console.warn('[parche]', error.message); return; }
    if (!row) {
      const wasOpen = state.chatId === id;
      removeParcheLocal(id);
      if (wasOpen) toast('Parche cancelado', 'El organizador canceló este plan.', { icon: 'i-trash' });
      return;
    }
    if (row.demo && demoIds && !demoIds.has(row.id)) return;
    const miembros = mm.data || [];
    await cachePeople([row.creador_id].concat(miembros.map(m => m.usuario_id)));
    const idx = state.parches.findIndex(p => p.id === id);
    const p = fromRow(row, miembros, idx >= 0 ? state.parches[idx] : null);
    if (drop) p._drop = true;
    if (idx >= 0) state.parches[idx] = p; else state.parches.push(p);
    refresh();
    if (state.chatId === id) renderChat();
  }
  const reloadTimers = new Map();
  function reloadParche(id, { drop = false } = {}) {
    if (DEMO || !isUuid(id)) return Promise.resolve();
    return new Promise(res => {
      clearTimeout(reloadTimers.get(id));
      reloadTimers.set(id, setTimeout(() => fetchParche(id, drop).then(res), 150));
    });
  }

  async function loadChat(id) {
    const { data, error } = await sb.from('mensajes').select('*').eq('parche_id', id).order('creado_en').limit(300);
    if (error) { console.warn('[chat]', error.message); return; }
    await cachePeople(data.map(x => x.autor_id));
    const p = findP(id);
    if (!p) return;
    p.chat = data.filter(isRealMsg).map(msgFromRow);
    if (state.chatId === id) renderChat();
  }

  async function uploadFoto(dataUrl, tipo) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${me.id}/${tipo}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return sb.storage.from('fotos').getPublicUrl(path).data.publicUrl;
  }
  async function updatePerfilRemote(fields) {
    const { error } = await sb.from('perfiles').update(fields).eq('id', me.id);
    if (error) throw error;
  }
  async function saveParcheRemote(d, editId) {
    try {
      const row = {
        titulo: d.titulo, categoria: d.categoria, descripcion: d.descripcion, inicio: new Date(d.inicio).toISOString(),
        lugar: d.lugar, barrio: d.barrio || '', lat: d.lat, lng: d.lng, costo: d.costo, presupuesto: d.costo, cupos_max: d.cuposMax,
      };
      // Foto nueva: se sube al bucket "fotos" (carpeta propia) y se guarda el enlace
      if (d.imagen && d.imagen.startsWith('data:')) row.imagen = await uploadFoto(d.imagen, 'parche');
      else row.imagen = d.imagen || '';
      const res = editId
        ? await sb.from('parches').update(row).eq('id', editId).select('id').single()
        : await sb.from('parches').insert(row).select('id').single();
      if (res.error) throw res.error;
      await fetchParche(res.data.id, !editId);
      return res.data.id;
    } catch (err) {
      // El servidor también pone el candado: si la cédula no está verificada, pedimos verificarla
      if (/SIN_VERIFICAR/.test(String(err && err.message))) {
        perfil.cedula_verificada = false;
        toast('Falta verificar tu cédula', 'Tus datos del parche se guardan aquí mientras te verificas.', { type: 'error' });
        pedirVerificacion('crear').then(ok => { if (ok) openModal('modal-create'); });
        return null;
      }
      toast(editId ? 'No se guardaron los cambios' : 'No se publicó el parche', dbMsg(err), { type: 'error' });
      return null;
    }
  }

  let extrasT = null;
  const extrasPronto = id => { clearTimeout(extrasT); extrasT = setTimeout(() => cargarExtras(id), 400); };
  function subscribeRealtime() {
    const pidOf = pl => (pl.new && (pl.new.parche_id || pl.new.id)) || (pl.old && (pl.old.parche_id || pl.old.id));
    sb.channel('mp-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parches' }, pl => {
        const id = (pl.new && pl.new.id) || (pl.old && pl.old.id);
        if (!id) return;
        if (pl.eventType === 'INSERT' && pl.new.creador_id !== me.id && !findP(id)) {
          reloadParche(id, { drop: true }).then(() => {
            const p = findP(id);
            if (p) toast('Nuevo parche en vivo', `${p.titulo} · ${fmtKm(distKm(p))}`, { icon: 'i-live', action: { label: 'Ver', id } });
          });
          return;
        }
        if (findP(id)) reloadParche(id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parche_miembros' }, pl => {
        const id = pidOf(pl);
        if (id && findP(id)) reloadParche(id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, async ({ new: r }) => {
        const p = findP(r.parche_id);
        if (!p || !isRealMsg(r) || p.chat.some(m => m.id === r.id)) return;
        const mine = r.autor_id === me.id && p.chat.find(m => m.autor === 'me' && !m.id && m.texto === r.texto);
        if (mine) { mine.id = r.id; return; }
        await cachePeople([r.autor_id]);
        if (p.chat.some(m => m.id === r.id)) return;
        p.chat.push(msgFromRow(r));
        if (r.encuesta_id && !(p.encuestas || {})[r.encuesta_id]) extrasPronto(p.id);
        if (state.chatId === p.id) renderChatMsgs();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${me.id}` }, ({ new: r }) => {
        // Las de mesa y verificación ya tienen su propio aviso
        if (r.icono !== 'i-bolt' && r.icono !== 'i-users' && r.icono !== 'i-shield') toast('Novedad en tus parches', String(r.texto).replace(/<\/?b>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), { icon: 'i-live' });
      })
      // Transporte, encuestas y álbum del chat abierto
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, pl => { const pid = (pl.new && pl.new.parche_id) || (pl.old && pl.old.parche_id); if (pid && pid === state.chatId) extrasPronto(pid); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viaje_pasajeros' }, () => { if (state.chatId) extrasPronto(state.chatId); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encuesta_votos' }, () => { if (state.chatId) extrasPronto(state.chatId); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fotos_parche' }, ({ new: r }) => { if (r.parche_id === state.chatId) extrasPronto(r.parche_id); })
      // Modo Mesa: el local confirma o rechaza la reserva
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mesa_reservas', filter: `usuario_id=eq.${me.id}` }, ({ new: r }) => {
        const mia = (state.misMesas || []).find(x => x.id === r.id);
        if (!mia || mia.estado === r.estado) return;
        mia.estado = r.estado;
        if (r.estado === 'confirmada') toast('Mesa confirmada', `${mia.negocio.nombre} te espera. Muestra el código ${mia.codigo} al llegar.`, { icon: 'i-table', ms: 6500 });
        if (r.estado === 'rechazada') toast('El local no pudo recibirte', `${mia.negocio.nombre} no tiene mesa a esa hora. Prueba otra hora.`, { type: 'error', ms: 6500 });
        if (state.view === 'inicio') renderMesas();
      })
      .subscribe();
  }

  async function bootRemote() {
    setBoot('Revisando tu sesión...');
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* sin sesión */ }
    if (!session) {
      // Si llegó por un enlace compartido, lo abrimos después de entrar
      try { const a = new URLSearchParams(window.location.search).get('parche'); if (a) sessionStorage.setItem('mp_abrir', a); } catch (e) { /* sin almacenamiento */ }
      // Enlace de confirmación vencido o ya usado: el login explica qué hacer
      const err = /error_code=|error=/.test(location.hash) ? location.hash : '';
      window.location.replace('login.html' + err); return false;
    }
    me = session.user;
    if (new URLSearchParams(location.search).has('confirmado')) {
      try { sessionStorage.removeItem('mp_confirmar'); } catch (e) { /* nada */ }
      const u = new URL(location.href); u.searchParams.delete('confirmado');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      setTimeout(() => toast('¡Correo confirmado!', 'Tu cuenta quedó activa. Bienvenido a tu radar.', { icon: 'i-check', ms: 6000 }), 900);
    }
    if (me.user_metadata && me.user_metadata.tipo === 'empresa') { window.location.replace('empresa-dashboard.html'); return false; }
    try { const { data: esAdmin } = await sb.rpc('soy_admin'); if (esAdmin === true) { window.location.replace('admin.html'); return false; } } catch (e) { /* cuenta normal */ }
    sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT' || (!s && ev !== 'INITIAL_SESSION')) window.location.replace('login.html'); });
    setBoot('Cargando los parches de Villavo...');
    try { await loadRemote(); } catch (err) { console.error(err); bootError(err); return false; }
    return true;
  }

  /* =====================================================================
     14. GESTOS Y MICROINTERACCIONES
     Anillo al tocar, mantener para confirmar, deslizar para ver acciones,
     deslizar para responder, buscador que se despliega y deslizar hacia
     abajo para actualizar. Todo con transform/opacity y respetando
     "reducir movimiento".
  ===================================================================== */
  // Resorte con un rebote mínimo (y curva normal si el navegador no entiende linear())
  const SPRING = (window.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)'))
    ? 'linear(0, 0.0047, 0.0186, 0.0409, 0.0702 4.9%, 0.1478, 0.2422 9.9%, 0.4571 15.4%, 0.6626 21.1%, 0.8175 26.5%, 0.9227 31.8%, 0.9874 37%, 1.0207 42%, 1.0326 47%, 1.0315 51.6%, 1.0222 57.2%, 1.0108 63.4%, 1.0013 70.4%, 0.9965 79.5%, 0.9965 89.9%, 1)'
    : 'cubic-bezier(.23, 1, .32, 1)';
  const buzz = pattern => { try { if (!reduceMotion && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* sin vibración */ } };

  // El filtro gooey (desenfoque + contraste alto) que funde formas como líquido
  function ensureGooFilter() {
    if (document.getElementById('mp-goo-svg')) return;
    document.body.insertAdjacentHTML('beforeend', `<svg id="mp-goo-svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
      <filter id="mp-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>
      <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g"/>
      <feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></svg>`);
  }

  /* ---------- Arrastre horizontal con bloqueo de eje ----------
     Si el dedo se mueve primero en vertical, se deja hacer scroll normal.
     Si se mueve en horizontal, el gesto es nuestro y el clic se anula. */
  let swallowClick = false;
  function trackX(e, el, { onLock, onMove, onEnd }) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    let locked = false, dx = 0, lastX = x0, lastT = performance.now(), vx = 0;
    const move = ev => {
      if (ev.pointerId !== id) return;
      dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!locked) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { stop(); return; }
        if (Math.abs(dx) < 8) return;
        locked = true;
        try { el.setPointerCapture(id); } catch (err) { /* ya soltó */ }
        document.documentElement.classList.add('is-gesturing');
        onLock && onLock();
      }
      const now = performance.now();
      vx = vx * .4 + ((ev.clientX - lastX) / Math.max(1, now - lastT)) * .6;
      lastX = ev.clientX; lastT = now;
      onMove(dx);
    };
    const up = ev => { if (ev.pointerId === id) stop(); };
    function stop() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!locked) return;
      document.documentElement.classList.remove('is-gesturing');
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);
      onEnd(dx, vx);
    }
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ---------- Ripple ring ----------
     Un anillo naranja que sale del punto donde tocas. Con mouse sale al
     presionar; en pantalla táctil, al soltar (así no salta al hacer scroll). */
  const RING_SEL = '.btn, .icon-btn, .bn, .bn-create, .tab, .seg-btn, .qk, .mis-item, .mis-act, .me-chip, .search-toggle, .link-btn, .hello-link, .logo';
  function ring(x, y, { size = 120, delay = 0, cls = '' } = {}) {
    const layer = $('#fx-layer');
    if (!layer || reduceMotion) return;
    const r = document.createElement('span');
    r.className = 'fx-ring' + (cls ? ' ' + cls : '');
    r.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;animation-delay:${delay}ms`;
    layer.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
    setTimeout(() => r.remove(), 1200 + delay);
  }
  const ringSize = el => { const b = el.getBoundingClientRect(); return clamp(Math.max(b.width, b.height) * 1.5, 72, 240); };
  // Sobre una superficie naranja el anillo sale negro para que se vea
  function ringTone(el) {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (!m || (m[3] !== undefined && +m[3] < .5)) continue;
      const [r, g, b] = m.map(Number);
      return r > 200 && g < 140 && b < 90 ? 'is-ink' : '';
    }
    return '';
  }
  function ringBurst(el) {
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, s = Math.max(b.width, b.height);
    const tone = ringTone(el);
    ring(cx, cy, { size: s * 1.5, cls: tone });
    ring(cx, cy, { size: s * 2.3, delay: 110, cls: 'is-soft ' + tone });
  }
  function initRipple() {
    let down = null;
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest(RING_SEL);
      if (!el || el.disabled || el.closest('[data-hold]') || el.closest('.leaflet-container')) { down = null; return; }
      if (e.pointerType === 'mouse') { if (e.button === 0) ring(e.clientX, e.clientY, { size: ringSize(el), cls: ringTone(el) }); down = null; return; }
      down = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
    }, { capture: true, passive: true });
    document.addEventListener('pointerup', e => {
      if (!down || e.pointerId !== down.id) return;
      const d = down; down = null;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || !d.el.contains(e.target) || swallowClick) return;
      ring(e.clientX, e.clientY, { size: ringSize(d.el), cls: ringTone(d.el) });
    }, { capture: true, passive: true });
    document.addEventListener('pointercancel', () => { down = null; }, { capture: true, passive: true });
  }

  /* ---------- Hold to confirm: confirmar asistencia ----------
     Hay que mantener presionado "Caerle" mientras se llena. Soltar antes
     lo devuelve. Con teclado: mantener Enter o Espacio. Con lector de
     pantalla (clic sin puntero) confirma directo. */
  const HOLD_MS = 850;
  let holding = null;
  function holdStart(btn, kbd = false) {
    if (holding || btn.disabled || btn.classList.contains('is-done')) return;
    btn.classList.remove('is-hint');
    btn.style.setProperty('--hold-ms', (reduceMotion ? 400 : HOLD_MS) + 'ms');
    btn.classList.add('is-holding');
    buzz(5);
    holding = { btn, kbd, t0: performance.now(), timer: setTimeout(() => holdDone(btn), reduceMotion ? 400 : HOLD_MS) };
  }
  function holdEnd(cancelled = false) {
    if (!holding) return;
    const { btn, t0, timer } = holding;
    holding = null;
    clearTimeout(timer);
    if (btn.classList.contains('is-done')) return;
    btn.classList.remove('is-holding');
    if (!cancelled && performance.now() - t0 < 320) holdHint(btn);
  }
  function holdHint(btn) {
    btn.classList.remove('is-hint'); void btn.offsetWidth; btn.classList.add('is-hint');
    clearTimeout(btn._hintT);
    btn._hintT = setTimeout(() => btn.classList.remove('is-hint'), 1700);
  }
  function holdDone(btn) {
    holding = null;
    btn.classList.remove('is-holding', 'is-hint');
    btn.classList.add('is-done');
    buzz([10, 40, 18]);
    ringBurst(btn);
    setTimeout(() => {
      toggleJoin(btn.dataset.id);
      // Si no se pudo (parche lleno), el botón vuelve a quedar listo
      setTimeout(() => { if (btn.isConnected) btn.classList.remove('is-done'); }, 900);
    }, reduceMotion ? 0 : 340);
  }
  function onHoldClick(e, btn) {
    e.preventDefault();
    e.stopPropagation();
    // detail 0 = clic sin puntero (lector de pantalla o control por voz)
    if (e.detail === 0 && !holding && !btn.classList.contains('is-done')) holdDone(btn);
  }
  function initHold() {
    document.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-hold]');
      if (b && (e.pointerType !== 'mouse' || e.button === 0)) holdStart(b);
    }, true);
    window.addEventListener('pointerup', () => holdEnd(false), true);
    window.addEventListener('pointercancel', () => holdEnd(true), true);
    document.addEventListener('pointerout', e => {
      if (holding && !holding.kbd && e.target.closest('[data-hold]') === holding.btn && !holding.btn.contains(e.relatedTarget)) holdEnd(true);
    }, true);
    document.addEventListener('contextmenu', e => { if (e.target.closest('[data-hold]')) e.preventDefault(); }, true);
    const isKey = e => e.key === 'Enter' || e.key === ' ';
    document.addEventListener('keydown', e => {
      const b = isKey(e) && e.target.closest && e.target.closest('[data-hold]');
      if (!b) return;
      e.preventDefault();
      if (!e.repeat) holdStart(b, true);
    }, true);
    document.addEventListener('keyup', e => {
      if (!isKey(e) || !(e.target.closest && e.target.closest('[data-hold]'))) return;
      e.preventDefault();
      holdEnd(false);
    }, true);
  }

  /* ---------- Reveal actions: deslizar un parche a la izquierda ---------- */
  let openRowEl = null;
  const rowParts = row => ({ item: $('.mis-item', row), acts: $('.mis-actions', row) });
  const rowX = row => parseFloat(rowParts(row).item.style.translate) || 0;
  function setRowX(row, x) {
    const { item, acts } = rowParts(row);
    item.style.translate = `${x}px 0`;
    row.style.setProperty('--rp', clamp(-x / (acts.offsetWidth || 1), 0, 1.15).toFixed(3));
  }
  function setRowFocusable(row, on) {
    const { acts } = rowParts(row);
    acts.setAttribute('aria-hidden', on ? 'false' : 'true');
    $$('.mis-act', acts).forEach(b => { b.tabIndex = on ? 0 : -1; });
  }
  function openReveal(row) {
    if (openRowEl && openRowEl !== row) closeReveal(openRowEl);
    setRowX(row, -rowParts(row).acts.offsetWidth);
    row.classList.add('is-open');
    setRowFocusable(row, true);
    openRowEl = row;
  }
  function closeReveal(row = openRowEl) {
    if (!row) return;
    if (openRowEl === row) openRowEl = null;
    if (!row.isConnected) return;
    setRowX(row, 0);
    row.classList.remove('is-open');
    setRowFocusable(row, false);
  }
  function startReveal(e, row) {
    const { acts } = rowParts(row);
    let base = 0, w = 0;
    trackX(e, rowParts(row).item, {
      onLock() {
        if (openRowEl && openRowEl !== row) closeReveal(openRowEl);
        w = acts.offsetWidth; base = rowX(row);
        row.classList.add('is-dragging');
      },
      onMove(dx) {
        let x = base + dx;
        if (x > 0) x *= .25;                       // resistencia hacia la derecha
        if (x < -w) x = -w + (x + w) * .3;         // resistencia al pasarse
        setRowX(row, x);
      },
      onEnd(dx, vx) {
        row.classList.remove('is-dragging');
        const x = rowX(row);
        if (vx < -.35 || (vx < .35 && x < -w * .45)) { openReveal(row); buzz(6); } else closeReveal(row);
      },
    });
  }
  // La primera vez en el celular, la fila "se asoma" para enseñar el gesto
  function hintReveal() {
    if (reduceMotion || !isMobile() || store.get('mp_hint_reveal', false)) return;
    const row = $('#mis-list .mis-row');
    if (!row) return;
    store.set('mp_hint_reveal', true);
    setTimeout(() => {
      if (!row.isConnected || openRowEl) return;
      row.classList.add('is-peek');
      setRowX(row, -64);
      setTimeout(() => { if (row.isConnected && !row.classList.contains('is-open')) setRowX(row, 0); }, 650);
      setTimeout(() => row.classList.remove('is-peek'), 1300);
    }, 900);
  }

  /* ---------- Swipe to reply: deslizar un mensaje a la derecha ---------- */
  const REPLY_AT = 58;
  function startSwipeReply(e, msg) {
    const p = state.chatId && findP(state.chatId);
    if (!p || !inside(p)) return;
    let armed = false, x = 0;
    trackX(e, msg, {
      onLock() { msg.classList.add('is-swiping'); },
      onMove(dx) {
        x = Math.max(0, dx);
        x = x < REPLY_AT ? x : REPLY_AT + (x - REPLY_AT) * .22;
        x = Math.min(x, 92);
        msg.style.setProperty('--sx', x + 'px');
        msg.style.setProperty('--sp', Math.min(1, x / REPLY_AT).toFixed(3));
        const now = x >= REPLY_AT;
        if (now !== armed) { armed = now; msg.classList.toggle('is-armed', armed); if (armed) buzz(8); }
      },
      onEnd() {
        msg.classList.remove('is-swiping', 'is-armed');
        msg.style.removeProperty('--sx');
        msg.style.removeProperty('--sp');
        if (armed) setReply(msg.dataset.key);
      },
    });
  }

  /* ---------- Icon expand: el buscador sale del ícono ---------- */
  function initSearch() {
    const wrap = $('#search'), inp = $('#search-input'), tog = $('#search-toggle'), clr = $('#search-clear'), head = $('#abiertos-head');
    if (!wrap || !inp || !tog) return;
    const isOpen = () => wrap.classList.contains('is-open');
    function open() {
      if (!isOpen()) {
        wrap.classList.add('is-open'); head && head.classList.add('is-searching');
        tog.setAttribute('aria-expanded', 'true');
        inp.tabIndex = 0; tog.tabIndex = -1;
      }
      inp.focus({ preventScroll: true });
    }
    function close() {
      if (!isOpen() || inp.value) return;
      wrap.classList.remove('is-open'); head && head.classList.remove('is-searching');
      tog.setAttribute('aria-expanded', 'false');
      inp.tabIndex = -1; tog.tabIndex = 0;
    }
    const apply = (v, anim = true) => { state.search = v.trim(); clr.hidden = !v; renderCards(anim); };
    tog.addEventListener('click', open);
    wrap.addEventListener('focusout', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) close(); }, 0));
    let st;
    inp.addEventListener('input', () => { clearTimeout(st); clr.hidden = !inp.value; st = setTimeout(() => apply(inp.value), 160); });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (inp.value) { inp.value = ''; apply(''); } else { close(); tog.focus(); }
    });
    clr.addEventListener('click', () => { inp.value = ''; apply(''); inp.focus(); });
    // Atajo: "/" abre el buscador en el inicio
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || state.view !== 'inicio' || modalStack.length || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault(); open();
    });
  }

  /* ---------- Pull to refresh con el logo de ModoParche ---------- */
  async function refreshData() {
    if (DEMO) {
      await cargarMesas();
      await new Promise(r => setTimeout(r, 500));
    } else {
      const prev = new Map(state.parches.map(p => [p.id, p]));
      try { await loadRemote(); }
      catch (err) { toast('No se pudo actualizar', dbMsg(err), { type: 'error' }); return false; }
      state.parches.forEach(p => { const o = prev.get(p.id); if (o && o.chat && o.chat.length) p.chat = o.chat; });
      renderMeChip();
    }
    refresh();
    if (state.view === 'inicio') renderCards(true);
    if (state.view === 'perfil') renderPerfil();
    return true;
  }
  function initPullToRefresh() {
    const ptr = $('#ptr');
    if (!ptr || !('ontouchstart' in window)) return;
    const MAX = 140, TRIG = 72, REST = 64;
    let y0 = null, x0 = 0, pulling = false, armed = false, busy = false, d = 0;
    const set = v => { d = v; ptr.style.setProperty('--pd', v.toFixed(1)); ptr.style.setProperty('--pp', Math.min(1, v / TRIG).toFixed(3)); };
    const blocked = t => busy || window.scrollY > 0 || modalStack.length || document.body.classList.contains('no-scroll')
      || state.view === 'mapa' || $('#mis-wrap').classList.contains('is-chat')
      || !!t.closest('.leaflet-container, .chat-msgs, .toast, input, textarea, select, .modal');
    document.addEventListener('touchstart', e => {
      y0 = null;
      if (e.touches.length !== 1 || blocked(e.target)) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; pulling = false;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (!pulling) {
        if (dy < -4 || Math.abs(dx) > 12 || window.scrollY > 0) { y0 = null; return; }
        if (dy < 8 || Math.abs(dx) > dy) return;
        pulling = true; armed = false;
        holdEnd(true);
        document.documentElement.classList.add('is-ptr');
        ptr.classList.remove('is-done', 'is-loading');
        ptr.classList.add('is-pulling');
      }
      if (e.cancelable) e.preventDefault();
      set(MAX * (1 - Math.exp(-(dy - 8) / MAX)));   // banda elástica
      const now = d >= TRIG;
      if (now !== armed) { armed = now; ptr.classList.toggle('is-armed', armed); if (armed) buzz(8); }
    }, { passive: false });
    const end = async () => {
      if (!pulling) { y0 = null; return; }
      pulling = false; y0 = null;
      ptr.classList.remove('is-pulling');
      if (!armed) { ptr.classList.remove('is-armed'); set(0); document.documentElement.classList.remove('is-ptr'); return; }
      busy = true;
      ptr.classList.add('is-loading');
      set(REST);
      $('#ptr-status').textContent = 'Actualizando parches...';
      const [ok] = await Promise.all([refreshData(), new Promise(r => setTimeout(r, 900))]);
      ptr.classList.remove('is-loading', 'is-armed');
      ptr.classList.add('is-done');
      $('#ptr-status').textContent = ok ? 'Parches al día' : '';
      setTimeout(() => { set(0); }, reduceMotion ? 0 : 380);
      setTimeout(() => { ptr.classList.remove('is-done'); busy = false; document.documentElement.classList.remove('is-ptr'); }, reduceMotion ? 0 : 900);
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
  }

  /* ---------- Fila de lugares: flechas, rueda del mouse y arrastre ---------- */
  function initPlaceRail() {
    const rail = $('#place-rail'), row = $('#place-chips'), prev = $('#place-prev'), next = $('#place-next');
    if (!rail || !row) return;
    const sync = () => {
      const max = row.scrollWidth - row.clientWidth;
      const atStart = row.scrollLeft <= 2, atEnd = row.scrollLeft >= max - 2;
      prev.hidden = max <= 2 || atStart;
      next.hidden = max <= 2 || atEnd;
      rail.classList.toggle('fade-start', max > 2 && !atStart);
      rail.classList.toggle('fade-end', max > 2 && !atEnd);
      paintTrack();
    };
    const step = dir => row.scrollBy({ left: dir * Math.max(160, row.clientWidth * .7), behavior: reduceMotion ? 'auto' : 'smooth' });
    // Riel de la marca: muestra cuánto falta y se puede arrastrar
    const track = $('#place-track'), thumb = $('#place-thumb');
    const paintTrack = () => {
      if (!track) return;
      const max = row.scrollWidth - row.clientWidth;
      track.hidden = max <= 2;
      if (max <= 2) return;
      const ratio = row.clientWidth / row.scrollWidth, tw = track.clientWidth;
      const w = Math.max(36, tw * ratio);
      thumb.style.width = w + 'px';
      thumb.style.translate = `${(tw - w) * (row.scrollLeft / max)}px 0`;
      track.setAttribute('aria-valuenow', String(Math.round(row.scrollLeft / max * 100)));
    };
    if (track) {
      track.addEventListener('pointerdown', e => {
        const b = track.getBoundingClientRect(), w = thumb.offsetWidth, max = row.scrollWidth - row.clientWidth;
        const to = x => { row.scrollLeft = clamp((x - b.left - w / 2) / (b.width - w), 0, 1) * max; };
        to(e.clientX);
        track.classList.add('is-dragging');
        try { track.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
        const move = ev => to(ev.clientX);
        const up = () => { track.classList.remove('is-dragging'); track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); track.removeEventListener('pointercancel', up); };
        track.addEventListener('pointermove', move); track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
      });
      track.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
      });
    }
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    row.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    window.addEventListener('resize', sync);
    if (window.ResizeObserver) new ResizeObserver(sync).observe(row);
    // Rueda vertical del mouse = mover la fila de lado
    row.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
      const max = row.scrollWidth - row.clientWidth;
      if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= max)) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    }, { passive: false });
    // Arrastrar con el mouse (en pantalla táctil ya se desliza solo)
    row.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const x0 = e.clientX, s0 = row.scrollLeft;
      let moved = false;
      const move = ev => {
        const dx = ev.clientX - x0;
        if (!moved && Math.abs(dx) < 6) return;
        if (!moved) { moved = true; row.classList.add('is-dragging'); }
        row.scrollLeft = s0 - dx;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        row.classList.remove('is-dragging');
        if (moved) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 0); }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    sync();
  }

  /* =====================================================================
     16. SEGURIDAD Y COMUNIDAD
     Botón de ayuda (123), consejos de seguridad, QR personal de
     identidad, ubicación en vivo para un contacto de confianza, lista de
     espera, invitar parceros, transporte, encuestas, álbum y "Para ti".
  ===================================================================== */

  /* ---------- Consejos de seguridad (rotan cada día) ---------- */
  const CONSEJOS = [
    'Antes de salir, comparte tu ubicación en vivo con alguien de confianza.',
    'Para encontrarte con alguien nuevo, elige lugares públicos y con gente.',
    'Pide el QR de identidad de quien no conoces: verás si su cédula está verificada.',
    'Nunca dejes tu bebida sola ni recibas tragos de desconocidos.',
    'Acuerda con tu parche la hora y el medio de regreso antes de salir.',
    'Lleva el celular cargado y con datos. Si puedes, una batería extra.',
    'Si algo te incomoda, sal del lugar y llama al 123. No esperes.',
    'No compartas tu dirección, cédula ni datos bancarios por el chat.',
    'Paga la vaca solo a personas del parche y por medios que dejen registro.',
    'Si te sientes en peligro, toca "Ayuda" arriba: 123 y tu ubicación a un toque.',
    'En planes de río o montaña, avisa a alguien la ruta y la hora de regreso.',
    'Confía en tu instinto: si un plan no te da buena espina, no vayas.',
  ];
  const consejoDelDia = (k = 0) => CONSEJOS[(Math.floor(Date.now() / (24 * HOUR)) + k) % CONSEJOS.length];
  function renderConsejo() {
    const slot = $('#consejo-slot');
    if (!slot) return;
    if (store.get('mp_consejo_oculto', '') === todayKey()) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<aside class="tip-card" aria-label="Consejo de seguridad">
      <span class="tip-ic">${ic('i-shield')}</span>
      <p><b>Consejo de seguridad</b>${esc(consejoDelDia())}</p>
      <button type="button" class="icon-btn tip-x" data-action="consejo-ocultar" aria-label="Ocultar el consejo de hoy">${ic('i-close')}</button>
    </aside>`;
  }
  // Un recordatorio como aviso, máximo cada 12 horas
  function consejoPeriodico() {
    const ult = store.get('mp_consejo_toast', 0);
    if (Date.now() - ult < 12 * HOUR) return;
    store.set('mp_consejo_toast', Date.now());
    setTimeout(() => toast('Consejo de seguridad', consejoDelDia(3), { icon: 'i-shield', ms: 7000, action: { label: 'Ayuda', act: 'seguridad', id: '' } }), 6000);
  }

  /* ---------- Botón de ayuda: 123, ubicación y contacto de confianza ---------- */
  let ayudaParche = null;
  function abrirSeguridad(parcheId) {
    ayudaParche = parcheId && findP(parcheId) ? parcheId : null;
    renderSeguridad();
    openModal('modal-seguridad');
  }
  function renderSeguridad() {
    const c = { nombre: perfil.contacto_nombre || '', tel: perfil.contacto_tel || '' };
    $('#sos-contacto-txt').textContent = c.tel ? `${c.nombre || 'Tu contacto'} · ${c.tel}` : 'Aún no tienes contacto de confianza';
    $('#sos-enviar').disabled = !c.tel;
    $('#sos-nombre').value = c.nombre; $('#sos-tel').value = c.tel;
    const viva = ubicacionViva.token;
    $('#sos-vivo').classList.toggle('is-on', !!viva);
    $('#sos-vivo-txt').textContent = viva ? 'Compartiendo tu ubicación en vivo' : 'Compartir mi ubicación en vivo';
    $('#sos-vivo-sub').textContent = viva ? 'Toca para dejar de compartir. Se apaga sola en 8 horas.' : 'Tu contacto la ve en un enlace, sin cuenta. Hasta 8 horas.';
    $('#sos-link').hidden = !viva;
    if (viva) {
      $('#sos-link-url').value = linkUbicacionViva();
      $('#sos-link-compartir').hidden = !navigator.share;
    } else { $('#sos-link').classList.remove('is-copiado'); $('#sos-link-ok').textContent = ''; }
    $('#sos-consejo').textContent = consejoDelDia(1);
  }
  const telWa = t => { const d = String(t || '').replace(/\D/g, ''); return d.length === 10 ? '57' + d : d; };
  function posicionAhora() {
    return new Promise((res, rej) => {
      if (userPos) { res({ lat: userPos[0], lng: userPos[1], acc: userAcc }); return; }
      if (!navigator.geolocation) { rej(new Error('GPS')); return; }
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }
  async function enviarUbicacion() {
    if (!perfil.contacto_tel) { $('#sos-nombre').focus(); return; }
    let msg = `Hola, soy ${perfil.primer || 'yo'} (ModoParche).`;
    try {
      const p = await posicionAhora();
      msg += ` Estoy aquí: https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    } catch (e) { msg += ' No pude sacar mi ubicación, pero quiero que sepas dónde ando.'; }
    const pa = ayudaParche && findP(ayudaParche);
    if (pa) msg += ` Voy al parche "${pa.titulo}" en ${pa.lugar} (${fmtCuando(pa.inicio)}).`;
    if (ubicacionViva.token) msg += ` Ubicación en vivo: ${linkUbicacionViva()}`;
    window.open(`https://wa.me/${telWa(perfil.contacto_tel)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  }
  async function guardarContacto(e) {
    e.preventDefault();
    const nombre = $('#sos-nombre').value.trim().slice(0, 40), tel = $('#sos-tel').value.replace(/\D/g, '');
    if (tel && !/^[0-9]{7,15}$/.test(tel)) { toast('Revisa el número', 'Escribe solo números, por ejemplo 3104567890.', { type: 'error' }); return; }
    if (!DEMO) {
      const { error } = await sb.from('perfiles_privados').update({ contacto_nombre: nombre || null, contacto_tel: tel || null }).eq('id', me.id);
      if (error) { toast('No se guardó el contacto', /contacto_/.test(error.message) ? 'Falta activar esta función en la base de datos.' : dbMsg(error), { type: 'error' }); return; }
    }
    perfil.contacto_nombre = nombre; perfil.contacto_tel = tel;
    savePerfil();
    renderSeguridad();
    toast('Contacto guardado', tel ? `${nombre || 'Tu contacto'} recibirá tu ubicación cuando lo pidas.` : 'Quitaste tu contacto de confianza.', { icon: 'i-shield' });
  }

  /* ---------- Ubicación en vivo (enlace /seguro/<token>) ---------- */
  const ubicacionViva = { token: store.get('mp_ubicacion_viva', null), watch: null, ultimo: 0 };
  async function toggleUbicacionViva() {
    if (ubicacionViva.token) { pararUbicacionViva(); return; }
    if (DEMO) { toast('Modo demo', 'La ubicación en vivo funciona cuando entras con tu cuenta.', { icon: 'i-info' }); return; }
    const { data, error } = await sb.rpc('iniciar_ubicacion_viva', { p_parche: ayudaParche && isUuid(ayudaParche) ? ayudaParche : null });
    if (error) { toast('No pudimos compartir tu ubicación', /iniciar_ubicacion_viva|PGRST202/.test(error.message) ? 'Falta activar esta función en la base de datos.' : dbMsg(error), { type: 'error' }); return; }
    ubicacionViva.token = data; store.set('mp_ubicacion_viva', data);
    renderSeguridad();
    const copiado = await copiarLinkUbicacion(true);
    toast('Ubicación en vivo activada', copiado ? 'Copiamos el enlace. Pégalo en el chat de tu contacto de confianza.' : 'Copia el enlace del recuadro verde y mándaselo a tu contacto de confianza.', { icon: 'i-locate', ms: 8000, action: perfil.contacto_tel ? { label: 'Enviar', act: 'sos-enviar', id: '' } : null });
    // La primera ubicación se manda ya: así el enlace muestra algo aunque cierres esta pestaña
    try {
      const p = await posicionAhora();
      await guardarPosicionViva(p.lat, p.lng, p.acc);
    } catch (e) { toast('Activa el GPS', 'Sin permiso de ubicación, tu contacto no verá dónde estás.', { type: 'error', icon: 'i-locate' }); }
    seguirUbicacion();
  }
  const linkUbicacionViva = () => ubicacionViva.token ? `${location.origin}/seguro/${ubicacionViva.token}` : '';
  async function guardarPosicionViva(lat, lng, acc) {
    if (!ubicacionViva.token) return;
    ubicacionViva.ultimo = Date.now();
    const { error } = await sb.from('ubicaciones_vivas').update({ lat, lng, precision_m: Math.round(acc || 0) || null, actualizado: new Date().toISOString() }).eq('token', ubicacionViva.token);
    if (error) console.warn('[ubicación viva]', error.message);
  }
  // Copia el enlace y lo deja resaltado, con aviso visible (no solo un toast que se va)
  async function copiarLinkUbicacion(silencioso = false) {
    const link = linkUbicacionViva(), caja = $('#sos-link'), input = $('#sos-link-url'), ok = $('#sos-link-ok');
    if (!link) return false;
    let hecho = false;
    try { await navigator.clipboard.writeText(link); hecho = true; } catch (e) {
      // Respaldo: seleccionar el texto y usar el copiado clásico
      try { input.focus(); input.select(); hecho = document.execCommand('copy'); } catch (e2) { hecho = false; }
    }
    if (hecho) {
      caja.classList.add('is-copiado');
      ok.textContent = '✓ Enlace copiado. Ahora pégalo en WhatsApp, SMS o donde hables con tu contacto.';
      $('#sos-link-copiar').textContent = 'Copiado';
      setTimeout(() => { const b = $('#sos-link-copiar'); if (b) b.textContent = 'Copiar'; }, 2500);
    } else if (!silencioso) {
      input.focus(); input.select();
      ok.textContent = 'Tu navegador no dejó copiar solo. Mantén presionado el enlace y elige "Copiar".';
    }
    return hecho;
  }
  async function compartirLinkUbicacion() {
    const url = linkUbicacionViva();
    if (!url) return;
    try { await navigator.share({ title: 'Mi ubicación en vivo · ModoParche', text: `Soy ${perfil.primer || 'yo'}. Aquí puedes ver dónde estoy en vivo:`, url }); }
    catch (e) { if (e && e.name !== 'AbortError') copiarLinkUbicacion(); }
  }
  function waLinkUbicacion() {
    const url = linkUbicacionViva();
    if (!url) return;
    const msg = `Hola, soy ${perfil.primer || 'yo'} (ModoParche). Aquí puedes ver mi ubicación en vivo: ${url}`;
    window.open(`https://wa.me/${perfil.contacto_tel ? telWa(perfil.contacto_tel) : ''}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  }
  function seguirUbicacion() {
    if (!ubicacionViva.token || !navigator.geolocation || ubicacionViva.watch != null) return;
    ubicacionViva.watch = navigator.geolocation.watchPosition(async pos => {
      if (Date.now() - ubicacionViva.ultimo < 20000) return; // cada 20 s basta
      await guardarPosicionViva(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    }, () => { /* sin permiso: el enlace muestra la última conocida */ }, { enableHighAccuracy: true, maximumAge: 15000 });
  }
  async function pararUbicacionViva() {
    const t = ubicacionViva.token;
    if (ubicacionViva.watch != null) navigator.geolocation.clearWatch(ubicacionViva.watch);
    ubicacionViva.watch = null; ubicacionViva.token = null; store.set('mp_ubicacion_viva', null);
    if (t && !DEMO) await sb.from('ubicaciones_vivas').update({ activa: false }).eq('token', t);
    renderSeguridad();
    toast('Dejaste de compartir tu ubicación', 'El enlace ya no muestra dónde estás.', { icon: 'i-check' });
  }

  /* ---------- QR personal de identidad ---------- */
  let qridTimer = null;
  async function mostrarMiQR() {
    openModal('modal-qrid');
    $('#qrid-nombre').innerHTML = `${esc(perfil.nombre)}${perfil.cedula_verificada ? ` <span class="sello">${ic('i-shield')}</span>` : ''}`;
    $('#qrid-estado').textContent = perfil.cedula_verificada ? 'Cédula verificada' : 'Cédula sin verificar';
    $('#qrid-estado').classList.toggle('is-ok', !!perfil.cedula_verificada);
    clearTimeout(qridTimer);
    const ciclo = async () => {
      if ($('#modal-qrid').hidden) return;
      let cod;
      if (DEMO) cod = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      else {
        const { data, error } = await sb.rpc('nuevo_qr_identidad');
        if (error) { $('#qrid-qr').innerHTML = `<p class="qr-err">${/nuevo_qr_identidad|PGRST202/.test(error.message) ? 'Falta activar esta función en la base de datos.' : esc(dbMsg(error))}</p>`; return; }
        cod = data.codigo;
      }
      try { $('#qrid-qr').innerHTML = await window.MPCheckin.dibujar('MPID|' + cod); } catch (e) { $('#qrid-qr').innerHTML = '<p class="qr-err">Sin conexión para dibujar el QR.</p>'; }
      const barra = $('#qrid-barra');
      barra.style.transition = 'none'; barra.style.transform = 'scaleX(1)'; void barra.offsetWidth;
      barra.style.transition = 'transform 30s linear'; barra.style.transform = 'scaleX(0)';
      qridTimer = setTimeout(ciclo, 30000);
    };
    ciclo();
  }
  let qrLector = null;
  function escanearIdentidad() {
    openModal('modal-qrscan');
    $('#qrscan-res').innerHTML = '';
    $('#qrscan-res').hidden = true;
    $('#qrscan-reader').hidden = false;
    $('#qrscan-msg').textContent = 'Apunta la cámara al QR de la otra persona.';
    if (!window.MPCheckin) return;
    qrLector = window.MPCheckin.escanear('qrscan-reader', async r => {
      qrLector = null;
      $('#qrscan-reader').hidden = true;
      $('#qrscan-msg').textContent = 'Revisando...';
      await verificarIdentidad(r.codigo);
    }, (err, sigue) => { $('#qrscan-msg').textContent = err.message; if (!sigue) $('#qrscan-reader').hidden = true; }, window.MPCheckin.parsearIdentidad);
  }
  function cerrarLectorQR() { if (qrLector) { qrLector.detener(); qrLector = null; } }
  async function verificarIdentidad(codigo) {
    let d;
    if (DEMO) d = { nombre: 'Laura M.', verificado: true, rating: 4.8, resenas: 12, desde: new Date(Date.now() - 90 * 24 * HOUR).toISOString(), parches: 9, escaneo: 1, calificar: { parche: 'Atardecer en la Piedra del Amor', estrellas: null } };
    else {
      const { data, error } = await sb.rpc('verificar_qr_identidad', { p_codigo: codigo });
      if (error) {
        $('#qrscan-msg').textContent = /QR_VENCIDO/.test(`${error.message} ${error.hint}`) ? 'Ese QR ya venció. Pide que lo vuelva a mostrar (cambia cada 30 s).' : dbMsg(error);
        return;
      }
      d = data;
    }
    const desde = d.desde ? new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(d.desde)) : '';
    const foto = d.foto && d.foto.src ? photoImg(d.foto) : `<span class="qr-res-ini">${esc(initial(d.nombre))}</span>`;
    $('#qrscan-msg').textContent = '';
    const res = $('#qrscan-res');
    res.hidden = false;
    res.innerHTML = `<div class="qr-res ${d.verificado ? 'is-ok' : 'is-warn'}">
      <span class="qr-res-av">${foto}</span>
      <b class="qr-res-nombre">${esc(d.nombre)}</b>
      <p class="qr-res-sello">${ic(d.verificado ? 'i-shield' : 'i-alert')} ${d.verificado ? (d.es_negocio ? 'Negocio verificado por ModoParche' : 'Cédula verificada por ModoParche') : 'Sin verificar: ten más cuidado'}</p>
      <ul class="qr-res-datos">
        ${d.es_negocio ? '<li>Cuenta de negocio</li>' : `<li>${ic('i-star')} ${d.resenas ? `${Number(d.rating).toFixed(1).replace('.', ',')} · ${d.resenas} ${d.resenas === 1 ? 'calificación' : 'calificaciones'}` : 'Sin calificaciones todavía'}</li>
        <li>${ic('i-check')} ${d.parches || 0} ${d.parches === 1 ? 'parche con llegada confirmada' : 'parches con llegada confirmada'}</li>`}
        ${desde ? `<li>${ic('i-calendar')} En ModoParche desde ${esc(desde)}</li>` : ''}
      </ul>
      ${calificarQRHTML(d)}
      <button type="button" class="btn btn--ghost btn--sm" data-action="qr-escanear-id">${ic('i-scan')} Escanear otro</button>
    </div>`;
    buzz(d.verificado ? [10, 40, 10] : 30);
  }

  /* ---------- Calificar al escanear su QR (1 a 5 estrellas) ---------- */
  let qrEscaneo = null;
  function calificarQRHTML(d) {
    qrEscaneo = d.escaneo || null;
    if (d.es_yo) return '<p class="qr-cal-nota">Este es tu propio QR.</p>';
    if (d.es_negocio) return '';
    if (!d.calificar || !qrEscaneo) return `<p class="qr-cal-nota">${ic('i-star')} Para calificar a ${esc(String(d.nombre).split(' ')[0])}, deben estar en el mismo parche.</p>`;
    const v = Number(d.calificar.estrellas) || 0;
    return `<div class="cal-row qr-cal" data-v="${v}">
      <p class="qr-cal-t"><b>${v ? 'Tu calificación' : `¿Cómo te fue con ${esc(String(d.nombre).split(' ')[0])}?`}</b><small>Por el parche "${esc(d.calificar.parche)}"</small></p>
      <div class="stars-in" role="radiogroup" aria-label="Estrellas para ${esc(d.nombre)}">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star-btn ${n <= v ? 'is-on' : ''}" role="radio" aria-checked="${n === v}" data-star="${n}" aria-label="${n} ${n === 1 ? 'estrella' : 'estrellas'}">${ic('i-star')}</button>`).join('')}
      </div>
      <button type="button" class="cal-volver" aria-pressed="false">${ic('i-check')} Volvería a parchar</button>
      <button type="button" class="btn btn--sm qr-cal-send" data-action="qr-calificar">${ic('i-star')} ${v ? 'Cambiar calificación' : 'Calificar'}</button>
      <p class="qr-cal-msg" role="status" aria-live="polite"></p>
    </div>`;
  }
  async function calificarPorQR(btn) {
    const box = btn.closest('.qr-cal');
    const estrellas = Number(box.dataset.v) || 0, volver = box.querySelector('.cal-volver').getAttribute('aria-pressed') === 'true';
    const msg = box.querySelector('.qr-cal-msg');
    if (!estrellas) { msg.textContent = 'Toca las estrellas primero.'; return; }
    btn.classList.add('is-loading');
    if (!DEMO) {
      const { error } = await sb.rpc('calificar_por_qr', { p_escaneo: qrEscaneo, p_estrellas: estrellas, p_volver: volver });
      btn.classList.remove('is-loading');
      if (error) {
        const m = `${error.message} ${error.hint || ''}`;
        msg.textContent = /ESCANEO_VENCIDO/.test(m) ? 'Pasaron más de 30 minutos: vuelve a escanear su QR.'
          : /SIN_PARCHE/.test(m) ? 'Solo puedes calificar a alguien con quien compartes un parche.'
          : /calificar_por_qr|PGRST202/.test(m) ? 'Falta activar esta función en la base de datos.' : dbMsg(error);
        return;
      }
    } else btn.classList.remove('is-loading');
    ringBurst(btn);
    buzz([10, 40, 18]);
    msg.textContent = `Guardaste ${estrellas} ${estrellas === 1 ? 'estrella' : 'estrellas'}. Puedes cambiarla en los próximos 30 minutos.`;
    btn.innerHTML = `${ic('i-check')} Calificación guardada`;
    toast('¡Gracias por calificar!', 'Así se notan los buenos parceros.', { icon: 'i-star' });
  }

  /* ---------- Lista de espera ---------- */
  async function toggleEspera(id) {
    const p = findP(id);
    if (!p) return;
    const on = !state.espera.has(id);
    if (on) state.espera.add(id); else state.espera.delete(id);
    refresh(); if (state.chatId === id) renderChat();
    if (isRemote(p)) {
      const res = on ? await sb.from('lista_espera').insert({ parche_id: id }) : await sb.from('lista_espera').delete().eq('parche_id', id).eq('usuario_id', me.id);
      if (res.error) {
        if (on) state.espera.delete(id); else state.espera.add(id);
        refresh(); if (state.chatId === id) renderChat();
        toast('No se pudo', /lista_espera/.test(res.error.message) ? 'Falta activar esta función en la base de datos.' : dbMsg(res.error), { type: 'error' });
        return;
      }
    } else store.set('mp_demo_espera', [...state.espera]);
    toast(on ? 'Te avisamos si se libera un cupo' : 'Saliste de la lista de espera', on ? `Eres parte de la lista de "${p.titulo}". Si alguien se sale, te llega un aviso.` : '', { icon: on ? 'i-users' : 'i-check' });
  }
  async function cargarEspera() {
    if (DEMO) { state.espera = new Set(store.get('mp_demo_espera', [])); return; }
    const r = await sb.from('lista_espera').select('parche_id').eq('usuario_id', me.id);
    state.espera = new Set(r.error ? [] : (r.data || []).map(x => x.parche_id));
  }

  /* ---------- Invitar a tus parceros ---------- */
  async function cargarParceros() {
    if (DEMO) { state.parceros = []; return; }
    const { data, error } = await sb.rpc('mis_parceros');
    state.parceros = error ? [] : (data || []);
    await cachePeople(state.parceros.map(x => x.id));
  }
  async function abrirInvitar(id) {
    const p = findP(id);
    if (!p) return;
    state.invitarId = id;
    openModal('modal-invitar');
    $('#inv-title').textContent = p.titulo;
    $('#inv-msg').textContent = '';
    if (!DEMO && !state.parceros) await cargarParceros();
    const lista = (state.parceros || []).filter(x => !p.confirmados.includes(x.id) && x.id !== me?.id);
    $('#inv-list').innerHTML = lista.length ? lista.map(x => `<li><label class="inv-row">
        <input type="checkbox" value="${esc(x.id)}">
        ${avHTML(x.id, 'av--sm')}
        <span><b>${esc(x.nombre)}${x.verificado ? ` <span class="sello">${ic('i-shield')}</span>` : ''}</b><small>${x.veces} ${x.veces === 1 ? 'parche juntos' : 'parches juntos'}</small></span>
      </label></li>`).join('')
      : `<li class="inv-vacio">${emptyHTML({ art: 'parceros', title: 'Aún no tienes parceros', text: 'Cuando compartas parches con gente, aparecen aquí para invitarlos con un toque.', cta: '' })}</li>`;
    $('#inv-send').disabled = !lista.length;
  }
  async function enviarInvitaciones() {
    const p = findP(state.invitarId);
    const ids = $$('#inv-list input:checked').map(i => i.value);
    if (!p) return;
    if (!ids.length) { $('#inv-msg').textContent = 'Elige al menos una persona.'; return; }
    const btn = $('#inv-send'); btn.classList.add('is-loading');
    const { data, error } = await sb.rpc('invitar_a_parche', { p_parche: p.id, p_invitados: ids });
    btn.classList.remove('is-loading');
    if (error) { $('#inv-msg').textContent = /MUCHOS/.test(error.message) ? 'Invita máximo 15 personas a la vez.' : dbMsg(error); return; }
    closeModal('modal-invitar');
    ringBurst(btn);
    toast(data ? '¡Invitaciones enviadas!' : 'Ya estaban invitados', data ? `Les llegó un aviso a ${data} ${data === 1 ? 'parcero' : 'parceros'}.` : 'Esas personas ya tenían la invitación o ya están dentro.', { icon: 'i-bolt' });
  }

  /* ---------- Extras del chat: transporte, encuestas y álbum ---------- */
  async function cargarExtras(id) {
    const p = findP(id);
    if (!p || !isRemote(p)) return;
    const [vj, en, fo] = await Promise.all([
      sb.from('viajes').select('id, usuario_id, medio, puestos, desde, hora, viaje_pasajeros(usuario_id)').eq('parche_id', id).order('creado_en'),
      sb.from('encuestas').select('id, autor_id, pregunta, opciones, encuesta_votos(usuario_id, opcion)').eq('parche_id', id),
      sb.from('fotos_parche').select('id, usuario_id, url, creado_en').eq('parche_id', id).order('creado_en', { ascending: false }).limit(120),
    ]);
    const yo = u => u === me.id ? 'me' : u;
    if (!vj.error) p.viajes = (vj.data || []).map(v => ({ id: v.id, autor: yo(v.usuario_id), medio: v.medio, puestos: v.puestos, desde: v.desde, hora: v.hora, pasajeros: (v.viaje_pasajeros || []).map(x => yo(x.usuario_id)) }));
    if (!en.error) p.encuestas = Object.fromEntries((en.data || []).map(e => [e.id, { pregunta: e.pregunta, opciones: e.opciones, votos: Object.fromEntries((e.encuesta_votos || []).map(v => [yo(v.usuario_id), v.opcion])) }]));
    if (!fo.error) p.album = (fo.data || []).map(f => ({ id: f.id, autor: yo(f.usuario_id), url: f.url }));
    await cachePeople([].concat((vj.data || []).map(v => v.usuario_id), (fo.data || []).map(f => f.usuario_id)));
    if (state.chatId === id) renderChat();
  }

  // Transporte compartido
  const MEDIOS = { carro: 'Carro', moto: 'Moto', taxi: 'Taxi compartido' };
  function transporteHTML(p) {
    const vs = p.viajes || [];
    const libres = vs.reduce((a, v) => a + Math.max(0, v.puestos - v.pasajeros.length), 0);
    const mio = vs.find(v => v.autor === 'me');
    return `<details class="vaca transporte" ${state.abiertoTransporte ? 'open' : ''} data-panel="transporte">
      <summary>${ic('i-users')} Transporte ${vs.length ? `<span class="tnum">${libres} ${libres === 1 ? 'puesto' : 'puestos'}</span>` : ''} ${ic('i-chev-down')}</summary>
      <div class="vaca-body tr-body">
        ${vs.length ? `<ul class="tr-list">${vs.map(v => {
          const quedan = v.puestos - v.pasajeros.length, voy = v.pasajeros.includes('me');
          return `<li class="tr-item">
            ${avHTML(v.autor, 'av--sm')}
            <span><b>${esc(v.autor === 'me' ? 'Tú' : personById(v.autor)?.nombre || 'Parcero')} · ${esc(MEDIOS[v.medio] || v.medio)}</b><small>Sale de ${esc(v.desde)}${v.hora ? ` a las ${esc(horaTxt(v.hora))}` : ''} · ${quedan > 0 ? `${quedan} ${quedan === 1 ? 'puesto libre' : 'puestos libres'}` : 'Lleno'}</small></span>
            ${v.autor === 'me' ? `<button type="button" class="btn btn--ghost btn--xs" data-action="viaje-borrar" data-id="${v.id}">Quitar</button>`
              : voy ? `<button type="button" class="btn btn--ghost btn--xs" data-action="viaje-bajar" data-id="${v.id}">Bajarme</button>`
              : `<button type="button" class="btn btn--xs" data-action="viaje-subir" data-id="${v.id}" ${quedan > 0 ? '' : 'disabled'}>Me voy contigo</button>`}
          </li>`;
        }).join('')}</ul>` : '<p class="tr-vacio">Nadie ha ofrecido puestos todavía. Si tienes carro o moto, ofrece y llegan juntos.</p>'}
        ${mio ? '' : `<form class="tr-form" id="tr-form" autocomplete="off">
          <select class="input" name="medio" aria-label="Medio">${Object.entries(MEDIOS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <input class="input tnum" name="puestos" type="number" min="1" max="6" value="3" aria-label="Puestos libres">
          <input class="input" name="desde" maxlength="60" placeholder="Salgo de... (barrio o punto)" aria-label="De dónde sales" required>
          <input class="input" name="hora" type="time" aria-label="Hora de salida (opcional)">
          <button class="btn btn--ink btn--xs" type="submit">${ic('i-plus')} Ofrecer puestos</button>
        </form>`}
      </div>
    </details>`;
  }
  async function ofrecerViaje(form) {
    const p = state.chatId && findP(state.chatId);
    if (!p) return;
    const f = new FormData(form);
    const v = { medio: f.get('medio'), puestos: clamp(Number(f.get('puestos')) || 1, 1, 6), desde: String(f.get('desde') || '').trim().slice(0, 60), hora: f.get('hora') || null };
    if (v.desde.length < 2) { toast('Falta de dónde sales', 'Escribe el barrio o el punto de salida.', { type: 'error' }); return; }
    if (isRemote(p)) {
      const { error } = await sb.from('viajes').insert({ parche_id: p.id, ...v });
      if (error) { toast('No se publicó el viaje', /viajes/.test(error.message) ? 'Falta activar esta función en la base de datos.' : dbMsg(error), { type: 'error' }); return; }
      await cargarExtras(p.id);
    } else { p.viajes = (p.viajes || []).concat({ id: 'v' + Date.now(), autor: 'me', pasajeros: [], ...v }); save(); renderChat(); }
    toast('Ofreciste puestos', 'Quien necesite llegar se puede ir contigo.', { icon: 'i-users' });
  }
  async function accionViaje(tipo, vid) {
    const p = state.chatId && findP(state.chatId);
    const v = p && (p.viajes || []).find(x => String(x.id) === String(vid));
    if (!v) return;
    if (!isRemote(p)) {
      if (tipo === 'subir') v.pasajeros.push('me'); else if (tipo === 'bajar') v.pasajeros = v.pasajeros.filter(x => x !== 'me'); else p.viajes = p.viajes.filter(x => x !== v);
      save(); renderChat(); return;
    }
    const res = tipo === 'subir' ? await sb.from('viaje_pasajeros').insert({ viaje_id: v.id })
      : tipo === 'bajar' ? await sb.from('viaje_pasajeros').delete().eq('viaje_id', v.id).eq('usuario_id', me.id)
      : await sb.from('viajes').delete().eq('id', v.id);
    if (res.error) { toast('No se pudo', /SIN_PUESTOS/.test(res.error.message + res.error.hint) ? 'Ya no quedan puestos en ese viaje.' : dbMsg(res.error), { type: 'error' }); }
    await cargarExtras(p.id);
  }

  // Encuestas
  function encuestaHTML(m) {
    const p = state.chatId && findP(state.chatId);
    const e = p && p.encuestas && p.encuestas[m.encuestaId];
    if (!e) return `<div class="msg msg--sys"><div class="bubble">${ic('i-chart')} Encuesta: ${esc(m.texto)}</div></div>`;
    const votos = Object.values(e.votos), total = votos.length, mio = e.votos.me;
    return `<div class="msg msg--poll"><div class="poll">
      <small>${ic('i-chart')} Encuesta de ${esc(m.autor === 'me' ? 'ti' : personById(m.autor)?.nombre || 'un parcero')}</small>
      <b class="poll-q">${esc(e.pregunta)}</b>
      <div class="poll-ops" role="group" aria-label="${esc(e.pregunta)}">${e.opciones.map((o, i) => {
        const n = votos.filter(v => v === i).length, pct = total ? Math.round(n / total * 100) : 0;
        return `<button type="button" class="poll-op ${mio === i ? 'is-mine' : ''}" data-voto="${i}" data-enc="${m.encuestaId}" aria-pressed="${mio === i}">
          <span class="poll-bar" style="--p:${pct}%"></span><span class="poll-t">${esc(o)}</span><span class="poll-n tnum">${pct}%</span></button>`;
      }).join('')}</div>
      <small class="poll-total tnum">${total} ${total === 1 ? 'voto' : 'votos'}${mio != null ? ' · toca otra opción para cambiar' : ''}</small>
    </div></div>`;
  }
  async function votar(encId, opcion) {
    const p = state.chatId && findP(state.chatId);
    const e = p && p.encuestas && p.encuestas[encId];
    if (!e) return;
    const antes = e.votos.me;
    if (antes === opcion) delete e.votos.me; else e.votos.me = opcion;
    renderChatMsgs();
    buzz(5);
    if (!isRemote(p)) { save(); return; }
    const res = antes === opcion
      ? await sb.from('encuesta_votos').delete().eq('encuesta_id', encId).eq('usuario_id', me.id)
      : await sb.from('encuesta_votos').upsert({ encuesta_id: Number(encId), opcion }, { onConflict: 'encuesta_id,usuario_id' });
    if (res.error) { if (antes == null) delete e.votos.me; else e.votos.me = antes; renderChatMsgs(); toast('No se guardó tu voto', dbMsg(res.error), { type: 'error' }); }
  }
  function abrirEncuesta() {
    $('#form-encuesta').reset();
    $('#enc-msg').textContent = '';
    $$('#enc-ops .enc-op').forEach((el, i) => { el.hidden = i > 1; });
    openModal('modal-encuesta');
  }
  async function crearEncuesta(e) {
    e.preventDefault();
    const p = state.chatId && findP(state.chatId);
    if (!p) return;
    const pregunta = $('#enc-q').value.trim();
    const ops = $$('#enc-ops .enc-op:not([hidden]) input').map(i => i.value.trim()).filter(Boolean);
    if (pregunta.length < 3) { $('#enc-msg').textContent = 'Escribe la pregunta.'; return; }
    if (ops.length < 2) { $('#enc-msg').textContent = 'Pon al menos 2 opciones.'; return; }
    const btn = $('#enc-send'); btn.classList.add('is-loading');
    if (isRemote(p)) {
      const { data, error } = await sb.rpc('crear_encuesta', { p_parche: p.id, p_pregunta: pregunta, p_opciones: ops });
      btn.classList.remove('is-loading');
      if (error) { $('#enc-msg').textContent = /DEMASIADAS/.test(error.message) ? 'Máximo 3 encuestas por hora.' : /crear_encuesta|PGRST202/.test(error.message) ? 'Falta activar esta función en la base de datos.' : dbMsg(error); return; }
      p.encuestas = p.encuestas || {};
      p.encuestas[data] = { pregunta, opciones: ops, votos: {} };
      if (!p.chat.some(m => m.encuestaId === data)) p.chat.push({ tipo: 'encuesta', autor: 'me', texto: pregunta, ts: Date.now(), encuestaId: data });
    } else {
      btn.classList.remove('is-loading');
      const eid = 'e' + Date.now();
      p.encuestas = p.encuestas || {};
      p.encuestas[eid] = { pregunta, opciones: ops, votos: {} };
      p.chat.push({ tipo: 'encuesta', autor: 'me', texto: pregunta, ts: Date.now(), encuestaId: eid });
      save();
    }
    closeModal('modal-encuesta');
    renderChatMsgs();
  }

  // Álbum del parche
  function abrirAlbum() {
    const p = state.chatId && findP(state.chatId);
    if (!p) return;
    renderAlbum();
    openModal('modal-album');
  }
  function renderAlbum() {
    const p = state.chatId && findP(state.chatId);
    if (!p) return;
    const fotos = p.album || [];
    $('#album-title').textContent = p.titulo;
    $('#album-grid').innerHTML = fotos.length ? fotos.map((f, i) => `<figure class="album-ph" style="--d:${Math.min(i, 12) * 40}ms">
        <button type="button" class="album-open" data-action="album-ver" data-id="${esc(String(f.id))}" aria-label="Ver foto ${i + 1}"><img src="${esc(f.url)}" alt="" loading="lazy" decoding="async"></button>
        ${f.autor === 'me' ? `<button type="button" class="album-del" data-action="album-borrar" data-id="${esc(String(f.id))}" aria-label="Borrar mi foto">${ic('i-trash')}</button>` : ''}
      </figure>`).join('')
      : `<div class="album-vacio">${emptyHTML({ art: 'aventura-camara', title: 'El álbum está vacío', text: 'Suban las fotos del parche: quedan de recuerdo para todos los que fueron.', cta: '' })}</div>`;
  }
  async function subirAlbum(files) {
    const p = state.chatId && findP(state.chatId);
    if (!p || !files || !files.length) return;
    const lista = [...files].filter(f => /^image\//.test(f.type)).slice(0, 10);
    $('#album-add').classList.add('is-loading');
    let ok = 0;
    for (const file of lista) {
      try {
        const data = await comprimirFoto(file);
        if (isRemote(p)) {
          const url = await uploadFoto(data, 'album');
          const { data: row, error } = await sb.from('fotos_parche').insert({ parche_id: p.id, url }).select('id').single();
          if (error) throw error;
          p.album = [{ id: row.id, autor: 'me', url }].concat(p.album || []);
        } else p.album = [{ id: 'f' + Date.now() + ok, autor: 'me', url: data }].concat(p.album || []);
        ok++;
        renderAlbum();
      } catch (e) {
        toast('Una foto no se subió', /fotos_parche/.test(String(e && e.message)) ? 'Falta activar el álbum en la base de datos.' : dbMsg(e), { type: 'error' });
        break;
      }
    }
    $('#album-add').classList.remove('is-loading');
    if (ok) { toast(ok === 1 ? 'Foto agregada' : `${ok} fotos agregadas`, 'Ya las ven todos los del parche.', { icon: 'i-camera' }); if (state.chatId === p.id) renderChat(); }
  }
  async function borrarFotoAlbum(fid) {
    const p = state.chatId && findP(state.chatId);
    if (!p) return;
    const f = (p.album || []).find(x => String(x.id) === fid);
    if (!f) return;
    if (isRemote(p)) {
      const { error } = await sb.from('fotos_parche').delete().eq('id', f.id);
      if (error) { toast('No se borró', dbMsg(error), { type: 'error' }); return; }
    }
    p.album = p.album.filter(x => x !== f);
    renderAlbum(); renderChat();
  }
  function verFoto(fid) {
    const p = state.chatId && findP(state.chatId);
    const f = p && (p.album || []).find(x => String(x.id) === fid);
    if (!f) return;
    $('#foto-grande').src = f.url;
    openModal('modal-foto');
  }

  /* ---------- "Para ti": recomendaciones ---------- */
  const NOMBRE_CAT = { rumba: 'la rumba', comida: 'comer rico', chill: 'los planes chill', pueblear: 'pueblear', rio: 'el río', deportes: 'el deporte', conciertos: 'los conciertos', pet: 'salir con tu peludo', cultura: 'la cultura', gaming: 'el gaming' };
  function paraTi() {
    const gustos = new Set(perfil.intereses || []);
    const historial = {};
    state.parches.filter(p => inside(p) && p.inicio < Date.now()).forEach(p => { historial[p.categoria] = (historial[p.categoria] || 0) + 1; });
    const amigos = new Set((state.parceros || []).map(x => x.id));
    return activeList().filter(p => !p.oficial && !inside(p) && !isFull(p) && p.inicio > Date.now()).map(p => {
      let s = 0; const por = [];
      if (gustos.has(p.categoria)) { s += 3; por.push(`Te gusta ${NOMBRE_CAT[p.categoria] || catById(p.categoria).label.toLowerCase()}`); }
      if (historial[p.categoria]) { s += Math.min(3, historial[p.categoria]); if (!gustos.has(p.categoria)) por.push('Parecido a lo que haces'); }
      const va = p.confirmados.filter(id => amigos.has(id)).length;
      if (va) { s += 2.5 * va; por.push(va === 1 ? 'Va un parcero tuyo' : `Van ${va} parceros tuyos`); }
      if (userPos) { const km = distKm(p); if (km < 3) { s += 2; por.push(`A ${fmtKm(km)}`); } else if (km < 6) s += 1; }
      const d = daysFromToday(dayKey(p.inicio));
      if (d === 0) { s += 1.5; por.push('Es hoy'); } else if (d === 1) s += 1;
      if (precio(p) === 0) s += .5;
      return { p, s, por };
    }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 3);
  }
  function renderParaTi() {
    const slot = $('#parati-slot');
    if (!slot) return;
    const recs = state.search ? [] : paraTi();
    if (!recs.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<section class="block parati" aria-labelledby="t-parati">
      <div class="block-head"><div><h2 class="block-title" id="t-parati">Para ti</h2><p class="block-sub">Según tus gustos, tus parceros y lo cerca que está.</p></div></div>
      <div class="parati-row">${recs.map(({ p, por }, i) => `<article class="pt-card" style="--d:${i * 80}ms">
        <span class="pt-ic">${ic(catById(p.categoria).icon)}</span>
        <div class="pt-body"><b>${esc(p.titulo)}</b><small class="tnum">${esc(fmtCuando(p.inicio))} · ${esc(p.lugar)}</small>
          <div class="pt-por">${por.slice(0, 2).map(t => `<span>${esc(t)}</span>`).join('')}</div></div>
        <div class="pt-act">${joinButton(p)}</div>
      </article>`).join('')}</div>
    </section>`;
  }

  /* ---------- Modo oscuro: sistema, claro u oscuro ---------- */
  function aplicarTema(t, avisar = false) {
    const tema = ['claro', 'oscuro'].includes(t) ? t : 'sistema';
    try { localStorage.setItem('mp_tema', tema); } catch (e) { /* sin almacenamiento */ }
    marcarTema();
    if (avisar) toast(tema === 'oscuro' ? 'Modo oscuro' : tema === 'claro' ? 'Modo claro' : 'Igual que tu celular', '', { icon: 'i-check', ms: 1800 });
  }
  function marcarTema() {
    let t = 'sistema';
    try { t = localStorage.getItem('mp_tema') || 'sistema'; } catch (e) { /* nada */ }
    $$('[data-tema]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === t)));
    const oscuro = t === 'oscuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('is-dark', oscuro);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#121214' : '#FF5A1F');
  }

  /* ---------- App instalable (PWA) y avisos push ---------- */
  // Llave pública VAPID (la privada vive solo en los secretos de Supabase)
  const VAPID_PUBLIC = 'BJImaxL4PZ8Jxr9HoIOiAApsCke6NDbQBspCFXQilxh70y7uWqbcZr3ZlX6632T-isTqK4-78_R2wwUkHABfdUI';
  let installEvt = null, swReg = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const b64u = s => { const pad = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  async function pushActual() { try { return swReg && swReg.pushManager ? await swReg.pushManager.getSubscription() : null; } catch (e) { return null; } }
  function initApp() {
    const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if ('serviceWorker' in navigator && seguro) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(r => { swReg = r; renderApp(); }).catch(() => renderApp());
    }
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderApp(); });
    window.addEventListener('appinstalled', () => { installEvt = null; renderApp(); toast('¡ModoParche instalado!', 'Ya lo tienes en tu pantalla de inicio.', { icon: 'i-check' }); });
    $('#app-install')?.addEventListener('click', async () => {
      if (!installEvt) return;
      installEvt.prompt();
      try { await installEvt.userChoice; } catch (e) { /* cerró el aviso */ }
      installEvt = null; renderApp();
    });
    $('#p-push')?.addEventListener('change', e => togglePush(e.target.checked));
    renderApp();
  }
  async function renderApp() {
    const btn = $('#app-install'), sub = $('#app-install-sub'), pp = $('#p-push'), ps = $('#push-sub');
    if (!btn || !pp) return;
    if (standalone()) { btn.hidden = true; sub.textContent = 'Ya lo estás usando como app.'; }
    else if (installEvt) { btn.hidden = false; sub.textContent = 'Ábrelo como app desde tu pantalla de inicio, sin tienda y sin ocupar casi espacio.'; }
    else if (isIOS()) { btn.hidden = true; sub.textContent = 'En iPhone: toca Compartir y luego "Agregar a inicio".'; }
    else { btn.hidden = true; sub.textContent = 'Desde el menú del navegador: "Instalar app" o "Agregar a pantalla de inicio".'; }
    const soporta = 'PushManager' in window && 'Notification' in window && !!swReg;
    if (!soporta) {
      pp.disabled = true; pp.checked = false;
      ps.textContent = isIOS() && !standalone() ? 'En iPhone primero instala la app (Agregar a inicio) y luego activa los avisos aquí.' : 'Este navegador no permite avisos.';
      return;
    }
    if (DEMO) { pp.disabled = true; pp.checked = false; ps.textContent = 'Disponible cuando entras con tu cuenta.'; return; }
    const denegado = Notification.permission === 'denied';
    pp.disabled = denegado;
    pp.checked = !denegado && Notification.permission === 'granted' && !!(await pushActual());
    ps.textContent = denegado ? 'Bloqueaste los avisos. Actívalos en la configuración del navegador.'
      : 'Te avisamos cuando alguien se une, te escribe o cambia un parche, aunque la app esté cerrada.';
  }
  async function togglePush(on) {
    const pp = $('#p-push');
    pp.disabled = true;
    try {
      if (on) {
        if (await Notification.requestPermission() !== 'granted') throw new Error('PERMISO');
        const sub = (await pushActual()) || await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
        const j = sub.toJSON();
        const { error } = await sb.from('push_suscripciones').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint', ignoreDuplicates: true });
        if (error) { await sub.unsubscribe().catch(() => {}); throw error; }
        toast('Avisos activados', 'Te avisamos aunque ModoParche esté cerrado.', { icon: 'i-live' });
      } else {
        const sub = await pushActual();
        if (sub) { await sb.from('push_suscripciones').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe().catch(() => {}); }
        toast('Avisos desactivados', 'Ya no te llegan avisos en este dispositivo.', { icon: 'i-check' });
      }
    } catch (err) {
      toast('No se pudo cambiar', err && err.message === 'PERMISO' ? 'Permite las notificaciones en el navegador para activarlos.' : dbMsg(err), { type: 'error' });
    }
    pp.disabled = false;
    renderApp();
  }

  function initGestures() {
    initRipple();
    initPlaceRail();
    initHold();
    initPullToRefresh();
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      const item = t.closest('.mis-row .mis-item');
      if (item) { startReveal(e, item.closest('.mis-row')); return; }
      const msg = t.closest('#chat-msgs .msg[data-key]');
      if (msg && !t.closest('.msg-act, .msg-rep, .av')) startSwipeReply(e, msg);
    });
  }

  /* =====================================================================
     13. EVENTOS E INICIO
  ===================================================================== */
  function onClick(e) {
    const t = e.target;
    // Un arrastre (swipe) no cuenta como clic
    if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
    const hold = t.closest('[data-hold]');
    if (hold) { onHoldClick(e, hold); return; }
    // Tocar una fila abierta la cierra en vez de abrir el chat
    const openRow = t.closest('.mis-row.is-open');
    if (openRow && !t.closest('.mis-act')) { e.preventDefault(); e.stopPropagation(); closeReveal(openRow); return; }
    if (!t.closest('.mis-row')) closeReveal();
    const closer = t.closest('[data-close]');
    if (closer) { const m = closer.closest('.modal'); if (m) closeModal(m.id); return; }
    // Clic a la boletería oficial (no frena el enlace)
    const tk = t.closest('a.of-tk');
    if (tk) { const po = oficialActual(); if (po && isRemote(po)) sb.rpc('registrar_clic_boleta', { p_parche: po.id, p_tipo: tk.classList.contains('of-tk--palco') ? 'palco' : 'entrada' }).then(() => {}, () => {}); return; }
    const vt = t.closest('[data-voto]');
    if (vt) { votar(vt.dataset.enc, Number(vt.dataset.voto)); return; }
    const fb = t.closest('[data-filtro]');
    if (fb) { state.filtro = fb.dataset.filtro; renderCards(true); return; }
    const cf = t.closest('[data-chatf]');
    if (cf) { state.chatFiltro = cf.dataset.chatf; renderChat(); return; }
    const lc = t.closest('[data-loc]');
    if (lc) { setLocalidad(lc.dataset.loc); return; }
    const sb5 = t.closest('[data-star]');
    if (sb5) { marcarEstrellas(sb5); return; }
    const cv = t.closest('.cal-volver');
    if (cv) { cv.setAttribute('aria-pressed', String(cv.getAttribute('aria-pressed') !== 'true')); return; }
    const nav = t.closest('[data-nav]');
    if (nav) { closeAllModals(); $('#mis-wrap').classList.remove('is-chat'); go(nav.dataset.nav); return; }
    const tb = t.closest('[data-time]');
    if (tb) { state.time = tb.dataset.time; renderTimeSeg(); renderLiveMap(); return; }
    const mis = t.closest('[data-mis]');
    if (mis) { state.misTab = mis.dataset.mis; state.chatId = null; renderMis(); return; }
    const cp = t.closest('[data-cat-pick]');
    if (cp) { F('categoria').value = cp.dataset.catPick; F('categoria').dispatchEvent(new Event('change', { bubbles: true })); syncCreateUI(); return; }
    const qd = t.closest('[data-qdate]');
    if (qd) { F('fecha').value = qd.dataset.qdate; ['fecha', 'hora'].forEach(n => { touched.add(n); validate(n); }); syncCreateUI(); return; }
    const qp = t.closest('[data-qprice]');
    if (qp) { F('costo').value = qp.dataset.qprice; touched.add('costo'); validate('costo'); syncCreateUI(); return; }
    const stp = t.closest('[data-step]');
    if (stp) {
      const inp = F('cupos');
      inp.value = clamp((Number(inp.value) || 0) + Number(stp.dataset.step), 2, 60);
      touched.add('cupos'); validate('cupos'); syncCreateUI();
      if (!reduceMotion) { inp.classList.remove('bump'); void inp.offsetWidth; inp.classList.add('bump'); }
      return;
    }
    const place = t.closest('[data-place]');
    if (place) { choosePlace(place.dataset.place); return; }
    // Modo Mesa: personas, día y hora
    const ms = t.closest('[data-mesa-step]');
    if (ms && mesaState.promo) {
      const inp = $('#mesa-personas'), m = mesaState.promo;
      inp.value = clamp((Number(inp.value) || 0) + Number(ms.dataset.mesaStep), m.min_personas, m.max_personas);
      $('#mesa-error').textContent = '';
      syncMesa();
      return;
    }
    const md = t.closest('[data-mesa-dia]');
    if (md) { mesaState.dia = md.dataset.mesaDia; $('#mesa-dia-msg').innerHTML = ''; syncMesa(true); return; }
    const mh = t.closest('[data-mesa-hora]');
    if (mh) { $('#mesa-hora').value = mh.dataset.mesaHora; $('#mesa-hora-msg').innerHTML = ''; syncMesa(); return; }

    const a = t.closest('[data-action]');
    if (!a) return;
    const id = a.dataset.id;
    if (a.classList.contains('mis-act')) closeReveal();
    switch (a.dataset.action) {
      case 'crear': abrirCrear(); break;
      case 'crear-aqui': abrirCrear({ punto: { lat: a.dataset.lat, lng: a.dataset.lng, nombre: a.dataset.nombre } }); break;
      case 'verificar': pedirVerificacion('insignia'); break;
      case 'checkin-gps': checkinGps(id, a); break;
      case 'qr-mostrar': mostrarQR(id); break;
      case 'qr-escanear': abrirEscaner(id); break;
      case 'mesa-reservar': closeAllModals(); abrirMesa(id); break;
      case 'mesa-cancelar': cancelarMesa(id); break;
      case 'mesa-mapa': mesaEnMapa(id); break;
      case 'join': toggleJoin(id); break;
      case 'responder': setReply(a.dataset.key); break;
      case 'compartir': compartir(id); break;
      case 'seguridad': abrirSeguridad(id); break;
      case 'sos-enviar': enviarUbicacion(); break;
      case 'sos-vivo': toggleUbicacionViva(); break;
      case 'sos-link-copiar': copiarLinkUbicacion(); break;
      case 'sos-link-wa': waLinkUbicacion(); break;
      case 'sos-link-compartir': compartirLinkUbicacion(); break;
      case 'qr-mio': closeAllModals(); setTimeout(mostrarMiQR, 120); break;
      case 'qr-escanear-id': closeAllModals(); setTimeout(escanearIdentidad, 120); break;
      case 'qr-calificar': calificarPorQR(a); break;
      case 'consejo-ocultar': store.set('mp_consejo_oculto', todayKey()); renderConsejo(); break;
      case 'espera': toggleEspera(id); break;
      case 'invitar': abrirInvitar(id); break;
      case 'inv-send': enviarInvitaciones(); break;
      case 'encuesta': abrirEncuesta(); break;
      case 'enc-mas': { const h = $$('#enc-ops .enc-op[hidden]')[0]; if (h) { h.hidden = false; h.querySelector('input').focus(); } if (!$$('#enc-ops .enc-op[hidden]').length) a.hidden = true; break; }
      case 'album': abrirAlbum(); break;
      case 'album-ver': verFoto(id); break;
      case 'album-borrar': borrarFotoAlbum(id); break;
      case 'viaje-subir': accionViaje('subir', id); break;
      case 'viaje-bajar': accionViaje('bajar', id); break;
      case 'viaje-borrar': accionViaje('borrar', id); break;
      case 'tema': aplicarTema(a.dataset.tema, true); break;
      case 'wa': { const pp = findP(id); if (pp) window.open(waLink(pp), '_blank', 'noopener'); break; }
      case 'calificar': abrirCalificar(id); break;
      case 'cal-send': enviarCalificaciones(); break;
      case 'filtro-todos': state.filtro = 'todos'; renderCards(true); break;
      case 'foto-quitar': draft.foto = ''; syncCreateUI(); break;
      case 'reply-cancel': clearReply(); $('#chat-input')?.focus({ preventScroll: true }); break;
      case 'ir-msg': irAMensaje(a.dataset.key); break;
      case 'salir': askLeave(id); break;
      case 'editar': closeAllModals(); openCreate({ id }); break;
      case 'cancelar': askDelete(id); break;
      case 'ver-mapa': flyToParche(id); break;
      case 'chat': openChat(id); break;
      case 'chat-back': $('#mis-wrap').classList.remove('is-chat'); state.chatId = null; replyTo = null; renderMis(); break;
      case 'reportar': openReport(a.dataset.tipo, id); break;
      case 'go-inicio': go('inicio'); break;
      case 'logout': logout(); break;
      case 'mis-datos': descargarMisDatos(a); break;
      case 'borrar-cuenta': askBorrarCuenta(); break;
      case 'vaca-send': {
        const p = findP(state.chatId), total = Number($('#vaca-total').value) || 0;
        if (!p) break;
        if (total <= 0) { toast('Falta el total', 'Escribe cuánto gastó el grupo.', { type: 'error' }); break; }
        const n = Math.max(1, ocupados(p));
        sendChat(`La vaca: ${money(total)} entre ${n} = ${money(Math.ceil(total / n / 100) * 100)} cada uno.`);
        break;
      }
    }
  }

  function bind() {
    // En captura: los popups de Leaflet frenan la propagación del clic
    document.addEventListener('click', onClick, true);
    $('#report-form')?.addEventListener('submit', sendReport);
    $('#form-mesa')?.addEventListener('submit', submitMesa);
    $('#mesa-hora')?.addEventListener('input', () => syncMesa());
    $('#mesa-personas')?.addEventListener('input', () => { $('#mesa-error').textContent = ''; syncMesa(); });
    // Código del QR escrito a mano (si la cámara no abre)
    $('#scan-manual')?.addEventListener('submit', e => {
      e.preventDefault();
      const cod = $('#scan-code').value.replace(/\s/g, '').toLowerCase();
      if (!/^[0-9a-f]{10}$/.test(cod)) { const m = $('#scan-msg'); m.className = 'checkin-msg is-error'; m.innerHTML = `${ic('i-alert')} El código tiene 10 letras y números. Revísalo en la pantalla del organizador.`; return; }
      cerrarEscaner();
      enviarQR(escanerParche, cod);
    });
    $('#p-anuncios')?.addEventListener('change', e => cambiarAnuncios(e.target.checked));
    $('#form-encuesta')?.addEventListener('submit', crearEncuesta);
    $('#sos-contacto')?.addEventListener('submit', guardarContacto);
    $('#album-file')?.addEventListener('change', e => { subirAlbum(e.target.files); e.target.value = ''; });
    $('#c-foto')?.addEventListener('change', e => { elegirFotoParche(e.target.files && e.target.files[0]); e.target.value = ''; });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalStack.length) { closeModal(modalStack[modalStack.length - 1].id); return; }
      if (e.key === 'Escape' && replyTo && document.activeElement && document.activeElement.id === 'chat-input') clearReply();
    });

    initSearch();
    initGestures();

    $('#map-locate').addEventListener('click', () => startGeo({ fly: true }));

    const form = $('#form-create');
    form.addEventListener('submit', submitCreate);
    form.addEventListener('input', () => syncCreateUI());
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (n && touched.has(n)) validate(n);
      if (n === 'fecha' && touched.has('hora')) validate('hora');
      if (n === 'lugar') { selectPlaceChip(null); draft.autoLugar = false; }
    });
    form.addEventListener('focusout', e => { const n = e.target.name; if (n && RULES[n]) { touched.add(n); validate(n); } });
    form.addEventListener('change', e => { if (e.target.name === 'categoria' && createMarker) setCreatePin(draft.lat, draft.lng, true); });

    document.addEventListener('submit', e => {
      if (e.target.id === 'tr-form') { e.preventDefault(); ofrecerViaje(e.target); return; }
      if (e.target.id !== 'chat-form') return;
      e.preventDefault();
      const inp = $('#chat-input');
      sendChat(inp.value); inp.value = ''; inp.focus();
    });
    document.addEventListener('input', e => { if (e.target.id === 'vaca-total') updateVaca(); });

    // Sombra de la barra al bajar
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { $('#top').classList.toggle('is-scrolled', window.scrollY > 8); ticking = false; });
    }, { passive: true });

    setInterval(() => { if (state.view === 'inicio') { renderNext(); renderCards(); } }, 60 * 1000);
    window.addEventListener('resize', () => {
      liveMap && liveMap.invalidateSize();
      if (!isMobile()) $('#mis-wrap').classList.remove('is-chat');
      movePill($('#tabs'), true); movePill($('#time-seg'), true); movePill($('#mis-seg'), true);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill($('#tabs'), true));
  }

  async function init() {
    if (DEMO) { loadDemo(); await cargarMesas(); await cargarEspera(); }
    else if (!(await bootRemote())) return;

    $('#c-categoria').innerHTML = CATS.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    renderCatPicker();
    renderPlaceChips();
    bind();
    initPerfil();

    renderMeChip();
    renderNavCount();
    const hash = window.location.hash.replace('#', '');
    go(['inicio', 'mapa', 'mis', 'perfil'].includes(hash) ? hash : 'inicio');
    requestAnimationFrame(() => movePill($('#tabs'), true));
    hideBoot();
    startGeo();

    const qs = new URLSearchParams(window.location.search);
    let abrir = qs.get('parche');
    if (!abrir) { try { abrir = sessionStorage.getItem('mp_abrir'); sessionStorage.removeItem('mp_abrir'); } catch (e) { abrir = null; } }
    if (abrir && findP(abrir)) setTimeout(() => openChat(abrir), 400);
    if (qs.has('crear')) setTimeout(() => abrirCrear(), 500);
    initApp();
    consejoPeriodico();
    if (!DEMO && ubicacionViva.token) seguirUbicacion();
    marcarTema();
    // Si el celular cambia a oscuro (por la noche), seguimos el cambio
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', marcarTema); } catch (e) { /* navegador viejo */ }
    if (!DEMO) {
      subscribeRealtime();
    } else if (sb) {
      setTimeout(() => toast('Modo demo', 'Estás viendo parches de ejemplo guardados en este navegador.', { icon: 'i-info' }), 900);
    }
    // El mapa se precarga cuando el navegador está libre
    (window.requestIdleCallback || (f => setTimeout(f, 2500)))(() => loadLeaflet());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
