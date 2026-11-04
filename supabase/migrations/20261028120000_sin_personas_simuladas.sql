-- =====================================================================
-- ModoParche · Sin personas simuladas
--
-- Los parches de ejemplo traían "confirmados" de mentira (p1..p16) y
-- mensajes de esas personas. Eso hacía que un parche se viera lleno o
-- con gente que no existe. Desde ahora solo cuentan las cuentas reales.
--
-- Se puede correr más de una vez. No toca parches, miembros ni mensajes
-- de usuarios reales.
-- =====================================================================

-- 1. Sin confirmados de ejemplo: los cupos se calculan solo con miembros reales
update public.parches
set confirmados_demo = '{}'
where coalesce(array_length(confirmados_demo, 1), 0) > 0;

-- 2. Sin mensajes de personas de ejemplo (los de cuentas reales se quedan)
delete from public.mensajes
where autor_id is null
  and autor_demo is not null;
