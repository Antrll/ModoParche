-- =====================================================================
-- ModoParche · Coordenadas corregidas de tres lugares
-- Corre en: Supabase > SQL Editor. Se puede correr más de una vez.
--
-- Tres lugares estaban hasta 2,8 km corridos en el mapa:
--   C.C. Primavera Urbana ......... 4.13468, -73.64046 (antes 4.1348, -73.6206: caía en Bello Horizonte)
--   Mirador La Piedra del Amor .... 4.17173, -73.67540 (antes 4.1585, -73.6540)
--   C.C. Viva Villavicencio ....... 4.125621, -73.638716 (antes 4.1290, -73.6225)
-- Se corrigen los parches de ejemplo y también los que alguien creó en ese
-- lugar con las coordenadas viejas (solo si están exactamente en el punto viejo).
-- =====================================================================

update public.parches set lat = 4.13468, lng = -73.64046
 where abs(lat - 4.1348) < 0.0005 and abs(lng - (-73.6206)) < 0.0005;

update public.parches set lat = 4.17173, lng = -73.67540
 where abs(lat - 4.1585) < 0.0005 and abs(lng - (-73.6540)) < 0.0005;

update public.parches set lat = 4.125621, lng = -73.638716
 where abs(lat - 4.1290) < 0.0005 and abs(lng - (-73.6225)) < 0.0005;

-- Negocios registrados con el punto viejo de esos centros comerciales
update public.negocios set lat = 4.13468, lng = -73.64046
 where lat is not null and abs(lat - 4.1348) < 0.0005 and abs(lng - (-73.6206)) < 0.0005;
update public.negocios set lat = 4.125621, lng = -73.638716
 where lat is not null and abs(lat - 4.1290) < 0.0005 and abs(lng - (-73.6225)) < 0.0005;
