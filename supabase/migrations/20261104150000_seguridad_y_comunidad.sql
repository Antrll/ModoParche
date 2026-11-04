-- =====================================================================
-- ModoParche · Seguridad y comunidad (noviembre 2026)
-- Corre después de 20261104140000_mejoras_noviembre.sql.
--
--  1. QR personal de identidad (cambia cada 30 s; muestra nombre y sello,
--     nunca la cédula)
--  2. Lista de espera cuando un parche se llena
--  3. Invitar a los parceros con los que más sales
--  4. Transporte compartido (ofrecer puestos, pedir puesto)
--  5. Encuestas en el chat
--  6. Álbum de fotos del parche
--  7. Modo seguro: contacto de confianza y ubicación en vivo por enlace
--  8. Clics a la boletería de los parches oficiales (para aliados)
-- Se puede correr más de una vez.
-- =====================================================================

-- Ayuda para las políticas: ¿la persona está dentro del parche?
-- (va en public porque las políticas corren con los permisos de quien
--  consulta; quiénes están en un parche ya es visible para las cuentas)
create or replace function public.es_miembro(p_parche uuid, p_usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.parche_miembros m where m.parche_id = p_parche and m.usuario_id = p_usuario)
$$;
revoke all on function public.es_miembro(uuid, uuid) from public, anon;
grant execute on function public.es_miembro(uuid, uuid) to authenticated;

-- =====================================================================
-- 1. QR PERSONAL DE IDENTIDAD
--    El celular pide un código nuevo cada 30 s (dura 75 s). Quien lo
--    escanea ve nombre, foto (si la muestra), sello de cédula verificada,
--    calificación y desde cuándo está. Nunca el número de cédula.
-- =====================================================================
create table if not exists public.qr_identidad (
  codigo      text primary key,
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  vence       timestamptz not null
);
create index if not exists qr_identidad_usuario_idx on public.qr_identidad (usuario_id);
alter table public.qr_identidad enable row level security;  -- sin políticas: solo por las funciones

create or replace function public.nuevo_qr_identidad()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cod text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  delete from public.qr_identidad where usuario_id = auth.uid() and vence < now() + interval '30 seconds';
  delete from public.qr_identidad where vence < now() - interval '1 hour';
  insert into public.qr_identidad (codigo, usuario_id, vence) values (v_cod, auth.uid(), now() + interval '75 seconds');
  return jsonb_build_object('codigo', v_cod, 'vence', now() + interval '75 seconds', 'ahora', now());
end $$;

create or replace function public.verificar_qr_identidad(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid; r jsonb;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select usuario_id into v_uid from public.qr_identidad where codigo = lower(trim(p_codigo)) and vence > now();
  if v_uid is null then
    raise exception 'QR_VENCIDO' using errcode = 'P0001', hint = 'Ese QR ya venció o no es de ModoParche. Pide que lo vuelva a mostrar.';
  end if;
  select jsonb_build_object(
      'nombre', p.nombre,
      'foto', case when p.mostrar_foto_real then p.foto_encuadre end,
      'verificado', coalesce(p.verificado, false),
      'rating', case when p.resenas > 0 then p.rating else 0 end,
      'resenas', p.resenas,
      'desde', p.creado_en,
      'parches', (select count(*) from public.parche_miembros m where m.usuario_id = v_uid and m.checkin),
      'es_negocio', exists (select 1 from public.negocios n where n.id = v_uid)
    ) into r
  from public.perfiles p where p.id = v_uid;
  if r is null then
    select jsonb_build_object('nombre', n.nombre, 'verificado', coalesce(n.verificado, false), 'es_negocio', true, 'desde', n.creado_en)
      into r from public.negocios n where n.id = v_uid;
  end if;
  return r;
end $$;
revoke all on function public.nuevo_qr_identidad() from public, anon;
revoke all on function public.verificar_qr_identidad(text) from public, anon;
grant execute on function public.nuevo_qr_identidad() to authenticated;
grant execute on function public.verificar_qr_identidad(text) to authenticated;

-- =====================================================================
-- 2. LISTA DE ESPERA
--    Si el parche está lleno, la persona se apunta. Cuando alguien se
--    sale, la primera de la lista recibe un aviso (y sale de la lista).
-- =====================================================================
create table if not exists public.lista_espera (
  parche_id   uuid not null references public.parches (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado_en   timestamptz not null default now(),
  primary key (parche_id, usuario_id)
);
alter table public.lista_espera enable row level security;
grant select, delete on public.lista_espera to authenticated;
grant insert (parche_id) on public.lista_espera to authenticated;
drop policy if exists "espera: ver la mía" on public.lista_espera;
create policy "espera: ver la mía" on public.lista_espera for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists "espera: apuntarme" on public.lista_espera;
create policy "espera: apuntarme" on public.lista_espera for insert to authenticated
  with check (usuario_id = (select auth.uid()) and not public.es_miembro(parche_id, (select auth.uid())));
drop policy if exists "espera: salirme" on public.lista_espera;
create policy "espera: salirme" on public.lista_espera for delete to authenticated using (usuario_id = (select auth.uid()));

-- Cuántas personas esperan (sin decir quiénes)
create or replace function public.espera_cuantos(p_parche uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.lista_espera where parche_id = p_parche
$$;
revoke all on function public.espera_cuantos(uuid) from public, anon;
grant execute on function public.espera_cuantos(uuid) to authenticated;

create or replace function private.cupo_liberado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; p public.parches%rowtype;
begin
  select * into p from public.parches where id = old.parche_id;
  if p.id is null or p.inicio < now() then return null; end if;
  select usuario_id into v_uid from public.lista_espera where parche_id = old.parche_id order by creado_en limit 1;
  if v_uid is null then return null; end if;
  delete from public.lista_espera where parche_id = old.parche_id and usuario_id = v_uid;
  insert into public.notificaciones (usuario_id, icono, texto, parche_id)
  values (v_uid, 'i-users', left('Se liberó un cupo en <b>' || replace(replace(p.titulo, '<', '&lt;'), '>', '&gt;') || '</b>. Cáele rápido antes de que lo tomen.', 300), p.id);
  return null;
end $$;
revoke all on function private.cupo_liberado() from public, anon, authenticated;
drop trigger if exists miembros_cupo_liberado on public.parche_miembros;
create trigger miembros_cupo_liberado after delete on public.parche_miembros
  for each row execute function private.cupo_liberado();

-- Quien entra al parche sale de la lista de espera
create or replace function private.salir_de_espera()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.lista_espera where parche_id = new.parche_id and usuario_id = new.usuario_id;
  return null;
end $$;
revoke all on function private.salir_de_espera() from public, anon, authenticated;
drop trigger if exists miembros_salir_de_espera on public.parche_miembros;
create trigger miembros_salir_de_espera after insert on public.parche_miembros
  for each row execute function private.salir_de_espera();

-- =====================================================================
-- 3. INVITAR A TUS PARCEROS
--    "Parceros" = personas con las que has compartido parches. La
--    invitación llega como notificación (y push si la tienen activa).
-- =====================================================================
create table if not exists public.invitaciones (
  parche_id    uuid not null references public.parches (id) on delete cascade,
  invitado_id  uuid not null references auth.users (id) on delete cascade,
  autor_id     uuid not null references auth.users (id) on delete cascade,
  creado_en    timestamptz not null default now(),
  primary key (parche_id, invitado_id)
);
alter table public.invitaciones enable row level security;  -- solo por las funciones

create or replace function public.mis_parceros()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.veces desc, x.nombre), '[]'::jsonb) from (
    select o.usuario_id as id, p.nombre, coalesce(p.verificado, false) as verificado, count(*) as veces
    from public.parche_miembros yo
    join public.parche_miembros o on o.parche_id = yo.parche_id and o.usuario_id <> yo.usuario_id
    join public.perfiles p on p.id = o.usuario_id
    where yo.usuario_id = auth.uid()
    group by o.usuario_id, p.nombre, p.verificado
    order by count(*) desc
    limit 20
  ) x
$$;
revoke all on function public.mis_parceros() from public, anon;
grant execute on function public.mis_parceros() to authenticated;

create or replace function public.invitar_a_parche(p_parche uuid, p_invitados uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare p public.parches%rowtype; v_n int := 0; v_id uuid; v_yo text;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select * into p from public.parches where id = p_parche;
  if p.id is null or p.inicio < now() - interval '1 hour' then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese parche ya pasó.'; end if;
  if not public.es_miembro(p_parche, auth.uid()) then raise exception 'NO_ESTAS' using errcode = 'P0001', hint = 'Únete al parche para invitar.'; end if;
  if coalesce(array_length(p_invitados, 1), 0) > 15 then raise exception 'MUCHOS' using errcode = 'P0001', hint = 'Invita máximo 15 personas a la vez.'; end if;
  v_yo := private.nombre_corto(auth.uid());
  foreach v_id in array coalesce(p_invitados, '{}') loop
    -- Solo a parceros reales (compartieron un parche) que no estén ya dentro ni invitados
    if v_id <> auth.uid()
       and exists (select 1 from public.parche_miembros a join public.parche_miembros b on b.parche_id = a.parche_id
                   where a.usuario_id = auth.uid() and b.usuario_id = v_id)
       and not public.es_miembro(p_parche, v_id) then
      insert into public.invitaciones (parche_id, invitado_id, autor_id) values (p_parche, v_id, auth.uid())
      on conflict do nothing;
      if found then
        insert into public.notificaciones (usuario_id, icono, texto, parche_id)
        values (v_id, 'i-bolt', left('<b>' || replace(replace(v_yo, '<', '&lt;'), '>', '&gt;') || '</b> te invitó a <b>' || replace(replace(p.titulo, '<', '&lt;'), '>', '&gt;') || '</b>.', 300), p_parche);
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.invitar_a_parche(uuid, uuid[]) from public, anon;
grant execute on function public.invitar_a_parche(uuid, uuid[]) to authenticated;

-- =====================================================================
-- 4. TRANSPORTE COMPARTIDO
-- =====================================================================
create table if not exists public.viajes (
  id          bigint generated always as identity primary key,
  parche_id   uuid not null references public.parches (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  medio       text not null default 'carro' check (medio in ('carro', 'moto', 'taxi')),
  puestos     int not null check (puestos between 1 and 6),
  desde       text not null check (char_length(desde) between 2 and 60),
  hora        text check (hora is null or hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  creado_en   timestamptz not null default now(),
  unique (parche_id, usuario_id)
);
create table if not exists public.viaje_pasajeros (
  viaje_id    bigint not null references public.viajes (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado_en   timestamptz not null default now(),
  primary key (viaje_id, usuario_id)
);
alter table public.viajes enable row level security;
alter table public.viaje_pasajeros enable row level security;
grant select, delete on public.viajes, public.viaje_pasajeros to authenticated;
grant insert (parche_id, medio, puestos, desde, hora) on public.viajes to authenticated;
grant update (medio, puestos, desde, hora) on public.viajes to authenticated;
grant insert (viaje_id) on public.viaje_pasajeros to authenticated;

drop policy if exists "viajes: ver los del parche" on public.viajes;
create policy "viajes: ver los del parche" on public.viajes for select to authenticated
  using (public.es_miembro(parche_id, (select auth.uid())));
drop policy if exists "viajes: ofrecer" on public.viajes;
create policy "viajes: ofrecer" on public.viajes for insert to authenticated
  with check (usuario_id = (select auth.uid()) and public.es_miembro(parche_id, (select auth.uid())));
drop policy if exists "viajes: editar el mío" on public.viajes;
create policy "viajes: editar el mío" on public.viajes for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists "viajes: borrar el mío" on public.viajes;
create policy "viajes: borrar el mío" on public.viajes for delete to authenticated using (usuario_id = (select auth.uid()));

drop policy if exists "pasajeros: ver" on public.viaje_pasajeros;
create policy "pasajeros: ver" on public.viaje_pasajeros for select to authenticated
  using (exists (select 1 from public.viajes v where v.id = viaje_id and public.es_miembro(v.parche_id, (select auth.uid()))));
drop policy if exists "pasajeros: subirme" on public.viaje_pasajeros;
create policy "pasajeros: subirme" on public.viaje_pasajeros for insert to authenticated
  with check (usuario_id = (select auth.uid())
    and exists (select 1 from public.viajes v where v.id = viaje_id and v.usuario_id <> (select auth.uid()) and public.es_miembro(v.parche_id, (select auth.uid()))));
drop policy if exists "pasajeros: bajarme" on public.viaje_pasajeros;
create policy "pasajeros: bajarme" on public.viaje_pasajeros for delete to authenticated
  using (usuario_id = (select auth.uid()) or exists (select 1 from public.viajes v where v.id = viaje_id and v.usuario_id = (select auth.uid())));

-- No más pasajeros que puestos; y el conductor recibe aviso
create or replace function private.validar_pasajero()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.viajes%rowtype; v_n int;
begin
  select * into v from public.viajes where id = new.viaje_id for update;
  select count(*) into v_n from public.viaje_pasajeros where viaje_id = new.viaje_id;
  if v_n >= v.puestos then raise exception 'SIN_PUESTOS' using errcode = 'P0001', hint = 'Ya no quedan puestos en ese viaje.'; end if;
  insert into public.notificaciones (usuario_id, icono, texto, parche_id)
  values (v.usuario_id, 'i-users', left('<b>' || private.nombre_corto(new.usuario_id) || '</b> se va contigo al parche.', 300), v.parche_id);
  return new;
end $$;
revoke all on function private.validar_pasajero() from public, anon, authenticated;
drop trigger if exists pasajeros_validar on public.viaje_pasajeros;
create trigger pasajeros_validar before insert on public.viaje_pasajeros
  for each row execute function private.validar_pasajero();

-- =====================================================================
-- 5. ENCUESTAS EN EL CHAT
-- =====================================================================
alter table public.mensajes drop constraint if exists mensajes_tipo_check;
alter table public.mensajes add constraint mensajes_tipo_check check (tipo in ('user', 'sys', 'bot', 'alerta', 'encuesta'));

create table if not exists public.encuestas (
  id          bigint generated always as identity primary key,
  parche_id   uuid not null references public.parches (id) on delete cascade,
  autor_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  pregunta    text not null check (char_length(pregunta) between 3 and 120),
  opciones    text[] not null check (array_length(opciones, 1) between 2 and 5),
  creado_en   timestamptz not null default now()
);
create table if not exists public.encuesta_votos (
  encuesta_id bigint not null references public.encuestas (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  opcion      int not null check (opcion between 0 and 4),
  creado_en   timestamptz not null default now(),
  primary key (encuesta_id, usuario_id)
);
alter table public.mensajes add column if not exists encuesta_id bigint references public.encuestas (id) on delete cascade;
alter table public.encuestas enable row level security;
alter table public.encuesta_votos enable row level security;
grant select on public.encuestas, public.encuesta_votos to authenticated;
grant insert (encuesta_id, opcion), update (opcion), delete on public.encuesta_votos to authenticated;

drop policy if exists "encuestas: ver las del parche" on public.encuestas;
create policy "encuestas: ver las del parche" on public.encuestas for select to authenticated
  using (public.es_miembro(parche_id, (select auth.uid())));
drop policy if exists "votos: ver" on public.encuesta_votos;
create policy "votos: ver" on public.encuesta_votos for select to authenticated
  using (exists (select 1 from public.encuestas e where e.id = encuesta_id and public.es_miembro(e.parche_id, (select auth.uid()))));
drop policy if exists "votos: votar" on public.encuesta_votos;
create policy "votos: votar" on public.encuesta_votos for insert to authenticated
  with check (usuario_id = (select auth.uid())
    and exists (select 1 from public.encuestas e where e.id = encuesta_id and public.es_miembro(e.parche_id, (select auth.uid()))
                and opcion < array_length(e.opciones, 1)));
drop policy if exists "votos: cambiar" on public.encuesta_votos;
create policy "votos: cambiar" on public.encuesta_votos for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists "votos: quitar" on public.encuesta_votos;
create policy "votos: quitar" on public.encuesta_votos for delete to authenticated using (usuario_id = (select auth.uid()));

create or replace function public.crear_encuesta(p_parche uuid, p_pregunta text, p_opciones text[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_ops text[];
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if not public.es_miembro(p_parche, auth.uid()) then raise exception 'NO_ESTAS' using errcode = 'P0001', hint = 'Únete al parche para crear encuestas.'; end if;
  select array_agg(left(trim(o), 40)) into v_ops from unnest(p_opciones) o where trim(o) <> '';
  if coalesce(array_length(v_ops, 1), 0) not between 2 and 5 then raise exception 'OPCIONES' using errcode = 'P0001', hint = 'Pon entre 2 y 5 opciones.'; end if;
  if (select count(*) from public.encuestas where parche_id = p_parche and autor_id = auth.uid() and creado_en > now() - interval '1 hour') >= 3 then
    raise exception 'DEMASIADAS' using errcode = 'P0001', hint = 'Máximo 3 encuestas por hora.';
  end if;
  insert into public.encuestas (parche_id, autor_id, pregunta, opciones) values (p_parche, auth.uid(), left(trim(p_pregunta), 120), v_ops) returning id into v_id;
  insert into public.mensajes (parche_id, autor_id, tipo, texto, encuesta_id) values (p_parche, auth.uid(), 'encuesta', left(trim(p_pregunta), 120), v_id);
  return v_id;
end $$;
revoke all on function public.crear_encuesta(uuid, text, text[]) from public, anon;
grant execute on function public.crear_encuesta(uuid, text, text[]) to authenticated;

-- =====================================================================
-- 6. ÁLBUM DEL PARCHE
--    Fotos en el bucket "fotos" (carpeta de quien sube). Solo las ven
--    quienes están en el parche. Máximo 30 por persona y parche.
-- =====================================================================
create table if not exists public.fotos_parche (
  id          bigint generated always as identity primary key,
  parche_id   uuid not null references public.parches (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  url         text not null check (char_length(url) <= 600),
  creado_en   timestamptz not null default now()
);
create index if not exists fotos_parche_idx on public.fotos_parche (parche_id, creado_en desc);
alter table public.fotos_parche enable row level security;
grant select, delete on public.fotos_parche to authenticated;
grant insert (parche_id, url) on public.fotos_parche to authenticated;
drop policy if exists "album: ver" on public.fotos_parche;
create policy "album: ver" on public.fotos_parche for select to authenticated using (public.es_miembro(parche_id, (select auth.uid())));
drop policy if exists "album: subir" on public.fotos_parche;
create policy "album: subir" on public.fotos_parche for insert to authenticated
  with check (usuario_id = (select auth.uid()) and public.es_miembro(parche_id, (select auth.uid()))
    and url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/' || (select auth.uid())::text || '/album-[A-Za-z0-9._-]+$')
    and (select count(*) from public.fotos_parche f where f.parche_id = fotos_parche.parche_id and f.usuario_id = (select auth.uid())) < 30);
drop policy if exists "album: borrar la mía" on public.fotos_parche;
create policy "album: borrar la mía" on public.fotos_parche for delete to authenticated using (usuario_id = (select auth.uid()));

-- =====================================================================
-- 7. MODO SEGURO
--    Contacto de confianza (privado) y ubicación en vivo que se comparte
--    por un enlace /seguro/<token>. Dura máximo 8 horas y se puede parar.
-- =====================================================================
alter table public.perfiles_privados add column if not exists contacto_nombre text check (contacto_nombre is null or char_length(contacto_nombre) <= 40);
alter table public.perfiles_privados add column if not exists contacto_tel text check (contacto_tel is null or contacto_tel ~ '^[0-9]{7,15}$');
grant update (contacto_nombre, contacto_tel) on public.perfiles_privados to authenticated;

create table if not exists public.ubicaciones_vivas (
  token       text primary key,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  parche_id   uuid references public.parches (id) on delete set null,
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  precision_m int,
  activa      boolean not null default true,
  vence       timestamptz not null default now() + interval '8 hours',
  actualizado timestamptz not null default now(),
  creado_en   timestamptz not null default now()
);
alter table public.ubicaciones_vivas enable row level security;
grant select on public.ubicaciones_vivas to authenticated;
grant update (lat, lng, precision_m, activa, actualizado) on public.ubicaciones_vivas to authenticated;
drop policy if exists "ubicacion: la mía" on public.ubicaciones_vivas;
create policy "ubicacion: la mía" on public.ubicaciones_vivas for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists "ubicacion: actualizar la mía" on public.ubicaciones_vivas;
create policy "ubicacion: actualizar la mía" on public.ubicaciones_vivas for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

create or replace function public.iniciar_ubicacion_viva(p_parche uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.ubicaciones_vivas set activa = false where usuario_id = auth.uid() and activa;
  insert into public.ubicaciones_vivas (token, usuario_id, parche_id) values (v_token, auth.uid(), p_parche);
  return v_token;
end $$;
revoke all on function public.iniciar_ubicacion_viva(uuid) from public, anon;
grant execute on function public.iniciar_ubicacion_viva(uuid) to authenticated;

-- Lo que ve el contacto de confianza (sin cuenta): solo con el token
create or replace function public.ubicacion_por_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nombre', private.nombre_corto(u.usuario_id), 'lat', u.lat, 'lng', u.lng, 'precision', u.precision_m,
    'actualizado', u.actualizado, 'activa', u.activa and u.vence > now(),
    'parche', (select jsonb_build_object('titulo', p.titulo, 'lugar', p.lugar, 'inicio', p.inicio) from public.parches p where p.id = u.parche_id)
  )
  from public.ubicaciones_vivas u
  where u.token = p_token and char_length(p_token) = 64 and u.creado_en > now() - interval '24 hours'
$$;
revoke all on function public.ubicacion_por_token(text) from public;
grant execute on function public.ubicacion_por_token(text) to anon, authenticated;

-- =====================================================================
-- 8. CLICS A LA BOLETERÍA DE LOS OFICIALES
-- =====================================================================
create table if not exists public.clics_boleteria (
  id          bigint generated always as identity primary key,
  parche_id   uuid not null references public.parches (id) on delete cascade,
  tipo        text not null check (tipo in ('entrada', 'palco')),
  usuario_id  uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists clics_boleteria_idx on public.clics_boleteria (parche_id, tipo);
alter table public.clics_boleteria enable row level security;  -- solo por las funciones

create or replace function public.registrar_clic_boleta(p_parche uuid, p_tipo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tipo not in ('entrada', 'palco') or not exists (select 1 from public.parches where id = p_parche and oficial) then return; end if;
  -- Un clic por persona, tipo y hora (los repetidos no inflan la cuenta)
  if exists (select 1 from public.clics_boleteria where parche_id = p_parche and tipo = p_tipo and usuario_id = auth.uid() and creado_en > now() - interval '1 hour') then return; end if;
  insert into public.clics_boleteria (parche_id, tipo, usuario_id) values (p_parche, p_tipo, auth.uid());
end $$;
revoke all on function public.registrar_clic_boleta(uuid, text) from public, anon;
grant execute on function public.registrar_clic_boleta(uuid, text) to authenticated;

create or replace function public.admin_clics_oficiales()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.exigir_staff();
  select coalesce(jsonb_object_agg(parche_id, d), '{}'::jsonb) into r from (
    select parche_id, jsonb_build_object(
      'entrada', count(*) filter (where tipo = 'entrada'),
      'palco', count(*) filter (where tipo = 'palco'),
      'personas', count(distinct usuario_id),
      'semana', count(*) filter (where creado_en > now() - interval '7 days')) d
    from public.clics_boleteria group by parche_id
  ) x;
  return r;
end $$;
revoke all on function public.admin_clics_oficiales() from public, anon;
grant execute on function public.admin_clics_oficiales() to authenticated;

-- Tiempo real para las piezas nuevas del chat
do $$
begin
  begin alter publication supabase_realtime add table public.encuesta_votos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.viajes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.viaje_pasajeros; exception when others then null; end;
  begin alter publication supabase_realtime add table public.fotos_parche; exception when others then null; end;
end $$;
