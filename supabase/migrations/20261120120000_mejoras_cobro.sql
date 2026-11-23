-- =====================================================================
-- ModoParche · Mejoras del cobro por resultados
-- Corre en: Supabase > SQL Editor, después de 20261119120000_pago_liquidaciones_wompi.sql.
-- Se puede correr más de una vez.
--
--  1. Comprobante del estado de cuenta (detalle para imprimir o guardar en PDF)
--  2. Recordatorios automáticos antes y después del vencimiento
--  3. Reclamos: el negocio dice «esta persona no llegó» y el equipo decide
--  7. Cupón de bienvenida (se entrega solo al llegar; la regla vive en el panel)
--  8. Calificar un local solo si tu llegada quedó registrada
--  9. Alertas de llegadas raras para el equipo
-- 10. QR fijo del local (impreso en la entrada)
-- 11. Plazo de 48 horas para corregir llegadas
-- 13. Pagos parciales (abonos)
-- 15. Exportación para el contador (los datos salen de admin_liquidaciones)
-- 19. Aliados destacados
-- 20. Programa de referidos (saldo a favor)
-- =====================================================================

-- =====================================================================
-- 0. COLUMNAS NUEVAS
-- =====================================================================
alter table public.liquidaciones add column if not exists pagado_cop integer not null default 0;
alter table public.liquidaciones add column if not exists descuento_cop integer not null default 0;
alter table public.liquidaciones drop constraint if exists liquidaciones_pagado_check;
alter table public.liquidaciones add constraint liquidaciones_pagado_check check (pagado_cop >= 0 and descuento_cop >= 0);

-- Saldo a favor del negocio (reclamos aprobados sobre meses ya pagados, referidos)
alter table public.negocios add column if not exists credito_cop integer not null default 0;
alter table public.negocios drop constraint if exists negocios_credito_check;
alter table public.negocios add constraint negocios_credito_check check (credito_cop >= 0);
alter table public.negocios add column if not exists codigo_referido text;
alter table public.negocios add column if not exists referido_por uuid references public.negocios (id) on delete set null;
alter table public.negocios add column if not exists referido_premiado boolean not null default false;
create unique index if not exists negocios_codigo_referido_uq on public.negocios (codigo_referido) where codigo_referido is not null;

-- La llegada de una mesa ahora también puede ser con el QR fijo del local
alter table public.mesa_reservas drop constraint if exists mesa_reservas_llegada_metodo_check;
alter table public.mesa_reservas add constraint mesa_reservas_llegada_metodo_check
  check (llegada_metodo is null or llegada_metodo in ('local', 'gps', 'qr'));

-- =====================================================================
-- 11. PLAZO DE 48 HORAS PARA CORREGIR LLEGADAS
-- Pasadas 48 horas (o si el cobro ya entró a un estado de cuenta) la llegada
-- queda firme. Para corregirla después está el reclamo (punto 3).
-- =====================================================================
create or replace function private.llegada_firme_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.checkin, false) and not coalesce(new.checkin, false)
     and coalesce(current_setting('mp.ajuste_equipo', true), '') <> 'si'
     and (old.checkin_en < now() - interval '48 hours'
          or exists (select 1 from public.cobros c where c.parche_id = old.parche_id and c.usuario_id = old.usuario_id
                       and c.liquidacion_id is not null and not c.anulado)) then
    raise exception 'FUERA_DE_PLAZO' using errcode = 'P0001',
      hint = 'Las llegadas se corrigen hasta 48 horas después. Si hubo un error, haz un reclamo desde Cobros.';
  end if;
  return new;
end $$;
drop trigger if exists llegada_firme_parche on public.parche_miembros;
create trigger llegada_firme_parche before update of checkin on public.parche_miembros
  for each row execute function private.llegada_firme_parche();

create or replace function private.llegada_firme_mesa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.estado = 'llego'
     and (new.estado <> 'llego' or coalesce(new.llegaron, new.personas) < coalesce(old.llegaron, old.personas))
     and coalesce(current_setting('mp.ajuste_equipo', true), '') <> 'si'
     and (coalesce(old.llegada_en, old.actualizado_en) < now() - interval '48 hours'
          or exists (select 1 from public.cobros c where c.reserva_id = old.id and c.liquidacion_id is not null and not c.anulado)) then
    raise exception 'FUERA_DE_PLAZO' using errcode = 'P0001',
      hint = 'Las llegadas se corrigen hasta 48 horas después. Si hubo un error, haz un reclamo desde Cobros.';
  end if;
  return new;
end $$;
drop trigger if exists a_llegada_firme_mesa on public.mesa_reservas;
create trigger a_llegada_firme_mesa before update on public.mesa_reservas
  for each row execute function private.llegada_firme_mesa();

-- =====================================================================
-- 3. RECLAMOS DE COBROS
-- =====================================================================
create table if not exists public.reclamos_cobro (
  id          bigint generated always as identity primary key,
  cobro_id    bigint not null unique references public.cobros (id) on delete cascade,
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  motivo      text not null check (char_length(motivo) between 5 and 300),
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  respuesta   text check (respuesta is null or char_length(respuesta) <= 300),
  creado_en   timestamptz not null default now(),
  resuelto_en timestamptz
);
create index if not exists reclamos_cobro_estado_idx on public.reclamos_cobro (estado, creado_en);
alter table public.reclamos_cobro enable row level security;
revoke all on public.reclamos_cobro from anon, authenticated;
grant select on public.reclamos_cobro to authenticated;
drop policy if exists "reclamos: los de mi negocio" on public.reclamos_cobro;
create policy "reclamos: los de mi negocio" on public.reclamos_cobro for select to authenticated
  using (negocio_id = (select auth.uid()));

create or replace function public.reclamar_cobro(p_cobro bigint, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cobros%rowtype; v_motivo text := trim(coalesce(p_motivo, ''));
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into c from public.cobros where id = p_cobro and negocio_id = auth.uid();
  if not found or c.anulado then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese cobro no existe o ya se anuló.'; end if;
  if c.creado_en < now() - interval '15 days' then
    raise exception 'FUERA_DE_PLAZO' using errcode = 'P0001', hint = 'Los cobros se reclaman hasta 15 días después de la llegada.';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'FALTA_MOTIVO' using errcode = 'P0001', hint = 'Cuéntanos en pocas palabras qué pasó.';
  end if;
  insert into public.reclamos_cobro (cobro_id, negocio_id, motivo) values (c.id, c.negocio_id, left(v_motivo, 300));
exception when unique_violation then
  raise exception 'YA_RECLAMADO' using errcode = 'P0001', hint = 'Ya hiciste un reclamo por ese cobro.';
end $$;
revoke all on function public.reclamar_cobro(bigint, text) from public, anon;
grant execute on function public.reclamar_cobro(bigint, text) to authenticated;

create or replace function public.admin_reclamos()
returns table (id bigint, cobro_id bigint, negocio_id uuid, negocio text, motivo text, estado text, respuesta text,
               creado_en timestamptz, tipo text, personas integer, monto_cop integer, cliente text, validado_por text,
               llegada timestamptz, liquidacion_estado text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_staff();
  return query
    select r.id, r.cobro_id, r.negocio_id, n.nombre, r.motivo, r.estado, r.respuesta, r.creado_en,
           c.tipo, c.personas, c.monto_cop, private.nombre_corto(c.usuario_id), c.validado_por, c.creado_en,
           (select l.estado from public.liquidaciones l where l.id = c.liquidacion_id)
    from public.reclamos_cobro r
    join public.cobros c on c.id = r.cobro_id
    join public.negocios n on n.id = r.negocio_id
    order by (r.estado = 'pendiente') desc, r.creado_en desc
    limit 300;
end $$;
revoke all on function public.admin_reclamos() from public, anon;
grant execute on function public.admin_reclamos() to authenticated;

-- Aprobar: el cobro se anula. Si ya estaba en un estado de cuenta pendiente se
-- descuenta de ahí; si ya estaba pagado, queda como saldo a favor del negocio.
create or replace function public.admin_resolver_reclamo(p_id bigint, p_aprobar boolean, p_nota text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reclamos_cobro%rowtype; c public.cobros%rowtype; l public.liquidaciones%rowtype;
begin
  perform private.exigir_admin();
  select * into r from public.reclamos_cobro where id = p_id for update;
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002'; end if;
  if r.estado <> 'pendiente' then raise exception 'YA_RESUELTO' using errcode = 'P0001'; end if;
  select * into c from public.cobros where id = r.cobro_id for update;

  if p_aprobar and not c.anulado then
    update public.cobros set anulado = true, actualizado_en = now() where id = c.id;
    if c.liquidacion_id is not null then
      select * into l from public.liquidaciones where id = c.liquidacion_id for update;
      if l.estado = 'pendiente' then
        update public.liquidaciones
           set total_cop = greatest(0, total_cop - c.monto_cop),
               clientes = greatest(0, clientes - c.personas),
               estado = case when greatest(0, total_cop - c.monto_cop) <= pagado_cop then
                          case when pagado_cop > 0 then 'pagada' else 'sin_cobro' end else estado end,
               pagada_en = case when greatest(0, total_cop - c.monto_cop) <= pagado_cop and pagado_cop > 0 then now() else pagada_en end
         where id = l.id;
        -- Si ya había abonado más de lo que queda, la diferencia queda a favor
        update public.negocios set credito_cop = credito_cop + greatest(0, l.pagado_cop - greatest(0, l.total_cop - c.monto_cop))
         where id = c.negocio_id;
      elsif l.estado = 'pagada' then
        update public.negocios set credito_cop = credito_cop + c.monto_cop where id = c.negocio_id;
      end if;
    end if;
  end if;

  update public.reclamos_cobro
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
         respuesta = nullif(left(trim(coalesce(p_nota, '')), 300), ''), resuelto_en = now()
   where id = r.id;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (r.negocio_id, case when p_aprobar then 'i-check' else 'i-alert' end,
          case when p_aprobar
            then '<b>Reclamo aprobado.</b> Anulamos el cobro de $' || to_char(c.monto_cop, 'FM999G999G999') || ' (código ' || c.codigo || ').'
            else '<b>Reclamo revisado.</b> El cobro ' || c.codigo || ' se mantiene: la llegada quedó validada.' end
          || coalesce(' ' || private.texto_plano(nullif(trim(coalesce(p_nota, '')), '')), ''));
end $$;
revoke all on function public.admin_resolver_reclamo(bigint, boolean, text) from public, anon;
grant execute on function public.admin_resolver_reclamo(bigint, boolean, text) to authenticated;

-- =====================================================================
-- 13 + 20. LIQUIDACIÓN: SALDO A FAVOR Y ABONOS
-- =====================================================================
-- Aplica el saldo a favor del negocio a un estado de cuenta pendiente
create or replace function private.aplicar_credito(p_liq bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.liquidaciones%rowtype; v_cred integer; v_desc integer;
begin
  select * into l from public.liquidaciones where id = p_liq for update;
  if not found or l.estado <> 'pendiente' then return; end if;
  select credito_cop into v_cred from public.negocios where id = l.negocio_id for update;
  v_desc := least(coalesce(v_cred, 0), greatest(0, l.total_cop - l.pagado_cop));
  if v_desc <= 0 then return; end if;
  update public.negocios set credito_cop = credito_cop - v_desc where id = l.negocio_id;
  update public.liquidaciones
     set descuento_cop = descuento_cop + v_desc,
         total_cop = total_cop - v_desc,
         estado = case when total_cop - v_desc <= pagado_cop then case when pagado_cop > 0 then 'pagada' else 'sin_cobro' end else 'pendiente' end,
         pagada_en = case when total_cop - v_desc <= pagado_cop and pagado_cop > 0 then now() else pagada_en end,
         nota = left(coalesce(nota || ' · ', '') || 'Saldo a favor aplicado: $' || to_char(v_desc, 'FM999G999G999'), 300)
   where id = l.id;
end $$;

create or replace function private.generar_liquidaciones()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; g record; v_id bigint; v_total integer;
begin
  for g in
    select c.negocio_id, c.periodo, sum(c.personas)::int clientes, sum(c.monto_cop)::int total
    from public.cobros c
    where c.liquidacion_id is null and not c.anulado and c.periodo < date_trunc('month', now())::date
    group by c.negocio_id, c.periodo
  loop
    insert into public.liquidaciones (negocio_id, periodo, clientes, total_cop, referencia, estado, vence)
    values (g.negocio_id, g.periodo, g.clientes, g.total,
            'MP-' || to_char(g.periodo, 'YYMM') || '-' || upper(left(md5(g.negocio_id::text || g.periodo::text), 6)),
            case when g.total > 0 then 'pendiente' else 'sin_cobro' end,
            (g.periodo + interval '1 month' + interval '15 days')::date)
    on conflict (negocio_id, periodo) do update
      set clientes = public.liquidaciones.clientes + excluded.clientes,
          total_cop = public.liquidaciones.total_cop + excluded.total_cop,
          estado = case when public.liquidaciones.estado in ('sin_cobro', 'pagada') and excluded.total_cop > 0 then 'pendiente'
                        else public.liquidaciones.estado end
    returning id into v_id;
    update public.cobros set liquidacion_id = v_id
     where negocio_id = g.negocio_id and periodo = g.periodo and liquidacion_id is null and not anulado;
    perform private.aplicar_credito(v_id);
    select total_cop - pagado_cop into v_total from public.liquidaciones where id = v_id and estado = 'pendiente';
    if coalesce(v_total, 0) > 0 then
      insert into public.notificaciones (usuario_id, icono, texto)
      values (g.negocio_id, 'i-card', 'Tu estado de cuenta de ' || to_char(g.periodo, 'MM/YYYY') || ' está listo: '
              || g.clientes || ' clientes · $' || to_char(v_total, 'FM999G999G999') || '. Págalo en Perfil y plan > Cobros.');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function private.generar_liquidaciones() from public, anon, authenticated;

-- Con la mitad abonada se dan 15 días más antes de salir del radar
create or replace function public.negocio_en_mora(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.liquidaciones l
    where l.negocio_id = p_negocio and l.estado = 'pendiente'
      and l.vence + case when l.pagado_cop * 2 >= l.total_cop then 15 else 0 end < current_date)
$$;
revoke all on function public.negocio_en_mora(uuid) from public, anon;
grant execute on function public.negocio_en_mora(uuid) to authenticated;

-- Wompi: un pago de liquidación suma al abono; con el saldo cubierto queda pagada
create or replace function public.aplicar_pago_wompi(
  p_referencia text, p_estado text, p_wompi_id text, p_metodo text, p_monto bigint, p_moneda text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.pagos%rowtype;
  l public.liquidaciones%rowtype;
  v_estado text := upper(coalesce(p_estado, ''));
  v_abono integer;
  v_resta integer;
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

  if v.plan = 'liquidacion' then
    select * into l from public.liquidaciones where id = v.liquidacion_id for update;
    if v_estado = 'APPROVED' and found then
      v_abono := (v.monto_centavos / 100)::int;
      v_resta := greatest(0, l.total_cop - l.pagado_cop - v_abono);
      update public.liquidaciones
         set pagado_cop = pagado_cop + v_abono,
             estado = case when v_resta = 0 then 'pagada' else estado end,
             pagada_en = case when v_resta = 0 then now() else pagada_en end,
             pago_ref = left('Wompi ' || coalesce(p_wompi_id, ''), 60),
             reportada_en = coalesce(reportada_en, now()),
             nota = left(case when v_resta = 0 then 'Pagado en línea con Wompi'
                         else 'Abono en línea de $' || to_char(v_abono, 'FM999G999G999') end, 300)
       where id = l.id and estado in ('pendiente', 'anulada');
      -- Si pagó de más (otro abono llegó antes), la diferencia queda a favor
      if l.total_cop - l.pagado_cop - v_abono < 0 then
        update public.negocios set credito_cop = credito_cop + (l.pagado_cop + v_abono - l.total_cop) where id = v.negocio_id;
      end if;
      insert into public.notificaciones (usuario_id, icono, texto)
      values (v.negocio_id, 'i-check',
              case when v_resta = 0
                then '<b>Pago recibido.</b> Tu estado de cuenta de ' || to_char(l.periodo, 'MM/YYYY') || ' (' || l.referencia || ') quedó pagado. ¡Gracias!'
                else '<b>Abono recibido.</b> Pagaste $' || to_char(v_abono, 'FM999G999G999') || ' de tu estado de cuenta de '
                     || to_char(l.periodo, 'MM/YYYY') || '. Te faltan $' || to_char(v_resta, 'FM999G999G999') || '.' end);
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

-- El equipo marca pagada a mano: el abono queda completo
create or replace function public.admin_marcar_liquidacion(p_id bigint, p_estado text, p_nota text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  if p_estado not in ('pendiente', 'pagada', 'anulada') then raise exception 'ESTADO_INVALIDO' using errcode = 'P0001'; end if;
  update public.liquidaciones
     set estado = p_estado, pagada_en = case when p_estado = 'pagada' then now() else null end,
         pagado_cop = case when p_estado = 'pagada' then greatest(pagado_cop, total_cop) else pagado_cop end,
         nota = nullif(left(coalesce(p_nota, ''), 300), '')
   where id = p_id;
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.admin_marcar_liquidacion(bigint, text, text) from public, anon;
grant execute on function public.admin_marcar_liquidacion(bigint, text, text) to authenticated;

-- Admin (y exportación para el contador): ahora con abonos, descuentos y NIT
drop function if exists public.admin_liquidaciones();
create or replace function public.admin_liquidaciones()
returns table (id bigint, negocio_id uuid, negocio text, nit text, plan text, periodo date, clientes integer, total_cop integer,
               pagado_cop integer, descuento_cop integer, referencia text, estado text, vence date, pago_ref text,
               reportada_en timestamptz, pagada_en timestamptz, en_mora boolean, nota text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_staff();
  return query
    select l.id, l.negocio_id, n.nombre, n.nit::text, n.plan, l.periodo, l.clientes, l.total_cop, l.pagado_cop, l.descuento_cop,
           l.referencia, l.estado, l.vence, l.pago_ref, l.reportada_en, l.pagada_en,
           (l.estado = 'pendiente' and l.vence < current_date), l.nota
    from public.liquidaciones l join public.negocios n on n.id = l.negocio_id
    order by (l.estado = 'pendiente') desc, l.vence asc, l.periodo desc
    limit 1000;
end $$;
revoke all on function public.admin_liquidaciones() from public, anon;
grant execute on function public.admin_liquidaciones() to authenticated;

-- =====================================================================
-- 1 + 6. LO QUE VE EL NEGOCIO (con abonos, saldo a favor y reclamos)
-- =====================================================================
create or replace function public.mi_cuenta_cobros()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n public.negocios%rowtype; v_mes date := date_trunc('month', now())::date;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into n from public.negocios where id = uid;
  if not found then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'plan', n.plan,
    'tarifa_cliente', private.tarifa_cliente(n.plan),
    'comision_pct', private.comision_pct(n.plan),
    'en_mora', public.negocio_en_mora(uid),
    'credito', n.credito_cop,
    'mes', jsonb_build_object(
      'periodo', v_mes,
      'clientes', coalesce((select sum(personas) from public.cobros where negocio_id = uid and periodo = v_mes and not anulado), 0),
      'total', coalesce((select sum(monto_cop) from public.cobros where negocio_id = uid and periodo = v_mes and not anulado), 0),
      'detalle', coalesce((
        select jsonb_agg(x order by x.creado_en desc) from (
          select c.id, c.tipo, c.personas, c.base_cop, c.monto_cop, c.validado_por, c.codigo, c.creado_en,
                 private.nombre_corto(c.usuario_id) cliente,
                 coalesce((select pa.titulo from public.parches pa where pa.id = c.parche_id),
                          (select mp.titulo from public.mesa_reservas mr join public.mesa_promos mp on mp.id = mr.promo_id where mr.id = c.reserva_id), '') titulo,
                 (select r.estado from public.reclamos_cobro r where r.cobro_id = c.id) reclamo,
                 (c.creado_en >= now() - interval '15 days') reclamable
          from public.cobros c where c.negocio_id = uid and c.periodo = v_mes and not c.anulado
          order by c.creado_en desc limit 200) x), '[]'::jsonb)
    ),
    'reclamos', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'codigo', c.codigo, 'monto', c.monto_cop, 'estado', r.estado,
               'motivo', r.motivo, 'respuesta', r.respuesta, 'creado_en', r.creado_en) order by r.creado_en desc)
      from public.reclamos_cobro r join public.cobros c on c.id = r.cobro_id
      where r.negocio_id = uid and r.creado_en > now() - interval '90 days'), '[]'::jsonb),
    'liquidaciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'periodo', l.periodo, 'clientes', l.clientes, 'total', l.total_cop,
               'pagado', l.pagado_cop, 'descuento', l.descuento_cop,
               'referencia', l.referencia, 'estado', l.estado, 'vence', l.vence, 'pago_ref', l.pago_ref,
               'reportada_en', l.reportada_en, 'pagada_en', l.pagada_en) order by l.periodo desc)
      from public.liquidaciones l where l.negocio_id = uid), '[]'::jsonb)
  );
end $$;
revoke all on function public.mi_cuenta_cobros() from public, anon;
grant execute on function public.mi_cuenta_cobros() to authenticated;

-- Comprobante: todo lo de un estado de cuenta, para imprimir o guardar en PDF
create or replace function public.mi_liquidacion_detalle(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.liquidaciones%rowtype; n public.negocios%rowtype;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into l from public.liquidaciones where id = p_id and (negocio_id = auth.uid() or public.soy_admin());
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002'; end if;
  select * into n from public.negocios where id = l.negocio_id;
  return jsonb_build_object(
    'id', l.id, 'periodo', l.periodo, 'clientes', l.clientes, 'total', l.total_cop, 'pagado', l.pagado_cop,
    'descuento', l.descuento_cop, 'referencia', l.referencia, 'estado', l.estado, 'vence', l.vence,
    'pago_ref', l.pago_ref, 'pagada_en', l.pagada_en, 'creada_en', l.creada_en,
    'negocio', jsonb_build_object('nombre', n.nombre, 'nit', n.nit, 'plan', n.plan),
    'cobros', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', c.creado_en, 'tipo', c.tipo, 'personas', c.personas, 'base', c.base_cop,
               'monto', c.monto_cop, 'codigo', c.codigo, 'validado_por', c.validado_por,
               'titulo', coalesce((select pa.titulo from public.parches pa where pa.id = c.parche_id),
                                  (select mp.titulo from public.mesa_reservas mr join public.mesa_promos mp on mp.id = mr.promo_id where mr.id = c.reserva_id), ''))
             order by c.creado_en)
      from public.cobros c where c.liquidacion_id = l.id and not c.anulado), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', p.creado_en, 'monto', p.monto_centavos / 100, 'metodo', p.metodo, 'wompi_id', p.wompi_id) order by p.creado_en)
      from public.pagos p where p.liquidacion_id = l.id and p.estado = 'APPROVED'), '[]'::jsonb)
  );
end $$;
revoke all on function public.mi_liquidacion_detalle(bigint) from public, anon;
grant execute on function public.mi_liquidacion_detalle(bigint) to authenticated;

-- =====================================================================
-- 2. RECORDATORIOS AUTOMÁTICOS (todos los días, 9:00 a. m. de Colombia)
-- =====================================================================
create or replace function private.recordar_liquidaciones()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; l record; v_saldo text;
begin
  for l in
    select * from public.liquidaciones
    where estado = 'pendiente' and total_cop > pagado_cop
      and vence - current_date in (5, 0, -1, -8)
  loop
    v_saldo := '$' || to_char(l.total_cop - l.pagado_cop, 'FM999G999G999');
    insert into public.notificaciones (usuario_id, icono, texto)
    values (l.negocio_id, case when l.vence < current_date then 'i-alert' else 'i-card' end,
      case l.vence - current_date
        when 5 then 'Tu estado de cuenta de ' || to_char(l.periodo, 'MM/YYYY') || ' (' || v_saldo || ') vence en 5 días. Págalo con un clic en Perfil y plan > Cobros.'
        when 0 then '<b>Hoy vence</b> tu estado de cuenta de ' || to_char(l.periodo, 'MM/YYYY') || ' (' || v_saldo || '). Págalo hoy para que tus parches sigan en el radar.'
        else '<b>Tu estado de cuenta venció.</b> Tus parches salieron del radar hasta que pagues ' || v_saldo
             || '. Puedes abonar la mitad y tienes 15 días más.' end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function private.recordar_liquidaciones() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'modo-parche-recordar-cobros';
  perform cron.schedule('modo-parche-recordar-cobros', '0 14 * * *', 'select private.recordar_liquidaciones()');
exception when others then
  raise notice 'pg_cron no disponible (%). Los recordatorios no saldrán solos.', sqlerrm;
end $$;

-- =====================================================================
-- 9. ALERTAS PARA EL EQUIPO: negocios con llegadas raras (últimos 30 días)
-- =====================================================================
create or replace function public.admin_anomalias()
returns table (negocio_id uuid, negocio text, esperados integer, llegaron integer, ratio numeric,
               anulados integer, cobros integer, reclamos integer, motivo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_staff();
  return query
  with base as (
    select n.id, n.nombre,
      -- Reservas de mesa que ya pasaron y personas confirmadas en parches del local
      (coalesce((select sum(mr.personas) from public.mesa_reservas mr
                 where mr.negocio_id = n.id and mr.llegada between now() - interval '30 days' and now() - interval '4 hours'
                   and mr.estado in ('pendiente', 'confirmada', 'llego', 'no_llego')), 0)
       + coalesce((select count(*) from public.parche_miembros m join public.parches p on p.id = m.parche_id
                   where p.creador_id = n.id and coalesce(p.aliado, false) and m.usuario_id <> n.id
                     and p.inicio between now() - interval '30 days' and now() - interval '6 hours'), 0))::int esperados,
      coalesce((select sum(c.personas) from public.cobros c where c.negocio_id = n.id and not c.anulado
                  and c.creado_en > now() - interval '30 days'), 0)::int llegaron,
      (select count(*) from public.cobros c where c.negocio_id = n.id and c.anulado and c.creado_en > now() - interval '30 days')::int anulados,
      (select count(*) from public.cobros c where c.negocio_id = n.id and c.creado_en > now() - interval '30 days')::int cobros,
      (select count(*) from public.reclamos_cobro r where r.negocio_id = n.id and r.creado_en > now() - interval '30 days')::int reclamos
    from public.negocios n
  )
  select b.id, b.nombre, b.esperados, b.llegaron,
         case when b.esperados > 0 then round(b.llegaron::numeric / b.esperados, 2) end,
         b.anulados, b.cobros, b.reclamos,
         concat_ws(' · ',
           case when b.esperados >= 5 and b.llegaron::numeric / b.esperados < 0.2
                then 'Casi nadie llega: ' || b.llegaron || ' de ' || b.esperados end,
           case when b.cobros >= 3 and b.anulados::numeric / b.cobros >= 0.3
                then b.anulados || ' llegadas desmarcadas de ' || b.cobros end,
           case when b.reclamos >= 3 then b.reclamos || ' reclamos en 30 días' end)
  from base b
  where (b.esperados >= 5 and b.llegaron::numeric / b.esperados < 0.2)
     or (b.cobros >= 3 and b.anulados::numeric / b.cobros >= 0.3)
     or b.reclamos >= 3
  order by b.esperados desc
  limit 100;
end $$;
revoke all on function public.admin_anomalias() from public, anon;
grant execute on function public.admin_anomalias() to authenticated;

-- =====================================================================
-- 10. QR FIJO DEL LOCAL (se imprime y se pega en la entrada)
-- =====================================================================
create table if not exists public.negocio_qr (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  secreto    text not null default replace(gen_random_uuid()::text, '-', ''),
  creado_en  timestamptz not null default now()
);
alter table public.negocio_qr enable row level security;
revoke all on public.negocio_qr from anon, authenticated;

create or replace function public.mi_qr_local(p_nuevo boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_secreto text;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not exists (select 1 from public.negocios where id = auth.uid()) then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001'; end if;
  if p_nuevo then delete from public.negocio_qr where negocio_id = auth.uid(); end if;
  insert into public.negocio_qr (negocio_id) values (auth.uid()) on conflict (negocio_id) do nothing;
  select secreto into v_secreto from public.negocio_qr where negocio_id = auth.uid();
  return jsonb_build_object('negocio', auth.uid(), 'clave', v_secreto);
end $$;
revoke all on function public.mi_qr_local(boolean) from public, anon;
grant execute on function public.mi_qr_local(boolean) to authenticated;

-- El cliente escanea el QR del local: se marca su reserva de hoy o su parche de hoy.
-- Si manda ubicación y está a más de 500 m, no vale (alguien compartió la foto del QR).
create or replace function public.llegue_por_qr_local(p_negocio uuid, p_clave text,
  p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  n public.negocios%rowtype;
  r public.mesa_reservas%rowtype;
  p public.parches%rowtype;
  v_dist double precision;
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into n from public.negocios where id = p_negocio;
  if not found or not exists (select 1 from public.negocio_qr q where q.negocio_id = p_negocio and q.secreto = trim(coalesce(p_clave, ''))) then
    raise exception 'QR_INVALIDO' using errcode = 'P0001', hint = 'Ese QR ya no es válido. Pídele al local el código nuevo.';
  end if;
  if v_uid = p_negocio then raise exception 'ERES_EL_LOCAL' using errcode = 'P0001', hint = 'Este QR lo escanean tus clientes.'; end if;
  if p_lat is not null and p_lng is not null and n.lat is not null and n.lng is not null then
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - n.lat) / 2), 2)
      + cos(radians(n.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - n.lng) / 2), 2)));
    if v_dist > 500 then
      raise exception 'LEJOS' using errcode = 'P0001', hint = format('Estás a %s m del local. El QR se escanea en la entrada.', round(v_dist)::int);
    end if;
  end if;

  -- 1) Una reserva de mesa de hoy
  select * into r from public.mesa_reservas
   where usuario_id = v_uid and negocio_id = p_negocio and estado in ('pendiente', 'confirmada', 'llego')
     and now() between llegada - interval '60 minutes' and llegada + interval '4 hours'
   order by (estado = 'llego'), abs(extract(epoch from (llegada - now()))) limit 1;
  if found then
    if r.estado <> 'llego' then
      update public.mesa_reservas set estado = 'llego', llegada_metodo = 'qr' where id = r.id;
    end if;
    return jsonb_build_object('ok', true, 'tipo', 'mesa', 'nuevo', r.estado <> 'llego', 'local', n.nombre);
  end if;

  -- 2) Un parche del local de hoy al que se unió
  select pa.* into p from public.parches pa
    join public.parche_miembros m on m.parche_id = pa.id and m.usuario_id = v_uid
   where pa.creador_id = p_negocio
     and now() between pa.inicio - interval '90 minutes' and pa.inicio + interval '6 hours'
   order by m.checkin, abs(extract(epoch from (pa.inicio - now()))) limit 1;
  if found then
    return jsonb_build_object('ok', true, 'tipo', 'parche', 'parche', p.id, 'titulo', p.titulo, 'local', n.nombre,
                              'nuevo', private.marcar_llegada(p.id, v_uid, 'qr'));
  end if;

  raise exception 'NADA_HOY' using errcode = 'P0001',
    hint = 'No tienes una reserva ni un parche en este local para esta hora.';
end $$;
revoke all on function public.llegue_por_qr_local(uuid, text, double precision, double precision) from public, anon;
grant execute on function public.llegue_por_qr_local(uuid, text, double precision, double precision) to authenticated;

-- =====================================================================
-- 8. CALIFICAR UN LOCAL: solo con una llegada validada (un voto por visita)
-- =====================================================================
create table if not exists public.resenas_negocio (
  id          bigint generated always as identity primary key,
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  autor_id    uuid not null references auth.users (id) on delete cascade,
  cobro_id    bigint not null unique references public.cobros (id) on delete cascade,
  estrellas   integer not null check (estrellas between 1 and 5),
  texto       text not null default '' check (char_length(texto) <= 280),
  creado_en   timestamptz not null default now()
);
create index if not exists resenas_negocio_idx on public.resenas_negocio (negocio_id, creado_en desc);
alter table public.resenas_negocio enable row level security;
revoke all on public.resenas_negocio from anon, authenticated;

-- Locales donde llegaste en los últimos 14 días y aún no calificaste
create or replace function public.locales_por_calificar()
returns table (cobro_id bigint, negocio_id uuid, negocio text, titulo text, fecha timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.negocio_id) c.id, c.negocio_id, n.nombre,
         coalesce((select pa.titulo from public.parches pa where pa.id = c.parche_id),
                  (select mp.titulo from public.mesa_reservas mr join public.mesa_promos mp on mp.id = mr.promo_id where mr.id = c.reserva_id), ''),
         c.creado_en
  from public.cobros c join public.negocios n on n.id = c.negocio_id
  where c.usuario_id = auth.uid() and not c.anulado and c.creado_en > now() - interval '14 days'
    and not exists (select 1 from public.resenas_negocio r where r.cobro_id = c.id)
  order by c.negocio_id, c.creado_en desc
$$;
revoke all on function public.locales_por_calificar() from public, anon;
grant execute on function public.locales_por_calificar() to authenticated;

create or replace function public.calificar_local(p_cobro bigint, p_estrellas integer, p_texto text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cobros%rowtype;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into c from public.cobros where id = p_cobro and usuario_id = auth.uid() and not anulado;
  if not found then
    raise exception 'SIN_LLEGADA' using errcode = 'P0001', hint = 'Solo calificas un local si tu llegada quedó registrada.';
  end if;
  if c.creado_en < now() - interval '14 days' then
    raise exception 'FUERA_DE_TIEMPO' using errcode = 'P0001', hint = 'Pasaron más de 14 días desde tu visita.';
  end if;
  if p_estrellas is null or p_estrellas not between 1 and 5 then
    raise exception 'ESTRELLAS' using errcode = 'P0001', hint = 'Elige de 1 a 5 estrellas.';
  end if;
  insert into public.resenas_negocio (negocio_id, autor_id, cobro_id, estrellas, texto)
  values (c.negocio_id, auth.uid(), c.id, p_estrellas, left(trim(coalesce(p_texto, '')), 280));
exception when unique_violation then
  raise exception 'YA_CALIFICASTE' using errcode = 'P0001', hint = 'Ya calificaste esta visita.';
end $$;
revoke all on function public.calificar_local(bigint, integer, text) from public, anon;
grant execute on function public.calificar_local(bigint, integer, text) to authenticated;

-- Reseñas que ve el local (solo el nombre corto de quien escribe)
create or replace function public.mis_resenas_local()
returns table (id bigint, autor text, estrellas integer, texto text, titulo text, creado_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, private.nombre_corto(r.autor_id), r.estrellas, r.texto,
         coalesce((select pa.titulo from public.parches pa join public.cobros c on c.parche_id = pa.id where c.id = r.cobro_id),
                  (select mp.titulo from public.cobros c join public.mesa_reservas mr on mr.id = c.reserva_id
                     join public.mesa_promos mp on mp.id = mr.promo_id where c.id = r.cobro_id), ''),
         r.creado_en
  from public.resenas_negocio r
  where r.negocio_id = auth.uid()
  order by r.creado_en desc
  limit 200
$$;
revoke all on function public.mis_resenas_local() from public, anon;
grant execute on function public.mis_resenas_local() to authenticated;

-- =====================================================================
-- 19. ALIADOS DESTACADOS
-- Pagan a tiempo (nada vencido sin pagar en 90 días), tienen buena nota
-- (3,5 o más si ya los calificaron) y más llegadas reales en 30 días.
-- =====================================================================
create or replace function public.aliados_destacados()
returns table (negocio_id uuid, llegadas integer, estrellas numeric)
language sql stable security definer set search_path = '' as $$
  select n.id,
         (select coalesce(sum(c.personas), 0) from public.cobros c where c.negocio_id = n.id and not c.anulado and c.creado_en > now() - interval '30 days')::int,
         (select round(avg(r.estrellas), 1) from public.resenas_negocio r where r.negocio_id = n.id)
  from public.negocios n
  where n.plan in ('villavo', 'sedes')
    and not public.negocio_en_mora(n.id)
    and not exists (select 1 from public.liquidaciones l where l.negocio_id = n.id and l.periodo > now() - interval '120 days'
                      and ((l.estado = 'pendiente' and l.vence < current_date) or (l.estado = 'pagada' and l.pagada_en::date > l.vence)))
    and coalesce((select avg(r.estrellas) from public.resenas_negocio r where r.negocio_id = n.id), 5) >= 3.5
    and (select coalesce(sum(c.personas), 0) from public.cobros c where c.negocio_id = n.id and not c.anulado and c.creado_en > now() - interval '30 days') >= 3
  order by 2 desc
  limit 10
$$;
revoke all on function public.aliados_destacados() from public, anon;
grant execute on function public.aliados_destacados() to authenticated;

-- =====================================================================
-- 20. REFERIDOS: un local invita a otro. Cuando el invitado paga su primer
-- estado de cuenta, los dos reciben $10.000 de saldo a favor.
-- =====================================================================
create or replace function public.mi_referidos()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype; v_cod text;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into n from public.negocios where id = auth.uid();
  if not found then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001'; end if;
  v_cod := n.codigo_referido;
  while v_cod is null loop
    begin
      v_cod := upper(left(regexp_replace(private.texto_plano(coalesce(n.nombre, 'LOCAL')), '[^A-Za-z]', '', 'g') || 'LOCAL', 5))
               || '-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 4));
      update public.negocios set codigo_referido = v_cod where id = n.id;
    exception when unique_violation then v_cod := null;
    end;
  end loop;
  return jsonb_build_object(
    'codigo', v_cod,
    'credito', n.credito_cop,
    'premio', 10000,
    'invitados', (select count(*) from public.negocios x where x.referido_por = n.id),
    'premiados', (select count(*) from public.negocios x where x.referido_por = n.id and x.referido_premiado),
    'me_invito', (select x.nombre from public.negocios x where x.id = n.referido_por));
end $$;
revoke all on function public.mi_referidos() from public, anon;
grant execute on function public.mi_referidos() to authenticated;

-- El local nuevo usa el código de quien lo invitó (una vez, en su primer mes)
create or replace function public.usar_codigo_referido(p_codigo text)
returns text language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype; v_padrino public.negocios%rowtype;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into n from public.negocios where id = auth.uid() for update;
  if not found then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001'; end if;
  if n.referido_por is not null then raise exception 'YA_TIENES' using errcode = 'P0001', hint = 'Ya usaste un código de invitación.'; end if;
  if n.creado_en < now() - interval '30 days' or exists (select 1 from public.liquidaciones l where l.negocio_id = n.id and l.estado = 'pagada') then
    raise exception 'FUERA_DE_TIEMPO' using errcode = 'P0001', hint = 'El código se usa en el primer mes de la cuenta.';
  end if;
  select * into v_padrino from public.negocios where codigo_referido = upper(trim(coalesce(p_codigo, '')));
  if not found then raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', hint = 'Ese código no existe.'; end if;
  if v_padrino.id = n.id then raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', hint = 'No puedes usar tu propio código.'; end if;
  if nullif(trim(v_padrino.nit), '') is not null and trim(v_padrino.nit) = trim(n.nit) then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', hint = 'Ese código es de tu misma empresa.';
  end if;
  update public.negocios set referido_por = v_padrino.id where id = n.id;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (v_padrino.id, 'i-users', '<b>' || private.texto_plano(n.nombre) || '</b> se unió con tu código. Cuando pague su primer estado de cuenta, los dos ganan $10.000.');
  return v_padrino.nombre;
end $$;
revoke all on function public.usar_codigo_referido(text) from public, anon;
grant execute on function public.usar_codigo_referido(text) to authenticated;

-- Premio al pagar el primer estado de cuenta
create or replace function private.premiar_referido()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype;
begin
  if new.estado <> 'pagada' or old.estado = 'pagada' or new.total_cop <= 0 then return new; end if;
  select * into n from public.negocios where id = new.negocio_id for update;
  if n.referido_por is null or n.referido_premiado then return new; end if;
  update public.negocios set referido_premiado = true, credito_cop = credito_cop + 10000 where id = n.id;
  update public.negocios set credito_cop = credito_cop + 10000 where id = n.referido_por;
  insert into public.notificaciones (usuario_id, icono, texto) values
    (n.id, 'i-gift', '<b>Ganaste $10.000</b> de saldo a favor por unirte con invitación. Se descuentan de tu próximo estado de cuenta.'),
    (n.referido_por, 'i-gift', '<b>Ganaste $10.000</b> de saldo a favor: ' || private.texto_plano(n.nombre) || ' pagó su primer estado de cuenta.');
  return new;
end $$;
drop trigger if exists premiar_referido on public.liquidaciones;
create trigger premiar_referido after update of estado on public.liquidaciones
  for each row execute function private.premiar_referido();

revoke all on all functions in schema private from public, anon, authenticated;
