// =====================================================================
// ModoParche · compilación para Vercel
// - Copia a dist/ SOLO lo que se publica (lista permitida): así un archivo
//   privado dejado en la carpeta nunca llega al sitio.
// - Minifica JS y CSS uno por uno (siguen siendo scripts clásicos).
// - Pone un hash en el nombre para servirlos con caché inmutable.
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

const nombres = new Map();
for (const f of assets) {
  const ext = path.extname(f).slice(1);
  const fuente = fs.readFileSync(path.join(ROOT, f), 'utf8');
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
for (const f of htmls) fs.writeFileSync(path.join(DIST, f), limpios(conHash(fs.readFileSync(path.join(ROOT, f), 'utf8'))));

// El service worker guarda los nombres con hash
const sw = path.join(DIST, 'sw.js');
let s = fs.readFileSync(sw, 'utf8');
for (const [a, b] of nombres) s = s.split(`'/${a}'`).join(`'/${b}'`).split(`"/${a}"`).join(`"/${b}"`);
const version = crypto.createHash('sha256').update([...nombres.values()].join()).digest('hex').slice(0, 10);
s = s.replace(/(['"])mp-v\d+\1/, `$1mp-${version}$1`);
fs.writeFileSync(sw, s);

console.log(`dist/ listo: ${htmls.length} páginas, ${assets.length} archivos JS/CSS con hash.`);
