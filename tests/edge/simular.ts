// Simulador mínimo de Supabase para probar las Edge Functions con Deno.
// Captura el handler de Deno.serve y responde las llamadas de fetch
// (PostgREST, Storage, Auth, Wompi, Turnstile) según reglas de cada prueba.
export const SB = 'https://proyecto.supabase.co';

export type Llamada = { metodo: string; url: string; cuerpo: string; headers: Headers };
export type Regla = (l: Llamada) => Response | Promise<Response> | null | undefined;

export const llamadas: Llamada[] = [];
let reglas: Regla[] = [];
export function responder(...r: Regla[]) { reglas = r; llamadas.length = 0; }
export const json = (d: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', ...extra } });

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const l: Llamada = { metodo: req.method, url: req.url, cuerpo: req.body ? await req.text() : '', headers: req.headers };
  llamadas.push(l);
  for (const r of reglas) { const res = await r(l); if (res) return res; }
  return json({ message: 'sin regla para ' + l.metodo + ' ' + l.url }, 599);
};

// Carga la función y devuelve su handler (sin abrir ningún puerto)
export async function cargar(nombre: string, env: Record<string, string>) {
  for (const [k, v] of Object.entries({ SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ...env })) Deno.env.set(k, v);
  let handler: ((r: Request) => Response | Promise<Response>) | null = null;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (h: any) => { handler = typeof h === 'function' ? h : h.handler; return { finished: Promise.resolve() }; };
  await import(new URL(`../../supabase/functions/${nombre}/index.ts`, import.meta.url).href);
  if (!handler) throw new Error('La función no llamó Deno.serve');
  return handler as (r: Request) => Promise<Response>;
}

export const rpc = (nombre: string, f: (cuerpo: Record<string, unknown>) => Response) => (l: Llamada) =>
  l.metodo === 'POST' && l.url.startsWith(`${SB}/rest/v1/rpc/${nombre}`) ? f(JSON.parse(l.cuerpo || '{}')) : null;
export const tabla = (nombre: string, f: (l: Llamada) => Response) => (l: Llamada) =>
  new URL(l.url).pathname === `/rest/v1/${nombre}` ? f(l) : null;
export const sha256 = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map((b) => b.toString(16).padStart(2, '0')).join('');
