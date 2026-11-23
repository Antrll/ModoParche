-- =====================================================================
-- ModoParche · Amigos y mensajes directos
-- Corre en: Supabase > SQL Editor, después de 20261120120000_mejoras_cobro.sql.
-- Se puede correr más de una vez.
--
-- 1. Solicitudes de amistad: solo a gente con la que compartiste un parche
--    (así nadie te escribe sin conocerte). Máximo 30 solicitudes al día.
-- 2. Mensajes directos entre amigos, con el mismo filtro del chat (enlaces
--    raros y groserías), freno anti-spam y aviso push.
-- 3. Un bloqueo corta la amistad y los mensajes al instante.
-- =====================================================================

-- =====================================================================
-- 1. AMISTADES (una fila por pareja: a < b)
-- =====================================================================
create table if not exists public.amistades (
  a            uuid not null references auth.users (id) on delete cascade,
  b            uuid not null references auth.users (id) on delete cascade,
  solicitante  uuid not null references auth.users (id) on delete cascade,
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'aceptada')),
  creado_en    timestamptz not null default now(),
  aceptada_en  timestamptz,
  primary key (a, b),
  check (a < b),
  check (solicitante in (a, b))
);
create index if not exists amistades_b_idx on public.amistades (b);
alter table public.amistades enable row level security;
revoke all on public.amistades from anon, authenticated;
grant select on public.amistades to authenticated;
drop policy if exists "amistades: las mías" on public.amistades;
create policy "amistades: las mías" on public.amistades for select to authenticated
  using ((select auth.uid()) in (a, b));

create or replace function public.son_amigos(p_x uuid, p_y uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.amistades
                 where a = least(p_x, p_y) and b = greatest(p_x, p_y) and estado = 'aceptada')
$$;
revoke all on function public.son_amigos(uuid, uuid) from public, anon;
grant execute on function public.son_amigos(uuid, uuid) to authenticated;

create or replace function public.solicitar_amistad(p_usuario uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := auth.uid(); f public.amistades%rowtype;
begin
  if v_yo is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if p_usuario is null or p_usuario = v_yo then raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'No puedes agregarte a ti.'; end if;
  if not exists (select 1 from public.perfiles where id = p_usuario) then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa persona no existe.';
  end if;
  if exists (select 1 from public.bloqueos where (bloqueador = v_yo and bloqueado = p_usuario) or (bloqueador = p_usuario and bloqueado = v_yo)) then
    raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'No puedes agregar a esta persona.';
  end if;
  select * into f from public.amistades where a = least(v_yo, p_usuario) and b = greatest(v_yo, p_usuario) for update;
  if found then
    if f.estado = 'aceptada' then return 'ya_amigos'; end if;
    if f.solicitante = v_yo then return 'ya_enviada'; end if;
    -- La otra persona ya me había escrito: se acepta de una
    update public.amistades set estado = 'aceptada', aceptada_en = now() where a = f.a and b = f.b;
    insert into public.notificaciones (usuario_id, icono, texto)
    values (p_usuario, 'i-users', '<b>' || private.texto_plano(private.nombre_corto(v_yo)) || '</b> aceptó tu solicitud. Ya pueden escribirse.');
    return 'aceptada';
  end if;
  -- Solo gente con la que compartiste un parche
  if not exists (select 1 from public.parche_miembros x join public.parche_miembros y on y.parche_id = x.parche_id
                 where x.usuario_id = v_yo and y.usuario_id = p_usuario) then
    raise exception 'SIN_PARCHE' using errcode = 'P0001', hint = 'Solo puedes agregar a gente con la que ya compartiste un parche.';
  end if;
  if (select count(*) from public.amistades where solicitante = v_yo and creado_en > now() - interval '1 day') >= 30 then
    raise exception 'DEMASIADAS' using errcode = 'P0001', hint = 'Enviaste muchas solicitudes hoy. Intenta mañana.';
  end if;
  insert into public.amistades (a, b, solicitante) values (least(v_yo, p_usuario), greatest(v_yo, p_usuario), v_yo);
  insert into public.notificaciones (usuario_id, icono, texto)
  values (p_usuario, 'i-users', '<b>' || private.texto_plano(private.nombre_corto(v_yo)) || '</b> te envió una solicitud de amistad. Mírala en Mis parches > Amigos.');
  return 'enviada';
end $$;
revoke all on function public.solicitar_amistad(uuid) from public, anon;
grant execute on function public.solicitar_amistad(uuid) to authenticated;

create or replace function public.responder_amistad(p_usuario uuid, p_aceptar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := auth.uid();
begin
  if v_yo is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if p_aceptar then
    update public.amistades set estado = 'aceptada', aceptada_en = now()
     where a = least(v_yo, p_usuario) and b = greatest(v_yo, p_usuario) and estado = 'pendiente' and solicitante = p_usuario;
    if not found then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa solicitud ya no existe.'; end if;
    insert into public.notificaciones (usuario_id, icono, texto)
    values (p_usuario, 'i-users', '<b>' || private.texto_plano(private.nombre_corto(v_yo)) || '</b> aceptó tu solicitud. Ya pueden escribirse.');
  else
    delete from public.amistades
     where a = least(v_yo, p_usuario) and b = greatest(v_yo, p_usuario) and estado = 'pendiente';
  end if;
end $$;
revoke all on function public.responder_amistad(uuid, boolean) from public, anon;
grant execute on function public.responder_amistad(uuid, boolean) to authenticated;

-- Quitar a un amigo o cancelar una solicitud enviada
create or replace function public.eliminar_amistad(p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  delete from public.amistades where a = least(auth.uid(), p_usuario) and b = greatest(auth.uid(), p_usuario);
end $$;
revoke all on function public.eliminar_amistad(uuid) from public, anon;
grant execute on function public.eliminar_amistad(uuid) to authenticated;

-- Bloquear corta la amistad
create or replace function private.bloqueo_corta_amistad()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.amistades where a = least(new.bloqueador, new.bloqueado) and b = greatest(new.bloqueador, new.bloqueado);
  return new;
end $$;
drop trigger if exists bloqueo_corta_amistad on public.bloqueos;
create trigger bloqueo_corta_amistad after insert on public.bloqueos
  for each row execute function private.bloqueo_corta_amistad();

-- =====================================================================
-- 2. MENSAJES DIRECTOS
-- =====================================================================
create table if not exists public.mensajes_directos (
  id         bigint generated always as identity primary key,
  autor_id   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  para_id    uuid not null references auth.users (id) on delete cascade,
  texto      text not null check (char_length(texto) between 1 and 1000),
  creado_en  timestamptz not null default now(),
  leido_en   timestamptz,
  check (autor_id <> para_id)
);
create index if not exists md_conversacion_idx on public.mensajes_directos (least(autor_id, para_id), greatest(autor_id, para_id), creado_en desc);
create index if not exists md_para_idx on public.mensajes_directos (para_id, leido_en);
alter table public.mensajes_directos enable row level security;
revoke all on public.mensajes_directos from anon, authenticated;
grant select on public.mensajes_directos to authenticated;
grant insert (para_id, texto) on public.mensajes_directos to authenticated;

drop policy if exists "md: mis conversaciones" on public.mensajes_directos;
create policy "md: mis conversaciones" on public.mensajes_directos for select to authenticated
  using ((select auth.uid()) in (autor_id, para_id)
         and not exists (select 1 from public.bloqueos bl where bl.bloqueador = (select auth.uid()) and bl.bloqueado = autor_id));
drop policy if exists "md: escribir a un amigo" on public.mensajes_directos;
create policy "md: escribir a un amigo" on public.mensajes_directos for insert to authenticated
  with check (autor_id = (select auth.uid()) and public.son_amigos(autor_id, para_id));

-- Mismo filtro del chat de parches (enlaces y groserías)
drop trigger if exists filtrar_mensaje on public.mensajes_directos;
create trigger filtrar_mensaje before insert on public.mensajes_directos
  for each row execute function private.filtrar_mensaje();

-- Freno anti-spam: 20 mensajes por minuto
create or replace function private.freno_dm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.mensajes_directos where autor_id = new.autor_id and creado_en > now() - interval '1 minute') >= 20 then
    raise exception 'DEMASIADOS' using errcode = 'P0001', hint = 'Vas muy rápido. Espera un momento.';
  end if;
  if exists (select 1 from public.bloqueos where bloqueador = new.para_id and bloqueado = new.autor_id) then
    raise exception 'NO_SE_PUEDE' using errcode = 'P0001', hint = 'No puedes escribirle a esta persona.';
  end if;
  return new;
end $$;
drop trigger if exists freno_dm on public.mensajes_directos;
create trigger freno_dm before insert on public.mensajes_directos
  for each row execute function private.freno_dm();

-- Aviso push: uno por conversación mientras haya mensajes sin leer (máx. cada 10 min)
create or replace function private.avisar_dm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_marca text := 'dm:' || new.autor_id::text;
begin
  if exists (select 1 from public.notificaciones n where n.usuario_id = new.para_id and n.icono = 'i-chat'
               and n.texto like '%' || '<!--' || v_marca || '-->' and n.creado_en > now() - interval '10 minutes') then
    return new;
  end if;
  insert into public.notificaciones (usuario_id, icono, texto)
  values (new.para_id, 'i-chat', left('<b>' || private.texto_plano(private.nombre_corto(new.autor_id)) || '</b> te escribió: '
          || private.texto_plano(left(new.texto, 90)) || case when char_length(new.texto) > 90 then '…' else '' end, 250)
          || '<!--' || v_marca || '-->');
  return new;
end $$;
drop trigger if exists avisar_dm on public.mensajes_directos;
create trigger avisar_dm after insert on public.mensajes_directos
  for each row execute function private.avisar_dm();

create or replace function public.marcar_leidos_dm(p_de uuid)
returns void language sql security definer set search_path = '' as $$
  update public.mensajes_directos set leido_en = now()
   where para_id = auth.uid() and autor_id = p_de and leido_en is null
$$;
revoke all on function public.marcar_leidos_dm(uuid) from public, anon;
grant execute on function public.marcar_leidos_dm(uuid) to authenticated;

-- =====================================================================
-- 3. TODO LO DE AMIGOS EN UNA LLAMADA
-- =====================================================================
create or replace function public.mis_amigos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_yo uuid := auth.uid();
begin
  if v_yo is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  return jsonb_build_object(
    'amigos', coalesce((
      select jsonb_agg(x order by x.ultimo_en desc nulls last, x.nombre) from (
        select o.id, p.nombre, coalesce(p.verificado, false) verificado,
               (select m.texto from public.mensajes_directos m
                 where least(m.autor_id, m.para_id) = least(v_yo, o.id) and greatest(m.autor_id, m.para_id) = greatest(v_yo, o.id)
                 order by m.creado_en desc limit 1) ultimo,
               (select m.autor_id = v_yo from public.mensajes_directos m
                 where least(m.autor_id, m.para_id) = least(v_yo, o.id) and greatest(m.autor_id, m.para_id) = greatest(v_yo, o.id)
                 order by m.creado_en desc limit 1) ultimo_mio,
               (select max(m.creado_en) from public.mensajes_directos m
                 where least(m.autor_id, m.para_id) = least(v_yo, o.id) and greatest(m.autor_id, m.para_id) = greatest(v_yo, o.id)) ultimo_en,
               (select count(*) from public.mensajes_directos m where m.para_id = v_yo and m.autor_id = o.id and m.leido_en is null) sin_leer
        from public.amistades f
        cross join lateral (select case when f.a = v_yo then f.b else f.a end id) o
        join public.perfiles p on p.id = o.id
        where v_yo in (f.a, f.b) and f.estado = 'aceptada') x), '[]'::jsonb),
    'recibidas', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.solicitante, 'nombre', p.nombre, 'verificado', coalesce(p.verificado, false), 'creado_en', f.creado_en) order by f.creado_en desc)
      from public.amistades f join public.perfiles p on p.id = f.solicitante
      where v_yo in (f.a, f.b) and f.estado = 'pendiente' and f.solicitante <> v_yo), '[]'::jsonb),
    'enviadas', coalesce((
      select jsonb_agg(jsonb_build_object('id', case when f.a = v_yo then f.b else f.a end, 'nombre', p.nombre) order by f.creado_en desc)
      from public.amistades f join public.perfiles p on p.id = case when f.a = v_yo then f.b else f.a end
      where f.solicitante = v_yo and f.estado = 'pendiente'), '[]'::jsonb),
    -- Sugeridos: gente con la que compartiste parches y aún no es tu amiga
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
revoke all on function public.mis_amigos() from public, anon;
grant execute on function public.mis_amigos() to authenticated;

-- Tiempo real: los mensajes llegan sin recargar
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes_directos') then
    alter publication supabase_realtime add table public.mensajes_directos;
  end if;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
