-- =====================================================================
-- ModoParche · Mejoras de noviembre 2026
-- Corre después de 20261104130000_cepeda_boleteria.sql.
--
-- 1. Póster del parche oficial de Andrés Cepeda
-- 2. Foto opcional en cualquier parche (solo fotos propias del bucket)
-- 3. Compartir: vista pública mínima de un parche (para la vista previa
--    en WhatsApp), sin datos de personas
-- 4. Calificar después del parche: solo a quien estuvo en el mismo parche
-- 5. Parches grandes: cada persona elige su localidad (subgrupos del chat)
-- 6. Notificaciones push: suscripciones por dispositivo
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PÓSTER DEL OFICIAL
-- ---------------------------------------------------------------------
update public.parches
   set imagen = '/src/assets/web/oficiales/andres-cepeda.webp'
 where oficial and titulo = 'Andrés Cepeda en Villavo';

-- ---------------------------------------------------------------------
-- 2. FOTO DEL PARCHE PARA TODOS
--    La app ya puede guardar "imagen"; aquí se exige que sea una foto
--    subida por quien creó el parche (bucket público "fotos", carpeta
--    con su id). Los oficiales pueden usar imágenes del sitio (/src/...).
-- ---------------------------------------------------------------------
create or replace function private.validar_imagen_parche()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.imagen, '') = '' then return new; end if;
  -- Oficiales: imágenes del sitio o un enlace https que pone un admin
  if new.oficial and (new.imagen like '/src/assets/%' or new.imagen ~ '^https://[^\s<>"]{4,590}$') then return new; end if;
  if new.creador_id is not null
     and new.imagen ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/' || new.creador_id::text || '/[A-Za-z0-9._-]+$') then
    return new;
  end if;
  raise exception 'IMAGEN' using errcode = 'P0001', hint = 'La foto del parche debe subirse desde ModoParche.';
end $$;
revoke all on function private.validar_imagen_parche() from public, anon, authenticated;

drop trigger if exists parches_validar_imagen on public.parches;
create trigger parches_validar_imagen before insert or update of imagen on public.parches
  for each row execute function private.validar_imagen_parche();

-- El admin cambia el afiche de un parche oficial desde su panel
create or replace function public.admin_imagen_oficial(p_parche uuid, p_imagen text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_admin();
  perform set_config('mp.edicion_admin', '1', true);
  update public.parches set imagen = coalesce(trim(p_imagen), '') where id = p_parche and oficial;
  if not found then raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Ese parche oficial ya no existe.'; end if;
  perform set_config('mp.edicion_admin', '0', true);
end $$;
revoke all on function public.admin_imagen_oficial(uuid, text) from public, anon;
grant execute on function public.admin_imagen_oficial(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. VISTA PÚBLICA PARA COMPARTIR
--    La usa /p/<id> (api/p.js en Vercel) para armar la vista previa.
--    Solo datos del plan: nada de quién va ni del chat.
-- ---------------------------------------------------------------------
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
$$;
revoke all on function public.parche_publico(uuid) from public;
grant execute on function public.parche_publico(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CALIFICAR DESPUÉS DEL PARCHE
--    Ya se exigía haber llegado (check-in). Ahora además: a quien se
--    califica tiene que haber estado en ese parche, y solo hasta 7 días
--    después.
-- ---------------------------------------------------------------------
create or replace function private.validar_calificacion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inicio timestamptz;
begin
  select inicio into v_inicio from public.parches where id = new.parche_id;
  if v_inicio is null or v_inicio > now() or v_inicio < now() - interval '7 days' then
    raise exception 'FUERA_DE_TIEMPO' using errcode = 'P0001', hint = 'Se califica desde que empieza el parche y hasta 7 días después.';
  end if;
  if not exists (select 1 from public.parche_miembros m where m.parche_id = new.parche_id and m.usuario_id = new.calificado_id) then
    raise exception 'NO_ESTABA' using errcode = 'P0001', hint = 'Esa persona no estaba en este parche.';
  end if;
  return new;
end $$;
revoke all on function private.validar_calificacion() from public, anon, authenticated;

drop trigger if exists calificaciones_validar on public.calificaciones;
create trigger calificaciones_validar before insert on public.calificaciones
  for each row execute function private.validar_calificacion();

-- ---------------------------------------------------------------------
-- 5. LOCALIDAD EN PARCHES GRANDES
-- ---------------------------------------------------------------------
alter table public.parche_miembros add column if not exists localidad text
  check (localidad is null or char_length(localidad) between 1 and 40);
grant update (localidad) on public.parche_miembros to authenticated;
-- La política "miembros: check-in propio" (update solo de la fila propia) ya cubre este cambio.

-- ---------------------------------------------------------------------
-- 6. NOTIFICACIONES PUSH
--    Cada celular o navegador que activa los avisos guarda aquí su
--    suscripción. La función enviar-push las usa para avisar.
-- ---------------------------------------------------------------------
create table if not exists public.push_suscripciones (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  creado_en   timestamptz not null default now()
);
create index if not exists push_suscripciones_usuario_idx on public.push_suscripciones (usuario_id);
alter table public.push_suscripciones enable row level security;

grant select, delete on public.push_suscripciones to authenticated;
grant insert (endpoint, p256dh, auth) on public.push_suscripciones to authenticated;
drop policy if exists "push: ver las mías" on public.push_suscripciones;
create policy "push: ver las mías" on public.push_suscripciones for select to authenticated
  using (usuario_id = (select auth.uid()));
drop policy if exists "push: activar" on public.push_suscripciones;
create policy "push: activar" on public.push_suscripciones for insert to authenticated
  with check (usuario_id = (select auth.uid()));
drop policy if exists "push: desactivar" on public.push_suscripciones;
create policy "push: desactivar" on public.push_suscripciones for delete to authenticated
  using (usuario_id = (select auth.uid()));
