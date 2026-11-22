// =====================================================================
// ModoParche · utilidades compartidas de las Edge Functions
// Supabase empaqueta esta carpeta (_shared) con cada función que la
// importa; no se despliega como función propia.
// Un arreglo aquí llega a todas: secretos, CORS, firmas y cliente.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// Respuesta JSON (sin caché) con encabezados extra (por ejemplo, CORS)
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...extra, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function sha256hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compara dos textos sin revelar por el tiempo en qué carácter difieren
// (compara sus huellas SHA-256, que siempre tienen el mismo largo)
export async function mismoSecreto(a: string, b: string): Promise<boolean> {
  const h = async (t: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

// Revisa el secreto del encabezado contra el primero de los secretos configurados.
// Devuelve null si está bien, o la respuesta de error lista (503 sin configurar, 401 si no coincide).
export async function exigirSecreto(req: Request, encabezado: string, ...nombres: string[]): Promise<Response | null> {
  const secreto = nombres.map((n) => Deno.env.get(n) ?? '').find(Boolean) ?? '';
  if (!secreto) return json({ error: 'SIN_CONFIGURAR' }, 503);
  if (!(await mismoSecreto(req.headers.get(encabezado) ?? '', secreto))) return json({ error: 'NO_AUTORIZADO' }, 401);
  return null;
}

// Dominios que pueden llamar desde el navegador: el sitio y ORIGENES_EXTRA (por ejemplo, Preview de Vercel)
export function origenesPermitidos(): Set<string> {
  return new Set(['https://modoparche.vercel.app',
    ...(Deno.env.get('ORIGENES_EXTRA') ?? '').split(',').map((o) => o.trim()).filter(Boolean)]);
}
export function corsDe(origen: string, origenes: Set<string>, encabezados = 'content-type'): Record<string, string> {
  return {
    ...(origenes.has(origen) ? { 'Access-Control-Allow-Origin': origen } : {}),
    'Access-Control-Allow-Headers': encabezados,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Cliente con la llave del servidor (salta RLS: usar solo después de validar quién llama)
export const clienteServidor = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// URL del API de Wompi según la llave pública (pub_prod_ = producción)
export const apiWompi = (llavePublica: string) =>
  llavePublica.startsWith('pub_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';
