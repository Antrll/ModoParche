-- =====================================================================
-- ModoParche · Dispositivos con la sesión abierta (perfil)
-- Corre en: Supabase > SQL Editor. Se puede correr más de una vez.
--
-- Lee las sesiones reales de Supabase Auth (auth.sessions) de quien
-- pregunta: navegador, IP recortada, cuándo empezó y la última actividad.
-- Cerrar una sesión borra su fila: ese dispositivo ya no puede renovar el
-- acceso y tiene que volver a entrar (el pase que tenga dura máximo 1 hora).
-- =====================================================================

create or replace function public.mis_sesiones()
returns table (id uuid, user_agent text, ip text, creada timestamptz, ultima_vez timestamptz, actual boolean)
language sql stable security definer set search_path = '' as $$
  select
    s.id,
    left(coalesce(s.user_agent, ''), 300),
    -- IP recortada: suficiente para reconocer la red, sin exponerla completa
    case
      when s.ip is null then null
      when family(s.ip) = 4 then split_part(host(s.ip), '.', 1) || '.' || split_part(host(s.ip), '.', 2) || '.x.x'
      else 'IPv6'
    end,
    s.created_at,
    greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc'),
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
  order by greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc') desc
  limit 20
$$;
revoke all on function public.mis_sesiones() from public, anon;
grant execute on function public.mis_sesiones() to authenticated;

create or replace function public.cerrar_sesion_dispositivo(p_sesion uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  delete from auth.sessions where id = p_sesion and user_id = auth.uid();
  if not found then
    raise exception 'SESION_NO_ENCONTRADA' using errcode = 'P0001', hint = 'Esa sesión ya estaba cerrada.';
  end if;
end $$;
revoke all on function public.cerrar_sesion_dispositivo(uuid) from public, anon;
grant execute on function public.cerrar_sesion_dispositivo(uuid) to authenticated;
