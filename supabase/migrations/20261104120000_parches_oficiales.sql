-- =====================================================================
-- ModoParche · Parches oficiales (noviembre 2026)
-- Cada mes el equipo de ModoParche arma al menos un parche grande,
-- aprovechando conciertos y festivales de la ciudad. Sale arriba en el
-- inicio, más grande que los demás, con botones a la boletería oficial
-- (entrada y palco). ModoParche no cobra ni recibe dinero de las boletas.
--
-- 1. Columnas oficial y oficial_info en parches
-- 2. Cupos: hasta 60 en parches normales, hasta 20.000 en oficiales
-- 3. admin_guardar_oficial(): crear o editar un oficial (solo admins)
-- 4. Primer oficial: Andrés Cepeda, sábado 28 de noviembre, 7:00 p. m.
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLUMNAS
--    Ninguna cuenta puede marcar su parche como oficial: estas columnas
--    no están en los permisos de insert/update de la app.
-- ---------------------------------------------------------------------
alter table public.parches add column if not exists oficial boolean not null default false;
alter table public.parches add column if not exists oficial_info jsonb;
create index if not exists parches_oficial_idx on public.parches (inicio) where oficial;

-- ---------------------------------------------------------------------
-- 2. CUPOS
-- ---------------------------------------------------------------------
alter table public.parches drop constraint if exists parches_cupos_max_check;
alter table public.parches add constraint parches_cupos_max_check
  check (cupos_max >= 2 and cupos_max <= case when oficial then 20000 else 60 end);

-- ---------------------------------------------------------------------
-- 3. CREAR O EDITAR UN PARCHE OFICIAL (solo admins)
--    p_parche null = crear. p_datos: titulo, descripcion, inicio, lugar,
--    barrio, lat, lng, cupos_max, categoria e info { artista, mes,
--    entrada_precio, entrada_url, palco_precio, palco_url, palco_personas }.
--    Los enlaces deben empezar por https://.
-- ---------------------------------------------------------------------
create or replace function private.limpiar_url(u text)
returns text language sql immutable set search_path = '' as $$
  select case when trim(coalesce(u, '')) ~* '^https://[^\s<>"]{4,490}$' then trim(u) end
$$;

create or replace function public.admin_guardar_oficial(p_parche uuid, p_datos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_parche;
  v_info jsonb := coalesce(p_datos -> 'info', '{}'::jsonb);
  v_titulo text := trim(coalesce(p_datos ->> 'titulo', ''));
  v_cupos int := coalesce((p_datos ->> 'cupos_max')::int, 500);
  v_miembros int := 0;
  v_info_ok jsonb;
begin
  perform private.exigir_admin();
  if char_length(v_titulo) not between 5 and 60 then
    raise exception 'TITULO' using errcode = 'P0001', hint = 'El título debe tener entre 5 y 60 letras.';
  end if;
  if v_cupos not between 2 and 20000 then
    raise exception 'CUPOS' using errcode = 'P0001', hint = 'Los cupos van de 2 a 20.000.';
  end if;
  if (coalesce(v_info ->> 'entrada_url', '') <> '' and private.limpiar_url(v_info ->> 'entrada_url') is null)
     or (coalesce(v_info ->> 'palco_url', '') <> '' and private.limpiar_url(v_info ->> 'palco_url') is null) then
    raise exception 'URL' using errcode = 'P0001', hint = 'Los enlaces de compra deben empezar por https://';
  end if;

  v_info_ok := jsonb_strip_nulls(jsonb_build_object(
    'artista', left(nullif(trim(v_info ->> 'artista'), ''), 60),
    'mes', left(nullif(trim(v_info ->> 'mes'), ''), 20),
    'entrada_precio', nullif((v_info ->> 'entrada_precio'), '')::int,
    'entrada_url', private.limpiar_url(v_info ->> 'entrada_url'),
    'palco_precio', nullif((v_info ->> 'palco_precio'), '')::int,
    'palco_url', private.limpiar_url(v_info ->> 'palco_url'),
    'palco_personas', nullif((v_info ->> 'palco_personas'), '')::int
  ));

  if v_id is null then
    insert into public.parches (creador_id, creador_nombre, oficial, oficial_info, titulo, categoria, descripcion,
      inicio, lugar, barrio, lat, lng, costo, presupuesto, cupos_max)
    values (null, 'Equipo ModoParche', true, v_info_ok, v_titulo,
      coalesce(nullif(p_datos ->> 'categoria', ''), 'conciertos'),
      left(coalesce(p_datos ->> 'descripcion', ''), 400),
      (p_datos ->> 'inicio')::timestamptz,
      coalesce(nullif(trim(p_datos ->> 'lugar'), ''), 'Por confirmar'),
      left(coalesce(p_datos ->> 'barrio', ''), 40),
      coalesce((p_datos ->> 'lat')::float8, 4.1420), coalesce((p_datos ->> 'lng')::float8, -73.6266),
      0, 0, v_cupos)
    returning id into v_id;
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (v_id, null, 'sys', 'El equipo de ModoParche abrió este parche oficial. Aquí armamos la llegada, la vaca y la previa.');
    perform private.registrar('parche_oficial', v_titulo, 'creado');
    return v_id;
  end if;

  if not exists (select 1 from public.parches where id = v_id and oficial) then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese parche oficial ya no existe.';
  end if;
  select count(*) into v_miembros from public.parche_miembros where parche_id = v_id;
  if v_cupos < v_miembros then
    raise exception 'CUPOS' using errcode = 'P0001', hint = 'Ya hay ' || v_miembros || ' personas dentro: los cupos no pueden ser menos.';
  end if;

  perform set_config('mp.edicion_admin', '1', true);
  update public.parches set
    titulo = v_titulo,
    oficial_info = v_info_ok,
    categoria = coalesce(nullif(p_datos ->> 'categoria', ''), categoria),
    descripcion = coalesce(left(p_datos ->> 'descripcion', 400), descripcion),
    inicio = coalesce((p_datos ->> 'inicio')::timestamptz, inicio),
    lugar = coalesce(nullif(trim(p_datos ->> 'lugar'), ''), lugar),
    barrio = coalesce(left(p_datos ->> 'barrio', 40), barrio),
    lat = coalesce((p_datos ->> 'lat')::float8, lat),
    lng = coalesce((p_datos ->> 'lng')::float8, lng),
    cupos_max = v_cupos
  where id = v_id;
  perform set_config('mp.edicion_admin', '0', true);
  perform private.registrar('parche_oficial', v_titulo, 'editado');
  return v_id;
end $$;

revoke all on function private.limpiar_url(text) from public, anon, authenticated;
revoke all on function public.admin_guardar_oficial(uuid, jsonb) from public, anon;
grant execute on function public.admin_guardar_oficial(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4. PRIMER PARCHE OFICIAL: ANDRÉS CEPEDA
--    Lugar, precios y enlaces "por confirmar": los llena un admin desde
--    el panel (Parches > Oficiales > Editar).
-- ---------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  if not exists (select 1 from public.parches where oficial and titulo = 'Andrés Cepeda en Villavo') then
    insert into public.parches (creador_id, creador_nombre, oficial, oficial_info, titulo, categoria, descripcion,
      inicio, lugar, barrio, lat, lng, costo, presupuesto, cupos_max)
    values (null, 'Equipo ModoParche', true,
      '{"artista": "Andrés Cepeda", "mes": "Noviembre"}'::jsonb,
      'Andrés Cepeda en Villavo', 'conciertos',
      'El parche oficial de noviembre. Vamos en combo a cantar con Andrés Cepeda: en el chat armamos la previa, la llegada y la vaca para el transporte. Compra tu entrada o tu palco en la boletería oficial y cáele al parche.',
      '2026-11-28 19:00:00-05', 'Por confirmar', 'Villavicencio', 4.1420, -73.6266, 0, 0, 1000)
    returning id into v_id;
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (v_id, null, 'sys', 'El equipo de ModoParche abrió este parche oficial. Aquí armamos la llegada, la vaca y la previa.');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. ELIMINAR PARCHE: avisar a quienes iban
--    Cuando el anfitrión borra su parche, cada persona que se había
--    unido recibe una notificación (los oficiales solo los retira un admin).
-- ---------------------------------------------------------------------
create or replace function private.avisar_parche_eliminado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notificaciones (usuario_id, icono, texto, parche_id)
  select m.usuario_id, 'i-trash',
         left('<b>' || replace(replace(old.titulo, '<', '&lt;'), '>', '&gt;') || '</b> fue eliminado por quien lo organizaba.', 300), null
  from public.parche_miembros m
  where m.parche_id = old.id and m.usuario_id is distinct from old.creador_id;
  return old;
end $$;
revoke all on function private.avisar_parche_eliminado() from public, anon, authenticated;

drop trigger if exists parches_al_eliminar on public.parches;
create trigger parches_al_eliminar before delete on public.parches
  for each row when (not old.demo)
  execute function private.avisar_parche_eliminado();
