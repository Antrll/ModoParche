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
import { clienteServidor, exigirSecreto, json } from '../_shared/utilidades.ts';

const BUCKETS = new Set(['documentos_identidad', 'album', 'fotos']);
const LOTE = 100; // la API de Storage borra hasta 1000 por llamada; vamos de a 100


Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405);
  const negado = await exigirSecreto(req, 'x-cron-secret', 'CRON_SECRET', 'PUSH_WEBHOOK_SECRET');
  if (negado) return negado;

  const admin = clienteServidor();
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
  const resumen = { revisados: (filas ?? []).length, borrados: quitados, fallos };
  await admin.rpc('sistema_anotar_tarea', { p_nombre: 'depurar-archivos', p_ok: fallos === 0, p_detalle: resumen });
  return json({ ok: true, ...resumen });
});
