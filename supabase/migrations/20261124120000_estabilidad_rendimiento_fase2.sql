-- =====================================================================
-- ModoParche · Fase 2: estabilidad, datos persistentes y rendimiento
--
-- Cómo aplicarlo: Supabase > SQL Editor > pestaña NUEVA > pegar SOLO este
-- archivo > Run. Va después de 20261123120000_seguridad_y_antifraude_fase1.
-- Se puede correr más de una vez y no borra datos.
-- =====================================================================

create or replace function private.parchear2(p_fn regprocedure, p_de text, p_a text)
returns void language plpgsql security definer set search_path = '' as $$
declare d text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
begin
  -- Normaliza saltos de línea (por si la función se creó desde Windows con CRLF)
  p_de := replace(p_de, E'\r\n', E'\n');
  p_a := replace(p_a, E'\r\n', E'\n');
  if position(p_a in d) > 0 then return; end if;
  if position(p_de in d) = 0 then raise exception 'No encontré el texto a cambiar en %: %', p_fn, left(p_de, 60); end if;
  execute replace(d, p_de, p_a);
end $$;

-- =====================================================================
-- 16. PLAN AL REGISTRARSE Y HORA DE COLOMBIA
-- (La zona horaria de las funciones se fija al final del archivo.)
-- =====================================================================
select private.parchear2('private.crear_perfil()'::regprocedure,
  E'      ''basico'',\n      case when v_plan in (''villavo'', ''sedes'') then v_plan end,',
  E'      case when v_plan in (''villavo'', ''sedes'') then ''villavo'' else ''basico'' end,\n      case when v_plan = ''sedes'' then ''sedes'' end,');

alter table public.cobros alter column periodo set default (date_trunc('month', now() at time zone 'America/Bogota'))::date;

-- Cobros sin liquidar que quedaron en el mes equivocado por la hora UTC
update public.cobros c
   set periodo = (date_trunc('month', c.creado_en at time zone 'America/Bogota'))::date
 where c.liquidacion_id is null and not c.anulado
   and c.periodo <> (date_trunc('month', c.creado_en at time zone 'America/Bogota'))::date;

-- Reclamos: los últimos 15 días aunque sean del mes anterior
select private.parchear2('public.mi_cuenta_cobros()'::regprocedure,
  E'    ''reclamos'', coalesce((',
  E'    ''reclamables_mes_anterior'', coalesce((
      select jsonb_agg(x order by x.creado_en desc) from (
        select c.id, c.tipo, c.personas, c.base_cop, c.monto_cop, c.validado_por, c.codigo, c.creado_en,
               private.nombre_corto(c.usuario_id) cliente,
               coalesce((select pa.titulo from public.parches pa where pa.id = c.parche_id),
                        (select mp.titulo from public.mesa_reservas mr join public.mesa_promos mp on mp.id = mr.promo_id where mr.id = c.reserva_id), '''') titulo,
               (select r.estado from public.reclamos_cobro r where r.cobro_id = c.id) reclamo,
               true reclamable
        from public.cobros c
        where c.negocio_id = uid and c.periodo < v_mes and not c.anulado and c.creado_en >= now() - interval ''15 days''
        order by c.creado_en desc limit 100) x), ''[]''::jsonb),
    ''reclamos'', coalesce((');

-- =====================================================================
-- 17. FORMULARIO DE CONTACTO Y EMPLEO
-- =====================================================================
create table if not exists public.mensajes_contacto (
  id         bigint generated always as identity primary key,
  nombre     text not null check (char_length(nombre) between 2 and 80),
  correo     text not null check (char_length(correo) between 5 and 120),
  motivo     text not null default 'contacto' check (motivo in ('contacto', 'empleo', 'negocio', 'prensa', 'otro')),
  mensaje    text not null check (char_length(mensaje) between 10 and 1500),
  estado     text not null default 'nuevo' check (estado in ('nuevo', 'atendido', 'archivado')),
  creado_en  timestamptz not null default now(),
  atendido_por uuid references auth.users (id) on delete set null,
  atendido_en  timestamptz
);
create index if not exists mensajes_contacto_estado_idx on public.mensajes_contacto (estado, creado_en desc);
alter table public.mensajes_contacto enable row level security;
revoke all on public.mensajes_contacto from public, anon, authenticated;

create or replace function public.enviar_contacto(p_nombre text, p_correo text, p_motivo text, p_mensaje text, p_sitio text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_h json; v_ip text; v_clave text;
  v_nombre text := left(private.texto_plano(trim(coalesce(p_nombre, ''))), 80);
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_mensaje text := left(private.texto_plano(trim(coalesce(p_mensaje, ''))), 1500);
  v_motivo text := case when p_motivo in ('contacto', 'empleo', 'negocio', 'prensa', 'otro') then p_motivo else 'contacto' end;
begin
  -- Campo oculto: un bot lo llena; se responde igual para no darle pistas
  if coalesce(p_sitio, '') <> '' then return jsonb_build_object('ok', true); end if;
  begin v_h := nullif(current_setting('request.headers', true), '')::json; exception when others then v_h := null; end;
  v_ip := split_part(coalesce(v_h ->> 'x-forwarded-for', 'sin-ip'), ',', 1);
  v_clave := 'contacto:' || encode(sha256(convert_to(v_ip, 'UTF8')), 'hex');
  if private.demasiados_intentos(v_clave, 3, interval '1 hour') or private.demasiados_intentos('contacto:todos', 60, interval '1 hour') then
    return jsonb_build_object('ok', false, 'codigo', 'DEMASIADOS', 'hint', 'Ya recibimos varios mensajes desde aquí. Intenta en un rato.');
  end if;
  if char_length(v_nombre) < 2 then return jsonb_build_object('ok', false, 'codigo', 'NOMBRE', 'hint', 'Escribe tu nombre.'); end if;
  if v_correo !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' or char_length(v_correo) > 120 then
    return jsonb_build_object('ok', false, 'codigo', 'CORREO', 'hint', 'Revisa tu correo.');
  end if;
  if char_length(v_mensaje) < 10 then return jsonb_build_object('ok', false, 'codigo', 'MENSAJE', 'hint', 'Cuéntanos un poco más.'); end if;
  perform private.anotar_intento(v_clave);
  perform private.anotar_intento('contacto:todos');
  insert into public.mensajes_contacto (nombre, correo, motivo, mensaje) values (v_nombre, v_correo, v_motivo, v_mensaje);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.enviar_contacto(text, text, text, text, text) from public;
grant execute on function public.enviar_contacto(text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_contacto()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_staff();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
    select id, nombre, correo, motivo, mensaje, estado, creado_en from public.mensajes_contacto
    order by (estado = 'nuevo') desc, creado_en desc limit 200) x), '[]'::jsonb);
end $$;
revoke all on function public.admin_contacto() from public, anon;
grant execute on function public.admin_contacto() to authenticated;

create or replace function public.admin_contacto_estado(p_id bigint, p_estado text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_staff();
  if p_estado not in ('nuevo', 'atendido', 'archivado') then raise exception 'ESTADO_INVALIDO' using errcode = 'P0001'; end if;
  update public.mensajes_contacto
     set estado = p_estado, atendido_por = case when p_estado = 'nuevo' then null else auth.uid() end,
         atendido_en = case when p_estado = 'nuevo' then null else now() end
   where id = p_id;
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002'; end if;
  perform private.registrar('contacto_' || p_estado, p_id::text, '');
end $$;
revoke all on function public.admin_contacto_estado(bigint, text) from public, anon;
grant execute on function public.admin_contacto_estado(bigint, text) to authenticated;

-- =====================================================================
-- 18. CUPONES, WALK-INS E INSIGNIAS
-- =====================================================================
create table if not exists public.cupones_emitidos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  negocio_id    uuid not null references public.negocios (id) on delete cascade,
  cupon_id      text not null,
  cup_nombre    text not null,
  cup_beneficio text not null,
  usuario_id    uuid references auth.users (id) on delete set null,
  persona       text not null default '',
  parche_id     uuid references public.parches (id) on delete set null,
  emitido_en    timestamptz not null default now(),
  vence_en      timestamptz not null,
  canjeado_en   timestamptz,
  canjeado_por  uuid references auth.users (id) on delete set null
);
create unique index if not exists cupones_emitidos_unico_idx
  on public.cupones_emitidos (negocio_id, cupon_id, parche_id, coalesce(usuario_id::text, persona)) where parche_id is not null;
create index if not exists cupones_emitidos_negocio_idx on public.cupones_emitidos (negocio_id, emitido_en desc);
create index if not exists cupones_emitidos_usuario_idx on public.cupones_emitidos (usuario_id, emitido_en desc) where usuario_id is not null;
alter table public.cupones_emitidos enable row level security;
revoke all on public.cupones_emitidos from public, anon, authenticated;

-- Código con 50 bits al azar (alfabeto sin 0/O ni 1/I)
create or replace function private.codigo_cupon(p_prefijo text)
returns text language plpgsql volatile set search_path = '' as $$
declare
  a text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  c bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  s text := ''; i int;
begin
  for i in 0..4 loop s := s || substr(a, (get_byte(b, i) % 32) + 1, 1) || substr(a, (get_byte(c, i) % 32) + 1, 1); end loop;
  return (case when upper(coalesce(p_prefijo, '')) ~ '^[A-Z0-9]{1,8}$' then upper(p_prefijo) else 'MP' end) || '-' || s;
end $$;
revoke all on function private.codigo_cupon(text) from public, anon, authenticated;

create or replace function private.cupon_json(c public.cupones_emitidos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('codigo', c.codigo, 'cuponId', c.cupon_id, 'cupNombre', c.cup_nombre, 'cupBen', c.cup_beneficio,
    'persona', c.persona, 'usuarioId', c.usuario_id, 'parcheId', c.parche_id, 'emitido', c.emitido_en, 'vence', c.vence_en, 'canjeado', c.canjeado_en)
$$;

create or replace function public.emitir_cupon(
  p_parche uuid, p_usuario uuid, p_cupon text, p_persona text, p_nombre text, p_beneficio text, p_prefijo text, p_vence timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.cupones_emitidos%rowtype; k jsonb; v_lim int; v_n int; i int := 0;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not exists (select 1 from public.negocios n where n.id = uid) then raise exception 'NO_ES_NEGOCIO' using errcode = '42501'; end if;
  if p_parche is not null and not exists (select 1 from public.parches p where p.id = p_parche and p.creador_id = uid) then
    raise exception 'NO_ES_TUYO' using errcode = '42501';
  end if;
  if p_usuario is not null and p_parche is not null and not public.es_miembro(p_parche, p_usuario) then
    raise exception 'NO_ESTA_EN_PARCHE' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_cupon, '')) not between 1 and 60 then raise exception 'CUPON_INVALIDO' using errcode = 'P0001'; end if;
  if p_vence is null or p_vence <= now() or p_vence > now() + interval '366 days' then raise exception 'VENCE_INVALIDO' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext('cupon:' || uid::text || ':' || p_cupon));
  -- Quien ya lo tiene lo conserva aunque el cupón se haya agotado o pausado después
  select * into r from public.cupones_emitidos e
   where e.negocio_id = uid and e.cupon_id = p_cupon and e.parche_id = p_parche
     and coalesce(e.usuario_id::text, e.persona) = coalesce(p_usuario::text, left(trim(coalesce(p_persona, '')), 80));
  if found then return jsonb_build_object('ok', true, 'nuevo', false, 'cupon', private.cupon_json(r)); end if;

  select e into k from public.negocios n, jsonb_array_elements(case when jsonb_typeof(n.cupones) = 'array' then n.cupones else '[]'::jsonb end) e
   where n.id = uid and e ->> 'id' = p_cupon limit 1;
  if k is not null then
    if coalesce(k ->> 'estado', 'activo') <> 'activo' then return jsonb_build_object('ok', false, 'codigo', 'PAUSADO'); end if;
    v_lim := case when (k ->> 'limite') ~ '^[0-9]+$' then (k ->> 'limite')::int end;
    if v_lim is not null then
      select count(*) into v_n from public.cupones_emitidos e where e.negocio_id = uid and e.cupon_id = p_cupon;
      if v_n >= v_lim then return jsonb_build_object('ok', false, 'codigo', 'AGOTADO'); end if;
    end if;
  end if;

  loop
    begin
      insert into public.cupones_emitidos (codigo, negocio_id, cupon_id, cup_nombre, cup_beneficio, usuario_id, persona, parche_id, vence_en)
      values (private.codigo_cupon(p_prefijo), uid, p_cupon,
              left(private.texto_plano(coalesce(k ->> 'nombre', p_nombre, 'Cupón')), 80),
              left(private.texto_plano(coalesce(k ->> 'beneficio', p_beneficio, '')), 160),
              p_usuario, left(trim(coalesce(p_persona, '')), 80), p_parche, p_vence)
      returning * into r;
      exit;
    exception when unique_violation then
      i := i + 1;
      if i > 4 then raise; end if;
    end;
  end loop;
  if p_usuario is not null then
    insert into public.notificaciones (usuario_id, icono, texto, parche_id)
    values (p_usuario, 'i-ticket', 'Ganaste un cupón: <b>' || r.cup_beneficio || '</b>. Míralo en tu perfil.', p_parche);
  end if;
  return jsonb_build_object('ok', true, 'nuevo', true, 'cupon', private.cupon_json(r));
end $$;
revoke all on function public.emitir_cupon(uuid, uuid, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.emitir_cupon(uuid, uuid, text, text, text, text, text, timestamptz) to authenticated;

-- Canje atómico: dos puertas a la vez no pueden canjear el mismo código
create or replace function public.canjear_cupon(p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v text := upper(trim(coalesce(p_codigo, ''))); r public.cupones_emitidos%rowtype;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.cupones_emitidos set canjeado_en = now(), canjeado_por = uid
   where codigo = v and negocio_id = uid and canjeado_en is null and vence_en > now()
   returning * into r;
  if found then return jsonb_build_object('ok', true, 'cupon', private.cupon_json(r)); end if;
  select * into r from public.cupones_emitidos where codigo = v;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'NO_EXISTE'); end if;
  if r.negocio_id <> uid then return jsonb_build_object('ok', false, 'codigo', 'OTRO_LOCAL'); end if;
  if r.canjeado_en is not null then return jsonb_build_object('ok', false, 'codigo', 'YA_CANJEADO', 'cupon', private.cupon_json(r)); end if;
  return jsonb_build_object('ok', false, 'codigo', 'VENCIDO', 'cupon', private.cupon_json(r));
end $$;
revoke all on function public.canjear_cupon(text) from public, anon;
grant execute on function public.canjear_cupon(text) to authenticated;

create or replace function public.deshacer_canje(p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.cupones_emitidos%rowtype;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.cupones_emitidos set canjeado_en = null, canjeado_por = null
   where codigo = upper(trim(coalesce(p_codigo, ''))) and negocio_id = uid and canjeado_en > now() - interval '15 minutes'
   returning * into r;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'NO_SE_PUEDE'); end if;
  return jsonb_build_object('ok', true, 'cupon', private.cupon_json(r));
end $$;
revoke all on function public.deshacer_canje(text) from public, anon;
grant execute on function public.deshacer_canje(text) to authenticated;

-- Deshacer una llegada retira el cupón automático que aún no se ha usado
create or replace function public.anular_cupon(p_codigo text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  delete from public.cupones_emitidos
   where codigo = upper(trim(coalesce(p_codigo, ''))) and negocio_id = auth.uid() and canjeado_en is null;
  return found;
end $$;
revoke all on function public.anular_cupon(text) from public, anon;
grant execute on function public.anular_cupon(text) to authenticated;

create or replace function public.cupones_del_negocio()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.cupon_json(x) order by x.emitido_en desc), '[]'::jsonb)
  from (select * from public.cupones_emitidos where negocio_id = auth.uid() order by emitido_en desc limit 1000) x
$$;
revoke all on function public.cupones_del_negocio() from public, anon;
grant execute on function public.cupones_del_negocio() to authenticated;

-- Pasa una sola vez los códigos que estaban solo en el navegador del local
create or replace function public.importar_cupones_locales(p_lista jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e jsonb; v_n int := 0; v_c int; v_parche uuid;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not exists (select 1 from public.negocios n where n.id = uid) then raise exception 'NO_ES_NEGOCIO' using errcode = '42501'; end if;
  if jsonb_typeof(p_lista) <> 'array' or jsonb_array_length(p_lista) > 500 then raise exception 'LISTA_INVALIDA' using errcode = 'P0001'; end if;
  for e in select * from jsonb_array_elements(p_lista) loop
    continue when upper(coalesce(e ->> 'codigo', '')) !~ '^[A-Z0-9]{1,8}-[A-Z0-9]{4,12}$' or (e ->> 'cuponId') is null;
    continue when (e ->> 'emitido') !~ '^[0-9]{10,14}$' or (e ->> 'vence') !~ '^[0-9]{10,14}$';
    v_parche := null;
    if (e ->> 'parcheId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select p.id into v_parche from public.parches p where p.id = (e ->> 'parcheId')::uuid and p.creador_id = uid;
    end if;
    begin
      insert into public.cupones_emitidos (codigo, negocio_id, cupon_id, cup_nombre, cup_beneficio, persona, parche_id, emitido_en, vence_en, canjeado_en, canjeado_por)
      values (upper(e ->> 'codigo'), uid, left(e ->> 'cuponId', 60),
              left(private.texto_plano(coalesce(e ->> 'cupNombre', 'Cupón')), 80), left(private.texto_plano(coalesce(e ->> 'cupBen', '')), 160),
              left(coalesce(e ->> 'persona', ''), 80), v_parche,
              to_timestamp((e ->> 'emitido')::bigint / 1000.0), to_timestamp((e ->> 'vence')::bigint / 1000.0),
              case when (e ->> 'canjeado') ~ '^[0-9]{10,14}$' then to_timestamp((e ->> 'canjeado')::bigint / 1000.0) end,
              case when (e ->> 'canjeado') ~ '^[0-9]{10,14}$' then uid end)
      on conflict do nothing;
      get diagnostics v_c = row_count;
      v_n := v_n + v_c;
    exception when others then null;
    end;
  end loop;
  return v_n;
end $$;
revoke all on function public.importar_cupones_locales(jsonb) from public, anon;
grant execute on function public.importar_cupones_locales(jsonb) to authenticated;

create or replace function public.mis_cupones()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.cupon_json(e) || jsonb_build_object('negocio', n.nombre) order by e.emitido_en desc), '[]'::jsonb)
  from public.cupones_emitidos e join public.negocios n on n.id = e.negocio_id
  where e.usuario_id = auth.uid() and e.emitido_en > now() - interval '1 year'
$$;
revoke all on function public.mis_cupones() from public, anon;
grant execute on function public.mis_cupones() to authenticated;

-- Walk-ins: quienes llegaron sin confirmar en la app
create table if not exists public.parche_walkins (
  id         uuid primary key default gen_random_uuid(),
  parche_id  uuid not null references public.parches (id) on delete cascade,
  negocio_id uuid not null default auth.uid() references public.negocios (id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 80),
  llego_en   timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists parche_walkins_parche_idx on public.parche_walkins (parche_id);
create index if not exists parche_walkins_negocio_idx on public.parche_walkins (negocio_id);
alter table public.parche_walkins enable row level security;
revoke all on public.parche_walkins from public, anon, authenticated;
grant select, delete on public.parche_walkins to authenticated;
grant insert (id, parche_id, nombre, llego_en), update (llego_en) on public.parche_walkins to authenticated;
drop policy if exists "walkins: ver los míos" on public.parche_walkins;
create policy "walkins: ver los míos" on public.parche_walkins for select to authenticated using (negocio_id = (select auth.uid()));
drop policy if exists "walkins: crear en mis parches" on public.parche_walkins;
create policy "walkins: crear en mis parches" on public.parche_walkins for insert to authenticated
  with check (negocio_id = (select auth.uid()) and exists (select 1 from public.parches p where p.id = parche_id and p.creador_id = (select auth.uid())));
drop policy if exists "walkins: editar los míos" on public.parche_walkins;
create policy "walkins: editar los míos" on public.parche_walkins for update to authenticated
  using (negocio_id = (select auth.uid())) with check (negocio_id = (select auth.uid()));
drop policy if exists "walkins: borrar los míos" on public.parche_walkins;
create policy "walkins: borrar los míos" on public.parche_walkins for delete to authenticated using (negocio_id = (select auth.uid()));

-- Insignias: una vez ganadas no se pierden
create table if not exists public.usuario_insignias (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  insignia   text not null,
  ganada_en  timestamptz not null default now(),
  primary key (usuario_id, insignia)
);
alter table public.usuario_insignias enable row level security;
revoke all on public.usuario_insignias from public, anon, authenticated;
grant select on public.usuario_insignias to authenticated;
drop policy if exists "insignias: ver las mías" on public.usuario_insignias;
create policy "insignias: ver las mías" on public.usuario_insignias for select to authenticated using (usuario_id = (select auth.uid()));

create or replace function public.mis_insignias()
returns text[] language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v text[];
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  insert into public.usuario_insignias (usuario_id, insignia)
  select uid, x.k from (
    select 'medalla-el-armador' k where exists (select 1 from public.parches p where p.creador_id = uid and not p.demo)
    union all select 'medalla-firme-parche' where (select count(*) from public.parche_miembros m join public.parches p on p.id = m.parche_id
                                                    where m.usuario_id = uid and p.creador_id is distinct from uid) >= 3
    union all select 'medalla-cero-fantasma' where exists (select 1 from public.parche_miembros m where m.usuario_id = uid and m.checkin)
    union all select 'medalla-buena-vibra' where exists (select 1 from public.perfiles f where f.id = uid and f.resenas >= 3 and f.rating >= 4.5)
    union all select c.k from (values ('medalla-rumbero-oficial', 'rumba'), ('medalla-catador-bajon', 'comida'),
                                      ('medalla-crack-deporte', 'deportes'), ('medalla-rey-mirador', 'pueblear')) c(k, cat)
      where exists (select 1 from public.parche_miembros m join public.parches p on p.id = m.parche_id
                    where m.usuario_id = uid and p.categoria = c.cat)
  ) x
  on conflict do nothing;
  select coalesce(array_agg(insignia), '{}') into v from public.usuario_insignias where usuario_id = uid;
  return v;
end $$;
revoke all on function public.mis_insignias() from public, anon;
grant execute on function public.mis_insignias() to authenticated;

-- =====================================================================
-- 19. COMUNIDAD: AVISOS, SPAM, VIAJES, INVITACIONES Y RATING
-- =====================================================================
alter table public.notificaciones add column if not exists dedup_key text;
create index if not exists notificaciones_dedup_idx on public.notificaciones (usuario_id, dedup_key, creado_en desc) where dedup_key is not null;
update public.notificaciones
   set dedup_key = substring(texto from '<!--(dm:[0-9a-f-]{36})-->'),
       texto = regexp_replace(texto, '<!--dm:[0-9a-f-]{36}-->', '', 'g')
 where texto like '%<!--dm:%';

create or replace function private.avisar_dm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_clave text := 'dm:' || new.autor_id::text;
begin
  if exists (select 1 from public.notificaciones n where n.usuario_id = new.para_id and n.dedup_key = v_clave
               and n.creado_en > now() - interval '10 minutes') then
    return new;
  end if;
  insert into public.notificaciones (usuario_id, icono, texto, dedup_key)
  values (new.para_id, 'i-chat', left('<b>' || private.texto_plano(private.nombre_corto(new.autor_id)) || '</b> te escribió: '
          || private.texto_plano(left(new.texto, 90)) || case when char_length(new.texto) > 90 then '…' else '' end, 250), v_clave);
  return new;
end $$;

select private.parchear2('private.frenar_spam()'::regprocedure,
  E'  if tg_table_name = ''mensajes'' then\n    select count(*) filter',
  E'  if tg_table_name = ''mensajes'' then\n    -- Los mensajes del sistema no tienen autor y no cuentan\n    if new.autor_id is null then return new; end if;\n    select count(*) filter');
select private.parchear2('private.frenar_spam()'::regprocedure,
  E'  elsif tg_table_name = ''parches'' then\n    select count(*) into n_largo',
  E'  elsif tg_table_name = ''parches'' then\n    -- Los planes sin límite no se frenan por cantidad diaria\n    if exists (select 1 from public.negocios n where n.id = uid and n.plan in (''villavo'', ''sedes'')) then return new; end if;\n    select count(*) into n_largo');

-- Al salirse de un parche ya no ofrece ni ocupa puesto en sus viajes
create or replace function private.limpiar_viajes_al_salir()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.viaje_pasajeros vp using public.viajes v
   where vp.viaje_id = v.id and v.parche_id = old.parche_id and vp.usuario_id = old.usuario_id;
  delete from public.viajes where parche_id = old.parche_id and usuario_id = old.usuario_id;
  return null;
end $$;
drop trigger if exists limpiar_viajes_al_salir on public.parche_miembros;
create trigger limpiar_viajes_al_salir after delete on public.parche_miembros
  for each row execute function private.limpiar_viajes_al_salir();

select private.parchear2('public.invitar_a_parche(uuid, uuid[])'::regprocedure,
  E'    if v_id <> auth.uid()\n       and exists',
  E'    if v_id <> auth.uid()\n       and not public.hay_bloqueo(auth.uid(), v_id) and not public.hay_bloqueo(v_id, auth.uid())\n       and exists');

create or replace function private.tras_borrar_calificacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.perfiles p
     set rating = coalesce((select round(avg(c.estrellas)::numeric, 1) from public.calificaciones c where c.calificado_id = old.calificado_id), 0),
         resenas = (select count(*) from public.calificaciones c where c.calificado_id = old.calificado_id)
   where p.id = old.calificado_id;
  return null;
end $$;
drop trigger if exists calificaciones_al_borrar on public.calificaciones;
create trigger calificaciones_al_borrar after delete on public.calificaciones
  for each row execute function private.tras_borrar_calificacion();

-- =====================================================================
-- 20. RELÁMPAGO TERMINADO Y NOMBRE DEL NEGOCIO
-- =====================================================================
alter table public.parches add column if not exists terminado_en timestamptz;

create or replace function public.terminar_relampago(p_parche uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.parches set terminado_en = now()
   where id = p_parche and creador_id = auth.uid() and relampago and terminado_en is null;
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese relámpago ya terminó o no es tuyo.'; end if;
end $$;
revoke all on function public.terminar_relampago(uuid) from public, anon;
grant execute on function public.terminar_relampago(uuid) to authenticated;

drop policy if exists "parches: ocultar relámpagos terminados" on public.parches;
create policy "parches: ocultar relámpagos terminados" on public.parches as restrictive for select to authenticated
  using (terminado_en is null or creador_id = (select auth.uid()) or public.es_miembro(id, (select auth.uid())));

create or replace function private.no_unirse_a_terminado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.parches p where p.id = new.parche_id and p.terminado_en is not null and p.creador_id is distinct from new.usuario_id) then
    raise exception 'PARCHE_TERMINADO' using errcode = 'P0001', hint = 'Este relámpago ya terminó.';
  end if;
  return new;
end $$;
drop trigger if exists a_no_unirse_a_terminado on public.parche_miembros;
create trigger a_no_unirse_a_terminado before insert on public.parche_miembros
  for each row execute function private.no_unirse_a_terminado();

-- El nombre del negocio se copia a su perfil y a sus parches futuros
create or replace function private.sincronizar_nombre_negocio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.perfiles set nombre = new.nombre where id = new.id and nombre is distinct from new.nombre;
  update public.parches set creador_nombre = new.nombre
   where creador_id = new.id and inicio > now() and creador_nombre is distinct from new.nombre;
  return null;
end $$;
drop trigger if exists sincronizar_nombre_negocio on public.negocios;
create trigger sincronizar_nombre_negocio after update of nombre on public.negocios
  for each row when (old.nombre is distinct from new.nombre) execute function private.sincronizar_nombre_negocio();

-- =====================================================================
-- 21. BITÁCORA DEL PANEL ADMIN
-- =====================================================================
select private.parchear2('public.admin_marcar_liquidacion(bigint, text, text)'::regprocedure,
  E'  if not found then raise exception ''NO_EXISTE'' using errcode = ''P0002''; end if;\nend',
  E'  if not found then raise exception ''NO_EXISTE'' using errcode = ''P0002''; end if;\n  perform private.registrar(case p_estado when ''pagada'' then ''liquidacion_pagada'' when ''anulada'' then ''liquidacion_anulada'' else ''liquidacion_reabierta'' end, p_id::text, coalesce(left(p_nota, 120), ''''));\nend');
select private.parchear2('public.admin_resolver_reclamo(bigint, boolean, text)'::regprocedure,
  E'  insert into public.notificaciones (usuario_id, icono, texto)\n  values (r.negocio_id, case when p_aprobar',
  E'  perform private.registrar(case when p_aprobar then ''reclamo_aprobado'' else ''reclamo_rechazado'' end, c.codigo, coalesce(left(p_nota, 120), ''''));\n  insert into public.notificaciones (usuario_id, icono, texto)\n  values (r.negocio_id, case when p_aprobar');
create or replace function public.admin_generar_liquidaciones()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  perform private.exigir_admin();
  v_n := private.generar_liquidaciones();
  perform private.registrar('liquidaciones_generadas', v_n::text, '');
  return v_n;
end $$;
select private.parchear2('public.admin_imagen_oficial(uuid, text)'::regprocedure,
  E'  perform set_config(''mp.edicion_admin'', ''0'', true);\nend',
  E'  perform set_config(''mp.edicion_admin'', ''0'', true);\n  perform private.registrar(''parche_oficial'', p_parche::text, ''imagen'');\nend');

-- Bitácora del CSV: el navegador solo puede anotar esta acción
create or replace function public.admin_registrar_exportacion(p_filas integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  perform private.registrar('exportar_liquidaciones', 'CSV', greatest(coalesce(p_filas, 0), 0)::text || ' filas');
end $$;
revoke all on function public.admin_registrar_exportacion(integer) from public, anon;
grant execute on function public.admin_registrar_exportacion(integer) to authenticated;

-- Ingreso real del mes para el panel
create or replace function public.admin_ingreso_mes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_mes date := (date_trunc('month', now() at time zone 'America/Bogota'))::date;
begin
  perform private.exigir_admin();
  return jsonb_build_object(
    'periodo', v_mes,
    'causado', coalesce((select sum(monto_cop) from public.cobros where periodo = v_mes and not anulado), 0),
    'clientes', coalesce((select sum(personas) from public.cobros where periodo = v_mes and not anulado), 0),
    'recaudado', coalesce((select sum(p.monto_centavos) / 100 from public.pagos p
                           where p.estado = 'APPROVED' and p.plan = 'liquidacion'
                             and p.creado_en >= (v_mes::timestamp at time zone 'America/Bogota')), 0));
end $$;
revoke all on function public.admin_ingreso_mes() from public, anon;
grant execute on function public.admin_ingreso_mes() to authenticated;

-- =====================================================================
-- 23. REALTIME Y AVISOS MASIVOS
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rutas') then
    alter publication supabase_realtime drop table public.rutas;
  end if;
end $$;

select private.parchear2('private.avisar_chat()'::regprocedure,
  E'  if v_titulo is null then return new; end if;',
  E'  if v_titulo is null then return new; end if;\n  -- Parches oficiales o masivos: el chat se ve en vivo, sin una notificación por persona\n  if exists (select 1 from public.parches p where p.id = new.parche_id and p.oficial)\n     or (select count(*) from (select 1 from public.parche_miembros m where m.parche_id = new.parche_id limit 51) t) > 50 then\n    return new;\n  end if;');

-- =====================================================================
-- 24. ÍNDICES, MORA SIN SUBCONSULTA POR FILA, CONSULTAS Y PAGINACIÓN
-- =====================================================================
create index if not exists mensajes_directos_autor_idx on public.mensajes_directos (autor_id, creado_en desc);
create index if not exists mensajes_directos_sin_leer_idx on public.mensajes_directos (para_id, autor_id) where leido_en is null;
create index if not exists cobros_usuario_idx on public.cobros (usuario_id, creado_en desc);
create index if not exists cobros_liquidacion_idx on public.cobros (liquidacion_id);
create index if not exists cobros_negocio_fecha_idx on public.cobros (negocio_id, creado_en desc);
create index if not exists liquidaciones_estado_idx on public.liquidaciones (negocio_id, estado, vence);
create index if not exists qr_identidad_vence_idx on public.qr_identidad (vence);
create index if not exists calificaciones_autor_idx on public.calificaciones (autor_id);
create index if not exists ubicaciones_vivas_usuario_idx on public.ubicaciones_vivas (usuario_id, creado_en desc);
create index if not exists fotos_parche_usuario_idx on public.fotos_parche (usuario_id, creado_en desc);
create index if not exists lista_espera_fecha_idx on public.lista_espera (parche_id, creado_en);
create index if not exists amistades_solicitante_idx on public.amistades (solicitante, creado_en desc);
create index if not exists reportes_autor_idx on public.reportes (autor_id, creado_en desc);
create index if not exists mensajes_responde_idx on public.mensajes (responde_a) where responde_a is not null;
create index if not exists mensajes_encuesta_idx on public.mensajes (encuesta_id) where encuesta_id is not null;
create index if not exists notificaciones_parche_idx on public.notificaciones (parche_id) where parche_id is not null;
create index if not exists parches_inicio_idx on public.parches (inicio, id);
create index if not exists parche_miembros_usuario_idx on public.parche_miembros (usuario_id);

-- Negocios en mora. Tabla privada y no columna de negocios: esa tabla se puede
-- leer desde la app y la deuda de un local no debe quedar a la vista.
create table if not exists private.negocios_mora (negocio_id uuid primary key references public.negocios (id) on delete cascade);

create or replace function private.sincronizar_mora(p_negocio uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_negocio is null or not exists (select 1 from public.negocios n where n.id = p_negocio) then return; end if;
  if private.negocio_en_mora(p_negocio) then
    insert into private.negocios_mora (negocio_id) values (p_negocio) on conflict do nothing;
  else
    delete from private.negocios_mora where negocio_id = p_negocio;
  end if;
end $$;

create or replace function private.mora_tras_liquidacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sincronizar_mora(coalesce(new.negocio_id, old.negocio_id));
  if tg_op = 'UPDATE' and new.negocio_id is distinct from old.negocio_id then perform private.sincronizar_mora(old.negocio_id); end if;
  return null;
end $$;
drop trigger if exists mora_tras_liquidacion on public.liquidaciones;
create trigger mora_tras_liquidacion after insert or update or delete on public.liquidaciones
  for each row execute function private.mora_tras_liquidacion();

create or replace function private.refrescar_mora()
returns void language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  delete from private.negocios_mora m where not private.negocio_en_mora(m.negocio_id);
  for g in select distinct l.negocio_id from public.liquidaciones l where l.estado = 'pendiente' and l.negocio_id is not null loop
    perform private.sincronizar_mora(g.negocio_id);
  end loop;
end $$;
select private.refrescar_mora();

create or replace function seguridad.ids_en_mora()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(negocio_id), '{}') from private.negocios_mora
$$;
revoke all on function seguridad.ids_en_mora() from public, anon;
grant execute on function seguridad.ids_en_mora() to authenticated;

drop policy if exists "cobro: ocultar parches de negocios en mora" on public.parches;
create policy "cobro: ocultar parches de negocios en mora" on public.parches as restrictive for select to authenticated
  using (creador_id = (select auth.uid()) or not coalesce(aliado, false)
         or not (creador_id = any ((select seguridad.ids_en_mora())::uuid[])));

select private.parchear2('private.limpieza_diaria()'::regprocedure,
  E'  delete from public.ubicaciones_vivas where',
  E'  perform private.refrescar_mora();\n  delete from public.ubicaciones_vivas where');

-- Amigos con el último mensaje en una sola búsqueda por conversación
create or replace function public.mis_amigos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_yo uuid := auth.uid();
begin
  if v_yo is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  return jsonb_build_object(
    'amigos', coalesce((
      select jsonb_agg(x order by x.ultimo_en desc nulls last, x.nombre) from (
        select o.id, p.nombre, coalesce(p.verificado, false) verificado,
               u.texto ultimo, (u.autor_id = v_yo) ultimo_mio, u.creado_en ultimo_en, coalesce(l.n, 0) sin_leer
        from public.amistades f
        cross join lateral (select case when f.a = v_yo then f.b else f.a end id) o
        join public.perfiles p on p.id = o.id
        left join lateral (
          select m.texto, m.autor_id, m.creado_en from public.mensajes_directos m
          where least(m.autor_id, m.para_id) = least(v_yo, o.id) and greatest(m.autor_id, m.para_id) = greatest(v_yo, o.id)
          order by m.creado_en desc limit 1) u on true
        left join lateral (
          select count(*) n from public.mensajes_directos m
          where m.para_id = v_yo and m.autor_id = o.id and m.leido_en is null) l on true
        where v_yo in (f.a, f.b) and f.estado = 'aceptada') x), '[]'::jsonb),
    'recibidas', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.solicitante, 'nombre', p.nombre, 'verificado', coalesce(p.verificado, false), 'creado_en', f.creado_en) order by f.creado_en desc)
      from public.amistades f join public.perfiles p on p.id = f.solicitante
      where v_yo in (f.a, f.b) and f.estado = 'pendiente' and f.solicitante <> v_yo), '[]'::jsonb),
    'enviadas', coalesce((
      select jsonb_agg(jsonb_build_object('id', case when f.a = v_yo then f.b else f.a end, 'nombre', p.nombre) order by f.creado_en desc)
      from public.amistades f join public.perfiles p on p.id = case when f.a = v_yo then f.b else f.a end
      where f.solicitante = v_yo and f.estado = 'pendiente'), '[]'::jsonb),
    'sugeridos', coalesce((
      select jsonb_agg(s order by s.veces desc, s.nombre) from (
        select o.usuario_id id, p.nombre, coalesce(p.verificado, false) verificado, count(*) veces
        from public.parche_miembros yo
        join public.parche_miembros o on o.parche_id = yo.parche_id and o.usuario_id <> yo.usuario_id
        join public.perfiles p on p.id = o.usuario_id
        where yo.usuario_id = v_yo
          and not exists (select 1 from public.negocios n where n.id = o.usuario_id)
          and not exists (select 1 from public.amistades f where f.a = least(v_yo, o.usuario_id) and f.b = greatest(v_yo, o.usuario_id))
          and not exists (select 1 from public.bloqueos bl where (bl.bloqueador = v_yo and bl.bloqueado = o.usuario_id) or (bl.bloqueador = o.usuario_id and bl.bloqueado = v_yo))
        group by o.usuario_id, p.nombre, p.verificado
        order by count(*) desc limit 20) s), '[]'::jsonb)
  );
end $$;

-- Métricas sin tablas temporales (funcionan en réplicas y no inflan el catálogo)
create or replace view private.metricas_personas as
  select p.* from public.perfiles p
  where not exists (select 1 from public.negocios n where n.id = p.id)
    and not exists (select 1 from public.admins a where a.id = p.id);
create or replace view private.metricas_parches as
  select p.id, p.titulo, p.categoria, p.inicio, p.creado_en, p.cupos_max, p.creador_id, p.aliado, p.lugar, p.creador_nombre,
         coalesce(c.miembros, 0)::int as miembros, coalesce(c.checkins, 0)::int as checkins
  from public.parches p
  left join (select m.parche_id, count(*) miembros, count(*) filter (where m.checkin) checkins
             from public.parche_miembros m group by m.parche_id) c on c.parche_id = p.id
  where not p.demo;
create or replace view private.metricas_uniones as
  select m.usuario_id, m.creado_en from public.parche_miembros m join public.parches p on p.id = m.parche_id
  where m.usuario_id is distinct from p.creador_id;
revoke all on private.metricas_personas, private.metricas_parches, private.metricas_uniones from public, anon, authenticated;

do $$
declare
  f regprocedure;
  d text; a int; b int;
  fin text := 'where m.usuario_id is distinct from p.creador_id;';
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc like '%create temp table _per%' loop
    d := pg_get_functiondef(f);
    a := position('drop table if exists pg_temp._per;' in d);
    b := position(fin in d);
    if a > 0 and b > a then d := left(d, a - 1) || substr(d, b + char_length(fin)); end if;
    d := replace(replace(replace(d, 'pg_temp._per', 'private.metricas_personas'), 'pg_temp._par', 'private.metricas_parches'), 'pg_temp._uni', 'private.metricas_uniones');
    execute d;
  end loop;
end $$;

-- Radar paginado: parches con sus miembros en una sola llamada (respeta RLS)
create or replace function public.parches_radar(p_desde timestamptz, p_limite integer default 150, p_inicio timestamptz default null, p_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('miembros', coalesce((
           select jsonb_agg(jsonb_build_object('parche_id', m.parche_id, 'usuario_id', m.usuario_id, 'checkin', m.checkin,
                    'calificado', m.calificado, 'creado_en', m.creado_en, 'checkin_metodo', m.checkin_metodo,
                    'checkin_en', m.checkin_en, 'localidad', m.localidad))
           from public.parche_miembros m where m.parche_id = p.id), '[]'::jsonb)) order by p.inicio, p.id), '[]'::jsonb)
  from (
    select * from public.parches x
    where x.inicio >= p_desde
      and (p_inicio is null or (x.inicio, x.id) > (p_inicio, p_id))
    order by x.inicio, x.id
    limit least(greatest(coalesce(p_limite, 150), 1), 300)
  ) p
$$;
revoke all on function public.parches_radar(timestamptz, integer, timestamptz, uuid) from public, anon;
grant execute on function public.parches_radar(timestamptz, integer, timestamptz, uuid) to authenticated;

-- Cuentas del panel con búsqueda y páginas en el servidor
do $$
declare d text := replace(pg_get_functiondef('public.admin_cuentas()'::regprocedure), E'\r\n', E'\n');
begin
  d := replace(d, 'public.admin_cuentas()', 'public.admin_cuentas_pagina(p_q text default null, p_limite integer default 100, p_offset integer default 0)');
  d := replace(d, E'    order by u.created_at desc\n    limit 3000',
    E'    where v_q is null or u.email ilike v_q or coalesce(a.nombre, n.nombre, p.nombre, '''') ilike v_q\n    order by u.created_at desc\n    limit least(greatest(coalesce(p_limite, 100), 1), 200) offset greatest(coalesce(p_offset, 0), 0)');
  d := replace(d, 'declare r jsonb; v_total boolean;',
    E'declare r jsonb; v_total boolean;\n  v_q text := nullif(''%'' || replace(replace(replace(left(trim(coalesce(p_q, '''')), 60), ''\\'', ''\\\\''), ''%'', ''\\%''), ''_'', ''\\_'') || ''%'', ''%%'');');
  execute 'drop function if exists public.admin_cuentas_pagina(text, integer, integer)';
  execute d;
end $$;
revoke all on function public.admin_cuentas_pagina(text, integer, integer) from public, anon;
grant execute on function public.admin_cuentas_pagina(text, integer, integer) to authenticated;

-- =====================================================================
-- 16 (cierre). TODAS LAS FECHAS DE NEGOCIO EN HORA DE COLOMBIA
-- Fijar la zona en cada función evita que un corte caiga en otro mes
-- entre las 7 p. m. y la medianoche del último día.
-- =====================================================================
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'seguridad') and p.prokind = 'f'
      and p.prosrc ~* 'current_date|date_trunc|::date|to_char'
      and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
  loop
    execute format('alter function %s set timezone to %L', f, 'America/Bogota');
  end loop;
end $$;

drop function if exists private.parchear2(regprocedure, text, text);
