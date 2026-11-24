-- =====================================================================
-- ModoParche · Insignias: toda cuenta nueva arranca en 0 y solo cuentan
-- parches reales (nunca parches de ejemplo/demo).
-- =====================================================================
create or replace function public.mis_insignias()
returns text[] language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v text[];
begin
  if uid is null then raise exception 'SIN_SESION' using errcode = '42501'; end if;
  insert into public.usuario_insignias (usuario_id, insignia)
  select uid, x.k from (
    select 'medalla-el-armador' k where exists (
      select 1 from public.parches p where p.creador_id = uid and not p.demo
    )
    union all select 'medalla-firme-parche' where (
      select count(*) from public.parche_miembros m
      join public.parches p on p.id = m.parche_id
      where m.usuario_id = uid and not p.demo and p.creador_id is distinct from uid
    ) >= 3
    union all select 'medalla-cero-fantasma' where exists (
      select 1 from public.parche_miembros m
      join public.parches p on p.id = m.parche_id
      where m.usuario_id = uid and m.checkin and not p.demo
    )
    union all select 'medalla-buena-vibra' where exists (
      select 1 from public.perfiles f where f.id = uid and f.resenas >= 3 and f.rating >= 4.5
    )
    union all select c.k from (values
      ('medalla-rumbero-oficial', 'rumba'),
      ('medalla-catador-bajon', 'comida'),
      ('medalla-crack-deporte', 'deportes'),
      ('medalla-rey-mirador', 'pueblear')
    ) c(k, cat)
      where exists (
        select 1 from public.parche_miembros m
        join public.parches p on p.id = m.parche_id
        where m.usuario_id = uid and not p.demo and p.categoria = c.cat
      )
  ) x
  on conflict do nothing;
  select coalesce(array_agg(insignia), '{}') into v from public.usuario_insignias where usuario_id = uid;
  return v;
end $$;
revoke all on function public.mis_insignias() from public, anon;
grant execute on function public.mis_insignias() to authenticated;
