-- =====================================================================
-- ModoParche · Negocios v2, Modo Mesa, check-in verificado y pagos
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Corre después de 20261101120000_verificacion_identidad.sql. Se puede
-- correr más de una vez sin romper nada.
--
-- Qué hace:
--   1. Horarios y cupones del negocio se guardan en la base (antes solo en
--      el navegador). Una cuenta nueva arranca SIN horarios y SIN cupones:
--      los pone el dueño.
--   2. Planes pagos protegidos: el plan ya no se cambia desde la app. Sube
--      solo cuando Wompi confirma el pago (Edge Function wompi-webhook) y
--      vence a los 30 días. Bajar a Parche básico sí lo hace el negocio.
--   3. Tabla pagos con el historial de cada cobro.
--   4. Modo Mesa: el local lanza una promo para grupos que ya van juntos y
--      la persona reserva diciendo cuántos van y a qué hora llegan.
--   5. Check-in verificado: "Ya llegué" solo cuenta con el QR del
--      organizador o con el GPS a menos de 200 m del punto. El organizador
--      (o el local) también puede marcar a quien llegó.
--   6. Tiempo real para reservas de mesa y pagos.
-- =====================================================================

-- =====================================================================
-- 1. HORARIOS Y CUPONES DEL NEGOCIO
--    horarios: {"0": {"abierto": true, "open": "10:00", "close": "22:00"}, ... "6": {...}}
--    (0 = domingo). null = el dueño todavía no los ha puesto.
-- =====================================================================
alter table public.negocios add column if not exists horarios jsonb;
alter table public.negocios add column if not exists cupones  jsonb not null default '[]'::jsonb;

alter table public.negocios drop constraint if exists negocios_horarios_check;
alter table public.negocios add constraint negocios_horarios_check
  check (horarios is null or (jsonb_typeof(horarios) = 'object' and pg_column_size(horarios) < 4000));
alter table public.negocios drop constraint if exists negocios_cupones_check;
alter table public.negocios add constraint negocios_cupones_check
  check (jsonb_typeof(cupones) = 'array' and jsonb_array_length(cupones) <= 40 and pg_column_size(cupones) < 40000);

grant update (horarios, cupones) on public.negocios to authenticated;

-- =====================================================================
-- 2. PLANES PROTEGIDOS
-- =====================================================================
alter table public.negocios add column if not exists plan_vence     timestamptz;
alter table public.negocios add column if not exists plan_pendiente text
  check (plan_pendiente is null or plan_pendiente in ('villavo', 'sedes'));

-- El plan y las sedes ya no se editan desde la app
revoke update (plan, sedes) on public.negocios from authenticated;

-- Registro: el negocio siempre arranca en Parche básico. Si eligió un plan
-- pago, queda como pendiente hasta que pague.
create or replace function private.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_ciudad text := m ->> 'ciudad';
  v_cedula text := regexp_replace(coalesce(m ->> 'cedula', ''), '\D', '', 'g');
  v_tel    text := regexp_replace(coalesce(m ->> 'telefono', ''), '\D', '', 'g');
  v_fecha  date;
  v_intereses text[];
  v_nombre text;
  v_plan   text := m ->> 'plan';
  v_cat    text := m ->> 'categoria';
  v_sedes  int;
begin
  if v_ciudad not in ('Villavicencio', 'Acacías', 'Restrepo') or v_ciudad is null then
    v_ciudad := 'Villavicencio';
  end if;

  -- Cuenta de negocio (empresa.html)
  if m ->> 'tipo' = 'empresa' then
    v_nombre := left(coalesce(nullif(trim(m ->> 'negocio'), ''), split_part(new.email, '@', 1), 'Mi negocio'), 80);
    if v_cat not in ('rumba', 'comida', 'chill', 'pueblear', 'rio', 'deportes', 'conciertos', 'pet', 'cultura', 'gaming') or v_cat is null then v_cat := 'comida'; end if;
    begin
      v_sedes := greatest(1, least(50, coalesce(nullif(m ->> 'sedes', '')::int, 1)));
    exception when others then
      v_sedes := 1;
    end;

    insert into public.negocios (id, nombre, responsable, nit, tipo, categoria, plan, plan_pendiente, sedes, telefono, ciudad, direccion, barrio, descripcion, lat, lng)
    values (
      new.id, v_nombre,
      left(coalesce(trim(m ->> 'responsable'), ''), 80),
      left(regexp_replace(coalesce(m ->> 'nit', ''), '[^0-9.-]', '', 'g'), 20),
      left(coalesce(nullif(trim(m ->> 'tipo_negocio'), ''), 'Café o restaurante'), 40),
      v_cat,
      'basico',
      case when v_plan in ('villavo', 'sedes') then v_plan end,
      v_sedes,
      case when v_tel ~ '^[0-9]{7,15}$' then v_tel else '' end,
      v_ciudad,
      left(coalesce(trim(m ->> 'direccion'), ''), 120),
      left(coalesce(trim(m ->> 'barrio'), ''), 40),
      left(coalesce(trim(m ->> 'descripcion'), ''), 300),
      case when (m ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (m ->> 'lat')::double precision between -90 and 90 then (m ->> 'lat')::double precision end,
      case when (m ->> 'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' and (m ->> 'lng')::double precision between -180 and 180 then (m ->> 'lng')::double precision end
    )
    on conflict (id) do nothing;

    insert into public.perfiles (id, nombre, ciudad)
    values (new.id, v_nombre, v_ciudad)
    on conflict (id) do nothing;
    return new;
  end if;

  -- Cuenta de persona (login.html)
  begin
    v_fecha := nullif(m ->> 'fecha_nacimiento', '')::date;
  exception when others then
    v_fecha := null;
  end;
  select coalesce(array_agg(x), '{}') into v_intereses
  from jsonb_array_elements_text(case when jsonb_typeof(m -> 'intereses') = 'array' then m -> 'intereses' else '[]'::jsonb end) x
  where x in ('rumba', 'comida', 'chill', 'pueblear', 'rio', 'deportes', 'conciertos', 'pet', 'cultura', 'gaming');

  insert into public.perfiles (id, nombre, ciudad, intereses)
  values (new.id, left(coalesce(nullif(trim(m ->> 'nombre'), ''), split_part(new.email, '@', 1), 'Parcero'), 80), v_ciudad, v_intereses)
  on conflict (id) do nothing;

  insert into public.perfiles_privados (id, cedula, telefono, fecha_nacimiento, instagram)
  values (
    new.id,
    case when v_cedula ~ '^[0-9]{5,15}$' then v_cedula end,
    case when v_tel ~ '^[0-9]{7,15}$' then v_tel end,
    v_fecha,
    left(nullif(trim(m ->> 'instagram'), ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Límite del plan básico. Un plan pago vencido cuenta como básico.
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
    return new;
  end if;

  if tg_op = 'INSERT' and (n.plan = 'basico' or (n.plan_vence is not null and n.plan_vence < now())) then
    select count(*) into v_mes from public.parches
    where creador_id = n.id and creado_en >= date_trunc('month', now());
    if v_mes >= 2 then
      raise exception 'LIMITE_PLAN' using errcode = 'P0001',
        hint = 'El plan Parche básico incluye 2 parches al mes. Pásate a Parche Villavo para publicar sin límite.';
    end if;
  end if;

  new.aliado := true;
  new.verificado := n.verificado;
  new.creador_nombre := n.nombre;
  return new;
end $$;

-- Bajar a Parche básico: lo hace el mismo negocio cuando quiera
create or replace function public.cambiar_a_basico()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.negocios set plan = 'basico', plan_vence = null, plan_pendiente = null where id = auth.uid();
  if not found then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.cambiar_a_basico() from public, anon;
grant execute on function public.cambiar_a_basico() to authenticated;

-- Aviso 3 días antes de vencer (no hay cobro automático: así nadie se sorprende)
alter table public.negocios add column if not exists plan_avisado boolean not null default false;

-- Los planes vencidos vuelven a básico (una vez al día con pg_cron)
create or replace function private.vencer_planes()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with por_vencer as (
    update public.negocios set plan_avisado = true
    where plan = 'villavo' and not plan_avisado and plan_vence is not null
      and plan_vence between now() and now() + interval '3 days'
    returning id, plan_vence
  )
  insert into public.notificaciones (usuario_id, icono, texto)
  select id, 'i-info', '<b>Tu plan Parche Villavo vence el ' || to_char(plan_vence at time zone 'America/Bogota', 'DD/MM')
    || '.</b> No se cobra solo: si quieres seguir sin límite, renuévalo en Perfil y plan.'
  from por_vencer;

  with vencidos as (
    update public.negocios set plan = 'basico', plan_vence = null
    where plan = 'villavo' and plan_vence is not null and plan_vence < now()
    returning id
  )
  insert into public.notificaciones (usuario_id, icono, texto)
  select id, 'i-info', '<b>ModoParche:</b> Tu plan Parche Villavo venció y volviste a Parche básico. Renuévalo en Perfil y plan.'
  from vencidos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.vencer_planes() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('modo-parche-vencer-planes', '20 5 * * *', 'select private.vencer_planes()');
exception when others then
  raise notice 'pg_cron no disponible (%). Los planes vencidos igual cuentan como básico al publicar.', sqlerrm;
end $$;

-- =====================================================================
-- 3. PAGOS (Wompi)
--    Las filas las crea la Edge Function wompi-checkout y las actualiza
--    wompi-webhook con la llave service_role. Desde la app solo se leen.
-- =====================================================================
create table if not exists public.pagos (
  id              bigint generated always as identity primary key,
  negocio_id      uuid not null references public.negocios (id) on delete cascade,
  referencia      text not null unique check (char_length(referencia) between 8 and 64),
  plan            text not null check (plan in ('villavo')),
  monto_centavos  bigint not null check (monto_centavos > 0),
  moneda          text not null default 'COP' check (moneda = 'COP'),
  estado          text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')),
  wompi_id        text,
  metodo          text,
  detalle         text not null default '' check (char_length(detalle) <= 200),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists pagos_negocio_idx on public.pagos (negocio_id, creado_en desc);

drop trigger if exists pagos_tocar on public.pagos;
create trigger pagos_tocar before update on public.pagos
  for each row execute function private.tocar_actualizado();

alter table public.pagos enable row level security;
revoke all on public.pagos from anon, authenticated;
grant select on public.pagos to authenticated;
drop policy if exists "pagos: ver los propios o si soy equipo" on public.pagos;
create policy "pagos: ver los propios o si soy equipo" on public.pagos for select to authenticated
  using (negocio_id = (select auth.uid()) or (select public.es_admin_total()));

-- Aplica la respuesta de Wompi. Solo la llama la Edge Function (service_role).
-- Es idempotente: si Wompi manda el mismo evento dos veces no cobra doble.
create or replace function public.aplicar_pago_wompi(
  p_referencia text, p_estado text, p_wompi_id text, p_metodo text, p_monto bigint, p_moneda text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.pagos%rowtype;
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

-- =====================================================================
-- 4. MODO MESA
-- =====================================================================
create table if not exists public.mesa_promos (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     uuid not null references public.negocios (id) on delete cascade default auth.uid(),
  titulo         text not null check (char_length(titulo) between 4 and 60),
  beneficio      text not null check (char_length(beneficio) between 4 and 120),
  descripcion    text not null default '' check (char_length(descripcion) <= 300),
  min_personas   integer not null default 2 check (min_personas between 2 and 30),
  max_personas   integer not null default 8 check (max_personas between 2 and 30),
  dias           integer[] not null default '{0,1,2,3,4,5,6}'
                 check (cardinality(dias) between 1 and 7 and dias <@ '{0,1,2,3,4,5,6}'::integer[]),
  hora_desde     time not null default '12:00',
  hora_hasta     time not null default '23:00',
  mesas_por_dia  integer not null default 5 check (mesas_por_dia between 1 and 100),
  activa         boolean not null default true,
  vence          date,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint mesa_promos_personas check (max_personas >= min_personas),
  constraint mesa_promos_horas check (hora_desde <> hora_hasta)
);
create index if not exists mesa_promos_negocio_idx on public.mesa_promos (negocio_id);

create table if not exists public.mesa_reservas (
  id             uuid primary key default gen_random_uuid(),
  promo_id       uuid not null references public.mesa_promos (id) on delete cascade,
  negocio_id     uuid not null references public.negocios (id) on delete cascade,
  usuario_id     uuid not null references auth.users (id) on delete cascade,
  personas       integer not null check (personas between 2 and 30),
  llegada        timestamptz not null,
  nota           text not null default '' check (char_length(nota) <= 140),
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'confirmada', 'rechazada', 'cancelada', 'llego', 'no_llego')),
  codigo         text not null check (char_length(codigo) <= 20),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists mesa_reservas_negocio_idx on public.mesa_reservas (negocio_id, llegada);
create index if not exists mesa_reservas_usuario_idx on public.mesa_reservas (usuario_id, llegada);
create index if not exists mesa_reservas_promo_idx on public.mesa_reservas (promo_id, llegada);

drop trigger if exists mesa_promos_tocar on public.mesa_promos;
create trigger mesa_promos_tocar before update on public.mesa_promos
  for each row execute function private.tocar_actualizado();
drop trigger if exists mesa_reservas_tocar on public.mesa_reservas;
create trigger mesa_reservas_tocar before update on public.mesa_reservas
  for each row execute function private.tocar_actualizado();

-- Solo cuentas de negocio crean promos, y máximo 10 cada una
create or replace function private.validar_mesa_promo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.negocios n where n.id = new.negocio_id) then
    raise exception 'SOLO_NEGOCIOS' using errcode = 'P0001', hint = 'Solo los negocios pueden lanzar promos de Modo Mesa.';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.mesa_promos p where p.negocio_id = new.negocio_id) >= 10 then
    raise exception 'LIMITE_MESAS' using errcode = 'P0001', hint = 'Puedes tener hasta 10 promos de mesa. Borra una que ya no uses.';
  end if;
  return new;
end $$;
revoke all on function private.validar_mesa_promo() from public, anon, authenticated;
drop trigger if exists mesa_promos_validar on public.mesa_promos;
create trigger mesa_promos_validar before insert or update on public.mesa_promos
  for each row execute function private.validar_mesa_promo();

alter table public.mesa_promos enable row level security;
alter table public.mesa_reservas enable row level security;
revoke all on public.mesa_promos, public.mesa_reservas from anon, authenticated;

-- Promos: el negocio maneja las suyas. Las personas las ven con mesas_disponibles().
grant select, delete on public.mesa_promos to authenticated;
grant insert (titulo, beneficio, descripcion, min_personas, max_personas, dias, hora_desde, hora_hasta, mesas_por_dia, activa, vence)
  on public.mesa_promos to authenticated;
grant update (titulo, beneficio, descripcion, min_personas, max_personas, dias, hora_desde, hora_hasta, mesas_por_dia, activa, vence)
  on public.mesa_promos to authenticated;
drop policy if exists "mesa_promos: el negocio ve las suyas" on public.mesa_promos;
create policy "mesa_promos: el negocio ve las suyas" on public.mesa_promos for select to authenticated
  using (negocio_id = (select auth.uid()) or (select public.soy_admin()));
drop policy if exists "mesa_promos: crear" on public.mesa_promos;
create policy "mesa_promos: crear" on public.mesa_promos for insert to authenticated
  with check (negocio_id = (select auth.uid()));
drop policy if exists "mesa_promos: editar las suyas" on public.mesa_promos;
create policy "mesa_promos: editar las suyas" on public.mesa_promos for update to authenticated
  using (negocio_id = (select auth.uid())) with check (negocio_id = (select auth.uid()));
drop policy if exists "mesa_promos: borrar las suyas" on public.mesa_promos;
create policy "mesa_promos: borrar las suyas" on public.mesa_promos for delete to authenticated
  using (negocio_id = (select auth.uid()));

-- Reservas: las ve quien reservó y el negocio. Se crean y cambian solo con funciones.
grant select on public.mesa_reservas to authenticated;
drop policy if exists "mesa_reservas: ver las propias" on public.mesa_reservas;
create policy "mesa_reservas: ver las propias" on public.mesa_reservas for select to authenticated
  using (usuario_id = (select auth.uid()) or negocio_id = (select auth.uid()) or (select public.soy_admin()));

-- Promos activas con los datos públicos del local
create or replace function public.mesas_disponibles()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.verificado desc, x.creado_en desc), '[]'::jsonb)
  from (
    select n.verificado, p.creado_en, jsonb_build_object(
      'id', p.id, 'titulo', p.titulo, 'beneficio', p.beneficio, 'descripcion', p.descripcion,
      'min_personas', p.min_personas, 'max_personas', p.max_personas, 'dias', p.dias,
      'hora_desde', to_char(p.hora_desde, 'HH24:MI'), 'hora_hasta', to_char(p.hora_hasta, 'HH24:MI'),
      'vence', p.vence,
      'negocio', jsonb_build_object(
        'id', n.id, 'nombre', n.nombre, 'direccion', n.direccion, 'barrio', n.barrio, 'ciudad', n.ciudad,
        'lat', n.lat, 'lng', n.lng, 'categoria', n.categoria, 'verificado', n.verificado, 'logo', n.logo
      )
    ) as j
    from public.mesa_promos p
    join public.negocios n on n.id = p.negocio_id
    where p.activa
      and (p.vence is null or p.vence >= (now() at time zone 'America/Bogota')::date)
    order by n.verificado desc, p.creado_en desc
    limit 60
  ) x
$$;
revoke all on function public.mesas_disponibles() from public, anon;
grant execute on function public.mesas_disponibles() to authenticated;

-- Mis reservas (últimos 30 días y próximas)
create or replace function public.mis_mesas()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'promo_id', r.promo_id, 'personas', r.personas, 'llegada', r.llegada, 'nota', r.nota,
      'estado', r.estado, 'codigo', r.codigo, 'creado_en', r.creado_en,
      'titulo', p.titulo, 'beneficio', p.beneficio,
      'negocio', jsonb_build_object('id', n.id, 'nombre', n.nombre, 'direccion', n.direccion, 'barrio', n.barrio, 'lat', n.lat, 'lng', n.lng)
    ) order by r.llegada), '[]'::jsonb)
  from public.mesa_reservas r
  join public.mesa_promos p on p.id = r.promo_id
  join public.negocios n on n.id = r.negocio_id
  where r.usuario_id = (select auth.uid())
    and r.llegada > now() - interval '30 days'
$$;
revoke all on function public.mis_mesas() from public, anon;
grant execute on function public.mis_mesas() to authenticated;

-- Reservar: cuántos van y a qué hora llegan
create or replace function public.reservar_mesa(p_promo uuid, p_personas integer, p_llegada timestamptz, p_nota text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  pr       public.mesa_promos%rowtype;
  v_local  timestamp;
  v_dia    int;
  v_hora   time;
  v_fecha  date;
  v_ok     boolean;
  v_n      int;
  v_codigo text;
  v_id     uuid;
  v_neg    text;
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if exists (select 1 from public.negocios n where n.id = v_uid) then
    raise exception 'SOLO_PERSONAS' using errcode = 'P0001', hint = 'Las mesas se reservan desde una cuenta personal.';
  end if;

  select * into pr from public.mesa_promos where id = p_promo;
  if not found or not pr.activa or (pr.vence is not null and pr.vence < (now() at time zone 'America/Bogota')::date) then
    raise exception 'PROMO_NO_DISPONIBLE' using errcode = 'P0001', hint = 'Esta promo ya no está disponible.';
  end if;
  if p_personas is null or p_personas < pr.min_personas or p_personas > pr.max_personas then
    raise exception 'PERSONAS_FUERA' using errcode = 'P0001',
      hint = format('Esta promo es para grupos de %s a %s personas.', pr.min_personas, pr.max_personas);
  end if;
  if p_llegada is null or p_llegada < now() + interval '15 minutes' then
    raise exception 'HORA_PASADA' using errcode = 'P0001', hint = 'Elige una hora de llegada al menos 15 minutos desde ahora.';
  end if;
  if p_llegada > now() + interval '14 days' then
    raise exception 'MUY_LEJOS' using errcode = 'P0001', hint = 'Puedes reservar hasta con 14 días de anticipación.';
  end if;

  v_local := p_llegada at time zone 'America/Bogota';
  v_dia   := extract(dow from v_local)::int;
  v_hora  := v_local::time;
  v_fecha := v_local::date;
  if pr.vence is not null and v_fecha > pr.vence then
    raise exception 'PROMO_VENCE' using errcode = 'P0001', hint = 'La promo vence antes de ese día.';
  end if;
  -- Franja de la promo. Si cruza la medianoche (ej. 20:00 a 02:00), la
  -- madrugada cuenta como parte del día anterior.
  if pr.hora_hasta > pr.hora_desde then
    v_ok := v_dia = any (pr.dias) and v_hora between pr.hora_desde and pr.hora_hasta;
  else
    v_ok := (v_hora >= pr.hora_desde and v_dia = any (pr.dias))
         or (v_hora <= pr.hora_hasta and ((v_dia + 6) % 7) = any (pr.dias));
  end if;
  if not v_ok then
    raise exception 'FUERA_DE_HORARIO' using errcode = 'P0001',
      hint = format('Esta promo aplica de %s a %s en los días marcados.', to_char(pr.hora_desde, 'HH24:MI'), to_char(pr.hora_hasta, 'HH24:MI'));
  end if;

  -- Mesas por día (con candado para que dos personas no tomen la última a la vez)
  perform pg_advisory_xact_lock(hashtext(p_promo::text || v_fecha::text));
  select count(*) into v_n from public.mesa_reservas r
  where r.promo_id = p_promo and (r.llegada at time zone 'America/Bogota')::date = v_fecha
    and r.estado in ('pendiente', 'confirmada', 'llego');
  if v_n >= pr.mesas_por_dia then
    raise exception 'SIN_MESAS' using errcode = 'P0001', hint = 'Ya no quedan mesas con esta promo ese día. Prueba otro día.';
  end if;
  if exists (select 1 from public.mesa_reservas r
             where r.usuario_id = v_uid and r.promo_id = p_promo
               and (r.llegada at time zone 'America/Bogota')::date = v_fecha
               and r.estado in ('pendiente', 'confirmada')) then
    raise exception 'YA_RESERVASTE' using errcode = 'P0001', hint = 'Ya tienes esta mesa reservada ese día.';
  end if;
  select count(*) into v_n from public.mesa_reservas r
  where r.usuario_id = v_uid and r.estado in ('pendiente', 'confirmada') and r.llegada > now();
  if v_n >= 3 then
    raise exception 'DEMASIADAS' using errcode = 'P0001', hint = 'Tienes 3 mesas por delante. Cancela una para reservar otra.';
  end if;

  v_codigo := 'MESA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  insert into public.mesa_reservas (promo_id, negocio_id, usuario_id, personas, llegada, nota, codigo)
  values (p_promo, pr.negocio_id, v_uid, p_personas, date_trunc('minute', p_llegada), left(trim(coalesce(p_nota, '')), 140), v_codigo)
  returning id into v_id;

  select nombre into v_neg from public.negocios where id = pr.negocio_id;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (pr.negocio_id, 'i-users',
    left('<b>Nueva mesa:</b> ' || private.texto_plano(private.nombre_corto(v_uid)) || ' llega con ' || p_personas
      || ' personas a <b>' || private.texto_plano(pr.titulo) || '</b> el ' || to_char(v_local, 'DD/MM') || ' a las ' || to_char(v_local, 'HH24:MI') || '.', 300));
  insert into public.notificaciones (usuario_id, icono, texto)
  values (v_uid, 'i-users',
    left('Reservaste <b>' || private.texto_plano(pr.titulo) || '</b> en ' || private.texto_plano(v_neg)
      || '. Tu código es <b>' || v_codigo || '</b>. Te avisamos cuando el local la confirme.', 300));

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'estado', 'pendiente');
end $$;
revoke all on function public.reservar_mesa(uuid, integer, timestamptz, text) from public, anon;
grant execute on function public.reservar_mesa(uuid, integer, timestamptz, text) to authenticated;

-- Cancelar mi mesa
create or replace function public.cancelar_mi_mesa(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.mesa_reservas%rowtype;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.mesa_reservas set estado = 'cancelada'
   where id = p_id and usuario_id = auth.uid() and estado in ('pendiente', 'confirmada')
  returning * into r;
  if not found then
    raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'Esa reserva ya no se puede cancelar.';
  end if;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (r.negocio_id, 'i-users',
    left('<b>Mesa cancelada:</b> ' || private.texto_plano(private.nombre_corto(r.usuario_id)) || ' canceló la reserva ' || r.codigo || '.', 300));
end $$;
revoke all on function public.cancelar_mi_mesa(uuid) from public, anon;
grant execute on function public.cancelar_mi_mesa(uuid) to authenticated;

-- El negocio confirma, rechaza o marca la llegada
create or replace function public.negocio_mesa_estado(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.mesa_reservas%rowtype; v_titulo text; v_neg text;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if p_estado not in ('confirmada', 'rechazada', 'llego', 'no_llego') then
    raise exception 'ESTADO_INVALIDO' using errcode = 'P0001';
  end if;
  update public.mesa_reservas set estado = p_estado
   where id = p_id and negocio_id = auth.uid() and estado <> 'cancelada'
  returning * into r;
  if not found then
    raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'La reserva no existe o la persona ya la canceló.';
  end if;
  if p_estado in ('confirmada', 'rechazada') then
    select p.titulo into v_titulo from public.mesa_promos p where p.id = r.promo_id;
    select n.nombre into v_neg from public.negocios n where n.id = r.negocio_id;
    insert into public.notificaciones (usuario_id, icono, texto)
    values (r.usuario_id, case when p_estado = 'confirmada' then 'i-check' else 'i-info' end,
      left(case when p_estado = 'confirmada'
        then '<b>' || private.texto_plano(v_neg) || '</b> confirmó tu mesa (' || private.texto_plano(v_titulo) || '). Muestra el código ' || r.codigo || ' al llegar.'
        else '<b>' || private.texto_plano(v_neg) || '</b> no pudo recibir tu mesa a esa hora. Prueba con otra hora u otro día.' end, 300));
  end if;
end $$;
revoke all on function public.negocio_mesa_estado(uuid, text) from public, anon;
grant execute on function public.negocio_mesa_estado(uuid, text) to authenticated;

-- =====================================================================
-- 5. CHECK-IN VERIFICADO (QR del organizador o GPS a menos de 200 m)
-- =====================================================================
alter table public.parche_miembros add column if not exists checkin_metodo text
  check (checkin_metodo is null or checkin_metodo in ('qr', 'gps', 'organizador'));
alter table public.parche_miembros add column if not exists checkin_en timestamptz;

-- Nadie se marca "llegué" a mano: solo con las funciones de abajo
revoke update (checkin) on public.parche_miembros from authenticated;

-- Secreto del QR de cada parche. Ninguna cuenta lo lee directo de la tabla.
create table if not exists public.parche_claves (
  parche_id  uuid primary key references public.parches (id) on delete cascade,
  secreto    text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  creado_en  timestamptz not null default now()
);
alter table public.parche_claves enable row level security;
revoke all on public.parche_claves from anon, authenticated;

-- El organizador recibe el secreto y la hora del servidor. Con eso su
-- celular arma un código que cambia cada 30 segundos (sin llamar al servidor).
create or replace function public.mi_clave_checkin(p_parche uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_secreto text;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not exists (select 1 from public.parches p where p.id = p_parche and p.creador_id = auth.uid()) then
    raise exception 'NO_ERES_ORGANIZADOR' using errcode = '42501', hint = 'Solo quien organiza muestra el QR de llegada.';
  end if;
  insert into public.parche_claves (parche_id) values (p_parche) on conflict (parche_id) do nothing;
  select secreto into v_secreto from public.parche_claves where parche_id = p_parche;
  return jsonb_build_object('secreto', v_secreto, 'ahora', floor(extract(epoch from clock_timestamp()) * 1000)::bigint, 'paso', 30);
end $$;
revoke all on function public.mi_clave_checkin(uuid) from public, anon;
grant execute on function public.mi_clave_checkin(uuid) to authenticated;

-- Código del QR para una ventana de 30 s: primeros 10 hex de sha256("secreto:ventana")
create or replace function private.codigo_checkin(p_secreto text, p_ventana bigint)
returns text language sql immutable set search_path = '' as $$
  select left(encode(sha256(convert_to(p_secreto || ':' || p_ventana::text, 'UTF8')), 'hex'), 10)
$$;
revoke all on function private.codigo_checkin(text, bigint) from public, anon, authenticated;

-- Reglas comunes: ser parte del parche y estar en la ventana de tiempo
create or replace function private.validar_llegada(p_parche uuid, p_usuario uuid)
returns public.parches language plpgsql security definer set search_path = '' as $$
declare p public.parches%rowtype;
begin
  select * into p from public.parches where id = p_parche;
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese parche ya no existe.'; end if;
  if not exists (select 1 from public.parche_miembros m where m.parche_id = p_parche and m.usuario_id = p_usuario) then
    raise exception 'NO_ESTAS' using errcode = 'P0001', hint = 'Primero cáele al parche.';
  end if;
  if now() < p.inicio - interval '90 minutes' then
    raise exception 'MUY_TEMPRANO' using errcode = 'P0001', hint = 'El check-in se abre 90 minutos antes del parche.';
  end if;
  if now() > p.inicio + interval '6 hours' then
    raise exception 'MUY_TARDE' using errcode = 'P0001', hint = 'El check-in de este parche ya cerró.';
  end if;
  return p;
end $$;
revoke all on function private.validar_llegada(uuid, uuid) from public, anon, authenticated;

create or replace function private.marcar_llegada(p_parche uuid, p_usuario uuid, p_metodo text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ya boolean;
begin
  select checkin into v_ya from public.parche_miembros where parche_id = p_parche and usuario_id = p_usuario;
  if v_ya then return false; end if;
  update public.parche_miembros
     set checkin = true, checkin_metodo = p_metodo, checkin_en = now()
   where parche_id = p_parche and usuario_id = p_usuario;
  insert into public.mensajes (parche_id, autor_id, tipo, texto)
  values (p_parche, null, 'sys', private.nombre_corto(p_usuario) || ' llegó al punto'
    || case p_metodo when 'qr' then ' (QR)' when 'gps' then ' (GPS)' else ' (lo marcó el organizador)' end);
  return true;
end $$;
revoke all on function private.marcar_llegada(uuid, uuid, text) from public, anon, authenticated;

-- Opción 1: el asistente escanea el QR del organizador
create or replace function public.checkin_qr(p_parche uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  p public.parches%rowtype;
  v_secreto text;
  v_w bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_cod text := lower(trim(coalesce(p_codigo, '')));
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  p := private.validar_llegada(p_parche, v_uid);
  if p.creador_id = v_uid then
    raise exception 'ERES_ORGANIZADOR' using errcode = 'P0001', hint = 'Tú muestras el QR; usa el GPS para marcar tu llegada.';
  end if;
  select secreto into v_secreto from public.parche_claves where parche_id = p_parche;
  -- Acepta la ventana actual, las dos anteriores y la siguiente (relojes desfasados)
  if v_secreto is null or v_cod not in (
       private.codigo_checkin(v_secreto, v_w), private.codigo_checkin(v_secreto, v_w - 1),
       private.codigo_checkin(v_secreto, v_w - 2), private.codigo_checkin(v_secreto, v_w + 1)) then
    raise exception 'QR_INVALIDO' using errcode = 'P0001', hint = 'Ese QR venció o no es de este parche. Pídele al organizador que lo muestre de nuevo.';
  end if;
  return jsonb_build_object('ok', true, 'nuevo', private.marcar_llegada(p_parche, v_uid, 'qr'));
end $$;
revoke all on function public.checkin_qr(uuid, text) from public, anon;
grant execute on function public.checkin_qr(uuid, text) to authenticated;

-- Opción 2: GPS del navegador a menos de 200 m del punto
create or replace function public.checkin_gps(p_parche uuid, p_lat double precision, p_lng double precision, p_precision double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  p public.parches%rowtype;
  v_dist double precision;
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'SIN_UBICACION' using errcode = 'P0001', hint = 'No llegó tu ubicación. Activa el GPS.';
  end if;
  p := private.validar_llegada(p_parche, v_uid);
  if coalesce(p_precision, 9999) > 200 then
    raise exception 'GPS_IMPRECISO' using errcode = 'P0001',
      hint = 'La señal del GPS está muy débil. Sal a un lugar abierto o usa el QR del organizador.';
  end if;
  -- Distancia en metros (fórmula del haversine)
  v_dist := 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat - p.lat) / 2), 2)
    + cos(radians(p.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - p.lng) / 2), 2)));
  if v_dist > 200 then
    raise exception 'LEJOS' using errcode = 'P0001',
      hint = format('Estás a %s m del punto. Acércate a menos de 200 m.', round(v_dist)::int);
  end if;
  return jsonb_build_object('ok', true, 'distancia', round(v_dist)::int, 'nuevo', private.marcar_llegada(p_parche, v_uid, 'gps'));
end $$;
revoke all on function public.checkin_gps(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.checkin_gps(uuid, double precision, double precision, double precision) to authenticated;

-- El organizador (persona o local) marca a alguien que llegó
create or replace function public.organizador_checkin(p_parche uuid, p_usuario uuid, p_llego boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not exists (select 1 from public.parches p where p.id = p_parche and p.creador_id = auth.uid()) then
    raise exception 'NO_ERES_ORGANIZADOR' using errcode = '42501', hint = 'Solo quien organiza marca llegadas.';
  end if;
  if p_llego then
    perform private.validar_llegada(p_parche, p_usuario);
    perform private.marcar_llegada(p_parche, p_usuario, 'organizador');
  else
    update public.parche_miembros set checkin = false, checkin_metodo = null, checkin_en = null
     where parche_id = p_parche and usuario_id = p_usuario and not calificado;
  end if;
end $$;
revoke all on function public.organizador_checkin(uuid, uuid, boolean) from public, anon;
grant execute on function public.organizador_checkin(uuid, uuid, boolean) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

-- =====================================================================
-- 6. DESCARGAR MIS DATOS: ahora incluye mesas y pagos
-- =====================================================================
create or replace function public.mis_datos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generado', now(),
    'cuenta', (select jsonb_build_object('id', u.id, 'correo', u.email, 'creada', u.created_at, 'ultimo_ingreso', u.last_sign_in_at) from auth.users u where u.id = v_uid),
    'perfil', (select to_jsonb(p) from public.perfiles p where p.id = v_uid),
    'datos_privados', (select to_jsonb(pp) from public.perfiles_privados pp where pp.id = v_uid),
    'negocio', (select to_jsonb(n) from public.negocios n where n.id = v_uid),
    'parches_creados', coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en) from public.parches x where x.creador_id = v_uid), '[]'::jsonb),
    'parches_unidos', coalesce((select jsonb_agg(jsonb_build_object('parche', p.titulo, 'inicio', p.inicio, 'llegaste', m.checkin, 'como', m.checkin_metodo, 'te_uniste', m.creado_en) order by m.creado_en)
                                 from public.parche_miembros m join public.parches p on p.id = m.parche_id where m.usuario_id = v_uid), '[]'::jsonb),
    'mensajes', coalesce((select jsonb_agg(jsonb_build_object('parche', p.titulo, 'texto', m.texto, 'fecha', m.creado_en) order by m.creado_en)
                           from public.mensajes m join public.parches p on p.id = m.parche_id where m.autor_id = v_uid), '[]'::jsonb),
    'calificaciones_que_diste', coalesce((select jsonb_agg(jsonb_build_object('parche_id', c.parche_id, 'estrellas', c.estrellas, 'volverias', c.volver, 'fecha', c.creado_en)) from public.calificaciones c where c.autor_id = v_uid), '[]'::jsonb),
    'reportes_que_hiciste', coalesce((select jsonb_agg(jsonb_build_object('tipo', r.tipo, 'motivo', r.motivo, 'detalle', r.detalle, 'estado', r.estado, 'fecha', r.creado_en)) from public.reportes r where r.autor_id = v_uid), '[]'::jsonb),
    'mesas_reservadas', coalesce((select jsonb_agg(jsonb_build_object('codigo', r.codigo, 'personas', r.personas, 'llegada', r.llegada, 'estado', r.estado) order by r.llegada) from public.mesa_reservas r where r.usuario_id = v_uid), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('referencia', g.referencia, 'plan', g.plan, 'monto_centavos', g.monto_centavos, 'estado', g.estado, 'metodo', g.metodo, 'fecha', g.creado_en) order by g.creado_en) from public.pagos g where g.negocio_id = v_uid), '[]'::jsonb),
    'notificaciones', coalesce((select jsonb_agg(jsonb_build_object('texto', n.texto, 'fecha', n.creado_en) order by n.creado_en desc) from public.notificaciones n where n.usuario_id = v_uid), '[]'::jsonb),
    'consentimientos', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'version', c.version, 'aceptado', c.aceptado, 'origen', c.origen, 'fecha', c.creado_en) order by c.creado_en) from public.consentimientos c where c.usuario_id = v_uid), '[]'::jsonb)
  );
end $$;

-- =====================================================================
-- 7. TIEMPO REAL
-- =====================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['mesa_reservas', 'pagos'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
