  📍 ModoParche
"ModoParche" es una plataforma regional diseñada para conectar personas con planes, actividades y experiencias en su ciudad. Su objetivo es solucionar una situación cotidiana: querer salir, hacer algo diferente o conocer personas, pero no saber qué hacer, con quién hacerlo o dónde ir.

Los usuarios pueden descubrir planes cercanos, crear su propio parche, unirse a actividades existentes y encontrar personas con intereses, horarios y presupuestos compatibles. Una de sus principales funcionalidades es Open the Parche, que permite crear encuentros abiertos para que otros usuarios puedan unirse.

El proyecto busca diferenciarse mediante un enfoque basado en la intención: el usuario puede indicar qué quiere hacer, cuándo, cuánto desea gastar y qué tan lejos está dispuesto a desplazarse, y Parchemos le ayuda a encontrar o construir el plan adecuado.

Inicialmente, Parchemos está enfocado en Villavicencio y el Meta, con una visión de crecimiento hacia otras ciudades de Colombia. Además de conectar usuarios, la plataforma busca integrar negocios y emprendimientos locales para promover experiencias, actividades y promociones.

🎯 Misión

Conectar personas, planes y negocios locales de forma sencilla, creando oportunidades para compartir experiencias y aprovechar mejor las actividades de cada ciudad.

🌎 Visión

Convertir a Parchemos en una plataforma líder de experiencias sociales locales en Colombia, comenzando en Villavicencio y creciendo hacia otras ciudades. Buscamos transformar la pregunta “¿qué hacemos?” en una oportunidad para descubrir, crear y compartir nuevas experiencias.

🔥 “You Open the Parche?” 

---

## Dashboard de usuarios con Supabase

El panel (`dashboard.html`) es para usuarios con cuenta. El login y el registro (`login.html`) usan Supabase Auth.

### Activar la base de datos (una sola vez)

1. Entra a tu proyecto en Supabase y abre **SQL Editor > New query**.
2. Pega y corre (**Run**), en este orden, los archivos de `supabase/migrations/`:
   - `20261022230000_dashboard_usuarios.sql`: tablas, seguridad, triggers y parches de ejemplo.
   - `20261023120000_coordenadas_reales.sql`: deja 8 parches de ejemplo en coordenadas reales de Villavicencio.
   - `20261027120000_cuentas_negocio.sql`: activa las cuentas de negocio (tabla `negocios`, plan elegido, sello de aliado en sus parches y límite de 2 parches al mes en el plan básico).
   - `20261028120000_sin_personas_simuladas.sql`: quita los confirmados y mensajes de personas de ejemplo. Desde aquí los cupos y el chat solo cuentan cuentas reales.
3. En **Authentication > URL Configuration** agrega la URL del sitio (por ejemplo la de Vercel) en *Site URL* y en *Redirect URLs*, para que el enlace de confirmación del correo vuelva al dashboard.

El script se puede correr más de una vez. Crea perfiles, parches, chat, rutas, notificaciones, calificaciones y parceros frecuentes con seguridad por filas (RLS). Las tablas viejas del prototipo (`parches`, `parche_miembros`, `usuarios`, `intereses_usuario`) quedan renombradas como `legacy_*` y sin acceso público. No se borra ningún dato.

### Archivos

| Archivo | Qué hace |
| --- | --- |
| `supabase-client.js` | Crea el cliente de Supabase con la llave pública (anon). |
| `login.js` | Registro en 3 pasos e inicio de sesión con Supabase Auth. |
| `dashboard.js` | Inicio con las funciones principales, mapa en tiempo real con GPS, mis parches con chat y vaca, y perfil con foto opcional (sin avatares). Lee y guarda en Supabase y escucha cambios en tiempo real. De los parches de ejemplo de la base solo muestra 2. |
| `supabase/migrations/` | Esquema, seguridad, triggers y parches de ejemplo de Villavicencio. |

### Cuentas de negocio

Cada negocio crea su propia cuenta en `empresa.html` (datos del local, acceso y plan: Parche básico, Parche Villavo o Varias sedes). No hace falta que un administrador la cree. Entra a `empresa-dashboard.html`, que solo muestra su propio local. Los parches que publica (con foto opcional) se guardan en Supabase y aparecen en el radar de los usuarios con el sello de aliado.

| Página | Qué es |
| --- | --- |
| `empresa.html` / `empresa.js` | Crear cuenta de negocio en 3 pasos y entrar como negocio. |
| `empresa-dashboard.html` | Panel del negocio. `?demo=1` abre un local de ejemplo. |
| `preguntas.html` | Preguntas frecuentes con buscador y filtros. |
| `marca.html` | Identidad de marca: logo, colores, tipografía, gráficos, stickers, insignias y voz. |
| `paginas.css` / `paginas.js` | Estilos y comportamiento de las páginas nuevas. |
| `src/assets/web/stk/` | Stickers, insignias y trazos de la marca en WebP liviano (sin estirar). Solo se usan dentro del dashboard del usuario. |
| `404.html` | Página de error con la marca (Vercel la muestra sola). |

`login.html#crear` abre directo el registro de personas; `empresa.html#entrar` abre el acceso de negocios.

### Modo demo

`dashboard.html?demo=1` abre el panel con 2 parches de ejemplo guardados solo en el navegador, sin cuenta ni conexión a la base de datos. `#mapa`, `#mis` y `#perfil` abren esa sección directo.

### Verificación, Modo Mesa, llegada al parche y pagos (noviembre 2026)

Correr en el SQL Editor, en este orden, después de las migraciones anteriores:

1. `20261101120000_verificacion_identidad.sql`: bucket privado `documentos_identidad`, políticas por carpeta `cedulas/{usuario_id}/`, columnas `cedula_frontal_path`, `cedula_trasera_path` y `cedula_verificada` (en `perfiles_privados`, porque la tabla `usuarios` del prototipo quedó como `legacy_usuarios`), sello público `perfiles.verificado`, función `verificar_mi_cedula()` y candado: sin cédula verificada no se abren parches.
2. `20261101130000_negocios_mesa_checkin_pagos.sql`: horarios y cupones del negocio en la base (una cuenta nueva arranca sin ninguno), planes protegidos (solo suben pagando), tabla `pagos`, Modo Mesa (`mesa_promos`, `mesa_reservas`), check-in verificado por QR o GPS y tiempo real.

| Archivo | Qué hace |
| --- | --- |
| `mp-verificacion.js` / `.css` | Modal "Verifica tu cédula": compresión en `<canvas>` a 80–100 KB (WebP o JPEG, máx. 1200 px), lectura del código del respaldo (BarcodeDetector, ZXing-js y Tesseract.js por CDN) y subida al bucket privado. Se pide solo al abrir un parche o al pedir la insignia. |
| `mp-checkin.js` | QR de llegada que cambia cada 30 s (qrcode-generator) y escáner con la cámara (html5-qrcode). |
| `mp-mapa.js` / `.css` | Buscador de lugares y direcciones en todos los mapas (Photon y Nominatim de OpenStreetMap, gratis), dirección del pin al soltarlo, ubicación del local a partir de su dirección y GPS que espera la mejor precisión. |
| `supabase/functions/wompi-checkout` | Crea el cobro y la firma de integridad de Wompi (el secreto nunca llega al navegador) y confirma transacciones. |
| `supabase/functions/wompi-webhook` | Recibe los eventos de Wompi, revisa la firma y sube el plan por 30 días. |

### Gestos y animaciones del panel (noviembre 2026)

Correr en el SQL Editor después de las anteriores: `20261103120000_calificaciones_cero_y_respuestas.sql`. Hace dos cosas:

- **Calificaciones desde 0.** Una cuenta nueva arranca en 0 (antes 5,0) y solo sube cuando alguien la califica. Las cuentas sin calificaciones quedan en 0. El perfil muestra "0,0 · Aún nadie te ha calificado".
- **Responder mensajes.** Columna `mensajes.responde_a`. Si la migración no se ha corrido, el chat sigue funcionando y la respuesta sale sin la cita guardada.

| Gesto | Dónde | Cómo funciona |
| --- | --- | --- |
| Swipe to reply | Chat | Desliza un mensaje a la derecha para responderlo. En computador, botón de responder al pasar el mouse. Tocar la cita lleva al mensaje original. |
| Reveal actions | Mis parches | Desliza un parche a la izquierda: Mapa, Salir (o Editar y Cancelar si es tuyo). La primera vez la fila se asoma para enseñar el gesto. |
| Icon expand | Buscador del inicio | El ícono se despliega en buscador. `/` lo abre y `Esc` lo cierra. |
| Gooey drop y swipe to dismiss | Avisos | Caen como una gota desde la barra superior y se cierran deslizándolos de lado. Con el mouse encima no se cierran solos. |
| Hold to confirm | Botón "Caerle" | Mantén presionado hasta que se llene para confirmar asistencia. Con teclado: mantener Enter o Espacio. Con lector de pantalla confirma directo. |
| Pull to refresh | Celular | Jala hacia abajo desde arriba: el logo gira, el anillo se llena y recarga los parches. |
| Ripple ring | Botones | Un anillo sale del punto que tocas (negro sobre superficies naranjas). |

Todo usa `transform` y `opacity`, respeta "reducir movimiento" del sistema y vibra levemente en celulares que lo permiten. El código está en la sección 14 de `dashboard.js` y la 13 de `dashboard.css`.

### Parches oficiales y eliminar parche (noviembre 2026)

Correr en el SQL Editor, en este orden: `20261103130000_coordenadas_viva.sql`, `20261104120000_parches_oficiales.sql` y `20261104130000_cepeda_boleteria.sql` (datos reales de La Tiquetera: Coliseo Las Malocas, General $100.000, VIP $160.000, Platino menores $255.000, palcos para 10 de $3.100.000 a $4.200.000).

- **Parche oficial del mes.** Cada mes el equipo arma al menos un parche grande (conciertos y festivales). Sale primero en el inicio, en grande, con cuenta regresiva y dos boletos: **Comprar entrada** y **Comprar palco**. Los botones abren la boletería oficial en otra pestaña: ModoParche no vende boletas ni recibe ese dinero. Sin enlace, el boleto dice "Pronto a la venta". Si el sitio está "Por confirmar", no sale en el mapa.
- **Primer oficial:** Andrés Cepeda, sábado 28 de noviembre de 2026, 7:00 p. m., 1.000 cupos. Sitio, precios y enlaces quedan por confirmar.
- **Panel admin > Parches > Oficiales:** botón "Nuevo parche oficial" y "Editar" para poner sitio, coordenadas, precios, enlaces de compra y personas por palco. Solo los admins (función `admin_guardar_oficial`); ninguna cuenta puede marcar su parche como oficial. Los oficiales aceptan hasta 20.000 cupos (los normales, 60).
- **Eliminar parche:** quien lo organiza lo borra desde la tarjeta (ícono de basura), desde "Editar parche", desde el chat o deslizando el parche en Mis parches. Pide confirmación y les llega un aviso a quienes iban.

### Mejoras de noviembre 2026

Correr `20261104140000_mejoras_noviembre.sql` en el SQL Editor (después de las anteriores).

| Mejora | Cómo funciona |
| --- | --- |
| Compartir | Botón en cada tarjeta, en el chat y en el oficial. Comparte `https://…/p/<id>`: una página (`api/p.js`) con la vista previa para WhatsApp (foto, título, cuándo y dónde) que lleva al parche. Si la persona no ha entrado, lo abre después del login. |
| Calificar | Hasta 7 días después de un parche con check-in sale "¿Cómo estuvo?": estrellas y "Volvería a parchar" por cada persona. La base exige check-in, que la persona haya estado en ese parche y el plazo. |
| Filtros | Hoy, Gratis, A 3 km (con GPS) y categorías, con conteo, encima de "Abiertos ahora". |
| Foto del parche | Cualquier persona puede poner una foto (se achica a 1280 px antes de subirla al bucket `fotos`). La base solo acepta fotos de la carpeta de quien creó el parche. |
| App instalable | `manifest.webmanifest` y `sw.js`: se instala desde el navegador (Perfil > App y avisos) y abre sin señal con lo último guardado. |
| Avisos push | Perfil > App y avisos. Ver "Activar los avisos push" abajo. |
| Más rápido | Leaflet (los mapas) ya no bloquea la carga: se baja cuando se abre un mapa o cuando el navegador está libre. Caché larga para imágenes en `vercel.json`. |
| Historial de oficiales | "Oficiales anteriores" al final del inicio, con afiche y cuántos fueron. |
| Parches grandes | En los oficiales, el chat tiene pestañas Todo, Anuncios y la localidad de cada quien (General, VIP, Palco…). Cada persona elige su localidad y se ve junto a su nombre. |
| Afiche del oficial | `src/assets/web/oficiales/andres-cepeda.webp` (y `-og.jpg` para compartir). En el panel admin se cambia en el campo "Afiche". |

### Seguridad y comunidad (noviembre 2026)

Correr `20261104150000_seguridad_y_comunidad.sql` en el SQL Editor (después de `20261104140000_mejoras_noviembre.sql`).

| Función | Dónde | Cómo funciona |
| --- | --- | --- |
| Ayuda (123) | Botón rojo "Ayuda" arriba y escudo en cada chat | Llamar al 123 (Policía) o a la Línea 155, enviar tu ubicación por WhatsApp a tu contacto de confianza, compartir tu ubicación en vivo y verificar a alguien con QR. |
| Emergencia para negocios | Botón "Emergencia" en el panel de empresas (`mp-seguridad-biz.js`) | 123, Línea 155 y "Verificar cliente" con su QR. |
| Consejos de seguridad | Inicio, chat de parches próximos, aviso cada 12 h y panel de empresas | Cambian cada día. |
| QR de identidad | Perfil > "Mi QR de identidad" y "Verificar a alguien" | Cambia cada 30 s. Quien lo escanea ve nombre, foto (si la muestras), cédula verificada sí/no, calificación y parches con llegada. Nunca el número de cédula. |
| Ubicación en vivo | Ayuda > Compartir mi ubicación en vivo | Enlace `/seguro/<token>` (`api/seguro.js`) que tu contacto abre sin cuenta. Se actualiza cada 20 s, dura máximo 8 horas y se puede apagar. |
| Lista de espera | Parches llenos: "Avísame si se libera" | Cuando alguien se sale, la primera persona de la lista recibe un aviso. |
| Invitar parceros | Chat > Invitar parceros | Lista de personas con las que has compartido parches; les llega una notificación. |
| Transporte | Chat > Transporte | Ofrecer puestos (carro, moto o taxi compartido) o irte con alguien. El conductor recibe aviso. |
| Encuestas | Chat > Encuesta | 2 a 5 opciones, resultados en vivo, se puede cambiar el voto. |
| Álbum | Chat > Álbum | Fotos del parche, solo para quienes están dentro. Máximo 30 por persona. |
| Para ti | Inicio | Recomienda según tus gustos, tus parceros, la distancia y el día. |
| Clics a la boletería | Panel admin > Parches > Oficiales | Cuántas personas tocaron "Comprar entrada" y "Comprar palco". |
| Modo oscuro | Perfil > Como el celular / Claro / Oscuro | Sin parpadeo al cargar; el parche oficial y el saludo conservan sus colores. |

#### Activar los avisos push

1. Las llaves están en `.env.local` (no se sube a git ni a Vercel). La pública ya está en `dashboard.js`.
2. Supabase > Edge Functions > Secrets: crear `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `PUSH_WEBHOOK_SECRET` con los valores de `.env.local`.
3. Publicar la función: `supabase functions deploy enviar-push --no-verify-jwt` (o crearla en el editor de Edge Functions con el código de `supabase/functions/enviar-push/index.ts`).
4. Supabase > Database > Webhooks > Create: tabla `notificaciones`, evento `INSERT`, tipo "Supabase Edge Functions", función `enviar-push`, y un encabezado `x-webhook-secret` con el valor de `PUSH_WEBHOOK_SECRET`.

Mientras no esté configurado, activar los avisos guarda la suscripción pero no llega nada.

#### Activar los pagos con Wompi

1. Crear la cuenta de comercio en [comercios.wompi.co](https://comercios.wompi.co) y copiar, en *Desarrolladores*, la llave pública, el secreto de integridad y el secreto de eventos (primero las de prueba: `pub_test_`, `test_integrity_`, `test_events_`).
2. Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref quxqqxnowlwiahorifpy
   supabase secrets set WOMPI_PUBLIC_KEY=pub_test_xxx WOMPI_INTEGRITY_SECRET=test_integrity_xxx WOMPI_EVENTS_SECRET=test_events_xxx
   supabase functions deploy wompi-checkout
   supabase functions deploy wompi-webhook --no-verify-jwt
   ```
3. En Wompi > *Desarrolladores* > *URL de eventos*: `https://quxqqxnowlwiahorifpy.supabase.co/functions/v1/wompi-webhook`.
4. Probar con las tarjetas de prueba de Wompi (por ejemplo 4242 4242 4242 4242).

**Solo modo de pruebas.** ModoParche es un proyecto académico sin ánimo de lucro: los pagos usan las llaves de prueba de Wompi y nunca se cobra dinero real. La función `wompi-checkout` rechaza las llaves de producción (`pub_prod_`) salvo que se active a propósito el secreto `PERMITIR_COBROS_REALES=si`, cosa que no se debe hacer mientras sea un prototipo.

Precio: `PRECIO_VILLAVO_CENTAVOS` (por defecto `8900000` = $89.000). Mientras Wompi no esté configurado, el panel lo dice claramente y no cobra nada.

### Panel de administración

`admin.html` es el centro de control del equipo: métricas de toda la plataforma (con gráficas de 30 días, embudo, mapa de calor de horarios, categorías, ciudades y gustos), personas, negocios, parches, mapa en vivo, moderación de chats, anuncios y bitácora. Se actualiza en tiempo real.

- **Se entra por el mismo login** (`login.html`). Si la cuenta es admin, la manda sola a `admin.html`.
- **Los admins solo se crean desde la base de datos.** La tabla `admins` no tiene permiso de escritura desde la app; quién es admin nunca depende de datos que el usuario pueda editar.
- Activar: correr `supabase/migrations/20261029120000_panel_admin.sql` en el SQL Editor. Crea la tabla, los permisos, las funciones del panel y los 2 primeros admins.
- Crear otro admin: `select private.crear_admin('correo@dominio.com', 'ContraseñaSegura123', 'Nombre');`
- Volver admin a una cuenta existente: `select private.crear_admin('correo@existente.com', null, 'Nombre');`
- Quitar el rol: `delete from public.admins where id = (select id from auth.users where email = 'correo@dominio.com');`
- Todo lo que hace un admin (suspender, retirar parches, borrar mensajes, cambiar planes, anuncios) queda en la bitácora.
- `admin.html?demo=1` abre el panel con datos de ejemplo, sin tocar la base (`&rol=moderador` lo muestra como lo ve un moderador). Atajos: `/` busca, `1`–`9` cambian de sección.

#### Panel admin v2 (`20261030120000_admin_v2.sql`)

| Función | Qué hace |
| --- | --- |
| Roles | **Admin** hace todo. **Moderador** resuelve reportes, borra mensajes, deja notas, advierte y anula calificaciones; no ve cédulas ni teléfonos, no suspende, no verifica, no cambia planes ni edita parches. Se asignan solo desde SQL: `select private.crear_admin('correo', 'Clave123', 'Nombre', 'moderador');` |
| Reportes | Botón de bandera en el chat (mensaje), en la lista de asistentes (persona) y en la cabecera del chat (parche). Llegan en vivo al admin; al resolver, quien reportó recibe un aviso. Máximo 15 reportes al día por cuenta y sin duplicados. |
| Verificar negocios | Sello que solo da un admin. Se ve en los parches del negocio en el panel de usuarios. |
| Notas y advertencias | En la ficha de cada cuenta. Las notas solo las ve el equipo; las advertencias le llegan a la persona y no se pueden borrar. |
| Rango de fechas e informe | 7, 30, 90 días, 12 meses o fechas propias, comparado con el periodo anterior. "Informe PDF" abre un informe listo para imprimir o guardar como PDF. |
| Reputación | Calificaciones con "pelea cruzada" o "racha de castigo" marcadas; se pueden anular y la reputación se recalcula. |
| Retención | Tabla por semana de registro: qué parte de la gente vuelve a usar la app. |
| Editar parches | Cualquier parche o ejemplo (título, fecha, lugar, cupos, costo, categoría). En el chat se avisa que el equipo hizo el cambio. |
