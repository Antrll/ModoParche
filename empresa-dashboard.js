/* =====================================================================
   Modo Parche Business · empresa-dashboard.js
   1. Utilidades             8. Cupones, validador y escáner
   2. Datos de muestra       9. Asistentes, chat y modo puerta
   3. Estado y derivados    10. Mapa comercial
   4. Efectos               11. Perfil (solo lectura)
   5. Navegación            12. Diálogos
   6. Tarjeta del local     13. Eventos e inicio
   7. Resumen y parches

   Datos de muestra: cada local trae como máximo 3 parches, 3 cupones,
   3 códigos, 3 reseñas y 3 asistentes por parche. Todo lo demás
   (indicadores, actividad, mapa) se calcula a partir de ellos.
===================================================================== */
(() => {
  'use strict';

  /* =====================================================================
     1. UTILIDADES
  ===================================================================== */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  const NOW = () => Date.now();
  const pad = n => String(n).padStart(2, '0'); // taste-skill-ignore: horas y fechas, no numeración
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#${n}"/></svg>`;
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const nf = new Intl.NumberFormat('es-CO');
  const int = n => nf.format(Math.round(n));
  const money = n => '$' + nf.format(Math.round(n));
  const dec1 = n => n.toFixed(1).replace('.', ',');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const day0 = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const at = (base, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime(); };
  const hhmm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtHora = ts => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(ts).replace(/\s/g, ' ');
  const horaTxt = s => fmtHora(at(NOW(), s));
  const fmtSem = ts => new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(ts).replace(/\./g, '');
  const fmtMes = ts => new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(ts).replace(/\./g, '');
  const fmtDiaMes = ts => `${new Date(ts).getDate()} ${fmtMes(ts)}`;
  const diasDesdeHoy = ts => Math.round((day0(ts) - day0(NOW())) / DAY);
  function fmtDia(ts) {
    const d = diasDesdeHoy(ts);
    if (d === 0) return 'Hoy';
    if (d === 1) return 'Mañana';
    if (d === -1) return 'Ayer';
    return cap(`${fmtSem(ts)} ${fmtDiaMes(ts)}`);
  }
  const fmtCuando = ts => `${fmtDia(ts)}, ${fmtHora(ts)}`;
  function fmtRel(ts) {
    const m = Math.round((NOW() - ts) / MIN);
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    return `${fmtDia(ts).toLowerCase()}, ${fmtHora(ts)}`;
  }
  const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;

  const tint = i => { const h = (i * 67) % 360; return `background:hsl(${h} 70% 92%);color:hsl(${h} 45% 26%)`; };
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const avatar = p => `<span class="avatar" style="${tint(p.tono)}" aria-hidden="true">${esc(initials(p.nombre))}</span>`;
  const stars = n => `<span class="stars" role="img" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5].map(i => `<svg class="ic ${i <= n ? '' : 'off'}" aria-hidden="true"><use href="#i-star"/></svg>`).join('')}</span>`;

  /* =====================================================================
     2. DATOS DE MUESTRA (Villavicencio, coordenadas reales)
  ===================================================================== */
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const REGLAS = {
    checkin: 'Hace check-in en uno de tus parches',
    temprano: 'Llega en la primera hora del parche',
    lleno: 'Su parche llena todos los cupos',
    cumple: 'Celebra su cumpleaños con 6 o más confirmados',
    relampago: 'Llega durante un parche relámpago',
  };
  const TEMAS = { 'Rumba y Bares': 'noche', 'Conciertos y Toques': 'noche', 'Comida y Antojos': 'fuego', 'Planes Chill': 'dia', 'Cultura y Talleres': 'dia' };
  const horarios = (o, c, extra = {}) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, { abierto: true, open: o, close: c, ...(extra[d] || {}) }]));

  function seed() {
    const t0 = day0(NOW()), h = new Date(NOW()).getHours();
    const P = o => ({ asistentes: [], chat: [], cancelado: false, promo: '', consumo: 0, dur: 180, tipo: 'oficial', ...o });
    const A = (nombre, confirmo, llego = null) => ({ id: 'a' + hash(nombre + confirmo).toString(36), nombre, tono: hash(nombre) % 11, confirmo, llego });
    const C = (codigo, k, persona, parcheId, emitido, canjeado = null) => ({ codigo, cuponId: k.id, cupNombre: k.nombre, cupBen: k.beneficio, persona, parcheId, emitido, vence: emitido + k.vigencia * DAY, canjeado });
    const past = ts => Math.min(ts, NOW() - 5 * MIN);

    /* ---------- Discoteca Los Capachos: rumba, tarjeta de noche ---------- */
    const tc = h < 4 ? t0 - DAY : t0; // después de medianoche la rumba sigue siendo "esta noche"
    const capK = [
      { id: 'cap-k1', nombre: 'Mesa llena', beneficio: 'Botella de aguardiente para la mesa', regla: 'lleno', vigencia: 7, limite: 20, prefijo: 'LLENA', estado: 'activo' },
      { id: 'cap-k2', nombre: 'Llegada temprano', beneficio: '2x1 en el primer coctel', regla: 'temprano', vigencia: 3, limite: 50, prefijo: 'TEMPRANO', estado: 'activo' },
      { id: 'cap-k3', nombre: 'Cumpleañero', beneficio: 'Cover gratis para quien cumple', regla: 'cumple', vigencia: 15, limite: 10, prefijo: 'CUMPLE', estado: 'pausado' },
    ];
    const c3i = at(tc - DAY, '21:00');
    const capP = [
      P({ id: 'cap-p1', titulo: 'Noche de crossover', organizador: 'Los Capachos', inicio: at(tc, '22:00'), dur: 300, cupos: 8, consumo: 45000, promo: 'Cover con la primera incluida. La mesa se guarda hasta las 11.',
        asistentes: [A('Laura M.', at(tc - DAY, '19:12')), A('Santiago G.', at(tc - DAY, '20:40')), A('Valentina P.', past(at(tc, '09:05')))] }),
      P({ id: 'cap-p2', tipo: 'comunidad', titulo: 'Cumple de Juliana B.', organizador: 'Juliana B.', inicio: at(tc + DAY, '21:30'), cupos: 10, consumo: 45000,
        asistentes: [A('Juliana B.', at(tc - 2 * DAY, '15:30')), A('Camilo R.', at(tc - 2 * DAY, '18:02')), A('Daniela H.', at(tc - DAY, '11:47'))] }),
      P({ id: 'cap-p3', tipo: 'comunidad', titulo: 'Mesa de la oficina', organizador: 'Mafe P.', inicio: c3i, dur: 240, cupos: 3, consumo: 45000,
        asistentes: [A('Mafe P.', at(tc - 3 * DAY, '10:20'), c3i + 75 * MIN), A('Andrés F.', at(tc - 3 * DAY, '12:05'), c3i + 20 * MIN), A('Kevin O.', at(tc - 2 * DAY, '18:10'), c3i + 35 * MIN)] }),
    ];
    capP[0].chat = [
      { tipo: 'sys', texto: 'Los Capachos abrió el parche', ts: at(tc - 2 * DAY, '12:00') },
      { autor: capP[0].asistentes[0], texto: '¿El cover sí incluye la primera?', ts: at(tc - DAY, '19:20') },
      { autor: 'biz', texto: 'Sí señor, la primera va por la casa. Las mesas se guardan hasta las 11.', ts: at(tc - DAY, '19:31') },
    ];
    const capC = [
      C('LLENA-4821', capK[0], 'Mafe P.', 'cap-p3', at(tc - 2 * DAY, '18:10')),
      C('TEMPRANO-2290', capK[1], 'Andrés F.', 'cap-p3', c3i + 20 * MIN, at(tc - DAY, '23:40')),
      C('TEMPRANO-6157', capK[1], 'Kevin O.', 'cap-p3', c3i + 35 * MIN),
    ];
    const capR = [
      { estrellas: 5, autor: 'Andrés F.', texto: 'La mesa de la oficina quedó full y la botella de cortesía fue un detalle.', parche: 'Mesa de la oficina', fecha: past(c3i + 290 * MIN) },
      { estrellas: 4, autor: 'Kevin O.', texto: 'Buena música. La barra se demoró un poco con los pedidos.', parche: 'Mesa de la oficina', fecha: past(c3i + 300 * MIN) },
      { estrellas: 5, autor: 'Laura M.', texto: 'El crossover del jueves pasado estuvo brutal. Volvemos seguro.', parche: 'Noche de crossover', fecha: at(tc - 8 * DAY, '23:10') },
    ];

    /* ---------- Asadero Mamona y Brasa: comida, tarjeta de fuego ---------- */
    const asaK = [
      { id: 'asa-k1', nombre: 'Primera visita', beneficio: 'Jugo de maracuyá de cortesía', regla: 'checkin', vigencia: 7, limite: 100, prefijo: 'PRIMERA', estado: 'activo' },
      { id: 'asa-k2', nombre: 'Mesa de 6', beneficio: 'Postre llanero para toda la mesa', regla: 'lleno', vigencia: 7, limite: 15, prefijo: 'MESA', estado: 'activo' },
      { id: 'asa-k3', nombre: 'Cumpleañero', beneficio: 'Postre de cumpleaños con vela', regla: 'cumple', vigencia: 15, limite: 10, prefijo: 'CUMPLE', estado: 'activo' },
    ];
    const a3i = at(t0 - 2 * DAY, '13:00');
    const asaP = [
      P({ id: 'asa-p1', titulo: 'Almuerzo llanero: mamona al palo', organizador: 'Mamona y Brasa', inicio: at(t0, '12:30'), dur: 180, cupos: 12, consumo: 38000, promo: 'Mamona, papa salada y yuca. El jugo de la casa va incluido.',
        asistentes: [A('Natalia S.', past(at(t0 - DAY, '17:40'))), A('Juan P.', past(at(t0 - DAY, '20:15'))), A('Sofía C.', past(at(t0, '08:30')))] }),
      P({ id: 'asa-p2', titulo: 'Noche de arpa y ternera a la llanera', organizador: 'Mamona y Brasa', inicio: at(t0 + DAY, '19:00'), cupos: 20, consumo: 52000, promo: 'Arpa, cuatro y maracas en vivo desde las 8.',
        asistentes: [A('Miguel A.', past(at(t0 - DAY, '13:10'))), A('Karen L.', past(at(t0 - DAY, '16:45'))), A('Felipe O.', past(at(t0, '07:55')))] }),
      P({ id: 'asa-p3', tipo: 'comunidad', titulo: 'Almuerzo del equipo de fútbol', organizador: 'Brayan C.', inicio: a3i, cupos: 6, consumo: 38000,
        asistentes: [A('Brayan C.', at(t0 - 4 * DAY, '19:00'), a3i + 5 * MIN), A('Óscar M.', at(t0 - 4 * DAY, '19:30'), a3i + 12 * MIN), A('Luisa F.', at(t0 - 3 * DAY, '09:00'), a3i + 25 * MIN)] }),
    ];
    asaP[0].chat = [
      { tipo: 'sys', texto: 'Mamona y Brasa abrió el parche', ts: at(t0 - 3 * DAY, '10:00') },
      { autor: asaP[0].asistentes[1], texto: '¿Tienen opción para niños?', ts: past(at(t0 - DAY, '20:20')) },
      { autor: 'biz', texto: 'Claro, hay media porción de mamona con jugo a $19.000.', ts: past(at(t0 - DAY, '20:34')) },
    ];
    const asaC = [
      C('PRIMERA-3310', asaK[0], 'Brayan C.', 'asa-p3', a3i + 5 * MIN, a3i + 95 * MIN),
      C('PRIMERA-5527', asaK[0], 'Óscar M.', 'asa-p3', a3i + 12 * MIN),
      C('PRIMERA-8840', asaK[0], 'Luisa F.', 'asa-p3', a3i + 25 * MIN, a3i + 110 * MIN),
    ];
    const asaR = [
      { estrellas: 5, autor: 'Brayan C.', texto: 'La mamona en su punto. Nos atendieron rápido a todo el equipo.', parche: 'Almuerzo del equipo de fútbol', fecha: a3i + 4 * HOUR },
      { estrellas: 4, autor: 'Luisa F.', texto: 'Muy rico todo. El parqueadero se llena al mediodía.', parche: 'Almuerzo del equipo de fútbol', fecha: a3i + 6 * HOUR },
      { estrellas: 5, autor: 'Óscar M.', texto: 'El jugo de maracuyá de cortesía fue la mejor bienvenida.', parche: 'Almuerzo del equipo de fútbol', fecha: a3i + 26 * HOUR },
    ];

    /* ---------- Café Arrayán: plan chill, tarjeta de día ---------- */
    const cafK = [
      { id: 'caf-k1', nombre: 'Madrugador', beneficio: 'Pan de bono gratis con tu café', regla: 'temprano', vigencia: 3, limite: 60, prefijo: 'MADRU', estado: 'activo' },
      { id: 'caf-k2', nombre: 'Jugador de mesa', beneficio: '2x1 en malteadas', regla: 'relampago', vigencia: 1, limite: 40, prefijo: 'JUEGO', estado: 'activo' },
      { id: 'caf-k3', nombre: 'Cumpleañero', beneficio: 'Porción de torta con vela', regla: 'cumple', vigencia: 15, limite: 10, prefijo: 'TORTA', estado: 'activo' },
    ];
    const f3i = at(t0 - DAY, '18:00');
    const cafP = [
      P({ id: 'caf-p1', titulo: 'Tarde de juegos de mesa', organizador: 'Café Arrayán', inicio: at(t0, '16:00'), dur: 240, cupos: 10, consumo: 18000, promo: 'Catán, Dixit y Uno. Trae tu juego si quieres.',
        asistentes: [A('Paula R.', past(at(t0 - DAY, '21:10'))), A('Tomás R.', past(at(t0, '07:20'))), A('Isabella M.', past(at(t0, '08:05')))] }),
      P({ id: 'caf-p2', titulo: 'Taller de barismo para principiantes', organizador: 'Café Arrayán', inicio: at(t0 + 3 * DAY, '09:00'), dur: 120, cupos: 8, consumo: 25000, promo: 'Aprende a preparar un V60 y un capuchino. Incluye el café.',
        asistentes: [A('Mariana B.', past(at(t0 - DAY, '10:00'))), A('Julián S.', past(at(t0 - DAY, '15:45'))), A('Daniela H.', past(at(t0, '06:50')))] }),
      P({ id: 'caf-p3', tipo: 'comunidad', titulo: 'Club de lectura: García Márquez', organizador: 'Paula R.', inicio: f3i, dur: 150, cupos: 8, consumo: 15000,
        asistentes: [A('Paula R.', at(t0 - 5 * DAY, '12:00'), f3i + 5 * MIN), A('Sebastián T.', at(t0 - 4 * DAY, '19:00'), f3i + 70 * MIN), A('Valeria G.', at(t0 - 3 * DAY, '08:30'), f3i + 15 * MIN)] }),
    ];
    cafP[0].chat = [
      { tipo: 'sys', texto: 'Café Arrayán abrió el parche', ts: at(t0 - 4 * DAY, '09:00') },
      { autor: cafP[0].asistentes[0], texto: '¿Puedo llevar mi Catán con la expansión?', ts: past(at(t0 - DAY, '21:15')) },
      { autor: 'biz', texto: 'De una, Paula. Te guardamos la mesa grande del fondo.', ts: past(at(t0 - DAY, '21:30')) },
    ];
    const cafC = [
      C('MADRU-7781', cafK[0], 'Paula R.', 'caf-p3', f3i + 5 * MIN, f3i + 40 * MIN),
      C('MADRU-2034', cafK[0], 'Valeria G.', 'caf-p3', f3i + 15 * MIN),
    ];
    const cafR = [
      { estrellas: 5, autor: 'Paula R.', texto: 'El mejor lugar para el club: buena luz, silencio y café de verdad.', parche: 'Club de lectura: García Márquez', fecha: past(f3i + 3 * HOUR) },
      { estrellas: 5, autor: 'Valeria G.', texto: 'Llegué temprano y el pan de bono gratis me ganó.', parche: 'Club de lectura: García Márquez', fecha: past(f3i + 4 * HOUR) },
      { estrellas: 4, autor: 'Sebastián T.', texto: 'Muy chévere. Faltan enchufes cerca de las mesas.', parche: 'Club de lectura: García Márquez', fecha: past(f3i + 5 * HOUR) },
    ];

    const perfil = o => ({ ...o, tema: TEMAS[o.categoria] || 'noche' });
    return {
      v: 2, day: dayKey(t0), actual: 'capachos', sonido: true, solicitudes: [],
      locales: {
        capachos: { id: 'capachos', perfil: perfil({ nombre: 'Discoteca Los Capachos', corto: 'LC', categoria: 'Rumba y Bares', tel: '608 670 4521', nit: '900.418.226-1', idMP: 'MP-0421', desde: new Date(2026, 2, 14).getTime(), direccion: 'Km 4', barrio: 'Vía Acacías', lat: 4.1165, lng: -73.6508,
          desc: 'Discoteca a la salida de Villavo por la vía a Acacías. Crossover, reguetón viejo y arpa llanera en vivo.',
          horarios: horarios('19:00', '00:00', { 0: { open: '18:00' }, 4: { open: '20:00', close: '02:00' }, 5: { open: '21:00', close: '04:00' }, 6: { open: '21:00', close: '04:00' } }) }),
          parches: capP, cupones: capK, codigos: capC, resenas: capR },
        asadero: { id: 'asadero', perfil: perfil({ nombre: 'Asadero Mamona y Brasa', corto: 'MB', categoria: 'Comida y Antojos', tel: '608 662 1180', nit: '901.227.904-3', idMP: 'MP-0587', desde: new Date(2026, 4, 2).getTime(), direccion: 'Calle 40 # 24-15', barrio: 'Los Fundadores', lat: 4.1242, lng: -73.6395,
          desc: 'Mamona al palo, ternera a la llanera y jugos naturales, a una cuadra del Parque Los Fundadores.',
          horarios: horarios('11:00', '22:00') }),
          parches: asaP, cupones: asaK, codigos: asaC, resenas: asaR },
        cafe: { id: 'cafe', perfil: perfil({ nombre: 'Café Arrayán', corto: 'CA', categoria: 'Planes Chill', tel: '310 482 7731', nit: '1.121.904.552-7', idMP: 'MP-0712', desde: new Date(2026, 6, 20).getTime(), direccion: 'C.C. Primavera Urbana, local 112', barrio: 'Primavera', lat: 4.1348, lng: -73.6206,
          desc: 'Café de especialidad del Meta, juegos de mesa y talleres. Un plan tranquilo en Primavera Urbana.',
          horarios: horarios('08:00', '21:00', { 0: { open: '09:00', close: '19:00' } }) }),
          parches: cafP, cupones: cafK, codigos: cafC, resenas: cafR },
      },
    };
  }

  /* =====================================================================
     3. ESTADO Y DERIVADOS
  ===================================================================== */
  const KEY = 'mp_business_v2';
  let S = null;
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.v === 2 && saved.day === dayKey(NOW()) && saved.locales) { S = saved; return; }
    S = seed();
    if (saved && saved.v === 2 && saved.locales) {
      // Día nuevo: los datos de muestra se renuevan; lo que el local configuró se conserva
      S.actual = S.locales[saved.actual] ? saved.actual : S.actual;
      S.sonido = saved.sonido !== false;
      S.solicitudes = saved.solicitudes || [];
      for (const id of Object.keys(S.locales)) {
        const old = saved.locales[id]; if (!old) continue;
        if (Array.isArray(old.cupones)) {
          S.locales[id].cupones = old.cupones;
          S.locales[id].codigos = S.locales[id].codigos.filter(c => old.cupones.some(k => k.id === c.cuponId));
        }
        const propios = (old.parches || []).filter(p => p.creado && p.inicio + (p.dur || 180) * MIN > NOW());
        S.locales[id].parches.push(...propios);
      }
    }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin espacio: el panel sigue funcionando en memoria */ } }

  const loc = () => S.locales[S.actual];
  const allLocales = () => Object.values(S.locales);
  const fin = p => p.inicio + (p.dur || 180) * MIN;
  const confirmados = p => p.asistentes.length;
  const checkins = p => p.asistentes.filter(a => a.llego).length;
  const activo = p => !p.cancelado && fin(p) > NOW();
  const enVivo = p => !p.cancelado && p.inicio <= NOW() && fin(p) > NOW();
  const lleno = p => confirmados(p) >= p.cupos;
  const findParche = id => { for (const L of allLocales()) { const p = L.parches.find(x => x.id === id); if (p) return p; } return null; };
  const cupon = id => loc().cupones.find(k => k.id === id);
  const estadoCodigo = c => c.canjeado ? 'canjeado' : NOW() > c.vence ? 'vencido' : 'pendiente';
  const entregados = k => loc().codigos.filter(c => c.cuponId === k.id).length;
  const canjeados = k => loc().codigos.filter(c => c.cuponId === k.id && c.canjeado).length;
  const agotado = k => entregados(k) >= k.limite;
  const pendientes = () => loc().codigos.filter(c => estadoCodigo(c) === 'pendiente').sort((a, b) => b.emitido - a.emitido);
  const relampagoVivo = () => loc().parches.find(p => p.tipo === 'relampago' && enVivo(p));
  // De hoy para la puerta: los parches del día y el que siga en vivo desde anoche
  const deHoy = () => loc().parches.filter(p => !p.cancelado && (enVivo(p) || (diasDesdeHoy(p.inicio) === 0 && fin(p) > NOW() - 3 * HOUR))).sort((a, b) => a.inicio - b.inicio);
  const puedeCheckin = p => !p.cancelado && (enVivo(p) || diasDesdeHoy(p.inicio) === 0);
  const promedio = L => L.resenas.length ? L.resenas.reduce((s, r) => s + r.estrellas, 0) / L.resenas.length : 0;

  function ventana(P, ts = NOW()) {
    for (const off of [0, -1]) {
      const base = day0(ts) + off * DAY, h = P.horarios[new Date(base).getDay()];
      if (!h || !h.abierto) continue;
      const a = at(base, h.open); let c = at(base, h.close); if (c <= a) c += DAY;
      if (ts >= a && ts < c) return { abierto: true, hasta: c };
    }
    const h = P.horarios[new Date(ts).getDay()];
    const a = h && h.abierto ? at(ts, h.open) : null;
    return { abierto: false, abre: a && a > ts ? a : null };
  }

  function verificar() {
    for (const L of allLocales()) {
      const seedOnly = arr => arr.filter(x => !x.creado && !x.auto && !x.walkin);
      console.assert(seedOnly(L.parches).length <= 3 && L.cupones.length <= 3 + L.cupones.filter(k => k.creado).length && seedOnly(L.codigos).length <= 3 && L.resenas.length <= 3, 'Más de 3 datos de muestra en', L.id);
      for (const p of L.parches) console.assert(seedOnly(p.asistentes).length <= 3, 'Más de 3 asistentes de muestra en', p.id);
      for (const c of L.codigos) console.assert(!c.parcheId || L.parches.some(p => p.id === c.parcheId), 'Código sin parche', c.codigo);
      for (const p of L.parches) console.assert(checkins(p) <= confirmados(p), 'Más llegadas que confirmados', p.id);
    }
  }

  /* =====================================================================
     4. EFECTOS: confeti, sonido, contadores
  ===================================================================== */
  function burst(x, y, n = 34, colors = ['#ff751f', '#15110e', '#ffd3b6', '#247b50']) {
    if (REDUCED()) return;
    const layer = $('#fx');
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'fx-p';
      el.style.background = colors[i % colors.length];
      if (i % 3 === 0) { el.style.width = '8px'; el.style.height = '8px'; el.style.borderRadius = '50%'; }
      layer.appendChild(el);
      const ang = Math.random() * Math.PI * 2, v = 90 + Math.random() * 170;
      const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v - 90;
      const r = (Math.random() - 0.5) * 720;
      el.animate([
        { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x + dx}px, ${y + dy}px) rotate(${r}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${x + dx * 1.15}px, ${y + dy + 160}px) rotate(${r * 1.5}deg)`, opacity: 0 },
      ], { duration: 950 + Math.random() * 500, easing: 'cubic-bezier(.2,.75,.35,1)' }).onfinish = () => el.remove();
    }
  }
  const burstFrom = (el, n, colors) => { if (!el) return; const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, n, colors); };

  let audio = null;
  function tone(kind) {
    if (!S.sonido) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const notes = kind === 'ok' ? [[880, 0], [1318.5, 0.09]] : kind === 'in' ? [[660, 0], [990, 0.07]] : [[160, 0], [130, 0.12]];
      for (const [f, d] of notes) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = kind === 'bad' ? 'square' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(kind === 'bad' ? 0.05 : 0.12, t + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
        o.connect(g).connect(audio.destination);
        o.start(t + d); o.stop(t + d + 0.25);
      }
    } catch (e) { /* sin audio */ }
  }

  function countUp(root) {
    for (const el of $$('[data-count]', root)) {
      const to = Number(el.dataset.count), d = Number(el.dataset.dec || 0);
      const fmt = v => d ? v.toFixed(d).replace('.', ',') : int(v);
      if (REDUCED() || !to) { el.textContent = fmt(to); continue; }
      const t0 = performance.now(), dur = 760;
      const step = t => { const k = clamp((t - t0) / dur, 0, 1); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }
  function animateBars(root) {
    if (REDUCED()) return;
    $$('.track i', root).forEach((el, i) => el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 700, delay: 120 + i * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
  }

  /* =====================================================================
     5. NAVEGACIÓN Y MARCO
  ===================================================================== */
  const ROUTES = ['resumen', 'parches', 'cupones', 'asistentes', 'mapa', 'perfil'];
  let route = 'resumen';
  function go() {
    const r = (location.hash || '#resumen').slice(1).split('/')[0];
    route = ROUTES.includes(r) ? r : 'resumen';
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + route; });
    $$('.nav-item[data-route]').forEach(a => { if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    toggleMenu(false);
    closeMenus();
    window.scrollTo(0, 0);
    const view = $('#view-' + route);
    $$('[data-anim]', view).forEach((el, i) => el.style.setProperty('--i', i));
    view.classList.remove('in'); void view.offsetWidth; view.classList.add('in');
    clearTimeout(go.t); go.t = setTimeout(() => view.classList.remove('in'), 1200);
    render(true);
  }
  function render(entering = false) {
    renderShell();
    if (route === 'resumen') renderResumen(entering);
    if (route === 'parches') renderParches();
    if (route === 'cupones') renderCupones();
    if (route === 'asistentes') renderAsistentes();
    if (route === 'mapa') renderMapa();
    if (route === 'perfil') renderPerfil();
  }
  function toggleMenu(open) {
    const sb = $('#sidebar');
    const o = open ?? !sb.classList.contains('open');
    sb.classList.toggle('open', o);
    $('#menu-toggle').setAttribute('aria-expanded', String(o));
  }

  const monoHTML = (L, cls = 'mono-logo') => `<span class="${cls} mono-logo--${L.perfil.tema}" aria-hidden="true">${esc(L.perfil.corto)}</span>`;
  const prevCounts = { c: null, p: null };
  function renderShell() {
    const L = loc(), P = L.perfil;
    $('#local-logo-side').className = `local-logo mono-logo--${P.tema}`;
    $('#local-logo-side').textContent = P.corto;
    $('#local-name-side').textContent = P.nombre;
    $('#local-cat-side').textContent = `${P.categoria} · ${P.barrio}`;
    $('#local-list').innerHTML = allLocales().map(x => `<li><button role="option" aria-selected="${x.id === L.id}" data-action="cambiar-local" data-local="${x.id}">${monoHTML(x, 'local-logo')}<span class="local-txt"><b>${esc(x.perfil.nombre)}</b><small>${esc(x.perfil.categoria)}</small></span>${x.id === L.id ? ic('i-check') : ''}</button></li>`).join('')
      + '<li class="local-list-note">Cada local tiene su propia tarjeta, cupones y parches.</li>';

    const pend = pendientes().length;
    const cc = $('#count-cupones'); cc.hidden = !pend; cc.textContent = pend; cc.setAttribute('aria-label', `${pend} cupones por canjear`);
    if (prevCounts.c !== null && prevCounts.c !== pend) { cc.classList.remove('bump'); void cc.offsetWidth; cc.classList.add('bump'); }
    prevCounts.c = pend;
    const vivos = L.parches.filter(enVivo).length;
    const cp = $('#count-parches'); cp.hidden = !vivos; cp.textContent = vivos; cp.setAttribute('aria-label', `${vivos} parches en vivo`);
    prevCounts.p = vivos;

    const chip = $('#live-chip'), rel = relampagoVivo(), w = ventana(P);
    chip.className = 'live-chip' + (rel ? ' is-rel' : w.abierto ? ' is-open' : '');
    $('#live-text').textContent = rel ? `Relámpago en vivo · quedan ${fmtDur(Math.max(1, Math.ceil((fin(rel) - NOW()) / MIN)))}`
      : w.abierto ? `Abierto · cierra ${fmtHora(w.hasta)}` : w.abre ? `Cerrado · abre ${fmtHora(w.abre)}` : 'Cerrado hoy';
    chip.title = $('#live-text').textContent;

    const sb = $('#sound-btn');
    sb.setAttribute('aria-pressed', String(S.sonido));
    sb.innerHTML = ic(S.sonido ? 'i-sound' : 'i-mute');
  }

  function cambiarLocal(id) {
    if (!S.locales[id] || id === S.actual) { closeMenus(); return; }
    S.actual = id; save();
    closeMenus();
    asisState.id = null; doorState.id = null; listState.q = '';
    mapDirty = true;
    render();
    $$('.lcard').forEach(c => { c.classList.remove('swap-in'); void c.offsetWidth; c.classList.add('swap-in'); });
    toast(`Ahora ves ${loc().perfil.nombre}`, `${loc().perfil.categoria} · ${loc().perfil.barrio}`);
  }
  function closeMenus() {
    $('#local-list').hidden = true;
    $('#local-btn').setAttribute('aria-expanded', 'false');
    $('#row-menu').hidden = true;
  }

  /* =====================================================================
     6. TARJETA DEL LOCAL (cambia según el tipo de local)
  ===================================================================== */
  const MOTIFS = {
    noche: '<svg class="lmotif" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="22"/><circle cx="110" cy="110" r="44"/><circle cx="110" cy="110" r="66"/><circle cx="110" cy="110" r="88"/><circle cx="110" cy="110" r="108"/></svg>',
    fuego: '<svg class="lmotif" viewBox="0 0 220 220" aria-hidden="true"><path d="M10 60c25-22 45 22 70 0s45 22 70 0 45 22 70 0"/><path d="M10 95c25-22 45 22 70 0s45 22 70 0 45 22 70 0"/><path d="M10 130c25-22 45 22 70 0s45 22 70 0 45 22 70 0"/><path d="M10 165c25-22 45 22 70 0s45 22 70 0 45 22 70 0"/></svg>',
    dia: `<svg class="lmotif" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="34"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, c = Math.cos(a), s = Math.sin(a); return `<path d="M${(110 + c * 52).toFixed(1)} ${(110 + s * 52).toFixed(1)}L${(110 + c * 100).toFixed(1)} ${(110 + s * 100).toFixed(1)}"/>`; }).join('')}</svg>`,
  };
  const siteBase = () => /^https?:/.test(location.protocol) ? location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') : 'https://modoparche-davzd.vercel.app/';
  const localURL = L => `${siteBase()}dashboard.html?local=${L.perfil.idMP}`;

  function qrMatrix(text) {
    if (typeof window.qrcode !== 'function') return null;
    try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) }; } catch (e) { return null; }
  }
  function qrSVG(text, color = '#15110e') {
    const m = qrMatrix(text);
    if (!m) return `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-qr"/></svg>`;
    let d = '';
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="0 0 ${m.n} ${m.n}" shape-rendering="crispEdges" role="img" aria-label="Código QR"><path fill="${color}" d="${d}"/></svg>`;
  }

  function cardHTML(L) {
    const P = L.perfil, prom = promedio(L), w = ventana(P), h = P.horarios[new Date(NOW()).getDay()];
    const hoyTxt = h && h.abierto ? `Hoy abre de ${horaTxt(h.open)} a ${horaTxt(h.close)}` : 'Hoy no abre';
    return `<button class="lcard lcard--${P.tema}" data-action="flip-card" aria-pressed="false" aria-label="Tarjeta de ${esc(P.nombre)}. Toca para ver el QR del local.">
      <span class="lface lface--front">
        ${MOTIFS[P.tema]}
        <span class="ltop">${monoHTML(L)}<span class="lbadge">${ic('i-shield')}Aliado verificado</span></span>
        <span class="lname"><b>${esc(P.nombre)}</b><span>${esc(P.categoria)} · ${esc(P.barrio)}</span></span>
        <span class="lfoot"><span><span class="code">${esc(P.idMP)}</span> · desde ${esc(fmtMes(P.desde))} ${new Date(P.desde).getFullYear()}<br>${w.abierto ? `Abierto hasta ${fmtHora(w.hasta)}` : esc(hoyTxt)}</span>
          <span class="lrate">${ic('i-star')}${prom ? dec1(prom) : 'Nuevo'}</span></span>
        <span class="lflip" aria-hidden="true">${ic('i-flip')}</span>
      </span>
      <span class="lface lface--back">
        <span class="lqr">${qrSVG(localURL(L))}</span>
        <span class="lback-txt"><b>Escanea y parcha</b><p>Quien escanea este QR ve los parches de ${esc(P.nombre)} en Modo Parche.</p><small>${esc(hoyTxt)}</small></span>
        <span class="lflip" aria-hidden="true">${ic('i-flip')}</span>
      </span>
    </button>`;
  }
  function mountCard(slot) { slot.innerHTML = cardHTML(loc()); }
  function bindTilt() {
    document.addEventListener('pointermove', e => {
      const card = e.target.closest && e.target.closest('.lcard');
      if (!card || e.pointerType !== 'mouse' || REDUCED()) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.classList.add('is-tilting');
      card.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
    });
    document.addEventListener('pointerout', e => {
      const card = e.target.closest && e.target.closest('.lcard');
      if (!card || card.contains(e.relatedTarget)) return;
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg');
    });
  }

  /* =====================================================================
     7. RESUMEN Y PARCHES
  ===================================================================== */
  const tipoTxt = p => ({ oficial: 'Oficial del local', comunidad: `Organiza ${p.organizador}`, relampago: 'Relámpago' }[p.tipo] || '');
  function estadoPill(p) {
    if (p.cancelado) return '<span class="pill">Cancelado</span>';
    if (fin(p) <= NOW()) return '<span class="pill">Terminado</span>';
    if (enVivo(p)) return '<span class="pill brand live"><span class="dot"></span>En vivo</span>';
    if (lleno(p)) return '<span class="pill warn">Lleno</span>';
    return '<span class="pill pos">Abierto</span>';
  }
  const trackHTML = p => {
    const c = confirmados(p), inn = checkins(p);
    return `<span class="track" role="img" aria-label="${inn} llegaron, ${c - inn} por llegar, ${Math.max(0, p.cupos - c)} cupos libres de ${p.cupos}"><i class="in" style="width:${clamp(inn / p.cupos, 0, 1) * 100}%"></i><i class="pend" style="width:${clamp((c - inn) / p.cupos, 0, 1) * 100}%"></i></span>`;
  };

  function renderResumen(entering) {
    const L = loc(), P = L.perfil, hoy = deHoy();
    const hr = new Date(NOW()).getHours();
    const hola = `${hr < 12 && hr >= 5 ? 'Buenos días' : hr < 19 && hr >= 12 ? 'Buenas tardes' : 'Buenas noches'}, equipo de ${esc(P.nombre)}.`;
    const conf = hoy.reduce((s, p) => s + confirmados(p), 0), inn = hoy.reduce((s, p) => s + checkins(p), 0);
    const pend = pendientes();
    $('#resumen-sub').innerHTML = hola + ' ' + (hoy.length
      ? `Hoy tienes <b>${hoy.length} ${hoy.length === 1 ? 'parche' : 'parches'}</b> con ${int(conf)} confirmados, y ${inn ? `${int(inn)} ya llegaron` : 'nadie ha llegado todavía'}. ${pend.length ? `Hay ${pend.length} ${pend.length === 1 ? 'cupón' : 'cupones'} por canjear.` : ''}`
      : `Hoy no tienes parches. ${ventana(P).abierto ? 'Estás abierto: un relámpago sale de una en el mapa.' : 'Programa uno para esta semana.'}`);

    const prom = promedio(L), totalCanje = L.codigos.filter(c => c.canjeado).length;
    $('#kpis').innerHTML = `
      <div class="kpi kpi--lead"><p class="kpi-label">${ic('i-users')}Confirmados hoy</p><p class="kpi-value"><span data-count="${conf}">${int(conf)}</span></p><p class="delta">${hoy.length ? `En ${hoy.length} ${hoy.length === 1 ? 'parche' : 'parches'} de hoy` : 'Sin parches hoy'}</p></div>
      <div class="kpi"><p class="kpi-label">${ic('i-door')}Llegaron hoy</p><p class="kpi-value"><span data-count="${inn}">${int(inn)}</span><small>de ${int(conf)}</small></p><p class="delta">${conf ? `${Math.round(inn / conf * 100)} % de los confirmados` : 'Nadie confirmado aún'}</p></div>
      <div class="kpi"><p class="kpi-label">${ic('i-ticket')}Por canjear</p><p class="kpi-value"><span data-count="${pend.length}">${int(pend.length)}</span></p><p class="delta">${totalCanje} ${totalCanje === 1 ? 'canjeado' : 'canjeados'} en total</p></div>
      <div class="kpi"><p class="kpi-label">${ic('i-star')}Calificación</p><p class="kpi-value"><span data-count="${prom.toFixed(1)}" data-dec="1">${dec1(prom)}</span><small>/ 5</small></p><p class="delta">${L.resenas.length} ${L.resenas.length === 1 ? 'reseña' : 'reseñas'}</p></div>`;
    if (entering) countUp($('#kpis'));

    renderSemana();
    renderFeed();
    mountCard($('#lcard-resumen'));
    renderPulse();
    renderNoche();
    renderRailCupones();
    if (entering) animateBars($('#view-resumen'));
  }

  function renderSemana() {
    const t0 = day0(NOW()), L = loc();
    const prox = L.parches.filter(p => !p.cancelado && day0(p.inicio) >= t0 && day0(p.inicio) < t0 + 7 * DAY);
    $('#semana-meta').textContent = `${prox.length} ${prox.length === 1 ? 'parche' : 'parches'} en los próximos 7 días. Toca un día libre para programar uno.`;
    $('#week').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const ts = t0 + i * DAY;
      const items = prox.filter(p => day0(p.inicio) === ts).sort((a, b) => a.inicio - b.inicio);
      return `<li class="day ${i === 0 ? 'is-today' : ''}" style="--i:${i}">
        <div class="day-head"><span>${i === 0 ? 'Hoy' : cap(fmtSem(ts))}</span><b>${new Date(ts).getDate()}</b></div>
        <div class="day-items">${items.map(p => `<button class="chip-p chip-p--${p.tipo}" data-action="ver-asistentes" data-id="${p.id}"><span class="chip-h">${fmtHora(p.inicio)}</span><b>${esc(p.titulo)}</b><span>${confirmados(p)} de ${p.cupos}</span></button>`).join('')}</div>
        <button class="day-add" data-action="nuevo-parche" data-fecha="${dayKey(ts)}" aria-label="Programar un parche el ${esc(fmtDia(ts).toLowerCase())}">${ic('i-plus')}${items.length ? 'Otro' : 'Libre'}</button>
      </li>`;
    }).join('');
  }

  function eventos(L = loc()) {
    const ev = [];
    for (const p of L.parches) for (const a of p.asistentes) {
      if (!a.walkin) ev.push({ ts: a.confirmo, ic: 'i-users', cls: '', html: `<b>${esc(a.nombre)}</b> confirmó en ${esc(p.titulo)}` });
      if (a.llego) ev.push({ ts: a.llego, ic: 'i-door', cls: 'in', html: `<b>${esc(a.nombre)}</b> llegó a ${esc(p.titulo)}` });
    }
    for (const c of L.codigos) {
      ev.push({ ts: c.emitido, ic: 'i-gift', cls: 'code', html: `<b>${esc(c.persona)}</b> ganó el cupón ${esc(c.cupNombre)}` });
      if (c.canjeado) ev.push({ ts: c.canjeado, ic: 'i-ticket', cls: 'code', html: `Canjeaste <span class="code">${esc(c.codigo)}</span>: ${esc(c.cupBen)}` });
    }
    for (const r of L.resenas) ev.push({ ts: r.fecha, ic: 'i-star', cls: 'star', html: `<b>${esc(r.autor)}</b> te calificó con ${r.estrellas} de 5` });
    for (const p of L.parches) if (p.creado) ev.push({ ts: p.creadoTs || p.inicio, ic: p.tipo === 'relampago' ? 'i-bolt' : 'i-calendar', cls: 'code', html: `Publicaste <b>${esc(p.titulo)}</b>` });
    return ev.filter(e => e.ts <= NOW()).sort((a, b) => b.ts - a.ts);
  }
  function renderFeed() {
    const ev = eventos().slice(0, 7);
    $('#feed').innerHTML = ev.length ? ev.map(e => `<li><span class="feed-ic ${e.cls ? 'feed-ic--' + e.cls : ''}" aria-hidden="true">${ic(e.ic)}</span><p>${e.html}</p><time datetime="${new Date(e.ts).toISOString()}">${esc(fmtRel(e.ts))}</time></li>`).join('')
      : '<li><p class="empty">Todavía no hay actividad. Publica tu primer parche.</p></li>';
  }

  const RING_C = 2 * Math.PI * 32;
  function renderPulse() {
    const L = loc(), P = L.perfil, rel = relampagoVivo(), w = ventana(P), vivo = L.parches.find(p => enVivo(p) && p.tipo !== 'relampago');
    const box = $('#pulse-slot');
    if (rel) {
      const k = rel.cuponId && cupon(rel.cuponId);
      box.innerHTML = `<div class="pulse pulse--rel">
        <div class="cd-ring" id="cd-ring" role="timer" aria-label="Tiempo restante del relámpago"><svg viewBox="0 0 76 76" aria-hidden="true"><circle class="trk" cx="38" cy="38" r="32"/><circle class="val" cx="38" cy="38" r="32" stroke-dasharray="${RING_C.toFixed(1)}"/></svg><span></span></div>
        <div><p class="pulse-tag">${ic('i-bolt')}Relámpago en vivo</p><b>${esc(rel.promo)}</b><p>${confirmados(rel)} de ${rel.cupos} confirmados${k ? ` · gana ${esc(k.nombre)}` : ''}. Termina a las ${fmtHora(fin(rel))}</p>
        <button class="btn btn--sm" data-action="terminar-rel" data-id="${rel.id}">Terminar ahora</button></div></div>`;
      tickCountdown();
    } else if (w.abierto && vivo) {
      box.innerHTML = `<div class="pulse"><span class="pulse-ic" aria-hidden="true">${ic('i-flame')}</span><div><b>En vivo: ${esc(vivo.titulo)}</b><p>${checkins(vivo)} adentro de ${confirmados(vivo)} confirmados. Abierto hasta ${fmtHora(w.hasta)}</p><button class="btn btn--sm" data-action="modo-puerta" data-id="${vivo.id}">${ic('i-door')}Recibir en la puerta</button></div></div>`;
    } else if (w.abierto) {
      const sig = L.parches.filter(p => !p.cancelado && p.inicio > NOW() && diasDesdeHoy(p.inicio) <= 1).sort((a, b) => a.inicio - b.inicio)[0];
      box.innerHTML = `<div class="pulse"><span class="pulse-ic" aria-hidden="true">${ic('i-bolt')}</span><div><b>Hora valle</b><p>Estás abierto hasta las ${fmtHora(w.hasta)} y no hay nada en vivo.${sig ? ` ${esc(sig.titulo)} arranca ${esc(fmtCuando(sig.inicio).toLowerCase())}` : ''} Un relámpago de una hora llena la espera.</p><button class="btn primary btn--sm" data-action="relampago">${ic('i-bolt')}Lanzar relámpago</button></div></div>`;
    } else {
      box.innerHTML = `<div class="pulse"><span class="pulse-ic" aria-hidden="true">${ic('i-moon')}</span><div><b>Cerrado ahora</b><p>${w.abre ? `Hoy abres a las ${fmtHora(w.abre)}` : 'Hoy no abres.'} Los parceros ya pueden confirmar en tus próximos parches.</p></div></div>`;
    }
  }
  function tickCountdown() {
    const el = $('#cd-ring'), rel = relampagoVivo();
    if (!el) return;
    if (!rel) { renderShell(); if (route === 'resumen') renderPulse(); return; }
    const total = fin(rel) - rel.inicio, left = Math.max(0, fin(rel) - NOW());
    const s = Math.ceil(left / 1000), m = Math.floor(s / 60);
    $('span', el).textContent = m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}` : `${m}:${pad(s % 60)}`;
    $('.val', el).style.strokeDashoffset = (RING_C * (1 - left / total)).toFixed(1);
  }

  function renderNoche() {
    const hoy = deHoy();
    $('#noche').innerHTML = hoy.length ? `<div class="door-list">${hoy.map(p => {
      const c = confirmados(p), inn = checkins(p), libres = Math.max(0, p.cupos - c);
      return `<button class="door-item" data-action="modo-puerta" data-id="${p.id}">
        <span class="door-top"><b>${esc(p.titulo)}</b><span>${enVivo(p) ? 'En vivo' : fmtHora(p.inicio)}</span></span>
        ${trackHTML(p)}
        <span class="door-nums"><span><b>${inn}</b> llegaron · ${c - inn} por llegar</span><span>${libres ? `${libres} cupos libres` : 'Lleno'}</span></span>
      </button>`;
    }).join('')}</div>` : '<p class="empty">Hoy no hay parches en tu local.</p>';
  }

  function renderRailCupones() {
    const L = loc(), act = L.cupones.filter(k => k.estado === 'activo').length;
    $('#rcupones-meta').textContent = `${act} de ${L.cupones.length} activos`;
    $('#rcupones').innerHTML = L.cupones.map(k => {
      const e = entregados(k), cj = canjeados(k);
      return `<li class="row"><span class="row-main"><b>${esc(k.nombre)}</b><small>${k.estado === 'pausado' ? 'Pausado' : agotado(k) ? 'Agotado' : esc(k.beneficio)}</small></span>
        <span class="rstock"><span class="num">${e} de ${k.limite}</span><span class="track" aria-hidden="true"><i class="in" style="width:${clamp(cj / k.limite, 0, 1) * 100}%"></i><i class="pend" style="width:${clamp((e - cj) / k.limite, 0, 1) * 100}%"></i></span></span></li>`;
    }).join('') || '<li><p class="empty">Aún no tienes cupones.</p></li>';
  }

  /* ---------- Parches ---------- */
  const listState = { tab: 'proximos', q: '' };
  function renderParches() {
    const L = loc();
    const sets = {
      proximos: L.parches.filter(activo).sort((a, b) => a.inicio - b.inicio),
      relampago: L.parches.filter(p => p.tipo === 'relampago').sort((a, b) => b.inicio - a.inicio),
      pasados: L.parches.filter(p => !activo(p)).sort((a, b) => b.inicio - a.inicio),
    };
    $$('#parches-tabs [data-tab]').forEach(b => {
      b.setAttribute('aria-selected', String(b.dataset.tab === listState.tab));
      const base = { proximos: 'Próximos', relampago: 'Relámpago', pasados: 'Pasados' }[b.dataset.tab];
      b.innerHTML = `${base}<span class="tab-count">${sets[b.dataset.tab].length}</span>`;
    });
    const q = norm(listState.q);
    const ofi = sets.proximos.filter(p => p.tipo !== 'comunidad').length;
    $('#parches-sub').innerHTML = listState.q
      ? `Resultados para <b>${esc(listState.q)}</b>. <button class="btn ghost btn--sm" data-action="limpiar-busqueda">${ic('i-close')}Quitar filtro</button>`
      : `${sets.proximos.length} próximos: ${ofi} ${ofi === 1 ? 'es tuyo' : 'son tuyos'} y ${sets.proximos.length - ofi} ${sets.proximos.length - ofi === 1 ? 'lo organiza' : 'los organiza'} la comunidad en tu local.`;
    const rows = sets[listState.tab].filter(p => !q || norm(`${p.titulo} ${p.organizador}`).includes(q));
    $('#pcards').innerHTML = rows.map((p, i) => {
      const c = confirmados(p), inn = checkins(p);
      const cls = p.cancelado ? 'pcard--cancel pcard--past' : enVivo(p) ? 'pcard--live' : fin(p) <= NOW() ? 'pcard--past' : p.tipo === 'relampago' ? 'pcard--relampago' : '';
      return `<li style="--i:${i}"><article class="pcard ${cls}">
        <div class="pdate" aria-hidden="true"><small>${esc(cap(fmtSem(p.inicio)))}</small><b>${new Date(p.inicio).getDate()}</b><small>${esc(fmtMes(p.inicio))}</small></div>
        <div class="pbody">
          <div class="ptop"><div><b>${esc(p.titulo)}</b><small>${esc(tipoTxt(p))} · ${esc(fmtCuando(p.inicio))}${p.tipo === 'relampago' ? ` a ${fmtHora(fin(p))}` : ''}</small></div>${estadoPill(p)}</div>
          ${p.promo ? `<p class="ppromo">${esc(p.promo)}</p>` : ''}
          <div class="pstats">${trackHTML(p)}<span class="door-nums"><span><b>${c}</b> de ${p.cupos} confirmados</span><span>${p.inicio > NOW() ? (p.consumo ? `${money(p.consumo)} por persona` : 'Sin consumo mínimo') : `${inn} llegaron`}</span></span></div>
          <div class="pactions">
            <button class="btn btn--sm" data-action="ver-asistentes" data-id="${p.id}">${ic('i-users')}Asistentes</button>
            ${!p.cancelado && activo(p) ? `<button class="btn btn--sm" data-action="afiche" data-id="${p.id}">${ic('i-image')}Afiche</button>` : ''}
            <button class="icon-btn" data-action="row-menu" data-id="${p.id}" aria-label="Más acciones de ${esc(p.titulo)}" aria-haspopup="menu">${ic('i-more')}</button>
          </div>
        </div>
      </article></li>`;
    }).join('') || `<li><div class="empty">${listState.q ? `Ningún parche coincide con "${esc(listState.q)}".` : listState.tab === 'relampago' ? 'Todavía no has lanzado relámpagos. Sirven para llenar las horas valle.' : listState.tab === 'pasados' ? 'Aún no hay parches pasados.' : 'No hay parches programados.'}
      ${listState.tab === 'pasados' ? '' : `<button class="btn primary btn--sm" data-action="${listState.tab === 'relampago' ? 'relampago' : 'nuevo-parche'}">${ic(listState.tab === 'relampago' ? 'i-bolt' : 'i-plus')}${listState.tab === 'relampago' ? 'Lanzar relámpago' : 'Nuevo parche'}</button>`}</div></li>`;
  }

  function openRowMenu(btn, html) {
    const menu = $('#row-menu');
    menu.innerHTML = html;
    const r = btn.getBoundingClientRect();
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    menu.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
    const first = menu.querySelector('button'); if (first) first.focus();
  }
  function parcheMenu(btn, id) {
    const p = findParche(id);
    const editable = p.tipo !== 'comunidad' && activo(p);
    openRowMenu(btn, `<button data-action="ver-asistentes" data-id="${id}" role="menuitem">${ic('i-users')} Asistentes y chat</button>
      ${activo(p) ? `<button data-action="modo-puerta" data-id="${id}" role="menuitem">${ic('i-door')} Abrir modo puerta</button>` : ''}
      ${editable ? `<button data-action="editar" data-id="${id}" role="menuitem">${ic('i-edit')} Editar parche</button>` : ''}
      ${activo(p) ? `<button class="danger" data-action="cancelar" data-id="${id}" role="menuitem">${ic('i-trash')} Cancelar parche</button>` : ''}`);
  }

  /* ---------- Afiche para redes ---------- */
  let aficheId = null;
  const POSTER = {
    noche: { bg: '#15110e', fg: '#ffffff', ac: '#ff751f', sub: '#b9b0a8', ring: 'rgba(255,117,31,.38)' },
    fuego: { bg: '#ff751f', fg: '#1a0d04', ac: '#ffffff', sub: '#4a2208', ring: 'rgba(26,13,4,.22)' },
    dia: { bg: '#fff6f0', fg: '#15110e', ac: '#ff751f', sub: '#5d5753', ring: 'rgba(255,117,31,.3)' },
  };
  function wrap(ctx, text, max) {
    const words = String(text).split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  async function drawAfiche(p) {
    const L = loc(), P = L.perfil, T = POSTER[P.tema], cv = $('#afiche-canvas'), ctx = cv.getContext('2d');
    try { await document.fonts.load('80px Gagalin'); } catch (e) { /* usa la fuente de respaldo */ }
    const W = cv.width, H = cv.height, BR = "'Gagalin', 'Arial Black', Impact, sans-serif", TX = "'Inter', system-ui, sans-serif";
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = T.ring; ctx.lineWidth = 4;
    for (let r = 90; r <= 560; r += 78) { ctx.beginPath(); ctx.arc(W - 90, 150, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = T.ac; ctx.font = `48px ${BR}`; ctx.fillText('MODO PARCHE', 80, 130);
    ctx.fillStyle = T.sub; ctx.font = `500 30px ${TX}`; ctx.fillText('Villavicencio', 80, 175);
    ctx.fillStyle = T.ac; ctx.font = `64px ${BR}`; ctx.fillText(cap(fmtSem(p.inicio)).toUpperCase(), 80, 380);
    ctx.fillStyle = T.fg; ctx.font = `260px ${BR}`; ctx.fillText(String(new Date(p.inicio).getDate()), 64, 610);
    ctx.font = `64px ${BR}`; ctx.fillText(`${fmtMes(p.inicio).toUpperCase()} · ${fmtHora(p.inicio).toUpperCase()}`, 80, 700);
    ctx.font = `104px ${BR}`;
    const tl = wrap(ctx, p.titulo.toUpperCase(), W - 160).slice(0, 3);
    tl.forEach((l, i) => ctx.fillText(l, 80, 840 + i * 104));
    let y = 840 + tl.length * 104 + 10;
    const bajada = p.tipo === 'relampago' ? `Solo por ${fmtDur(p.dur)}, hasta las ${fmtHora(fin(p))}` : p.promo;
    if (bajada) { ctx.fillStyle = T.sub; ctx.font = `500 34px ${TX}`; wrap(ctx, bajada, W - 160).slice(0, 2).forEach((l, i) => ctx.fillText(l, 80, y + i * 46)); }
    // pie: local y QR
    ctx.fillStyle = T.fg; ctx.fillRect(80, 1110, W - 160, 3);
    ctx.font = `52px ${BR}`; ctx.fillText(P.nombre.toUpperCase().slice(0, 26), 80, 1195);
    ctx.fillStyle = T.sub; ctx.font = `500 30px ${TX}`; ctx.fillText(`${P.direccion} · ${P.barrio}`, 80, 1242);
    ctx.fillStyle = T.ac; ctx.font = `600 30px ${TX}`; ctx.fillText(`${p.cupos} cupos · confirma en Modo Parche`, 80, 1290);
    const m = qrMatrix(localURL(L)), box = 190, bx = W - 80 - box, by = 1135;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, box, box);
    if (m) { const cell = (box - 24) / m.n; ctx.fillStyle = '#15110e'; for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) ctx.fillRect(bx + 12 + c * cell, by + 12 + r * cell, Math.ceil(cell), Math.ceil(cell)); }
  }
  async function openAfiche(id) {
    const p = findParche(id); if (!p) return;
    aficheId = id;
    closeMenus();
    $('#dlg-afiche').showModal();
    await drawAfiche(p);
  }
  function descargarAfiche() {
    const p = findParche(aficheId); if (!p) return;
    $('#afiche-canvas').toBlob(b => {
      if (!b) { toast('No se pudo crear la imagen', 'Intenta de nuevo.', { error: true }); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `afiche-${norm(p.titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Afiche descargado', 'Súbelo a tus historias con el QR del local.');
    }, 'image/png');
  }

  /* =====================================================================
     8. CUPONES, VALIDADOR Y ESCÁNER
  ===================================================================== */
  function estadoCuponPill(k) {
    if (k.estado === 'pausado') return `<span class="pill">${ic('i-pause')}Pausado</span>`;
    if (agotado(k)) return '<span class="pill warn">Agotado</span>';
    return '<span class="pill pos"><span class="dot"></span>Activo</span>';
  }
  function tkHTML(k, preview = false) {
    const e = preview ? 0 : entregados(k), cj = preview ? 0 : canjeados(k);
    return `<article class="tk ${k.estado === 'pausado' ? 'tk--off' : ''}" data-tk="${esc(k.id || '')}">
      <div class="tk-main">
        <div class="tk-top"><span class="tk-name">${esc(k.nombre || 'Nombre del cupón')}</span>${preview ? '<span class="pill brand">Vista previa</span>' : estadoCuponPill(k)}</div>
        <p class="tk-ben">${esc(k.beneficio || 'Qué regalas')}</p>
        <p class="tk-rule">${ic('i-bolt')}<span>${esc(REGLAS[k.regla] || '')}</span></p>
        <div class="tk-stock">
          <span class="track" role="img" aria-label="${e} de ${k.limite} entregados, ${cj} canjeados"><i class="in" style="width:${clamp(cj / (k.limite || 1), 0, 1) * 100}%"></i><i class="pend" style="width:${clamp((e - cj) / (k.limite || 1), 0, 1) * 100}%"></i></span>
          <span class="door-nums"><span><b>${e}</b> de ${int(k.limite || 0)} entregados</span><span>${cj} ${cj === 1 ? 'canjeado' : 'canjeados'}</span></span>
        </div>
        <p class="hint">Vale ${k.vigencia} ${Number(k.vigencia) === 1 ? 'día' : 'días'} desde que lo gana</p>
      </div>
      <div class="tk-stub">
        <span class="tk-pre">${esc((k.prefijo || 'CODIGO').toUpperCase())}-0000</span>
        ${preview ? '' : `<div class="tk-tools">
          <input type="checkbox" class="switch" data-cupon="${k.id}" ${k.estado === 'activo' ? 'checked' : ''} aria-label="${k.estado === 'activo' ? 'Pausar' : 'Activar'} ${esc(k.nombre)}">
          <button class="icon-btn" data-action="cupon-menu" data-id="${k.id}" aria-label="Más acciones de ${esc(k.nombre)}" aria-haspopup="menu">${ic('i-more')}</button>
        </div>`}
      </div>
    </article>`;
  }
  const STAGE_HINT = `<div class="stage-hint">${ic('i-ticket')}<p>Pide al parcero su código o escanea su QR. Aquí verás el cupón y si se puede canjear.</p></div>`;

  let lastCanje = null, undoTimer = null;
  function renderCupones(opts = {}) {
    const L = loc(), pend = pendientes();
    $('#pendientes-meta').textContent = pend.length ? `${pend.length} ${pend.length === 1 ? 'código vigente' : 'códigos vigentes'}` : 'Nada pendiente';
    $('#pendientes').innerHTML = pend.length ? pend.map(c => `<li><button class="row row--btn" data-action="usar-codigo" data-code="${esc(c.codigo)}">
        <span class="row-main"><b class="code">${esc(c.codigo)}</b><small>${esc(c.cupNombre)} · ${esc(c.persona)}</small></span>
        <span class="row-end">Vence<small>${esc(fmtDia(c.vence))}</small></span>${ic('i-chev-right').replace('class="ic"', 'class="ic go"')}</button></li>`).join('')
      : '<li><p class="empty">No hay códigos por canjear.</p></li>';

    const act = L.cupones.filter(k => k.estado === 'activo').length;
    $('#mis-cupones-meta').textContent = `${L.cupones.length} ${L.cupones.length === 1 ? 'cupón' : 'cupones'}, ${act} ${act === 1 ? 'activo' : 'activos'}. Pausa uno y deja de entregarse al instante.`;
    $('#tickets').innerHTML = L.cupones.map((k, i) => `<li style="--i:${i}">${tkHTML(k)}</li>`).join('')
      + `<li style="--i:${L.cupones.length}"><button class="tk-add" data-action="nuevo-cupon">${ic('i-plus')}<span><b>Crear cupón</b></span></button></li>`;
    if (opts.nuevo) { const el = $(`[data-tk="${opts.nuevo}"]`); if (el) { el.classList.add('is-new'); setTimeout(() => burstFrom(el, 28), 200); } }

    const hist = L.codigos.filter(c => c.canjeado).sort((a, b) => b.canjeado - a.canjeado);
    $('#historial-meta').textContent = `${hist.length} ${hist.length === 1 ? 'canje' : 'canjes'}`;
    $('#tabla-canjes').innerHTML = `<thead><tr><th>Código</th><th>Cupón</th><th>Cliente</th><th class="n">Canjeado</th></tr></thead><tbody>${
      hist.map(c => `<tr class="${lastCanje === c.codigo ? 'is-new' : ''}"><td class="code">${esc(c.codigo)}</td><td>${esc(c.cupNombre)}<span class="hint" style="display:block">${esc(c.cupBen)}</span></td><td>${esc(c.persona)}</td><td class="n">${esc(fmtCuando(c.canjeado))}</td></tr>`).join('')
      || '<tr><td colspan="4"><p class="empty">Todavía no hay canjes.</p></td></tr>'
    }</tbody>`;
    if (!$('#validator-result').children.length) $('#validator-result').innerHTML = STAGE_HINT;
  }

  function vtHTML(kind, o) {
    return `<article class="vt vt--${kind}">
      <div class="vt-main">
        <p class="vt-status">${ic(kind === 'ok' ? 'i-check' : 'i-alert')}${esc(o.kicker)}</p>
        <h3>${esc(o.title)}</h3>
        <p>${o.html}</p>
        ${o.foot ? `<div class="vt-foot">${o.foot}</div>` : ''}
      </div>
      <div class="vt-stub">${kind === 'ok' ? `<span class="stamp-mark"><b>Canjeado</b><small>${esc(o.stub)}</small></span>` : `${ic(o.stubIc)}<span>${esc(o.stub)}</span>`}</div>
      ${kind === 'ok' ? '<span class="undo-line" aria-hidden="true"></span>' : ''}
    </article>`;
  }
  function validar(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    const out = $('#validator-result');
    clearTimeout(undoTimer);
    if (!code) { out.innerHTML = STAGE_HINT; $('#code-input').focus(); return; }
    const L = loc();
    const c = L.codigos.find(x => x.codigo === code);
    const bad = (title, html, kicker = 'No se puede canjear') => {
      out.innerHTML = vtHTML('bad', { kicker, title, html, stubIc: 'i-close', stub: 'Rechazado' });
      tone('bad');
      const vt = $('.vt', out); vt.classList.remove('shake'); void vt.offsetWidth; vt.classList.add('shake');
      $('#code-input').select();
    };
    if (!c) {
      const otro = allLocales().find(x => x.id !== L.id && x.codigos.some(y => y.codigo === code));
      if (otro) return bad('Este código es de otro local', `<span class="code">${esc(code)}</span> es un cupón de ${esc(otro.perfil.nombre)}. Cada local solo canjea sus propios cupones.`);
      return bad(`${code} no existe`, 'Revisa que el parcero te muestre el código completo, con el guion. Si tiene QR, escanéalo.');
    }
    const st = estadoCodigo(c), k = cupon(c.cuponId);
    if (st === 'canjeado') return bad('Este código ya se usó', `Lo canjeó ${esc(c.persona)} ${esc(fmtCuando(c.canjeado).toLowerCase())} Beneficio: ${esc(c.cupBen)}.`);
    if (st === 'vencido') return bad('Este código venció', `Valía hasta ${esc(fmtCuando(c.vence).toLowerCase())} ${esc(c.persona)} puede ganar otro en tu próximo parche.`);
    if (k && k.estado === 'pausado') return bad('El cupón está pausado', `Actívalo en <b>Tus cupones</b> si quieres aceptar ${esc(c.cupNombre)} hoy.`, 'Pausado por ti');

    c.canjeado = NOW();
    lastCanje = c.codigo;
    save();
    out.innerHTML = vtHTML('ok', {
      kicker: `Cupón válido · ${c.cupNombre}`, title: c.cupBen,
      html: `Para <b>${esc(c.persona)}</b> · <span class="code">${esc(c.codigo)}</span>`,
      foot: `<button class="btn btn--sm" data-action="deshacer-canje" data-code="${esc(c.codigo)}">${ic('i-undo')}Deshacer</button><span class="hint">Puedes deshacerlo durante 8 segundos.</span>`,
      stubIc: 'i-check', stub: fmtHora(c.canjeado),
    });
    $('#code-input').value = '';
    tone('ok');
    const vt = $('.vt', out), stamp = $('.stamp-mark', out), line = $('.undo-line', out);
    if (!REDUCED()) {
      vt.animate([{ transform: 'translateY(14px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      stamp.animate([{ transform: 'rotate(-34deg) scale(2.4)', opacity: 0 }, { transform: 'rotate(-12deg) scale(.92)', opacity: 1, offset: 0.7 }, { transform: 'rotate(-12deg) scale(1)', opacity: 1 }], { duration: 520, delay: 240, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
      setTimeout(() => burstFrom(stamp, 40), 560);
    }
    line.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 8000, easing: 'linear', fill: 'forwards' });
    undoTimer = setTimeout(() => { const f = $('.vt-foot', out); if (f) f.innerHTML = '<span class="hint">Listo. Entrégale el beneficio.</span>'; lastCanje = null; }, 8000);
    renderShell();
    renderCupones();
  }
  function deshacerCanje(code) {
    const c = loc().codigos.find(x => x.codigo === code);
    if (!c || !c.canjeado) return;
    c.canjeado = null; lastCanje = null; clearTimeout(undoTimer);
    save();
    $('#validator-result').innerHTML = STAGE_HINT;
    toast('Canje deshecho', `${c.codigo} vuelve a estar por canjear.`);
    renderShell(); renderCupones();
  }

  function nuevoCodigo(prefijo) {
    const usados = new Set(allLocales().flatMap(L => L.codigos.map(c => c.codigo)));
    let codigo;
    do { codigo = `${prefijo}-${1000 + Math.floor(Math.random() * 9000)}`; } while (usados.has(codigo));
    return codigo;
  }
  // Entrega un cupón a un parcero si el local lo tiene activo y le quedan
  function entregar(k, persona, p) {
    if (!k) return null;
    if (k.estado !== 'activo') return { skip: `${k.nombre} está pausado` };
    if (agotado(k)) return { skip: `${k.nombre} está agotado` };
    if (loc().codigos.some(c => c.cuponId === k.id && c.persona === persona && c.parcheId === p.id)) return null;
    const c = { codigo: nuevoCodigo(k.prefijo), cuponId: k.id, cupNombre: k.nombre, cupBen: k.beneficio, persona, parcheId: p.id, emitido: NOW(), vence: NOW() + k.vigencia * DAY, canjeado: null, auto: true };
    loc().codigos.push(c);
    return { c };
  }

  /* ---------- Escáner de QR con la cámara ---------- */
  let scanStream = null, scanLoop = null;
  async function openScan() {
    const dlg = $('#dlg-scan'), hint = $('#scan-hint');
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      toast('Este navegador no lee QR', 'Escribe el código a mano. En Chrome para Android sí funciona el escáner.', { error: true });
      $('#code-input').focus();
      return;
    }
    hint.textContent = 'Apunta la cámara al QR del cupón.';
    dlg.showModal();
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#scan-video'); v.srcObject = scanStream; await v.play();
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!dlg.open) return;
        try {
          const r = await det.detect(v);
          const val = r[0] && r[0].rawValue;
          if (val) { closeScan(); $('#code-input').value = val.trim().toUpperCase(); validar(val); return; }
        } catch (e) { /* sigue intentando */ }
        scanLoop = setTimeout(tick, 220);
      };
      tick();
    } catch (e) {
      hint.textContent = e.name === 'NotAllowedError' ? 'Sin permiso de cámara. Actívalo en el candado del navegador o escribe el código.' : 'No pudimos abrir la cámara. Escribe el código a mano.';
    }
  }
  function closeScan() {
    clearTimeout(scanLoop);
    if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
    if ($('#dlg-scan').open) $('#dlg-scan').close();
  }

  function cuponMenu(btn, id) {
    openRowMenu(btn, `<button data-action="editar-cupon" data-id="${id}" role="menuitem">${ic('i-edit')} Editar cupón</button>
      <button data-action="duplicar-cupon" data-id="${id}" role="menuitem">${ic('i-copy')} Duplicar</button>
      <button class="danger" data-action="eliminar-cupon" data-id="${id}" role="menuitem">${ic('i-trash')} Eliminar</button>`);
  }
  function toggleCupon(id, on) {
    const k = cupon(id); if (!k) return;
    k.estado = on ? 'activo' : 'pausado';
    save();
    const tk = $(`[data-tk="${id}"]`);
    if (tk) { tk.classList.toggle('tk--off', !on); $('.tk-top .pill', tk).outerHTML = estadoCuponPill(k); }
    $('#mis-cupones-meta').textContent = `${loc().cupones.length} cupones, ${loc().cupones.filter(x => x.estado === 'activo').length} activos. Pausa uno y deja de entregarse al instante.`;
    toast(on ? 'Cupón activo' : 'Cupón pausado', on ? `${k.nombre} se vuelve a entregar.` : `${k.nombre} no se entrega ni se canjea hasta que lo actives.`);
  }
  async function eliminarCupon(id) {
    const k = cupon(id); if (!k) return;
    const pend = loc().codigos.filter(c => c.cuponId === id && estadoCodigo(c) === 'pendiente').length;
    const ok = await confirmar('Eliminar cupón', `"${k.nombre}" deja de entregarse.${pend ? ` Sus ${pend} ${pend === 1 ? 'código pendiente deja' : 'códigos pendientes dejan'} de servir.` : ''} El historial de canjes se conserva.`, 'Sí, eliminar');
    if (!ok) return;
    const L = loc();
    L.cupones = L.cupones.filter(x => x.id !== id);
    L.codigos = L.codigos.filter(c => c.cuponId !== id || c.canjeado);
    save();
    toast('Cupón eliminado', k.nombre);
    render();
  }

  /* =====================================================================
     9. ASISTENTES, CHAT Y MODO PUERTA
  ===================================================================== */
  const asisState = { id: null, tab: 'lista' };
  function gruposParches() {
    const local = loc().parches.filter(p => !p.cancelado);
    const hoy = local.filter(p => enVivo(p) || diasDesdeHoy(p.inicio) === 0).sort((a, b) => a.inicio - b.inicio);
    const prox = local.filter(p => !hoy.includes(p) && p.inicio > NOW()).sort((a, b) => a.inicio - b.inicio);
    const pas = local.filter(p => !hoy.includes(p) && !prox.includes(p)).sort((a, b) => b.inicio - a.inicio);
    return { hoy, prox, pas };
  }
  const optionsHTML = (g, sel) => {
    const opt = p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.titulo)} · ${esc(fmtDia(p.inicio))}</option>`;
    return (g.hoy.length ? `<optgroup label="Hoy">${g.hoy.map(opt).join('')}</optgroup>` : '')
      + (g.prox.length ? `<optgroup label="Próximos">${g.prox.map(opt).join('')}</optgroup>` : '')
      + (g.pas && g.pas.length ? `<optgroup label="Pasados">${g.pas.map(opt).join('')}</optgroup>` : '');
  };
  const ringSVG = (v, total, r = 36, cls = 'ring') => {
    const C = 2 * Math.PI * r, k = total ? clamp(v / total, 0, 1) : 0, s = (r + 6) * 2;
    return `<svg viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle class="trk" cx="${s / 2}" cy="${s / 2}" r="${r}"/><circle class="val" cx="${s / 2}" cy="${s / 2}" r="${r}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - k)).toFixed(1)}"/></svg>`;
  };

  function renderAsistentes(justIn = null) {
    const g = gruposParches(), all = [...g.hoy, ...g.prox, ...g.pas];
    if (!asisState.id || !all.some(p => p.id === asisState.id)) asisState.id = all[0]?.id || null;
    $('#parche-select').innerHTML = optionsHTML(g, asisState.id);
    const p = findParche(asisState.id);
    if (!p) {
      $('#h-asistentes').textContent = 'Asistentes';
      $('#asistentes-sub').textContent = 'Todavía no tienes parches.';
      $('#asis-ring').innerHTML = ''; $('#asis-kpis').innerHTML = '';
      $('#people').innerHTML = '<li><p class="empty">Publica un parche para ver quién confirma.</p></li>';
      return;
    }
    const c = confirmados(p), inn = checkins(p), ganados = loc().codigos.filter(x => x.parcheId === p.id).length;
    $('#h-asistentes').textContent = p.titulo;
    $('#asistentes-sub').textContent = `${fmtCuando(p.inicio)} · ${tipoTxt(p)} · ${p.cupos} cupos`;
    $('#asis-ring').innerHTML = `<div class="ring">${ringSVG(inn, c)}<span>${inn}</span></div><div><b>${inn ? `${inn} de ${c} adentro` : 'Nadie adentro aún'}</b><small>${enVivo(p) ? `En vivo hasta las ${fmtHora(fin(p))}` : p.inicio > NOW() ? `Arranca ${fmtCuando(p.inicio).toLowerCase()}` : 'El parche terminó'}</small></div>`;
    $('#asis-kpis').innerHTML = `
      <div class="kpi"><p class="kpi-label">Confirmados</p><p class="kpi-value">${c}<small>de ${p.cupos}</small></p><p class="delta">${lleno(p) ? 'Parche lleno' : `${p.cupos - c} cupos libres`}</p></div>
      <div class="kpi"><p class="kpi-label">Por llegar</p><p class="kpi-value">${c - inn}</p><p class="delta">${puedeCheckin(p) ? 'Márcalos en la puerta' : p.inicio > NOW() ? 'El check-in abre ese día' : 'Ya no llegan'}</p></div>
      <div class="kpi"><p class="kpi-label">Cupones ganados</p><p class="kpi-value">${ganados}</p><p class="delta">En este parche</p></div>`;
    $$('#asis-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === asisState.tab)));
    $('#asis-lista').hidden = asisState.tab !== 'lista';
    $('#asis-chat').hidden = asisState.tab !== 'chat';
    if (asisState.tab === 'chat') { renderChat(p); return; }
    const puede = puedeCheckin(p);
    const rows = [...p.asistentes].sort((a, b) => (!!b.llego - !!a.llego) || a.confirmo - b.confirmo);
    $('#people').innerHTML = rows.map(a => `<li class="person ${a.id === justIn ? 'just-in' : ''}">${avatar(a)}
        <span><b>${esc(a.nombre)}</b><small>${a.walkin ? 'Llegó sin confirmar' : `Confirmó ${esc(fmtCuando(a.confirmo).toLowerCase())}`}</small></span>
        ${a.llego ? `<span class="pill pos">${ic('i-check')}Llegó ${fmtHora(a.llego)}</span>` : '<span class="pill">Por llegar</span>'}
        ${puede ? (a.llego ? `<button class="btn ghost btn--sm" data-action="checkout" data-pid="${p.id}" data-uid="${a.id}">Deshacer</button>` : `<button class="btn btn--sm" data-action="checkin" data-pid="${p.id}" data-uid="${a.id}">${ic('i-check')}Marcar llegada</button>`) : '<span></span>'}
      </li>`).join('') || '<li><p class="empty">Nadie ha confirmado todavía. Comparte el afiche del parche.</p></li>';
  }

  function renderChat(p, nuevo = false) {
    const box = $('#chat-msgs'), P = loc().perfil;
    box.innerHTML = p.chat.length ? p.chat.map((m, i) => {
      const cls = nuevo && i === p.chat.length - 1 ? ' is-new' : '';
      if (m.tipo === 'sys') return `<p class="msg msg--sys">${esc(m.texto)} · ${esc(fmtRel(m.ts))}</p>`;
      if (m.autor === 'biz') return `<div class="msg msg--biz${cls}"><div class="msg-body"><small>${esc(P.nombre)} · ${esc(fmtRel(m.ts))}</small><p>${esc(m.texto)}</p></div>${monoHTML(loc())}</div>`;
      return `<div class="msg${cls}">${avatar(m.autor)}<div class="msg-body"><small>${esc(m.autor.nombre)} · ${esc(fmtRel(m.ts))}</small><p>${esc(m.texto)}</p></div></div>`;
    }).join('') : '<p class="msg msg--sys">Todavía no hay mensajes. Saluda al grupo.</p>';
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }

  // Check-in compartido por la lista y el modo puerta: entrega los cupones que el local configuró
  function checkIn(p, a) {
    if (a.llego) return [];
    a.llego = NOW();
    const L = loc(), out = [];
    const reglasQueAplican = L.cupones.filter(k => k.regla === 'checkin' || (k.regla === 'temprano' && NOW() <= p.inicio + HOUR) || (k.regla === 'relampago' && p.tipo === 'relampago'));
    const extra = p.tipo === 'relampago' && p.cuponId ? L.cupones.find(k => k.id === p.cuponId) : null;
    if (extra && !reglasQueAplican.includes(extra)) reglasQueAplican.push(extra);
    for (const k of reglasQueAplican) { const r = entregar(k, a.nombre, p); if (r) out.push(r); }
    save();
    return out;
  }
  function checkOut(p, a) {
    a.llego = null;
    const L = loc();
    L.codigos = L.codigos.filter(c => !(c.auto && !c.canjeado && c.parcheId === p.id && c.persona === a.nombre && c.emitido >= p.inicio - 2 * HOUR));
    save();
  }
  function avisarCupones(nombre, res) {
    const dados = res.filter(r => r.c), saltados = res.filter(r => r.skip);
    if (dados.length) {
      toast(`${nombre} ganó ${dados.length === 1 ? 'un cupón' : `${dados.length} cupones`}`, dados.map(r => `${r.c.codigo}: ${r.c.cupBen}`).join(' · '));
      tone('ok');
    } else tone('in');
    if (saltados.length) toast('Cupón sin entregar', saltados.map(r => r.skip).join('. ') + '.', { error: true });
  }

  /* ---------- Modo puerta ---------- */
  const doorState = { id: null, q: '', justIn: null };
  function openDoor(id = null) {
    closeMenus(); toggleMenu(false);
    const hoy = deHoy();
    doorState.id = id && hoy.some(p => p.id === id) ? id : (hoy.find(enVivo) || hoy[0])?.id || null;
    doorState.q = ''; $('#door-search').value = '';
    const dm = $('#door-mode');
    dm.hidden = false; dm.classList.remove('is-open'); void dm.offsetWidth; dm.classList.add('is-open');
    document.body.classList.add('no-scroll');
    renderDoor();
    setTimeout(() => $('#door-search').focus(), 60);
  }
  function closeDoor() {
    $('#door-mode').hidden = true;
    document.body.classList.remove('no-scroll');
    render();
  }
  function renderDoor() {
    const L = loc(), hoy = deHoy();
    $('#door-select').innerHTML = hoy.map(p => `<option value="${p.id}" ${p.id === doorState.id ? 'selected' : ''}>${esc(p.titulo)} · ${enVivo(p) ? 'en vivo' : fmtHora(p.inicio)}</option>`).join('') || '<option>Sin parches hoy</option>';
    $('#door-select').disabled = !hoy.length;
    const p = findParche(doorState.id);
    $('#door-sub').textContent = `${L.perfil.nombre}${p ? ` · ${p.titulo}` : ''}`;
    if (!p) {
      $('#door-counter').innerHTML = `<div class="ring ring--big">${ringSVG(0, 1, 46)}<span><b>0</b><small>sin parche</small></span></div><p>Hoy no tienes parches. Crea uno o lanza un relámpago para recibir gente con Modo Parche.</p>`;
      $('#door-people').innerHTML = '<li class="door-empty">Cuando tengas un parche hoy, aquí aparece la lista para marcar llegadas.</li>';
      return;
    }
    const c = confirmados(p), inn = checkins(p);
    $('#door-counter').innerHTML = `<div class="ring ring--big ${doorState.justIn ? 'bump' : ''}">${ringSVG(inn, Math.max(c, 1), 46)}<span><b>${inn}</b><small>de ${c} confirmados</small></span></div>
      <p><b>${c - inn}</b> por llegar · <b>${Math.max(0, p.cupos - c)}</b> cupos libres. ${enVivo(p) ? `En vivo hasta las ${fmtHora(fin(p))}` : `Arranca a las ${fmtHora(p.inicio)}`}</p>`;
    const q = norm(doorState.q);
    const rows = [...p.asistentes].filter(a => !q || norm(a.nombre).includes(q)).sort((a, b) => (!!a.llego - !!b.llego) || a.nombre.localeCompare(b.nombre));
    let html = rows.map(a => a.llego
      ? `<li><div class="door-person is-in ${a.id === doorState.justIn ? 'just-in' : ''}">${avatar(a)}<span><b>${esc(a.nombre)}</b><small>Adentro desde las ${fmtHora(a.llego)}</small></span><button class="door-go" data-action="door-out" data-uid="${a.id}">${ic('i-undo')}Deshacer</button></div></li>`
      : `<li><button class="door-person" data-action="door-in" data-uid="${a.id}">${avatar(a)}<span><b>${esc(a.nombre)}</b><small>${a.walkin ? 'Registrado en la puerta' : 'Confirmó en la app'}</small></span><span class="door-go">${ic('i-check')}Llegó</span></button></li>`).join('');
    const exacto = p.asistentes.some(a => norm(a.nombre) === q);
    if (doorState.q.trim().length >= 3 && !exacto) {
      html += lleno(p)
        ? `<li class="door-empty">${esc(doorState.q)} no confirmó y el parche está lleno.</li>`
        : `<li><button class="door-person" data-action="door-walkin">${avatar({ nombre: doorState.q, tono: hash(doorState.q) % 11 })}<span><b>${esc(doorState.q.trim())}</b><small>No confirmó en la app. Regístralo aquí y cuenta en el aforo.</small></span><span class="door-go">${ic('i-plus')}Registrar</span></button></li>`;
    }
    $('#door-people').innerHTML = html || `<li class="door-empty">${p.asistentes.length ? 'Nadie coincide con esa búsqueda.' : 'Nadie confirmó todavía. Escribe el nombre de quien llegue para registrarlo.'}</li>`;
    doorState.justIn = null;
  }
  function doorIn(uid) {
    const p = findParche(doorState.id), a = p && p.asistentes.find(x => x.id === uid);
    if (!a) return;
    const btn = $(`[data-uid="${uid}"]`, $('#door-people'));
    const res = checkIn(p, a);
    doorState.justIn = uid; doorState.q = ''; $('#door-search').value = '';
    if (btn) burstFrom(btn, 24);
    renderDoor();
    avisarCupones(a.nombre, res);
    $('#door-search').focus();
  }
  function doorWalkin() {
    const p = findParche(doorState.id), nombre = doorState.q.trim();
    if (!p || nombre.length < 3 || lleno(p)) return;
    const a = { id: 'w' + NOW().toString(36), nombre: cap(nombre), tono: hash(nombre) % 11, confirmo: NOW(), llego: null, walkin: true };
    p.asistentes.push(a);
    const res = checkIn(p, a);
    if (lleno(p)) for (const k of loc().cupones.filter(x => x.regla === 'lleno')) { const r = entregar(k, a.nombre, p); if (r) res.push(r); }
    save();
    doorState.justIn = a.id; doorState.q = ''; $('#door-search').value = '';
    burstFrom($('#door-counter .ring'), 30);
    renderDoor();
    avisarCupones(a.nombre, res);
    $('#door-search').focus();
  }

  /* =====================================================================
     10. MAPA COMERCIAL
  ===================================================================== */
  let map = null, layer = null, meMarker = null, meCircle = null, watchId = null, flyMe = false, userPos = null, mapDirty = true;
  const timeState = { mode: 'hoy' };
  const markers = {};
  const tiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
  const bizIcon = (Lc, n = 0, flash = false, other = false) => L.divIcon({
    className: 'pin-icon',
    html: `<div class="biz-pin biz-pin--${Lc.perfil.tema}${other ? ' biz-pin--other' : ''}${flash ? ' biz-pin--flash' : ''}" title="${esc(Lc.perfil.nombre)}">${esc(Lc.perfil.corto)}${n ? `<span class="biz-count">${n}</span>` : ''}</div>`,
    iconSize: other ? [30, 30] : [38, 38], iconAnchor: other ? [15, 15] : [19, 19], popupAnchor: [0, -18],
  });
  const meIcon = () => L.divIcon({ className: 'pin-icon', html: '<div class="mpin mpin--me" title="Tu ubicación"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  function timeMatch(p) {
    const d = diasDesdeHoy(p.inicio);
    if (timeState.mode === 'todos') return true;
    if (timeState.mode === 'manana') return d === 1;
    return d === 0 || enVivo(p);
  }
  const timeLabel = () => ({ hoy: 'hoy', manana: 'mañana', todos: 'en los próximos días' }[timeState.mode]);

  function renderMapa() {
    const own = loc();
    const items = allLocales().flatMap(Lc => Lc.parches.filter(p => activo(p) && timeMatch(p)).map(p => ({ p, Lc })))
      .sort((a, b) => (b.Lc.id === own.id) - (a.Lc.id === own.id) || a.p.inicio - b.p.inicio);
    const mios = items.filter(x => x.Lc.id === own.id).length;
    $('#mapa-sub').textContent = `${items.length} ${items.length === 1 ? 'parche' : 'parches'} ${timeLabel()} en los locales aliados de Villavicencio; ${mios} ${mios === 1 ? 'es tuyo' : 'son tuyos'}.`;
    $$('#time-filter [data-time]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === timeState.mode)));
    $('#map-legend').innerHTML = `<span><i class="lg lg--own"></i>${esc(own.perfil.nombre)}</span><span><i class="lg lg--other"></i>Otros locales aliados</span>${userPos ? '<span><i class="lg lg--me"></i>Tu ubicación</span>' : ''}`;
    $('#maplist-meta').textContent = `${items.length} ${timeLabel()}`;
    $('#map-list').innerHTML = items.length ? items.map(({ p, Lc }) => `<li><button class="row row--btn" data-action="fly" data-local="${Lc.id}">
        <span class="lg ${Lc.id === own.id ? 'lg--own' : 'lg--other'}" aria-hidden="true"></span>
        <span class="row-main"><b>${esc(p.titulo)}</b><small>${esc(Lc.perfil.nombre)} · ${esc(fmtCuando(p.inicio))}</small></span>
        <span class="row-end num">${confirmados(p)}<small>de ${p.cupos}</small></span></button></li>`).join('')
      : `<li><p class="empty">No hay parches ${timeLabel()}. Es buen momento para un relámpago.</p></li>`;

    if (watchId === null) startGeo(false);
    setTimeout(() => {
      if (typeof L === 'undefined') return;
      if (!map) {
        map = L.map('map', { zoomControl: true }).setView([own.perfil.lat, own.perfil.lng], 14);
        tiles().addTo(map);
        layer = L.layerGroup().addTo(map);
      }
      map.invalidateSize();
      layer.clearLayers();
      for (const Lc of allLocales()) {
        const suyos = items.filter(x => x.Lc.id === Lc.id).map(x => x.p), mine = Lc.id === own.id;
        const flash = suyos.some(p => p.tipo === 'relampago' && enVivo(p));
        markers[Lc.id] = L.marker([Lc.perfil.lat, Lc.perfil.lng], { icon: bizIcon(Lc, suyos.length, flash, !mine), zIndexOffset: mine ? 800 : 0, riseOnHover: true })
          .bindPopup(`<div class="pop"><b>${esc(Lc.perfil.nombre)}</b><span>${esc(Lc.perfil.direccion)} · ${esc(Lc.perfil.categoria)}</span>${suyos.map(p => `<span>${esc(fmtCuando(p.inicio))} · ${esc(p.titulo)} · ${confirmados(p)} de ${p.cupos}</span>`).join('') || `<span>Sin parches ${timeLabel()}</span>`}</div>`)
          .addTo(layer);
      }
      if (mapDirty) { map.fitBounds(L.latLngBounds(allLocales().map(x => [x.perfil.lat, x.perfil.lng])), { padding: [60, 60], maxZoom: 15 }); mapDirty = false; }
      updateMe();
    }, 40);
  }
  function flyTo(id) {
    const Lc = S.locales[id], m = markers[id];
    if (!map || !Lc) return;
    map.flyTo([Lc.perfil.lat, Lc.perfil.lng], 16, { duration: 0.9 });
    if (m) map.once('moveend', () => m.openPopup());
  }
  function startGeo(fly) {
    if (!('geolocation' in navigator)) { $('#geo-stamp').textContent = 'Este navegador no comparte la ubicación.'; return; }
    flyMe = flyMe || fly;
    if (fly && userPos && map) map.flyTo(userPos, 15, { duration: 1 });
    const o = { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 };
    const ok = pos => {
      userPos = [pos.coords.latitude, pos.coords.longitude];
      $('#geo-stamp').textContent = `Ubicación en vivo, precisión ${int(pos.coords.accuracy)} m`;
      updateMe(pos.coords.accuracy);
      if (flyMe && map) { flyMe = false; map.flyTo(userPos, 15, { duration: 1 }); }
    };
    const bad = err => {
      $('#geo-stamp').textContent = err.code === 1 ? 'Sin permiso de ubicación. Actívalo en el candado del navegador.' : 'No pudimos leer tu ubicación.';
      if (flyMe) { flyMe = false; toast('Sin ubicación', $('#geo-stamp').textContent, { error: true }); }
    };
    navigator.geolocation.getCurrentPosition(ok, bad, o);
    if (watchId === null) watchId = navigator.geolocation.watchPosition(ok, bad, o);
  }
  function updateMe(acc) {
    if (!map || !userPos) return;
    if (!meMarker) {
      meMarker = L.marker(userPos, { icon: meIcon(), zIndexOffset: 900, interactive: false }).addTo(map);
      meCircle = L.circle(userPos, { radius: acc || 30, color: '#2f6fd6', weight: 1, fillOpacity: 0.08 }).addTo(map);
    } else { meMarker.setLatLng(userPos); if (acc) meCircle.setLatLng(userPos).setRadius(acc); }
  }

  /* =====================================================================
     11. PERFIL DEL LOCAL (solo lectura: lo edita el administrador)
  ===================================================================== */
  let mapPerfil = null, perfilMarker = null;
  function renderPerfil() {
    const Lc = loc(), P = Lc.perfil, w = ventana(P), today = new Date(NOW()).getDay();
    mountCard($('#lcard-perfil'));
    const facts = [
      ['Nombre', esc(P.nombre)], ['Categoría', esc(P.categoria)], ['Dirección', `${esc(P.direccion)}, ${esc(P.barrio)}`],
      ['Teléfono', esc(P.tel)], ['NIT', `<span class="code">${esc(P.nit)}</span>`], ['ID Modo Parche', `<span class="code">${esc(P.idMP)}</span>`],
      ['Aliado desde', esc(`${new Date(P.desde).getDate()} de ${new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(P.desde)} de ${new Date(P.desde).getFullYear()}`)],
      ['Descripción', esc(P.desc)],
    ];
    $('#facts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('#horario-hoy').textContent = w.abierto ? `Abierto ahora · cierra ${fmtHora(w.hasta)}` : w.abre ? `Cerrado · abre ${fmtHora(w.abre)}` : 'Cerrado hoy';
    $('#hours').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const h = P.horarios[d];
      return `<li class="${d === today ? 'is-today' : ''}"><b>${DIAS[d]}${d === today ? ' (hoy)' : ''}</b><span>${h.abierto ? `${horaTxt(h.open)} a ${horaTxt(h.close)}` : 'Cerrado'}</span></li>`;
    }).join('');
    $('#ubic-meta').textContent = `${P.direccion} · ${P.lat.toFixed(4)}, ${P.lng.toFixed(4)}`;
    setTimeout(() => {
      if (typeof L === 'undefined') return;
      if (!mapPerfil) {
        mapPerfil = L.map('map-perfil', { scrollWheelZoom: false }).setView([P.lat, P.lng], 15);
        tiles().addTo(mapPerfil);
        perfilMarker = L.marker([P.lat, P.lng], { icon: bizIcon(Lc), keyboard: false }).addTo(mapPerfil);
      }
      mapPerfil.invalidateSize();
      perfilMarker.setLatLng([P.lat, P.lng]).setIcon(bizIcon(Lc));
      mapPerfil.setView([P.lat, P.lng], 15);
    }, 40);
    const prom = promedio(Lc);
    $('#resenas-meta').textContent = Lc.resenas.length ? `${dec1(prom)} de 5 · ${Lc.resenas.length} ${Lc.resenas.length === 1 ? 'reseña' : 'reseñas'}` : 'Sin reseñas aún';
    $('#reviews').innerHTML = [...Lc.resenas].sort((a, b) => b.fecha - a.fecha).map(r => `<li class="review"><div class="review-top">${stars(r.estrellas)}<b>${esc(r.autor)}</b><small>${esc(fmtDia(r.fecha))}</small></div><p>${esc(r.texto)}</p><p class="on">En ${esc(r.parche)}</p></li>`).join('')
      || '<li><p class="empty">Las reseñas aparecen cuando los parceros califican tus parches.</p></li>';
    const sol = S.solicitudes.filter(s => s.local === Lc.id).sort((a, b) => b.ts - a.ts);
    $('#solicitudes').innerHTML = sol.length ? sol.map(s => `<li class="row"><span class="row-main"><b>${esc(s.campo)}</b><small>${esc(s.detalle)}</small></span><span class="row-end"><span class="pill warn">En revisión</span><small>${esc(fmtRel(s.ts))}</small></span></li>`).join('')
      : '<li><p class="empty">No has pedido cambios. Si algo de tu perfil está mal, usa Solicitar un cambio.</p></li>';
  }

  /* =====================================================================
     12. DIÁLOGOS Y AVISOS
  ===================================================================== */
  function toast(title, text = '', opts = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (opts.error ? ' is-error' : '');
    el.setAttribute('role', opts.error ? 'alert' : 'status');
    el.innerHTML = `${ic(opts.error ? 'i-alert' : 'i-check')}<div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 220); }, 4600);
  }
  function setField(input, msg) {
    const f = input.closest('.field');
    f.classList.remove('is-error'); void f.offsetWidth;
    f.classList.toggle('is-error', !!msg);
    f.classList.toggle('is-valid', !msg);
    const out = $('.field-msg', f); if (out) out.textContent = msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    return !msg;
  }
  const resetFields = form => $$('.field', form).forEach(f => { f.classList.remove('is-error', 'is-valid'); const m = $('.field-msg', f); if (m) m.textContent = ''; });
  function confirmar(title, text, okTxt = 'Sí, continuar') {
    return new Promise(res => {
      const dlg = $('#dlg-confirm');
      $('#dlg-confirm-title').textContent = title;
      $('#confirm-text').textContent = text;
      $('#confirm-ok').textContent = okTxt;
      dlg.returnValue = '';
      dlg.onclose = () => res(dlg.returnValue === 'ok');
      dlg.showModal();
    });
  }

  /* ---------- Parche oficial: crear y editar ---------- */
  let editId = null, mapDlg = null, dlgMarker = null;
  const dlgPos = { lat: null, lng: null };
  const RULES_P = {
    'p-titulo': v => !v.trim() ? 'Ponle un nombre al parche.' : v.trim().length < 5 ? 'Mínimo 5 caracteres.' : '',
    'p-fecha': v => !v ? 'Elige la fecha.' : v < dayKey(NOW()) ? 'Esa fecha ya pasó.' : '',
    'p-hora': v => { if (!v) return 'Elige la hora.'; const f = $('#p-fecha').value; return f === dayKey(NOW()) && at(new Date(f + 'T12:00:00').getTime(), v) < NOW() ? 'Esa hora ya pasó.' : ''; },
    'p-cupos': v => { const n = Number(v); if (!Number.isInteger(n) || n < 2) return 'Mínimo 2 cupos.'; if (n > 500) return 'Máximo 500.'; const p = editId && findParche(editId); return p && n < confirmados(p) ? `Ya hay ${confirmados(p)} confirmados.` : ''; },
    'p-consumo': v => v === '' || Number(v) < 0 ? 'Usa 0 si no hay consumo mínimo.' : '',
    'p-promo': v => v.trim().length < 10 ? 'Cuenta qué pasa ese día (mínimo 10 caracteres).' : '',
  };
  function openParche(id = null, fecha = null) {
    closeMenus();
    editId = id;
    const p = id ? findParche(id) : null, P = loc().perfil;
    $('#dlg-parche-title').textContent = p ? 'Editar parche' : 'Nuevo parche oficial';
    $('#p-submit').textContent = p ? 'Guardar cambios' : 'Publicar parche';
    resetFields($('#form-parche'));
    const base = p ? p.inicio : fecha ? new Date(fecha + 'T12:00:00').getTime() : day0(NOW()) + DAY;
    const h = P.horarios[new Date(base).getDay()];
    $('#p-titulo').value = p ? p.titulo : '';
    $('#p-fecha').value = dayKey(base); $('#p-fecha').min = dayKey(NOW());
    $('#p-hora').value = p ? hhmm(p.inicio) : (h && h.abierto ? h.open : '19:00');
    if (!p && fecha === dayKey(NOW()) && at(NOW(), $('#p-hora').value) < NOW()) $('#p-hora').value = hhmm(Math.ceil((NOW() + 30 * MIN) / (30 * MIN)) * 30 * MIN);
    $('#p-cupos').value = p ? p.cupos : 20;
    $('#p-consumo').value = p ? p.consumo : 30000;
    $('#p-promo').value = p ? p.promo : '';
    dlgPos.lat = p ? p.lat ?? P.lat : P.lat; dlgPos.lng = p ? p.lng ?? P.lng : P.lng;
    $('#dlg-parche').showModal();
    setTimeout(() => {
      if (typeof L === 'undefined') { $('#pmap-coords').textContent = 'El mapa no cargó; el parche queda en tu local.'; return; }
      if (!mapDlg) {
        mapDlg = L.map('map-parche').setView([dlgPos.lat, dlgPos.lng], 15);
        tiles().addTo(mapDlg);
        dlgMarker = L.marker([dlgPos.lat, dlgPos.lng], { icon: bizIcon(loc()), draggable: true }).addTo(mapDlg);
        const set = ll => { dlgPos.lat = +ll.lat.toFixed(6); dlgPos.lng = +ll.lng.toFixed(6); dlgMarker.setLatLng(ll); coords(); };
        mapDlg.on('click', e => set(e.latlng));
        dlgMarker.on('dragend', () => set(dlgMarker.getLatLng()));
      }
      mapDlg.invalidateSize();
      dlgMarker.setIcon(bizIcon(loc())).setLatLng([dlgPos.lat, dlgPos.lng]);
      mapDlg.setView([dlgPos.lat, dlgPos.lng], 15);
      coords();
    }, 60);
  }
  function coords() {
    const P = loc().perfil;
    const dist = (a, b) => { const R = 6371, r = x => x * Math.PI / 180; const dl = r(b[0] - a[0]), dg = r(b[1] - a[1]); const s = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
    const km = dist([dlgPos.lat, dlgPos.lng], [P.lat, P.lng]);
    $('#pmap-coords').textContent = `${dlgPos.lat.toFixed(5)}, ${dlgPos.lng.toFixed(5)} · ${km < 0.05 ? 'en tu local' : `a ${km.toFixed(1).replace('.', ',')} km de tu local`}. Toca el mapa o arrastra el pin para moverlo.`;
  }
  function submitParche(e) {
    e.preventDefault();
    const bad = Object.keys(RULES_P).filter(id => !setField($('#' + id), RULES_P[id]($('#' + id).value)));
    if (bad.length) { $('#' + bad[0]).focus(); return; }
    const inicio = at(new Date($('#p-fecha').value + 'T12:00:00').getTime(), $('#p-hora').value);
    const datos = { titulo: $('#p-titulo').value.trim(), inicio, cupos: Number($('#p-cupos').value), consumo: Number($('#p-consumo').value), promo: $('#p-promo').value.trim(), lat: dlgPos.lat, lng: dlgPos.lng };
    if (editId) {
      const p = findParche(editId);
      Object.assign(p, datos);
      p.chat.push({ tipo: 'sys', texto: 'El local actualizó los datos del parche', ts: NOW() });
      toast('Parche actualizado', 'Los confirmados ya ven los cambios.');
    } else {
      loc().parches.push({ id: 'n' + NOW().toString(36), tipo: 'oficial', organizador: loc().perfil.nombre, dur: 240, creado: true, creadoTs: NOW(), asistentes: [], cancelado: false, chat: [{ tipo: 'sys', texto: 'Publicaste el parche', ts: NOW() }], ...datos });
      toast('Parche publicado', `${datos.titulo} ya está en el mapa de Modo Parche.`);
      listState.tab = 'proximos';
      burstFrom($('#p-submit'), 30);
    }
    save();
    $('#dlg-parche').close();
    if (route !== 'parches') location.hash = '#parches'; else render();
  }

  /* ---------- Relámpago ---------- */
  let relDur = 60;
  function openRelampago() {
    closeMenus();
    const P = loc().perfil, w = ventana(P);
    $('#rel-note').textContent = relampagoVivo()
      ? 'Ya tienes un relámpago en vivo. Si lanzas otro, el actual termina ahora.'
      : w.abierto ? `Sale de una en el mapa de Modo Parche con un anillo naranja. Hoy estás abierto hasta las ${fmtHora(w.hasta)}`
        : `Ojo: ahora estás cerrado${w.abre ? ` y abres a las ${fmtHora(w.abre)}` : ''}. Si lo lanzas, la gente llegará con el local cerrado.`;
    $('#r-promo').value = ''; $('#r-cupos').value = 20;
    const act = loc().cupones.filter(k => k.estado === 'activo' && !agotado(k));
    const def = act.find(k => k.regla === 'relampago');
    $('#r-cupon').innerHTML = '<option value="">Sin cupón</option>' + act.map(k => `<option value="${k.id}" ${def && def.id === k.id ? 'selected' : ''}>${esc(k.nombre)}: ${esc(k.beneficio)}</option>`).join('');
    resetFields($('#form-relampago'));
    updRelSummary();
    $('#dlg-relampago').showModal();
  }
  function updRelSummary() {
    $$('#r-dur button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.min) === relDur)));
    const k = $('#r-cupon').value && cupon($('#r-cupon').value);
    $('#rel-summary').textContent = `Arranca ya y termina a las ${fmtHora(NOW() + relDur * MIN)} ${k ? `Quien llegue gana ${k.nombre}.` : 'Sin cupón: solo la promoción.'}`;
  }
  function submitRelampago(e) {
    e.preventDefault();
    const ok1 = setField($('#r-promo'), $('#r-promo').value.trim().length < 4 ? 'Escribe la promoción (mínimo 4 caracteres).' : '');
    const n = Number($('#r-cupos').value);
    const ok2 = setField($('#r-cupos'), !Number.isInteger(n) || n < 2 ? 'Mínimo 2 cupos.' : n > 300 ? 'Máximo 300.' : '');
    if (!ok1 || !ok2) return;
    const prev = relampagoVivo();
    if (prev) prev.dur = Math.max(1, Math.round((NOW() - prev.inicio) / MIN));
    const P = loc().perfil, promo = $('#r-promo').value.trim();
    const p = { id: 'r' + NOW().toString(36), tipo: 'relampago', titulo: `Relámpago: ${promo}`, promo, organizador: P.nombre, inicio: NOW(), dur: relDur, cupos: n, consumo: 0, cuponId: $('#r-cupon').value || null, creado: true, creadoTs: NOW(), asistentes: [], cancelado: false, lat: P.lat, lng: P.lng, chat: [{ tipo: 'sys', texto: 'Lanzaste un parche relámpago', ts: NOW() }] };
    loc().parches.push(p);
    save();
    $('#dlg-relampago').close();
    toast('Relámpago en vivo', `${promo} ya se ve en el mapa con un anillo naranja hasta las ${fmtHora(fin(p))}`);
    burst(window.innerWidth / 2, window.innerHeight / 3, 46, ['#ff751f', '#ffd3b6', '#15110e']);
    tone('ok');
    render();
  }

  /* ---------- Cupón: crear, editar y duplicar ---------- */
  let cuponEdit = null;
  function openCupon(id = null, duplicar = false) {
    closeMenus();
    const k = id ? cupon(id) : null;
    cuponEdit = k && !duplicar ? k.id : null;
    $('#dlg-cupon-title').textContent = cuponEdit ? 'Editar cupón' : duplicar ? 'Duplicar cupón' : 'Crear cupón';
    $('#k-submit').textContent = cuponEdit ? 'Guardar cambios' : 'Crear cupón';
    $('#k-regla').innerHTML = Object.entries(REGLAS).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
    resetFields($('#form-cupon'));
    $('#k-nombre').value = k ? (duplicar ? `${k.nombre} 2`.slice(0, 28) : k.nombre) : '';
    $('#k-beneficio').value = k ? k.beneficio : '';
    $('#k-regla').value = k ? k.regla : 'checkin';
    $('#k-vigencia').value = String(k ? k.vigencia : 7);
    $('#k-limite').value = k ? k.limite : 50;
    $('#k-prefijo').value = cuponEdit ? k.prefijo : '';
    const bloqueado = !!(cuponEdit && entregados(k));
    $('#k-prefijo').disabled = bloqueado;
    $('#k-prefijo').title = bloqueado ? 'Ya hay códigos entregados con este prefijo' : '';
    updPreview();
    $('#dlg-cupon').showModal();
  }
  function cuponDelForm() {
    return { id: cuponEdit, nombre: $('#k-nombre').value.trim(), beneficio: $('#k-beneficio').value.trim(), regla: $('#k-regla').value, vigencia: Number($('#k-vigencia').value), limite: Number($('#k-limite').value) || 0, prefijo: $('#k-prefijo').value.trim().toUpperCase(), estado: 'activo' };
  }
  function updPreview() { $('#ticket-preview').innerHTML = tkHTML(cuponDelForm(), true); }
  function submitCupon(e) {
    e.preventDefault();
    const d = cuponDelForm(), L = loc(), prev = cuponEdit && cupon(cuponEdit);
    const otros = L.cupones.filter(k => k.id !== cuponEdit);
    const ok = [
      setField($('#k-nombre'), d.nombre.length < 3 ? 'Mínimo 3 caracteres.' : otros.some(k => norm(k.nombre) === norm(d.nombre)) ? 'Ya tienes un cupón con ese nombre.' : ''),
      setField($('#k-beneficio'), d.beneficio.length < 5 ? 'Di qué recibe el parcero.' : ''),
      setField($('#k-limite'), !Number.isInteger(d.limite) || d.limite < 1 ? 'Mínimo 1.' : d.limite > 999 ? 'Máximo 999.' : prev && d.limite < entregados(prev) ? `Ya entregaste ${entregados(prev)}.` : ''),
      $('#k-prefijo').disabled ? true : setField($('#k-prefijo'), !/^[A-Z]{3,8}$/.test(d.prefijo) ? 'Entre 3 y 8 letras, sin tildes ni espacios.' : otros.some(k => k.prefijo === d.prefijo) ? 'Ese prefijo ya existe.' : ''),
    ].every(Boolean);
    if (!ok) return;
    let nuevo = null;
    if (prev) {
      Object.assign(prev, { nombre: d.nombre, beneficio: d.beneficio, regla: d.regla, vigencia: d.vigencia, limite: d.limite, prefijo: $('#k-prefijo').disabled ? prev.prefijo : d.prefijo });
      toast('Cupón actualizado', 'Los códigos que ya entregaste conservan su beneficio.');
    } else {
      nuevo = 'k' + NOW().toString(36);
      L.cupones.push({ ...d, id: nuevo, creado: true });
      toast('Cupón creado', `${d.nombre}: ${REGLAS[d.regla].toLowerCase()}.`);
    }
    save();
    $('#dlg-cupon').close();
    renderShell();
    if (route !== 'cupones') location.hash = '#cupones';
    else renderCupones({ nuevo });
  }

  /* ---------- Cancelar parche y solicitud de cambio ---------- */
  async function askCancel(id) {
    closeMenus();
    const p = findParche(id);
    const ok = await confirmar('Cancelar parche', `"${p.titulo}" (${fmtCuando(p.inicio)}) sale del mapa y avisamos a ${confirmados(p)} ${confirmados(p) === 1 ? 'confirmado' : 'confirmados'} por el chat del grupo.`, 'Sí, cancelar');
    if (!ok) return;
    p.cancelado = true;
    p.chat.push({ tipo: 'sys', texto: 'El local canceló el parche', ts: NOW() });
    save();
    toast('Parche cancelado', `Avisamos a ${confirmados(p)} ${confirmados(p) === 1 ? 'persona' : 'personas'}.`);
    render();
  }
  function submitSolicitud(e) {
    e.preventDefault();
    const det = $('#s-detalle').value.trim();
    if (!setField($('#s-detalle'), det.length < 10 ? 'Cuéntanos el cambio (mínimo 10 caracteres).' : '')) return;
    S.solicitudes.push({ id: 's' + NOW().toString(36), local: S.actual, campo: $('#s-campo').value, detalle: det, ts: NOW(), estado: 'revision' });
    save();
    $('#dlg-solicitud').close();
    toast('Solicitud enviada', 'El equipo de Modo Parche la revisa y te avisa cuando quede.');
    renderPerfil();
  }

  /* =====================================================================
     13. EVENTOS E INICIO
  ===================================================================== */
  const typing = el => el && (el.closest('input, textarea, select, [contenteditable]') || el.closest('dialog[open]'));
  function bind() {
    window.addEventListener('hashchange', go);
    $('#menu-toggle').addEventListener('click', () => toggleMenu(true));
    $('#menu-close').addEventListener('click', () => toggleMenu(false));
    $('#local-btn').addEventListener('click', e => {
      e.stopPropagation();
      const list = $('#local-list'), open = list.hidden;
      list.hidden = !open; $('#local-btn').setAttribute('aria-expanded', String(open));
      if (open) { const sel = $('[aria-selected="true"]', list); if (sel) sel.focus(); }
    });
    $('#sound-btn').addEventListener('click', () => { S.sonido = !S.sonido; save(); renderShell(); if (S.sonido) tone('in'); toast(S.sonido ? 'Sonido activado' : 'Sonido apagado', S.sonido ? 'Suena al validar cupones y marcar llegadas.' : 'El panel valida en silencio.'); });

    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (!e.target.closest('#row-menu') && !e.target.closest('[data-action="row-menu"], [data-action="cupon-menu"]')) $('#row-menu').hidden = true;
      if (!e.target.closest('.local-switch')) { $('#local-list').hidden = true; $('#local-btn').setAttribute('aria-expanded', 'false'); }
      if (!a) return;
      const id = a.dataset.id;
      switch (a.dataset.action) {
        case 'cambiar-local': cambiarLocal(a.dataset.local); break;
        case 'relampago': openRelampago(); break;
        case 'nuevo-parche': openParche(null, a.dataset.fecha || null); break;
        case 'editar': openParche(id); break;
        case 'cancelar': askCancel(id); break;
        case 'afiche': openAfiche(id); break;
        case 'cerrar-afiche': $('#dlg-afiche').close(); break;
        case 'descargar-afiche': descargarAfiche(); break;
        case 'row-menu': e.stopPropagation(); if ($('#row-menu').hidden) parcheMenu(a, id); else $('#row-menu').hidden = true; break;
        case 'cupon-menu': e.stopPropagation(); if ($('#row-menu').hidden) cuponMenu(a, id); else $('#row-menu').hidden = true; break;
        case 'ver-asistentes': closeMenus(); asisState.id = id; asisState.tab = 'lista'; if (route === 'asistentes') render(); else location.hash = '#asistentes'; break;
        case 'limpiar-busqueda': listState.q = ''; $('#search').value = ''; renderParches(); break;
        case 'fly': flyTo(a.dataset.local); break;
        case 'checkin': { const p = findParche(a.dataset.pid), u = p && p.asistentes.find(x => x.id === a.dataset.uid); if (u) { const r = checkIn(p, u); burstFrom(a, 20); renderShell(); renderAsistentes(u.id); avisarCupones(u.nombre, r); } break; }
        case 'checkout': { const p = findParche(a.dataset.pid), u = p && p.asistentes.find(x => x.id === a.dataset.uid); if (u) { checkOut(p, u); renderShell(); renderAsistentes(); toast('Llegada deshecha', `${u.nombre} vuelve a estar por llegar.`); } break; }
        case 'usar-codigo': $('#code-input').value = a.dataset.code; $('#code-input').focus(); $('#validar').scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' }); break;
        case 'ir-validar': irValidar(); break;
        case 'escanear': openScan(); break;
        case 'cerrar-scan': closeScan(); break;
        case 'deshacer-canje': deshacerCanje(a.dataset.code); break;
        case 'nuevo-cupon': openCupon(); break;
        case 'editar-cupon': openCupon(id); break;
        case 'duplicar-cupon': openCupon(id, true); break;
        case 'eliminar-cupon': closeMenus(); eliminarCupon(id); break;
        case 'terminar-rel': { const p = findParche(id); if (p) { p.dur = Math.max(1, Math.round((NOW() - p.inicio) / MIN)); save(); toast('Relámpago terminado', `${p.promo} salió del mapa.`); render(); } break; }
        case 'modo-puerta': openDoor(id || null); break;
        case 'cerrar-puerta': closeDoor(); break;
        case 'door-in': doorIn(a.dataset.uid); break;
        case 'door-out': { const p = findParche(doorState.id), u = p && p.asistentes.find(x => x.id === a.dataset.uid); if (u) { checkOut(p, u); renderDoor(); toast('Llegada deshecha', u.nombre); } break; }
        case 'door-walkin': doorWalkin(); break;
        case 'flip-card': { a.classList.toggle('is-flipped'); a.setAttribute('aria-pressed', String(a.classList.contains('is-flipped'))); break; }
        case 'solicitar': resetFields($('#form-solicitud')); $('#s-detalle').value = ''; $('#dlg-solicitud').showModal(); break;
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!$('#door-mode').hidden && !document.querySelector('dialog[open]')) { closeDoor(); return; }
        closeMenus(); toggleMenu(false); return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || !$('#door-mode').hidden) return;
      const k = e.key.toLowerCase();
      if (e.key === '/') { e.preventDefault(); if (window.innerWidth <= 860) toggleMenu(false); $('#search').focus(); }
      else if (k === 'v') { e.preventDefault(); irValidar(); }
      else if (k === 'n') { e.preventDefault(); openParche(); }
      else if (k === 'r') { e.preventDefault(); openRelampago(); }
      else if (k === 'p') { e.preventDefault(); openDoor(); }
    });

    // Búsqueda: un código va al validador; lo demás filtra los parches
    $('#search').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = e.target.value.trim();
      if (!q) return;
      if (/^[a-z]{3,8}-\d{4}$/i.test(q)) { e.target.value = ''; irValidar(); setTimeout(() => { $('#code-input').value = q.toUpperCase(); validar(q); }, 80); return; }
      listState.q = q;
      const L = loc(), hit = p => norm(`${p.titulo} ${p.organizador}`).includes(norm(q));
      listState.tab = L.parches.some(p => activo(p) && hit(p)) ? 'proximos' : L.parches.some(hit) ? 'pasados' : 'proximos';
      if (route !== 'parches') location.hash = '#parches'; else renderParches();
    });

    $$('#parches-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { listState.tab = b.dataset.tab; renderParches(); }));
    $$('#time-filter [data-time]').forEach(b => b.addEventListener('click', () => { timeState.mode = b.dataset.time; renderMapa(); }));
    $('#btn-locate').addEventListener('click', () => startGeo(true));

    // Cupones
    $('#validator').addEventListener('submit', e => { e.preventDefault(); validar($('#code-input').value); });
    document.addEventListener('change', e => { const sw = e.target.closest('[data-cupon]'); if (sw) toggleCupon(sw.dataset.cupon, sw.checked); });
    ['k-nombre', 'k-beneficio', 'k-regla', 'k-vigencia', 'k-limite', 'k-prefijo'].forEach(id => $('#' + id).addEventListener('input', updPreview));

    // Asistentes
    $('#parche-select').addEventListener('change', e => { asisState.id = e.target.value; renderAsistentes(); });
    $$('#asis-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { asisState.tab = b.dataset.tab; renderAsistentes(); }));
    $('#chat-form').addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('#chat-input'), txt = inp.value.trim(), p = findParche(asisState.id);
      if (!txt || !p) return;
      p.chat.push({ autor: 'biz', texto: txt.slice(0, 400), ts: NOW() });
      inp.value = ''; save(); renderChat(p, true);
    });

    // Modo puerta
    $('#door-select').addEventListener('change', e => { doorState.id = e.target.value; doorState.q = ''; $('#door-search').value = ''; renderDoor(); });
    $('#door-search').addEventListener('input', e => { doorState.q = e.target.value; renderDoor(); });
    $('#door-search').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const p = findParche(doorState.id); if (!p) return;
      const q = norm(doorState.q); if (!q) return;
      const match = p.asistentes.filter(a => !a.llego && norm(a.nombre).includes(q));
      if (match.length === 1) doorIn(match[0].id);
      else if (!match.length && !p.asistentes.some(a => norm(a.nombre) === q)) doorWalkin();
    });

    // Diálogos
    $('#form-parche').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitParche(e); });
    $('#form-parche').addEventListener('focusout', e => { const id = e.target.id; if (RULES_P[id] && e.target.value) setField(e.target, RULES_P[id](e.target.value)); });
    $('#form-relampago').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitRelampago(e); });
    $$('#r-dur button').forEach(b => b.addEventListener('click', () => { relDur = Number(b.dataset.min); updRelSummary(); }));
    $('#r-cupon').addEventListener('change', updRelSummary);
    $('#form-cupon').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitCupon(e); });
    $('#form-solicitud').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitSolicitud(e); });
    $('#dlg-scan').addEventListener('close', closeScan);

    bindTilt();

    // El reloj corre: cuenta regresiva del relámpago cada segundo y estados cada 30 s
    setInterval(tickCountdown, 1000);
    setInterval(() => {
      renderShell();
      if (route === 'resumen' && !document.querySelector('dialog[open]')) { renderPulse(); renderNoche(); renderFeed(); }
      if (!$('#door-mode').hidden) renderDoor();
    }, 30000);
    window.addEventListener('resize', () => { map && map.invalidateSize(); });
  }
  function irValidar() {
    if (route !== 'cupones') location.hash = '#cupones';
    setTimeout(() => { $('#code-input').focus(); $('#validar').scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' }); }, 90);
  }

  function init() {
    load();
    verificar();
    bind();
    go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
