-- =====================================================================
-- ModoParche · Panel admin v2
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Corre después de 20261029120000_panel_admin.sql. Se puede correr más de
-- una vez sin romper nada.
--
-- Qué agrega:
--   1. Roles del equipo: admin (todo) y moderador (chats, reportes, notas
--      y calificaciones; no ve cédulas ni teléfonos, no suspende, no
--      cambia planes ni edita parches).
--   2. Reportes de la comunidad: las personas reportan a alguien, un
--      parche o un mensaje; el equipo los resuelve o descarta.
--   3. Verificación de negocios: sello que solo da un admin.
--   4. Notas internas y advertencias formales sobre una cuenta.
--   5. Métricas por rango de fechas (para el informe).
--   6. Calificaciones: revisar, detectar las sospechosas y anularlas.
--   7. Retención por semana de registro.
--   8. Editar cualquier parche y renovar los de ejemplo.
--
-- Roles (solo desde la base de datos):
--   select private.crear_admin('correo@dominio.com', 'Contraseña123', 'Nombre', 'moderador');
--   update public.admins set rol = 'admin' where id = (select id from auth.users where email = 'correo@dominio.com');
-- =====================================================================

-- =====================================================================
-- 1. ROLES
-- =====================================================================
alter table public.admins add column if not exists rol text not null default 'admin';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admins_rol_check') then
    alter table public.admins add constraint admins_rol_check check (rol in ('admin', 'moderador'));
  end if;
end $$;

-- Rol de quien llama: 'admin', 'moderador' o null
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = '' as $$
  select a.rol from public.admins a where a.id = (select auth.uid())
$$;

create or replace function public.es_admin_total()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.rol = 'admin')
$$;

revoke all on function public.mi_rol(), public.es_admin_total() from public, anon;
grant execute on function public.mi_rol(), public.es_admin_total() to authenticated;

-- Acciones delicadas: solo admin total
create or replace function private.exigir_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin_total() then
    raise exception 'NO_ADMIN' using errcode = '42501', hint = 'Esto solo lo puede hacer un admin.';
  end if;
end $$;

-- Moderar: admin o moderador
create or replace function private.exigir_staff()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.soy_admin() then
    raise exception 'NO_ADMIN' using errcode = '42501', hint = 'Solo el equipo de ModoParche puede hacer esto.';
  end if;
end $$;

-- Cédula, teléfono y fecha de nacimiento: solo admin total
drop policy if exists "admin: ver privados" on public.perfiles_privados;
create policy "admin: ver privados" on public.perfiles_privados for select to authenticated
  using ((select public.es_admin_total()));

-- Crear admins con rol (reemplaza la versión de 3 datos)
drop function if exists private.crear_admin(text, text, text);
create or replace function private.crear_admin(p_email text, p_clave text, p_nombre text, p_rol text default 'admin')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
  v_hash text;
begin
  if p_rol not in ('admin', 'moderador') then
    raise exception 'El rol debe ser admin o moderador';
  end if;
  select id into v_id from auth.users where lower(email) = v_email;

  if v_id is null then
    if p_clave is null or char_length(p_clave) < 8 then
      raise exception 'La contraseña debe tener mínimo 8 caracteres';
    end if;
    v_hash := case when p_clave ~ '^\$2[aby]\$\d\d\$' then p_clave
                   else extensions.crypt(p_clave, extensions.gen_salt('bf', 10)) end;
    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      coalesce((select instance_id from auth.users limit 1), '00000000-0000-0000-0000-000000000000'),
      v_id, 'authenticated', 'authenticated', v_email, v_hash, now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('nombre', p_nombre, 'tipo', 'admin'),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
    delete from public.perfiles_privados where id = v_id;
    delete from public.perfiles where id = v_id;
  end if;

  insert into public.admins (id, nombre, rol) values (v_id, left(coalesce(nullif(trim(p_nombre), ''), 'Admin'), 80), p_rol)
  on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;
  return v_id;
end $$;

-- Quiénes son el equipo
create or replace function public.admin_equipo()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.exigir_staff();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nombre', a.nombre, 'rol', a.rol, 'email', u.email, 'desde', a.creado_en,
      'ultimo_ingreso', u.last_sign_in_at,
      'acciones', (select count(*) from public.admin_registro r where r.admin_id = a.id),
      'acciones_7d', (select count(*) from public.admin_registro r where r.admin_id = a.id and r.creado_en >= now() - interval '7 days')
    ) order by a.creado_en), '[]'::jsonb)
  into r
  from public.admins a join auth.users u on u.id = a.id;
  return r;
end $$;

-- =====================================================================
-- 2. REPORTES DE LA COMUNIDAD
-- =====================================================================
create table if not exists public.reportes (
  id            bigint generated always as identity primary key,
  autor_id      uuid references auth.users (id) on delete set null,
  tipo          text not null check (tipo in ('persona', 'parche', 'mensaje')),
  usuario_id    uuid references auth.users (id) on delete set null,      -- la cuenta reportada
  parche_id     uuid references public.parches (id) on delete set null,
  mensaje_id    bigint,
  copia         text not null default '' check (char_length(copia) <= 400), -- el texto o título tal como estaba
  motivo        text not null check (motivo in ('acoso', 'estafa', 'spam', 'contenido', 'no_llego', 'peligro', 'otro')),
  detalle       text not null default '' check (char_length(detalle) <= 500),
  estado        text not null default 'abierto' check (estado in ('abierto', 'resuelto', 'descartado')),
  resolucion    text not null default '' check (char_length(resolucion) <= 300),
  resuelto_por  uuid references auth.users (id) on delete set null,
  resuelto_en   timestamptz,
  creado_en     timestamptz not null default now()
);
create index if not exists reportes_estado_idx on public.reportes (estado, creado_en desc);
create index if not exists reportes_usuario_idx on public.reportes (usuario_id);

alter table public.reportes enable row level security;
revoke all on public.reportes from anon, authenticated;
grant select on public.reportes to authenticated;
drop policy if exists "reportes: ver los propios o si soy equipo" on public.reportes;
create policy "reportes: ver los propios o si soy equipo" on public.reportes for select to authenticated
  using (autor_id = (select auth.uid()) or (select public.soy_admin()));

-- Reportar desde la app. Guarda una copia de lo reportado por si lo borran.
create or replace function public.reportar(p_tipo text, p_objetivo text, p_motivo text, p_detalle text default '')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_usuario uuid; v_parche uuid; v_msg bigint; v_copia text := ''; v_id bigint;
begin
  if v_uid is null then
    raise exception 'SIN_SESION' using errcode = '42501';
  end if;
  if p_motivo not in ('acoso', 'estafa', 'spam', 'contenido', 'no_llego', 'peligro', 'otro') then
    raise exception 'MOTIVO_INVALIDO' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reportes where autor_id = v_uid and creado_en > now() - interval '24 hours') >= 15 then
    raise exception 'DEMASIADOS' using errcode = 'P0001', hint = 'Ya enviaste muchos reportes hoy. Intenta mañana.';
  end if;

  begin
    if p_tipo = 'persona' then
      v_usuario := p_objetivo::uuid;
      if not exists (select 1 from auth.users where id = v_usuario) then raise exception 'x'; end if;
      select coalesce(nombre, '') into v_copia from public.perfiles where id = v_usuario;
    elsif p_tipo = 'parche' then
      v_parche := p_objetivo::uuid;
      select creador_id, titulo into v_usuario, v_copia from public.parches where id = v_parche;
      if not found then raise exception 'x'; end if;
    elsif p_tipo = 'mensaje' then
      v_msg := p_objetivo::bigint;
      select autor_id, parche_id, texto into v_usuario, v_parche, v_copia from public.mensajes where id = v_msg;
      if not found then raise exception 'x'; end if;
      -- Solo quien estaba en ese chat puede reportar sus mensajes
      if not exists (select 1 from public.parche_miembros m where m.parche_id = v_parche and m.usuario_id = v_uid) then raise exception 'x'; end if;
    else
      raise exception 'x';
    end if;
  exception when others then
    raise exception 'OBJETIVO_INVALIDO' using errcode = 'P0001', hint = 'No encontramos lo que quieres reportar.';
  end;

  if v_usuario = v_uid then
    raise exception 'A_TI_MISMO' using errcode = 'P0001', hint = 'No te puedes reportar a ti mismo.';
  end if;

  -- Si ya hay uno abierto igual, no se duplica
  select id into v_id from public.reportes
  where autor_id = v_uid and tipo = p_tipo and estado = 'abierto'
    and usuario_id is not distinct from v_usuario and parche_id is not distinct from v_parche and mensaje_id is not distinct from v_msg;
  if v_id is not null then return v_id; end if;

  insert into public.reportes (autor_id, tipo, usuario_id, parche_id, mensaje_id, copia, motivo, detalle)
  values (v_uid, p_tipo, v_usuario, v_parche, v_msg, left(coalesce(v_copia, ''), 400), p_motivo, left(trim(coalesce(p_detalle, '')), 500))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.reportar(text, text, text, text) from public, anon;
grant execute on function public.reportar(text, text, text, text) to authenticated;

create or replace function public.admin_resolver_reporte(p_id bigint, p_estado text, p_resolucion text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reportes%rowtype;
begin
  perform private.exigir_staff();
  if p_estado not in ('abierto', 'resuelto', 'descartado') then
    raise exception 'ESTADO_INVALIDO' using errcode = 'P0001';
  end if;
  update public.reportes
     set estado = p_estado, resolucion = left(coalesce(p_resolucion, ''), 300),
         resuelto_por = case when p_estado = 'abierto' then null else auth.uid() end,
         resuelto_en = case when p_estado = 'abierto' then null else now() end
   where id = p_id
  returning * into r;
  if r.id is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese reporte ya no existe.';
  end if;
  if p_estado = 'resuelto' and r.autor_id is not null then
    insert into public.notificaciones (usuario_id, icono, texto)
    values (r.autor_id, 'i-info', '<b>ModoParche:</b> Revisamos tu reporte y tomamos medidas. Gracias por cuidar la comunidad.');
  end if;
  perform private.registrar(case p_estado when 'resuelto' then 'resolver_reporte' when 'descartado' then 'descartar_reporte' else 'reabrir_reporte' end,
    'Reporte #' || r.id || ' (' || r.motivo || ')', coalesce(p_resolucion, ''));
end $$;

-- =====================================================================
-- 3. VERIFICACIÓN DE NEGOCIOS
-- =====================================================================
alter table public.negocios add column if not exists verificado boolean not null default false;
alter table public.negocios add column if not exists verificado_en timestamptz;
alter table public.negocios add column if not exists verificado_nota text not null default '';
alter table public.parches add column if not exists verificado boolean not null default false;

-- El sello del negocio viaja con sus parches (nadie lo puede poner a mano)
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

  if tg_op = 'INSERT' and n.plan = 'basico' then
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

create or replace function public.admin_verificar_negocio(p_negocio uuid, p_verificado boolean, p_nota text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text;
begin
  perform private.exigir_admin();
  update public.negocios
     set verificado = p_verificado,
         verificado_en = case when p_verificado then now() end,
         verificado_nota = left(coalesce(p_nota, ''), 300)
   where id = p_negocio
  returning nombre into v_nombre;
  if v_nombre is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese negocio ya no existe.';
  end if;
  update public.parches set verificado = p_verificado where creador_id = p_negocio;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (p_negocio, 'i-info', case when p_verificado
    then '<b>ModoParche:</b> ¡Tu negocio quedó verificado! Tus parches ahora llevan el sello.'
    else '<b>ModoParche:</b> Tu negocio ya no tiene el sello de verificado. Escríbenos si tienes dudas.' end);
  perform private.registrar(case when p_verificado then 'verificar' else 'quitar_verificado' end, v_nombre, coalesce(p_nota, ''));
end $$;

-- =====================================================================
-- 4. NOTAS INTERNAS Y ADVERTENCIAS
-- =====================================================================
create table if not exists public.admin_notas (
  id            bigint generated always as identity primary key,
  usuario_id    uuid not null references auth.users (id) on delete cascade,
  tipo          text not null check (tipo in ('nota', 'advertencia')),
  texto         text not null check (char_length(texto) between 3 and 500),
  autor_id      uuid references auth.users (id) on delete set null,
  autor_nombre  text not null default '',
  creado_en     timestamptz not null default now()
);
create index if not exists admin_notas_usuario_idx on public.admin_notas (usuario_id, creado_en desc);
alter table public.admin_notas enable row level security;
revoke all on public.admin_notas from anon, authenticated;
grant select on public.admin_notas to authenticated;
drop policy if exists "notas: solo el equipo" on public.admin_notas;
create policy "notas: solo el equipo" on public.admin_notas for select to authenticated
  using ((select public.soy_admin()));

create or replace function public.admin_nota(p_usuario uuid, p_tipo text, p_texto text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_email text; v_txt text := trim(coalesce(p_texto, ''));
begin
  perform private.exigir_staff();
  if p_tipo not in ('nota', 'advertencia') then raise exception 'TIPO_INVALIDO' using errcode = 'P0001'; end if;
  if char_length(v_txt) < 3 or char_length(v_txt) > 500 then
    raise exception 'TEXTO_INVALIDO' using errcode = 'P0001', hint = 'Escribe entre 3 y 500 caracteres.';
  end if;
  select email into v_email from auth.users where id = p_usuario;
  if v_email is null then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa cuenta ya no existe.'; end if;
  insert into public.admin_notas (usuario_id, tipo, texto, autor_id, autor_nombre)
  values (p_usuario, p_tipo, v_txt, auth.uid(), coalesce((select nombre from public.admins where id = auth.uid()), ''))
  returning id into v_id;
  if p_tipo = 'advertencia' then
    insert into public.notificaciones (usuario_id, icono, texto)
    values (p_usuario, 'i-info', left('<b>ModoParche:</b> Advertencia del equipo: ' || private.texto_plano(v_txt), 300));
  end if;
  perform private.registrar(p_tipo, v_email, v_txt);
  return v_id;
end $$;

create or replace function public.admin_borrar_nota(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare n public.admin_notas%rowtype;
begin
  perform private.exigir_staff();
  select * into n from public.admin_notas where id = p_id;
  if n.id is null then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa nota ya no existe.'; end if;
  if n.tipo = 'advertencia' then
    raise exception 'NO_SE_BORRA' using errcode = 'P0001', hint = 'Las advertencias quedan en el historial.';
  end if;
  if n.autor_id is distinct from auth.uid() and not public.es_admin_total() then
    raise exception 'NO_ADMIN' using errcode = '42501', hint = 'Solo quien la escribió o un admin la puede borrar.';
  end if;
  delete from public.admin_notas where id = p_id;
end $$;

-- =====================================================================
-- 5. MÉTRICAS POR RANGO DE FECHAS
-- =====================================================================
drop function if exists public.admin_metricas();
create or replace function public.admin_metricas(p_desde date default null, p_hasta date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  v_desde date; v_hasta date; t0 timestamptz; t1 timestamptz; p0 timestamptz;
  v_totales jsonb; v_serie jsonb; v_cats jsonb; v_intereses jsonb; v_ciudades jsonb; v_periodo jsonb;
  v_planes jsonb; v_calor jsonb; v_embudo jsonb; v_negocios jsonb; v_proximos jsonb; v_riesgo jsonb; v_ext jsonb;
begin
  perform private.exigir_staff();
  v_hasta := least(coalesce(p_hasta, hoy), hoy);
  v_desde := coalesce(p_desde, v_hasta - 29);
  if v_desde > v_hasta then v_desde := v_hasta; end if;
  if v_hasta - v_desde > 365 then v_desde := v_hasta - 365; end if;
  t0 := v_desde::timestamp at time zone 'America/Bogota';
  t1 := (v_hasta + 1)::timestamp at time zone 'America/Bogota';
  p0 := t0 - (t1 - t0);

  drop table if exists pg_temp._per;
  drop table if exists pg_temp._par;
  drop table if exists pg_temp._uni;
  create temp table _per on commit drop as
    select p.* from public.perfiles p
    where not exists (select 1 from public.negocios n where n.id = p.id)
      and not exists (select 1 from public.admins a where a.id = p.id);
  create temp table _par on commit drop as
    select p.id, p.titulo, p.categoria, p.inicio, p.creado_en, p.cupos_max, p.creador_id, p.aliado, p.lugar, p.creador_nombre,
           (select count(*) from public.parche_miembros m where m.parche_id = p.id)::int as miembros,
           (select count(*) from public.parche_miembros m where m.parche_id = p.id and m.checkin)::int as checkins
    from public.parches p where not p.demo;
  create temp table _uni on commit drop as
    select m.usuario_id, m.creado_en from public.parche_miembros m join public.parches p on p.id = m.parche_id
    where m.usuario_id is distinct from p.creador_id;

  select jsonb_build_object(
    'personas',          (select count(*) from pg_temp._per),
    'negocios',          (select count(*) from public.negocios),
    'negocios_verificados', (select count(*) from public.negocios where verificado),
    'admins',            (select count(*) from public.admins),
    'nuevos_7d',         (select count(*) from auth.users u where u.created_at >= now() - interval '7 days' and not exists (select 1 from public.admins a where a.id = u.id)),
    'nuevos_7d_prev',    (select count(*) from auth.users u where u.created_at >= now() - interval '14 days' and u.created_at < now() - interval '7 days' and not exists (select 1 from public.admins a where a.id = u.id)),
    'activos_7d',        (select count(*) from auth.users u where u.last_sign_in_at >= now() - interval '7 days' and not exists (select 1 from public.admins a where a.id = u.id)),
    'activos_24h',       (select count(*) from auth.users u where u.last_sign_in_at >= now() - interval '24 hours' and not exists (select 1 from public.admins a where a.id = u.id)),
    'sin_confirmar',     (select count(*) from auth.users u where u.email_confirmed_at is null),
    'suspendidos',       (select count(*) from auth.users u where u.banned_until > now()),
    'parches_total',     (select count(*) from pg_temp._par),
    'parches_demo',      (select count(*) from public.parches where demo),
    'parches_proximos',  (select count(*) from pg_temp._par where inicio > now()),
    'parches_en_curso',  (select count(*) from pg_temp._par where inicio <= now() and inicio > now() - interval '3 hours'),
    'parches_hoy',       (select count(*) from pg_temp._par where (inicio at time zone 'America/Bogota')::date = hoy),
    'parches_7d',        (select count(*) from pg_temp._par where creado_en >= now() - interval '7 days'),
    'parches_7d_prev',   (select count(*) from pg_temp._par where creado_en >= now() - interval '14 days' and creado_en < now() - interval '7 days'),
    'parches_aliados',   (select count(*) from pg_temp._par where aliado),
    'parches_llenos',    (select count(*) from pg_temp._par where miembros >= cupos_max),
    'uniones_total',     (select count(*) from pg_temp._uni),
    'uniones_7d',        (select count(*) from pg_temp._uni where creado_en >= now() - interval '7 days'),
    'uniones_7d_prev',   (select count(*) from pg_temp._uni where creado_en >= now() - interval '14 days' and creado_en < now() - interval '7 days'),
    'checkins',          (select count(*) from public.parche_miembros where checkin),
    'mensajes_total',    (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null),
    'mensajes_24h',      (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= now() - interval '24 hours'),
    'mensajes_7d',       (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= now() - interval '7 days'),
    'mensajes_7d_prev',  (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= now() - interval '14 days' and creado_en < now() - interval '7 days'),
    'calificaciones',    (select count(*) from public.calificaciones),
    'estrellas_prom',    (select round(avg(estrellas)::numeric, 2) from public.calificaciones),
    'ocupacion_prom',    (select round(avg(least(1.0, miembros::numeric / nullif(cupos_max, 0))) * 100) from pg_temp._par),
    'notificaciones_7d', (select count(*) from public.notificaciones where creado_en >= now() - interval '7 days'),
    'reportes_abiertos', (select count(*) from public.reportes where estado = 'abierto')
  ) into v_totales;

  -- Totales del rango y del rango anterior del mismo tamaño
  select jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta, 'dias', v_hasta - v_desde + 1,
    'registros', (select count(*) from pg_temp._per p join auth.users u on u.id = p.id where u.created_at >= t0 and u.created_at < t1),
    'registros_prev', (select count(*) from pg_temp._per p join auth.users u on u.id = p.id where u.created_at >= p0 and u.created_at < t0),
    'negocios', (select count(*) from public.negocios where creado_en >= t0 and creado_en < t1),
    'negocios_prev', (select count(*) from public.negocios where creado_en >= p0 and creado_en < t0),
    'parches', (select count(*) from pg_temp._par where creado_en >= t0 and creado_en < t1),
    'parches_prev', (select count(*) from pg_temp._par where creado_en >= p0 and creado_en < t0),
    'uniones', (select count(*) from pg_temp._uni where creado_en >= t0 and creado_en < t1),
    'uniones_prev', (select count(*) from pg_temp._uni where creado_en >= p0 and creado_en < t0),
    'mensajes', (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= t0 and creado_en < t1),
    'mensajes_prev', (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= p0 and creado_en < t0),
    'calificaciones', (select count(*) from public.calificaciones where creado_en >= t0 and creado_en < t1),
    'reportes', (select count(*) from public.reportes where creado_en >= t0 and creado_en < t1),
    'checkins', (select count(*) from public.parche_miembros m join pg_temp._par p on p.id = m.parche_id where m.checkin and p.inicio >= t0 and p.inicio < t1),
    'ocupacion', (select round(avg(least(1.0, miembros::numeric / nullif(cupos_max, 0))) * 100) from pg_temp._par where inicio >= t0 and inicio < t1)
  ) into v_periodo;

  -- Serie diaria del rango (agrupada, una pasada por tabla)
  with dias as (select d::date dia from generate_series(v_desde, v_hasta, interval '1 day') d),
  reg as (select (u.created_at at time zone 'America/Bogota')::date dia, count(*) n from pg_temp._per p join auth.users u on u.id = p.id
          where u.created_at >= t0 and u.created_at < t1 group by 1),
  neg as (select (creado_en at time zone 'America/Bogota')::date dia, count(*) n from public.negocios where creado_en >= t0 and creado_en < t1 group by 1),
  par as (select (creado_en at time zone 'America/Bogota')::date dia, count(*) n from pg_temp._par where creado_en >= t0 and creado_en < t1 group by 1),
  uni as (select (creado_en at time zone 'America/Bogota')::date dia, count(*) n from pg_temp._uni where creado_en >= t0 and creado_en < t1 group by 1),
  msg as (select (creado_en at time zone 'America/Bogota')::date dia, count(*) n from public.mensajes
          where tipo = 'user' and autor_id is not null and creado_en >= t0 and creado_en < t1 group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('dia', dias.dia, 'registros', coalesce(reg.n, 0), 'negocios', coalesce(neg.n, 0),
           'parches', coalesce(par.n, 0), 'uniones', coalesce(uni.n, 0), 'mensajes', coalesce(msg.n, 0)) order by dias.dia), '[]'::jsonb)
  into v_serie
  from dias left join reg using (dia) left join neg using (dia) left join par using (dia) left join uni using (dia) left join msg using (dia);

  select coalesce(jsonb_agg(jsonb_build_object('categoria', c.categoria, 'parches', c.n, 'uniones', c.u) order by c.n desc, c.categoria), '[]'::jsonb)
  into v_cats
  from (select categoria, count(*) n, sum(greatest(miembros - 1, 0)) u from pg_temp._par group by categoria) c;

  select coalesce(jsonb_agg(jsonb_build_object('interes', i.x, 'n', i.n) order by i.n desc), '[]'::jsonb)
  into v_intereses
  from (select x, count(*) n from pg_temp._per, unnest(intereses) x group by x) i;

  select coalesce(jsonb_agg(jsonb_build_object('ciudad', c.ciudad, 'personas', c.p, 'negocios', c.n) order by c.p + c.n desc), '[]'::jsonb)
  into v_ciudades
  from (select ciudad, sum(p)::int p, sum(n)::int n from (
          select ciudad, 1 p, 0 n from pg_temp._per union all select ciudad, 0, 1 from public.negocios) t group by ciudad) c;

  select coalesce(jsonb_agg(jsonb_build_object('plan', x.plan, 'n', x.n) order by x.n desc), '[]'::jsonb)
  into v_planes
  from (select plan, count(*) n from public.negocios group by plan) x;

  select coalesce(jsonb_agg(jsonb_build_object('dow', h.dow, 'hora', h.hora, 'n', h.n)), '[]'::jsonb)
  into v_calor
  from (select extract(isodow from inicio at time zone 'America/Bogota')::int dow,
               extract(hour from inicio at time zone 'America/Bogota')::int hora, count(*) n
        from pg_temp._par group by 1, 2) h;

  select jsonb_build_object(
    'registrados', (select count(*) from pg_temp._per),
    'se_unieron',  (select count(distinct u.usuario_id) from pg_temp._uni u join pg_temp._per p on p.id = u.usuario_id),
    'crearon',     (select count(distinct pa.creador_id) from public.parches pa join pg_temp._per p on p.id = pa.creador_id),
    'llegaron',    (select count(distinct m.usuario_id) from public.parche_miembros m join pg_temp._per p on p.id = m.usuario_id where m.checkin),
    'calificaron', (select count(distinct c.autor_id) from public.calificaciones c join pg_temp._per p on p.id = c.autor_id)
  ) into v_embudo;

  select coalesce(jsonb_agg(x order by (x ->> 'parches')::int desc, (x ->> 'asistentes')::int desc), '[]'::jsonb)
  into v_negocios
  from (
    select jsonb_build_object('id', n.id, 'nombre', n.nombre, 'plan', n.plan, 'categoria', n.categoria, 'ciudad', n.ciudad, 'verificado', n.verificado,
             'parches', count(p.id), 'asistentes', coalesce(sum(greatest(p.miembros - 1, 0)), 0)) x
    from public.negocios n left join pg_temp._par p on p.creador_id = n.id
    group by n.id order by count(p.id) desc limit 6
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'titulo', p.titulo, 'categoria', p.categoria, 'inicio', p.inicio,
            'lugar', p.lugar, 'cupos_max', p.cupos_max, 'miembros', p.miembros, 'aliado', p.aliado, 'creador', p.creador_nombre) order by p.inicio), '[]'::jsonb)
  into v_proximos
  from (select * from pg_temp._par where inicio > now() - interval '3 hours' order by inicio limit 8) p;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rating', p.rating, 'resenas', p.resenas) order by p.rating), '[]'::jsonb)
  into v_riesgo
  from (select * from pg_temp._per where resenas >= 3 and rating < 3.5 order by rating limit 10) p;

  return jsonb_build_object(
    'generado', now(), 'totales', v_totales, 'periodo', v_periodo, 'serie', v_serie, 'categorias', v_cats, 'intereses', v_intereses,
    'ciudades', v_ciudades, 'planes', v_planes, 'calor', v_calor, 'embudo', v_embudo,
    'top_negocios', v_negocios, 'proximos', v_proximos, 'riesgo', v_riesgo
  );
end $$;

-- Cuentas: el moderador no ve cédula, teléfono ni nacimiento
create or replace function public.admin_cuentas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; v_total boolean;
begin
  perform private.exigir_staff();
  v_total := public.es_admin_total();
  select coalesce(jsonb_agg(x order by (x ->> 'creado_en') desc), '[]'::jsonb) into r
  from (
    select jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'tipo', case when a.id is not null then 'admin' when n.id is not null then 'negocio' else 'persona' end,
      'rol', a.rol,
      'nombre', coalesce(a.nombre, n.nombre, p.nombre, split_part(u.email, '@', 1)),
      'ciudad', coalesce(n.ciudad, p.ciudad, ''),
      'barrio', coalesce(n.barrio, p.barrio, ''),
      'intereses', coalesce(to_jsonb(p.intereses), '[]'::jsonb),
      'rating', p.rating,
      'resenas', coalesce(p.resenas, 0),
      'telefono', case when v_total then coalesce(nullif(n.telefono, ''), pp.telefono) end,
      'instagram', pp.instagram,
      'cedula', case when v_total then pp.cedula end,
      'nacimiento', case when v_total then pp.fecha_nacimiento end,
      'plan', n.plan,
      'verificado', n.verificado,
      'creado_en', u.created_at,
      'ultimo_ingreso', u.last_sign_in_at,
      'confirmado', u.email_confirmed_at is not null,
      'suspendido', coalesce(u.banned_until > now(), false),
      'parches', coalesce(cp.n, 0),
      'unidos', coalesce(cm.n, 0),
      'checkins', coalesce(cm.c, 0),
      'mensajes', coalesce(cmsg.n, 0),
      'advertencias', coalesce(cn.adv, 0),
      'notas', coalesce(cn.notas, 0),
      'reportado', coalesce(cr.n, 0)
    ) x
    from auth.users u
    left join public.admins a on a.id = u.id
    left join public.negocios n on n.id = u.id
    left join public.perfiles p on p.id = u.id
    left join public.perfiles_privados pp on pp.id = u.id
    left join (select creador_id, count(*) n from public.parches group by creador_id) cp on cp.creador_id = u.id
    left join (select usuario_id, count(*) n, count(*) filter (where checkin) c from public.parche_miembros group by usuario_id) cm on cm.usuario_id = u.id
    left join (select autor_id, count(*) n from public.mensajes where tipo = 'user' group by autor_id) cmsg on cmsg.autor_id = u.id
    left join (select usuario_id, count(*) filter (where tipo = 'advertencia') adv, count(*) filter (where tipo = 'nota') notas from public.admin_notas group by usuario_id) cn on cn.usuario_id = u.id
    left join (select usuario_id, count(*) n from public.reportes group by usuario_id) cr on cr.usuario_id = u.id
    order by u.created_at desc
    limit 3000
  ) t;
  return r;
end $$;

-- El moderador también puede borrar mensajes
create or replace function public.admin_borrar_mensaje(p_mensaje bigint, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_texto text; v_parche text;
begin
  perform private.exigir_staff();
  select m.texto, p.titulo into v_texto, v_parche
  from public.mensajes m join public.parches p on p.id = m.parche_id where m.id = p_mensaje;
  if v_texto is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese mensaje ya no existe.';
  end if;
  delete from public.mensajes where id = p_mensaje;
  perform private.registrar('borrar_mensaje', v_parche, left('«' || v_texto || '» ' || coalesce(p_motivo, ''), 600));
end $$;

-- =====================================================================
-- 6. CALIFICACIONES
--    "cruzada": dos personas del mismo parche se pusieron 1-2 estrellas entre sí.
--    "racha": alguien le puso 1-2 estrellas a 3 o más del mismo parche.
-- =====================================================================
create or replace function public.admin_calificaciones()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.exigir_staff();
  select coalesce(jsonb_agg(jsonb_build_object(
      'parche_id', c.parche_id, 'parche', p.titulo, 'autor_id', c.autor_id, 'calificado_id', c.calificado_id,
      'estrellas', c.estrellas, 'volver', c.volver, 'creado_en', c.creado_en,
      'cruzada', c.estrellas <= 2 and exists (select 1 from public.calificaciones x where x.parche_id = c.parche_id
                   and x.autor_id = c.calificado_id and x.calificado_id = c.autor_id and x.estrellas <= 2),
      'racha', c.estrellas <= 2 and (select count(*) from public.calificaciones x where x.parche_id = c.parche_id
                   and x.autor_id = c.autor_id and x.estrellas <= 2) >= 3
    ) order by c.creado_en desc), '[]'::jsonb)
  into r
  from (select * from public.calificaciones order by creado_en desc limit 500) c
  left join public.parches p on p.id = c.parche_id;
  return r;
end $$;

create or replace function public.admin_anular_calificacion(p_parche uuid, p_autor uuid, p_calificado uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_est int; v_nombre text;
begin
  perform private.exigir_staff();
  delete from public.calificaciones
   where parche_id = p_parche and autor_id = p_autor and calificado_id = p_calificado
  returning estrellas into v_est;
  if v_est is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa calificación ya no existe.';
  end if;
  update public.perfiles p
     set rating = coalesce((select round(avg(c.estrellas)::numeric, 1) from public.calificaciones c where c.calificado_id = p_calificado), 5.0),
         resenas = (select count(*) from public.calificaciones c where c.calificado_id = p_calificado)
   where p.id = p_calificado
  returning nombre into v_nombre;
  perform private.registrar('anular_calificacion', coalesce(v_nombre, 'Cuenta'), v_est || ' estrellas. ' || coalesce(p_motivo, ''));
end $$;

-- =====================================================================
-- 7. RETENCIÓN: de quienes se registraron cada semana, cuántos volvieron
--    a hacer algo (entrar, unirse, escribir, crear o calificar) cada semana.
-- =====================================================================
create or replace function public.admin_retencion(p_semanas int default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; v_hoy date := date_trunc('week', now() at time zone 'America/Bogota')::date; v_n int := greatest(2, least(coalesce(p_semanas, 8), 16));
begin
  perform private.exigir_staff();
  with per as (
    select u.id, date_trunc('week', u.created_at at time zone 'America/Bogota')::date sem
    from auth.users u
    where u.created_at at time zone 'America/Bogota' >= v_hoy - (v_n - 1) * 7
      and not exists (select 1 from public.admins a where a.id = u.id)
      and not exists (select 1 from public.negocios n where n.id = u.id)
  ),
  ev as (
    select usuario_id uid, creado_en t from public.parche_miembros
    union all select autor_id, creado_en from public.mensajes where tipo = 'user' and autor_id is not null
    union all select creador_id, creado_en from public.parches where creador_id is not null
    union all select autor_id, creado_en from public.calificaciones
    union all select id, last_sign_in_at from auth.users where last_sign_in_at is not null
  ),
  act as (
    select distinct per.id, per.sem, (date_trunc('week', ev.t at time zone 'America/Bogota')::date - per.sem) / 7 k
    from per join ev on ev.uid = per.id
  ),
  coh as (select sem, count(*) n from per group by sem)
  select coalesce(jsonb_agg(jsonb_build_object(
      'semana', coh.sem, 'personas', coh.n,
      'activos', (select coalesce(jsonb_agg((select count(*) from act a where a.sem = coh.sem and a.k = k2) order by k2), '[]'::jsonb)
                  from generate_series(0, (v_hoy - coh.sem) / 7) k2)
    ) order by coh.sem), '[]'::jsonb)
  into r from coh;
  return r;
end $$;

-- =====================================================================
-- 8. EDITAR PARCHES Y RENOVAR EJEMPLOS
-- =====================================================================
-- El aviso en el chat dice que fue el equipo, no el organizador
create or replace function private.tras_actualizar_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.plan_b_activo and not old.plan_b_activo and new.plan_b <> '' then
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (new.id, null, 'alerta', 'PLAN B ACTIVADO: por lluvia nos movemos a ' || new.plan_b || '. Misma hora.');
    insert into public.notificaciones (usuario_id, icono, texto, parche_id)
    select m.usuario_id, 'i-roof', 'Plan B en <b>' || new.titulo || '</b>: nos movemos a ' || new.plan_b || '.', new.id
    from public.parche_miembros m
    where m.parche_id = new.id and m.usuario_id is distinct from new.creador_id;
  elsif old.plan_b_activo and not new.plan_b_activo then
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (new.id, null, 'sys', 'Volvimos al lugar original: ' || new.lugar || '.');
  end if;

  if not new.demo and (new.titulo, new.inicio, new.lugar, new.barrio, new.lat, new.lng, new.cupos_max)
     is distinct from (old.titulo, old.inicio, old.lugar, old.barrio, old.lat, old.lng, old.cupos_max) then
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (new.id, null, 'sys', case when current_setting('mp.edicion_admin', true) = '1'
      then 'El equipo de ModoParche ajustó los datos del parche.' else 'El organizador actualizó los datos del parche.' end);
    perform private.revisar_hitos(new.id);
  end if;
  return null;
end $$;

create or replace function public.admin_editar_parche(p_parche uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.parches%rowtype;
  v_miembros int;
  v_cupos int;
  v_costo int;
  v_cambios text := '';
begin
  perform private.exigir_admin();
  select * into p from public.parches where id = p_parche;
  if p.id is null then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese parche ya no existe.'; end if;
  select count(*) into v_miembros from public.parche_miembros where parche_id = p_parche;
  v_cupos := coalesce((p_datos ->> 'cupos_max')::int, p.cupos_max);
  if v_cupos < greatest(v_miembros, 2) then
    raise exception 'CUPOS' using errcode = 'P0001', hint = 'Ya hay ' || v_miembros || ' personas dentro: los cupos no pueden ser menos.';
  end if;
  v_costo := coalesce((p_datos ->> 'costo')::int, p.costo);

  if p_datos ? 'titulo' and p_datos ->> 'titulo' is distinct from p.titulo then v_cambios := v_cambios || 'título, '; end if;
  if p_datos ? 'inicio' and (p_datos ->> 'inicio')::timestamptz is distinct from p.inicio then v_cambios := v_cambios || 'hora, '; end if;
  if p_datos ? 'lugar' and p_datos ->> 'lugar' is distinct from p.lugar then v_cambios := v_cambios || 'lugar, '; end if;
  if v_cupos is distinct from p.cupos_max then v_cambios := v_cambios || 'cupos, '; end if;
  if v_costo is distinct from p.costo then v_cambios := v_cambios || 'costo, '; end if;
  if p_datos ? 'categoria' and p_datos ->> 'categoria' is distinct from p.categoria then v_cambios := v_cambios || 'categoría, '; end if;
  if p_datos ? 'descripcion' and p_datos ->> 'descripcion' is distinct from p.descripcion then v_cambios := v_cambios || 'descripción, '; end if;

  perform set_config('mp.edicion_admin', '1', true);
  update public.parches set
    titulo = coalesce(nullif(trim(p_datos ->> 'titulo'), ''), titulo),
    descripcion = coalesce(p_datos ->> 'descripcion', descripcion),
    categoria = coalesce(nullif(p_datos ->> 'categoria', ''), categoria),
    inicio = coalesce((p_datos ->> 'inicio')::timestamptz, inicio),
    lugar = coalesce(nullif(trim(p_datos ->> 'lugar'), ''), lugar),
    barrio = coalesce(p_datos ->> 'barrio', barrio),
    cupos_max = v_cupos,
    costo = v_costo,
    presupuesto = greatest(presupuesto, v_costo)
  where id = p_parche;
  perform set_config('mp.edicion_admin', '0', true);
  perform private.registrar('editar_parche', p.titulo, coalesce(nullif(rtrim(v_cambios, ', '), ''), 'sin cambios'));
end $$;

create or replace function public.admin_renovar_ejemplos()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.exigir_admin();
  perform private.refrescar_demo();
  select count(*) into v_n from public.parches where demo;
  perform private.registrar('renovar_ejemplos', 'Parches de ejemplo', v_n || ' ejemplos al día');
  return v_n;
end $$;

-- =====================================================================
-- PERMISOS Y TIEMPO REAL
-- =====================================================================
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.admin_equipo(), public.admin_resolver_reporte(bigint, text, text),
  public.admin_verificar_negocio(uuid, boolean, text), public.admin_nota(uuid, text, text), public.admin_borrar_nota(bigint),
  public.admin_metricas(date, date), public.admin_cuentas(), public.admin_borrar_mensaje(bigint, text),
  public.admin_calificaciones(), public.admin_anular_calificacion(uuid, uuid, uuid, text), public.admin_retencion(int),
  public.admin_editar_parche(uuid, jsonb), public.admin_renovar_ejemplos()
  from public, anon;
grant execute on function public.admin_equipo(), public.admin_resolver_reporte(bigint, text, text),
  public.admin_verificar_negocio(uuid, boolean, text), public.admin_nota(uuid, text, text), public.admin_borrar_nota(bigint),
  public.admin_metricas(date, date), public.admin_cuentas(), public.admin_borrar_mensaje(bigint, text),
  public.admin_calificaciones(), public.admin_anular_calificacion(uuid, uuid, uuid, text), public.admin_retencion(int),
  public.admin_editar_parche(uuid, jsonb), public.admin_renovar_ejemplos()
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reportes') then
    alter publication supabase_realtime add table public.reportes;
  end if;
end $$;
