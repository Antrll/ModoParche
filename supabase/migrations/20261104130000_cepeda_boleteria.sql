-- =====================================================================
-- ModoParche · Andrés Cepeda: datos de la boletería oficial
-- Corre después de 20261104120000_parches_oficiales.sql.
-- Fuente: La Tiquetera (https://latiquetera.com/event/andres-cepeda-en-villavicencio).
--   Coliseo Las Malocas · sábado 28 de noviembre de 2026
--   Puertas 7:00 p. m. · Andrés Cepeda 10:00 p. m. · desde 14 años
--   General $100.000 · VIP $160.000 · Platino menores $255.000
--   Palcos para 10 personas: de $3.100.000 a $4.200.000
-- Los precios los fija la boletería; si cambian, se editan en el panel
-- admin (Parches > Oficiales > Editar).
-- Se puede correr más de una vez.
-- =====================================================================

-- La función del admin ahora guarda también localidades, rango de palcos,
-- horario, edad mínima y nombre de la boletería.
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
    'palco_personas', nullif((v_info ->> 'palco_personas'), '')::int,
    'palco_hasta', nullif((v_info ->> 'palco_hasta'), '')::int,
    'horario', left(nullif(trim(v_info ->> 'horario'), ''), 80),
    'edad_minima', nullif((v_info ->> 'edad_minima'), '')::int,
    'boleteria', left(nullif(trim(v_info ->> 'boleteria'), ''), 40),
    'localidades', (
      select nullif(jsonb_agg(jsonb_build_object('nombre', left(trim(l ->> 'nombre'), 40), 'precio', (l ->> 'precio')::int)), '[]'::jsonb)
      from (select l from jsonb_array_elements(case when jsonb_typeof(v_info -> 'localidades') = 'array' then v_info -> 'localidades' else '[]'::jsonb end) l
            where trim(coalesce(l ->> 'nombre', '')) <> '' and (l ->> 'precio') ~ '^[0-9]{1,9}$' limit 12) x
    )
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

revoke all on function public.admin_guardar_oficial(uuid, jsonb) from public, anon;
grant execute on function public.admin_guardar_oficial(uuid, jsonb) to authenticated;

-- Datos reales del parche oficial de noviembre
-- (punto del Parque Las Malocas en OpenStreetMap, donde queda el coliseo)
update public.parches set
  lugar = 'Coliseo Las Malocas',
  barrio = 'Parque Las Malocas',
  lat = 4.12287, lng = -73.574447,
  inicio = '2026-11-28 19:00:00-05',
  oficial_info = jsonb_build_object(
    'artista', 'Andrés Cepeda', 'mes', 'Noviembre', 'boleteria', 'La Tiquetera',
    'horario', 'Puertas 7:00 p. m. · Andrés Cepeda 10:00 p. m.', 'edad_minima', 14,
    'localidades', '[{"nombre": "General", "precio": 100000}, {"nombre": "VIP", "precio": 160000}, {"nombre": "Platino menores", "precio": 255000}]'::jsonb,
    'entrada_precio', 100000, 'entrada_url', 'https://latiquetera.com/event/andres-cepeda-en-villavicencio',
    'palco_precio', 3100000, 'palco_hasta', 4200000, 'palco_personas', 10, 'palco_url', 'https://latiquetera.com/event/andres-cepeda-en-villavicencio'
  )
where oficial and titulo = 'Andrés Cepeda en Villavo';
