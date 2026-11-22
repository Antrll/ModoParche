-- =====================================================================
-- ModoParche · ¿Qué migraciones tiene esta base?
--
-- SOLO LEE: no cambia nada. Supabase > SQL Editor > pestaña nueva >
-- pegar todo > Run. Muestra cada migración con "SÍ" (ya está) o
-- "FALTA". Corre las que falten EN ORDEN (de arriba hacia abajo), cada
-- una en una pestaña nueva del SQL Editor.
-- Las marcadas "solo datos" no crean nada que se pueda revisar: correrlas
-- otra vez no hace daño.
-- =====================================================================
with marcas (orden, archivo, tipo, esquema, objeto) as (values
  (1,  '20261022230000_dashboard_usuarios.sql',              'tabla',   'public',  'perfiles'),
  (2,  '20261023120000_coordenadas_reales.sql',              'datos',   null,      null),
  (3,  '20261027120000_cuentas_negocio.sql',                 'tabla',   'public',  'negocios'),
  (4,  '20261028120000_sin_personas_simuladas.sql',          'datos',   null,      null),
  (5,  '20261029120001_panel_admin_base.sql',                'tabla',   'public',  'admins'),
  (6,  '20261030120000_admin_v2.sql',                        'tabla',   'public',  'reportes'),
  (7,  '20261031120000_legal.sql',                           'tabla',   'public',  'consentimientos'),
  (8,  '20261101120000_verificacion_identidad.sql',          'funcion', 'public',  'docs_identidad_subidos'),
  (9,  '20261101130000_negocios_mesa_checkin_pagos.sql',     'tabla',   'public',  'pagos'),
  (10, '20261103120000_calificaciones_cero_y_respuestas.sql','funcion', 'private', 'validar_respuesta'),
  (11, '20261103130000_coordenadas_viva.sql',                'datos',   null,      null),
  (12, '20261104120000_parches_oficiales.sql',               'funcion', 'private', 'limpiar_url'),
  (13, '20261104130000_cepeda_boleteria.sql',                'datos',   null,      null),
  (14, '20261104140000_mejoras_noviembre.sql',               'tabla',   'public',  'push_suscripciones'),
  (15, '20261104150000_seguridad_y_comunidad.sql',           'tabla',   'public',  'qr_identidad'),
  (16, '20261104160000_calificar_por_qr.sql',                'tabla',   'public',  'qr_escaneos'),
  (17, '20261111120000_anti_spam.sql',                       'funcion', 'private', 'frenar_spam'),
  (18, '20261112120000_cuenta_y_comunidad.sql',              'tabla',   'public',  'bloqueos'),
  (19, '20261117120000_perfil_dispositivos.sql',             'funcion', 'public',  'mis_sesiones'),
  (20, '20261118120000_cobro_por_resultados.sql',            'tabla',   'public',  'cobros'),
  (21, '20261119120000_pago_liquidaciones_wompi.sql',        'columna', 'public',  'pagos.liquidacion_id'),
  (22, '20261120120000_mejoras_cobro.sql',                   'tabla',   'public',  'reclamos_cobro'),
  (23, '20261121120000_amigos.sql',                          'tabla',   'public',  'amistades'),
  (24, '20261122120000_coordenadas_corregidas.sql',          'datos',   null,      null),
  (25, '20261123120000_seguridad_y_antifraude_fase1.sql',    'tabla',   'private', 'intentos'),
  (26, '20261124120000_estabilidad_rendimiento_fase2.sql',   'tabla',   'public',  'mensajes_contacto'),
  (27, '20261125120000_pulido_seguridad_y_pwa_fase3.sql',    'funcion', 'public',  'sistema_archivos_por_borrar'),
  (28, '20261126120000_backend_mantenimiento_fase4.sql',     'tabla',   'private', 'tareas_ejecutadas')
)
select m.orden, m.archivo,
  case
    when m.tipo = 'datos' then 'solo datos (se puede correr otra vez)'
    when m.tipo = 'tabla' and to_regclass(m.esquema || '.' || m.objeto) is not null then 'SÍ'
    when m.tipo = 'funcion' and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                          where n.nspname = m.esquema and p.proname = m.objeto) then 'SÍ'
    when m.tipo = 'columna' and exists (select 1 from information_schema.columns c
                                          where c.table_schema = m.esquema and c.table_name = split_part(m.objeto, '.', 1)
                                            and c.column_name = split_part(m.objeto, '.', 2)) then 'SÍ'
    else 'FALTA'
  end as estado
from marcas m
order by m.orden;
