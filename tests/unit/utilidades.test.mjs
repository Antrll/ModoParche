import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const cargar = (archivo, ctx) => vm.runInContext(fs.readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8'), ctx);
let U, S;
beforeAll(() => {
  const ctx = vm.createContext({ window: {}, Intl, String, Number, Math, URL, RegExp, Promise });
  cargar('mp-utils.js', ctx); cargar('mp-seguro.js', ctx);
  U = ctx.window.MPUtil; S = ctx.window.MPSeguro;
});

describe('MPUtil', () => {
  it('escapa HTML', () => expect(U.esc('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;'));
  it('no rompe con null', () => expect(U.esc(null)).toBe(''));
  it('normaliza tildes', () => expect(U.norm('Acacías')).toBe('acacias'));
  it('formatea pesos', () => expect(U.money(2500)).toBe('$2.500'));
  it('valores inválidos valen 0', () => expect(U.money('x')).toBe('$0'));
});

describe('MPSeguro', () => {
  it('bloquea javascript:', () => expect(S.safeUrl('javascript:alert(1)')).toBe(''));
  it('bloquea data:text/html en imágenes', () => expect(S.safeUrl('data:text/html,x', { imagen: true })).toBe(''));
  it('bloquea credenciales en la URL', () => expect(S.safeUrl('https://a@b.co/')).toBe(''));
  it('deja https', () => expect(S.safeUrl('https://modoparche.vercel.app/x')).toBe('https://modoparche.vercel.app/x'));
  it('neutraliza fórmulas de Excel', () => {
    for (const v of ['=1+1', '+1', '-1', '@x', '\tx']) expect(S.celdaCSV(v, ';').replace(/^"/, '').startsWith("'")).toBe(true);
  });
  it('los números reales no se tocan', () => expect(S.celdaCSV(-5, ';')).toBe('-5'));
});

describe('Publicación', () => {
  const raiz = n => fs.readFileSync(new URL(`../../${n}`, import.meta.url), 'utf8');
  it('la compilación usa lista permitida', () => expect(raiz('scripts/build.mjs')).toContain('lista permitida'));
  it('los datos personales no se despliegan', () => expect(raiz('.vercelignore')).toContain('mis-datos-*'));
  it('la CSP no permite scripts en línea', () => {
    const csp = JSON.parse(raiz('vercel.json')).headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
    const scripts = csp.split(';').find(d => d.trim().startsWith('script-src'));
    expect(scripts).not.toContain("'unsafe-inline'");
  });
  it('ninguna página trae script ejecutable en línea', () => {
    for (const f of fs.readdirSync(new URL('../../', import.meta.url)).filter(x => x.endsWith('.html'))) {
      const s = raiz(f).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      expect(/<script(?![^>]*\bsrc=)[^>]*>/.test(s), f).toBe(false);
      expect(/\son(click|error|load|submit|change)=/.test(s), f).toBe(false);
    }
  });
});

describe('Vista previa al compartir (Open Graph / WhatsApp)', () => {
  const RAIZ = new URL('../../', import.meta.url);
  const leer = n => fs.readFileSync(new URL(n, RAIZ), 'utf8');
  const existe = ruta => fs.existsSync(new URL(ruta.replace(/^\//, ''), RAIZ));
  // https://modoparche.vercel.app/src/... -> src/...
  const local = u => new URL(u, 'https://modoparche.vercel.app').pathname;

  it('las imágenes og:image y twitter:image de las páginas existen', () => {
    const htmls = fs.readdirSync(RAIZ).filter(x => x.endsWith('.html'));
    let total = 0;
    for (const f of htmls) {
      for (const m of leer(f).matchAll(/<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content="([^"]+)"/g)) {
        total++;
        expect(existe(local(m[1])), `${f}: ${m[1]}`).toBe(true);
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('la imagen por defecto de api/p.js existe', () => {
    const rutas = [...leer('api/p.js').matchAll(/\$\{origin\}(\/src\/[^`'"\s]+\.(?:jpe?g|png|webp))/g)].map(m => m[1]);
    expect(rutas.length).toBeGreaterThan(0);
    for (const r of rutas) expect(existe(r), r).toBe(true);
  });

  it('cada afiche oficial .webp tiene su versión -og.jpg para compartir', () => {
    const sql = fs.readdirSync(new URL('supabase/migrations/', RAIZ)).map(f => leer(`supabase/migrations/${f}`)).join('\n');
    const usadas = new Set([...sql.matchAll(/\/src\/assets\/web\/oficiales\/[a-z0-9-]+\.webp/g)].map(m => m[0]));
    const carpeta = fs.readdirSync(new URL('src/assets/web/oficiales/', RAIZ)).filter(x => x.endsWith('.webp')).map(x => `/src/assets/web/oficiales/${x}`);
    for (const r of new Set([...usadas, ...carpeta])) {
      expect(existe(r), r).toBe(true);
      expect(existe(r.replace(/\.webp$/, '-og.jpg')), r.replace(/\.webp$/, '-og.jpg')).toBe(true);
    }
  });
});

describe('Service worker: aviso de versión nueva (MPUtil.registrarSW)', () => {
  // navigator.serviceWorker y window de mentiras para probar sin navegador
  const falso = ({ controller = {}, waiting = null, protocolo = 'https:' } = {}) => {
    const oyentes = {}, mensajes = [], estado = { recargas: 0 };
    const reg = { waiting, addEventListener: () => {}, update: () => Promise.resolve() };
    if (waiting) waiting.postMessage = m => mensajes.push(m);
    const sw = { controller, addEventListener: (ev, fn) => { oyentes[ev] = fn; }, register: () => Promise.resolve(reg) };
    const win = { location: { protocol: protocolo, hostname: 'modoparche.vercel.app', reload: () => { estado.recargas++; } }, document: { addEventListener: () => {}, visibilityState: 'visible' } };
    return { nav: { serviceWorker: sw }, win, oyentes, mensajes, estado };
  };

  it('avisa si hay una versión esperando y "Actualizar" la activa', async () => {
    const f = falso({ waiting: {} });
    let aplicar = null;
    await U.registrarSW({ alHaberNueva: a => { aplicar = a; } }, f.nav, f.win);
    expect(typeof aplicar).toBe('function');
    aplicar();
    expect(f.mensajes).toEqual([{ tipo: 'ACTUALIZAR' }]);
  });
  it('recarga una sola vez cuando la versión nueva toma el control', async () => {
    const f = falso({ waiting: {} });
    await U.registrarSW({}, f.nav, f.win);
    f.oyentes.controllerchange(); f.oyentes.controllerchange();
    expect(f.estado.recargas).toBe(1);
  });
  it('la primera instalación no recarga ni avisa', async () => {
    const f = falso({ controller: null, waiting: null });
    let avisos = 0;
    await U.registrarSW({ alHaberNueva: () => avisos++ }, f.nav, f.win);
    f.oyentes.controllerchange();
    expect(f.estado.recargas).toBe(0);
    expect(avisos).toBe(0);
  });
  it('sin https no registra nada', async () => {
    const f = falso({ protocolo: 'http:' });
    expect(await U.registrarSW({}, f.nav, f.win)).toBe(null);
  });
  it('sin soporte de service worker no rompe', async () => {
    expect(await U.registrarSW({}, {}, { location: { protocol: 'https:' } })).toBe(null);
  });
});

describe('Cola de llegadas sin conexión (MPUtil.colaAgregar)', () => {
  it('guarda solo lo último por persona', () => {
    let c = U.colaAgregar([], { clave: 'c:p1:u1', llego: true });
    c = U.colaAgregar(c, { clave: 'c:p1:u2', llego: true });
    c = U.colaAgregar(c, { clave: 'c:p1:u1', llego: false });
    expect(c.length).toBe(2);
    expect(c.find(x => x.clave === 'c:p1:u1').llego).toBe(false);
  });
  it('acepta una cola dañada', () => expect(U.colaAgregar(null, { clave: 'a' }).length).toBe(1));
  it('no crece sin límite', () => {
    let c = [];
    for (let i = 0; i < 600; i++) c = U.colaAgregar(c, { clave: 'k' + i });
    expect(c.length).toBe(500);
  });
});

// Respuesta de mentiras al estilo de Vercel
const respuesta = () => {
  const r = { code: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};

describe('api/p.js (vista para compartir)', () => {
  const P = require('../../api/p.js');
  it('un error del servidor nunca se guarda en caché', () => expect(P.cacheDe(null, true)).toBe('no-store'));
  it('un 404 real se guarda poco', () => expect(P.cacheDe(null, false)).toMatch(/s-maxage=60\b/));
  it('un parche existente se guarda 5 minutos', () => expect(P.cacheDe({ id: 'x' }, false)).toMatch(/s-maxage=300\b/));
  it('rechaza POST con 405', async () => {
    const res = respuesta();
    await P({ method: 'POST', query: {} }, res);
    expect(res.code).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
  });
  it('un id inválido es 404 sin llamar a la base', async () => {
    const res = respuesta();
    await P({ method: 'GET', query: { id: 'no-es-uuid' } }, res);
    expect(res.code).toBe(404);
    expect(res.headers['cache-control']).toMatch(/s-maxage=60\b/);
  });
});

describe('Formulario de contacto', () => {
  const raiz = n => fs.readFileSync(new URL(`../../${n}`, import.meta.url), 'utf8');
  it('va a la Edge Function contacto con el captcha cargado', () => {
    expect(raiz('equipo.js')).toContain("'/functions/v1/contacto'");
    expect(raiz('equipo.js')).not.toContain('rpc/enviar_contacto');
    expect(raiz('equipo.html')).toContain('mp-captcha.js');
    expect(raiz('supabase/config.toml')).toMatch(/\[functions\.contacto\]\s*\nverify_jwt = false/);
  });
});

describe('PWA y Edge Functions (revisión del código)', () => {
  const raiz = n => fs.readFileSync(new URL(`../../${n}`, import.meta.url), 'utf8');
  it('el service worker guarda el panel de negocios para abrir sin señal', () => {
    const sw = raiz('sw.js');
    for (const f of ['/empresa-dashboard', '/empresa-dashboard.js', '/empresa-dashboard.css']) expect(sw).toContain(`'${f}'`);
    expect(sw).toMatch(/PANELES = \['\/empresa-dashboard', '\/dashboard'\]/);
  });
  it('la versión nueva espera a que la persona actualice', () => {
    const sw = raiz('sw.js');
    expect(sw).toContain("e.data.tipo === 'ACTUALIZAR'");
    expect(sw).toMatch(/if \(primeraVez\) return self\.skipWaiting\(\)/);
  });
  it('el ícono muestra el número real de avisos', () => expect(raiz('sw.js')).toMatch(/setAppBadge\(Math\.min\(Math\.round\(n\), 999\)\)/));
  it('los dos paneles registran el service worker con aviso', () => {
    for (const f of ['dashboard.js', 'empresa-dashboard.js']) expect(raiz(f)).toContain('registrarSW');
  });
  it('enviar-push acepta los subdominios de Apple igual que la base', () => {
    const ts = raiz('supabase/functions/enviar-push/index.ts');
    const re = new RegExp(/HOSTS_PUSH = \/(.+)\/i;/.exec(ts)[1], 'i');
    for (const h of ['web.push.apple.com', 'api.push.apple.com', 'a.b.push.apple.com', 'fcm.googleapis.com']) expect(re.test(h), h).toBe(true);
    for (const h of ['push.apple.com.evil.co', 'evilpush.apple.com.co', 'apple.com']) expect(re.test(h), h).toBe(false);
    expect(ts).toContain("'/admin'");
    expect(ts).toContain('badge:');
  });
  it('wompi-webhook responde 405 y deduce el entorno del secreto', () => {
    const ts = raiz('supabase/functions/wompi-webhook/index.ts');
    expect(ts).toMatch(/status: 405/);
    expect(ts).toContain("startsWith('prod_events_')");
    expect(ts).toContain("startsWith('test_events_')");
  });
  it('wompi-checkout revisa negocio y frena antes de llamar a Wompi', () => {
    const ts = raiz('supabase/functions/wompi-checkout/index.ts');
    const i = ts.indexOf("body.accion === 'confirmar'");
    const bloque = ts.slice(i, ts.indexOf('/transactions/', i));
    expect(bloque).toContain('NO_ES_NEGOCIO');
    expect(bloque).toContain('sistema_permitir_intento');
  });
  it('depurar-archivos está protegida y sin JWT en config.toml', () => {
    expect(raiz('supabase/functions/depurar-archivos/index.ts')).toContain('x-cron-secret');
    expect(raiz('supabase/config.toml')).toMatch(/\[functions\.depurar-archivos\]\s*\nverify_jwt = false/);
  });
  it('Tesseract se sirve desde el sitio y con un solo lector por revisión', () => {
    const v = raiz('mp-verificacion.js');
    expect(v).toContain("'/src/vendor/tesseract/tesseract.min.js'");
    expect(v).not.toContain('cdn.jsdelivr.net/npm/tesseract.js');
    expect((v.match(/createWorker\(/g) || []).length).toBe(1);
    expect(fs.existsSync(new URL('../../src/vendor/tesseract/worker.min.js', import.meta.url))).toBe(true);
  });
});

describe('Buscador del mapa (mp-mapa.js)', () => {
  // Carga mp-mapa.js con un fetch de mentiras que se puede cambiar
  const cargarMapa = () => {
    const red = { caida: true, llamadas: 0 };
    const respuesta = { features: [{ properties: { name: 'Parque Los Fundadores', city: 'Villavicencio' }, geometry: { coordinates: [-73.63, 4.14] } }] };
    const fetch = () => { red.llamadas++; return red.caida ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve({ ok: true, json: () => Promise.resolve(respuesta) }); };
    const ctx = vm.createContext({ window: {}, fetch, AbortController, setTimeout, clearTimeout, Promise, Math, Date, Map, String, Number, encodeURIComponent, isFinite });
    vm.runInContext(fs.readFileSync(new URL('../../mp-mapa.js', import.meta.url), 'utf8'), ctx);
    return { M: ctx.window.MPMapa, red };
  };
  it('una búsqueda sin red no queda guardada vacía', async () => {
    const { M, red } = cargarMapa();
    const r1 = await M.buscar('parque fundadores', { soloRapido: true });
    expect(r1.length).toBe(0);
    expect(r1.sinRed).toBe(true);
    red.caida = false;
    const r2 = await M.buscar('parque fundadores', { soloRapido: true });
    expect(r2.length).toBe(1);
  });
  it('una respuesta real sí se guarda', async () => {
    const { M, red } = cargarMapa();
    red.caida = false;
    await M.buscar('parque fundadores', { soloRapido: true });
    const antes = red.llamadas;
    await M.buscar('parque fundadores', { soloRapido: true });
    expect(red.llamadas).toBe(antes);
  });
  it('se puede cancelar una búsqueda en vuelo', async () => {
    const { M, red } = cargarMapa();
    red.caida = false;
    const c = new AbortController(); c.abort();
    await expect(M.buscar('parque fundadores', { soloRapido: true, signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('el campo de búsqueda es válido y tiene su etiqueta', () => {
    const src = fs.readFileSync(new URL('../../mp-mapa.js', import.meta.url), 'utf8');
    expect(src).not.toContain('spellcheck="false" ">');
    expect(src).toMatch(/<label class="mpm-sr" for="' \+ idInput/);
    expect(src).toMatch(/class="mpm-input" id="' \+ idInput/);
  });
});

describe('Edge Functions: la sintaxis TypeScript compila', () => {
  it('cada supabase/functions/*/index.ts se puede transpilar', async () => {
    const { transform } = await import('esbuild');
    const dir = new URL('../../supabase/functions/', import.meta.url);
    const funciones = fs.readdirSync(dir).filter(f => fs.existsSync(new URL(`${f}/index.ts`, dir)));
    expect(funciones.length).toBeGreaterThanOrEqual(4);
    for (const f of funciones) {
      const ts = fs.readFileSync(new URL(`${f}/index.ts`, dir), 'utf8');
      await expect(transform(ts, { loader: 'ts', format: 'esm' }), f).resolves.toBeTruthy();
    }
  });
});

describe('Páginas públicas: accesibilidad, SEO y limpieza', () => {
  const raiz = n => fs.readFileSync(new URL(`../../${n}`, import.meta.url), 'utf8');
  const htmls = fs.readdirSync(new URL('../../', import.meta.url)).filter(x => x.endsWith('.html'));
  it('cada página pública tiene un solo <h1>', () => {
    // Los paneles (admin, dashboards) tienen un título por vista y no se indexan
    for (const f of htmls.filter(x => !/^(admin|dashboard|empresa-dashboard)\.html$/.test(x))) expect((raiz(f).match(/<h1\b/g) || []).length, f).toBeLessThanOrEqual(1);
    for (const f of ['login.html', 'empresa.html']) expect((raiz(f).match(/<h1\b/g) || []).length, f).toBe(1);
  });
  it('404 y sin conexión: descripción, noindex y salto al contenido', () => {
    for (const f of ['404.html', 'offline.html']) {
      const s = raiz(f);
      expect(s, f).toContain('<meta name="description"');
      expect(s, f).toContain('noindex');
      expect(s, f).toMatch(/class="skip-link" href="#main"/);
      expect(s, f).toMatch(/<main id="main"/);
    }
  });
  it('/comercios redirige con 301 y el archivo viejo ya no existe', () => {
    const r = JSON.parse(raiz('vercel.json')).redirects;
    expect(r.some(x => x.source === '/comercios' && x.destination === '/comercio' && x.statusCode === 301)).toBe(true);
    expect(fs.existsSync(new URL('../../comercios.html', import.meta.url))).toBe(false);
  });
  it('Inter es local: ninguna página llama a Google Fonts', () => {
    for (const f of htmls) expect(raiz(f), f).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(raiz('mp-fuentes.css')).toContain('Inter-latin.woff2');
    expect(fs.existsSync(new URL('../../src/assets/fonts/Inter-latin.woff2', import.meta.url))).toBe(true);
  });
  it('solo WOFF2 para Gagalin', () => {
    for (const f of ['mp-base.css', 'dashboard.css', 'admin.css', 'empresa-dashboard.css']) expect(raiz(f), f).not.toMatch(/Gagalin-Regular\.woff'/);
    expect(fs.existsSync(new URL('../../src/assets/fonts/Gagalin-Regular.woff', import.meta.url))).toBe(false);
  });
  it('sin código PHP viejo', () => {
    for (const f of ['registro.php', 'includes/conexion.php', 'includes/procesar_login.php']) expect(fs.existsSync(new URL(`../../${f}`, import.meta.url)), f).toBe(false);
  });
});

describe('Imágenes que piden el JS y el CSS', () => {
  const RAIZ = new URL('../../', import.meta.url);
  const leer = n => fs.readFileSync(new URL(n, RAIZ), 'utf8');
  const existe = r => fs.existsSync(new URL(r.replace(/^\//, ''), RAIZ));
  const fuentes = fs.readdirSync(RAIZ).filter(f => /\.(js|css)$/.test(f) && !/config\.js$/.test(f));
  it('toda ruta src/assets/… escrita en el código existe', () => {
    const faltan = [];
    for (const f of fuentes) {
      for (const m of leer(f).matchAll(/\/?src\/assets\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|svg|gif|ico|woff2)/g)) if (!existe(m[0])) faltan.push(`${f}: ${m[0]}`);
    }
    expect(faltan).toEqual([]);
  });
  it('todo sticker de STK() y de las categorías (dashboard.js) existe', () => {
    const js = leer('dashboard.js');
    const nombres = new Set([...js.matchAll(/STK\('([a-z0-9-]+)'\)|\bart: '([a-z0-9-]+)'/g)].map(m => m[1] || m[2]));
    expect(nombres.size).toBeGreaterThan(5);
    const faltan = [...nombres].filter(n => !existe(`src/assets/web/stk/${n}.webp`));
    expect(faltan).toEqual([]);
  });
});
