/* =====================================================================
   Modo Parche · dashboard.js
   Panel del usuario en Vanilla JS (ES6+) + Leaflet.

   1.  Utilidades
   2.  Catálogos (categorías, portadas, gente, aliados)
   3.  Avatar urbano en SVG
   4.  Datos semilla (Villavicencio) y persistencia
   5.  Cálculos (cupos, distancia, vibra, clima, filtros)
   6.  Plantillas (tarjeta, skeleton, estado vacío, popup)
   7.  Vistas: navegación SPA, Radar, Mis parches, Parceros
   8.  Mapas: en vivo, widget de radar, mini mapa de creación
   9.  Acciones: unirse, crear/editar/eliminar, simular en vivo
   10. Detalle del parche + chat
   11. Ruleta, ticket IG, compartir seguro, calificar
   12. Perfil: foto con encuadre, constructor de avatar, datos
   13. Header: búsqueda, desparchado, tema, notificaciones, toasts
   14. Modales (abrir, cerrar, bottom sheet)
   15. Eventos e inicio
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
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  // Supabase: con sesión los datos se leen y guardan allá.
  // Modo demo (sin conexión o con ?demo=1): todo queda en este navegador.
  const sb = window.mpSupabase || null;
  const DEMO = !sb || new URLSearchParams(window.location.search).has('demo');
  let me = null; // usuario de Supabase Auth
  const isRemote = p => !DEMO && p && !p.local;

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

  const fmtHora = ts => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(ts);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const weekdayLong = k => new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(keyToDate(k));
  const weekdayShort = k => cap(new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(keyToDate(k)).replace('.', ''));
  const shortDate = k => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(keyToDate(k)).replace('.', '');

  function fmtDia(ts) {
    const k = dayKey(ts), diff = daysFromToday(k);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff === -1) return 'Ayer';
    return `${weekdayShort(k)} ${shortDate(k)}`;
  }
  const fmtCuando = ts => `${fmtDia(ts)} · ${fmtHora(ts)}`;
  function fmtETA(ts) {
    const m = Math.round((ts - Date.now()) / MIN);
    if (m <= 0) return 'Ya arrancó';
    if (m < 60) return `En ${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `En ${h} h ${r}` : `En ${h} h`;
  }

  /* Reloj redondeado a 5 minutos, desde ahora */
  const soon = mins => { const t = Date.now() + mins * MIN; return Math.ceil(t / (5 * MIN)) * 5 * MIN; };
  const at = (days, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.getTime(); };
  /* Hora fija de hoy; si ya pasó, la corre para que siga siendo futura */
  const todayAt = (h, m, fallbackMins) => { const t = at(0, h, m); return t > Date.now() + 20 * MIN ? t : soon(fallbackMins); };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  function haversine(a, b) {
    const R = 6371, toRad = x => x * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /* =====================================================================
     2. CATÁLOGOS
  ===================================================================== */
  const CENTER = [4.1420, -73.6266];
  const USER_POS = [4.1440, -73.6330]; // Barzal: ubicación simulada del usuario
  const KEYS = { state: 'mp_dash_state_v2', perfil: 'mp_dash_perfil_v2', theme: 'mp_theme' };

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

  const IMG = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;
  const COVERS = {
    rumba: [IMG('photo-1572116469696-31de0f17cc34'), IMG('photo-1514525253161-7a46d19cd819'), IMG('photo-1533174072545-7a4b6ad7a6c3')],
    comida: [IMG('photo-1504674900247-0877df9cc836'), IMG('photo-1414235077428-338989a2e8c0')],
    chill: [IMG('photo-1495474472287-4d71bcdd2085'), IMG('photo-1511632765486-a01980e01a18')],
    pueblear: [IMG('photo-1506905925346-21bda4d32df4'), IMG('photo-1501555088652-021faa106b9b')],
    rio: [IMG('photo-1441974231531-c6227db76b6e')],
    deportes: [IMG('photo-1574629810360-7efbbe195018'), IMG('photo-1517649763962-0c623066013b')],
    conciertos: [IMG('photo-1470229722913-7c0e2dbbafd3'), IMG('photo-1493225457124-a3eb161ffa5f')],
    pet: [IMG('photo-1543466835-00a7907e9de1')],
    cultura: [IMG('photo-1460661419201-fd4cecdf8a8b')],
    gaming: [IMG('photo-1542751371-adc38448a05e')],
  };
  const coversFor = cat => COVERS[cat] || COVERS.chill;

  const BARRIOS = ['Barzal', 'Centro', 'Buenavista', 'La Esperanza', 'Siete de Agosto', 'La Primavera', 'Catama', 'La Vega', 'Caudal', 'San Isidro', 'El Buque', 'Villa Julia', 'Porfía', 'Montecarlo', 'Los Centauros', 'La Grama', 'Covisan', 'El Estero'];

  const ICEBREAKERS = {
    rumba: '¿Cuál es el tema que no puede faltar hoy?',
    comida: '¿Qué es lo primero que piden apenas lleguen?',
    chill: '¿Qué playlist ponemos para arrancar?',
    pueblear: '¿Quién lleva el termo con tinto para el mirador?',
    rio: '¿Quién lleva la olla y quién el plátano?',
    deportes: '¿Cómo armamos los equipos sin que nadie se ponga bravo?',
    conciertos: '¿Qué canción tienen que tocar sí o sí?',
    pet: '¿Cómo se llaman sus peludos?',
    cultura: '¿Ya habían hecho algo parecido antes?',
    gaming: '¿Cuál es su main y quién se le mide a un 1 vs 1?',
  };

  const ALIADOS = {
    rumba: { comercio: 'Los Capachos Bar', desc: '20% en la primera ronda', codigo: 'CAPACHOS20' },
    comida: { comercio: 'Mamona Don Ramiro', desc: 'Postre gratis por mesa', codigo: 'VACALLENA' },
    chill: { comercio: 'Café La Tostadora', desc: '2x1 en tintos de origen', codigo: 'TINTO2X1' },
    pueblear: { comercio: 'Tienda El Mirador', desc: '15% en mecato', codigo: 'MIRADOR15' },
    rio: { comercio: 'Asadero El Guatiquía', desc: '10% en el almuerzo', codigo: 'OLLA10' },
    deportes: { comercio: 'Hidratante Llanero', desc: 'Bebida gratis por jugador', codigo: 'GOLAZO' },
    conciertos: { comercio: 'Las Malocas', desc: '15% en la barra', codigo: 'TOQUE15' },
    pet: { comercio: 'Pet Shop El Peludo', desc: 'Snack gratis para tu perro', codigo: 'GUAU' },
    cultura: { comercio: 'Librería La Ceiba', desc: '10% en libros', codigo: 'CULTURA10' },
    gaming: { comercio: 'Gamer Zone Villavo', desc: '1 hora gratis de consola', codigo: 'GGWP' },
  };

  const AV_OPTS = {
    piel: ['#f3d2b3', '#e0ac7e', '#b87a4b', '#8a5530', '#5a3520'],
    pelo: ['corto', 'afro', 'gorra', 'trenzas', 'rapado', 'largo', 'mono'],
    gafas: ['ninguna', 'redondas', 'sol', 'visor'],
    ropa: ['hoodie', 'camiseta', 'chaqueta', 'esqueleto'],
    fondo: ['naranja', 'negro', 'blanco', 'rayas'],
  };
  const AV_LABELS = {
    pelo: { corto: 'Corto', afro: 'Afro', gorra: 'Gorra', trenzas: 'Trenzas', rapado: 'Rapado', largo: 'Largo', mono: 'Moño' },
    gafas: { ninguna: 'Sin gafas', redondas: 'Redondas', sol: 'De sol', visor: 'Visor' },
    ropa: { hoodie: 'Hoodie', camiseta: 'Camiseta', chaqueta: 'Chaqueta', esqueleto: 'Esqueleto' },
    fondo: { naranja: 'Naranja', negro: 'Negro', blanco: 'Blanco', rayas: 'Rayas' },
  };

  const NOMBRES = [
    ['Laura M.', 'Barzal'], ['Santi R.', 'La Esperanza'], ['Valen G.', 'Buenavista'], ['Mafe P.', 'Centro'],
    ['Juancho L.', 'Catama'], ['Dani T.', 'Siete de Agosto'], ['Caro V.', 'La Primavera'], ['Andrés F.', 'Caudal'],
    ['Nico B.', 'El Buque'], ['Sofi H.', 'Porfía'], ['Pipe C.', 'Villa Julia'], ['Majo A.', 'Montecarlo'],
    ['Kevin O.', 'Covisan'], ['Luisa D.', 'San Isidro'], ['Tato Q.', 'La Vega'], ['Isa N.', 'El Estero'],
  ];
  const PEOPLE = NOMBRES.map(([nombre, barrio], i) => {
    const h = hash(nombre);
    return {
      id: 'p' + (i + 1), nombre, barrio,
      rating: (4.3 + (h % 7) / 10).toFixed(1) * 1,
      av: {
        piel: h % 5,
        pelo: AV_OPTS.pelo[(h >> 3) % AV_OPTS.pelo.length],
        gafas: AV_OPTS.gafas[(h >> 5) % 4 === 3 ? 0 : (h >> 5) % 4],
        ropa: AV_OPTS.ropa[(h >> 7) % 4],
        fondo: AV_OPTS.fondo[(h >> 9) % 4],
      },
    };
  });
  // Personas reales (perfiles de Supabase) por uuid
  const peopleCache = new Map();
  const personById = id => PEOPLE.find(p => p.id === id) || peopleCache.get(id);

  const CHAT_LINES = {
    rumba: ['¿Alguien sabe si hay cover?', 'Yo llego tipo 9, guárdenme puesto', 'Que no falte el reguetón viejo', 'Voy con una amiga, ¿hay cupo?'],
    comida: ['Yo voy con hambre de tres días', '¿Pagamos por aparte o hacemos vaca?', 'Dicen que la mamona ahí es brutal'],
    chill: ['Yo llevo cartas', '¿Llevo parlante?', 'Plan perfecto para bajar el estrés'],
    pueblear: ['¿Salimos juntos desde el centro?', 'Lleven chaqueta, arriba hace viento', 'El atardecer desde ahí es otra cosa'],
    rio: ['Yo llevo la leña', '¿Hay que llevar bloqueador? Obvio', 'Ojo con la corriente, nada de hacerse el valiente'],
    deportes: ['Yo tapo, tranquilos', '¿Alguien tiene balón número 5?', 'Lleven petos de dos colores'],
    conciertos: ['¿A qué hora abren puertas?', 'Me sé todo el repertorio', 'Nos vemos adelante'],
    pet: ['Mi perra es súper sociable', 'Lleven bolsitas', '¿Hay agua para los peludos?'],
    cultura: ['Nunca he hecho esto, voy a aprender', '¿Hay que llevar materiales?', 'Qué buen plan'],
    gaming: ['Llevo mi control', '¿Es por equipos o todos contra todos?', 'Hoy no me gana nadie'],
  };
  const REPLIES = ['De una', 'Hágale', 'Melo', 'Listo, nos vemos allá', 'Jajaja sí señor', 'Todo bien', 'Va pa esa', 'Confirmado'];

  /* =====================================================================
     3. AVATAR URBANO SVG
  ===================================================================== */
  let avUid = 0;
  function avatarSVG(cfg = {}) {
    const c = Object.assign({ piel: 0, pelo: 'corto', gafas: 'ninguna', ropa: 'hoodie', fondo: 'naranja' }, cfg);
    const skin = AV_OPTS.piel[c.piel] || AV_OPTS.piel[0];
    const K = '#111', O = '#FF5A1F', W = '#fff';
    const bg = { naranja: O, negro: K, blanco: W, rayas: W }[c.fondo] || O;
    const st = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
    const id = 'avc' + (++avUid);
    let s = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><clipPath id="${id}"><rect width="100" height="100"/></clipPath></defs><g clip-path="url(#${id})">`;
    s += `<rect width="100" height="100" fill="${bg}"/>`;
    if (c.fondo === 'rayas') for (let i = -2; i < 8; i++) s += `<path d="M${i * 16} 110 L${i * 16 + 60} -10" stroke="${O}" stroke-width="5"/>`;
    if (c.fondo === 'negro') s += `<path d="M16 18l2 4 4 .6-3 2.8.7 4.4-3.7-2-3.7 2 .7-4.4-3-2.8 4-.6z" fill="${O}"/><path d="M84 24l-5 8h5l-4 7" fill="none" stroke="${O}" stroke-width="2.5" stroke-linecap="round"/>`;
    if (c.fondo === 'naranja') s += `<path d="M12 70l6-3M10 60l7 0M82 66l7-3M84 56h7" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`;

    // Pelo trasero
    if (c.pelo === 'afro') s += `<circle cx="50" cy="37" r="27" fill="${K}"/><circle cx="29" cy="31" r="12" fill="${K}"/><circle cx="71" cy="31" r="12" fill="${K}"/>`;
    if (c.pelo === 'largo') s += `<path d="M27 40 C26 16 74 16 73 40 L77 80 L23 80 Z" fill="${K}"/>`;
    if (c.pelo === 'trenzas') s += `<path d="M31 42 L27 80 M69 42 L73 80" stroke="${K}" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="5 2.2"/>`;
    if (c.pelo === 'mono') s += `<circle cx="50" cy="16" r="8.5" fill="${K}"/>`;

    // Cuerpo + ropa
    const body = 'M10 106 C10 80 28 71 50 71 C72 71 90 80 90 106 Z';
    if (c.ropa === 'hoodie') {
      s += `<path d="${body}" fill="${O}" ${st}/><path d="M33 74 C37 86 63 86 67 74" fill="none" ${st}/><path d="M45 82 L44 94 M55 82 L56 94" ${st}/><path d="M36 106 V96 H64 V106" fill="none" ${st}/>`;
    } else if (c.ropa === 'camiseta') {
      s += `<path d="${body}" fill="${W}" ${st}/><path d="M41 72 Q50 81 59 72" fill="none" ${st}/><path d="M50 85l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="${O}" stroke="${K}" stroke-width="1.8" stroke-linejoin="round"/>`;
    } else if (c.ropa === 'chaqueta') {
      s += `<path d="${body}" fill="${K}" ${st}/><path d="M50 76 V106" stroke="${O}" stroke-width="3"/><path d="M40 72 L50 88 L44 72 Z M60 72 L50 88 L56 72 Z" fill="${W}" stroke="${K}" stroke-width="2"/><path d="M24 92 h9 M67 92 h9" stroke="${O}" stroke-width="3" stroke-linecap="round"/>`;
    } else {
      s += `<path d="${body}" fill="${skin}" ${st}/><path d="M32 106 L35 79 Q50 88 65 79 L68 106 Z" fill="${K}" ${st}/><path d="M38 94 H62" stroke="${O}" stroke-width="4"/>`;
    }

    // Cuello, orejas, cabeza
    s += `<path d="M43 58 L43 73 Q50 78 57 73 L57 58 Z" fill="${skin}" ${st}/>`;
    s += `<ellipse cx="29.5" cy="47" rx="4.5" ry="6" fill="${skin}" ${st}/><ellipse cx="70.5" cy="47" rx="4.5" ry="6" fill="${skin}" ${st}/>`;
    s += `<ellipse cx="50" cy="45" rx="20.5" ry="23" fill="${skin}" ${st}/>`;
    // Cara
    s += `<path d="M38 38.5 Q42 36 46 38 M54 38 Q58 36 62 38.5" fill="none" stroke="${K}" stroke-width="2.6" stroke-linecap="round"/>`;
    s += `<ellipse cx="42" cy="45.5" rx="2.4" ry="3" fill="${K}"/><ellipse cx="58" cy="45.5" rx="2.4" ry="3" fill="${K}"/>`;
    s += `<path d="M50 47.5 Q48.2 52 51 52.5" fill="none" stroke="${K}" stroke-width="2.2" stroke-linecap="round"/>`;
    s += `<path d="M43.5 57 Q50 62.5 56.5 57" fill="none" stroke="${K}" stroke-width="2.8" stroke-linecap="round"/>`;
    s += `<ellipse cx="37" cy="53" rx="3" ry="1.8" fill="${O}" opacity=".45"/><ellipse cx="63" cy="53" rx="3" ry="1.8" fill="${O}" opacity=".45"/>`;

    // Pelo frontal / gorra
    const top = {
      corto: `<path d="M29.5 43 C28 25 40 19 51 19.5 C63 20 72 27 70.5 43 C67 33 60 29.5 50 30 C41 30.5 34 34 29.5 43Z" fill="${K}"/>`,
      afro: `<path d="M30 40 C30 25 70 25 70 40 C64 32 36 32 30 40Z" fill="${K}"/>`,
      rapado: `<path d="M30 40 C30 23 70 23 70 40 C64 31 36 31 30 40Z" fill="${K}" opacity=".3"/>`,
      trenzas: `<path d="M29.5 43 C28 25 40 19 50 19.5 C60 19 72 25 70.5 43 C66 31 56 28 50 28 C44 28 34 31 29.5 43Z" fill="${K}"/><path d="M50 20 V28" stroke="${skin}" stroke-width="1.6"/>`,
      largo: `<path d="M29 44 C27 24 40 19 50 19.5 C62 19 73 25 71 44 C66 34 58 28 50 33 C43 28 34 33 29 44Z" fill="${K}"/>`,
      mono: `<path d="M29.5 42 C29 24 71 24 70.5 42 C65 31 35 31 29.5 42Z" fill="${K}"/>`,
      gorra: `<path d="M28.5 40 C28 21 72 21 71.5 40 Z" fill="${O}" ${st}/><path d="M25 40 Q50 32 75 40 L76 45 Q50 37 24 45 Z" fill="${K}" stroke="${K}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="50" cy="23.5" r="2.2" fill="${K}"/><path d="M46 33 l3-5 h3 l-2 3 h3 l-4 5" fill="none" stroke="${K}" stroke-width="1.8" stroke-linejoin="round"/>`,
    };
    s += top[c.pelo] || top.corto;

    // Gafas
    if (c.gafas === 'redondas') s += `<g fill="none" stroke="${K}" stroke-width="2.6"><circle cx="42" cy="45.5" r="6"/><circle cx="58" cy="45.5" r="6"/><path d="M48 45.5h4M36 44l-6-1.5M64 44l6-1.5"/></g>`;
    if (c.gafas === 'sol') s += `<g stroke="${K}" stroke-width="2.4" stroke-linejoin="round"><path d="M34 41h14v4.5a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z" fill="${K}"/><path d="M52 41h14v4.5a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z" fill="${K}"/><path d="M48 42.5h4M34 42l-5-1M66 42l5-1" fill="none"/></g><path d="M37 45l4-2.5M55 45l4-2.5" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`;
    if (c.gafas === 'visor') s += `<path d="M31 40.5h38v6.5a3 3 0 0 1-3 3H34a3 3 0 0 1-3-3z" fill="${O}" stroke="${K}" stroke-width="2.6" stroke-linejoin="round"/><path d="M36 44h10" stroke="${W}" stroke-width="2" stroke-linecap="round"/>`;

    s += '</g></svg>';
    return s;
  }

  /* =====================================================================
     4. DATOS SEMILLA Y PERSISTENCIA
  ===================================================================== */
  const PERFIL_DEF = {
    nombre: 'Camilo Rojas', primer: 'Camilo', tel: '3104567890', mail: 'camilo.rojas@gmail.com', ciudad: 'Villavicencio',
    mostrar_foto_real: false,
    foto_encuadre: { src: '', zoom: 1, x: 0, y: 0 },
    avatar_config: { piel: 1, pelo: 'gorra', gafas: 'sol', ropa: 'hoodie', fondo: 'negro' },
    intereses: ['rumba', 'deportes', 'conciertos', 'rio'],
    rating: 4.8, resenas: 42,
  };
  let perfil = Object.assign({}, PERFIL_DEF, store.get(KEYS.perfil, {}));

  const ME = () => ({ id: 'me', nombre: perfil.primer + ' ' + (perfil.nombre.split(' ')[1] || '').charAt(0) + '.', rating: perfil.rating, me: true });

  const ppl = (...ids) => ids.map(n => 'p' + n);

  function buildSeeds() {
    const base = [
      {
        id: 's1', titulo: 'Hora feliz 2x1 en La Terraza Llanera', categoria: 'rumba',
        descripcion: 'Parche Relámpago de un local aliado: 2x1 en cócteles mientras dure la hora feliz. Música llanera y reguetón, terraza al aire libre.',
        inicio: soon(40), lugar: 'La Terraza Llanera', barrio: 'Barzal', lat: 4.1468, lng: -73.6372,
        costo: 0, presupuesto: 25000, cuposMax: 20, confirmados: ppl(1, 4, 6, 9, 11, 13, 2, 7, 15, 16, 10),
        creadorId: null, creadorNombre: 'La Terraza Llanera', creadorRating: 4.7, aliado: true,
        relampago: true, promo: '2x1 en cócteles las próximas 2 horas', imagen: COVERS.rumba[0],
        cupon: { comercio: 'La Terraza Llanera', desc: '2x1 en la primera ronda', codigo: 'PARCHE2X1' }, clima: { tipo: 'sol', temp: 29, prob: 10 },
      },
      {
        id: 's2', titulo: 'Micro en La Bombonera', categoria: 'deportes',
        descripcion: 'Falta poquito para completar los dos equipos. Cancha sintética con luz, se paga entre todos. Nivel recocha, nada de ponerse bravos.',
        inicio: soon(85), lugar: 'Canchas Sintéticas La Bombonera', barrio: 'La Esperanza', lat: 4.1338, lng: -73.6195,
        costo: 8000, presupuesto: 12000, cuposMax: 10, confirmados: ppl(2, 5, 8, 9, 11, 13, 14, 15),
        creadorId: 'p2', imagen: COVERS.deportes[0], clima: { tipo: 'nubes', temp: 27, prob: 25 },
      },
      {
        id: 's3', titulo: 'Rumba en Los Capachos', categoria: 'rumba',
        descripcion: 'Arrancamos con unas frías y cerramos bailando. Mesa reservada para el grupo, el cover incluye la primera.',
        inicio: todayAt(21, 30, 190), lugar: 'Los Capachos Bar', barrio: 'Centro', lat: 4.1500, lng: -73.6310,
        costo: 15000, presupuesto: 45000, cuposMax: 12, confirmados: ppl(1, 3, 4, 6, 7, 9, 10, 12, 13, 14, 16, 5),
        creadorId: 'p4', imagen: COVERS.rumba[1], clima: { tipo: 'sol', temp: 26, prob: 15 },
      },
      {
        id: 's4', titulo: 'Cine y arcade en Primavera Urbana', categoria: 'gaming',
        descripcion: 'Película de estreno y después nos medimos en el arcade. Si llueve no pasa nada, todo es bajo techo.',
        inicio: soon(130), lugar: 'C.C. Primavera Urbana', barrio: 'La Primavera', lat: 4.1302, lng: -73.6318,
        costo: 0, presupuesto: 30000, cuposMax: 8, confirmados: ppl(8, 12, 16),
        creadorId: 'p8', imagen: COVERS.gaming[0], clima: { tipo: 'lluvia', temp: 25, prob: 60 },
      },
      {
        id: 's5', titulo: 'Ruta de antojos llaneros', categoria: 'comida',
        descripcion: 'Pandeyuca, empanadas de pipián y cerramos con una mamona. Vamos caminando entre puestos del centro.',
        inicio: todayAt(19, 30, 150), lugar: 'Plaza de mercado San Isidro', barrio: 'San Isidro', lat: 4.1395, lng: -73.6345,
        costo: 0, presupuesto: 35000, cuposMax: 8, confirmados: ppl(3, 6, 10, 14),
        creadorId: 'p14', imagen: COVERS.comida[0], clima: { tipo: 'nubes', temp: 27, prob: 30 },
      },
      {
        id: 's6', titulo: 'Atardecer en la Piedra del Amor', categoria: 'pueblear',
        descripcion: 'Subimos al mirador de Buenavista a ver cómo se prende Villavo. Salimos en grupo desde el centro y bajamos juntos.',
        inicio: at(1, 16, 30), lugar: 'Mirador La Piedra del Amor', barrio: 'Buenavista', lat: 4.1640, lng: -73.6640,
        costo: 0, presupuesto: 15000, cuposMax: 15, confirmados: ppl(3, 5, 7, 9, 11, 15, 16),
        creadorId: 'p3', imagen: COVERS.pueblear[0], unido: true, clima: { tipo: 'sol', temp: 24, prob: 15 },
        ruta: [{ who: 'p5', tipo: 'carro', cupos: 3, barrio: 'Catama' }, { who: 'p9', tipo: 'busca', barrio: 'El Buque' }],
      },
      {
        id: 's7', titulo: 'Café de origen en el Siete de Agosto', categoria: 'chill',
        descripcion: 'Cata de café del Meta con el barista de la casa. Plan tranquilo para conocer gente y charlar sin afán.',
        inicio: at(1, 15, 0), lugar: 'Café La Tostadora', barrio: 'Siete de Agosto', lat: 4.1450, lng: -73.6285,
        costo: 0, presupuesto: 18000, cuposMax: 6, confirmados: ppl(6, 12),
        creadorId: 'p6', imagen: COVERS.chill[0], clima: { tipo: 'nubes', temp: 28, prob: 30 },
      },
      {
        id: 's8', titulo: 'Tarde de frisbee y picnic', categoria: 'chill',
        descripcion: 'Cada uno lleva algo para compartir. Frisbee, cartas y parlante. Si llueve tenemos Plan B bajo techo.',
        inicio: at(1, 16, 0), lugar: 'Parque Los Fundadores', barrio: 'Centro', lat: 4.1530, lng: -73.6352,
        costo: 0, presupuesto: 10000, cuposMax: 10, confirmados: ppl(1, 2, 10, 12, 15),
        creadorId: 'me', propio: true, unido: true, imagen: COVERS.chill[1],
        planB: 'Plazoleta cubierta del C.C. Primavera Urbana', clima: { tipo: 'lluvia', temp: 25, prob: 70 },
        ruta: [{ who: 'p1', tipo: 'moto', cupos: 1, barrio: 'Barzal' }],
      },
      {
        id: 's9', titulo: 'Ruta en bici a Restrepo', categoria: 'deportes',
        descripcion: 'Rodada de 30 km ida y vuelta. Desayuno en el parque de Restrepo. Casco obligatorio, ritmo para todos.',
        inicio: at(2, 6, 0), lugar: 'Glorieta de Catama, salida a Restrepo', barrio: 'Catama', lat: 4.1745, lng: -73.6285,
        costo: 0, presupuesto: 20000, cuposMax: 20, confirmados: ppl(2, 4, 5, 8, 11, 13, 14, 15, 16),
        creadorId: 'p5', imagen: COVERS.deportes[1], clima: { tipo: 'sol', temp: 23, prob: 10 },
      },
      {
        id: 's10', titulo: 'Caminata perruna en La Grama', categoria: 'pet',
        descripcion: 'Paseo de una hora con los peludos y después tinto. Traigan bolsitas y agua.',
        inicio: at(2, 7, 30), lugar: 'Parque La Grama', barrio: 'La Grama', lat: 4.1480, lng: -73.6255,
        costo: 0, presupuesto: 0, cuposMax: 15, confirmados: ppl(1, 7, 10, 16),
        creadorId: 'p7', imagen: COVERS.pet[0], clima: { tipo: 'sol', temp: 24, prob: 5 },
      },
      {
        id: 's11', titulo: 'Paseo de olla al Guatiquía', categoria: 'rio',
        descripcion: 'Sancocho a la orilla del río, cada uno aporta algo. Salimos temprano para coger buen puesto.',
        inicio: at(3, 9, 0), lugar: 'Balneario río Guatiquía', barrio: 'La Vega', lat: 4.1705, lng: -73.6105,
        costo: 0, presupuesto: 15000, cuposMax: 25, confirmados: ppl(1, 3, 4, 5, 6, 9, 10, 11, 12, 14, 15, 16),
        creadorId: 'p15', imagen: COVERS.rio[0], unido: true, clima: { tipo: 'sol', temp: 30, prob: 20 },
        ruta: [{ who: 'p11', tipo: 'carro', cupos: 2, barrio: 'Villa Julia' }],
      },
      {
        id: 's12', titulo: 'Toque de joropo y rock en Las Malocas', categoria: 'conciertos',
        descripcion: 'Bandas locales mezclando arpa llanera con guitarras eléctricas. Entrada con boleta, nos vemos adelante.',
        inicio: at(4, 19, 0), lugar: 'Parque Las Malocas', barrio: 'Vía Puerto López', lat: 4.1110, lng: -73.5905,
        costo: 20000, presupuesto: 50000, cuposMax: 40, confirmados: ppl(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 15),
        creadorId: 'p9', imagen: COVERS.conciertos[0], clima: { tipo: 'nubes', temp: 26, prob: 35 },
      },
      {
        id: 's13', titulo: 'Taller de cerámica llanera', categoria: 'cultura',
        descripcion: 'Aprendemos a hacer piezas con motivos del Llano. Materiales incluidos en la entrada.',
        inicio: at(5, 15, 0), lugar: 'Casa de la Cultura', barrio: 'Centro', lat: 4.1515, lng: -73.6335,
        costo: 25000, presupuesto: 35000, cuposMax: 10, confirmados: ppl(6, 12, 16, 7),
        creadorId: 'p16', imagen: COVERS.cultura[0], clima: { tipo: 'sol', temp: 28, prob: 15 },
      },
      {
        id: 's14', titulo: 'Torneo de FIFA y pizza', categoria: 'gaming',
        descripcion: 'Eliminación directa, 1 vs 1. El ganador no paga pizza. Lleva tu control si tienes.',
        inicio: at(6, 18, 0), lugar: 'Gamer Zone Villavo', barrio: 'Caudal', lat: 4.1405, lng: -73.6205,
        costo: 10000, presupuesto: 30000, cuposMax: 16, confirmados: ppl(8, 11, 13, 2, 5, 9),
        creadorId: 'p13', imagen: COVERS.gaming[0], clima: { tipo: 'lluvia', temp: 25, prob: 55 },
      },
      {
        id: 's0', titulo: 'Noche de trivia en Barzal', categoria: 'chill',
        descripcion: 'Preguntas de cultura llanera, música y fútbol. Ganamos el segundo puesto.',
        inicio: at(-2, 20, 0), lugar: 'Bar La Tertulia', barrio: 'Barzal', lat: 4.1458, lng: -73.6345,
        costo: 0, presupuesto: 20000, cuposMax: 8, confirmados: ppl(1, 3, 7, 12),
        creadorId: 'p1', imagen: COVERS.chill[1], unido: true, checkin: true, calificado: true,
      },
    ];
    return base.map(normalizeParche).map(p => { p.chat = seedChat(p); return p; });
  }

  function normalizeParche(p) {
    return Object.assign({
      confirmados: [], unido: false, propio: false, ruta: [], chat: [], planB: '', planBActivo: false,
      relampago: false, aliado: false, checkin: false, calificado: false, botRompehielos: false, cuponDesbloqueado: false,
      creadorId: null, imagen: '',
    }, p);
  }

  function seedChat(p) {
    const lines = CHAT_LINES[p.categoria] || CHAT_LINES.chill;
    const out = [{ tipo: 'sys', texto: `${creatorName(p)} abrió el parche`, ts: p.inicio - 26 * HOUR }];
    p.confirmados.slice(0, 3).forEach((id, i) => {
      out.push({ tipo: 'user', autor: id, texto: lines[i % lines.length], ts: Date.now() - (50 - i * 12) * MIN });
    });
    return out;
  }

  const state = {
    parches: [], notifs: [], frecuentes: [],
    view: 'radar', cat: 'todos', budget: 'todos', dist: 25, sort: 'pronto', search: '', desparchado: false,
    time: { mode: 'hoy', date: null }, misTab: 'unido',
  };

  function loadState() {
    const saved = store.get(KEYS.state, null);
    const today = todayKey();
    if (saved && saved.seedDay === today && Array.isArray(saved.parches)) {
      state.parches = saved.parches.map(normalizeParche);
    } else {
      // Día nuevo: semillas frescas + lo que el usuario creó y sigue vigente
      const mios = (saved && saved.parches || []).filter(p => p.creadoPorMi && p.inicio > Date.now() - 6 * HOUR).map(normalizeParche);
      state.parches = buildSeeds().concat(mios);
    }
    state.notifs = saved && saved.seedDay === today && saved.notifs ? saved.notifs : defaultNotifs();
    state.frecuentes = saved && saved.frecuentes ? saved.frecuentes : ['p1', 'p3', 'p7', 'p12'];
    state.parches.forEach(p => checkMilestones(p, true));
  }

  function save() {
    if (!DEMO) return; // con sesión, los datos viven en Supabase
    const parches = state.parches.map(p => { const c = Object.assign({}, p); delete c._drop; return c; });
    store.set(KEYS.state, { seedDay: todayKey(), parches, notifs: state.notifs.slice(0, 30), frecuentes: state.frecuentes });
  }
  const savePerfil = () => {
    if (!DEMO) return;
    if (!store.set(KEYS.perfil, perfil)) toast('No se pudo guardar', 'La foto es muy pesada para guardarla en este navegador.', { type: 'error' });
  };

  function defaultNotifs() {
    return [
      { id: 'n1', icon: 'i-flame', html: '<b>Micro en La Bombonera</b> está a 2 cupos de llenarse.', ts: Date.now() - 12 * MIN, leida: false, parche: 's2' },
      { id: 'n2', icon: 'i-users-plus', html: '<b>Laura M.</b> le cayó a tu parche de frisbee.', ts: Date.now() - 48 * MIN, leida: false, parche: 's8' },
      { id: 'n3', icon: 'i-w-rain', html: 'Alerta Llanera: 70% de lluvia mañana en <b>Parque Los Fundadores</b>. Ten listo tu Plan B.', ts: Date.now() - 2 * HOUR, leida: false, parche: 's8' },
      { id: 'n4', icon: 'i-medal', html: 'Desbloqueaste la insignia <b>Firme en el Parche</b>.', ts: Date.now() - 26 * HOUR, leida: true },
    ];
  }

  /* =====================================================================
     5. CÁLCULOS
  ===================================================================== */
  const findP = id => state.parches.find(p => p.id === id);
  const ocupados = p => p.confirmados.length + (p.unido ? 1 : 0);
  const libres = p => Math.max(0, p.cuposMax - ocupados(p));
  const isFull = p => ocupados(p) >= p.cuposMax;
  const distKm = p => haversine(USER_POS, [p.lat, p.lng]);
  const fmtKm = km => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
  const gasto = p => Math.max(Number(p.costo) || 0, Number(p.presupuesto) || 0);
  const isFree = p => gasto(p) === 0;
  const isPast = p => p.inicio < Date.now() - 3 * HOUR;
  const creatorName = p => p.creadorId === 'me' ? ME().nombre : p.creadorId ? (personById(p.creadorId)?.nombre || 'Parcero') : (p.creadorNombre || 'Local aliado');
  const creatorRating = p => p.creadorId === 'me' ? perfil.rating : p.creadorId ? (personById(p.creadorId)?.rating || 4.6) : (p.creadorRating || 4.6);
  const isMine = p => p.propio || p.creadorId === 'me';

  function vibra(p) {
    let v = 50 + (hash(p.id) % 12);
    if (perfil.intereses.includes(p.categoria)) v += 27;
    v += Math.max(0, 12 - distKm(p) * 1.4);
    if (gasto(p) <= 20000) v += 4;
    if (p.relampago) v += 3;
    return clamp(Math.round(v), 35, 99);
  }

  function clima(p) {
    if (p.clima) return p.clima;
    const h = hash(p.id + 'w') % 10;
    const hour = new Date(p.inicio).getHours();
    const tipo = h < 3 ? 'lluvia' : h < 5 ? 'nubes' : 'sol';
    return { tipo, temp: hour < 8 || hour > 19 ? 24 + (h % 3) : 28 + (h % 5), prob: tipo === 'lluvia' ? 55 + h * 4 : 10 + h * 3 };
  }
  const CLIMA_TXT = { sol: 'Soleado', nubes: 'Nublado', lluvia: 'Lluvia probable' };
  const CLIMA_IC = { sol: 'i-w-sun', nubes: 'i-w-cloud', lluvia: 'i-w-rain' };

  const nivelBudget = p => { const g = gasto(p); return g <= 15000 ? 'eco' : g <= 40000 ? 'moderado' : 'full'; };

  function matchesSearch(p) {
    if (!state.search) return true;
    const hay = norm([p.titulo, p.lugar, p.barrio, catById(p.categoria).label, creatorName(p), p.planBActivo ? p.planB : ''].join(' '));
    return norm(state.search).split(/\s+/).every(w => hay.includes(w));
  }
  const isDesparche = p => {
    const t = p.inicio - Date.now();
    return t >= -5 * MIN && t <= 2 * HOUR && !isFull(p) && distKm(p) <= state.dist;
  };
  const activeList = () => state.parches.filter(p => p.inicio > Date.now() - 90 * MIN);

  function radarFiltered({ ignoreCat = false } = {}) {
    let l = activeList().filter(matchesSearch);
    if (!ignoreCat && state.cat !== 'todos') l = l.filter(p => p.categoria === state.cat);
    if (state.budget !== 'todos') l = l.filter(p => nivelBudget(p) === state.budget);
    l = l.filter(p => distKm(p) <= state.dist);
    if (state.desparchado) l = l.filter(isDesparche);
    return l;
  }
  function sortList(l) {
    const by = {
      pronto: (a, b) => a.inicio - b.inicio,
      cerca: (a, b) => distKm(a) - distKm(b),
      vibra: (a, b) => vibra(b) - vibra(a),
      barato: (a, b) => gasto(a) - gasto(b) || a.inicio - b.inicio,
    }[state.sort];
    return l.slice().sort(by);
  }

  function timeMatch(p) {
    const k = dayKey(p.inicio), m = state.time.mode;
    if (m === 'todos') return true;
    if (m === 'hoy') return k === todayKey();
    if (m === 'manana') return k === offsetKey(1);
    return k === state.time.date;
  }
  function mapFiltered() {
    let l = activeList().filter(matchesSearch).filter(timeMatch);
    if (state.desparchado) l = l.filter(isDesparche);
    return l;
  }
  function timeLabel() {
    const m = state.time.mode;
    if (m === 'todos') return 'en total';
    if (m === 'hoy') return 'para hoy';
    if (m === 'manana') return 'para mañana';
    const d = daysFromToday(state.time.date);
    if (d >= 2 && d <= 6) return 'para el ' + weekdayLong(state.time.date);
    return 'para el ' + shortDate(state.time.date);
  }

  /* Hitos: bot rompehielos al 50% y cupón al 100% */
  function checkMilestones(p, silent = false) {
    const pct = ocupados(p) / p.cuposMax;
    if (pct >= 0.5 && !p.botRompehielos) {
      p.botRompehielos = true;
      const label = pct >= 1 ? 'Cupo completo' : `${Math.floor(pct * 100)}% del cupo lleno`;
      p.chat.push({ tipo: 'bot', texto: `${label} para caer a ${p.lugar}: ${ICEBREAKERS[p.categoria] || ICEBREAKERS.chill}`, ts: Date.now() - (silent ? 20 * MIN : 0) });
    }
    if (isFull(p) && !p.cuponDesbloqueado) {
      p.cuponDesbloqueado = true;
      if (!p.cupon) p.cupon = ALIADOS[p.categoria] || ALIADOS.chill;
      p.chat.push({ tipo: 'sys', texto: `Parche lleno. Se desbloqueó un cupón de ${p.cupon.comercio}.`, ts: Date.now() - (silent ? 10 * MIN : 0) });
      if (!silent && (p.unido || isMine(p))) {
        notify('i-tag', `<b>${esc(p.titulo)}</b> se llenó. Desbloqueaste un cupón de ${esc(p.cupon.comercio)}.`, p.id);
        toast('¡Cupón desbloqueado!', `${p.cupon.desc} en ${p.cupon.comercio}.`, { icon: 'i-tag' });
      }
    }
  }

  /* =====================================================================
     6. PLANTILLAS
  ===================================================================== */
  function avHTML(who, cls = '') {
    if (who === 'me' || (who && who.me)) {
      const f = perfil.foto_encuadre;
      if (perfil.mostrar_foto_real && f && f.src) {
        return `<span class="av ${cls}"><span class="av-photo"><img src="${esc(f.src)}" alt="" style="transform:translate(${f.x}%, ${f.y}%) scale(${f.zoom})"></span></span>`;
      }
      return `<span class="av ${cls}">${avatarSVG(perfil.avatar_config)}</span>`;
    }
    const person = typeof who === 'string' ? personById(who) : who;
    if (!person) return `<span class="av ${cls}">${avatarSVG({ fondo: 'naranja', pelo: 'gorra', ropa: 'chaqueta' })}</span>`;
    if (person.foto && person.foto.src) {
      const f = person.foto;
      return `<span class="av ${cls}" title="${esc(person.nombre)}"><span class="av-photo"><img src="${esc(f.src)}" alt="" style="transform:translate(${Number(f.x) || 0}%, ${Number(f.y) || 0}%) scale(${Number(f.zoom) || 1})"></span></span>`;
    }
    return `<span class="av ${cls}" title="${esc(person.nombre)}">${avatarSVG(person.av)}</span>`;
  }

  function stackHTML(p) {
    const ids = (p.unido ? ['me'] : []).concat(p.confirmados);
    const show = ids.slice(0, 4).map(id => avHTML(id)).join('');
    const rest = ids.length - 4;
    return `<div class="stack">${show}<span class="stack-more">${rest > 0 ? `<b>+${rest}</b> confirmados` : `<b>${ids.length}</b> ${ids.length === 1 ? 'confirmado' : 'confirmados'}`}</span></div>`;
  }

  function starsHTML(n) {
    let s = '<span class="stars" aria-label="' + n + ' de 5">';
    for (let i = 1; i <= 5; i++) s += ic('i-star', n >= i - 0.25 ? '' : 'is-off');
    return s + '</span>';
  }

  function ticketHTML(p) {
    return isFree(p)
      ? `<span class="pc-ticket is-free">Gratis</span>`
      : `<span class="pc-ticket tnum">${money(gasto(p))}<small>COP APROX</small></span>`;
  }

  function cardHTML(p, { preview = false, delay = 0 } = {}) {
    const cat = catById(p.categoria);
    const occ = ocupados(p), max = p.cuposMax, free = Math.max(0, max - occ), full = occ >= max;
    const pct = Math.min(100, Math.round(occ / max * 100));
    const w = clima(p);
    const mine = isMine(p);

    const topLeft = mine
      ? `<span class="pc-badge pc-own">${ic('i-crown')} Tu parche</span>`
      : `<span class="pc-badge pc-vibe">${ic('i-bolt')} ${vibra(p)}% tu vibra</span>`;
    const urgent = !full && free < 3 ? `<span class="pc-badge pc-urgent">${ic('i-flame')} ${free === 1 ? 'Último cupo' : `Últimos ${free} cupos`}</span>` : '';
    const flash = p.relampago ? `<span class="pc-badge pc-flash">${ic('i-bolt')} Relámpago</span>` : '';
    const ribbon = full ? `<div class="pc-full-ribbon" aria-hidden="true">Parche lleno</div>` : '';

    let actions;
    if (preview) {
      actions = `<button class="btn btn--primary" tabindex="-1">${ic('i-bolt')} Caerle al parche</button>`;
    } else if (mine) {
      actions = `<button class="btn btn--ghost" data-action="editar" data-id="${p.id}">${ic('i-edit')} Editar parche</button>
        <button class="icon-btn" data-action="cancelar" data-id="${p.id}" aria-label="Cancelar el parche" title="Cancelar el parche">${ic('i-trash')}</button>
        <button class="icon-btn" data-action="detalle" data-id="${p.id}" aria-label="Ver detalle y chat" title="Detalle y chat">${ic('i-chat')}</button>`;
    } else if (p.unido) {
      actions = `<button class="btn btn--alert" data-action="join" data-id="${p.id}">${ic('i-logout')} Abrirse del parche</button>
        <button class="icon-btn" data-action="detalle" data-id="${p.id}" aria-label="Ver detalle y chat" title="Detalle y chat">${ic('i-chat')}</button>`;
    } else if (full) {
      actions = `<button class="btn btn--ghost" disabled>${ic('i-lock')} Parche lleno</button>
        <button class="icon-btn" data-action="detalle" data-id="${p.id}" aria-label="Ver detalle" title="Ver detalle">${ic('i-info')}</button>`;
    } else {
      actions = `<button class="btn btn--primary" data-action="join" data-id="${p.id}">${ic('i-bolt')} Caerle al parche</button>
        <button class="icon-btn" data-action="detalle" data-id="${p.id}" aria-label="Ver detalle" title="Ver detalle">${ic('i-info')}</button>`;
    }

    const img = p.imagen ? `<img src="${esc(p.imagen)}" alt="" loading="lazy">` : '';
    const lugar = p.planBActivo && p.planB ? `Plan B: ${p.planB}` : p.lugar;

    return `
    <article class="parche-card ${full ? 'is-full' : ''} ${preview ? 'is-preview' : ''}" data-pid="${p.id}" style="--d:${delay}ms">
      <div class="pc-media ${p.imagen ? '' : 'no-img'}" ${preview ? '' : `data-action="detalle" data-id="${p.id}"`}>
        ${img}
        ${topLeft}${urgent}${flash}${ribbon}
        <div class="pc-band"><span>${ic(cat.icon)} ${esc(cat.label)}</span></div>
      </div>
      <div class="pc-body">
        ${ticketHTML(p)}
        <h3 class="pc-title">${preview ? esc(p.titulo || 'Tu parche') : `<button data-action="detalle" data-id="${p.id}">${esc(p.titulo)}</button>`}</h3>
        <p class="pc-desc">${esc(p.descripcion || 'Cuéntale a la gente qué se va a hacer.')}</p>
        <ul class="pc-meta">
          <li>${ic('i-pin')}<span>${esc(lugar || 'Lugar por definir')}${p.barrio ? ` · ${esc(p.barrio)}` : ''}</span><span class="muted tnum">${fmtKm(distKm(p))}</span></li>
          <li>${ic('i-clock')}<span class="tnum">${esc(fmtCuando(p.inicio))}</span>${p.inicio > Date.now() && p.inicio - Date.now() < 3 * HOUR ? `<span class="muted tnum">${fmtETA(p.inicio)}</span>` : ''}</li>
          <li class="${w.tipo === 'lluvia' ? 'is-rain' : ''}">${ic(CLIMA_IC[w.tipo])}<span class="tnum">${w.temp}° · ${CLIMA_TXT[w.tipo]}${w.tipo === 'lluvia' ? ` (${w.prob}%)` : ''}</span></li>
        </ul>
        <div class="cupos-bar">
          <div class="cupos-bar-top"><span><b>${occ}</b>/${max} cupos</span><span>${full ? 'Completo' : `${free} ${free === 1 ? 'libre' : 'libres'}`}</span></div>
          <div class="meter ${free < 3 ? 'is-hot' : ''}"><i style="--p:${pct}%"></i></div>
        </div>
        <div class="pc-social">
          ${stackHTML(p)}
          <span class="creator">${ic('i-crown', 'ic-crown')}<span>${esc(creatorName(p))}</span><em>${ic('i-star')}${creatorRating(p).toFixed(1)}</em></span>
        </div>
      </div>
      <div class="pc-actions">${actions}</div>
    </article>`;
  }

  function skeletonHTML(n = 6) {
    return Array.from({ length: n }, () => `
      <div class="sk-card" aria-hidden="true">
        <span class="sk sk-media"></span>
        <div class="sk-body">
          <span class="sk sk-title"></span>
          <span class="sk sk-line"></span>
          <span class="sk sk-line" style="width:82%"></span>
          <span class="sk sk-line" style="width:56%"></span>
          <span class="sk sk-btn"></span>
        </div>
      </div>`).join('');
  }

  const EMPTY_ART = `
    <svg class="empty-art" viewBox="0 0 220 180" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <ellipse cx="110" cy="166" rx="56" ry="7" fill="currentColor" opacity=".14"/>
      <circle cx="110" cy="82" r="72" stroke="#FF5A1F" stroke-width="3" stroke-dasharray="7 11"/>
      <circle cx="110" cy="82" r="48" stroke="currentColor" stroke-width="2.5" stroke-dasharray="3 9" opacity=".55"/>
      <path d="M110 152s-38-33-38-62a38 38 0 0 1 76 0c0 29-38 62-38 62z" fill="#FF5A1F" stroke="currentColor" stroke-width="4"/>
      <circle cx="110" cy="88" r="18" fill="#fff" stroke="currentColor" stroke-width="4"/>
      <path d="M103.5 83a6.5 6.5 0 1 1 9.6 5.6c-2.1 1.2-3.1 2.4-3.1 4.6" stroke="#111" stroke-width="4"/>
      <circle cx="110" cy="99" r="1.2" fill="#111" stroke="#111" stroke-width="3"/>
      <path d="M38 36l3.2 6.6 7.2 1-5.2 5 1.2 7.2L38 52.4l-6.4 3.4 1.2-7.2-5.2-5 7.2-1z" fill="currentColor"/>
      <path d="M184 26l-9 15h9l-7 13" stroke="currentColor" stroke-width="4"/>
      <path d="M178 120l2 4 4.4.6-3.2 3 .8 4.4-4-2-4 2 .8-4.4-3.2-3 4.4-.6z" fill="#FF5A1F" stroke="currentColor" stroke-width="2"/>
      <path d="M30 118h14M37 111v14" stroke="#FF5A1F" stroke-width="4"/>
    </svg>`;

  function emptyHTML({ title, text, fecha = '', cta = 'Sé el primero en armar parche', action = 'crear' }) {
    return `<div class="empty">
      ${EMPTY_ART}
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      <div class="form-actions"><button class="btn btn--primary" data-action="${action}" ${fecha ? `data-fecha="${fecha}"` : ''}>${ic('i-plus')} ${esc(cta)}</button></div>
    </div>`;
  }

  function popupHTML(p) {
    const occ = ocupados(p), full = isFull(p), v = vibra(p), mine = isMine(p);
    const join = mine
      ? `<button class="btn btn--ghost" data-action="editar" data-id="${p.id}">${ic('i-edit')} Editar</button>`
      : p.unido
        ? `<button class="btn btn--alert" data-action="join" data-id="${p.id}">Abrirse</button>`
        : full
          ? `<button class="btn btn--ghost" disabled>Lleno</button>`
          : `<button class="btn btn--primary" data-action="join" data-id="${p.id}">Caerle</button>`;
    return `<div class="pop">
      <div class="pop-media">${p.imagen ? `<img src="${esc(p.imagen)}" alt="">` : ''}${mine ? `<span class="pc-badge pc-own" style="left:.5rem">${ic('i-crown')} Tuyo</span>` : `<span class="pc-badge pc-vibe" style="left:.5rem">${ic('i-bolt')} ${v}%</span>`}</div>
      <div class="pop-body">
        <h3 class="pop-title">${esc(p.titulo)}</h3>
        ${p.relampago ? `<div class="pop-flash">${ic('i-bolt')} ${esc(p.promo || 'Promo por tiempo limitado')}</div>` : ''}
        <div class="pop-vibe">
          <div class="pop-vibe-top"><span>Parcheómetro</span><b class="tnum">${mine ? 100 : v}%</b></div>
          <div class="meter"><i style="--p:${mine ? 100 : v}%"></i></div>
        </div>
        <div class="pop-rows">
          <span>${ic('i-clock')} ${esc(fmtCuando(p.inicio))}</span>
          <span>${ic('i-wallet')} ${isFree(p) ? 'Gratis' : money(gasto(p))}</span>
          <span>${ic('i-users')} ${full ? 'Lleno' : `${libres(p)} de ${p.cuposMax} libres`}</span>
          <span>${ic('i-pin')} ${fmtKm(distKm(p))}</span>
        </div>
        <div class="pop-actions">
          <button class="btn btn--ink" data-action="detalle" data-id="${p.id}">Detalle</button>
          ${join}
        </div>
      </div>
    </div>`;
  }

  /* =====================================================================
     7. VISTAS
  ===================================================================== */
  let skToken = 0;
  function withSkeleton(el, n, fn) {
    const t = ++skToken;
    el.innerHTML = skeletonHTML(n);
    setTimeout(() => { if (t === skToken) fn(); }, reduceMotion ? 0 : 400);
  }

  function go(view, { skeleton = true } = {}) {
    if (!$('#view-' + view)) return;
    state.view = view;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + view));
    $$('[data-nav]').forEach(b => {
      if (!b.classList.contains('nav-item') && !b.classList.contains('bn-item')) return;
      const on = b.dataset.nav === view;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
    closeNotif();

    if (view === 'radar') {
      renderCats();
      if (skeleton) withSkeleton($('#radar-grid'), 6, () => renderRadar(true)); else renderRadar();
      setTimeout(() => { radarMap && radarMap.invalidateSize(); renderRadarWidget(); }, 60);
    }
    if (view === 'mapa') {
      setTimeout(() => { initLiveMap(); liveMap.invalidateSize(); renderLiveMap(); }, 40);
    }
    if (view === 'mis') { if (skeleton) withSkeleton($('#mis-grid'), 3, () => renderMis(true)); else renderMis(); }
    if (view === 'parceros') renderParceros();
    if (view === 'perfil') renderPerfil();
  }

  /* ---------- Radar ---------- */
  function renderCats() {
    const base = radarFiltered({ ignoreCat: true });
    $('#cat-bar').innerHTML = CATS.map(c => {
      const n = c.id === 'todos' ? base.length : base.filter(p => p.categoria === c.id).length;
      const on = state.cat === c.id;
      return `<button class="cat-pill ${on ? 'is-active' : ''}" data-cat="${c.id}" aria-pressed="${on}"><i>${ic(c.icon)}</i>${esc(c.label)} <small>${n}</small></button>`;
    }).join('');
  }

  function renderRadar(animate = false) {
    renderCats();
    const list = sortList(radarFiltered());
    const grid = $('#radar-grid');
    const count = $('#radar-count');
    const hayFiltros = state.cat !== 'todos' || state.budget !== 'todos' || state.dist < 25 || state.search || state.desparchado;
    $('#reset-filters').hidden = !hayFiltros;
    count.innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'parche' : 'parches'} ${state.desparchado ? 'arrancan en las próximas 2 horas' : 'abiertos'}${state.cat !== 'todos' ? ` en ${esc(catById(state.cat).label)}` : ''}${state.search ? ` para "${esc(state.search)}"` : ''}`;

    if (!list.length) {
      let title = 'Nadie ha armado parche por aquí', text = 'Cambia los filtros o abre tu propio plan para que la gente se sume.';
      if (state.search) { title = `Nada para "${state.search}"`; text = 'Prueba con otro barrio, lugar o categoría.'; }
      else if (state.desparchado) { title = 'Nada arranca en las próximas 2 horas'; text = `Amplía el radio (vas en ${state.dist} km) o arma tú el parche y la gente cae.`; }
      else if (state.cat !== 'todos') { title = `Nadie ha armado ${catById(state.cat).label}`; text = 'Sé quien arranca. Los parches nuevos salen de primeras en el radar.'; }
      grid.innerHTML = emptyHTML({ title, text, fecha: todayKey() });
      return;
    }
    grid.classList.toggle('is-static', !animate);
    grid.innerHTML = list.map((p, i) => cardHTML(p, { delay: animate ? Math.min(i, 8) * 45 : 0 })).join('');
  }

  function renderHero() {
    $('#hero-name').textContent = perfil.primer;
    const hoy = activeList().filter(p => dayKey(p.inicio) === todayKey() && p.inicio > Date.now() - 30 * MIN).length;
    const pronto = activeList().filter(isDesparche).length;
    const mios = activeList().filter(p => p.unido || isMine(p)).length;
    $('#hero-stats').innerHTML = `
      <div class="stat stat--o"><b class="tnum">${hoy}</b><span>Parches hoy</span></div>
      <div class="stat stat--ink"><b class="tnum">${pronto}</b><span>Arrancan en 2 h</span></div>
      <div class="stat"><b class="tnum">${mios}</b><span>Tus parches</span></div>`;
    $('#hero-sub').textContent = state.desparchado
      ? `Modo radar inmediato: solo planes abiertos que arrancan en menos de 2 horas a ${state.dist} km o menos.`
      : 'Planes abiertos cerca de ti en Villavo. Escoge uno y cáele, o abre el tuyo.';
    $('#hero-clock').textContent = '· ' + fmtHora(Date.now());

    const banner = $('#desparche-banner');
    if (state.desparchado) {
      banner.hidden = false;
      banner.innerHTML = `<span class="radar-ping">${ic('i-radar')}</span>
        <div><h2>Radar inmediato encendido</h2><p class="tnum">${pronto} ${pronto === 1 ? 'parche abierto arranca' : 'parches abiertos arrancan'} en las próximas 2 horas a menos de ${state.dist} km.</p></div>
        <button class="btn btn--primary btn--xs" data-action="desparche-off">${ic('i-close')} Apagar</button>`;
    } else banner.hidden = true;
  }

  /* ---------- Mis parches ---------- */
  function renderMis(animate = false) {
    const tab = state.misTab;
    $$('#mis-seg .seg-btn').forEach(b => { const on = b.dataset.mis === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    let list;
    if (tab === 'unido') list = state.parches.filter(p => p.unido && !isMine(p) && !isPast(p) && !p.checkin);
    else if (tab === 'propios') list = state.parches.filter(p => isMine(p) && !isPast(p));
    else list = state.parches.filter(p => (p.checkin || (p.unido && isPast(p))));
    list.sort((a, b) => tab === 'historial' ? b.inicio - a.inicio : a.inicio - b.inicio);

    const grid = $('#mis-grid');
    if (!list.length) {
      const txt = {
        unido: ['Todavía no le has caído a ningún parche', 'Date una vuelta por el Radar y súmate a uno.', 'Ir al Radar', 'go-radar'],
        propios: ['No has armado ningún parche', 'Abre uno en dos minutos y la gente de Villavo se suma.', 'Abrir el parche', 'crear'],
        historial: ['Aún no tienes historial', 'Cuando hagas check-in en un parche aparecerá aquí.', 'Ir al Radar', 'go-radar'],
      }[tab];
      grid.innerHTML = emptyHTML({ title: txt[0], text: txt[1], cta: txt[2], action: txt[3] });
      return;
    }
    grid.classList.toggle('is-static', !animate);
    grid.innerHTML = list.map((p, i) => cardHTML(p, { delay: animate ? i * 45 : 0 })).join('');
  }

  /* ---------- Parceros ---------- */
  function parchesJuntos(pid) {
    return state.parches.filter(p => (p.unido || isMine(p)) && p.confirmados.includes(pid)).length + (hash(pid) % 4);
  }
  function personCard(person, frecuente, i) {
    const comunes = [...new Set(state.parches.filter(p => p.confirmados.includes(person.id)).map(p => p.categoria))].slice(0, 2);
    return `<article class="person ${frecuente ? 'is-frecuente' : ''}" style="--d:${i * 40}ms">
      <div class="person-top">
        ${avHTML(person.id)}
        <div><h3>${esc(person.nombre)}</h3><small>${esc(person.barrio)} · Villavicencio</small></div>
        ${frecuente ? '<span class="tag-frecuente">Frecuente</span>' : ''}
      </div>
      <div class="person-stats">
        <span class="tnum">${ic('i-star')} ${person.rating.toFixed(1)}</span>
        <span class="tnum">${ic('i-ticket')} ${parchesJuntos(person.id)} parches juntos</span>
        ${comunes.map(c => `<span>${ic(catById(c).icon)} ${esc(catById(c).label.split(' ')[0])}</span>`).join('')}
      </div>
      <div class="person-actions">
        ${frecuente
          ? `<button class="btn btn--primary btn--xs" data-action="invite" data-pid="${person.id}">${ic('i-send')} Invitar</button>
             <button class="btn btn--ghost btn--xs" data-action="remove-parcero" data-pid="${person.id}">Quitar</button>`
          : `<button class="btn btn--ink btn--xs" data-action="add-parcero" data-pid="${person.id}">${ic('i-users-plus')} Volver a parchar</button>`}
      </div>
    </article>`;
  }
  function renderParceros() {
    const fr = state.frecuentes.map(personById).filter(Boolean);
    $('#parceros-grid').innerHTML = fr.length
      ? fr.map((p, i) => personCard(p, true, i)).join('')
      : emptyHTML({ title: 'Aún no tienes parceros frecuentes', text: 'Después de un parche, califica a la gente y marca "Volver a parchar".', cta: 'Buscar un parche', action: 'go-radar' });
    const ids = new Set();
    state.parches.filter(p => p.unido || isMine(p)).forEach(p => p.confirmados.forEach(id => ids.add(id)));
    const sug = [...ids].filter(id => !state.frecuentes.includes(id)).map(personById).filter(Boolean).slice(0, 8);
    $('#sugeridos-grid').innerHTML = sug.map((p, i) => personCard(p, false, i)).join('') || '<p class="mini-note">Únete a más parches para conocer gente.</p>';
  }

  function renderNavCounts() {
    const n = state.parches.filter(p => (p.unido || isMine(p)) && !isPast(p) && !p.checkin).length;
    const el = $('#nav-count-mis');
    el.hidden = n === 0;
    el.textContent = n;
  }

  /* Repinta todo lo que depende del estado */
  function refresh() {
    renderHero();
    if (state.view === 'radar') { renderRadar(); renderRadarWidget(); }
    if (state.view === 'mapa') renderLiveMap();
    if (state.view === 'mis') renderMis();
    if (state.view === 'parceros') renderParceros();
    renderNavCounts();
    if (detailId) renderDetailParts();
  }

  /* =====================================================================
     8. MAPAS
  ===================================================================== */
  let liveMap = null, radarMap = null, createMap = null, createMarker = null;
  const liveMarkers = new Map();
  let radarLayer = null;

  const tileLayer = () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  });

  function pinIcon(p) {
    const cat = catById(p.categoria);
    const full = isFull(p), free = libres(p);
    const cls = ['pin', isMine(p) ? 'pin--own' : '', p.relampago ? 'pin--flash' : '', full ? 'pin--full' : '', p._drop ? 'pin--drop' : ''].join(' ');
    const badge = !full && free <= 2 ? `<span class="pin-count">${free}</span>` : '';
    return L.divIcon({
      className: 'pin-icon',
      html: `<div class="${cls}" title="${esc(p.titulo)}">${ic(cat.icon)}${badge}</div>`,
      iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -24],
    });
  }

  function initLiveMap() {
    if (liveMap || typeof L === 'undefined') return;
    liveMap = L.map('live-map', { zoomControl: false, scrollWheelZoom: true }).setView(CENTER, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(liveMap);
    tileLayer().addTo(liveMap);
  }

  function renderLiveMap() {
    renderTimeBar();
    const list = mapFiltered().sort((a, b) => a.inicio - b.inicio);
    if (liveMap) {
      const ids = new Set(list.map(p => p.id));
      liveMarkers.forEach((m, id) => { if (!ids.has(id)) { liveMap.removeLayer(m); liveMarkers.delete(id); } });
      list.forEach(p => {
        let m = liveMarkers.get(p.id);
        if (!m) {
          m = L.marker([p.lat, p.lng], { icon: pinIcon(p), riseOnHover: true, zIndexOffset: p.relampago ? 500 : 0 });
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

    const counter = $('#map-counter');
    counter.innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'parche activo' : 'parches activos'} ${timeLabel()}`;
    counter.classList.remove('is-bump'); void counter.offsetWidth; counter.classList.add('is-bump');

    const empty = $('#map-empty');
    if (!list.length) {
      const fecha = state.time.mode === 'hoy' ? todayKey() : state.time.mode === 'manana' ? offsetKey(1) : state.time.mode === 'fecha' ? state.time.date : '';
      empty.hidden = false;
      empty.innerHTML = emptyHTML({
        title: `Nadie ha abierto parche ${timeLabel().replace('para ', '').replace('en total', 'todavía')}`,
        text: state.search ? `Ningún pin coincide con "${state.search}".` : 'Ese día está libre. Arma el plan y deja que la gente se sume.',
        fecha,
      });
    } else empty.hidden = true;

    $('#map-items').innerHTML = list.length ? list.map(p => `
      <li><button class="soon-item" data-action="fly" data-id="${p.id}">
        <i>${ic(catById(p.categoria).icon)}</i>
        <div><b>${esc(p.titulo)}</b><small class="tnum">${esc(fmtCuando(p.inicio))} · ${isFull(p) ? 'Lleno' : libres(p) + ' libres'}</small></div>
        <span class="soon-eta tnum">${isFree(p) ? 'Gratis' : money(gasto(p))}</span>
      </button></li>`).join('') : '<li class="soon-empty">Sin pines para este filtro.</li>';
  }

  function renderTimeBar() {
    const m = state.time.mode;
    $$('#time-bar .time-btn[data-time]').forEach(b => b.classList.toggle('is-active', b.dataset.key ? (m === 'fecha' && b.dataset.key === state.time.date) : b.dataset.time === m));
    const sel = $('#time-select');
    const inSelect = m === 'fecha' && [...sel.options].some(o => o.value === state.time.date);
    sel.value = inSelect ? state.time.date : '';
    sel.closest('.time-select').classList.toggle('is-active', inSelect);
    const date = $('#time-date');
    date.closest('.time-date').classList.toggle('is-active', m === 'fecha' && !inSelect);
    if (m === 'fecha') date.value = state.time.date; else date.value = '';
  }

  function buildTimeControls() {
    // Botones rápidos: fin de semana cercano + "En 3 días"
    const quick = [];
    for (let i = 2; i <= 6; i++) { const k = offsetKey(i); const wd = keyToDate(k).getDay(); if ([5, 6, 0].includes(wd)) quick.push({ k, label: `En: ${cap(weekdayLong(k))}` }); }
    if (!quick.some(q => q.k === offsetKey(3))) quick.push({ k: offsetKey(3), label: 'En: 3 días' });
    quick.sort((a, b) => a.k.localeCompare(b.k));
    $('#time-quick').innerHTML = quick.map(q => `<button class="time-btn time-btn--sm" data-time="fecha" data-key="${q.k}">${esc(q.label)}</button>`).join('');

    const opts = ['<option value="">Elegir día</option>'];
    for (let i = 2; i <= 13; i++) { const k = offsetKey(i); opts.push(`<option value="${k}">${cap(weekdayLong(k))} ${shortDate(k)}</option>`); }
    $('#time-select').innerHTML = opts.join('');
    $('#time-date').min = todayKey();
  }

  function setTimeFor(ts) {
    const k = dayKey(ts), d = daysFromToday(k);
    state.time = d === 0 ? { mode: 'hoy', date: null } : d === 1 ? { mode: 'manana', date: null } : { mode: 'fecha', date: k };
  }

  function flyToParche(id, { open = true } = {}) {
    const p = findP(id);
    if (!p) return;
    closeAllModals();
    if (!timeMatch(p)) setTimeFor(p.inicio);
    if (state.desparchado && !isDesparche(p)) setDesparchado(false, true);
    if (state.search && !matchesSearch(p)) { state.search = ''; $('#search-input').value = ''; $('#search-clear').hidden = true; }
    if (state.view !== 'mapa') go('mapa');
    setTimeout(() => {
      initLiveMap();
      liveMap.invalidateSize();
      renderLiveMap();
      const m = liveMarkers.get(id);
      if (reduceMotion) {
        liveMap.setView([p.lat, p.lng], 16);
        if (open && m) m.openPopup();
      } else {
        liveMap.flyTo([p.lat, p.lng], 16, { duration: 1.6 });
        if (open && m) liveMap.once('moveend', () => m.openPopup());
      }
    }, state.view === 'mapa' ? 60 : 120);
  }

  /* Widget del radar */
  function initRadarMap() {
    if (radarMap || typeof L === 'undefined') return;
    radarMap = L.map('radar-map', { zoomControl: false, attributionControl: false, scrollWheelZoom: false, dragging: !isMobile(), tap: false }).setView(USER_POS, 13);
    tileLayer().addTo(radarMap);
    radarLayer = L.layerGroup().addTo(radarMap);
    // Tu ubicación
    L.circle(USER_POS, { radius: 900, color: '#FF5A1F', weight: 2, fillColor: '#FF5A1F', fillOpacity: .12, dashArray: '6 6' }).addTo(radarMap);
    L.circleMarker(USER_POS, { radius: 6, color: '#111', weight: 2, fillColor: '#FF5A1F', fillOpacity: 1 }).addTo(radarMap);
  }

  function renderRadarWidget() {
    const list = activeList().filter(p => p.inicio > Date.now() - 5 * MIN && !isFull(p)).filter(matchesSearch).sort((a, b) => a.inicio - b.inicio).slice(0, 5);
    $('#soon-list').innerHTML = list.length ? list.map(p => `
      <li><button class="soon-item" data-action="detalle" data-id="${p.id}">
        <i>${ic(catById(p.categoria).icon)}</i>
        <div><b>${esc(p.titulo)}</b><small class="tnum">${esc(p.barrio)} · ${fmtKm(distKm(p))}</small></div>
        <span class="soon-eta tnum">${esc(fmtETA(p.inicio))}</span>
      </button></li>`).join('') : '<li class="soon-empty">Nada arrancando pronto. Abre tú el parche.</li>';

    initRadarMap();
    if (!radarMap) return;
    radarLayer.clearLayers();
    list.forEach(p => {
      L.marker([p.lat, p.lng], { icon: pinIcon(Object.assign({}, p, { _drop: false })) })
        .on('click', () => openDetail(p.id))
        .addTo(radarLayer);
    });
  }

  /* Mini mapa del formulario */
  function initCreateMap() {
    if (typeof L === 'undefined') return;
    if (!createMap) {
      createMap = L.map('create-map', { zoomControl: true, attributionControl: false }).setView(CENTER, 13);
      tileLayer().addTo(createMap);
      createMap.on('click', e => setCreatePin(e.latlng.lat, e.latlng.lng));
    }
    createMap.invalidateSize();
    if (draft.lat != null) {
      setCreatePin(draft.lat, draft.lng, true);
      createMap.setView([draft.lat, draft.lng], 15);
    } else {
      if (createMarker) { createMap.removeLayer(createMarker); createMarker = null; }
      createMap.setView(CENTER, 13);
    }
  }
  function setCreatePin(lat, lng, silent = false) {
    draft.lat = +lat.toFixed(6); draft.lng = +lng.toFixed(6);
    const icon = pinIcon({ categoria: $('#c-categoria').value || 'chill', propio: true, cuposMax: 10, confirmados: [], unido: true, titulo: 'Punto de encuentro' });
    if (!createMarker) {
      createMarker = L.marker([draft.lat, draft.lng], { icon, draggable: true }).addTo(createMap);
      createMarker.on('dragend', () => { const ll = createMarker.getLatLng(); setCreatePin(ll.lat, ll.lng); });
    } else { createMarker.setLatLng([draft.lat, draft.lng]); createMarker.setIcon(icon); }
    $('#create-coords').textContent = `Lat ${draft.lat.toFixed(5)} · Lng ${draft.lng.toFixed(5)} · a ${fmtKm(haversine(USER_POS, [draft.lat, draft.lng]))} de ti`;
    if (!silent) { touched.add('map'); validate('map'); renderPreview(); }
  }

  /* =====================================================================
     9. ACCIONES
  ===================================================================== */
  async function toggleJoin(id) {
    const p = findP(id);
    if (!p || isMine(p)) return;
    const salir = p.unido;
    if (!salir && isFull(p)) { toast('Parche lleno', 'Ya no quedan cupos en este plan.', { type: 'error', icon: 'i-lock' }); return; }

    // Interfaz optimista: cambia ya, se confirma después
    p.unido = !salir;
    if (!isRemote(p)) {
      p.chat.push({ tipo: 'sys', texto: `${ME().nombre} ${salir ? 'se abrió del parche' : 'le cayó al parche'}`, ts: Date.now() });
      if (!salir) checkMilestones(p);
    }
    if (salir) toast('Te abriste del parche', `Liberaste tu cupo en ${p.titulo}.`, { icon: 'i-logout' });
    else toast('¡Le caíste al parche!', `Ya puedes entrar al chat de ${p.titulo} · ${fmtCuando(p.inicio)}`, { icon: 'i-bolt' });
    save();
    refresh();

    if (!isRemote(p)) return;
    const res = salir
      ? await sb.from('parche_miembros').delete().eq('parche_id', id).eq('usuario_id', me.id)
      : await sb.from('parche_miembros').insert({ parche_id: id });
    if (res.error) {
      p.unido = salir;
      refresh();
      const lleno = /PARCHE_LLENO/.test(res.error.message || '');
      toast(lleno ? 'Parche lleno' : 'No se pudo guardar', lleno ? 'Alguien tomó el último cupo antes que tú.' : dbMsg(res.error), { type: 'error' });
    }
    await reloadParche(id);
  }

  /* ---------- Crear / editar ---------- */
  let editingId = null;
  const draft = { lat: null, lng: null, imagen: '' };
  const touched = new Set();
  const F = name => $(`#form-create [name="${name}"]`);

  const RULES = {
    titulo: v => !v.trim() ? 'Ponle un nombre a tu parche.' : v.trim().length < 5 ? 'Mínimo 5 caracteres.' : '',
    categoria: v => !v ? 'Elige una categoría.' : '',
    cupos: v => {
      const n = Number(v);
      if (v === '' || !Number.isFinite(n)) return 'Indica cuántos caben.';
      if (!Number.isInteger(n)) return 'Usa un número entero.';
      if (n < 2) return 'Mínimo 2 cupos.';
      if (n > 60) return 'Máximo 60 cupos.';
      const p = editingId && findP(editingId);
      if (p && n < ocupados(p)) return `Ya hay ${ocupados(p)} confirmados.`;
      return '';
    },
    fecha: v => !v ? 'Elige la fecha.' : v < todayKey() ? 'Esa fecha ya pasó.' : daysFromToday(v) > 60 ? 'Máximo 60 días hacia adelante.' : '',
    hora: v => {
      if (!v) return 'Elige la hora.';
      const f = F('fecha').value;
      if (f && f === todayKey() && tsFrom(f, v) < Date.now() + 5 * MIN) return 'Esa hora ya pasó. Elige una más tarde.';
      return '';
    },
    lugar: v => v.trim().length < 3 ? 'Dinos dónde es el encuentro.' : '',
    barrio: v => !v.trim() ? 'Escribe el barrio.' : '',
    costo: v => v === '' || Number(v) < 0 ? 'Usa 0 si es gratis.' : '',
    presupuesto: v => v === '' || Number(v) < 0 ? 'Usa 0 si no hay que gastar.' : Number(v) < Number(F('costo').value || 0) ? 'No puede ser menor que la entrada.' : '',
    descripcion: v => v.trim().length < 10 ? 'Cuenta un poco más (mínimo 10 caracteres).' : '',
    planb: () => '',
    map: () => draft.lat == null ? 'Toca el mapa para marcar el punto de encuentro.' : '',
  };

  function setFieldState(field, msg, showValid = true) {
    const out = $('.field-msg', field);
    field.classList.toggle('is-error', !!msg);
    field.classList.toggle('is-valid', !msg && showValid);
    if (out) out.innerHTML = msg ? `${ic('i-alert')} ${esc(msg)}` : '';
  }
  function validate(name) {
    const field = name === 'map' ? $('#field-map') : F(name)?.closest('.field');
    if (!field) return true;
    const msg = RULES[name](name === 'map' ? '' : F(name).value);
    const input = name === 'map' ? null : F(name);
    if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    setFieldState(field, msg, name !== 'planb' || !!(input && input.value.trim()));
    return !msg;
  }
  function clearValidation() {
    touched.clear();
    $$('#form-create .field').forEach(f => { f.classList.remove('is-error', 'is-valid'); const m = $('.field-msg', f); if (m) m.innerHTML = ''; });
    $$('#form-create [aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
  }

  function draftParche() {
    const fecha = F('fecha').value || todayKey(), hora = F('hora').value || '18:00';
    const base = editingId ? findP(editingId) : null;
    return normalizeParche({
      id: editingId || 'draft',
      titulo: F('titulo').value.trim() || 'Tu parche',
      categoria: F('categoria').value || 'chill',
      descripcion: F('descripcion').value.trim(),
      inicio: tsFrom(fecha, hora),
      lugar: F('lugar').value.trim(), barrio: F('barrio').value.trim(),
      lat: draft.lat ?? CENTER[0], lng: draft.lng ?? CENTER[1],
      costo: Number(F('costo').value) || 0, presupuesto: Number(F('presupuesto').value) || 0,
      cuposMax: clamp(Number(F('cupos').value) || 2, 2, 60),
      confirmados: base ? base.confirmados : [],
      unido: true, propio: true, creadorId: 'me',
      planB: F('planb').value.trim(), imagen: draft.imagen,
      planBActivo: base ? base.planBActivo : false,
    });
  }

  function renderPreview() { $('#create-preview').innerHTML = cardHTML(draftParche(), { preview: true }); }

  function renderCoverPicker() {
    const cat = F('categoria').value || 'chill';
    const opts = coversFor(cat).slice();
    if (draft.imagen && !opts.includes(draft.imagen)) opts.unshift(draft.imagen);
    $('#cover-picker').innerHTML = opts.slice(0, 4).map(src => `
      <button type="button" class="cover-opt" data-cover="${esc(src)}" aria-pressed="${src === draft.imagen}" aria-label="Usar esta portada"><img src="${esc(src)}" alt=""></button>`).join('') +
      `<label class="cover-opt cover-upload" title="Subir portada">${ic('i-upload')}<input type="file" accept="image/*" id="cover-file" hidden><span class="sr-only">Subir portada</span></label>`;
  }

  function nextRoundHour() {
    const d = new Date(Date.now() + 90 * MIN); d.setMinutes(0, 0, 0);
    return `${pad(d.getHours())}:00`;
  }

  function openCreate({ id = null, fecha = null } = {}) {
    editingId = id;
    const form = $('#form-create');
    form.reset();
    clearValidation();
    const p = id ? findP(id) : null;
    $('#create-title').textContent = p ? 'Editar parche' : 'Abrir el parche';
    $('#create-eyebrow').textContent = p ? 'Ajusta tu plan' : 'Nuevo plan';
    $('#create-submit span').textContent = p ? 'Guardar cambios' : 'Publicar parche';

    if (p) {
      F('titulo').value = p.titulo; F('categoria').value = p.categoria;
      F('cupos').value = p.cuposMax; F('fecha').value = dayKey(p.inicio);
      const d = new Date(p.inicio); F('hora').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      F('lugar').value = p.lugar; F('barrio').value = p.barrio;
      F('costo').value = p.costo; F('presupuesto').value = p.presupuesto;
      F('descripcion').value = p.descripcion; F('planb').value = p.planB || '';
      draft.lat = p.lat; draft.lng = p.lng; draft.imagen = p.imagen;
    } else {
      const k = fecha && fecha >= todayKey() ? fecha : todayKey();
      F('categoria').value = state.cat !== 'todos' ? state.cat : 'chill';
      F('fecha').value = k;
      F('hora').value = k === todayKey() ? nextRoundHour() : '17:00';
      F('cupos').value = 8; F('costo').value = 0; F('presupuesto').value = 0;
      draft.lat = null; draft.lng = null; draft.imagen = coversFor(F('categoria').value)[0];
    }
    F('fecha').min = todayKey();
    $('#create-coords').textContent = draft.lat != null ? `Lat ${draft.lat.toFixed(5)} · Lng ${draft.lng.toFixed(5)}` : 'Sin ubicación todavía';
    renderCoverPicker();
    renderPreview();
    openModal('modal-create');
    setTimeout(initCreateMap, 120);
    setTimeout(() => createMap && createMap.invalidateSize(), 420);
  }

  function submitCreate(e) {
    e.preventDefault();
    const names = Object.keys(RULES);
    names.forEach(n => touched.add(n));
    const bad = names.filter(n => !validate(n));
    if (bad.length) {
      const first = bad[0] === 'map' ? $('#create-map') : F(bad[0]);
      first && first.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      if (first && first.focus && bad[0] !== 'map') setTimeout(() => first.focus({ preventScroll: true }), 250);
      toast('Revisa el formulario', `${bad.length} ${bad.length === 1 ? 'campo necesita' : 'campos necesitan'} ajuste.`, { type: 'error', icon: 'i-alert' });
      return;
    }
    const btn = $('#create-submit');
    btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
    const stop = () => { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); };

    if (!DEMO) {
      saveParcheRemote(draftParche(), editingId).then(id => {
        stop();
        if (!id) return;
        closeModal('modal-create');
        toast(editingId ? 'Parche actualizado' : '¡Parche publicado!', editingId ? 'Los confirmados ya ven los cambios.' : 'Ya está en el radar y en el mapa.', { icon: editingId ? 'i-check' : 'i-bolt' });
        const p = findP(id);
        if (!editingId && p) p._drop = true;
        renderHero(); renderNavCounts();
        if (p) { setTimeFor(p.inicio); flyToParche(id); }
      });
      return;
    }

    setTimeout(() => {
      stop();
      const d = draftParche();
      let p;
      if (editingId) {
        p = findP(editingId);
        const keep = {
          id: p.id, confirmados: p.confirmados, chat: p.chat, ruta: p.ruta, botRompehielos: p.botRompehielos,
          cuponDesbloqueado: p.cuponDesbloqueado, cupon: p.cupon, creadoPorMi: p.creadoPorMi, clima: p.clima,
          checkin: p.checkin, calificado: p.calificado, planBActivo: p.planBActivo && !!d.planB,
        };
        Object.assign(p, d, keep);
        p.chat.push({ tipo: 'sys', texto: 'El organizador actualizó los datos del parche.', ts: Date.now() });
        checkMilestones(p);
        toast('Parche actualizado', `${p.titulo} quedó al día.`, { icon: 'i-check' });
      } else {
        p = Object.assign(d, { id: 'u' + Date.now().toString(36), creadoPorMi: true, _drop: true });
        p.chat = [{ tipo: 'sys', texto: `Abriste el parche. Comparte el enlace para que la gente caiga.`, ts: Date.now() }];
        state.parches.push(p);
        notify('i-bolt', `Publicaste <b>${esc(p.titulo)}</b>. Ya está en el radar.`, p.id);
        toast('¡Parche publicado!', `Ya está en el mapa ${fmtDia(p.inicio).toLowerCase() === 'hoy' ? 'para hoy' : 'para ' + fmtDia(p.inicio).toLowerCase()}.`, { icon: 'i-bolt' });
        // Simula a alguien uniéndose en tiempo real
        setTimeout(() => {
          const q = findP(p.id);
          if (!q || isFull(q)) return;
          const who = pick(PEOPLE.filter(x => !q.confirmados.includes(x.id)));
          q.confirmados.push(who.id);
          q.chat.push({ tipo: 'sys', texto: `${who.nombre} le cayó al parche`, ts: Date.now() });
          checkMilestones(q);
          notify('i-users-plus', `<b>${esc(who.nombre)}</b> le cayó a tu parche <b>${esc(q.titulo)}</b>.`, q.id);
          toast('Alguien le cayó a tu parche', `${who.nombre} se sumó a ${q.titulo}.`, { icon: 'i-users-plus' });
          save(); refresh();
        }, 9000);
      }
      save();
      closeModal('modal-create');
      renderHero(); renderNavCounts();
      // Vuelo cinematográfico al nuevo pin
      setTimeFor(p.inicio);
      flyToParche(p.id);
    }, 650);
  }

  function askDelete(id) {
    const p = findP(id);
    if (!p) return;
    $('#confirm-title').textContent = '¿Cancelar el parche?';
    $('#confirm-text').textContent = `"${p.titulo}" se borra del mapa y del radar. Les avisaremos a los ${p.confirmados.length} confirmados.`;
    $('#confirm-ok').onclick = async () => {
      if (isRemote(p)) {
        const { error } = await sb.from('parches').delete().eq('id', id);
        if (error) { toast('No se pudo cancelar', dbMsg(error), { type: 'error' }); return; }
      }
      state.parches = state.parches.filter(x => x.id !== id);
      const m = liveMarkers.get(id);
      if (m && liveMap) { liveMap.removeLayer(m); liveMarkers.delete(id); }
      save();
      closeModal('modal-confirm');
      if (detailId === id) closeModal('modal-detail');
      notify('i-trash', `Cancelaste <b>${esc(p.titulo)}</b>. Avisamos a los confirmados.`);
      toast('Parche cancelado', 'Lo quitamos del mapa y del radar.', { icon: 'i-trash' });
      refresh();
    };
    openModal('modal-confirm');
  }

  /* ---------- Simulación en tiempo real ---------- */
  const LIVE_POOL = [
    { titulo: 'Picadito relámpago en Villa Julia', categoria: 'deportes', lugar: 'Polideportivo Villa Julia', barrio: 'Villa Julia', costo: 5000, presupuesto: 8000 },
    { titulo: 'Empanadas y frías en el parque', categoria: 'comida', lugar: 'Parque del Barzal', barrio: 'Barzal', costo: 0, presupuesto: 15000 },
    { titulo: 'Jam de guitarras en la plazoleta', categoria: 'conciertos', lugar: 'Plazoleta Los Libertadores', barrio: 'Centro', costo: 0, presupuesto: 0 },
    { titulo: 'Partida de Mario Kart improvisada', categoria: 'gaming', lugar: 'Café Gamer El Nivel', barrio: 'Caudal', costo: 0, presupuesto: 12000 },
    { titulo: 'Atardecer con perritos', categoria: 'pet', lugar: 'Parque Los Centauros', barrio: 'Los Centauros', costo: 0, presupuesto: 0 },
    { titulo: 'Happy hour 2x1 en Bar La Llanura', categoria: 'rumba', lugar: 'Bar La Llanura', barrio: 'Barzal', costo: 0, presupuesto: 30000, relampago: true, promo: '2x1 en cerveza artesanal por 1 hora', aliado: true },
    { titulo: 'Tinto y ajedrez en el parque', categoria: 'chill', lugar: 'Parque de los Estudiantes', barrio: 'Centro', costo: 0, presupuesto: 5000 },
  ];
  function simulateLive() {
    const t = pick(LIVE_POOL);
    const creator = pick(PEOPLE);
    const p = normalizeParche(Object.assign({}, t, {
      id: 'live' + Date.now().toString(36),
      descripcion: 'Acaba de abrirse cerca de ti. Arranca en un rato, cáele antes de que se llene.',
      inicio: soon(rand(25, 100)),
      lat: CENTER[0] + rand(-0.017, 0.017), lng: CENTER[1] + rand(-0.017, 0.017),
      cuposMax: pick([6, 8, 10, 12]),
      confirmados: PEOPLE.filter(x => x.id !== creator.id).sort(() => Math.random() - .5).slice(0, Math.floor(rand(1, 4))).map(x => x.id),
      creadorId: t.aliado ? null : creator.id, creadorNombre: t.aliado ? t.lugar : '', creadorRating: 4.6,
      imagen: coversFor(t.categoria)[0], _drop: true,
      local: !DEMO, // con sesión, la simulación no se guarda en Supabase
    }));
    p.chat = [{ tipo: 'sys', texto: `${creatorName(p)} abrió el parche`, ts: Date.now() }];
    state.parches.push(p);
    save();
    notify(p.relampago ? 'i-bolt' : 'i-live', `Nuevo parche en vivo: <b>${esc(p.titulo)}</b> en ${esc(p.barrio)}.`, p.id);
    toast(p.relampago ? 'Parche relámpago en vivo' : 'Nuevo parche en vivo', `${p.titulo} · ${fmtETA(p.inicio).toLowerCase()} · ${fmtKm(distKm(p))}`, { icon: p.relampago ? 'i-bolt' : 'i-live', action: { label: 'Ver', id: p.id } });
    if (state.view === 'mapa') {
      if (!timeMatch(p)) setTimeFor(p.inicio);
      renderLiveMap();
      liveMap && liveMap.flyTo([p.lat, p.lng], 15, { duration: reduceMotion ? 0 : 1.2 });
    }
    refresh();
  }

  /* =====================================================================
     10. DETALLE DEL PARCHE + CHAT
  ===================================================================== */
  let detailId = null;
  const detailUI = { ride: null };

  function openDetail(id) {
    const p = findP(id);
    if (!p) return;
    detailId = id;
    detailUI.ride = null;
    const cat = catById(p.categoria);
    $('#detail-body').innerHTML = `
      <div class="detail-main">
        <div class="detail-hero">
          ${p.imagen ? `<img src="${esc(p.imagen)}" alt="">` : ''}
          <div id="d-badges"></div>
          <div class="pc-band"><span>${ic(cat.icon)} ${esc(cat.label)}</span><span class="pc-when tnum">${esc(fmtCuando(p.inicio))}</span></div>
        </div>
        <div class="detail-content">
          <div>
            <p class="eyebrow" id="detail-eyebrow"></p>
            <h2 class="detail-title" id="detail-title">${esc(p.titulo)}</h2>
          </div>
          <p class="detail-desc">${esc(p.descripcion)}</p>
          <div class="detail-facts" id="d-facts"></div>
          <div id="d-actions"></div>
          <div class="org">
            ${avHTML(p.creadorId === 'me' ? 'me' : p.creadorId)}
            <div><b>${ic('i-crown')} ${esc(creatorName(p))}</b><small class="tnum">${p.aliado ? 'Local aliado' : 'Organizador'} · ${creatorRating(p).toFixed(1)} de reputación</small></div>
            <span class="ok-tag">${ic('i-shield')} Verificado</span>
          </div>
          <section class="panel-block" id="d-weather"></section>
          <section class="panel-block" id="d-ruta"></section>
          <section class="panel-block">
            <div class="panel-block-head"><h3>${ic('i-shield')} Seguridad y viralidad</h3></div>
            <div class="panel-block-body">
              <div class="share-row">
                <button class="btn btn--ghost" data-action="share" data-id="${p.id}">${ic('i-whats')} Compartir parche seguro</button>
                <button class="btn btn--ink" data-action="ticket" data-id="${p.id}">${ic('i-story')} Ticket para IG Stories</button>
              </div>
            </div>
          </section>
          <div id="d-owner"></div>
        </div>
      </div>
      <aside class="chat" aria-label="Chat del parche">
        <div class="chat-head" id="chat-head"></div>
        <div class="chat-msgs" id="chat-msgs" aria-live="polite"></div>
        <div class="chat-foot" id="chat-foot"></div>
      </aside>`;
    renderDetailParts();
    openModal('modal-detail');
    scrollChat(false);
    if (isRemote(p)) loadDetailRemote(id);
  }

  function renderDetailParts() {
    const p = findP(detailId);
    if (!p) return;
    const occ = ocupados(p), full = isFull(p), mine = isMine(p), w = clima(p);
    const inside = p.unido || mine;

    $('#detail-eyebrow').innerHTML = mine ? `${ic('i-crown')} Tu parche` : `${ic('i-bolt')} ${vibra(p)}% con tu vibra`;
    $('#d-badges').innerHTML = `${p.relampago ? `<span class="pc-badge pc-vibe">${ic('i-bolt')} Relámpago · ${esc(p.promo || '')}</span>` : ''}${!full && libres(p) < 3 ? `<span class="pc-badge pc-urgent">${ic('i-flame')} ${libres(p) === 1 ? 'Último cupo' : `Últimos ${libres(p)} cupos`}</span>` : ''}${full ? '<div class="pc-full-ribbon">Parche lleno</div>' : ''}`;

    $('#d-facts').innerHTML = `
      <div class="fact"><span>${ic('i-clock')} Cuándo</span><b>${esc(fmtCuando(p.inicio))}</b></div>
      <div class="fact ${p.planBActivo ? 'is-planb' : ''}"><span>${ic('i-pin')} ${p.planBActivo ? 'Plan B activo' : 'Dónde'}</span><b>${esc(p.planBActivo ? p.planB : p.lugar)} · ${esc(p.barrio)}</b></div>
      <div class="fact"><span>${ic('i-crosshair')} Distancia</span><b>${fmtKm(distKm(p))} de ti</b></div>
      <div class="fact"><span>${ic('i-wallet')} Presupuesto</span><b>${isFree(p) ? 'Gratis' : money(gasto(p)) + ' aprox.'}${p.costo ? ` · Entrada ${money(p.costo)}` : ''}</b></div>
      <div class="fact"><span>${ic('i-users')} Cupos</span><b>${occ}/${p.cuposMax} · ${full ? 'Completo' : libres(p) + ' libres'}</b></div>
      ${p.planB ? `<div class="fact"><span>${ic('i-umbrella')} Plan B</span><b>${esc(p.planB)}</b></div>` : ''}`;

    let act;
    if (mine) act = `<div class="cupos-bar"><div class="cupos-bar-top"><span><b>${occ}</b>/${p.cuposMax} confirmados</span><span>${Math.round(occ / p.cuposMax * 100)}%</span></div><div class="meter"><i style="--p:${Math.min(100, occ / p.cuposMax * 100)}%"></i></div></div>`;
    else if (p.unido) act = `<button class="btn btn--alert btn--block" data-action="join" data-id="${p.id}">${ic('i-logout')} Abrirse del parche</button>`;
    else if (full) act = `<button class="btn btn--ghost btn--block" disabled>${ic('i-lock')} Parche lleno</button>`;
    else act = `<button class="btn btn--primary btn--block btn--lg" data-action="join" data-id="${p.id}">${ic('i-bolt')} Caerle al parche</button>`;
    $('#d-actions').innerHTML = act;

    // Alerta Llanera
    const rain = w.tipo === 'lluvia';
    let wb = `<div class="weather"><span class="weather-icon ${rain ? 'is-rain' : ''}">${ic(CLIMA_IC[w.tipo])}</span><div><b class="tnum">${w.temp}° · ${CLIMA_TXT[w.tipo]}</b><p class="tnum">${ic('i-drop', 'ic--o')} ${w.prob}% de probabilidad de lluvia a las ${fmtHora(p.inicio)}</p></div></div>`;
    if (p.planBActivo) wb += `<p class="alert-line is-ok">${ic('i-check')} Plan B activo: nos vemos en ${esc(p.planB)}.</p>`;
    else if (rain) wb += `<p class="alert-line">${ic('i-alert')} Puede llover en el Llano. ${p.planB ? `Plan B listo: ${esc(p.planB)}.` : 'Este parche no tiene Plan B.'}</p>`;
    if (mine) {
      if (p.planBActivo) wb += `<button class="btn btn--ghost btn--block" data-action="planb-off" data-id="${p.id}">${ic('i-refresh')} Volver al lugar original</button>`;
      else if (p.planB) wb += `<button class="btn btn--primary btn--block" data-action="planb" data-id="${p.id}">${ic('i-roof')} Activar Plan B bajo techo</button>`;
      else wb += `<button class="btn btn--ghost btn--block" data-action="editar" data-id="${p.id}">${ic('i-umbrella')} Agregar un Plan B</button>`;
    }
    $('#d-weather').innerHTML = `<div class="panel-block-head"><h3>${ic('i-w-rain')} Alerta Llanera</h3><span class="chip-live"><span class="live-dot"></span> Clima</span></div><div class="panel-block-body">${wb}</div>`;

    // La Ruta
    const mineRide = p.ruta.find(r => r.who === 'me');
    let rb = '';
    if (inside) {
      rb += `<div class="ride-actions">
        <button class="btn ${detailUI.ride === 'lleva' ? 'btn--primary' : 'btn--ghost'}" data-action="ride-open" data-tipo="lleva">${ic('i-car')} Tengo carro/moto con cupos</button>
        <button class="btn ${detailUI.ride === 'busca' ? 'btn--primary' : 'btn--ghost'}" data-action="ride-open" data-tipo="busca">${ic('i-thumb')} Busco cupo desde mi barrio</button>
      </div>`;
      if (detailUI.ride) {
        rb += `<form class="ride-form" id="ride-form" data-tipo="${detailUI.ride}">
          ${detailUI.ride === 'lleva' ? `
            <div class="field"><label for="r-veh">Vehículo</label><select class="input" id="r-veh"><option value="carro">Carro</option><option value="moto">Moto</option></select></div>
            <div class="field"><label for="r-cupos">Cupos</label><select class="input" id="r-cupos"><option>1</option><option>2</option><option selected>3</option><option>4</option></select></div>` : ''}
          <div class="field" ${detailUI.ride === 'busca' ? 'style="grid-column:span 2"' : ''}><label for="r-barrio">Desde</label><input class="input" id="r-barrio" list="barrios" placeholder="Tu barrio" value="Barzal"></div>
          <button class="btn btn--primary btn--xs" type="submit">${ic('i-check')} Publicar</button>
        </form>`;
      }
    } else rb += `<p class="locked">${ic('i-lock')} Cáele al parche para coordinar la ruta con los demás.</p>`;
    const rides = p.ruta.slice().sort((a, b) => (a.tipo === 'busca') - (b.tipo === 'busca'));
    if (rides.length) {
      rb += `<div class="ride-list">${rides.map(r => {
        const name = r.who === 'me' ? 'Tú' : personById(r.who)?.nombre || 'Parcero';
        const tag = r.tipo === 'busca'
          ? `<span class="ride-tag ride-tag--busca">${ic('i-thumb')} Busca cupo</span>`
          : `<span class="ride-tag ride-tag--lleva">${ic(r.tipo === 'moto' ? 'i-moto' : 'i-car')} ${r.cupos} ${r.cupos == 1 ? 'cupo' : 'cupos'}</span>`;
        return `<div class="ride ${r.who === 'me' ? 'is-mine' : ''}">${avHTML(r.who)}<div><b>${esc(name)}</b><small>${r.tipo === 'busca' ? 'Sale desde' : `Lleva ${r.tipo} desde`} ${esc(r.barrio)}</small></div>${tag}${r.who === 'me' ? `<button class="text-btn" data-action="ride-remove">Quitar</button>` : ''}</div>`;
      }).join('')}</div>`;
    } else rb += `<p class="mini-note">Nadie ha publicado ruta todavía.</p>`;
    $('#d-ruta').innerHTML = `<div class="panel-block-head"><h3>${ic('i-car')} La Ruta</h3><span class="mini-note tnum">${p.ruta.filter(r => r.tipo !== 'busca').length} llevan vehículo${mineRide ? ' · tú estás en la lista' : ''}</span></div><div class="panel-block-body">${rb}</div>`;

    $('#d-owner').innerHTML = mine ? `<div class="owner-row">
      <button class="btn btn--ghost" data-action="editar" data-id="${p.id}">${ic('i-edit')} Editar parche</button>
      <button class="btn btn--danger" data-action="cancelar" data-id="${p.id}">${ic('i-trash')} Cancelar el parche</button></div>` : '';

    renderChatHead(p);
    renderChatMsgs(p);
    renderChatFoot(p);
  }

  function renderChatHead(p) {
    const vacaOpen = $('#vaca')?.open || false;
    const vacaVal = $('#vaca-total')?.value || '';
    const coupon = p.cuponDesbloqueado && p.cupon ? `
      <div class="coupon" role="status">
        <span class="coupon-icon">${ic('i-tag')}</span>
        <b>Cupón desbloqueado</b>
        <small>${esc(p.cupon.desc)} · ${esc(p.cupon.comercio)}</small>
        <code data-action="copy-coupon" data-code="${esc(p.cupon.codigo)}" title="Copiar código">${esc(p.cupon.codigo)}</code>
      </div>` : '';
    $('#chat-head').innerHTML = `
      <h3>${ic('i-chat')} Chat del parche</h3>
      <div class="cupos-bar"><div class="cupos-bar-top"><span><b>${ocupados(p)}</b>/${p.cuposMax} en el chat</span><span>${isFull(p) ? 'Lleno: cupón activo' : `Al llenarse se desbloquea un cupón`}</span></div><div class="meter ${libres(p) < 3 ? 'is-hot' : ''}"><i style="--p:${Math.min(100, ocupados(p) / p.cuposMax * 100)}%"></i></div></div>
      ${coupon}
      <details class="vaca" id="vaca" ${vacaOpen ? 'open' : ''}>
        <summary>${ic('i-cash')} Hacer la vaca ${ic('i-chev-down')}</summary>
        <div class="vaca-body">
          <div class="input-wrap">${ic('i-wallet')}<input class="input tnum" id="vaca-total" type="number" min="0" step="1000" inputmode="numeric" placeholder="Gasto total del grupo" value="${esc(vacaVal)}"></div>
          <div class="vaca-result"><span class="tnum" id="vaca-split">Entre ${ocupados(p)} confirmados</span><b id="vaca-each">$0</b></div>
          <button class="btn btn--ghost btn--xs" data-action="vaca-send" ${p.unido || isMine(p) ? '' : 'disabled'}>${ic('i-send')} Mandar al chat</button>
        </div>
      </details>`;
    updateVaca();
  }

  function msgHTML(m) {
    const t = `<time>${fmtHora(m.ts)}</time>`;
    if (m.tipo === 'bot') return `<div class="msg msg--bot"><span class="bot-ic">${ic('i-bot')}</span><div class="bubble"><small>Bot del Parche</small>${esc(m.texto)}${t}</div></div>`;
    if (m.tipo === 'sys') return `<div class="msg msg--sys"><div class="bubble">${esc(m.texto)}</div></div>`;
    if (m.tipo === 'alerta') return `<div class="msg msg--sys msg--alert"><div class="bubble">${ic('i-alert')} ${esc(m.texto)}</div></div>`;
    const me = m.autor === 'me';
    const name = me ? 'Tú' : personById(m.autor)?.nombre || 'Parcero';
    return `<div class="msg ${me ? 'msg--me' : ''}">${avHTML(m.autor)}<div class="bubble">${me ? '' : `<small>${esc(name)}</small>`}${esc(m.texto)}${t}</div></div>`;
  }
  function renderChatMsgs(p) {
    const box = $('#chat-msgs');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = p.chat.map(msgHTML).join('') + (detailUI.typing ? `<div class="typing" aria-label="Escribiendo"><i></i><i></i><i></i></div>` : '');
    if (atBottom) scrollChat();
  }
  function scrollChat(smooth = true) {
    const box = $('#chat-msgs');
    if (box) requestAnimationFrame(() => box.scrollTo({ top: box.scrollHeight, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' }));
  }
  function renderChatFoot(p) {
    const foot = $('#chat-foot');
    const inside = p.unido || isMine(p);
    const keep = $('#chat-input')?.value || '';
    if (!inside) {
      foot.innerHTML = `<p class="chat-locked">${ic('i-lock')} Cáele al parche para escribir en el chat.</p>
        ${!isFull(p) ? `<button class="btn btn--primary btn--block" data-action="join" data-id="${p.id}">${ic('i-bolt')} Caerle al parche</button>` : ''}`;
      return;
    }
    const check = p.checkin
      ? (p.calificado
        ? `<button class="btn btn--ok btn--block" disabled>${ic('i-check')} Check-in hecho · Ya calificaste</button>`
        : `<button class="btn btn--ok btn--block" data-action="rate" data-id="${p.id}">${ic('i-star')} Calificar a los asistentes</button>`)
      : `<button class="btn btn--ink btn--block" data-action="checkin" data-id="${p.id}">${ic('i-flag')} Ya llegué al punto</button>`;
    foot.innerHTML = `<form class="chat-form" id="chat-form" autocomplete="off">
        <label class="sr-only" for="chat-input">Mensaje</label>
        <input class="input" id="chat-input" maxlength="240" placeholder="Escríbele al parche..." value="${esc(keep)}">
        <button class="icon-btn" type="submit" aria-label="Enviar">${ic('i-send')}</button>
      </form>${check}`;
  }

  function updateVaca() {
    const p = findP(detailId);
    const inp = $('#vaca-total');
    if (!p || !inp) return;
    const n = Math.max(1, ocupados(p));
    const total = Math.max(0, Number(inp.value) || 0);
    $('#vaca-split').textContent = `${money(total)} entre ${n} confirmados`;
    $('#vaca-each').textContent = money(Math.ceil(total / n / 100) * 100) + ' c/u';
  }

  async function sendChat(text) {
    const p = findP(detailId);
    if (!p || !text.trim()) return;
    const msg = { tipo: 'user', autor: 'me', texto: text.trim().slice(0, 400), ts: Date.now() };
    p.chat.push(msg);
    save();
    renderChatMsgs(p); scrollChat();
    if (isRemote(p)) {
      const { data, error } = await sb.from('mensajes').insert({ parche_id: p.id, texto: msg.texto }).select('id').single();
      if (error) {
        p.chat = p.chat.filter(m => m !== msg);
        if (detailId === p.id) renderChatMsgs(p);
        toast('No se envió el mensaje', dbMsg(error), { type: 'error' });
      } else msg.id = data.id; // evita duplicarlo cuando llegue por tiempo real
      return;
    }
    // Respuesta simulada de otro parcero
    const pid = p.id;
    const replier = pick(p.confirmados.length ? p.confirmados : PEOPLE.map(x => x.id));
    setTimeout(() => {
      if (detailId !== pid) return;
      detailUI.typing = true; renderChatMsgs(p); scrollChat();
    }, 700);
    setTimeout(() => {
      detailUI.typing = false;
      const q = findP(pid);
      if (!q) return;
      q.chat.push({ tipo: 'user', autor: replier, texto: pick(REPLIES), ts: Date.now() });
      save();
      if (detailId === pid) { renderChatMsgs(q); scrollChat(); }
    }, 2200 + Math.random() * 1200);
  }

  async function activatePlanB(id, on = true) {
    const p = findP(id);
    if (!p || !isMine(p) || !p.planB) return;
    if (isRemote(p)) {
      const { error } = await sb.from('parches').update({ plan_b_activo: on }).eq('id', id);
      if (error) { toast('No se pudo cambiar el Plan B', dbMsg(error), { type: 'error' }); return; }
      toast(on ? 'Plan B activado' : 'Plan B desactivado', on ? 'Avisamos en el chat y a todos los confirmados.' : `Volvieron a ${p.lugar}.`, { icon: on ? 'i-roof' : 'i-refresh' });
      await reloadParche(id);
      return;
    }
    p.planBActivo = on;
    if (on) {
      p.chat.push({ tipo: 'alerta', texto: `PLAN B ACTIVADO: por lluvia nos movemos a ${p.planB}. Misma hora.`, ts: Date.now() });
      notify('i-roof', `Activaste el Plan B de <b>${esc(p.titulo)}</b>: ${esc(p.planB)}.`, p.id);
      toast('Plan B activado', `Avisamos en el chat y a los ${p.confirmados.length} confirmados.`, { icon: 'i-roof' });
    } else {
      p.chat.push({ tipo: 'sys', texto: `Volvimos al lugar original: ${p.lugar}.`, ts: Date.now() });
      toast('Plan B desactivado', `Volvieron a ${p.lugar}.`, { icon: 'i-refresh' });
    }
    save(); refresh();
  }

  async function checkin(id) {
    const p = findP(id);
    if (!p) return;
    if (isRemote(p)) {
      const { error } = await sb.from('parche_miembros').update({ checkin: true }).eq('parche_id', id).eq('usuario_id', me.id);
      if (error) { toast('No se pudo hacer check-in', dbMsg(error), { type: 'error' }); return; }
      p.checkin = true;
      await sb.from('mensajes').insert({ parche_id: id, texto: 'Ya llegué al punto' });
      refresh();
      toast('Check-in confirmado', 'Ahora califica a la gente con la que parchaste.', { icon: 'i-flag' });
      setTimeout(() => openRating(id), 450);
      return;
    }
    p.checkin = true;
    p.chat.push({ tipo: 'sys', texto: `${ME().nombre} ya llegó al punto`, ts: Date.now() });
    save(); refresh();
    toast('Check-in confirmado', 'Ahora califica a la gente con la que parchaste.', { icon: 'i-flag' });
    setTimeout(() => openRating(id), 450);
  }

  /* =====================================================================
     11. RULETA, TICKET, COMPARTIR, CALIFICAR
  ===================================================================== */
  let spinning = false;
  function spinRuleta() {
    if (spinning) return;
    const budget = Math.max(0, Number($('#ruleta-budget').value) || 0);
    const candidates = activeList().filter(p => p.inicio > Date.now() && !isFull(p) && !p.unido && !isMine(p) && gasto(p) <= budget);
    const result = $('#ruleta-result');
    const reel = $('#slot-reel');
    result.innerHTML = '';
    if (!candidates.length) {
      reel.style.transition = 'none'; reel.style.transform = 'none';
      reel.innerHTML = '<span>Sin suerte</span>';
      result.innerHTML = `<div class="result-card"><h3>Nada con ${budget ? money(budget) : '$0'}</h3><p class="mini-note">Sube un poco el presupuesto o abre tú un parche gratis.</p><div class="form-actions"><button class="btn btn--primary btn--xs" data-action="crear">${ic('i-plus')} Abrir el parche</button></div></div>`;
      return;
    }
    const winner = pick(candidates);
    const pool = activeList().filter(p => p.id !== winner.id);
    const seq = Array.from({ length: 22 }, () => pick(pool.length ? pool : [winner]).titulo).concat(winner.titulo);
    reel.innerHTML = seq.map(t => `<span>${esc(t)}</span>`).join('');
    const h = reel.firstElementChild.getBoundingClientRect().height;
    reel.style.transition = 'none';
    reel.style.transform = 'translateY(0)';
    void reel.offsetHeight;
    spinning = true;
    $('#slot').classList.add('is-spinning');
    $('#ruleta-spin').disabled = true;
    const dur = reduceMotion ? 0 : 2600;
    reel.style.transition = `transform ${dur}ms cubic-bezier(.12,.75,.18,1)`;
    reel.style.transform = `translateY(-${(seq.length - 1) * h}px)`;
    setTimeout(() => {
      spinning = false;
      $('#slot').classList.remove('is-spinning');
      $('#ruleta-spin').disabled = false;
      result.innerHTML = `<div class="result-card">
        <p class="eyebrow">${ic('i-bolt', 'ic--o')} Te tocó</p>
        <h3>${esc(winner.titulo)}</h3>
        <ul class="pc-meta">
          <li>${ic('i-pin')}<span>${esc(winner.lugar)} · ${esc(winner.barrio)}</span><span class="muted">${fmtKm(distKm(winner))}</span></li>
          <li>${ic('i-clock')}<span class="tnum">${esc(fmtCuando(winner.inicio))}</span></li>
          <li>${ic('i-wallet')}<span class="tnum">${isFree(winner) ? 'Gratis' : money(gasto(winner)) + ' aprox.'} · ${libres(winner)} cupos libres</span></li>
        </ul>
        <div class="form-actions form-actions--split">
          <button class="btn btn--ghost btn--xs" data-action="detalle" data-id="${winner.id}">${ic('i-info')} Ver detalle</button>
          <button class="btn btn--primary btn--xs" data-action="fly" data-id="${winner.id}">${ic('i-pin')} Ir a su ubicación</button>
        </div>
      </div>`;
    }, dur + 80);
  }

  /* ---------- Ticket IG Stories ---------- */
  let ticketId = null;
  function openTicket(id) {
    const p = findP(id);
    if (!p) return;
    ticketId = id;
    $('#story-preview').innerHTML = `
      <div class="story" role="img" aria-label="Ticket para historias de ${esc(p.titulo)}">
        <div class="story-top"><span class="brand-mark">${ic('i-rock')}</span> Modo <b>Parche</b></div>
        <div class="story-burst">${isFull(p) ? 'LLENO' : `${libres(p)}<br>${libres(p) === 1 ? 'CUPO' : 'CUPOS'}`}</div>
        <div class="story-mid">
          <p class="story-kicker">Me le caigo a este parche</p>
          <p class="story-title">${esc(p.titulo)}</p>
          <div class="story-meta">
            <span>${ic('i-clock')} ${esc(fmtCuando(p.inicio))}</span>
            <span>${ic('i-pin')} ${esc(p.lugar)} · ${esc(p.barrio)}</span>
          </div>
        </div>
        <div class="story-bottom">
          ${avHTML('me')}
          <div><b>${esc(ME().nombre)}</b><small>Villavicencio · Modo Parche</small></div>
          <div class="story-cupos"><b class="tnum">${ocupados(p)}/${p.cuposMax}</b><br><small>confirmados</small></div>
        </div>
      </div>`;
    openModal('modal-ticket');
  }

  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  async function drawStory(p) {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    try { await document.fonts.load('120px Gagalin'); await document.fonts.load('700 40px Inter'); } catch (e) { /* sin fuentes */ }
    const DISP = '"Gagalin", "Anton", "Bebas Neue", Impact, sans-serif';
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    // Rayas de fondo
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 26;
    for (let x = -H; x < W; x += 90) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke(); }

    // Marca
    g.fillStyle = '#FF5A1F'; g.beginPath(); g.arc(130, 140, 62, 0, Math.PI * 2); g.fill();
    const hand = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${$('#i-rock').innerHTML}</svg>`;
    try { g.drawImage(await loadImg(svgUrl(hand)), 82, 92, 96, 96); } catch (e) { /* ícono opcional */ }
    g.font = `64px ${DISP}`; g.fillStyle = '#fff'; g.textBaseline = 'middle';
    g.fillText('MODO', 218, 142); g.fillStyle = '#FF5A1F'; g.fillText('PARCHE', 218 + g.measureText('MODO ').width, 142);

    // Estrella de cupos
    const burst = [[50,0],[63,10],[79.4,9.6],[84,25.3],[97.6,34.5],[92,50],[97.6,65.5],[84,74.7],[79.4,90.5],[63,89.9],[50,100],[37,89.9],[20.6,90.5],[16,74.7],[2.4,65.5],[8,50],[2.4,34.5],[16,25.3],[20.6,9.6],[37,10.1]];
    g.save(); g.translate(860, 420); g.rotate(0.2);
    g.beginPath(); burst.forEach(([x, y], i) => { const px = (x - 50) * 3.4, py = (y - 50) * 3.4; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath();
    g.fillStyle = '#FF5A1F'; g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center';
    if (isFull(p)) { g.font = `86px ${DISP}`; g.fillText('LLENO', 0, 6); }
    else { g.font = `130px ${DISP}`; g.fillText(String(libres(p)), 0, -22); g.font = `54px ${DISP}`; g.fillText(libres(p) === 1 ? 'CUPO' : 'CUPOS', 0, 62); }
    g.restore(); g.textAlign = 'left';

    // Título
    g.fillStyle = '#FF5A1F'; g.font = `60px ${DISP}`; g.fillText('ME LE CAIGO A ESTE PARCHE', 80, 860);
    g.fillStyle = '#fff'; g.font = `150px ${DISP}`;
    const words = p.titulo.toUpperCase().split(/\s+/); const lines = []; let line = '';
    words.forEach(wd => { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > 920 && line) { lines.push(line); line = wd; } else line = t; });
    if (line) lines.push(line);
    lines.slice(0, 5).forEach((l, i) => g.fillText(l, 80, 1000 + i * 142));
    let y = 1000 + Math.min(lines.length, 5) * 142 + 30;
    g.font = '700 44px Inter, sans-serif'; g.fillStyle = '#fff';
    g.fillText(fmtCuando(p.inicio), 80, y); y += 66;
    g.fillStyle = '#d4d4d8'; g.fillText(`${p.lugar} · ${p.barrio}`.slice(0, 44), 80, y);

    // Banda inferior dentada
    const top = 1600;
    g.fillStyle = '#FF5A1F'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, top);
    for (let x = 0; x <= W; x += 40) { g.lineTo(x + 20, top - 22); g.lineTo(x + 40, top); }
    g.lineTo(W, H); g.closePath(); g.fill();
    // Avatar
    g.save(); g.beginPath(); g.arc(170, 1760, 92, 0, Math.PI * 2); g.closePath(); g.clip();
    try {
      const f = perfil.foto_encuadre;
      if (perfil.mostrar_foto_real && f.src && f.src.startsWith('data:')) {
        const im = await loadImg(f.src);
        const s = 184 * f.zoom, ratio = Math.max(s / im.width, s / im.height);
        const iw = im.width * ratio, ih = im.height * ratio;
        g.drawImage(im, 170 - iw / 2 + f.x / 100 * 184, 1760 - ih / 2 + f.y / 100 * 184, iw, ih);
      } else g.drawImage(await loadImg(svgUrl(avatarSVG(perfil.avatar_config))), 78, 1668, 184, 184);
    } catch (e) { g.fillStyle = '#111'; g.fillRect(78, 1668, 184, 184); }
    g.restore();
    g.lineWidth = 8; g.strokeStyle = '#111'; g.beginPath(); g.arc(170, 1760, 92, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#111'; g.font = `64px ${DISP}`; g.fillText(ME().nombre.toUpperCase(), 300, 1735);
    g.font = '700 34px Inter, sans-serif'; g.fillText('Villavicencio · modoparche.co', 300, 1795);
    g.textAlign = 'right'; g.font = `96px ${DISP}`; g.fillText(`${ocupados(p)}/${p.cuposMax}`, 1000, 1745);
    g.font = '700 30px Inter, sans-serif'; g.fillText('confirmados', 1000, 1805);
    return c;
  }

  async function storyBlob() {
    const p = findP(ticketId);
    const c = await drawStory(p);
    return new Promise(res => c.toBlob(b => res({ blob: b, name: `modo-parche-${norm(p.titulo).replace(/[^a-z0-9]+/g, '-')}.png` }), 'image/png'));
  }
  async function downloadStory() {
    const btn = $('#story-download');
    btn.classList.add('is-loading');
    try {
      const { blob, name } = await storyBlob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Ticket descargado', 'Súbelo a tus historias y etiqueta a tus parceros.', { icon: 'i-download' });
    } catch (e) {
      toast('No se pudo generar', 'Intenta de nuevo en unos segundos.', { type: 'error' });
    }
    btn.classList.remove('is-loading');
  }
  async function shareStory() {
    try {
      const { blob, name } = await storyBlob();
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Modo Parche' });
      } else {
        await downloadStory();
      }
    } catch (e) { if (e && e.name !== 'AbortError') toast('No se pudo compartir', 'Descarga el PNG y súbelo a tus historias.', { type: 'error' }); }
  }

  /* ---------- Compartir seguro ---------- */
  function openShare(id) {
    const p = findP(id);
    if (!p) return;
    const token = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    const link = `https://modoparche.co/seguro/${p.id}-${token}`;
    const lugar = p.planBActivo ? p.planB : p.lugar;
    const msg = [
      'Voy a este parche de Modo Parche:',
      `"${p.titulo}"`,
      `Cuándo: ${fmtCuando(p.inicio)}`,
      `Dónde: ${lugar}, ${p.barrio} (Villavicencio)`,
      `Ubicación en vivo: https://maps.google.com/?q=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`,
      `Organiza: ${creatorName(p)} (verificado, ${creatorRating(p).toFixed(1)} de reputación)`,
      `Seguimiento: ${link}`,
    ].join('\n');
    $('#share-body').innerHTML = `
      <div class="safe-card">
        <div class="safe-row">${ic('i-clock')}<span><b>${esc(fmtCuando(p.inicio))}</b></span></div>
        <div class="safe-row">${ic('i-pin')}<span><b>${esc(lugar)}</b>, ${esc(p.barrio)} · <span class="tnum">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span></span></div>
        <div class="safe-row">${ic('i-shield')}<span>Organiza <b>${esc(creatorName(p))}</b>, cédula verificada · ${creatorRating(p).toFixed(1)}</span></div>
        <div class="safe-row">${ic('i-live')}<span>El enlace muestra tu ubicación en vivo hasta 2 horas después del parche.</span></div>
      </div>
      <div class="safe-link">${ic('i-link')}<span>${esc(link)}</span></div>
      <div class="form-actions form-actions--split">
        <button class="btn btn--ghost" data-action="copy" data-text="${esc(link)}">${ic('i-copy')} Copiar enlace</button>
        <a class="btn btn--primary" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${ic('i-whats')} Enviar por WhatsApp</a>
      </div>`;
    openModal('modal-share');
  }

  async function copyText(text, label = 'Copiado') {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = Object.assign(document.createElement('textarea'), { value: text });
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) { /* nada */ } t.remove();
    }
    toast(label, text.length > 40 ? text.slice(0, 40) + '…' : text, { icon: 'i-copy' });
  }

  /* ---------- Calificar post-parche ---------- */
  let ratingId = null;
  const ratingDraft = {};
  function openRating(id) {
    const p = findP(id);
    if (!p) return;
    ratingId = id;
    const people = p.confirmados.slice(0, 8).map(personById).filter(Boolean);
    people.forEach(x => { ratingDraft[x.id] = { stars: 5, again: state.frecuentes.includes(x.id) }; });
    $('#rating-body').innerHTML = people.length ? `
      <p class="mini-note" style="margin-bottom:1rem">Tu calificación sube la reputación de la gente buena onda. Marca a quién quieres volver a ver.</p>
      <div class="rate-list">${people.map(x => `
        <div class="rate-row" data-person="${x.id}">
          ${avHTML(x.id)}
          <b>${esc(x.nombre)}</b>
          <div class="rate-controls">
            <div class="star-input" role="radiogroup" aria-label="Calificación de ${esc(x.nombre)}">
              ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="is-on" data-star="${n}" aria-label="${n} estrellas">${ic('i-star')}</button>`).join('')}
            </div>
            <button type="button" class="chip again" data-again aria-pressed="${ratingDraft[x.id].again}">${ic('i-repeat')} Volver a parchar</button>
          </div>
        </div>`).join('')}</div>
      <button class="btn btn--primary btn--block" id="rating-save">${ic('i-check')} Enviar calificaciones</button>`
      : `<p class="mini-note">No hubo más asistentes para calificar.</p>`;
    openModal('modal-rating');
  }
  async function saveRating() {
    const p = findP(ratingId);
    if (!p) return;
    let added = 0;
    const nuevos = [];
    Object.entries(ratingDraft).forEach(([pid, r]) => {
      if (r.again && !state.frecuentes.includes(pid)) { state.frecuentes.push(pid); nuevos.push(pid); added++; }
    });
    if (isRemote(p)) {
      const btn = $('#rating-save');
      btn && btn.classList.add('is-loading');
      // Solo las personas reales (uuid) suben su reputación
      const filas = Object.entries(ratingDraft).filter(([pid]) => isUuid(pid))
        .map(([pid, r]) => ({ parche_id: p.id, calificado_id: pid, estrellas: r.stars, volver: r.again }));
      const results = await Promise.all([
        filas.length ? sb.from('calificaciones').upsert(filas, { onConflict: 'parche_id,autor_id,calificado_id', ignoreDuplicates: true }) : { error: null },
        nuevos.length ? sb.from('parceros_frecuentes').upsert(nuevos.map(x => ({ parcero: x })), { onConflict: 'usuario_id,parcero', ignoreDuplicates: true }) : { error: null },
        sb.from('parche_miembros').update({ calificado: true }).eq('parche_id', p.id).eq('usuario_id', me.id),
      ]);
      btn && btn.classList.remove('is-loading');
      const err = results.find(r => r.error);
      if (err) { toast('No se guardaron las calificaciones', dbMsg(err.error), { type: 'error' }); return; }
    }
    p.calificado = true;
    save();
    closeModal('modal-rating');
    toast('Gracias por calificar', added ? `${added} ${added === 1 ? 'parcero quedó' : 'parceros quedaron'} en tus frecuentes.` : 'Tu opinión ya cuenta en la reputación.', { icon: 'i-star' });
    refresh();
  }

  /* =====================================================================
     12. PERFIL
  ===================================================================== */
  // Con sesión, las insignias se ganan: El Armador al abrir un parche, Firme en el Parche al hacer check-in
  const badges = () => [
    { id: 'armador', label: 'El Armador', icon: 'i-megaphone', on: DEMO || state.parches.some(isMine) },
    { id: 'firme', label: 'Firme en el Parche', icon: 'i-anchor', on: DEMO || state.parches.some(p => p.checkin) },
    { id: 'rumbero', label: 'Rey de la Rumba', icon: 'i-cat-rumba', on: false },
    { id: 'llanero', label: 'Llanero de Ruta', icon: 'i-cat-pueblear', on: false },
  ];
  function maskCedula(c) {
    if (!c) return 'Sin registrar';
    const parts = Number(c).toLocaleString('es-CO').split('.');
    return parts.length > 2 ? [parts[0], ...parts.slice(1, -1).map(() => '***'), parts[parts.length - 1]].join('.') : '***' + String(c).slice(-3);
  }
  const badgeHTML = b => `<span class="badge-medal ${b.on ? '' : 'is-locked'}" title="${b.on ? 'Desbloqueada' : 'Bloqueada'}"><i>${ic(b.on ? b.icon : 'i-lock')}</i>${esc(b.label)}</span>`;

  function renderAvatars() {
    $('#mini-avatar').innerHTML = avHTML('me');
    $('#id-avatar').innerHTML = avHTML('me');
    $('#rep-card').innerHTML = `
      <div class="rep-top">${avHTML('me')}<div><p class="rep-name">${esc(perfil.nombre)}</p><p class="rep-sub">${esc(perfil.ciudad)} · Verificado</p></div></div>
      <div class="rep-score"><b class="tnum">${perfil.rating.toFixed(1)}</b><span>/ 5.0</span> ${starsHTML(perfil.rating)}</div>
      <p class="rep-reviews tnum">${perfil.resenas} reseñas de parceros</p>
      <div class="badges">${badges().filter(b => b.on).map(badgeHTML).join('') || '<span class="rep-reviews">Abre tu primer parche para ganar insignias.</span>'}</div>`;
  }

  function renderPerfil() {
    renderAvatars();
    $('#id-name').textContent = perfil.nombre;
    $('#ro-nombre').textContent = perfil.nombre;
    $('#id-handle').textContent = `${perfil.mail || ''}${perfil.mail ? ' · ' : ''}${perfil.ciudad}`;
    const ced = DEMO ? '1.121.***.456' : maskCedula(perfil.cedula);
    $('#id-cedula').textContent = ced;
    $('#ro-cedula').textContent = ced;
    $('#id-rep').textContent = `${perfil.rating.toFixed(1)} / 5.0 · ${perfil.resenas} reseñas`;
    $('#id-badges').innerHTML = badges().map(badgeHTML).join('');
    $('#vibe-chips').innerHTML = CATS.filter(c => c.id !== 'todos').map(c => `<button class="chip" data-vibe="${c.id}" aria-pressed="${perfil.intereses.includes(c.id)}">${ic(c.icon)} ${esc(c.label)}</button>`).join('');
    const mode = perfil.mostrar_foto_real ? 'foto' : 'avatar';
    $$('[data-idmode]').forEach(b => { const on = b.dataset.idmode === mode; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
    $('#pane-foto').hidden = mode !== 'foto';
    $('#pane-avatar').hidden = mode !== 'avatar';
    crop = Object.assign({}, perfil.foto_encuadre);
    renderCrop();
    avDraft = Object.assign({}, perfil.avatar_config);
    renderBuilder();
    $('#p-tel').value = perfil.tel; $('#p-mail').value = perfil.mail; $('#p-city').value = perfil.ciudad; $('#p-pass').value = '';
    updatePassRules();
  }

  /* ---------- Foto real con encuadre ---------- */
  let crop = { src: '', zoom: 1, x: 0, y: 0 };
  function renderCrop() {
    const img = $('#crop-img');
    if (crop.src) {
      if (img.getAttribute('src') !== crop.src) img.src = crop.src;
      img.hidden = false; $('#crop-empty').hidden = true;
    } else { img.hidden = true; img.removeAttribute('src'); $('#crop-empty').hidden = false; }
    img.style.transform = `translate(${crop.x}%, ${crop.y}%) scale(${crop.zoom})`;
    $('#crop-zoom').value = crop.zoom; $('#crop-x').value = crop.x; $('#crop-y').value = crop.y;
    $('#out-zoom').textContent = Number(crop.zoom).toFixed(1) + 'x';
    $('#out-x').textContent = Math.round(crop.x);
    $('#out-y').textContent = Math.round(crop.y);
  }
  // Reduce la foto para que quepa en localStorage
  function downscale(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = rej;
      r.onload = async () => {
        try {
          const im = await loadImg(r.result);
          const max = 640, k = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { rej(e); }
      };
      r.readAsDataURL(file);
    });
  }
  function initCropper() {
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
      if (!/^https?:\/\/.+/i.test(url)) { toast('Enlace no válido', 'Pega un enlace que empiece por https://', { type: 'error' }); return; }
      loadImg(url).then(() => { crop = { src: url, zoom: 1, x: 0, y: 0 }; renderCrop(); })
        .catch(() => toast('No cargó la imagen', 'Revisa que el enlace sea de una foto pública.', { type: 'error' }));
    });
    ['zoom', 'x', 'y'].forEach(k => $('#crop-' + k).addEventListener('input', e => { crop[k] = Number(e.target.value); renderCrop(); }));
    // Arrastrar para posicionar
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
    const end = () => { drag = null; };
    frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
    frame.addEventListener('wheel', e => { if (!crop.src) return; e.preventDefault(); crop.zoom = clamp(crop.zoom - e.deltaY * 0.002, 1, 3); renderCrop(); }, { passive: false });
    $('#crop-save').addEventListener('click', async e => {
      if (!crop.src) { toast('Falta la foto', 'Sube una foto o pega un enlace primero.', { type: 'error' }); return; }
      if (!DEMO) {
        const btn = e.currentTarget;
        btn.classList.add('is-loading');
        try {
          const src = crop.src.startsWith('data:') ? await uploadFoto(crop.src, 'avatar') : crop.src;
          const foto = { src, zoom: crop.zoom, x: crop.x, y: crop.y };
          await updatePerfilRemote({ foto_encuadre: foto, mostrar_foto_real: true });
          crop.src = src;
        } catch (err) {
          btn.classList.remove('is-loading');
          toast('No se guardó la foto', dbMsg(err), { type: 'error' });
          return;
        }
        btn.classList.remove('is-loading');
      }
      perfil.foto_encuadre = Object.assign({}, crop);
      perfil.mostrar_foto_real = true;
      savePerfil(); renderPerfil(); refresh();
      toast('Foto guardada', 'Así te ven ahora en los parches.', { icon: 'i-camera' });
    });
  }

  /* ---------- Constructor de avatar ---------- */
  let avDraft = {};
  function renderBuilder() {
    $('#builder-preview').innerHTML = `<span class="av">${avatarSVG(avDraft)}</span>`;
    const group = (key, title) => `<div class="opt-group"><span>${title}</span><div class="opt-row">${AV_OPTS[key].map(v => `<button type="button" class="chip" data-av="${key}" data-val="${v}" aria-pressed="${avDraft[key] === v}">${esc(AV_LABELS[key][v])}</button>`).join('')}</div></div>`;
    $('#builder-options').innerHTML = `
      <div class="opt-group"><span>Tono de piel</span><div class="opt-row">${AV_OPTS.piel.map((c, i) => `<button type="button" class="swatch" style="background:${c}" data-av="piel" data-val="${i}" aria-pressed="${Number(avDraft.piel) === i}" aria-label="Tono ${i + 1}"></button>`).join('')}</div></div>
      ${group('pelo', 'Cabello / gorra')}${group('gafas', 'Gafas urbanas')}${group('ropa', 'Ropa')}${group('fondo', 'Fondo')}`;
  }
  function initBuilder() {
    $('#builder-options').addEventListener('click', e => {
      const b = e.target.closest('[data-av]');
      if (!b) return;
      avDraft[b.dataset.av] = b.dataset.av === 'piel' ? Number(b.dataset.val) : b.dataset.val;
      renderBuilder();
    });
    $('#avatar-random').addEventListener('click', () => {
      avDraft = { piel: Math.floor(Math.random() * 5), pelo: pick(AV_OPTS.pelo), gafas: pick(AV_OPTS.gafas), ropa: pick(AV_OPTS.ropa), fondo: pick(AV_OPTS.fondo) };
      renderBuilder();
    });
    $('#avatar-save').addEventListener('click', async () => {
      if (!DEMO) {
        try { await updatePerfilRemote({ avatar_config: avDraft, mostrar_foto_real: false }); }
        catch (err) { toast('No se guardó el avatar', dbMsg(err), { type: 'error' }); return; }
      }
      perfil.avatar_config = Object.assign({}, avDraft);
      perfil.mostrar_foto_real = false;
      savePerfil(); renderPerfil(); refresh();
      toast('Avatar guardado', 'Tu avatar urbano ya está en todos tus parches.', { icon: 'i-user' });
    });
  }

  /* ---------- Datos permitidos ---------- */
  const PROFILE_RULES = {
    'p-tel': v => !/^3\d{9}$/.test(v) ? 'Celular de 10 dígitos que empiece por 3.' : '',
    'p-mail': v => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? 'Escribe un correo válido.' : '',
    'p-pass': v => v && (v.length < 8 || !/[A-Z]/.test(v)) ? 'Mínimo 8 caracteres y una mayúscula.' : '',
  };
  function validateProfile(id) {
    const input = $('#' + id);
    const msg = PROFILE_RULES[id](input.value);
    const field = input.closest('.field');
    setFieldState(field, msg, id !== 'p-pass' || !!input.value);
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    return !msg;
  }
  function updatePassRules() {
    const v = $('#p-pass').value;
    $('[data-rule="len"]').classList.toggle('is-met', v.length >= 8);
    $('[data-rule="upper"]').classList.toggle('is-met', /[A-Z]/.test(v));
  }
  function initProfileForm() {
    const form = $('#form-perfil');
    Object.keys(PROFILE_RULES).forEach(id => {
      const input = $('#' + id);
      input.addEventListener('blur', () => { if (input.value || input.closest('.field').classList.contains('is-error')) validateProfile(id); });
      input.addEventListener('input', () => {
        if (id === 'p-tel') input.value = input.value.replace(/\D/g, '').slice(0, 10);
        if (id === 'p-pass') updatePassRules();
        if (input.closest('.field').classList.contains('is-error') || id === 'p-pass') validateProfile(id);
      });
    });
    $('#pass-eye').addEventListener('click', e => {
      const inp = $('#p-pass'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      e.currentTarget.textContent = show ? 'Ocultar' : 'Ver';
      e.currentTarget.setAttribute('aria-pressed', show);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const bad = Object.keys(PROFILE_RULES).filter(id => !validateProfile(id));
      if (bad.length) { $('#' + bad[0]).focus(); return; }
      const tel = $('#p-tel').value, mail = $('#p-mail').value.trim(), ciudad = $('#p-city').value, pass = $('#p-pass').value;
      const mailChanged = mail !== perfil.mail;
      if (!DEMO) {
        const btn = $('button[type="submit"]', form);
        btn.classList.add('is-loading');
        try {
          const r1 = await sb.from('perfiles_privados').update({ telefono: tel }).eq('id', me.id);
          if (r1.error) throw r1.error;
          await updatePerfilRemote({ ciudad });
          if (mailChanged || pass) {
            const changes = {};
            if (mailChanged) changes.email = mail;
            if (pass) changes.password = pass;
            const r2 = await sb.auth.updateUser(changes);
            if (r2.error) throw r2.error;
          }
        } catch (err) {
          btn.classList.remove('is-loading');
          toast('No se guardaron los datos', dbMsg(err), { type: 'error' });
          return;
        }
        btn.classList.remove('is-loading');
      }
      perfil.tel = tel; perfil.ciudad = ciudad;
      if (DEMO) perfil.mail = mail;
      $('#p-pass').value = ''; updatePassRules();
      $$('.field', form).forEach(f => f.classList.remove('is-valid'));
      savePerfil(); renderPerfil();
      const msg = mailChanged && !DEMO ? `Te enviamos un correo a ${mail} para confirmar el cambio.`
        : pass ? 'Actualizamos tus datos y tu contraseña.' : 'Tus datos quedaron al día.';
      toast('Datos guardados', msg, { icon: 'i-check' });
    });
  }

  /* =====================================================================
     13. HEADER, NOTIFICACIONES, TOASTS
  ===================================================================== */
  function setDesparchado(on, silent = false) {
    state.desparchado = on;
    $('#desparche').setAttribute('aria-checked', String(on));
    if (!silent) toast(on ? 'Radar inmediato encendido' : 'Radar inmediato apagado', on ? `Solo parches abiertos que arrancan en menos de 2 horas a ${state.dist} km.` : 'Volviste a ver todos los planes.', { icon: 'i-radar' });
    if (state.view === 'radar') withSkeleton($('#radar-grid'), 4, () => renderRadar(true));
    renderHero();
    if (state.view === 'mapa') renderLiveMap();
    if (state.view === 'radar') renderRadarWidget();
  }
  function updateDesparcheSub() { $('#desparche-sub').textContent = `Próx. 2 h · ${state.dist} km`; }

  function applyTheme(t, persist = true) {
    document.documentElement.setAttribute('data-theme', t);
    $('#btn-theme').setAttribute('aria-label', t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    $('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#000000' : '#111111');
    if (persist) store.set(KEYS.theme, t);
  }

  function notify(icon, html, parche = null) {
    state.notifs.unshift({ id: 'n' + Date.now() + Math.random().toString(36).slice(2, 5), icon, html, ts: Date.now(), leida: false, parche });
    renderNotifs(true);
    save();
  }
  function timeAgo(ts) {
    const m = Math.round((Date.now() - ts) / MIN);
    if (m < 1) return 'Ahora';
    if (m < 60) return `Hace ${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `Hace ${h} h` : `Hace ${Math.round(h / 24)} d`;
  }
  function renderNotifs(bump = false) {
    const unread = state.notifs.filter(n => !n.leida).length;
    const badge = $('#notif-badge');
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : unread;
    if (bump) { badge.classList.remove('is-bump'); void badge.offsetWidth; badge.classList.add('is-bump'); }
    $('#btn-notif').setAttribute('aria-label', `Notificaciones, ${unread} sin leer`);
    $('#notif-list').innerHTML = state.notifs.length ? state.notifs.slice(0, 20).map(n => `
      <li><button class="notif-item ${n.leida ? '' : 'is-unread'}" style="width:100%;text-align:left" ${n.parche ? `data-action="notif-open" data-nid="${n.id}"` : ''}>
        <i>${ic(n.icon || 'i-bell')}</i><span>${n.html}<small>${timeAgo(n.ts)}</small></span>
      </button></li>`).join('') : '<li class="notif-empty">Todo tranquilo por ahora.</li>';
  }
  function toggleNotif(force) {
    const panel = $('#notif-panel'), btn = $('#btn-notif');
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) renderNotifs();
  }
  const closeNotif = () => toggleNotif(false);

  function toast(title, text = '', { icon = 'i-check', type = '', action = null, ms = 4200 } = {}) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type ? 'toast--' + type : ''}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-ic">${ic(type === 'error' ? 'i-alert' : icon)}</span>
      <div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>
      ${action ? `<button class="btn btn--primary btn--xs" data-action="fly" data-id="${action.id}">${esc(action.label)}</button>` : ''}
      <button class="toast-x" aria-label="Cerrar aviso">${ic('i-close')}</button>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    const kill = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); };
    el.querySelector('.toast-x').addEventListener('click', kill);
    if (action) el.querySelector('[data-action]').addEventListener('click', kill);
    setTimeout(kill, ms);
  }

  /* =====================================================================
     14. MODALES
  ===================================================================== */
  const modalStack = [];
  function openModal(id) {
    const m = $('#' + id);
    if (!m) return;
    closeNotif();
    if (!m.hidden && !m.classList.contains('is-closing')) return;
    clearTimeout(m._closeT);
    m.hidden = false;
    m.classList.remove('is-closing');
    const panel = $('.modal-panel', m);
    panel.style.transform = '';
    panel.setAttribute('tabindex', '-1');
    modalStack.push({ id, ret: document.activeElement });
    document.body.classList.add('no-scroll');
    setTimeout(() => {
      const first = id === 'modal-create' && !isMobile() ? F('titulo') : panel;
      first && first.focus({ preventScroll: true });
    }, 60);
  }
  function closeModal(id) {
    const m = $('#' + id);
    if (!m || m.hidden || m.classList.contains('is-closing')) return;
    m.classList.add('is-closing');
    clearTimeout(m._closeT);
    m._closeT = setTimeout(() => { m.hidden = true; m.classList.remove('is-closing'); }, reduceMotion ? 0 : 200);
    const i = modalStack.findIndex(x => x.id === id);
    const entry = i >= 0 ? modalStack.splice(i, 1)[0] : null;
    if (!modalStack.length) document.body.classList.remove('no-scroll');
    if (id === 'modal-detail') { detailId = null; detailUI.typing = false; }
    if (entry && entry.ret && document.contains(entry.ret)) entry.ret.focus({ preventScroll: true });
  }
  function closeAllModals() { [...modalStack].reverse().forEach(x => closeModal(x.id)); }

  function trapFocus(e) {
    const top = modalStack[modalStack.length - 1];
    if (!top || e.key !== 'Tab') return;
    const panel = $('#' + top.id + ' .modal-panel');
    const f = $$('button:not([disabled]), [href], input:not([type="hidden"]):not([hidden]), select, textarea, [tabindex]:not([tabindex="-1"])', panel).filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* Bottom sheet: arrastrar hacia abajo para cerrar */
  function initSheets() {
    $$('.modal').forEach(m => {
      const handle = $('.sheet-handle', m), panel = $('.modal-panel', m);
      if (!handle) return;
      let y0 = null, dy = 0;
      handle.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; handle.setPointerCapture(e.pointerId); panel.style.transition = 'none'; });
      handle.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
      const end = () => {
        if (y0 == null) return;
        panel.style.transition = 'transform .25s cubic-bezier(.16,1,.3,1)';
        if (dy > 110) { panel.style.transform = 'translateY(100%)'; setTimeout(() => closeModal(m.id), 180); }
        else panel.style.transform = '';
        y0 = null;
      };
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    });
  }

  /* =====================================================================
     15. EVENTOS E INICIO
  ===================================================================== */
  function onClick(e) {
    const t = e.target;

    // Cerrar modales
    const closer = t.closest('[data-close]');
    if (closer) { const m = closer.closest('.modal'); if (m) closeModal(m.id); return; }

    // Navegación
    const nav = t.closest('[data-nav]');
    if (nav) { closeAllModals(); go(nav.dataset.nav); return; }

    // Filtros del radar
    const catBtn = t.closest('[data-cat]');
    if (catBtn) { state.cat = catBtn.dataset.cat; withSkeleton($('#radar-grid'), 4, () => renderRadar(true)); renderCats(); return; }
    const bud = t.closest('[data-budget]');
    if (bud) {
      state.budget = bud.dataset.budget;
      $$('#budget-seg .seg-btn').forEach(b => b.classList.toggle('is-active', b === bud));
      withSkeleton($('#radar-grid'), 4, () => renderRadar(true));
      return;
    }
    const mis = t.closest('[data-mis]');
    if (mis) { state.misTab = mis.dataset.mis; withSkeleton($('#mis-grid'), 3, () => renderMis(true)); return; }

    // Filtro temporal del mapa
    const tb = t.closest('[data-time]');
    if (tb) {
      state.time = tb.dataset.time === 'fecha' ? { mode: 'fecha', date: tb.dataset.key } : { mode: tb.dataset.time, date: null };
      renderLiveMap();
      return;
    }

    // Perfil
    const idm = t.closest('[data-idmode]');
    if (idm) {
      const foto = idm.dataset.idmode === 'foto';
      $$('[data-idmode]').forEach(b => { const on = b === idm; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
      $('#pane-foto').hidden = !foto; $('#pane-avatar').hidden = foto;
      if (!foto || perfil.foto_encuadre.src) {
        perfil.mostrar_foto_real = foto; savePerfil(); renderAvatars();
        if (!DEMO) updatePerfilRemote({ mostrar_foto_real: foto }).catch(err => toast('No se guardó', dbMsg(err), { type: 'error' }));
      }
      return;
    }
    const vibe = t.closest('[data-vibe]');
    if (vibe) {
      const c = vibe.dataset.vibe;
      perfil.intereses = perfil.intereses.includes(c) ? perfil.intereses.filter(x => x !== c) : perfil.intereses.concat(c);
      vibe.setAttribute('aria-pressed', perfil.intereses.includes(c));
      savePerfil();
      if (!DEMO) updatePerfilRemote({ intereses: perfil.intereses }).catch(err => toast('No se guardó', dbMsg(err), { type: 'error' }));
      return;
    }

    // Formulario de creación: portadas
    const cover = t.closest('[data-cover]');
    if (cover) { draft.imagen = cover.dataset.cover; renderCoverPicker(); renderPreview(); return; }

    // Calificar
    const star = t.closest('[data-star]');
    if (star) {
      const row = star.closest('[data-person]'), n = Number(star.dataset.star);
      ratingDraft[row.dataset.person].stars = n;
      $$('[data-star]', row).forEach(b => b.classList.toggle('is-on', Number(b.dataset.star) <= n));
      return;
    }
    const again = t.closest('[data-again]');
    if (again) {
      const pid = again.closest('[data-person]').dataset.person;
      ratingDraft[pid].again = !ratingDraft[pid].again;
      again.setAttribute('aria-pressed', ratingDraft[pid].again);
      return;
    }
    if (t.closest('#rating-save')) { saveRating(); return; }

    // Ruleta: montos rápidos
    const bq = t.closest('[data-budget-q]');
    if (bq) {
      $('#ruleta-budget').value = bq.dataset.budgetQ;
      $$('#ruleta-chips .chip').forEach(c => c.classList.toggle('is-active', c === bq));
      return;
    }

    // Acciones con data-action
    const a = t.closest('[data-action]');
    if (!a) {
      if (!t.closest('.notif')) closeNotif();
      return;
    }
    const id = a.dataset.id;
    switch (a.dataset.action) {
      case 'crear': closeAllModals(); openCreate({ fecha: a.dataset.fecha }); break;
      case 'join': toggleJoin(id); break;
      case 'detalle': closeAllModals(); openDetail(id); break;
      case 'editar': closeAllModals(); openCreate({ id }); break;
      case 'cancelar': askDelete(id); break;
      case 'fly': flyToParche(id); break;
      case 'simular': simulateLive(); break;
      case 'planb': activatePlanB(id, true); break;
      case 'planb-off': activatePlanB(id, false); break;
      case 'share': openShare(id); break;
      case 'ticket': openTicket(id); break;
      case 'checkin': checkin(id); break;
      case 'rate': openRating(id); break;
      case 'copy': copyText(a.dataset.text, 'Enlace copiado'); break;
      case 'copy-coupon': copyText(a.dataset.code, 'Código copiado'); break;
      case 'desparche-off': setDesparchado(false); break;
      case 'go-radar': go('radar'); break;
      case 'ride-open': detailUI.ride = detailUI.ride === a.dataset.tipo ? null : a.dataset.tipo; renderDetailParts(); break;
      case 'ride-remove': {
        const p = findP(detailId);
        if (!p) break;
        p.ruta = p.ruta.filter(r => r.who !== 'me'); save(); renderDetailParts();
        if (isRemote(p)) sb.from('rutas').delete().eq('parche_id', p.id).eq('usuario_id', me.id)
          .then(({ error }) => error && toast('No se quitó la ruta', dbMsg(error), { type: 'error' }));
        break;
      }
      case 'logout': logout(); break;
      case 'vaca-send': {
        const p = findP(detailId), total = Number($('#vaca-total').value) || 0;
        if (!p) break;
        if (total <= 0) { toast('Falta el total', 'Escribe cuánto gastó el grupo.', { type: 'error' }); break; }
        const n = Math.max(1, ocupados(p));
        sendChat(`La vaca: ${money(total)} entre ${n} = ${money(Math.ceil(total / n / 100) * 100)} cada uno.`);
        break;
      }
      case 'notif-open': {
        const n = state.notifs.find(x => String(x.id) === a.dataset.nid);
        if (n) {
          n.leida = true; save(); renderNotifs(); closeNotif();
          if (!DEMO && n.remote) sb.from('notificaciones').update({ leida: true }).eq('id', n.id).then(() => {});
          if (findP(n.parche)) openDetail(n.parche);
        }
        break;
      }
      case 'invite': {
        const person = personById(a.dataset.pid);
        const mio = state.parches.filter(p => isMine(p) && !isPast(p)).sort((x, y) => x.inicio - y.inicio)[0];
        if (!mio) { toast('Primero arma un parche', `Así puedes invitar a ${person.nombre}.`, { icon: 'i-plus' }); openCreate(); break; }
        if (DEMO) { toast('Invitación enviada', `${person.nombre} recibió tu invitación a ${mio.titulo}.`, { icon: 'i-send' }); break; }
        copyText(parcheLink(mio.id), `Enlace de ${mio.titulo} copiado`);
        break;
      }
      case 'add-parcero': {
        const pid = a.dataset.pid;
        if (!state.frecuentes.includes(pid)) state.frecuentes.push(pid);
        save(); renderParceros();
        toast('Parcero agregado', `${personById(pid).nombre} ya está en tus frecuentes.`, { icon: 'i-users-plus' });
        if (!DEMO) sb.from('parceros_frecuentes').upsert({ parcero: pid }, { onConflict: 'usuario_id,parcero', ignoreDuplicates: true })
          .then(({ error }) => error && toast('No se guardó', dbMsg(error), { type: 'error' }));
        break;
      }
      case 'remove-parcero': {
        const pid = a.dataset.pid;
        state.frecuentes = state.frecuentes.filter(x => x !== pid);
        save(); renderParceros();
        if (!DEMO) sb.from('parceros_frecuentes').delete().eq('usuario_id', me.id).eq('parcero', pid)
          .then(({ error }) => error && toast('No se quitó', dbMsg(error), { type: 'error' }));
        break;
      }
    }
  }

  function bind() {
    // Capture: los popups de Leaflet frenan la propagación del clic
    document.addEventListener('click', onClick, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (modalStack.length) { closeModal(modalStack[modalStack.length - 1].id); return; }
        if (!$('#notif-panel').hidden) { closeNotif(); $('#btn-notif').focus(); return; }
        if ($('#search').classList.contains('is-open')) { toggleSearch(false); return; }
      }
      trapFocus(e);
      if (e.key === '/' && !modalStack.length && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        e.preventDefault(); if (isMobile()) toggleSearch(true); else $('#search-input').focus();
      }
    });

    // Imágenes rotas: patrón de marca
    document.addEventListener('error', e => {
      const img = e.target;
      if (img.tagName !== 'IMG') return;
      const box = img.closest('.pc-media, .pop-media, .detail-hero, .cover-opt');
      if (box) box.classList.add('is-error');
    }, true);

    // Búsqueda en vivo
    let st;
    $('#search-input').addEventListener('input', e => {
      clearTimeout(st);
      $('#search-clear').hidden = !e.target.value;
      st = setTimeout(() => {
        state.search = e.target.value.trim();
        if (state.view !== 'radar' && state.view !== 'mapa') go('radar', { skeleton: false });
        refresh();
      }, 140);
    });
    $('#search-clear').addEventListener('click', () => {
      $('#search-input').value = ''; $('#search-clear').hidden = true; state.search = ''; refresh(); $('#search-input').focus();
    });
    $('#search-toggle').addEventListener('click', () => toggleSearch());

    // Header
    $('#desparche').addEventListener('click', () => setDesparchado(!state.desparchado));
    $('#btn-theme').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    $('#btn-notif').addEventListener('click', e => { e.stopPropagation(); toggleNotif(); });
    $('#notif-read').addEventListener('click', () => {
      const ids = state.notifs.filter(n => !n.leida && n.remote).map(n => n.id);
      state.notifs.forEach(n => { n.leida = true; }); save(); renderNotifs();
      if (!DEMO && ids.length) sb.from('notificaciones').update({ leida: true }).in('id', ids).then(() => {});
    });
    $('#btn-ruleta').addEventListener('click', () => { $('#ruleta-result').innerHTML = ''; openModal('modal-ruleta'); });
    $('#ruleta-spin').addEventListener('click', spinRuleta);
    $('#ruleta-budget').addEventListener('input', () => $$('#ruleta-chips .chip').forEach(c => c.classList.toggle('is-active', c.dataset.budgetQ === $('#ruleta-budget').value)));

    // Filtros
    $('#dist-range').addEventListener('input', e => {
      state.dist = Number(e.target.value);
      $('#dist-out').textContent = `${state.dist} km`;
      updateDesparcheSub();
      renderRadar(); renderHero();
    });
    $('#sort-select').addEventListener('change', e => { state.sort = e.target.value; withSkeleton($('#radar-grid'), 4, () => renderRadar(true)); });
    $('#reset-filters').addEventListener('click', () => {
      state.cat = 'todos'; state.budget = 'todos'; state.dist = 25; state.search = '';
      $('#dist-range').value = 25; $('#dist-out').textContent = '25 km'; $('#search-input').value = ''; $('#search-clear').hidden = true;
      $$('#budget-seg .seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.budget === 'todos'));
      updateDesparcheSub();
      if (state.desparchado) setDesparchado(false, true);
      withSkeleton($('#radar-grid'), 4, () => renderRadar(true));
      renderHero();
    });

    // Mapa: selector de día y fecha
    $('#time-select').addEventListener('change', e => { if (e.target.value) { state.time = { mode: 'fecha', date: e.target.value }; renderLiveMap(); } });
    $('#time-date').addEventListener('change', e => {
      const v = e.target.value;
      if (!v) return;
      if (v === todayKey()) state.time = { mode: 'hoy', date: null };
      else if (v === offsetKey(1)) state.time = { mode: 'manana', date: null };
      else state.time = { mode: 'fecha', date: v };
      renderLiveMap();
    });
    $('#map-locate').addEventListener('click', () => liveMap && liveMap.flyTo(CENTER, 13, { duration: reduceMotion ? 0 : 1 }));

    // Formulario de crear
    const form = $('#form-create');
    form.addEventListener('submit', submitCreate);
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (n && touched.has(n)) validate(n);
      if (n === 'costo' && touched.has('presupuesto')) validate('presupuesto');
      if (n === 'fecha' && touched.has('hora')) validate('hora');
      renderPreview();
    });
    form.addEventListener('focusout', e => { const n = e.target.name; if (n && RULES[n]) { touched.add(n); validate(n); } });
    form.addEventListener('change', async e => {
      if (e.target.name === 'categoria') {
        const covers = Object.values(COVERS).flat();
        if (!draft.imagen || covers.includes(draft.imagen)) draft.imagen = coversFor(e.target.value)[0];
        renderCoverPicker(); renderPreview();
        if (createMarker) setCreatePin(draft.lat, draft.lng, true);
      }
      if (e.target.id === 'cover-file') {
        const f = e.target.files[0];
        if (!f) return;
        try { draft.imagen = await downscale(f); renderCoverPicker(); renderPreview(); }
        catch (err) { toast('No pudimos leer la imagen', 'Prueba con otra.', { type: 'error' }); }
      }
    });

    // Chat
    document.addEventListener('submit', e => {
      if (e.target.id === 'chat-form') {
        e.preventDefault();
        const inp = $('#chat-input');
        sendChat(inp.value); inp.value = ''; inp.focus();
      }
      if (e.target.id === 'ride-form') {
        e.preventDefault();
        const p = findP(detailId);
        if (!p) return;
        const tipo = e.target.dataset.tipo;
        const barrio = ($('#r-barrio').value.trim() || 'Barzal').slice(0, 40);
        const veh = $('#r-veh')?.value || 'carro';
        const ruta = tipo === 'lleva' ? { who: 'me', tipo: veh, cupos: Number($('#r-cupos').value), barrio } : { who: 'me', tipo: 'busca', barrio };
        const aviso = tipo === 'lleva' ? `Llevo ${veh} con ${ruta.cupos} ${ruta.cupos === 1 ? 'cupo' : 'cupos'} desde ${barrio}` : `Busco cupo desde ${barrio}`;
        p.ruta = p.ruta.filter(r => r.who !== 'me');
        p.ruta.push(ruta);
        detailUI.ride = null;
        if (isRemote(p)) {
          (async () => {
            await sb.from('rutas').delete().eq('parche_id', p.id).eq('usuario_id', me.id);
            const { error } = await sb.from('rutas').insert({ parche_id: p.id, tipo: ruta.tipo, cupos: ruta.cupos || null, barrio });
            if (error) { toast('No se publicó la ruta', dbMsg(error), { type: 'error' }); return loadDetailRemote(p.id); }
            sendChat(aviso);
          })();
        } else {
          p.chat.push({ tipo: 'sys', texto: `${ME().nombre}: ${aviso.toLowerCase()}`, ts: Date.now() });
        }
        save(); renderDetailParts();
        toast('Ruta publicada', tipo === 'lleva' ? 'Los que buscan cupo ya te ven.' : 'Te avisamos si alguien te lleva.', { icon: tipo === 'lleva' ? 'i-car' : 'i-thumb' });
      }
    });
    document.addEventListener('input', e => { if (e.target.id === 'vaca-total') updateVaca(); });

    // Ticket
    $('#story-download').addEventListener('click', downloadStory);
    $('#story-share').addEventListener('click', shareStory);

    // Reloj del hero y radar
    setInterval(() => { renderHero(); if (state.view === 'radar') renderRadarWidget(); }, 60 * 1000);

    window.addEventListener('resize', () => {
      if (!isMobile()) toggleSearch(false);
      liveMap && liveMap.invalidateSize();
      radarMap && radarMap.invalidateSize();
    });
  }

  function toggleSearch(force) {
    const s = $('#search');
    const open = force ?? !s.classList.contains('is-open');
    s.classList.toggle('is-open', open);
    $('#search-toggle').setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => $('#search-input').focus(), 30);
  }

  /* =====================================================================
     16. SUPABASE: sesión, carga, tiempo real y escritura
  ===================================================================== */
  const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
  const shortName = n => { const [a, b] = String(n || 'Parcero').trim().split(/\s+/); return b ? `${a} ${b.charAt(0)}.` : a; };
  const safeHtml = s => esc(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>'); // solo se permite <b>
  const parcheLink = id => new URL('dashboard.html?parche=' + encodeURIComponent(id), window.location.href).href;

  function dbMsg(err) {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/failed to fetch|network/i.test(m)) return 'Sin conexión. Revisa tu internet.';
    if (/jwt expired|invalid jwt/i.test(m)) return 'Tu sesión venció. Vuelve a entrar.';
    if (/permission denied|row-level security/i.test(m)) return 'No tienes permiso para hacer eso.';
    if (/PGRST205|42P01|does not exist|Could not find the table/i.test(m)) return 'Faltan las tablas en Supabase.';
    if (/PARCHE_LLENO/.test(m)) return 'Ya no quedan cupos en este parche.';
    return m || 'Intenta de nuevo en unos segundos.';
  }

  function setBoot(text) { const t = $('#boot-text'); if (t) t.textContent = text; }
  function hideBoot() { const b = $('#boot'); if (b) { b.classList.add('is-done'); setTimeout(() => b.remove(), 400); } }
  function bootError(err) {
    const faltaSQL = /PGRST205|42P01|Could not find the table|does not exist/i.test(String(err && (err.code + ' ' + err.message)));
    setBoot(faltaSQL
      ? 'Falta crear las tablas en Supabase. Corre el archivo supabase/migrations/20261022230000_dashboard_usuarios.sql en el SQL Editor y recarga.'
      : `No pudimos cargar tus parches. ${dbMsg(err)}`);
    const box = $('#boot-actions');
    box.hidden = false;
    box.innerHTML = `<button class="btn btn--primary" onclick="location.reload()">${ic('i-refresh')} Reintentar</button>
      <a class="btn btn--ghost" href="dashboard.html?demo=1">${ic('i-radar')} Ver en modo demo</a>
      <button class="btn btn--ghost" data-action="logout">${ic('i-logout')} Cerrar sesión</button>`;
    box.addEventListener('click', e => { if (e.target.closest('[data-action="logout"]')) logout(); });
  }

  async function logout() {
    if (DEMO || !sb) { window.location.href = 'login.html'; return; }
    try { await sb.auth.signOut(); } catch (e) { /* igual salimos */ }
    window.location.replace('login.html');
  }

  function personFromRow(r) {
    return {
      id: r.id, nombre: shortName(r.nombre), barrio: r.barrio || r.ciudad || 'Villavicencio',
      rating: Number(r.rating) || 5, av: r.avatar_config || {},
      foto: r.mostrar_foto_real && r.foto_encuadre && r.foto_encuadre.src ? r.foto_encuadre : null,
    };
  }
  async function cachePeople(ids) {
    const faltan = [...new Set(ids.filter(id => isUuid(id) && id !== (me && me.id) && !peopleCache.has(id)))];
    if (!faltan.length) return;
    const { data, error } = await sb.from('perfiles')
      .select('id, nombre, barrio, ciudad, rating, avatar_config, mostrar_foto_real, foto_encuadre').in('id', faltan);
    if (error) { console.warn('[perfiles]', error.message); return; }
    data.forEach(r => peopleCache.set(r.id, personFromRow(r)));
  }

  function applyPerfilRow(p, priv) {
    const meta = (me && me.user_metadata) || {};
    p = p || { nombre: meta.nombre || (me.email || '').split('@')[0], ciudad: 'Villavicencio', intereses: [], rating: 5, resenas: 0 };
    perfil = Object.assign({}, PERFIL_DEF, {
      nombre: p.nombre, primer: String(p.nombre || 'Parcero').split(' ')[0],
      ciudad: p.ciudad || 'Villavicencio',
      mostrar_foto_real: !!p.mostrar_foto_real,
      foto_encuadre: Object.assign({ src: '', zoom: 1, x: 0, y: 0 }, p.foto_encuadre || {}),
      avatar_config: Object.assign({}, PERFIL_DEF.avatar_config, p.avatar_config || {}),
      intereses: p.intereses || [],
      rating: Number(p.rating) || 5, resenas: p.resenas || 0,
      tel: (priv && priv.telefono) || '', cedula: (priv && priv.cedula) || '',
      mail: me.email || '',
    });
  }

  function fromRow(r, miembros, prev) {
    const mia = miembros.find(m => m.usuario_id === me.id);
    const otros = miembros.filter(m => m.usuario_id !== me.id).map(m => m.usuario_id);
    const propio = r.creador_id === me.id;
    return normalizeParche({
      id: r.id, titulo: r.titulo, categoria: r.categoria, descripcion: r.descripcion,
      inicio: Date.parse(r.inicio), lugar: r.lugar, barrio: r.barrio, lat: r.lat, lng: r.lng,
      costo: r.costo, presupuesto: r.presupuesto, cuposMax: r.cupos_max,
      confirmados: (r.confirmados_demo || []).concat(otros),
      unido: !!mia, propio, creadorId: propio ? 'me' : r.creador_id,
      creadorNombre: r.creador_nombre, creadorRating: Number(r.creador_rating) || 4.6,
      aliado: r.aliado, relampago: r.relampago, promo: r.promo, cupon: r.cupon, clima: r.clima,
      imagen: r.imagen, planB: r.plan_b, planBActivo: r.plan_b_activo,
      botRompehielos: r.bot_enviado, cuponDesbloqueado: r.cupon_desbloqueado,
      checkin: !!(mia && mia.checkin), calificado: !!(mia && mia.calificado),
      creadoPorMi: propio, demo: r.demo,
      chat: prev ? prev.chat : [], ruta: prev ? prev.ruta : [],
    });
  }

  const msgFromRow = r => ({
    id: r.id, tipo: r.tipo, texto: r.texto, ts: Date.parse(r.creado_en),
    autor: r.autor_id ? (r.autor_id === me.id ? 'me' : r.autor_id) : r.autor_demo,
  });
  const notifFromRow = r => ({ id: r.id, icon: r.icono, html: safeHtml(r.texto), ts: Date.parse(r.creado_en), leida: r.leida, parche: r.parche_id, remote: true });

  async function loadRemote() {
    const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
    const [pf, pv, ps, ns, fr] = await Promise.all([
      sb.from('perfiles').select('*').eq('id', me.id).maybeSingle(),
      sb.from('perfiles_privados').select('*').eq('id', me.id).maybeSingle(),
      sb.from('parches').select('*').gte('inicio', since).order('inicio'),
      sb.from('notificaciones').select('*').order('creado_en', { ascending: false }).limit(30),
      sb.from('parceros_frecuentes').select('parcero'),
    ]);
    for (const r of [pf, pv, ps, ns, fr]) if (r.error) throw r.error;
    const rows = ps.data || [];
    let miembros = [];
    if (rows.length) {
      const mm = await sb.from('parche_miembros').select('parche_id, usuario_id, checkin, calificado').in('parche_id', rows.map(r => r.id));
      if (mm.error) throw mm.error;
      miembros = mm.data;
    }
    state.frecuentes = fr.data.map(x => x.parcero);
    await cachePeople(rows.map(r => r.creador_id).concat(miembros.map(m => m.usuario_id), state.frecuentes));
    applyPerfilRow(pf.data, pv.data);
    state.parches = rows.map(r => fromRow(r, miembros.filter(m => m.parche_id === r.id)));
    state.notifs = ns.data.map(notifFromRow);
  }

  async function fetchParche(id, drop = false) {
    const [{ data: row, error }, mm] = await Promise.all([
      sb.from('parches').select('*').eq('id', id).maybeSingle(),
      sb.from('parche_miembros').select('parche_id, usuario_id, checkin, calificado').eq('parche_id', id),
    ]);
    if (error) { console.warn('[parche]', error.message); return; }
    const idx = state.parches.findIndex(p => p.id === id);
    if (!row) {
      if (idx >= 0) state.parches.splice(idx, 1);
      const m = liveMarkers.get(id);
      if (m && liveMap) { liveMap.removeLayer(m); liveMarkers.delete(id); }
      if (detailId === id) { closeModal('modal-detail'); toast('Parche cancelado', 'El organizador canceló este plan.', { icon: 'i-trash' }); }
      refresh();
      return;
    }
    const miembros = mm.data || [];
    await cachePeople([row.creador_id].concat(miembros.map(m => m.usuario_id)));
    const prev = idx >= 0 ? state.parches[idx] : null;
    const p = fromRow(row, miembros, prev);
    if (drop) p._drop = true;
    if (idx >= 0) state.parches[idx] = p; else state.parches.push(p);
    if (detailId === id) await loadDetailRemote(id);
    refresh();
  }
  // Varias señales seguidas del tiempo real se juntan en una sola recarga
  const reloadTimers = new Map();
  function reloadParche(id, { drop = false } = {}) {
    if (DEMO || !isUuid(id)) return Promise.resolve();
    return new Promise(res => {
      clearTimeout(reloadTimers.get(id));
      reloadTimers.set(id, setTimeout(() => fetchParche(id, drop).then(res), 150));
    });
  }

  async function loadDetailRemote(id) {
    const p = findP(id);
    if (!isRemote(p)) return;
    const [m, r] = await Promise.all([
      sb.from('mensajes').select('*').eq('parche_id', id).order('creado_en').limit(300),
      sb.from('rutas').select('*').eq('parche_id', id),
    ]);
    if (m.error || r.error) { console.warn('[detalle]', (m.error || r.error).message); return; }
    await cachePeople(m.data.map(x => x.autor_id).concat(r.data.map(x => x.usuario_id)));
    const q = findP(id);
    if (!q) return;
    q.chat = m.data.map(msgFromRow);
    q.ruta = r.data.map(x => ({ who: x.usuario_id ? (x.usuario_id === me.id ? 'me' : x.usuario_id) : x.demo_persona, tipo: x.tipo, cupos: x.cupos, barrio: x.barrio }));
    if (detailId === id) { renderDetailParts(); scrollChat(false); }
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
      let imagen = d.imagen || '';
      if (imagen.startsWith('data:')) imagen = await uploadFoto(imagen, 'portada');
      const row = {
        titulo: d.titulo, categoria: d.categoria, descripcion: d.descripcion,
        inicio: new Date(d.inicio).toISOString(), lugar: d.lugar, barrio: d.barrio,
        lat: d.lat, lng: d.lng, costo: d.costo, presupuesto: d.presupuesto, cupos_max: d.cuposMax,
        imagen, plan_b: d.planB,
      };
      if (editId && !d.planB) row.plan_b_activo = false;
      const res = editId
        ? await sb.from('parches').update(row).eq('id', editId).select('id').single()
        : await sb.from('parches').insert(row).select('id').single();
      if (res.error) throw res.error;
      draft.imagen = imagen;
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
            if (p) toast('Nuevo parche en vivo', `${p.titulo} · ${p.barrio} · ${fmtKm(distKm(p))}`, { icon: 'i-live', action: { label: 'Ver', id } });
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
        // Mi propio mensaje: solo le pone el id al que ya mostré
        const propio = r.autor_id === me.id && p.chat.find(m => m.autor === 'me' && !m.id && m.texto === r.texto);
        if (propio) { propio.id = r.id; return; }
        await cachePeople([r.autor_id]);
        if (p.chat.some(m => m.id === r.id)) return;
        p.chat.push(msgFromRow(r));
        if (detailId === p.id) { renderChatMsgs(p); scrollChat(); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas' }, pl => {
        const id = pidOf(pl);
        if (detailId && (!id || id === detailId)) loadDetailRemote(detailId);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${me.id}` }, ({ new: r }) => {
        if (state.notifs.some(n => n.remote && n.id === r.id)) return;
        state.notifs.unshift(notifFromRow(r));
        renderNotifs(true);
        if (r.icono !== 'i-bolt') toast('Nueva notificación', String(r.texto).replace(/<\/?b>/g, ''), { icon: r.icono || 'i-bell' });
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
    try { await loadRemote(); }
    catch (err) { console.error(err); bootError(err); return false; }
    return true;
  }

  async function init() {
    applyTheme(document.documentElement.getAttribute('data-theme') || 'light', false);
    if (DEMO) {
      loadState();
      save();
    } else {
      const ok = await bootRemote();
      if (!ok) return;
    }

    // Selects y listas del formulario
    $('#c-categoria').innerHTML = CATS.filter(c => c.id !== 'todos').map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    $('#barrios').innerHTML = BARRIOS.map(b => `<option value="${b}">`).join('');
    buildTimeControls();

    bind();
    initCropper();
    initBuilder();
    initProfileForm();
    initSheets();

    renderAvatars();
    renderNotifs();
    renderNavCounts();
    renderHero();
    updateDesparcheSub();
    go('radar');
    hideBoot();

    if (!DEMO) {
      subscribeRealtime();
      const abrir = new URLSearchParams(window.location.search).get('parche');
      if (abrir && findP(abrir)) setTimeout(() => openDetail(abrir), 500);
    } else if (sb) {
      toast('Modo demo', 'Estás viendo datos de ejemplo guardados en este navegador.', { icon: 'i-info' });
    }

    if (typeof L === 'undefined') {
      toast('El mapa no cargó', 'Revisa tu conexión a internet para ver el mapa en vivo.', { type: 'error' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
