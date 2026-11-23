-- =====================================================================
-- ModoParche · Panel de administración
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Corre después de las migraciones anteriores. Se puede correr más de una
-- vez sin romper nada.
--
-- Qué hace:
--   1. Tabla admins. Es la ÚNICA fuente de verdad de quién es admin.
--      Nadie puede volverse admin desde la app: no hay permiso de escritura
--      para anon ni authenticated. Solo se crean desde la base de datos.
--   2. Bitácora (admin_registro) de todo lo que hace un admin.
--   3. Permisos de lectura de solo admins sobre datos privados, chats,
--      rutas, calificaciones y negocios.
--   4. Funciones del panel (RPC). Todas revisan que quien llama sea admin:
--      métricas, cuentas, suspender, retirar parche, cambiar plan,
--      borrar mensaje y enviar anuncios.
--   5. Deja lista private.crear_admin (este archivo no trae cuentas ni claves).
--
-- Crear otro admin más adelante (desde el SQL Editor):
--   select private.crear_admin('correo@dominio.com', '<contraseña larga>', 'Nombre');
-- Volver admin a una cuenta que ya existe (no cambia su contraseña):
--   select private.crear_admin('correo@existente.com', null, 'Nombre');
-- Quitarle el rol a alguien:
--   delete from public.admins where id = (select id from auth.users where email = 'correo@dominio.com');
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1. TABLAS
-- =====================================================================
create table if not exists public.admins (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null default 'Admin' check (char_length(nombre) between 1 and 80),
  creado_en  timestamptz not null default now()
);

create table if not exists public.admin_registro (
  id            bigint generated always as identity primary key,
  admin_id      uuid references auth.users (id) on delete set null,
  admin_nombre  text not null default '',
  accion        text not null check (char_length(accion) <= 40),
  objetivo      text not null default '' check (char_length(objetivo) <= 160),
  detalle       text not null default '' check (char_length(detalle) <= 600),
  creado_en     timestamptz not null default now()
);
create index if not exists admin_registro_fecha_idx on public.admin_registro (creado_en desc);

-- Índices que usan las métricas
create index if not exists parches_creado_idx on public.parches (creado_en);
create index if not exists parche_miembros_creado_idx on public.parche_miembros (creado_en);
create index if not exists mensajes_creado_idx on public.mensajes (creado_en);

-- =====================================================================
-- 2. ¿SOY ADMIN?
--    La app la llama al iniciar sesión para decidir a qué panel ir.
--    Las políticas de abajo también la usan.
-- =====================================================================
create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.id = (select auth.uid()))
$$;
revoke all on function public.soy_admin() from public, anon;
grant execute on function public.soy_admin() to authenticated;

-- Anota una acción en la bitácora
create or replace function private.registrar(p_accion text, p_objetivo text, p_detalle text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_registro (admin_id, admin_nombre, accion, objetivo, detalle)
  values (
    auth.uid(),
    coalesce((select a.nombre from public.admins a where a.id = auth.uid()), ''),
    left(p_accion, 40), left(coalesce(p_objetivo, ''), 160), left(coalesce(p_detalle, ''), 600)
  );
end $$;

create or replace function private.exigir_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.soy_admin() then
    raise exception 'NO_ADMIN' using errcode = '42501', hint = 'Solo el equipo de ModoParche puede hacer esto.';
  end if;
end $$;

-- Texto plano seguro para notificaciones (el panel de usuarios las pinta como HTML)
create or replace function private.texto_plano(t text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

-- =====================================================================
-- 3. RLS
-- =====================================================================
alter table public.admins enable row level security;
alter table public.admin_registro enable row level security;
revoke all on public.admins, public.admin_registro from anon, authenticated;
grant select on public.admins, public.admin_registro to authenticated;

drop policy if exists "admins: ver" on public.admins;
create policy "admins: ver" on public.admins for select to authenticated
  using ((select auth.uid()) = id or (select public.soy_admin()));
drop policy if exists "registro: ver si soy admin" on public.admin_registro;
create policy "registro: ver si soy admin" on public.admin_registro for select to authenticated
  using ((select public.soy_admin()));

-- Lectura de solo admins (se suman a las políticas que ya existen)
drop policy if exists "admin: ver privados" on public.perfiles_privados;
create policy "admin: ver privados" on public.perfiles_privados for select to authenticated
  using ((select public.soy_admin()));
drop policy if exists "admin: ver mensajes" on public.mensajes;
create policy "admin: ver mensajes" on public.mensajes for select to authenticated
  using ((select public.soy_admin()));
drop policy if exists "admin: ver rutas" on public.rutas;
create policy "admin: ver rutas" on public.rutas for select to authenticated
  using ((select public.soy_admin()));
drop policy if exists "admin: ver calificaciones" on public.calificaciones;
create policy "admin: ver calificaciones" on public.calificaciones for select to authenticated
  using ((select public.soy_admin()));
drop policy if exists "admin: ver negocios" on public.negocios;
create policy "admin: ver negocios" on public.negocios for select to authenticated
  using ((select public.soy_admin()));

-- =====================================================================
-- 4. FUNCIONES DEL PANEL
-- =====================================================================

-- 4.1 Métricas de toda la plataforma en una sola llamada
-- (admin_v2 la reemplaza por una con rango de fechas; se quita esa para que no choquen)
drop function if exists public.admin_metricas(date, date);
create or replace function public.admin_metricas()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  v_totales jsonb; v_serie jsonb; v_cats jsonb; v_intereses jsonb; v_ciudades jsonb;
  v_planes jsonb; v_calor jsonb; v_embudo jsonb; v_negocios jsonb; v_proximos jsonb; v_riesgo jsonb;
begin
  perform private.exigir_admin();

  -- Personas = cuentas que no son negocio ni admin
  drop table if exists pg_temp._per;
  drop table if exists pg_temp._par;
  create temp table _per on commit drop as
    select p.* from public.perfiles p
    where not exists (select 1 from public.negocios n where n.id = p.id)
      and not exists (select 1 from public.admins a where a.id = p.id);

  -- Parches reales (sin los de ejemplo) con su ocupación
  create temp table _par on commit drop as
    select p.id, p.titulo, p.categoria, p.inicio, p.creado_en, p.cupos_max, p.creador_id, p.aliado, p.lugar,
           p.creador_nombre,
           (select count(*) from public.parche_miembros m where m.parche_id = p.id)::int as miembros,
           (select count(*) from public.parche_miembros m where m.parche_id = p.id and m.checkin)::int as checkins
    from public.parches p where not p.demo;

  select jsonb_build_object(
    'personas',          (select count(*) from pg_temp._per),
    'negocios',          (select count(*) from public.negocios),
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
    'uniones_total',     (select count(*) from public.parche_miembros m join public.parches p on p.id = m.parche_id where m.usuario_id is distinct from p.creador_id),
    'uniones_7d',        (select count(*) from public.parche_miembros m join public.parches p on p.id = m.parche_id where m.usuario_id is distinct from p.creador_id and m.creado_en >= now() - interval '7 days'),
    'uniones_7d_prev',   (select count(*) from public.parche_miembros m join public.parches p on p.id = m.parche_id where m.usuario_id is distinct from p.creador_id and m.creado_en >= now() - interval '14 days' and m.creado_en < now() - interval '7 days'),
    'checkins',          (select count(*) from public.parche_miembros where checkin),
    'mensajes_total',    (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null),
    'mensajes_24h',      (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= now() - interval '24 hours'),
    'mensajes_7d',       (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= now() - interval '7 days'),
    'mensajes_7d_prev',  (select count(*) from public.mensajes where tipo = 'user' and autor_id is not null and creado_en >= now() - interval '14 days' and creado_en < now() - interval '7 days'),
    'calificaciones',    (select count(*) from public.calificaciones),
    'estrellas_prom',    (select round(avg(estrellas)::numeric, 2) from public.calificaciones),
    'ocupacion_prom',    (select round(avg(least(1.0, miembros::numeric / nullif(cupos_max, 0))) * 100) from pg_temp._par),
    'notificaciones_7d', (select count(*) from public.notificaciones where creado_en >= now() - interval '7 days')
  ) into v_totales;

  -- Últimos 30 días, por día en hora de Bogotá
  select coalesce(jsonb_agg(jsonb_build_object(
      'dia', d::date,
      'registros', (select count(*) from auth.users u where (u.created_at at time zone 'America/Bogota')::date = d::date
                      and not exists (select 1 from public.admins a where a.id = u.id)
                      and not exists (select 1 from public.negocios n where n.id = u.id)),
      'negocios',  (select count(*) from public.negocios n where (n.creado_en at time zone 'America/Bogota')::date = d::date),
      'parches',   (select count(*) from pg_temp._par p where (p.creado_en at time zone 'America/Bogota')::date = d::date),
      'uniones',   (select count(*) from public.parche_miembros m join public.parches p on p.id = m.parche_id
                     where m.usuario_id is distinct from p.creador_id and (m.creado_en at time zone 'America/Bogota')::date = d::date),
      'mensajes',  (select count(*) from public.mensajes m where m.tipo = 'user' and m.autor_id is not null
                     and (m.creado_en at time zone 'America/Bogota')::date = d::date)
    ) order by d), '[]'::jsonb)
  into v_serie
  from generate_series(hoy - 29, hoy, interval '1 day') d;

  select coalesce(jsonb_agg(jsonb_build_object('categoria', c.categoria, 'parches', c.n, 'uniones', c.u) order by c.n desc, c.categoria), '[]'::jsonb)
  into v_cats
  from (select categoria, count(*) n, sum(greatest(miembros - 1, 0)) u from pg_temp._par group by categoria) c;

  select coalesce(jsonb_agg(jsonb_build_object('interes', i.x, 'n', i.n) order by i.n desc), '[]'::jsonb)
  into v_intereses
  from (select x, count(*) n from pg_temp._per, unnest(intereses) x group by x) i;

  select coalesce(jsonb_agg(jsonb_build_object('ciudad', c.ciudad, 'personas', c.p, 'negocios', c.n) order by c.p + c.n desc), '[]'::jsonb)
  into v_ciudades
  from (
    select ciudad, sum(p)::int p, sum(n)::int n from (
      select ciudad, 1 p, 0 n from pg_temp._per
      union all select ciudad, 0, 1 from public.negocios
    ) t group by ciudad
  ) c;

  select coalesce(jsonb_agg(jsonb_build_object('plan', x.plan, 'n', x.n) order by x.n desc), '[]'::jsonb)
  into v_planes
  from (select plan, count(*) n from public.negocios group by plan) x;

  -- Cuándo arrancan los parches: día de la semana (1 = lunes) por hora
  select coalesce(jsonb_agg(jsonb_build_object('dow', h.dow, 'hora', h.hora, 'n', h.n)), '[]'::jsonb)
  into v_calor
  from (
    select extract(isodow from inicio at time zone 'America/Bogota')::int dow,
           extract(hour from inicio at time zone 'America/Bogota')::int hora, count(*) n
    from pg_temp._par group by 1, 2
  ) h;

  select jsonb_build_object(
    'registrados', (select count(*) from pg_temp._per),
    'se_unieron',  (select count(distinct m.usuario_id) from public.parche_miembros m join pg_temp._per p on p.id = m.usuario_id
                    join public.parches pa on pa.id = m.parche_id where m.usuario_id is distinct from pa.creador_id),
    'crearon',     (select count(distinct pa.creador_id) from public.parches pa join pg_temp._per p on p.id = pa.creador_id),
    'llegaron',    (select count(distinct m.usuario_id) from public.parche_miembros m join pg_temp._per p on p.id = m.usuario_id where m.checkin),
    'calificaron', (select count(distinct c.autor_id) from public.calificaciones c join pg_temp._per p on p.id = c.autor_id)
  ) into v_embudo;

  select coalesce(jsonb_agg(x order by (x ->> 'parches')::int desc, (x ->> 'asistentes')::int desc), '[]'::jsonb)
  into v_negocios
  from (
    select jsonb_build_object('id', n.id, 'nombre', n.nombre, 'plan', n.plan, 'categoria', n.categoria, 'ciudad', n.ciudad,
             'parches', count(p.id), 'asistentes', coalesce(sum(greatest(p.miembros - 1, 0)), 0)) x
    from public.negocios n left join pg_temp._par p on p.creador_id = n.id
    group by n.id
    order by count(p.id) desc
    limit 6
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'titulo', p.titulo, 'categoria', p.categoria, 'inicio', p.inicio,
            'lugar', p.lugar, 'cupos_max', p.cupos_max, 'miembros', p.miembros, 'aliado', p.aliado, 'creador', p.creador_nombre) order by p.inicio), '[]'::jsonb)
  into v_proximos
  from (select * from pg_temp._par where inicio > now() - interval '3 hours' order by inicio limit 8) p;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rating', p.rating, 'resenas', p.resenas) order by p.rating), '[]'::jsonb)
  into v_riesgo
  from (select * from pg_temp._per where resenas >= 3 and rating < 3.5 order by rating limit 10) p;

  return jsonb_build_object(
    'generado', now(), 'totales', v_totales, 'serie', v_serie, 'categorias', v_cats, 'intereses', v_intereses,
    'ciudades', v_ciudades, 'planes', v_planes, 'calor', v_calor, 'embudo', v_embudo,
    'top_negocios', v_negocios, 'proximos', v_proximos, 'riesgo', v_riesgo
  );
end $$;

-- 4.2 Todas las cuentas con su actividad (correo y estado vienen de auth.users)
create or replace function public.admin_cuentas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.exigir_admin();
  select coalesce(jsonb_agg(x order by (x ->> 'creado_en') desc), '[]'::jsonb) into r
  from (
    select jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'tipo', case when a.id is not null then 'admin' when n.id is not null then 'negocio' else 'persona' end,
      'nombre', coalesce(a.nombre, n.nombre, p.nombre, split_part(u.email, '@', 1)),
      'ciudad', coalesce(n.ciudad, p.ciudad, ''),
      'barrio', coalesce(n.barrio, p.barrio, ''),
      'intereses', coalesce(to_jsonb(p.intereses), '[]'::jsonb),
      'rating', p.rating,
      'resenas', coalesce(p.resenas, 0),
      'telefono', coalesce(nullif(n.telefono, ''), pp.telefono),
      'instagram', pp.instagram,
      'cedula', pp.cedula,
      'nacimiento', pp.fecha_nacimiento,
      'plan', n.plan,
      'creado_en', u.created_at,
      'ultimo_ingreso', u.last_sign_in_at,
      'confirmado', u.email_confirmed_at is not null,
      'suspendido', coalesce(u.banned_until > now(), false),
      'parches', coalesce(cp.n, 0),
      'unidos', coalesce(cm.n, 0),
      'checkins', coalesce(cm.c, 0),
      'mensajes', coalesce(cmsg.n, 0)
    ) x
    from auth.users u
    left join public.admins a on a.id = u.id
    left join public.negocios n on n.id = u.id
    left join public.perfiles p on p.id = u.id
    left join public.perfiles_privados pp on pp.id = u.id
    left join (select creador_id, count(*) n from public.parches group by creador_id) cp on cp.creador_id = u.id
    left join (select usuario_id, count(*) n, count(*) filter (where checkin) c from public.parche_miembros group by usuario_id) cm on cm.usuario_id = u.id
    left join (select autor_id, count(*) n from public.mensajes where tipo = 'user' group by autor_id) cmsg on cmsg.autor_id = u.id
    order by u.created_at desc
    limit 3000
  ) t;
  return r;
end $$;

-- 4.3 Suspender o reactivar una cuenta (bloquea el inicio de sesión de verdad)
create or replace function public.admin_suspender(p_usuario uuid, p_suspender boolean, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  perform private.exigir_admin();
  if exists (select 1 from public.admins where id = p_usuario) then
    raise exception 'ES_ADMIN' using errcode = 'P0001', hint = 'Las cuentas de admin solo se manejan desde la base de datos.';
  end if;
  update auth.users
     set banned_until = case when p_suspender then now() + interval '100 years' else null end,
         updated_at = now()
   where id = p_usuario
  returning email into v_email;
  if v_email is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa cuenta ya no existe.';
  end if;
  if p_suspender then
    delete from auth.sessions where user_id = p_usuario;  -- cierra sus sesiones abiertas
  end if;
  perform private.registrar(case when p_suspender then 'suspender' else 'reactivar' end, v_email, coalesce(p_motivo, ''));
end $$;

-- 4.4 Retirar un parche (avisa a quienes estaban dentro)
create or replace function public.admin_eliminar_parche(p_parche uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_titulo text;
begin
  perform private.exigir_admin();
  select titulo into v_titulo from public.parches where id = p_parche;
  if v_titulo is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese parche ya no existe.';
  end if;
  insert into public.notificaciones (usuario_id, icono, texto, parche_id)
  select m.usuario_id, 'i-alert',
         left('El equipo de ModoParche retiró <b>' || private.texto_plano(v_titulo) || '</b>'
           || case when coalesce(trim(p_motivo), '') <> '' then ': ' || private.texto_plano(trim(p_motivo)) else '.' end, 300),
         null
  from public.parche_miembros m where m.parche_id = p_parche;
  delete from public.parches where id = p_parche;
  perform private.registrar('retirar_parche', v_titulo, coalesce(p_motivo, ''));
end $$;

-- 4.5 Cambiar el plan de un negocio
create or replace function public.admin_cambiar_plan(p_negocio uuid, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text; v_antes text;
begin
  perform private.exigir_admin();
  if p_plan not in ('basico', 'villavo', 'sedes') then
    raise exception 'PLAN_INVALIDO' using errcode = 'P0001', hint = 'Los planes son basico, villavo o sedes.';
  end if;
  select nombre, plan into v_nombre, v_antes from public.negocios where id = p_negocio;
  if v_nombre is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese negocio ya no existe.';
  end if;
  update public.negocios set plan = p_plan where id = p_negocio;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (p_negocio, 'i-info', 'Tu plan cambió a <b>' || case p_plan when 'basico' then 'Parche básico' when 'villavo' then 'Parche Villavo' else 'Varias sedes' end || '</b>.');
  perform private.registrar('cambiar_plan', v_nombre, v_antes || ' → ' || p_plan);
end $$;

-- 4.6 Borrar un mensaje del chat
create or replace function public.admin_borrar_mensaje(p_mensaje bigint, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_texto text; v_parche text;
begin
  perform private.exigir_admin();
  select m.texto, p.titulo into v_texto, v_parche
  from public.mensajes m join public.parches p on p.id = m.parche_id where m.id = p_mensaje;
  if v_texto is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese mensaje ya no existe.';
  end if;
  delete from public.mensajes where id = p_mensaje;
  perform private.registrar('borrar_mensaje', v_parche, left('«' || v_texto || '» ' || coalesce(p_motivo, ''), 600));
end $$;

-- 4.7 Anuncio para un grupo de cuentas (llega como notificación)
create or replace function public.admin_anuncio(p_texto text, p_publico text default 'todos', p_ciudad text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n int; v_txt text := trim(coalesce(p_texto, ''));
begin
  perform private.exigir_admin();
  if char_length(v_txt) < 5 or char_length(v_txt) > 240 then
    raise exception 'TEXTO_INVALIDO' using errcode = 'P0001', hint = 'El anuncio debe tener entre 5 y 240 caracteres.';
  end if;
  if p_publico not in ('todos', 'personas', 'negocios') then
    raise exception 'PUBLICO_INVALIDO' using errcode = 'P0001';
  end if;
  insert into public.notificaciones (usuario_id, icono, texto)
  select u.id, 'i-info', left('<b>ModoParche:</b> ' || private.texto_plano(v_txt), 300)
  from auth.users u
  left join public.negocios n on n.id = u.id
  left join public.perfiles p on p.id = u.id
  where not exists (select 1 from public.admins a where a.id = u.id)
    and coalesce(u.banned_until, now() - interval '1 second') <= now()
    and (p_publico = 'todos' or (p_publico = 'negocios') = (n.id is not null))
    and (p_ciudad is null or p_ciudad = '' or coalesce(n.ciudad, p.ciudad) = p_ciudad);
  get diagnostics v_n = row_count;
  perform private.registrar('anuncio',
    case p_publico when 'todos' then 'Todas las cuentas' when 'personas' then 'Personas' else 'Negocios' end
      || case when coalesce(p_ciudad, '') <> '' then ' de ' || p_ciudad else '' end || ' (' || v_n || ')',
    v_txt);
  return v_n;
end $$;

-- Permisos: solo cuentas con sesión pueden llamarlas, y cada una revisa que sea admin
revoke all on function public.admin_metricas(), public.admin_cuentas(),
  public.admin_suspender(uuid, boolean, text), public.admin_eliminar_parche(uuid, text),
  public.admin_cambiar_plan(uuid, text), public.admin_borrar_mensaje(bigint, text),
  public.admin_anuncio(text, text, text)
  from public, anon;
grant execute on function public.admin_metricas(), public.admin_cuentas(),
  public.admin_suspender(uuid, boolean, text), public.admin_eliminar_parche(uuid, text),
  public.admin_cambiar_plan(uuid, text), public.admin_borrar_mensaje(bigint, text),
  public.admin_anuncio(text, text, text)
  to authenticated;

-- =====================================================================
-- 5. CREAR ADMINS (solo desde la base de datos)
--    p_clave: contraseña en texto (se cifra aquí) o un hash bcrypt ($2a$...).
--    Si el correo ya existe, solo le da el rol de admin.
-- =====================================================================
drop function if exists private.crear_admin(text, text, text, text);
create or replace function private.crear_admin(p_email text, p_clave text, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
  v_hash text;
begin
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

    -- El trigger de registro le crea un perfil de persona: un admin no lo necesita
    delete from public.perfiles_privados where id = v_id;
    delete from public.perfiles where id = v_id;
  end if;

  insert into public.admins (id, nombre) values (v_id, left(coalesce(nullif(trim(p_nombre), ''), 'Admin'), 80))
  on conflict (id) do update set nombre = excluded.nombre;
  return v_id;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

-- Los admins NO se crean aquí. Córrelo a mano en el SQL Editor, sin guardarlo en git:
--   select private.crear_admin('correo@dominio.com', '<contraseña larga>', 'Nombre');

-- Tiempo real: el panel escucha parches, uniones y mensajes (ya publicados)
