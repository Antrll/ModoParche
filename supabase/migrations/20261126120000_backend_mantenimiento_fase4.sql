-- =====================================================================
-- ModoParche · Fase 4: mantenimiento del backend
--
-- Cómo aplicarlo: Supabase > SQL Editor > pestaña NUEVA > pegar SOLO este
-- archivo > Run. Va después de 20261125120000_pulido_seguridad_y_pwa_fase3.
-- Se puede correr más de una vez. Solo borra datos viejos según la
-- política de retención de la sección 2 (nunca pagos ni la bitácora).
--
-- Qué trae:
--   1. Índices en todas las claves foráneas que no tenían (borrar una
--      cuenta o un parche ya no recorre tablas enteras).
--   2. Retención: notificaciones y mensajes de contacto viejos se borran
--      solos cada día (Ley 1581: guardar solo lo necesario).
--   3. Apoyo a la conciliación de pagos de Wompi (Edge Function conciliar-pagos).
--   4. Registro de tareas programadas y revisión de salud para el admin.
--   5. Tope de tamaño a las columnas JSON de los parches.
-- =====================================================================

-- =====================================================================
-- 1. ÍNDICES EN LAS CLAVES FORÁNEAS
-- Postgres no los crea solo. Sin ellos, un "on delete cascade" o
-- "set null" (por ejemplo al borrar una cuenta) revisa la tabla entera.
-- Se crean para toda clave foránea de una columna en public que no tenga
-- un índice que empiece por esa columna. Nombre: <tabla>_<columna>_fk_idx.
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabla, cl.relname as nombre_tabla, a.attname as columna
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', left(r.nombre_tabla || '_' || r.columna || '_fk_idx', 63), r.tabla, r.columna);
  end loop;
end $$;

-- =====================================================================
-- 4a. REGISTRO DE TAREAS PROGRAMADAS
-- Cada tarea (de pg_cron o de una Edge Function) anota cuándo corrió y qué
-- hizo. La revisión de salud lo muestra al admin.
-- =====================================================================
create table if not exists private.tareas_ejecutadas (
  nombre      text primary key check (char_length(nombre) between 1 and 60),
  ultima_vez  timestamptz not null default now(),
  ok          boolean not null default true,
  detalle     jsonb not null default '{}'::jsonb
);
revoke all on private.tareas_ejecutadas from public, anon, authenticated;

create or replace function private.anotar_tarea(p_nombre text, p_ok boolean, p_detalle jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into private.tareas_ejecutadas (nombre, ultima_vez, ok, detalle)
  values (left(p_nombre, 60), now(), coalesce(p_ok, true), coalesce(p_detalle, '{}'::jsonb))
  on conflict (nombre) do update set ultima_vez = excluded.ultima_vez, ok = excluded.ok, detalle = excluded.detalle
$$;
revoke all on function private.anotar_tarea(text, boolean, jsonb) from public, anon, authenticated;

-- Para las Edge Functions (depurar-archivos, conciliar-pagos)
create or replace function public.sistema_anotar_tarea(p_nombre text, p_ok boolean, p_detalle jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_nombre !~ '^[a-z0-9-]{1,60}$' then raise exception 'NOMBRE_INVALIDO' using errcode = 'P0001'; end if;
  perform private.anotar_tarea(p_nombre, p_ok, case when pg_column_size(p_detalle) <= 4096 then p_detalle else '{}'::jsonb end);
end $$;
revoke all on function public.sistema_anotar_tarea(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.sistema_anotar_tarea(text, boolean, jsonb) to service_role;

-- =====================================================================
-- 2. RETENCIÓN DE DATOS
-- - Notificaciones leídas: 90 días. Sin leer: 1 año.
-- - Mensajes de contacto archivados: 1 año. Atendidos: 2 años.
-- - Errores del navegador: 30 días (antes solo al azar).
-- Nunca se borran pagos, cobros, liquidaciones ni la bitácora del admin.
-- =====================================================================
create or replace function private.limpieza_retencion()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_notif int; v_notif_viejas int; v_contacto int; v_errores int; r jsonb;
begin
  delete from public.notificaciones where leida and creado_en < now() - interval '90 days';
  get diagnostics v_notif = row_count;
  delete from public.notificaciones where creado_en < now() - interval '365 days';
  get diagnostics v_notif_viejas = row_count;
  delete from public.mensajes_contacto
   where (estado = 'archivado' and creado_en < now() - interval '365 days')
      or (estado = 'atendido' and creado_en < now() - interval '730 days');
  get diagnostics v_contacto = row_count;
  delete from public.errores_cliente where creado_en < now() - interval '30 days';
  get diagnostics v_errores = row_count;
  r := jsonb_build_object('notificaciones', v_notif + v_notif_viejas, 'contacto', v_contacto, 'errores', v_errores);
  perform private.anotar_tarea('retencion', true, r);
  return r;
end $$;
revoke all on function private.limpieza_retencion() from public, anon, authenticated;

-- Índices para que la limpieza no recorra las tablas enteras
create index if not exists notificaciones_retencion_idx on public.notificaciones (creado_en) where leida;
create index if not exists notificaciones_creado_idx on public.notificaciones (creado_en);
create index if not exists mensajes_contacto_retencion_idx on public.mensajes_contacto (estado, creado_en);

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'modo-parche-retencion';
  perform cron.schedule('modo-parche-retencion', '45 8 * * *', 'select private.limpieza_retencion()');
exception when others then
  raise notice 'pg_cron no disponible (%). La retención no correrá sola.', sqlerrm;
end $$;

-- =====================================================================
-- 3. CONCILIACIÓN DE PAGOS (Edge Function conciliar-pagos)
-- Si el aviso de Wompi se pierde y el negocio no vuelve a la página, el
-- pago quedaba "PENDIENTE" para siempre. La función pregunta a Wompi y
-- aplica el resultado con aplicar_pago_wompi (que ya ignora repetidos).
-- =====================================================================
create index if not exists pagos_pendientes_idx on public.pagos (creado_en) where estado = 'PENDIENTE';

create or replace function public.sistema_pagos_por_conciliar(p_minutos integer default 15, p_limite integer default 50)
returns table (id bigint, referencia text, wompi_id text, monto_centavos bigint, creado_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.referencia, p.wompi_id, p.monto_centavos, p.creado_en
    from public.pagos p
   where p.estado = 'PENDIENTE'
     and p.creado_en < now() - make_interval(mins => greatest(coalesce(p_minutos, 15), 5))
     and p.creado_en > now() - interval '30 days'
   order by p.creado_en
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;
revoke all on function public.sistema_pagos_por_conciliar(integer, integer) from public, anon, authenticated;
grant execute on function public.sistema_pagos_por_conciliar(integer, integer) to service_role;

-- Pago que nunca llegó a Wompi (abrieron el pago y no pagaron) después de 48 h.
-- Si después llegara un aviso aprobado, aplicar_pago_wompi lo aplica igual.
create or replace function public.sistema_pago_abandonado(p_referencia text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.pagos
     set estado = 'ERROR', detalle = 'Abandonado: Wompi no tiene ninguna transacción con esta referencia'
   where referencia = p_referencia and estado = 'PENDIENTE' and wompi_id is null
     and creado_en < now() - interval '48 hours';
  return found;
end $$;
revoke all on function public.sistema_pago_abandonado(text) from public, anon, authenticated;
grant execute on function public.sistema_pago_abandonado(text) to service_role;

-- =====================================================================
-- 4b. REVISIÓN DE SALUD DEL BACKEND (panel admin > Bitácora)
-- =====================================================================
create or replace function public.admin_salud()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cron jsonb := null;
begin
  perform private.exigir_admin();
  -- Últimas ejecuciones de pg_cron (si la extensión guarda historial)
  if to_regclass('cron.job_run_details') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
          select jsonb_build_object('nombre', j.jobname, 'ultima_vez', d.start_time, 'estado', d.status, 'mensaje', left(d.return_message, 160)) x
            from cron.job j
            left join lateral (select r.start_time, r.status, r.return_message from cron.job_run_details r
                                where r.jobid = j.jobid order by r.start_time desc limit 1) d on true
           where j.jobname like 'modo-parche-%') t
      $q$ into v_cron;
    exception when others then v_cron := null;
    end;
  end if;
  return jsonb_build_object(
    'generado', now(),
    'cron', v_cron,
    'tareas', coalesce((select jsonb_agg(jsonb_build_object('nombre', t.nombre, 'ultima_vez', t.ultima_vez, 'ok', t.ok, 'detalle', t.detalle) order by t.nombre) from private.tareas_ejecutadas t), '[]'::jsonb),
    'pagos_pendientes_viejos', (select count(*) from public.pagos where estado = 'PENDIENTE' and creado_en < now() - interval '1 hour'),
    'pagos_con_error_7d', (select count(*) from public.pagos where estado = 'ERROR' and actualizado_en > now() - interval '7 days'),
    'errores_24h', (select count(*) from public.errores_cliente where creado_en > now() - interval '24 hours'),
    'archivos_por_borrar', (select count(*) from public.archivos_por_borrar),
    'archivo_mas_viejo', (select min(creado_en) from public.archivos_por_borrar),
    'contacto_sin_atender', (select count(*) from public.mensajes_contacto where estado = 'nuevo'),
    'negocios_en_mora', (select count(*) from private.negocios_mora),
    'notificaciones', (select count(*) from public.notificaciones)
  );
end $$;
revoke all on function public.admin_salud() from public, anon;
grant execute on function public.admin_salud() to authenticated;

-- =====================================================================
-- 5. TOPE DE TAMAÑO A LAS COLUMNAS JSON DE LOS PARCHES
-- NOT VALID: rige para lo nuevo y lo que se edite, sin revisar filas viejas.
-- =====================================================================
do $$
begin
  if to_regclass('public.parches') is null then return; end if;
  alter table public.parches drop constraint if exists parches_json_tamano;
  alter table public.parches add constraint parches_json_tamano check (
        coalesce(pg_column_size(cupon), 0) <= 8192
    and coalesce(pg_column_size(clima), 0) <= 8192
    and coalesce(pg_column_size(demo_regla), 0) <= 8192
    and coalesce(pg_column_size(oficial_info), 0) <= 32768
  ) not valid;
end $$;
