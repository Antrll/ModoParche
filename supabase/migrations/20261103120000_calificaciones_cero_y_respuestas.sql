-- =====================================================================
-- ModoParche · noviembre 2026
-- 1. Las calificaciones arrancan en 0 (antes 5,0) para que se vea claro
--    que a una cuenta todavía no la ha calificado nadie.
-- 2. Responder mensajes en el chat (deslizar para responder): cada
--    mensaje puede apuntar al mensaje que responde.
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CALIFICACIONES DESDE 0
-- ---------------------------------------------------------------------
alter table public.perfiles alter column rating set default 0;

-- Cuentas sin ninguna calificación: quedan en 0
update public.perfiles set rating = 0 where coalesce(resenas, 0) = 0 and rating <> 0;

-- Al calificar: promedio de lo recibido, o 0 si no hay nada
create or replace function private.tras_calificar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.perfiles p
  set rating = coalesce((select round(avg(c.estrellas)::numeric, 1) from public.calificaciones c where c.calificado_id = new.calificado_id), 0),
      resenas = (select count(*) from public.calificaciones c where c.calificado_id = new.calificado_id)
  where p.id = new.calificado_id;
  return null;
end $$;

-- Al anular una calificación desde el panel admin: si era la única, vuelve a 0
create or replace function public.admin_anular_calificacion(p_parche uuid, p_autor uuid, p_calificado uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_est int; v_nombre text;
begin
  perform private.exigir_staff();
  delete from public.calificaciones
   where parche_id = p_parche and autor_id = p_autor and calificado_id = p_calificado
  returning estrellas into v_est;
  if v_est is null then
    raise exception 'NO_EXISTE' using errcode = 'P0002', hint = 'Esa calificación ya no existe.';
  end if;
  update public.perfiles p
     set rating = coalesce((select round(avg(c.estrellas)::numeric, 1) from public.calificaciones c where c.calificado_id = p_calificado), 0),
         resenas = (select count(*) from public.calificaciones c where c.calificado_id = p_calificado)
   where p.id = p_calificado
  returning nombre into v_nombre;
  perform private.registrar('anular_calificacion', coalesce(v_nombre, 'Cuenta'), v_est || ' estrellas. ' || coalesce(p_motivo, ''));
end $$;

-- ---------------------------------------------------------------------
-- 2. RESPONDER MENSAJES
-- ---------------------------------------------------------------------
alter table public.mensajes
  add column if not exists responde_a bigint references public.mensajes (id) on delete set null;

-- La app puede mandar a qué mensaje responde (además del parche y el texto)
grant insert (parche_id, texto, responde_a) on public.mensajes to authenticated;

-- Solo se puede responder a un mensaje del mismo parche; si no, se ignora
create or replace function private.validar_respuesta()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.responde_a is not null and not exists (
    select 1 from public.mensajes m where m.id = new.responde_a and m.parche_id = new.parche_id
  ) then
    new.responde_a := null;
  end if;
  return new;
end $$;

drop trigger if exists mensajes_validar_respuesta on public.mensajes;
create trigger mensajes_validar_respuesta before insert on public.mensajes
  for each row execute function private.validar_respuesta();

-- Nadie ejecuta estas funciones directamente
revoke all on function private.tras_calificar() from public, anon, authenticated;
revoke all on function private.validar_respuesta() from public, anon, authenticated;
