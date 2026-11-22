// =====================================================================
// ModoParche · Edge Function depurar-archivos
//
// Vacía la cola public.archivos_por_borrar sin depender de que un admin
// abra el panel: borra de Storage las fotos de cédulas, del álbum y de
// parches que ya no deben existir (cuentas borradas, verificaciones
// rechazadas, etc.). Solo sale de la cola lo que de verdad ya no está.
//
// Secretos (Supabase > Edge Functions > Secrets):
//   CRON_SECRET  clave que manda quien la programa en el encabezado
//                x-cron-secret (si no existe, se usa PUSH_WEBHOOK_SECRET)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen.
//
// Desplegar SIN verificación de JWT (la llama un cron, no una persona):
//   supabase functions deploy depurar-archivos --no-verify-jwt
// Programarla una vez al día: ver README > "Depuración automática de archivos".
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const BUCKETS = new Set(['documentos_identidad', 'album', 'fotos']);
const LOTE = 100; // la API de Storage borra hasta 1000 por llamada; vamos de a 100

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Compara huellas de igual largo para no filtrar el secreto por tiempo
async function mismoSecreto(a: string, b: string): Promise<boolean> {
  const h = async (t: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405);
  const secreto = Deno.env.get('CRON_SECRET') || Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
  if (!secreto) return json({ error: 'SIN_CONFIGURAR' }, 503);
  if (!(await mismoSecreto(req.headers.get('x-cron-secret') ?? '', secreto))) return json({ error: 'NO_AUTORIZADO' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: filas, error } = await admin.rpc('sistema_archivos_por_borrar', { p_limite: 500 });
  if (error) { console.error('[depurar] cola', error.message); return json({ error: 'ERROR_INTERNO' }, 500); }

  // Agrupa por bucket; un bucket desconocido nunca se toca
  const porBucket = new Map<string, { id: number; ruta: string }[]>();
  for (const f of (filas ?? []) as { id: number; bucket: string; ruta: string }[]) {
    if (!BUCKETS.has(f.bucket) || !f.ruta) continue;
    if (!porBucket.has(f.bucket)) porBucket.set(f.bucket, []);
    porBucket.get(f.bucket)!.push({ id: f.id, ruta: f.ruta });
  }

  const listos: number[] = [];
  let fallos = 0;
  for (const [bucket, lista] of porBucket) {
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      const { error: eB } = await admin.storage.from(bucket).remove(lote.map((x) => x.ruta));
      if (eB) { fallos += lote.length; console.error('[depurar]', bucket, eB.message); continue; }
      listos.push(...lote.map((x) => x.id));
    }
  }

  let quitados = 0;
  if (listos.length) {
    const { data: n, error: eQ } = await admin.rpc('sistema_archivos_borrados', { p_ids: listos });
    if (eQ) { console.error('[depurar] cerrar', eQ.message); return json({ error: 'ERROR_INTERNO' }, 500); }
    quitados = Number(n ?? 0);
  }
  return json({ ok: true, revisados: (filas ?? []).length, borrados: quitados, fallos });
});
