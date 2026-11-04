/* =====================================================================
   ModoParche · admin.js · Centro de control
    1. Utilidades               8. Negocios
    2. Estado y fuentes         9. Parches
    3. Datos de ejemplo        10. Mapa
    4. Gráficas                11. Moderación
    5. Resumen                 12. Anuncios y bitácora
    6. Personas                13. Detalle, diálogos y acciones
    7. Navegación y búsqueda   14. Tiempo real e inicio

   Quién es admin lo decide SOLO la tabla public.admins (se llena desde
   la base de datos). Todas las lecturas y acciones pasan por funciones
   de Supabase que vuelven a revisar ese permiso en el servidor.
   ?demo=1 abre el panel con datos de ejemplo, sin tocar la base.
===================================================================== */
(() => {
  'use strict';

  /* =====================================================================
     1. UTILIDADES
  ===================================================================== */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#${n}"/></svg>`;
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const nf = new Intl.NumberFormat('es-CO');
  const int = n => nf.format(Math.round(n || 0));
  const money = n => '$' + nf.format(Math.round(n || 0));
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const ts = v => typeof v === 'number' ? v : Date.parse(v);
  const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const tint = id => { const h = hash(id) % 360; return `background:hsl(${h} 75% 91%);color:hsl(${h} 50% 26%)`; };
  const ava = (c, cls = '') => `<span class="ava ${cls}" style="${tint(c.id || c.nombre)}" aria-hidden="true">${esc(initials(c.nombre))}</span>`;
  const plural = (n, s, p) => `${int(n)} ${n === 1 ? s : (p || s + 's')}`;

  const fmtHora = t => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(t).replace(/\s/g, ' ');
  const fmtMes = t => new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(t).replace(/\./g, '');
  const fmtSem = t => new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(t).replace(/\./g, '');
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function fmtDia(t) {
    const d = Math.round((day0(t) - day0(Date.now())) / DAY);
    if (d === 0) return 'Hoy';
    if (d === 1) return 'Mañana';
    if (d === -1) return 'Ayer';
    return cap(`${fmtSem(t)} ${new Date(t).getDate()} ${fmtMes(t)}`);
  }
  const fmtCuando = t => `${fmtDia(t)}, ${fmtHora(t)}`;
  function fmtRel(t) {
    if (!t) return 'Nunca';
    const m = Math.round((Date.now() - ts(t)) / MIN);
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d < 30) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
    const t2 = ts(t);
    return `${new Date(t2).getDate()} ${fmtMes(t2)} ${new Date(t2).getFullYear()}`;
  }
  const fmtFecha = t => t ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(ts(t)).replace(/\./g, '') : '—';
  const edad = f => { if (!f) return null; const b = new Date(f), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };

  const CATS = {
    rumba: 'Rumba', comida: 'Comida', chill: 'Chill', pueblear: 'Pueblear', rio: 'Río',
    deportes: 'Deportes', conciertos: 'Conciertos', pet: 'Pet friendly', cultura: 'Cultura', gaming: 'Gaming',
  };
  const catCode = c => (CATS[c] || c || '?').slice(0, 2);
  const PLANES = {
    basico: { nombre: 'Parche básico', precio: 0, txt: 'Gratis · 2 parches al mes' },
    villavo: { nombre: 'Parche Villavo', precio: 89000, txt: '$89.000 / mes · ilimitado' },
    sedes: { nombre: 'Varias sedes', precio: 0, txt: 'A la medida · varias sedes' },
  };
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIAS_L = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const horaTxt = h => h === 0 ? '12 a. m.' : h < 12 ? `${h} a. m.` : h === 12 ? '12 p. m.' : `${h - 12} p. m.`;

  const CU = {};
  function countUp(el, to, { dec = 0, suffix = '' } = {}) {
    if (!el) return;
    const fmt = v => (dec ? v.toFixed(dec).replace('.', ',') : int(v)) + suffix;
    const k = el.dataset.k || el.id;
    const from = k && k in CU ? CU[k] : 0;
    if (k) CU[k] = to;
    if (REDUCED() || !isFinite(to) || from === to) { el.textContent = isFinite(to) ? fmt(to) : '—'; return; }
    const t0 = performance.now(), dur = 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const animateIn = root => { $$('[data-rise]', root).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 14))); };
  // Las barras crecen después del primer pintado
  // En una actualización silenciosa quedan quietas en su valor
  const QUIET = () => { const v = current && document.getElementById('view-' + current); return !!(v && v.classList.contains('quiet')); };
  const growBars = root => { const set = () => $$('[data-v]', root).forEach(el => el.style.setProperty('--v', el.dataset.v)); if (QUIET()) set(); else requestAnimationFrame(() => requestAnimationFrame(set)); };

  /* ---------- avisos ---------- */
  function toast(title, text = '', { error = false, icon = 'i-check', ms = 4200 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' is-error' : '');
    el.setAttribute('role', error ? 'alert' : 'status');
    el.innerHTML = `${ic(error ? 'i-alert' : icon)}<div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div><button aria-label="Cerrar aviso">${ic('i-close')}</button>`;
    const close = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); };
    el.querySelector('button').onclick = close;
    $('#toasts').appendChild(el);
    setTimeout(close, ms);
  }
  // Traduce errores de Supabase a algo claro
  function errMsg(e) {
    const m = `${e && e.message || ''} ${e && e.hint || ''} ${e && e.code || ''}`;
    if (/NO_ADMIN|42501/.test(m)) return 'Tu cuenta no tiene permiso de admin.';
    if (/ES_ADMIN/.test(m)) return 'Las cuentas de admin solo se manejan desde la base de datos.';
    if (/NO_EXISTE|P0002/.test(m)) return (e.hint || 'Eso ya no existe.');
    if (/failed to fetch|network/i.test(m)) return 'Sin conexión. Revisa tu internet.';
    return e && (e.hint || e.message) || 'Algo salió mal. Intenta de nuevo.';
  }

  /* =====================================================================
     2. ESTADO Y FUENTES
  ===================================================================== */
  const DEMO = new URLSearchParams(location.search).has('demo');
  const SB = () => window.mpSupabase || null;
  let ME = { id: 'demo-admin', nombre: 'Julián', email: 'admin.julian@modoparche.co', rol: 'admin' };
  // El moderador modera; lo delicado (cédulas, suspender, planes, editar) es del admin
  const ES_ADMIN = () => ME.rol === 'admin';
  const SOLO = ' data-solo-admin';
  const S = {
    met: null, cuentas: [], negocios: [], parches: [], mensajes: [], registro: [], miembros: [],
    reportes: [], cals: [], ret: [], equipo: [], notas: new Map(),
    cargado: 0, vivo: 0, feedLive: [],
    rango: { dias: 30, desde: null, hasta: null },
    f: {
      reportes: { tab: 'abierto', q: '', motivo: '' },
      cals: { tab: 'sospechosas' },
      personas: { tab: 'todas', q: '', sort: 'recientes', n: 40 },
      negocios: { tab: 'todos', q: '' },
      parches: { tab: 'proximos', q: '', cat: '' },
      mod: { tab: 'marcados', q: '' },
      log: { tab: 'todo' },
      mapa: 'todo',
      serie: 'registros',
      anuncio: { publico: 'todos' },
    },
  };
  const byId = () => { const m = new Map(); S.cuentas.forEach(c => m.set(c.id, c)); return m; };
  let CUENTA = new Map();
  const nombreDe = id => (CUENTA.get(id) || {}).nombre || 'Alguien';
  const personas = () => S.cuentas.filter(c => c.tipo === 'persona');

  const sb = () => SB();
  async function rpc(fn, args) {
    const { data, error } = await sb().rpc(fn, args || {});
    if (error) throw error;
    return data;
  }
  const unwrap = r => { if (r.error) throw r.error; return r.data; };

  // Rango elegido para métricas, informe y gráfica
  const isoDia = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function rangoFechas() {
    const R = S.rango;
    if (R.dias === 'custom' && R.desde && R.hasta) return { desde: R.desde, hasta: R.hasta };
    const hasta = isoDia(Date.now()), desde = isoDia(Date.now() - ((+R.dias || 30) - 1) * DAY);
    return { desde, hasta };
  }
  const metArgs = () => { const r = rangoFechas(); return { p_desde: r.desde, p_hasta: r.hasta }; };

  async function cargarRemoto() {
    const c = sb();
    const [met, cuentas, parches, negocios, mensajes, registro, reportes, cals, ret, equipo] = await Promise.all([
      rpc('admin_metricas', metArgs()),
      rpc('admin_cuentas'),
      c.from('parches').select('id,titulo,categoria,descripcion,inicio,lugar,barrio,lat,lng,costo,cupos_max,creador_id,creador_nombre,aliado,verificado,demo,relampago,promo,plan_b_activo,creado_en,oficial,oficial_info,parche_miembros(count)').order('inicio', { ascending: false }).limit(1500).then(unwrap),
      c.from('negocios').select('*').then(unwrap),
      c.from('mensajes').select('id,parche_id,autor_id,texto,creado_en').eq('tipo', 'user').not('autor_id', 'is', null).order('creado_en', { ascending: false }).limit(400).then(unwrap),
      c.from('admin_registro').select('*').order('creado_en', { ascending: false }).limit(300).then(unwrap),
      c.from('reportes').select('*').order('creado_en', { ascending: false }).limit(500).then(unwrap),
      rpc('admin_calificaciones'),
      rpc('admin_retencion', { p_semanas: 8 }),
      rpc('admin_equipo'),
    ]);
    S.reportes = reportes || [];
    S.cals = cals || [];
    S.ret = ret || [];
    S.equipo = equipo || [];
    S.met = met;
    S.cuentas = cuentas || [];
    S.parches = (parches || []).map(p => ({ ...p, miembros: (p.parche_miembros && p.parche_miembros[0] && p.parche_miembros[0].count) || 0 }));
    S.negocios = negocios || [];
    S.mensajes = mensajes || [];
    S.registro = registro || [];
    S.cargado = Date.now();
    CUENTA = byId();
  }
  async function recargarMetricas() {
    if (DEMO) { S.met = metricasLocales(); S.cargado = Date.now(); return; }
    S.met = await rpc('admin_metricas', metArgs());
    S.cargado = Date.now();
  }

  /* =====================================================================
     3. DATOS DE EJEMPLO (?demo=1)
     Se calculan con las mismas reglas que las funciones de la base.
  ===================================================================== */
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function sembrar() {
    const R = rng(20261029), pick = a => a[Math.floor(R() * a.length)], now = Date.now();
    const uid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(R() * 16).toString(16));
    const NOM = ['Laura', 'Santiago', 'Valentina', 'Camilo', 'Daniela', 'Andrés', 'Mafe', 'Kevin', 'Juliana', 'Sebastián', 'Natalia', 'Felipe', 'Sara', 'Mateo', 'Paula', 'Juan Pablo', 'Carolina', 'David', 'Luisa', 'Nicolás', 'Isabella', 'Tomás', 'Manuela', 'Esteban', 'Alejandra', 'Brayan', 'Yeimi', 'Johan', 'Karen', 'Cristian', 'Angie', 'Duván'];
    const APE = ['Rojas', 'Gómez', 'Pérez', 'Martínez', 'Rodríguez', 'Hernández', 'Torres', 'Castro', 'Moreno', 'Ramírez', 'Vargas', 'Romero', 'Díaz', 'Suárez', 'Ortiz', 'Parra', 'Guzmán', 'Cárdenas', 'Rincón', 'Baquero'];
    const BAR = ['Centro', 'Barzal', 'La Esperanza', 'Siete de Agosto', 'Caudal', 'El Buque', 'La Grama', 'Villa Julia', 'Catama', 'Porfía', 'La Rochela', 'Montecarlo', 'El Triunfo', 'San Benito'];
    const ciudad = () => { const r = R(); return r < .8 ? 'Villavicencio' : r < .92 ? 'Acacías' : 'Restrepo'; };
    const cats = Object.keys(CATS);
    const cuentas = [], negocios = [], parches = [], miembros = [], mensajes = [], registro = [];

    for (let i = 0; i < 186; i++) {
      const n = `${pick(NOM)} ${pick(APE)}`, id = uid();
      const creado = now - Math.pow(R(), 1.7) * 120 * DAY;
      const conf = R() > .05, ult = !conf || R() < .06 ? null : Math.min(now, creado + R() * (now - creado));
      const res = R() < .45 ? Math.floor(R() * 14) : 0;
      const rating = res ? Math.round((R() < .07 ? 2.4 + R() * 1 : 3.9 + R() * 1.1) * 10) / 10 : 0; // sin reseñas = 0
      const ints = cats.filter(() => R() < .28).slice(0, 4);
      cuentas.push({
        id, tipo: 'persona', nombre: n, email: norm(n).replace(/\s+/g, '.') + Math.floor(R() * 90 + 10) + '@gmail.com',
        ciudad: ciudad(), barrio: pick(BAR), intereses: ints.length ? ints : [pick(cats)], rating, resenas: res,
        telefono: '3' + Math.floor(R() * 1e9).toString().padStart(9, '0'), instagram: R() < .6 ? '@' + norm(n.split(' ')[0]) + Math.floor(R() * 999) : null,
        cedula: String(Math.floor(1e9 + R() * 8e9)).slice(0, 10), nacimiento: new Date(now - (18 + R() * 17) * 365 * DAY).toISOString().slice(0, 10),
        plan: null, creado_en: new Date(creado).toISOString(), ultimo_ingreso: ult && new Date(ult).toISOString(),
        confirmado: conf, suspendido: false, parches: 0, unidos: 0, checkins: 0, mensajes: 0, recibe_anuncios: R() < .62,
      });
    }
    cuentas[7].suspendido = true; cuentas[52].suspendido = true; cuentas[52].rating = 2.1; cuentas[52].resenas = 6;

    const NEG = [['Discoteca Los Capachos', 'Discoteca', 'rumba', 'villavo', 4.1165, -73.6508], ['Café La Tostadora', 'Café', 'chill', 'basico', 4.1450, -73.6285], ['Terraza C.C. Viva', 'Bar', 'rumba', 'villavo', 4.125621, -73.638716], ['Mamona Don Ramiro', 'Restaurante', 'comida', 'villavo', 4.1395, -73.6345],
      ['Gamer Zone Villavo', 'Sala gamer', 'gaming', 'basico', 4.1405, -73.6205], ['Asadero El Guatiquía', 'Restaurante', 'comida', 'basico', 4.1705, -73.6105], ['Parque Las Malocas', 'Parque y eventos', 'conciertos', 'sedes', 4.1110, -73.5905], ['Librería La Ceiba', 'Librería', 'cultura', 'basico', 4.1515, -73.6335],
      ['Pet Shop El Peludo', 'Tienda', 'pet', 'basico', 4.1480, -73.6255], ['Hidratante Llanero', 'Bebidas', 'deportes', 'villavo', 4.1338, -73.6195], ['Arepas La Llanerita', 'Comida rápida', 'comida', 'basico', 4.1530, -73.6352], ['Bar La Rochela', 'Bar', 'rumba', 'villavo', 4.1302, -73.6318], ['Estudio Cerámica Meta', 'Taller', 'cultura', 'basico', 4.1488, -73.6382], ['Mirador Buenavista', 'Mirador', 'pueblear', 'basico', 4.1585, -73.6540]];
    NEG.forEach(([nombre, tipo, cat, plan, lat, lng], i) => {
      const id = uid(), creado = now - (8 + R() * 70) * DAY;
      negocios.push({ id, nombre, responsable: `${pick(NOM)} ${pick(APE)}`, nit: `900.${Math.floor(100 + R() * 899)}.${Math.floor(100 + R() * 899)}-${i % 9}`, tipo, categoria: cat, plan, sedes: plan === 'sedes' ? 3 : 1,
        telefono: '608' + Math.floor(R() * 1e7).toString().padStart(7, '0'), ciudad: 'Villavicencio', direccion: `Calle ${Math.floor(R() * 40)} # ${Math.floor(R() * 50)}-${Math.floor(R() * 90)}`, barrio: pick(BAR), descripcion: `${tipo} aliado de ModoParche en Villavo.`, lat, lng, logo: '', creado_en: new Date(creado).toISOString(),
        verificado: i % 3 !== 1, verificado_en: i % 3 !== 1 ? new Date(creado + 2 * DAY).toISOString() : null, verificado_nota: i % 3 !== 1 ? 'NIT y dirección revisados' : '' });
      cuentas.push({ id, tipo: 'negocio', nombre, email: norm(nombre).replace(/[^a-z]+/g, '') + '@gmail.com', ciudad: 'Villavicencio', barrio: negocios[i].barrio, intereses: [], rating: null, resenas: 0,
        telefono: negocios[i].telefono, plan, verificado: negocios[i].verificado, recibe_anuncios: i % 4 !== 0, creado_en: new Date(creado).toISOString(), ultimo_ingreso: new Date(now - R() * 6 * DAY).toISOString(), confirmado: true, suspendido: false, parches: 0, unidos: 0, checkins: 0, mensajes: 0 });
    });
    cuentas.push({ id: 'demo-mod', tipo: 'admin', rol: 'moderador', nombre: 'Sofía', email: 'sofia.mod@modoparche.co', ciudad: '', barrio: '', intereses: [], resenas: 0, creado_en: new Date(now - DAY).toISOString(), ultimo_ingreso: new Date(now - 2 * HOUR).toISOString(), confirmado: true, suspendido: false, parches: 0, unidos: 0, checkins: 0, mensajes: 0 });
    cuentas.push({ id: 'demo-admin', tipo: 'admin', nombre: 'Julián', email: 'admin.julian@modoparche.co', ciudad: '', barrio: '', intereses: [], resenas: 0, creado_en: new Date(now - 2 * DAY).toISOString(), ultimo_ingreso: new Date(now).toISOString(), confirmado: true, suspendido: false, parches: 0, unidos: 0, checkins: 0, mensajes: 0 });
    cuentas.push({ id: 'demo-admin-2', tipo: 'admin', nombre: 'Equipo ModoParche', email: 'admin.equipo@modoparche.co', ciudad: '', barrio: '', intereses: [], resenas: 0, creado_en: new Date(now - 2 * DAY).toISOString(), ultimo_ingreso: new Date(now - 5 * HOUR).toISOString(), confirmado: true, suspendido: false, parches: 0, unidos: 0, checkins: 0, mensajes: 0 });

    const TIT = {
      rumba: ['Crossover hasta que amanezca', 'Viernes de reguetón viejo', 'Hora feliz 2x1', 'Noche llanera con arpa en vivo'], comida: ['Ruta de antojos llaneros', 'Mamona del domingo', 'Pizza y cartas', 'Pandeyuca con tinto'],
      chill: ['Tarde de frisbee y picnic', 'Café de origen y charla', 'Atardecer en el parque'], pueblear: ['Atardecer en la Piedra del Amor', 'Paseo a Restrepo', 'Ruta de miradores'],
      rio: ['Caminata ecológica en El Carmen', 'Paseo de olla al Guatiquía'], deportes: ['Micro en el Siete de Agosto', 'Ruta en bici a Restrepo', 'Voleibol en La Grama'],
      conciertos: ['Toque de joropo y rock', 'Concierto en Las Malocas'], pet: ['Caminata perruna en La Grama'], cultura: ['Taller de cerámica llanera', 'Club de lectura'], gaming: ['Torneo de FIFA y pizza', 'Noche de Mario Kart'],
    };
    const pers = cuentas.filter(c => c.tipo === 'persona');
    const catW = ['rumba', 'rumba', 'rumba', 'comida', 'comida', 'chill', 'chill', 'deportes', 'deportes', 'pueblear', 'gaming', 'conciertos', 'cultura', 'rio', 'pet'];
    const HORAS = { rumba: [20, 21, 22, 23], comida: [12, 13, 18, 19, 20], chill: [15, 16, 17], pueblear: [6, 7, 16, 17], rio: [7, 8, 9], deportes: [6, 7, 17, 18, 19], conciertos: [19, 20, 21], pet: [7, 8, 16], cultura: [15, 16, 18], gaming: [17, 18, 19, 20] };
    for (let i = 0; i < 78; i++) {
      const neg = R() < .38 ? pick(negocios) : null, cat = neg ? neg.categoria : pick(catW), dueño = neg ? null : pick(pers);
      let inicio = now + (R() * 38 - 30) * DAY;
      const d = new Date(inicio); const dow = d.getDay();
      const h = (dow === 5 || dow === 6) && cat === 'rumba' ? pick([21, 22, 23]) : pick(HORAS[cat]);
      d.setHours(h, pick([0, 0, 30]), 0, 0); inicio = d.getTime();
      if (i < 3) inicio = now - (20 + i * 25) * MIN; // en curso
      const creado = Math.min(now - 10 * MIN, inicio - (1 + R() * 6) * DAY);
      const cupos = pick([6, 8, 10, 12, 15, 20]);
      const p = { id: uid(), titulo: pick(TIT[cat]), categoria: cat, descripcion: 'Plan abierto para conocer gente y pasarla bien.', inicio: new Date(inicio).toISOString(),
        lugar: neg ? neg.nombre : pick(['Parque Los Fundadores', 'C.C. Primavera Urbana', 'Parque del Hacha', 'Parque La Grama', 'C.C. Viva Villavicencio', 'Mirador La Piedra del Amor']), barrio: neg ? neg.barrio : pick(BAR),
        lat: neg ? neg.lat : 4.142 + (R() - .5) * .05, lng: neg ? neg.lng : -73.627 + (R() - .5) * .05, costo: R() < .5 ? 0 : Math.round(R() * 30) * 1000, cupos_max: cupos,
        creador_id: neg ? neg.id : dueño.id, creador_nombre: neg ? neg.nombre : null, aliado: !!neg, verificado: !!(neg && neg.verificado), demo: false, relampago: !!neg && R() < .25, promo: neg && R() < .5 ? '2x1 en la primera ronda' : null,
        creado_en: new Date(creado).toISOString(), miembros: 0 };
      parches.push(p);
      if (!neg) miembros.push({ parche_id: p.id, usuario_id: dueño.id, checkin: inicio < now, creado_en: p.creado_en });
      const k = Math.min(cupos - (neg ? 0 : 1), Math.floor(Math.pow(R(), .7) * cupos));
      const pool = pers.slice().sort(() => R() - .5).slice(0, k);
      pool.forEach(u => {
        const j = creado + R() * (Math.min(now, inicio) - creado);
        miembros.push({ parche_id: p.id, usuario_id: u.id, checkin: inicio < now && R() < .72, creado_en: new Date(j).toISOString() });
      });
    }
    // Ejemplos del sistema (no cuentan en las métricas)
    parches.push({ id: uid(), titulo: 'Atardecer en la Piedra del Amor', categoria: 'pueblear', descripcion: 'Parche de ejemplo.', inicio: new Date(now + 1.4 * DAY).toISOString(), lugar: 'Mirador La Piedra del Amor', barrio: 'Buenavista', lat: 4.1585, lng: -73.654, costo: 0, cupos_max: 15, creador_id: null, creador_nombre: 'Valen G.', aliado: false, demo: true, relampago: false, creado_en: new Date(now - 6 * DAY).toISOString(), miembros: 0 });

    const FRASES = ['Yo llego tipo 9, guárdenme puesto', '¿Alguien sabe si hay cover?', 'Llevo parlante', '¿Pagamos por aparte o hacemos vaca?', 'Qué buen plan, me apunto', 'Lleven chaqueta que arriba hace viento', '¿A qué hora salimos del centro?', 'Yo llevo las cartas', 'Ya voy en camino', 'Me sé todo el repertorio', 'Dicen que la mamona ahí es brutal', '¿Alguien me recoge en el Buque?', 'Lleven bloqueador', 'Uy no, qué nota', 'Hoy no me gana nadie'];
    const MALOS = ['Escríbanme al 3124567890 y les vendo boletas más baratas', 'Gonorrea, ese man no llegó', 'Pásenme la plata por Nequi y yo reservo', 'Entren a www.promo-gratis-villavo.com para el cupón', 'Qué hijueputa lluvia, se dañó el plan', 'Préstenme 50 mil que mañana les devuelvo por Daviplata'];
    for (let i = 0; i < 150; i++) {
      const m = pick(miembros.filter(x => ts(x.creado_en) < now));
      const t = ts(m.creado_en) + R() * Math.max(MIN, Math.min(now - ts(m.creado_en), 2 * DAY));
      mensajes.push({ id: 1000 + i, parche_id: m.parche_id, autor_id: m.usuario_id, texto: i % 23 === 5 ? MALOS[(i / 23 | 0) % MALOS.length] : pick(FRASES), creado_en: new Date(Math.min(now - MIN, t)).toISOString() });
    }
    MALOS.forEach((txt, i) => { const m = pick(miembros); mensajes.push({ id: 2000 + i, parche_id: m.parche_id, autor_id: m.usuario_id, texto: txt, creado_en: new Date(now - (i * 3 + 1) * HOUR).toISOString() }); });
    mensajes.sort((a, b) => ts(b.creado_en) - ts(a.creado_en));

    const R0 = (accion, objetivo, detalle, h, nom = 'Julián') => registro.push({ id: registro.length + 1, admin_id: 'demo-admin', admin_nombre: nom, accion, objetivo, detalle, creado_en: new Date(now - h * HOUR).toISOString() });
    R0('suspender', cuentas[52].email, 'Varias quejas por no llegar y pedir plata por adelantado', 3);
    R0('borrar_mensaje', 'Rumba en Los Capachos', '«Vendo boletas más baratas, escríbanme» spam', 9, 'Equipo ModoParche');
    R0('anuncio', 'Todas las cuentas (201)', 'Este puente festivo hay parches relámpago en todo Villavo. ¡Abre el radar!', 26);
    R0('cambiar_plan', 'Bar La Rochela', 'basico → villavo', 40, 'Equipo ModoParche');
    R0('retirar_parche', 'Fiesta privada con cover', 'Cobraba por entrar sin ser un negocio aliado', 52);
    R0('suspender', cuentas[7].email, 'Cuenta falsa', 70);
    R0('verificar', negocios[0].nombre, 'NIT y dirección revisados', 90);
    R0('resolver_reporte', 'Reporte #2 (no_llego)', 'Se habló con la persona', 30, 'Sofía');
    R0('advertencia', cuentas[52].email, 'Varias personas reportan que pide plata por adelantado. A la próxima se suspende.', 50);

    // Reportes de la comunidad
    const reportes = []; let rid = 1;
    const otro = (no, enParche) => { const pool = enParche ? miembros.filter(m => m.parche_id === enParche && m.usuario_id !== no).map(m => m.usuario_id) : []; return pool.length ? pick(pool) : pick(pers.filter(c => c.id !== no)).id; };
    const addR = (o, h) => reportes.push({ id: rid++, estado: 'abierto', resolucion: '', resuelto_por: null, resuelto_en: null, detalle: '', mensaje_id: null, parche_id: null, creado_en: new Date(now - h * HOUR).toISOString(), ...o });
    mensajes.filter(m => banderas(m.texto).length).slice(0, 4).forEach((m, i) => addR({ tipo: 'mensaje', autor_id: otro(m.autor_id, m.parche_id), usuario_id: m.autor_id, parche_id: m.parche_id, mensaje_id: m.id, copia: m.texto, motivo: ['estafa', 'acoso', 'estafa', 'spam'][i], detalle: ['Está pidiendo plata a todos por interno', 'Nos trató mal en el chat', '', 'Mandó un enlace raro'][i] }, 2 + i * 5));
    const malo = cuentas[52];
    addR({ tipo: 'persona', autor_id: otro(malo.id), usuario_id: malo.id, copia: malo.nombre, motivo: 'no_llego', detalle: 'Confirmó en 3 parches y no llegó a ninguno.' }, 20);
    addR({ tipo: 'persona', autor_id: otro(malo.id), usuario_id: malo.id, copia: malo.nombre, motivo: 'estafa', detalle: 'Me pidió adelantar la plata del cover y después no apareció.' }, 34);
    const pRaro = parches.find(p => !p.aliado && ts(p.inicio) > now);
    if (pRaro) addR({ tipo: 'parche', autor_id: otro(pRaro.creador_id), usuario_id: pRaro.creador_id, parche_id: pRaro.id, copia: pRaro.titulo, motivo: 'peligro', detalle: 'El lugar es una finca sin dirección clara y piden ir solos.' }, 6);
    addR({ tipo: 'persona', autor_id: otro(pers[12].id), usuario_id: pers[12].id, copia: pers[12].nombre, motivo: 'acoso', detalle: 'Me escribió varias veces por fuera del parche.', estado: 'resuelto', resolucion: 'Se le envió una advertencia', resuelto_en: new Date(now - 40 * HOUR).toISOString() }, 60);
    addR({ tipo: 'persona', autor_id: otro(pers[30].id), usuario_id: pers[30].id, copia: pers[30].nombre, motivo: 'otro', detalle: 'No me cae bien', estado: 'descartado', resolucion: 'No hay falta a las normas', resuelto_en: new Date(now - 70 * HOUR).toISOString() }, 80);
    reportes.sort((a, b) => ts(b.creado_en) - ts(a.creado_en));

    // Calificaciones entre quienes llegaron a un mismo parche
    const cals = [];
    parches.filter(p => ts(p.inicio) < now).forEach(p => {
      const dentro = miembros.filter(m => m.parche_id === p.id && m.checkin).map(m => m.usuario_id);
      dentro.forEach(a => dentro.filter(b => b !== a && R() < .35).forEach(b => cals.push({ parche_id: p.id, parche: p.titulo, autor_id: a, calificado_id: b, estrellas: R() < .1 ? 3 : R() < .5 ? 4 : 5, volver: R() < .6, creado_en: new Date(Math.min(now, ts(p.inicio) + (3 + R() * 20) * HOUR)).toISOString() })));
    });
    const cp = parches.find(p => ts(p.inicio) < now && miembros.filter(m => m.parche_id === p.id && m.checkin).length >= 4);
    if (cp) {
      const d = miembros.filter(m => m.parche_id === cp.id && m.checkin).map(m => m.usuario_id), t = new Date(now - 30 * HOUR).toISOString();
      const put = (a, b, e) => { const i = cals.findIndex(c => c.parche_id === cp.id && c.autor_id === a && c.calificado_id === b); const row = { parche_id: cp.id, parche: cp.titulo, autor_id: a, calificado_id: b, estrellas: e, volver: false, creado_en: t }; if (i >= 0) cals[i] = row; else cals.push(row); };
      put(d[0], d[1], 1); put(d[1], d[0], 1);           // pelea cruzada
      put(d[2], d[0], 2); put(d[2], d[1], 1); put(d[2], d[3], 1); // racha de castigo
    }
    cals.sort((a, b) => ts(b.creado_en) - ts(a.creado_en));

    const equipo = [
      { id: 'demo-admin', nombre: 'Julián', rol: 'admin', email: 'admin.julian@modoparche.co', desde: new Date(now - 2 * DAY).toISOString(), ultimo_ingreso: new Date(now).toISOString() },
      { id: 'demo-admin-2', nombre: 'Equipo ModoParche', rol: 'admin', email: 'admin.equipo@modoparche.co', desde: new Date(now - 2 * DAY).toISOString(), ultimo_ingreso: new Date(now - 5 * HOUR).toISOString() },
      { id: 'demo-mod', nombre: 'Sofía', rol: 'moderador', email: 'sofia.mod@modoparche.co', desde: new Date(now - DAY).toISOString(), ultimo_ingreso: new Date(now - 2 * HOUR).toISOString() },
    ];
    const notas = new Map([[malo.id, [
      { id: 2, tipo: 'nota', texto: 'Revisar si vuelve a crear cuentas con otro correo.', autor_id: 'demo-mod', autor_nombre: 'Sofía', creado_en: new Date(now - 20 * HOUR).toISOString() },
      { id: 1, tipo: 'advertencia', texto: 'Varias personas reportan que pide plata por adelantado. A la próxima se suspende.', autor_id: 'demo-admin', autor_nombre: 'Julián', creado_en: new Date(now - 50 * HOUR).toISOString() },
    ]]]);
    return { cuentas, negocios, parches, miembros, mensajes, registro, reportes, cals, equipo, notas };
  }

  // Igual que en la base: "cruzada" y "racha" de calificaciones bajas
  function marcarCals(list) {
    list.forEach(c => {
      c.cruzada = c.estrellas <= 2 && list.some(x => x.parche_id === c.parche_id && x.autor_id === c.calificado_id && x.calificado_id === c.autor_id && x.estrellas <= 2);
      c.racha = c.estrellas <= 2 && list.filter(x => x.parche_id === c.parche_id && x.autor_id === c.autor_id && x.estrellas <= 2).length >= 3;
    });
    return list;
  }

  // Retención con las mismas reglas que admin_retencion
  function retencionLocal(semanas = 8) {
    const lunes = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
    const hoy = lunes(Date.now()), desde = hoy - (semanas - 1) * 7 * DAY;
    const per = personas().filter(c => ts(c.creado_en) >= desde);
    const ev = new Map();
    const add = (u, t) => { if (!u || !t) return; if (!ev.has(u)) ev.set(u, []); ev.get(u).push(ts(t)); };
    S.miembros.forEach(m => add(m.usuario_id, m.creado_en)); S.mensajes.forEach(m => add(m.autor_id, m.creado_en));
    S.parches.forEach(p => add(p.creador_id, p.creado_en)); S.cals.forEach(c => add(c.autor_id, c.creado_en)); S.cuentas.forEach(c => add(c.id, c.ultimo_ingreso));
    const coh = new Map();
    per.forEach(c => { const s = lunes(ts(c.creado_en)); if (!coh.has(s)) coh.set(s, []); coh.get(s).push(c.id); });
    return [...coh.keys()].sort((a, b) => a - b).map(s => {
      const n = Math.round((hoy - s) / (7 * DAY));
      const activos = Array.from({ length: n + 1 }, (_, k) => coh.get(s).filter(id => (ev.get(id) || []).some(t => Math.round((lunes(t) - s) / (7 * DAY)) === k)).length);
      return { semana: isoDia(s), personas: coh.get(s).length, activos };
    });
  }

  // Recalcula contadores de cuentas y parches a partir de miembros y mensajes
  function derivarDemo() {
    const cp = new Map(), cm = new Map(), cc = new Map(), cmsg = new Map(), pm = new Map();
    S.parches.forEach(p => { if (p.creador_id) cp.set(p.creador_id, (cp.get(p.creador_id) || 0) + 1); });
    S.miembros.forEach(m => { cm.set(m.usuario_id, (cm.get(m.usuario_id) || 0) + 1); if (m.checkin) cc.set(m.usuario_id, (cc.get(m.usuario_id) || 0) + 1); pm.set(m.parche_id, (pm.get(m.parche_id) || 0) + 1); });
    S.mensajes.forEach(m => cmsg.set(m.autor_id, (cmsg.get(m.autor_id) || 0) + 1));
    S.cuentas.forEach(c => { c.parches = cp.get(c.id) || 0; c.unidos = cm.get(c.id) || 0; c.checkins = cc.get(c.id) || 0; c.mensajes = cmsg.get(c.id) || 0; });
    S.parches.forEach(p => { p.miembros = pm.get(p.id) || 0; });
  }

  function metricasLocales() {
    derivarDemo();
    const now = Date.now(), within = (t, a, b = 0) => { const x = ts(t); return x >= now - a && x < now - b; };
    const per = personas(), par = S.parches.filter(p => !p.demo), pById = new Map(S.parches.map(p => [p.id, p]));
    const noAdm = S.cuentas.filter(c => c.tipo !== 'admin');
    const unions = S.miembros.filter(m => { const p = pById.get(m.parche_id); return p && m.usuario_id !== p.creador_id; });
    const dKey = t => { const d = new Date(ts(t)); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    const count = (arr, f) => { const m = new Map(); arr.forEach(x => { const k = f(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const regD = count(per, c => dKey(c.creado_en)), negD = count(S.negocios, n => dKey(n.creado_en)), parD = count(par, p => dKey(p.creado_en)), uniD = count(unions, m => dKey(m.creado_en)), msgD = count(S.mensajes, m => dKey(m.creado_en));
    const rf = rangoFechas(), t0 = Date.parse(rf.desde + 'T00:00'), t1 = Date.parse(rf.hasta + 'T00:00') + DAY, p0 = t0 - (t1 - t0);
    const serie = [];
    for (let t = t0; t < t1; t += DAY) { const k = dKey(t); serie.push({ dia: isoDia(t), registros: regD.get(k) || 0, negocios: negD.get(k) || 0, parches: parD.get(k) || 0, uniones: uniD.get(k) || 0, mensajes: msgD.get(k) || 0 }); }
    const en = (arr, f, a, b) => arr.filter(x => { const v = ts(f(x)); return v >= a && v < b; }).length;
    const parRango = par.filter(p => ts(p.inicio) >= t0 && ts(p.inicio) < t1);
    const periodo = {
      desde: rf.desde, hasta: rf.hasta, dias: Math.round((t1 - t0) / DAY),
      registros: en(per, c => c.creado_en, t0, t1), registros_prev: en(per, c => c.creado_en, p0, t0),
      negocios: en(S.negocios, n => n.creado_en, t0, t1), negocios_prev: en(S.negocios, n => n.creado_en, p0, t0),
      parches: en(par, p => p.creado_en, t0, t1), parches_prev: en(par, p => p.creado_en, p0, t0),
      uniones: en(unions, m => m.creado_en, t0, t1), uniones_prev: en(unions, m => m.creado_en, p0, t0),
      mensajes: en(S.mensajes, m => m.creado_en, t0, t1), mensajes_prev: en(S.mensajes, m => m.creado_en, p0, t0),
      calificaciones: en(S.cals, c => c.creado_en, t0, t1), reportes: en(S.reportes, r => r.creado_en, t0, t1),
      checkins: S.miembros.filter(m => m.checkin && parRango.some(p => p.id === m.parche_id)).length,
      ocupacion: parRango.length ? Math.round(parRango.reduce((a, p) => a + Math.min(1, p.miembros / p.cupos_max), 0) / parRango.length * 100) : null,
    };
    const catM = new Map(); par.forEach(p => { const c = catM.get(p.categoria) || { categoria: p.categoria, parches: 0, uniones: 0 }; c.parches++; c.uniones += Math.max(0, p.miembros - (p.aliado ? 0 : 1)); catM.set(p.categoria, c); });
    const intM = new Map(); per.forEach(c => (c.intereses || []).forEach(x => intM.set(x, (intM.get(x) || 0) + 1)));
    const ciuM = new Map(); per.forEach(c => { const x = ciuM.get(c.ciudad) || { ciudad: c.ciudad, personas: 0, negocios: 0 }; x.personas++; ciuM.set(c.ciudad, x); });
    S.negocios.forEach(n => { const x = ciuM.get(n.ciudad) || { ciudad: n.ciudad, personas: 0, negocios: 0 }; x.negocios++; ciuM.set(n.ciudad, x); });
    const calM = new Map(); par.forEach(p => { const d = new Date(ts(p.inicio)); const k = `${(d.getDay() + 6) % 7 + 1}-${d.getHours()}`; calM.set(k, (calM.get(k) || 0) + 1); });
    const perIds = new Set(per.map(c => c.id));
    const neg = S.negocios.map(n => { const ps = par.filter(p => p.creador_id === n.id); return { id: n.id, nombre: n.nombre, plan: n.plan, categoria: n.categoria, ciudad: n.ciudad, parches: ps.length, asistentes: ps.reduce((a, p) => a + p.miembros, 0) }; })
      .sort((a, b) => b.parches - a.parches || b.asistentes - a.asistentes).slice(0, 6);
    const rated = per.filter(c => c.resenas > 0);
    return {
      generado: new Date().toISOString(),
      totales: {
        personas: per.length, negocios: S.negocios.length, admins: S.cuentas.filter(c => c.tipo === 'admin').length,
        nuevos_7d: noAdm.filter(c => within(c.creado_en, 7 * DAY)).length, nuevos_7d_prev: noAdm.filter(c => within(c.creado_en, 14 * DAY, 7 * DAY)).length,
        activos_7d: noAdm.filter(c => c.ultimo_ingreso && within(c.ultimo_ingreso, 7 * DAY)).length, activos_24h: noAdm.filter(c => c.ultimo_ingreso && within(c.ultimo_ingreso, DAY)).length,
        sin_confirmar: S.cuentas.filter(c => !c.confirmado).length, suspendidos: S.cuentas.filter(c => c.suspendido).length,
        parches_total: par.length, parches_demo: S.parches.length - par.length, parches_proximos: par.filter(p => ts(p.inicio) > now).length,
        parches_en_curso: par.filter(p => ts(p.inicio) <= now && ts(p.inicio) > now - 3 * HOUR).length, parches_hoy: par.filter(p => day0(ts(p.inicio)) === day0(now)).length,
        parches_7d: par.filter(p => within(p.creado_en, 7 * DAY)).length, parches_7d_prev: par.filter(p => within(p.creado_en, 14 * DAY, 7 * DAY)).length,
        parches_aliados: par.filter(p => p.aliado).length, parches_llenos: par.filter(p => p.miembros >= p.cupos_max).length,
        uniones_total: unions.length, uniones_7d: unions.filter(m => within(m.creado_en, 7 * DAY)).length, uniones_7d_prev: unions.filter(m => within(m.creado_en, 14 * DAY, 7 * DAY)).length,
        checkins: S.miembros.filter(m => m.checkin).length, mensajes_total: S.mensajes.length,
        mensajes_24h: S.mensajes.filter(m => within(m.creado_en, DAY)).length, mensajes_7d: S.mensajes.filter(m => within(m.creado_en, 7 * DAY)).length, mensajes_7d_prev: S.mensajes.filter(m => within(m.creado_en, 14 * DAY, 7 * DAY)).length,
        calificaciones: rated.reduce((a, c) => a + c.resenas, 0), estrellas_prom: rated.length ? rated.reduce((a, c) => a + c.rating * c.resenas, 0) / rated.reduce((a, c) => a + c.resenas, 0) : null,
        ocupacion_prom: par.length ? Math.round(par.reduce((a, p) => a + Math.min(1, p.miembros / p.cupos_max), 0) / par.length * 100) : 0,
        notificaciones_7d: 0, reportes_abiertos: S.reportes.filter(r => r.estado === 'abierto').length, negocios_verificados: S.negocios.filter(n => n.verificado).length,
      },
      serie, periodo,
      categorias: [...catM.values()].sort((a, b) => b.parches - a.parches),
      intereses: [...intM].map(([interes, n]) => ({ interes, n })).sort((a, b) => b.n - a.n),
      ciudades: [...ciuM.values()].sort((a, b) => (b.personas + b.negocios) - (a.personas + a.negocios)),
      planes: Object.keys(PLANES).map(plan => ({ plan, n: S.negocios.filter(n => n.plan === plan).length })).filter(x => x.n),
      calor: [...calM].map(([k, n]) => { const [dow, hora] = k.split('-').map(Number); return { dow, hora, n }; }),
      embudo: {
        registrados: per.length,
        se_unieron: new Set(unions.filter(m => perIds.has(m.usuario_id)).map(m => m.usuario_id)).size,
        crearon: new Set(par.filter(p => perIds.has(p.creador_id)).map(p => p.creador_id)).size,
        llegaron: new Set(S.miembros.filter(m => m.checkin && perIds.has(m.usuario_id)).map(m => m.usuario_id)).size,
        calificaron: Math.round(rated.length * .8),
      },
      top_negocios: neg,
      proximos: par.filter(p => ts(p.inicio) > now - 3 * HOUR).sort((a, b) => ts(a.inicio) - ts(b.inicio)).slice(0, 8)
        .map(p => ({ id: p.id, titulo: p.titulo, categoria: p.categoria, inicio: p.inicio, lugar: p.lugar, cupos_max: p.cupos_max, miembros: p.miembros, aliado: p.aliado, creador: p.creador_nombre })),
      riesgo: per.filter(c => c.resenas >= 3 && c.rating < 3.5).sort((a, b) => a.rating - b.rating).slice(0, 10).map(c => ({ id: c.id, nombre: c.nombre, rating: c.rating, resenas: c.resenas })),
    };
  }

  /* =====================================================================
     4. GRÁFICAS (SVG propio: una serie por gráfica, sin dos ejes)
  ===================================================================== */
  const tip = $('#tip');
  function showTip(x, y, html) { tip.innerHTML = html; tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
  const hideTip = () => { tip.hidden = true; };

  function niceMax(v) { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

  function sparkline(vals, id) {
    const w = 200, h = 56, max = Math.max(1, ...vals), n = vals.length;
    const pts = vals.map((v, i) => [i / (n - 1) * w, h - 6 - v / max * (h - 14)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="sf-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF5A1F" stop-opacity=".28"/><stop offset="1" stop-color="#FF5A1F" stop-opacity="0"/></linearGradient></defs>
      <path class="draw" d="${d}L${w} ${h}L0 ${h}Z" fill="url(#sf-${id})"/><path class="l draw" d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  const SERIES = { registros: ['Registros', 'personas nuevas'], parches: ['Parches', 'parches creados'], uniones: ['Uniones', 'personas se unieron a un parche'], mensajes: ['Mensajes', 'mensajes en los chats'] };
  function drawTrend() {
    const box = $('#trend-chart'), serie = (S.met && S.met.serie) || [];
    const key = S.f.serie, vals = serie.map(d => Number(d[key]) || 0);
    const total = vals.reduce((a, b) => a + b, 0), PE = (S.met && S.met.periodo) || {};
    const prev = PE[key + '_prev'];
    $('#h-trend').textContent = rangoTitulo();
    $('#trend-head').innerHTML = `<b data-k="trend-${key}">${int(CU['trend-' + key] || 0)}</b><span>${SERIES[key][1]} en el rango${prev != null ? ` · contra ${int(prev)} del periodo anterior ${deltaPill(total, prev)}` : ''}</span>`;
    countUp($('#trend-head b'), total);
    $('#trend-meta').textContent = `Cada punto es un día en hora de Colombia · ${plural(serie.length, 'día')}`;
    const W = Math.max(280, box.clientWidth), H = box.clientHeight || 260, L = 34, R = 14, T = 18, B = 26;
    const max = niceMax(Math.max(...vals, 1)), n = vals.length;
    const x = i => L + (n > 1 ? i / (n - 1) : .5) * (W - L - R), y = v => T + (1 - v / max) * (H - T - B);
    const grid = [0, .25, .5, .75, 1].map(k => `<line x1="${L}" x2="${W - R}" y1="${y(max * k)}" y2="${y(max * k)}"/><text x="${L - 8}" y="${y(max * k) + 4}" text-anchor="end">${int(max * k)}</text>`).join('');
    const paso = Math.max(1, Math.ceil(n / 6));
    const xl = serie.map((d, i) => ((n - 1 - i) % paso === 0) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${new Date(d.dia + 'T12:00').getDate()} ${fmtMes(new Date(d.dia + 'T12:00'))}</text>` : '').join('');
    // Curva suave (monótona)
    const P = vals.map((v, i) => [x(i), y(v)]);
    let d = P.length ? `M${P[0][0]} ${P[0][1]}` : '';
    for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], cx = (x0 + x1) / 2; d += `C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`; }
    const pk = vals.indexOf(Math.max(...vals));
    const peak = total ? `<circle class="peak" cx="${x(pk)}" cy="${y(vals[pk])}" r="4.5"/><text class="peak-l" x="${Math.min(W - R - 30, Math.max(L + 30, x(pk)))}" y="${y(vals[pk]) - 12}" text-anchor="middle">Pico: ${int(vals[pk])}</text>` : '';
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(SERIES[key][0])} por día en los últimos 30 días. Total ${total}.">
      <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF5A1F" stop-opacity=".3"/><stop offset="1" stop-color="#FF5A1F" stop-opacity="0"/></linearGradient></defs>
      <g class="grid">${grid}</g><g class="xax">${xl}</g>
      <g class="draw"><path class="area" d="${d}L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}Z"/><path class="line" d="${d}"/>${peak}</g>
      <line class="xh" y1="${T}" y2="${H - B}"/><circle class="dotc" r="6"/>
      <rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/></svg>
      <table class="sr-only"><caption>${esc(SERIES[key][0])} por día</caption>${serie.map((s, i) => `<tr><th>${esc(s.dia)}</th><td>${vals[i]}</td></tr>`).join('')}</table>`;
    const svg = box.querySelector('svg'), xh = svg.querySelector('.xh'), dot = svg.querySelector('.dotc');
    const move = e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / (W - L - R) * (n - 1))));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i]));
      box.classList.add('is-hover');
      const fecha = new Date(serie[i].dia + 'T12:00');
      showTip(r.left + x(i) * r.width / W, r.top + y(vals[i]) * r.height / H, `<b>${int(vals[i])}</b>${esc(SERIES[key][0].toLowerCase())}<small>${esc(fmtDia(fecha.getTime()))} · ${fecha.getDate()} ${esc(fmtMes(fecha))}</small>`);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => { box.classList.remove('is-hover'); hideTip(); });
  }

  const fmtCorta = iso => { const d = new Date(iso + 'T12:00'); return `${d.getDate()} ${fmtMes(d)}`; };
  function rangoTitulo() {
    const R = S.rango, rf = rangoFechas();
    if (R.dias === 'custom') return `${fmtCorta(rf.desde)} → ${fmtCorta(rf.hasta)}`;
    return +R.dias === 365 ? 'Últimos 12 meses' : `Últimos ${R.dias} días`;
  }

  // Totales del rango contra el periodo anterior del mismo tamaño
  function renderPeriodo() {
    const PE = (S.met && S.met.periodo) || null, el = $('#periodo');
    $$('#range-seg button').forEach(b => b.setAttribute('aria-pressed', String(String(S.rango.dias) === b.dataset.rango)));
    $('#range-custom').hidden = S.rango.dias !== 'custom';
    if (!PE) { el.innerHTML = ''; return; }
    const it = [
      ['Registros', 'registros'], ['Negocios nuevos', 'negocios'], ['Parches creados', 'parches'], ['Uniones', 'uniones'], ['Mensajes', 'mensajes'],
      ['Ocupación', null, PE.ocupacion, ' %'],
    ];
    el.innerHTML = it.map(([l, k, v, suf], i) => {
      const val = k ? PE[k] : v, prev = k ? PE[k + '_prev'] : null;
      return `<div class="pe" data-rise><small>${esc(l)}</small><div class="pe-row"><b data-k="pe${i}" data-n="${val ?? ''}">${val == null ? '—' : int(CU['pe' + i] || 0)}</b>${k ? deltaPill(val, prev) : ''}</div>
        <span class="prev">${k ? `Antes: ${int(prev)}` : 'De los parches del rango'}${suf && val != null ? '' : ''}</span></div>`;
    }).join('');
    $$('#periodo [data-n]').forEach((b, i) => { if (b.dataset.n !== '') countUp(b, Number(b.dataset.n), { suffix: it[i][3] || '' }); });
  }

  function renderRetencion() {
    const R = S.ret || [], tabla = $('#ret');
    if (!R.length) { tabla.innerHTML = '<tbody><tr><td><div class="empty">Cuando haya registros de varias semanas, aquí ves si la gente vuelve.</div></td></tr></tbody>'; $('#ret-meta').textContent = ''; return; }
    const maxK = Math.max(...R.map(c => c.activos.length));
    const prom = k => { const v = R.filter(c => c.activos.length > k && c.personas).map(c => c.activos[k] / c.personas); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) : null; };
    const p1 = prom(1);
    $('#ret-meta').textContent = p1 != null ? `En promedio, ${p1} % vuelve la semana siguiente` : '';
    tabla.innerHTML = `<thead><tr><th>Semana de registro</th>${Array.from({ length: maxK }, (_, k) => `<th>${k === 0 ? 'Semana 0' : 'Sem ' + k}</th>`).join('')}</tr></thead>
      <tbody>${R.slice().reverse().map(c => `<tr><td class="lbl">${esc(fmtCorta(c.semana))}<small>${plural(c.personas, 'persona')}</small></td>${Array.from({ length: maxK }, (_, k) => {
        if (k >= c.activos.length) return '<td><span class="cell na">·</span></td>';
        const p = c.personas ? Math.round(c.activos[k] / c.personas * 100) : 0, l = p === 0 ? 0 : Math.min(5, Math.ceil(p / 20));
        return `<td><span class="cell" data-l="${l}" title="${c.activos[k]} de ${c.personas} volvieron">${p}%</span></td>`;
      }).join('')}</tr>`).join('')}</tbody>`;
  }

  function deltaPill(cur, prev) {
    if (!prev && !cur) return '<span class="delta">igual</span>';
    if (!prev) return `<span class="delta is-up">${ic('i-up')}nuevo</span>`;
    const p = Math.round((cur - prev) / prev * 100);
    if (p === 0) return '<span class="delta">igual</span>';
    return `<span class="delta ${p > 0 ? 'is-up' : 'is-down'}" title="Contra los 7 días anteriores">${ic(p > 0 ? 'i-up' : 'i-down')}${Math.abs(p)} %</span>`;
  }

  /* =====================================================================
     5. RESUMEN
  ===================================================================== */
  const flagged = () => S.mensajes.filter(m => banderas(m.texto).length);

  function renderResumen() {
    const M = S.met; if (!M) return;
    const T = M.totales, serie = M.serie || [];
    const h = new Date().getHours(), saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    $('#hero-kicker').textContent = `${saludo} · ${cap(new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))}`;
    $('#hero-hola').textContent = `Hola, ${ME.nombre.split(' ')[0]}`;
    const enCurso = T.parches_en_curso;
    $('#hero-sub').innerHTML = `${enCurso ? `Ahora mismo hay <span class="n">${plural(enCurso, 'parche')}</span> en marcha. ` : ''}En las últimas 24 horas entraron <b>${plural(T.activos_24h, 'cuenta')}</b> y se escribieron <b>${plural(T.mensajes_24h, 'mensaje')}</b>. Esta semana llegaron <b>${plural(T.nuevos_7d, 'cuenta nueva', 'cuentas nuevas')}</b>.`;

    // Cinta con datos que pasan
    const topCat = (M.categorias || [])[0], pico = picoCalor(M.calor || []), ult = personas()[0];
    const items = [
      `${plural(T.personas, 'persona')} y ${plural(T.negocios, 'negocio')} en la plataforma`,
      `${plural(T.parches_proximos, 'parche')} por venir`,
      topCat ? `${CATS[topCat.categoria] || topCat.categoria} es la categoría más fuerte` : null,
      pico ? `Hora pico: ${DIAS_L[pico.dow - 1]} ${horaTxt(pico.hora)}` : null,
      `Ocupación promedio ${int(T.ocupacion_prom || 0)} %`,
      ult ? `Último registro: ${ult.nombre.split(' ')[0]} ${fmtRel(ult.creado_en)}` : null,
      `${plural(T.checkins, 'check-in')} en total`,
      T.estrellas_prom ? `Calificación promedio ${Number(T.estrellas_prom).toFixed(1).replace('.', ',')} de 5` : null,
    ].filter(Boolean);
    const track = items.map(t => `<span>${esc(t)}</span>`).join('');
    $('#hero-ticker').innerHTML = `<div class="ticker-track" style="--dur:${items.length * 6}s">${track}${track}</div>`;

    // Indicadores grandes con mini gráfica de 14 días
    const last = k => serie.slice(-14).map(d => Number(d[k]) || 0);
    const pagos = S.negocios.filter(n => n.plan !== 'basico').length;
    const K = [
      { lead: true, icon: 'i-users', label: 'Personas', v: T.personas, d: deltaPill(T.nuevos_7d, T.nuevos_7d_prev), sub: `${plural(T.nuevos_7d, 'cuenta nueva', 'cuentas nuevas')} esta semana`, sp: last('registros'), go: '#personas' },
      { icon: 'i-store', label: 'Negocios aliados', v: T.negocios, d: '', sub: `${plural(pagos, 'negocio')} en plan pago`, sp: last('negocios'), go: '#negocios' },
      { icon: 'i-calendar', label: 'Parches por venir', v: T.parches_proximos, d: deltaPill(T.parches_7d, T.parches_7d_prev), sub: `${plural(T.parches_7d, 'creado', 'creados')} en 7 días · ${int(T.parches_en_curso)} en curso`, sp: last('parches'), go: '#parches' },
      { icon: 'i-flame', label: 'Uniones en 7 días', v: T.uniones_7d, d: deltaPill(T.uniones_7d, T.uniones_7d_prev), sub: `Ocupación promedio ${int(T.ocupacion_prom || 0)} %`, sp: last('uniones'), go: '#parches' },
    ];
    $('#kpis').innerHTML = K.map((k, i) => `<a class="kpi ${k.lead ? 'kpi--lead' : ''}" href="${k.go}" data-rise>
      <span class="kpi-label">${ic(k.icon)}${esc(k.label)}</span>
      <span class="kpi-value"><b data-n="${k.v}" data-k="kpi${i}">${int(CU['kpi' + i] || 0)}</b>${k.d}</span>
      <span class="kpi-sub">${esc(k.sub)}</span>${sparkline(k.sp, i)}</a>`).join('');
    $$('#kpis .kpi-value b').forEach(b => countUp(b, Number(b.dataset.n)));

    const st = [
      { icon: 'i-pulse', l: 'Activas 24 h', v: T.activos_24h, go: '#personas' },
      { icon: 'i-user', l: 'Activas 7 días', v: T.activos_7d, go: '#personas' },
      { icon: 'i-chat', l: 'Mensajes 24 h', v: T.mensajes_24h, go: '#moderacion' },
      { icon: 'i-check', l: 'Check-ins', v: T.checkins, go: '#parches' },
      { icon: 'i-star', l: 'Calificación', v: T.estrellas_prom ? Number(T.estrellas_prom) : null, dec: 1, suf: '', after: ' / 5' },
      { icon: 'i-mail', l: 'Sin confirmar', v: T.sin_confirmar, warn: T.sin_confirmar > 0, go: '#personas', tab: 'sinconfirmar' },
      { icon: 'i-ban', l: 'Suspendidas', v: T.suspendidos, go: '#personas', tab: 'suspendidas' },
    ];
    $('#strip').innerHTML = st.map((s, i) => `<button class="strip-item ${s.warn ? 'is-warn' : ''}" ${s.go ? `data-go="${s.go}"` : ''} ${s.tab ? `data-tab="${s.tab}"` : ''} data-rise>
      <small>${ic(s.icon)}${esc(s.l)}</small><b><span data-n="${s.v ?? ''}" data-dec="${s.dec || 0}" data-k="st${i}">${s.v == null ? '—' : int(CU['st' + i] || 0)}</span>${s.after && s.v != null ? `<i>${s.after}</i>` : ''}</b></button>`).join('');
    $$('#strip [data-n]').forEach(el => { if (el.dataset.n !== '') countUp(el, Number(el.dataset.n), { dec: Number(el.dataset.dec) }); });

    renderPeriodo();
    drawTrend();
    renderRetencion();
    renderAlertas();
    renderEmbudo(M.embudo || {});
    renderBars('#cats', (M.categorias || []).slice(0, 7).map(c => ({ code: catCode(c.categoria), label: CATS[c.categoria] || c.categoria, v: c.parches, extra: `${int(c.uniones)} se unieron` })), 'parches');
    renderBars('#ciudades', (M.ciudades || []).map(c => ({ code: c.ciudad.slice(0, 2), label: c.ciudad, v: c.personas + c.negocios, extra: `${int(c.personas)} personas · ${int(c.negocios)} negocios` })), 'cuentas');
    renderBars('#intereses', (M.intereses || []).slice(0, 7).map(c => ({ code: catCode(c.interes), label: CATS[c.interes] || c.interes, v: c.n, extra: `${pct(c.n, T.personas)} % de las personas` })), 'personas');
    renderCalor(M.calor || []);
    renderProximos(M.proximos || []);
    renderTopNeg(M.top_negocios || []);
    renderFeed();
    $('#stamp-resumen').textContent = `Datos al ${fmtCuando(ts(M.generado || Date.now())).toLowerCase()}${T.parches_demo ? ` · ${plural(T.parches_demo, 'parche')} de ejemplo del sistema no cuentan en las métricas` : ''}`;
    animateIn($('#view-resumen'));
  }

  function renderAlertas() {
    const T = S.met.totales, now = Date.now();
    const llenos = S.parches.filter(p => !p.demo && ts(p.inicio) > now && p.miembros >= p.cupos_max).length;
    const mes0 = new Date(); mes0.setDate(1); mes0.setHours(0, 0, 0, 0);
    const alLimite = S.negocios.filter(n => n.plan === 'basico' && S.parches.filter(p => p.creador_id === n.id && ts(p.creado_en) >= mes0.getTime()).length >= 2).length;
    const fl = flagged().length, riesgo = (S.met.riesgo || []).length, repA = S.reportes.filter(r => r.estado === 'abierto').length;
    const porVerif = S.negocios.filter(n => !n.verificado).length, calSosp = S.cals.filter(c => c.cruzada || c.racha).length;
    const A = [
      repA && { hot: true, icon: 'i-flag', n: repA, t: 'Reportes sin resolver', s: 'La comunidad pidió ayuda', go: '#reportes' },
      fl && { hot: true, icon: 'i-chat', n: fl, t: 'Mensajes marcados', s: 'Groserías, teléfonos, enlaces o plata', go: '#moderacion' },
      riesgo && { hot: true, icon: 'i-star', n: riesgo, t: 'Reputación en riesgo', s: 'Menos de 3,5 estrellas con 3+ reseñas', go: '#personas', tab: 'riesgo' },
      calSosp && { icon: 'i-star', n: calSosp, t: 'Calificaciones sospechosas', s: 'Peleas cruzadas o rachas de castigo', go: '#reputacion' },
      porVerif && { icon: 'i-shield', n: porVerif, t: 'Negocios por verificar', s: 'Revisa NIT y dirección', go: '#negocios', tab: 'porverificar' },
      T.sin_confirmar && { icon: 'i-mail', n: T.sin_confirmar, t: 'Sin confirmar el correo', s: 'No pueden entrar hasta confirmar', go: '#personas', tab: 'sinconfirmar' },
      T.parches_en_curso && { icon: 'i-pulse', n: T.parches_en_curso, t: 'Parches en curso', s: 'Míralos en el mapa en vivo', go: '#mapa' },
      llenos && { icon: 'i-check', n: llenos, t: 'Parches llenos por venir', s: 'Cupón desbloqueado para la gente', go: '#parches' },
      alLimite && { icon: 'i-crown', n: alLimite, t: 'Negocios al límite del plan', s: 'Ya usaron sus 2 parches del mes', go: '#negocios', tab: 'basico' },
      T.suspendidos && { icon: 'i-ban', n: T.suspendidos, t: 'Cuentas suspendidas', s: 'No pueden iniciar sesión', go: '#personas', tab: 'suspendidas' },
    ].filter(Boolean).slice(0, 7);
    $('#alerts').innerHTML = A.length ? A.map(a => `<li data-rise><button class="alert ${a.hot ? 'alert--hot' : ''}" data-go="${a.go}" ${a.tab ? `data-tab="${a.tab}"` : ''}>
        <span class="alert-ic">${ic(a.icon)}</span><span><b>${esc(a.t)}</b><small>${esc(a.s)}</small></span><span class="alert-n">${int(a.n)}</span></button></li>`).join('')
      : `<li><div class="alert alert--ok"><span class="alert-ic">${ic('i-check')}</span><span><b>Todo en orden</b><small>No hay nada pendiente por revisar.</small></span></div></li>`;
  }

  function renderEmbudo(E) {
    const steps = [['Se registraron', E.registrados], ['Se unieron a un parche', E.se_unieron], ['Crearon su propio parche', E.crearon], ['Llegaron (check-in)', E.llegaron], ['Calificaron a alguien', E.calificaron]];
    const top = Math.max(1, steps[0][1] || 0);
    $('#funnel').innerHTML = steps.map(([l, v], i) => `<li data-rise>
      <div class="f-top"><span>${esc(l)}</span><b>${int(v || 0)}<small>${i ? pct(v || 0, top) + ' %' : '100 %'}</small></b></div>
      <div class="f-bar"><i data-v="${((v || 0) / top).toFixed(3)}"></i></div></li>`).join('');
    growBars($('#funnel'));
  }

  function renderBars(sel, rows, unidad) {
    const el = $(sel);
    if (!rows.length) { el.innerHTML = '<li class="empty">Todavía no hay datos.</li>'; return; }
    const max = Math.max(1, ...rows.map(r => r.v));
    el.innerHTML = rows.map(r => `<li data-rise><span class="b-ic" aria-hidden="true">${esc(r.code)}</span><div class="b-main">
      <div class="b-top"><span>${esc(r.label)}</span><b>${int(r.v)} <small>${esc(unidad)}</small></b></div>
      <div class="b-track" title="${esc(r.extra)}"><i data-v="${(r.v / max).toFixed(3)}"></i></div></div></li>`).join('');
    growBars(el);
  }

  const picoCalor = cal => cal.reduce((a, c) => (!a || c.n > a.n) ? c : a, null);
  function renderCalor(cal) {
    const m = new Map(cal.map(c => [`${c.dow}-${c.hora}`, c.n])), max = Math.max(0, ...cal.map(c => c.n));
    let html = '<span></span>';
    for (let hh = 0; hh < 24; hh++) html += `<span class="hx">${hh % 3 === 0 ? (hh === 0 ? '12a' : hh < 12 ? hh + 'a' : hh === 12 ? '12p' : (hh - 12) + 'p') : ''}</span>`;
    for (let d = 1; d <= 7; d++) {
      html += `<span class="hl">${DIAS[d - 1]}</span>`;
      for (let hh = 0; hh < 24; hh++) {
        const n = m.get(`${d}-${hh}`) || 0, l = n ? Math.max(1, Math.ceil(n / max * 5)) : 0;
        html += `<button class="c" data-l="${l}" data-tip="${DIAS_L[d - 1]}|${hh}|${n}" aria-label="${DIAS_L[d - 1]} ${horaTxt(hh)}: ${n} parches"></button>`;
      }
    }
    const pico = picoCalor(cal);
    $('#heat').innerHTML = html;
    let leg = $('#heat-legend');
    if (!leg) { leg = document.createElement('div'); leg.id = 'heat-legend'; leg.className = 'heat-legend'; $('#heat').after(leg); }
    leg.innerHTML = `<span>${pico ? `Pico: <b>${DIAS_L[pico.dow - 1]} ${horaTxt(pico.hora)}</b> (${plural(pico.n, 'parche')})` : 'Aún no hay parches reales.'}</span>
      <span class="scale">Menos ${[0, 1, 2, 3, 4, 5].map(i => `<i style="background:var(--seq-${i})"></i>`).join('')} Más</span>`;
    if (!REDUCED() && !QUIET()) $$('#heat .c').forEach((c, i) => { c.style.setProperty('--s', 0); setTimeout(() => c.style.setProperty('--s', 1), 200 + (i % 24) * 18 + Math.floor(i / 24) * 30); });
  }

  function renderProximos(list) {
    const now = Date.now();
    $('#proximos').innerHTML = list.length ? list.map(p => {
      const t = ts(p.inicio), live = t <= now, full = p.miembros >= p.cupos_max;
      return `<li data-rise><button class="up" data-parche="${esc(p.id)}">
        <span class="up-date ${live ? 'is-live' : ''}"><small>${live ? 'AHORA' : esc(fmtDia(t).slice(0, 6))}</small><b>${esc(fmtHora(t).replace(/\s?([ap])\.\s?m\./, '$1'))}</b></span>
        <span class="up-main"><b>${esc(p.titulo)}</b><small>${esc(p.lugar)}${p.creador && p.creador !== p.lugar ? ' · ' + esc(p.creador) : ''}</small><span class="track ${full ? 'is-full' : ''}"><i data-v="${Math.min(1, p.miembros / p.cupos_max).toFixed(3)}"></i></span></span>
        <span class="up-fill"><b>${int(p.miembros)}/${int(p.cupos_max)}</b>${full ? 'lleno' : 'cupos'}</span></button></li>`;
    }).join('') : '<li class="empty empty--crown">No hay parches reales por venir.<br>Cuando alguien abra uno, aparece aquí.</li>';
    growBars($('#proximos'));
  }

  function renderTopNeg(list) {
    $('#topneg').innerHTML = list.length ? list.map((n, i) => `<li data-rise><button data-negocio="${esc(n.id)}">
      <span class="rank-n">${i + 1}</span>${logoNeg(n)}
      <span class="rank-t"><b>${esc(n.nombre)}</b><small>${esc((PLANES[n.plan] || {}).nombre || n.plan)} · ${esc(CATS[n.categoria] || '')}</small></span>
      <span class="rank-v"><b>${int(n.parches)}</b><small>${plural(n.asistentes, 'asistente')}</small></span></button></li>`).join('')
      : '<li class="empty">Aún no hay negocios.</li>';
  }
  const logoNeg = n => { const t = ['', 'logo--fuego', 'logo--dia'][hash(n.id) % 3]; return `<span class="logo ${t}" aria-hidden="true">${esc(initials(n.nombre))}</span>`; };

  /* ---------- en vivo ---------- */
  function feedBase() {
    const items = [];
    S.cuentas.slice(0, 40).forEach(c => { if (c.tipo !== 'admin') items.push({ t: ts(c.creado_en), icon: c.tipo === 'negocio' ? 'i-store' : 'i-user', html: c.tipo === 'negocio' ? `<b>${esc(c.nombre)}</b> se sumó como negocio aliado` : `<b>${esc(c.nombre)}</b> creó su cuenta` }); });
    S.parches.filter(p => !p.demo).slice().sort((a, b) => ts(b.creado_en) - ts(a.creado_en)).slice(0, 20)
      .forEach(p => items.push({ t: ts(p.creado_en), icon: 'i-calendar', html: `<b>${esc(p.creador_nombre || nombreDe(p.creador_id))}</b> abrió <b>${esc(p.titulo)}</b>` }));
    S.mensajes.slice(0, 15).forEach(m => items.push({ t: ts(m.creado_en), icon: 'i-chat', html: `<b>${esc(nombreDe(m.autor_id))}</b> escribió en ${esc(tituloParche(m.parche_id))}` }));
    S.registro.slice(0, 10).forEach(r => items.push({ t: ts(r.creado_en), icon: 'i-shield', html: `<b>${esc(r.admin_nombre || 'Admin')}</b> ${esc(ACCIONES[r.accion]?.txt || r.accion)} <b>${esc(r.objetivo)}</b>` }));
    return items.sort((a, b) => b.t - a.t).slice(0, 18);
  }
  const tituloParche = id => (S.parches.find(p => p.id === id) || {}).titulo || 'un parche';
  function renderFeed() {
    const list = [...S.feedLive, ...feedBase()].sort((a, b) => b.t - a.t).slice(0, 24);
    $('#feed').innerHTML = list.length ? list.map(f => `<li class="${f.nuevo ? 'is-new' : ''}"><span class="feed-ic">${ic(f.icon)}</span><p>${f.html}</p><time>${esc(fmtRel(f.t))}</time></li>`).join('')
      : '<li class="empty empty--chat">Cuando la gente se mueva, lo ves aquí.</li>';
    S.feedLive.forEach(f => { f.nuevo = false; });
  }
  function pushFeed(icon, html) {
    S.feedLive.unshift({ t: Date.now(), icon, html, nuevo: true });
    S.feedLive = S.feedLive.slice(0, 30);
    S.vivo++;
    $('#side-live-n').textContent = int(S.vivo);
    $('#side-live-t').textContent = 'Último ' + fmtHora(Date.now());
    if (current === 'resumen') renderFeed();
  }

  /* =====================================================================
     6. PERSONAS
  ===================================================================== */
  const P_TABS = [
    ['todas', 'Todas', c => true], ['activas', 'Activas 7 d', c => c.ultimo_ingreso && Date.now() - ts(c.ultimo_ingreso) < 7 * DAY],
    ['nuevas', 'Nuevas 7 d', c => Date.now() - ts(c.creado_en) < 7 * DAY], ['sinconfirmar', 'Sin confirmar', c => !c.confirmado],
    ['riesgo', 'Reputación baja', c => c.resenas >= 3 && Number(c.rating) < 3.5], ['suspendidas', 'Suspendidas', c => c.suspendido],
  ];
  function renderPersonas() {
    const F = S.f.personas, all = personas(), now = Date.now();
    const tabFn = (P_TABS.find(t => t[0] === F.tab) || P_TABS[0])[2];
    $('#personas-tabs').innerHTML = P_TABS.map(([k, l, f]) => `<button role="tab" aria-selected="${F.tab === k}" data-ptab="${k}">${l}<span class="tab-count">${int(all.filter(f).length)}</span></button>`).join('');
    const q = norm(F.q);
    let rows = all.filter(tabFn).filter(c => !q || norm(`${c.nombre} ${c.email} ${c.barrio} ${c.ciudad} ${c.cedula || ''} ${c.telefono || ''}`).includes(q));
    const sorts = {
      recientes: (a, b) => ts(b.creado_en) - ts(a.creado_en), activos: (a, b) => (ts(b.ultimo_ingreso) || 0) - (ts(a.ultimo_ingreso) || 0),
      parches: (a, b) => (b.parches + b.unidos) - (a.parches + a.unidos), rating: (a, b) => (a.resenas ? Number(a.rating) : 9) - (b.resenas ? Number(b.rating) : 9), nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
    };
    rows.sort(sorts[F.sort] || sorts.recientes);
    const act7 = all.filter(c => c.ultimo_ingreso && now - ts(c.ultimo_ingreso) < 7 * DAY).length;
    const conParche = all.filter(c => c.unidos > 0).length;
    $('#personas-sub').innerHTML = `<b>${plural(all.length, 'persona')}</b> con cuenta. ${plural(act7, 'entró', 'entraron')} esta semana y ${int(pct(conParche, all.length))} % ya se unió a algún parche.`;
    const edades = all.map(c => edad(c.nacimiento)).filter(Boolean), prom = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : null;
    $('#personas-kpis').innerHTML = [
      ['mk--dark', 'Total', all.length, 'cuentas de personas'], ['', 'Activas 7 días', act7, `${pct(act7, all.length)} % del total`],
      ['', 'Se unieron a un parche', conParche, `${pct(conParche, all.length)} % del total`], ['', 'Edad promedio', prom, prom ? 'años' : 'sin datos'],
    ].map(([c, l, v, s]) => `<div class="mk ${c}" data-rise><small>${esc(l)}</small><b data-n="${v ?? ''}">${v == null ? '—' : 0}</b><span>${esc(s)}</span></div>`).join('');
    $$('#personas-kpis [data-n]').forEach(b => { if (b.dataset.n !== '') countUp(b, Number(b.dataset.n)); });
    const page = rows.slice(0, F.n);
    $('#personas-table tbody').innerHTML = page.length ? page.map(c => {
      const est = c.suspendido ? '<span class="pill neg">Suspendida</span>' : !c.confirmado ? '<span class="pill warn">Sin confirmar</span>' : (c.ultimo_ingreso && now - ts(c.ultimo_ingreso) < DAY) ? '<span class="pill pos"><span class="dot"></span>Activa hoy</span>' : '<span class="pill">Activa</span>';
      const low = c.resenas >= 3 && Number(c.rating) < 3.5;
      return `<tr data-persona="${esc(c.id)}" class="${c.suspendido ? 'is-susp' : ''}" tabindex="0">
        <td><div class="who">${ava(c, 'ava--sm')}<span class="who-t"><b>${esc(c.nombre)}</b><small>${esc(c.email)}</small></span></div></td>
        <td>${esc(c.ciudad)}<br><small class="muted">${esc(c.barrio || '')}</small></td>
        <td><span class="tags">${(c.intereses || []).slice(0, 3).map(x => `<span class="tag">${esc(CATS[x] || x)}</span>`).join('') || '<span class="muted">—</span>'}</span></td>
        <td class="num"><b>${int(c.parches)}</b> <small class="muted">/ ${int(c.unidos)}</small></td>
        <td class="num">${c.resenas ? `<span class="rating ${low ? 'is-low' : ''}">${ic('i-star')}${Number(c.rating).toFixed(1).replace('.', ',')}</span><br><small class="muted">${plural(c.resenas, 'reseña')}</small>` : '<span class="muted">Sin reseñas</span>'}</td>
        <td>${esc(fmtRel(c.ultimo_ingreso))}</td><td>${est}</td>
        <td><button class="icon-btn" data-persona="${esc(c.id)}" aria-label="Ver a ${esc(c.nombre)}">${ic('i-chev-right')}</button></td></tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty">${q ? `Nada coincide con «${esc(F.q)}».` : 'No hay personas en este filtro.'}</div></td></tr>`;
    $('#personas-foot').innerHTML = `<span>Mostrando ${int(page.length)} de ${int(rows.length)} · Parches: creados / unidos</span>${rows.length > page.length ? '<button class="btn btn--sm" data-action="mas-personas">Ver 40 más</button>' : ''}`;
    animateIn($('#view-personas'));
  }

  /* =====================================================================
     7. NAVEGACIÓN Y BÚSQUEDA
  ===================================================================== */
  const ROUTES = ['resumen', 'personas', 'negocios', 'parches', 'mapa', 'reportes', 'moderacion', 'reputacion', 'anuncios', 'registro', 'equipo'];
  const TITLES = { resumen: 'Centro de control', personas: 'Personas', negocios: 'Negocios', parches: 'Parches', mapa: 'Mapa en vivo', moderacion: 'Moderación', anuncios: 'Anuncios', registro: 'Bitácora', reportes: 'Reportes', reputacion: 'Reputación', equipo: 'Equipo y roles' };
  let current = null;
  const RENDER = { resumen: renderResumen, personas: renderPersonas, negocios: renderNegocios, parches: renderParches, mapa: renderMapa, moderacion: renderModeracion, anuncios: renderAnuncios, registro: renderRegistro, reportes: renderReportes, reputacion: renderReputacion, equipo: renderEquipo };
  function go(route, { force = false } = {}) {
    if (!ROUTES.includes(route) || (route === 'anuncios' && !ES_ADMIN())) route = 'resumen';
    const changed = route !== current;
    current = route;
    $$('.view').forEach(v => { const on = v.id === 'view-' + route; v.hidden = !on; if (on && (changed || force)) { v.classList.remove('in', 'quiet'); void v.offsetWidth; v.classList.add('in'); } });
    $$('.nav-item[data-route]').forEach(a => { if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.title = `${TITLES[route]} · Admin ModoParche`;
    RENDER[route]();
    if (changed) window.scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' });
    closeMenu();
  }
  function updateCounts() {
    const set = (id, n) => { const el = $(id); if (!el) return; const old = el.textContent; el.textContent = n ? int(n) : ''; if (old && old !== el.textContent) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } };
    set('#count-personas', personas().length);
    set('#count-negocios', S.negocios.length);
    set('#count-parches', S.parches.filter(p => !p.demo && ts(p.inicio) > Date.now()).length);
    set('#count-mod', flagged().length);
    set('#count-rep', S.reportes.filter(r => r.estado === 'abierto').length);
    set('#count-rep2', S.cals.filter(c => c.cruzada || c.racha).length);
  }

  // Búsqueda global
  let spSel = -1;
  function buscar(qRaw) {
    const pop = $('#search-pop'), q = norm(qRaw.trim());
    if (!q) { pop.hidden = true; $('#search').setAttribute('aria-expanded', 'false'); return; }
    const mark = s => { const t = esc(s), i = norm(s).indexOf(q); return i < 0 ? t : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
    const per = personas().filter(c => norm(`${c.nombre} ${c.email} ${c.cedula || ''} ${c.barrio}`).includes(q)).slice(0, 5);
    const neg = S.negocios.filter(n => norm(`${n.nombre} ${n.tipo} ${n.nit} ${n.barrio}`).includes(q)).slice(0, 4);
    const par = S.parches.filter(p => norm(`${p.titulo} ${p.lugar} ${p.creador_nombre || ''}`).includes(q)).slice(0, 5);
    const g = (t, arr, f) => arr.length ? `<p class="sp-group">${t}</p>${arr.map(f).join('')}` : '';
    pop.innerHTML = (g('Personas', per, c => `<button class="sp-item" data-persona="${esc(c.id)}" role="option">${ava(c, 'ava--sm')}<span class="sp-t"><b>${mark(c.nombre)}</b><small>${mark(c.email)}</small></span></button>`)
      + g('Negocios', neg, n => `<button class="sp-item" data-negocio="${esc(n.id)}" role="option">${logoNeg(n)}<span class="sp-t"><b>${mark(n.nombre)}</b><small>${esc(n.tipo)} · ${esc((PLANES[n.plan] || {}).nombre || '')}</small></span></button>`)
      + g('Parches', par, p => `<button class="sp-item" data-parche="${esc(p.id)}" role="option"><span class="cat-ic">${esc(catCode(p.categoria))}</span><span class="sp-t"><b>${mark(p.titulo)}</b><small>${esc(fmtCuando(ts(p.inicio)))} · ${esc(p.lugar)}</small></span></button>`))
      || `<p class="sp-empty">Nada con «${esc(qRaw)}».</p>`;
    pop.hidden = false; spSel = -1;
    $('#search').setAttribute('aria-expanded', 'true');
  }

  /* =====================================================================
     8. NEGOCIOS
  ===================================================================== */
  function renderNegocios() {
    const F = S.f.negocios, all = S.negocios, cuenta = byId();
    const nPlan = p => all.filter(n => n.plan === p).length;
    const mrr = nPlan('villavo') * PLANES.villavo.precio;
    $('#negocios-sub').innerHTML = `<b>${plural(all.length, 'negocio aliado', 'negocios aliados')}</b>. Publicaron ${plural(S.parches.filter(p => p.aliado && !p.demo).length, 'parche')} en total.`;
    $('#plans').innerHTML = `
      <div class="plan plan--mrr" data-rise><small>Ingreso mensual estimado</small><b data-n="${mrr}">$0</b><span>${plural(nPlan('villavo'), 'negocio')} en Parche Villavo</span></div>
      ${Object.entries(PLANES).map(([k, p]) => `<div class="plan" data-rise><small>${esc(p.nombre)}</small><b>${int(nPlan(k))}</b><span>${esc(p.txt)}</span><span class="track"><i data-v="${all.length ? (nPlan(k) / all.length).toFixed(3) : 0}"></i></span></div>`).join('')}`;
    const b = $('#plans [data-n]'); if (b) { const to = Number(b.dataset.n); if (REDUCED()) b.textContent = money(to); else { let t0; const st = n => { t0 = t0 || n; const k = Math.min(1, (n - t0) / 900); b.textContent = money(to * (1 - Math.pow(1 - k, 4))); if (k < 1) requestAnimationFrame(st); }; requestAnimationFrame(st); } }
    growBars($('#plans'));
    const tabs = [['todos', 'Todos', () => true], ['porverificar', 'Por verificar', n => !n.verificado], ['verificados', 'Verificados', n => n.verificado], ['villavo', 'Parche Villavo', n => n.plan === 'villavo'], ['basico', 'Parche básico', n => n.plan === 'basico'], ['sedes', 'Varias sedes', n => n.plan === 'sedes'], ['suspendidos', 'Suspendidos', n => (cuenta.get(n.id) || {}).suspendido]];
    $('#negocios-tabs').innerHTML = tabs.map(([k, l, f]) => `<button role="tab" aria-selected="${F.tab === k}" data-ntab="${k}">${l}<span class="tab-count">${int(all.filter(f).length)}</span></button>`).join('');
    const q = norm(F.q), tf = (tabs.find(t => t[0] === F.tab) || tabs[0])[2];
    const rows = all.filter(tf).filter(n => !q || norm(`${n.nombre} ${n.tipo} ${n.barrio} ${n.nit} ${n.responsable}`).includes(q))
      .map(n => ({ n, c: cuenta.get(n.id) || {}, ps: S.parches.filter(p => p.creador_id === n.id) }))
      .sort((a, b) => b.ps.length - a.ps.length);
    const mes0 = new Date(); mes0.setDate(1); mes0.setHours(0, 0, 0, 0);
    $('#bcards').innerHTML = rows.length ? rows.map(({ n, c, ps }) => {
      const asist = ps.reduce((a, p) => a + p.miembros, 0), prox = ps.filter(p => ts(p.inicio) > Date.now()).length;
      const mes = ps.filter(p => ts(p.creado_en) >= mes0.getTime()).length;
      const planPill = n.plan === 'villavo' ? 'brand' : n.plan === 'sedes' ? 'olive' : '';
      return `<article class="bcard ${c.suspendido ? 'is-susp' : ''}" data-rise>
        <div class="bcard-top">${logoNeg(n)}<div class="bcard-t"><b>${esc(n.nombre)}</b><small>${esc(n.tipo)} · ${esc(CATS[n.categoria] || n.categoria)}</small>${n.verificado ? `<span class="verif">${ic('i-shield')}Verificado</span>` : '<span class="pill warn" style="margin-top:6px;justify-self:start">Por verificar</span>'}</div>
          <span class="pill ${planPill}">${esc((PLANES[n.plan] || {}).nombre || n.plan)}</span></div>
        <div class="bcard-stats"><div><small>Parches</small><b>${int(ps.length)}</b></div><div><small>Asistentes</small><b>${int(asist)}</b></div><div><small>Por venir</small><b>${int(prox)}</b></div></div>
        <div class="bcard-info">
          <span>${ic('i-pin')}<span>${esc([n.direccion, n.barrio, n.ciudad].filter(Boolean).join(', '))}</span></span>
          <span>${ic('i-mail')}<span>${esc(c.email || '—')}</span></span>
          <span>${ic('i-clock')}<span>Aliado desde ${esc(fmtFecha(n.creado_en))} · entró ${esc(fmtRel(c.ultimo_ingreso))}</span></span>
          ${n.plan === 'basico' ? `<span>${ic('i-crown')}<span>${int(mes)} de 2 parches usados este mes</span></span>` : ''}
        </div>
        <div class="bcard-foot">
          <button class="btn btn--xs dark" data-negocio="${esc(n.id)}">${ic('i-eye')}Ver detalle</button>
          <button class="btn btn--xs ${n.verificado ? '' : 'primary'}" data-action="verificar" data-id="${esc(n.id)}" data-on="${n.verificado ? 0 : 1}"${SOLO}>${ic('i-shield')}${n.verificado ? 'Quitar sello' : 'Verificar'}</button>
          <button class="btn btn--xs" data-action="plan" data-id="${esc(n.id)}"${SOLO}>${ic('i-crown')}Plan</button>
          ${c.suspendido ? `<span class="pill neg">${ic('i-ban')}Suspendido</span>` : ''}
        </div></article>`;
    }).join('') : `<div class="empty empty--crown">${q ? `Ningún negocio coincide con «${esc(F.q)}».` : 'No hay negocios en este filtro.'}</div>`;
    animateIn($('#view-negocios'));
  }

  /* =====================================================================
     9. PARCHES
  ===================================================================== */
  const PA_TABS = [
    ['proximos', 'Por venir', p => !p.demo && ts(p.inicio) > Date.now()], ['curso', 'En curso', p => !p.demo && ts(p.inicio) <= Date.now() && ts(p.inicio) > Date.now() - 3 * HOUR],
    ['pasados', 'Pasados', p => !p.demo && ts(p.inicio) <= Date.now() - 3 * HOUR], ['llenos', 'Llenos', p => !p.demo && p.miembros >= p.cupos_max],
    ['aliados', 'De negocios', p => !p.demo && p.aliado], ['oficiales', 'Oficiales', p => p.oficial], ['ejemplo', 'Ejemplos del sistema', p => p.demo],
  ];
  function renderParches() {
    const F = S.f.parches, all = S.parches;
    $('#parches-tabs').innerHTML = PA_TABS.map(([k, l, f]) => `<button role="tab" aria-selected="${F.tab === k}" data-patab="${k}">${l}<span class="tab-count">${int(all.filter(f).length)}</span></button>`).join('');
    const tf = (PA_TABS.find(t => t[0] === F.tab) || PA_TABS[0])[2], q = norm(F.q);
    const base = all.filter(tf);
    const cats = [...new Set(base.map(p => p.categoria))];
    $('#parches-cats').innerHTML = `<button class="chip" aria-pressed="${!F.cat}" data-cat="">Todas</button>` + cats.map(c => `<button class="chip" aria-pressed="${F.cat === c}" data-cat="${esc(c)}">${esc(CATS[c] || c)} <b>${int(base.filter(p => p.categoria === c).length)}</b></button>`).join('');
    const rows = base.filter(p => !F.cat || p.categoria === F.cat).filter(p => !q || norm(`${p.titulo} ${p.lugar} ${p.barrio} ${p.creador_nombre || nombreDe(p.creador_id)}`).includes(q))
      .sort((a, b) => F.tab === 'pasados' ? ts(b.inicio) - ts(a.inicio) : ts(a.inicio) - ts(b.inicio)).slice(0, 120);
    const real = all.filter(p => !p.demo), tot = real.reduce((a, p) => a + p.miembros, 0);
    $('#parches-sub').innerHTML = F.tab === 'oficiales'
      ? `Cada mes, al menos un parche grande del equipo (conciertos y festivales). Sale arriba en el inicio de todos, con botones a la boletería oficial. <button class="btn btn--xs dark" data-action="nuevo-oficial"${SOLO}>${ic('i-crown')}Nuevo parche oficial</button>`
      : F.tab === 'ejemplo'
      ? `Los parches de ejemplo se renuevan solos cada hora cuando vencen. Puedes editarlos o <button class="btn btn--xs dark" data-action="renovar"${SOLO}>${ic('i-refresh')}Renovar ahora</button>`
      : `<b>${plural(real.length, 'parche real', 'parches reales')}</b> con ${plural(tot, 'persona')} dentro en total. Los ejemplos del sistema se ven aparte y no cuentan.`;
    const now = Date.now();
    $('#pcards').innerHTML = rows.length ? rows.map(p => {
      const t = ts(p.inicio), live = !p.demo && t <= now && t > now - 3 * HOUR, past = t <= now - 3 * HOUR, full = p.miembros >= p.cupos_max;
      const d = new Date(t);
      return `<article class="pcard ${live ? 'pcard--live' : ''} ${past ? 'pcard--past' : ''} ${p.demo ? 'pcard--demo' : ''}" data-rise>
        <div class="pdate"><small>${esc(cap(fmtSem(t)))}</small><b>${d.getDate()}</b><small>${esc(fmtMes(t))}</small></div>
        <div class="pbody">
          <div class="ptop"><b>${esc(p.titulo)}</b>${p.oficial ? `<span class="pill brand">${ic('i-crown')}Oficial</span>` : ''}${live ? '<span class="pill brand live"><span class="dot"></span>En curso</span>' : full ? `<span class="pill pos">${ic('i-check')}Lleno</span>` : p.demo ? '<span class="pill olive">Ejemplo</span>' : p.relampago ? `<span class="pill dark">${ic('i-bolt')}Relámpago</span>` : ''}</div>
          <div class="pmeta">
            <span>${ic('i-clock')}<span>${esc(fmtHora(t))} · ${esc(CATS[p.categoria] || p.categoria)}${p.costo ? ' · ' + money(p.costo) : ' · Gratis'}</span></span>
            <span>${ic('i-pin')}<span>${esc(p.lugar)}${p.barrio ? ', ' + esc(p.barrio) : ''}</span></span>
            <span>${ic(p.aliado ? 'i-store' : 'i-user')}<span>${esc(p.creador_nombre || nombreDe(p.creador_id))}${p.aliado ? ' · aliado' : ''}</span></span>
          </div>
          <div><span class="track ${full ? 'is-full' : ''}"><i data-v="${Math.min(1, p.miembros / p.cupos_max).toFixed(3)}"></i></span>
            <div class="pfill"><span><b>${int(p.miembros)}</b> de ${int(p.cupos_max)} cupos</span><span>${pct(p.miembros, p.cupos_max)} %</span></div></div>
          <div class="pfoot">
            <button class="btn btn--xs dark" data-parche="${esc(p.id)}">${ic('i-eye')}Ver detalle</button>
            <button class="btn btn--xs" data-action="${p.oficial ? 'editar-oficial' : 'editar'}" data-id="${esc(p.id)}"${SOLO}>${ic('i-edit')}Editar</button>
            ${p.lat ? `<button class="icon-btn" data-action="ver-mapa" data-id="${esc(p.id)}" aria-label="Ver en el mapa" title="Ver en el mapa">${ic('i-map')}</button>` : ''}
            <button class="icon-btn pfoot-del" data-action="retirar" data-id="${esc(p.id)}" aria-label="Retirar ${esc(p.titulo)}" title="Retirar parche"${SOLO}>${ic('i-trash')}</button>
          </div></div></article>`;
    }).join('') : `<div class="empty empty--crown">${q || F.cat ? 'Ningún parche coincide con el filtro.' : 'No hay parches aquí todavía.'}</div>`;
    growBars($('#pcards'));
    animateIn($('#view-parches'));
  }

  /* =====================================================================
     10. MAPA
  ===================================================================== */
  let map = null, layer = null;
  const CENTRO = [4.1420, -73.6266];
  function renderMapa() {
    const now = Date.now(), capa = S.f.mapa;
    $$('#mapa-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.capa === capa)));
    const ps = S.parches.filter(p => !p.demo && p.lat && ts(p.inicio) > now - 3 * HOUR).sort((a, b) => ts(a.inicio) - ts(b.inicio));
    const ns = S.negocios.filter(n => n.lat && n.lng);
    const showP = capa !== 'negocios', showN = capa !== 'parches';
    $('#mapa-sub').innerHTML = `<b>${plural(ps.length, 'parche')}</b> por venir o en curso y <b>${plural(ns.length, 'negocio')}</b> con ubicación.`;
    const items = [...(showP ? ps.map(p => ({ k: 'p', o: p, live: ts(p.inicio) <= now })) : []), ...(showN ? ns.map(n => ({ k: 'n', o: n })) : [])];
    $('#mapa-count').textContent = plural(items.length, 'punto');
    $('#map-list').innerHTML = items.length ? items.map((it, i) => `<li><button data-mi="${i}"><i class="lg ${it.k === 'n' ? 'lg--n' : it.live ? 'lg--live' : 'lg--p'}"></i><span><b>${esc(it.k === 'n' ? it.o.nombre : it.o.titulo)}</b><small>${esc(it.k === 'n' ? `${it.o.tipo} · ${it.o.barrio}` : `${it.live ? 'En curso' : fmtCuando(ts(it.o.inicio))} · ${it.o.miembros}/${it.o.cupos_max}`)}</small></span></button></li>`).join('')
      : '<li class="empty">Nada para mostrar.</li>';
    if (!window.L) { $('#map').innerHTML = '<div class="empty" style="height:100%">No cargó el mapa. Revisa tu conexión.</div>'; return; }
    if (!map) {
      map = L.map('map', { zoomControl: true, attributionControl: true }).setView(CENTRO, 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      // Buscar un lugar o dirección y volar hasta allá (mp-mapa.js)
      if (window.MPMapa) window.MPMapa.buscador(map, { placeholder: 'Busca un lugar o dirección', posicion: 'topright' });
    }
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    const markers = items.map(it => {
      const html = it.k === 'n' ? `<div class="mk-pin mk-pin--n"><span>${esc(initials(it.o.nombre))}</span></div>` : `<div class="mk-pin ${it.live ? 'mk-pin--live' : ''}"><span>${esc(String(it.o.miembros))}</span></div>`;
      const m = L.marker([it.o.lat, it.o.lng], { icon: L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }) })
        .bindPopup(it.k === 'n' ? `<b>${esc(it.o.nombre)}</b><small>${esc(it.o.tipo)} · ${esc((PLANES[it.o.plan] || {}).nombre || '')}</small>`
          : `<b>${esc(it.o.titulo)}</b><small>${esc(fmtCuando(ts(it.o.inicio)))} · ${esc(it.o.lugar)}<br>${it.o.miembros} de ${it.o.cupos_max} cupos</small>`);
      m.addTo(layer); return m;
    });
    $('#map-list').onclick = e => { const b = e.target.closest('[data-mi]'); if (!b) return; const it = items[+b.dataset.mi]; map.flyTo([it.o.lat, it.o.lng], 16, { duration: REDUCED() ? 0 : .8 }); markers[+b.dataset.mi].openPopup(); };
    setTimeout(() => { map.invalidateSize(); if (markers.length && !S._mapFit) { map.fitBounds(L.featureGroup(markers).getBounds().pad(.15), { maxZoom: 14 }); S._mapFit = true; } }, 60);
    if (S._flyTo) { const p = S._flyTo; S._flyTo = null; setTimeout(() => map.flyTo([p.lat, p.lng], 16), 120); }
  }

  /* =====================================================================
     11. MODERACIÓN
  ===================================================================== */
  const REGLAS = [
    ['Grosería', /\b(hijueputa|hp|gonorrea|malparid[oa]s?|pirob[oa]s?|careverga|guev[oó]n|huev[oó]n|mierda|put[oa]s?|marica|perra)\b/gi],
    ['Teléfono', /(\+?57[\s-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g],
    ['Enlace', /(https?:\/\/\S+|www\.\S+|\b\S+\.(com|co|net|ly)\b\S*)/gi],
    ['Plata', /\b(nequi|daviplata|transferencia|transfier[ae]n?|consign[ae]n?|pr[eé]st[ae]nme|pr[eé]stame|adelanto|abono)\b/gi],
  ];
  function banderas(t) { return REGLAS.filter(([, r]) => { r.lastIndex = 0; return r.test(t); }).map(([n]) => n); }
  function resaltar(t) {
    let h = esc(t);
    REGLAS.forEach(([, r]) => { r.lastIndex = 0; h = h.replace(r, m => `<mark>${m}</mark>`); });
    return h;
  }
  function renderModeracion() {
    const F = S.f.mod, all = S.mensajes, fl = flagged();
    const tabs = [['marcados', 'Marcados', m => banderas(m.texto).length], ['hoy', 'Últimas 24 h', m => Date.now() - ts(m.creado_en) < DAY], ['todos', 'Todos', () => true]];
    $('#mod-tabs').innerHTML = tabs.map(([k, l, f]) => `<button role="tab" aria-selected="${F.tab === k}" data-mtab="${k}">${l}<span class="tab-count">${int(all.filter(f).length)}</span></button>`).join('');
    $('#mod-sub').innerHTML = `${plural(all.length, 'mensaje reciente', 'mensajes recientes')} de los chats. <b>${plural(fl.length, 'está marcado', 'están marcados')}</b> para revisar.`;
    const q = norm(F.q), tf = (tabs.find(t => t[0] === F.tab) || tabs[0])[2];
    const rows = all.filter(tf).filter(m => !q || norm(`${m.texto} ${tituloParche(m.parche_id)} ${nombreDe(m.autor_id)}`).includes(q)).slice(0, 150);
    $('#msgs').innerHTML = rows.length ? rows.map(m => {
      const b = banderas(m.texto), autor = CUENTA.get(m.autor_id) || { id: m.autor_id, nombre: 'Alguien' };
      return `<li class="msg ${b.length ? 'is-flag' : ''}" data-msg="${m.id}" data-rise>${ava(autor)}
        <div><div class="msg-top"><b>${esc(autor.nombre)}</b><span>en</span><a href="#" data-parche="${esc(m.parche_id)}">${esc(tituloParche(m.parche_id))}</a><span>· ${esc(fmtRel(m.creado_en))}</span></div>
        <p class="msg-text">${resaltar(m.texto)}</p>${b.length ? `<div class="msg-flags">${b.map(x => `<span class="pill warn">${ic('i-flag')}${esc(x)}</span>`).join('')}</div>` : ''}</div>
        <div class="msg-act"><button class="icon-btn" data-persona="${esc(m.autor_id)}" aria-label="Ver a ${esc(autor.nombre)}" title="Ver a quien lo escribió">${ic('i-user')}</button>
          <button class="icon-btn" data-action="borrar-msg" data-id="${m.id}" aria-label="Borrar mensaje" title="Borrar mensaje">${ic('i-trash')}</button></div></li>`;
    }).join('') : `<li class="empty ${F.tab === 'marcados' ? 'empty--ok' : 'empty--chat'}">${F.tab === 'marcados' && !q ? '<b>Nada marcado.</b> La comunidad se está portando bien.' : 'No hay mensajes con ese filtro.'}</li>`;
    animateIn($('#view-moderacion'));
  }

  /* =====================================================================
     12. ANUNCIOS Y BITÁCORA
  ===================================================================== */
  /* ---------- reportes de la comunidad ---------- */
  const MOTIVOS = {
    peligro: ['Peligro', 'i-alert', true], acoso: ['Acoso', 'i-ban', true], estafa: ['Estafa o plata', 'i-ticket', true],
    no_llego: ['No llegó', 'i-clock', false], spam: ['Spam', 'i-mail', false], contenido: ['Contenido indebido', 'i-flag', false], otro: ['Otro', 'i-info', false],
  };
  const TIPO_REP = { persona: 'una persona', parche: 'un parche', mensaje: 'un mensaje' };
  function renderReportes() {
    const F = S.f.reportes, all = S.reportes;
    const tabs = [['abierto', 'Por resolver'], ['resuelto', 'Resueltos'], ['descartado', 'Descartados'], ['todos', 'Todos']];
    const tf = r => F.tab === 'todos' || r.estado === F.tab;
    $('#rep-tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${F.tab === k}" data-rtab="${k}">${l}<span class="tab-count">${int(all.filter(r => k === 'todos' || r.estado === k).length)}</span></button>`).join('');
    const base = all.filter(tf);
    $('#rep-motivos').innerHTML = `<button class="chip" aria-pressed="${!F.motivo}" data-motivo="">Todos</button>` + Object.entries(MOTIVOS).filter(([k]) => base.some(r => r.motivo === k))
      .map(([k, [l, i]]) => `<button class="chip" aria-pressed="${F.motivo === k}" data-motivo="${k}">${ic(i)}${esc(l)} <b>${int(base.filter(r => r.motivo === k).length)}</b></button>`).join('');
    const abiertos = all.filter(r => r.estado === 'abierto'), graves = abiertos.filter(r => MOTIVOS[r.motivo]?.[2]);
    const porCuenta = new Map(); all.forEach(r => { if (r.usuario_id) porCuenta.set(r.usuario_id, (porCuenta.get(r.usuario_id) || 0) + 1); });
    const reinc = [...porCuenta.values()].filter(n => n >= 2).length;
    const res = all.filter(r => r.resuelto_en), horas = res.length ? Math.round(res.reduce((a, r) => a + (ts(r.resuelto_en) - ts(r.creado_en)), 0) / res.length / HOUR) : null;
    $('#rep-sub').innerHTML = abiertos.length ? `<b>${plural(abiertos.length, 'reporte espera', 'reportes esperan')}</b> una respuesta. ${graves.length ? `${plural(graves.length, 'es', 'son')} de peligro, acoso o estafa: empieza por ahí.` : ''}` : 'No hay reportes pendientes. La comunidad está tranquila.';
    $('#rep-kpis').innerHTML = [['mk--dark', 'Por resolver', abiertos.length, 'reportes abiertos'], ['', 'Graves', graves.length, 'peligro, acoso o estafa'], ['', 'Cuentas reincidentes', reinc, 'con 2 o más reportes'], ['', 'Tiempo de respuesta', horas, horas != null ? 'horas en promedio' : 'sin datos']]
      .map(([c, l, v, s]) => `<div class="mk ${c}" data-rise><small>${esc(l)}</small><b data-n="${v ?? ''}">${v == null ? '—' : 0}</b><span>${esc(s)}</span></div>`).join('');
    $$('#rep-kpis [data-n]').forEach(b => { if (b.dataset.n !== '') countUp(b, Number(b.dataset.n)); });
    const q = norm(F.q);
    const rows = base.filter(r => !F.motivo || r.motivo === F.motivo)
      .filter(r => !q || norm(`${r.copia} ${r.detalle} ${nombreDe(r.autor_id)} ${nombreDe(r.usuario_id)} ${tituloParche(r.parche_id)}`).includes(q))
      .sort((a, b) => (a.estado === 'abierto' && b.estado === 'abierto') ? ((MOTIVOS[b.motivo]?.[2] ? 1 : 0) - (MOTIVOS[a.motivo]?.[2] ? 1 : 0)) || ts(b.creado_en) - ts(a.creado_en) : ts(b.creado_en) - ts(a.creado_en));
    $('#reps').innerHTML = rows.length ? rows.map(r => {
      const [ml, mi, grave] = MOTIVOS[r.motivo] || ['Otro', 'i-info', false];
      const otros = (porCuenta.get(r.usuario_id) || 0) - 1, msgVivo = r.mensaje_id && S.mensajes.some(m => String(m.id) === String(r.mensaje_id));
      const abierto = r.estado === 'abierto';
      return `<li class="rep ${grave && abierto ? 'is-hot' : ''} ${abierto ? '' : 'is-done'}" data-rep="${r.id}" data-rise>
        <span class="rep-ic">${ic(mi)}</span>
        <div>
          <div class="rep-top"><b>${esc(ml)}</b><span>· reportaron ${esc(TIPO_REP[r.tipo] || r.tipo)}</span>
            ${r.estado === 'resuelto' ? `<span class="pill pos">${ic('i-check')}Resuelto</span>` : r.estado === 'descartado' ? '<span class="pill">Descartado</span>' : ''}
            ${otros > 0 ? `<span class="pill neg">${plural(otros + 1, 'reporte', 'reportes')} contra esta cuenta</span>` : ''}
            <time title="${esc(new Date(ts(r.creado_en)).toLocaleString('es-CO'))}">${esc(fmtRel(r.creado_en))}</time></div>
          <p class="rep-who">${r.autor_id ? `<a href="#" data-persona="${esc(r.autor_id)}">${esc(nombreDe(r.autor_id))}</a>` : 'Una cuenta borrada'} reportó
            ${r.usuario_id ? `a <a href="#" data-persona="${esc(r.usuario_id)}">${esc(nombreDe(r.usuario_id))}</a>` : ''}${r.parche_id ? ` en <a href="#" data-parche="${esc(r.parche_id)}">${esc(tituloParche(r.parche_id) === 'un parche' ? (r.tipo === 'parche' ? r.copia : 'un parche') : tituloParche(r.parche_id))}</a>` : ''}</p>
          ${r.copia && r.tipo !== 'persona' ? `<p class="rep-copia">«${resaltar(r.copia)}»</p>` : ''}
          ${r.detalle ? `<p class="rep-det"><b>Lo que contó:</b> ${esc(r.detalle)}</p>` : ''}
          ${!abierto && r.resolucion ? `<p class="rep-res">${ic('i-check')} ${esc(r.resolucion)} · ${esc(fmtRel(r.resuelto_en))}</p>` : ''}
          <div class="rep-foot">
            ${abierto ? `<button class="btn btn--xs dark" data-action="resolver" data-id="${r.id}">${ic('i-check')}Resolver</button>
              <button class="btn btn--xs" data-action="descartar" data-id="${r.id}">Descartar</button>
              ${r.usuario_id ? `<button class="btn btn--xs" data-action="advertir" data-id="${esc(r.usuario_id)}">${ic('i-alert')}Advertir</button>` : ''}
              ${msgVivo ? `<button class="btn btn--xs danger" data-action="borrar-msg" data-id="${r.mensaje_id}">${ic('i-trash')}Borrar mensaje</button>` : ''}
              ${r.usuario_id && !(CUENTA.get(r.usuario_id) || {}).suspendido ? `<button class="btn btn--xs danger" data-action="suspender" data-id="${esc(r.usuario_id)}" data-on="1"${SOLO}>${ic('i-ban')}Suspender</button>` : ''}`
              : `<button class="btn btn--xs" data-action="reabrir" data-id="${r.id}">${ic('i-refresh')}Reabrir</button>`}
          </div>
        </div></li>`;
    }).join('') : `<li class="empty empty--ok">${F.tab === 'abierto' && !q && !F.motivo ? '<b>Nada por resolver.</b> Cuando alguien reporte desde la app, aparece aquí al instante.' : 'No hay reportes con ese filtro.'}</li>`;
    animateIn($('#view-reportes'));
  }

  /* ---------- reputación ---------- */
  const estrellas = (n, low) => `<span class="stars-v ${low ? 'is-low' : ''}" role="img" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5].map(i => `<svg class="ic ${i <= n ? '' : 'off'}" aria-hidden="true"><use href="#i-star"/></svg>`).join('')}</span>`;
  function renderReputacion() {
    const F = S.f.cals, all = S.cals;
    const sosp = all.filter(c => c.cruzada || c.racha), bajas = all.filter(c => c.estrellas <= 2);
    const prom = all.length ? all.reduce((a, c) => a + c.estrellas, 0) / all.length : null;
    const tabs = [['sospechosas', 'Sospechosas', sosp], ['bajas', '1 y 2 estrellas', bajas], ['todas', 'Todas', all]];
    $('#cal-tabs').innerHTML = tabs.map(([k, l, a]) => `<button role="tab" aria-selected="${F.tab === k}" data-ctab="${k}">${l}<span class="tab-count">${int(a.length)}</span></button>`).join('');
    $('#cal-sub').innerHTML = `${plural(all.length, 'calificación', 'calificaciones')} entre personas que llegaron al mismo parche. ${sosp.length ? `<b>${plural(sosp.length, 'parece', 'parecen')} injusta${sosp.length === 1 ? '' : 's'}</b>: peleas cruzadas o alguien castigando a todo el grupo.` : 'Ninguna parece injusta.'}`;
    const volver = all.length ? Math.round(all.filter(c => c.volver).length / all.length * 100) : null;
    $('#cal-kpis').innerHTML = [['mk--dark', 'Promedio', prom, 'estrellas de 5', 1], ['', 'Sospechosas', sosp.length, 'para revisar'], ['', 'Bajas', bajas.length, '1 o 2 estrellas'], ['', 'Volverían a parchar', volver, volver != null ? '% de las veces' : 'sin datos']]
      .map(([c, l, v, s, d]) => `<div class="mk ${c}" data-rise><small>${esc(l)}</small><b data-n="${v ?? ''}" data-dec="${d || 0}">${v == null ? '—' : 0}</b><span>${esc(s)}</span></div>`).join('');
    $$('#cal-kpis [data-n]').forEach(b => { if (b.dataset.n !== '') countUp(b, Number(b.dataset.n), { dec: Number(b.dataset.dec) }); });
    const list = (tabs.find(t => t[0] === F.tab) || tabs[0])[2].slice(0, 150);
    $('#cals').innerHTML = list.length ? list.map(c => `<li class="cal ${c.cruzada || c.racha ? 'is-flag' : ''}" data-cal="${esc(c.parche_id)}|${esc(c.autor_id)}|${esc(c.calificado_id)}" data-rise>
        <div><div class="cal-who"><a href="#" data-persona="${esc(c.autor_id)}">${esc(nombreDe(c.autor_id))}</a><span class="arrow">→</span><a href="#" data-persona="${esc(c.calificado_id)}">${esc(nombreDe(c.calificado_id))}</a>${estrellas(c.estrellas, c.estrellas <= 2)}</div>
          <div class="cal-meta"><span>en <a href="#" data-parche="${esc(c.parche_id)}">${esc(c.parche || tituloParche(c.parche_id))}</a> · ${esc(fmtRel(c.creado_en))}</span>
            ${c.cruzada ? '<span class="pill warn">Pelea cruzada</span>' : ''}${c.racha ? '<span class="pill warn">Racha de castigo</span>' : ''}${c.volver ? '<span class="pill pos">Volvería</span>' : ''}</div></div>
        <button class="btn btn--xs danger" data-action="anular-cal">${ic('i-trash')}Anular</button></li>`).join('')
      : `<li class="empty empty--ok">${F.tab === 'sospechosas' ? '<b>Nada sospechoso.</b> Las calificaciones se ven justas.' : 'Aún no hay calificaciones.'}</li>`;
    const low = personas().filter(c => c.resenas >= 3).sort((a, b) => Number(a.rating) - Number(b.rating)).slice(0, 8);
    $('#baja').innerHTML = low.length ? low.map((c, i) => `<li><button data-persona="${esc(c.id)}"><span class="rank-n">${i + 1}</span>${ava(c)}
      <span class="rank-t"><b>${esc(c.nombre)}</b><small>${plural(c.resenas, 'reseña')}${c.reportado ? ` · ${plural(c.reportado, 'reporte')}` : ''}</small></span>
      <span class="rank-v"><b style="color:${Number(c.rating) < 3.5 ? 'var(--negative)' : 'inherit'}">${Number(c.rating).toFixed(1).replace('.', ',')}</b><small>de 5</small></span></button></li>`).join('')
      : '<li class="empty">Aún nadie tiene 3 reseñas.</li>';
    animateIn($('#view-reputacion'));
  }

  /* ---------- equipo y roles ---------- */
  function renderEquipo() {
    const acc = id => S.registro.filter(r => r.admin_id === id), now = Date.now();
    $('#team').innerHTML = S.equipo.map(a => {
      const mias = a.acciones != null ? a.acciones : acc(a.id).length, sem = a.acciones_7d != null ? a.acciones_7d : acc(a.id).filter(r => now - ts(r.creado_en) < 7 * DAY).length;
      return `<article class="mate ${a.rol === 'moderador' ? 'mate--mod' : ''}" data-rise>
        <div class="mate-top"><span class="me-ava" aria-hidden="true">${esc(initials(a.nombre).slice(0, 1))}</span><div><b>${esc(a.nombre)}${a.id === ME.id ? ' (tú)' : ''}</b><small>${esc(a.email || '')}</small></div>
          <span class="pill ${a.rol === 'admin' ? 'brand' : 'olive'}" style="margin-left:auto">${a.rol === 'admin' ? 'Admin' : 'Moderador'}</span></div>
        <div class="mate-stats"><div><small>Acciones</small><b>${int(mias)}</b></div><div><small>Esta semana</small><b>${int(sem)}</b></div><div><small>Entró</small><b style="font:700 13px/1.2 var(--font)">${esc(fmtRel(a.ultimo_ingreso))}</b></div></div></article>`;
    }).join('');
    const P = [
      ['Ver métricas, mapa, parches y negocios', 1, 1], ['Resolver reportes y advertir', 1, 1], ['Borrar mensajes de los chats', 1, 1], ['Notas internas sobre una cuenta', 1, 1], ['Anular calificaciones', 1, 1],
      ['Ver cédula, teléfono y nacimiento', 1, 0], ['Suspender y reactivar cuentas', 1, 0], ['Verificar negocios y cambiar planes', 1, 0], ['Editar o retirar parches', 1, 0], ['Enviar anuncios y exportar datos', 1, 0],
    ];
    const si = v => v ? `<span class="si">${ic('i-check')}</span>` : `<span class="no">${ic('i-close')}</span>`;
    $('#perm').innerHTML = `<thead><tr><th>Puede…</th><th>Admin</th><th>Moderador</th></tr></thead><tbody>${P.map(([l, a, m]) => `<tr><td>${esc(l)}</td><td>${si(a)}</td><td>${si(m)}</td></tr>`).join('')}</tbody>`;
    const sql = [
      ['Moderador nuevo', "select private.crear_admin('correo@dominio.com', 'Contraseña123', 'Nombre', 'moderador');"],
      ['Admin nuevo', "select private.crear_admin('correo@dominio.com', 'Contraseña123', 'Nombre', 'admin');"],
      ['Subir un moderador a admin', "update public.admins set rol = 'admin'\n  where id = (select id from auth.users where email = 'correo@dominio.com');"],
      ['Quitarle el acceso a alguien', "delete from public.admins\n  where id = (select id from auth.users where email = 'correo@dominio.com');"],
    ];
    $('#sql-box').innerHTML = sql.map(([l, s]) => `<div class="sql"><small>${esc(l)}</small>${esc(s)}<button class="icon-btn" data-action="copiar" data-v="${esc(s)}" aria-label="Copiar">${ic('i-copy')}</button></div>`).join('');
    animateIn($('#view-equipo'));
  }

  const PLANTILLAS = [
    ['Puente festivo', 'Este puente festivo hay parches por todo Villavo. Abre el radar y cáele a uno.'],
    ['Lluvia', 'Se viene lluvia esta tarde. Si tu parche es al aire libre, activa el Plan B a tiempo.'],
    ['Seguridad', 'Recuerda: nunca envíes plata por adelantado a alguien de un parche. Los pagos son en el lugar.'],
    ['Nuevos aliados', 'Llegaron nuevos negocios aliados con cupones. Mira el mapa y encuentra el tuyo.'],
  ];
  function alcance() {
    const pub = S.f.anuncio.publico, ciu = $('#an-ciudad').value;
    return S.cuentas.filter(c => c.tipo !== 'admin' && !c.suspendido && c.recibe_anuncios && (pub === 'todos' || (pub === 'negocios') === (c.tipo === 'negocio')) && (!ciu || c.ciudad === ciu)).length;
  }
  let prevT;
  function renderAnuncios() {
    $$('#an-publico button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.f.anuncio.publico)));
    $('#an-plantillas').innerHTML = PLANTILLAS.map(([l], i) => `<button type="button" class="chip" data-plantilla="${i}">${esc(l)}</button>`).join('');
    syncAnuncio(false);
    const hist = S.registro.filter(r => r.accion === 'anuncio');
    $('#an-hist').innerHTML = hist.length ? hist.map(r => `<li><p>${esc(r.detalle)}</p><small>${esc(r.objetivo)} · ${esc(r.admin_nombre)} · ${esc(fmtRel(r.creado_en))}</small></li>`).join('') : '<li class="empty">Aún no has enviado anuncios.</li>';
    $('#phone-time').textContent = fmtHora(Date.now()).replace(/\s?[ap]\.\s?m\./, '');
  }
  function syncAnuncio(bump = true) {
    const t = $('#an-texto').value, n = t.length;
    $('#an-count').textContent = `${n} / 240`;
    $('#an-count').classList.toggle('is-near', n > 200);
    $('#an-preview').textContent = t.trim() || 'Tu mensaje aparece aquí.';
    const r = alcance(); const el = $('#an-reach'); countUp(el, r);
    if (bump) { clearTimeout(prevT); prevT = setTimeout(() => { const pt = $('#phone-toast'); pt.classList.remove('bump'); void pt.offsetWidth; pt.classList.add('bump'); }, 380); }
  }

  const ACCIONES = {
    suspender: { txt: 'suspendió a', l: 'Suspensión', icon: 'i-ban' }, reactivar: { txt: 'reactivó a', l: 'Reactivación', icon: 'i-check' },
    retirar_parche: { txt: 'retiró el parche', l: 'Parche retirado', icon: 'i-trash' }, cambiar_plan: { txt: 'cambió el plan de', l: 'Cambio de plan', icon: 'i-crown' },
    borrar_mensaje: { txt: 'borró un mensaje en', l: 'Mensaje borrado', icon: 'i-chat' }, anuncio: { txt: 'envió un anuncio a', l: 'Anuncio', icon: 'i-megaphone' },
    resolver_reporte: { txt: 'resolvió el', l: 'Reporte resuelto', icon: 'i-check' }, descartar_reporte: { txt: 'descartó el', l: 'Reporte descartado', icon: 'i-flag' }, reabrir_reporte: { txt: 'reabrió el', l: 'Reporte reabierto', icon: 'i-flag' },
    verificar: { txt: 'verificó a', l: 'Verificación', icon: 'i-shield' }, quitar_verificado: { txt: 'le quitó el sello a', l: 'Sello quitado', icon: 'i-shield' },
    nota: { txt: 'dejó una nota sobre', l: 'Nota interna', icon: 'i-edit' }, advertencia: { txt: 'advirtió a', l: 'Advertencia', icon: 'i-alert' },
    anular_calificacion: { txt: 'anuló una calificación de', l: 'Calificación anulada', icon: 'i-star' }, editar_parche: { txt: 'editó el parche', l: 'Parche editado', icon: 'i-edit' }, renovar_ejemplos: { txt: 'renovó los', l: 'Ejemplos', icon: 'i-refresh' },
  };
  function renderRegistro() {
    const F = S.f.log, all = S.registro;
    const tabs = [['todo', 'Todo'], ['reportes', 'Reportes'], ['suspender', 'Suspensiones'], ['advertencia', 'Advertencias y notas'], ['retirar_parche', 'Parches'], ['borrar_mensaje', 'Mensajes'], ['verificar', 'Negocios'], ['anuncio', 'Anuncios']];
    const GRUPOS = { reportes: ['resolver_reporte', 'descartar_reporte', 'reabrir_reporte'], suspender: ['suspender', 'reactivar'], advertencia: ['advertencia', 'nota', 'anular_calificacion'],
      retirar_parche: ['retirar_parche', 'editar_parche', 'renovar_ejemplos'], verificar: ['verificar', 'quitar_verificado', 'cambiar_plan'] };
    const f = k => k === 'todo' ? all : all.filter(r => (GRUPOS[k] || [k]).includes(r.accion));
    $('#log-tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${F.tab === k}" data-ltab="${k}">${l}<span class="tab-count">${int(f(k).length)}</span></button>`).join('');
    const rows = f(F.tab);
    $('#timeline').innerHTML = rows.length ? rows.map(r => { const a = ACCIONES[r.accion] || { txt: r.accion, l: r.accion, icon: 'i-shield' };
      return `<li class="tl tl--${esc(r.accion)}" data-rise><div class="tl-top"><span class="pill">${ic(a.icon)}${esc(a.l)}</span><b>${esc(r.admin_nombre || 'Admin')}</b><span>${esc(a.txt)}</span><b>${esc(r.objetivo)}</b><time title="${esc(new Date(ts(r.creado_en)).toLocaleString('es-CO'))}">${esc(fmtRel(r.creado_en))}</time></div>${r.detalle ? `<p>${esc(r.detalle)}</p>` : ''}</li>`; }).join('')
      : '<li class="empty empty--ok">Sin movimientos todavía.</li>';
    animateIn($('#view-registro'));
  }
  function anotar(accion, objetivo, detalle) {
    S.registro.unshift({ id: Date.now(), admin_id: ME.id, admin_nombre: ME.nombre, accion, objetivo, detalle, creado_en: new Date().toISOString() });
  }

  /* =====================================================================
     13. DETALLE, DIÁLOGOS Y ACCIONES
  ===================================================================== */
  let lastFocus = null;
  function openDrawer(html) {
    lastFocus = document.activeElement;
    const d = $('#drawer');
    $('#drawer-body').innerHTML = html;
    d.classList.remove('is-out'); d.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => $('.drawer-x').focus(), 50);
    growBars(d);
  }
  function closeDrawer() {
    const d = $('#drawer'); if (d.hidden) return;
    d.classList.add('is-out');
    setTimeout(() => { d.hidden = true; d.classList.remove('is-out'); document.body.classList.remove('no-scroll'); }, REDUCED() ? 0 : 300);
    if (lastFocus) lastFocus.focus();
  }
  const skel = n => Array.from({ length: n }, () => '<div class="skel" style="height:36px"></div>').join('');

  async function verPersona(id) {
    const c = CUENTA.get(id); if (!c) return;
    if (c.tipo === 'negocio') return verNegocio(id);
    const e = edad(c.nacimiento), low = c.resenas >= 3 && Number(c.rating) < 3.5;
    const tel = c.telefono ? String(c.telefono) : '';
    openDrawer(`
      <div class="d-head"><div class="d-who">${ava(c, 'ava--lg')}<div><h2 id="drawer-title">${esc(c.nombre)}</h2><p>${esc(c.email)}</p></div></div>
        <div class="d-pills">${c.tipo === 'admin' ? `<span class="pill brand">${ic('i-shield')}Admin</span>` : ''}${c.suspendido ? `<span class="pill neg">${ic('i-ban')}Suspendida</span>` : '<span class="pill pos">Activa</span>'}${c.confirmado ? '' : '<span class="pill warn">Sin confirmar</span>'}${c.resenas ? `<span class="pill ${low ? 'neg' : 'dark'}">${ic('i-star')}${Number(c.rating).toFixed(1).replace('.', ',')} · ${plural(c.resenas, 'reseña')}</span>` : ''}${c.reportado ? `<span class="pill warn">${ic('i-flag')}${plural(c.reportado, 'reporte')}</span>` : ''}${c.advertencias ? `<span class="pill warn">${ic('i-alert')}${plural(c.advertencias, 'advertencia')}</span>` : ''}</div></div>
      <div class="d-body">
        <div class="d-stats"><div><b>${int(c.parches)}</b><small>Creó</small></div><div><b>${int(c.unidos)}</b><small>Se unió</small></div><div><b>${int(c.checkins)}</b><small>Llegó</small></div><div><b>${int(c.mensajes)}</b><small>Mensajes</small></div></div>
        <section class="d-sec"><h3>Datos</h3><dl class="dl">
          <dt>Ciudad</dt><dd>${esc(c.ciudad)}${c.barrio ? ', ' + esc(c.barrio) : ''}</dd>
          <dt>Edad</dt><dd>${e ? `${e} años` : '—'}</dd>
          ${ES_ADMIN() ? `<dt>Cédula</dt><dd>${c.cedula ? `<span id="ced">•••• ${esc(String(c.cedula).slice(-4))}</span><button class="icon-btn" data-action="ver-cedula" data-v="${esc(c.cedula)}" aria-label="Mostrar cédula completa">${ic('i-eye')}</button>` : '—'}</dd>
          <dt>Teléfono</dt><dd>${tel ? `${esc(tel)} <a class="icon-btn" href="https://wa.me/57${esc(tel.replace(/\D/g, ''))}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">${ic('i-phone')}</a>` : '—'}</dd>` : '<dt>Datos privados</dt><dd class="muted">Solo los ve un admin</dd>'}
          <dt>Instagram</dt><dd>${c.instagram ? esc(c.instagram) : '—'}</dd>
          <dt>Gustos</dt><dd><span class="tags">${(c.intereses || []).map(x => `<span class="tag">${esc(CATS[x] || x)}</span>`).join('') || '—'}</span></dd>
          <dt>Cuenta creada</dt><dd>${esc(fmtFecha(c.creado_en))}</dd>
          <dt>Último ingreso</dt><dd>${esc(fmtRel(c.ultimo_ingreso))}</dd>
        </dl></section>
        <section class="d-sec"><h3>Sus parches</h3><ul class="d-list" id="d-parches">${skel(3)}</ul></section>
        ${c.tipo === 'admin' ? '' : notasHTML(id)}
        <div class="d-actions">
          <button class="btn btn--sm" data-action="copiar" data-v="${esc(c.email)}">${ic('i-copy')}Copiar correo</button>
          <a class="btn btn--sm" href="mailto:${esc(c.email)}">${ic('i-mail')}Escribir</a>
          ${c.tipo === 'admin' ? '' : c.suspendido ? `<button class="btn btn--sm dark" data-action="suspender" data-id="${esc(c.id)}" data-on="0"${SOLO}>${ic('i-check')}Reactivar cuenta</button>` : `<button class="btn btn--sm danger" data-action="suspender" data-id="${esc(c.id)}" data-on="1"${SOLO}>${ic('i-ban')}Suspender cuenta</button>`}
        </div>
      </div>`);
    if (c.tipo !== 'admin') cargarNotas(id);
    // Parches donde estuvo
    let lista = [];
    try {
      if (DEMO) lista = S.miembros.filter(m => m.usuario_id === id).map(m => ({ ...m, parche: S.parches.find(p => p.id === m.parche_id) })).filter(x => x.parche);
      else lista = (unwrap(await sb().from('parche_miembros').select('parche_id,checkin,creado_en,parches(id,titulo,inicio,categoria,creador_id)').eq('usuario_id', id).order('creado_en', { ascending: false }).limit(30))).map(m => ({ ...m, parche: m.parches })).filter(x => x.parche);
    } catch (err) { lista = null; }
    const ul = $('#d-parches'); if (!ul) return;
    ul.innerHTML = lista === null ? '<li>No pudimos cargar sus parches.</li>' : lista.length ? lista.sort((a, b) => ts(b.parche.inicio) - ts(a.parche.inicio)).slice(0, 12).map(m => `<li><span class="cat-ic">${esc(catCode(m.parche.categoria))}</span><a href="#" class="grow" data-parche="${esc(m.parche.id || m.parche_id)}">${esc(m.parche.titulo)}</a>${m.parche.creador_id === id ? '<span class="pill brand">Lo creó</span>' : m.checkin ? `<span class="pill pos">${ic('i-check')}Llegó</span>` : ''}<small>${esc(fmtDia(ts(m.parche.inicio)))}</small></li>`).join('')
      : '<li>Todavía no se ha unido a ningún parche.</li>';
  }

  function verNegocio(id) {
    const n = S.negocios.find(x => x.id === id), c = CUENTA.get(id) || {};
    if (!n) return;
    const ps = S.parches.filter(p => p.creador_id === id).sort((a, b) => ts(b.inicio) - ts(a.inicio));
    const asist = ps.reduce((a, p) => a + p.miembros, 0), llenos = ps.filter(p => p.miembros >= p.cupos_max).length;
    openDrawer(`
      <div class="d-head d-head--fuego"><div class="d-who">${logoNeg(n).replace('class="logo', 'style="width:72px;height:72px;font-size:26px;border-radius:20px" class="logo')}<div><h2 id="drawer-title">${esc(n.nombre)}</h2><p>${esc(n.tipo)} · ${esc(CATS[n.categoria] || n.categoria)}</p></div></div>
        <div class="d-pills"><span class="pill dark">${ic('i-crown')}${esc((PLANES[n.plan] || {}).nombre || n.plan)}</span>${n.verificado ? `<span class="pill pos">${ic('i-shield')}Verificado</span>` : '<span class="pill warn">Por verificar</span>'}${c.suspendido ? `<span class="pill neg">${ic('i-ban')}Suspendido</span>` : ''}${n.sedes > 1 ? `<span class="pill">${n.sedes} sedes</span>` : ''}</div></div>
      <div class="d-body">
        <div class="d-stats"><div><b>${int(ps.length)}</b><small>Parches</small></div><div><b>${int(asist)}</b><small>Asistentes</small></div><div><b>${int(llenos)}</b><small>Llenos</small></div><div><b>${int(ps.filter(p => ts(p.inicio) > Date.now()).length)}</b><small>Por venir</small></div></div>
        <section class="d-sec"><h3>Datos del negocio</h3><dl class="dl">
          <dt>Responsable</dt><dd>${esc(n.responsable || '—')}</dd>
          <dt>NIT</dt><dd class="code">${esc(n.nit || '—')}</dd>
          <dt>Correo</dt><dd>${esc(c.email || '—')}</dd>
          <dt>Teléfono</dt><dd>${esc(n.telefono || '—')}</dd>
          <dt>Dirección</dt><dd>${esc([n.direccion, n.barrio, n.ciudad].filter(Boolean).join(', ') || '—')}</dd>
          <dt>Descripción</dt><dd>${esc(n.descripcion || '—')}</dd>
          <dt>Aliado desde</dt><dd>${esc(fmtFecha(n.creado_en))}</dd>
          <dt>Último ingreso</dt><dd>${esc(fmtRel(c.ultimo_ingreso))}</dd>
          <dt>Verificación</dt><dd>${n.verificado ? `Verificado ${esc(fmtRel(n.verificado_en))}${n.verificado_nota ? ' · ' + esc(n.verificado_nota) : ''}` : 'Sin verificar. Revisa que el NIT y la dirección sean reales.'}</dd>
        </dl></section>
        <section class="d-sec"><h3>Sus parches</h3><ul class="d-list">${ps.length ? ps.slice(0, 12).map(p => `<li><span class="cat-ic">${esc(catCode(p.categoria))}</span><a href="#" class="grow" data-parche="${esc(p.id)}">${esc(p.titulo)}</a><small>${int(p.miembros)}/${int(p.cupos_max)} · ${esc(fmtDia(ts(p.inicio)))}</small></li>`).join('') : '<li>Todavía no publica parches.</li>'}</ul></section>
        ${notasHTML(id)}
        <div class="d-actions">
          <button class="btn btn--sm ${n.verificado ? '' : 'primary'}" data-action="verificar" data-id="${esc(id)}" data-on="${n.verificado ? 0 : 1}"${SOLO}>${ic('i-shield')}${n.verificado ? 'Quitar sello' : 'Verificar negocio'}</button>
          <button class="btn btn--sm dark" data-action="plan" data-id="${esc(id)}"${SOLO}>${ic('i-crown')}Cambiar plan</button>
          ${c.email ? `<a class="btn btn--sm" href="mailto:${esc(c.email)}">${ic('i-mail')}Escribir</a>` : ''}
          ${n.lat ? `<button class="btn btn--sm" data-action="ver-mapa-neg" data-id="${esc(id)}">${ic('i-map')}Ver en mapa</button>` : ''}
          ${c.suspendido ? `<button class="btn btn--sm" data-action="suspender" data-id="${esc(id)}" data-on="0"${SOLO}>${ic('i-check')}Reactivar</button>` : `<button class="btn btn--sm danger" data-action="suspender" data-id="${esc(id)}" data-on="1"${SOLO}>${ic('i-ban')}Suspender</button>`}
        </div>
      </div>`);
    cargarNotas(id);
  }

  /* ---------- notas internas y advertencias ---------- */
  const notasHTML = id => `<section class="d-sec"><h3>Notas del equipo</h3><div class="notes" id="d-notas" data-uid="${esc(id)}">${skel(1)}</div>
    <div class="note-form"><label class="sr-only" for="d-nota-txt">Escribe una nota o advertencia</label>
      <textarea class="input" id="d-nota-txt" rows="2" maxlength="500" placeholder="Nota interna (solo la ve el equipo) o advertencia (le llega a la cuenta)"></textarea>
      <div class="d-actions"><button class="btn btn--sm" data-action="nota" data-id="${esc(id)}" data-tipo="nota">${ic('i-edit')}Guardar nota</button>
        <button class="btn btn--sm danger" data-action="nota" data-id="${esc(id)}" data-tipo="advertencia">${ic('i-alert')}Enviar advertencia</button></div></div></section>`;
  async function cargarNotas(id) {
    let list = S.notas.get(id);
    if (!list && !DEMO) {
      try { list = unwrap(await sb().from('admin_notas').select('*').eq('usuario_id', id).order('creado_en', { ascending: false }).limit(50)); S.notas.set(id, list); }
      catch (e) { list = null; }
    }
    pintarNotas(id, list || (DEMO ? [] : null));
  }
  function pintarNotas(id, list) {
    const box = $('#d-notas'); if (!box || box.dataset.uid !== id) return;
    box.innerHTML = list === null ? '<p class="muted">No pudimos cargar las notas.</p>' : list.length ? list.map(n => `<div class="note ${n.tipo === 'advertencia' ? 'note--adv' : ''}">
      <div class="note-top"><span class="pill ${n.tipo === 'advertencia' ? 'warn' : ''}">${n.tipo === 'advertencia' ? 'Advertencia enviada' : 'Nota interna'}</span><span>${esc(n.autor_nombre || 'Equipo')} · ${esc(fmtRel(n.creado_en))}</span>
        ${n.tipo === 'nota' && (n.autor_id === ME.id || ES_ADMIN()) ? `<button class="icon-btn" data-action="borrar-nota" data-id="${n.id}" data-uid="${esc(id)}" aria-label="Borrar nota">${ic('i-trash')}</button>` : ''}</div>${esc(n.texto)}</div>`).join('')
      : '<p class="muted">Sin notas todavía. Lo que escribas aquí solo lo ve el equipo.</p>';
  }

  async function verParche(id) {
    const p = S.parches.find(x => x.id === id);
    if (!p) { toast('Ese parche ya no existe', '', { error: true }); return; }
    const t = ts(p.inicio), full = p.miembros >= p.cupos_max;
    openDrawer(`
      <div class="d-head ${p.aliado ? 'd-head--fuego' : ''}"><div class="d-who"><span class="ava ava--lg" style="background:${p.aliado ? "var(--text)" : "var(--accent)"};color:${p.aliado ? "var(--accent)" : "var(--text)"};border-radius:20px">${esc(catCode(p.categoria))}</span><div><h2 id="drawer-title">${esc(p.titulo)}</h2><p>${esc(fmtCuando(t))} · ${esc(p.lugar)}</p></div></div>
        <div class="d-pills"><span class="pill dark">${esc(CATS[p.categoria] || p.categoria)}</span>${p.aliado ? `<span class="pill">${ic('i-store')}Aliado</span>` : ''}${p.demo ? '<span class="pill olive">Ejemplo del sistema</span>' : ''}${p.relampago ? `<span class="pill">${ic('i-bolt')}Relámpago</span>` : ''}${full ? '<span class="pill pos">Lleno</span>' : ''}</div></div>
      <div class="d-body">
        <div class="d-stats"><div><b>${int(p.miembros)}</b><small>Dentro</small></div><div><b>${int(p.cupos_max)}</b><small>Cupos</small></div><div><b>${pct(p.miembros, p.cupos_max)}%</b><small>Ocupación</small></div><div><b>${p.costo ? '$' + Math.round(p.costo / 1000) + 'k' : '0'}</b><small>Costo</small></div></div>
        <section class="d-sec"><h3>Detalle</h3><dl class="dl">
          <dt>Lo armó</dt><dd>${p.creador_id ? `<a href="#" data-persona="${esc(p.creador_id)}">${esc(p.creador_nombre || nombreDe(p.creador_id))}</a>` : esc(p.creador_nombre || 'Sistema')}</dd>
          <dt>Lugar</dt><dd>${esc(p.lugar)}${p.barrio ? ', ' + esc(p.barrio) : ''}</dd>
          <dt>Descripción</dt><dd>${esc(p.descripcion || '—')}</dd>
          ${p.promo ? `<dt>Promo</dt><dd>${esc(p.promo)}</dd>` : ''}
          <dt>Publicado</dt><dd>${esc(fmtRel(p.creado_en))}</dd>
        </dl></section>
        <section class="d-sec"><h3>Quiénes van</h3><ul class="d-list" id="d-miembros">${skel(3)}</ul></section>
        <section class="d-sec"><h3>Chat</h3><div class="d-chat" id="d-chat">${skel(3)}</div></section>
        <div class="d-actions">
          ${p.lat ? `<button class="btn btn--sm" data-action="ver-mapa" data-id="${esc(id)}">${ic('i-map')}Ver en mapa</button>` : ''}
          <button class="btn btn--sm dark" data-action="editar" data-id="${esc(id)}"${SOLO}>${ic('i-edit')}Editar</button>
          <button class="btn btn--sm danger" data-action="retirar" data-id="${esc(id)}"${SOLO}>${ic('i-trash')}Retirar parche</button>
        </div>
      </div>`);
    let mm = [], chat = [];
    try {
      if (DEMO) {
        mm = S.miembros.filter(m => m.parche_id === id);
        chat = S.mensajes.filter(m => m.parche_id === id).map(m => ({ ...m, tipo: 'user' })).sort((a, b) => ts(a.creado_en) - ts(b.creado_en));
        chat.unshift({ tipo: 'sys', texto: `${p.creador_nombre || nombreDe(p.creador_id)} abrió el parche`, creado_en: p.creado_en });
      } else {
        [mm, chat] = await Promise.all([
          sb().from('parche_miembros').select('usuario_id,checkin,creado_en').eq('parche_id', id).order('creado_en').then(unwrap),
          sb().from('mensajes').select('id,autor_id,autor_demo,tipo,texto,creado_en').eq('parche_id', id).order('creado_en', { ascending: false }).limit(80).then(unwrap).then(r => r.reverse()),
        ]);
      }
    } catch (err) { mm = null; }
    const ul = $('#d-miembros'), ch = $('#d-chat'); if (!ul) return;
    ul.innerHTML = mm === null ? '<li>No pudimos cargar la lista.</li>' : mm.length ? mm.map(m => { const c = CUENTA.get(m.usuario_id) || { id: m.usuario_id, nombre: 'Cuenta borrada' };
      return `<li>${ava(c, 'ava--sm')}<a href="#" class="grow" data-persona="${esc(m.usuario_id)}">${esc(c.nombre)}</a>${m.usuario_id === p.creador_id ? '<span class="pill brand">Organiza</span>' : ''}${m.checkin ? `<span class="pill pos">${ic('i-check')}Llegó</span>` : ''}<small>${esc(fmtRel(m.creado_en))}</small></li>`; }).join('') : '<li>Nadie se ha unido todavía.</li>';
    ch.innerHTML = (chat || []).length ? chat.map(m => m.tipo === 'user'
      ? `<div class="d-bub"><small>${esc(m.autor_id ? nombreDe(m.autor_id) : 'Ejemplo')}</small>${resaltar(m.texto)}</div>`
      : `<div class="d-bub ${m.tipo === 'bot' ? 'd-bub--bot' : 'd-bub--sys'}">${esc(m.texto)}</div>`).join('') : '<div class="d-bub d-bub--sys">Sin mensajes.</div>';
    ch.scrollTop = ch.scrollHeight;
  }

  /* ---------- diálogo de confirmación ---------- */
  function confirmar({ title, text, ok = 'Confirmar', tone = 'danger', motivo = null, choices = null }) {
    return new Promise(resolve => {
      const dlg = $('#dlg-confirm');
      $('#dlg-c-title').textContent = title;
      $('#dlg-c-text').innerHTML = text;
      $('#dlg-c-head').classList.toggle('is-ok', tone !== 'danger');
      const okb = $('#dlg-c-ok'); okb.textContent = ok; okb.className = 'btn ' + (tone === 'danger' ? 'danger' : 'primary');
      const fld = $('#dlg-c-field'), ta = $('#dlg-c-motivo');
      fld.hidden = !motivo; ta.value = '';
      if (motivo) { $('#dlg-c-label').textContent = motivo.label; $('#dlg-c-hint').textContent = motivo.hint || ''; ta.placeholder = motivo.placeholder || ''; }
      const ch = $('#dlg-c-choices'); ch.hidden = !choices;
      if (choices) ch.innerHTML = choices.map((c, i) => `<label class="choice"><input type="radio" name="dlg-choice" value="${esc(c.v)}" ${c.checked ? 'checked' : ''}><span><b>${esc(c.l)}</b><small>${esc(c.s || '')}</small></span><span class="price">${esc(c.p || '')}</span></label>`).join('');
      const done = () => {
        dlg.removeEventListener('close', done);
        const okd = dlg.returnValue === 'ok';
        resolve(okd ? { motivo: ta.value.trim(), choice: (ch.querySelector('input:checked') || {}).value } : null);
      };
      dlg.addEventListener('close', done);
      dlg.returnValue = '';
      dlg.showModal();
      setTimeout(() => (motivo ? ta : okb).focus(), 60);
    });
  }

  function setBusy(btn, on) { if (!btn) return; btn.classList.toggle('is-loading', on); btn.disabled = on; }

  async function accionSuspender(id, suspender, btn) {
    const c = CUENTA.get(id); if (!c) return;
    const r = await confirmar(suspender
      ? { title: 'Suspender cuenta', text: `<b>${esc(c.nombre)}</b> no podrá iniciar sesión y se cerrarán sus sesiones abiertas. Puedes reactivarla cuando quieras.`, ok: 'Suspender', motivo: { label: 'Motivo (queda en la bitácora)', placeholder: 'Ej: pidió plata por adelantado en varios chats' } }
      : { title: 'Reactivar cuenta', text: `<b>${esc(c.nombre)}</b> podrá volver a entrar a ModoParche.`, ok: 'Reactivar', tone: 'ok', motivo: { label: 'Nota (opcional)' } });
    if (!r) return;
    setBusy(btn, true);
    try {
      if (!DEMO) await rpc('admin_suspender', { p_usuario: id, p_suspender: suspender, p_motivo: r.motivo });
      c.suspendido = suspender;
      anotar(suspender ? 'suspender' : 'reactivar', c.email, r.motivo);
      if (S.met) S.met.totales.suspendidos += suspender ? 1 : -1;
      toast(suspender ? 'Cuenta suspendida' : 'Cuenta reactivada', c.nombre, { icon: suspender ? 'i-ban' : 'i-check' });
      closeDrawer(); rerender();
    } catch (e) { toast('No se pudo', errMsg(e), { error: true }); }
    setBusy(btn, false);
  }

  async function accionRetirar(id, btn) {
    const p = S.parches.find(x => x.id === id); if (!p) return;
    const r = await confirmar({ title: 'Retirar parche', text: `Se borra <b>${esc(p.titulo)}</b> con su chat. ${p.miembros ? `Les avisamos a las <b>${plural(p.miembros, 'persona')}</b> que estaban dentro.` : ''} No se puede deshacer.`, ok: 'Retirar parche', motivo: { label: 'Motivo (lo verán en el aviso)', placeholder: 'Ej: cobraba por entrar sin ser un negocio aliado' } });
    if (!r) return;
    setBusy(btn, true);
    try {
      if (!DEMO) await rpc('admin_eliminar_parche', { p_parche: id, p_motivo: r.motivo });
      S.parches = S.parches.filter(x => x.id !== id);
      S.mensajes = S.mensajes.filter(m => m.parche_id !== id);
      if (DEMO) S.miembros = S.miembros.filter(m => m.parche_id !== id);
      anotar('retirar_parche', p.titulo, r.motivo);
      toast('Parche retirado', p.titulo, { icon: 'i-trash' });
      closeDrawer(); refrescarSuave(); rerender();
    } catch (e) { toast('No se pudo retirar', errMsg(e), { error: true }); }
    setBusy(btn, false);
  }

  async function accionPlan(id) {
    const n = S.negocios.find(x => x.id === id); if (!n) return;
    const r = await confirmar({ title: 'Cambiar plan', text: `Elige el plan de <b>${esc(n.nombre)}</b>. Le llega un aviso con el cambio.`, ok: 'Guardar plan', tone: 'ok',
      choices: Object.entries(PLANES).map(([k, p]) => ({ v: k, l: p.nombre, s: p.txt, checked: n.plan === k, p: n.plan === k ? 'Actual' : '' })) });
    if (!r || !r.choice || r.choice === n.plan) return;
    try {
      if (!DEMO) await rpc('admin_cambiar_plan', { p_negocio: id, p_plan: r.choice });
      anotar('cambiar_plan', n.nombre, `${n.plan} → ${r.choice}`);
      n.plan = r.choice; const c = CUENTA.get(id); if (c) c.plan = r.choice;
      toast('Plan actualizado', `${n.nombre} ahora está en ${PLANES[r.choice].nombre}`, { icon: 'i-crown' });
      if (!$('#drawer').hidden) verNegocio(id);
      rerender();
    } catch (e) { toast('No se pudo cambiar', errMsg(e), { error: true }); }
  }

  async function accionBorrarMsg(id) {
    const m = S.mensajes.find(x => String(x.id) === String(id)); if (!m) return;
    const r = await confirmar({ title: 'Borrar mensaje', text: `«${esc(m.texto)}»<br><small>De ${esc(nombreDe(m.autor_id))} en ${esc(tituloParche(m.parche_id))}</small>`, ok: 'Borrar', motivo: { label: 'Motivo (opcional)' } });
    if (!r) return;
    try {
      if (!DEMO) await rpc('admin_borrar_mensaje', { p_mensaje: Number(id), p_motivo: r.motivo });
      const li = $(`[data-msg="${id}"]`);
      if (li && !REDUCED()) { li.classList.add('is-gone'); await new Promise(res => setTimeout(res, 280)); }
      S.mensajes = S.mensajes.filter(x => String(x.id) !== String(id));
      anotar('borrar_mensaje', tituloParche(m.parche_id), `«${m.texto}» ${r.motivo}`);
      toast('Mensaje borrado', 'Quedó registrado en la bitácora', { icon: 'i-trash' });
      rerender();
    } catch (e) { toast('No se pudo borrar', errMsg(e), { error: true }); }
  }

  async function enviarAnuncio(e) {
    e.preventDefault();
    const t = $('#an-texto').value.trim(), msg = $('#an-msg');
    if (t.length < 5) { msg.textContent = 'Escribe al menos 5 caracteres.'; $('#an-texto').focus(); return; }
    msg.textContent = '';
    const pub = S.f.anuncio.publico, ciu = $('#an-ciudad').value, n = alcance();
    const r = await confirmar({ title: 'Enviar anuncio', text: `Le llega a <b>${plural(n, 'cuenta')}</b>${ciu ? ` de ${esc(ciu)}` : ''}:<br><br>«${esc(t)}»`, ok: 'Enviar ahora', tone: 'ok' });
    if (!r) return;
    const btn = $('#an-send'); setBusy(btn, true);
    try {
      const enviados = DEMO ? n : await rpc('admin_anuncio', { p_texto: t, p_publico: pub, p_ciudad: ciu || null });
      anotar('anuncio', `${{ todos: 'Todas las cuentas', personas: 'Personas', negocios: 'Negocios' }[pub]}${ciu ? ' de ' + ciu : ''} (${enviados})`, t);
      toast('Anuncio enviado', `Le llegó a ${plural(enviados, 'cuenta')}`, { icon: 'i-megaphone' });
      $('#an-texto').value = '';
      renderAnuncios();
    } catch (err) { toast('No se pudo enviar', errMsg(err), { error: true }); }
    setBusy(btn, false);
  }

  /* ---------- reportes ---------- */
  async function accionReporte(id, estado) {
    const r = S.reportes.find(x => String(x.id) === String(id)); if (!r) return;
    let motivo = '';
    if (estado !== 'abierto') {
      const res = await confirmar(estado === 'resuelto'
        ? { title: 'Resolver reporte', text: `Cuéntale al equipo qué se hizo. A quien reportó le llega un aviso de que lo revisamos.`, ok: 'Marcar resuelto', tone: 'ok', motivo: { label: 'Qué se hizo', placeholder: 'Ej: se borró el mensaje y se le advirtió' } }
        : { title: 'Descartar reporte', text: 'Úsalo cuando no hay una falta a las normas. Queda en la bitácora.', ok: 'Descartar', motivo: { label: 'Por qué se descarta', placeholder: 'Ej: es una diferencia personal, no una falta' } });
      if (!res) return;
      motivo = res.motivo;
    }
    try {
      if (!DEMO) await rpc('admin_resolver_reporte', { p_id: Number(id), p_estado: estado, p_resolucion: motivo });
      r.estado = estado; r.resolucion = motivo; r.resuelto_en = estado === 'abierto' ? null : new Date().toISOString(); r.resuelto_por = estado === 'abierto' ? null : ME.id;
      anotar(estado === 'resuelto' ? 'resolver_reporte' : estado === 'descartado' ? 'descartar_reporte' : 'reabrir_reporte', `Reporte #${r.id} (${r.motivo})`, motivo);
      toast(estado === 'resuelto' ? 'Reporte resuelto' : estado === 'descartado' ? 'Reporte descartado' : 'Reporte reabierto', estado === 'resuelto' ? 'Le avisamos a quien reportó' : '', { icon: estado === 'resuelto' ? 'i-check' : 'i-flag' });
      rerender();
    } catch (e) { toast('No se pudo', errMsg(e), { error: true }); }
  }

  /* ---------- notas y advertencias ---------- */
  async function accionNota(uid, tipo, btn, textoPrevio) {
    const ta = $('#d-nota-txt');
    let texto = textoPrevio != null ? textoPrevio : (ta ? ta.value.trim() : '');
    if (textoPrevio == null && texto.length < 3) { ta && ta.focus(); toast('Escribe la nota primero', 'Mínimo 3 caracteres', { error: true }); return; }
    if (tipo === 'advertencia') {
      const r = await confirmar({ title: 'Enviar advertencia', text: `A <b>${esc(nombreDe(uid))}</b> le llega este aviso del equipo y queda en su historial:${texto ? `<br><br>«${esc(texto)}»` : ''}`, ok: 'Enviar advertencia', motivo: texto ? null : { label: 'Advertencia', placeholder: 'Ej: pedir plata por adelantado va contra las normas. A la próxima se suspende la cuenta.' } });
      if (!r) return;
      if (!texto) texto = r.motivo;
      if (texto.length < 3) { toast('La advertencia quedó vacía', '', { error: true }); return; }
    }
    setBusy(btn, true);
    try {
      const nid = DEMO ? Date.now() : await rpc('admin_nota', { p_usuario: uid, p_tipo: tipo, p_texto: texto });
      const list = S.notas.get(uid) || [];
      list.unshift({ id: nid, usuario_id: uid, tipo, texto, autor_id: ME.id, autor_nombre: ME.nombre, creado_en: new Date().toISOString() });
      S.notas.set(uid, list);
      const c = CUENTA.get(uid); if (c) { if (tipo === 'advertencia') c.advertencias = (c.advertencias || 0) + 1; else c.notas = (c.notas || 0) + 1; }
      anotar(tipo, (c && c.email) || nombreDe(uid), texto);
      if (ta && textoPrevio == null) ta.value = '';
      pintarNotas(uid, list);
      toast(tipo === 'advertencia' ? 'Advertencia enviada' : 'Nota guardada', tipo === 'advertencia' ? `Le llegó a ${nombreDe(uid)}` : 'Solo la ve el equipo', { icon: tipo === 'advertencia' ? 'i-alert' : 'i-edit' });
    } catch (e) { toast('No se pudo guardar', errMsg(e), { error: true }); }
    setBusy(btn, false);
  }
  async function borrarNota(id, uid) {
    try {
      if (!DEMO) await rpc('admin_borrar_nota', { p_id: Number(id) });
      const list = (S.notas.get(uid) || []).filter(n => String(n.id) !== String(id));
      S.notas.set(uid, list); pintarNotas(uid, list);
      toast('Nota borrada', '', { icon: 'i-trash', ms: 2000 });
    } catch (e) { toast('No se pudo borrar', errMsg(e), { error: true }); }
  }

  /* ---------- verificación ---------- */
  async function accionVerificar(id, on) {
    const n = S.negocios.find(x => x.id === id); if (!n) return;
    const r = await confirmar(on
      ? { title: 'Verificar negocio', text: `Antes de dar el sello, revisa que el NIT <b>${esc(n.nit || 'sin NIT')}</b> y la dirección <b>${esc([n.direccion, n.barrio].filter(Boolean).join(', ') || 'sin dirección')}</b> sean reales. Sus parches mostrarán el sello y le llega un aviso.`, ok: 'Dar el sello', tone: 'ok', motivo: { label: 'Qué revisaste (queda en la bitácora)', placeholder: 'Ej: NIT en el RUES y visita al local' } }
      : { title: 'Quitar el sello', text: `<b>${esc(n.nombre)}</b> deja de verse como verificado y le llega un aviso.`, ok: 'Quitar sello', motivo: { label: 'Motivo' } });
    if (!r) return;
    try {
      if (!DEMO) await rpc('admin_verificar_negocio', { p_negocio: id, p_verificado: on, p_nota: r.motivo });
      n.verificado = on; n.verificado_en = on ? new Date().toISOString() : null; n.verificado_nota = r.motivo;
      S.parches.forEach(p => { if (p.creador_id === id) p.verificado = on; });
      const c = CUENTA.get(id); if (c) c.verificado = on;
      anotar(on ? 'verificar' : 'quitar_verificado', n.nombre, r.motivo);
      toast(on ? '¡Negocio verificado!' : 'Sello quitado', n.nombre, { icon: 'i-shield' });
      if (!$('#drawer').hidden) verNegocio(id);
      rerender();
    } catch (e) { toast('No se pudo', errMsg(e), { error: true }); }
  }

  /* ---------- calificaciones ---------- */
  async function accionAnularCal(key, li) {
    const [pid, autor, calificado] = key.split('|');
    const c = S.cals.find(x => x.parche_id === pid && x.autor_id === autor && x.calificado_id === calificado); if (!c) return;
    const r = await confirmar({ title: 'Anular calificación', text: `Se borra la calificación de <b>${c.estrellas} ${c.estrellas === 1 ? 'estrella' : 'estrellas'}</b> que ${esc(nombreDe(autor))} le dio a ${esc(nombreDe(calificado))}, y se recalcula su reputación.`, ok: 'Anular', motivo: { label: 'Motivo (opcional)', placeholder: 'Ej: venganza por una pelea en el chat' } });
    if (!r) return;
    try {
      if (!DEMO) await rpc('admin_anular_calificacion', { p_parche: pid, p_autor: autor, p_calificado: calificado, p_motivo: r.motivo });
      if (li && !REDUCED()) { li.classList.add('is-gone'); await new Promise(res => setTimeout(res, 280)); }
      S.cals = marcarCals(S.cals.filter(x => x !== c));
      const p = CUENTA.get(calificado);
      if (p) { const mias = S.cals.filter(x => x.calificado_id === calificado); p.resenas = mias.length; p.rating = mias.length ? Math.round(mias.reduce((a, x) => a + x.estrellas, 0) / mias.length * 10) / 10 : 5; }
      anotar('anular_calificacion', nombreDe(calificado), `${c.estrellas} estrellas. ${r.motivo}`);
      toast('Calificación anulada', `Reputación de ${nombreDe(calificado)} recalculada`, { icon: 'i-star' });
      rerender();
    } catch (e) { toast('No se pudo anular', errMsg(e), { error: true }); }
  }

  /* ---------- editar parche ---------- */
  let editId = null;
  function abrirEditar(id) {
    const p = S.parches.find(x => x.id === id); if (!p) return;
    editId = id;
    const d = new Date(ts(p.inicio)), pad = n => String(n).padStart(2, '0');
    $('#e-titulo').value = p.titulo; $('#e-fecha').value = isoDia(d); $('#e-hora').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $('#e-lugar').value = p.lugar || ''; $('#e-barrio').value = p.barrio || ''; $('#e-cupos').value = p.cupos_max; $('#e-costo').value = p.costo || 0;
    $('#e-cat').innerHTML = Object.entries(CATS).map(([k, l]) => `<option value="${k}" ${k === p.categoria ? 'selected' : ''}>${esc(l)}</option>`).join('');
    $('#e-desc').value = p.descripcion || '';
    $('#e-cupos').min = Math.max(2, p.miembros);
    $('#e-cupos-hint').textContent = p.miembros ? `Ya hay ${plural(p.miembros, 'persona')} dentro: no puede ser menos.` : '';
    $('#e-msg').textContent = '';
    $('#dlg-e-title').textContent = p.demo ? 'Editar ejemplo' : 'Editar parche';
    $('#dlg-edit').showModal();
    setTimeout(() => $('#e-titulo').focus(), 60);
  }
  async function guardarEdicion(e) {
    e.preventDefault();
    const p = S.parches.find(x => x.id === editId); if (!p) return;
    const form = $('#form-edit');
    if (!form.checkValidity()) { const bad = form.querySelector(':invalid'); $('#e-msg').textContent = bad ? (bad.validationMessage || 'Revisa los datos') : 'Revisa los datos'; bad && bad.focus(); return; }
    const inicio = new Date(`${$('#e-fecha').value}T${$('#e-hora').value}`);
    const datos = { titulo: $('#e-titulo').value.trim(), inicio: inicio.toISOString(), lugar: $('#e-lugar').value.trim(), barrio: $('#e-barrio').value.trim(),
      cupos_max: Number($('#e-cupos').value), costo: Number($('#e-costo').value) || 0, categoria: $('#e-cat').value, descripcion: $('#e-desc').value.trim() };
    const btn = $('#e-ok'); setBusy(btn, true);
    try {
      if (!DEMO) await rpc('admin_editar_parche', { p_parche: editId, p_datos: datos });
      const antes = p.titulo;
      Object.assign(p, datos);
      anotar('editar_parche', antes, 'datos ajustados');
      $('#dlg-edit').close();
      toast('Parche actualizado', 'En su chat aparece el aviso del cambio', { icon: 'i-edit' });
      if (!$('#drawer').hidden) verParche(editId);
      rerender();
    } catch (err) { $('#e-msg').textContent = errMsg(err); }
    setBusy(btn, false);
  }
  /* ---------- parche oficial del mes ----------
     Lo arma el equipo: sitio, precios y enlaces a la boletería oficial.
     ModoParche no vende boletas; los botones abren la página de venta. */
  let oficialId = null;
  function abrirOficial(id) {
    const p = id ? S.parches.find(x => x.id === id) : null;
    oficialId = p ? p.id : null;
    const i = (p && p.oficial_info) || {}, pad = n => String(n).padStart(2, '0');
    const d = p ? new Date(ts(p.inicio)) : null;
    const val = (sel, v) => { $(sel).value = v == null ? '' : v; };
    val('#o-titulo', p && p.titulo); val('#o-artista', i.artista); val('#o-mes', i.mes);
    val('#o-fecha', d && isoDia(d)); val('#o-hora', d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '19:00');
    val('#o-lugar', p ? p.lugar : 'Por confirmar'); val('#o-barrio', p ? p.barrio : 'Villavicencio');
    val('#o-lat', p && p.lat); val('#o-lng', p && p.lng);
    val('#o-cupos', p ? p.cupos_max : 500); $('#o-cupos').min = Math.max(2, p ? p.miembros : 2);
    val('#o-desc', p && p.descripcion);
    val('#o-ent-precio', i.entrada_precio); val('#o-ent-url', i.entrada_url);
    val('#o-pal-precio', i.palco_precio); val('#o-pal-url', i.palco_url); val('#o-pal-personas', i.palco_personas);
    val('#o-pal-hasta', i.palco_hasta); val('#o-boleteria', i.boleteria); val('#o-edad', i.edad_minima); val('#o-horario', i.horario);
    val('#o-locs', (i.localidades || []).map(l => `${l.nombre} - ${l.precio}`).join('\n'));
    $('#o-msg').textContent = '';
    $('#dlg-o-title').textContent = p ? 'Editar parche oficial' : 'Nuevo parche oficial';
    $('#dlg-oficial').showModal();
    setTimeout(() => $('#o-titulo').focus(), 60);
  }
  async function guardarOficial(e) {
    e.preventDefault();
    const form = $('#form-oficial');
    if (!form.checkValidity()) { const bad = form.querySelector(':invalid'); $('#o-msg').textContent = bad ? (bad.validationMessage || 'Revisa los datos') : 'Revisa los datos'; bad && bad.focus(); return; }
    const num = sel => { const v = $(sel).value.trim(); return v === '' ? null : Number(v); };
    const txt = sel => $(sel).value.trim();
    for (const sel of ['#o-ent-url', '#o-pal-url']) {
      if (txt(sel) && !/^https:\/\/\S{4,}$/i.test(txt(sel))) { $('#o-msg').textContent = 'Los enlaces de compra deben empezar por https://'; $(sel).focus(); return; }
    }
    const lat = num('#o-lat'), lng = num('#o-lng');
    // "General - 100000" o "VIP: $160.000" -> { nombre, precio }
    const locs = [];
    for (const linea of $('#o-locs').value.split('\n').map(x => x.trim()).filter(Boolean)) {
      const m = linea.match(/^(.+?)\s*[-:]\s*\$?\s*([\d.,]+)$/);
      if (!m) { $('#o-msg').textContent = `Revisa la localidad "${linea}": escribe nombre - precio.`; $('#o-locs').focus(); return; }
      locs.push({ nombre: m[1].trim().slice(0, 40), precio: Number(m[2].replace(/[.,]/g, '')) });
    }
    if ((lat == null) !== (lng == null)) { $('#o-msg').textContent = 'Pon latitud y longitud, o deja las dos vacías.'; return; }
    const datos = {
      titulo: txt('#o-titulo'), categoria: 'conciertos', descripcion: txt('#o-desc'),
      inicio: new Date(`${$('#o-fecha').value}T${$('#o-hora').value}`).toISOString(),
      lugar: txt('#o-lugar') || 'Por confirmar', barrio: txt('#o-barrio'), cupos_max: num('#o-cupos'),
      ...(lat != null ? { lat, lng } : {}),
      info: { artista: txt('#o-artista'), mes: txt('#o-mes'), entrada_precio: num('#o-ent-precio'), entrada_url: txt('#o-ent-url'),
        palco_precio: num('#o-pal-precio'), palco_url: txt('#o-pal-url'), palco_personas: num('#o-pal-personas'),
        palco_hasta: num('#o-pal-hasta'), boleteria: txt('#o-boleteria'), edad_minima: num('#o-edad'), horario: txt('#o-horario'), localidades: locs },
    };
    const btn = $('#o-ok'); setBusy(btn, true);
    try {
      let id = oficialId;
      if (!DEMO) id = await rpc('admin_guardar_oficial', { p_parche: oficialId, p_datos: datos });
      const info = Object.fromEntries(Object.entries(datos.info).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));
      const fila = { titulo: datos.titulo, descripcion: datos.descripcion, inicio: datos.inicio, lugar: datos.lugar, barrio: datos.barrio, cupos_max: datos.cupos_max, oficial: true, oficial_info: info, ...(lat != null ? { lat, lng } : {}) };
      const p = S.parches.find(x => x.id === id);
      if (p) Object.assign(p, fila);
      else S.parches.unshift({ id: id || 'of-' + Date.now(), categoria: 'conciertos', creador_id: null, creador_nombre: 'Equipo ModoParche', costo: 0, miembros: 0, demo: false, aliado: false, lat: lat ?? 4.142, lng: lng ?? -73.6266, creado_en: new Date().toISOString(), ...fila });
      anotar('parche_oficial', datos.titulo, oficialId ? 'editado' : 'creado');
      $('#dlg-oficial').close();
      toast(oficialId ? 'Parche oficial actualizado' : 'Parche oficial creado', 'Ya sale arriba en el inicio de todos', { icon: 'i-crown' });
      S.f.parches.tab = 'oficiales';
      rerender();
    } catch (err) { $('#o-msg').textContent = errMsg(err); }
    setBusy(btn, false);
  }

  async function accionRenovar(btn) {
    setBusy(btn, true);
    try {
      if (!DEMO) { await rpc('admin_renovar_ejemplos'); await refrescarTodo(false); }
      anotar('renovar_ejemplos', 'Parches de ejemplo', 'renovados a mano');
      toast('Ejemplos al día', 'Los vencidos quedaron con fecha nueva', { icon: 'i-refresh' });
      if (DEMO) rerender();
    } catch (e) { toast('No se pudo renovar', errMsg(e), { error: true }); }
    setBusy(btn, false);
  }

  /* ---------- rango de fechas ---------- */
  async function cambiarRango(dias, desde, hasta) {
    S.rango = { dias, desde: desde || null, hasta: hasta || null };
    if (dias === 'custom' && !(desde && hasta)) { renderPeriodo(); $('#r-desde').focus(); return; }
    $('#view-resumen').classList.add('quiet');
    try { await recargarMetricas(); renderResumen(); }
    catch (e) { toast('No se pudo cargar ese rango', errMsg(e), { error: true }); }
  }

  /* ---------- informe para imprimir o guardar como PDF ---------- */
  function informe() {
    const M = S.met; if (!M) return;
    const PE = M.periodo || {}, T = M.totales, serie = M.serie || [], rf = rangoFechas();
    const d = (a, b) => b == null ? '' : !b ? (a ? '<i class="up">nuevo</i>' : '') : `<i class="${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))} %</i>`;
    const barras = key => { const v = serie.map(s => s[key] || 0), mx = Math.max(1, ...v), w = 100 / Math.max(1, v.length);
      return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" class="bars">${v.map((x, i) => `<rect x="${i * w + w * .15}" width="${w * .7}" y="${30 - x / mx * 28}" height="${Math.max(.4, x / mx * 28)}" rx=".4"/>`).join('')}</svg>`; };
    const enR = t => { const x = ts(t); return x >= Date.parse(rf.desde + 'T00:00') && x < Date.parse(rf.hasta + 'T00:00') + DAY; };
    const acciones = S.registro.filter(r => enR(r.creado_en));
    const repR = S.reportes.filter(r => enR(r.creado_en));
    const fila = (l, k) => `<tr><td>${l}</td><td class="n">${int(PE[k])}</td><td class="n">${int(PE[k + '_prev'])}</td><td class="n">${d(PE[k], PE[k + '_prev'])}</td></tr>`;
    const html = `<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><title>Informe ModoParche ${esc(rf.desde)} a ${esc(rf.hasta)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>@font-face{font-family:Gagalin;src:url('${location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '')}src/assets/fonts/Gagalin-Regular.woff2') format('woff2')}
*{box-sizing:border-box}body{margin:0;padding:36px 40px;font:13px/1.5 Inter,system-ui,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2{font-family:Gagalin,'Arial Black',sans-serif;font-weight:400;text-transform:uppercase;margin:0}h1{font-size:34px;line-height:1}h1 span{color:#FF5A1F}h2{font-size:18px;margin:26px 0 10px}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding-bottom:16px;border-bottom:3px solid #111}.top p{margin:6px 0 0;color:#55555c}
.kp{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.k{padding:12px 14px;border-radius:14px;background:#f4f4f5}.k.dark{background:#111;color:#fff}.k small{display:block;color:#66666e;font-weight:600}.k.dark small{color:#b4b4bb}.k b{display:block;font:400 28px/1.1 Gagalin,sans-serif;margin-top:4px}.k.dark b{color:#FF5A1F}
table{width:100%;border-collapse:collapse}td,th{padding:7px 8px;border-bottom:1px solid #eee;text-align:left}th{font-size:11px;color:#66666e}.n{text-align:right;font-variant-numeric:tabular-nums}
i{font-style:normal;font-weight:700;font-size:11px}i.up{color:#1f7a4a}i.down{color:#c4242a}
.g{display:grid;grid-template-columns:1fr 1fr;gap:22px}.bars{width:100%;height:60px;display:block;margin-bottom:12px}.bars rect{fill:#FF5A1F}.ch small{display:block;font-weight:700;margin-bottom:4px}
.foot{margin-top:30px;padding-top:12px;border-top:1px solid #eee;color:#66666e;font-size:11px;display:flex;justify-content:space-between}
@page{margin:14mm}@media print{body{padding:0}.no-print{display:none}}
.no-print{position:fixed;top:14px;right:14px;padding:10px 16px;border:0;border-radius:999px;background:#FF5A1F;font:700 14px Inter;cursor:pointer;box-shadow:inset 0 0 0 2px #111}</style></head><body>
<button class="no-print" onclick="print()">Guardar como PDF</button>
<div class="top"><div><h1>Modo<span>Parche</span> · Informe</h1><p>${esc(rangoTitulo())} · del ${esc(fmtFecha(rf.desde + 'T12:00'))} al ${esc(fmtFecha(rf.hasta + 'T12:00'))} · comparado con los ${int(PE.dias)} días anteriores</p></div><p>Generado por ${esc(ME.nombre)}<br>${esc(new Date().toLocaleString('es-CO'))}</p></div>
<div class="kp"><div class="k dark"><small>Personas en total</small><b>${int(T.personas)}</b></div><div class="k"><small>Negocios aliados</small><b>${int(T.negocios)}</b></div><div class="k"><small>Parches por venir</small><b>${int(T.parches_proximos)}</b></div><div class="k"><small>Ocupación del rango</small><b>${PE.ocupacion == null ? '—' : int(PE.ocupacion) + ' %'}</b></div></div>
<h2>Lo que pasó en el rango</h2><table><tr><th>Indicador</th><th class="n">Este rango</th><th class="n">Rango anterior</th><th class="n">Cambio</th></tr>
${fila('Personas nuevas', 'registros')}${fila('Negocios nuevos', 'negocios')}${fila('Parches creados', 'parches')}${fila('Uniones a parches', 'uniones')}${fila('Mensajes en los chats', 'mensajes')}
<tr><td>Check-ins de los parches del rango</td><td class="n">${int(PE.checkins)}</td><td></td><td></td></tr><tr><td>Calificaciones</td><td class="n">${int(PE.calificaciones)}</td><td></td><td></td></tr><tr><td>Reportes recibidos</td><td class="n">${int(PE.reportes)}</td><td></td><td></td></tr></table>
<div class="g"><div><h2>Día a día</h2>${['registros', 'parches', 'uniones', 'mensajes'].map(k => `<div class="ch"><small>${SERIES[k][0]}</small>${barras(k)}</div>`).join('')}</div>
<div><h2>Categorías</h2><table><tr><th>Categoría</th><th class="n">Parches</th><th class="n">Se unieron</th></tr>${(M.categorias || []).slice(0, 8).map(c => `<tr><td>${esc(CATS[c.categoria] || c.categoria)}</td><td class="n">${int(c.parches)}</td><td class="n">${int(c.uniones)}</td></tr>`).join('') || '<tr><td colspan="3">Sin parches</td></tr>'}</table>
<h2>Negocios top</h2><table><tr><th>Negocio</th><th class="n">Parches</th><th class="n">Asistentes</th></tr>${(M.top_negocios || []).map(n => `<tr><td>${esc(n.nombre)}</td><td class="n">${int(n.parches)}</td><td class="n">${int(n.asistentes)}</td></tr>`).join('') || '<tr><td colspan="3">Sin negocios</td></tr>'}</table></div></div>
<div class="g"><div><h2>Embudo</h2><table>${[['Se registraron', 'registrados'], ['Se unieron a un parche', 'se_unieron'], ['Crearon un parche', 'crearon'], ['Llegaron (check-in)', 'llegaron'], ['Calificaron', 'calificaron']].map(([l, k]) => `<tr><td>${l}</td><td class="n">${int((M.embudo || {})[k])}</td><td class="n">${pct((M.embudo || {})[k], (M.embudo || {}).registrados)} %</td></tr>`).join('')}</table></div>
<div><h2>Cuidado de la comunidad</h2><table><tr><td>Reportes del rango</td><td class="n">${int(repR.length)}</td></tr><tr><td>Resueltos</td><td class="n">${int(repR.filter(r => r.estado === 'resuelto').length)}</td></tr><tr><td>Aún abiertos</td><td class="n">${int(repR.filter(r => r.estado === 'abierto').length)}</td></tr><tr><td>Acciones del equipo</td><td class="n">${int(acciones.length)}</td></tr><tr><td>Cuentas suspendidas hoy</td><td class="n">${int(T.suspendidos)}</td></tr></table></div></div>
<div class="foot"><span>ModoParche · Villavicencio, Meta</span><span>Datos en hora de Colombia. Los parches de ejemplo del sistema no cuentan.</span></div>
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),400))<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes', 'El navegador bloqueó el informe', { error: true }); return; }
    w.document.write(html); w.document.close();
  }

  function exportar(what) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let head, rows;
    if (what === 'personas') {
      head = ['Nombre', 'Correo', 'Ciudad', 'Barrio', 'Gustos', 'Parches creados', 'Parches unidos', 'Check-ins', 'Mensajes', 'Calificación', 'Reseñas', 'Creada', 'Último ingreso', 'Confirmada', 'Suspendida'];
      rows = personas().map(c => [c.nombre, c.email, c.ciudad, c.barrio, (c.intereses || []).join(' '), c.parches, c.unidos, c.checkins, c.mensajes, c.resenas ? c.rating : '', c.resenas, c.creado_en, c.ultimo_ingreso || '', c.confirmado ? 'sí' : 'no', c.suspendido ? 'sí' : 'no']);
    } else if (what === 'negocios') {
      head = ['Negocio', 'Tipo', 'Categoría', 'Plan', 'NIT', 'Responsable', 'Teléfono', 'Correo', 'Ciudad', 'Barrio', 'Dirección', 'Parches', 'Desde'];
      rows = S.negocios.map(n => [n.nombre, n.tipo, n.categoria, n.plan, n.nit, n.responsable, n.telefono, (CUENTA.get(n.id) || {}).email || '', n.ciudad, n.barrio, n.direccion, S.parches.filter(p => p.creador_id === n.id).length, n.creado_en]);
    } else {
      head = ['Título', 'Categoría', 'Inicio', 'Lugar', 'Barrio', 'Quién lo armó', 'Aliado', 'Dentro', 'Cupos', 'Costo', 'Ejemplo', 'Creado'];
      rows = S.parches.map(p => [p.titulo, p.categoria, p.inicio, p.lugar, p.barrio, p.creador_nombre || nombreDe(p.creador_id), p.aliado ? 'sí' : 'no', p.miembros, p.cupos_max, p.costo, p.demo ? 'sí' : 'no', p.creado_en]);
    }
    const csv = '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `modoparche-${what}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('CSV listo', `${plural(rows.length, 'fila')} de ${what}`, { icon: 'i-download' });
  }

  function rerender() { updateCounts(); if (DEMO) S.met = metricasLocales(); RENDER[current](); }

  let suaveT;
  function refrescarSuave() {
    clearTimeout(suaveT);
    suaveT = setTimeout(async () => {
      try { await recargarMetricas(); if (current === 'resumen') { $('#view-resumen').classList.add('quiet'); renderResumen(); } updateCounts(); stampRefresh(); } catch (e) { /* lo intenta en la próxima */ }
    }, DEMO ? 300 : 5000);
  }
  async function refrescarTodo(manual) {
    const btn = $('#refresh-btn'); btn.classList.add('is-loading');
    try {
      if (DEMO) { S.met = metricasLocales(); S.cargado = Date.now(); }
      else await cargarRemoto();
      updateCounts(); $('#view-' + current).classList.toggle('quiet', !manual); RENDER[current](); stampRefresh();
      if (manual) toast('Datos al día', 'Todo se actualizó', { icon: 'i-refresh', ms: 2200 });
    } catch (e) { if (manual) toast('No se pudo actualizar', errMsg(e), { error: true }); }
    btn.classList.remove('is-loading');
  }
  function stampRefresh() { $('#refresh-txt').textContent = 'Actualizado ' + fmtHora(S.cargado || Date.now()); }

  /* ---------- menú en celular ---------- */
  function openMenu() { $('#sidebar').classList.add('is-open'); $('#scrim').hidden = false; $('#menu-toggle').setAttribute('aria-expanded', 'true'); }
  function closeMenu() { $('#sidebar').classList.remove('is-open'); $('#scrim').hidden = true; $('#menu-toggle').setAttribute('aria-expanded', 'false'); }

  /* ---------- eventos ---------- */
  function bind() {
    document.addEventListener('click', e => {
      const t = e.target;
      const per = t.closest('[data-persona]'); if (per && !t.closest('[data-action]')) { e.preventDefault(); hideSearch(); verPersona(per.dataset.persona); return; }
      const neg = t.closest('[data-negocio]'); if (neg && !t.closest('[data-action]')) { e.preventDefault(); hideSearch(); verNegocio(neg.dataset.negocio); return; }
      const par = t.closest('[data-parche]'); if (par) { e.preventDefault(); hideSearch(); verParche(par.dataset.parche); return; }
      const g = t.closest('[data-go]');
      if (g) {
        const tab = g.dataset.tab, r = g.dataset.go.slice(1);
        if (tab && r === 'personas') { S.f.personas.tab = tab; if (tab === 'riesgo') S.f.personas.sort = 'rating'; $('#personas-sort').value = S.f.personas.sort; }
        if (tab && r === 'negocios') S.f.negocios.tab = tab;
        if (location.hash === g.dataset.go) go(r, { force: true }); else location.hash = g.dataset.go;
        return;
      }
      if (t.closest('[data-ptab],[data-ntab],[data-patab],[data-mtab],[data-ltab],[data-cat],[data-rtab],[data-ctab],[data-motivo]')) $('#view-' + current).classList.remove('quiet');
      const tb = t.closest('[data-ptab],[data-ntab],[data-patab],[data-mtab],[data-ltab],[data-rtab],[data-ctab]');
      if (tb) {
        if (tb.dataset.rtab) { S.f.reportes.tab = tb.dataset.rtab; S.f.reportes.motivo = ''; renderReportes(); }
        if (tb.dataset.ctab) { S.f.cals.tab = tb.dataset.ctab; renderReputacion(); }
        if (tb.dataset.ptab) { S.f.personas.tab = tb.dataset.ptab; S.f.personas.n = 40; renderPersonas(); }
        if (tb.dataset.ntab) { S.f.negocios.tab = tb.dataset.ntab; renderNegocios(); }
        if (tb.dataset.patab) { S.f.parches.tab = tb.dataset.patab; S.f.parches.cat = ''; renderParches(); }
        if (tb.dataset.mtab) { S.f.mod.tab = tb.dataset.mtab; renderModeracion(); }
        if (tb.dataset.ltab) { S.f.log.tab = tb.dataset.ltab; renderRegistro(); }
        return;
      }
      const cat = t.closest('[data-cat]'); if (cat) { S.f.parches.cat = cat.dataset.cat; renderParches(); return; }
      const mot = t.closest('[data-motivo]'); if (mot) { S.f.reportes.motivo = mot.dataset.motivo; renderReportes(); return; }
      const rg = t.closest('[data-rango]'); if (rg) { const v = rg.dataset.rango; cambiarRango(v === 'custom' ? 'custom' : Number(v)); return; }
      const ser = t.closest('[data-serie]'); if (ser) { S.f.serie = ser.dataset.serie; $$('#trend-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === ser))); drawTrend(); return; }
      const capa = t.closest('[data-capa]'); if (capa) { S.f.mapa = capa.dataset.capa; S._mapFit = false; renderMapa(); return; }
      const pubB = t.closest('#an-publico [data-v]'); if (pubB) { S.f.anuncio.publico = pubB.dataset.v; $$('#an-publico button').forEach(b => b.setAttribute('aria-pressed', String(b === pubB))); syncAnuncio(); return; }
      const pl = t.closest('[data-plantilla]'); if (pl) { $('#an-texto').value = PLANTILLAS[+pl.dataset.plantilla][1]; syncAnuncio(); $('#an-texto').focus(); return; }
      const a = t.closest('[data-action]'); if (!a) { if (!t.closest('#search-wrap')) hideSearch(); return; }
      const id = a.dataset.id;
      switch (a.dataset.action) {
        case 'logout': salir(); break;
        case 'refrescar': refrescarTodo(true); break;
        case 'ir-anuncio': location.hash = '#anuncios'; setTimeout(() => $('#an-texto').focus(), 300); break;
        case 'cerrar-drawer': closeDrawer(); break;
        case 'suspender': accionSuspender(id, a.dataset.on === '1', a); break;
        case 'retirar': accionRetirar(id, a); break;
        case 'plan': accionPlan(id); break;
        case 'borrar-msg': accionBorrarMsg(id); break;
        case 'exportar': exportar(a.dataset.what); break;
        case 'mas-personas': S.f.personas.n += 40; renderPersonas(); break;
        case 'copiar': navigator.clipboard?.writeText(a.dataset.v).then(() => toast('Copiado', a.dataset.v, { icon: 'i-copy', ms: 2000 })); break;
        case 'ver-cedula': { const s = $('#ced'); if (s) s.textContent = a.dataset.v; a.remove(); break; }
        case 'ver-mapa': { const p = S.parches.find(x => x.id === id); if (p) { S._flyTo = p; closeDrawer(); if (current === 'mapa') renderMapa(); else location.hash = '#mapa'; } break; }
        case 'ver-mapa-neg': { const n = S.negocios.find(x => x.id === id); if (n) { S._flyTo = n; closeDrawer(); if (current === 'mapa') renderMapa(); else location.hash = '#mapa'; } break; }
        case 'resolver': accionReporte(id, 'resuelto'); break;
        case 'descartar': accionReporte(id, 'descartado'); break;
        case 'reabrir': accionReporte(id, 'abierto'); break;
        case 'advertir': accionNota(id, 'advertencia', a, ''); break;
        case 'nota': accionNota(id, a.dataset.tipo, a); break;
        case 'borrar-nota': borrarNota(id, a.dataset.uid); break;
        case 'verificar': accionVerificar(id, a.dataset.on === '1'); break;
        case 'anular-cal': { const li = a.closest('[data-cal]'); accionAnularCal(li.dataset.cal, li); break; }
        case 'editar': abrirEditar(id); break;
        case 'nuevo-oficial': abrirOficial(null); break;
        case 'editar-oficial': abrirOficial(id); break;
        case 'cerrar-oficial': $('#dlg-oficial').close(); break;
        case 'cerrar-edit': $('#dlg-edit').close(); break;
        case 'renovar': accionRenovar(a); break;
        case 'informe': informe(); break;
      }
    });
    $('#form-edit').addEventListener('submit', guardarEdicion);
    $('#form-oficial').addEventListener('submit', guardarOficial);
    $('#range-custom').addEventListener('submit', e => {
      e.preventDefault();
      let d = $('#r-desde').value, h = $('#r-hasta').value;
      if (!d || !h) return;
      if (d > h) [d, h] = [h, d];
      cambiarRango('custom', d, h);
    });
    // Filas de la tabla con teclado
    $('#personas-table').addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-persona]'); if (tr) verPersona(tr.dataset.persona); } });
    // Filtros en vivo
    const deb = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    $('#personas-q').addEventListener('input', deb(e => { S.f.personas.q = e.target.value; S.f.personas.n = 40; renderPersonas(); }));
    $('#personas-sort').addEventListener('change', e => { S.f.personas.sort = e.target.value; renderPersonas(); });
    $('#negocios-q').addEventListener('input', deb(e => { S.f.negocios.q = e.target.value; renderNegocios(); }));
    $('#parches-q').addEventListener('input', deb(e => { S.f.parches.q = e.target.value; renderParches(); }));
    $('#mod-q').addEventListener('input', deb(e => { S.f.mod.q = e.target.value; renderModeracion(); }));
    $('#rep-q').addEventListener('input', deb(e => { S.f.reportes.q = e.target.value; renderReportes(); }));
    $('#an-texto').addEventListener('input', () => syncAnuncio());
    $('#an-ciudad').addEventListener('change', () => syncAnuncio());
    $('#form-anuncio').addEventListener('submit', enviarAnuncio);
    // Búsqueda global
    const si = $('#search');
    si.addEventListener('input', deb(e => buscar(e.target.value), 90));
    si.addEventListener('focus', () => si.value && buscar(si.value));
    si.addEventListener('keydown', e => {
      const items = $$('#search-pop .sp-item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); spSel = (spSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((it, i) => it.setAttribute('aria-selected', String(i === spSel))); items[spSel]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); (items[spSel] || items[0])?.click(); }
      if (e.key === 'Escape') { si.value = ''; hideSearch(); si.blur(); }
    });
    // Atajos
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#drawer').hidden) closeDrawer(); closeMenu(); return; }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey || $('#dlg-confirm').open || $('#dlg-edit').open) return;
      if (e.key === '/') { e.preventDefault(); si.focus(); return; }
      const n = Number(e.key); if (n >= 1 && n <= 9) location.hash = '#' + ROUTES[n - 1];
    });
    // Tooltip del mapa de calor
    $('#heat').addEventListener('pointerover', e => { const c = e.target.closest('.c'); if (!c) return; const [d, h, n] = c.dataset.tip.split('|'); const r = c.getBoundingClientRect(); showTip(r.left + r.width / 2, r.top, `<b>${n}</b>${Number(n) === 1 ? 'parche' : 'parches'}<small>${cap(d)} · ${horaTxt(+h)}</small>`); });
    $('#heat').addEventListener('pointerleave', hideTip);
    $('#menu-toggle').addEventListener('click', openMenu);
    $('#menu-close').addEventListener('click', closeMenu);
    $('#scrim').addEventListener('click', closeMenu);
    window.addEventListener('hashchange', () => go(location.hash.slice(1)));
    let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => { if (current === 'resumen') drawTrend(); }, 150); });
    window.addEventListener('scroll', hideTip, { passive: true });
  }
  const hideSearch = () => { $('#search-pop').hidden = true; $('#search').setAttribute('aria-expanded', 'false'); };

  async function salir() {
    if (!DEMO && sb()) { try { await sb().auth.signOut(); } catch (e) { /* salimos igual */ } }
    location.replace('login.html');
  }

  /* =====================================================================
     14. TIEMPO REAL E INICIO
  ===================================================================== */
  function setLive(on, txt) {
    $('#live-chip').classList.toggle('is-on', on && !DEMO);
    $('#live-chip').classList.toggle('is-demo', DEMO);
    $('#live-text').textContent = txt;
    $('#side-live').classList.toggle('is-on', on);
    document.body.classList.toggle('is-live', on);
    $('#side-live-t').textContent = on ? (DEMO ? 'Simulados en el ejemplo' : 'Conectado') : 'Sin conexión en vivo';
  }

  function onMiembro(r) {
    const p = S.parches.find(x => x.id === r.parche_id);
    if (p) p.miembros++;
    if (!p || r.usuario_id !== p.creador_id) pushFeed('i-flame', `<b>${esc(nombreDe(r.usuario_id))}</b> se unió a <b>${esc(p ? p.titulo : 'un parche')}</b>`);
    refrescarSuave();
  }
  function onParche(r) {
    if (S.parches.some(x => x.id === r.id)) return;
    S.parches.unshift({ ...r, miembros: 0 });
    if (!r.demo) pushFeed('i-calendar', `<b>${esc(r.creador_nombre || nombreDe(r.creador_id))}</b> abrió <b>${esc(r.titulo)}</b>`);
    updateCounts(); refrescarSuave();
  }
  function onMensaje(r) {
    if (r.tipo !== 'user' || !r.autor_id) return;
    S.mensajes.unshift(r);
    const fl = banderas(r.texto).length;
    pushFeed(fl ? 'i-flag' : 'i-chat', `<b>${esc(nombreDe(r.autor_id))}</b> ${fl ? 'escribió algo para revisar' : 'escribió'} en ${esc(tituloParche(r.parche_id))}`);
    updateCounts();
    if (fl) toast('Mensaje marcado', `${nombreDe(r.autor_id)}: ${r.texto.slice(0, 80)}`, { icon: 'i-flag' });
    if (current === 'moderacion') { $('#view-moderacion').classList.add('quiet'); renderModeracion(); const li = $(`[data-msg="${r.id}"]`); if (li) li.classList.add('is-new'); }
  }

  function onReporte(r) {
    if (S.reportes.some(x => x.id === r.id)) return;
    S.reportes.unshift(r);
    const [ml, , grave] = MOTIVOS[r.motivo] || ['Reporte'];
    pushFeed('i-flag', `<b>${esc(nombreDe(r.autor_id))}</b> reportó ${esc(TIPO_REP[r.tipo] || '')}: ${esc(ml.toLowerCase())}`);
    updateCounts();
    toast(grave ? 'Reporte urgente' : 'Nuevo reporte', `${ml}${r.usuario_id ? ' · ' + nombreDe(r.usuario_id) : ''}`, { icon: 'i-flag', ms: 7000 });
    if (current === 'reportes') { $('#view-reportes').classList.add('quiet'); renderReportes(); const li = $(`[data-rep="${r.id}"]`); if (li) li.classList.add('is-new'); }
    else if (current === 'resumen') renderAlertas();
  }

  function tiempoReal() {
    if (DEMO) { setLive(true, 'Ejemplo'); simular(); return; }
    const c = sb();
    c.channel('mp-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parches' }, ({ new: r }) => onParche(r))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'parches' }, ({ old: r }) => { S.parches = S.parches.filter(x => x.id !== r.id); updateCounts(); refrescarSuave(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parche_miembros' }, ({ new: r }) => onMiembro(r))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, ({ new: r }) => onMensaje(r))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reportes' }, ({ new: r }) => onReporte(r))
      .subscribe(st => setLive(st === 'SUBSCRIBED', st === 'SUBSCRIBED' ? 'En vivo' : 'Reconectando'));
    // Cada 2 minutos refresca métricas sin molestar
    setInterval(() => { if (!document.hidden) refrescarSuave(); }, 120000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.cargado > 60000) refrescarTodo(false); });
  }

  // En el ejemplo, la plataforma "se mueve" sola para ver el panel vivo
  function simular() {
    const R = Math.random, pick = a => a[Math.floor(R() * a.length)];
    const tick = () => {
      const per = personas(), prox = S.parches.filter(p => !p.demo && ts(p.inicio) > Date.now() && p.miembros < p.cupos_max);
      const r = R();
      if (r < .5 && prox.length) { const p = pick(prox), u = pick(per); S.miembros.push({ parche_id: p.id, usuario_id: u.id, checkin: false, creado_en: new Date().toISOString() }); onMiembro({ parche_id: p.id, usuario_id: u.id }); }
      else if (r < .88) { const m = pick(S.miembros); const txt = R() < .2 ? 'Escríbanme al 3204567812 y cuadramos' : pick(['Ya voy llegando', '¿Quién lleva el parlante?', 'Guárdenme puesto porfa', 'Qué buen parche', 'Llevo hielo']); onMensaje({ id: Date.now(), parche_id: m.parche_id, autor_id: m.usuario_id, tipo: 'user', texto: txt, creado_en: new Date().toISOString() }); }
      else { const u = pick(per); onParche({ id: 'n' + Date.now(), titulo: pick(['Parche de último minuto', 'Microfútbol relámpago', 'Tinto y charla']), categoria: pick(['deportes', 'chill', 'comida']), inicio: new Date(Date.now() + (2 + R() * 20) * HOUR).toISOString(), lugar: 'Parque Los Fundadores', barrio: 'Centro', lat: 4.1242 + (R() - .5) * .02, lng: -73.6395 + (R() - .5) * .02, costo: 0, cupos_max: 8, creador_id: u.id, creador_nombre: null, aliado: false, demo: false, creado_en: new Date().toISOString() }); }
      setTimeout(tick, 6000 + R() * 7000);
    };
    setTimeout(tick, 4000);
  }

  function setBoot(msg, actions) {
    $('#boot-msg').innerHTML = msg;
    const a = $('#boot-actions');
    a.hidden = !actions; a.innerHTML = actions || '';
    if (actions) $('.boot-ring').style.display = 'none';
  }
  function hideBoot() { const b = $('#boot'); b.classList.add('is-out'); setTimeout(() => { b.hidden = true; }, 420); }

  async function bootRemoto() {
    const c = sb();
    if (!c) { setBoot('No pudimos conectar con el servidor. Revisa tu internet.', '<button class="btn primary" onclick="location.reload()">Reintentar</button><a class="btn" href="admin.html?demo=1">Ver con datos de ejemplo</a>'); return false; }
    let session = null;
    try { session = (await c.auth.getSession()).data.session; } catch (e) { /* sin sesión */ }
    if (!session) { location.replace('login.html'); return false; }
    setBoot('Revisando tu acceso…');
    const { data: esAdmin, error } = await c.rpc('soy_admin');
    if (error) {
      const falta = /PGRST202|42883|Could not find the function/i.test(`${error.code} ${error.message}`);
      setBoot(falta ? 'Falta activar el panel en la base de datos. Corre la migración <code>20261029120000_panel_admin.sql</code> en Supabase y recarga.' : `No pudimos revisar tu acceso. ${esc(error.message)}`,
        '<button class="btn primary" onclick="location.reload()">Reintentar</button><button class="btn" data-action="logout">Cerrar sesión</button>');
      return false;
    }
    if (esAdmin !== true) {
      setBoot('<b>Esta cuenta no tiene acceso de admin.</b><br>Los admins solo se crean desde la base de datos.',
        `<a class="btn primary" href="${session.user.user_metadata && session.user.user_metadata.tipo === 'empresa' ? 'empresa-dashboard.html' : 'dashboard.html'}">Ir a mi panel</a><button class="btn" data-action="logout">Cerrar sesión</button>`);
      return false;
    }
    c.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('login.html'); });
    const { data: rol, error: eRol } = await c.rpc('mi_rol');
    if (eRol) {
      const falta = /PGRST202|42883|Could not find the function/i.test(`${eRol.code} ${eRol.message}`);
      setBoot(falta ? 'Falta la actualización del panel en la base de datos. Corre la migración <code>20261030120000_admin_v2.sql</code> en Supabase y recarga.' : `No pudimos revisar tu rol. ${esc(eRol.message)}`,
        '<button class="btn primary" onclick="location.reload()">Reintentar</button><button class="btn" data-action="logout">Cerrar sesión</button>');
      return false;
    }
    setBoot('Juntando lo que pasa en ModoParche…');
    try { await cargarRemoto(); }
    catch (e) {
      const falta = /PGRST202|PGRST205|42883|Could not find/i.test(`${e.code} ${e.message}`);
      setBoot(falta ? 'Falta la actualización del panel en la base de datos. Corre la migración <code>20261030120000_admin_v2.sql</code> en Supabase y recarga.' : `No pudimos cargar los datos. ${esc(errMsg(e))}`, '<button class="btn primary" onclick="location.reload()">Reintentar</button><button class="btn" data-action="logout">Cerrar sesión</button>');
      return false;
    }
    const yo = CUENTA.get(session.user.id) || {};
    ME = { id: session.user.id, nombre: yo.nombre || 'Admin', email: session.user.email, rol: rol || 'moderador' };
    return true;
  }

  async function init() {
    bind();
    let ok;
    if (DEMO) {
      Object.assign(S, sembrar());
      CUENTA = byId();
      S.cals = marcarCals(S.cals);
      S.met = metricasLocales(); S.cargado = Date.now();
      S.ret = retencionLocal(8);
      // ?rol=moderador muestra el panel como lo ve un moderador
      if (new URLSearchParams(location.search).get('rol') === 'moderador') ME = { id: 'demo-mod', nombre: 'Sofía', email: 'sofia.mod@modoparche.co', rol: 'moderador' };
      $('#demo-chip').hidden = false;
      ok = true;
    } else ok = await bootRemoto();
    if (!ok) return;
    $('#me-name').textContent = ME.nombre;
    $('#me-mail').textContent = `${ES_ADMIN() ? 'Admin' : 'Moderador'} · ${ME.email}`;
    document.body.classList.toggle('is-mod', !ES_ADMIN());
    if (!ES_ADMIN() && location.hash === '#anuncios') location.hash = '#resumen';
    $('#me-ava').textContent = initials(ME.nombre).slice(0, 1);
    updateCounts(); stampRefresh();
    go(location.hash.slice(1) || 'resumen', { force: true });
    hideBoot();
    tiempoReal();
    if (DEMO) setTimeout(() => toast('Datos de ejemplo', 'Así se ve el panel con la plataforma en movimiento. Nada se guarda.', { icon: 'i-info', ms: 6000 }), 900);
  }
  init();
})();
