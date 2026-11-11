-- =====================================================================
-- ModoParche · Límites contra spam y bots (rate limiting en la base)
-- Corre en: Supabase > SQL Editor. Se puede correr más de una vez.
--
-- Aunque alguien salte la app y llame la API directo con su sesión,
-- la base frena el abuso:
--   · Chat: máximo 12 mensajes por minuto y 300 por día por persona.
--   · Parches: máximo 6 creados por día por persona (los negocios siguen
--     con el límite de su plan, que ya existía).
--   · Fotos del álbum: máximo 30 por hora.
--   · Ubicación en vivo: máximo 10 enlaces nuevos por hora.
-- Las cuentas de servicio (sin auth.uid(), como el webhook de Wompi) no
-- tienen límite. El error trae errcode P0001 y un hint en español.
-- =====================================================================

create schema if not exists private;

create or replace function private.frenar_spam()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n_corto int;
  n_largo int;
begin
  if uid is null then return new; end if;

  if tg_table_name = 'mensajes' then
    select count(*) filter (where creado_en > now() - interval '1 minute'),
           count(*) filter (where creado_en > now() - interval '1 day')
      into n_corto, n_largo
      from public.mensajes where autor_id = uid and creado_en > now() - interval '1 day';
    if n_corto >= 12 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Vas muy rápido. Espera un momento antes de mandar otro mensaje.';
    end if;
    if n_largo >= 300 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Llegaste al límite de mensajes de hoy. Mañana sigues.';
    end if;

  elsif tg_table_name = 'parches' then
    select count(*) into n_largo
      from public.parches where creador_id = uid and creado_en > now() - interval '1 day';
    if n_largo >= 6 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Ya abriste 6 parches hoy. Mañana puedes abrir más.';
    end if;

  elsif tg_table_name = 'fotos_parche' then
    select count(*) into n_corto
      from public.fotos_parche where usuario_id = uid and creado_en > now() - interval '1 hour';
    if n_corto >= 30 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Subiste muchas fotos seguidas. Espera un rato.';
    end if;

  elsif tg_table_name = 'ubicaciones_vivas' then
    select count(*) into n_corto
      from public.ubicaciones_vivas where usuario_id = uid and creado_en > now() - interval '1 hour';
    if n_corto >= 10 then
      raise exception 'DEMASIADO_RAPIDO' using errcode = 'P0001', hint = 'Creaste muchos enlaces de ubicación. Usa el que ya tienes o espera un rato.';
    end if;
  end if;

  return new;
end $$;
revoke all on function private.frenar_spam() from public, anon, authenticated;

-- Índices para que contar sea barato
create index if not exists mensajes_autor_tiempo_idx on public.mensajes (autor_id, creado_en desc);
create index if not exists parches_creador_tiempo_idx on public.parches (creador_id, creado_en desc);

do $$
declare t text;
begin
  foreach t in array array['mensajes', 'parches', 'fotos_parche', 'ubicaciones_vivas'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists frenar_spam on public.%I', t);
      execute format('create trigger frenar_spam before insert on public.%I for each row execute function private.frenar_spam()', t);
    end if;
  end loop;
end $$;
