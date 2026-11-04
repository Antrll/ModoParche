-- =====================================================================
-- ModoParche · Cumplimiento legal
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Corre después de 20261030120000_admin_v2.sql. Se puede correr más de
-- una vez sin romper nada.
--
-- Qué hace:
--   1. Consentimientos: guarda la prueba de que cada cuenta aceptó los
--      términos y autorizó el tratamiento de datos (Ley 1581 de 2012),
--      con la versión del documento y la fecha.
--   2. Baja de anuncios: perfiles.recibe_anuncios. Solo quien lo aceptó
--      recibe anuncios, y cada quien lo apaga desde su perfil.
--   3. Edad mínima: el servidor rechaza registros de menores de 18.
--   4. Derechos del titular: "Descargar mis datos" (mis_datos) y
--      "Borrar mi cuenta" (borrar_mi_cuenta).
-- =====================================================================

-- =====================================================================
-- 1. CONSENTIMIENTOS
-- =====================================================================
create table if not exists public.consentimientos (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  tipo        text not null check (tipo in ('terminos', 'datos', 'anuncios')),
  version     text not null default '1.0' check (char_length(version) <= 20),
  aceptado    boolean not null,
  origen      text not null default 'registro' check (origen in ('registro', 'perfil', 'sistema')),
  creado_en   timestamptz not null default now()
);
create index if not exists consentimientos_usuario_idx on public.consentimientos (usuario_id, creado_en desc);

alter table public.consentimientos enable row level security;
revoke all on public.consentimientos from anon, authenticated;
grant select on public.consentimientos to authenticated;
drop policy if exists "consentimientos: ver los propios o si soy equipo" on public.consentimientos;
create policy "consentimientos: ver los propios o si soy equipo" on public.consentimientos for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.soy_admin()));

-- =====================================================================
-- 2. BAJA DE ANUNCIOS
-- =====================================================================
alter table public.perfiles add column if not exists recibe_anuncios boolean not null default false;
grant update (recibe_anuncios) on public.perfiles to authenticated;

-- Cambiar la preferencia desde el perfil deja constancia
create or replace function public.cambiar_anuncios(p_recibir boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  update public.perfiles set recibe_anuncios = coalesce(p_recibir, false) where id = auth.uid();
  insert into public.consentimientos (usuario_id, tipo, version, aceptado, origen)
  values (auth.uid(), 'anuncios', '1.0', coalesce(p_recibir, false), 'perfil');
end $$;

-- Los anuncios del admin solo llegan a quien los aceptó
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
  join public.perfiles p on p.id = u.id
  left join public.negocios n on n.id = u.id
  where p.recibe_anuncios
    and not exists (select 1 from public.admins a where a.id = u.id)
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

-- Al registrarse: guarda los consentimientos y la preferencia de anuncios
create or replace function private.legal_al_registrarse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if m ->> 'tipo' = 'admin' then return new; end if;
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

drop trigger if exists zz_legal_al_registrarse on auth.users;
create trigger zz_legal_al_registrarse after insert on auth.users
  for each row execute function private.legal_al_registrarse();

-- =====================================================================
-- 3. SOLO MAYORES DE 18
-- =====================================================================
create or replace function private.validar_edad()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_fecha date;
begin
  if coalesce(m ->> 'tipo', 'persona') in ('empresa', 'admin') then return new; end if;
  begin
    v_fecha := nullif(m ->> 'fecha_nacimiento', '')::date;
  exception when others then
    v_fecha := null;
  end;
  if v_fecha is not null and v_fecha > (current_date - interval '18 years')::date then
    raise exception 'MENOR_DE_EDAD' using errcode = 'P0001', hint = 'ModoParche es solo para mayores de 18 años.';
  end if;
  return new;
end $$;

drop trigger if exists validar_edad on auth.users;
create trigger validar_edad before insert on auth.users
  for each row execute function private.validar_edad();

-- =====================================================================
-- 4. DERECHOS DEL TITULAR
-- =====================================================================
-- Descargar mis datos: todo lo que hay de la cuenta, en un solo archivo
create or replace function public.mis_datos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generado', now(),
    'cuenta', (select jsonb_build_object('id', u.id, 'correo', u.email, 'creada', u.created_at, 'ultimo_ingreso', u.last_sign_in_at) from auth.users u where u.id = v_uid),
    'perfil', (select to_jsonb(p) from public.perfiles p where p.id = v_uid),
    'datos_privados', (select to_jsonb(pp) from public.perfiles_privados pp where pp.id = v_uid),
    'negocio', (select to_jsonb(n) from public.negocios n where n.id = v_uid),
    'parches_creados', coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en) from public.parches x where x.creador_id = v_uid), '[]'::jsonb),
    'parches_unidos', coalesce((select jsonb_agg(jsonb_build_object('parche', p.titulo, 'inicio', p.inicio, 'llegaste', m.checkin, 'te_uniste', m.creado_en) order by m.creado_en)
                                 from public.parche_miembros m join public.parches p on p.id = m.parche_id where m.usuario_id = v_uid), '[]'::jsonb),
    'mensajes', coalesce((select jsonb_agg(jsonb_build_object('parche', p.titulo, 'texto', m.texto, 'fecha', m.creado_en) order by m.creado_en)
                           from public.mensajes m join public.parches p on p.id = m.parche_id where m.autor_id = v_uid), '[]'::jsonb),
    'calificaciones_que_diste', coalesce((select jsonb_agg(jsonb_build_object('parche_id', c.parche_id, 'estrellas', c.estrellas, 'volverias', c.volver, 'fecha', c.creado_en)) from public.calificaciones c where c.autor_id = v_uid), '[]'::jsonb),
    'reportes_que_hiciste', coalesce((select jsonb_agg(jsonb_build_object('tipo', r.tipo, 'motivo', r.motivo, 'detalle', r.detalle, 'estado', r.estado, 'fecha', r.creado_en)) from public.reportes r where r.autor_id = v_uid), '[]'::jsonb),
    'notificaciones', coalesce((select jsonb_agg(jsonb_build_object('texto', n.texto, 'fecha', n.creado_en) order by n.creado_en desc) from public.notificaciones n where n.usuario_id = v_uid), '[]'::jsonb),
    'consentimientos', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'version', c.version, 'aceptado', c.aceptado, 'origen', c.origen, 'fecha', c.creado_en) order by c.creado_en) from public.consentimientos c where c.usuario_id = v_uid), '[]'::jsonb)
  );
end $$;

-- Borrar mi cuenta: borra la cuenta y todo lo que cuelga de ella.
-- Las fotos se borran antes desde la app (Storage no deja borrarlas por SQL).
create or replace function public.borrar_mi_cuenta()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where id = v_uid) then
    raise exception 'ES_ADMIN' using errcode = 'P0001', hint = 'Las cuentas del equipo se borran desde la base de datos.';
  end if;
  -- Los reportes graves se conservan sin el nombre de quien borra la cuenta (on delete set null)
  delete from auth.users where id = v_uid;
end $$;

-- El panel admin muestra a cuántas cuentas les llega un anuncio
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
      'recibe_anuncios', coalesce(p.recibe_anuncios, false),
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

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.cambiar_anuncios(boolean), public.mis_datos(), public.borrar_mi_cuenta() from public, anon;
grant execute on function public.cambiar_anuncios(boolean), public.mis_datos(), public.borrar_mi_cuenta() to authenticated;
