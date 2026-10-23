-- =====================================================================
-- Modo Parche · Dashboard de usuarios con Supabase Auth
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Se puede correr más de una vez sin romper nada.
--
-- Qué hace:
--   0. Aparta las tablas del prototipo (parches, parche_miembros, usuarios,
--      intereses_usuario) renombrándolas a legacy_* y les quita el acceso
--      público. La tabla usuarios guardaba contraseñas en texto plano y era
--      legible con la llave pública. No se borra ningún dato.
--   1. Crea perfiles, parches, miembros, chat, rutas, notificaciones,
--      calificaciones y parceros frecuentes, todo ligado a auth.users.
--   2. Activa RLS en todas las tablas con permisos por dueño.
--   3. Triggers del servidor: perfil al registrarse, cupos, mensajes del
--      sistema, bot rompehielos al 50 %, cupón al 100 %, Plan B y reputación.
--   4. Bucket "fotos" para foto de perfil y portadas.
--   5. Tiempo real para parches, miembros, chat, rutas y notificaciones.
--   6. Parches de ejemplo en Villavicencio que se renuevan solos (pg_cron).
--
-- Las tablas ciudades, categorias y comercios no se tocan.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- =====================================================================
-- 0. APARTAR TABLAS DEL PROTOTIPO
-- =====================================================================
do $$
declare
  t text;
  marca text;
  ix record;
begin
  -- tabla vieja -> columna que solo tiene la versión nueva
  for t, marca in
    select * from (values
      ('parches', 'cupos_max'),
      ('parche_miembros', 'checkin'),
      ('usuarios', null),
      ('intereses_usuario', null)
    ) v(tabla, col)
  loop
    if to_regclass('public.' || t) is not null
       and (marca is null or not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = marca))
       and to_regclass('public.legacy_' || t) is null
    then
      -- los índices también tienen nombre global: se renombran para liberar el nombre
      for ix in select indexname from pg_indexes where schemaname = 'public' and tablename = t loop
        execute format('alter index public.%I rename to %I', ix.indexname, left('legacy_' || ix.indexname, 63));
      end loop;
      execute format('alter table public.%I rename to %I', t, 'legacy_' || t);
      raise notice 'Tabla % renombrada a legacy_%', t, t;
    end if;
  end loop;

  -- Cerrar el acceso público a lo viejo
  foreach t in array array['legacy_parches', 'legacy_parche_miembros', 'legacy_usuarios', 'legacy_intereses_usuario'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- 1. TABLAS
-- =====================================================================

-- Datos públicos del perfil (los ven otros usuarios en avatares y tarjetas)
create table if not exists public.perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre          text not null default 'Parcero' check (char_length(nombre) between 1 and 80),
  ciudad          text not null default 'Villavicencio' check (ciudad in ('Villavicencio', 'Acacías', 'Restrepo')),
  barrio          text not null default '' check (char_length(barrio) <= 40),
  mostrar_foto_real boolean not null default false,
  foto_encuadre   jsonb not null default '{"src": "", "zoom": 1, "x": 0, "y": 0}'::jsonb,
  avatar_config   jsonb not null default '{"piel": 1, "pelo": "gorra", "gafas": "sol", "ropa": "hoodie", "fondo": "negro"}'::jsonb,
  intereses       text[] not null default '{}',
  rating          numeric(2, 1) not null default 5.0,
  resenas         integer not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Datos privados (solo los ve su dueño)
create table if not exists public.perfiles_privados (
  id               uuid primary key references auth.users (id) on delete cascade,
  cedula           text unique check (cedula ~ '^[0-9]{5,15}$'),
  telefono         text check (telefono is null or telefono ~ '^[0-9]{7,15}$'),
  fecha_nacimiento date,
  instagram        text check (instagram is null or char_length(instagram) <= 40),
  actualizado_en   timestamptz not null default now()
);

create table if not exists public.parches (
  id                 uuid primary key default gen_random_uuid(),
  creador_id         uuid references auth.users (id) on delete cascade default auth.uid(),
  creador_nombre     text,                       -- para locales aliados y parches de ejemplo
  creador_rating     numeric(2, 1),
  aliado             boolean not null default false,
  demo               boolean not null default false,
  demo_regla         jsonb,                      -- cómo se renueva un parche de ejemplo
  confirmados_demo   text[] not null default '{}',
  titulo             text not null check (char_length(titulo) between 5 and 60),
  categoria          text not null check (categoria in ('rumba', 'comida', 'chill', 'pueblear', 'rio', 'deportes', 'conciertos', 'pet', 'cultura', 'gaming')),
  descripcion        text not null default '' check (char_length(descripcion) <= 400),
  inicio             timestamptz not null,
  lugar              text not null check (char_length(lugar) between 3 and 80),
  barrio             text not null default '' check (char_length(barrio) <= 40),
  lat                double precision not null check (lat between -90 and 90),
  lng                double precision not null check (lng between -180 and 180),
  costo              integer not null default 0 check (costo >= 0),
  presupuesto        integer not null default 0 check (presupuesto >= 0),
  cupos_max          integer not null check (cupos_max between 2 and 60),
  imagen             text not null default '' check (char_length(imagen) <= 600),
  plan_b             text not null default '' check (char_length(plan_b) <= 80),
  plan_b_activo      boolean not null default false,
  relampago          boolean not null default false,
  promo              text,
  cupon              jsonb,
  clima              jsonb,
  bot_enviado        boolean not null default false,
  cupon_desbloqueado boolean not null default false,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  constraint parches_presupuesto_cubre_costo check (presupuesto >= costo)
);
create index if not exists parches_inicio_idx on public.parches (inicio);
create index if not exists parches_creador_idx on public.parches (creador_id);

create table if not exists public.parche_miembros (
  parche_id   uuid not null references public.parches (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  checkin     boolean not null default false,
  calificado  boolean not null default false,
  creado_en   timestamptz not null default now(),
  primary key (parche_id, usuario_id)
);
create index if not exists parche_miembros_usuario_idx on public.parche_miembros (usuario_id);

create table if not exists public.mensajes (
  id           bigint generated always as identity primary key,
  parche_id    uuid not null references public.parches (id) on delete cascade,
  autor_id     uuid references auth.users (id) on delete set null default auth.uid(),
  autor_demo   text,                              -- persona de ejemplo (p1..p16)
  tipo         text not null default 'user' check (tipo in ('user', 'sys', 'bot', 'alerta')),
  texto        text not null check (char_length(texto) between 1 and 400),
  semilla      boolean not null default false,
  creado_en    timestamptz not null default now()
);
create index if not exists mensajes_parche_idx on public.mensajes (parche_id, creado_en);

create table if not exists public.rutas (
  id            bigint generated always as identity primary key,
  parche_id     uuid not null references public.parches (id) on delete cascade,
  usuario_id    uuid references auth.users (id) on delete cascade default auth.uid(),
  demo_persona  text,
  tipo          text not null check (tipo in ('carro', 'moto', 'busca')),
  cupos         integer check (cupos is null or cupos between 1 and 4),
  barrio        text not null default '' check (char_length(barrio) <= 40),
  creado_en     timestamptz not null default now(),
  constraint rutas_una_por_usuario unique (parche_id, usuario_id)
);

create table if not exists public.notificaciones (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  icono       text not null default 'i-bell' check (char_length(icono) <= 40),
  texto       text not null check (char_length(texto) <= 300),
  parche_id   uuid references public.parches (id) on delete set null,
  leida       boolean not null default false,
  creado_en   timestamptz not null default now()
);
create index if not exists notificaciones_usuario_idx on public.notificaciones (usuario_id, creado_en desc);

create table if not exists public.calificaciones (
  parche_id     uuid not null references public.parches (id) on delete cascade,
  autor_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  calificado_id uuid not null references auth.users (id) on delete cascade,
  estrellas     integer not null check (estrellas between 1 and 5),
  volver        boolean not null default false,
  creado_en     timestamptz not null default now(),
  primary key (parche_id, autor_id, calificado_id),
  constraint calificaciones_no_a_si_mismo check (autor_id <> calificado_id)
);
create index if not exists calificaciones_calificado_idx on public.calificaciones (calificado_id);

-- "parcero" es el uuid de otro usuario o una persona de ejemplo (p1..p16)
create table if not exists public.parceros_frecuentes (
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  parcero     text not null check (char_length(parcero) <= 40),
  creado_en   timestamptz not null default now(),
  primary key (usuario_id, parcero)
);

-- =====================================================================
-- 2. FUNCIONES Y TRIGGERS (esquema private: no se expone en la API)
-- =====================================================================

create or replace function private.tocar_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists perfiles_tocar on public.perfiles;
create trigger perfiles_tocar before update on public.perfiles
  for each row execute function private.tocar_actualizado();
drop trigger if exists perfiles_privados_tocar on public.perfiles_privados;
create trigger perfiles_privados_tocar before update on public.perfiles_privados
  for each row execute function private.tocar_actualizado();
drop trigger if exists parches_tocar on public.parches;
create trigger parches_tocar before update on public.parches
  for each row execute function private.tocar_actualizado();

-- Nombre corto: "Camilo Rojas" -> "Camilo R."
create or replace function private.nombre_corto(uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when split_part(p.nombre, ' ', 2) = '' then p.nombre
                 else split_part(p.nombre, ' ', 1) || ' ' || left(split_part(p.nombre, ' ', 2), 1) || '.' end
     from public.perfiles p where p.id = uid),
    'Un parcero')
$$;

-- Perfil automático al registrarse. Los metadatos solo se usan para llenar
-- el perfil, nunca para decidir permisos.
create or replace function private.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_ciudad text := m ->> 'ciudad';
  v_cedula text := regexp_replace(coalesce(m ->> 'cedula', ''), '\D', '', 'g');
  v_tel    text := regexp_replace(coalesce(m ->> 'telefono', ''), '\D', '', 'g');
  v_fecha  date;
  v_intereses text[];
begin
  if v_ciudad not in ('Villavicencio', 'Acacías', 'Restrepo') or v_ciudad is null then
    v_ciudad := 'Villavicencio';
  end if;
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

drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse after insert on auth.users
  for each row execute function private.crear_perfil();

-- Crear perfil a los usuarios que ya existían en Auth
insert into public.perfiles (id, nombre)
select u.id, left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''), split_part(u.email, '@', 1), 'Parcero'), 80)
from auth.users u
on conflict (id) do nothing;
insert into public.perfiles_privados (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- Cupos: nadie entra a un parche lleno (con candado para evitar carreras)
create or replace function private.validar_cupo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max int;
  v_demo int;
  v_ocup int;
begin
  perform pg_advisory_xact_lock(hashtext(new.parche_id::text));
  select cupos_max, coalesce(array_length(confirmados_demo, 1), 0)
    into v_max, v_demo
  from public.parches where id = new.parche_id;
  if v_max is null then
    raise exception 'El parche no existe' using errcode = 'P0002';
  end if;
  select count(*) into v_ocup from public.parche_miembros where parche_id = new.parche_id;
  if v_ocup + v_demo >= v_max then
    raise exception 'PARCHE_LLENO' using errcode = 'P0001', hint = 'Ya no quedan cupos en este parche.';
  end if;
  return new;
end $$;

drop trigger if exists miembros_validar_cupo on public.parche_miembros;
create trigger miembros_validar_cupo before insert on public.parche_miembros
  for each row execute function private.validar_cupo();

-- Hitos: bot al 50 % y cupón al 100 %
create or replace function private.revisar_hitos(pid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.parches%rowtype;
  v_ocup int;
  v_pct int;
  v_pregunta text;
  v_cupon jsonb;
begin
  select * into p from public.parches where id = pid;
  if not found then return; end if;
  select count(*) + coalesce(array_length(p.confirmados_demo, 1), 0) into v_ocup
  from public.parche_miembros where parche_id = pid;
  v_pct := floor(v_ocup * 100.0 / p.cupos_max);

  if v_ocup * 2 >= p.cupos_max and not p.bot_enviado then
    v_pregunta := case p.categoria
      when 'rumba' then '¿Cuál es el tema que no puede faltar hoy?'
      when 'comida' then '¿Qué es lo primero que piden apenas lleguen?'
      when 'chill' then '¿Qué playlist ponemos para arrancar?'
      when 'pueblear' then '¿Quién lleva el termo con tinto para el mirador?'
      when 'rio' then '¿Quién lleva la olla y quién el plátano?'
      when 'deportes' then '¿Cómo armamos los equipos sin que nadie se ponga bravo?'
      when 'conciertos' then '¿Qué canción tienen que tocar sí o sí?'
      when 'pet' then '¿Cómo se llaman sus peludos?'
      when 'cultura' then '¿Ya habían hecho algo parecido antes?'
      else '¿Cuál es su main y quién se le mide a un 1 vs 1?'
    end;
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (pid, null, 'bot',
      case when v_pct >= 100 then 'Cupo completo' else v_pct || '% del cupo lleno' end
      || ' para caer a ' || p.lugar || ': ' || v_pregunta);
    update public.parches set bot_enviado = true where id = pid;
  end if;

  if v_ocup >= p.cupos_max and not p.cupon_desbloqueado then
    v_cupon := coalesce(p.cupon, case p.categoria
      when 'rumba' then '{"comercio": "Los Capachos Bar", "desc": "20% en la primera ronda", "codigo": "CAPACHOS20"}'
      when 'comida' then '{"comercio": "Mamona Don Ramiro", "desc": "Postre gratis por mesa", "codigo": "VACALLENA"}'
      when 'chill' then '{"comercio": "Café La Tostadora", "desc": "2x1 en tintos de origen", "codigo": "TINTO2X1"}'
      when 'pueblear' then '{"comercio": "Tienda El Mirador", "desc": "15% en mecato", "codigo": "MIRADOR15"}'
      when 'rio' then '{"comercio": "Asadero El Guatiquía", "desc": "10% en el almuerzo", "codigo": "OLLA10"}'
      when 'deportes' then '{"comercio": "Hidratante Llanero", "desc": "Bebida gratis por jugador", "codigo": "GOLAZO"}'
      when 'conciertos' then '{"comercio": "Las Malocas", "desc": "15% en la barra", "codigo": "TOQUE15"}'
      when 'pet' then '{"comercio": "Pet Shop El Peludo", "desc": "Snack gratis para tu perro", "codigo": "GUAU"}'
      when 'cultura' then '{"comercio": "Librería La Ceiba", "desc": "10% en libros", "codigo": "CULTURA10"}'
      else '{"comercio": "Gamer Zone Villavo", "desc": "1 hora gratis de consola", "codigo": "GGWP"}'
    end::jsonb);
    update public.parches set cupon_desbloqueado = true, cupon = v_cupon where id = pid;
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (pid, null, 'sys', 'Parche lleno. Se desbloqueó un cupón de ' || (v_cupon ->> 'comercio') || '.');
    insert into public.notificaciones (usuario_id, icono, texto, parche_id)
    select m.usuario_id, 'i-tag',
           '<b>' || p.titulo || '</b> se llenó. Desbloqueaste un cupón de ' || (v_cupon ->> 'comercio') || '.', pid
    from public.parche_miembros m where m.parche_id = pid;
  end if;
end $$;

-- Al crear un parche: el creador queda dentro y se anuncia en el chat
create or replace function private.tras_crear_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.creador_id is not null then
    insert into public.parche_miembros (parche_id, usuario_id) values (new.id, new.creador_id)
    on conflict do nothing;
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (new.id, null, 'sys', private.nombre_corto(new.creador_id) || ' abrió el parche. Comparte el enlace para que la gente caiga.');
    insert into public.notificaciones (usuario_id, icono, texto, parche_id)
    values (new.creador_id, 'i-bolt', 'Publicaste <b>' || new.titulo || '</b>. Ya está en el radar.', new.id);
  end if;
  return new;
end $$;

drop trigger if exists parches_al_crear on public.parches;
create trigger parches_al_crear after insert on public.parches
  for each row execute function private.tras_crear_parche();

-- Al entrar o salir alguien: mensaje del sistema, aviso al creador e hitos
create or replace function private.tras_cambio_miembro()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parche public.parches%rowtype;
  v_uid uuid := coalesce(new.usuario_id, old.usuario_id);
  v_pid uuid := coalesce(new.parche_id, old.parche_id);
begin
  select * into v_parche from public.parches where id = v_pid;
  if not found or v_uid = v_parche.creador_id then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (v_pid, null, 'sys', private.nombre_corto(v_uid) || ' le cayó al parche');
    if v_parche.creador_id is not null then
      insert into public.notificaciones (usuario_id, icono, texto, parche_id)
      values (v_parche.creador_id, 'i-users-plus',
              '<b>' || private.nombre_corto(v_uid) || '</b> le cayó a tu parche <b>' || v_parche.titulo || '</b>.', v_pid);
    end if;
    perform private.revisar_hitos(v_pid);
  else
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (v_pid, null, 'sys', private.nombre_corto(v_uid) || ' se abrió del parche');
    delete from public.rutas where parche_id = v_pid and usuario_id = v_uid;
  end if;
  return null;
end $$;

drop trigger if exists miembros_al_cambiar on public.parche_miembros;
create trigger miembros_al_cambiar after insert or delete on public.parche_miembros
  for each row execute function private.tras_cambio_miembro();

-- Cambios del organizador: Plan B y datos del parche
create or replace function private.tras_actualizar_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.plan_b_activo and not old.plan_b_activo and new.plan_b <> '' then
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (new.id, null, 'alerta', 'PLAN B ACTIVADO: por lluvia nos movemos a ' || new.plan_b || '. Misma hora.');
    insert into public.notificaciones (usuario_id, icono, texto, parche_id)
    select m.usuario_id, 'i-roof',
           'Plan B en <b>' || new.titulo || '</b>: nos movemos a ' || new.plan_b || '.', new.id
    from public.parche_miembros m
    where m.parche_id = new.id and m.usuario_id is distinct from new.creador_id;
  elsif old.plan_b_activo and not new.plan_b_activo then
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (new.id, null, 'sys', 'Volvimos al lugar original: ' || new.lugar || '.');
  end if;

  if not new.demo and (new.titulo, new.inicio, new.lugar, new.barrio, new.lat, new.lng, new.cupos_max)
     is distinct from (old.titulo, old.inicio, old.lugar, old.barrio, old.lat, old.lng, old.cupos_max) then
    insert into public.mensajes (parche_id, autor_id, tipo, texto)
    values (new.id, null, 'sys', 'El organizador actualizó los datos del parche.');
    perform private.revisar_hitos(new.id);
  end if;
  return null;
end $$;

drop trigger if exists parches_al_actualizar on public.parches;
create trigger parches_al_actualizar after update on public.parches
  for each row execute function private.tras_actualizar_parche();

-- Reputación: promedio de calificaciones recibidas
create or replace function private.tras_calificar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.perfiles p
  set rating = coalesce((select round(avg(c.estrellas)::numeric, 1) from public.calificaciones c where c.calificado_id = new.calificado_id), 5.0),
      resenas = (select count(*) from public.calificaciones c where c.calificado_id = new.calificado_id)
  where p.id = new.calificado_id;
  return null;
end $$;

drop trigger if exists calificaciones_al_crear on public.calificaciones;
create trigger calificaciones_al_crear after insert on public.calificaciones
  for each row execute function private.tras_calificar();

-- Nadie ejecuta estas funciones directamente
revoke all on all functions in schema private from public, anon, authenticated;

-- =====================================================================
-- 3. RLS Y PERMISOS
-- =====================================================================
alter table public.perfiles            enable row level security;
alter table public.perfiles_privados   enable row level security;
alter table public.parches             enable row level security;
alter table public.parche_miembros     enable row level security;
alter table public.mensajes            enable row level security;
alter table public.rutas               enable row level security;
alter table public.notificaciones      enable row level security;
alter table public.calificaciones      enable row level security;
alter table public.parceros_frecuentes enable row level security;

-- Los visitantes sin sesión no ven nada del dashboard
revoke all on public.perfiles, public.perfiles_privados, public.parches, public.parche_miembros,
  public.mensajes, public.rutas, public.notificaciones, public.calificaciones, public.parceros_frecuentes
  from anon, authenticated;

-- perfiles: todos los usuarios ven nombre y avatar; cada quien edita solo lo suyo
grant select on public.perfiles to authenticated;
grant update (ciudad, barrio, mostrar_foto_real, foto_encuadre, avatar_config, intereses) on public.perfiles to authenticated;
drop policy if exists "perfiles: ver" on public.perfiles;
create policy "perfiles: ver" on public.perfiles for select to authenticated using (true);
drop policy if exists "perfiles: editar el propio" on public.perfiles;
create policy "perfiles: editar el propio" on public.perfiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- perfiles_privados: solo el dueño. La cédula no se puede cambiar desde la app.
grant select on public.perfiles_privados to authenticated;
grant update (telefono, instagram, fecha_nacimiento) on public.perfiles_privados to authenticated;
drop policy if exists "privados: ver el propio" on public.perfiles_privados;
create policy "privados: ver el propio" on public.perfiles_privados for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "privados: editar el propio" on public.perfiles_privados;
create policy "privados: editar el propio" on public.perfiles_privados for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- parches: todos los ven; solo el creador edita o cancela
grant select on public.parches to authenticated;
grant insert (titulo, categoria, descripcion, inicio, lugar, barrio, lat, lng, costo, presupuesto, cupos_max, imagen, plan_b)
  on public.parches to authenticated;
grant update (titulo, categoria, descripcion, inicio, lugar, barrio, lat, lng, costo, presupuesto, cupos_max, imagen, plan_b, plan_b_activo)
  on public.parches to authenticated;
grant delete on public.parches to authenticated;
drop policy if exists "parches: ver" on public.parches;
create policy "parches: ver" on public.parches for select to authenticated using (true);
drop policy if exists "parches: crear" on public.parches;
create policy "parches: crear" on public.parches for insert to authenticated
  with check ((select auth.uid()) = creador_id);
drop policy if exists "parches: editar el propio" on public.parches;
create policy "parches: editar el propio" on public.parches for update to authenticated
  using ((select auth.uid()) = creador_id) with check ((select auth.uid()) = creador_id);
drop policy if exists "parches: cancelar el propio" on public.parches;
create policy "parches: cancelar el propio" on public.parches for delete to authenticated
  using ((select auth.uid()) = creador_id);

-- parche_miembros: se ve quién va; cada quien entra o sale solo por sí mismo
grant select on public.parche_miembros to authenticated;
grant insert (parche_id) on public.parche_miembros to authenticated;
grant update (checkin, calificado) on public.parche_miembros to authenticated;
grant delete on public.parche_miembros to authenticated;
drop policy if exists "miembros: ver" on public.parche_miembros;
create policy "miembros: ver" on public.parche_miembros for select to authenticated using (true);
drop policy if exists "miembros: unirse" on public.parche_miembros;
create policy "miembros: unirse" on public.parche_miembros for insert to authenticated
  with check ((select auth.uid()) = usuario_id);
drop policy if exists "miembros: check-in propio" on public.parche_miembros;
create policy "miembros: check-in propio" on public.parche_miembros for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
drop policy if exists "miembros: salirse" on public.parche_miembros;
create policy "miembros: salirse" on public.parche_miembros for delete to authenticated
  using (
    (select auth.uid()) = usuario_id
    and not exists (select 1 from public.parches p where p.id = parche_id and p.creador_id = (select auth.uid()))
  );

-- mensajes: solo quienes están en el parche leen y escriben
grant select on public.mensajes to authenticated;
grant insert (parche_id, texto) on public.mensajes to authenticated;
drop policy if exists "mensajes: ver si estoy en el parche" on public.mensajes;
create policy "mensajes: ver si estoy en el parche" on public.mensajes for select to authenticated
  using (exists (select 1 from public.parche_miembros m where m.parche_id = mensajes.parche_id and m.usuario_id = (select auth.uid())));
drop policy if exists "mensajes: escribir si estoy en el parche" on public.mensajes;
create policy "mensajes: escribir si estoy en el parche" on public.mensajes for insert to authenticated
  with check (
    autor_id = (select auth.uid()) and tipo = 'user'
    and exists (select 1 from public.parche_miembros m where m.parche_id = mensajes.parche_id and m.usuario_id = (select auth.uid()))
  );

-- rutas (carpooling): las ven los del parche; cada quien maneja la suya
grant select on public.rutas to authenticated;
grant insert (parche_id, tipo, cupos, barrio) on public.rutas to authenticated;
grant update (tipo, cupos, barrio) on public.rutas to authenticated;
grant delete on public.rutas to authenticated;
drop policy if exists "rutas: ver si estoy en el parche" on public.rutas;
create policy "rutas: ver si estoy en el parche" on public.rutas for select to authenticated
  using (exists (select 1 from public.parche_miembros m where m.parche_id = rutas.parche_id and m.usuario_id = (select auth.uid())));
drop policy if exists "rutas: publicar la propia" on public.rutas;
create policy "rutas: publicar la propia" on public.rutas for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.parche_miembros m where m.parche_id = rutas.parche_id and m.usuario_id = (select auth.uid()))
  );
drop policy if exists "rutas: editar la propia" on public.rutas;
create policy "rutas: editar la propia" on public.rutas for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists "rutas: quitar la propia" on public.rutas;
create policy "rutas: quitar la propia" on public.rutas for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- notificaciones: cada quien las suyas
grant select, delete on public.notificaciones to authenticated;
grant insert (icono, texto, parche_id) on public.notificaciones to authenticated;
grant update (leida) on public.notificaciones to authenticated;
drop policy if exists "notificaciones: ver las propias" on public.notificaciones;
create policy "notificaciones: ver las propias" on public.notificaciones for select to authenticated
  using (usuario_id = (select auth.uid()));
drop policy if exists "notificaciones: crear para mí" on public.notificaciones;
create policy "notificaciones: crear para mí" on public.notificaciones for insert to authenticated
  with check (usuario_id = (select auth.uid()));
drop policy if exists "notificaciones: marcar leídas" on public.notificaciones;
create policy "notificaciones: marcar leídas" on public.notificaciones for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists "notificaciones: borrar las propias" on public.notificaciones;
create policy "notificaciones: borrar las propias" on public.notificaciones for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- calificaciones: solo entre gente que estuvo en el mismo parche, y después del check-in
grant select on public.calificaciones to authenticated;
grant insert (parche_id, calificado_id, estrellas, volver) on public.calificaciones to authenticated;
drop policy if exists "calificaciones: ver las que hice" on public.calificaciones;
create policy "calificaciones: ver las que hice" on public.calificaciones for select to authenticated
  using (autor_id = (select auth.uid()));
drop policy if exists "calificaciones: calificar tras el check-in" on public.calificaciones;
create policy "calificaciones: calificar tras el check-in" on public.calificaciones for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and exists (select 1 from public.parche_miembros m
                where m.parche_id = calificaciones.parche_id and m.usuario_id = (select auth.uid()) and m.checkin)
    and exists (select 1 from public.parche_miembros m
                where m.parche_id = calificaciones.parche_id and m.usuario_id = calificaciones.calificado_id)
  );

-- parceros frecuentes: lista personal
grant select, delete on public.parceros_frecuentes to authenticated;
grant insert (parcero) on public.parceros_frecuentes to authenticated;
drop policy if exists "frecuentes: ver los propios" on public.parceros_frecuentes;
create policy "frecuentes: ver los propios" on public.parceros_frecuentes for select to authenticated
  using (usuario_id = (select auth.uid()));
drop policy if exists "frecuentes: agregar" on public.parceros_frecuentes;
create policy "frecuentes: agregar" on public.parceros_frecuentes for insert to authenticated
  with check (usuario_id = (select auth.uid()));
drop policy if exists "frecuentes: quitar" on public.parceros_frecuentes;
create policy "frecuentes: quitar" on public.parceros_frecuentes for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- =====================================================================
-- 4. STORAGE: fotos de perfil y portadas (bucket público, máx. 2 MB)
--    Cada usuario solo escribe en su carpeta: fotos/<su-uuid>/...
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "fotos: subir a mi carpeta" on storage.objects;
create policy "fotos: subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fotos: ver mi carpeta" on storage.objects;
create policy "fotos: ver mi carpeta" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fotos: reemplazar en mi carpeta" on storage.objects;
create policy "fotos: reemplazar en mi carpeta" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fotos: borrar de mi carpeta" on storage.objects;
create policy "fotos: borrar de mi carpeta" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- 5. TIEMPO REAL
-- =====================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['parches', 'parche_miembros', 'mensajes', 'rutas', 'notificaciones'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- =====================================================================
-- 6. PARCHES DE EJEMPLO EN VILLAVICENCIO
--    demo_regla: {"min": N} arranca N minutos después de renovarse;
--    {"dias": D, "hora": "HH:MI"} es D días después a esa hora (Bogotá).
--    Cuando un parche de ejemplo vence, se renueva y se limpia su chat.
-- =====================================================================
create or replace function private.refrescar_demo()
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_t timestamptz;
begin
  for p in select id, demo_regla, inicio from public.parches where demo loop
    continue when p.inicio is not null and p.inicio > now() - interval '90 minutes';
    if p.demo_regla ? 'dias' then
      v_t := ((v_hoy + (p.demo_regla ->> 'dias')::int) + (p.demo_regla ->> 'hora')::time) at time zone 'America/Bogota';
      if v_t < now() + interval '20 minutes' then
        v_t := case when p.demo_regla ? 'min' then now() + make_interval(mins => (p.demo_regla ->> 'min')::int)
                    else v_t + interval '7 days' end;
      end if;
    else
      v_t := now() + make_interval(mins => coalesce((p.demo_regla ->> 'min')::int, 60));
    end if;
    update public.parches
      set inicio = date_trunc('minute', v_t), bot_enviado = false, cupon_desbloqueado = false, plan_b_activo = false
      where id = p.id;
    delete from public.parche_miembros where parche_id = p.id;
    delete from public.mensajes where parche_id = p.id and not semilla;
    delete from public.rutas where parche_id = p.id and usuario_id is not null;
    perform private.revisar_hitos(p.id);
  end loop;
end $$;
revoke all on function private.refrescar_demo() from public, anon, authenticated;

do $$
declare
  img constant text := 'https://images.unsplash.com/%s?auto=format&fit=crop&w=900&q=70';
begin
  if exists (select 1 from public.parches where demo) then
    return;  -- ya sembrados
  end if;

  insert into public.parches
    (creador_id, creador_nombre, creador_rating, aliado, demo, demo_regla, confirmados_demo, titulo, categoria, descripcion,
     inicio, lugar, barrio, lat, lng, costo, presupuesto, cupos_max, imagen, plan_b, relampago, promo, cupon, clima)
  values
    (null, 'La Terraza Llanera', 4.7, true, true, '{"min": 40}', '{p1,p4,p6,p9,p11,p13,p2,p7,p15,p16,p10}',
     'Hora feliz 2x1 en La Terraza Llanera', 'rumba',
     'Parche Relámpago de un local aliado: 2x1 en cócteles mientras dure la hora feliz. Música llanera y reguetón, terraza al aire libre.',
     now() - interval '1 day', 'La Terraza Llanera', 'Barzal', 4.1468, -73.6372, 0, 25000, 20, format(img, 'photo-1572116469696-31de0f17cc34'), '',
     true, '2x1 en cócteles las próximas 2 horas', '{"comercio": "La Terraza Llanera", "desc": "2x1 en la primera ronda", "codigo": "PARCHE2X1"}',
     '{"tipo": "sol", "temp": 29, "prob": 10}'),
    (null, 'Santi R.', 4.9, false, true, '{"min": 85}', '{p2,p5,p8,p9,p11,p13,p14,p15}',
     'Micro en La Bombonera', 'deportes',
     'Falta poquito para completar los dos equipos. Cancha sintética con luz, se paga entre todos. Nivel recocha, nada de ponerse bravos.',
     now() - interval '1 day', 'Canchas Sintéticas La Bombonera', 'La Esperanza', 4.1338, -73.6195, 8000, 12000, 10, format(img, 'photo-1574629810360-7efbbe195018'), '',
     false, null, null, '{"tipo": "nubes", "temp": 27, "prob": 25}'),
    (null, 'Mafe P.', 4.7, false, true, '{"dias": 0, "hora": "21:30", "min": 190}', '{p1,p3,p4,p6,p7,p9,p10,p12,p13,p14,p16,p5}',
     'Rumba en Los Capachos', 'rumba',
     'Arrancamos con unas frías y cerramos bailando. Mesa reservada para el grupo, el cover incluye la primera.',
     now() - interval '1 day', 'Los Capachos Bar', 'Centro', 4.1500, -73.6310, 15000, 45000, 12, format(img, 'photo-1514525253161-7a46d19cd819'), '',
     false, null, null, '{"tipo": "sol", "temp": 26, "prob": 15}'),
    (null, 'Andrés F.', 4.6, false, true, '{"min": 130}', '{p8,p12,p16}',
     'Cine y arcade en Primavera Urbana', 'gaming',
     'Película de estreno y después nos medimos en el arcade. Si llueve no pasa nada, todo es bajo techo.',
     now() - interval '1 day', 'C.C. Primavera Urbana', 'La Primavera', 4.1302, -73.6318, 0, 30000, 8, format(img, 'photo-1542751371-adc38448a05e'), '',
     false, null, null, '{"tipo": "lluvia", "temp": 25, "prob": 60}'),
    (null, 'Luisa D.', 4.8, false, true, '{"dias": 0, "hora": "19:30", "min": 150}', '{p3,p6,p10,p14}',
     'Ruta de antojos llaneros', 'comida',
     'Pandeyuca, empanadas de pipián y cerramos con una mamona. Vamos caminando entre puestos del centro.',
     now() - interval '1 day', 'Plaza de mercado San Isidro', 'San Isidro', 4.1395, -73.6345, 0, 35000, 8, format(img, 'photo-1504674900247-0877df9cc836'), '',
     false, null, null, '{"tipo": "nubes", "temp": 27, "prob": 30}'),
    (null, 'Valen G.', 4.9, false, true, '{"dias": 1, "hora": "16:30"}', '{p3,p5,p7,p9,p11,p15,p16}',
     'Atardecer en la Piedra del Amor', 'pueblear',
     'Subimos al mirador de Buenavista a ver cómo se prende Villavo. Salimos en grupo desde el centro y bajamos juntos.',
     now() - interval '1 day', 'Mirador La Piedra del Amor', 'Buenavista', 4.1640, -73.6640, 0, 15000, 15, format(img, 'photo-1506905925346-21bda4d32df4'), '',
     false, null, null, '{"tipo": "sol", "temp": 24, "prob": 15}'),
    (null, 'Dani T.', 4.8, false, true, '{"dias": 1, "hora": "15:00"}', '{p6,p12}',
     'Café de origen en el Siete de Agosto', 'chill',
     'Cata de café del Meta con el barista de la casa. Plan tranquilo para conocer gente y charlar sin afán.',
     now() - interval '1 day', 'Café La Tostadora', 'Siete de Agosto', 4.1450, -73.6285, 0, 18000, 6, format(img, 'photo-1495474472287-4d71bcdd2085'), '',
     false, null, null, '{"tipo": "nubes", "temp": 28, "prob": 30}'),
    (null, 'Laura M.', 4.9, false, true, '{"dias": 1, "hora": "16:00"}', '{p2,p10,p12,p15}',
     'Tarde de frisbee y picnic', 'chill',
     'Cada uno lleva algo para compartir. Frisbee, cartas y parlante. Si llueve tenemos Plan B bajo techo.',
     now() - interval '1 day', 'Parque Los Fundadores', 'Centro', 4.1530, -73.6352, 0, 10000, 10, format(img, 'photo-1511632765486-a01980e01a18'),
     'Plazoleta cubierta del C.C. Primavera Urbana', false, null, null, '{"tipo": "lluvia", "temp": 25, "prob": 70}'),
    (null, 'Juancho L.', 4.7, false, true, '{"dias": 2, "hora": "06:00"}', '{p2,p4,p5,p8,p11,p13,p14,p15,p16}',
     'Ruta en bici a Restrepo', 'deportes',
     'Rodada de 30 km ida y vuelta. Desayuno en el parque de Restrepo. Casco obligatorio, ritmo para todos.',
     now() - interval '1 day', 'Glorieta de Catama, salida a Restrepo', 'Catama', 4.1745, -73.6285, 0, 20000, 20, format(img, 'photo-1517649763962-0c623066013b'), '',
     false, null, null, '{"tipo": "sol", "temp": 23, "prob": 10}'),
    (null, 'Caro V.', 4.8, false, true, '{"dias": 2, "hora": "07:30"}', '{p1,p7,p10,p16}',
     'Caminata perruna en La Grama', 'pet',
     'Paseo de una hora con los peludos y después tinto. Traigan bolsitas y agua.',
     now() - interval '1 day', 'Parque La Grama', 'La Grama', 4.1480, -73.6255, 0, 0, 15, format(img, 'photo-1543466835-00a7907e9de1'), '',
     false, null, null, '{"tipo": "sol", "temp": 24, "prob": 5}'),
    (null, 'Tato Q.', 4.6, false, true, '{"dias": 3, "hora": "09:00"}', '{p1,p3,p4,p5,p6,p9,p10,p11,p12,p14,p15,p16}',
     'Paseo de olla al Guatiquía', 'rio',
     'Sancocho a la orilla del río, cada uno aporta algo. Salimos temprano para coger buen puesto.',
     now() - interval '1 day', 'Balneario río Guatiquía', 'La Vega', 4.1705, -73.6105, 0, 15000, 25, format(img, 'photo-1441974231531-c6227db76b6e'), '',
     false, null, null, '{"tipo": "sol", "temp": 30, "prob": 20}'),
    (null, 'Nico B.', 4.7, false, true, '{"dias": 4, "hora": "19:00"}', '{p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14,p15,p16}',
     'Toque de joropo y rock en Las Malocas', 'conciertos',
     'Bandas locales mezclando arpa llanera con guitarras eléctricas. Entrada con boleta, nos vemos adelante.',
     now() - interval '1 day', 'Parque Las Malocas', 'Vía Puerto López', 4.1110, -73.5905, 20000, 50000, 40, format(img, 'photo-1470229722913-7c0e2dbbafd3'), '',
     false, null, null, '{"tipo": "nubes", "temp": 26, "prob": 35}'),
    (null, 'Isa N.', 4.9, false, true, '{"dias": 5, "hora": "15:00"}', '{p6,p12,p16,p7}',
     'Taller de cerámica llanera', 'cultura',
     'Aprendemos a hacer piezas con motivos del Llano. Materiales incluidos en la entrada.',
     now() - interval '1 day', 'Casa de la Cultura', 'Centro', 4.1515, -73.6335, 25000, 35000, 10, format(img, 'photo-1460661419201-fd4cecdf8a8b'), '',
     false, null, null, '{"tipo": "sol", "temp": 28, "prob": 15}'),
    (null, 'Kevin O.', 4.5, false, true, '{"dias": 6, "hora": "18:00"}', '{p8,p11,p13,p2,p5,p9}',
     'Torneo de FIFA y pizza', 'gaming',
     'Eliminación directa, 1 vs 1. El ganador no paga pizza. Lleva tu control si tienes.',
     now() - interval '1 day', 'Gamer Zone Villavo', 'Caudal', 4.1405, -73.6205, 10000, 30000, 16, format(img, 'photo-1542751371-adc38448a05e'), '',
     false, null, null, '{"tipo": "lluvia", "temp": 25, "prob": 55}');

  -- Primeros mensajes del chat de cada ejemplo
  insert into public.mensajes (parche_id, autor_id, autor_demo, tipo, texto, semilla)
  select p.id, null, null, 'sys', p.creador_nombre || ' abrió el parche', true from public.parches p where p.demo;

  insert into public.mensajes (parche_id, autor_id, autor_demo, tipo, texto, semilla)
  select p.id, null, p.confirmados_demo[i], 'user',
         (case p.categoria
            when 'rumba' then array['¿Alguien sabe si hay cover?', 'Yo llego tipo 9, guárdenme puesto', 'Que no falte el reguetón viejo']
            when 'comida' then array['Yo voy con hambre de tres días', '¿Pagamos por aparte o hacemos vaca?', 'Dicen que la mamona ahí es brutal']
            when 'chill' then array['Yo llevo cartas', '¿Llevo parlante?', 'Plan perfecto para bajar el estrés']
            when 'pueblear' then array['¿Salimos juntos desde el centro?', 'Lleven chaqueta, arriba hace viento', 'El atardecer desde ahí es otra cosa']
            when 'rio' then array['Yo llevo la leña', '¿Hay que llevar bloqueador? Obvio', 'Ojo con la corriente, nada de hacerse el valiente']
            when 'deportes' then array['Yo tapo, tranquilos', '¿Alguien tiene balón número 5?', 'Lleven petos de dos colores']
            when 'conciertos' then array['¿A qué hora abren puertas?', 'Me sé todo el repertorio', 'Nos vemos adelante']
            when 'pet' then array['Mi perra es súper sociable', 'Lleven bolsitas', '¿Hay agua para los peludos?']
            when 'cultura' then array['Nunca he hecho esto, voy a aprender', '¿Hay que llevar materiales?', 'Qué buen plan']
            else array['Llevo mi control', '¿Es por equipos o todos contra todos?', 'Hoy no me gana nadie']
          end)[i],
         true
  from public.parches p, generate_series(1, 3) i
  where p.demo and array_length(p.confirmados_demo, 1) >= i;

  -- Carpooling de ejemplo
  insert into public.rutas (parche_id, usuario_id, demo_persona, tipo, cupos, barrio)
  select id, null::uuid, 'p5', 'carro', 3, 'Catama' from public.parches where demo and titulo = 'Atardecer en la Piedra del Amor'
  union all
  select id, null::uuid, 'p9', 'busca', null::int, 'El Buque' from public.parches where demo and titulo = 'Atardecer en la Piedra del Amor'
  union all
  select id, null::uuid, 'p11', 'carro', 2, 'Villa Julia' from public.parches where demo and titulo = 'Paseo de olla al Guatiquía';
end $$;

-- Fechas frescas + bot y cupones de los ejemplos
select private.refrescar_demo();

-- Renovar los ejemplos cada hora (si pg_cron está disponible)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('modo-parche-refrescar-demo', '7 * * * *', 'select private.refrescar_demo()');
exception when others then
  raise notice 'pg_cron no disponible (%). Los ejemplos se renuevan al volver a correr este script.', sqlerrm;
end $$;
