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
  const { esc, norm } = window.MPUtil;
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#${n}"/></svg>`;
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const { int, money } = window.MPUtil;
  const dec1 = n => n.toFixed(1).replace('.', ',');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Cuenta real (Supabase) o panel de ejemplo (?demo=1). Cada cuenta ve solo su negocio.
  const DEMO = new URLSearchParams(location.search).has('demo');
  const SB = () => window.mpSupabase || null;
  let ME = null;
  const REMOTE = () => !DEMO && !!ME;
  const CENTRO = { lat: 4.1420, lng: -73.6266 };
  // Cobro por resultados: sin mensualidad. Las tarifas son las mismas de la base
  // (private.tarifa_cliente y private.comision_pct).
  const PLANES = {
    basico: { nombre: 'Parche básico', precio: 'Gratis', limite: 2, cliente: 0, pct: 0,
      puntos: ['2 parches al mes', 'Perfil de negocio en el radar', 'Conteo de cupos llenados', '0% de comisión y sin cobro por cliente', 'Validación básica con código QR'] },
    villavo: { nombre: 'Parche Villavo', precio: '10% o $2.500 / cliente', limite: Infinity, cliente: 2500, pct: 10,
      puntos: ['Parches ilimitados con foto destacada', 'Promos relámpago destacadas en el radar', 'Prioridad cuando filtran tu categoría', 'Métricas de quién llega, qué día y a qué hora', '10% en paquetes cerrados redimidos', '$2.500 por cliente validado en consumo libre', '$0 fijos: sin mensualidad ni permanencia'] },
    sedes: { nombre: 'Varias sedes', precio: '8% o $2.000 / cliente', limite: Infinity, cliente: 2000, pct: 8,
      puntos: ['8% en paquetes cerrados redimidos', '$2.000 por cliente validado en consumo libre', 'Parches ilimitados en todas tus ubicaciones', 'Prioridad destacada en el radar multizona', 'Acompañamiento directo del equipo'] },
  };
  const tarifas = plan => { const p = PLANES[plan] || PLANES.basico; return { cliente: p.cliente, pct: p.pct }; };
  // Datáfono virtual de Wompi para pagar el estado de cuenta (monto abierto)
  const DATAFONO_WOMPI = 'https://checkout.wompi.co/l/VPOS_saHurm';

  const CAT_NEG = { comida: 'Comida y Antojos', rumba: 'Rumba y Bares', chill: 'Planes Chill', conciertos: 'Conciertos y Toques', cultura: 'Cultura y Talleres', deportes: 'Deporte y Bienestar', pueblear: 'Turismo y Aventura', gaming: 'Gaming', rio: 'Río y Naturaleza', pet: 'Pet Friendly' };

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
    bienvenida: 'Llega por primera vez a tu local (bienvenida)',
    checkin: 'Hace check-in en uno de tus parches',
    temprano: 'Llega en la primera hora del parche',
    lleno: 'Su parche llena todos los cupos',
    cumple: 'Celebra su cumpleaños con 6 o más confirmados',
    relampago: 'Llega durante un parche relámpago',
  };
  const TEMAS = { 'Rumba y Bares': 'noche', 'Conciertos y Toques': 'noche', 'Gaming': 'noche', 'Comida y Antojos': 'fuego', 'Deporte y Bienestar': 'fuego', 'Planes Chill': 'dia', 'Cultura y Talleres': 'dia', 'Turismo y Aventura': 'dia', 'Río y Naturaleza': 'dia', 'Pet Friendly': 'dia' };
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

    const perfil = o => ({ ...o, tema: TEMAS[o.categoria] || 'noche' });
    return {
      v: 3, day: dayKey(t0), actual: 'capachos', sonido: true, solicitudes: [],
      locales: {
        capachos: { id: 'capachos', perfil: perfil({ nombre: 'Discoteca Los Capachos', corto: 'LC', categoria: 'Rumba y Bares', cat: 'rumba', plan: 'villavo', tel: '608 670 4521', nit: '900.418.226-1', idMP: 'MP-0421', desde: new Date(2026, 2, 14).getTime(), direccion: 'Km 4', barrio: 'Vía Acacías', lat: 4.1165, lng: -73.6508,
          desc: 'Discoteca a la salida de Villavo por la vía a Acacías. Crossover, reguetón viejo y arpa llanera en vivo.',
          horarios: horarios('19:00', '00:00', { 0: { open: '18:00' }, 4: { open: '20:00', close: '02:00' }, 5: { open: '21:00', close: '04:00' }, 6: { open: '21:00', close: '04:00' } }) }),
          parches: capP, cupones: capK, codigos: capC, resenas: capR,
          // Modo Mesa de ejemplo: una promo y dos reservas
          mesas: [{ id: 'cap-m1', titulo: 'Mesa de 6: botella de la casa', beneficio: 'Botella de aguardiente de cortesía si llegan 6 o más', descripcion: 'Mesa guardada 20 minutos.', min: 6, max: 12, dias: [4, 5, 6], desde: '20:00', hasta: '02:00', cupos: 6, activa: true, vence: '' }],
          reservas: [
            { id: 'cap-r1', promoId: 'cap-m1', persona: A('Sara V.', at(tc, '10:12')), personas: 7, llegada: at(tc, '22:30'), nota: 'Es un cumpleaños', estado: 'pendiente', codigo: 'MESA-7KQ2D', creado: past(at(tc, '10:12')) },
            { id: 'cap-r2', promoId: 'cap-m1', persona: A('Julián T.', at(tc, '09:40')), personas: 6, llegada: at(tc + DAY, '21:00'), nota: '', estado: 'confirmada', codigo: 'MESA-3PZ8W', creado: past(at(tc, '09:40')) },
          ] },
      },
    };
  }

  /* =====================================================================
     3. ESTADO Y DERIVADOS
  ===================================================================== */
  // Panel de ejemplo: todo vive en este navegador.
  // Cuenta real: el negocio y sus parches vienen de Supabase; cupones, llegadas
  // y horarios se guardan aparte para cada cuenta (nunca se mezclan).
  let KEY = 'mp_business_demo_v3';
  let S = null;
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    const asegurar = () => { for (const L of Object.values(S.locales)) { L.mesas = L.mesas || []; L.reservas = L.reservas || []; } };
    if (saved && saved.v === 3 && saved.day === dayKey(NOW()) && saved.locales) { S = saved; asegurar(); return; }
    S = seed();
    if (saved && saved.v === 3 && saved.locales) {
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
        if (Array.isArray(old.mesas)) S.locales[id].mesas = old.mesas;
        if (old.perfil && old.perfil.horarios) S.locales[id].perfil.horarios = old.perfil.horarios;
      }
    }
    asegurar();
  }
  // Horarios y cupones van a la base (negocios.horarios y negocios.cupones) para
  // que no se pierdan al cambiar de celular o de navegador
  let syncT = null, ultimoSync = null;
  function syncNegocio() {
    if (!REMOTE() || SOLO_LECTURA) return; // sin señal no se intenta subir nada
    clearTimeout(syncT);
    syncT = setTimeout(async () => {
      const L = loc(), campos = { horarios: L.perfil.horarios || null, cupones: L.cupones };
      const firma = JSON.stringify(campos);
      if (firma === ultimoSync) return;
      const { error } = await SB().from('negocios').update(campos).eq('id', ME.id);
      if (error) { console.warn('[negocio]', error.message); if (!/horarios|cupones/.test(error.message)) toast('No se guardó en la nube', 'Tus cambios quedan en este navegador. Revisa tu conexión.', { error: true }); return; }
      ultimoSync = firma;
    }, 700);
  }
  function save() {
    try {
      if (!REMOTE()) { localStorage.setItem(KEY, JSON.stringify(S)); return; }
      syncNegocio();
      programarCopia();
      const L = loc(), rem = L.parches.filter(p => p.remoto);
      localStorage.setItem(KEY, JSON.stringify({
        v: 3, sonido: S.sonido, cupones: L.cupones, codigos: cuponesEnServidor ? [] : L.codigos, horarios: L.perfil.horarios,
        llegadas: Object.fromEntries(rem.map(p => [p.id, Object.fromEntries(p.asistentes.filter(a => a.llego).map(a => [a.id, a.llego]))])),
        walkins: walkinsEnServidor ? {} : Object.fromEntries(rem.map(p => [p.id, p.asistentes.filter(a => a.walkin)])),
        durs: Object.fromEntries(rem.map(p => [p.id, p.dur])),
        cupRel: Object.fromEntries(rem.filter(p => p.cuponId).map(p => [p.id, p.cuponId])),
      }));
    } catch (e) { /* sin espacio: el panel sigue funcionando en memoria */ }
  }
  const meta = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };

  /* ---------- Cuenta real: negocio desde Supabase ---------- */
  const initialsOf = n => String(n || 'MP').split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'MP';
  const fmtTel = t => String(t || '').replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3');
  function perfilDeNegocio(n, prev = {}) {
    const categoria = CAT_NEG[n.categoria] || 'Comida y Antojos';
    return {
      nombre: n.nombre, corto: initialsOf(n.nombre), categoria, cat: n.categoria, tema: TEMAS[categoria] || 'fuego',
      plan: n.plan, sedes: n.sedes, responsable: n.responsable, tipoNegocio: n.tipo,
      tel: fmtTel(n.telefono), telRaw: n.telefono || '', nit: n.nit || 'Sin NIT', idMP: 'MP-' + String(n.id).slice(0, 4).toUpperCase(),
      desde: Date.parse(n.creado_en) || NOW(), direccion: n.direccion || 'Sin dirección', barrio: n.barrio || n.ciudad || 'Villavicencio',
      lat: typeof n.lat === 'number' ? n.lat : CENTRO.lat, lng: typeof n.lng === 'number' ? n.lng : CENTRO.lng,
      desc: n.descripcion || 'Cuenta a los parceros qué ofreces desde Editar perfil.',
      // Los horarios los pone el dueño. null = todavía no los ha configurado.
      horarios: horariosValidos(n.horarios) || horariosValidos(prev.horarios) || null,
      planVence: n.plan_vence ? Date.parse(n.plan_vence) : null,
      planPendiente: n.plan_pendiente || null,
      planProgramado: n.plan_programado || null, planProgramadoEn: n.plan_programado_en || null,
      sinUbicacion: typeof n.lat !== 'number' || typeof n.lng !== 'number',
      ciudad: n.ciudad || 'Villavicencio',
    };
  }
  // { "0": {abierto, open, close}, ... "6": {...} } con horas HH:MM
  function horariosValidos(h) {
    if (!h || typeof h !== 'object') return null;
    const ok = [0, 1, 2, 3, 4, 5, 6].every(d => { const x = h[d]; return x && typeof x.abierto === 'boolean' && /^\d{2}:\d{2}$/.test(x.open) && /^\d{2}:\d{2}$/.test(x.close); });
    return ok ? Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, { abierto: h[d].abierto, open: h[d].open, close: h[d].close }])) : null;
  }
  // Una cuenta nueva arranca SIN cupones: los crea el dueño cuando quiera
  function cuentaNueva(n) {
    const m = meta();
    return {
      v: 3, day: dayKey(NOW()), actual: n.id, sonido: m.sonido !== false, solicitudes: [],
      locales: {
        [n.id]: {
          id: n.id, perfil: perfilDeNegocio(n, m),
          parches: [],
          cupones: Array.isArray(n.cupones) && n.cupones.length ? n.cupones
            : Array.isArray(m.cupones) ? m.cupones.filter(k => k.id !== 'k-bienvenida' || k.creado) : [],
          codigos: Array.isArray(m.codigos) ? m.codigos : [],
          resenas: [],
          mesas: [], reservas: [],
        },
      },
    };
  }

  const nameCache = new Map();
  async function cacheNombres(ids) {
    const faltan = [...new Set(ids.filter(id => id && id !== ME.id && !nameCache.has(id)))];
    if (!faltan.length) return;
    const { data } = await SB().from('perfiles').select('id, nombre').in('id', faltan);
    (data || []).forEach(r => { const [a, b] = String(r.nombre || 'Parcero').split(/\s+/); nameCache.set(r.id, b ? `${a} ${b[0]}.` : a); });
  }
  const persona = id => ({ id, nombre: nameCache.get(id) || 'Parcero', tono: hash(id) % 11 });

  function parcheDeFila(r, miembros, m) {
    const llegadas = (m.llegadas && m.llegadas[r.id]) || {};
    const relampago = !!r.relampago;
    return {
      id: r.id, remoto: true, creado: true, creadoTs: Date.parse(r.creado_en) || NOW(),
      tipo: relampago ? 'relampago' : 'oficial', titulo: r.titulo, organizador: loc().perfil.nombre,
      inicio: Date.parse(r.inicio), dur: (m.durs && m.durs[r.id]) || (relampago ? 60 : 240),
      cupos: r.cupos_max, consumo: r.costo || 0, promo: r.promo || r.descripcion || '', categoria: r.categoria,
      modalidad: r.modalidad === 'paquete' ? 'paquete' : 'mesa', precioPaquete: r.precio_paquete || null,
      lat: r.lat, lng: r.lng, imagen: r.imagen || '', cuponId: (m.cupRel && m.cupRel[r.id]) || null, cancelado: false,
      // La llegada viene de la base (QR, GPS o marcada en la puerta)
      asistentes: miembros.filter(x => x.usuario_id !== ME.id).map(x => ({
        ...persona(x.usuario_id), confirmo: Date.parse(x.creado_en) || NOW(),
        llego: x.checkin ? (Date.parse(x.checkin_en) || llegadas[x.usuario_id] || NOW()) : (llegadas[x.usuario_id] || null),
        metodo: x.checkin_metodo || null,
      })).concat((m.walkins && m.walkins[r.id]) || []),
      chat: [], chatCargado: false,
    };
  }

  async function cargarParchesRemotos() {
    const since = new Date(NOW() - 45 * DAY).toISOString();
    const { data: rows, error } = await SB().from('parches').select('*').eq('creador_id', ME.id).gte('inicio', since).order('inicio');
    if (error) throw error;
    let miembros = [];
    if (rows.length) {
      const mm = await SB().from('parche_miembros').select('*').in('parche_id', rows.map(r => r.id));
      if (mm.error) throw mm.error;
      miembros = mm.data;
    }
    await cacheNombres(miembros.map(x => x.usuario_id));
    const m = meta(), L = loc(), prev = new Map(L.parches.map(p => [p.id, p]));
    let walkinsBase = null;
    if (rows.length) {
      const w = await SB().from('parche_walkins').select('id, parche_id, nombre, llego_en, creado_en').in('parche_id', rows.map(r => r.id));
      if (!w.error) { walkinsBase = w.data || []; walkinsEnServidor = true; }
    }
    L.parches = rows.map(r => {
      const p = parcheDeFila(r, miembros.filter(x => x.parche_id === r.id), m);
      if (walkinsBase) {
        // Los que estaban solo en este navegador se suben una vez
        const locales = p.asistentes.filter(a => a.walkin && !a.walkinId);
        p.asistentes = p.asistentes.filter(a => !a.walkin).concat(walkinsBase.filter(w => w.parche_id === r.id).map(walkinDeFila));
        locales.filter(a => !p.asistentes.some(x => x.walkin && x.nombre === a.nombre)).forEach(a => { p.asistentes.push(a); subirWalkin(p, a); });
      }
      const old = prev.get(r.id);
      if (old) { p.chat = old.chat; p.chatCargado = old.chatCargado; p.asistentes.forEach(a => { const o = old.asistentes.find(x => x.id === a.id); if (o && o.llego && !a.llego && !esUuid(a.id)) a.llego = o.llego; }); }
      return p;
    });
  }

  let walkinsEnServidor = false;
  const walkinDeFila = w => ({ id: 'w' + w.id, walkinId: w.id, nombre: w.nombre, tono: hash(w.nombre) % 11, confirmo: Date.parse(w.creado_en) || NOW(), llego: w.llego_en ? Date.parse(w.llego_en) : null, walkin: true });
  function subirWalkin(p, a) {
    if (!REMOTE() || !p.remoto || a.walkinId) return;
    const id = crypto.randomUUID();
    a.walkinId = id;
    SB().from('parche_walkins').insert({ id, parche_id: p.id, nombre: a.nombre.slice(0, 80), llego_en: a.llego ? new Date(a.llego).toISOString() : null })
      .then(({ error }) => { if (error) { a.walkinId = null; console.warn('[walkin]', error.message); } });
  }
  let recargaT = null;
  function recargarPronto() {
    clearTimeout(recargaT);
    recargaT = setTimeout(async () => {
      try { await cargarParchesRemotos(); syncCanalParches(); render(); } catch (e) { console.warn('[parches]', e.message); }
    }, 300);
  }
  // Escucha solo los parches propios vigentes (máximo 100), no toda la base
  let canalParches = null, firmaCanal = '';
  function syncCanalParches() {
    if (!REMOTE()) return;
    const ids = loc().parches.filter(p => p.remoto && !p.cancelado && fin(p) > NOW() - 6 * HOUR).sort((a, b) => a.inicio - b.inicio).slice(0, 100).map(p => p.id);
    const firma = ids.join(',');
    if (firma === firmaCanal) return;
    firmaCanal = firma;
    if (canalParches) { SB().removeChannel(canalParches); canalParches = null; }
    if (!ids.length) return;
    const f = `parche_id=in.(${firma})`;
    canalParches = SB().channel('mp-negocio-parches-' + ME.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parche_miembros', filter: f }, pl => {
        const pid = (pl.new && pl.new.parche_id) || (pl.old && pl.old.parche_id);
        const p = pid && findParche(pid);
        if (!p) return;
        if (pl.eventType === 'INSERT' && pl.new.usuario_id !== ME.id) {
          cacheNombres([pl.new.usuario_id]).catch(fallo('nombres')).then(() => toast('Nuevo confirmado', `${persona(pl.new.usuario_id).nombre} se sumó a ${p.titulo}.`));
          tone('in');
        }
        recargarPronto();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: f }, async ({ new: r }) => {
        const p = findParche(r.parche_id);
        if (!p || !p.chatCargado || p.chat.some(x => x.id === r.id)) return;
        if (r.autor_id === ME.id) { const mine = p.chat.find(x => x.autor === 'biz' && !x.id && x.texto === r.texto); if (mine) { mine.id = r.id; return; } }
        await cacheNombres([r.autor_id]);
        p.chat.push(msgDeFila(r));
        if (route === 'asistentes' && asisState.id === p.id && asisState.tab === 'chat') renderChat(p, true);
      })
      .subscribe();
  }
  function cerrarCanalesNegocio() {
    canalParches = null; firmaCanal = '';
    try { SB() && SB().removeAllChannels(); } catch (e) { /* ya cerrados */ }
  }

  function setBoot(msg, actions = '') {
    const b = $('#boot');
    if (!b) return;
    b.hidden = false; b.classList.remove('is-out');
    $('#boot-msg').innerHTML = msg;
    const box = $('#boot-actions');
    box.hidden = !actions; box.innerHTML = actions;
  }
  function hideBoot() {
    const b = $('#boot');
    if (!b) return;
    b.classList.add('is-out');
    setTimeout(() => { b.hidden = true; }, 380);
  }

  // Fallo de una carga en segundo plano: queda en la consola (y en la bitácora si importa)
  const fallo = (nombre, bitacora = false) => e => {
    const m = (e && (e.message || e.hint)) || String(e);
    console.warn(`[${nombre}]`, m);
    if (bitacora && window.MPErrores) window.MPErrores.reportar(`Falló ${nombre}: ${m}`);
  };
  /* ---------- Sin conexión: copia local (solo lectura) y cola de cambios ----------
     La copia sirve para abrir el panel sin señal y consultar la lista en el
     Modo Puerta. Se borra al cerrar sesión (limpiarLocal). */
  let SOLO_LECTURA = false, copiaT = null;
  const COPIA_MAX = 7 * DAY;
  const llaveCopia = () => 'mp_business_copia_' + (ME && ME.id);
  const llaveCola = () => 'mp_business_cola_' + (ME && ME.id);
  const sinRed = e => navigator.onLine === false || /failed to fetch|fetch failed|network|load failed|timeout|aborted/i.test(String((e && (e.message || e.details)) || e || ''));
  function guardarCopia() {
    if (!REMOTE() || SOLO_LECTURA || !S || !ME) return;
    try {
      const copia = JSON.parse(JSON.stringify(S));
      // El chat no se guarda: solo lo necesario para consultar
      for (const L of Object.values(copia.locales || {})) for (const p of L.parches || []) { p.chat = []; p.chatCargado = false; }
      localStorage.setItem(llaveCopia(), JSON.stringify({ v: 1, ts: Date.now(), S: copia }));
    } catch (e) { /* sin espacio: no hay copia, el panel sigue igual */ }
  }
  function programarCopia() { clearTimeout(copiaT); copiaT = setTimeout(guardarCopia, 1500); }
  function abrirCopia() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(llaveCopia()) || 'null'); } catch (e) { c = null; }
    if (!c || c.v !== 1 || !c.S || !c.S.locales || !c.S.locales[c.S.actual] || !(Date.now() - c.ts < COPIA_MAX)) return false;
    S = c.S; SOLO_LECTURA = true;
    document.body.classList.add('is-solo-lectura');
    const hora = new Date(c.ts).toLocaleString('es-CO', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    MPUtil.barra('mp-sin-red', `Sin conexión · solo lectura (datos del ${hora})`, 'Reintentar', () => location.reload());
    window.addEventListener('online', () => MPUtil.barra('mp-sin-red', 'Volvió la conexión', 'Recargar', () => location.reload()));
    return true;
  }
  const leerCola = () => { try { const c = JSON.parse(localStorage.getItem(llaveCola()) || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } };
  const guardarCola = c => { try { if (c.length) localStorage.setItem(llaveCola(), JSON.stringify(c)); else localStorage.removeItem(llaveCola()); } catch (e) { /* nada */ } };
  function pintarCola() {
    const n = leerCola().length;
    MPUtil.barra('mp-cola', n ? `${n} ${n === 1 ? 'llegada por enviar' : 'llegadas por enviar'} cuando vuelva la señal` : '', SOLO_LECTURA ? '' : 'Enviar ahora', () => vaciarCola());
  }
  function encolar(accion) {
    const antes = leerCola().length;
    guardarCola(MPUtil.colaAgregar(leerCola(), { ...accion, ts: Date.now() }));
    if (!antes) toast('Sin conexión', 'Lo marcado queda guardado en este celular y se envía solo cuando vuelva la señal.', { error: true });
    pintarCola();
  }
  // Devuelve el error (o null si salió bien)
  const enviarAccion = x => Promise.resolve(x.tipo === 'walkin'
    ? SB().from('parche_walkins').update({ llego_en: x.llego }).eq('id', x.id)
    : SB().rpc('organizador_checkin', { p_parche: x.parche, p_usuario: x.usuario, p_llego: x.llego })
  ).then(r => (r && r.error) || null, e => e || new Error('network'));
  let vaciando = false;
  async function vaciarCola() {
    if (vaciando || SOLO_LECTURA || !REMOTE() || navigator.onLine === false) return;
    vaciando = true;
    let enviados = 0, rechazados = 0;
    try {
      for (const x of leerCola()) {
        const error = await enviarAccion(x);
        if (error && sinRed(error)) break; // sigue sin señal: se intenta después
        guardarCola(leerCola().filter(y => y.clave !== x.clave));
        if (error) { rechazados++; console.warn('[cola]', error.message); } else enviados++;
      }
    } finally { vaciando = false; pintarCola(); }
    if (enviados) toast('Llegadas enviadas', `${enviados} ${enviados === 1 ? 'cambio guardado' : 'cambios guardados'} en la nube.`);
    if (rechazados) toast('Algunas llegadas no se guardaron', `${rechazados} ${rechazados === 1 ? 'cambio fue rechazado' : 'cambios fueron rechazados'} por el servidor. Revisa la lista.`, { error: true });
  }

  async function bootRemoto() {
    const sb = SB();
    if (!sb) { setBoot('No pudimos conectar con el servidor. Revisa tu internet.', '<button class="btn primary" data-recargar>Reintentar</button><a class="btn" href="empresa-dashboard.html?demo=1">Ver el panel de ejemplo</a>'); return false; }
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* sin sesión */ }
    if (!session) { location.replace('empresa.html#entrar'); return false; }
    ME = session.user;
    const cuenta = window.MPSeguro ? await window.MPSeguro.tipoCuenta(sb, ME) : { tipo: 'persona' };
    if (cuenta.tipo === 'admin') { location.replace('admin.html'); return false; }
    if (cuenta.tipo !== 'negocio') {
      setBoot('<b>Esta es una cuenta personal.</b><br>El panel de negocios es para cuentas de negocio. Crea una aparte con el correo de tu local.',
        '<a class="btn primary" href="dashboard.html">Ir a mi radar</a><a class="btn" href="empresa.html">Crear cuenta de negocio</a>');
      ME = null; return false;
    }
    KEY = 'mp_business_v3_' + ME.id;
    setBoot('Cargando tu negocio…');
    const { data: n, error } = await sb.from('negocios').select('*').eq('id', ME.id).maybeSingle();
    if (error && sinRed(error) && abrirCopia()) return true;
    if (error) {
      const sql = /PGRST205|42P01|Could not find the table/i.test(`${error.code} ${error.message}`);
      setBoot(sql ? 'Falta activar las cuentas de negocio en la base de datos. Corre la migración <code>20261027120000_cuentas_negocio.sql</code> en Supabase y recarga.' : `No pudimos cargar tu negocio. ${esc(error.message)}`,
        '<button class="btn primary" data-recargar>Reintentar</button><button class="btn" data-action="logout">Cerrar sesión</button>');
      return false;
    }
    if (!n) {
      setBoot('<b>Tu cuenta no tiene un negocio registrado.</b><br>Puede que la creaste antes de activar las cuentas de negocio. Escríbenos y lo resolvemos hoy.',
        '<a class="btn primary" href="mailto:modoparcheoficial@gmail.com?subject=Mi%20cuenta%20de%20negocio">Escribir al equipo</a><button class="btn" data-action="logout">Cerrar sesión</button>');
      return false;
    }
    S = cuentaNueva(n);
    ultimoSync = JSON.stringify({ horarios: S.locales[n.id].perfil.horarios || null, cupones: S.locales[n.id].cupones });
    if (!horariosValidos(n.horarios) && S.locales[n.id].perfil.horarios) ultimoSync = null; // horarios viejos del navegador: se suben a la base
    try { await cargarParchesRemotos(); }
    catch (err) {
      if (sinRed(err) && abrirCopia()) return true;
      setBoot(`No pudimos cargar tus parches. ${esc(err.message || '')}`, '<button class="btn primary" data-recargar>Reintentar</button>'); return false; }
    try { await cargarMesas(); } catch (e) { /* Modo Mesa todavía no activo */ }
    try { await cargarCuponesRemotos(); } catch (e) { console.warn('[cupones]', e.message); }

    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { cerrarCanalesNegocio(); limpiarLocal(); location.replace('empresa.html#entrar'); } });
    // En vivo: cuando alguien confirma o se sale de uno de tus parches
    syncCanalParches();
    window.addEventListener('pagehide', e => { if (!e.persisted) cerrarCanalesNegocio(); });
    window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
    // Se cierra con removeAllChannels() en cerrarCanalesNegocio
    sb.channel('mp-negocio-' + ME.id)
      // Modo Mesa: reservas nuevas y cancelaciones en vivo
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_reservas', filter: `negocio_id=eq.${ME.id}` }, async pl => {
        const r = pl.new;
        if (!r || !r.id) return;
        await cacheNombres([r.usuario_id]);
        const L = loc(), fila = reservaDeFila(r), i = (L.reservas || []).findIndex(x => x.id === r.id);
        const antes = i >= 0 ? L.reservas[i].estado : null;
        if (i >= 0) L.reservas[i] = fila; else L.reservas = (L.reservas || []).concat([fila]);
        if (pl.eventType === 'INSERT') { toast('Nueva mesa reservada', `${fila.persona.nombre} llega con ${fila.personas} personas ${fmtCuando(fila.llegada).toLowerCase()}.`); tone('in'); }
        else if (fila.estado === 'cancelada' && antes !== 'cancelada') toast('Cancelaron una mesa', `${fila.persona.nombre} (${fila.codigo}) ya no va.`, { error: true });
        renderShell();
        if (route === 'mesa') renderMesa();
      })
      // Pagos: el plan sube apenas Wompi confirma
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pagos', filter: `negocio_id=eq.${ME.id}` }, async ({ new: g }) => {
        if (!g || g.estado !== 'APPROVED') return;
        await recargarNegocio();
        cobrosCargados = 0; cargarCobros(true);
        if (!pagosAvisados.has(g.referencia)) { pagosAvisados.add(g.referencia); toast('Pago aprobado', 'Ya quedó registrado en tu estado de cuenta.'); }
        render();
      })
      .subscribe();
    // Copia para abrir sin señal y envío de lo que quedó pendiente
    guardarCopia();
    window.addEventListener('online', () => vaciarCola());
    vaciarCola();
    pintarCola();
    return true;
  }

  const msgDeFila = r => r.tipo !== 'user'
    ? { id: r.id, tipo: 'sys', texto: r.texto, ts: Date.parse(r.creado_en) }
    : { id: r.id, autor: r.autor_id === ME.id ? 'biz' : persona(r.autor_id), texto: r.texto, ts: Date.parse(r.creado_en) };
  async function cargarChat(p) {
    const { data, error } = await SB().from('mensajes').select('*').eq('parche_id', p.id).order('creado_en').limit(200);
    if (error) { toast('No cargó el chat', error.message, { error: true }); return; }
    await cacheNombres(data.map(r => r.autor_id));
    p.chat = data.map(msgDeFila);
    p.chatCargado = true;
    if (route === 'asistentes' && asisState.id === p.id) renderChat(p);
  }

  // Foto del parche: se reduce en el navegador antes de subirla
  async function prepararFoto(file, max = 1400) {
    let src, url = null;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      url = URL.createObjectURL(file);
      try { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
      catch (err) { URL.revokeObjectURL(url); throw err; }
    }
    const k = Math.min(1, max / Math.max(src.width, src.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    try { cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); }
    finally {
      // Libera la foto original (puede pesar decenas de MB en memoria)
      if (src && typeof src.close === 'function') src.close();
      if (url) URL.revokeObjectURL(url);
    }
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.84));
    return { blob, dataUrl: cv.toDataURL('image/jpeg', DEMO ? 0.72 : 0.84) };
  }
  async function subirFoto(blob) {
    const path = `${ME.id}/parche-${Date.now()}.jpg`;
    const { error } = await SB().storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return SB().storage.from('fotos').getPublicUrl(path).data.publicUrl;
  }
  function errorDB(err) {
    const m = String((err && (err.message || err.hint)) || '');
    // Las reglas de la base mandan un código (DEMASIADO_RAPIDO, BLOQUEADO…) y la explicación en hint
    const codigo = /^[A-Z][A-Z0-9_]{2,}$/.test(m.trim());
    if (/DEMASIADO_RAPIDO/.test(m)) return ['Vas muy rápido', (err && err.hint) || 'Espera un momento e intenta de nuevo.'];
    if (/LIMITE_PLAN/.test(m)) return ['Llegaste al límite de tu plan', 'Parche básico incluye 2 parches al mes. Cambia a Parche Villavo en Perfil y plan.'];
    if (/fetch|network/i.test(m)) return ['Sin conexión', 'Revisa tu internet e intenta de nuevo.'];
    if (/titulo/i.test(m)) return ['Revisa el nombre', 'El nombre debe tener entre 5 y 60 caracteres.'];
    if (/cupos/i.test(m)) return ['Revisa los cupos', 'En el radar los parches van de 2 a 60 cupos.'];
    if (codigo && err && err.hint) return ['No se guardó', err.hint];
    return ['No se guardó', m || 'Intenta de nuevo en unos segundos.'];
  }
  const parchesDelMes = () => loc().parches.filter(p => p.creado && p.creadoTs >= new Date(new Date(NOW()).getFullYear(), new Date(NOW()).getMonth(), 1).getTime()).length;
  // Un plan pago vencido cuenta como básico (igual que en la base)
  const limitePlan = () => (PLANES[loc().perfil.plan] || PLANES.basico).limite;

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

  // Horario de un día (null si el dueño todavía no puso horarios)
  const hDia = (P, d) => (P.horarios ? P.horarios[d] : null);
  function ventana(P, ts = NOW()) {
    if (!P.horarios) return { abierto: false, abre: null, sinHorario: true };
    for (const off of [0, -1]) {
      const base = day0(ts) + off * DAY, h = hDia(P, new Date(base).getDay());
      if (!h || !h.abierto) continue;
      const a = at(base, h.open); let c = at(base, h.close); if (c <= a) c += DAY;
      if (ts >= a && ts < c) return { abierto: true, hasta: c };
    }
    const h = hDia(P, new Date(ts).getDay());
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
  const ROUTES = ['resumen', 'parches', 'cupones', 'mesa', 'asistentes', 'mapa', 'perfil'];
  let route = 'resumen';
  function go() {
    const r = (location.hash || '#resumen').slice(1).split('/')[0];
    route = ROUTES.includes(r) ? r : 'resumen';
    syncGeoNegocio();
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
    if (route === 'mesa') renderMesa();
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
    ajustarReloj();
    const L = loc(), P = L.perfil;
    $('#local-logo-side').className = `local-logo mono-logo--${P.tema}`;
    $('#local-logo-side').textContent = P.corto;
    $('#local-name-side').textContent = P.nombre;
    $('#local-cat-side').textContent = `${P.categoria} · ${P.barrio}`;
    const plan = PLANES[P.plan] || PLANES.villavo;
    $('#plan-badge').textContent = plan.nombre.replace('Parche ', '');
    $('#plan-badge').className = 'plan-badge plan-badge--' + (P.plan || 'villavo');
    $('#demo-chip').hidden = !DEMO;

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
      : w.sinHorario ? 'Pon tus horarios' : w.abierto ? `Abierto · cierra ${fmtHora(w.hasta)}` : w.abre ? `Cerrado · abre ${fmtHora(w.abre)}` : 'Cerrado hoy';
    const cm = $('#count-mesa');
    if (cm) { const pm = (L.reservas || []).filter(r => r.estado === 'pendiente' && r.llegada > NOW()).length; cm.hidden = !pm; cm.textContent = pm; cm.setAttribute('aria-label', `${pm} mesas por confirmar`); }
    chip.title = $('#live-text').textContent;

    const sb = $('#sound-btn');
    sb.setAttribute('aria-pressed', String(S.sonido));
    sb.innerHTML = ic(S.sonido ? 'i-sound' : 'i-mute');
  }

  function closeMenus() {
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
  const siteBase = () => /^https?:/.test(location.protocol) ? location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') : 'https://modoparche.vercel.app/';
  const localURL = L => `${siteBase()}dashboard?local=${REMOTE() && ME ? ME.id : L.perfil.idMP}`;

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
    const P = L.perfil, prom = promedio(L), w = ventana(P), h = hDia(P, new Date(NOW()).getDay());
    const hoyTxt = !P.horarios ? 'Horario por definir' : h && h.abierto ? `Hoy abre de ${horaTxt(h.open)} a ${horaTxt(h.close)}` : 'Hoy no abre';
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

  let resumenAl = 0;
  function renderResumen(entering) {
    // Al abrir Resumen se traen cobros y reseñas recientes (máximo cada 30 s)
    if (entering && REMOTE() && NOW() - resumenAl > 30000) {
      resumenAl = NOW();
      cargarCobros().catch(fallo('cobros'));
      cargarResenasReales().then(() => { if (route === 'resumen') renderShell(); }).catch(fallo('reseñas'));
    }
    const L = loc(), P = L.perfil, hoy = deHoy();
    const hr = new Date(NOW()).getHours();
    const saludo = hr < 12 && hr >= 5 ? 'Buenos días' : hr < 19 && hr >= 12 ? 'Buenas tardes' : 'Buenas noches';
    const fechaHoy = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(NOW()));
    $('#hello-kicker').textContent = `${saludo} · ${fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}`;
    $('#hello-local').textContent = P.nombre;
    renderSetup();
    const hola = '';
    const conf = hoy.reduce((s, p) => s + confirmados(p), 0), inn = hoy.reduce((s, p) => s + checkins(p), 0);
    const pend = pendientes();
    $('#resumen-sub').innerHTML = hola + (hoy.length
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
  // Reloj de cada segundo: solo mientras haya un parche relámpago en vivo (ahorra batería)
  let relojT = null;
  function ajustarReloj() {
    const hace = !!(S && relampagoVivo());
    if (hace && !relojT) relojT = setInterval(() => { if (!document.hidden) tickCountdown(); ajustarReloj(); }, 1000);
    else if (!hace && relojT) { clearInterval(relojT); relojT = null; tickCountdown(); }
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
          ${p.imagen ? `<div class="pcover"><img src="${esc(p.imagen)}" alt="Foto de ${esc(p.titulo)}" loading="lazy"><span>Se ve en el radar</span></div>` : ''}
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
      ${activo(p) && p.tipo !== 'comunidad' ? `<button data-action="qr-parche" data-id="${id}" role="menuitem">${ic('i-qr')} QR de llegada</button>` : ''}
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
  let cuponesEnServidor = false;
  const deServidor = x => ({ codigo: x.codigo, cuponId: x.cuponId, cupNombre: x.cupNombre, cupBen: x.cupBen, persona: x.persona || 'Cliente', usuarioId: x.usuarioId || null, parcheId: x.parcheId || null, emitido: Date.parse(x.emitido), vence: Date.parse(x.vence), canjeado: x.canjeado ? Date.parse(x.canjeado) : null, auto: true });
  function ponerCodigo(x) {
    const L = loc(), c = deServidor(x), i = L.codigos.findIndex(y => y.codigo === c.codigo);
    if (i >= 0) { L.codigos[i] = c; return c; }
    L.codigos.push(c);
    return c;
  }
  // Los códigos viven en la base; los que estaban solo en este navegador se suben una vez
  async function cargarCuponesRemotos() {
    const L = loc(), marca = 'mp_cupones_subidos_' + ME.id;
    let subidos = false;
    try { subidos = !!localStorage.getItem(marca); } catch (e) { /* sin almacenamiento */ }
    if (!subidos && L.codigos.length) {
      const { error } = await SB().rpc('importar_cupones_locales', { p_lista: L.codigos.slice(0, 500) });
      if (error) { if (/importar_cupones|PGRST202/.test(error.message || '')) return; throw error; }
    }
    const { data, error } = await SB().rpc('cupones_del_negocio');
    if (error) { if (/cupones_del_negocio|PGRST202/.test(error.message || '')) return; throw error; }
    L.codigos = (data || []).map(deServidor);
    cuponesEnServidor = true;
    try { localStorage.setItem(marca, '1'); } catch (e) { /* nada */ }
  }
  async function validar(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    const out = $('#validator-result');
    clearTimeout(undoTimer);
    if (!code) { out.innerHTML = STAGE_HINT; $('#code-input').focus(); return; }
    const L = loc();
    let c = L.codigos.find(x => x.codigo === code);
    const bad = (title, html, kicker = 'No se puede canjear') => {
      out.innerHTML = vtHTML('bad', { kicker, title, html, stubIc: 'i-close', stub: 'Rechazado' });
      tone('bad');
      const vt = $('.vt', out); vt.classList.remove('shake'); void vt.offsetWidth; vt.classList.add('shake');
      $('#code-input').select();
    };
    let enServidor = false;
    if (REMOTE() && cuponesEnServidor) {
      const k0 = c && cupon(c.cuponId);
      if (k0 && k0.estado === 'pausado' && !c.canjeado) return bad('El cupón está pausado', `Actívalo en <b>Tus cupones</b> si quieres aceptar ${esc(c.cupNombre)} hoy.`, 'Pausado por ti');
      let res;
      try { const r = await SB().rpc('canjear_cupon', { p_codigo: code }); if (r.error) throw r.error; res = r.data; }
      catch (e) { return bad('No pudimos validar', 'Revisa tu conexión e intenta de nuevo. El cupón no se canjeó.', 'Sin validar'); }
      if (res.cupon && res.codigo !== 'OTRO_LOCAL') c = ponerCodigo(res.cupon);
      if (!res.ok) {
        if (res.codigo === 'OTRO_LOCAL') return bad('Este código es de otro local', `<span class="code">${esc(code)}</span> es de otro negocio. Cada local solo canjea sus propios cupones.`);
        if (res.codigo === 'YA_CANJEADO') return bad('Este código ya se usó', `Lo canjeó ${esc(c.persona)} ${esc(fmtCuando(c.canjeado).toLowerCase())} Beneficio: ${esc(c.cupBen)}.`);
        if (res.codigo === 'VENCIDO') return bad('Este código venció', `Valía hasta ${esc(fmtCuando(c.vence).toLowerCase())} ${esc(c.persona)} puede ganar otro en tu próximo parche.`);
        return bad(`${code} no existe`, 'Revisa que el parcero te muestre el código completo, con el guion. Si tiene QR, escanéalo.');
      }
      enServidor = true;
    }
    if (!enServidor) {
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
    }
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
  async function deshacerCanje(code) {
    const c = loc().codigos.find(x => x.codigo === code);
    if (!c || !c.canjeado) return;
    if (REMOTE() && cuponesEnServidor) {
      const { data, error } = await SB().rpc('deshacer_canje', { p_codigo: code });
      if (error || !data || !data.ok) { toast('No se pudo deshacer', 'Ese canje ya no se puede revertir.', { error: true }); return; }
    }
    c.canjeado = null; lastCanje = null; clearTimeout(undoTimer);
    save();
    $('#validator-result').innerHTML = STAGE_HINT;
    toast('Canje deshecho', `${c.codigo} vuelve a estar por canjear.`);
    renderShell(); renderCupones();
  }

  function nuevoCodigo(prefijo) {
    const usados = new Set(allLocales().flatMap(L => L.codigos.map(c => c.codigo)));
    let codigo;
    const azar = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return 1000 + (b[0] % 9000); };
    do { codigo = `${prefijo}-${azar()}`; } while (usados.has(codigo));
    return codigo;
  }
  // Entrega un cupón a un parcero si el local lo tiene activo y le quedan
  function entregar(k, persona, p, usuario = null) {
    if (!k) return null;
    if (k.estado !== 'activo') return { skip: `${k.nombre} está pausado` };
    if (agotado(k)) return { skip: `${k.nombre} está agotado` };
    if (loc().codigos.some(c => c.cuponId === k.id && c.persona === persona && c.parcheId === p.id)) return null;
    if (REMOTE() && cuponesEnServidor) {
      // El código lo genera la base: es aleatorio y sirve en cualquier dispositivo
      return { pend: SB().rpc('emitir_cupon', {
        p_parche: p.remoto ? p.id : null, p_usuario: p.remoto && usuario && esUuid(usuario) ? usuario : null, // la persona va siempre con su parche p_cupon: k.id, p_persona: persona,
        p_nombre: k.nombre, p_beneficio: k.beneficio, p_prefijo: k.prefijo, p_vence: new Date(NOW() + k.vigencia * DAY).toISOString(),
      }).then(({ data, error }) => {
        if (error) return { skip: `${k.nombre}: no se pudo entregar` };
        if (!data.ok) return { skip: data.codigo === 'DEMASIADOS' ? `${k.nombre}: ${data.hint || 'espera un rato'}` : `${k.nombre} está ${data.codigo === 'PAUSADO' ? 'pausado' : 'agotado'}` };
        const c = ponerCodigo(data.cupon);
        renderShell();
        return data.nuevo ? { c } : null;
      }) };
    }
    const c = { codigo: nuevoCodigo(k.prefijo), cuponId: k.id, cupNombre: k.nombre, cupBen: k.beneficio, persona, parcheId: p.id, emitido: NOW(), vence: NOW() + k.vigencia * DAY, canjeado: null, auto: true };
    loc().codigos.push(c);
    return { c };
  }

  /* ---------- Escáner de QR con la cámara ---------- */
  let lectorCupon = null;
  function openScan() {
    const dlg = $('#dlg-scan'), hint = $('#scan-hint');
    if (!window.MPCheckin || !navigator.mediaDevices?.getUserMedia) {
      toast('No pudimos abrir la cámara', 'Escribe el código a mano.', { error: true });
      $('#code-input').focus();
      return;
    }
    hint.textContent = 'Apunta la cámara al QR del cupón.';
    $('#scan-reader').innerHTML = '';
    dlg.showModal();
    lectorCupon = window.MPCheckin.escanear('scan-reader', r => {
      lectorCupon = null;
      closeScan();
      $('#code-input').value = r.codigo;
      validar(r.codigo);
    }, (e, sigue) => { if (!sigue) hint.textContent = e.message; }, raw => {
      const c = String(raw || '').trim().toUpperCase();
      return /^[A-Z0-9]{1,8}-[A-Z0-9]{4,12}$/.test(c) ? { codigo: c } : null;
    });
  }
  function closeScan() {
    if (lectorCupon) { lectorCupon.detener(); lectorCupon = null; }
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
        <span class="person-acts">
          ${puede ? (a.llego ? `<button class="btn ghost btn--sm" data-action="checkout" data-pid="${p.id}" data-uid="${a.id}">Deshacer</button>` : `<button class="btn btn--sm" data-action="checkin" data-pid="${p.id}" data-uid="${a.id}">${ic('i-check')}Marcar llegada</button>`) : ''}
          ${!a.llego ? `<button class="btn ghost btn--sm person-kick" data-action="sacar-asistente" data-pid="${p.id}" data-uid="${a.id}" title="Sacar del parche" aria-label="Sacar a ${esc(a.nombre)} del parche">${ic('i-x')}Sacar</button>` : ''}
        </span>
      </li>`).join('') || '<li><p class="empty">Nadie ha confirmado todavía. Comparte el afiche del parche.</p></li>';
  }

  function renderChat(p, nuevo = false) {
    const box = $('#chat-msgs'), P = loc().perfil;
    if (p.remoto && !p.chatCargado) {
      box.innerHTML = '<p class="msg msg--sys">Cargando el chat del grupo…</p>';
      if (!p.chatCargando) { p.chatCargando = true; cargarChat(p).finally(() => { p.chatCargando = false; }); }
      return;
    }
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
    marcarEnBase(p, a, true);
    const L = loc(), out = [];
    // La bienvenida solo se entrega con la llegada validada, y una vez por persona
    const primeraVez = k => k.regla === 'bienvenida' && !L.codigos.some(c => c.cuponId === k.id && c.persona === a.nombre);
    const reglasQueAplican = L.cupones.filter(k => primeraVez(k) || k.regla === 'checkin' || (k.regla === 'temprano' && NOW() <= p.inicio + HOUR) || (k.regla === 'relampago' && p.tipo === 'relampago'));
    const extra = p.tipo === 'relampago' && p.cuponId ? L.cupones.find(k => k.id === p.cuponId) : null;
    if (extra && !reglasQueAplican.includes(extra)) reglasQueAplican.push(extra);
    for (const k of reglasQueAplican) { const r = entregar(k, a.nombre, p, a.id); if (r) out.push(r); }
    save();
    return out;
  }
  function checkOut(p, a) {
    const antes = { llego: a.llego, metodo: a.metodo };
    a.llego = null; a.metodo = null;
    marcarEnBase(p, a, false, antes);
    const L = loc();
    const retirar = c => c.auto && !c.canjeado && c.parcheId === p.id && c.persona === a.nombre && c.emitido >= p.inicio - 2 * HOUR;
    if (REMOTE() && cuponesEnServidor) L.codigos.filter(retirar).forEach(c => SB().rpc('anular_cupon', { p_codigo: c.codigo }).then(() => {}, () => {}));
    L.codigos = L.codigos.filter(c => !retirar(c));
    save();
  }
  async function avisarCupones(nombre, res0) {
    const res = (await Promise.all(res0.map(r => (r && r.pend ? r.pend : r)))).filter(Boolean);
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
    // Al cerrar, el foco vuelve a donde estaba; mientras tanto el resto del panel no recibe el Tab
    if (dm.hidden) doorFoco = document.activeElement;
    dm.hidden = false; dm.classList.remove('is-open'); void dm.offsetWidth; dm.classList.add('is-open');
    document.body.classList.add('no-scroll');
    const app = $('#app'); if (app) app.inert = true;
    renderDoor();
    setTimeout(() => $('#door-search').focus(), 60);
  }
  let doorFoco = null;
  function closeDoor() {
    $('#door-mode').hidden = true;
    document.body.classList.remove('no-scroll');
    const app = $('#app'); if (app) app.inert = false;
    render();
    const volver = doorFoco && document.contains(doorFoco) && !doorFoco.closest('[hidden]') ? doorFoco : $('[data-action="modo-puerta"]');
    doorFoco = null;
    if (volver && volver.focus) volver.focus({ preventScroll: true });
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
      ? `<li><div class="door-person is-in ${a.id === doorState.justIn ? 'just-in' : ''}">${avatar(a)}<span><b>${esc(a.nombre)}</b><small>${a.metodo === 'gps' ? 'Avisó por GPS a las ' + fmtHora(a.llego) : 'Adentro desde las ' + fmtHora(a.llego)}</small></span>${botonPuerta(a)}</div></li>`
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
  // El GPS del cliente no cobra hasta que el local lo vea; el QR ya es una llegada firme
  function botonPuerta(a) {
    if (a.metodo === 'gps') return `<button class="door-go" data-action="door-confirmar" data-uid="${a.id}">${ic('i-check')}Confirmar</button>`;
    if (a.metodo === 'qr') return `<span class="door-go">${ic('i-check')}Con QR</span>`;
    return `<button class="door-go" data-action="door-out" data-uid="${a.id}">${ic('i-undo')}Deshacer</button>`;
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
    subirWalkin(p, a);
    if (lleno(p)) for (const k of loc().cupones.filter(x => x.regla === 'lleno')) { const r = entregar(k, a.nombre, p, a.id); if (r) res.push(r); }
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
  // Leaflet se descarga solo cuando hace falta un mapa
  let leafletP = null;
  const cargarLeaflet = () => leafletP || (leafletP = new Promise(res => {
    if (window.L) { res(true); return; }
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/src/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = '/src/vendor/leaflet/leaflet.js';
    js.onload = () => res(true); js.onerror = () => { leafletP = null; res(false); };
    document.head.appendChild(js);
  }));
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
    $('#mapa-sub').textContent = `${items.length} ${items.length === 1 ? 'parche tuyo' : 'parches tuyos'} ${timeLabel()} en el mapa. Así los ven los parceros cerca de tu local.`;
    $$('#time-filter [data-time]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === timeState.mode)));
    $('#map-legend').innerHTML = `<span><i class="lg lg--own"></i>${esc(own.perfil.nombre)}</span>${userPos ? '<span><i class="lg lg--me"></i>Tu ubicación</span>' : ''}`;
    $('#maplist-meta').textContent = `${items.length} ${timeLabel()}`;
    $('#map-list').innerHTML = items.length ? items.map(({ p, Lc }) => `<li><button class="row row--btn" data-action="fly" data-local="${Lc.id}">
        <span class="lg ${Lc.id === own.id ? 'lg--own' : 'lg--other'}" aria-hidden="true"></span>
        <span class="row-main"><b>${esc(p.titulo)}</b><small>${esc(Lc.perfil.nombre)} · ${esc(fmtCuando(p.inicio))}</small></span>
        <span class="row-end num">${confirmados(p)}<small>de ${p.cupos}</small></span></button></li>`).join('')
      : `<li><p class="empty">No hay parches ${timeLabel()}. Es buen momento para un relámpago.</p></li>`;

    if (watchId === null) startGeo(false);
    setTimeout(async () => {
      if (!(await cargarLeaflet())) return;
      if (!map) {
        map = L.map('map', { zoomControl: true }).setView([own.perfil.lat, own.perfil.lng], 14);
        tiles().addTo(map);
        layer = L.layerGroup().addTo(map);
        if (window.MPMapa) window.MPMapa.buscador(map, { placeholder: 'Busca un lugar o dirección' });
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
  // El GPS solo sigue activo con el mapa abierto y la pestaña a la vista
  function syncGeoNegocio() {
    if (watchId !== null && (route !== 'mapa' || document.hidden)) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  }
  document.addEventListener('visibilitychange', () => {
    syncGeoNegocio();
    if (!document.hidden && route === 'mapa' && watchId === null && map) startGeo(false);
  });
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
      ['WhatsApp', esc(P.tel || 'Sin número')], ['NIT', `<span class="code">${esc(P.nit)}</span>`], ['ID Modo Parche', `<span class="code">${esc(P.idMP)}</span>`],
      ...(P.responsable ? [['Responsable', esc(P.responsable)]] : []),
      ['Aliado desde', esc(`${new Date(P.desde).getDate()} de ${new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(P.desde)} de ${new Date(P.desde).getFullYear()}`)],
      ['Descripción', esc(P.desc)],
    ];
    $('#facts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('#horario-hoy').textContent = w.sinHorario ? 'Todavía no los pones' : w.abierto ? `Abierto ahora · cierra ${fmtHora(w.hasta)}` : w.abre ? `Cerrado · abre ${fmtHora(w.abre)}` : 'Cerrado hoy';
    $('#hours').innerHTML = !P.horarios
      ? `<li class="hours-empty"><p class="empty">Pon los días y horas en que abres. Así los parceros saben cuándo caer y el panel te avisa si lanzas algo con el local cerrado.<button class="btn primary btn--sm" data-action="editar-horarios">${ic('i-clock')}Poner mis horarios</button></p></li>`
      : [1, 2, 3, 4, 5, 6, 0].map(d => {
        const h = hDia(P, d);
        return `<li class="${d === today ? 'is-today' : ''}"><b>${DIAS[d]}${d === today ? ' (hoy)' : ''}</b><span>${h.abierto ? `${horaTxt(h.open)} a ${horaTxt(h.close)}` : 'Cerrado'}</span></li>`;
      }).join('');
    $('#ubic-meta').textContent = `${P.direccion} · ${P.lat.toFixed(4)}, ${P.lng.toFixed(4)}`;
    setTimeout(async () => {
      if (!(await cargarLeaflet())) return;
      if (!mapPerfil) {
        mapPerfil = L.map('map-perfil', { scrollWheelZoom: false }).setView([P.lat, P.lng], 15);
        tiles().addTo(mapPerfil);
        perfilMarker = L.marker([P.lat, P.lng], { icon: bizIcon(Lc), keyboard: false }).addTo(mapPerfil);
        // Tocar el mapa (o buscar la dirección) mueve el pin del local
        mapPerfil.on('click', e => moverLocal(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)));
        if (window.MPMapa) window.MPMapa.buscador(mapPerfil, {
          placeholder: 'Busca la dirección de tu local',
          onElegir: r => moverLocal(+(+r.lat).toFixed(6), +(+r.lng).toFixed(6)),
        });
      }
      mapPerfil.invalidateSize();
      perfilMarker.setLatLng([P.lat, P.lng]).setIcon(bizIcon(Lc));
      mapPerfil.setView([P.lat, P.lng], 15);
    }, 40);
    const prom = promedio(Lc);
    $('#resenas-meta').textContent = Lc.resenas.length ? `${dec1(prom)} de 5 · ${Lc.resenas.length} ${Lc.resenas.length === 1 ? 'reseña' : 'reseñas'}` : 'Sin reseñas aún';
    $('#reviews').innerHTML = [...Lc.resenas].sort((a, b) => b.fecha - a.fecha).map(r => `<li class="review"><div class="review-top">${stars(r.estrellas)}<b>${esc(r.autor)}</b><small>${esc(fmtDia(r.fecha))}</small></div><p>${esc(r.texto)}</p><p class="on">En ${esc(r.parche)}</p></li>`).join('')
      || '<li><p class="empty">Las reseñas aparecen cuando los parceros califican tus parches.</p></li>';
    renderPlan();
    cargarCobros().catch(fallo('cobros'));
    if (!qrLocal) cargarQRLocal().catch(fallo('QR del local'));
    if (!$('#referidos-box').dataset.ok) { $('#referidos-box').dataset.ok = '1'; cargarReferidos().catch(() => { delete $('#referidos-box').dataset.ok; }); }
  }

  function renderPlan() {
    const P = loc().perfil, cur = PLANES[P.plan] ? P.plan : 'basico', lim = limitePlan(), usados = parchesDelMes();
    $('#plan-meta').textContent = lim === Infinity ? 'Parches sin límite' : `${usados} de ${lim} parches este mes`;
    const t = tarifas(cur);
    $('#plan-box').innerHTML = `<div class="plan-now plan-now--${cur}">
        <span class="plan-now-k">Plan actual</span>
        <b>${esc(PLANES[cur].nombre)}</b><span class="plan-now-p">${esc(PLANES[cur].precio)}${cur === 'sedes' && P.sedes > 1 ? ` · ${P.sedes} sedes` : ''}</span>
        ${lim !== Infinity ? `<span class="track" role="img" aria-label="${usados} de ${lim} parches usados"><i class="in" style="width:${clamp(usados / lim, 0, 1) * 100}%"></i></span>` : ''}
        <ul>${PLANES[cur].puntos.map(x => `<li>${ic('i-check')}${esc(x)}</li>`).join('')}</ul>
      </div>
      ${P.planProgramado ? `<p class="hint"><b>Cambio programado:</b> pasas a Parche básico el ${esc(fechaPlan(P.planProgramadoEn))}.</p>` : ''}
      ${P.planPendiente === 'sedes' && cur !== 'sedes' ? '<p class="hint"><b>Varias sedes en revisión:</b> el equipo lo activa cuando confirme tus sedes.</p>' : ''}
      <p class="mini-title">Cambiar de plan</p>
      <div class="plan-switch" role="group" aria-label="Cambiar de plan">${Object.entries(PLANES).map(([k, v]) => `<button class="plan-opt-b ${k === cur ? 'is-on' : ''}" data-action="cambiar-plan" data-plan="${k}" aria-pressed="${k === cur}"><b>${esc(v.nombre)}</b><small>${esc(v.precio)}</small></button>`).join('')}</div>
      <p class="hint">${t.cliente
        ? `Sin mensualidad: pagas <b>${t.pct}%</b> por cada paquete redimido y <b>${money(t.cliente)}</b> por cada persona que llega a tu mesa. Si nadie llega, $0. Todo queda en «Cobros por resultados».`
        : 'Con Parche básico no pagas comisión ni cobro por cliente. Si quieres parches ilimitados y prioridad en el radar, pásate a Parche Villavo: sigues sin mensualidad.'}</p>`;
  }

  /* ---------- Cobros por resultados (mi_cuenta_cobros) ---------- */
  const ESTADOS_LIQ = { pendiente: 'Por pagar', pagada: 'Pagada', sin_cobro: 'Sin cobro', anulada: 'Anulada' };
  const VALIDO_POR = { qr: 'QR del cliente', gps: 'GPS del cliente', organizador: 'marcado en la puerta', local: 'marcado por el local' };
  const fmtPeriodo = iso => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(d); };
  let cobrosCargados = 0;
  function cuentaDemo() {
    const P = loc().perfil, t = tarifas(P.plan), hoy = NOW();
    const fila = (min, tipo, cliente, titulo, personas, base, por) => ({ id: min, tipo, cliente, titulo, personas, base_cop: base, validado_por: por,
      codigo: Math.abs(min * 7919).toString(16).slice(0, 6).toUpperCase(),
      monto_cop: tipo === 'paquete' ? Math.round(base * t.pct / 100) : t.cliente * personas, creado_en: new Date(hoy - min * 60000).toISOString() });
    const detalle = [fila(95, 'mesa', 'Valentina P.', 'Noche de crossover', 1, null, 'qr'), fila(1440, 'reserva', 'Kevin O.', 'Mesa de 6: botella de la casa', 4, null, 'local'),
      fila(2900, 'paquete', 'Mafe P.', 'Cata de café de origen', 1, 35000, 'gps'), fila(4300, 'mesa', 'Andrés F.', 'Noche de crossover', 1, null, 'organizador')];
    const total = detalle.reduce((a, x) => a + x.monto_cop, 0), clientes = detalle.reduce((a, x) => a + x.personas, 0);
    const d0 = new Date(hoy), mesPasado = new Date(d0.getFullYear(), d0.getMonth() - 1, 1);
    return { plan: P.plan, tarifa_cliente: t.cliente, comision_pct: t.pct, en_mora: false, demo: true,
      mes: { periodo: new Date(d0.getFullYear(), d0.getMonth(), 1).toISOString().slice(0, 10), clientes, total, detalle },
      liquidaciones: t.cliente ? [{ id: 1, periodo: mesPasado.toISOString().slice(0, 10), clientes: 31, total: 31 * t.cliente, referencia: 'MP-DEMO-7F3A2C', estado: 'pendiente', vence: new Date(hoy + 9 * DAY).toISOString().slice(0, 10) }] : [] };
  }
  // Botones Actualizar: muestran el logo cargando sin tapar la página (mp-cargando.js)
  const conCarga = (b, f) => (window.MPCargando ? window.MPCargando.con(b, f) : Promise.resolve().then(f)).catch(e => console.warn('[actualizar]', e));
  async function cargarCobros(forzar = false) {
    const box = $('#cobros-box'); if (!box) return;
    if (!forzar && NOW() - cobrosCargados < 30000) return;
    cobrosCargados = NOW();
    let d;
    if (!REMOTE()) d = cuentaDemo();
    else {
      let r;
      try { r = await SB().rpc('mi_cuenta_cobros'); } catch (e) { r = { error: e }; }
      if (r.error) {
        cobrosCargados = 0;
        box.innerHTML = `<p class="meta">${/mi_cuenta_cobros|PGRST202/.test(r.error.message || '') ? 'Falta activar el cobro por resultados en la base de datos (migración 20261118120000_cobro_por_resultados.sql).' : esc(errorDB(r.error).join('. '))}</p>`;
        return;
      }
      d = r.data;
      const pend0 = ((d && d.liquidaciones) || []).filter(l => l.estado === 'pendiente');
      if (d && (!(d.mes && d.mes.detalle && d.mes.detalle.length)) && pend0.length) {
        try {
          const det = await SB().rpc('mi_liquidacion_detalle', { p_id: Number(pend0[0].id) });
          if (det && det.data && Array.isArray(det.data.cobros) && det.data.cobros.length) {
            d.cobros_pendientes = det.data.cobros.map(c => ({
              id: c.id || pend0[0].id,
              cliente: c.cliente || 'Cliente validado',
              personas: Number(c.personas) || 1,
              titulo: c.titulo || `Estado de cuenta de ${fmtPeriodo(pend0[0].periodo)}`,
              creado_en: c.fecha || new Date(pend0[0].periodo + 'T12:00:00').toISOString(),
              validado_por: c.validado_por || 'qr',
              codigo: c.codigo || pend0[0].referencia,
              monto_cop: Number(c.monto) || 0,
              base_cop: Number(c.base) || 0,
              tipo: c.tipo || 'mesa',
              reclamable: false,
            }));
          }
        } catch (_e) { /* detalle opcional */ }
      }
    }
    try { pintarCobros(d); } catch (e) { console.error(e); box.innerHTML = '<p class="meta">No pudimos mostrar tus cobros. Toca «Actualizar».</p>'; }
  }
  function pintarCobros(d) {
    const box = $('#cobros-box'), mes = d.mes || { clientes: 0, total: 0, detalle: [] };
    const liqs = d.liquidaciones || [], pend = liqs.filter(l => l.estado === 'pendiente'), viejas = liqs.filter(l => l.estado !== 'pendiente');
    const tarifa = d.tarifa_cliente ? `${d.comision_pct}% por paquete · ${money(d.tarifa_cliente)} por cliente en mesa` : 'Plan básico: $0 por cliente y 0% de comisión';
    const vencida = l => new Date(l.vence + 'T23:59:59').getTime() < NOW();
    // Si este mes aún va en 0 pero hay clientes en el estado de cuenta pendiente o en parches locales, los mostramos abajo
    let detalleLista = [...(mes.detalle || [])];
    if (!detalleLista.length && Array.isArray(d.cobros_pendientes) && d.cobros_pendientes.length) {
      detalleLista = d.cobros_pendientes;
    }
    if (!detalleLista.length) {
      const llegadosLocal = [];
      for (const p of (loc().parches || [])) {
        for (const a of (p.asistentes || [])) {
          if (a.llego) {
            llegadosLocal.push({
              id: a.id,
              cliente: a.nombre || 'Cliente',
              personas: 1,
              titulo: p.titulo || 'Parche',
              creado_en: new Date(a.llego).toISOString(),
              validado_por: a.metodo || 'organizador',
              codigo: String(p.id).slice(0, 8).toUpperCase(),
              monto_cop: Number(d.tarifa_cliente) || 0,
              tipo: 'mesa',
              reclamable: false,
            });
          }
        }
      }
      if (llegadosLocal.length) detalleLista = llegadosLocal;
      else if (pend.some(l => Number(l.clientes) > 0)) {
        detalleLista = pend.filter(l => Number(l.clientes) > 0).map(l => ({
          id: l.id,
          cliente: `${int(l.clientes)} ${Number(l.clientes) === 1 ? 'cliente validado' : 'clientes validados'}`,
          personas: Number(l.clientes) || 1,
          titulo: `Estado de cuenta de ${fmtPeriodo(l.periodo)}`,
          creado_en: new Date(String(l.periodo).slice(0, 10) + 'T12:00:00').toISOString(),
          validado_por: 'qr',
          codigo: l.referencia,
          monto_cop: Number(l.total) || 0,
          tipo: 'mesa',
          reclamable: false,
        }));
      }
    }
    const resumenTotal = Number(mes.total) || (pend[0] ? Number(pend[0].total) || 0 : 0);
    const resumenClientes = Number(mes.clientes) || (pend[0] ? Number(pend[0].clientes) || 0 : detalleLista.reduce((s, c) => s + (Number(c.personas) || 1), 0));
    const resumenPeriodo = Number(mes.clientes) || !pend[0] ? (mes.periodo || new Date(NOW()).toISOString()) : pend[0].periodo;
    box.innerHTML = `
      ${d.en_mora ? `<div class="cobro-alerta">${ic('i-alert')}<div><b>Tienes un pago vencido.</b><p>Mientras tanto tus parches no salen en el radar. Págalo abajo y avísanos para reactivarlos.</p></div></div>` : ''}
      <div class="cobro-resumen">
        <div><span>${Number(mes.clientes) || !pend[0] ? 'Este mes' : 'Por pagar'} · ${esc(fmtPeriodo(resumenPeriodo))}</span><b class="num">${money(resumenTotal)}</b><small>${int(resumenClientes)} ${resumenClientes === 1 ? 'cliente validado' : 'clientes validados'}</small></div>
        <div><span>Tu tarifa</span><b class="cobro-tarifa">${esc(tarifa)}</b><small>Sin mensualidad. Si nadie llega, $0.</small></div>
      </div>
      ${Number(d.credito) > 0 ? `<p class="liq-ok">${ic('i-gift')}Tienes <b>${money(d.credito)}</b> de saldo a favor. Se descuenta solo de tu próximo estado de cuenta.</p>` : ''}
      ${pend.map(l => {
        const pagado = Number(l.pagado) || 0, saldo = Math.max(0, (Number(l.total) || 0) - pagado), minimo = Math.min(20000, saldo);
        return `<div class="liq">
        <div class="liq-top"><b>Estado de cuenta de ${esc(fmtPeriodo(l.periodo))}</b><span class="pill ${vencida(l) ? 'neg' : 'warn'}">${vencida(l) ? 'Vencido' : 'Paga antes del ' + esc(fmtDiaMes(new Date(l.vence + 'T12:00:00').getTime()))}</span></div>
        <p class="liq-total num">${money(saldo)} <small>· ${int(l.clientes)} clientes${pagado ? ` · ya abonaste ${money(pagado)} de ${money(l.total)}` : ''}${Number(l.descuento) ? ` · descuento ${money(l.descuento)}` : ''}</small></p>
        ${pagado ? `<span class="track liq-track" role="img" aria-label="Pagado ${Math.round(pagado / l.total * 100)}%"><i class="in" style="width:${clamp(pagado / l.total, 0, 1) * 100}%"></i></span>` : ''}
        <p class="liq-ref">Referencia: <code>${esc(l.referencia)}</code> <span class="liq-ref-acts"><button type="button" class="text-btn" data-action="copiar-ref" data-ref="${esc(l.referencia)}">${ic('i-copy')}Copiar</button><button type="button" class="text-btn" data-action="liq-comprobante" data-id="${esc(l.id)}">${ic('i-ticket')}Ver detalle</button></span></p>
        <p class="liq-pasos-1">Toca <b>«Pagar ${money(saldo)}»</b>: el valor y la referencia ya van listos para que pagues con tarjeta, PSE, Nequi, Daviplata o Bancolombia en Wompi.</p>
        ${l.reportada_en && !pagado ? `<p class="liq-ok">${ic('i-check')}Avisaste el pago (${esc(l.pago_ref || '')}). El equipo lo confirma pronto.</p>` : ''}
        <div class="liq-acts"><button type="button" class="btn primary" data-action="liq-pagar" data-id="${esc(l.id)}">${ic('i-card')}Pagar ${money(saldo)}</button><button type="button" class="btn" data-action="liq-reportar" data-id="${esc(l.id)}" aria-expanded="false">Ya pagué por otro medio</button></div>
        <div class="liq-rep-wrap" id="liq-rep-wrap-${esc(l.id)}">
          <div class="liq-rep-box">
            <div class="liq-rep-head">
              <b>Registrar comprobante de pago (${money(saldo)})</b>
              <button type="button" class="text-btn" data-action="liq-reportar" data-id="${esc(l.id)}">Cerrar</button>
            </div>
            <p class="hint">Elige por dónde pagaste y escribe el número de transacción o comprobante para que el equipo lo valide.</p>
            <div class="liq-rep-medios" role="group" aria-label="Medio de pago">
              <button type="button" class="liq-medio is-on" data-action="liq-medio" data-id="${esc(l.id)}" data-medio="Wompi">Wompi</button>
              <button type="button" class="liq-medio" data-action="liq-medio" data-id="${esc(l.id)}" data-medio="Nequi">Nequi</button>
              <button type="button" class="liq-medio" data-action="liq-medio" data-id="${esc(l.id)}" data-medio="Bancolombia">Bancolombia</button>
              <button type="button" class="liq-medio" data-action="liq-medio" data-id="${esc(l.id)}" data-medio="PSE">PSE</button>
              <button type="button" class="liq-medio" data-action="liq-medio" data-id="${esc(l.id)}" data-medio="Daviplata">Daviplata</button>
            </div>
            <div class="liq-rep-row">
              <input class="input" type="text" id="liq-rep-inp-${esc(l.id)}" maxlength="50" placeholder="N.° de transacción o comprobante (ej. 12984-173...)">
              <button type="button" class="btn primary" data-action="liq-rep-enviar" data-id="${esc(l.id)}">${ic('i-check')}Confirmar pago</button>
            </div>
          </div>
        </div>
        ${saldo > minimo ? `<details class="liq-abono"><summary>Pagar solo una parte (abono)</summary>
          <div class="liq-abono-f"><label for="liq-abono-${esc(l.id)}">Valor del abono</label>
            <div class="liq-abono-row"><input class="input num" type="number" inputmode="numeric" id="liq-abono-${esc(l.id)}" min="${minimo}" max="${saldo}" step="1000" placeholder="${int(Math.ceil(saldo / 2 / 1000) * 1000)}">
            <button type="button" class="btn" data-action="liq-abonar" data-id="${esc(l.id)}" data-min="${minimo}" data-max="${saldo}">Abonar con Wompi</button></div>
            <p class="hint">Desde ${money(minimo)}. Con la mitad pagada tienes 15 días más antes de que tus parches salgan del radar.</p></div>
        </details>` : ''}
        <p class="liq-estado" id="liq-estado-${esc(l.id)}" role="status" aria-live="polite"></p>
      </div>`; }).join('')}
      <div class="mini-head"><p class="mini-title">Clientes validados${!(mes.detalle || []).length && pend[0] ? ` (${esc(fmtPeriodo(pend[0].periodo))})` : ' este mes'}</p>${detalleLista.length ? `<button type="button" class="text-btn" data-action="cobros-csv">${ic('i-download')}Descargar Excel (CSV)</button>` : ''}</div>
      ${detalleLista.length ? `<ul class="cobro-lista">${detalleLista.map(c => `<li>
          <span class="cobro-txt"><b>${esc(c.cliente || 'Cliente')}${c.personas > 1 && !/clientes validados/i.test(c.cliente || '') ? ` y ${c.personas - 1} más` : ''}</b><small>${esc(c.titulo || '')} · ${esc(fmtDia(Date.parse(c.creado_en)))} · ${esc(VALIDO_POR[c.validado_por] || 'validado')} · código ${esc(c.codigo)}</small>
            ${c.reclamo ? `<span class="pill ${c.reclamo === 'aprobado' ? 'pos' : c.reclamo === 'rechazado' ? 'neg' : 'warn'} cobro-rec">Reclamo ${esc(RECLAMO_TXT[c.reclamo] || c.reclamo)}</span>`
              : c.reclamable !== false ? `<button type="button" class="text-btn cobro-rec" data-action="cobro-reclamar" data-id="${esc(c.id)}" data-codigo="${esc(c.codigo)}">¿No llegó? Reclamar</button>` : ''}</span>
          <span class="cobro-monto num">${c.monto_cop ? money(c.monto_cop) : '$0'}<small>${c.tipo === 'paquete' ? `${d.comision_pct}% de ${money(c.base_cop || 0)}` : `${c.personas} × ${money(d.tarifa_cliente)}`}</small></span>
        </li>`).join('')}</ul>
        <p class="hint">Puedes corregir una llegada hasta 48 horas después. Después de eso, reclama aquí (hasta 15 días) y el equipo lo revisa.</p>` : '<p class="meta">Todavía nadie ha llegado este mes por ModoParche. Cuando alguien llegue y lo validen (QR, GPS o en la puerta), aparece aquí.</p>'}
      ${(d.reclamables_mes_anterior || []).length ? `<p class="mini-title">Del mes pasado: aún puedes reclamar</p><ul class="cobro-lista">${d.reclamables_mes_anterior.map(c => `<li><span class="cobro-txt"><b>${esc(c.cliente || 'Cliente')}</b><small>${esc(c.titulo || '')} · ${esc(fmtDia(Date.parse(c.creado_en)))}</small>${c.reclamo ? `<span class="pill ${c.reclamo === 'aprobado' ? 'pos' : c.reclamo === 'rechazado' ? 'neg' : 'warn'} cobro-rec">Reclamo ${esc(RECLAMO_TXT[c.reclamo] || c.reclamo)}</span>` : `<button type="button" class="text-btn cobro-rec" data-action="cobro-reclamar" data-id="${esc(c.id)}" data-codigo="${esc(c.codigo)}">¿No llegó? Reclamar</button>`}</span><span class="cobro-monto num">${c.monto_cop ? money(c.monto_cop) : '$0'}</span></li>`).join('')}</ul>` : ''}
      ${(d.reclamos || []).length ? `<p class="mini-title">Tus reclamos</p><ul class="liq-hist">${d.reclamos.map(r => `<li><span>Código ${esc(r.codigo)}<small class="hint" style="display:block">${esc(r.respuesta || r.motivo)}</small></span><span class="num">${money(r.monto)}</span><span class="pill ${r.estado === 'aprobado' ? 'pos' : r.estado === 'rechazado' ? 'neg' : 'warn'}">${esc(RECLAMO_TXT[r.estado] || r.estado)}</span></li>`).join('')}</ul>` : ''}
      ${viejas.length ? `<p class="mini-title">Meses anteriores</p><ul class="liq-hist">${viejas.map(l => `<li><span>${esc(fmtPeriodo(l.periodo))}</span><span class="num">${money(l.total)}</span><span class="pill ${l.estado === 'pagada' ? 'pos' : ''}">${esc(ESTADOS_LIQ[l.estado] || l.estado)}</span><button type="button" class="text-btn" data-action="liq-comprobante" data-id="${esc(l.id)}">${ic('i-ticket')}${l.estado === 'pagada' ? 'Comprobante' : 'Detalle'}</button></li>`).join('')}</ul>` : ''}
      ${d.demo ? '<p class="meta">Panel de ejemplo: estos cobros no son reales.</p>' : ''}`;
    ultimaCuenta = d;
  }
  const RECLAMO_TXT = { pendiente: 'en revisión', aprobado: 'aprobado', rechazado: 'rechazado' };
  let ultimaCuenta = null;

  // Reclamo: «esta persona no llegó». El equipo lo revisa; si se aprueba, el cobro se anula.
  async function reclamarCobro(id, codigo) {
    const v = window.prompt(`Reclamar el cobro ${codigo}\n\n¿Qué pasó? (por ejemplo: «no vino nadie», «llegaron 2, no 4», «lo marcaron por error»)`, '');
    if (v === null) return;
    const motivo = v.trim();
    if (motivo.length < 5) { toast('Cuéntanos un poco más', 'Escribe en pocas palabras qué pasó (mínimo 5 letras).', { error: true }); return; }
    if (!REMOTE()) { toast('Panel de ejemplo', 'En tu cuenta real el reclamo le llega al equipo y te respondemos por notificación.'); return; }
    const { error } = await SB().rpc('reclamar_cobro', { p_cobro: Number(id), p_motivo: motivo.slice(0, 300) });
    if (error) {
      const m = error.message || '';
      if (/reclamar_cobro|PGRST202/.test(m)) { toast('Falta una actualización', 'Los reclamos aún no están activos en la base de datos.', { error: true }); return; }
      const [t, dd] = errorDB(error); toast(t, dd, { error: true }); return;
    }
    toast('Reclamo enviado', 'El equipo lo revisa en 2 días hábiles. Si se aprueba, el cobro se anula solo.');
    cargarCobros(true);
  }

  // Abono: paga solo una parte del estado de cuenta
  function abonarLiquidacion(id, btn) {
    const inp = document.getElementById('liq-abono-' + id), min = Number(btn.dataset.min), max = Number(btn.dataset.max);
    const v = Math.round(Number(inp && inp.value));
    if (!v || v < min || v > max) {
      liqEstado(id, 'error', `Escribe un valor entre ${money(min)} y ${money(max)}.`);
      if (inp) inp.focus();
      return;
    }
    pagarLiquidacion(id, btn, v);
  }

  // Exportación (para el contador): los clientes validados del mes en CSV que abre Excel
  function descargarCSV(nombre, filas) {
    const celda = v => window.MPSeguro.celdaCSV(v, ';');
    // Punto y coma + BOM: Excel en español lo abre en columnas y con tildes
    const csv = '﻿' + filas.map(f => f.map(celda).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function exportarCobrosCSV() {
    const d = ultimaCuenta, mes = d && d.mes;
    if (!mes || !(mes.detalle || []).length) { toast('Sin datos', 'Todavía no hay clientes validados este mes.'); return; }
    const filas = [['Fecha', 'Cliente', 'Parche o mesa', 'Tipo', 'Personas', 'Valor del paquete', 'Cobro ModoParche', 'Validado por', 'Código']];
    for (const c of mes.detalle) filas.push([new Date(c.creado_en).toLocaleString('es-CO'), c.cliente || '', c.titulo || '', c.tipo, c.personas, c.base_cop || '', c.monto_cop, VALIDO_POR[c.validado_por] || c.validado_por, c.codigo]);
    filas.push([], ['Total', '', '', '', mes.clientes, '', mes.total]);
    descargarCSV(`modoparche-cobros-${String(mes.periodo).slice(0, 7)}.csv`, filas);
  }

  // Comprobante / detalle del estado de cuenta: se abre listo para imprimir o «Guardar como PDF»
  async function comprobanteLiquidacion(id) {
    const w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes', 'El navegador bloqueó el comprobante. Actívalas para este sitio e intenta de nuevo.', { error: true }); return; }
    w.document.write('<!doctype html><meta charset="utf-8"><title>Comprobante ModoParche</title><p style="font:16px system-ui;padding:24px">Cargando el comprobante…</p>');
    let x;
    if (!REMOTE()) {
      const d = ultimaCuenta || cuentaDemo(), l = (d.liquidaciones || []).find(y => String(y.id) === String(id)) || {};
      x = { ...l, negocio: { nombre: loc().perfil.nombre, nit: loc().perfil.nit || '', plan: d.plan }, cobros: (d.mes && d.mes.detalle || []).map(c => ({ fecha: c.creado_en, tipo: c.tipo, personas: c.personas, base: c.base_cop, monto: c.monto_cop, codigo: c.codigo, validado_por: c.validado_por, titulo: c.titulo })), pagos: [], demo: true };
    } else {
      const { data, error } = await SB().rpc('mi_liquidacion_detalle', { p_id: Number(id) });
      if (error) { w.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">No pudimos cargar el comprobante. ' + esc(/PGRST202|mi_liquidacion_detalle/.test(error.message) ? 'Falta una actualización de la base de datos.' : errorDB(error).join('. ')) + '</p>'; return; }
      x = data;
    }
    const pagado = Number(x.pagado) || (x.estado === 'pagada' ? Number(x.total) : 0);
    const filas = (x.cobros || []).map(c => `<tr><td>${esc(new Date(c.fecha).toLocaleDateString('es-CO'))}</td><td>${esc(c.titulo || '')}</td><td>${esc(c.tipo === 'paquete' ? 'Paquete' : c.tipo === 'reserva' ? 'Mesa reservada' : 'Mesa')}</td><td class="n">${int(c.personas)}</td><td>${esc(c.codigo)}</td><td class="n">${money(c.monto)}</td></tr>`).join('');
    const pagos = (x.pagos || []).map(p => `<li>${esc(new Date(p.fecha).toLocaleDateString('es-CO'))} · ${money(p.monto)} · ${esc(p.metodo || 'Wompi')} · transacción ${esc(p.wompi_id || '')}</li>`).join('');
    w.document.open();
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc((x.estado === 'pagada' ? 'Comprobante ' : 'Estado de cuenta ') + (x.referencia || ''))}</title>
<style>
  *{box-sizing:border-box} body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#15110e;background:#fff;margin:0;padding:32px}
  .doc{max-width:760px;margin:0 auto} header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #ff6a1a;padding-bottom:16px}
  h1{font-size:22px;margin:0} .marca{font-weight:800;font-size:20px;color:#ff6a1a} .meta{color:#5b524c;margin:2px 0}
  .sello{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:99px;font-weight:700;font-size:12px;border:2px solid currentColor}
  .ok{color:#137a3e} .pend{color:#a24a00} table{width:100%;border-collapse:collapse;margin-top:20px} th,td{text-align:left;padding:7px 6px;border-bottom:1px solid #e7e1dc;font-size:13px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5b524c} .n{text-align:right;font-variant-numeric:tabular-nums}
  .tot{margin-top:16px;margin-left:auto;width:min(320px,100%)} .tot div{display:flex;justify-content:space-between;padding:4px 0} .tot .g{font-weight:800;font-size:17px;border-top:2px solid #15110e;margin-top:4px;padding-top:8px}
  footer{margin-top:28px;color:#5b524c;font-size:12px} .acc{margin-top:20px;display:flex;gap:8px} button{font:inherit;padding:10px 16px;border-radius:10px;border:0;background:#15110e;color:#fff;cursor:pointer}
  @media print{body{padding:0}.acc{display:none}}
</style></head><body><div class="doc">
<header><div><div class="marca">ModoParche</div><p class="meta">Cobro por resultados · Villavicencio</p></div>
<div style="text-align:right"><h1>${x.estado === 'pagada' ? 'Comprobante de pago' : 'Estado de cuenta'}</h1><p class="meta">Referencia <b>${esc(x.referencia || '')}</b></p><p class="meta">Periodo: ${esc(fmtPeriodo(x.periodo))}</p>
<span class="sello ${x.estado === 'pagada' ? 'ok' : 'pend'}">${esc(ESTADOS_LIQ[x.estado] || x.estado || '')}</span></div></header>
<p style="margin-top:16px"><b>${esc(x.negocio && x.negocio.nombre || '')}</b>${x.negocio && x.negocio.nit ? ` · NIT ${esc(x.negocio.nit)}` : ''}<br><span class="meta">Vence: ${esc(x.vence ? new Date(x.vence + 'T12:00:00').toLocaleDateString('es-CO') : '')}${x.pagada_en ? ` · Pagado el ${esc(new Date(x.pagada_en).toLocaleDateString('es-CO'))}` : ''}</span></p>
<table><thead><tr><th>Fecha</th><th>Parche o mesa</th><th>Tipo</th><th class="n">Personas</th><th>Código</th><th class="n">Valor</th></tr></thead><tbody>${filas || '<tr><td colspan="6">Sin llegadas en este periodo.</td></tr>'}</tbody></table>
<div class="tot"><div><span>Clientes validados</span><span>${int(x.clientes || 0)}</span></div>
${Number(x.descuento) ? `<div><span>Saldo a favor aplicado</span><span>− ${money(x.descuento)}</span></div>` : ''}
<div><span>Total del periodo</span><span>${money(x.total || 0)}</span></div><div><span>Pagado</span><span>${money(pagado)}</span></div>
<div class="g"><span>${x.estado === 'pagada' ? 'Saldo' : 'Por pagar'}</span><span>${money(Math.max(0, (Number(x.total) || 0) - pagado))}</span></div></div>
${pagos ? `<p style="margin-top:16px"><b>Pagos recibidos</b></p><ul class="meta">${pagos}</ul>` : ''}
<footer>ModoParche cobra solo por clientes que llegaron y quedaron validados (QR, GPS o en la puerta). Los paquetes se pagan en el local; este documento cubre la comisión del servicio. ${x.demo ? '<b>Documento de ejemplo, no es real.</b>' : ''}<br>Generado el ${esc(new Date().toLocaleString('es-CO'))}</footer>
<div class="acc"><button id="imprimir">Imprimir o guardar en PDF</button></div>
</div></body></html>`);
    w.document.close();
    { const bi = w.document.getElementById('imprimir'); if (bi) bi.addEventListener('click', () => w.print()); }
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* el botón queda */ } }, 400);
  }

  /* ---------- QR fijo del local: lo imprimes y lo pegas en la entrada ---------- */
  let qrLocal = null;
  async function cargarQRLocal(nuevo = false) {
    const box = $('#qrlocal-box'); if (!box) return;
    if (nuevo && !(await confirmar('¿Cambiar el QR del local?', 'El QR impreso que tienes deja de funcionar y debes imprimir el nuevo.', 'Sí, cambiarlo'))) return;
    if (!REMOTE()) qrLocal = { negocio: 'demo', clave: 'demo' };
    else {
      const { data, error } = await SB().rpc('mi_qr_local', { p_nuevo: nuevo });
      if (error) { box.innerHTML = `<p class="meta">${/mi_qr_local|PGRST202/.test(error.message || '') ? 'Falta activar el QR del local en la base de datos (migración 20261120120000_mejoras_cobro.sql).' : esc(errorDB(error).join('. '))}</p>`; return; }
      qrLocal = data;
    }
    const url = `${siteBase()}dashboard.html?llegue=${encodeURIComponent(qrLocal.negocio)}&k=${encodeURIComponent(qrLocal.clave)}`;
    const nombre = loc().perfil.nombre || 'Tu local';
    box.innerHTML = `<div class="qrl">
        <figure class="qrl-afiche" data-tinta-fija aria-label="Vista previa del afiche para la entrada">
          <p class="qrl-k">¿Llegaste por ModoParche?</p>
          <span class="qrl-qr">${qrSVG(url)}</span>
          <figcaption><b>${esc(nombre)}</b><span>Escanea con la cámara</span></figcaption>
        </figure>
        <div class="qrl-info">
          <ol class="qrl-pasos">
            <li><span>1</span><div><b>Imprímelo</b><small>Sale en una hoja tamaño carta, listo para pegar.</small></div></li>
            <li><span>2</span><div><b>Pégalo en la entrada o la caja</b><small>Donde la gente lo vea al llegar.</small></div></li>
            <li><span>3</span><div><b>El cliente lo escanea</b><small>Su reserva o parche de hoy queda validado al instante.</small></div></li>
          </ol>
          <ul class="qrl-chips"><li>${ic('i-check')}Sin buscar nombres en la puerta</li><li>${ic('i-shield')}Desde lejos no vale</li><li>${ic('i-clock')}Solo con reserva a esa hora</li></ul>
          <div class="qrl-acts"><button type="button" class="btn primary" data-action="qrlocal-imprimir">${ic('i-download')}Imprimir afiche</button><button type="button" class="btn ghost qrl-nuevo" data-action="qrlocal-nuevo">${ic('i-refresh')}Cambiar QR</button></div>
          ${!REMOTE() ? '<p class="meta">Panel de ejemplo: este QR no funciona.</p>' : ''}
        </div>
      </div>`;
    box.dataset.url = url;
  }
  function imprimirQRLocal() {
    const url = $('#qrlocal-box') && $('#qrlocal-box').dataset.url;
    if (!url) return;
    const w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes', 'El navegador bloqueó la hoja para imprimir.', { error: true }); return; }
    const nombre = loc().perfil.nombre || 'Nuestro local';
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de llegada · ${esc(nombre)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#15110e;background:#fff;display:grid;place-items:center;min-height:100vh}
.c{text-align:center;padding:40px;border:6px solid #ff6a1a;border-radius:32px;max-width:520px}
h1{font-size:40px;margin:0 0 6px;line-height:1.05}p{font-size:18px;margin:6px 0;color:#3b332e}.qr{width:330px;height:330px;margin:24px auto}.qr svg{width:100%;height:100%}
.m{font-weight:800;color:#ff6a1a;font-size:22px;margin-top:18px}@media print{.c{border-width:4px}}</style></head>
<body><div class="c"><h1>¿Llegaste por ModoParche?</h1><p>Escanea con la cámara y tu llegada queda lista.</p>
<div class="qr">${qrSVG(url)}</div><p><b>${esc(nombre)}</b></p><p class="m">ModoParche</p></div>
<script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
    w.document.close();
    { const bi = w.document.getElementById('imprimir'); if (bi) bi.addEventListener('click', () => w.print()); }
  }

  /* ---------- Referidos: invita a otro local y los dos ganan saldo a favor ---------- */
  const PREMIO_REFERIDO = 10000; // bono para cada local (también en la base: private.premiar_referido)
  async function cargarReferidos() {
    const box = $('#referidos-box'); if (!box) return;
    let d;
    if (!REMOTE()) d = { codigo: 'DEMO-7F3A', credito: 0, premio: PREMIO_REFERIDO, invitados: 1, premiados: 0, demo: true };
    else {
      const { data, error } = await SB().rpc('mi_referidos');
      if (error) { box.innerHTML = `<p class="meta">${/mi_referidos|PGRST202/.test(error.message || '') ? 'Falta activar los referidos en la base de datos (migración 20261120120000_mejoras_cobro.sql).' : esc(errorDB(error).join('. '))}</p>`; return; }
      d = data;
    }
    const link = `${siteBase()}empresa.html?ref=${encodeURIComponent(d.codigo)}`;
    const wa = 'https://wa.me/?text=' + encodeURIComponent('Únete a ModoParche con mi invitación: publicas planes gratis y solo pagas por clientes que llegan. ' + link);
    box.innerHTML = `<div class="ref">
        <div class="ref-bono" data-tinta-fija><span class="ref-burst"><b>${money(PREMIO_REFERIDO)}</b><small>para cada uno</small></span></div>
        <div class="ref-info">
          <p>Invita a otro local de Villavo. Cuando esté verificado, con NIT propio, y haya pagado <b>$50.000</b> o más, <b>los dos ganan ${money(PREMIO_REFERIDO)}</b> de saldo a favor, que se descuenta solo.</p>
          <div class="ref-code"><span>Tu código</span><code>${esc(d.codigo)}</code></div>
          <div class="ref-acts"><button type="button" class="btn primary" data-action="ref-copiar" data-link="${esc(link)}">${ic('i-copy')}Copiar invitación</button><a class="btn ref-wa" href="${esc(wa)}" target="_blank" rel="noopener">${ic('i-send')}WhatsApp</a></div>
          <div class="ref-stats"><span><b>${int(d.invitados || 0)}</b>${Number(d.invitados) === 1 ? 'local invitado' : 'locales invitados'}</span><span><b>${int(d.premiados || 0)}</b>${Number(d.premiados) === 1 ? 'bono ganado' : 'bonos ganados'}</span></div>
          ${d.me_invito ? `<p class="meta">Te invitó ${esc(d.me_invito)}.</p>` : ''}${d.demo ? '<p class="meta">Panel de ejemplo.</p>' : ''}
        </div>
      </div>`;
  }
  async function copiarInvitacion(link) {
    const texto = `Únete a ModoParche con mi invitación: publicas planes gratis y solo pagas por clientes que llegan. ${link}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: 'ModoParche para negocios', text: texto }); return; }
      await navigator.clipboard.writeText(texto); toast('Invitación copiada', 'Pégala en WhatsApp o donde quieras.');
    } catch (e) { if (e && e.name !== 'AbortError') toast('Cópiala a mano', link, { error: true }); }
  }
  // Llegó desde una invitación (empresa.html?ref=): se aplica una sola vez
  async function aplicarReferidoPendiente() {
    let cod = null;
    try { cod = localStorage.getItem('mp-ref'); } catch (e) { /* sin almacenamiento */ }
    if (!cod || !REMOTE()) return;
    const { data, error } = await SB().rpc('usar_codigo_referido', { p_codigo: cod });
    try { localStorage.removeItem('mp-ref'); } catch (e) { /* nada */ }
    if (error) { if (!/YA_TIENES|PGRST202|usar_codigo_referido/.test(error.message || '')) { const [t, dd] = errorDB(error); toast(t, dd, { error: true }); } return; }
    toast('Invitación aplicada', `Te invitó ${data}. Cuando pagues tu primer estado de cuenta, los dos ganan ${money(PREMIO_REFERIDO)}.`);
  }

  // Reseñas reales: solo las dejan clientes con llegada validada
  async function cargarResenasReales() {
    if (!REMOTE()) return;
    const { data, error } = await SB().rpc('mis_resenas_local');
    if (error || !Array.isArray(data)) return;
    loc().resenas = data.map(r => ({ autor: r.autor || 'Parcero', estrellas: r.estrellas, texto: r.texto || '', parche: r.titulo || 'tu local', fecha: Date.parse(r.creado_en) }));
  }
  /* Pago con un clic: wompi-checkout firma el valor exacto de la base, se abre el
     widget oficial de Wompi y el webhook marca el estado de cuenta como pagado.
     Si los pagos en línea no están activos, se ofrece el datáfono (valor a mano). */
  function liqEstado(id, tipo, texto) {
    const el = document.getElementById('liq-estado-' + id);
    if (!el) return;
    el.className = 'liq-estado' + (tipo ? ' is-' + tipo : '');
    el.innerHTML = tipo === 'cargando' ? `<span class="pay-spin" aria-hidden="true"></span>${esc(texto)}` : esc(texto || '');
  }
  const pagosAvisados = new Set();
  const urlVueltaPago = ref => new URL('empresa-dashboard.html?pago=' + encodeURIComponent(ref), location.href).href;
  // Volvió de Wompi: se muestra el estado real del pago, no un mensaje genérico
  async function volverDeWompi(ref, txId) {
    if (txId) { try { await SB().functions.invoke('wompi-checkout', { body: { accion: 'confirmar', transaccion: txId } }); } catch (e) { /* el webhook lo confirma igual */ } }
    let est = null;
    for (let i = 0; i < 6; i++) {
      try { const { data } = await SB().from('pagos').select('estado').eq('referencia', ref).maybeSingle(); est = data && data.estado; } catch (e) { /* se reintenta */ }
      if (est && est !== 'PENDING') break;
      await new Promise(r => setTimeout(r, 2500));
    }
    cobrosCargados = 0; cargarCobros(true);
    if (est === 'APPROVED') { if (!pagosAvisados.has(ref)) { pagosAvisados.add(ref); toast('Pago aprobado', 'Ya quedó registrado en tu estado de cuenta.'); } }
    else if (['DECLINED', 'VOIDED', 'ERROR'].includes(est)) toast('El pago no pasó', 'No se hizo ningún cobro. Prueba con otro medio.', { error: true });
    else toast('Tu pago sigue en proceso', 'Apenas Wompi lo apruebe, el estado de cuenta se marca solo.');
  }
  async function pagarLiquidacion(id, btn, monto = null) {
    if (!REMOTE()) { abrirDatafono(id, monto); return; }
    btn.disabled = true;
    liqEstado(id, 'cargando', 'Abriendo pasarela de pago Wompi…');
    let datos;
    try {
      const body = { liquidacion: Number(id) };
      if (monto) body.monto = monto;
      const { data, error } = await SB().functions.invoke('wompi-checkout', { body });
      if (error) { let d = ''; try { d = (await error.context.json()).error || ''; } catch (e2) { /* sin cuerpo */ } throw new Error(d || error.message); }
      if (!data || data.error) throw new Error((data && data.error) || 'SIN_RESPUESTA');
      datos = data;
    } catch (e) {
      btn.disabled = false;
      const m = String((e && e.message) || e);
      if (/YA_PAGADA/.test(m)) { liqEstado(id, 'ok', 'Este estado de cuenta ya está pagado.'); cargarCobros(true); return; }
      if (/DEMASIADOS/.test(m)) { liqEstado(id, 'error', 'Muchos intentos seguidos. Espera unos minutos.'); return; }
      if (/MONTO_INVALIDO/.test(m)) { liqEstado(id, 'error', 'Ese valor no sirve para abonar. Toca «Actualizar» y revisa el saldo.'); return; }
      if (/NO_SE_PUEDE_PAGAR|NO_ES_TUYO/.test(m)) { liqEstado(id, 'error', 'Este estado de cuenta ya no está pendiente. Toca «Actualizar».'); return; }
      // Si el checkout integrado no está activo, abrimos directamente el pago rápido con Wompi
      liqEstado(id, '', '');
      abrirDatafono(id, monto);
      return;
    }
    // El widget de Wompi no cargó (red o bloqueador): mismo pago, en el checkout web de Wompi
    try { await cargarWompi(); }
    catch (e) {
      liqEstado(id, 'cargando', 'Te llevamos a Wompi con el valor ya puesto…');
      location.href = 'https://checkout.wompi.co/p/?' + new URLSearchParams({
        'public-key': datos.publicKey, currency: datos.currency, 'amount-in-cents': String(datos.amountInCents),
        reference: datos.reference, 'signature:integrity': datos.signature,
        'redirect-url': urlVueltaPago(datos.reference),
      }).toString();
      return;
    }
    const c = datos.customer || {}, cliente = {};
    if (c.email) cliente.email = c.email;
    if (c.fullName) cliente.fullName = c.fullName;
    if (/^3\d{9}$/.test(c.phoneNumber || '')) { cliente.phoneNumber = c.phoneNumber; cliente.phoneNumberPrefix = '+57'; }
    if (c.legalId) { cliente.legalId = c.legalId; cliente.legalIdType = c.legalIdType || 'NIT'; }
    let checkout;
    try {
      checkout = new window.WidgetCheckout({
        currency: datos.currency, amountInCents: datos.amountInCents, reference: datos.reference, publicKey: datos.publicKey,
        signature: { integrity: datos.signature },
        redirectUrl: urlVueltaPago(datos.reference),
        customerData: cliente,
      });
    } catch (e) { btn.disabled = false; liqEstado(id, 'error', 'No pudimos abrir Wompi. Recarga la página e intenta de nuevo.'); return; }
    liqEstado(id, 'cargando', 'Completa el pago en la ventana de Wompi. No cierres esta página.');
    checkout.open(result => {
      btn.disabled = false;
      const tx = result && result.transaction;
      if (!tx) { liqEstado(id, '', ''); return; }
      seguirPagoLiquidacion(id, datos.reference, tx.id, tx.status);
    });
  }
  // Sigue el pago hasta que Wompi lo resuelva (PSE o Nequi pueden tardar unos minutos)
  async function seguirPagoLiquidacion(id, referencia, txId, estadoInicial) {
    if (['DECLINED', 'ERROR', 'VOIDED'].includes(estadoInicial)) { liqEstado(id, 'error', 'El pago no pasó. No se hizo ningún cobro; prueba con otro medio.'); return; }
    liqEstado(id, 'cargando', 'Confirmando el pago con Wompi…');
    for (let i = 0; i < 24; i++) {
      if (txId && i % 2 === 0) { try { await SB().functions.invoke('wompi-checkout', { body: { accion: 'confirmar', transaccion: txId } }); } catch (e) { /* el webhook lo confirma igual */ } }
      let est = null;
      try { const { data } = await SB().from('pagos').select('estado').eq('referencia', referencia).maybeSingle(); est = data && data.estado; } catch (e) { /* sin red: se reintenta */ }
      if (est === 'APPROVED') {
        liqEstado(id, 'ok', '¡Pago aprobado! Ya quedó registrado en tu estado de cuenta.');
        tone('ok'); cargarCobros(true);
        if (!pagosAvisados.has(referencia)) { pagosAvisados.add(referencia); toast('Pago aprobado', 'Gracias. Tus parches siguen en el radar.'); }
        return;
      }
      if (['DECLINED', 'VOIDED', 'ERROR'].includes(est)) { liqEstado(id, 'error', 'El pago no pasó. No se hizo ningún cobro; prueba con otro medio.'); return; }
      await new Promise(r => setTimeout(r, i < 6 ? 2500 : 5000));
    }
    liqEstado(id, 'info', 'Tu pago sigue en proceso. Apenas Wompi lo apruebe, el estado de cuenta se marca pagado solo.');
  }
  /* Datáfono de Wompi (monto abierto): se muestra el valor exacto y la referencia,
     el valor se copia solo y se abre Wompi. Así nadie escribe un valor equivocado. */
  function abrirDatafono(id, monto) {
    const l = ((ultimaCuenta && ultimaCuenta.liquidaciones) || []).find(x => String(x.id) === String(id));
    if (!l) { window.open(DATAFONO_WOMPI, '_blank', 'noopener'); return; }
    const saldo = Math.max(0, (Number(l.total) || 0) - (Number(l.pagado) || 0));
    const valor = monto || saldo;
    $('#df-valor').textContent = money(valor);
    $('#df-ref').textContent = l.referencia;
    $('#df-copiar-valor').dataset.copiar = String(valor);
    $('#df-copiar-ref').dataset.copiar = l.referencia;
    $('#df-abrir').dataset.valor = String(valor);
    $('#df-abrir').dataset.id = String(id);
    try { navigator.clipboard.writeText(String(valor)); } catch (_e) { /* opcional */ }
    $('#df-estado').textContent = `Valor (${money(valor)}) copiado automáticamente. Toca «Abrir Wompi» para pagar.`;
    $('#dlg-datafono').showModal();
  }
  async function copiarDato(btn) {
    const v = btn.dataset.copiar || '';
    try { await navigator.clipboard.writeText(v); btn.classList.add('is-ok'); btn.textContent = 'Copiado'; setTimeout(() => { btn.classList.remove('is-ok'); btn.textContent = 'Copiar'; }, 1600); }
    catch (e) { toast('Cópialo a mano', v, { error: true }); }
  }
  async function abrirWompiDatafono(btn) {
    const valor = btn.dataset.valor || '';
    let copiado = false;
    try { await navigator.clipboard.writeText(valor); copiado = true; } catch (e) { /* sin portapapeles */ }
    window.open(DATAFONO_WOMPI, '_blank', 'noopener');
    $('#df-estado').textContent = copiado
      ? `Copiamos ${money(Number(valor))}: en Wompi pega el valor y pon la referencia en la descripción.`
      : `En Wompi escribe exactamente ${money(Number(valor))} y pon la referencia en la descripción.`;
    const dlg = $('#dlg-datafono');
    if (dlg && dlg.open) dlg.close();
    reportarPago(btn.dataset.id, true);
  }

  function reportarPago(id, forzarAbrir = false) {
    const wrap = document.getElementById('liq-rep-wrap-' + id);
    if (!wrap) return;
    const abrir = forzarAbrir ? true : !wrap.classList.contains('is-open');
    wrap.classList.toggle('is-open', abrir);
    const btn = document.querySelector(`[data-action="liq-reportar"][data-id="${CSS.escape(String(id))}"]`);
    if (btn) btn.setAttribute('aria-expanded', String(abrir));
    if (abrir) {
      setTimeout(() => {
        const inp = document.getElementById('liq-rep-inp-' + id);
        if (inp) inp.focus();
      }, 160);
    }
  }
  function elegirMedioPago(btn) {
    const box = btn.closest('.liq-rep-medios');
    if (!box) return;
    box.querySelectorAll('.liq-medio').forEach(b => b.classList.toggle('is-on', b === btn));
  }
  async function enviarReportePago(id, btn) {
    const inp = document.getElementById('liq-rep-inp-' + id);
    const wrap = document.getElementById('liq-rep-wrap-' + id);
    const medioBtn = wrap && wrap.querySelector('.liq-medio.is-on');
    const medio = (medioBtn && medioBtn.dataset.medio) || 'Wompi';
    const raw = String((inp && inp.value) || '').trim();
    if (raw.length < 4) {
      toast('Falta el número de comprobante', 'Escribe el número de transacción tal como aparece en tu comprobante.', { error: true });
      if (inp) inp.focus();
      return;
    }
    const ref = `${medio} · ${raw}`.slice(0, 60);
    if (!REMOTE()) {
      wrap.classList.remove('is-open');
      toast('Comprobante registrado', `Guardamos tu aviso (${ref}).`);
      return;
    }
    if (btn) btn.disabled = true;
    const { error } = await SB().rpc('reportar_pago_liquidacion', { p_id: Number(id), p_ref: ref });
    if (btn) btn.disabled = false;
    if (error) { const [t, dd] = errorDB(error); toast(t, dd, { error: true }); return; }
    toast('Comprobante enviado', 'El equipo confirma tu pago y actualiza tu estado de cuenta.');
    cargarCobros(true);
  }
  async function copiarRef(ref) {
    try { await navigator.clipboard.writeText(ref); toast('Referencia copiada', ref); }
    catch (e) { toast('Cópiala a mano', ref, { error: true }); }
  }

  async function guardarNegocio(campos) {
    if (!REMOTE()) return true;
    const { error } = await SB().from('negocios').update(campos).eq('id', ME.id);
    if (error) { const [t, d] = errorDB(error); toast(t, d, { error: true }); return false; }
    return true;
  }
  // Cambiar de plan: inmediato y sin pagos por adelantado (elegir_plan en la base)
  async function cambiarPlan(plan) {
    const P = loc().perfil;
    if (!PLANES[plan] || plan === P.plan) return;
    const ok = await confirmarCambioPlan(P.plan, plan);
    if (!ok) return;
    const finCarga = window.MPCargando ? window.MPCargando.mostrar() : () => {};
    try { await aplicarCambioPlan(plan, P); } finally { finCarga(); }
  }
  const fechaPlan = f => new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  async function aplicarCambioPlan(plan, P) {
    if (REMOTE()) {
      let { data: res, error } = await SB().rpc('elegir_plan', { p_plan: plan, p_sedes: plan === 'sedes' ? Math.max(2, P.sedes || 2) : null });
      // Base sin el modelo nuevo: bajar a básico sigue funcionando con la función vieja
      if (error && /elegir_plan|PGRST202/.test(error.message || '') && plan === 'basico') ({ error } = await SB().rpc('cambiar_a_basico'));
      if (error) {
        const [tt, dd] = /elegir_plan|PGRST202/.test(error.message || '') ? ['Falta activar los planes nuevos', 'El equipo debe correr la migración del cobro por resultados.'] : errorDB(error);
        toast(tt, dd, { error: true }); return;
      }
      if (res && res.solicitado) {
        P.planPendiente = plan; save(); renderShell(); renderPlan();
        toast('Solicitud enviada', 'El equipo revisa tus sedes y activa el plan. Mientras tanto sigues con tu plan actual.');
        return;
      }
      if (res && res.programado_en) {
        P.planProgramado = 'basico'; P.planProgramadoEn = res.programado_en; save(); renderPlan(); cargarCobros(true);
        toast('Cambio programado', `Pasas a Parche básico el ${fechaPlan(res.programado_en)}. Hasta entonces sigue tu plan actual.`);
        return;
      }
    }
    P.planProgramado = null; P.planProgramadoEn = null;
    P.plan = plan; P.planVence = null; P.planPendiente = null; if (plan === 'sedes') P.sedes = Math.max(2, P.sedes || 2);
    save(); renderShell(); renderPlan(); cargarCobros(true);
    const t = tarifas(plan);
    toast(`Ya tienes ${PLANES[plan].nombre}`, t.cliente
      ? `Desde hoy: ${t.pct}% por paquete y ${money(t.cliente)} por cliente que llega. Lo ves en «Cobros por resultados».`
      : 'Desde hoy no pagas comisión. Lo que llegó antes de hoy sigue en tu estado de cuenta.');
    tone('ok');
  }

  /* Cambiar de plan no es un clic: se compara lo de ahora con lo de después,
     se confirma que se entiende y se mantiene presionado el botón 1,6 s. */
  function confirmarCambioPlan(actual, nuevo) {
    const A = PLANES[actual] || PLANES.basico, N = PLANES[nuevo], usados = parchesDelMes();
    const sube = N.cliente > A.cliente || (A.limite !== Infinity && N.limite === Infinity);
    const fila = (k, a, n) => `<div class="plan-cmp-row${a !== n ? ' is-cambia' : ''}"><span>${esc(k)}</span><b>${esc(a)}</b><b>${esc(n)}</b></div>`;
    const lim = p => p.limite === Infinity ? 'Ilimitados' : `${p.limite} al mes`;
    $('#dlg-plan-title').textContent = `De ${A.nombre} a ${N.nombre}`;
    $('#plan-cmp').innerHTML = `<div class="plan-cmp-row plan-cmp-row--head"><span></span><b>Ahora</b><b>Después</b></div>`
      + fila('Parches', lim(A), lim(N))
      + fila('Por paquete redimido', `${A.pct}%`, `${N.pct}%`)
      + fila('Por cliente en mesa', money(A.cliente), money(N.cliente))
      + fila('Prioridad en el radar', A.limite === Infinity ? 'Sí' : 'No', N.limite === Infinity ? 'Sí' : 'No')
      + fila('Mensualidad', '$0', '$0');
    const cambios = [];
    if (nuevo === 'basico') {
      cambios.push(`Solo puedes publicar <b>2 parches al mes</b>${usados ? ` (este mes ya llevas ${usados})` : ''}.`);
      cambios.push('Tus parches dejan de tener <b>prioridad en el radar</b> y foto destacada.');
      cambios.push('Si tienes parches activos o cobros sin liquidar, el cambio queda <b>programado para el próximo ciclo</b>. Lo que ya llegó se cobra igual.');
      cambios.push('Lo que ya publicaste se queda publicado.');
    } else {
      cambios.push(`Desde hoy pagas <b>${N.pct}% por cada paquete redimido</b> y <b>${money(N.cliente)} por cada cliente</b> que llega a tu mesa.`);
      cambios.push('Se cobra una vez al mes en tu estado de cuenta. Si nadie llega, pagas <b>$0</b>.');
      if (A.limite !== Infinity) cambios.push('Parches ilimitados con foto destacada y prioridad en el radar.');
      if (nuevo === 'sedes') cambios.unshift('<b>El equipo revisa tus sedes antes de activarlo.</b> Hasta entonces sigues con tu plan actual.');
    }
    $('#plan-cambios').innerHTML = cambios.map(c => `<li>${c}</li>`).join('');
    $('#plan-ack-txt').textContent = nuevo === 'sedes' ? 'Entiendo que este plan se activa cuando el equipo lo apruebe.' : sube
      ? `Entiendo que desde hoy ModoParche cobra ${N.pct}% por paquete y ${money(N.cliente)} por cliente que llegue.`
      : 'Entiendo que tendré los límites de este plan cuando el cambio aplique.';
    const ack = $('#plan-ack'), hold = $('#plan-hold'), txt = $('#plan-hold-txt'), dlg = $('#dlg-plan');
    ack.checked = false; hold.disabled = true; hold.style.setProperty('--p', 0); txt.textContent = 'Mantén presionado para cambiar';
    ack.onchange = () => { hold.disabled = !ack.checked; };

    return new Promise(res => {
      const DURA = REDUCED() ? 900 : 1600;
      let t0 = 0, raf = 0, listo = false;
      const parar = () => {
        if (listo || !t0) return;
        cancelAnimationFrame(raf); t0 = 0;
        hold.classList.remove('is-holding');
        hold.style.setProperty('--p', 0);
        txt.textContent = 'Mantén presionado para cambiar';
      };
      const paso = now => {
        const p = Math.min(1, (now - t0) / DURA);
        hold.style.setProperty('--p', p.toFixed(3));
        if (p < 1) { raf = requestAnimationFrame(paso); return; }
        listo = true;
        txt.textContent = '¡Listo!';
        try { navigator.vibrate && navigator.vibrate(18); } catch (e) { /* sin vibración */ }
        setTimeout(() => { dlg.returnValue = 'ok'; dlg.close('ok'); }, 220);
      };
      const empezar = e => {
        if (hold.disabled || listo || t0) return;
        if (e && e.type === 'keydown') { if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); }
        if (e && e.pointerId != null) { try { hold.setPointerCapture(e.pointerId); } catch (er) { /* nada */ } }
        t0 = performance.now();
        hold.classList.add('is-holding');
        txt.textContent = 'Sigue presionando…';
        raf = requestAnimationFrame(paso);
      };
      hold.onpointerdown = empezar;
      hold.onkeydown = empezar;
      hold.onpointerup = hold.onpointercancel = hold.onpointerleave = parar;
      hold.onkeyup = e => { if (e.key === 'Enter' || e.key === ' ') parar(); };
      hold.oncontextmenu = e => e.preventDefault(); // mantener presionado en el celular no abre el menú
      let armado = 0;
      hold.onclick = e => {
        e.preventDefault();
        if (listo || hold.disabled) return;
        if (armado && Date.now() - armado < 6000) {
          listo = true; hold.style.setProperty('--p', 1); txt.textContent = '¡Listo!';
          setTimeout(() => { dlg.returnValue = 'ok'; dlg.close('ok'); }, 220);
          return;
        }
        armado = Date.now();
        txt.textContent = 'Toca otra vez para confirmar';
        hold.classList.remove('nudge'); void hold.offsetWidth; hold.classList.add('nudge');
      };
      dlg.returnValue = '';
      dlg.onclose = () => { cancelAnimationFrame(raf); res(dlg.returnValue === 'ok'); };
      dlg.showModal();
    });
  }
  async function moverLocal(lat, lng) {
    const P = loc().perfil;
    if (!(await guardarNegocio({ lat, lng }))) return;
    P.lat = lat; P.lng = lng; P.sinUbicacion = false; save();
    if (perfilMarker) perfilMarker.setLatLng([lat, lng]);
    $('#ubic-meta').textContent = `${P.direccion} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    mostrarDireccionPin(lat, lng);
    mapDirty = true;
    toast('Ubicación guardada', 'Tus parches nuevos salen en este punto del mapa.');
    renderSetup();
  }

  function openPerfil() {
    const P = loc().perfil;
    resetFields($('#form-perfil'));
    $('#e-nombre').value = P.nombre;
    $('#e-cat').value = P.cat || 'comida';
    $('#e-tel').value = P.telRaw || String(P.tel || '').replace(/\D/g, '');
    $('#e-barrio').value = P.barrio;
    $('#e-dir').value = P.direccion;
    $('#e-desc').value = P.desc;
    $('#dlg-perfil').showModal();
  }
  async function submitPerfil(e) {
    e.preventDefault();
    const v = id => $('#' + id).value.trim();
    const tel = v('e-tel').replace(/\D/g, '');
    const ok = [
      setField($('#e-nombre'), v('e-nombre').length < 2 ? 'Escribe el nombre del negocio.' : ''),
      setField($('#e-tel'), tel && !/^\d{7,15}$/.test(tel) ? 'Entre 7 y 15 números.' : ''),
      setField($('#e-barrio'), v('e-barrio').length < 2 ? 'Escribe el barrio.' : ''),
      setField($('#e-dir'), v('e-dir').length < 4 ? 'Escribe la dirección.' : ''),
    ].every(Boolean);
    if (!ok) return;
    const campos = { nombre: v('e-nombre'), categoria: $('#e-cat').value, telefono: tel, barrio: v('e-barrio'), direccion: v('e-dir'), descripcion: v('e-desc') };
    const btn = $('#e-submit'); btn.disabled = true;
    const saved = await guardarNegocio(campos);
    btn.disabled = false;
    if (!saved) return;
    const P = loc().perfil, categoria = CAT_NEG[campos.categoria] || P.categoria;
    const cambioDir = campos.direccion !== P.direccion || campos.barrio !== P.barrio;
    if (cambioDir && window.MPMapa) {
      // Nueva dirección: buscamos el punto exacto y ofrecemos mover el pin
      window.MPMapa.geocodificarDireccion({ direccion: campos.direccion, barrio: campos.barrio, ciudad: P.ciudad, nombre: campos.nombre }).then(async r => {
        if (!r || (r.precision !== 'direccion' && r.precision !== 'lugar')) return;
        if (window.MPMapa.distancia(r, { lat: P.lat, lng: P.lng }) < 40) return;
        const mover = await confirmar('¿Movemos el pin del local?', `Encontramos "${campos.direccion}" en el mapa a ${(window.MPMapa.distancia(r, { lat: P.lat, lng: P.lng }) / 1000).toFixed(1).replace('.', ',')} km de donde está tu pin.`, 'Sí, moverlo');
        if (mover) moverLocal(r.lat, r.lng);
      }).catch(() => { /* sin red: el pin se puede mover a mano en el mapa */ });
    }
    Object.assign(P, { nombre: campos.nombre, corto: initialsOf(campos.nombre), cat: campos.categoria, categoria, tema: TEMAS[categoria] || P.tema, telRaw: tel, tel: fmtTel(tel), barrio: campos.barrio, direccion: campos.direccion, desc: campos.descripcion || P.desc });
    loc().parches.forEach(p => { if (p.tipo !== 'comunidad') p.organizador = P.nombre; });
    save();
    $('#dlg-perfil').close();
    toast('Perfil actualizado', 'Así te ven ahora los parceros.');
    render();
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
  /* ---------- Derechos sobre los datos (Ley 1581 de 2012) ---------- */
  async function descargarMisDatos(btn) {
    let datos;
    if (!REMOTE()) datos = { aviso: 'Panel de ejemplo: estos datos solo existen en este navegador.', negocio: loc().perfil };
    else {
      btn.disabled = true;
      const { data, error } = await SB().rpc('mis_datos');
      btn.disabled = false;
      if (error) { toast('No pudimos preparar el archivo', error.message, { error: true }); return; }
      datos = data;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    a.download = 'datos-negocio-modoparche-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Archivo descargado', 'Ahí está todo lo que tenemos de tu negocio.');
  }
  async function borrarCuenta(btn) {
    const ok = await confirmar('¿Borrar la cuenta del negocio?', 'Se borran el negocio, sus parches, cupones y datos. A las personas que estaban en tus parches les desaparecen de la lista. No se puede deshacer.', 'Sí, borrar todo');
    if (!ok) return;
    if (!REMOTE()) { try { localStorage.clear(); } catch (e) { /* nada */ } location.replace('index.html'); return; }
    btn.disabled = true;
    const chk = await SB().rpc('puedo_borrar_cuenta');
    if (chk.data && chk.data.ok === false) { btn.disabled = false; toast('Aún no se puede borrar', chk.data.hint, { error: true, ms: 7000 }); return; }
    try {
      const { data: files } = await SB().storage.from('fotos').list(ME.id, { limit: 1000 });
      if (files && files.length) await SB().storage.from('fotos').remove(files.map(f => ME.id + '/' + f.name));
    } catch (e) { /* seguimos con la cuenta */ }
    const { error } = await SB().rpc('borrar_mi_cuenta');
    btn.disabled = false;
    if (error) { toast('No se pudo borrar', error.hint || error.message, { error: true, ms: 7000 }); return; }
    try { await SB().auth.signOut(); } catch (e) { /* la sesión ya no existe */ }
    try { localStorage.clear(); } catch (e) { /* nada */ }
    location.replace('index.html?cuenta=borrada');
  }

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
    'p-cupos': v => { const n = Number(v); if (!Number.isInteger(n) || n < 2) return 'Mínimo 2 cupos.'; if (n > 60) return 'Máximo 60 por parche.'; const p = editId && findParche(editId); return p && n < confirmados(p) ? `Ya hay ${confirmados(p)} confirmados.` : ''; },
    'p-consumo': v => pMod === 'paquete'
      ? (!/^\d+$/.test(String(v)) || Number(v) < 1000 ? 'El paquete debe costar mínimo $1.000.' : Number(v) > 5000000 ? 'Máximo $5.000.000.' : '')
      : (v === '' || Number(v) < 0 ? 'Usa 0 si no hay consumo mínimo.' : ''),
    'p-promo': v => v.trim().length < 10 ? 'Cuenta qué pasa ese día (mínimo 10 caracteres).' : '',
  };
  /* Tipo de cobro del parche: consumo libre en mesa (tarifa por persona que llega)
     o paquete cerrado (comisión sobre el precio, se paga en el local) */
  let pMod = 'mesa';
  function setModalidad(m) {
    pMod = m === 'paquete' ? 'paquete' : 'mesa';
    $$('#p-modalidad button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mod === pMod)));
    $('#p-consumo-label').textContent = pMod === 'paquete' ? 'Precio del paquete (COP)' : 'Consumo por persona (COP)';
    pintarModHint();
  }
  function pintarModHint() {
    const t = tarifas(loc().perfil.plan), v = Number($('#p-consumo').value) || 0;
    $('#p-mod-hint').innerHTML = t.cliente === 0
      ? 'Con <b>Parche básico</b> no pagas nada por cliente ni comisión.'
      : pMod === 'paquete'
        ? `Combos, catas, talleres, boletas o covers. El cliente lo aparta en la app y lo <b>paga en tu local</b>. Pagas <b>${t.pct}%</b>${v >= 1000 ? ` (${money(Math.round(v * t.pct / 100))})` : ''} por cada paquete redimido.`
        : `El cliente reserva y paga su consumo en tu caja. Pagas <b>${money(t.cliente)}</b> por cada persona que llegue y se siente. Si nadie llega, $0.`;
  }
  function openParche(id = null, fecha = null) {
    closeMenus();
    editId = id;
    const p = id ? findParche(id) : null, P = loc().perfil;
    $('#dlg-parche-title').textContent = p ? 'Editar parche' : 'Nuevo parche oficial';
    $('#p-submit').textContent = p ? 'Guardar cambios' : 'Publicar parche';
    resetFields($('#form-parche'));
    const base = p ? p.inicio : fecha ? new Date(fecha + 'T12:00:00').getTime() : day0(NOW()) + DAY;
    const h = hDia(P, new Date(base).getDay());
    $('#p-titulo').value = p ? p.titulo : '';
    $('#p-fecha').value = dayKey(base); $('#p-fecha').min = dayKey(NOW());
    $('#p-hora').value = p ? hhmm(p.inicio) : (h && h.abierto ? h.open : '19:00');
    if (!p && fecha === dayKey(NOW()) && at(NOW(), $('#p-hora').value) < NOW()) $('#p-hora').value = hhmm(Math.ceil((NOW() + 30 * MIN) / (30 * MIN)) * 30 * MIN);
    $('#p-cupos').value = p ? p.cupos : 20;
    $('#p-consumo').value = p ? (p.modalidad === 'paquete' && p.precioPaquete ? p.precioPaquete : p.consumo) : 30000;
    setModalidad(p ? p.modalidad : 'mesa');
    $('#p-promo').value = p ? p.promo : '';
    $('#p-cat').value = (p && p.categoria) || P.cat || 'comida';
    setFoto(p && p.imagen ? { url: p.imagen } : null);
    $('#p-foto').value = '';
    dlgPos.lat = p ? p.lat ?? P.lat : P.lat; dlgPos.lng = p ? p.lng ?? P.lng : P.lng;
    if (!p && parchesDelMes() >= limitePlan()) {
      toast('Llegaste al límite de tu plan', `Parche básico incluye ${limitePlan()} parches al mes. Cámbialo en Perfil y plan.`, { error: true });
      location.hash = '#perfil';
      return;
    }
    $('#dlg-parche').showModal();
    setTimeout(async () => {
      if (!(await cargarLeaflet())) { $('#pmap-coords').textContent = 'El mapa no cargó; el parche queda en tu local.'; return; }
      if (!mapDlg) {
        mapDlg = L.map('map-parche').setView([dlgPos.lat, dlgPos.lng], 15);
        tiles().addTo(mapDlg);
        dlgMarker = L.marker([dlgPos.lat, dlgPos.lng], { icon: bizIcon(loc()), draggable: true }).addTo(mapDlg);
        const set = ll => { dlgPos.lat = +(+ll.lat).toFixed(6); dlgPos.lng = +(+ll.lng).toFixed(6); dlgMarker.setLatLng([dlgPos.lat, dlgPos.lng]); coords(); };
        mapDlg.on('click', e => set(e.latlng));
        dlgMarker.on('dragend', () => set(dlgMarker.getLatLng()));
        if (window.MPMapa) window.MPMapa.buscador(mapDlg, { placeholder: 'Busca dónde es', onElegir: r => set({ lat: r.lat, lng: r.lng }) });
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
  /* Foto del parche: { url } ya publicada o { file, blob, dataUrl } nueva */
  let foto = null;
  function setFoto(f) {
    foto = f;
    const prev = $('#photo-prev'), src = f ? (f.dataUrl || f.url) : '';
    prev.hidden = !src;
    if (src) { prev.src = src; prev.classList.remove('is-in'); void prev.offsetWidth; prev.classList.add('is-in'); } else prev.removeAttribute('src');
    $('#photo-drop').classList.toggle('has-photo', !!src);
    $('#photo-actions').hidden = !src;
  }
  async function elegirFoto(file) {
    const msg = $('#photo-drop').closest('.field').querySelector('.field-msg');
    msg.textContent = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { msg.textContent = 'Sube una imagen JPG, PNG o WebP.'; return; }
    if (file.size > 12 * 1024 * 1024) { msg.textContent = 'La foto pesa más de 12 MB. Prueba con otra.'; return; }
    $('#photo-drop').classList.add('is-loading');
    try { const r = await prepararFoto(file, DEMO ? 900 : 1400); setFoto({ file, ...r }); }
    catch (e) { msg.textContent = 'No pudimos leer esa foto. Prueba con otra.'; }
    $('#photo-drop').classList.remove('is-loading');
  }

  async function submitParche(e) {
    e.preventDefault();
    const bad = Object.keys(RULES_P).filter(id => !setField($('#' + id), RULES_P[id]($('#' + id).value)));
    if (bad.length) { $('#' + bad[0]).focus(); return; }
    const inicio = at(new Date($('#p-fecha').value + 'T12:00:00').getTime(), $('#p-hora').value);
    const datos = { titulo: $('#p-titulo').value.trim(), inicio, cupos: Number($('#p-cupos').value), consumo: Number($('#p-consumo').value), promo: $('#p-promo').value.trim(), lat: dlgPos.lat, lng: dlgPos.lng, categoria: $('#p-cat').value,
      modalidad: pMod, precioPaquete: pMod === 'paquete' ? Number($('#p-consumo').value) : null };
    if (REMOTE()) {
      const btn = $('#p-submit');
      btn.disabled = true; btn.classList.add('is-busy');
      try {
        let imagen = foto && foto.url ? foto.url : '';
        if (foto && foto.blob) imagen = await subirFoto(foto.blob);
        const P = loc().perfil;
        const row = {
          titulo: datos.titulo.slice(0, 60), categoria: datos.categoria, descripcion: datos.promo.slice(0, 400), inicio: new Date(inicio).toISOString(),
          lugar: P.nombre.length >= 3 ? P.nombre.slice(0, 80) : `Local ${P.nombre}`, barrio: String(P.barrio || '').slice(0, 40), lat: datos.lat, lng: datos.lng,
          costo: datos.consumo, presupuesto: datos.consumo, cupos_max: datos.cupos, imagen, promo: datos.promo.slice(0, 200),
          modalidad: datos.modalidad, precio_paquete: datos.precioPaquete,
        };
        const guardar = r => editId
          ? SB().from('parches').update(r).eq('id', editId).select('id').single()
          : SB().from('parches').insert(r).select('id').single();
        let res = await guardar(row);
        // Base sin el modelo de cobro todavía: se publica igual, sin el tipo de cobro
        if (res.error && /modalidad|precio_paquete/.test(res.error.message || '')) {
          const { modalidad, precio_paquete, ...sinCobro } = row;
          res = await guardar(sinCobro);
          if (!res.error) toast('Falta activar el cobro por resultados', 'El parche se publicó, pero el tipo de cobro se guarda cuando el equipo active la migración.', { error: true });
        }
        if (res.error) throw res.error;
        await cargarParchesRemotos();
        toast(editId ? 'Parche actualizado' : 'Parche publicado', editId ? 'Los confirmados ya ven los cambios.' : `${datos.titulo} ya está en el radar${imagen ? ' con su foto' : ''}.`);
        if (!editId) { listState.tab = 'proximos'; burstFrom(btn, 30); }
        $('#dlg-parche').close();
        if (route !== 'parches') location.hash = '#parches'; else render();
      } catch (err) {
        const [t, d] = errorDB(err);
        toast(t, d, { error: true });
      }
      btn.disabled = false; btn.classList.remove('is-busy');
      return;
    }
    datos.imagen = foto ? (foto.dataUrl || foto.url || '') : '';
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
      : w.sinHorario ? 'Sale de una en el mapa de Modo Parche con un anillo naranja. Pon tus horarios en Perfil y plan para que te avisemos si estás cerrado.'
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
  async function submitRelampago(e) {
    e.preventDefault();
    const ok1 = setField($('#r-promo'), $('#r-promo').value.trim().length < 4 ? 'Escribe la promoción (mínimo 4 caracteres).' : '');
    const n = Number($('#r-cupos').value);
    const ok2 = setField($('#r-cupos'), !Number.isInteger(n) || n < 2 ? 'Mínimo 2 cupos.' : n > 300 ? 'Máximo 300.' : '');
    if (!ok1 || !ok2) return;
    const prev = relampagoVivo();
    if (prev) prev.dur = Math.max(1, Math.round((NOW() - prev.inicio) / MIN));
    const P = loc().perfil, promo = $('#r-promo').value.trim();
    const p = { id: 'r' + NOW().toString(36), tipo: 'relampago', titulo: `Relámpago: ${promo}`.slice(0, 60), promo, organizador: P.nombre, inicio: NOW(), dur: relDur, cupos: n, consumo: 0, cuponId: $('#r-cupon').value || null, creado: true, creadoTs: NOW(), asistentes: [], cancelado: false, lat: P.lat, lng: P.lng, chat: [{ tipo: 'sys', texto: 'Lanzaste un parche relámpago', ts: NOW() }] };
    if (REMOTE()) {
      if (parchesDelMes() >= limitePlan()) { toast('Llegaste al límite de tu plan', 'Cambia a Parche Villavo para lanzar relámpagos sin límite.', { error: true }); return; }
      const { data, error } = await SB().from('parches').insert({
        titulo: p.titulo, categoria: P.cat || 'comida', descripcion: `Parche relámpago: ${promo}`, inicio: new Date(p.inicio).toISOString(),
        lugar: P.nombre.slice(0, 80), barrio: String(P.barrio || '').slice(0, 40), lat: P.lat, lng: P.lng,
        costo: 0, presupuesto: 0, cupos_max: Math.min(60, n), relampago: true, promo,
      }).select('id').single();
      if (error) { const [t, d] = errorDB(error); toast(t, d, { error: true }); return; }
      p.id = data.id; p.remoto = true; p.cupos = Math.min(60, n);
      if (prev && prev.remoto) prev.dur = Math.max(1, Math.round((NOW() - prev.inicio) / MIN));
    }
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

  /* =====================================================================
     14. CONFIGURACIÓN INICIAL, HORARIOS, MODO MESA, PAGOS Y LLEGADAS
  ===================================================================== */

  /* ---------- Lo que le falta a una cuenta nueva ---------- */
  function renderSetup() {
    const slot = $('#setup-slot');
    if (!slot) return;
    const L = loc(), P = L.perfil;
    const pasos = [
      { ok: !!P.horarios, txt: 'Pon tus horarios', sub: 'Tú decides qué días y a qué horas abres.', act: 'editar-horarios', ic: 'i-clock' },
      { ok: !P.sinUbicacion, txt: 'Confirma dónde queda tu local', sub: 'Busca tu dirección o toca el mapa en Perfil y plan.', act: 'ir-ubicacion', ic: 'i-pin' },
      { ok: L.cupones.length > 0, txt: 'Crea tu primer cupón', sub: 'Tú eliges el regalo, la regla y cuántos entregas.', act: 'nuevo-cupon', ic: 'i-ticket' },
      { ok: (L.mesas || []).length > 0, txt: 'Lanza una promo de Modo Mesa', sub: 'Para los grupos que ya vienen juntos.', act: 'nueva-mesa', ic: 'i-table' },
    ];
    if (P.planPendiente && P.planPendiente !== P.plan) pasos.unshift({ ok: false, txt: `Activa ${(PLANES[P.planPendiente] || PLANES.villavo).nombre}`, sub: 'Lo elegiste al registrarte. Sin mensualidad: solo pagas por clientes que llegan.', act: 'pagar-plan', ic: 'i-card' });
    const listos = pasos.filter(p => p.ok).length;
    if (listos === pasos.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<section class="setup" aria-labelledby="h-setup">
        <header><div><h2 id="h-setup">Arma tu local en ModoParche</h2><p class="meta">${listos} de ${pasos.length} listos</p></div>
          <span class="track" role="img" aria-label="${listos} de ${pasos.length} pasos listos"><i class="in" style="width:${listos / pasos.length * 100}%"></i></span></header>
        <ul class="setup-list">${pasos.map(p => `<li class="${p.ok ? 'is-done' : ''}"><span class="setup-ic">${ic(p.ok ? 'i-check' : p.ic)}</span>
          <span class="setup-txt"><b>${esc(p.txt)}</b><small>${esc(p.sub)}</small></span>
          ${p.ok ? '<span class="pill pos">Listo</span>' : `<button class="btn btn--sm" data-action="${p.act}">Hacerlo</button>`}</li>`).join('')}</ul>
      </section>`;
  }

  /* ---------- Horarios: los pone el dueño ---------- */
  function openHorarios() {
    closeMenus();
    const P = loc().perfil;
    const base = P.horarios || horarios('10:00', '22:00'); // solo una sugerencia: no se guarda hasta confirmar
    $('#hours-edit').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const h = base[d];
      return `<div class="he-row" data-dia="${d}">
        <label class="he-day"><input type="checkbox" class="switch" data-he="abierto" ${h.abierto ? 'checked' : ''}><b>${DIAS[d]}</b></label>
        <input class="input num" type="time" data-he="open" value="${h.open}" aria-label="${DIAS[d]}: abre a las">
        <span class="he-sep">a</span>
        <input class="input num" type="time" data-he="close" value="${h.close}" aria-label="${DIAS[d]}: cierra a las">
        <small class="he-note"></small>
      </div>`;
    }).join('');
    $('#horarios-msg').textContent = '';
    $('#horarios-msg').className = 'hint';
    if (!P.horarios) $('#horarios-msg').textContent = 'Te dejamos de 10:00 a. m. a 10:00 p. m. como punto de partida. Cámbialo a tu horario real.';
    $$('#hours-edit .he-row').forEach(notaHorario);
    $('#dlg-horarios').showModal();
  }
  function notaHorario(row) {
    const ab = $('[data-he="abierto"]', row).checked, o = $('[data-he="open"]', row).value, c = $('[data-he="close"]', row).value;
    $$('input[type="time"]', row).forEach(i => { i.disabled = !ab; });
    row.classList.toggle('is-off', !ab);
    $('.he-note', row).textContent = !ab ? 'Cerrado' : o && c && c < o ? 'Cierra al día siguiente' : '';
  }
  function leerHorarios() {
    const out = {};
    for (const row of $$('#hours-edit .he-row')) {
      const d = Number(row.dataset.dia), ab = $('[data-he="abierto"]', row).checked;
      const o = $('[data-he="open"]', row).value, c = $('[data-he="close"]', row).value;
      if (ab && (!o || !c)) return { error: `Pon la hora en que abres y cierras el ${DIAS[d].toLowerCase()}.` };
      if (ab && o === c) return { error: `El ${DIAS[d].toLowerCase()} abre y cierra a la misma hora.` };
      out[d] = { abierto: ab, open: o || '10:00', close: c || '22:00' };
    }
    if (!Object.values(out).some(h => h.abierto)) return { error: 'Marca al menos un día en que abras.' };
    return { horarios: out };
  }
  async function submitHorarios(e) {
    e.preventDefault();
    const r = leerHorarios();
    if (r.error) { $('#horarios-msg').textContent = r.error; $('#horarios-msg').className = 'field-msg'; return; }
    const btn = $('#h-submit');
    btn.disabled = true;
    const ok = await guardarNegocio({ horarios: r.horarios });
    btn.disabled = false;
    if (!ok) return;
    loc().perfil.horarios = r.horarios;
    ultimoSync = null; save();
    $('#dlg-horarios').close();
    toast('Horarios guardados', 'Ya salen en tu tarjeta y el panel sabe cuándo estás abierto.');
    render();
  }
  function copiarLunes() {
    const lunes = $('#hours-edit .he-row[data-dia="1"]');
    if (!lunes) return;
    const ab = $('[data-he="abierto"]', lunes).checked, o = $('[data-he="open"]', lunes).value, c = $('[data-he="close"]', lunes).value;
    $$('#hours-edit .he-row').forEach(row => {
      $('[data-he="abierto"]', row).checked = ab;
      $('[data-he="open"]', row).value = o; $('[data-he="close"]', row).value = c;
      notaHorario(row);
    });
  }

  /* ---------- Modo Mesa (lado del negocio) ---------- */
  const mesaUI = { tab: 'proximas', editId: null };
  const ESTADOS_MESA = { pendiente: ['Por confirmar', 'warn'], confirmada: ['Confirmada', 'pos'], rechazada: ['Rechazada', ''], cancelada: ['La cancelaron', ''], llego: ['Llegaron', 'pos'], no_llego: ['No llegaron', 'neg'] };
  const diasMesaTxt = dias => { const d = [...(dias || [])].sort(); if (d.length === 7) return 'Todos los días'; if (d.join() === '1,2,3,4,5') return 'Lunes a viernes'; return d.map(x => DIAS[x].slice(0, 3)).join(', '); };
  const mesaDeFila = r => ({ id: r.id, titulo: r.titulo, beneficio: r.beneficio, descripcion: r.descripcion || '', min: r.min_personas, max: r.max_personas, dias: r.dias || [], desde: String(r.hora_desde).slice(0, 5), hasta: String(r.hora_hasta).slice(0, 5), cupos: r.mesas_por_dia, activa: r.activa, vence: r.vence || '' });
  const reservaDeFila = r => ({ id: r.id, promoId: r.promo_id, persona: persona(r.usuario_id), personas: r.personas, llegada: Date.parse(r.llegada), nota: r.nota || '', estado: r.estado, codigo: r.codigo, creado: Date.parse(r.creado_en) || NOW(), llegaron: r.llegaron || null, llegadaMetodo: r.llegada_metodo || null, clienteLlego: r.cliente_llego_en ? Date.parse(r.cliente_llego_en) : null });

  async function cargarMesas() {
    if (!REMOTE()) return;
    const L = loc();
    const [a, b] = await Promise.all([
      SB().from('mesa_promos').select('*').eq('negocio_id', ME.id).order('creado_en', { ascending: false }),
      SB().from('mesa_reservas').select('*').eq('negocio_id', ME.id).gte('llegada', new Date(NOW() - 30 * DAY).toISOString()).order('llegada'),
    ]);
    if (a.error || b.error) { L.mesasError = true; return; } // la migración de Modo Mesa todavía no está corrida
    L.mesasError = false;
    await cacheNombres((b.data || []).map(r => r.usuario_id));
    L.mesas = (a.data || []).map(mesaDeFila);
    L.reservas = (b.data || []).map(reservaDeFila);
  }

  function renderMesa() {
    const L = loc(), promos = L.mesas || [], res = L.reservas || [];
    $$('#mesa-tabs [data-mtab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mtab === mesaUI.tab)));
    const viva = r => r.llegada > NOW() - 3 * HOUR && ['pendiente', 'confirmada', 'llego'].includes(r.estado);
    const lista = mesaUI.tab === 'proximas'
      ? res.filter(viva).sort((a, b) => (a.estado === 'pendiente' ? -1 : 0) - (b.estado === 'pendiente' ? -1 : 0) || a.llegada - b.llegada)
      : res.filter(r => !viva(r)).sort((a, b) => b.llegada - a.llegada);
    const promo = id => promos.find(m => m.id === id);
    $('#mesa-reservas').innerHTML = lista.map(r => {
      const [txt, cls] = ESTADOS_MESA[r.estado] || ESTADOS_MESA.pendiente, m = promo(r.promoId);
      const hoyOPasada = r.llegada < NOW() + 6 * HOUR;
      const acciones = r.estado === 'pendiente'
        ? `<button class="btn primary btn--sm" data-action="mesa-estado" data-id="${r.id}" data-estado="confirmada">${ic('i-check')}Confirmar</button><button class="btn ghost btn--sm" data-action="mesa-estado" data-id="${r.id}" data-estado="rechazada">No puedo</button>`
        : r.estado === 'confirmada' && hoyOPasada
          ? `${r.clienteLlego ? `<small class="mesa-gps">Avisó que llegó a las ${fmtHora(r.clienteLlego)}. Confírmalo</small>` : ''}<button class="btn btn--sm" data-action="mesa-estado" data-id="${r.id}" data-estado="llego">${ic('i-door')}Llegaron</button><button class="btn ghost btn--sm" data-action="mesa-estado" data-id="${r.id}" data-estado="no_llego">No llegaron</button>`
          : r.estado === 'llego'
            ? `<label class="mesa-llegaron">Llegaron <select class="input" data-mesa-llegaron="${r.id}" aria-label="Cuántas personas llegaron">${Array.from({ length: r.personas }, (_, k) => k + 1).map(n => `<option value="${n}" ${n === (r.llegaron || r.personas) ? 'selected' : ''}>${n}</option>`).join('')}</select> de ${r.personas}</label>${r.llegadaMetodo === 'gps' ? '<small class="mesa-gps">Marcó su llegada con GPS</small>' : r.llegadaMetodo === 'qr' ? '<small class="mesa-gps">Escaneó el QR del local</small>' : ''}`
            : '';
      return `<li class="row mesa-row">${avatar(r.persona)}
        <span class="row-main"><b>${esc(r.persona.nombre)} · ${r.personas} personas</b><small>${esc(m ? m.titulo : 'Promo de mesa')} · ${esc(fmtCuando(r.llegada))} · <span class="code">${esc(r.codigo)}</span>${r.nota ? ` · ${esc(r.nota)}` : ''}</small>${m && m.beneficio && ['pendiente', 'confirmada', 'llego'].includes(r.estado) ? `<small class="mesa-ben-estado ${r.estado === 'llego' ? 'is-on' : ''}">${ic('i-gift')}${r.estado === 'llego' ? 'Entrégales ahora: ' : 'Se entrega cuando lleguen: '}${esc(m.beneficio)}</small>` : ''}</span>
        <span class="pill ${cls}">${esc(txt)}</span>
        <span class="mesa-acts">${acciones}</span></li>`;
    }).join('') || `<li><p class="empty">${L.mesasError ? 'Modo Mesa todavía no está activo en la base de datos. Corre la migración 20261101130000_negocios_mesa_checkin_pagos.sql.' : promos.length ? (mesaUI.tab === 'proximas' ? 'Todavía no hay reservas. Comparte tu promo en redes: la gente la encuentra en el inicio de la app.' : 'Aquí quedan las reservas que ya pasaron.') : 'Lanza tu primera promo de mesa para empezar a recibir grupos.'}</p></li>`;

    const act = promos.filter(m => m.activa).length;
    $('#mesa-promos-meta').textContent = promos.length ? `${act} de ${promos.length} ${promos.length === 1 ? 'activa' : 'activas'}` : '';
    $('#mesa-promos').innerHTML = promos.map(m => `<li class="mesa-promo ${m.activa ? '' : 'is-off'}">
        <div class="mesa-promo-top"><b>${esc(m.titulo)}</b><input type="checkbox" class="switch" data-mesa-switch="${m.id}" ${m.activa ? 'checked' : ''} aria-label="${m.activa ? 'Pausar' : 'Activar'} ${esc(m.titulo)}"></div>
        <p class="mesa-promo-ben">${ic('i-gift')}${esc(m.beneficio)}</p>
        <p class="hint">${m.min} a ${m.max} personas · ${esc(diasMesaTxt(m.dias))} · ${esc(horaTxt(m.desde))} a ${esc(horaTxt(m.hasta))} · ${m.cupos} ${m.cupos === 1 ? 'mesa' : 'mesas'} por día${m.vence ? ` · hasta el ${esc(fmtDiaMes(new Date(m.vence + 'T12:00:00').getTime()))}` : ''}</p>
        <div class="mesa-promo-acts"><button class="btn btn--sm" data-action="editar-mesa" data-id="${m.id}">${ic('i-edit')}Editar</button><button class="btn ghost btn--sm danger" data-action="borrar-mesa" data-id="${m.id}">${ic('i-trash')}Borrar</button></div>
      </li>`).join('') || `<li><div class="empty">Una promo de mesa es para grupos que ya vienen juntos: una botella de cortesía, un combo o una experiencia.<button class="btn primary btn--sm" data-action="nueva-mesa">${ic('i-plus')}Nueva promo de mesa</button></div></li>`;
  }

  function openMesaPromo(id = null) {
    closeMenus();
    const L = loc(), P = L.perfil, m = id ? (L.mesas || []).find(x => x.id === id) : null;
    mesaUI.editId = m ? m.id : null;
    $('#dlg-mesa-title').textContent = m ? 'Editar promo de mesa' : 'Nueva promo de mesa';
    $('#m-submit').textContent = m ? 'Guardar cambios' : 'Publicar promo';
    resetFields($('#form-mesa'));
    const hoy = hDia(P, new Date(NOW()).getDay());
    $('#m-titulo').value = m ? m.titulo : '';
    $('#m-beneficio').value = m ? m.beneficio : '';
    $('#m-desc').value = m ? m.descripcion : '';
    $('#m-min').value = m ? m.min : 4;
    $('#m-max').value = m ? m.max : 10;
    $('#m-desde').value = m ? m.desde : (hoy && hoy.abierto ? hoy.open : '18:00');
    $('#m-hasta').value = m ? m.hasta : (hoy && hoy.abierto ? hoy.close : '23:00');
    $('#m-cupos').value = m ? m.cupos : 5;
    $('#m-vence').value = m ? m.vence : '';
    $('#m-vence').min = dayKey(NOW());
    // Por defecto, los días en que el local abre
    const abiertos = P.horarios ? [0, 1, 2, 3, 4, 5, 6].filter(d => P.horarios[d].abierto) : [0, 1, 2, 3, 4, 5, 6];
    const dias = m ? m.dias : abiertos;
    $('#m-dias').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label class="day-chip"><input type="checkbox" value="${d}" ${dias.includes(d) ? 'checked' : ''}><span>${DIAS[d].slice(0, 3)}</span></label>`).join('');
    $('#m-dias-msg').textContent = '';
    $('#dlg-mesa').showModal();
  }
  async function submitMesaPromo(e) {
    e.preventDefault();
    const v = id => $('#' + id).value.trim();
    const min = Number(v('m-min')), max = Number(v('m-max')), cupos = Number(v('m-cupos'));
    const dias = $$('#m-dias input:checked').map(i => Number(i.value));
    const ok = [
      setField($('#m-titulo'), v('m-titulo').length < 4 ? 'Mínimo 4 caracteres.' : ''),
      setField($('#m-beneficio'), v('m-beneficio').length < 4 ? 'Di qué gana el grupo.' : ''),
      setField($('#m-min'), !Number.isInteger(min) || min < 2 ? 'Mínimo 2 personas.' : min > 30 ? 'Máximo 30.' : ''),
      setField($('#m-max'), !Number.isInteger(max) || max < 2 ? 'Mínimo 2.' : max > 30 ? 'Máximo 30.' : max < min ? 'Debe ser mayor o igual al mínimo.' : ''),
      setField($('#m-desde'), !v('m-desde') ? 'Elige la hora.' : ''),
      setField($('#m-hasta'), !v('m-hasta') ? 'Elige la hora.' : v('m-hasta') === v('m-desde') ? 'Debe ser distinta a la de inicio.' : ''),
      setField($('#m-cupos'), !Number.isInteger(cupos) || cupos < 1 ? 'Mínimo 1.' : cupos > 100 ? 'Máximo 100.' : ''),
    ].every(Boolean);
    $('#m-dias-msg').textContent = dias.length ? '' : 'Marca al menos un día.';
    if (!ok || !dias.length) return;
    const datos = { titulo: v('m-titulo'), beneficio: v('m-beneficio'), descripcion: v('m-desc'), min, max, dias, desde: v('m-desde'), hasta: v('m-hasta'), cupos, vence: v('m-vence') };
    const L = loc(), editId = mesaUI.editId;
    if (REMOTE()) {
      const row = { titulo: datos.titulo, beneficio: datos.beneficio, descripcion: datos.descripcion, min_personas: min, max_personas: max, dias, hora_desde: datos.desde, hora_hasta: datos.hasta, mesas_por_dia: cupos, vence: datos.vence || null };
      const btn = $('#m-submit'); btn.disabled = true;
      const res = editId
        ? await SB().from('mesa_promos').update(row).eq('id', editId).select('*').single()
        : await SB().from('mesa_promos').insert(row).select('*').single();
      btn.disabled = false;
      if (res.error) { toast('No se guardó la promo', res.error.hint || res.error.message, { error: true }); return; }
      const fila = mesaDeFila(res.data);
      L.mesas = editId ? L.mesas.map(x => x.id === editId ? fila : x) : [fila].concat(L.mesas || []);
    } else {
      if (editId) Object.assign(L.mesas.find(x => x.id === editId), datos);
      else L.mesas = [{ id: 'm' + NOW().toString(36), activa: true, ...datos }].concat(L.mesas || []);
      save();
    }
    $('#dlg-mesa').close();
    toast(editId ? 'Promo actualizada' : 'Promo de mesa publicada', editId ? 'Las reservas que ya tienes no cambian.' : 'Ya sale en el inicio de la app para que los grupos reserven.');
    if (route !== 'mesa') location.hash = '#mesa'; else render();
  }
  async function toggleMesa(id, on) {
    const m = (loc().mesas || []).find(x => x.id === id);
    if (!m) return;
    if (REMOTE()) {
      const { error } = await SB().from('mesa_promos').update({ activa: on }).eq('id', id);
      if (error) { toast('No se cambió', error.message, { error: true }); renderMesa(); return; }
    }
    m.activa = on; save();
    toast(on ? 'Promo activa' : 'Promo pausada', on ? `${m.titulo} vuelve a salir en la app.` : `${m.titulo} deja de salir. Las reservas que ya tienes siguen.`);
    renderMesa();
  }
  async function borrarMesa(id) {
    const L = loc(), m = (L.mesas || []).find(x => x.id === id);
    if (!m) return;
    const vivas = (L.reservas || []).filter(r => r.promoId === id && r.llegada > NOW() && ['pendiente', 'confirmada'].includes(r.estado)).length;
    const ok = await confirmar('Borrar promo de mesa', `"${m.titulo}" deja de salir en la app.${vivas ? ` Ojo: tienes ${vivas} ${vivas === 1 ? 'reserva próxima que también se borra' : 'reservas próximas que también se borran'}. Mejor páusala si quieres conservarlas.` : ''}`, 'Sí, borrar');
    if (!ok) return;
    if (REMOTE()) {
      const { error } = await SB().from('mesa_promos').delete().eq('id', id);
      if (error) { toast('No se borró', error.message, { error: true }); return; }
    }
    L.mesas = L.mesas.filter(x => x.id !== id);
    L.reservas = (L.reservas || []).filter(r => r.promoId !== id);
    save();
    toast('Promo borrada', m.titulo);
    render();
  }
  // Cuántas personas de la reserva llegaron: es lo que se cobra en consumo libre
  async function llegaronReserva(id, cuantos, sel) {
    const r = (loc().reservas || []).find(x => x.id === id);
    if (!r || !(cuantos >= 1)) return;
    if (REMOTE()) {
      sel.disabled = true;
      const { error } = await SB().rpc('negocio_mesa_llegaron', { p_id: id, p_cuantos: cuantos });
      sel.disabled = false;
      if (error) { sel.value = String(r.llegaron || r.personas); toast('No se pudo cambiar', /negocio_mesa_llegaron|PGRST202/.test(error.message || '') ? 'Falta activar el cobro por resultados en la base de datos.' : (error.hint || error.message), { error: true }); return; }
    }
    r.llegaron = cuantos; save();
    toast('Listo', `${cuantos} de ${r.personas} personas llegaron. Así queda en tus cobros.`);
    cobrosCargados = 0;
  }
  async function terminarRelampago(id, btn) {
    const p = findParche(id); if (!p) return;
    btn.disabled = true;
    if (REMOTE() && p.remoto) {
      const { error } = await SB().rpc('terminar_relampago', { p_parche: p.id });
      if (error && !/terminar_relampago|PGRST202/.test(error.message || '')) { btn.disabled = false; toast('No se pudo terminar', error.hint || error.message, { error: true }); return; }
    }
    p.dur = Math.max(1, Math.round((NOW() - p.inicio) / MIN));
    save();
    toast('Relámpago terminado', `${p.promo} salió del mapa.`);
    render();
  }
  async function estadoReserva(id, estado) {
    const r = (loc().reservas || []).find(x => x.id === id);
    if (!r) return;
    if (REMOTE()) {
      const { error } = await SB().rpc('negocio_mesa_estado', { p_id: id, p_estado: estado });
      if (error) { toast('No se pudo cambiar', error.hint || error.message, { error: true }); return; }
    }
    r.estado = estado;
    // Cupón de bienvenida: se entrega cuando la mesa llega, nunca antes
    let regalos = [];
    if (estado === 'llego') {
      const L = loc();
      for (const k of L.cupones.filter(k => k.regla === 'bienvenida' && !L.codigos.some(c => c.cuponId === k.id && c.persona === r.persona.nombre))) { const x = entregar(k, r.persona.nombre, { id: 'mesa-' + r.id }, r.persona.id); if (x) regalos.push(x); }
    }
    save();
    if (regalos.length) avisarCupones(r.persona.nombre, regalos);
    const txt = { confirmada: ['Mesa confirmada', `Le avisamos a ${r.persona.nombre}.`], rechazada: ['Reserva rechazada', `Le avisamos a ${r.persona.nombre} que pruebe otra hora.`], llego: ['Llegaron', `${r.persona.nombre} y su grupo están adentro.`], no_llego: ['Marcada como no llegaron', r.codigo] }[estado];
    toast(txt[0], txt[1]);
    tone(estado === 'llego' || estado === 'confirmada' ? 'ok' : 'in');
    renderShell(); renderMesa();
    if (estado === 'llego' && REMOTE()) { cobrosCargados = 0; cargarCobros(true); cargarResenasReales().catch(fallo('reseñas')); }
  }

  /* ---------- Pago de planes con Wompi ----------
     1. La Edge Function wompi-checkout crea la referencia y la firma de
        integridad (el secreto nunca llega al navegador).
     2. Se abre el widget oficial de Wompi (tarjeta, PSE, Nequi, Bancolombia).
     3. El plan sube solo cuando Wompi confirma el pago (webhook), y el panel
        lo sigue en vivo. */
  const WOMPI_WIDGET = 'https://checkout.wompi.co/widget.js';
  function cargarWompi() {
    if (window.WidgetCheckout) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = WOMPI_WIDGET;
      s.onload = () => (window.WidgetCheckout ? res() : rej(new Error('Wompi no cargó.')));
      s.onerror = () => rej(new Error('No pudimos abrir Wompi. Revisa tu conexión.'));
      document.head.appendChild(s);
    });
  }
  async function recargarNegocio() {
    const { data: n } = await SB().from('negocios').select('*').eq('id', ME.id).maybeSingle();
    if (!n) return;
    const P = loc().perfil;
    P.plan = n.plan; P.planVence = n.plan_vence ? Date.parse(n.plan_vence) : null; P.planPendiente = n.plan_pendiente || null;
    P.planProgramado = n.plan_programado || null; P.planProgramadoEn = n.plan_programado_en || null;
  }
  /* ---------- Anuncios: darse de baja ---------- */
  async function cambiarAnunciosNegocio(on, input) {
    if (!REMOTE()) { toast(on ? 'Anuncios activados' : 'Te diste de baja', 'En el panel de ejemplo no se guarda.'); return; }
    const { error } = await SB().rpc('cambiar_anuncios', { p_recibir: on });
    if (error) { input.checked = !on; toast('No se pudo guardar', error.message, { error: true }); return; }
    toast(on ? 'Anuncios activados' : 'Te diste de baja de los anuncios', on ? 'Te contamos novedades para negocios.' : 'Ya no te llegan anuncios. Los avisos de tus parches, mesas y pagos siguen igual.');
  }

  /* ---------- Ubicación exacta del local ----------
     Si el negocio no tiene punto en el mapa, lo buscamos con su dirección. */
  async function ubicarLocalAuto() {
    const P = loc().perfil;
    if (!REMOTE() || !P.sinUbicacion || !window.MPMapa) return;
    const r = await window.MPMapa.geocodificarDireccion({ direccion: P.direccion === 'Sin dirección' ? '' : P.direccion, barrio: P.barrio, ciudad: P.ciudad, nombre: P.nombre });
    if (!r || !(await guardarNegocio({ lat: r.lat, lng: r.lng }))) return;
    P.lat = r.lat; P.lng = r.lng; P.sinUbicacion = r.precision !== 'direccion' && r.precision !== 'lugar';
    mapDirty = true; save();
    toast('Ubicamos tu local en el mapa', r.precision === 'direccion' || r.precision === 'lugar'
      ? 'Lo encontramos con tu dirección. Revisa el pin en Perfil y plan.'
      : `Quedó ${r.precision === 'barrio' ? 'en tu barrio' : 'en el centro de la ciudad'}. Busca tu dirección o toca el mapa en Perfil y plan para dejarlo exacto.`);
    render();
  }
  // Al soltar el pin, mostramos la dirección real de ese punto
  function mostrarDireccionPin(lat, lng) {
    if (!window.MPMapa) return;
    window.MPMapa.inverso(lat, lng).then(r => { if (r && r.texto) $('#ubic-meta').textContent = `${r.texto} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`; }).catch(() => { /* sin dirección: quedan las coordenadas */ });
  }

  /* ---------- QR de llegada para la puerta ---------- */
  let detenerBizQR = null;
  async function abrirQRLlegada(id) {
    closeMenus();
    const p = findParche(id || doorState.id);
    if (!p) { toast('Elige un parche', 'El QR de llegada es de un parche de hoy.', { error: true }); return; }
    if (!window.MPCheckin) return;
    $('#qr-note').innerHTML = `Quien llega a <b>${esc(p.titulo)}</b> abre el chat del parche en su app, toca <b>Escanear QR</b> y apunta aquí. El código cambia cada 30 segundos.`;
    $('#biz-qr-box').innerHTML = '<span class="qr-wait" aria-label="Generando el QR"></span>';
    $('#dlg-qr').showModal();
    let clave;
    if (p.remoto) {
      const { data, error } = await SB().rpc('mi_clave_checkin', { p_parche: p.id });
      if (error) { $('#biz-qr-box').innerHTML = `<p class="qr-err">${esc(error.hint || error.message)}</p>`; return; }
      clave = data;
    } else clave = { secreto: 'demo-' + p.id, ahora: NOW() };
    if (detenerBizQR) detenerBizQR();
    try { detenerBizQR = await window.MPCheckin.mostrarQR({ clave, parcheId: p.id, qr: $('#biz-qr-box'), cuenta: $('#biz-qr-count'), codigo: $('#biz-qr-code'), barra: $('#biz-qr-bar') }); }
    catch (e) { $('#biz-qr-box').innerHTML = `<p class="qr-err">${esc(e.message)}</p>`; }
  }
  function pararQRLlegada() { if (detenerBizQR) { detenerBizQR(); detenerBizQR = null; } }

  // Las llegadas que marca el local también quedan en la base (organizador_checkin)
  const esUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
  function marcarEnBase(p, a, llego, antes = null) {
    if (!REMOTE()) return;
    let accion = null;
    if (a.walkin && a.walkinId) accion = { tipo: 'walkin', clave: 'w:' + a.walkinId, id: a.walkinId, llego: llego ? new Date(a.llego || NOW()).toISOString() : null };
    else if (p.remoto && esUuid(a.id)) accion = { tipo: 'checkin', clave: `c:${p.id}:${a.id}`, parche: p.id, usuario: a.id, llego };
    if (!accion) return;
    const previo = a.metodoAntes ? { llego: a.llegoAntes, metodo: a.metodoAntes } : antes;
    a.metodoAntes = a.llegoAntes = undefined;
    // Sin señal: queda en la cola y se envía al volver (la lista del Modo Puerta sigue sirviendo)
    if (SOLO_LECTURA || navigator.onLine === false) { encolar(accion); return; }
    enviarAccion(accion).then(error => {
      if (!error) return;
      if (sinRed(error)) { encolar(accion); return; }
      toast(llego ? 'No se confirmó la llegada' : 'No se deshizo la llegada', error.hint || error.message || 'Intenta de nuevo.', { error: true });
      // El panel vuelve a mostrar lo que dice la base
      if (previo) { a.llego = previo.llego; a.metodo = previo.metodo; save(); if (!$('#door-mode').hidden) renderDoor(); else render(); }
    });
  }

  /* ---------- Cancelar parche y solicitud de cambio ---------- */
  async function askCancel(id) {
    closeMenus();
    const p = findParche(id);
    const ok = await confirmar('Cancelar parche', `"${p.titulo}" (${fmtCuando(p.inicio)}) sale del mapa y avisamos a ${confirmados(p)} ${confirmados(p) === 1 ? 'confirmado' : 'confirmados'} por el chat del grupo.`, 'Sí, cancelar');
    if (!ok) return;
    if (p.remoto) {
      const { error } = await SB().from('parches').delete().eq('id', p.id);
      if (error) { const [t, d] = errorDB(error); toast(t, d, { error: true }); return; }
    }
    p.cancelado = true;
    p.chat.push({ tipo: 'sys', texto: 'El local canceló el parche', ts: NOW() });
    save();
    toast('Parche cancelado', `Avisamos a ${confirmados(p)} ${confirmados(p) === 1 ? 'persona' : 'personas'}.`);
    render();
  }
  function limpiarLocal() {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('mp_') && !['mp_tema', 'mp_aviso_cookies_v1'].includes(k) && !k.startsWith('mp_cupones_subidos_')).forEach(k => localStorage.removeItem(k));
      Object.keys(sessionStorage).filter(k => k.startsWith('mp_')).forEach(k => sessionStorage.removeItem(k));
    } catch (e) { /* sin almacenamiento */ }
  }
  async function logout() {
    if (DEMO || !SB()) { location.href = 'empresa.html'; return; }
    cerrarCanalesNegocio();
    try { await SB().auth.signOut(); } catch (e) { /* salimos igual */ }
    limpiarLocal();
    location.replace('empresa.html#entrar');
  }

  /* =====================================================================
     13. EVENTOS E INICIO
  ===================================================================== */
  const typing = el => el && (el.closest('input, textarea, select, [contenteditable]') || el.closest('dialog[open]'));
  function bind() {
    window.addEventListener('hashchange', go);
    $('#menu-toggle').addEventListener('click', () => toggleMenu(true));
    $('#menu-close').addEventListener('click', () => toggleMenu(false));
    $('#sound-btn').addEventListener('click', () => { S.sonido = !S.sonido; save(); renderShell(); if (S.sonido) tone('in'); toast(S.sonido ? 'Sonido activado' : 'Sonido apagado', S.sonido ? 'Suena al validar cupones y marcar llegadas.' : 'El panel valida en silencio.'); });

    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (!e.target.closest('#row-menu') && !e.target.closest('[data-action="row-menu"], [data-action="cupon-menu"]')) $('#row-menu').hidden = true;
      if (!a) return;
      const id = a.dataset.id;
      switch (a.dataset.action) {
        case 'logout': logout(); break;
        case 'editar-perfil': openPerfil(); break;
        case 'cambiar-plan': cambiarPlan(a.dataset.plan); break;
        case 'pagar-plan': cambiarPlan('villavo'); break;
        case 'cobros-recargar': conCarga(a, () => cargarCobros(true)); break;
        case 'liq-reportar': reportarPago(a.dataset.id); break;
        case 'liq-medio': elegirMedioPago(a); break;
        case 'liq-rep-enviar': enviarReportePago(a.dataset.id, a); break;
        case 'liq-pagar': pagarLiquidacion(a.dataset.id, a); break;
        case 'liq-datafono': abrirDatafono(a.dataset.id, Number(a.dataset.monto) || null); break;
        case 'liq-abonar': abonarLiquidacion(a.dataset.id, a); break;
        case 'df-copiar': copiarDato(a); break;
        case 'df-abrir': abrirWompiDatafono(a); break;
        case 'liq-comprobante': comprobanteLiquidacion(a.dataset.id); break;
        case 'cobro-reclamar': reclamarCobro(a.dataset.id, a.dataset.codigo); break;
        case 'cobros-csv': exportarCobrosCSV(); break;
        case 'qrlocal-imprimir': imprimirQRLocal(); break;
        case 'qrlocal-nuevo': cargarQRLocal(true); break;
        case 'ref-copiar': copiarInvitacion(a.dataset.link); break;
        case 'copiar-ref': copiarRef(a.dataset.ref); break;
        case 'editar-horarios': openHorarios(); break;
        case 'horario-copiar': copiarLunes(); break;
        case 'ir-ubicacion': if (route !== 'perfil') location.hash = '#perfil'; setTimeout(() => { const m = $('#map-perfil'); if (m) m.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' }); }, 160); break;
        case 'nueva-mesa': openMesaPromo(); break;
        case 'editar-mesa': openMesaPromo(id); break;
        case 'borrar-mesa': borrarMesa(id); break;
        case 'mesa-estado': estadoReserva(id, a.dataset.estado); break;
        case 'door-qr': abrirQRLlegada(doorState.id); break;
        case 'qr-parche': abrirQRLlegada(id); break;
        case 'cerrar-qr': pararQRLlegada(); $('#dlg-qr').close(); break;
        case 'mis-datos': descargarMisDatos(a); break;
        case 'borrar-cuenta': borrarCuenta(a); break;
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
        case 'sacar-asistente': {
          const p = findParche(a.dataset.pid), u = p && p.asistentes.find(x => x.id === a.dataset.uid);
          if (!u || u.llego) break;
          (async () => {
            if (REMOTE() && p.remoto && esUuid(u.id)) {
              let r = await SB().rpc('sacar_del_parche', { p_parche: p.id, p_usuario: u.id });
              if (r.error && /sacar_del_parche|PGRST202/i.test(`${r.error.code} ${r.error.message}`)) {
                r = await SB().from('parche_miembros').delete().eq('parche_id', p.id).eq('usuario_id', u.id);
              }
              if (r.error) { toast('No se pudo sacar del parche', errorDB(r.error).join('. '), { error: true }); return; }
            }
            p.asistentes = p.asistentes.filter(x => x.id !== u.id);
            save(); renderShell(); renderAsistentes();
            toast(`Sacaste a ${u.nombre}`, 'Su cupo quedó libre en el parche.');
          })();
          break;
        }
        case 'usar-codigo': $('#code-input').value = a.dataset.code; $('#code-input').focus(); $('#validar').scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' }); break;
        case 'ir-validar': irValidar(); break;
        case 'escanear': openScan(); break;
        case 'cerrar-scan': closeScan(); break;
        case 'deshacer-canje': deshacerCanje(a.dataset.code); break;
        case 'nuevo-cupon': openCupon(); break;
        case 'editar-cupon': openCupon(id); break;
        case 'duplicar-cupon': openCupon(id, true); break;
        case 'eliminar-cupon': closeMenus(); eliminarCupon(id); break;
        case 'terminar-rel': terminarRelampago(id, a); break;
        case 'modo-puerta': openDoor(id || null); break;
        case 'cerrar-puerta': closeDoor(); break;
        case 'door-in': doorIn(a.dataset.uid); break;
        case 'door-out': { const p = findParche(doorState.id), u = p && p.asistentes.find(x => x.id === a.dataset.uid); if (u) { checkOut(p, u); renderDoor(); toast('Llegada deshecha', u.nombre); } break; }
        case 'door-confirmar': { const p = findParche(doorState.id), u = p && p.asistentes.find(x => x.id === a.dataset.uid); if (u) { u.metodoAntes = u.metodo; u.llegoAntes = u.llego; u.llego = null; u.metodo = 'organizador'; doorIn(u.id); } break; }
        case 'door-walkin': doorWalkin(); break;
        case 'flip-card': { a.classList.toggle('is-flipped'); a.setAttribute('aria-pressed', String(a.classList.contains('is-flipped'))); break; }
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
      if (/^[a-z0-9]{1,8}-[a-z0-9]{4,12}$/i.test(q)) { e.target.value = ''; irValidar(); setTimeout(() => { $('#code-input').value = q.toUpperCase(); validar(q); }, 80); return; }
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
    document.addEventListener('change', e => { const sel = e.target.closest('[data-mesa-llegaron]'); if (sel) llegaronReserva(sel.dataset.mesaLlegaron, Number(sel.value), sel); });
    ['k-nombre', 'k-beneficio', 'k-regla', 'k-vigencia', 'k-limite', 'k-prefijo'].forEach(id => $('#' + id).addEventListener('input', updPreview));

    // Asistentes
    $('#parche-select').addEventListener('change', e => { asisState.id = e.target.value; renderAsistentes(); });
    $$('#asis-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { asisState.tab = b.dataset.tab; renderAsistentes(); }));
    $('#chat-form').addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('#chat-input'), txt = inp.value.trim(), p = findParche(asisState.id);
      if (!txt || !p) return;
      const msg = { autor: 'biz', texto: txt.slice(0, 400), ts: NOW() };
      p.chat.push(msg);
      inp.value = ''; save(); renderChat(p, true);
      if (p.remoto) {
        SB().from('mensajes').insert({ parche_id: p.id, texto: msg.texto }).select('id').single().then(({ data, error }) => {
          if (error) { p.chat = p.chat.filter(x => x !== msg); renderChat(p); toast('No se envió el mensaje', error.message, { error: true }); }
          else if (data && !msg.id) msg.id = data.id;
        });
      }
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
    $('#p-modalidad').addEventListener('click', e => { const b = e.target.closest('[data-mod]'); if (b) { setModalidad(b.dataset.mod); setField($('#p-consumo'), ''); } });
    $('#p-consumo').addEventListener('input', pintarModHint);
    $('#form-relampago').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitRelampago(e); });
    $$('#r-dur button').forEach(b => b.addEventListener('click', () => { relDur = Number(b.dataset.min); updRelSummary(); }));
    $('#r-cupon').addEventListener('change', updRelSummary);
    $('#form-cupon').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitCupon(e); });
    $('#form-perfil').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitPerfil(e); });
    $('#form-horarios').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitHorarios(e); });
    $('#hours-edit').addEventListener('input', e => { const row = e.target.closest('.he-row'); if (row) notaHorario(row); $('#horarios-msg').textContent = ''; });
    $('#hours-edit').addEventListener('change', e => { const row = e.target.closest('.he-row'); if (row) notaHorario(row); });
    $('#form-mesa').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'cancel') return; submitMesaPromo(e); });
    $$('#mesa-tabs [data-mtab]').forEach(b => b.addEventListener('click', () => { mesaUI.tab = b.dataset.mtab; renderMesa(); }));
    document.addEventListener('change', e => { const sw = e.target.closest('[data-mesa-switch]'); if (sw) toggleMesa(sw.dataset.mesaSwitch, sw.checked); });
    $('#dlg-qr').addEventListener('close', pararQRLlegada);
    $('#bz-anuncios-sw').addEventListener('change', e => cambiarAnunciosNegocio(e.target.checked, e.target));

    // Foto del parche: elegir, arrastrar o quitar
    $('#p-foto').addEventListener('change', e => elegirFoto(e.target.files && e.target.files[0]));
    $('#photo-clear').addEventListener('click', () => { setFoto(null); $('#p-foto').value = ''; });
    const drop = $('#photo-drop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('is-drag')));
    drop.addEventListener('drop', e => { e.preventDefault(); elegirFoto(e.dataTransfer.files && e.dataTransfer.files[0]); });
    $('#dlg-scan').addEventListener('close', closeScan);

    bindTilt();

    // El reloj corre: cuenta regresiva del relámpago cada segundo y estados cada 30 s
    ajustarReloj(); // el reloj de 1 s solo corre con un relámpago activo
    setInterval(() => {
      if (document.hidden) return;
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

  async function init() {
    // Los botones de la pantalla de carga (cerrar sesión) funcionan desde el principio
    $('#boot').addEventListener('click', e => { if (e.target.closest('[data-action="logout"]')) logout(); });
    // PWA: abre sin señal y avisa cuando hay una versión nueva
    if (window.MPUtil && window.MPUtil.registrarSW) {
      window.MPUtil.registrarSW({
        alHaberNueva: aplicar => window.MPUtil.barra('mp-version', 'Hay una versión nueva de ModoParche', 'Actualizar', b => { b.disabled = true; b.textContent = 'Actualizando…'; aplicar(); }),
      }).catch(() => { /* sin service worker: el panel funciona igual */ });
    }
    if (DEMO) load();
    else if (!(await bootRemoto())) return;
    verificar();
    bind();
    go();
    hideBoot();
    window.mpPullRefresh = async () => {
      if (REMOTE()) {
        await Promise.all([cargarParchesRemotos(), recargarNegocio()]);
        syncCanalParches();
      }
      if (route === 'perfil') await cargarCobros(true);
      render();
      return true;
    };
    const qs = new URLSearchParams(location.search), P = loc().perfil;
    if (qs.has('bienvenida')) {
      setTimeout(() => {
        toast(`¡Bienvenido, ${P.nombre}!`, P.horarios ? 'Tu cuenta está lista. Publica tu primer parche con foto.' : 'Tu cuenta está lista. Empieza por poner tus horarios.');
        burst(window.innerWidth / 2, window.innerHeight / 3, 46, ['#ff751f', '#86895d', '#15110e']);
      }, 400);
    }
    // Se registró con la invitación de otro local; y reseñas reales (solo de clientes que llegaron)
    aplicarReferidoPendiente().catch(fallo('código de referido', true));
    cargarResenasReales().then(() => { if (route === 'perfil') renderPerfil(); }).catch(fallo('reseñas'));
    // Volvió de Wompi (PSE, Bancolombia): confirmamos y refrescamos el estado de cuenta
    if (REMOTE() && qs.get('pago')) {
      volverDeWompi(qs.get('pago'), qs.get('id'));
      if (!location.hash) location.hash = '#perfil';
    }
    // Eligió Villavo o Varias sedes al registrarse: se activa de una (sin pagos por adelantado)
    // Varias sedes lo aprueba el equipo: no se reintenta solo
    if (REMOTE() && P.planPendiente && P.planPendiente !== 'sedes' && P.planPendiente !== P.plan && PLANES[P.planPendiente]) {
      const elegido = P.planPendiente;
      SB().rpc('elegir_plan', { p_plan: elegido, p_sedes: elegido === 'sedes' ? Math.max(2, P.sedes || 2) : null }).then(({ error }) => {
        if (error) { console.warn('[plan]', error.message); return; }
        P.plan = elegido; P.planPendiente = null; save(); renderShell();
        toast(`${PLANES[elegido].nombre} activo`, 'Sin mensualidad: solo pagas por clientes que llegan.');
      }).catch(fallo('activar plan elegido', true));
    }
    else if (qs.has('bienvenida') && !P.horarios) setTimeout(openHorarios, 1200);
    if (['bienvenida', 'pago', 'pagar', 'id', 'env'].some(k => qs.has(k)) && history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
    // Si el local no tiene punto en el mapa, lo buscamos con su dirección
    setTimeout(ubicarLocalAuto, 1500);
    // Estado actual de los anuncios (link de baja)
    if (REMOTE()) SB().from('perfiles').select('recibe_anuncios').eq('id', ME.id).maybeSingle().then(({ data }) => { if (data) $('#bz-anuncios-sw').checked = !!data.recibe_anuncios; }).catch(fallo('preferencia de anuncios'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
