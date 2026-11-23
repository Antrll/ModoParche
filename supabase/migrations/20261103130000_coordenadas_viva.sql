-- =====================================================================
-- ModoParche · Coordenada corregida del C.C. Viva Villavicencio
-- Antes: 4.1290, -73.6225 (quedaba lejos del centro comercial)
-- Ahora: 4.125621, -73.638716
-- Se puede correr más de una vez.
-- =====================================================================
update public.parches
   set lat = 4.125621, lng = -73.638716
 where lugar = 'C.C. Viva Villavicencio'
   and abs(lat - 4.1290) < 0.0001 and abs(lng - (-73.6225)) < 0.0001;
