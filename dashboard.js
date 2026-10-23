/* =====================================================================
   Modo Parche · dashboard.js
   Panel del usuario en Vanilla JS (ES6+) + Leaflet + Supabase.

   1.  Utilidades
   2.  Catálogos: categorías, lugares reales de Villavicencio, gente
   3.  Avatar SVG (hombre / mujer)
   4.  Datos: modo demo y persistencia
   5.  Cálculos y filtros
   6.  Plantillas
   7.  Navegación y vistas
   8.  Mapas y GPS del usuario
   9.  Crear, editar, unirse y cancelar
   10. Mis parches + chat
   11. Perfil: avatar, foto y datos
   12. Toasts y modales
   13. Supabase: sesión, carga, tiempo real y escritura
   14. Eventos e inicio
===================================================================== */
(() => {
  'use strict';

  /* =====================================================================
     1. UTILIDADES
  ===================================================================== */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  const pad = n => String(n).padStart(2, '0');
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
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
  const todayAt = (h, m, fallback) => { const t = at(0, h, m); return t > Date.now() + 20 * MIN ? t : soon(fallback); };

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

  // Supabase: con sesión todo se lee y guarda allá. Modo demo (?demo=1 o sin conexión): en este navegador.
  const sb = window.mpSupabase || null;
  const DEMO = !sb || new URLSearchParams(window.location.search).has('demo');
  let me = null;
  const isRemote = p => !DEMO && p && !p.local;

  /* =====================================================================
     2. CATÁLOGOS
  ===================================================================== */
  const CENTER = [4.1420, -73.6266]; // Villavicencio
  const KEYS = { state: 'mp_dash_state_v3', perfil: 'mp_dash_perfil_v3' };

  const CATS = [
    { id: 'todos', label: 'Todos', icon: 'i-cat-todos' },
    { id: 'rumba', label: 'Rumba y Bares', icon: 'i-cat-rumba' },
    { id: 'comida', label: 'Comida y Antojos', icon: 'i-cat-comida' },
    { id: 'chill', label: 'Planes Chill', icon: 'i-cat-chill' },
    { id: 'pueblear', label: 'Pueblear y Miradores', icon: 'i-cat-pueblear' },
    { id: 'rio', label: 'Río y Naturaleza', icon: 'i-cat-rio' },
    { id: 'deportes', label: 'Deportes y Recocha', icon: 'i-cat-deportes' },
    { id: 'conciertos', label: 'Conciertos y Toques', icon: 'i-cat-conciertos' },
    { id: 'pet', label: 'Pet Friendly', icon: 'i-cat-pet' },
    { id: 'cultura', label: 'Cultura y Talleres', icon: 'i-cat-cultura' },
    { id: 'gaming', label: 'Gaming y Tecnología', icon: 'i-cat-gaming' },
  ];
  const catById = id => CATS.find(c => c.id === id) || CATS[0];

  // Coordenadas reales verificadas
  const LUGARES = [
    { id: 'capachos', nombre: 'Discoteca Los Capachos', ref: 'Km 4 Vía Acacías', lat: 4.1165, lng: -73.6508 },
    { id: 'primavera', nombre: 'C.C. Primavera Urbana', ref: 'Calle 15 # 40-01', lat: 4.1348, lng: -73.6206 },
    { id: 'fundadores', nombre: 'Parque Los Fundadores', ref: 'Entrada sur, Av. 40', lat: 4.1242, lng: -73.6395 },
    { id: 'piedra', nombre: 'Mirador La Piedra del Amor', ref: 'Buenavista, Vía Antigua a Bogotá', lat: 4.1585, lng: -73.6540 },
    { id: 'siete', nombre: 'Parque Siete de Agosto', ref: 'Barrio Siete de Agosto', lat: 4.1462, lng: -73.6335 },
    { id: 'viva', nombre: 'C.C. Viva Villavicencio', ref: 'Av. 40', lat: 4.1290, lng: -73.6225 },
    { id: 'hacha', nombre: 'Parque del Hacha', ref: 'Centro', lat: 4.1488, lng: -73.6382 },
    { id: 'carmen', nombre: 'Vereda El Carmen', ref: 'Inicio del sendero ecológico', lat: 4.1410, lng: -73.6615 },
  ];
  const lugar = id => LUGARES.find(l => l.id === id);

  const MUJERES = new Set(['Laura M.', 'Valen G.', 'Mafe P.', 'Caro V.', 'Sofi H.', 'Majo A.', 'Luisa D.', 'Isa N.', 'Dani T.']);
  const NOMBRES = ['Laura M.', 'Santi R.', 'Valen G.', 'Mafe P.', 'Juancho L.', 'Dani T.', 'Caro V.', 'Andrés F.', 'Nico B.', 'Sofi H.', 'Pipe C.', 'Majo A.', 'Kevin O.', 'Luisa D.', 'Tato Q.', 'Isa N.'];
  let PEOPLE = []; // se llena después de definir los avatares
  const peopleCache = new Map(); // perfiles reales por uuid
  const personById = id => PEOPLE.find(p => p.id === id) || peopleCache.get(id);

  const CHAT_LINES = {
    rumba: ['¿Alguien sabe si hay cover?', 'Yo llego tipo 9, guárdenme puesto', 'Que no falte el reguetón viejo'],
    comida: ['Yo voy con hambre de tres días', '¿Pagamos por aparte o hacemos vaca?', 'Dicen que la mamona ahí es brutal'],
    chill: ['Yo llevo cartas', '¿Llevo parlante?', 'Plan perfecto para bajar el estrés'],
    pueblear: ['¿Salimos juntos desde el centro?', 'Lleven chaqueta, arriba hace viento', 'El atardecer desde ahí es otra cosa'],
    rio: ['Lleven agua y bloqueador', '¿Hay que llevar botas?', 'Ojo con el barro después de la lluvia'],
    deportes: ['Yo tapo, tranquilos', '¿Alguien tiene balón número 5?', 'Lleven petos de dos colores'],
    conciertos: ['¿A qué hora abren puertas?', 'Me sé todo el repertorio', 'Nos vemos adelante'],
    pet: ['Mi perra es súper sociable', 'Lleven bolsitas', '¿Hay agua para los peludos?'],
    cultura: ['Nunca he hecho esto, voy a aprender', '¿Hay que llevar materiales?', 'Qué buen plan'],
    gaming: ['Llevo mi control', '¿Es por equipos o todos contra todos?', 'Hoy no me gana nadie'],
  };
  const REPLIES = ['De una', 'Hágale', 'Melo', 'Listo, nos vemos allá', 'Jajaja sí señor', 'Va pa esa', 'Confirmado'];

  /* =====================================================================
     3. AVATAR SVG (HOMBRE / MUJER)
  ===================================================================== */
  const AV = {
    piel: ['#f6d5b8', '#e8b48a', '#c98d5e', '#a56b3f', '#7a4a28', '#4e2e18'],
    peloColor: { negro: '#141414', castano: '#5b3a22', rubio: '#e0b75c', pelirrojo: '#b5482a', neon: '#FF5A1F' },
    ropaColor: { negro: '#111111', blanco: '#ffffff', naranja: '#FF5A1F', gris: '#9a9aa3' },
    fondo: { naranja: '#FF5A1F', negro: '#111111', blanco: '#ffffff', gris: '#e9e9ef' },
    pelo: { hombre: ['fade', 'afro', 'engominado', 'rapado', 'dreads'], mujer: ['largo', 'ondulado', 'mono', 'bob', 'capul'] },
    ojos: ['normal', 'felices', 'grandes', 'relajados', 'guino'],
    boca: ['sonrisa', 'risa', 'serio', 'picara', 'sorpresa'],
    ropa: ['oversize', 'hoodie', 'chaqueta', 'esqueleto', 'camisa'],
    gafas: ['ninguna', 'sol', 'urbanas'],
    gorra: ['ninguna', 'adelante', 'atras'],
    vello: ['ninguno', 'barba', 'bigote', 'candado'],
  };
  const AV_LBL = {
    fade: 'Fade urbano', afro: 'Crespo / Afro', engominado: 'Engominado', rapado: 'Rapado', dreads: 'Dreads cortos',
    largo: 'Largo liso', ondulado: 'Ondulado suelto', mono: 'Moño alto', bob: 'Corte bob', capul: 'Capul',
    normal: 'Normales', felices: 'Felices', grandes: 'Grandes', relajados: 'Relajados', guino: 'Guiño',
    sonrisa: 'Sonrisa', risa: 'Risa', serio: 'Serio urbano', picara: 'Pícara', sorpresa: 'Sorpresa',
    oversize: 'Camiseta oversize', hoodie: 'Hoodie con capucha', chaqueta: 'Chaqueta urbana', esqueleto: 'Esqueleto deportivo', camisa: 'Camisa abierta',
    sol: 'Gafas de sol cuadradas', urbanas: 'Gafas urbanas', adelante: 'Gorra adelante', atras: 'Gorra atrás',
    barba: 'Barba', bigote: 'Bigote', candado: 'Candado',
    negro: 'Negro', castano: 'Castaño', rubio: 'Rubio', pelirrojo: 'Pelirrojo', neon: 'Naranja neón',
    blanco: 'Blanco', naranja: 'Naranja', gris: 'Gris',
  };
  const AV_DEFAULT = {
    genero: 'hombre', piel: 2, pelo: 'fade', peloColor: 'negro', ojos: 'normal', boca: 'sonrisa',
    ropa: 'hoodie', ropaColor: 'naranja', gafas: 'ninguna', gorra: 'ninguna', aretes: false, vello: 'ninguno', fondo: 'gris',
  };

  // Acepta también la configuración del avatar anterior
  function normalizeAv(raw = {}) {
    const o = Object.assign({}, raw || {});
    if (o.pelo === 'gorra') { o.gorra = o.gorra || 'adelante'; o.pelo = 'fade'; }
    o.pelo = { corto: 'fade', trenzas: 'dreads' }[o.pelo] || o.pelo;
    o.gafas = { redondas: 'urbanas', visor: 'sol' }[o.gafas] || o.gafas;
    o.ropa = { camiseta: 'oversize' }[o.ropa] || o.ropa;
    if (!o.genero) o.genero = AV.pelo.mujer.includes(o.pelo) ? 'mujer' : 'hombre';
    const c = Object.assign({}, AV_DEFAULT, o);
    if (!['hombre', 'mujer'].includes(c.genero)) c.genero = 'hombre';
    const all = AV.pelo.hombre.concat(AV.pelo.mujer);
    if (!all.includes(c.pelo)) c.pelo = AV.pelo[c.genero][0];
    c.piel = clamp(Number.isInteger(+c.piel) ? +c.piel : 2, 0, 5);
    for (const k of ['ojos', 'boca', 'ropa', 'gafas', 'gorra', 'vello']) if (!AV[k].includes(c[k])) c[k] = AV_DEFAULT[k];
    if (!AV.peloColor[c.peloColor]) c.peloColor = 'negro';
    if (!AV.ropaColor[c.ropaColor]) c.ropaColor = 'naranja';
    if (!AV.fondo[c.fondo]) c.fondo = 'gris';
    if (c.genero === 'mujer') c.vello = 'ninguno';
    c.aretes = !!c.aretes;
    return c;
  }

  function avatarFor(name) {
    const h = hash(name), mujer = MUJERES.has(name);
    return normalizeAv({
      genero: mujer ? 'mujer' : 'hombre',
      piel: h % 6, pelo: AV.pelo[mujer ? 'mujer' : 'hombre'][(h >> 2) % 5],
      peloColor: ['negro', 'castano', 'negro', 'rubio', 'pelirrojo', 'castano'][(h >> 4) % 6],
      ojos: AV.ojos[(h >> 6) % 5], boca: AV.boca[(h >> 8) % 5],
      ropa: AV.ropa[(h >> 10) % 5], ropaColor: Object.keys(AV.ropaColor)[(h >> 12) % 4],
      gafas: AV.gafas[(h >> 14) % 5 > 2 ? 0 : (h >> 14) % 5], gorra: (h >> 16) % 4 === 0 ? 'adelante' : 'ninguna',
      aretes: mujer && (h >> 18) % 2 === 0, vello: mujer ? 'ninguno' : AV.vello[(h >> 19) % 4],
      fondo: Object.keys(AV.fondo)[(h >> 21) % 4],
    });
  }

  function avatarSVG(raw) {
    const c = normalizeAv(raw);
    const K = '#000', O = '#FF5A1F', W = '#fff';
    const S = AV.piel[c.piel], H = AV.peloColor[c.peloColor], C = AV.ropaColor[c.ropaColor], BG = AV.fondo[c.fondo];
    const mujer = c.genero === 'mujer';
    const det = C === '#111111' ? W : K;           // detalles sobre la ropa
    const acc = C === O ? K : O;                    // acento sobre la ropa
    const brow = c.peloColor === 'neon' ? K : c.peloColor === 'rubio' ? '#9c7a35' : H;
    const st = `stroke="${K}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
    const body = 'M10 106 C10 80 28 71 50 71 C72 71 90 80 90 106 Z';
    let s = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="100" height="100" fill="${BG}"/>`;
    if (c.fondo === 'negro') s += `<path d="M15 17l2 4 4.4.6-3.2 3 .8 4.4-4-2-4 2 .8-4.4-3.2-3 4.4-.6z" fill="${O}"/>`;
    if (c.fondo === 'naranja') s += `<path d="M10 64h8M12 72h7M82 64h8M81 72h7" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`;

    // Cabello trasero
    const back = {
      afro: `<circle cx="50" cy="37" r="27" fill="${H}"/><circle cx="28" cy="33" r="12" fill="${H}"/><circle cx="72" cy="33" r="12" fill="${H}"/><circle cx="35" cy="19" r="11" fill="${H}"/><circle cx="65" cy="19" r="11" fill="${H}"/>`,
      dreads: `<path d="M32 38 L28 60 M36 33 L34 62 M64 33 L66 62 M68 38 L72 60" stroke="${H}" stroke-width="5" stroke-linecap="round"/><circle cx="28" cy="60" r="2" fill="${O}"/><circle cx="72" cy="60" r="2" fill="${O}"/>`,
      largo: `<path d="M27 42 C25 15 75 15 73 42 L77 92 L23 92 Z" fill="${H}"/>`,
      ondulado: `<path d="M27 42 C25 15 75 15 73 42 C78 54 70 62 76 74 C80 84 70 90 64 86 L36 86 C30 90 20 84 24 74 C30 62 22 54 27 42Z" fill="${H}"/>`,
      mono: `<circle cx="50" cy="15" r="9.5" fill="${H}"/><path d="M42.5 22.5 Q50 26.5 57.5 22.5" fill="none" stroke="${O}" stroke-width="3" stroke-linecap="round"/>`,
      bob: `<path d="M25.5 44 C23 17 77 17 74.5 44 L76 64 Q66 69 60 63 L40 63 Q34 69 24 64 Z" fill="${H}"/>`,
      capul: `<path d="M27 42 C25 15 75 15 73 42 L75 82 L25 82 Z" fill="${H}"/>`,
    };
    s += back[c.pelo] || '';

    // Ropa streetwear
    const ropa = {
      oversize: `<path d="${body}" fill="${C}" ${st}/><path d="M40 72.5 Q50 81 60 72.5" fill="none" stroke="${det}" stroke-width="2.6" stroke-linecap="round"/><path d="M22 84 Q24 95 23 106 M78 84 Q76 95 77 106" fill="none" stroke="${det}" stroke-width="2" opacity=".55"/><path d="M50 86l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="${acc}" stroke="${K}" stroke-width="1.6" stroke-linejoin="round"/>`,
      hoodie: `<path d="${body}" fill="${C}" ${st}/><path d="M32 74 C36 89 64 89 68 74" fill="${C}" ${st}/><path d="M45 83 L44 95 M55 83 L56 95" stroke="${det}" stroke-width="2.4" stroke-linecap="round"/><path d="M36 106 V97 H64 V106" fill="none" stroke="${det}" stroke-width="2.4"/>`,
      chaqueta: `<path d="${body}" fill="${C}" ${st}/><path d="M50 78 V106" stroke="${acc}" stroke-width="3"/><path d="M39 71.5 L50 86 L45 71.5 Z M61 71.5 L50 86 L55 71.5 Z" fill="${W}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M25 93 h10 M65 93 h10" stroke="${det}" stroke-width="2.6" stroke-linecap="round"/>`,
      esqueleto: `<path d="${body}" fill="${S}" ${st}/><path d="M33 106 L35.5 79 Q50 88 64.5 79 L67 106 Z" fill="${C}" ${st}/><path d="M38 95 H62" stroke="${acc}" stroke-width="3.5"/>`,
      camisa: `<path d="${body}" fill="${C}" ${st}/><path d="M41 72 L50 92 L59 72 Z" fill="${S}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M39 71 L45 81 L50 74 M61 71 L55 81 L50 74" fill="none" stroke="${det}" stroke-width="2.4" stroke-linejoin="round"/><path d="M53 97h.01M54.5 103h.01" stroke="${det}" stroke-width="3.2" stroke-linecap="round"/>`,
    };
    s += ropa[c.ropa];

    // Cuello, orejas, aretes, cabeza
    s += `<path d="M43 58 L43 73 Q50 78 57 73 L57 58 Z" fill="${S}" ${st}/>`;
    s += `<ellipse cx="29.5" cy="48" rx="4.5" ry="6" fill="${S}" ${st}/><ellipse cx="70.5" cy="48" rx="4.5" ry="6" fill="${S}" ${st}/>`;
    if (c.aretes) {
      s += mujer
        ? `<circle cx="29.5" cy="57" r="3.2" fill="none" stroke="${O}" stroke-width="2.2"/><circle cx="70.5" cy="57" r="3.2" fill="none" stroke="${O}" stroke-width="2.2"/>`
        : `<circle cx="29.5" cy="54.5" r="1.8" fill="${O}" stroke="${K}" stroke-width="1"/><circle cx="70.5" cy="54.5" r="1.8" fill="${O}" stroke="${K}" stroke-width="1"/>`;
    }
    s += `<ellipse cx="50" cy="46" rx="${mujer ? 19.5 : 20.5}" ry="23" fill="${S}" ${st}/>`;

    // Barba (debajo de la boca)
    const barba = c.vello === 'barba';
    if (barba) s += `<path d="M29.8 47 C30 64 39 72.5 50 72.5 C61 72.5 70 64 70.2 47 C68 56 64 60.5 58.5 60.8 Q50 63.5 41.5 60.8 C36 60.5 32 56 29.8 47Z" fill="${H}"/>`;

    // Cejas
    s += mujer
      ? `<path d="M38 39.5 Q42 36.5 46 38.6 M54 38.6 Q58 36.5 62 39.5" fill="none" stroke="${brow}" stroke-width="2" stroke-linecap="round"/>`
      : `<path d="M37.5 39.8 L46 38.6 M54 38.6 L62.5 39.8" fill="none" stroke="${brow}" stroke-width="3.2" stroke-linecap="round"/>`;

    // Ojos
    const ojoNormal = x => `<ellipse cx="${x}" cy="47" rx="2.4" ry="3" fill="${K}"/><circle cx="${x + .8}" cy="46" r=".8" fill="${W}"/>`;
    const ojos = {
      normal: ojoNormal(42) + ojoNormal(58),
      felices: `<path d="M39 48.5 Q42 44.5 45 48.5 M55 48.5 Q58 44.5 61 48.5" fill="none" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`,
      grandes: `<circle cx="42" cy="47" r="3.8" fill="${W}" stroke="${K}" stroke-width="2"/><circle cx="42.6" cy="47.4" r="2" fill="${K}"/><circle cx="58" cy="47" r="3.8" fill="${W}" stroke="${K}" stroke-width="2"/><circle cx="58.6" cy="47.4" r="2" fill="${K}"/>`,
      relajados: `<path d="M39.2 46.6 Q42 50.4 44.8 46.6 Z M55.2 46.6 Q58 50.4 60.8 46.6 Z" fill="${K}"/><path d="M38.8 46.4 H45.2 M54.8 46.4 H61.2" stroke="${K}" stroke-width="2" stroke-linecap="round"/>`,
      guino: ojoNormal(42) + `<path d="M55 48 Q58 50.5 61 48" fill="none" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`,
    };
    s += ojos[c.ojos];
    if (mujer && c.ojos !== 'felices') s += `<path d="M39.4 45 l-1.9 -1.3 M60.6 45 l1.9 -1.3${c.ojos === 'guino' ? '' : ''}" stroke="${K}" stroke-width="1.6" stroke-linecap="round"/>`;

    // Nariz y mejillas
    s += `<path d="M50 49 Q48.4 53.5 51 53.9" fill="none" stroke="${K}" stroke-width="2" stroke-linecap="round"/>`;
    s += `<ellipse cx="37" cy="54.5" rx="3" ry="1.8" fill="${O}" opacity=".35"/><ellipse cx="63" cy="54.5" rx="3" ry="1.8" fill="${O}" opacity=".35"/>`;

    // Boca
    const lab = barba && c.peloColor !== 'rubio' ? W : (mujer ? '#a8321b' : K);
    const boca = {
      sonrisa: `<path d="M43.5 58 Q50 63.5 56.5 58" fill="none" stroke="${lab}" stroke-width="2.6" stroke-linecap="round"/>`,
      risa: `<path d="M42.5 57 Q50 67.5 57.5 57 Z" fill="${K}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M44.6 57.8 H55.4" stroke="${W}" stroke-width="2.2"/><path d="M46.5 62.3 Q50 60 53.5 62.3 Q50 64.8 46.5 62.3Z" fill="${O}"/>`,
      serio: `<path d="M45 59.5 H55" stroke="${lab}" stroke-width="2.8" stroke-linecap="round"/>`,
      picara: `<path d="M44 60 Q51 62 57 57" fill="none" stroke="${lab}" stroke-width="2.6" stroke-linecap="round"/>`,
      sorpresa: `<ellipse cx="50" cy="60" rx="2.6" ry="3.2" fill="${K}"/>`,
    };
    s += boca[c.boca];

    // Bigote y candado
    const bigote = `<path d="M42 56 Q46 53.4 50 55.4 Q54 53.4 58 56 Q54 58 50 56.9 Q46 58 42 56Z" fill="${H}"/>`;
    if (c.vello === 'bigote' || barba) s += bigote;
    if (c.vello === 'candado') s += bigote + `<path d="M45.5 64 Q50 67 54.5 64 L54.5 69 Q50 71 45.5 69Z" fill="${H}"/>`;

    // Cabello frontal (la gorra lo tapa)
    const front = {
      fade: `<path d="M30 42 C29 26 40 20 50 20.5 C61 20 71 26 70 42 C67 34 60 31 50 31.5 C41 31 33 34 30 42Z" fill="${H}"/><path d="M29.7 42 L29.9 48.5 M70.3 42 L70.1 48.5" stroke="${H}" stroke-width="2.5" opacity=".45"/>`,
      afro: `<path d="M30.5 41 C30 27 70 27 69.5 41 C63 33 37 33 30.5 41Z" fill="${H}"/>`,
      engominado: `<path d="M30 43 C28 24 42 17 54 19 C66 21 72 30 70 43 C66 31 56 27 46 29 C38 31 33 36 30 43Z" fill="${H}"/><path d="M43 23.5 Q54 21 62 26.5" fill="none" stroke="${W}" stroke-width="2" opacity=".5" stroke-linecap="round"/>`,
      rapado: `<path d="M30.5 41 C30 23 70 23 69.5 41 C64 32 36 32 30.5 41Z" fill="${H}" opacity=".38"/>`,
      dreads: `<path d="M30 42 C29 26 40 20 50 20.5 C61 20 71 26 70 42 C67 34 60 31 50 31.5 C41 31 33 34 30 42Z" fill="${H}"/><path d="M34 29 l-2 11 M40 25.5 l-1 11 M46 23.5 v11 M54 23.5 v11 M60 25.5 l1 11 M66 29 l2 11" stroke="${H}" stroke-width="4.5" stroke-linecap="round"/>`,
      largo: `<path d="M29 45 C27 24 40 19 52 19.5 C63 20 72 27 71 45 C67 34 58 28 48 31 C40 34 33 38 29 45Z" fill="${H}"/>`,
      ondulado: `<path d="M29 45 C27 24 40 19 52 19.5 C63 20 72 27 71 45 C67 34 58 28 48 31 C40 34 33 38 29 45Z" fill="${H}"/>`,
      mono: `<path d="M29.5 43 C29 24 71 24 70.5 43 C65 32 35 32 29.5 43Z" fill="${H}"/>`,
      bob: `<path d="M28 45 C27 24 73 24 72 45 C66 37 34 37 28 45Z" fill="${H}"/>`,
      capul: `<path d="M28.5 44 C27.5 23 72.5 23 71.5 44 L71.5 40.5 Q50 37 28.5 40.5Z" fill="${H}"/>`,
    };
    if (c.gorra === 'ninguna') s += front[c.pelo];
    else {
      const gc = C === O ? K : O;
      s += `<path d="M28.5 41 C28 20 72 20 71.5 41 Z" fill="${gc}" ${st}/><circle cx="50" cy="22.5" r="2" fill="${K}"/>`;
      s += c.gorra === 'adelante'
        ? `<path d="M25 41 Q50 33 75 41 L76.5 46 Q50 38 23.5 46 Z" fill="${K}" stroke="${K}" stroke-width="1.5" stroke-linejoin="round"/><path d="M46 33 l3-5 h3 l-2 3 h3 l-4 5" fill="none" stroke="${K}" stroke-width="1.8" stroke-linejoin="round"/>`
        : `<path d="M29 40 Q50 34.5 71 40" fill="none" stroke="${K}" stroke-width="2.6"/><path d="M61 23 Q74 14 83 21 Q75 24 67 29 Z" fill="${K}"/>`;
    }

    // Gafas
    if (c.gafas === 'sol') s += `<g stroke="${K}" stroke-width="2.4" stroke-linejoin="round"><rect x="34" y="42.5" width="14" height="9" fill="${K}"/><rect x="52" y="42.5" width="14" height="9" fill="${K}"/><path d="M48 45h4M34 44.5l-5-1.2M66 44.5l5-1.2" fill="none"/></g><path d="M36.5 46l4-2M54.5 46l4-2" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`;
    if (c.gafas === 'urbanas') s += `<g fill="${W}" fill-opacity=".25" stroke="${K}" stroke-width="2.4"><circle cx="42" cy="47" r="6"/><circle cx="58" cy="47" r="6"/></g><path d="M48 46.5h4M36 45.5l-6-1.5M64 45.5l6-1.5" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/><path d="M37 42.2 Q42 40.4 47 42.2" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`;

    return s + '</svg>';
  }
  PEOPLE = NOMBRES.map((nombre, i) => ({ id: 'p' + (i + 1), nombre, av: avatarFor(nombre) }));

  /* =====================================================================
     4. DATOS: MODO DEMO Y PERSISTENCIA
  ===================================================================== */
  const PERFIL_DEF = {
    nombre: 'Camilo Rojas', primer: 'Camilo', tel: '3104567890', mail: 'camilo.rojas@gmail.com', ciudad: 'Villavicencio', cedula: '1121000456',
    mostrar_foto_real: false, foto_encuadre: { src: '', zoom: 1, x: 0, y: 0 },
    avatar_config: Object.assign({}, AV_DEFAULT),
  };
  let perfil = Object.assign({}, PERFIL_DEF, DEMO ? store.get(KEYS.perfil, {}) : {});
  const ME = () => {
    const [a, b] = String(perfil.nombre || 'Parcero').split(/\s+/);
    return { nombre: b ? `${a} ${b.charAt(0)}.` : a };
  };
  const ppl = (...n) => n.map(x => 'p' + x);

  function normalizeParche(p) {
    return Object.assign({
      confirmados: [], unido: false, propio: false, chat: [], checkin: false,
      creadorId: null, creadorNombre: '', barrio: '', descripcion: '', costo: 0, presupuesto: 0,
    }, p);
  }

  // Los mismos 8 parches de ejemplo que la base de datos, en los lugares reales
  function buildSeeds() {
    const L = id => { const l = lugar(id); return { lugar: l.nombre, barrio: l.ref, lat: l.lat, lng: l.lng }; };
    return [
      { id: 'd1', titulo: 'Hora feliz 2x1 en el C.C. Viva', categoria: 'rumba', ...L('viva'), inicio: soon(40), costo: 0, presupuesto: 25000, cuposMax: 20, confirmados: ppl(1, 4, 6, 9, 11, 13, 2, 7, 15, 16, 10), creadorNombre: 'Terraza C.C. Viva', descripcion: '2x1 en cócteles mientras dure la hora feliz. Terraza al aire libre y buena música.' },
      { id: 'd2', titulo: 'Micro en el Parque Siete de Agosto', categoria: 'deportes', ...L('siete'), inicio: soon(85), costo: 8000, presupuesto: 12000, cuposMax: 10, confirmados: ppl(2, 5, 8, 9, 11, 13, 14, 15), creadorId: 'p2', descripcion: 'Faltan poquitos para completar los dos equipos. Nivel recocha, nada de ponerse bravos.' },
      { id: 'd3', titulo: 'Rumba en Los Capachos', categoria: 'rumba', ...L('capachos'), inicio: todayAt(21, 30, 190), costo: 15000, presupuesto: 45000, cuposMax: 12, confirmados: ppl(1, 3, 4, 6, 7, 9, 10, 12, 13, 14, 16, 5), creadorId: 'p4', descripcion: 'Arrancamos con unas frías y cerramos bailando. Mesa reservada para el grupo.' },
      { id: 'd4', titulo: 'Cine y arcade en Primavera Urbana', categoria: 'gaming', ...L('primavera'), inicio: soon(130), costo: 0, presupuesto: 30000, cuposMax: 8, confirmados: ppl(8, 12, 16), creadorId: 'p8', descripcion: 'Película de estreno y después nos medimos en el arcade. Todo bajo techo.' },
      { id: 'd5', titulo: 'Ruta de antojos llaneros', categoria: 'comida', ...L('hacha'), inicio: todayAt(19, 30, 150), costo: 0, presupuesto: 35000, cuposMax: 8, confirmados: ppl(3, 6, 10, 14), creadorId: 'p14', descripcion: 'Pandeyuca, empanadas de pipián y cerramos con una mamona por el centro.' },
      { id: 'd6', titulo: 'Tarde de frisbee y picnic', categoria: 'chill', ...L('fundadores'), inicio: at(1, 16, 0), costo: 0, presupuesto: 10000, cuposMax: 10, confirmados: ppl(1, 2, 10, 12, 15), creadorId: 'me', propio: true, unido: true, descripcion: 'Cada uno lleva algo para compartir. Frisbee, cartas y parlante.' },
      { id: 'd7', titulo: 'Atardecer en la Piedra del Amor', categoria: 'pueblear', ...L('piedra'), inicio: at(2, 16, 30), costo: 0, presupuesto: 15000, cuposMax: 15, confirmados: ppl(3, 5, 7, 9, 11, 15, 16), creadorId: 'p3', unido: true, descripcion: 'Subimos al mirador de Buenavista a ver cómo se prende Villavo. Salimos en grupo.' },
      { id: 'd8', titulo: 'Caminata ecológica en la Vereda El Carmen', categoria: 'rio', ...L('carmen'), inicio: at(4, 7, 0), costo: 0, presupuesto: 0, cuposMax: 25, confirmados: ppl(1, 3, 4, 5, 6, 9, 10, 11, 12, 14, 15, 16), creadorId: 'p15', unido: true, descripcion: 'Sendero ecológico entre quebradas y monte llanero. Botas, agua y bloqueador.' },
    ].map(normalizeParche).map(p => {
      const lines = CHAT_LINES[p.categoria] || CHAT_LINES.chill;
      p.chat = [{ tipo: 'sys', texto: `${creatorName(p)} abrió el parche`, ts: Date.now() - 26 * HOUR }]
        .concat(p.confirmados.slice(0, 3).map((id, i) => ({ tipo: 'user', autor: id, texto: lines[i % lines.length], ts: Date.now() - (50 - i * 12) * MIN })));
      return p;
    });
  }

  const state = { parches: [], view: 'radar', cat: 'todos', search: '', time: { mode: 'hoy', date: null }, misTab: 'unido', chatId: null };

  function loadDemo() {
    const saved = store.get(KEYS.state, null);
    if (saved && saved.day === todayKey() && Array.isArray(saved.parches)) state.parches = saved.parches.map(normalizeParche);
    else {
      const mios = (saved && saved.parches || []).filter(p => p.creadoPorMi && p.inicio > Date.now() - 6 * HOUR).map(normalizeParche);
      state.parches = buildSeeds().concat(mios);
    }
  }
  function save() {
    if (!DEMO) return;
    store.set(KEYS.state, { day: todayKey(), parches: state.parches.map(p => { const c = Object.assign({}, p); delete c._drop; return c; }) });
  }
  const savePerfil = () => { if (DEMO && !store.set(KEYS.perfil, perfil)) toast('No se pudo guardar', 'La foto es muy pesada para este navegador.', { type: 'error' }); };

  /* =====================================================================
     5. CÁLCULOS Y FILTROS
  ===================================================================== */
  let userPos = null;      // [lat, lng] real del GPS
  let userAcc = null;
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
  const activeList = () => state.parches.filter(p => p.inicio > Date.now() - 90 * MIN);
  function creatorName(p) {
    if (p.creadorId === 'me') return ME().nombre;
    if (p.creadorId) return personById(p.creadorId)?.nombre || 'Parcero';
    return p.creadorNombre || 'Local aliado';
  }

  function matchesSearch(p) {
    if (!state.search) return true;
    const hay = norm([p.titulo, p.lugar, p.barrio].join(' '));
    return norm(state.search).split(/\s+/).every(w => hay.includes(w));
  }
  function timeMatch(p) {
    const k = dayKey(p.inicio), m = state.time.mode;
    if (m === 'todos') return true;
    if (m === 'hoy') return k === todayKey();
    if (m === 'manana') return k === offsetKey(1);
    return k === state.time.date;
  }
  function timeLabel() {
    const m = state.time.mode;
    if (m === 'todos') return 'en total';
    if (m === 'hoy') return 'hoy';
    if (m === 'manana') return 'mañana';
    const d = daysFromToday(state.time.date);
    return d >= 2 && d <= 6 ? 'el ' + weekdayLong(state.time.date) : 'el ' + shortDate(state.time.date);
  }
  function setTimeFor(ts) {
    const k = dayKey(ts), d = daysFromToday(k);
    state.time = d === 0 ? { mode: 'hoy', date: null } : d === 1 ? { mode: 'manana', date: null } : { mode: 'fecha', date: k };
  }

  /* =====================================================================
     6. PLANTILLAS
  ===================================================================== */
  function avHTML(who, cls = '') {
    if (who === 'me') {
      const f = perfil.foto_encuadre;
      if (perfil.mostrar_foto_real && f && f.src) return `<span class="av ${cls}"><span class="av-photo"><img src="${esc(f.src)}" alt="" style="transform:translate(${+f.x || 0}%, ${+f.y || 0}%) scale(${+f.zoom || 1})"></span></span>`;
      return `<span class="av ${cls}">${avatarSVG(perfil.avatar_config)}</span>`;
    }
    const person = typeof who === 'string' ? personById(who) : who;
    if (!person) return `<span class="av ${cls}">${avatarSVG(AV_DEFAULT)}</span>`;
    if (person.foto && person.foto.src) {
      const f = person.foto;
      return `<span class="av ${cls}" title="${esc(person.nombre)}"><span class="av-photo"><img src="${esc(f.src)}" alt="" style="transform:translate(${+f.x || 0}%, ${+f.y || 0}%) scale(${+f.zoom || 1})"></span></span>`;
    }
    return `<span class="av ${cls}" title="${esc(person.nombre)}">${avatarSVG(person.av)}</span>`;
  }

  const priceHTML = p => precio(p) === 0 ? '<span class="price is-free">Gratis</span>' : `<span class="price tnum">${money(precio(p))} COP</span>`;

  function cuposHTML(p) {
    const free = libres(p), full = isFull(p), hot = !full && free < 3;
    const extra = full ? ' · Lleno' : hot ? ` · ${free === 1 ? 'Último cupo' : `Últimos ${free}`}` : '';
    return `<li class="${hot ? 'is-hot' : ''}">${ic(hot ? 'i-flame' : 'i-users')}<span class="tnum"><b>${ocupados(p)}</b> / ${p.cuposMax} cupos${extra}</span></li>`;
  }

  function joinButton(p, { compact = false } = {}) {
    if (isMine(p)) return compact
      ? `<button class="btn btn--ghost" data-action="editar" data-id="${p.id}">${ic('i-edit')} Editar</button>`
      : `<button class="btn btn--ghost" data-action="editar" data-id="${p.id}">${ic('i-edit')} Editar parche</button>
         <button class="btn btn--alert" data-action="cancelar" data-id="${p.id}">${ic('i-trash')} Cancelar parche</button>`;
    if (p.unido) return `<button class="btn btn--alert" data-action="join" data-id="${p.id}">${compact ? 'Abrirse' : 'Abrirse del parche'}</button>`;
    if (isFull(p)) return `<button class="btn btn--ghost" disabled>Parche lleno</button>`;
    return `<button class="btn btn--primary" data-action="join" data-id="${p.id}">${ic('i-bolt')} ${compact ? 'Caerle' : 'Caerle al parche'}</button>`;
  }

  function cardHTML(p, delay = 0) {
    const cat = catById(p.categoria);
    return `<article class="parche-card" style="--d:${delay}ms">
      <div class="pc-top">
        <span class="pc-cat"><i>${ic(cat.icon)}</i>${esc(cat.label)}</span>
        ${priceHTML(p)}
      </div>
      <h3 class="pc-title">${esc(p.titulo)}</h3>
      <p class="pc-desc">${esc(p.descripcion)}</p>
      <ul class="pc-meta">
        <li>${ic('i-pin')}<span>${esc(p.lugar)}${p.barrio ? ' · ' + esc(p.barrio) : ''}</span><span class="muted tnum">${fmtKm(distKm(p))}</span></li>
        <li>${ic('i-clock')}<span class="tnum">${esc(fmtCuando(p.inicio))}</span></li>
        ${cuposHTML(p)}
      </ul>
      <div class="pc-foot">
        <span class="creator">${ic('i-crown')}<span>${esc(creatorName(p))}</span></span>
        <button class="link-btn" data-action="ver-mapa" data-id="${p.id}">${ic('i-pin')} Ver en el mapa</button>
      </div>
      <div class="pc-actions">${joinButton(p)}</div>
    </article>`;
  }

  const EMPTY_ART = `
    <svg class="empty-art" viewBox="0 0 220 180" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="110" cy="82" r="72" stroke="#FF5A1F" stroke-width="3" stroke-dasharray="7 11"/>
      <circle cx="110" cy="82" r="48" stroke="#000" stroke-width="2.5" stroke-dasharray="3 9" opacity=".5"/>
      <path d="M110 152s-38-33-38-62a38 38 0 0 1 76 0c0 29-38 62-38 62z" fill="#FF5A1F" stroke="#000" stroke-width="4"/>
      <circle cx="110" cy="88" r="18" fill="#fff" stroke="#000" stroke-width="4"/>
      <path d="M103.5 83a6.5 6.5 0 1 1 9.6 5.6c-2.1 1.2-3.1 2.4-3.1 4.6" stroke="#000" stroke-width="4"/>
      <circle cx="110" cy="99" r="1.2" fill="#000" stroke="#000" stroke-width="3"/>
      <path d="M38 36l3.2 6.6 7.2 1-5.2 5 1.2 7.2L38 52.4l-6.4 3.4 1.2-7.2-5.2-5 7.2-1z" fill="#000"/>
      <path d="M184 26l-9 15h9l-7 13" stroke="#000" stroke-width="4"/>
    </svg>`;
  const emptyHTML = ({ title, text, cta = 'Abrir el parche', action = 'crear', fecha = '' }) => `<div class="empty">${EMPTY_ART}<h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn btn--primary" data-action="${action}" ${fecha ? `data-fecha="${fecha}"` : ''}>${ic('i-plus')} ${esc(cta)}</button></div>`;

  function popupHTML(p) {
    const cat = catById(p.categoria);
    return `<div class="pop">
      <span class="pc-cat"><i>${ic(cat.icon)}</i>${esc(cat.label)}</span>
      <h3 class="pop-title">${esc(p.titulo)}</h3>
      <ul class="pc-meta">
        <li>${ic('i-clock')}<span class="tnum">${esc(fmtCuando(p.inicio))}</span></li>
        <li>${ic('i-pin')}<span>${esc(p.lugar)}</span><span class="muted tnum">${fmtKm(distKm(p))}</span></li>
        ${cuposHTML(p)}
        <li>${ic('i-tag')}<span class="tnum">${precio(p) ? money(precio(p)) + ' COP' : 'Gratis'}</span></li>
      </ul>
      <div class="pop-actions">
        ${joinButton(p, { compact: true })}
        ${inside(p) ? `<button class="btn btn--ink" data-action="chat" data-id="${p.id}">${ic('i-chat')} Chat</button>` : `<button class="btn btn--ghost" data-action="cerrar-popup">Cerrar</button>`}
      </div>
    </div>`;
  }

  /* =====================================================================
     7. NAVEGACIÓN Y VISTAS
  ===================================================================== */
  function go(view) {
    if (!$('#view-' + view)) return;
    state.view = view;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + view));
    $$('.nav-item, .bn-item').forEach(b => {
      const on = b.dataset.nav === view;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0 });
    if (view === 'radar') renderRadar(true);
    if (view === 'mapa') setTimeout(() => { initLiveMap(); liveMap && liveMap.invalidateSize(); renderLiveMap(); }, 40);
    if (view === 'mis') renderMis();
    if (view === 'perfil') renderPerfil();
  }

  function renderRadar(animate = false) {
    $('#hello-name').textContent = perfil.primer || 'parcero';
    const base = activeList().filter(matchesSearch);
    $('#cat-bar').innerHTML = CATS.map(c => {
      const n = c.id === 'todos' ? base.length : base.filter(p => p.categoria === c.id).length;
      return `<button class="chip ${state.cat === c.id ? 'is-active' : ''}" data-cat="${c.id}" aria-pressed="${state.cat === c.id}">${ic(c.icon)} ${esc(c.label)} <small>${n}</small></button>`;
    }).join('');
    const list = base.filter(p => state.cat === 'todos' || p.categoria === state.cat).sort((a, b) => a.inicio - b.inicio);
    $('#radar-count').innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'parche abierto' : 'parches abiertos'}${state.cat !== 'todos' ? ' en ' + esc(catById(state.cat).label) : ''}${state.search ? ` para "${esc(state.search)}"` : ''}`;
    $('#radar-sub').textContent = userPos ? 'Distancias calculadas desde tu ubicación en vivo.' : 'Planes abiertos en Villavicencio. Escoge uno y cáele, o abre el tuyo.';
    const grid = $('#radar-grid');
    grid.classList.toggle('is-static', !animate);
    grid.innerHTML = list.length
      ? list.map((p, i) => cardHTML(p, animate ? Math.min(i, 8) * 45 : 0)).join('')
      : emptyHTML(state.search
        ? { title: `Nada para "${state.search}"`, text: 'Prueba con otro nombre o lugar de Villavicencio.' }
        : { title: 'Nadie ha armado parche por aquí', text: 'Sé quien arranca: abre tu plan y la gente se suma.' });
  }

  function renderSideUser() {
    $('#side-user').innerHTML = `${avHTML('me')}<span><b>${esc(ME().nombre)}</b><small>${esc(perfil.ciudad)} · Ver mi perfil</small></span>`;
    $('#mini-profile').innerHTML = `${avHTML('me')}<span>${esc(perfil.primer || 'Yo')}</span>`;
  }
  function renderNavCount() {
    const n = state.parches.filter(p => inside(p) && !isPast(p)).length;
    const el = $('#nav-count-mis');
    el.hidden = !n; el.textContent = n;
  }

  // Repinta lo que depende de los datos
  function refresh() {
    if (state.view === 'radar') renderRadar();
    if (state.view === 'mapa') renderLiveMap();
    if (state.view === 'mis') renderMis();
    renderNavCount();
  }

  /* =====================================================================
     8. MAPAS Y GPS DEL USUARIO
  ===================================================================== */
  let liveMap = null, createMap = null, createMarker = null, meMarker = null, meCircle = null, createMe = null;
  const liveMarkers = new Map();
  // Tiles claros y legibles de OpenStreetMap, sin filtros oscuros.
  // (CartoDB Voyager ya exige API key y muestra una marca de agua.)
  const tiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

  const pinIcon = p => L.divIcon({
    className: 'pin-icon',
    html: `<div class="pin ${isMine(p) ? 'pin--own' : ''} ${isFull(p) ? 'pin--full' : ''} ${p._drop ? 'pin--drop' : ''}" title="${esc(p.titulo)}">${ic(catById(p.categoria).icon)}</div>`,
    iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -22],
  });
  const meIcon = () => L.divIcon({ className: 'me-icon', html: '<div class="me-dot"><span class="me-label">Tú estás aquí</span></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

  function initLiveMap() {
    if (liveMap || typeof L === 'undefined') return;
    liveMap = L.map('live-map', { zoomControl: false }).setView(CENTER, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(liveMap);
    tiles().addTo(liveMap);
    if (userPos) updateUserMarker();
  }

  function renderLiveMap() {
    renderTimeBar();
    const list = activeList().filter(matchesSearch).filter(timeMatch);
    if (liveMap) {
      const ids = new Set(list.map(p => p.id));
      liveMarkers.forEach((m, id) => { if (!ids.has(id)) { liveMap.removeLayer(m); liveMarkers.delete(id); } });
      list.forEach(p => {
        let m = liveMarkers.get(p.id);
        if (!m) {
          m = L.marker([p.lat, p.lng], { icon: pinIcon(p), riseOnHover: true });
          m.bindPopup(() => popupHTML(findP(p.id) || p), { className: 'mp-popup', minWidth: 240, maxWidth: 280, autoPanPadding: [30, 90] });
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
    $('#map-counter').innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'parche activo' : 'parches activos'} ${timeLabel()}`;
    const empty = $('#map-empty');
    if (!list.length) {
      const fecha = state.time.mode === 'hoy' ? todayKey() : state.time.mode === 'manana' ? offsetKey(1) : state.time.mode === 'fecha' ? state.time.date : '';
      empty.hidden = false;
      empty.innerHTML = emptyHTML({ title: `Nadie ha abierto parche ${state.time.mode === 'todos' ? 'todavía' : timeLabel()}`, text: 'Ese día está libre. Arma el plan y deja que la gente se sume.', cta: 'Ser el primero', fecha });
    } else empty.hidden = true;
  }

  function buildTimeControls() {
    const opts = ['<option value="">Elegir día</option>'];
    for (let i = 2; i <= 13; i++) { const k = offsetKey(i); opts.push(`<option value="${k}">${cap(weekdayLong(k))} ${shortDate(k)}</option>`); }
    opts.push('<option value="__fecha">Fecha exacta...</option>');
    $('#time-select').innerHTML = opts.join('');
    $('#time-date').min = todayKey();
  }
  function renderTimeBar() {
    const m = state.time.mode;
    $$('#time-bar .time-btn').forEach(b => b.classList.toggle('is-active', b.dataset.time === m));
    const sel = $('#time-select');
    const inSelect = m === 'fecha' && [...sel.options].some(o => o.value === state.time.date);
    sel.value = inSelect ? state.time.date : (m === 'fecha' ? '__fecha' : '');
    $('#time-select-wrap').classList.toggle('is-active', m === 'fecha');
    const showDate = m === 'fecha' && !inSelect;
    $('#time-date-wrap').hidden = !showDate && sel.value !== '__fecha';
    if (showDate) $('#time-date').value = state.time.date;
  }

  function flyToParche(id) {
    const p = findP(id);
    if (!p) return;
    closeAllModals();
    if (!timeMatch(p)) setTimeFor(p.inicio);
    if (state.search && !matchesSearch(p)) { state.search = ''; $('#search-input').value = ''; $('#search-clear').hidden = true; }
    const wasMap = state.view === 'mapa';
    if (!wasMap) go('mapa');
    setTimeout(() => {
      initLiveMap();
      if (!liveMap) return;
      liveMap.invalidateSize();
      renderLiveMap();
      const m = liveMarkers.get(id);
      if (reduceMotion) { liveMap.setView([p.lat, p.lng], 16); m && m.openPopup(); }
      else { liveMap.flyTo([p.lat, p.lng], 16, { duration: 1.6 }); if (m) liveMap.once('moveend', () => m.openPopup()); }
    }, wasMap ? 60 : 140);
  }

  /* ---------- GPS en tiempo real ---------- */
  let watchId = null, flyOnFix = false;
  function setGeoStatus(html) { $('#geo-status').innerHTML = html; }
  function startGeo({ fly = false } = {}) {
    if (!('geolocation' in navigator)) {
      setGeoStatus(`${ic('i-alert')} Tu navegador no comparte ubicación. Usamos el centro de Villavicencio.`);
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
    if (moved) { if (state.view === 'radar') renderRadar(); if (state.view === 'mapa') renderLiveMap(); }
  }
  function onGeoErr(err) {
    const msg = err && err.code === 1 ? 'No diste permiso de ubicación.' : 'No pudimos leer tu ubicación.';
    setGeoStatus(`${ic('i-alert')} ${msg} Distancias desde el centro de Villavicencio.`);
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
    setTimeout(() => {
      initLiveMap();
      if (!liveMap || !userPos) return;
      liveMap.invalidateSize();
      updateUserMarker();
      liveMap.flyTo(userPos, 15, { duration: reduceMotion ? 0 : 1.2 });
    }, 120);
  }

  /* ---------- Mini mapa del formulario ---------- */
  function initCreateMap() {
    if (typeof L === 'undefined') return;
    if (!createMap) {
      createMap = L.map('create-map', { attributionControl: false }).setView(CENTER, 13);
      tiles().addTo(createMap);
      createMap.on('click', e => { setCreatePin(e.latlng.lat, e.latlng.lng); selectPlaceChip(null); });
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
      createMarker.on('dragend', () => { const ll = createMarker.getLatLng(); setCreatePin(ll.lat, ll.lng); selectPlaceChip(null); });
    } else { createMarker.setLatLng([draft.lat, draft.lng]); createMarker.setIcon(icon); }
    $('#create-coords').textContent = `Lat ${draft.lat.toFixed(5)} · Lng ${draft.lng.toFixed(5)} · a ${fmtKm(haversine(origin(), [draft.lat, draft.lng]))} de ti`;
    if (!silent) { touched.add('map'); validate('map'); }
  }

  /* =====================================================================
     9. CREAR, EDITAR, UNIRSE Y CANCELAR
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
    lugar: v => v.trim().length < 3 ? 'Escribe el lugar exacto o elige uno sugerido.' : '',
    map: () => draft.lat == null ? 'Toca el mapa o elige un lugar para marcar el punto.' : '',
  };
  function setFieldState(field, msg) {
    field.classList.toggle('is-error', !!msg);
    field.classList.toggle('is-valid', !msg);
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
    $$('#form-create .field').forEach(f => { f.classList.remove('is-error', 'is-valid'); const m = $('.field-msg', f); if (m) m.innerHTML = ''; });
  }

  function renderPlaceChips() {
    $('#place-chips').innerHTML = LUGARES.map(l => `<button type="button" class="chip" data-place="${l.id}" aria-pressed="false">${ic('i-pin')} ${esc(l.nombre)}</button>`).join('');
  }
  function selectPlaceChip(id) { $$('#place-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.place === id))); }
  function choosePlace(id) {
    const l = lugar(id);
    if (!l) return;
    F('lugar').value = l.nombre;
    draft.barrio = l.ref;
    selectPlaceChip(id);
    touched.add('lugar'); validate('lugar');
    if (createMap) { setCreatePin(l.lat, l.lng); createMap.flyTo([l.lat, l.lng], 16, { duration: reduceMotion ? 0 : .8 }); }
  }

  function openCreate({ id = null, fecha = null } = {}) {
    editingId = id;
    const p = id ? findP(id) : null;
    $('#form-create').reset();
    clearValidation();
    $('#create-title').textContent = p ? 'Editar parche' : 'Abrir el parche';
    $('#create-submit span').textContent = p ? 'Guardar cambios' : 'Publicar parche';
    if (p) {
      F('titulo').value = p.titulo; F('categoria').value = p.categoria; F('cupos').value = p.cuposMax;
      F('fecha').value = dayKey(p.inicio);
      const d = new Date(p.inicio); F('hora').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      F('costo').value = precio(p); F('descripcion').value = p.descripcion; F('lugar').value = p.lugar;
      draft.lat = p.lat; draft.lng = p.lng; draft.barrio = p.barrio || '';
    } else {
      const k = fecha && fecha >= todayKey() ? fecha : todayKey();
      F('categoria').value = state.cat !== 'todos' ? state.cat : 'chill';
      F('fecha').value = k;
      const h = new Date(Date.now() + 90 * MIN);
      F('hora').value = k === todayKey() ? `${pad(h.getHours())}:00` : '17:00';
      F('cupos').value = 8; F('costo').value = 0;
      draft.lat = null; draft.lng = null; draft.barrio = '';
    }
    F('fecha').min = todayKey();
    const match = p && LUGARES.find(l => l.lat === p.lat && l.lng === p.lng);
    selectPlaceChip(match ? match.id : null);
    $('#create-coords').textContent = draft.lat != null ? `Lat ${draft.lat.toFixed(5)} · Lng ${draft.lng.toFixed(5)}` : 'Toca el mapa para soltar el pin';
    openModal('modal-create');
    setTimeout(initCreateMap, 120);
    setTimeout(() => createMap && createMap.invalidateSize(), 400);
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
    if (p) { setTimeFor(p.inicio); flyToParche(id); } // vuelo al nuevo pin
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

  function askDelete(id) {
    const p = findP(id);
    if (!p) return;
    $('#confirm-text').textContent = `"${p.titulo}" desaparece del mapa y de la lista. Avisaremos a los ${p.confirmados.length} confirmados.`;
    $('#confirm-ok').onclick = async () => {
      if (isRemote(p)) {
        const { error } = await sb.from('parches').delete().eq('id', id);
        if (error) { toast('No se pudo cancelar', dbMsg(error), { type: 'error' }); return; }
      }
      removeParcheLocal(id);
      save();
      closeModal('modal-confirm');
      toast('Parche cancelado', 'Lo quitamos del mapa y de la lista.', { icon: 'i-trash' });
    };
    openModal('modal-confirm');
  }
  function removeParcheLocal(id) {
    state.parches = state.parches.filter(x => x.id !== id);
    const m = liveMarkers.get(id);
    if (m && liveMap) { liveMap.removeLayer(m); liveMarkers.delete(id); }
    if (state.chatId === id) { state.chatId = null; $('#mis-layout').classList.remove('is-chat'); }
    refresh();
  }

  /* =====================================================================
     10. MIS PARCHES + CHAT
  ===================================================================== */
  const typing = { on: false };
  function misList() {
    const l = state.misTab === 'propios'
      ? state.parches.filter(p => isMine(p) && !isPast(p))
      : state.parches.filter(p => p.unido && !isMine(p) && !isPast(p));
    return l.sort((a, b) => a.inicio - b.inicio);
  }
  function renderMis() {
    $$('[data-mis]').forEach(b => { const on = b.dataset.mis === state.misTab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    const list = misList();
    $('#mis-items').innerHTML = list.length ? list.map(p => `
      <li><button class="mis-item ${state.chatId === p.id ? 'is-active' : ''}" data-action="chat" data-id="${p.id}">
        <i>${ic(catById(p.categoria).icon)}</i>
        <b>${esc(p.titulo)}</b>
        <small>${esc(fmtCuando(p.inicio))} · ${ocupados(p)}/${p.cuposMax}</small>
      </button></li>`).join('')
      : `<li class="mis-empty">${state.misTab === 'propios' ? 'Aún no has armado ningún parche.' : 'Aún no le has caído a ningún parche.'}
          <button class="btn btn--primary btn--sm" data-action="${state.misTab === 'propios' ? 'crear' : 'go-radar'}">${state.misTab === 'propios' ? 'Abrir el parche' : 'Explorar parches'}</button></li>`;
    const current = state.chatId && findP(state.chatId);
    if (!current && !isMobile() && list.length) { openChat(list[0].id, { quiet: true }); return; }
    renderChat();
  }

  function openChat(id, { quiet = false } = {}) {
    const p = findP(id);
    if (!p) return;
    closeAllModals();
    if (!inside(p)) state.misTab = 'unido';
    else state.misTab = isMine(p) ? 'propios' : 'unido';
    state.chatId = id;
    if (state.view !== 'mis') { go('mis'); }
    else { $$('.mis-item').forEach(b => b.classList.toggle('is-active', b.dataset.id === id)); renderChat(); }
    if (!quiet || isMobile()) $('#mis-layout').classList.toggle('is-chat', isMobile());
    if (isRemote(p)) loadChat(id);
  }

  function msgHTML(m) {
    const t = `<time>${fmtHora(m.ts)}</time>`;
    if (m.tipo === 'bot') return `<div class="msg msg--bot"><span class="bot-ic">${ic('i-bot')}</span><div class="bubble"><small>Bot del Parche</small>${esc(m.texto)}${t}</div></div>`;
    if (m.tipo === 'sys') return `<div class="msg msg--sys"><div class="bubble">${esc(m.texto)}</div></div>`;
    if (m.tipo === 'alerta') return `<div class="msg msg--sys msg--alert"><div class="bubble">${esc(m.texto)}</div></div>`;
    const mine = m.autor === 'me';
    return `<div class="msg ${mine ? 'msg--me' : ''}">${avHTML(m.autor)}<div class="bubble">${mine ? '' : `<small>${esc(personById(m.autor)?.nombre || 'Parcero')}</small>`}${esc(m.texto)}${t}</div></div>`;
  }

  function renderChat() {
    const box = $('#chat');
    const p = state.chatId && findP(state.chatId);
    if (!p) {
      box.innerHTML = `<div class="chat-placeholder">${ic('i-chat')}<h3>Elige un parche</h3><p>Aquí verás el chat del grupo, los confirmados y la vaca.</p></div>`;
      return;
    }
    const keepText = $('#chat-input')?.value || '';
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
            <button class="icon-btn" data-action="ver-mapa" data-id="${p.id}" aria-label="Ver en el mapa" title="Ver en el mapa">${ic('i-pin')}</button>
            ${isMine(p) ? `<button class="icon-btn" data-action="editar" data-id="${p.id}" aria-label="Editar parche" title="Editar parche">${ic('i-edit')}</button>
            <button class="icon-btn" data-action="cancelar" data-id="${p.id}" aria-label="Cancelar parche" title="Cancelar parche">${ic('i-trash')}</button>` : ''}
          </div>
        </div>
        <details class="attendees">
          <summary><span class="stack">${ids.slice(0, 5).map(id => avHTML(id)).join('')}</span><span class="tnum">${ocupados(p)} / ${p.cuposMax} confirmados</span>${ic('i-chev-down')}</summary>
          <div class="att-list">${ids.map((id, i) => `<span>${avHTML(id)}${esc(names[i])}</span>`).join('')}</div>
        </details>
      </div>
      <div class="chat-msgs" id="chat-msgs">${p.chat.map(msgHTML).join('')}${typing.on ? '<div class="typing" aria-label="Escribiendo"><i></i><i></i><i></i></div>' : ''}</div>
      <div class="chat-foot">${inside(p) ? `
        <div class="chat-tools">
          <details class="vaca" id="vaca" ${vacaOpen ? 'open' : ''}>
            <summary>${ic('i-cash')} Hacer la vaca ${ic('i-chev-down')}</summary>
            <div class="vaca-body">
              <div class="input-wrap">${ic('i-wallet')}<input class="input tnum" id="vaca-total" type="number" min="0" step="1000" inputmode="numeric" placeholder="Gasto total del grupo" value="${esc(vacaVal)}"></div>
              <div class="vaca-result"><span class="tnum" id="vaca-split"></span><b class="tnum" id="vaca-each">$0</b></div>
              <button class="btn btn--ghost btn--sm" data-action="vaca-send">${ic('i-send')} Mandar al chat</button>
            </div>
          </details>
          ${p.checkin
            ? `<button class="btn btn--ok" disabled>${ic('i-check')} Ya hiciste check-in</button>`
            : `<button class="btn btn--ink" data-action="checkin" data-id="${p.id}">${ic('i-flag')} Ya llegué al punto</button>`}
        </div>
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
    box.innerHTML = p.chat.map(msgHTML).join('') + (typing.on ? '<div class="typing"><i></i><i></i><i></i></div>' : '');
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
    $('#vaca-split').textContent = `${money(total)} entre ${n} asistentes`;
    $('#vaca-each').textContent = money(Math.ceil(total / n / 100) * 100) + ' c/u';
  }

  async function sendChat(text) {
    const p = state.chatId && findP(state.chatId);
    if (!p || !text.trim()) return;
    const msg = { tipo: 'user', autor: 'me', texto: text.trim().slice(0, 400), ts: Date.now() };
    p.chat.push(msg);
    renderChatMsgs();
    if (isRemote(p)) {
      const { data, error } = await sb.from('mensajes').insert({ parche_id: p.id, texto: msg.texto }).select('id').single();
      if (error) { p.chat = p.chat.filter(m => m !== msg); renderChatMsgs(); toast('No se envió', dbMsg(error), { type: 'error' }); }
      else msg.id = data.id;
      return;
    }
    save();
    // Tiempo real simulado en modo demo
    const pid = p.id, who = pick(p.confirmados.length ? p.confirmados : PEOPLE.map(x => x.id));
    setTimeout(() => { if (state.chatId === pid) { typing.on = true; renderChatMsgs(); } }, 700);
    setTimeout(() => {
      typing.on = false;
      const q = findP(pid);
      if (!q) return;
      q.chat.push({ tipo: 'user', autor: who, texto: pick(REPLIES), ts: Date.now() });
      save();
      if (state.chatId === pid) renderChatMsgs();
    }, 2200 + Math.random() * 1200);
  }

  async function checkin(id) {
    const p = findP(id);
    if (!p) return;
    if (isRemote(p)) {
      const { error } = await sb.from('parche_miembros').update({ checkin: true }).eq('parche_id', id).eq('usuario_id', me.id);
      if (error) { toast('No se pudo hacer check-in', dbMsg(error), { type: 'error' }); return; }
    }
    p.checkin = true;
    toast('Check-in confirmado', 'Le avisamos al grupo que ya llegaste.', { icon: 'i-flag' });
    renderChat();
    sendChat('Ya llegué al punto');
  }

  /* =====================================================================
     11. PERFIL: AVATAR, FOTO Y DATOS
  ===================================================================== */
  let avDraft = normalizeAv(perfil.avatar_config);
  let avTab = 'piel';
  let crop = { src: '', zoom: 1, x: 0, y: 0 };

  function maskCedula(c) {
    if (!c) return 'Sin registrar';
    const parts = Number(c).toLocaleString('es-CO').split('.');
    return parts.length > 2 ? [parts[0], ...parts.slice(1, -1).map(() => '***'), parts[parts.length - 1]].join('.') : '***' + String(c).slice(-3);
  }

  function renderPerfil() {
    $('#id-avatar').innerHTML = avHTML('me');
    $('#id-name').textContent = perfil.nombre;
    $('#id-sub').textContent = `${perfil.ciudad} · Cuenta verificada`;
    $('#id-cedula').textContent = maskCedula(perfil.cedula);
    $('#id-mail').textContent = perfil.mail || '-';
    const mode = perfil.mostrar_foto_real ? 'foto' : 'avatar';
    setIdMode(mode, false);
    avDraft = normalizeAv(perfil.avatar_config);
    renderBuilder();
    crop = Object.assign({ src: '', zoom: 1, x: 0, y: 0 }, perfil.foto_encuadre);
    renderCrop();
    $('#p-tel').value = perfil.tel || ''; $('#p-city').value = perfil.ciudad; $('#p-pass').value = '';
    updatePassRules();
  }
  function setIdMode(mode) {
    $$('[data-idmode]').forEach(b => { const on = b.dataset.idmode === mode; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
    $('#pane-foto').hidden = mode !== 'foto';
    $('#pane-avatar').hidden = mode !== 'avatar';
  }

  function renderBuilder() {
    const c = avDraft;
    $('#builder-preview').innerHTML = `<span class="av">${avatarSVG(c)}</span>`;
    $$('[data-gen]').forEach(b => { const on = b.dataset.gen === c.genero; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
    $$('#av-tabs .tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === avTab));
    const chips = (key, vals, labels = {}) => `<div class="opt-row">${vals.map(v => `<button type="button" class="chip" data-av="${key}" data-val="${v}" aria-pressed="${String(c[key]) === String(v)}">${esc(labels[v] || AV_LBL[v] || v)}</button>`).join('')}</div>`;
    const swatches = (key, map) => `<div class="opt-row">${Object.entries(map).map(([k, col]) => `<button type="button" class="swatch" style="background:${col}" data-av="${key}" data-val="${k}" aria-pressed="${c[key] === k}" aria-label="${esc(AV_LBL[k] || k)}" title="${esc(AV_LBL[k] || k)}"></button>`).join('')}</div>`;
    const thumbs = (key, vals) => `<div class="opt-thumbs">${vals.map(v => `<button type="button" class="thumb" data-av="${key}" data-val="${v}" aria-pressed="${c[key] === v}"><span class="av">${avatarSVG(Object.assign({}, c, { [key]: v, fondo: 'gris', gorra: key === 'pelo' ? 'ninguna' : c.gorra }))}</span>${esc(AV_LBL[v])}</button>`).join('')}</div>`;
    const group = (title, html) => `<div class="opt-group"><span>${title}</span>${html}</div>`;
    let body = '';
    if (avTab === 'piel') {
      body = group('Tono de piel', `<div class="opt-row">${AV.piel.map((col, i) => `<button type="button" class="swatch" style="background:${col}" data-av="piel" data-val="${i}" aria-pressed="${c.piel === i}" aria-label="Tono ${i + 1}"></button>`).join('')}</div>`)
        + group('Fondo', swatches('fondo', AV.fondo));
    } else if (avTab === 'pelo') {
      body = group(`Estilo (${c.genero})`, thumbs('pelo', AV.pelo[c.genero])) + group('Color de cabello', swatches('peloColor', AV.peloColor));
    } else if (avTab === 'cara') {
      body = group('Ojos', chips('ojos', AV.ojos)) + group('Expresión de la boca', chips('boca', AV.boca));
    } else if (avTab === 'ropa') {
      body = group('Ropa streetwear', thumbs('ropa', AV.ropa)) + group('Color de la ropa', swatches('ropaColor', AV.ropaColor));
    } else {
      body = group('Gafas', chips('gafas', AV.gafas, { ninguna: 'Sin gafas' }))
        + group('Gorra', chips('gorra', AV.gorra, { ninguna: 'Sin gorra' }))
        + group('Aretes', chips('aretes', ['false', 'true'], { false: 'Sin aretes', true: 'Con aretes' }))
        + (c.genero === 'hombre' ? group('Vello facial', chips('vello', AV.vello, { ninguno: 'Sin vello' })) : '');
    }
    $('#av-body').innerHTML = body;
  }

  function renderCrop() {
    const img = $('#crop-img');
    if (crop.src) { if (img.getAttribute('src') !== crop.src) img.src = crop.src; img.hidden = false; $('#crop-empty').hidden = true; }
    else { img.hidden = true; img.removeAttribute('src'); $('#crop-empty').hidden = false; }
    img.style.transform = `translate(${crop.x}%, ${crop.y}%) scale(${crop.zoom})`;
    $('#crop-zoom').value = crop.zoom; $('#crop-x').value = crop.x; $('#crop-y').value = crop.y;
    $('#out-zoom').textContent = Number(crop.zoom).toFixed(1) + 'x';
    $('#out-x').textContent = Math.round(crop.x); $('#out-y').textContent = Math.round(crop.y);
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

  function updatePassRules() {
    const v = $('#p-pass').value;
    $('[data-rule="len"]').classList.toggle('is-met', v.length >= 8);
    $('[data-rule="upper"]').classList.toggle('is-met', /[A-Z]/.test(v));
  }

  function afterIdentityChange() {
    savePerfil(); renderSideUser(); renderPerfil(); refresh();
    if (state.chatId) renderChat();
  }

  function initPerfil() {
    $('#av-tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { avTab = t.dataset.tab; renderBuilder(); } });
    $('#av-body').addEventListener('click', e => {
      const b = e.target.closest('[data-av]');
      if (!b) return;
      const k = b.dataset.av, v = b.dataset.val;
      avDraft[k] = k === 'piel' ? Number(v) : k === 'aretes' ? v === 'true' : v;
      avDraft = normalizeAv(avDraft);
      renderBuilder();
    });
    $$('[data-gen]').forEach(b => b.addEventListener('click', () => {
      const g = b.dataset.gen;
      if (avDraft.genero === g) return;
      avDraft.genero = g;
      if (!AV.pelo[g].includes(avDraft.pelo)) avDraft.pelo = AV.pelo[g][0];
      if (g === 'mujer') { avDraft.vello = 'ninguno'; if (avTab === 'extra') avTab = 'extra'; }
      avDraft = normalizeAv(avDraft);
      renderBuilder();
    }));
    $('#avatar-random').addEventListener('click', () => {
      const g = avDraft.genero;
      avDraft = normalizeAv({
        genero: g, piel: Math.floor(Math.random() * 6), pelo: pick(AV.pelo[g]), peloColor: pick(Object.keys(AV.peloColor)),
        ojos: pick(AV.ojos), boca: pick(AV.boca), ropa: pick(AV.ropa), ropaColor: pick(Object.keys(AV.ropaColor)),
        gafas: pick(AV.gafas), gorra: pick(['ninguna', 'ninguna', 'adelante', 'atras']), aretes: Math.random() > .6,
        vello: g === 'hombre' ? pick(AV.vello) : 'ninguno', fondo: pick(Object.keys(AV.fondo)),
      });
      renderBuilder();
    });
    $('#avatar-save').addEventListener('click', async e => {
      const btn = e.currentTarget;
      if (!DEMO) {
        btn.classList.add('is-loading');
        try { await updatePerfilRemote({ avatar_config: avDraft, mostrar_foto_real: false }); }
        catch (err) { btn.classList.remove('is-loading'); toast('No se guardó el avatar', dbMsg(err), { type: 'error' }); return; }
        btn.classList.remove('is-loading');
      }
      perfil.avatar_config = Object.assign({}, avDraft);
      perfil.mostrar_foto_real = false;
      afterIdentityChange();
      toast('Avatar guardado', 'Ya sale en el header, en las tarjetas y en el chat.', { icon: 'i-user' });
    });

    // Foto real con encuadre
    $('#crop-file').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('Archivo no válido', 'Sube una imagen JPG o PNG.', { type: 'error' }); return; }
      try { crop = { src: await downscale(f), zoom: 1, x: 0, y: 0 }; renderCrop(); }
      catch (err) { toast('No pudimos leer la foto', 'Prueba con otra imagen.', { type: 'error' }); }
      e.target.value = '';
    });
    $('#crop-url-btn').addEventListener('click', () => {
      const url = $('#crop-url').value.trim();
      if (!/^https:\/\/.+/i.test(url)) { toast('Enlace no válido', 'Pega un enlace que empiece por https://', { type: 'error' }); return; }
      loadImg(url).then(() => { crop = { src: url, zoom: 1, x: 0, y: 0 }; renderCrop(); })
        .catch(() => toast('No cargó la imagen', 'Revisa que el enlace sea de una foto pública.', { type: 'error' }));
    });
    ['zoom', 'x', 'y'].forEach(k => $('#crop-' + k).addEventListener('input', e => { crop[k] = Number(e.target.value); renderCrop(); }));
    const frame = $('#crop-frame');
    let drag = null;
    frame.addEventListener('pointerdown', e => { if (!crop.src) return; drag = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y }; frame.setPointerCapture(e.pointerId); });
    frame.addEventListener('pointermove', e => {
      if (!drag) return;
      const w = frame.clientWidth;
      crop.x = clamp(drag.cx + (e.clientX - drag.x) / w * 100, -50, 50);
      crop.y = clamp(drag.cy + (e.clientY - drag.y) / w * 100, -50, 50);
      renderCrop();
    });
    frame.addEventListener('pointerup', () => { drag = null; });
    frame.addEventListener('pointercancel', () => { drag = null; });
    $('#crop-save').addEventListener('click', async e => {
      if (!crop.src) { toast('Falta la foto', 'Sube una foto o pega un enlace primero.', { type: 'error' }); return; }
      const btn = e.currentTarget;
      if (!DEMO) {
        btn.classList.add('is-loading');
        try {
          if (crop.src.startsWith('data:')) crop.src = await uploadFoto(crop.src, 'avatar');
          await updatePerfilRemote({ foto_encuadre: crop, mostrar_foto_real: true });
        } catch (err) { btn.classList.remove('is-loading'); toast('No se guardó la foto', dbMsg(err), { type: 'error' }); return; }
        btn.classList.remove('is-loading');
      }
      perfil.foto_encuadre = Object.assign({}, crop);
      perfil.mostrar_foto_real = true;
      afterIdentityChange();
      toast('Foto guardada', 'Ya sale en el header, en las tarjetas y en el chat.', { icon: 'i-camera' });
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
    $('#p-pass').addEventListener('input', () => { updatePassRules(); if ($('#p-pass').value) check('p-pass'); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (![check('p-tel'), check('p-pass')].every(Boolean)) return;
      const tel = $('#p-tel').value, ciudad = $('#p-city').value, pass = $('#p-pass').value;
      if (!DEMO) {
        const btn = $('button[type="submit"]', form);
        btn.classList.add('is-loading');
        try {
          const r1 = await sb.from('perfiles_privados').update({ telefono: tel || null }).eq('id', me.id);
          if (r1.error) throw r1.error;
          await updatePerfilRemote({ ciudad });
          if (pass) { const r2 = await sb.auth.updateUser({ password: pass }); if (r2.error) throw r2.error; }
        } catch (err) { btn.classList.remove('is-loading'); toast('No se guardaron los datos', dbMsg(err), { type: 'error' }); return; }
        btn.classList.remove('is-loading');
      }
      perfil.tel = tel; perfil.ciudad = ciudad;
      $('#p-pass').value = ''; updatePassRules();
      $$('.field', form).forEach(f => f.classList.remove('is-valid'));
      savePerfil(); renderSideUser(); renderPerfil();
      toast('Datos guardados', pass ? 'Actualizamos tus datos y tu contraseña.' : 'Tus datos quedaron al día.', { icon: 'i-check' });
    });
  }

  /* =====================================================================
     12. TOASTS Y MODALES
  ===================================================================== */
  function toast(title, text = '', { icon = 'i-check', type = '', action = null, ms = 4200 } = {}) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type ? 'toast--' + type : ''}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-ic">${ic(type === 'error' ? 'i-alert' : icon)}</span>
      <div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>
      ${action ? `<button class="btn btn--primary btn--xs" data-action="${action.act || 'ver-mapa'}" data-id="${esc(action.id)}">${esc(action.label)}</button>` : ''}
      <button class="toast-x" aria-label="Cerrar aviso">${ic('i-close')}</button>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    const kill = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 260); };
    el.querySelector('.toast-x').addEventListener('click', kill);
    if (action) el.querySelector('[data-action]').addEventListener('click', kill);
    setTimeout(kill, ms);
  }

  const modalStack = [];
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
    m._t = setTimeout(() => { m.hidden = true; m.classList.remove('is-closing'); }, reduceMotion ? 0 : 190);
    const i = modalStack.findIndex(x => x.id === id);
    const entry = i >= 0 ? modalStack.splice(i, 1)[0] : null;
    if (!modalStack.length) document.body.classList.remove('no-scroll');
    if (entry && entry.ret && document.contains(entry.ret)) entry.ret.focus({ preventScroll: true });
  }
  const closeAllModals = () => [...modalStack].reverse().forEach(x => closeModal(x.id));

  /* =====================================================================
     13. SUPABASE: SESIÓN, CARGA, TIEMPO REAL Y ESCRITURA
  ===================================================================== */
  const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
  const shortName = n => { const [a, b] = String(n || 'Parcero').trim().split(/\s+/); return b ? `${a} ${b.charAt(0)}.` : a; };

  function dbMsg(err) {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/failed to fetch|network/i.test(m)) return 'Sin conexión. Revisa tu internet.';
    if (/jwt expired|invalid jwt/i.test(m)) return 'Tu sesión venció. Vuelve a entrar.';
    if (/PARCHE_LLENO/.test(m)) return 'Alguien tomó el último cupo antes que tú.';
    if (/permission denied|row-level security/i.test(m)) return 'No tienes permiso para hacer eso.';
    if (/PGRST205|42P01|Could not find the table/i.test(m)) return 'Faltan las tablas en Supabase.';
    return m || 'Intenta de nuevo en unos segundos.';
  }
  const setBoot = t => { const el = $('#boot-text'); if (el) el.textContent = t; };
  const hideBoot = () => { const b = $('#boot'); if (b) { b.classList.add('is-done'); setTimeout(() => b.remove(), 400); } };
  function bootError(err) {
    const sql = /PGRST205|42P01|Could not find the table/i.test(String(err && (err.code + ' ' + err.message)));
    setBoot(sql ? 'Faltan las tablas en Supabase. Corre los archivos de supabase/migrations en el SQL Editor y recarga.' : `No pudimos cargar tus parches. ${dbMsg(err)}`);
    const box = $('#boot-actions');
    box.hidden = false;
    box.innerHTML = `<button class="btn btn--primary" data-boot="retry">${ic('i-refresh')} Reintentar</button>
      <a class="btn btn--ghost" href="dashboard.html?demo=1">Ver en modo demo</a>
      <button class="btn btn--ghost" data-boot="logout">${ic('i-logout')} Cerrar sesión</button>`;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-boot]');
      if (!b) return;
      if (b.dataset.boot === 'retry') window.location.reload(); else logout();
    });
  }
  async function logout() {
    if (DEMO || !sb) { window.location.href = 'login.html'; return; }
    try { await sb.auth.signOut(); } catch (e) { /* salimos igual */ }
    window.location.replace('login.html');
  }

  const personFromRow = r => ({
    id: r.id, nombre: shortName(r.nombre), av: normalizeAv(r.avatar_config),
    foto: r.mostrar_foto_real && r.foto_encuadre && r.foto_encuadre.src ? r.foto_encuadre : null,
  });
  async function cachePeople(ids) {
    const faltan = [...new Set(ids.filter(id => isUuid(id) && id !== (me && me.id) && !peopleCache.has(id)))];
    if (!faltan.length) return;
    const { data, error } = await sb.from('perfiles').select('id, nombre, avatar_config, mostrar_foto_real, foto_encuadre').in('id', faltan);
    if (error) { console.warn('[perfiles]', error.message); return; }
    data.forEach(r => peopleCache.set(r.id, personFromRow(r)));
  }

  function applyPerfilRow(p, priv) {
    const meta = (me && me.user_metadata) || {};
    p = p || { nombre: meta.nombre || (me.email || '').split('@')[0], ciudad: 'Villavicencio' };
    perfil = Object.assign({}, PERFIL_DEF, {
      nombre: p.nombre, primer: String(p.nombre || 'Parcero').split(' ')[0], ciudad: p.ciudad || 'Villavicencio',
      mostrar_foto_real: !!p.mostrar_foto_real,
      foto_encuadre: Object.assign({ src: '', zoom: 1, x: 0, y: 0 }, p.foto_encuadre || {}),
      avatar_config: normalizeAv(p.avatar_config),
      tel: (priv && priv.telefono) || '', cedula: (priv && priv.cedula) || '', mail: me.email || '',
    });
  }

  function fromRow(r, miembros, prev) {
    const mia = miembros.find(m => m.usuario_id === me.id);
    const propio = r.creador_id === me.id;
    return normalizeParche({
      id: r.id, titulo: r.titulo, categoria: r.categoria, descripcion: r.descripcion,
      inicio: Date.parse(r.inicio), lugar: r.lugar, barrio: r.barrio, lat: r.lat, lng: r.lng,
      costo: r.costo, presupuesto: r.presupuesto, cuposMax: r.cupos_max,
      confirmados: (r.confirmados_demo || []).concat(miembros.filter(m => m.usuario_id !== me.id).map(m => m.usuario_id)),
      unido: !!mia, propio, creadorId: propio ? 'me' : r.creador_id, creadorNombre: r.creador_nombre,
      checkin: !!(mia && mia.checkin), demo: r.demo, chat: prev ? prev.chat : [],
    });
  }
  const msgFromRow = r => ({ id: r.id, tipo: r.tipo, texto: r.texto, ts: Date.parse(r.creado_en), autor: r.autor_id ? (r.autor_id === me.id ? 'me' : r.autor_id) : r.autor_demo });

  async function loadRemote() {
    const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
    const [pf, pv, ps] = await Promise.all([
      sb.from('perfiles').select('*').eq('id', me.id).maybeSingle(),
      sb.from('perfiles_privados').select('*').eq('id', me.id).maybeSingle(),
      sb.from('parches').select('*').gte('inicio', since).order('inicio'),
    ]);
    for (const r of [pf, pv, ps]) if (r.error) throw r.error;
    const rows = ps.data || [];
    let miembros = [];
    if (rows.length) {
      const mm = await sb.from('parche_miembros').select('parche_id, usuario_id, checkin').in('parche_id', rows.map(r => r.id));
      if (mm.error) throw mm.error;
      miembros = mm.data;
    }
    await cachePeople(rows.map(r => r.creador_id).concat(miembros.map(m => m.usuario_id)));
    applyPerfilRow(pf.data, pv.data);
    state.parches = rows.map(r => fromRow(r, miembros.filter(m => m.parche_id === r.id)));
  }

  async function fetchParche(id, drop = false) {
    const [{ data: row, error }, mm] = await Promise.all([
      sb.from('parches').select('*').eq('id', id).maybeSingle(),
      sb.from('parche_miembros').select('parche_id, usuario_id, checkin').eq('parche_id', id),
    ]);
    if (error) { console.warn('[parche]', error.message); return; }
    if (!row) {
      const wasOpen = state.chatId === id;
      removeParcheLocal(id);
      if (wasOpen) toast('Parche cancelado', 'El organizador canceló este plan.', { icon: 'i-trash' });
      return;
    }
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
    p.chat = data.map(msgFromRow);
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
      const res = editId
        ? await sb.from('parches').update(row).eq('id', editId).select('id').single()
        : await sb.from('parches').insert(row).select('id').single();
      if (res.error) throw res.error;
      await fetchParche(res.data.id, !editId);
      return res.data.id;
    } catch (err) {
      toast(editId ? 'No se guardaron los cambios' : 'No se publicó el parche', dbMsg(err), { type: 'error' });
      return null;
    }
  }

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
        reloadParche(id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parche_miembros' }, pl => {
        const id = pidOf(pl);
        if (id && findP(id)) reloadParche(id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, async ({ new: r }) => {
        const p = findP(r.parche_id);
        if (!p || p.chat.some(m => m.id === r.id)) return;
        const mine = r.autor_id === me.id && p.chat.find(m => m.autor === 'me' && !m.id && m.texto === r.texto);
        if (mine) { mine.id = r.id; return; }
        await cachePeople([r.autor_id]);
        if (p.chat.some(m => m.id === r.id)) return;
        p.chat.push(msgFromRow(r));
        if (state.chatId === p.id) renderChatMsgs();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${me.id}` }, ({ new: r }) => {
        if (r.icono !== 'i-bolt') toast('Novedad en tus parches', String(r.texto).replace(/<\/?b>/g, ''), { icon: 'i-live' });
      })
      .subscribe();
  }

  async function bootRemote() {
    setBoot('Revisando tu sesión...');
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* sin sesión */ }
    if (!session) { window.location.replace('login.html'); return false; }
    me = session.user;
    sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT' || (!s && ev !== 'INITIAL_SESSION')) window.location.replace('login.html'); });
    setBoot('Cargando los parches de Villavo...');
    try { await loadRemote(); } catch (err) { console.error(err); bootError(err); return false; }
    return true;
  }

  /* =====================================================================
     14. EVENTOS E INICIO
  ===================================================================== */
  function onClick(e) {
    const t = e.target;
    const closer = t.closest('[data-close]');
    if (closer) { const m = closer.closest('.modal'); if (m) closeModal(m.id); return; }
    const nav = t.closest('[data-nav]');
    if (nav) { closeAllModals(); go(nav.dataset.nav); return; }
    const cat = t.closest('[data-cat]');
    if (cat) { state.cat = cat.dataset.cat; renderRadar(true); return; }
    const tb = t.closest('[data-time]');
    if (tb) { state.time = { mode: tb.dataset.time, date: null }; renderLiveMap(); return; }
    const mis = t.closest('[data-mis]');
    if (mis) { state.misTab = mis.dataset.mis; state.chatId = null; renderMis(); return; }
    const idm = t.closest('[data-idmode]');
    if (idm) {
      const foto = idm.dataset.idmode === 'foto';
      setIdMode(foto ? 'foto' : 'avatar');
      // Volver al avatar se aplica de inmediato; la foto se aplica al guardarla
      if (!foto && perfil.mostrar_foto_real) {
        perfil.mostrar_foto_real = false;
        afterIdentityChange();
        if (!DEMO) updatePerfilRemote({ mostrar_foto_real: false }).catch(err => toast('No se guardó', dbMsg(err), { type: 'error' }));
      } else if (foto && perfil.foto_encuadre.src && !perfil.mostrar_foto_real) {
        perfil.mostrar_foto_real = true;
        afterIdentityChange();
        if (!DEMO) updatePerfilRemote({ mostrar_foto_real: true }).catch(err => toast('No se guardó', dbMsg(err), { type: 'error' }));
      }
      return;
    }
    const place = t.closest('[data-place]');
    if (place) { choosePlace(place.dataset.place); return; }

    const a = t.closest('[data-action]');
    if (!a) return;
    const id = a.dataset.id;
    switch (a.dataset.action) {
      case 'crear': closeAllModals(); openCreate({ fecha: a.dataset.fecha }); break;
      case 'join': toggleJoin(id); break;
      case 'editar': closeAllModals(); openCreate({ id }); break;
      case 'cancelar': askDelete(id); break;
      case 'ver-mapa': flyToParche(id); break;
      case 'chat': openChat(id); break;
      case 'chat-back': $('#mis-layout').classList.remove('is-chat'); state.chatId = null; renderMis(); break;
      case 'checkin': checkin(id); break;
      case 'go-radar': go('radar'); break;
      case 'cerrar-popup': liveMap && liveMap.closePopup(); break;
      case 'logout': logout(); break;
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
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalStack.length) closeModal(modalStack[modalStack.length - 1].id);
    });

    let st;
    $('#search-input').addEventListener('input', e => {
      clearTimeout(st);
      $('#search-clear').hidden = !e.target.value;
      st = setTimeout(() => {
        state.search = e.target.value.trim();
        if (state.view !== 'radar' && state.view !== 'mapa') go('radar'); else refresh();
      }, 140);
    });
    $('#search-clear').addEventListener('click', () => { $('#search-input').value = ''; $('#search-clear').hidden = true; state.search = ''; refresh(); });

    $('#btn-locate').addEventListener('click', () => { go('mapa'); startGeo({ fly: true }); });
    $('#map-locate').addEventListener('click', () => startGeo({ fly: true }));

    $('#time-select').addEventListener('change', e => {
      const v = e.target.value;
      if (v === '__fecha') { $('#time-date-wrap').hidden = false; $('#time-date').focus(); return; }
      if (v) { state.time = { mode: 'fecha', date: v }; renderLiveMap(); }
    });
    $('#time-date').addEventListener('change', e => {
      const v = e.target.value;
      if (!v) return;
      state.time = v === todayKey() ? { mode: 'hoy', date: null } : v === offsetKey(1) ? { mode: 'manana', date: null } : { mode: 'fecha', date: v };
      renderLiveMap();
    });

    const form = $('#form-create');
    form.addEventListener('submit', submitCreate);
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (n && touched.has(n)) validate(n);
      if (n === 'fecha' && touched.has('hora')) validate('hora');
      if (n === 'lugar') selectPlaceChip(null);
    });
    form.addEventListener('focusout', e => { const n = e.target.name; if (n && RULES[n]) { touched.add(n); validate(n); } });
    form.addEventListener('change', e => { if (e.target.name === 'categoria' && createMarker) setCreatePin(draft.lat, draft.lng, true); });

    document.addEventListener('submit', e => {
      if (e.target.id !== 'chat-form') return;
      e.preventDefault();
      const inp = $('#chat-input');
      sendChat(inp.value); inp.value = ''; inp.focus();
    });
    document.addEventListener('input', e => { if (e.target.id === 'vaca-total') updateVaca(); });

    setInterval(() => { if (state.view === 'radar') renderRadar(); }, 60 * 1000);
    window.addEventListener('resize', () => {
      liveMap && liveMap.invalidateSize();
      if (!isMobile()) $('#mis-layout').classList.remove('is-chat');
    });
  }

  async function init() {
    if (DEMO) loadDemo();
    else if (!(await bootRemote())) return;

    $('#c-categoria').innerHTML = CATS.filter(c => c.id !== 'todos').map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    renderPlaceChips();
    buildTimeControls();
    bind();
    initPerfil();

    renderSideUser();
    renderNavCount();
    go('radar');
    hideBoot();
    startGeo(); // pide permiso de ubicación al iniciar

    if (!DEMO) {
      subscribeRealtime();
      const abrir = new URLSearchParams(window.location.search).get('parche');
      if (abrir && findP(abrir)) setTimeout(() => openChat(abrir), 400);
    } else if (sb) {
      toast('Modo demo', 'Estás viendo datos de ejemplo guardados en este navegador.', { icon: 'i-info' });
    }
    if (typeof L === 'undefined') toast('El mapa no cargó', 'Revisa tu conexión para ver el mapa.', { type: 'error' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
