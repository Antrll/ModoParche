-- =====================================================================
-- ModoParche · Fase 3A: seguridad restante, notificaciones y PWA
--
-- Cómo aplicarlo: Supabase > SQL Editor > pestaña NUEVA > pegar SOLO este
-- archivo > Run. Va después de 20261124120000_estabilidad_rendimiento_fase2.
-- Se puede correr más de una vez y no borra datos.
--
-- Qué trae:
--   1. Registro de negocios con datos mínimos y freno de parches diarios
--      para negocios sin verificar.
--   2. emitir_cupon sin spam de notificaciones.
--   3. Depuración automática de archivos (función depurar-archivos).
--   4. Contacto solo por /api/contacto (Turnstile verificado en el
--      servidor) y aviso a los admins.
--   5. parche_publico sin parches terminados ni de negocios en mora.
-- =====================================================================

-- =====================================================================
-- 1. REGISTRO DE NEGOCIOS Y FRENO DE PARCHES
-- =====================================================================
create or replace function private.validar_registro()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_tel text;
  v_nit text;
begin
  -- Cuentas del equipo creadas desde el SQL Editor (private.crear_admin)
  if session_user <> 'supabase_auth_admin' then return new; end if;
  -- Google y otros proveedores completan sus datos en completar_registro()
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'email' then return new; end if;

  if m ->> 'tipo' = 'empresa' then
    -- Un negocio necesita nombre, responsable y una forma real de contacto
    v_tel := regexp_replace(coalesce(m ->> 'telefono', ''), '[^0-9]', '', 'g');
    v_nit := trim(coalesce(m ->> 'nit', ''));
    if char_length(trim(coalesce(m ->> 'negocio', ''))) not between 2 and 80 then
      raise exception 'NEGOCIO_INVALIDO' using errcode = 'P0001', hint = 'Escribe el nombre de tu negocio (mínimo 2 letras).';
    end if;
    if char_length(trim(coalesce(m ->> 'responsable', ''))) not between 2 and 80 then
      raise exception 'RESPONSABLE_INVALIDO' using errcode = 'P0001', hint = 'Escribe el nombre de quien administra la cuenta.';
    end if;
    if v_tel <> '' and v_tel !~ '^(3[0-9]{9}|60[0-9]{8})$' then
      raise exception 'TELEFONO_INVALIDO' using errcode = 'P0001', hint = 'El teléfono debe ser un celular (10 números que empiezan por 3) o un fijo que empieza por 60.';
    end if;
    if v_nit <> '' and v_nit !~ '^[0-9]{6,10}(-[0-9])?$' then
      raise exception 'NIT_INVALIDO' using errcode = 'P0001', hint = 'El NIT lleva solo números y, si quieres, el guion y el dígito de verificación (ej. 900123456-7).';
    end if;
    if v_tel = '' and v_nit = '' then
      raise exception 'CONTACTO_NEGOCIO' using errcode = 'P0001', hint = 'Escribe el teléfono o el NIT del negocio.';
    end if;
    return new;
  end if;

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
revoke all on function private.validar_registro() from public, anon, authenticated;

-- Freno anti-spam. Igual que antes, con un cambio: solo los negocios
-- VERIFICADOS por el equipo abren parches sin tope diario. Los demás
-- (personas y negocios sin verificar) tienen máximo 6 al día.
create or replace function private.frenar_spam()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n_corto int;
  n_largo int;
begin
  if uid is null then return new; end if;

  if tg_table_name = 'mensajes' then
    -- Los mensajes del sistema no tienen autor y no cuentan
    if new.autor_id is null then return new; end if;
    select count(*) filter (where creado_en > now() - interval '1 minute'),
           count(*) filter (where creado_en > now() - interval '1 day')
      into n_corto, n_largo
      from public.mensajes where autor_id = uid and creado_en > now() - interval '1 day';
    if n_corto >= 12 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Vas muy rápido. Espera un momento antes de mandar otro mensaje.';
    end if;
    if n_largo >= 300 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Llegaste al límite de mensajes de hoy. Mañana sigues.';
    end if;

  elsif tg_table_name = 'parches' then
    -- Solo un negocio verificado por el equipo abre parches sin tope diario
    if exists (select 1 from public.negocios n where n.id = uid and n.verificado) then return new; end if;
    select count(*) into n_largo
      from public.parches where creador_id = uid and creado_en > now() - interval '1 day';
    if n_largo >= 6 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Ya abriste 6 parches hoy. Mañana puedes abrir más.';
    end if;

  elsif tg_table_name = 'fotos_parche' then
    select count(*) into n_corto
      from public.fotos_parche where usuario_id = uid and creado_en > now() - interval '1 hour';
    if n_corto >= 30 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Subiste muchas fotos seguidas. Espera un rato.';
    end if;

  elsif tg_table_name = 'ubicaciones_vivas' then
    select count(*) into n_corto
      from public.ubicaciones_vivas where usuario_id = uid and creado_en > now() - interval '1 hour';
    if n_corto >= 10 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Creaste muchos enlaces de ubicación. Usa el que ya tienes o espera un rato.';
    end if;
  end if;

  return new;
end $$;
revoke all on function private.frenar_spam() from public, anon, authenticated;

-- =====================================================================
-- 2. CUPONES SIN SPAM DE NOTIFICACIONES
-- - Un cupón para una persona exige el parche donde está (no se le puede
--   mandar un cupón a cualquiera solo con su id).
-- - Ninguno de los dos puede haber bloqueado al otro.
-- - Máximo 120 cupones con aviso por negocio cada hora.
-- - La búsqueda de duplicados compara bien los parches nulos.
-- =====================================================================
create or replace function public.emitir_cupon(
  p_parche uuid, p_usuario uuid, p_cupon text, p_persona text, p_nombre text, p_beneficio text, p_prefijo text, p_vence timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.cupones_emitidos%rowtype; k jsonb; v_lim int; v_n int; i int := 0;
  v_clave text;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not exists (select 1 from public.negocios n where n.id = uid) then raise exception 'NO_ES_NEGOCIO' using errcode = '42501'; end if;
  if p_parche is not null and not exists (select 1 from public.parches p where p.id = p_parche and p.creador_id = uid) then
    raise exception 'NO_ES_TUYO' using errcode = '42501';
  end if;
  if p_usuario is not null then
    if p_parche is null then
      raise exception 'FALTA_PARCHE' using errcode = 'P0001', hint = 'Un cupón para una persona se entrega desde uno de tus parches.';
    end if;
    if not public.es_miembro(p_parche, p_usuario) then
      raise exception 'NO_ESTA_EN_PARCHE' using errcode = 'P0001';
    end if;
    if public.hay_bloqueo(uid, p_usuario) or public.hay_bloqueo(p_usuario, uid) then
      raise exception 'BLOQUEADO' using errcode = 'P0001', hint = 'No se puede entregar un cupón a esta persona.';
    end if;
  end if;
  if char_length(coalesce(p_cupon, '')) not between 1 and 60 then raise exception 'CUPON_INVALIDO' using errcode = 'P0001'; end if;
  if p_vence is null or p_vence <= now() or p_vence > now() + interval '366 days' then raise exception 'VENCE_INVALIDO' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext('cupon:' || uid::text || ':' || p_cupon));
  -- Quien ya lo tiene lo conserva aunque el cupón se haya agotado o pausado después
  select * into r from public.cupones_emitidos e
   where e.negocio_id = uid and e.cupon_id = p_cupon and e.parche_id is not distinct from p_parche
     and coalesce(e.usuario_id::text, e.persona) = coalesce(p_usuario::text, left(trim(coalesce(p_persona, '')), 80));
  if found then return jsonb_build_object('ok', true, 'nuevo', false, 'cupon', private.cupon_json(r)); end if;

  -- Freno: máximo 120 cupones con aviso por negocio cada hora
  v_clave := 'cupon_aviso:' || uid::text;
  if p_usuario is not null and private.demasiados_intentos(v_clave, 120, interval '1 hour') then
    return jsonb_build_object('ok', false, 'codigo', 'DEMASIADOS', 'hint', 'Entregaste muchos cupones en la última hora. Espera un rato.');
  end if;

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
    perform private.anotar_intento(v_clave);
    insert into public.notificaciones (usuario_id, icono, texto, parche_id)
    values (p_usuario, 'i-ticket', 'Ganaste un cupón: <b>' || r.cup_beneficio || '</b>. Míralo en tu perfil.', p_parche);
  end if;
  return jsonb_build_object('ok', true, 'nuevo', true, 'cupon', private.cupon_json(r));
end $$;
revoke all on function public.emitir_cupon(uuid, uuid, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.emitir_cupon(uuid, uuid, text, text, text, text, text, timestamptz) to authenticated;

-- =====================================================================
-- 3. DEPURACIÓN AUTOMÁTICA DE ARCHIVOS
-- La Edge Function depurar-archivos (con service_role) pide la cola,
-- borra los archivos por la API de Storage y avisa cuáles ya no están.
-- =====================================================================
create or replace function public.sistema_archivos_por_borrar(p_limite integer default 500)
returns table (id bigint, bucket text, ruta text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.bucket, a.ruta from public.archivos_por_borrar a
   order by a.id limit least(greatest(coalesce(p_limite, 500), 1), 1000)
$$;
revoke all on function public.sistema_archivos_por_borrar(integer) from public, anon, authenticated;
grant execute on function public.sistema_archivos_por_borrar(integer) to service_role;

create or replace function public.sistema_archivos_borrados(p_ids bigint[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  -- Solo sale de la cola lo que de verdad ya no está en Storage
  delete from public.archivos_por_borrar a
   where a.id = any (coalesce(p_ids, '{}'))
     and not exists (select 1 from storage.objects o where o.bucket_id = a.bucket and o.name = a.ruta);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.sistema_archivos_borrados(bigint[]) from public, anon, authenticated;
grant execute on function public.sistema_archivos_borrados(bigint[]) to service_role;

-- =====================================================================
-- 4. CONTACTO: SOLO DESPUÉS DE VERIFICAR TURNSTILE Y AVISO AL EQUIPO
-- El navegador ya no llama la base directo: va a /api/contacto (Vercel),
-- que verifica el captcha con la llave secreta y llama con service_role,
-- pasando la IP real de quien escribe para el freno por IP.
-- =====================================================================
create or replace function private.guardar_contacto(p_nombre text, p_correo text, p_motivo text, p_mensaje text, p_sitio text, p_ip text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_clave text;
  v_nombre text := left(private.texto_plano(trim(coalesce(p_nombre, ''))), 80);
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_mensaje text := left(private.texto_plano(trim(coalesce(p_mensaje, ''))), 1500);
  v_motivo text := case when p_motivo in ('contacto', 'empleo', 'negocio', 'prensa', 'otro') then p_motivo else 'contacto' end;
  v_etiqueta text;
begin
  -- Campo oculto: un bot lo llena; se responde igual para no darle pistas
  if coalesce(p_sitio, '') <> '' then return jsonb_build_object('ok', true); end if;
  v_clave := 'contacto:' || encode(sha256(convert_to(coalesce(nullif(trim(p_ip), ''), 'sin-ip'), 'UTF8')), 'hex');
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

  -- Aviso a los admins activos (no suspendidos). Le llega por push al panel.
  v_etiqueta := case v_motivo when 'empleo' then 'empleo' when 'negocio' then 'un negocio' when 'prensa' then 'prensa o alianza' else 'contacto' end;
  insert into public.notificaciones (usuario_id, icono, texto)
  select a.id, 'i-chat', left('<b>Nuevo mensaje de ' || v_etiqueta || '</b> de ' || v_nombre || ': ' || left(v_mensaje, 90)
         || case when char_length(v_mensaje) > 90 then '…' else '' end, 300)
    from public.admins a join auth.users u on u.id = a.id
   where a.rol = 'admin' and (u.banned_until is null or u.banned_until <= now()) and u.deleted_at is null;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function private.guardar_contacto(text, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.enviar_contacto_verificado(p_nombre text, p_correo text, p_motivo text, p_mensaje text, p_sitio text default '', p_ip text default '')
returns jsonb language sql security definer set search_path = '' as $$
  select private.guardar_contacto(p_nombre, p_correo, p_motivo, p_mensaje, p_sitio, p_ip)
$$;
revoke all on function public.enviar_contacto_verificado(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.enviar_contacto_verificado(text, text, text, text, text, text) to service_role;

-- La función vieja queda solo para el servidor (ya no la llama el navegador)
create or replace function public.enviar_contacto(p_nombre text, p_correo text, p_motivo text, p_mensaje text, p_sitio text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_h json;
begin
  begin v_h := nullif(current_setting('request.headers', true), '')::json; exception when others then v_h := null; end;
  return private.guardar_contacto(p_nombre, p_correo, p_motivo, p_mensaje, p_sitio, split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1));
end $$;
revoke all on function public.enviar_contacto(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.enviar_contacto(text, text, text, text, text) to service_role;

-- =====================================================================
-- 5. VISTA PÚBLICA DE UN PARCHE (/p/<id>)
-- Ya no muestra parches terminados ni de negocios en mora.
-- =====================================================================
create or replace function public.parche_publico(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'titulo', p.titulo, 'categoria', p.categoria,
    'descripcion', left(p.descripcion, 220), 'inicio', p.inicio,
    'lugar', p.lugar, 'barrio', p.barrio, 'imagen', p.imagen,
    'oficial', p.oficial, 'cupos_max', p.cupos_max,
    'van', (select count(*) from public.parche_miembros m where m.parche_id = p.id)
  )
  from public.parches p
  where p.id = p_id and p.inicio > now() - interval '2 days'
    and p.terminado_en is null
    and (not coalesce(p.aliado, false)
         or not exists (select 1 from private.negocios_mora m where m.negocio_id = p.creador_id))
$$;
revoke all on function public.parche_publico(uuid) from public;
grant execute on function public.parche_publico(uuid) to anon, authenticated;

-- =====================================================================
-- 6. FRENO DE INTENTOS PARA LAS EDGE FUNCTIONS (service_role)
-- Devuelve true si todavía puede intentar (y anota el intento) o false
-- si ya pasó el máximo en la ventana. Lo usa wompi-checkout al confirmar.
-- =====================================================================
create or replace function public.sistema_permitir_intento(p_clave text, p_max integer, p_segundos integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_clave text := 'ef:' || left(coalesce(p_clave, ''), 120);
begin
  if private.demasiados_intentos(v_clave, greatest(coalesce(p_max, 1), 1), make_interval(secs => least(greatest(coalesce(p_segundos, 60), 1), 86400))) then
    return false;
  end if;
  perform private.anotar_intento(v_clave);
  return true;
end $$;
revoke all on function public.sistema_permitir_intento(text, integer, integer) from public, anon, authenticated;
grant execute on function public.sistema_permitir_intento(text, integer, integer) to service_role;
