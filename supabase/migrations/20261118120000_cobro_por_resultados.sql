-- =====================================================================
-- ModoParche · Cobro por resultados (sin mensualidades)
-- Corre en: Supabase > SQL Editor, después de las migraciones anteriores.
-- Se puede correr más de una vez.
--
-- Planes:
--   basico  · gratis · 2 parches al mes · 0% y $0 por cliente
--   villavo · 10% en paquetes / $2.500 por cliente en mesa · ilimitado
--   sedes   ·  8% en paquetes / $2.000 por cliente en mesa · ilimitado
--
-- Cada parche de un negocio es de uno de dos tipos:
--   paquete · combo, cata, taller, boleta o cover con precio. El cliente lo
--             aparta en la app y PAGA EN EL LOCAL. El local paga la comisión
--             por cada paquete redimido (llegada validada).
--   mesa    · consumo libre. El local paga la tarifa fija por cada persona
--             que llegó y se sentó.
-- También las reservas del Modo Mesa cobran la tarifa fija por persona.
--
-- Llegada validada (doble validación): el local escanea/marca al cliente,
-- o el cliente marca su llegada con el QR del parche o con el GPS. Si
-- nadie llegó, el cobro es $0. Cada cobro queda con hora, método y código.
--
-- Cada mes se arma la liquidación de cada negocio. El negocio paga con el
-- datáfono virtual de Wompi usando la referencia, y el equipo la marca como
-- pagada. Si pasa la fecha límite sin pagar, sus parches dejan de salir en
-- el radar hasta que se ponga al día.
-- =====================================================================

create schema if not exists private;

-- =====================================================================
-- 1. TIPO DE PARCHE Y PRECIO DEL PAQUETE
-- =====================================================================
alter table public.parches add column if not exists modalidad text not null default 'mesa';
alter table public.parches add column if not exists precio_paquete integer;
alter table public.parches drop constraint if exists parches_modalidad_check;
alter table public.parches add constraint parches_modalidad_check check (modalidad in ('mesa', 'paquete'));
alter table public.parches drop constraint if exists parches_precio_paquete_check;
alter table public.parches add constraint parches_precio_paquete_check check (
  (modalidad = 'mesa' and precio_paquete is null)
  or (modalidad = 'paquete' and precio_paquete between 1000 and 5000000)
);
grant insert (modalidad, precio_paquete) on public.parches to authenticated;
grant update (modalidad, precio_paquete) on public.parches to authenticated;

-- =====================================================================
-- 2. PLANES SIN MENSUALIDAD
-- =====================================================================
-- Ya no hay plan pagado que venza
update public.negocios set plan_vence = null, plan_pendiente = null where plan_vence is not null or plan_pendiente is not null;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'modo-parche-vencer-planes';
exception when others then null;
end $$;

-- Límite del plan básico y datos del negocio en sus parches.
-- Los parches de personas siempre son de consumo libre y sin precio.
create or replace function private.parche_de_negocio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n public.negocios%rowtype;
  v_mes int;
begin
  select * into n from public.negocios where id = new.creador_id;
  if not found then
    new.aliado := false;
    new.verificado := false;
    new.modalidad := 'mesa';
    new.precio_paquete := null;
    return new;
  end if;

  if tg_op = 'INSERT' and n.plan = 'basico' then
    select count(*) into v_mes from public.parches
    where creador_id = n.id and creado_en >= date_trunc('month', now());
    if v_mes >= 2 then
      raise exception 'LIMITE_PLAN' using errcode = 'P0001',
        hint = 'Parche básico incluye 2 parches al mes. Con Parche Villavo publicas sin límite y solo pagas por cliente que llega.';
    end if;
  end if;

  if new.modalidad = 'mesa' then new.precio_paquete := null; end if;
  new.aliado := true;
  new.verificado := n.verificado;
  new.creador_nombre := n.nombre;
  return new;
end $$;

-- El negocio cambia de plan cuando quiera: no hay pagos por adelantado
create or replace function public.elegir_plan(p_plan text, p_sedes integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if p_plan not in ('basico', 'villavo', 'sedes') then
    raise exception 'PLAN_INVALIDO' using errcode = 'P0001', hint = 'Ese plan no existe.';
  end if;
  update public.negocios
     set plan = p_plan, plan_vence = null, plan_pendiente = null,
         sedes = case when p_plan = 'sedes' then greatest(2, least(50, coalesce(p_sedes, sedes, 2))) else 1 end
   where id = auth.uid();
  if not found then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001', hint = 'Esta cuenta no es de negocio.'; end if;
end $$;
revoke all on function public.elegir_plan(text, integer) from public, anon;
grant execute on function public.elegir_plan(text, integer) to authenticated;

-- Tarifas por plan
create or replace function private.tarifa_cliente(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan when 'villavo' then 2500 when 'sedes' then 2000 else 0 end
$$;
create or replace function private.comision_pct(p_plan text)
returns numeric language sql immutable set search_path = '' as $$
  select case p_plan when 'villavo' then 10 when 'sedes' then 8 else 0 end
$$;

-- =====================================================================
-- 3. MODO MESA: CUÁNTOS LLEGARON Y LLEGADA DEL CLIENTE POR GPS
-- =====================================================================
alter table public.mesa_reservas add column if not exists llegaron integer;
alter table public.mesa_reservas add column if not exists llegada_metodo text;
alter table public.mesa_reservas add column if not exists llegada_en timestamptz;
alter table public.mesa_reservas drop constraint if exists mesa_reservas_llegaron_check;
alter table public.mesa_reservas add constraint mesa_reservas_llegaron_check check (llegaron is null or llegaron between 1 and 30);
alter table public.mesa_reservas drop constraint if exists mesa_reservas_llegada_metodo_check;
alter table public.mesa_reservas add constraint mesa_reservas_llegada_metodo_check check (llegada_metodo is null or llegada_metodo in ('local', 'gps'));

create or replace function private.mesa_llegada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'llego' then
    new.llegaron := least(coalesce(new.llegaron, new.personas), new.personas);
    new.llegada_en := coalesce(new.llegada_en, now());
    new.llegada_metodo := coalesce(new.llegada_metodo, 'local');
  elsif old.estado = 'llego' then
    new.llegaron := null; new.llegada_en := null; new.llegada_metodo := null;
  end if;
  return new;
end $$;
drop trigger if exists mesa_llegada on public.mesa_reservas;
create trigger mesa_llegada before update on public.mesa_reservas for each row execute function private.mesa_llegada();

-- El cliente marca su llegada al local con el GPS (a menos de 200 m y cerca de la hora)
create or replace function public.mesa_llegue(p_reserva uuid, p_lat double precision, p_lng double precision, p_precision double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.mesa_reservas%rowtype;
  n public.negocios%rowtype;
  v_dist double precision;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into r from public.mesa_reservas where id = p_reserva and usuario_id = auth.uid();
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa reserva no existe.'; end if;
  if r.estado = 'llego' then return jsonb_build_object('ok', true, 'nuevo', false); end if;
  if r.estado not in ('pendiente', 'confirmada') then
    raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'Esa reserva ya no está activa.';
  end if;
  if now() < r.llegada - interval '60 minutes' or now() > r.llegada + interval '4 hours' then
    raise exception 'FUERA_DE_HORA' using errcode = 'P0001', hint = 'Puedes marcar tu llegada desde una hora antes de la reserva.';
  end if;
  select * into n from public.negocios where id = r.negocio_id;
  if n.lat is null or n.lng is null then
    raise exception 'SIN_UBICACION_LOCAL' using errcode = 'P0001', hint = 'El local no tiene ubicación en el mapa. Pide que te escaneen el código en la entrada.';
  end if;
  if p_lat is null or p_lng is null or coalesce(p_precision, 9999) > 200 then
    raise exception 'GPS_IMPRECISO' using errcode = 'P0001', hint = 'La señal del GPS está débil. Sal a un lugar abierto o muestra tu código en la entrada.';
  end if;
  v_dist := 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat - n.lat) / 2), 2)
    + cos(radians(n.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - n.lng) / 2), 2)));
  if v_dist > 200 then
    raise exception 'LEJOS' using errcode = 'P0001', hint = format('Estás a %s m del local. Acércate a menos de 200 m.', round(v_dist)::int);
  end if;
  update public.mesa_reservas set estado = 'llego', llegada_metodo = 'gps' where id = r.id;
  return jsonb_build_object('ok', true, 'nuevo', true);
end $$;
revoke all on function public.mesa_llegue(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.mesa_llegue(uuid, double precision, double precision, double precision) to authenticated;

-- El local corrige cuántas personas de la reserva llegaron de verdad
create or replace function public.negocio_mesa_llegaron(p_id uuid, p_cuantos integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.mesa_reservas set llegaron = greatest(1, least(p_cuantos, personas))
   where id = p_id and negocio_id = auth.uid() and estado = 'llego';
  if not found then raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'Primero marca que la mesa llegó.'; end if;
end $$;
revoke all on function public.negocio_mesa_llegaron(uuid, integer) from public, anon;
grant execute on function public.negocio_mesa_llegaron(uuid, integer) to authenticated;

-- =====================================================================
-- 4. COBROS: UNO POR CADA LLEGADA VALIDADA
-- =====================================================================
create table if not exists public.cobros (
  id              bigint generated always as identity primary key,
  negocio_id      uuid not null references public.negocios (id) on delete cascade,
  tipo            text not null check (tipo in ('paquete', 'mesa', 'reserva')),
  parche_id       uuid references public.parches (id) on delete set null,
  reserva_id      uuid references public.mesa_reservas (id) on delete set null,
  usuario_id      uuid references auth.users (id) on delete set null,
  personas        integer not null default 1 check (personas between 1 and 30),
  base_cop        integer,                 -- precio del paquete (solo tipo paquete)
  monto_cop       integer not null default 0 check (monto_cop >= 0),
  plan            text not null,
  validado_por    text not null,           -- qr · gps · organizador · local
  codigo          text not null,           -- código de verificación que ve el local
  periodo         date not null default date_trunc('month', now())::date,
  liquidacion_id  bigint,
  anulado         boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create unique index if not exists cobros_parche_usuario_uq on public.cobros (parche_id, usuario_id) where parche_id is not null;
create unique index if not exists cobros_reserva_uq on public.cobros (reserva_id) where reserva_id is not null;
create index if not exists cobros_negocio_periodo_idx on public.cobros (negocio_id, periodo);
alter table public.cobros enable row level security;
revoke all on public.cobros from anon, authenticated;
grant select on public.cobros to authenticated;
drop policy if exists "cobros: los de mi negocio" on public.cobros;
create policy "cobros: los de mi negocio" on public.cobros for select to authenticated using (negocio_id = (select auth.uid()));

-- Llegada a un parche de negocio
create or replace function private.cobro_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.parches%rowtype;
  n public.negocios%rowtype;
  v_monto integer;
begin
  select * into p from public.parches where id = new.parche_id;
  if not found or not coalesce(p.aliado, false) or p.creador_id is null or new.usuario_id = p.creador_id then return new; end if;
  select * into n from public.negocios where id = p.creador_id;
  if not found then return new; end if;

  if coalesce(new.checkin, false) and not coalesce(old.checkin, false) then
    v_monto := case when p.modalidad = 'paquete'
      then round(coalesce(p.precio_paquete, 0) * private.comision_pct(n.plan) / 100.0)::int
      else private.tarifa_cliente(n.plan) end;
    insert into public.cobros (negocio_id, tipo, parche_id, usuario_id, base_cop, monto_cop, plan, validado_por, codigo)
    values (n.id, p.modalidad, p.id, new.usuario_id,
            case when p.modalidad = 'paquete' then p.precio_paquete end, v_monto, n.plan,
            coalesce(new.checkin_metodo, 'local'),
            upper(left(encode(sha256(convert_to(p.id::text || ':' || new.usuario_id::text, 'UTF8')), 'hex'), 6)))
    on conflict (parche_id, usuario_id) where parche_id is not null
    do update set anulado = false, monto_cop = excluded.monto_cop, plan = excluded.plan, validado_por = excluded.validado_por,
                  actualizado_en = now()
      where public.cobros.liquidacion_id is null;
  elsif coalesce(old.checkin, false) and not coalesce(new.checkin, false) then
    update public.cobros set anulado = true, actualizado_en = now()
     where parche_id = p.id and usuario_id = new.usuario_id and liquidacion_id is null;
  end if;
  return new;
end $$;
drop trigger if exists cobro_parche on public.parche_miembros;
create trigger cobro_parche after update of checkin on public.parche_miembros
  for each row execute function private.cobro_parche();

-- Llegada de una reserva del Modo Mesa (tarifa fija por persona que llegó)
create or replace function private.cobro_reserva()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype;
begin
  select * into n from public.negocios where id = new.negocio_id;
  if not found then return new; end if;
  if new.estado = 'llego' then
    insert into public.cobros (negocio_id, tipo, reserva_id, usuario_id, personas, monto_cop, plan, validado_por, codigo)
    values (n.id, 'reserva', new.id, new.usuario_id, coalesce(new.llegaron, new.personas),
            private.tarifa_cliente(n.plan) * coalesce(new.llegaron, new.personas), n.plan,
            coalesce(new.llegada_metodo, 'local'), new.codigo)
    on conflict (reserva_id) where reserva_id is not null
    do update set anulado = false, personas = excluded.personas, monto_cop = excluded.monto_cop,
                  validado_por = excluded.validado_por, actualizado_en = now()
      where public.cobros.liquidacion_id is null;
  elsif old.estado = 'llego' then
    update public.cobros set anulado = true, actualizado_en = now() where reserva_id = new.id and liquidacion_id is null;
  end if;
  return new;
end $$;
drop trigger if exists cobro_reserva on public.mesa_reservas;
create trigger cobro_reserva after update of estado, llegaron on public.mesa_reservas
  for each row execute function private.cobro_reserva();

-- =====================================================================
-- 5. LIQUIDACIÓN MENSUAL
-- =====================================================================
create table if not exists public.liquidaciones (
  id            bigint generated always as identity primary key,
  negocio_id    uuid not null references public.negocios (id) on delete cascade,
  periodo       date not null,
  clientes      integer not null default 0,
  total_cop     integer not null default 0,
  referencia    text not null unique,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'pagada', 'sin_cobro', 'anulada')),
  vence         date not null,
  pago_ref      text check (pago_ref is null or char_length(pago_ref) <= 60),
  reportada_en  timestamptz,
  pagada_en     timestamptz,
  nota          text check (nota is null or char_length(nota) <= 300),
  creada_en     timestamptz not null default now(),
  unique (negocio_id, periodo)
);
alter table public.liquidaciones enable row level security;
revoke all on public.liquidaciones from anon, authenticated;
grant select on public.liquidaciones to authenticated;
drop policy if exists "liquidaciones: las de mi negocio" on public.liquidaciones;
create policy "liquidaciones: las de mi negocio" on public.liquidaciones for select to authenticated using (negocio_id = (select auth.uid()));

-- Arma las liquidaciones de los meses ya cerrados (corre el día 1 de cada mes)
create or replace function private.generar_liquidaciones()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; g record; v_id bigint;
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
          estado = case when public.liquidaciones.estado = 'sin_cobro' and excluded.total_cop > 0 then 'pendiente' else public.liquidaciones.estado end
    returning id into v_id;
    update public.cobros set liquidacion_id = v_id
     where negocio_id = g.negocio_id and periodo = g.periodo and liquidacion_id is null and not anulado;
    -- Aviso al negocio
    if g.total > 0 then
      insert into public.notificaciones (usuario_id, icono, texto)
      values (g.negocio_id, 'i-card', 'Tu estado de cuenta de ' || to_char(g.periodo, 'MM/YYYY') || ' está listo: '
              || g.clientes || ' clientes · $' || to_char(g.total, 'FM999G999G999') || '. Págalo en Perfil y plan > Cobros.');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function private.generar_liquidaciones() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'modo-parche-liquidaciones';
  perform cron.schedule('modo-parche-liquidaciones', '15 5 1 * *', 'select private.generar_liquidaciones()');
exception when others then
  raise notice 'pg_cron no disponible (%). El equipo puede generarlas desde el panel admin.', sqlerrm;
end $$;

-- ¿Debe una liquidación vencida? Sus parches dejan de salir en el radar.
create or replace function public.negocio_en_mora(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.liquidaciones l where l.negocio_id = p_negocio and l.estado = 'pendiente' and l.vence < current_date)
$$;
revoke all on function public.negocio_en_mora(uuid) from public, anon;
grant execute on function public.negocio_en_mora(uuid) to authenticated;
drop policy if exists "cobro: ocultar parches de negocios en mora" on public.parches;
create policy "cobro: ocultar parches de negocios en mora" on public.parches as restrictive for select to authenticated
  using (creador_id = (select auth.uid()) or not coalesce(aliado, false) or not public.negocio_en_mora(creador_id));

-- =====================================================================
-- 6. LO QUE VE EL NEGOCIO
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
    'mes', jsonb_build_object(
      'periodo', v_mes,
      'clientes', coalesce((select sum(personas) from public.cobros where negocio_id = uid and periodo = v_mes and not anulado), 0),
      'total', coalesce((select sum(monto_cop) from public.cobros where negocio_id = uid and periodo = v_mes and not anulado), 0),
      'detalle', coalesce((
        select jsonb_agg(x order by x.creado_en desc) from (
          select c.id, c.tipo, c.personas, c.base_cop, c.monto_cop, c.validado_por, c.codigo, c.creado_en,
                 private.nombre_corto(c.usuario_id) cliente,
                 coalesce((select pa.titulo from public.parches pa where pa.id = c.parche_id),
                          (select mp.titulo from public.mesa_reservas mr join public.mesa_promos mp on mp.id = mr.promo_id where mr.id = c.reserva_id), '') titulo
          from public.cobros c where c.negocio_id = uid and c.periodo = v_mes and not c.anulado
          order by c.creado_en desc limit 200) x), '[]'::jsonb)
    ),
    'liquidaciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'periodo', l.periodo, 'clientes', l.clientes, 'total', l.total_cop,
               'referencia', l.referencia, 'estado', l.estado, 'vence', l.vence, 'pago_ref', l.pago_ref,
               'reportada_en', l.reportada_en, 'pagada_en', l.pagada_en) order by l.periodo desc)
      from public.liquidaciones l where l.negocio_id = uid), '[]'::jsonb)
  );
end $$;
revoke all on function public.mi_cuenta_cobros() from public, anon;
grant execute on function public.mi_cuenta_cobros() to authenticated;

-- El negocio avisa que ya pagó con el datáfono de Wompi (el equipo lo confirma)
create or replace function public.reportar_pago_liquidacion(p_id bigint, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_ref, ''))) < 4 then
    raise exception 'FALTA_REFERENCIA' using errcode = 'P0001', hint = 'Escribe el número de transacción que te dio Wompi.';
  end if;
  update public.liquidaciones set pago_ref = left(trim(p_ref), 60), reportada_en = now()
   where id = p_id and negocio_id = auth.uid() and estado = 'pendiente';
  if not found then raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'Esa liquidación no está pendiente.'; end if;
end $$;
revoke all on function public.reportar_pago_liquidacion(bigint, text) from public, anon;
grant execute on function public.reportar_pago_liquidacion(bigint, text) to authenticated;

-- =====================================================================
-- 7. LO QUE VE EL EQUIPO (admin)
-- =====================================================================
create or replace function public.admin_liquidaciones()
returns table (id bigint, negocio_id uuid, negocio text, plan text, periodo date, clientes integer, total_cop integer,
               referencia text, estado text, vence date, pago_ref text, reportada_en timestamptz, pagada_en timestamptz, en_mora boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_staff();
  return query
    select l.id, l.negocio_id, n.nombre, n.plan, l.periodo, l.clientes, l.total_cop, l.referencia, l.estado, l.vence,
           l.pago_ref, l.reportada_en, l.pagada_en, (l.estado = 'pendiente' and l.vence < current_date)
    from public.liquidaciones l join public.negocios n on n.id = l.negocio_id
    order by (l.estado = 'pendiente') desc, l.vence asc, l.periodo desc
    limit 500;
end $$;
revoke all on function public.admin_liquidaciones() from public, anon;
grant execute on function public.admin_liquidaciones() to authenticated;

create or replace function public.admin_marcar_liquidacion(p_id bigint, p_estado text, p_nota text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  if p_estado not in ('pendiente', 'pagada', 'anulada') then raise exception 'ESTADO_INVALIDO' using errcode = 'P0001'; end if;
  update public.liquidaciones
     set estado = p_estado, pagada_en = case when p_estado = 'pagada' then now() else null end,
         nota = nullif(left(coalesce(p_nota, ''), 300), '')
   where id = p_id;
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.admin_marcar_liquidacion(bigint, text, text) from public, anon;
grant execute on function public.admin_marcar_liquidacion(bigint, text, text) to authenticated;

create or replace function public.admin_generar_liquidaciones()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  return private.generar_liquidaciones();
end $$;
revoke all on function public.admin_generar_liquidaciones() from public, anon;
grant execute on function public.admin_generar_liquidaciones() to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
