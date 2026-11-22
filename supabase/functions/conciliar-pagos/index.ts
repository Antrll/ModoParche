// =====================================================================
// ModoParche · Edge Function conciliar-pagos
//
// Si el aviso (webhook) de Wompi se pierde y el negocio no vuelve a la
// página, un pago quedaba "PENDIENTE" para siempre. Esta función, que se
// programa cada hora, le pregunta a Wompi por los pagos pendientes de más
// de 15 minutos y aplica el resultado con aplicar_pago_wompi (que ignora
// lo que ya estaba aplicado, así que correrla de más no hace daño).
//
// - Pago con transacción conocida (wompi_id): se consulta el endpoint
//   público de Wompi; no necesita llave privada.
// - Pago sin transacción: solo se puede buscar por referencia con la
//   llave PRIVADA. Sin ella, se salta. Si con la llave Wompi no tiene
//   ninguna transacción y pasaron 48 h, se marca como abandonado.
//
// Secretos (Supabase > Edge Functions > Secrets):
//   CRON_SECRET        clave del encabezado x-cron-secret (o PUSH_WEBHOOK_SECRET)
//   WOMPI_PUBLIC_KEY   ya existe (define sandbox o producción)
//   WOMPI_PRIVATE_KEY  opcional: prv_test_... o prv_prod_... (buscar por referencia)
//
// Desplegar: supabase functions deploy conciliar-pagos --no-verify-jwt
// =====================================================================
import { apiWompi, clienteServidor, exigirSecreto, json } from '../_shared/utilidades.ts';

const EN_PARALELO = 5;
// deno-lint-ignore no-explicit-any
type Tx = Record<string, any>;

// De varias transacciones con la misma referencia: la aprobada, o la más reciente
export function elegirTransaccion(lista: Tx[]): Tx | null {
  if (!Array.isArray(lista) || !lista.length) return null;
  const aprobada = lista.find((t) => t?.status === 'APPROVED');
  if (aprobada) return aprobada;
  return [...lista].sort((a, b) => String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? '')))[0];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405);
  const negado = await exigirSecreto(req, 'x-cron-secret', 'CRON_SECRET', 'PUSH_WEBHOOK_SECRET');
  if (negado) return negado;
  const PUBLICA = Deno.env.get('WOMPI_PUBLIC_KEY') ?? '';
  if (!PUBLICA) return json({ error: 'PAGOS_SIN_CONFIGURAR' }, 503);
  const PRIVADA = Deno.env.get('WOMPI_PRIVATE_KEY') ?? '';
  const API = apiWompi(PUBLICA);
  const admin = clienteServidor();

  const { data: pendientes, error } = await admin.rpc('sistema_pagos_por_conciliar', { p_minutos: 15, p_limite: 50 });
  if (error) { console.error('[conciliar] lista', error.message); return json({ error: 'ERROR_INTERNO' }, 500); }

  const r = { revisados: 0, aplicados: 0, siguen_pendientes: 0, abandonados: 0, sin_llave: 0, errores: 0 };
  const consultar = async (url: string, llave?: string): Promise<Tx | null> => {
    const res = await fetch(url, { headers: llave ? { Authorization: `Bearer ${llave}` } : {}, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Wompi respondió ${res.status}`);
    return (await res.json())?.data ?? null;
  };

  async function conciliar(p: { referencia: string; wompi_id: string | null; creado_en: string }) {
    r.revisados++;
    try {
      let tx: Tx | null = null;
      if (p.wompi_id) tx = await consultar(`${API}/transactions/${encodeURIComponent(p.wompi_id)}`);
      else if (PRIVADA) {
        const lista = await consultar(`${API}/transactions?reference=${encodeURIComponent(p.referencia)}`, PRIVADA);
        tx = elegirTransaccion(Array.isArray(lista) ? lista : []);
        if (!tx) {
          // Abrieron el pago y nunca pagaron: después de 48 h se marca (la base revisa las 48 h)
          const { data: marcado } = await admin.rpc('sistema_pago_abandonado', { p_referencia: p.referencia });
          if (marcado === true) r.abandonados++; else r.siguen_pendientes++;
          return;
        }
      } else { r.sin_llave++; return; }

      if (!tx || tx.reference !== p.referencia) { r.errores++; console.error('[conciliar] la transacción no corresponde', p.referencia); return; }
      const { data: res, error: eAp } = await admin.rpc('aplicar_pago_wompi', {
        p_referencia: tx.reference, p_estado: tx.status, p_wompi_id: tx.id,
        p_metodo: tx.payment_method_type ?? null, p_monto: tx.amount_in_cents, p_moneda: tx.currency,
      });
      if (eAp) { r.errores++; console.error('[conciliar] aplicar', p.referencia, eAp.message); return; }
      if (tx.status === 'PENDING') r.siguen_pendientes++; else if (res?.ok) r.aplicados++; else { r.errores++; console.error('[conciliar]', p.referencia, res?.motivo); }
    } catch (e) {
      r.errores++;
      console.error('[conciliar]', p.referencia, (e as Error).message);
    }
  }

  const lista = (pendientes ?? []) as { referencia: string; wompi_id: string | null; creado_en: string }[];
  for (let i = 0; i < lista.length; i += EN_PARALELO) await Promise.all(lista.slice(i, i + EN_PARALELO).map(conciliar));

  await admin.rpc('sistema_anotar_tarea', { p_nombre: 'conciliar-pagos', p_ok: r.errores === 0, p_detalle: r });
  return json({ ok: true, ...r });
});
