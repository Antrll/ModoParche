-- =====================================================================
-- ModoParche · Cuenta, comunidad y seguridad (noviembre 2026)
-- Corre en: Supabase > SQL Editor, después de 20261111120000_anti_spam.sql.
-- Se puede correr más de una vez.
--
--  1. Verificación en dos pasos obligatoria para el equipo (aal2)
--  2. Bloquear usuarios
--  3. Chat: filtro de groserías y enlaces sospechosos + aviso push
--  4. Recordatorio 1 hora antes del parche (pg_cron cada 5 min)
--  5. (Borrar cuenta y descargar datos ya existían: legal.sql)
--  6. Cédula obligatoria y completar el registro (Google o cuentas viejas)
--  7. Errores de la app en producción (monitoreo propio)
--  8. Ubicación en vivo: avisar si la persona no ha llegado al parche
-- =====================================================================

create schema if not exists private;

-- =====================================================================
-- 1. VERIFICACIÓN EN DOS PASOS PARA EL EQUIPO
--    Si la cuenta ya tiene un factor TOTP verificado, cada acción del
--    panel exige una sesión aal2 (contraseña + código). admin.js obliga a
--    inscribir el factor la primera vez, así nadie queda por fuera.
-- =====================================================================
create or replace function private.exigir_mfa()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_REQUERIDO' using errcode = '42501', hint = 'Confirma el código de verificación en dos pasos.';
  end if;
end $$;
revoke all on function private.exigir_mfa() from public, anon, authenticated;

create or replace function private.exigir_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin_total() then
    raise exception 'NO_ADMIN' using errcode = '42501', hint = 'Esto solo lo puede hacer un admin.';
  end if;
  perform private.exigir_mfa();
end $$;

create or replace function private.exigir_staff()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.soy_admin() then
    raise exception 'NO_ADMIN' using errcode = '42501', hint = 'Solo el equipo de ModoParche puede hacer esto.';
  end if;
  perform private.exigir_mfa();
end $$;

-- =====================================================================
-- 2. BLOQUEAR USUARIOS
--    Quien bloquea deja de ver los mensajes de esa persona, y la persona
--    bloqueada ya no ve sus parches ni puede unirse a ellos.
-- =====================================================================
create table if not exists public.bloqueos (
  bloqueador  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  bloqueado   uuid not null references auth.users (id) on delete cascade,
  creado_en   timestamptz not null default now(),
  primary key (bloqueador, bloqueado),
  check (bloqueador <> bloqueado)
);
create index if not exists bloqueos_bloqueado_idx on public.bloqueos (bloqueado);
alter table public.bloqueos enable row level security;
revoke all on public.bloqueos from anon;
grant select, delete on public.bloqueos to authenticated;
grant insert (bloqueado) on public.bloqueos to authenticated;
drop policy if exists "bloqueos: los míos" on public.bloqueos;
create policy "bloqueos: los míos" on public.bloqueos for select to authenticated using (bloqueador = (select auth.uid()));
drop policy if exists "bloqueos: bloquear" on public.bloqueos;
create policy "bloqueos: bloquear" on public.bloqueos for insert to authenticated with check (bloqueador = (select auth.uid()));
drop policy if exists "bloqueos: desbloquear" on public.bloqueos;
create policy "bloqueos: desbloquear" on public.bloqueos for delete to authenticated using (bloqueador = (select auth.uid()));

-- Solo responde sobre relaciones de quien pregunta (no sirve para espiar a otros)
create or replace function public.hay_bloqueo(dueno uuid, otro uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select dueno is not null and otro is not null
     and (auth.uid() is null or auth.uid() in (dueno, otro))
     and exists (select 1 from public.bloqueos b where b.bloqueador = dueno and b.bloqueado = otro)
$$;
revoke all on function public.hay_bloqueo(uuid, uuid) from public, anon;
grant execute on function public.hay_bloqueo(uuid, uuid) to authenticated;

-- Reglas restrictivas: se suman a las que ya existen sin reemplazarlas
drop policy if exists "bloqueos: no ver parches de quien me bloqueó" on public.parches;
create policy "bloqueos: no ver parches de quien me bloqueó" on public.parches as restrictive for select to authenticated
  using (not public.hay_bloqueo(creador_id, (select auth.uid())));
drop policy if exists "bloqueos: no ver mensajes de bloqueados" on public.mensajes;
create policy "bloqueos: no ver mensajes de bloqueados" on public.mensajes as restrictive for select to authenticated
  using (not public.hay_bloqueo((select auth.uid()), autor_id));
drop policy if exists "bloqueos: no unirse a parches de quien me bloqueó" on public.parche_miembros;
create policy "bloqueos: no unirse a parches de quien me bloqueó" on public.parche_miembros as restrictive for insert to authenticated
  with check (not exists (select 1 from public.parches p where p.id = parche_id and public.hay_bloqueo(p.creador_id, (select auth.uid()))));

-- Lista con nombres para el perfil
create or replace function public.mis_bloqueados()
returns table (id uuid, nombre text, desde timestamptz) language sql stable security definer set search_path = '' as $$
  select b.bloqueado, private.nombre_corto(b.bloqueado), b.creado_en
  from public.bloqueos b where b.bloqueador = auth.uid() order by b.creado_en desc
$$;
revoke all on function public.mis_bloqueados() from public, anon;
grant execute on function public.mis_bloqueados() to authenticated;

-- =====================================================================
-- 3. CHAT: GROSERÍAS, ENLACES SOSPECHOSOS Y AVISO PUSH
-- =====================================================================
create or replace function private.filtrar_mensaje()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_host text;
begin
  if new.autor_id is null then return new; end if; -- mensajes del sistema

  -- Enlaces: solo dominios conocidos. Acorta-enlaces, IPs y dominios raros no pasan.
  for v_url in
    select m[1] from regexp_matches(new.texto, '((?:https?://|www\.)[^\s<>"]+|\m[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co|net|org|xyz|ly|io|me|link|click|top|info|ru|cn|tk|app|site|online|live|gg|to)(?:/[^\s<>"]*)?)', 'gi') m
  loop
    v_host := lower(regexp_replace(regexp_replace(v_url, '^(https?://)?(www\.)?', '', 'i'), '[/?#:].*$', ''));
    if v_host !~ '^((maps\.)?google\.com|maps\.app\.goo\.gl|goo\.gl|(.*\.)?instagram\.com|(.*\.)?tiktok\.com|(.*\.)?youtube\.com|youtu\.be|(open\.)?spotify\.com|(.*\.)?latiquetera\.com|(.*\.)?tuboleta\.com|(.*\.)?eticket\.co|wa\.me|(.*\.)?modoparche\.co|modoparche[a-z0-9-]*\.vercel\.app|(.*\.)?gov\.co)$'
       or v_host ~ '^\d{1,3}(\.\d{1,3}){3}$' then
      raise exception 'ENLACE_BLOQUEADO' using errcode = 'P0001',
        hint = 'Por seguridad solo se pueden mandar enlaces de Google Maps, Instagram, TikTok, YouTube, Spotify, WhatsApp y boleterías conocidas.';
    end if;
  end loop;

  -- Groserías fuertes: se tapan (el mensaje igual sale)
  new.texto := regexp_replace(new.texto,
    '\m(hijuep[uú]ta|hijuep[uú]tas|hpta|hptas|gonorrea|gonorreas|malparid[oa]s?|careverga|carechimba|mamag[uü]evo|mamah[uü]evo|pirob[oa]s?|put[oa]s?|perras?|zorras?|maric[oó]n|maricones|verga|vergas|hijo de puta)\M',
    '****', 'gi');
  return new;
end $$;
revoke all on function private.filtrar_mensaje() from public, anon, authenticated;
drop trigger if exists filtrar_mensaje on public.mensajes;
create trigger filtrar_mensaje before insert on public.mensajes for each row execute function private.filtrar_mensaje();

-- Aviso push del chat: a los demás miembros, máximo uno cada 10 min por parche
create or replace function private.avisar_chat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_titulo text;
begin
  if new.autor_id is null then return new; end if;
  select p.titulo into v_titulo from public.parches p where p.id = new.parche_id;
  if v_titulo is null then return new; end if;
  insert into public.notificaciones (usuario_id, icono, texto, parche_id)
  select m.usuario_id, 'i-chat',
         private.texto_plano(private.nombre_corto(new.autor_id)) || ' escribió en <b>' || private.texto_plano(v_titulo) || '</b>: '
           || private.texto_plano(left(new.texto, 90)) || case when char_length(new.texto) > 90 then '…' else '' end,
         new.parche_id
  from public.parche_miembros m
  where m.parche_id = new.parche_id
    and m.usuario_id <> new.autor_id
    and not public.hay_bloqueo(m.usuario_id, new.autor_id)
    and not exists (
      select 1 from public.notificaciones n
      where n.usuario_id = m.usuario_id and n.parche_id = new.parche_id and n.icono = 'i-chat'
        and n.creado_en > now() - interval '10 minutes');
  return new;
end $$;
revoke all on function private.avisar_chat() from public, anon, authenticated;
drop trigger if exists avisar_chat on public.mensajes;
create trigger avisar_chat after insert on public.mensajes for each row execute function private.avisar_chat();

-- =====================================================================
-- 4. RECORDATORIO 1 HORA ANTES DEL PARCHE
-- =====================================================================
create table if not exists public.recordatorios_enviados (
  parche_id   uuid not null references public.parches (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  enviado_en  timestamptz not null default now(),
  primary key (parche_id, usuario_id)
);
alter table public.recordatorios_enviados enable row level security; -- solo la función

create or replace function private.enviar_recordatorios()
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with pendientes as (
    select p.id parche_id, p.titulo, p.lugar, m.usuario_id
    from public.parches p
    join public.parche_miembros m on m.parche_id = p.id
    where p.inicio between now() + interval '50 minutes' and now() + interval '65 minutes'
      and coalesce(p.demo, false) = false
      and not exists (select 1 from public.recordatorios_enviados r where r.parche_id = p.id and r.usuario_id = m.usuario_id)
  ), marcados as (
    insert into public.recordatorios_enviados (parche_id, usuario_id)
    select parche_id, usuario_id from pendientes
    on conflict do nothing
    returning parche_id, usuario_id
  )
  insert into public.notificaciones (usuario_id, icono, texto, parche_id)
  select k.usuario_id, 'i-clock',
         '<b>' || private.texto_plano(pe.titulo) || '</b> empieza en 1 hora en ' || private.texto_plano(pe.lugar)
           || '. Antes de salir, comparte tu ubicación en vivo desde Ayuda.',
         k.parche_id
  from marcados k join pendientes pe on pe.parche_id = k.parche_id and pe.usuario_id = k.usuario_id;
  get diagnostics v_n = row_count;
  delete from public.recordatorios_enviados where enviado_en < now() - interval '7 days';
  return v_n;
end $$;
revoke all on function private.enviar_recordatorios() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'modo-parche-recordatorios';
  perform cron.schedule('modo-parche-recordatorios', '*/5 * * * *', 'select private.enviar_recordatorios()');
exception when others then
  raise notice 'pg_cron no disponible (%). Actívalo en Database > Extensions y vuelve a correr este script.', sqlerrm;
end $$;

-- =====================================================================
-- 6. CÉDULA OBLIGATORIA Y COMPLETAR EL REGISTRO
--    · El registro con correo exige cédula (solo números, 5 a 10 dígitos,
--      sin empezar en 0), nombre con letras y celular colombiano si se da.
--      Lo valida la base aunque alguien se salte la app.
--    · Quien entró con Google, o ya tenía cuenta sin cédula, la completa
--      una sola vez en el dashboard. Las cuentas de negocio no la piden.
-- =====================================================================
create or replace function private.validar_registro()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Solo registros que llegan por la app (GoTrue). Las cuentas que crea el
  -- equipo desde el SQL Editor y las de negocio no pasan por aquí.
  if current_user <> 'supabase_auth_admin' then return new; end if;
  if coalesce(new.raw_app_meta_data ->> 'provider', 'email') <> 'email' then return new; end if;
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
revoke all on function private.validar_registro() from public, anon, authenticated;
drop trigger if exists validar_registro on auth.users;
create trigger validar_registro before insert on auth.users for each row execute function private.validar_registro();

create or replace function public.estado_registro()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'proveedor', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
    -- Google: falta fecha o autorizaciones
    'falta', coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
             and (
               pp.fecha_nacimiento is null
               or not exists (select 1 from public.consentimientos c where c.usuario_id = u.id and c.tipo = 'terminos' and c.aceptado)
             ),
    -- Cualquier persona (no negocio) sin cédula
    'falta_cedula', pp.cedula is null and not exists (select 1 from public.negocios n where n.id = u.id),
    'nombre', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
  )
  from auth.users u
  left join public.perfiles_privados pp on pp.id = u.id
  where u.id = auth.uid()
$$;
revoke all on function public.estado_registro() from public, anon;
grant execute on function public.estado_registro() to authenticated;

drop function if exists public.completar_registro(date, boolean, boolean, boolean, text);
create or replace function public.completar_registro(
  p_cedula text, p_fecha date default null, p_terminos boolean default null, p_datos boolean default null,
  p_anuncios boolean default false, p_nombre text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_ced text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_google boolean;
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if v_ced !~ '^[1-9][0-9]{4,9}$' then
    raise exception 'CEDULA_INVALIDA' using errcode = 'P0001', hint = 'Escribe tu cédula solo con números: de 5 a 10 dígitos.';
  end if;
  if exists (select 1 from public.perfiles_privados where cedula = v_ced and id <> uid) then
    raise exception 'CEDULA_REPETIDA' using errcode = 'P0001', hint = 'Esa cédula ya tiene una cuenta. Si es tuya, entra con ese correo o escríbenos a modoparcheoficial@gmail.com.';
  end if;
  select coalesce(raw_app_meta_data ->> 'provider', 'email') <> 'email' into v_google from auth.users where id = uid;

  if v_google then
    if p_fecha is null or p_fecha > (current_date - interval '18 years')::date or p_fecha < date '1900-01-01' then
      raise exception 'MENOR_DE_EDAD' using errcode = 'P0001', hint = 'ModoParche es solo para mayores de 18 años.';
    end if;
    if not coalesce(p_terminos, false) or not coalesce(p_datos, false) then
      raise exception 'FALTA_AUTORIZACION' using errcode = 'P0001', hint = 'Necesitamos que aceptes los términos y el tratamiento de datos.';
    end if;
  end if;

  insert into public.perfiles_privados (id, cedula, fecha_nacimiento) values (uid, v_ced, p_fecha)
  on conflict (id) do update set cedula = excluded.cedula,
    fecha_nacimiento = coalesce(excluded.fecha_nacimiento, public.perfiles_privados.fecha_nacimiento);

  if v_google and not exists (select 1 from public.consentimientos c where c.usuario_id = uid and c.tipo = 'terminos' and c.aceptado) then
    insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen) values
      (uid, 'terminos', '1.0', true, 'perfil'),
      (uid, 'datos', '1.0', true, 'perfil'),
      (uid, 'anuncios', '1.0', coalesce(p_anuncios, false), 'perfil');
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is not null and trim(p_nombre) ~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'' -]{3,80}$' then
    update public.perfiles set nombre = left(trim(p_nombre), 80) where id = uid;
  end if;
end $$;
revoke all on function public.completar_registro(text, date, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.completar_registro(text, date, boolean, boolean, boolean, text) to authenticated;

-- =====================================================================
-- 7. ERRORES DE LA APP EN PRODUCCIÓN (monitoreo propio, sin terceros)
--    mp-errores.js manda los errores del navegador; el admin los ve.
--    Tope global para que nadie llene la tabla y limpieza a los 30 días.
-- =====================================================================
create table if not exists public.errores_cliente (
  id          bigint generated always as identity primary key,
  usuario_id  uuid references auth.users (id) on delete set null default auth.uid(),
  pagina      text not null check (char_length(pagina) <= 200),
  mensaje     text not null check (char_length(mensaje) <= 500),
  detalle     text check (char_length(detalle) <= 2000),
  navegador   text check (char_length(navegador) <= 300),
  creado_en   timestamptz not null default now()
);
create index if not exists errores_cliente_tiempo_idx on public.errores_cliente (creado_en desc);
alter table public.errores_cliente enable row level security;
revoke all on public.errores_cliente from anon, authenticated;
grant insert (pagina, mensaje, detalle, navegador) on public.errores_cliente to anon, authenticated;
drop policy if exists "errores: reportar" on public.errores_cliente;
create policy "errores: reportar" on public.errores_cliente for insert to anon, authenticated with check (true);

create or replace function private.frenar_errores()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.errores_cliente where creado_en > now() - interval '10 minutes') >= 300 then
    return null; -- se descarta en silencio
  end if;
  if random() < 0.02 then delete from public.errores_cliente where creado_en < now() - interval '30 days'; end if;
  return new;
end $$;
revoke all on function private.frenar_errores() from public, anon, authenticated;
drop trigger if exists frenar_errores on public.errores_cliente;
create trigger frenar_errores before insert on public.errores_cliente for each row execute function private.frenar_errores();

create or replace function public.admin_errores(p_limite int default 100)
returns table (id bigint, pagina text, mensaje text, detalle text, navegador text, usuario text, creado_en timestamptz, veces bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_staff();
  return query
    select max(e.id), e.pagina, e.mensaje, max(e.detalle), max(e.navegador),
           private.nombre_corto((array_agg(e.usuario_id order by e.creado_en desc))[1]),
           max(e.creado_en), count(*)
    from public.errores_cliente e
    where e.creado_en > now() - interval '7 days'
    group by e.pagina, e.mensaje
    order by max(e.creado_en) desc
    limit greatest(1, least(p_limite, 300));
end $$;
revoke all on function public.admin_errores(int) from public, anon;
grant execute on function public.admin_errores(int) to authenticated;

-- =====================================================================
-- 8. UBICACIÓN EN VIVO: ¿YA LLEGÓ AL PARCHE?
--    El enlace /seguro muestra una alerta si el parche empezó hace más de
--    30 minutos y la persona no ha marcado su llegada.
-- =====================================================================
create or replace function public.ubicacion_por_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nombre', private.nombre_corto(u.usuario_id), 'lat', u.lat, 'lng', u.lng, 'precision', u.precision_m,
    'actualizado', u.actualizado, 'activa', u.activa and u.vence > now(),
    'parche', (select jsonb_build_object('titulo', p.titulo, 'lugar', p.lugar, 'inicio', p.inicio) from public.parches p where p.id = u.parche_id),
    'llego', exists (select 1 from public.parche_miembros m where m.parche_id = u.parche_id and m.usuario_id = u.usuario_id and m.checkin_en is not null)
  )
  from public.ubicaciones_vivas u
  where u.token = p_token and char_length(p_token) = 64 and u.creado_en > now() - interval '24 hours'
$$;
revoke all on function public.ubicacion_por_token(text) from public;
grant execute on function public.ubicacion_por_token(text) to anon, authenticated;
