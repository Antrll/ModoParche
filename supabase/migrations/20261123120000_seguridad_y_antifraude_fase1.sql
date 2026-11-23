-- =====================================================================
-- ModoParche · Seguridad y antifraude, fase 1
-- Corre en: Supabase > SQL Editor, en una pestaña sola, DESPUÉS de publicar
-- la web nueva (si corre antes, el panel admin viejo no sabe pedir el 2FA).
-- Se puede correr más de una vez. No borra datos.
--
-- IMPORTANTE: esta migración reemplaza funciones de las migraciones 18 a 21.
-- Si vuelves a correr una de esas, corre esta otra vez al final.
--
--  1. Validación real del registro y mayoría de edad
--  2. 2FA obligatorio (aal2) para el equipo; finanzas solo para admins
--  3. Permisos por columna en las tablas que quedaron abiertas
--  4. Verificación de cédula con revisión humana
--  5. completar_registro blindado
--  6. Evasiones del cobro por resultados
--  7. Deudas, historial contable y carreras en liquidaciones y Wompi
--  8. Referidos sin autoinvitaciones
--  9. Llegadas falsas (GPS, QR fijo, reservas sin confirmar)
-- 11. Roles, notificaciones y push
-- 12. Fugas de privacidad y Storage
-- 13. Filtro de enlaces, XSS en notificaciones y errores_cliente
-- 14. Habeas data (mis_datos) y depuración de cédulas
-- =====================================================================

-- =====================================================================
-- 0. HERRAMIENTAS
-- =====================================================================
create schema if not exists private;
create schema if not exists seguridad;
revoke all on schema seguridad from public, anon;
grant usage on schema seguridad to authenticated;

-- Intentos fallidos (no se borran con un rollback porque quien falla no lanza error)
create table if not exists private.intentos (
  id        bigint generated always as identity primary key,
  clave     text not null,
  creado_en timestamptz not null default now()
);
create index if not exists intentos_clave_idx on private.intentos (clave, creado_en desc);

create or replace function private.demasiados_intentos(p_clave text, p_max integer, p_ventana interval)
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) >= p_max from private.intentos where clave = p_clave and creado_en > now() - p_ventana
$$;
create or replace function private.anotar_intento(p_clave text)
returns void language sql security definer set search_path = '' as $$
  insert into private.intentos (clave) values (p_clave)
$$;

-- Distancia en metros (haversine con el argumento acotado a 1)
create or replace function private.distancia_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(least(1.0::double precision,
    power(sin(radians(b_lat - a_lat) / 2), 2)
    + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

-- Cambia un pedazo de una función ya creada, sin reescribirla toda.
-- Si ya está aplicado no hace nada; si no encuentra el texto, avisa con error.
create or replace function private.parchear(p_fn regprocedure, p_de text, p_a text)
returns void language plpgsql security definer set search_path = '' as $$
declare d text := pg_get_functiondef(p_fn);
begin
  if position(p_a in d) > 0 then return; end if;
  if position(p_de in d) = 0 then raise exception 'No encontré el texto a cambiar en %: %', p_fn, left(p_de, 60); end if;
  execute replace(d, p_de, p_a);
end $$;

-- =====================================================================
-- 1. REGISTRO Y MAYORÍA DE EDAD
-- current_user dentro de SECURITY DEFINER es el dueño (postgres): la
-- validación nunca corría. session_user sí es quien se conectó (GoTrue).
-- =====================================================================
create or replace function private.validar_registro()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Cuentas del equipo creadas desde el SQL Editor (private.crear_admin)
  if session_user <> 'supabase_auth_admin' then return new; end if;
  -- Google y otros proveedores completan sus datos en completar_registro()
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'email' then return new; end if;
  if m ->> 'tipo' = 'empresa' then return new; end if;
  if coalesce(m ->> 'cedula', '') !~ '^[1-9][0-9]{4,9}$' then
    raise exception 'CEDULA_INVALIDA' using errcode = 'P0001', hint = 'La cédula es obligatoria: solo números, de 5 a 10 dígitos.';
  end if;
  if coalesce(m ->> 'telefono', '') <> '' and m ->> 'telefono' !~ '^3[0-9]{9}$' then
    raise exception 'CELULAR_INVALIDO' using errcode = 'P0001', hint = 'El celular debe tener 10 números y empezar por 3.';
  end if;
  if coalesce(trim(m ->> 'nombre'), '') !~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'' -]{3,80}$' then
    raise exception 'NOMBRE_INVALIDO' using errcode = 'P0001', hint = 'El nombre solo puede tener letras.';
  end if;
  return new;
end $$;

create or replace function private.validar_edad()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_fecha date;
begin
  if session_user <> 'supabase_auth_admin' then return new; end if;
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'email' then return new; end if;
  if m ->> 'tipo' = 'empresa' then return new; end if;
  begin
    v_fecha := nullif(m ->> 'fecha_nacimiento', '')::date;
  exception when others then
    v_fecha := null;
  end;
  if v_fecha is null or v_fecha < date '1900-01-01' or v_fecha > (current_date - interval '18 years')::date then
    raise exception 'MENOR_DE_EDAD' using errcode = 'P0001', hint = 'ModoParche es solo para mayores de 18 años.';
  end if;
  return new;
end $$;

create or replace function private.legal_al_registrarse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if session_user <> 'supabase_auth_admin' then return new; end if;
  if m ? 'acepta_terminos' then
    insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen)
    values (new.id, 'terminos', left(m ->> 'acepta_terminos', 20), true, 'registro');
  end if;
  if m ? 'autoriza_datos' then
    insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen)
    values (new.id, 'datos', left(m ->> 'autoriza_datos', 20), true, 'registro');
  end if;
  insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen)
  values (new.id, 'anuncios', '1.0', coalesce((m ->> 'recibe_anuncios')::boolean, false), 'registro');
  update public.perfiles set recibe_anuncios = coalesce((m ->> 'recibe_anuncios')::boolean, false) where id = new.id;
  return new;
exception when others then
  return new;  -- nunca bloquea el registro por esto
end $$;

-- NOT VALID: rige para todo lo nuevo sin tocar filas existentes
alter table public.perfiles_privados drop constraint if exists perfiles_privados_mayor_edad;
alter table public.perfiles_privados add constraint perfiles_privados_mayor_edad
  check (fecha_nacimiento is null or fecha_nacimiento <= (current_date - interval '18 years')) not valid;
-- La fecha de nacimiento no se edita directo (la app nunca lo hace)
revoke update (fecha_nacimiento) on public.perfiles_privados from authenticated;

-- =====================================================================
-- 2. 2FA OBLIGATORIO PARA EL EQUIPO
-- soy_admin() protege RLS y Storage: sin aal2 responde false. Para saber
-- quién es antes de pedirle el código está mi_tipo_cuenta(), que solo
-- habla de la cuenta propia y no abre ningún dato.
-- =====================================================================
create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.id = (select auth.uid()))
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;
create or replace function public.es_admin_total()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.rol = 'admin')
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;
create or replace function private.exigir_mfa()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_REQUERIDO' using errcode = '42501', hint = 'Confirma el código de verificación en dos pasos.';
  end if;
end $$;

-- Tipo de la cuenta propia, decidido por la base y no por los metadatos
create or replace function public.mi_tipo_cuenta()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tipo', case when a.id is not null then 'admin' when n.id is not null then 'negocio' else 'persona' end,
    'rol', a.rol,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'))
  from (select auth.uid() uid) yo
  left join public.admins a on a.id = yo.uid
  left join public.negocios n on n.id = yo.uid
  where yo.uid is not null
$$;
revoke all on function public.mi_tipo_cuenta() from public, anon;
grant execute on function public.mi_tipo_cuenta() to authenticated;

-- Finanzas: solo admins (los moderadores no)
select private.parchear('public.admin_reclamos()'::regprocedure, 'private.exigir_staff()', 'private.exigir_admin()');
select private.parchear('public.admin_anomalias()'::regprocedure, 'private.exigir_staff()', 'private.exigir_admin()');
select private.parchear('public.mi_liquidacion_detalle(bigint)'::regprocedure, 'public.soy_admin()', 'public.es_admin_total()');

-- =====================================================================
-- 3. PERMISOS POR COLUMNA
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['push_suscripciones', 'qr_identidad', 'qr_escaneos', 'lista_espera', 'invitaciones', 'viajes',
                           'viaje_pasajeros', 'encuestas', 'encuesta_votos', 'fotos_parche', 'ubicaciones_vivas',
                           'clics_boleteria', 'bloqueos', 'recordatorios_enviados'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

grant select, delete on public.push_suscripciones to authenticated;   -- altas por registrar_push()
grant select, delete on public.lista_espera to authenticated;
grant insert (parche_id) on public.lista_espera to authenticated;
grant select, delete on public.viajes to authenticated;
grant insert (parche_id, medio, puestos, desde, hora) on public.viajes to authenticated;
grant update (medio, puestos, desde, hora) on public.viajes to authenticated;
grant select, delete on public.viaje_pasajeros to authenticated;
grant insert (viaje_id) on public.viaje_pasajeros to authenticated;
grant select on public.encuestas to authenticated;
grant select, delete on public.encuesta_votos to authenticated;
grant insert (encuesta_id, opcion) on public.encuesta_votos to authenticated;
grant update (encuesta_id, opcion) on public.encuesta_votos to authenticated;   -- el upsert de la app las envía
grant select on public.ubicaciones_vivas to authenticated;
grant update (lat, lng, precision_m, actualizado, activa) on public.ubicaciones_vivas to authenticated;
grant select, delete on public.bloqueos to authenticated;
grant insert (bloqueado) on public.bloqueos to authenticated;
-- fotos_parche: ver sección 12

alter table public.viajes drop constraint if exists viajes_hora_check;
alter table public.viajes add constraint viajes_hora_check
  check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;

drop policy if exists "viajes: editar el mío" on public.viajes;
create policy "viajes: editar el mío" on public.viajes for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and public.es_miembro(parche_id, (select auth.uid()))
    and puestos >= (select count(*) from public.viaje_pasajeros vp where vp.viaje_id = viajes.id)
  );

drop policy if exists "votos: cambiar" on public.encuesta_votos;
create policy "votos: cambiar" on public.encuesta_votos for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.encuestas e
                where e.id = encuesta_votos.encuesta_id
                  and public.es_miembro(e.parche_id, (select auth.uid()))
                  and encuesta_votos.opcion < array_length(e.opciones, 1))
  );

-- =====================================================================
-- 4. VERIFICACIÓN DE CÉDULA CON REVISIÓN HUMANA
-- Subir las fotos deja la cuenta "pendiente". Solo un admin la aprueba.
-- Quien ya estaba verificado sigue verificado.
-- =====================================================================
alter table public.perfiles_privados add column if not exists cedula_estado text not null default 'sin_enviar';
alter table public.perfiles_privados add column if not exists cedula_enviada_en timestamptz;
alter table public.perfiles_privados add column if not exists cedula_revisada_en timestamptz;
alter table public.perfiles_privados add column if not exists cedula_revisada_por uuid references auth.users (id) on delete set null;
alter table public.perfiles_privados add column if not exists cedula_motivo text;
alter table public.perfiles_privados add column if not exists cedula_hash text;
alter table public.perfiles_privados drop constraint if exists perfiles_privados_cedula_estado_check;
alter table public.perfiles_privados add constraint perfiles_privados_cedula_estado_check
  check (cedula_estado in ('sin_enviar', 'pendiente', 'aprobada', 'rechazada'));
update public.perfiles_privados set cedula_estado = 'aprobada' where cedula_verificada and cedula_estado = 'sin_enviar';

-- Archivos que hay que borrar por la API de Storage (SQL no puede borrarlos)
create table if not exists public.archivos_por_borrar (
  id        bigint generated always as identity primary key,
  bucket    text not null check (bucket in ('documentos_identidad', 'album', 'fotos')),
  ruta      text not null,
  motivo    text not null default '',
  creado_en timestamptz not null default now(),
  unique (bucket, ruta)
);
alter table public.archivos_por_borrar enable row level security;
revoke all on public.archivos_por_borrar from anon, authenticated;

create or replace function private.encolar_cedula(p_usuario uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.archivos_por_borrar (bucket, ruta, motivo)
  select 'documentos_identidad', o.name, p_motivo
  from storage.objects o
  where o.bucket_id = 'documentos_identidad' and o.name like 'cedulas/' || p_usuario::text || '/%'
  on conflict (bucket, ruta) do nothing;
  update public.perfiles_privados set cedula_frontal_path = null, cedula_trasera_path = null where id = p_usuario;
end $$;

-- ¿Puede subir o borrar sus fotos? No mientras estén en revisión o aprobadas.
create or replace function public.cedula_editable()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select pp.cedula_estado in ('sin_enviar', 'rechazada') from public.perfiles_privados pp where pp.id = (select auth.uid())), true)
$$;
revoke all on function public.cedula_editable() from public, anon;
grant execute on function public.cedula_editable() to authenticated;

drop policy if exists "documentos: borrar los propios" on storage.objects;
create policy "documentos: borrar los propios" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos_identidad' and (storage.foldername(name))[1] = 'cedulas'
         and (storage.foldername(name))[2] = (select auth.uid())::text and (select public.cedula_editable()));
drop policy if exists "documentos: subir los propios" on storage.objects;
create policy "documentos: subir los propios" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos_identidad' and (storage.foldername(name))[1] = 'cedulas'
              and (storage.foldername(name))[2] = (select auth.uid())::text
              and (select public.docs_identidad_subidos()) < 8 and (select public.cedula_editable()));
drop policy if exists "documentos: depurar el equipo" on storage.objects;
create policy "documentos: depurar el equipo" on storage.objects for delete to authenticated
  using (bucket_id in ('documentos_identidad', 'album') and (select public.es_admin_total()));

create or replace function public.verificar_mi_cedula(p_frontal text, p_trasera text, p_numero_leido text, p_metodo text default 'codigo')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_ced    text;
  v_leido  text := ltrim(regexp_replace(coalesce(p_numero_leido, ''), '\D', '', 'g'), '0');
  v_pref   text;
  v_ya     boolean;
  v_estado text;
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if exists (select 1 from public.negocios n where n.id = v_uid) then
    raise exception 'SOLO_PERSONAS' using errcode = 'P0001', hint = 'La verificación con cédula es para cuentas personales.';
  end if;
  select ltrim(pp.cedula, '0'), pp.cedula_verificada, pp.cedula_estado into v_ced, v_ya, v_estado
  from public.perfiles_privados pp where pp.id = v_uid;
  if v_ced is null or v_ced = '' then
    raise exception 'SIN_CEDULA' using errcode = 'P0001', hint = 'Tu cuenta no tiene cédula registrada. Escríbenos para agregarla.';
  end if;
  if v_ya then return jsonb_build_object('verificado', true, 'ya_estaba', true); end if;
  if v_estado = 'pendiente' then return jsonb_build_object('verificado', false, 'pendiente', true, 'ya_estaba', true); end if;
  -- Primer filtro: el número lo manda el navegador, por eso nunca aprueba nada
  if v_leido = '' or v_leido <> v_ced then
    raise exception 'NO_COINCIDE' using errcode = 'P0001', hint = 'El número de la foto no coincide con la cédula de tu registro.';
  end if;
  v_pref := 'cedulas/' || v_uid::text || '/';
  if p_frontal is null or p_trasera is null or p_frontal = p_trasera
     or left(p_frontal, length(v_pref)) <> v_pref or left(p_trasera, length(v_pref)) <> v_pref then
    raise exception 'RUTA_INVALIDA' using errcode = 'P0001', hint = 'Las fotos no están en tu carpeta.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documentos_identidad' and o.name = p_frontal)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'documentos_identidad' and o.name = p_trasera) then
    raise exception 'FALTAN_FOTOS' using errcode = 'P0001', hint = 'No encontramos las dos fotos. Vuelve a subirlas.';
  end if;

  update public.perfiles_privados
     set cedula_frontal_path = p_frontal, cedula_trasera_path = p_trasera,
         cedula_estado = 'pendiente', cedula_enviada_en = now(), cedula_motivo = null,
         cedula_metodo = case when p_metodo = 'ocr' then 'ocr' else 'codigo' end
   where id = v_uid;
  if to_regclass('public.consentimientos') is not null then
    execute 'insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen) values ($1, ''identidad'', ''1.0'', true, ''perfil'')'
      using v_uid;
  end if;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (v_uid, 'i-shield', '<b>Recibimos tu cédula.</b> El equipo la revisa y te avisamos apenas quede aprobada.');
  return jsonb_build_object('verificado', false, 'pendiente', true, 'ya_estaba', false);
end $$;

-- Lista para el equipo: en revisión y verificadas antes de existir la revisión
create or replace function public.admin_verificaciones()
returns table (id uuid, nombre text, email text, cedula text, fecha_nacimiento date, estado text,
               frontal text, trasera text, enviada_en timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  return query
    select pp.id, p.nombre, u.email::text, pp.cedula, pp.fecha_nacimiento, pp.cedula_estado,
           pp.cedula_frontal_path, pp.cedula_trasera_path, coalesce(pp.cedula_enviada_en, pp.cedula_verificada_en)
    from public.perfiles_privados pp
    join public.perfiles p on p.id = pp.id
    join auth.users u on u.id = pp.id
    where pp.cedula_estado = 'pendiente'
       or (pp.cedula_estado = 'aprobada' and pp.cedula_revisada_en is null and pp.cedula_frontal_path is not null)
    order by (pp.cedula_estado = 'pendiente') desc, coalesce(pp.cedula_enviada_en, pp.cedula_verificada_en)
    limit 200;
end $$;
revoke all on function public.admin_verificaciones() from public, anon;
grant execute on function public.admin_verificaciones() to authenticated;

-- Aprobar: queda sello, fecha y huella; las fotos pasan a la cola de borrado
create or replace function public.admin_aprobar_verificacion(p_usuario uuid, p_nota text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text; v_ced text; v_estado text;
begin
  perform private.exigir_admin();
  select pp.cedula, pp.cedula_estado into v_ced, v_estado from public.perfiles_privados pp where pp.id = p_usuario for update;
  if v_ced is null or v_estado not in ('pendiente', 'aprobada') then
    raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'Esa cuenta no tiene una verificación por revisar.';
  end if;
  update public.perfiles_privados
     set cedula_verificada = true, cedula_verificada_en = coalesce(cedula_verificada_en, now()),
         cedula_estado = 'aprobada', cedula_revisada_en = now(), cedula_revisada_por = auth.uid(), cedula_motivo = null,
         cedula_hash = encode(sha256(convert_to(p_usuario::text || ':' || v_ced, 'UTF8')), 'hex')
   where id = p_usuario;
  update public.perfiles set verificado = true where id = p_usuario returning nombre into v_nombre;
  perform private.encolar_cedula(p_usuario, 'verificación aprobada');
  if v_estado = 'pendiente' then
    insert into public.notificaciones (usuario_id, icono, texto)
    values (p_usuario, 'i-shield', '<b>¡Ya eres Parcero Verificado!</b> Puedes abrir parches y tu insignia se ve en tu perfil.');
  end if;
  perform private.registrar('aprobar_verificacion_cedula', coalesce(v_nombre, ''), left(coalesce(p_nota, ''), 200));
end $$;
revoke all on function public.admin_aprobar_verificacion(uuid, text) from public, anon;
grant execute on function public.admin_aprobar_verificacion(uuid, text) to authenticated;

create or replace function public.admin_revocar_verificacion(p_usuario uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text;
begin
  perform private.exigir_admin();
  update public.perfiles_privados
     set cedula_verificada = false, cedula_verificada_en = null, cedula_estado = 'rechazada',
         cedula_revisada_en = now(), cedula_revisada_por = auth.uid(), cedula_motivo = nullif(left(coalesce(p_motivo, ''), 200), '')
   where id = p_usuario;
  update public.perfiles set verificado = false where id = p_usuario returning nombre into v_nombre;
  if v_nombre is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa cuenta ya no existe.';
  end if;
  perform private.encolar_cedula(p_usuario, 'verificación rechazada');
  insert into public.notificaciones (usuario_id, icono, texto)
  values (p_usuario, 'i-info', '<b>ModoParche:</b> Tu verificación de identidad no fue aprobada. Repite las fotos desde tu perfil o escríbenos.');
  perform private.registrar('quitar_verificacion_cedula', v_nombre, coalesce(p_motivo, ''));
end $$;

create or replace function public.admin_archivos_por_borrar()
returns table (id bigint, bucket text, ruta text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  return query select a.id, a.bucket, a.ruta from public.archivos_por_borrar a order by a.id limit 200;
end $$;
revoke all on function public.admin_archivos_por_borrar() from public, anon;
grant execute on function public.admin_archivos_por_borrar() to authenticated;

create or replace function public.admin_archivos_borrados(p_ids bigint[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  -- Solo sale de la cola lo que de verdad ya no está en Storage
  delete from public.archivos_por_borrar a
   where a.id = any (coalesce(p_ids, '{}'))
     and not exists (select 1 from storage.objects o where o.bucket_id = a.bucket and o.name = a.ruta);
end $$;
revoke all on function public.admin_archivos_borrados(bigint[]) from public, anon;
grant execute on function public.admin_archivos_borrados(bigint[]) to authenticated;

-- Al borrar una cuenta (por cualquier vía) sus archivos privados quedan en cola
create or replace function private.encolar_archivos_cuenta()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.archivos_por_borrar (bucket, ruta, motivo)
  select o.bucket_id, o.name, 'cuenta borrada'
  from storage.objects o
  where (o.bucket_id = 'documentos_identidad' and o.name like 'cedulas/' || old.id::text || '/%')
     or (o.bucket_id = 'album' and (storage.foldername(o.name))[2] = old.id::text)
  on conflict (bucket, ruta) do nothing;
  return old;
end $$;
drop trigger if exists encolar_archivos_cuenta on auth.users;
create trigger encolar_archivos_cuenta before delete on auth.users
  for each row execute function private.encolar_archivos_cuenta();

-- =====================================================================
-- 5. COMPLETAR REGISTRO
-- Devuelve {ok:false} en vez de lanzar error para que el freno de intentos
-- se guarde (un error desharía el registro del intento).
-- =====================================================================
drop function if exists public.completar_registro(text, date, boolean, boolean, boolean, text);
create function public.completar_registro(p_cedula text, p_fecha date default null, p_terminos boolean default null,
  p_datos boolean default null, p_anuncios boolean default false, p_nombre text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_ced text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_google boolean;
  v_actual text;
  v_fecha date;
  v_clave text;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if exists (select 1 from public.negocios where id = uid) or exists (select 1 from public.admins where id = uid) then
    raise exception 'SOLO_PERSONAS' using errcode = 'P0001', hint = 'Este paso es solo para cuentas personales.';
  end if;
  select pp.cedula, pp.fecha_nacimiento into v_actual, v_fecha from public.perfiles_privados pp where pp.id = uid;
  if v_actual is not null then
    raise exception 'CEDULA_YA_REGISTRADA' using errcode = 'P0001', hint = 'Tu cuenta ya tiene cédula. Si está mal, escríbenos a modoparcheoficial@gmail.com.';
  end if;
  if v_ced !~ '^[1-9][0-9]{4,9}$' then
    raise exception 'CEDULA_INVALIDA' using errcode = 'P0001', hint = 'Escribe tu cédula solo con números: de 5 a 10 dígitos.';
  end if;
  v_clave := 'completar:' || uid::text;
  if private.demasiados_intentos(v_clave, 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'codigo', 'DEMASIADOS', 'hint', 'Hiciste muchos intentos. Espera una hora o escríbenos a modoparcheoficial@gmail.com.');
  end if;
  if exists (select 1 from public.perfiles_privados where cedula = v_ced and id <> uid) then
    perform private.anotar_intento(v_clave);
    return jsonb_build_object('ok', false, 'codigo', 'CEDULA_REPETIDA', 'hint', 'No pudimos registrar esa cédula. Revísala o escríbenos a modoparcheoficial@gmail.com.');
  end if;
  v_fecha := coalesce(v_fecha, p_fecha);
  if v_fecha is null or v_fecha > (current_date - interval '18 years')::date or v_fecha < date '1900-01-01' then
    raise exception 'MENOR_DE_EDAD' using errcode = 'P0001', hint = 'ModoParche es solo para mayores de 18 años. Escribe tu fecha de nacimiento.';
  end if;
  select coalesce(raw_app_meta_data ->> 'provider', 'email') <> 'email' into v_google from auth.users where id = uid;
  if v_google and (not coalesce(p_terminos, false) or not coalesce(p_datos, false))
     and not exists (select 1 from public.consentimientos c where c.usuario_id = uid and c.tipo = 'terminos' and c.aceptado) then
    raise exception 'FALTA_AUTORIZACION' using errcode = 'P0001', hint = 'Necesitamos que aceptes los términos y el tratamiento de datos.';
  end if;

  insert into public.perfiles_privados (id, cedula, fecha_nacimiento) values (uid, v_ced, v_fecha)
  on conflict (id) do update set cedula = excluded.cedula, fecha_nacimiento = excluded.fecha_nacimiento;

  if v_google and not exists (select 1 from public.consentimientos c where c.usuario_id = uid and c.tipo = 'terminos' and c.aceptado) then
    insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen) values
      (uid, 'terminos', '1.0', true, 'perfil'),
      (uid, 'datos', '1.0', true, 'perfil'),
      (uid, 'anuncios', '1.0', coalesce(p_anuncios, false), 'perfil');
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is not null and trim(p_nombre) ~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'' -]{3,80}$' then
    update public.perfiles set nombre = left(trim(p_nombre), 80) where id = uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.completar_registro(text, date, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.completar_registro(text, date, boolean, boolean, boolean, text) to authenticated;

-- El modal debe pedir la fecha también a cuentas viejas de correo sin fecha
create or replace function public.estado_registro()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'proveedor', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
    'falta', coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
             and (pp.fecha_nacimiento is null
                  or not exists (select 1 from public.consentimientos c where c.usuario_id = u.id and c.tipo = 'terminos' and c.aceptado)),
    'falta_cedula', pp.cedula is null and not exists (select 1 from public.negocios n where n.id = u.id)
                    and not exists (select 1 from public.admins a where a.id = u.id),
    'falta_fecha', pp.cedula is null and pp.fecha_nacimiento is null,
    'nombre', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
  )
  from auth.users u
  left join public.perfiles_privados pp on pp.id = u.id
  where u.id = auth.uid()
$$;

-- =====================================================================
-- 6. EVASIONES DEL COBRO
-- =====================================================================
alter table public.parches add column if not exists plan_aplicado text;
alter table public.parches add column if not exists tarifa_snapshot integer;
alter table public.parches add column if not exists comision_pct_snapshot integer;
alter table public.mesa_promos add column if not exists plan_aplicado text;
alter table public.mesa_promos add column if not exists tarifa_snapshot integer;
alter table public.negocios add column if not exists plan_programado text;
alter table public.negocios add column if not exists plan_programado_en date;
alter table public.negocios drop constraint if exists negocios_plan_programado_check;
alter table public.negocios add constraint negocios_plan_programado_check check (plan_programado is null or plan_programado = 'basico');

-- Los parches y promos vigentes quedan con la tarifa de hoy
update public.parches p
   set plan_aplicado = n.plan, tarifa_snapshot = private.tarifa_cliente(n.plan), comision_pct_snapshot = private.comision_pct(n.plan)
  from public.negocios n
 where n.id = p.creador_id and p.plan_aplicado is null;
update public.mesa_promos m
   set plan_aplicado = n.plan, tarifa_snapshot = private.tarifa_cliente(n.plan)
  from public.negocios n
 where n.id = m.negocio_id and m.plan_aplicado is null;

-- Contador que no baja al borrar parches
create table if not exists private.parches_creados (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  mes        date not null,
  n          integer not null default 0,
  primary key (negocio_id, mes)
);
insert into private.parches_creados (negocio_id, mes, n)
select p.creador_id, date_trunc('month', now())::date, count(*)
from public.parches p join public.negocios x on x.id = p.creador_id
where p.creado_en >= date_trunc('month', now())
group by p.creador_id
on conflict (negocio_id, mes) do update set n = greatest(private.parches_creados.n, excluded.n);

create or replace function private.parche_de_negocio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n public.negocios%rowtype;
  v_mes date := date_trunc('month', now())::date;
  v_n int;
begin
  select * into n from public.negocios where id = new.creador_id;
  if not found then
    new.aliado := false;            -- una persona nunca se marca como aliado
    -- Promos y relámpagos son de negocios (el equipo sí puede publicarlos)
    if not exists (select 1 from public.admins a where a.id = new.creador_id) then
      new.promo := null;
      new.relampago := false;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    select c.n into v_n from private.parches_creados c where c.negocio_id = n.id and c.mes = v_mes for update;
    if n.plan = 'basico' and coalesce(v_n, 0) >= 2 then
      raise exception 'LIMITE_PLAN' using errcode = 'P0001',
        hint = 'El plan Parche básico incluye 2 parches al mes. Pásate a Parche Villavo para publicar sin límite.';
    end if;
    insert into private.parches_creados (negocio_id, mes, n) values (n.id, v_mes, 1)
    on conflict (negocio_id, mes) do update set n = private.parches_creados.n + 1;
    new.plan_aplicado := n.plan;
    new.tarifa_snapshot := private.tarifa_cliente(n.plan);
    new.comision_pct_snapshot := private.comision_pct(n.plan);
  elsif coalesce(current_setting('mp.edicion_admin', true), '') <> '1'
        and (new.modalidad is distinct from old.modalidad or coalesce(new.precio_paquete, 0) < coalesce(old.precio_paquete, 0))
        and exists (select 1 from public.parche_miembros m where m.parche_id = old.id and m.usuario_id <> old.creador_id) then
    raise exception 'COBRO_FIRME' using errcode = 'P0001',
      hint = 'Este parche ya tiene gente: no puedes cambiar el tipo de cobro ni bajar el precio del paquete.';
  end if;

  new.aliado := true;
  new.verificado := n.verificado;    -- el sello solo sale si el equipo verificó el negocio
  new.creador_nombre := n.nombre;
  return new;
end $$;

create or replace function private.congelar_tarifa_mesa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_plan text;
begin
  select plan into v_plan from public.negocios where id = new.negocio_id;
  new.plan_aplicado := v_plan;
  new.tarifa_snapshot := private.tarifa_cliente(coalesce(v_plan, 'basico'));
  return new;
end $$;
drop trigger if exists congelar_tarifa_mesa on public.mesa_promos;
create trigger congelar_tarifa_mesa before insert on public.mesa_promos
  for each row execute function private.congelar_tarifa_mesa();

-- Plan: sedes lo aprueba el equipo; bajar a básico con cuentas abiertas va al próximo ciclo
drop function if exists public.elegir_plan(text, integer);
create function public.elegir_plan(p_plan text, p_sedes integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype; v_desde date;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if p_plan not in ('basico', 'villavo', 'sedes') then
    raise exception 'PLAN_INVALIDO' using errcode = 'P0001', hint = 'Ese plan no existe.';
  end if;
  select * into n from public.negocios where id = auth.uid() for update;
  if not found then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001', hint = 'Esta cuenta no es de negocio.'; end if;

  if p_plan = 'sedes' and n.plan <> 'sedes' then
    if n.plan_pendiente is distinct from 'sedes' then
      update public.negocios set plan_pendiente = 'sedes', sedes = greatest(2, least(50, coalesce(p_sedes, sedes, 2))) where id = n.id;
      insert into public.notificaciones (usuario_id, icono, texto)
      select a.id, 'i-store', '<b>' || private.texto_plano(n.nombre) || '</b> pidió el plan Varias sedes. Revísalo en Negocios.' from public.admins a;
    end if;
    return jsonb_build_object('plan', n.plan, 'aplicado', false, 'solicitado', true);
  end if;

  if p_plan = 'basico' and n.plan <> 'basico'
     and (exists (select 1 from public.parches p where p.creador_id = n.id and p.inicio > now() - interval '6 hours')
          or exists (select 1 from public.mesa_promos m where m.negocio_id = n.id and m.activa)
          or exists (select 1 from public.mesa_reservas r where r.negocio_id = n.id and r.estado in ('pendiente', 'confirmada'))
          or exists (select 1 from public.cobros c where c.negocio_id = n.id and c.liquidacion_id is null and not c.anulado and c.monto_cop > 0)) then
    v_desde := (date_trunc('month', now()) + interval '1 month')::date;
    update public.negocios set plan_programado = 'basico', plan_programado_en = v_desde, plan_pendiente = null where id = n.id;
    return jsonb_build_object('plan', n.plan, 'aplicado', false, 'programado_en', v_desde);
  end if;

  update public.negocios
     set plan = p_plan, plan_vence = null, plan_pendiente = null, plan_programado = null, plan_programado_en = null,
         sedes = case when p_plan = 'sedes' then greatest(2, least(50, coalesce(p_sedes, sedes, 2))) else 1 end
   where id = n.id;
  return jsonb_build_object('plan', p_plan, 'aplicado', true);
end $$;
revoke all on function public.elegir_plan(text, integer) from public, anon;
grant execute on function public.elegir_plan(text, integer) to authenticated;

create or replace function public.cambiar_a_basico()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.elegir_plan('basico');
end $$;

select private.parchear('public.admin_cambiar_plan(uuid, text)'::regprocedure,
  'update public.negocios set plan = p_plan where id = p_negocio;',
  'update public.negocios set plan = p_plan, plan_pendiente = null, plan_programado = null, plan_programado_en = null, sedes = case when p_plan = ''sedes'' then greatest(2, sedes) else 1 end where id = p_negocio;');

create or replace function private.aplicar_planes_programados()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n int := 0; g record;
begin
  for g in select id from public.negocios where plan_programado is not null and plan_programado_en <= current_date for update loop
    update public.negocios set plan = 'basico', sedes = 1, plan_programado = null, plan_programado_en = null where id = g.id;
    update public.parches set plan_aplicado = 'basico', tarifa_snapshot = 0, comision_pct_snapshot = 0
     where creador_id = g.id and inicio > now();
    update public.mesa_promos set plan_aplicado = 'basico', tarifa_snapshot = 0 where negocio_id = g.id;
    insert into public.notificaciones (usuario_id, icono, texto)
    values (g.id, 'i-info', '<b>Ya estás en Parche básico.</b> Desde hoy no pagas comisión y publicas 2 parches al mes.');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Cobro de una llegada. GPS del cliente por sí solo no se factura.
create or replace function private.cobro_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.parches%rowtype;
  n public.negocios%rowtype;
  v_monto integer;
  v_pct integer;
  v_tarifa integer;
  v_plan text;
begin
  select * into p from public.parches where id = new.parche_id;
  if not found or not coalesce(p.aliado, false) or p.creador_id is null or new.usuario_id = p.creador_id then return new; end if;
  select * into n from public.negocios where id = p.creador_id;
  if not found then return new; end if;

  if coalesce(new.checkin, false) and (not coalesce(old.checkin, false) or new.checkin_metodo is distinct from old.checkin_metodo) then
    if coalesce(new.checkin_metodo, '') = 'gps' then return new; end if;  -- falta que el local la confirme
    v_pct := greatest(coalesce(p.comision_pct_snapshot, 0), private.comision_pct(n.plan));
    v_tarifa := greatest(coalesce(p.tarifa_snapshot, 0), private.tarifa_cliente(n.plan));
    v_plan := case when private.tarifa_cliente(n.plan) >= coalesce(p.tarifa_snapshot, 0) then n.plan else coalesce(p.plan_aplicado, n.plan) end;
    v_monto := case when p.modalidad = 'paquete' then round(coalesce(p.precio_paquete, 0) * v_pct / 100.0)::int else v_tarifa end;
    insert into public.cobros (negocio_id, tipo, parche_id, usuario_id, base_cop, monto_cop, plan, validado_por, codigo)
    values (n.id, p.modalidad, p.id, new.usuario_id,
            case when p.modalidad = 'paquete' then p.precio_paquete end, v_monto, v_plan,
            coalesce(new.checkin_metodo, 'local'),
            upper(left(encode(sha256(convert_to(p.id::text || ':' || new.usuario_id::text, 'UTF8')), 'hex'), 6)))
    on conflict (parche_id, usuario_id) where parche_id is not null
    do update set anulado = false, monto_cop = greatest(public.cobros.monto_cop, excluded.monto_cop),
                  plan = case when excluded.monto_cop >= public.cobros.monto_cop then excluded.plan else public.cobros.plan end,
                  validado_por = excluded.validado_por, actualizado_en = now()
      where public.cobros.liquidacion_id is null;
  elsif coalesce(old.checkin, false) and not coalesce(new.checkin, false) then
    update public.cobros set anulado = true, actualizado_en = now()
     where parche_id = p.id and usuario_id = new.usuario_id and liquidacion_id is null;
  end if;
  return new;
end $$;
drop trigger if exists cobro_parche on public.parche_miembros;
create trigger cobro_parche after update of checkin, checkin_metodo on public.parche_miembros
  for each row execute function private.cobro_parche();

create or replace function private.cobro_reserva()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype; v_snap integer; v_plan_snap text; v_tarifa integer; v_personas integer;
begin
  select * into n from public.negocios where id = new.negocio_id;
  if not found then return new; end if;
  if new.estado = 'llego' then
    select m.tarifa_snapshot, m.plan_aplicado into v_snap, v_plan_snap from public.mesa_promos m where m.id = new.promo_id;
    v_tarifa := greatest(coalesce(v_snap, 0), private.tarifa_cliente(n.plan));
    v_personas := coalesce(new.llegaron, new.personas);
    insert into public.cobros (negocio_id, tipo, reserva_id, usuario_id, personas, monto_cop, plan, validado_por, codigo)
    values (n.id, 'reserva', new.id, new.usuario_id, v_personas, v_tarifa * v_personas,
            case when private.tarifa_cliente(n.plan) >= coalesce(v_snap, 0) then n.plan else coalesce(v_plan_snap, n.plan) end,
            coalesce(new.llegada_metodo, 'local'), new.codigo)
    on conflict (reserva_id) where reserva_id is not null
    do update set anulado = false, personas = excluded.personas,
                  -- La tarifa ya cobrada no baja; sí cambia si llegaron menos personas
                  monto_cop = greatest(excluded.monto_cop, (public.cobros.monto_cop / greatest(public.cobros.personas, 1)) * excluded.personas),
                  validado_por = excluded.validado_por, actualizado_en = now()
      where public.cobros.liquidacion_id is null;
  elsif old.estado = 'llego' then
    update public.cobros set anulado = true, actualizado_en = now() where reserva_id = new.id and liquidacion_id is null;
  end if;
  return new;
end $$;

-- Una llegada por QR no se desmarca: para eso está el reclamo
create or replace function private.llegada_firme_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.checkin, false) and not coalesce(new.checkin, false)
     and coalesce(current_setting('mp.ajuste_equipo', true), '') <> 'si' then
    if old.checkin_metodo = 'qr' and exists (select 1 from public.parches p where p.id = old.parche_id and p.aliado) then
      raise exception 'USA_RECLAMO' using errcode = 'P0001',
        hint = 'Esta llegada se validó con QR. Si hubo un error, haz un reclamo desde Cobros.';
    end if;
    if old.checkin_en < now() - interval '48 hours'
       or exists (select 1 from public.cobros c where c.parche_id = old.parche_id and c.usuario_id = old.usuario_id
                    and c.liquidacion_id is not null and not c.anulado) then
      raise exception 'FUERA_DE_PLAZO' using errcode = 'P0001',
        hint = 'Las llegadas se corrigen hasta 48 horas después. Si hubo un error, haz un reclamo desde Cobros.';
    end if;
  end if;
  return new;
end $$;

create or replace function private.llegada_firme_mesa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.estado = 'llego' and coalesce(current_setting('mp.ajuste_equipo', true), '') <> 'si' then
    -- El QR prueba que llegaron; cuántos eran sí se puede corregir (abajo)
    if new.estado <> 'llego' and old.llegada_metodo in ('qr', 'gps') then
      raise exception 'USA_RECLAMO' using errcode = 'P0001',
        hint = 'Esta llegada la validó el cliente en el local. Si hubo un error, haz un reclamo desde Cobros.';
    end if;
    if (new.estado <> 'llego' or coalesce(new.llegaron, new.personas) < coalesce(old.llegaron, old.personas))
       and (coalesce(old.llegada_en, old.actualizado_en) < now() - interval '48 hours'
            or exists (select 1 from public.cobros c where c.reserva_id = old.id and c.liquidacion_id is not null and not c.anulado)) then
      raise exception 'FUERA_DE_PLAZO' using errcode = 'P0001',
        hint = 'Las llegadas se corrigen hasta 48 horas después. Si hubo un error, haz un reclamo desde Cobros.';
    end if;
  end if;
  return new;
end $$;

-- =====================================================================
-- 7. DEUDAS, HISTORIAL CONTABLE Y CARRERAS
-- =====================================================================
alter table public.liquidaciones add column if not exists negocio_nombre text;
alter table public.liquidaciones add column if not exists negocio_nit text;
update public.liquidaciones l set negocio_nombre = n.nombre, negocio_nit = n.nit from public.negocios n where n.id = l.negocio_id and l.negocio_nombre is null;

-- El historial contable sobrevive al borrado del negocio
do $$
declare t text;
begin
  foreach t in array array['cobros', 'liquidaciones', 'pagos', 'reclamos_cobro'] loop
    execute format('alter table public.%I alter column negocio_id drop not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_negocio_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (negocio_id) references public.negocios (id) on delete set null', t, t || '_negocio_id_fkey');
  end loop;
end $$;

create or replace function private.copiar_negocio_a_liquidaciones()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.liquidaciones set negocio_nombre = old.nombre, negocio_nit = old.nit where negocio_id = old.id;
  return old;
end $$;
drop trigger if exists copiar_negocio_a_liquidaciones on public.negocios;
create trigger copiar_negocio_a_liquidaciones before delete on public.negocios
  for each row execute function private.copiar_negocio_a_liquidaciones();

-- Una sola regla de deuda para borrar la cuenta y para avisar antes de tocar archivos
create or replace function private.tiene_deuda(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.liquidaciones l where l.negocio_id = p_uid and l.estado = 'pendiente')
     or exists (select 1 from public.cobros c where c.negocio_id = p_uid and c.liquidacion_id is null and not c.anulado and c.monto_cop > 0)
$$;
revoke all on function private.tiene_deuda(uuid) from public, anon, authenticated;

create or replace function public.puedo_borrar_cuenta()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where id = auth.uid()) then
    return jsonb_build_object('ok', false, 'hint', 'Las cuentas del equipo se borran desde la base de datos.');
  end if;
  if private.tiene_deuda(auth.uid()) then
    return jsonb_build_object('ok', false, 'hint', 'Tu negocio tiene cobros por pagar o sin liquidar. Págalos en Perfil y plan > Cobros, o escríbenos, antes de borrar la cuenta.');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.puedo_borrar_cuenta() from public, anon;
grant execute on function public.puedo_borrar_cuenta() to authenticated;

create or replace function public.borrar_mi_cuenta()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where id = v_uid) then
    raise exception 'ES_ADMIN' using errcode = 'P0001', hint = 'Las cuentas del equipo se borran desde la base de datos.';
  end if;
  if private.tiene_deuda(v_uid) then
    raise exception 'TIENE_DEUDA' using errcode = 'P0001',
      hint = 'Tu negocio tiene cobros por pagar o sin liquidar. Págalos en Perfil y plan > Cobros, o escríbenos, antes de borrar la cuenta.';
  end if;
  delete from auth.users where id = v_uid;
end $$;

create or replace function private.generar_liquidaciones()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; g record; v_id bigint; v_total integer;
begin
  perform pg_advisory_xact_lock(hashtext('generar_liquidaciones'));
  perform private.aplicar_planes_programados();
  for g in
    select c.negocio_id, c.periodo, sum(c.personas)::int clientes, sum(c.monto_cop)::int total
    from public.cobros c
    where c.liquidacion_id is null and not c.anulado and c.periodo < date_trunc('month', now())::date and c.negocio_id is not null
    group by c.negocio_id, c.periodo
  loop
    insert into public.liquidaciones (negocio_id, periodo, clientes, total_cop, referencia, estado, vence, negocio_nombre, negocio_nit)
    select g.negocio_id, g.periodo, g.clientes, g.total,
           'MP-' || to_char(g.periodo, 'YYMM') || '-' || upper(left(md5(g.negocio_id::text || g.periodo::text), 6)),
           case when g.total > 0 then 'pendiente' else 'sin_cobro' end,
           (g.periodo + interval '1 month' + interval '15 days')::date, n.nombre, n.nit
    from public.negocios n where n.id = g.negocio_id
    on conflict (negocio_id, periodo) do update
      set clientes = public.liquidaciones.clientes + excluded.clientes,
          total_cop = public.liquidaciones.total_cop + excluded.total_cop,
          estado = case when public.liquidaciones.estado in ('sin_cobro', 'pagada') and excluded.total_cop > 0 then 'pendiente'
                        else public.liquidaciones.estado end
    returning id into v_id;
    update public.cobros set liquidacion_id = v_id
     where negocio_id = g.negocio_id and periodo = g.periodo and liquidacion_id is null and not anulado;
    perform private.aplicar_credito(v_id);
    v_total := null;
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

do $$
begin
  create unique index if not exists pagos_wompi_id_uq on public.pagos (wompi_id) where wompi_id is not null;
exception when unique_violation then
  raise notice 'Hay transacciones de Wompi repetidas en pagos: revísalas antes de crear el índice único.';
end $$;

create or replace function public.aplicar_pago_wompi(
  p_referencia text, p_estado text, p_wompi_id text, p_metodo text, p_monto bigint, p_moneda text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.pagos%rowtype;
  l public.liquidaciones%rowtype;
  v_estado text := upper(coalesce(p_estado, ''));
  v_abono integer;
  v_nuevo integer;
  v_exceso integer;
begin
  select * into v from public.pagos where referencia = p_referencia for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'NO_EXISTE'); end if;
  if v.estado = 'APPROVED' then return jsonb_build_object('ok', true, 'ya_aplicado', true); end if;
  if v_estado not in ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR') then
    return jsonb_build_object('ok', false, 'motivo', 'ESTADO_DESCONOCIDO');
  end if;
  -- La misma transacción de Wompi no se aplica a dos pagos
  if p_wompi_id is not null and exists (select 1 from public.pagos x where x.wompi_id = left(p_wompi_id, 80) and x.id <> v.id) then
    return jsonb_build_object('ok', false, 'motivo', 'TRANSACCION_REPETIDA');
  end if;
  if p_monto is distinct from v.monto_centavos or upper(coalesce(p_moneda, '')) <> v.moneda then
    update public.pagos set estado = 'ERROR', detalle = 'El monto o la moneda no coinciden', wompi_id = left(p_wompi_id, 80) where id = v.id;
    return jsonb_build_object('ok', false, 'motivo', 'MONTO');
  end if;

  update public.pagos
     set estado = case v_estado when 'PENDING' then 'PENDIENTE' else v_estado end,
         wompi_id = left(p_wompi_id, 80), metodo = left(p_metodo, 40)
   where id = v.id;

  if v.plan = 'liquidacion' then
    select * into l from public.liquidaciones where id = v.liquidacion_id for update;
    if v_estado = 'APPROVED' and found then
      v_abono := (v.monto_centavos / 100)::int;
      if l.estado = 'pendiente' then
        v_nuevo := least(l.total_cop, l.pagado_cop + v_abono);
        v_exceso := greatest(0, l.pagado_cop + v_abono - l.total_cop);
        update public.liquidaciones
           set pagado_cop = v_nuevo,
               estado = case when v_nuevo >= total_cop then 'pagada' else estado end,
               pagada_en = case when v_nuevo >= total_cop then now() else pagada_en end,
               pago_ref = left('Wompi ' || coalesce(p_wompi_id, ''), 60),
               reportada_en = coalesce(reportada_en, now()),
               nota = left(case when v_nuevo >= total_cop then 'Pagado en línea con Wompi'
                           else 'Abono en línea de $' || to_char(v_abono, 'FM999G999G999') end, 300)
         where id = l.id;
      else
        -- Ya estaba pagada o anulada: el dinero recibido queda a favor del negocio
        v_nuevo := l.pagado_cop;
        v_exceso := v_abono;
      end if;
      if v_exceso > 0 and v.negocio_id is not null then
        update public.negocios set credito_cop = credito_cop + v_exceso where id = v.negocio_id;
      end if;
      insert into public.notificaciones (usuario_id, icono, texto)
      values (v.negocio_id, 'i-check',
        case when l.estado <> 'pendiente'
               then '<b>Pago recibido.</b> Ese estado de cuenta ya no estaba por pagar: $' || to_char(v_abono, 'FM999G999G999') || ' quedaron como saldo a favor.'
             when v_nuevo >= l.total_cop
               then '<b>Pago recibido.</b> Tu estado de cuenta de ' || to_char(l.periodo, 'MM/YYYY') || ' (' || l.referencia || ') quedó pagado. ¡Gracias!'
             else '<b>Abono recibido.</b> Pagaste $' || to_char(v_abono, 'FM999G999G999') || ' de tu estado de cuenta de '
                  || to_char(l.periodo, 'MM/YYYY') || '. Te faltan $' || to_char(l.total_cop - v_nuevo, 'FM999G999G999') || '.' end);
    elsif v_estado in ('DECLINED', 'VOIDED', 'ERROR') then
      insert into public.notificaciones (usuario_id, icono, texto)
      values (v.negocio_id, 'i-alert', '<b>El pago no pasó.</b> No se hizo ningún cobro. Intenta de nuevo con otro medio desde Perfil y plan.');
    end if;
    return jsonb_build_object('ok', true, 'estado', v_estado, 'liquidacion', v.liquidacion_id);
  end if;

  -- Pagos del plan mensual anterior que aún estuvieran en camino
  if v_estado = 'APPROVED' then
    update public.negocios
       set plan = v.plan,
           plan_vence = greatest(now(), coalesce(case when plan = v.plan then plan_vence end, now())) + interval '30 days',
           plan_pendiente = null, plan_avisado = false
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

-- Admin: conserva los estados de cuenta de negocios ya borrados
drop function if exists public.admin_liquidaciones();
create function public.admin_liquidaciones()
returns table (id bigint, negocio_id uuid, negocio text, nit text, plan text, periodo date, clientes integer, total_cop integer,
               pagado_cop integer, descuento_cop integer, referencia text, estado text, vence date, pago_ref text,
               reportada_en timestamptz, pagada_en timestamptz, en_mora boolean, nota text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  return query
    select l.id, l.negocio_id, coalesce(n.nombre, l.negocio_nombre, 'Negocio borrado'), coalesce(n.nit, l.negocio_nit)::text, n.plan,
           l.periodo, l.clientes, l.total_cop, l.pagado_cop, l.descuento_cop,
           l.referencia, l.estado, l.vence, l.pago_ref, l.reportada_en, l.pagada_en,
           (l.estado = 'pendiente' and l.vence < current_date), l.nota
    from public.liquidaciones l left join public.negocios n on n.id = l.negocio_id
    order by (l.estado = 'pendiente') desc, l.vence asc, l.periodo desc
    limit 1000;
end $$;
revoke all on function public.admin_liquidaciones() from public, anon;
grant execute on function public.admin_liquidaciones() to authenticated;

-- =====================================================================
-- 8. REFERIDOS
-- =====================================================================
create or replace function private.nit_base(p text)
returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9)
$$;

create or replace function public.usar_codigo_referido(p_codigo text)
returns text language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype; v_padrino public.negocios%rowtype;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into n from public.negocios where id = auth.uid() for update;
  if not found then raise exception 'NO_ES_NEGOCIO' using errcode = 'P0001'; end if;
  if n.referido_por is not null then raise exception 'YA_TIENES' using errcode = 'P0001', hint = 'Ya usaste un código de invitación.'; end if;
  select * into v_padrino from public.negocios where codigo_referido = upper(trim(coalesce(p_codigo, '')));
  if not found or v_padrino.id = n.id then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', hint = 'Ese código no existe.';
  end if;
  if length(private.nit_base(n.nit)) < 8 or length(private.nit_base(v_padrino.nit)) < 8 then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', hint = 'Los dos negocios deben tener un NIT válido para usar la invitación.';
  end if;
  if private.nit_base(n.nit) = private.nit_base(v_padrino.nit) then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', hint = 'Ese código es de tu misma empresa.';
  end if;
  if v_padrino.referido_por = n.id then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', hint = 'No se pueden invitar entre los dos.';
  end if;
  if n.creado_en < now() - interval '30 days' or exists (select 1 from public.liquidaciones l where l.negocio_id = n.id and l.estado = 'pagada') then
    raise exception 'FUERA_DE_TIEMPO' using errcode = 'P0001', hint = 'El código se usa en el primer mes de la cuenta.';
  end if;
  update public.negocios set referido_por = v_padrino.id where id = n.id;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (v_padrino.id, 'i-users', '<b>' || private.texto_plano(n.nombre) || '</b> se unió con tu código. Cuando haya pagado $50.000 y los dos estén verificados, cada uno gana $10.000.');
  return v_padrino.nombre;
end $$;

-- Premio: ambos verificados, NIT distinto y al menos $50.000 pagados de verdad
create or replace function private.evaluar_referido(p_negocio uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare n public.negocios%rowtype; v_padrino public.negocios%rowtype; v_pagado bigint;
begin
  select * into n from public.negocios where id = p_negocio for update;
  if not found or n.referido_por is null or n.referido_premiado or not n.verificado then return; end if;
  select * into v_padrino from public.negocios where id = n.referido_por for update;
  if not found or not v_padrino.verificado or v_padrino.referido_por = n.id then return; end if;
  if length(private.nit_base(n.nit)) < 8 or length(private.nit_base(v_padrino.nit)) < 8
     or private.nit_base(n.nit) = private.nit_base(v_padrino.nit) then return; end if;
  select coalesce(sum(l.pagado_cop), 0) into v_pagado from public.liquidaciones l where l.negocio_id = n.id and l.estado = 'pagada';
  if v_pagado < 50000 then return; end if;
  update public.negocios set referido_premiado = true, credito_cop = credito_cop + 10000 where id = n.id;
  update public.negocios set credito_cop = credito_cop + 10000 where id = v_padrino.id;
  insert into public.notificaciones (usuario_id, icono, texto) values
    (n.id, 'i-gift', '<b>Ganaste $10.000</b> de saldo a favor por unirte con invitación. Se descuentan de tu próximo estado de cuenta.'),
    (v_padrino.id, 'i-gift', '<b>Ganaste $10.000</b> de saldo a favor: ' || private.texto_plano(n.nombre) || ' cumplió las condiciones de tu invitación.');
end $$;

create or replace function private.premiar_referido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'pagada' and old.estado <> 'pagada' and new.negocio_id is not null then
    perform private.evaluar_referido(new.negocio_id);
  end if;
  return new;
end $$;

-- Si la verificación llega después del pago, el premio se revisa ahí
select private.parchear('public.admin_verificar_negocio(uuid, boolean, text)'::regprocedure,
  'update public.parches set verificado = p_verificado where creador_id = p_negocio;',
  'update public.parches set verificado = p_verificado where creador_id = p_negocio;
  if p_verificado then
    perform private.evaluar_referido(p_negocio);
    perform private.evaluar_referido(x.id) from public.negocios x where x.referido_por = p_negocio;
  end if;');

-- =====================================================================
-- 9. LLEGADAS FALSAS
-- =====================================================================
alter table public.mesa_reservas add column if not exists cliente_llego_en timestamptz;

-- El GPS del cliente avisa al local; quien confirma (y genera el cobro) es el local
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
  if r.estado <> 'confirmada' then
    raise exception 'NO_CONFIRMADA' using errcode = 'P0001', hint = 'El local todavía no ha confirmado tu mesa. Muestra tu código en la entrada.';
  end if;
  if now() < r.llegada - interval '60 minutes' or now() > r.llegada + interval '4 hours' then
    raise exception 'FUERA_DE_HORA' using errcode = 'P0001', hint = 'Puedes marcar tu llegada desde una hora antes de la reserva.';
  end if;
  select * into n from public.negocios where id = r.negocio_id;
  if n.lat is null or n.lng is null then
    raise exception 'SIN_UBICACION_LOCAL' using errcode = 'P0001', hint = 'El local no tiene ubicación en el mapa. Pide que te escaneen el código en la entrada.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or coalesce(p_precision, 9999) > 200 then
    raise exception 'GPS_IMPRECISO' using errcode = 'P0001', hint = 'La señal del GPS está débil. Sal a un lugar abierto o muestra tu código en la entrada.';
  end if;
  v_dist := private.distancia_m(n.lat, n.lng, p_lat, p_lng);
  if v_dist > 200 then
    raise exception 'LEJOS' using errcode = 'P0001', hint = format('Estás a %s m del local. Acércate a menos de 200 m.', round(v_dist)::int);
  end if;
  if r.cliente_llego_en is null then
    update public.mesa_reservas set cliente_llego_en = now() where id = r.id;
    insert into public.notificaciones (usuario_id, icono, texto)
    values (r.negocio_id, 'i-door', left('<b>' || private.texto_plano(private.nombre_corto(r.usuario_id)) || '</b> avisó que ya llegó (mesa ' || r.codigo || '). Confírmalo en Modo Mesa.', 300));
  end if;
  return jsonb_build_object('ok', true, 'nuevo', r.cliente_llego_en is null, 'por_confirmar', true);
end $$;

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
  v_dist := private.distancia_m(p.lat, p.lng, p_lat, p_lng);
  if v_dist > 200 then
    raise exception 'LEJOS' using errcode = 'P0001',
      hint = format('Estás a %s m del punto. Acércate a menos de 200 m.', round(v_dist)::int);
  end if;
  return jsonb_build_object('ok', true, 'distancia', round(v_dist)::int, 'nuevo', private.marcar_llegada(p_parche, v_uid, 'gps'),
                            'por_confirmar', coalesce(p.aliado, false));
end $$;

-- Si el local o el QR confirman a quien llegó por GPS, la llegada ya es facturable
create or replace function private.marcar_llegada(p_parche uuid, p_usuario uuid, p_metodo text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ya boolean; v_metodo text;
begin
  select checkin, checkin_metodo into v_ya, v_metodo from public.parche_miembros where parche_id = p_parche and usuario_id = p_usuario;
  if v_ya then
    if v_metodo = 'gps' and p_metodo in ('qr', 'organizador') then
      update public.parche_miembros set checkin_metodo = p_metodo where parche_id = p_parche and usuario_id = p_usuario;
      return true;
    end if;
    return false;
  end if;
  update public.parche_miembros
     set checkin = true, checkin_metodo = p_metodo, checkin_en = now()
   where parche_id = p_parche and usuario_id = p_usuario;
  insert into public.mensajes (parche_id, autor_id, tipo, texto)
  values (p_parche, null, 'sys', private.nombre_corto(p_usuario) || ' llegó al punto'
    || case p_metodo when 'qr' then ' (QR)' when 'gps' then ' (GPS)' else ' (lo marcó el organizador)' end);
  return true;
end $$;

-- QR fijo del local: exige ubicación, reserva confirmada y frena claves adivinadas
create or replace function public.llegue_por_qr_local(p_negocio uuid, p_clave text,
  p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  n public.negocios%rowtype;
  r public.mesa_reservas%rowtype;
  p public.parches%rowtype;
  v_dist double precision;
  v_clave text;
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  v_clave := 'qr_local:' || v_uid::text;
  if private.demasiados_intentos(v_clave, 8, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'codigo', 'DEMASIADOS', 'hint', 'Hiciste muchos intentos. Espera unos minutos o muestra tu código en la entrada.');
  end if;
  select * into n from public.negocios where id = p_negocio;
  if not found or not exists (select 1 from public.negocio_qr q where q.negocio_id = p_negocio and q.secreto = trim(coalesce(p_clave, ''))) then
    perform private.anotar_intento(v_clave);
    return jsonb_build_object('ok', false, 'codigo', 'QR_INVALIDO', 'hint', 'Ese QR ya no es válido. Pídele al local el código nuevo.');
  end if;
  if v_uid = p_negocio then raise exception 'ERES_EL_LOCAL' using errcode = 'P0001', hint = 'Este QR lo escanean tus clientes.'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'SIN_UBICACION' using errcode = 'P0001', hint = 'Activa la ubicación para validar tu llegada, o muestra tu código en la entrada.';
  end if;
  if n.lat is null or n.lng is null then
    raise exception 'SIN_UBICACION_LOCAL' using errcode = 'P0001', hint = 'El local no tiene ubicación en el mapa. Muestra tu código en la entrada.';
  end if;
  v_dist := private.distancia_m(n.lat, n.lng, p_lat, p_lng);
  if v_dist > 500 then
    raise exception 'LEJOS' using errcode = 'P0001', hint = format('Estás a %s m del local. El QR se escanea en la entrada.', round(v_dist)::int);
  end if;

  -- 1) Una reserva de mesa CONFIRMADA de hoy
  select * into r from public.mesa_reservas
   where usuario_id = v_uid and negocio_id = p_negocio and estado in ('confirmada', 'llego')
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
    hint = 'No tienes una reserva confirmada ni un parche en este local para esta hora.';
end $$;

-- Locales en mora no reciben mesas nuevas (private.negocio_en_mora se crea en la sección 12)

-- =====================================================================
-- 11. ROLES, NOTIFICACIONES Y PUSH
-- =====================================================================
revoke insert on public.notificaciones from authenticated, anon;
revoke insert (icono, parche_id, texto) on public.notificaciones from authenticated;
drop policy if exists "notificaciones: crear para mí" on public.notificaciones;

-- Toda notificación pasa por aquí: solo sobrevive <b>, el resto se escapa, y máximo 300
create or replace function private.sanear_notificacion()
returns trigger language plpgsql set search_path = '' as $$
declare v text := translate(coalesce(new.texto, ''), chr(1) || chr(2) || chr(3) || chr(4), '');
begin
  v := replace(replace(v, '<b>', chr(1)), '</b>', chr(2));
  v := regexp_replace(v, '<!--(dm:[0-9a-f-]{36})-->', chr(3) || '\1' || chr(4), 'g');
  v := replace(replace(v, '<', '&lt;'), '>', '&gt;');
  v := replace(replace(replace(replace(v, chr(1), '<b>'), chr(2), '</b>'), chr(3), '<!--'), chr(4), '-->');
  new.texto := left(v, 300);
  return new;
end $$;
drop trigger if exists a_sanear_notificacion on public.notificaciones;
create trigger a_sanear_notificacion before insert on public.notificaciones
  for each row execute function private.sanear_notificacion();

create or replace function private.push_valido(p text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|([a-z0-9-]+\.)*push\.apple\.com)/'
$$;

-- Registra este celular a la cuenta actual (en un celular compartido, cambia de dueño)
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not private.push_valido(p_endpoint) or char_length(p_endpoint) > 1000 then
    raise exception 'PUSH_INVALIDO' using errcode = 'P0001', hint = 'Este navegador no es compatible con los avisos.';
  end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception 'PUSH_INVALIDO' using errcode = 'P0001', hint = 'No pudimos activar los avisos en este navegador.';
  end if;
  insert into public.push_suscripciones (usuario_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth;
  -- Máximo 5 dispositivos por cuenta: salen los más viejos
  delete from public.push_suscripciones
   where usuario_id = v_uid
     and id not in (select s.id from public.push_suscripciones s where s.usuario_id = v_uid order by s.creado_en desc, s.id desc limit 5);
end $$;
revoke all on function public.registrar_push(text, text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text) to authenticated;

-- =====================================================================
-- 12. PRIVACIDAD Y STORAGE
-- =====================================================================
create or replace function public.son_amigos(p_x uuid, p_y uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) in (p_x, p_y)
     and exists (select 1 from public.amistades where a = least(p_x, p_y) and b = greatest(p_x, p_y) and estado = 'aceptada')
$$;

-- La mora deja de ser consultable por RPC. La política la usa por un esquema que la API no expone.
create or replace function private.negocio_en_mora(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.liquidaciones l
    where l.negocio_id = p_negocio and l.estado = 'pendiente'
      and l.vence + case when l.pagado_cop * 2 >= l.total_cop then 15 else 0 end < current_date)
$$;
create or replace function seguridad.negocio_en_mora(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.negocio_en_mora(p_negocio)
$$;
revoke all on function seguridad.negocio_en_mora(uuid) from public, anon;
grant execute on function seguridad.negocio_en_mora(uuid) to authenticated;

drop policy if exists "cobro: ocultar parches de negocios en mora" on public.parches;
create policy "cobro: ocultar parches de negocios en mora" on public.parches as restrictive for select to authenticated
  using (creador_id = (select auth.uid()) or not coalesce(aliado, false) or not seguridad.negocio_en_mora(creador_id));
select private.parchear('public.mi_cuenta_cobros()'::regprocedure, 'public.negocio_en_mora(uid)', 'private.negocio_en_mora(uid)');
select private.parchear('public.mi_cuenta_cobros()'::regprocedure, '''credito'', n.credito_cop,',
  '''credito'', n.credito_cop, ''plan_programado'', n.plan_programado, ''plan_programado_en'', n.plan_programado_en, ''plan_pendiente'', n.plan_pendiente,');
select private.parchear('public.aliados_destacados()'::regprocedure, 'public.negocio_en_mora(n.id)', 'private.negocio_en_mora(n.id)');
drop function if exists public.negocio_en_mora(uuid);

-- Sección 9: sin mesas para locales en mora
select private.parchear('public.mesas_disponibles()'::regprocedure, 'where p.activa', 'where p.activa and not private.negocio_en_mora(n.id)');
select private.parchear('public.reservar_mesa(uuid, integer, timestamp with time zone, text)'::regprocedure,
  'if not found or not pr.activa or', 'if not found or private.negocio_en_mora(pr.negocio_id) or not pr.activa or');

-- Ubicación: al apagarse o vencer no se entrega ninguna coordenada
create or replace function public.ubicacion_por_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nombre', private.nombre_corto(u.usuario_id),
    'lat', case when u.activa and u.vence > now() then u.lat end,
    'lng', case when u.activa and u.vence > now() then u.lng end,
    'precision', case when u.activa and u.vence > now() then u.precision_m end,
    'actualizado', u.actualizado, 'activa', u.activa and u.vence > now(),
    'parche', (select jsonb_build_object('titulo', p.titulo, 'lugar', p.lugar, 'inicio', p.inicio) from public.parches p where p.id = u.parche_id),
    'llego', exists (select 1 from public.parche_miembros m where m.parche_id = u.parche_id and m.usuario_id = u.usuario_id and m.checkin_en is not null)
  )
  from public.ubicaciones_vivas u
  where u.token = p_token and char_length(p_token) = 64 and u.creado_en > now() - interval '24 hours'
$$;
-- Solo se puede atar el enlace a un parche del que se hace parte
select private.parchear('public.iniciar_ubicacion_viva(uuid)'::regprocedure,
  '(v_token, auth.uid(), p_parche)', '(v_token, auth.uid(), case when p_parche is not null and public.es_miembro(p_parche, auth.uid()) then p_parche end)');

-- Foto de perfil: oculta de verdad y solo de la carpeta propia
create or replace function private.validar_foto_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_src text := coalesce(new.foto_encuadre ->> 'src', '');
begin
  if not coalesce(new.mostrar_foto_real, false) then
    new.foto_encuadre := '{"src": "", "zoom": 1, "x": 0, "y": 0}'::jsonb;
  elsif v_src <> '' and (tg_op = 'INSERT' or new.foto_encuadre is distinct from old.foto_encuadre)
        and v_src !~ ('^https://quxqqxnowlwiahorifpy\.supabase\.co/storage/v1/object/public/fotos/' || new.id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'IMAGEN' using errcode = 'P0001', hint = 'La foto debe subirse desde ModoParche.';
  end if;
  return new;
end $$;
drop trigger if exists validar_foto_perfil on public.perfiles;
create trigger validar_foto_perfil before insert or update of foto_encuadre, mostrar_foto_real on public.perfiles
  for each row execute function private.validar_foto_perfil();
update public.perfiles set foto_encuadre = '{"src": "", "zoom": 1, "x": 0, "y": 0}'::jsonb
 where not mostrar_foto_real and coalesce(foto_encuadre ->> 'src', '') <> '';

create or replace function private.validar_logo_negocio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.logo, '') <> '' and new.logo is distinct from old.logo
     and new.logo !~ ('^https://quxqqxnowlwiahorifpy\.supabase\.co/storage/v1/object/public/fotos/' || new.id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'IMAGEN' using errcode = 'P0001', hint = 'El logo debe subirse desde ModoParche.';
  end if;
  return new;
end $$;
drop trigger if exists validar_logo_negocio on public.negocios;
create trigger validar_logo_negocio before update of logo on public.negocios
  for each row execute function private.validar_logo_negocio();
select private.parchear('private.validar_imagen_parche()'::regprocedure,
  '''^https://[a-z0-9]+\.supabase\.co/storage/', '''^https://quxqqxnowlwiahorifpy\.supabase\.co/storage/');

-- Álbum privado: los archivos nuevos solo los ven los del parche, con enlace temporal
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album', 'album', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.ruta_album_parche(p_ruta text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
              then split_part(p_ruta, '/', 1)::uuid end
$$;
revoke all on function public.ruta_album_parche(text) from public, anon;
grant execute on function public.ruta_album_parche(text) to authenticated;

drop policy if exists "album: ver archivos" on storage.objects;
create policy "album: ver archivos" on storage.objects for select to authenticated
  using (bucket_id = 'album' and public.es_miembro(public.ruta_album_parche(name), (select auth.uid())));
drop policy if exists "album: subir archivos" on storage.objects;
create policy "album: subir archivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'album' and (storage.foldername(name))[2] = (select auth.uid())::text
              and public.es_miembro(public.ruta_album_parche(name), (select auth.uid())));
drop policy if exists "album: borrar los míos" on storage.objects;
create policy "album: borrar los míos" on storage.objects for delete to authenticated
  using (bucket_id = 'album' and (storage.foldername(name))[2] = (select auth.uid())::text);

create or replace function seguridad.fotos_mias_en_parche(p_parche uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.fotos_parche f where f.parche_id = p_parche and f.usuario_id = (select auth.uid())
$$;
revoke all on function seguridad.fotos_mias_en_parche(uuid) from public, anon;
grant execute on function seguridad.fotos_mias_en_parche(uuid) to authenticated;

alter table public.fotos_parche add column if not exists ruta text;
alter table public.fotos_parche drop constraint if exists fotos_parche_ruta_check;
alter table public.fotos_parche add constraint fotos_parche_ruta_check check (ruta is null or char_length(ruta) <= 300);
grant select, delete on public.fotos_parche to authenticated;
grant insert (parche_id, url, ruta) on public.fotos_parche to authenticated;
drop policy if exists "album: subir" on public.fotos_parche;
create policy "album: subir" on public.fotos_parche for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and public.es_miembro(parche_id, (select auth.uid()))
    and url = 'privada'
    and ruta ~ ('^' || parche_id::text || '/' || (select auth.uid())::text || '/album-[A-Za-z0-9._-]+$')
    and seguridad.fotos_mias_en_parche(parche_id) < 30
  );

-- Limpieza diaria
create or replace function private.limpieza_diaria()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ubicaciones_vivas where creado_en < now() - interval '24 hours';
  delete from private.intentos where creado_en < now() - interval '7 days';
  delete from private.parches_creados where mes < (date_trunc('month', now()) - interval '3 months')::date;
end $$;
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'modo-parche-limpieza-diaria';
  perform cron.schedule('modo-parche-limpieza-diaria', '30 8 * * *', 'select private.limpieza_diaria()');
exception when others then
  raise notice 'pg_cron no disponible (%). La limpieza diaria no correrá sola.', sqlerrm;
end $$;

-- =====================================================================
-- 13. FILTRO DE TEXTO Y errores_cliente
-- =====================================================================
create or replace function private.filtrar_texto(p_texto text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_url text;
  v_host text;
begin
  -- Enlaces: solo dominios conocidos. Acorta-enlaces, IPs y dominios raros no pasan.
  for v_url in
    select m[1] from regexp_matches(coalesce(p_texto, ''), '((?:https?://|www\.)[^\s<>"]+|\m[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co|net|org|xyz|ly|io|me|link|click|top|info|ru|cn|tk|app|site|online|live|gg|to|gl)(?:[/\\][^\s<>"]*)?)', 'gi') m
  loop
    v_host := regexp_replace(v_url, '^[a-z]+://', '', 'i');
    v_host := regexp_replace(v_host, '[/?#].*$', '');    -- solo la autoridad
    -- Enlaces disfrazados: google.com:x@malo.com o google.com\@malo.com
    if position('@' in v_host) > 0 or position('\' in v_host) > 0 then
      raise exception 'ENLACE_BLOQUEADO' using errcode = 'P0001',
        hint = 'Por seguridad solo se pueden mandar enlaces de Google Maps, Instagram, TikTok, YouTube, Spotify, WhatsApp y boleterías conocidas.';
    end if;
    v_host := regexp_replace(v_host, ':[0-9]*$', '');    -- sin puerto
    v_host := lower(regexp_replace(rtrim(v_host, '.,;:!)'), '^www\.', '', 'i'));
    if v_host !~ '^((maps\.)?google\.com|maps\.app\.goo\.gl|(.*\.)?instagram\.com|(.*\.)?tiktok\.com|(.*\.)?youtube\.com|youtu\.be|(open\.)?spotify\.com|(.*\.)?latiquetera\.com|(.*\.)?tuboleta\.com|(.*\.)?eticket\.co|wa\.me|(.*\.)?modoparche\.co|modoparche\.vercel\.app|(.*\.)?gov\.co)$'
       or v_host ~ '^\d{1,3}(\.\d{1,3}){3}$' then
      raise exception 'ENLACE_BLOQUEADO' using errcode = 'P0001',
        hint = 'Por seguridad solo se pueden mandar enlaces de Google Maps, Instagram, TikTok, YouTube, Spotify, WhatsApp y boleterías conocidas.';
    end if;
  end loop;
  -- Groserías fuertes: se tapan (el mensaje igual sale)
  return regexp_replace(p_texto,
    '\m(hijuep[uú]ta|hijuep[uú]tas|hpta|hptas|gonorrea|gonorreas|malparid[oa]s?|careverga|carechimba|mamag[uü]evo|mamah[uü]evo|pirob[oa]s?|put[oa]s?|perras?|zorras?|maric[oó]n|maricones|verga|vergas|hijo de puta)\M',
    '****', 'gi');
end $$;

create or replace function private.filtrar_mensaje()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.autor_id is null then return new; end if; -- mensajes del sistema
  new.texto := private.filtrar_texto(new.texto);
  return new;
end $$;

create or replace function public.crear_encuesta(p_parche uuid, p_pregunta text, p_opciones text[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_ops text[]; v_preg text;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not public.es_miembro(p_parche, auth.uid()) then raise exception 'NO_ESTAS' using errcode = 'P0001', hint = 'Únete al parche para crear encuestas.'; end if;
  v_preg := left(private.filtrar_texto(trim(coalesce(p_pregunta, ''))), 120);
  select array_agg(left(private.filtrar_texto(trim(o)), 40)) into v_ops from unnest(p_opciones) o where trim(o) <> '';
  if coalesce(array_length(v_ops, 1), 0) not between 2 and 5 then raise exception 'OPCIONES' using errcode = 'P0001', hint = 'Pon entre 2 y 5 opciones.'; end if;
  if (select count(*) from public.encuestas where parche_id = p_parche and autor_id = auth.uid() and creado_en > now() - interval '1 hour') >= 3 then
    raise exception 'DEMASIADAS' using errcode = 'P0001', hint = 'Máximo 3 encuestas por hora.';
  end if;
  insert into public.encuestas (parche_id, autor_id, pregunta, opciones) values (p_parche, auth.uid(), v_preg, v_ops) returning id into v_id;
  insert into public.mensajes (parche_id, autor_id, tipo, texto, encuesta_id) values (p_parche, auth.uid(), 'encuesta', v_preg, v_id);
  return v_id;
end $$;

select private.parchear('public.calificar_local(bigint, integer, text)'::regprocedure,
  'left(trim(coalesce(p_texto, '''')), 280)', 'left(private.filtrar_texto(trim(coalesce(p_texto, ''''))), 280)');

-- errores_cliente: cuota por origen (huella sin guardar la IP) además del tope global
alter table public.errores_cliente add column if not exists huella text;
create index if not exists errores_huella_idx on public.errores_cliente (huella, creado_en desc);
create or replace function private.frenar_errores()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_h json; v_ip text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_h := null;
  end;
  v_ip := split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1);
  new.huella := left(encode(sha256(convert_to(current_date::text || ':' || v_ip || ':' || coalesce(new.navegador, ''), 'UTF8')), 'hex'), 24);
  if (select count(*) from public.errores_cliente e where e.huella = new.huella and e.creado_en > now() - interval '10 minutes') >= 15 then
    return null;
  end if;
  if (select count(*) from public.errores_cliente where creado_en > now() - interval '10 minutes') >= 300 then
    return null; -- se descarta en silencio
  end if;
  if random() < 0.02 then delete from public.errores_cliente where creado_en < now() - interval '30 days'; end if;
  return new;
end $$;

-- =====================================================================
-- 14. HABEAS DATA: mis_datos con todo lo del titular
-- =====================================================================
select private.parchear('public.mis_datos()'::regprocedure, '''consentimientos'', coalesce(',
  '''amistades'', coalesce((select jsonb_agg(jsonb_build_object(''con'', private.nombre_corto(case when a.a = v_uid then a.b else a.a end), ''estado'', a.estado, ''desde'', a.creado_en)) from public.amistades a where v_uid in (a.a, a.b)), ''[]''::jsonb),
    ''mensajes_directos'', coalesce((select jsonb_agg(jsonb_build_object(''enviado'', d.autor_id = v_uid, ''con'', private.nombre_corto(case when d.autor_id = v_uid then d.para_id else d.autor_id end), ''texto'', d.texto, ''fecha'', d.creado_en) order by d.creado_en) from public.mensajes_directos d where v_uid in (d.autor_id, d.para_id)), ''[]''::jsonb),
    ''viajes'', coalesce((select jsonb_agg(jsonb_build_object(''parche_id'', v.parche_id, ''medio'', v.medio, ''puestos'', v.puestos, ''desde'', v.desde, ''hora'', v.hora, ''fecha'', v.creado_en)) from public.viajes v where v.usuario_id = v_uid), ''[]''::jsonb),
    ''viajes_como_pasajero'', coalesce((select jsonb_agg(jsonb_build_object(''viaje_id'', vp.viaje_id, ''fecha'', vp.creado_en)) from public.viaje_pasajeros vp where vp.usuario_id = v_uid), ''[]''::jsonb),
    ''encuestas'', coalesce((select jsonb_agg(jsonb_build_object(''pregunta'', e.pregunta, ''opciones'', e.opciones, ''fecha'', e.creado_en)) from public.encuestas e where e.autor_id = v_uid), ''[]''::jsonb),
    ''votos'', coalesce((select jsonb_agg(jsonb_build_object(''encuesta_id'', ev.encuesta_id, ''opcion'', ev.opcion, ''fecha'', ev.creado_en)) from public.encuesta_votos ev where ev.usuario_id = v_uid), ''[]''::jsonb),
    ''fotos_album'', coalesce((select jsonb_agg(jsonb_build_object(''parche_id'', f.parche_id, ''archivo'', coalesce(f.ruta, f.url), ''fecha'', f.creado_en)) from public.fotos_parche f where f.usuario_id = v_uid), ''[]''::jsonb),
    ''bloqueos'', coalesce((select jsonb_agg(jsonb_build_object(''persona'', private.nombre_corto(b.bloqueado), ''fecha'', b.creado_en)) from public.bloqueos b where b.bloqueador = v_uid), ''[]''::jsonb),
    ''ubicaciones_compartidas'', coalesce((select jsonb_agg(jsonb_build_object(''parche_id'', u.parche_id, ''lat'', u.lat, ''lng'', u.lng, ''activa'', u.activa, ''desde'', u.creado_en, ''vence'', u.vence)) from public.ubicaciones_vivas u where u.usuario_id = v_uid), ''[]''::jsonb),
    ''resenas_de_locales'', coalesce((select jsonb_agg(jsonb_build_object(''local'', private.nombre_corto(r.negocio_id), ''estrellas'', r.estrellas, ''texto'', r.texto, ''fecha'', r.creado_en)) from public.resenas_negocio r where r.autor_id = v_uid), ''[]''::jsonb),
    ''cobros_del_negocio'', coalesce((select jsonb_agg(jsonb_build_object(''tipo'', c.tipo, ''personas'', c.personas, ''monto'', c.monto_cop, ''codigo'', c.codigo, ''periodo'', c.periodo, ''anulado'', c.anulado)) from public.cobros c where c.negocio_id = v_uid), ''[]''::jsonb),
    ''estados_de_cuenta'', coalesce((select jsonb_agg(jsonb_build_object(''referencia'', l.referencia, ''periodo'', l.periodo, ''total'', l.total_cop, ''pagado'', l.pagado_cop, ''estado'', l.estado)) from public.liquidaciones l where l.negocio_id = v_uid), ''[]''::jsonb),
    ''reclamos'', coalesce((select jsonb_agg(jsonb_build_object(''motivo'', rc.motivo, ''estado'', rc.estado, ''respuesta'', rc.respuesta, ''fecha'', rc.creado_en)) from public.reclamos_cobro rc where rc.negocio_id = v_uid), ''[]''::jsonb),
    ''dispositivos_con_avisos'', coalesce((select jsonb_agg(jsonb_build_object(''servicio'', split_part(split_part(s.endpoint, ''//'', 2), ''/'', 1), ''desde'', s.creado_en)) from public.push_suscripciones s where s.usuario_id = v_uid), ''[]''::jsonb),
    ''consentimientos'', coalesce(');

-- =====================================================================
-- CIERRE
-- =====================================================================
select private.parchear('public.admin_cuentas()'::regprocedure,
  '''cedula'', case when v_total then pp.cedula end,',
  '''cedula'', case when v_total then pp.cedula end, ''cedula_estado'', case when v_total then pp.cedula_estado end,');

drop function if exists private.parchear(regprocedure, text, text);
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
