-- =====================================================================
-- ModoParche · Calificar al escanear el QR de identidad
-- Corre después de 20261104150000_seguridad_y_comunidad.sql.
--
-- Al escanear el QR de otra persona se puede calificar de 1 a 5
-- estrellas. Escanear prueba que se vieron en persona, así que no hace
-- falta el check-in. Reglas:
--   - Deben compartir un parche que ya empezó (o empieza en menos de
--     2 horas) y que no tenga más de 7 días.
--   - La calificación se puede cambiar dentro de los 30 minutos
--     siguientes al escaneo (vuelve a contar en el promedio).
--   - Nadie se califica a sí mismo.
-- Se puede correr más de una vez.
-- =====================================================================

-- Registro de escaneos: permite calificar después de leer el QR,
-- aunque el código ya haya cambiado
create table if not exists public.qr_escaneos (
  id            bigint generated always as identity primary key,
  escaneador_id uuid not null references auth.users (id) on delete cascade,
  escaneado_id  uuid not null references auth.users (id) on delete cascade,
  creado_en     timestamptz not null default now()
);
create index if not exists qr_escaneos_idx on public.qr_escaneos (escaneador_id, creado_en desc);
alter table public.qr_escaneos enable row level security;  -- solo por las funciones

-- El parche más reciente que comparten (para calificar)
create or replace function private.parche_compartido(p_a uuid, p_b uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id
  from public.parches p
  join public.parche_miembros a on a.parche_id = p.id and a.usuario_id = p_a
  join public.parche_miembros b on b.parche_id = p.id and b.usuario_id = p_b
  where p.inicio <= now() + interval '2 hours' and p.inicio > now() - interval '7 days'
  order by p.inicio desc
  limit 1
$$;
revoke all on function private.parche_compartido(uuid, uuid) from public, anon, authenticated;

-- Verificar el QR ahora también deja registro del escaneo y dice si se
-- puede calificar (y con qué parche)
drop function if exists public.verificar_qr_identidad(text);
create or replace function public.verificar_qr_identidad(p_codigo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid; r jsonb; v_escaneo bigint; v_parche uuid; v_titulo text; v_mia int;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  select usuario_id into v_uid from public.qr_identidad where codigo = lower(trim(p_codigo)) and vence > now();
  if v_uid is null then
    raise exception 'QR_VENCIDO' using errcode = 'P0001', hint = 'Ese QR ya venció o no es de ModoParche. Pide que lo vuelva a mostrar.';
  end if;

  if v_uid <> auth.uid() then
    insert into public.qr_escaneos (escaneador_id, escaneado_id) values (auth.uid(), v_uid) returning id into v_escaneo;
    v_parche := private.parche_compartido(auth.uid(), v_uid);
    if v_parche is not null then
      select titulo into v_titulo from public.parches where id = v_parche;
      select estrellas into v_mia from public.calificaciones where parche_id = v_parche and autor_id = auth.uid() and calificado_id = v_uid;
    end if;
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

  return r || jsonb_build_object(
    'escaneo', v_escaneo,
    'es_yo', v_uid = auth.uid(),
    'calificar', case when v_parche is not null then jsonb_build_object('parche', v_titulo, 'estrellas', v_mia) end
  );
end $$;
revoke all on function public.verificar_qr_identidad(text) from public, anon;
grant execute on function public.verificar_qr_identidad(text) to authenticated;

-- La validación de calificaciones acepta las que vienen de un escaneo
-- (parche que empieza en menos de 2 horas)
create or replace function private.validar_calificacion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inicio timestamptz; v_qr boolean := current_setting('mp.calif_qr', true) = '1';
begin
  select inicio into v_inicio from public.parches where id = new.parche_id;
  if v_inicio is null or v_inicio < now() - interval '7 days'
     or v_inicio > now() + case when v_qr then interval '2 hours' else interval '0' end then
    raise exception 'FUERA_DE_TIEMPO' using errcode = 'P0001', hint = 'Se califica desde que empieza el parche y hasta 7 días después.';
  end if;
  if not exists (select 1 from public.parche_miembros m where m.parche_id = new.parche_id and m.usuario_id = new.calificado_id) then
    raise exception 'NO_ESTABA' using errcode = 'P0001', hint = 'Esa persona no estaba en este parche.';
  end if;
  return new;
end $$;

-- Al cambiar una calificación, el promedio se recalcula
drop trigger if exists calificaciones_al_cambiar on public.calificaciones;
create trigger calificaciones_al_cambiar after update of estrellas on public.calificaciones
  for each row execute function private.tras_calificar();

create or replace function public.calificar_por_qr(p_escaneo bigint, p_estrellas int, p_volver boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.qr_escaneos%rowtype; v_parche uuid;
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  if p_estrellas not between 1 and 5 then raise exception 'ESTRELLAS' using errcode = 'P0001', hint = 'De 1 a 5 estrellas.'; end if;
  select * into e from public.qr_escaneos where id = p_escaneo and escaneador_id = auth.uid();
  if e.id is null or e.creado_en < now() - interval '30 minutes' then
    raise exception 'ESCANEO_VENCIDO' using errcode = 'P0001', hint = 'Vuelve a escanear su QR para calificar.';
  end if;
  v_parche := private.parche_compartido(auth.uid(), e.escaneado_id);
  if v_parche is null then
    raise exception 'SIN_PARCHE' using errcode = 'P0001', hint = 'Solo puedes calificar a alguien con quien compartes un parche.';
  end if;
  perform set_config('mp.calif_qr', '1', true);
  insert into public.calificaciones (parche_id, autor_id, calificado_id, estrellas, volver)
  values (v_parche, auth.uid(), e.escaneado_id, p_estrellas, coalesce(p_volver, false))
  on conflict (parche_id, autor_id, calificado_id) do update set estrellas = excluded.estrellas, volver = excluded.volver;
  perform set_config('mp.calif_qr', '0', true);
  return jsonb_build_object('ok', true, 'parche_id', v_parche);
end $$;
revoke all on function public.calificar_por_qr(bigint, int, boolean) from public, anon;
grant execute on function public.calificar_por_qr(bigint, int, boolean) to authenticated;
