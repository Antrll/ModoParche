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
