-- =====================================================================
-- Modo Parche · Cuentas de negocio
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Corre después de 20261022230000_dashboard_usuarios.sql. Se puede correr
-- más de una vez sin romper nada.
--
-- Qué hace:
--   1. Tabla negocios: una fila por cuenta de negocio (ligada a auth.users).
--      Cada negocio solo ve y edita su propia fila.
--   2. Al registrarse con tipo = 'empresa' (empresa.html) se crea el negocio
--      con el plan elegido. Ya no hace falta que un administrador lo cree.
--   3. Los parches que publica un negocio quedan marcados como aliados,
--      con el nombre del local, y el plan básico se limita a 2 por mes.
--   4. El nombre del negocio se muestra completo en chats y avisos.
-- =====================================================================

-- =====================================================================
-- 1. TABLA
-- =====================================================================
create table if not exists public.negocios (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre          text not null check (char_length(nombre) between 2 and 80),
  responsable     text not null default '' check (char_length(responsable) <= 80),
  nit             text not null default '' check (char_length(nit) <= 20),
  tipo            text not null default 'Café o restaurante' check (char_length(tipo) <= 40),
  categoria       text not null default 'comida' check (categoria in ('rumba', 'comida', 'chill', 'pueblear', 'rio', 'deportes', 'conciertos', 'pet', 'cultura', 'gaming')),
  plan            text not null default 'basico' check (plan in ('basico', 'villavo', 'sedes')),
  sedes           integer not null default 1 check (sedes between 1 and 50),
  telefono        text not null default '' check (telefono = '' or telefono ~ '^[0-9]{7,15}$'),
  ciudad          text not null default 'Villavicencio' check (ciudad in ('Villavicencio', 'Acacías', 'Restrepo')),
  direccion       text not null default '' check (char_length(direccion) <= 120),
  barrio          text not null default '' check (char_length(barrio) <= 40),
  descripcion     text not null default '' check (char_length(descripcion) <= 300),
  lat             double precision check (lat is null or lat between -90 and 90),
  lng             double precision check (lng is null or lng between -180 and 180),
  logo            text not null default '' check (char_length(logo) <= 600),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

drop trigger if exists negocios_tocar on public.negocios;
create trigger negocios_tocar before update on public.negocios
  for each row execute function private.tocar_actualizado();

-- =====================================================================
-- 2. REGISTRO: perfil de persona o negocio según el formulario
-- =====================================================================
create or replace function private.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_ciudad text := m ->> 'ciudad';
  v_cedula text := regexp_replace(coalesce(m ->> 'cedula', ''), '\D', '', 'g');
  v_tel    text := regexp_replace(coalesce(m ->> 'telefono', ''), '\D', '', 'g');
  v_fecha  date;
  v_intereses text[];
  v_nombre text;
  v_plan   text := m ->> 'plan';
  v_cat    text := m ->> 'categoria';
  v_sedes  int;
begin
  if v_ciudad not in ('Villavicencio', 'Acacías', 'Restrepo') or v_ciudad is null then
    v_ciudad := 'Villavicencio';
  end if;

  -- Cuenta de negocio (empresa.html)
  if m ->> 'tipo' = 'empresa' then
    v_nombre := left(coalesce(nullif(trim(m ->> 'negocio'), ''), split_part(new.email, '@', 1), 'Mi negocio'), 80);
    if v_plan not in ('basico', 'villavo', 'sedes') or v_plan is null then v_plan := 'basico'; end if;
    if v_cat not in ('rumba', 'comida', 'chill', 'pueblear', 'rio', 'deportes', 'conciertos', 'pet', 'cultura', 'gaming') or v_cat is null then v_cat := 'comida'; end if;
    begin
      v_sedes := greatest(1, least(50, coalesce(nullif(m ->> 'sedes', '')::int, 1)));
    exception when others then
      v_sedes := 1;
    end;

    insert into public.negocios (id, nombre, responsable, nit, tipo, categoria, plan, sedes, telefono, ciudad, direccion, barrio, descripcion, lat, lng)
    values (
      new.id, v_nombre,
      left(coalesce(trim(m ->> 'responsable'), ''), 80),
      left(regexp_replace(coalesce(m ->> 'nit', ''), '[^0-9.-]', '', 'g'), 20),
      left(coalesce(nullif(trim(m ->> 'tipo_negocio'), ''), 'Café o restaurante'), 40),
      v_cat, v_plan, v_sedes,
      case when v_tel ~ '^[0-9]{7,15}$' then v_tel else '' end,
      v_ciudad,
      left(coalesce(trim(m ->> 'direccion'), ''), 120),
      left(coalesce(trim(m ->> 'barrio'), ''), 40),
      left(coalesce(trim(m ->> 'descripcion'), ''), 300),
      case when (m ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (m ->> 'lat')::double precision end,
      case when (m ->> 'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then (m ->> 'lng')::double precision end
    )
    on conflict (id) do nothing;

    -- Perfil público mínimo: así su nombre aparece en chats y listas
    insert into public.perfiles (id, nombre, ciudad)
    values (new.id, v_nombre, v_ciudad)
    on conflict (id) do nothing;
    return new;
  end if;

  -- Cuenta de persona (login.html)
  begin
    v_fecha := nullif(m ->> 'fecha_nacimiento', '')::date;
  exception when others then
    v_fecha := null;
  end;
  select coalesce(array_agg(x), '{}') into v_intereses
  from jsonb_array_elements_text(case when jsonb_typeof(m -> 'intereses') = 'array' then m -> 'intereses' else '[]'::jsonb end) x
  where x in ('rumba', 'comida', 'chill', 'pueblear', 'rio', 'deportes', 'conciertos', 'pet', 'cultura', 'gaming');

  insert into public.perfiles (id, nombre, ciudad, intereses)
  values (new.id, left(coalesce(nullif(trim(m ->> 'nombre'), ''), split_part(new.email, '@', 1), 'Parcero'), 80), v_ciudad, v_intereses)
  on conflict (id) do nothing;

  insert into public.perfiles_privados (id, cedula, telefono, fecha_nacimiento, instagram)
  values (
    new.id,
    case when v_cedula ~ '^[0-9]{5,15}$' then v_cedula end,
    case when v_tel ~ '^[0-9]{7,15}$' then v_tel end,
    v_fecha,
    left(nullif(trim(m ->> 'instagram'), ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Nombre corto: los negocios se muestran con su nombre completo
create or replace function private.nombre_corto(uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select n.nombre from public.negocios n where n.id = uid),
    (select case when split_part(p.nombre, ' ', 2) = '' then p.nombre
                 else split_part(p.nombre, ' ', 1) || ' ' || left(split_part(p.nombre, ' ', 2), 1) || '.' end
     from public.perfiles p where p.id = uid),
    'Un parcero')
$$;

-- =====================================================================
-- 3. PARCHES DE NEGOCIOS: sello de aliado y límite del plan básico
-- =====================================================================
create or replace function private.parche_de_negocio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n public.negocios%rowtype;
  v_mes int;
begin
  select * into n from public.negocios where id = new.creador_id;
  if not found then
    new.aliado := false;            -- una persona nunca se marca como aliado
    return new;
  end if;

  if tg_op = 'INSERT' and n.plan = 'basico' then
    select count(*) into v_mes from public.parches
    where creador_id = n.id and creado_en >= date_trunc('month', now());
    if v_mes >= 2 then
      raise exception 'LIMITE_PLAN' using errcode = 'P0001',
        hint = 'El plan Parche básico incluye 2 parches al mes. Pásate a Parche Villavo para publicar sin límite.';
    end if;
  end if;

  new.aliado := true;
  new.creador_nombre := n.nombre;
  return new;
end $$;

drop trigger if exists parches_de_negocio on public.parches;
create trigger parches_de_negocio before insert or update on public.parches
  for each row when (new.creador_id is not null)
  execute function private.parche_de_negocio();

-- Los negocios también pueden publicar promo en su parche
grant insert (promo, relampago) on public.parches to authenticated;
grant update (promo, relampago) on public.parches to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

-- =====================================================================
-- 4. RLS: cada negocio solo ve y edita lo suyo
-- =====================================================================
alter table public.negocios enable row level security;
revoke all on public.negocios from anon, authenticated;

grant select on public.negocios to authenticated;
grant update (nombre, responsable, tipo, categoria, plan, sedes, telefono, direccion, barrio, descripcion, lat, lng, logo)
  on public.negocios to authenticated;

drop policy if exists "negocios: ver el propio" on public.negocios;
create policy "negocios: ver el propio" on public.negocios for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "negocios: editar el propio" on public.negocios;
create policy "negocios: editar el propio" on public.negocios for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
