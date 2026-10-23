-- =====================================================================
-- Modo Parche · Parches de ejemplo en coordenadas reales de Villavicencio
--
-- Cómo aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Requiere haber corrido antes 20261022230000_dashboard_usuarios.sql.
-- Se puede correr más de una vez.
--
-- Deja 8 parches de ejemplo, uno por lugar real:
--   Discoteca Los Capachos ......... 4.1165, -73.6508  (Km 4 Vía Acacías)
--   C.C. Primavera Urbana .......... 4.1348, -73.6206  (Calle 15 # 40-01)
--   Parque Los Fundadores .......... 4.1242, -73.6395  (Entrada sur / Av. 40)
--   Mirador La Piedra del Amor ..... 4.1585, -73.6540  (Vía Antigua a Bogotá)
--   Parque Siete de Agosto ......... 4.1462, -73.6335
--   C.C. Viva Villavicencio ........ 4.1290, -73.6225  (Av. 40)
--   Parque del Hacha ............... 4.1488, -73.6382  (Centro)
--   Vereda El Carmen ............... 4.1410, -73.6615  (inicio sendero ecológico)
-- Solo toca filas con demo = true; los parches de los usuarios no cambian.
-- =====================================================================

-- 1. Quitar los ejemplos que no tienen un lugar real asignado
delete from public.parches
where demo and titulo in (
  'Café de origen en el Siete de Agosto',
  'Ruta en bici a Restrepo',
  'Caminata perruna en La Grama',
  'Toque de joropo y rock en Las Malocas',
  'Taller de cerámica llanera',
  'Torneo de FIFA y pizza'
);

-- 2. Mover cada ejemplo a su lugar real (los nombres viejos y nuevos funcionan)
update public.parches set
  lugar = 'Discoteca Los Capachos', barrio = 'Km 4 Vía Acacías', lat = 4.1165, lng = -73.6508
where demo and titulo = 'Rumba en Los Capachos';

update public.parches set
  lugar = 'C.C. Primavera Urbana', barrio = 'Calle 15 # 40-01', lat = 4.1348, lng = -73.6206
where demo and titulo = 'Cine y arcade en Primavera Urbana';

update public.parches set
  lugar = 'Parque Los Fundadores', barrio = 'Entrada sur, Av. 40', lat = 4.1242, lng = -73.6395
where demo and titulo = 'Tarde de frisbee y picnic';

update public.parches set
  lugar = 'Mirador La Piedra del Amor', barrio = 'Buenavista, Vía Antigua a Bogotá', lat = 4.1585, lng = -73.6540,
  demo_regla = '{"dias": 2, "hora": "16:30"}'
where demo and titulo = 'Atardecer en la Piedra del Amor';

update public.parches set
  titulo = 'Micro en el Parque Siete de Agosto',
  descripcion = 'Faltan poquitos para completar los dos equipos. Nivel recocha, nada de ponerse bravos.',
  lugar = 'Parque Siete de Agosto', barrio = 'Barrio Siete de Agosto', lat = 4.1462, lng = -73.6335
where demo and titulo in ('Micro en La Bombonera', 'Micro en el Parque Siete de Agosto');

update public.parches set
  titulo = 'Hora feliz 2x1 en el C.C. Viva', creador_nombre = 'Terraza C.C. Viva',
  descripcion = '2x1 en cócteles mientras dure la hora feliz. Terraza al aire libre y buena música.',
  lugar = 'C.C. Viva Villavicencio', barrio = 'Av. 40', lat = 4.1290, lng = -73.6225,
  cupon = '{"comercio": "Terraza C.C. Viva", "desc": "2x1 en la primera ronda", "codigo": "PARCHE2X1"}'
where demo and titulo in ('Hora feliz 2x1 en La Terraza Llanera', 'Hora feliz 2x1 en el C.C. Viva');

update public.parches set
  descripcion = 'Pandeyuca, empanadas de pipián y cerramos con una mamona por el centro.',
  lugar = 'Parque del Hacha', barrio = 'Centro', lat = 4.1488, lng = -73.6382
where demo and titulo = 'Ruta de antojos llaneros';

update public.parches set
  titulo = 'Caminata ecológica en la Vereda El Carmen', categoria = 'rio',
  descripcion = 'Sendero ecológico entre quebradas y monte llanero. Botas, agua y bloqueador.',
  lugar = 'Vereda El Carmen', barrio = 'Inicio del sendero ecológico', lat = 4.1410, lng = -73.6615,
  costo = 0, presupuesto = 0, demo_regla = '{"dias": 4, "hora": "07:00"}'
where demo and titulo in ('Paseo de olla al Guatiquía', 'Caminata ecológica en la Vereda El Carmen');

-- 3. Actualizar los nombres de lugar en los mensajes de ejemplo y del bot
update public.mensajes m set texto = replace(replace(replace(replace(m.texto,
    'Canchas Sintéticas La Bombonera', 'Parque Siete de Agosto'),
    'Los Capachos Bar', 'Discoteca Los Capachos'),
    'Plaza de mercado San Isidro', 'Parque del Hacha'),
    'La Terraza Llanera', 'Terraza C.C. Viva')
from public.parches p
where p.id = m.parche_id and p.demo and m.tipo in ('bot', 'sys');

-- Los mensajes de la olla no aplican a la caminata
update public.mensajes m set texto = v.nuevo
from public.parches p,
     (values ('Yo llevo la leña', 'Lleven agua y bloqueador'),
             ('¿Hay que llevar bloqueador? Obvio', '¿Hay que llevar botas?'),
             ('Ojo con la corriente, nada de hacerse el valiente', 'Ojo con el barro después de la lluvia')) v(viejo, nuevo)
where p.id = m.parche_id and p.demo and p.titulo = 'Caminata ecológica en la Vereda El Carmen' and m.texto = v.viejo;

-- Quitar la ruta de carro que era del paseo de olla
delete from public.rutas r using public.parches p
where p.id = r.parche_id and p.demo and p.titulo = 'Caminata ecológica en la Vereda El Carmen' and r.usuario_id is null;
