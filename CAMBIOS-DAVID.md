# Cambios de David (rama SubidaDavidClaudeWeb)

Rama base: `dashboard-usuarios-supabase` (commit `a2e2bae`, "Seguridad, estabilidad y rendimiento: fases 1 y 2"), que no se modifica.
Todos los cambios se hicieron desde Claude Code en la web, no desde el computador local de Julián.

## 1. Footer más limpio
- **Qué:** se quitó el párrafo "Responsable: Modo Parche - Proyecto Académico Universitario · … · aviso de IA" del footer.
- **Por qué:** el profesor dijo que el footer tenía demasiado texto.
- **Archivos:** `index.html`, `comercio.html`, `equipo.html`, `marca.html`, `preguntas.html`, `terminos.html`, `privacidad.html`, `cookies.html`, `pagos.html`, `legal.html` y `legal.css` (estilos que ya no se usaban).
- **Nota:** los datos del responsable y el aviso de IA siguen completos en `legal.html` (Información legal).

## 2. Migraciones SQL y pruebas compatibles con Windows (CRLF)
- **Qué:** Git en Windows puede convertir los saltos de línea a CRLF y romper las migraciones que buscan y reemplazan texto dentro de funciones.
- **Archivos:**
  - `.gitattributes` (nuevo): `*.sql text eol=lf`, así los `.sql` siempre quedan con LF.
  - `tests/sql/pgbase.mjs`: normaliza `\r\n` a `\n` al leer cada `.sql` antes de ejecutarlo en PGlite.
  - `supabase/migrations/20261124120000_estabilidad_rendimiento_fase2.sql`: `private.parchear2` normaliza `\r\n` a `\n` en la función que modifica (y en los textos que busca y pone), y lo mismo en el bloque que crea `admin_cuentas_pagina`.
- **Comprobado:** simulando todas las migraciones con CRLF, antes la Fase 2 fallaba en `private.crear_perfil()`. Ahora pasan todas.

## 3. README actualizado a la versión actual
- Se cambió `20261029120000_panel_admin.sql` (ya no existe) por `20261029120001_panel_admin_base.sql`, con una advertencia visible: **no correrlo en la base que ya está en producción**, solo en instalaciones desde cero.
- Nueva sección **"Despliegue de las Fases 1 y 2"**: Fase 1 y luego Fase 2 en el SQL Editor, redespliegue de `wompi-checkout`, `wompi-webhook --no-verify-jwt` y `enviar-push --no-verify-jwt`, y Vercel con `npm run build` → `dist`.
- Nueva sección **"Respaldos de la base"** según `.github/workflows/respaldo.yml`: los 6 secretos, la subida cifrada a Cloudflare R2 / S3 (ya no a los artefactos de GitHub) y cómo restaurar.

## 4. Imágenes de vista previa (Open Graph / WhatsApp)
- **Verificado:** `src/assets/web/banner.jpg` (usada en las 12 páginas con `og:image` y por defecto en `api/p.js`) y `src/assets/web/oficiales/andres-cepeda-og.jpg` existen y quedan copiadas en `dist/` después de `npm run build`.
- **Prueba nueva** en `tests/unit/utilidades.test.mjs`: valida que existen las imágenes de `og:image`/`twitter:image` de las páginas, la imagen por defecto de `api/p.js` y la versión `-og.jpg` de cada afiche oficial `.webp`.

## 5. Verificación final
- `npm run lint`: 0 errores. `npm test`: 20 de 20 en Vitest (incluye 153 + 67 comprobaciones SQL), 0 fallos. `npm run build`: 18 páginas, sin errores.

## 6. Fase 3A: seguridad restante, notificaciones y PWA/móvil
Migración nueva: `supabase/migrations/20261125120000_pulido_seguridad_y_pwa_fase3.sql` (se puede correr más de una vez, no borra datos).

1. **Registro de negocios y anti-spam:** `private.validar_registro()` exige nombre del negocio (≥ 2), responsable (≥ 2) y teléfono (celular 3… o fijo 60…) o NIT válidos. En `private.frenar_spam()` solo los negocios con `verificado = true` abren parches sin tope diario; los demás tienen 6 al día, igual que las personas.
2. **`public.emitir_cupon()`:** con persona exige parche (`FALTA_PARCHE`), revisa bloqueos en los dos sentidos (`BLOQUEADO`), la búsqueda de duplicados usa `parche_id is not distinct from p_parche` y hay un freno de 120 cupones con aviso por negocio cada hora (`private.demasiados_intentos`). `empresa-dashboard.js` ya no manda la persona sin parche.
3. **Depuración automática:** nueva Edge Function `supabase/functions/depurar-archivos` (secreto `x-cron-secret` = `CRON_SECRET` o `PUSH_WEBHOOK_SECRET`, `verify_jwt = false` en `supabase/config.toml`) con las funciones `sistema_archivos_por_borrar` y `sistema_archivos_borrados` (solo `service_role`). Programación diaria lista en `.github/workflows/depurar-archivos.yml` y alternativa con pg_cron en el README.
4. **Contacto:** `equipo.html`/`equipo.js` usan Turnstile (`mp-captcha.js`) y envían a la nueva Vercel Function `api/contacto.js`, que verifica el captcha con `TURNSTILE_SECRET` y guarda con `enviar_contacto_verificado` (solo `service_role`, con la IP real). `enviar_contacto` ya no la puede llamar el navegador. Cada mensaje nuevo crea una notificación para los admins activos (rol admin, no suspendidos).
5. **Wompi:** `wompi-checkout` (confirmar) revisa que sea un negocio o tenga pagos y frena a 20 confirmaciones cada 10 min (`sistema_permitir_intento`) antes de llamar a Wompi. `wompi-webhook` responde 405 a lo que no sea POST y deduce el entorno del prefijo de `WOMPI_EVENTS_SECRET`.
6. **`/p/<id>`:** `parche_publico()` excluye parches terminados y de negocios en mora. `api/p.js` responde 405 a lo que no sea GET/HEAD, `no-store` (503) si Supabase falla y caché corta (60 s) en un 404 real.
7. **Push:** `enviar-push` acepta `([a-z0-9-]+\.)*push\.apple\.com` (igual que `private.push_valido`), manda a `/admin` a los admins, registra con `console.error` los fallos que no son 404/410 y envía `badge` (avisos sin leer). `sw.js` lo pone con `setAppBadge(n)`.
8. **Panel de negocios como PWA:** registra `/sw.js`; `sw.js` guarda `/empresa-dashboard`, su JS y CSS (y lo que necesita) y lo usa sin señal. Sin red, `empresa-dashboard.js` abre la última copia local en **solo lectura** (máx. 7 días, sin chats) en vez de la pantalla de error. Las llegadas marcadas sin señal quedan en una cola y se envían al volver; si el servidor las rechaza, se avisa.
9. **Versión nueva:** `sw.js` ya no se activa solo cuando hay una versión anterior; `MPUtil.registrarSW` (en `mp-utils.js`) escucha `updatefound`/`controllerchange` y los dos paneles muestran «Hay una versión nueva de ModoParche · Actualizar» (estilo `.mp-barra` en `mp-tema.css`).
10. **OCR de la cédula:** Tesseract.js 5.1.1 copiado tal cual del paquete de npm a `src/vendor/tesseract/` (con su licencia Apache-2.0); no se usó SRI porque jsDelivr no se pudo consultar desde aquí para confirmar el hash. Un solo lector para respaldo y frente, y si falla la descarga dice "No se pudo descargar el lector" en vez de culpar la luz de la foto.

**Pruebas:**
- Nueva suite `tests/sql/fase3.mjs` (59 comprobaciones de los puntos 1, 2, 3, 4, 6 y del freno). Sin la migración, 18 de las 29 comprobaciones de los puntos 1 y 2 fallan, así que de verdad detectan errores.
- `tests/unit/utilidades.test.mjs`: de 18 a 47 pruebas (registrarSW, cola, `api/p.js`, `api/contacto.js` y revisión de sw.js, Edge Functions y Tesseract).
- Ajustes en pruebas existentes por el cambio de reglas: en `fase1.mjs` y `fase2.mjs` los negocios de prueba ahora traen responsable y teléfono (y en `fase2.mjs` un NIT de 9 dígitos en vez de 11). En `fase2.mjs` el contacto se prueba como `service_role` (el servidor) en vez de `anon`. Lo que comprueban no cambió.
- `npm run lint`: 0 errores. `npm test`: 50/50 en Vitest (153 + 67 + 59 comprobaciones SQL y 47 unitarias), 0 fallos. `npm run build`: sin errores. Prueba en Chromium: panel de negocios, panel de personas y equipo cargan sin errores de JavaScript y el service worker queda registrado.

## 7. Fase 3B: rendimiento, limpieza, accesibilidad y mantenibilidad
Antes de cambiar nada se comprobó cada punto contra el código. Lo que no era cierto o no convenía, quedó anotado.

11. **Buscador del mapa (`mp-mapa.js`):** un fallo de red/timeout ya no se guarda como `[]` en la caché; caché con máximo 120 entradas y 15 min; `AbortController` cancela la búsqueda anterior; corregida la comilla sobrante del `<input>` y el `<label for>`/`id` (único por buscador). Además se corrigió un error que no estaba en la lista: la búsqueda rápida y la completa compartían clave de caché, así que la completa nunca consultaba Nominatim si la rápida no encontraba nada.
12. **Batería y memoria:** `mp-checkin.js` pausa el QR con la pantalla oculta, limita el aviso de "QR ajeno" a uno cada 1,5 s y prueba otra cámara si no hay trasera. Se liberan las vistas previas `blob:` del álbum (`dashboard.js`), la foto en `prepararFoto()` (`empresa-dashboard.js`, `ImageBitmap.close()` + `revokeObjectURL`) y las fotos de la cédula al cerrar `#modal-verificacion`. El reloj de 1 s del panel de negocios solo corre con un relámpago activo. `mp-captcha.js` rechaza la promesa en `expired-callback`/`timeout-callback`. *No era cierto:* `mp-tema.js` no crea URLs `blob:`.
13. **Imágenes sin uso:** se borraron 23 (7 `.jpg`, 3 `.png`, `orangeprint2*.webp` y 11 stickers sin uso), unos 2,6 MB. 11 stickers que la lista daba por "sin uso" **sí se usan** (`dashboard.js` los arma con `STK('nombre')`): se detectó en la prueba en el navegador y se restauraron; ahora una prueba revisa que existan. `src/assets/fuentes/` (15 MB de originales) se queda en Git y se documentó que nunca se publica.
14. **Hash en `src/vendor/`:** `scripts/build.mjs` copia cada librería JS/CSS con hash en el nombre y cambia las referencias en HTML, JS y `sw.js` (la versión del service worker también cambia si cambia una librería). Se conservan las copias sin hash para `api/seguro.js`. En `vercel.json` la regla de caché inmutable va después de la de `src/vendor/` para que aplique a los archivos con hash.
15. **Carga inicial:** se midió el LCP real en Chromium. `fetchpriority="high"` en la foto principal de `comercio.html` y `equipo.html`; en `index.html` el LCP es texto, así que no se puso. `#lbImg` con dimensiones (las toma de la foto que abre). Quitado `Gagalin-Regular.woff`. Inter ahora es local (`mp-fuentes.css` + `src/assets/fonts/Inter-latin*.woff2`, variable, licencia OFL) y se quitó Google Fonts de las 16 páginas y de la CSP.
16. **Accesibilidad y SEO:** un solo `<h1>` en `login.html` y `empresa.html` (los pasos ahora son `<h2>` con el mismo estilo); `404.html` y `offline.html` con descripción, `noindex` y salto al contenido; `comercios.html` borrado y redirección 301 `/comercios` → `/comercio`; Modo Puerta devuelve el foco y bloquea el fondo (`inert`); `closeDrawer()` del admin revisa `document.contains`. *Ya estaba bien:* los modales de `dashboard.js` ya devolvían el foco con `document.contains`.
17. **Código viejo:** borrados `registro.php` e `includes/`. *No era cierto:* `respaldo-dashboard-anterior/` no estaba en el repositorio; se mantiene en `.gitignore` y `.vercelignore` porque puede existir como copia local.
18. **Dependencias:** eslint 9 → 10, vitest 3 → 5, globals 15 → 17, esbuild 0.25 → 0.28 (lo exige vitest 5). `npm audit`: 0 vulnerabilidades (antes 3, dos críticas). Quitado `@supabase/supabase-js` (nadie lo importa en Node). Se declaró `"engines": { "node": ">=22.12" }`.
19. **ESLint y código muerto:** activados `no-unused-vars` y `eqeqeq` (modo "smart", que deja `== null`). *Medida real:* había 10 variables o funciones sin usar (no 154; las demás eran parámetros) y ninguna comparación `==` débil. Se borraron (`pedirRetracto` incluida: su botón se quitó al pasar al cobro por resultados). Las Edge Functions se revisan compilándolas con esbuild en las pruebas. Los `.catch(() => {})` de cargas importantes registran el fallo (y la bitácora recibe los críticos: registro de exportación del admin, código de referido, plan elegido). `mp-errores.js` usa `window.MP_SUPABASE` y el token de la sesión para que la base anote `usuario_id`.
20. **Menú y pie:** no se pasaron a plantillas. Hay 8 variantes del menú y 5 del pie, casi todas a propósito (color de la página, botón de negocio, página activa); una plantilla tendría que repetir esas variantes y obligaría a compilar para ver cualquier HTML. En su lugar, el build ahora revisa que todo enlace y archivo de cada página exista.

**Para revisar:** `empresa.html` todavía dice "Tienes 5 días hábiles de retracto"; con el cobro por resultados quizá ya no aplica (texto legal: no se tocó).

**Pruebas:** `npm run lint` 0 errores; `npm test` 63/63 en Vitest (53 unitarias nuevas o existentes + las suites SQL con 153 + 67 + 59 comprobaciones), 0 fallos; `npm run build` sin errores y con revisión de enlaces; `npm audit` 0 vulnerabilidades. Las 17 páginas compiladas abren en Chromium sin errores de JavaScript ni archivos faltantes, y ninguna llama a Google.

## 8. Que todo funcione al desplegar (Vercel + Supabase) y mejoras del backend
Lo que antes no se había podido probar, ahora se probó de verdad: Deno 2.9.6 para las Edge Functions, `vercel build` (el mismo proceso de Vercel) y Chromium para la app.

- **Contacto sin configurar nada en Vercel:** `api/contacto.js` se cambió por la Edge Function `supabase/functions/contacto` (Turnstile + `enviar_contacto_verificado`). La llave `service_role` ya no tiene que copiarse a Vercel: todos los secretos viven en Supabase. Si la migración de la Fase 3 todavía no se corrió, la función usa `enviar_contacto` y el formulario no se cae mientras se despliega.
- **Edge Functions probadas:** las 5 pasan `deno check` (tipos) y 32 pruebas de comportamiento contra un Supabase simulado (`tests/edge/`): firma y entorno de Wompi, montos y firma de integridad del pago, freno y "no es tu pago", push (ruta /admin, número del ícono, endpoints inválidos), depuración por bucket y contacto (captcha, IP, bot, origen, CORS). Nuevo `npm run test:edge` y paso en el CI de GitHub (que ahora también corre en `SubidaDavidClaudeWeb`).
- **enviar-push:** si las llaves VAPID quedan mal copiadas responde `503 PUSH_MAL_CONFIGURADO` con un mensaje claro en vez de caerse en cada aviso. El armado del aviso quedó en `armarAviso()` (probado).
- **Vercel:** `vercel build` termina bien. Se corrigió `"engines"`: con `>=22.12` Vercel usaba Node 26 y saltaba solo a cada versión nueva de Node; ahora `>=22.12 <25` (Vercel usa Node 24 fijo y en los computadores sirve Node 22 o 24).
- **Sitio publicado de 51 MB a 13 MB:** el build publicaba ~37 MB de originales de diseño que ninguna página usa (`ads/`, `stickers/`, `dec/`, `insignias/`, `Branding/` en alta). Siguen en Git para el equipo; solo se publican `src/assets/web`, `fonts` y `Branding/favicon`.
- **Revisión del build ampliada:** además de los enlaces de cada página, revisa los íconos del manifiesto y los 36 archivos que guarda el service worker para el modo sin conexión.
- **Privacidad — `es_miembro`:** cualquier cuenta podía preguntar si cualquier persona iba a cualquier parche. Ahora solo responde la verdad a la propia persona, a quien creó el parche, a otro asistente, al equipo o al servidor.
- **Auditoría permanente de la base** (en `tests/sql/fase3.mjs`): toda tabla con RLS, toda función `SECURITY DEFINER` con `search_path` fijo, anónimos solo pueden ejecutar `parche_publico` y `ubicacion_por_token`, y no tienen permisos de tabla.
- **Mensajes de error claros:** los paneles mostraban el código interno de la base (`DEMASIADO_RAPIDO`, `BLOQUEADO`…) en vez de la explicación en español. Ahora muestran la explicación. Al negocio sin verificar que llega a 6 parches al día se le dice que pida la verificación.
- **Probado en Chromium (sitio compilado):** el panel de negocios abre sin conexión; el aviso "Hay una versión nueva de ModoParche · Actualizar" aparece y al tocarlo recarga con la versión nueva; el OCR carga su worker desde el propio sitio y sin red dice "sin conexión" en 0,4 s.
- `vitest.config.mjs`: Vitest corre solo `tests/unit` y `tests/sql` (las de `tests/edge` son de Deno).

**Pruebas:** `npm run lint` 0 errores · `npm test` 57/57 (incluye 153 + 67 + 70 comprobaciones SQL) · `npm run test:edge` 32/32 + `deno check` de las 5 funciones · `npm run build` y `vercel build` sin errores · `npm audit` 0 vulnerabilidades.

## 9. Documentación completa para el otro computador
- **`docs/CONTEXTO-SubidaDavidClaudeWeb.md` (nuevo):** el documento para retomar el trabajo. Trae: ramas, cómo traer esto en Windows, mapa del proyecto, todos los cambios por área (base de datos, Edge Functions, paneles, utilidades, service worker, páginas, build/CI, borrados, dependencias), reglas nuevas que notan los usuarios, tabla de secretos (qué va en Supabase, GitHub y Vercel), despliegue en orden y prueba en Preview, cómo probar, riesgos, solución de problemas, próximas mejoras por prioridad e historial de commits.
- **`CLAUDE.md` (nuevo):** guía corta que Claude Code lee solo al abrir el proyecto (reglas del repositorio, comandos, cosas que no son obvias).
- **`README.md`:** al inicio, un aviso que manda a esos dos documentos.
- **Dato nuevo documentado:** para probar en un despliegue Preview de Vercel hay que agregar ese dominio a `ORIGENES_EXTRA` (Supabase) y al widget de Cloudflare Turnstile; si no, el contacto y los pagos responden 403 y el captcha falla.

## 10. Fase 4: mantenimiento del backend
Migración nueva `supabase/migrations/20261126120000_backend_mantenimiento_fase4.sql` (se puede correr más de una vez). Detalle completo en `docs/CONTEXTO-SubidaDavidClaudeWeb.md`, sección 5.12, y en el README ("Fase 4").

1. **Índices en las 25 claves foráneas que no tenían** (por ejemplo `rutas.usuario_id`, `viajes.usuario_id`, `invitaciones.invitado_id`). Borrar una cuenta o un parche ya no recorre tablas enteras. Se crean con un bloque que revisa todas; una prueba falla si aparece una nueva sin índice.
2. **Retención de datos:** `private.limpieza_retencion()` cada día (pg_cron `modo-parche-retencion`, 3:45 a. m. Colombia). Notificaciones leídas de más de 90 días y sin leer de más de 1 año; contacto archivado de más de 1 año y atendido de más de 2; errores del navegador de más de 30 días. Nunca pagos, cobros, liquidaciones, bitácora ni mensajes sin atender.
3. **Conciliación de pagos:** nueva Edge Function `conciliar-pagos` (secreto `x-cron-secret`, cada hora con `.github/workflows/conciliar-pagos.yml`), con `sistema_pagos_por_conciliar()` y `sistema_pago_abandonado()`. Pregunta a Wompi por los pagos `PENDIENTE` de más de 15 min y los aplica con `aplicar_pago_wompi`. Sin transacción después de 48 h quedan "Abandonado" (si después llega un aviso aprobado, se aplica igual). Opcional: `WOMPI_PRIVATE_KEY` para buscar por referencia.
4. **Salud del backend:** tabla `private.tareas_ejecutadas`, `sistema_anotar_tarea()` (las tareas anotan cuándo corrieron) y `admin_salud()`. Panel admin > Bitácora > "Salud del backend" (`admin.html`, `admin.js` → `verSalud()`, `admin.css`): tareas, pg_cron, pagos sin confirmar, errores, archivos por borrar, contacto sin atender y mora, en verde o naranja. Probado en Chromium.
5. **Tope de tamaño a los JSON de `parches`** (`parches_json_tamano`, NOT VALID): 8 KB `cupon`/`clima`/`demo_regla`, 32 KB `oficial_info`.
6. **Código compartido de Edge Functions:** `supabase/functions/_shared/utilidades.ts`. Las 6 funciones lo usan; se borraron las copias de `mismoSecreto`, `sha256hex`, CORS y cliente. Si falta un secreto de cron o de webhook, responde `503 SIN_CONFIGURAR`.

**Pruebas:** nueva suite `tests/sql/fase4.mjs` (28 comprobaciones: índices, migración que se corre dos veces, retención, conciliación, aviso tardío, permisos, salud, tope de JSON); `tests/edge/conciliar-pagos.test.ts` (7 pruebas); `depurar-archivos` revisa que anote su tarea; 4 pruebas unitarias nuevas. `tests/sql/sql.test.mjs` ahora exige un mínimo de comprobaciones por suite.
Resultado: lint 0 errores · Vitest 62/62 (58 unitarias + 318 comprobaciones SQL) · Edge Functions 39/39 + `deno check` · build sin errores.
