-- =====================================================================
-- ModoParche · Verificación de identidad con cédula (Parcero Verificado)
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Corre después de 20261031120000_legal.sql. Se puede correr más de una
-- vez sin romper nada.
--
-- Qué hace:
--   1. Columnas de verificación. Van en perfiles_privados porque la tabla
--      "usuarios" del prototipo ya no se usa (quedó como legacy_usuarios,
--      cerrada, porque guardaba contraseñas en texto plano). La cédula que
--      la persona digitó al registrarse vive en perfiles_privados.cedula.
--      perfiles.verificado es el sello público que ven los demás.
--   2. Bucket PRIVADO documentos_identidad (public = false, máx. 150 KB por
--      foto, solo WebP o JPEG). Cada persona solo sube, ve y borra lo de su
--      carpeta cedulas/{usuario_id}/. Nadie más, salvo un admin total que
--      revisa casos dudosos.
--   3. verificar_mi_cedula(): confirma que las dos fotos existen en la
--      carpeta de quien llama y que el número leído en el navegador es el
--      mismo de su registro. Si todo cuadra marca cedula_verificada = true.
--   4. Candado en el servidor: una persona sin cédula verificada no puede
--      abrir parches aunque se salte la pantalla. Los negocios no aplican.
--   5. Consentimiento expreso para guardar las fotos (Ley 1581 de 2012:
--      la foto del rostro es un dato sensible).
--   6. admin_revocar_verificacion(): el equipo puede quitar el sello.
-- =====================================================================

-- =====================================================================
-- 1. COLUMNAS
-- =====================================================================
alter table public.perfiles_privados add column if not exists cedula_frontal_path  text default null;
alter table public.perfiles_privados add column if not exists cedula_trasera_path  text default null;
alter table public.perfiles_privados add column if not exists cedula_verificada    boolean not null default false;
alter table public.perfiles_privados add column if not exists cedula_verificada_en timestamptz;
alter table public.perfiles_privados add column if not exists cedula_metodo        text
  check (cedula_metodo is null or cedula_metodo in ('codigo', 'ocr'));

-- Sello público (lo ven los demás en el chat y en la lista de asistentes)
alter table public.perfiles add column if not exists verificado boolean not null default false;

-- Ninguna de estas columnas se puede editar desde la app: los permisos de
-- UPDATE de perfiles y perfiles_privados son por columna y no las incluyen.
-- Solo las cambia verificar_mi_cedula() o un admin.

-- =====================================================================
-- 2. BUCKET PRIVADO Y POLÍTICAS
--    Ruta de cada foto: cedulas/{usuario_id}/frontal-<fecha>.webp
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos_identidad', 'documentos_identidad', false, 153600, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 153600,
      allowed_mime_types = array['image/webp', 'image/jpeg'];

-- Cuántas fotos tiene ya quien llama (para que nadie llene el plan gratis
-- subiendo miles de archivos a su carpeta)
create or replace function public.docs_identidad_subidos()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'documentos_identidad'
    and (storage.foldername(o.name))[1] = 'cedulas'
    and (storage.foldername(o.name))[2] = (select auth.uid())::text
$$;
revoke all on function public.docs_identidad_subidos() from public, anon;
grant execute on function public.docs_identidad_subidos() to authenticated;

drop policy if exists "documentos: subir los propios" on storage.objects;
create policy "documentos: subir los propios" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos_identidad'
    and (storage.foldername(name))[1] = 'cedulas'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select public.docs_identidad_subidos()) < 8
  );

drop policy if exists "documentos: ver los propios" on storage.objects;
create policy "documentos: ver los propios" on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos_identidad'
    and (storage.foldername(name))[1] = 'cedulas'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Derecho de supresión: cada quien puede borrar sus fotos (y la app las
-- borra al eliminar la cuenta)
drop policy if exists "documentos: borrar los propios" on storage.objects;
create policy "documentos: borrar los propios" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos_identidad'
    and (storage.foldername(name))[1] = 'cedulas'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Solo un admin total puede abrir las fotos de otra persona (revisión)
-- (requiere 20261030120000_admin_v2.sql; si falta, se omite)
drop policy if exists "documentos: revisión del equipo" on storage.objects;
do $$
begin
  if to_regprocedure('public.es_admin_total()') is not null then
    create policy "documentos: revisión del equipo" on storage.objects for select to authenticated
      using (bucket_id = 'documentos_identidad' and (select public.es_admin_total()));
  else
    raise notice 'Falta 20261030120000_admin_v2.sql: el equipo no podrá revisar las fotos hasta correrla.';
  end if;
end $$;

-- =====================================================================
-- 3. CONSENTIMIENTO PARA DATOS SENSIBLES
-- =====================================================================
-- Solo si ya existe la tabla (la crea 20261031120000_legal.sql)
do $$
begin
  if to_regclass('public.consentimientos') is not null then
    alter table public.consentimientos drop constraint if exists consentimientos_tipo_check;
    alter table public.consentimientos add constraint consentimientos_tipo_check
      check (tipo in ('terminos', 'datos', 'anuncios', 'identidad'));
  else
    raise notice 'Falta 20261031120000_legal.sql: el consentimiento de identidad no se guardará hasta correrla.';
  end if;
end $$;

-- =====================================================================
-- 4. VERIFICAR MI CÉDULA
--    El navegador comprime las fotos, lee el código del respaldo (o usa
--    OCR) y manda el número que leyó. Aquí se comprueba lo que el servidor
--    sí puede comprobar sin costo: que las fotos existen en la carpeta de
--    quien llama y que el número coincide con el de su registro.
-- =====================================================================
create or replace function public.verificar_mi_cedula(
  p_frontal text,
  p_trasera text,
  p_numero_leido text,
  p_metodo text default 'codigo'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_ced    text;
  v_leido  text := ltrim(regexp_replace(coalesce(p_numero_leido, ''), '\D', '', 'g'), '0');
  v_pref   text;
  v_ya     boolean;
begin
  if v_uid is null then
    raise exception 'SIN_SESION' using errcode = '42501';
  end if;
  if exists (select 1 from public.negocios n where n.id = v_uid) then
    raise exception 'SOLO_PERSONAS' using errcode = 'P0001', hint = 'La verificación con cédula es para cuentas personales.';
  end if;

  select ltrim(pp.cedula, '0'), pp.cedula_verificada into v_ced, v_ya
  from public.perfiles_privados pp where pp.id = v_uid;
  if v_ced is null or v_ced = '' then
    raise exception 'SIN_CEDULA' using errcode = 'P0001', hint = 'Tu cuenta no tiene cédula registrada. Escríbenos para agregarla.';
  end if;
  if v_ya then
    return jsonb_build_object('verificado', true, 'ya_estaba', true);
  end if;
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
     set cedula_frontal_path  = p_frontal,
         cedula_trasera_path  = p_trasera,
         cedula_verificada    = true,
         cedula_verificada_en = now(),
         cedula_metodo        = case when p_metodo = 'ocr' then 'ocr' else 'codigo' end
   where id = v_uid;
  update public.perfiles set verificado = true where id = v_uid;

  if to_regclass('public.consentimientos') is not null then
    execute 'insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen) values ($1, ''identidad'', ''1.0'', true, ''perfil'')'
      using v_uid;
  end if;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (v_uid, 'i-shield', '<b>¡Ya eres Parcero Verificado!</b> Puedes abrir parches y tu insignia se ve en tu perfil.');

  return jsonb_build_object('verificado', true, 'ya_estaba', false);
end $$;
revoke all on function public.verificar_mi_cedula(text, text, text, text) from public, anon;
grant execute on function public.verificar_mi_cedula(text, text, text, text) to authenticated;

-- =====================================================================
-- 5. CANDADO: sin cédula verificada no se abren parches
-- =====================================================================
create or replace function private.exigir_cedula_verificada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Negocios y equipo de ModoParche no pasan por la verificación de cédula
  if exists (select 1 from public.negocios n where n.id = new.creador_id)
     or exists (select 1 from public.admins a where a.id = new.creador_id) then
    return new;
  end if;
  if not coalesce((select pp.cedula_verificada from public.perfiles_privados pp where pp.id = new.creador_id), false) then
    raise exception 'SIN_VERIFICAR' using errcode = 'P0001',
      hint = 'Verifica tu cédula para abrir parches. Toma 1 minuto.';
  end if;
  return new;
end $$;
revoke all on function private.exigir_cedula_verificada() from public, anon, authenticated;

drop trigger if exists parches_exigir_verificacion on public.parches;
create trigger parches_exigir_verificacion before insert on public.parches
  for each row when (new.creador_id is not null)
  execute function private.exigir_cedula_verificada();

-- =====================================================================
-- 6. REVISIÓN DEL EQUIPO
--    La lectura del número pasa en el navegador (costo $0), así que el
--    equipo puede revisar las fotos y quitar el sello si algo no cuadra.
-- =====================================================================
create or replace function public.admin_revocar_verificacion(p_usuario uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text;
begin
  perform private.exigir_admin();
  update public.perfiles_privados
     set cedula_verificada = false, cedula_verificada_en = null
   where id = p_usuario;
  update public.perfiles set verificado = false where id = p_usuario returning nombre into v_nombre;
  if v_nombre is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa cuenta ya no existe.';
  end if;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (p_usuario, 'i-info', '<b>ModoParche:</b> Tu verificación de identidad no fue aprobada. Repite las fotos desde tu perfil o escríbenos.');
  perform private.registrar('quitar_verificacion_cedula', v_nombre, coalesce(p_motivo, ''));
end $$;
revoke all on function public.admin_revocar_verificacion(uuid, text) from public, anon;
grant execute on function public.admin_revocar_verificacion(uuid, text) to authenticated;
