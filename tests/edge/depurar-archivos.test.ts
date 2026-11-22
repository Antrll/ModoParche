import { assertEquals } from 'jsr:@std/assert@1';
import { cargar, json, responder, rpc, SB } from './simular.ts';

const h = await cargar('depurar-archivos', { CRON_SECRET: 'cron-123' });
const post = (secreto = 'cron-123') => h(new Request('https://f/depurar-archivos', { method: 'POST', headers: { 'x-cron-secret': secreto } }));

Deno.test('sin la clave del cron: 401', async () => {
  responder();
  assertEquals((await post('mala')).status, 401);
  assertEquals((await h(new Request('https://f/depurar-archivos'))).status, 405);
});

Deno.test('borra por bucket y solo cierra los que salieron bien', async () => {
  const borrados: Record<string, string[]> = {};
  let cerrados: number[] = [];
  responder(
    rpc('sistema_archivos_por_borrar', () => json([
      { id: 1, bucket: 'album', ruta: 'p/u/a.jpg' }, { id: 2, bucket: 'documentos_identidad', ruta: 'cedulas/u/f.webp' },
      { id: 3, bucket: 'fotos', ruta: 'x/y.jpg' }, { id: 4, bucket: 'otro', ruta: 'no-se-toca' },
    ])),
    (l) => {
      const m = l.url.match(/\/storage\/v1\/object\/([^/?]+)$/);
      if (!m || l.metodo !== 'DELETE') return null;
      borrados[m[1]] = JSON.parse(l.cuerpo).prefixes;
      return m[1] === 'fotos' ? json({ message: 'falló' }, 500) : json([]);
    },
    rpc('sistema_archivos_borrados', (c) => { cerrados = c.p_ids as number[]; return json(cerrados.length); }));
  const r = await post();
  const d = await r.json();
  assertEquals(r.status, 200);
  assertEquals(borrados.album, ['p/u/a.jpg']);
  assertEquals(borrados.documentos_identidad, ['cedulas/u/f.webp']);
  assertEquals(borrados.otro, undefined);
  assertEquals(cerrados.sort(), [1, 2]);
  assertEquals(d.fallos, 1);
  void SB;
});
