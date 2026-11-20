-- =====================================================================
-- ModoParche · Pagar el estado de cuenta con un clic (Wompi)
-- Corre en: Supabase > SQL Editor, después de 20261118120000_cobro_por_resultados.sql.
-- Se puede correr más de una vez.
--
-- El negocio toca «Pagar con Wompi» en su estado de cuenta: la función
-- wompi-checkout crea un pago con el valor exacto y la firma de integridad,
-- se abre el widget oficial de Wompi y, cuando Wompi aprueba (webhook o
-- confirmación), el estado de cuenta queda PAGADO solo, sin revisión manual.
-- =====================================================================

-- Los pagos ahora pueden ser de una liquidación (no solo del plan viejo)
alter table public.pagos add column if not exists liquidacion_id bigint references public.liquidaciones (id) on delete set null;
alter table public.pagos drop constraint if exists pagos_plan_check;
alter table public.pagos add constraint pagos_plan_check check (plan in ('villavo', 'liquidacion'));
alter table public.pagos drop constraint if exists pagos_liquidacion_check;
alter table public.pagos add constraint pagos_liquidacion_check check (plan <> 'liquidacion' or liquidacion_id is not null);
create index if not exists pagos_liquidacion_idx on public.pagos (liquidacion_id);

-- Aplica la respuesta de Wompi. Idempotente: si el evento llega dos veces no
-- se aplica doble. Revisa monto y moneda contra lo que se firmó.
create or replace function public.aplicar_pago_wompi(
  p_referencia text, p_estado text, p_wompi_id text, p_metodo text, p_monto bigint, p_moneda text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.pagos%rowtype;
  l public.liquidaciones%rowtype;
  v_estado text := upper(coalesce(p_estado, ''));
begin
  select * into v from public.pagos where referencia = p_referencia for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'NO_EXISTE');
  end if;
  if v.estado = 'APPROVED' then
    return jsonb_build_object('ok', true, 'ya_aplicado', true);
  end if;
  if v_estado not in ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR') then
    return jsonb_build_object('ok', false, 'motivo', 'ESTADO_DESCONOCIDO');
  end if;
  if p_monto is distinct from v.monto_centavos or upper(coalesce(p_moneda, '')) <> v.moneda then
    update public.pagos set estado = 'ERROR', detalle = 'El monto o la moneda no coinciden', wompi_id = left(p_wompi_id, 80)
    where id = v.id;
    return jsonb_build_object('ok', false, 'motivo', 'MONTO');
  end if;

  update public.pagos
     set estado = case v_estado when 'PENDING' then 'PENDIENTE' else v_estado end,
         wompi_id = left(p_wompi_id, 80),
         metodo = left(p_metodo, 40)
   where id = v.id;

  -- Pago de un estado de cuenta
  if v.plan = 'liquidacion' then
    select * into l from public.liquidaciones where id = v.liquidacion_id for update;
    if v_estado = 'APPROVED' and found then
      update public.liquidaciones
         set estado = 'pagada', pagada_en = now(), pago_ref = left('Wompi ' || coalesce(p_wompi_id, ''), 60),
             reportada_en = coalesce(reportada_en, now()), nota = 'Pagado en línea con Wompi'
       where id = l.id and estado in ('pendiente', 'anulada');
      insert into public.notificaciones (usuario_id, icono, texto)
      values (v.negocio_id, 'i-check', '<b>Pago recibido.</b> Tu estado de cuenta de ' || to_char(l.periodo, 'MM/YYYY')
              || ' (' || l.referencia || ') quedó pagado. ¡Gracias!');
    elsif v_estado in ('DECLINED', 'VOIDED', 'ERROR') then
      insert into public.notificaciones (usuario_id, icono, texto)
      values (v.negocio_id, 'i-alert', '<b>El pago no pasó.</b> No se hizo ningún cobro. Intenta de nuevo con otro medio desde Perfil y plan.');
    end if;
    return jsonb_build_object('ok', true, 'estado', v_estado, 'liquidacion', v.liquidacion_id);
  end if;

  -- Pago del plan mensual (modelo anterior; se conserva por compatibilidad)
  if v_estado = 'APPROVED' then
    update public.negocios
       set plan = v.plan,
           plan_vence = greatest(now(), coalesce(case when plan = v.plan then plan_vence end, now())) + interval '30 days',
           plan_pendiente = null,
           plan_avisado = false
     where id = v.negocio_id;
    insert into public.notificaciones (usuario_id, icono, texto)
    values (v.negocio_id, 'i-check', '<b>Pago aprobado.</b> Ya tienes Parche Villavo: parches sin límite por 30 días.');
  elsif v_estado in ('DECLINED', 'VOIDED', 'ERROR') then
    insert into public.notificaciones (usuario_id, icono, texto)
    values (v.negocio_id, 'i-alert', '<b>El pago no pasó.</b> No se hizo ningún cobro. Puedes intentarlo de nuevo con otro medio.');
  end if;
  return jsonb_build_object('ok', true, 'estado', v_estado);
end $$;
revoke all on function public.aplicar_pago_wompi(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.aplicar_pago_wompi(text, text, text, text, bigint, text) to service_role;

-- El estado de cuenta ya no cuenta "En mora" mientras un pago en línea está en proceso:
-- lo resuelve el webhook. (negocio_en_mora no cambia: solo mira estado y fecha.)
