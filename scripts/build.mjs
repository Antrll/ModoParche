// =====================================================================
// ModoParche · compilación para Vercel
// - Copia a dist/ SOLO lo que se publica (lista permitida): así un archivo
//   privado dejado en la carpeta nunca llega al sitio.
// - Minifica JS y CSS uno por uno (siguen siendo scripts clásicos).
// - Pone un hash en el nombre para servirlos con caché inmutable.
// - También a las librerías de src/vendor (JS y CSS): actualizar una ya no
//   deja a nadie con la versión vieja guardada 30 días. Las copias sin hash
//   se quedan para quien las pide por su ruta fija (api/seguro.js).
// - Al final revisa que todo enlace y archivo de dist/*.html exista.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SIN_HASH = new Set(['sw.js', 'mp-seguro-vivo.js']); // se piden por un nombre fijo
const EXTRA = ['manifest.webmanifest', 'robots.txt', 'sitemap.xml'];
const CONFIG = new Set(['eslint.config.js', 'vitest.config.js']);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const raiz = fs.readdirSync(ROOT, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
const htmls = raiz.filter(f => f.endsWith('.html'));
const assets = raiz.filter(f => /\.(js|css)$/.test(f) && !CONFIG.has(f));
const paginas = htmls.map(f => f.replace(/\.html$/, ''));

// Assets públicos, sin los originales en alta resolución
fs.cpSync(path.join(ROOT, 'src'), path.join(DIST, 'src'), {
  recursive: true,
  filter: s => !path.relative(path.join(ROOT, 'src'), s).split(path.sep).join('/').startsWith('assets/fuentes'),
});
for (const f of EXTRA) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));

// Librerías de src/vendor con hash en el nombre
const archivosDe = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? archivosDe(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const vendor = new Map(); // 'src/vendor/x.js' -> 'src/vendor/x.<hash>.js'
for (const abs of archivosDe(path.join(DIST, 'src', 'vendor')).filter(f => /\.(js|css)$/.test(f))) {
  const rel = path.relative(DIST, abs).split(path.sep).join('/');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 8);
  const nuevo = rel.replace(/\.(js|css)$/, `.${hash}.$1`);
  fs.copyFileSync(abs, path.join(DIST, nuevo));
  vendor.set(rel, nuevo);
}
// Cambia '/src/vendor/x.js' y 'src/vendor/x.js' por su versión con hash (en HTML, JS y el service worker)
const conVendor = s => s.replace(/(\/?)(src\/vendor\/[A-Za-z0-9_./-]+\.(?:js|css))(?![A-Za-z0-9_.-])/g, (m, barra, rel) => (vendor.has(rel) ? barra + vendor.get(rel) : m));

const nombres = new Map();
for (const f of assets) {
  const ext = path.extname(f).slice(1);
  const fuente = conVendor(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const { code } = await transform(fuente, { loader: ext, minify: ext === 'css' || f !== 'sw.js', target: ext === 'css' ? 'chrome90' : 'es2020', legalComments: 'none', charset: 'utf8' });
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 8);
  const salida = SIN_HASH.has(f) ? f : f.replace(new RegExp(`\\.${ext}$`), `.${hash}.${ext}`);
  nombres.set(f, salida);
  fs.writeFileSync(path.join(DIST, salida), code);
}

const conHash = s => s.replace(/\b(src|href)="(\/?)([a-z0-9-]+\.(?:js|css))((?:\?[^"]*)?)"/gi, (m, a, b, f, q) => (nombres.has(f) ? `${a}="${b}${nombres.get(f)}${q}"` : m));
// Enlaces limpios: sin .html y sin pasar por una redirección 308
const limpios = s => s.replace(/\bhref="\/?([a-z0-9-]+)\.html((?:[?#][^"]*)?)"/gi, (m, p, resto) => {
  if (!paginas.includes(p)) return m;
  return `href="${p === 'index' ? '/' : '/' + p}${resto}"`;
});
for (const f of htmls) fs.writeFileSync(path.join(DIST, f), limpios(conHash(conVendor(fs.readFileSync(path.join(ROOT, f), 'utf8')))));

// El service worker guarda los nombres con hash
const sw = path.join(DIST, 'sw.js');
let s = fs.readFileSync(sw, 'utf8');
for (const [a, b] of nombres) s = s.split(`'/${a}'`).join(`'/${b}'`).split(`"/${a}"`).join(`"/${b}"`);
const version = crypto.createHash('sha256').update([...nombres.values(), ...vendor.values()].join()).digest('hex').slice(0, 10);
s = s.replace(/(['"])mp-v\d+\1/, `$1mp-${version}$1`);
fs.writeFileSync(sw, s);

// ---------- Revisión final: todo enlace interno y archivo de las páginas existe ----------
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const redirigidas = new Set((vercel.redirects || []).map(r => r.source).filter(x => !x.includes(':')));
const DINAMICAS = /^\/(api|p|seguro)\/|^\/_vercel\//; // funciones de Vercel y su analítica
function existe(ruta) {
  if (redirigidas.has(ruta) || DINAMICAS.test(ruta)) return true;
  const abs = path.join(DIST, decodeURIComponent(ruta));
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return true;
  if (ruta === '/' || fs.existsSync(abs + '.html')) return true; // enlaces limpios (cleanUrls)
  return fs.existsSync(path.join(abs, 'index.html'));
}
const rotos = [];
for (const f of htmls) {
  const html = fs.readFileSync(path.join(DIST, f), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => m.replace(/>[\s\S]*<\//, '></'));
  const refs = [];
  for (const m of html.matchAll(/\s(?:src|href|poster)="([^"]+)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) refs.push(...m[1].split(',').map(x => x.trim().split(/\s+/)[0]));
  for (const r of refs) {
    if (!r || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\$\{)/i.test(r)) continue; // externos, mailto:, data:, anclas, plantillas
    const limpio = r.split(/[?#]/)[0];
    if (!limpio) continue;
    const ruta = limpio.startsWith('/') ? limpio : '/' + path.posix.normalize(limpio);
    if (!existe(ruta)) rotos.push(`${f}: ${r}`);
  }
}
if (rotos.length) {
  console.error(`Enlaces o archivos que no existen en dist/ (${rotos.length}):\n  ` + rotos.join('\n  '));
  process.exit(1);
}

console.log(`dist/ listo: ${htmls.length} páginas, ${assets.length} archivos JS/CSS y ${vendor.size} librerías con hash. Enlaces revisados.`);
