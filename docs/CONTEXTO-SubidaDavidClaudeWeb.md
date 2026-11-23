# Contexto completo de la rama `SubidaDavidClaudeWeb`

> Documento para quien siga el trabajo desde otro computador (por ejemplo, el de Julián) o desde otra sesión de Claude.
> Explica **qué se cambió, dónde, cómo funciona, qué pasa con los usuarios, cómo desplegarlo y cómo probarlo**.
> El detalle cronológico, punto por punto, está en [`CAMBIOS-DAVID.md`](../CAMBIOS-DAVID.md).
> **Para retomar con Claude:** pega el mensaje de [`docs/MENSAJE-PARA-CLAUDE.md`](MENSAJE-PARA-CLAUDE.md) como primer mensaje.

---

## 1. Resumen en un minuto

- Todo el trabajo está en la rama **`SubidaDavidClaudeWeb`**, hecho por David desde Claude Code en la web (no desde el computador de Julián).
- Parte de **`dashboard-usuarios-supabase`** (commit `a2e2bae`, "Seguridad, estabilidad y rendimiento: fases 1 y 2"), que **no se modificó**.
- **Nada está en producción todavía.** El sitio y la base solo cambian cuando se haga el despliegue de la sección 7.
- Qué trae, en grande:
  1. Footer más limpio (pedido del profe).
  2. Compatibilidad con Windows (saltos de línea en los `.sql`).
  3. **Fase 3A:** seguridad (registro de negocios, cupones, contacto con captcha, pagos de Wompi), notificaciones y el panel de negocios como app que abre sin señal.
  4. **Fase 3B:** rendimiento, limpieza de archivos, accesibilidad, dependencias al día y ESLint más estricto.
  5. **Despliegue probado:** el formulario de contacto pasó a una Edge Function, hay pruebas reales de las Edge Functions, el sitio publicado bajó de 51 MB a 13 MB y se corrigió una fuga de privacidad.
  6. **Fase 4, mantenimiento del backend:** índices en todas las claves foráneas, retención de datos viejos, conciliación automática de pagos con Wompi, revisión de salud en el panel admin, tope de tamaño a los JSON y código compartido entre Edge Functions.
- Estado de las pruebas: lint con 0 errores, 62/62 en Vitest (58 unitarias + 4 suites SQL con 318 comprobaciones), 39/39 pruebas de Edge Functions con Deno, `npm run build` y `vercel build` sin errores, y `npm audit` con 0 vulnerabilidades.

## 2. Ramas: qué es cada una

| Rama | Qué es | ¿Se toca? |
| --- | --- | --- |
| `dashboard-usuarios-supabase` | Última versión antes de este trabajo (Fases 1 y 2). | **No.** Queda como estaba. |
| `SubidaDavidClaudeWeb` | **Todo el trabajo nuevo.** Es la que hay que revisar y desplegar. | Sí, aquí se sigue trabajando. |
| `claude/lucid-newton-z58av1` | Copia automática que crea la sesión de Claude. Tiene lo mismo que `SubidaDavidClaudeWeb`. | Se puede ignorar o borrar al terminar. |
| `main` | Rama principal antigua (23 de octubre). | No se tocó. |

Para pasar los cambios a la rama principal: abrir un **pull request** de `SubidaDavidClaudeWeb` hacia `dashboard-usuarios-supabase` (o `main`) y revisarlo antes de juntar.

## 3. Cómo traer esto al computador (Windows)

1. **Node 22.12 o más nuevo (22 o 24).** Revisa con `node -v`. Si es más viejo, instala la versión LTS desde nodejs.org.
2. Trae la rama. En PowerShell viejo `&&` no funciona: corre un comando por línea.
   ```bash
   git fetch origin
   ```
   ```bash
   git checkout SubidaDavidClaudeWeb
   ```
   ```bash
   git pull
   ```
3. Instala las dependencias (cambiaron: eslint 10, vitest 5, esbuild 0.28):
   ```bash
   npm ci
   ```
4. **Una sola vez**, para que los `.sql` queden con saltos de línea LF (lo pide el nuevo `.gitattributes`):
   ```bash
   git add --renormalize .
   ```
5. Comprueba que todo esté bien:
   ```bash
   npm run lint
   ```
   ```bash
   npm test
   ```
   ```bash
   npm run build
   ```
   Opcional, para las Edge Functions (descarga Deno la primera vez y necesita internet):
   ```bash
   npm run test:edge
   ```

## 4. Mapa del proyecto (para ubicarse)

| Parte | Dónde | Notas |
| --- | --- | --- |
| Páginas públicas | `index.html`, `comercio.html`, `equipo.html`, `marca.html`, `preguntas.html`, `login.html`, `empresa.html`, legales (`terminos`, `privacidad`, `cookies`, `pagos`, `legal`), `404.html`, `offline.html` | HTML + JS/CSS sin framework. |
| Panel de personas | `dashboard.html` / `dashboard.js` / `dashboard.css` | `?demo=1` abre datos de ejemplo. |
| Panel de negocios | `empresa-dashboard.html` / `.js` / `.css` | Modo Puerta, cupones, cobros. `?demo=1`. |
| Panel admin | `admin.html` / `admin.js` / `admin.css` | Exige 2FA. `?demo=1`. |
| Utilidades compartidas | `mp-*.js` / `mp-*.css` | `mp-utils.js` (incluye `registrarSW`, `barra`, `colaAgregar`), `mp-mapa.js`, `mp-checkin.js`, `mp-verificacion.js`, `mp-captcha.js`, `mp-errores.js`, `mp-fuentes.css` (nuevo). |
| Service worker (app instalable) | `sw.js` | Modo sin conexión, notificaciones push, aviso de versión nueva. |
| Funciones de Vercel | `api/p.js` (vista para compartir `/p/<id>`), `api/seguro.js` (`/seguro/<token>`) | `api/contacto.js` **se borró** (ver 5.2). |
| Edge Functions de Supabase | `supabase/functions/*/index.ts` | `contacto`, `depurar-archivos` y `conciliar-pagos` (nuevas), `wompi-checkout`, `wompi-webhook`, `enviar-push`. Utilidades comunes en `supabase/functions/_shared/utilidades.ts`. Configuración en `supabase/config.toml`. |
| Base de datos | `supabase/migrations/*.sql` | Nuevas: `20261125120000_pulido_seguridad_y_pwa_fase3.sql` y `20261126120000_backend_mantenimiento_fase4.sql`. |
| Build | `scripts/build.mjs` → carpeta `dist/` | Es lo que publica Vercel (`vercel.json`). |
| Pruebas | `tests/unit` (Vitest), `tests/sql` (PGlite, Postgres en memoria), `tests/edge` (Deno) | Ver sección 8. |
| CI | `.github/workflows/ci.yml` | Lint, pruebas, build y Edge Functions en cada push. |
| Respaldos / cron | `.github/workflows/respaldo.yml`, `depurar-archivos.yml` (diario), `conciliar-pagos.yml` (cada hora) | Solo corren desde `main`. |

## 5. Todos los cambios, por área

### 5.1 Base de datos (Supabase)

**Archivo nuevo:** `supabase/migrations/20261125120000_pulido_seguridad_y_pwa_fase3.sql`. Se puede correr más de una vez y no borra datos.

| # | Qué | Cómo funciona | Qué pasa con los usuarios |
| --- | --- | --- | --- |
| 1 | `private.validar_registro()` | Un negocio (`tipo = 'empresa'`) debe traer `negocio` (≥ 2 letras), `responsable` (≥ 2) y teléfono (celular `3…` o fijo `60…`) o NIT (`900123456-7`) válidos. Códigos: `NEGOCIO_INVALIDO`, `RESPONSABLE_INVALIDO`, `TELEFONO_INVALIDO`, `NIT_INVALIDO`, `CONTACTO_NEGOCIO`. | El formulario de `empresa.html` ya pedía esos datos: no se nota. Solo frena registros armados a mano. Las cuentas existentes no se afectan (solo aplica al crear). |
| 2 | `private.frenar_spam()` | Solo los negocios con `verificado = true` abren parches sin tope diario. Personas y negocios sin verificar: **máximo 6 al día**. | **Ojo:** un negocio con plan Villavo **sin verificar** que publique más de 6 al día se frena. El mensaje le dice que pida la verificación. El equipo verifica desde el panel admin. |
| 3 | `public.emitir_cupon()` | Un cupón para una persona exige el parche donde está (`FALTA_PARCHE`), no se entrega si alguno bloqueó al otro (`BLOQUEADO`) y hay máximo 120 cupones con aviso por negocio cada hora (`DEMASIADOS`). Los duplicados con parche nulo ya se detectan bien. | Evita el spam de notificaciones. El cupón de mostrador (sin persona) sigue igual. |
| 4 | Contacto | `private.guardar_contacto()` hace todo (honeypot, freno por IP, validación y guardado) y **avisa a los admins activos** (rol admin, no suspendidos) con una notificación. `public.enviar_contacto_verificado(..., p_ip)` y `public.enviar_contacto(...)` **solo los puede llamar el servidor** (`service_role`). | El navegador ya no puede saltarse el captcha. Al equipo le llega un push. |
| 5 | `public.parche_publico()` | Ya no muestra parches terminados (`terminado_en`) ni de negocios en mora. | El enlace `/p/<id>` de esos parches muestra "ya pasó o no existe". |
| 6 | Depuración de archivos | `public.sistema_archivos_por_borrar()` y `public.sistema_archivos_borrados()`, solo para `service_role`. Solo sale de la cola lo que de verdad ya no está en Storage. | Las fotos de cédulas y del álbum se borran solas (función `depurar-archivos`). |
| 7 | Freno para Edge Functions | `public.sistema_permitir_intento(clave, max, segundos)`, solo `service_role`. | Lo usa `wompi-checkout` para frenar las confirmaciones. |
| 8 | `public.es_miembro()` | Solo responde la verdad a la propia persona, a quien creó el parche, a otro asistente, a un admin o al servidor. A cualquier otra cuenta le responde `false`. | **Corrige una fuga:** antes cualquier cuenta podía averiguar a qué parche iba otra persona. |

**Migración anterior también tocada:** `20261124120000_estabilidad_rendimiento_fase2.sql`. `private.parchear2` y el bloque de `admin_cuentas_pagina` cambian `\r\n` por `\n` antes de buscar y reemplazar, para no fallar si una función se creó desde Windows. No cambia el resultado.

### 5.2 Edge Functions (Supabase)

| Función | Estado | Qué hace / qué cambió | Despliegue |
| --- | --- | --- | --- |
| `contacto` | **Nueva** | Recibe el formulario de `equipo.html`, verifica Turnstile con `TURNSTILE_SECRET` (acción `contactForm`), toma la IP real (`cf-connecting-ip`) y llama a `enviar_contacto_verificado`. Si la migración aún no está, usa `enviar_contacto` (así no se cae durante el despliegue). CORS solo para `https://modoparche.vercel.app` y `ORIGENES_EXTRA`. | `--no-verify-jwt` |
| `depurar-archivos` | **Nueva** | Vacía `archivos_por_borrar` borrando en Storage (`documentos_identidad`, `album`, `fotos`). Protegida con el encabezado `x-cron-secret` (`CRON_SECRET`, o `PUSH_WEBHOOK_SECRET` si no existe). | `--no-verify-jwt` |
| `wompi-checkout` | Cambiada | En `accion: 'confirmar'`: exige que sea un negocio (o que tenga pagos) y frena a 20 confirmaciones cada 10 min **antes** de llamar a Wompi. | normal (con JWT) |
| `wompi-webhook` | Cambiada | Responde `405` a lo que no sea POST. Si falta `WOMPI_ENTORNO`, lo deduce del secreto (`prod_events_` → prod, `test_events_` → test). | `--no-verify-jwt` |
| `enviar-push` | Cambiada | Acepta todos los subdominios de `push.apple.com` (igual que la base), manda a `/admin` a los admins, envía `badge` (avisos sin leer), registra los fallos que no son 404/410 y responde `503 PUSH_MAL_CONFIGURADO` si las llaves VAPID están mal. El aviso se arma en `armarAviso()`. | `--no-verify-jwt` |

`supabase/config.toml` tiene `verify_jwt` para cada función (`contacto` y `depurar-archivos` nuevas).

**Vercel:** se **borró** `api/contacto.js`. Por eso **Vercel no necesita ninguna variable de entorno**: todos los secretos viven en Supabase. `api/p.js` ahora responde 405 a lo que no sea GET/HEAD, no guarda en caché los errores de Supabase (`no-store`, 503) y a un 404 real le da solo 60 s de caché.

### 5.3 Panel de personas (`dashboard.js`)

- Registra el service worker con `MPUtil.registrarSW` y muestra la barra "Hay una versión nueva de ModoParche · Actualizar".
- Libera de la memoria las vistas previas `blob:` del álbum (`soltarBlobs`) y las fotos de la cédula al cerrar el modal de verificación.
- Los fallos de cargas en segundo plano quedan en la consola con su nombre (`fallo('cupones')`, etc.) en vez de perderse.
- Si la base manda un código (`BLOQUEADO`, etc.), muestra su explicación en español, no el código.
- Borrado código muerto (`holdHint`).

### 5.4 Panel de negocios (`empresa-dashboard.js`)

- **App que abre sin señal:** registra `/sw.js`. Si al abrir no hay red, carga la **última copia local en solo lectura** (máximo 7 días, sin chats, llave `mp_business_copia_<id>`) y muestra "Sin conexión · solo lectura". La copia se borra al cerrar sesión.
- **Llegadas sin señal:** lo que se marque en el Modo Puerta sin conexión queda en una cola (`mp_business_cola_<id>`) y se envía solo al volver la red, o con "Enviar ahora". Si el servidor rechaza algo, avisa.
- Aviso de versión nueva (igual que el panel de personas).
- El reloj de 1 s solo corre si hay un parche relámpago en vivo (ahorra batería).
- `prepararFoto()` cierra el `ImageBitmap` y libera la URL temporal.
- **Modo Puerta accesible:** al abrirlo, el resto del panel queda inerte (`inert`); al cerrarlo, el foco vuelve al botón que lo abrió.
- `emitir_cupon` ya no manda una persona sin su parche, y el freno se muestra con su mensaje.
- `errorDB()` muestra la explicación de la base, no el código.
- Borrado código muerto (`pedirRetracto`: su botón se quitó al pasar al cobro por resultados).

### 5.5 Admin (`admin.js`)

- `closeDrawer()` devuelve el foco solo si el botón aún existe (`document.contains`) y, si no, al contenido principal.
- El informe PDF usa Inter local (ya no Google Fonts).
- El registro de auditoría de exportaciones (`admin_registrar_exportacion`), si falla, queda en la bitácora de errores.

### 5.6 Utilidades compartidas

| Archivo | Cambio |
| --- | --- |
| `mp-utils.js` | Nuevas `MPUtil.registrarSW()` (versión nueva que espera a "Actualizar"), `MPUtil.barra()` (barra fija de aviso) y `MPUtil.colaAgregar()` (cola sin conexión). |
| `mp-tema.css` | Estilos de `.mp-barra`. |
| `mp-mapa.js` | Un fallo de red ya no queda guardado como "sin resultados"; caché de 120 búsquedas por 15 min; cada búsqueda cancela la anterior (`AbortController`); `<label for>` correcto. **Corregido además:** la búsqueda rápida y la completa compartían la caché y la completa nunca consultaba Nominatim. |
| `mp-checkin.js` | El QR rotativo se pausa con la pantalla oculta; el aviso "Ese QR no es de ModoParche" sale máximo cada 1,5 s; si no hay cámara trasera, prueba otra. |
| `mp-verificacion.js` | Tesseract servido desde el sitio (`src/vendor/tesseract/`, versión 5.1.1 de npm); un solo lector para respaldo y frente; si no se puede descargar, dice "No se pudo descargar el lector" (no culpa a la foto); `MPVerificacion.liberar()`. |
| `mp-captcha.js` | Si el desafío vence o se agota, avisa enseguida (antes bloqueaba hasta 90 s). |
| `mp-errores.js` | Usa `window.MP_SUPABASE` y el token de la sesión guardada: la base anota `usuario_id` del error. |
| `mp-fuentes.css` | **Nuevo:** Inter local, versión variable (`src/assets/fonts/Inter-latin*.woff2`, licencia OFL). |

### 5.7 Service worker (`sw.js`)

- Guarda `/empresa-dashboard` y sus archivos para abrir sin señal (además del panel de personas).
- Una **versión nueva espera** a que la página mande `{ tipo: 'ACTUALIZAR' }`. La primera instalación entra de una.
- Pone en el ícono el número real de avisos sin leer (`badge`).
- Al tocar un aviso de admin, abre `/admin`.

### 5.8 Páginas públicas

- **Footer:** se quitó el párrafo "Responsable: … · aviso de IA" en las 10 páginas. Los datos siguen en `legal.html`.
- **Contacto (`equipo.html` / `equipo.js`):** captcha de Turnstile y envío a la Edge Function `contacto`.
- **Fuentes:** Inter local en las 16 páginas; se quitó Google Fonts (también de la CSP en `vercel.json`); Gagalin solo en WOFF2.
- **Rendimiento:** `fetchpriority="high"` en la foto principal de `comercio.html` y `equipo.html` (se midió el LCP real; en `index.html` el LCP es texto, así que no se puso); `#lbImg` con dimensiones.
- **Accesibilidad / SEO:**
  - `login.html` y `empresa.html` tienen un solo `<h1>` (oculto, para lectores de pantalla); los pasos son `<h2>` con el mismo estilo.
  - `404.html` y `offline.html` tienen descripción y salto al contenido.
  - **`comercios.html` se borró:** `/comercios` redirige con 301 a `/comercio` (`vercel.json`).

### 5.9 Build, Vercel y CI

| Archivo | Cambio |
| --- | --- |
| `scripts/build.mjs` | (1) Las librerías de `src/vendor` (JS/CSS) llevan hash en el nombre y se cambian las referencias en HTML, JS y `sw.js` (se dejan también las copias sin hash para `api/seguro.js`). (2) **Solo publica los assets que usa el sitio:** `src/assets/web`, `fonts` y `Branding/favicon` (de 51 MB a 13 MB). (3) **Revisión final:** si una página enlaza un archivo que no existe, si falta un ícono del manifiesto o un archivo del modo sin conexión, el build falla y dice cuál. |
| `vercel.json` | Redirección `/comercios`; CSP sin Google Fonts; las librerías con hash van con caché inmutable. |
| `package.json` | `engines: ">=22.12 <25"` (Vercel usa Node 24 fijo); nuevo script `test:edge`; se quitó `@supabase/supabase-js` (nadie lo importa en Node). |
| `vitest.config.mjs` | **Nuevo:** Vitest corre solo `tests/unit` y `tests/sql`. |
| `eslint.config.js` | Activa `no-unused-vars` (sin contar parámetros ni errores capturados) y `eqeqeq` (permite `== null`). |
| `.github/workflows/ci.yml` | Corre también en `SubidaDavidClaudeWeb` y agrega `deno check` y las pruebas de Edge Functions. |
| `.github/workflows/depurar-archivos.yml` | **Nuevo:** llama a `depurar-archivos` cada día a las 4:00 a. m. (hora de Colombia). Necesita el secreto `CRON_SECRET` en GitHub y estar en `main`. |
| `.gitattributes` | **Nuevo:** `*.sql text eol=lf`. |

### 5.10 Archivos borrados y por qué

| Qué | Por qué |
| --- | --- |
| `registro.php`, `includes/` | PHP viejo; el proyecto es Vercel + Supabase. |
| `comercios.html` | Reemplazado por la redirección 301. |
| `api/contacto.js` | Reemplazado por la Edge Function `contacto`. |
| `src/assets/fonts/Gagalin-Regular.woff` | Todos los navegadores actuales usan el WOFF2. |
| 23 imágenes de `src/assets/web/` (7 `.jpg`, 3 `.png`, `orangeprint2*`, 11 stickers) | Ningún código las pide. Una prueba revisa que existan todas las que sí se piden (incluidas las de `STK('nombre')` en `dashboard.js`). |

**No se borró** `src/assets/fuentes/`, `ads/`, `stickers/`, `dec/`, `insignias/` ni `Branding/`: son los originales de diseño. Siguen en Git, pero **ya no se publican**.

### 5.11 Dependencias

eslint 9 → **10**, vitest 3 → **5**, globals 15 → **17**, esbuild 0.25 → **0.28**. Se quitaron las 3 vulnerabilidades (2 críticas) de `npm audit`.

### 5.12 Fase 4: mantenimiento del backend

**Migración nueva:** `supabase/migrations/20261126120000_backend_mantenimiento_fase4.sql`. Se puede correr más de una vez.

| # | Qué | Dónde | Cómo funciona | Qué pasa |
| --- | --- | --- | --- | --- |
| 1 | Índices en claves foráneas | Migración, sección 1 | Un bloque recorre todas las claves foráneas de `public` y crea `<tabla>_<columna>_fk_idx` donde falte. Había 25 sin índice (por ejemplo `rutas.usuario_id`, `viajes.usuario_id`, `invitaciones.invitado_id`, `cupones_emitidos.parche_id`). | Borrar una cuenta (Ley 1581) o un parche ya no recorre tablas enteras; las consultas por esas columnas son más rápidas. La prueba `fase4.mjs` falla si aparece una clave nueva sin índice. |
| 2 | Retención | `private.limpieza_retencion()`, tarea pg_cron `modo-parche-retencion` (`45 8 * * *` UTC = 3:45 a. m. Colombia) | Borra notificaciones leídas de más de 90 días y sin leer de más de 1 año; contacto archivado de más de 1 año y atendido de más de 2; errores del navegador de más de 30 días. | Las tablas no crecen para siempre. **Nunca** se borran pagos, cobros, liquidaciones, la bitácora ni mensajes sin atender. |
| 3 | Conciliación de pagos | Edge Function `conciliar-pagos` + `sistema_pagos_por_conciliar()` y `sistema_pago_abandonado()` + `.github/workflows/conciliar-pagos.yml` (cada hora) | Pide los pagos `PENDIENTE` de más de 15 min (máx. 50). Con `wompi_id`, consulta el endpoint público; sin él, busca por referencia con `WOMPI_PRIVATE_KEY` (opcional). Aplica con `aplicar_pago_wompi` (ya ignora repetidos). Sin transacción después de 48 h, el pago queda `ERROR` "Abandonado". | Si el webhook de Wompi se pierde, el pago se confirma solo en menos de una hora. Si después llega el aviso aprobado de un pago marcado como abandonado, se aplica igual. |
| 4 | Registro de tareas y salud | `private.tareas_ejecutadas`, `public.sistema_anotar_tarea()` (servidor), `public.admin_salud()` (admin con 2FA), panel admin > Bitácora > **Salud del backend** (`admin.html`, `admin.js` `verSalud()`) | Cada tarea anota cuándo corrió y qué hizo (retención, `depurar-archivos`, `conciliar-pagos`). `admin_salud()` junta eso, el historial de pg_cron (si existe), pagos sin confirmar, errores de 24 h, archivos por borrar, contacto sin atender, mora y total de notificaciones. | El equipo ve de un vistazo si algo se trabó. Lo que necesita atención sale en naranja (una tarea que no corrió en el doble de su tiempo, pagos pendientes, más de 50 errores, etc.). |
| 5 | Tope de JSON | Restricción `parches_json_tamano` (NOT VALID) | `cupon`, `clima` y `demo_regla` hasta 8 KB; `oficial_info` hasta 32 KB. | Nadie puede guardar datos enormes en un parche. Las filas viejas no se revisan. |
| 6 | Código compartido de Edge Functions | `supabase/functions/_shared/utilidades.ts` | `json`, `sha256hex`, `mismoSecreto`, `exigirSecreto`, `origenesPermitidos`, `corsDe`, `clienteServidor` y `apiWompi`. Las 6 funciones las importan (una prueba revisa que ninguna las copie). | Un arreglo de seguridad se hace en un solo lugar. Si falta un secreto de cron o de webhook, ahora responde `503 SIN_CONFIGURAR` (antes algunas daban 401). |

Otros detalles: `depurar-archivos` ahora anota su tarea; el texto de "Errores de la app" en el admin ya dice que, si había sesión, se sabe quién fue; `tests/sql/sql.test.mjs` exige un mínimo de comprobaciones por suite.

## 6. Reglas nuevas que notan los usuarios

| Quién | Antes | Ahora |
| --- | --- | --- |
| Negocio sin verificar | Plan pago: parches sin tope | Máximo 6 al día (mensaje: "pide la verificación") |
| Negocio que entrega cupones | Sin límite | Máximo 120 con aviso por hora; nunca a quien lo bloqueó |
| Visitante del formulario de contacto | Se guardaba directo | Pasa por el captcha (casi siempre invisible) |
| Admin | No se enteraba de los mensajes | Le llega un push al panel |
| Negocio sin señal | Pantalla de error | Panel en solo lectura y llegadas en cola |
| Todos | Código viejo hasta cerrar la app | Aviso "Hay una versión nueva · Actualizar" |
| Enlace `/p/<id>` | Mostraba parches terminados o en mora | Ya no |

## 7. Despliegue paso a paso (sin caídas)

### 7.1 Secretos: qué va dónde

| Dónde | Secreto | Para qué | ¿Nuevo? |
| --- | --- | --- | --- |
| Supabase > Edge Functions > Secrets | `TURNSTILE_SECRET` | Edge Function `contacto` (Secret Key de Turnstile) | **Sí** |
| Supabase | `CRON_SECRET` | `depurar-archivos` | **Sí** |
| Supabase | `WOMPI_PRIVATE_KEY` | Opcional: `conciliar-pagos` busca por referencia los pagos sin transacción (Fase 4) | Opcional, nuevo |
| Supabase | `ORIGENES_EXTRA` | Opcional: dominios extra para `contacto` y `wompi-checkout` (por ejemplo, el de Preview) | Opcional |
| Supabase | `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `enviar-push` | Ya existían |
| Supabase | `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_ENTORNO` (opcional), `PERMITIR_COBROS_REALES` | Pagos | Ya existían |
| GitHub > Settings > Secrets > Actions | `CRON_SECRET` (mismo valor que en Supabase) | Workflows `depurar-archivos.yml` y `conciliar-pagos.yml` | **Sí** |
| GitHub | `SUPABASE_DB_URL`, `RESPALDO_CLAVE`, `RESPALDO_S3_BUCKET`, `RESPALDO_S3_ENDPOINT`, `RESPALDO_S3_KEY`, `RESPALDO_S3_SECRET` | Respaldos | Ya existían |
| Vercel | **Ninguno** | — | — |

### 7.2 Orden

**Antes de todo, revisa qué tiene la base de producción:** Supabase > SQL Editor > pestaña nueva > pega `supabase/diagnostico_migraciones.sql` > Run. Es de solo lectura: dice "SÍ" o "FALTA" por cada migración. Corre en orden (de arriba hacia abajo) las que digan FALTA, cada una en una pestaña nueva.

**Publicación:** Vercel está conectado al repositorio (proyecto `davzd/modoparche`). El pull request [Antrll/ModoParche#3](https://github.com/Antrll/ModoParche/pull/3) (`SubidaDavidClaudeWeb` → `main`) ya tiene su versión de prueba en https://modoparche-red.vercel.app (usa la misma base real que producción). **Al unir el PR a `main`, Vercel publica solo en modoparche.vercel.app.** El PR trae también las Fases 1 y 2, que nunca se habían publicado.


1. Crear `TURNSTILE_SECRET` y `CRON_SECRET` en Supabase.
2. Desplegar las Edge Functions:
   ```bash
   supabase functions deploy contacto --no-verify-jwt
   ```
   ```bash
   supabase functions deploy wompi-checkout
   ```
   ```bash
   supabase functions deploy wompi-webhook --no-verify-jwt
   ```
   ```bash
   supabase functions deploy enviar-push --no-verify-jwt
   ```
   ```bash
   supabase functions deploy depurar-archivos --no-verify-jwt
   ```
   ```bash
   supabase functions deploy conciliar-pagos --no-verify-jwt
   ```
3. Desplegar en Vercel (sin variables de entorno).
4. Supabase > SQL Editor > pestaña nueva: correr `supabase/migrations/20261125120000_pulido_seguridad_y_pwa_fase3.sql`. Luego, en otra pestaña nueva, `supabase/migrations/20261126120000_backend_mantenimiento_fase4.sql`.
5. Programar las tareas: la depuración diaria y la conciliación cada hora. Los workflows de GitHub ya están listos y corren desde `main`; la alternativa con pg_cron está en el README.
6. En el panel admin, **verificar a los negocios reales** que publiquen más de 6 parches al día.

Si se hace en otro orden, lo único que se afecta un rato es el formulario de contacto. La Edge Function tiene un respaldo para el caso "migración todavía no corrida".

### 7.3 Antes de producción: probar en Preview

Un despliegue Preview de Vercel tiene **otro dominio** (por ejemplo, `modoparche-git-subidadavidclaudeweb-….vercel.app`). Para probar ahí:
- Agrega ese dominio a `ORIGENES_EXTRA` en Supabase. Si no, `contacto` y `wompi-checkout` responden **403 ORIGEN**.
- Agrégalo a los dominios del widget en **Cloudflare Turnstile**. Si no, el captcha falla.
- Agrégalo en Supabase > Authentication > URL Configuration > Redirect URLs, si vas a probar el inicio de sesión.

Pruebas manuales recomendadas en Preview:
1. Un pago de Wompi en **sandbox** (llaves `pub_test_`).
2. El formulario de contacto (debe llegar un push al admin).
3. La verificación de cédula en un celular.
4. El panel de negocios en modo avión.
5. El aviso de versión nueva (desplegar dos veces y abrir la app).

## 8. Cómo probar

| Comando | Qué prueba |
| --- | --- |
| `npm run lint` | ESLint (incluye variables sin usar y `==`). |
| `npm test` | **Vitest:** 58 pruebas unitarias (`tests/unit/utilidades.test.mjs`) y las 4 suites SQL sobre Postgres en memoria (`tests/sql/fase1.mjs`: 153 comprobaciones, `fase2.mjs`: 67, `fase3.mjs`: 70, incluida la auditoría de seguridad de la base, y `fase4.mjs`: 28). |
| `npm run test:edge` | `deno check` de las 6 Edge Functions y 39 pruebas de comportamiento con un Supabase simulado (`tests/edge/simular.ts`). Necesita internet la primera vez. |
| `npm run build` | Genera `dist/` y revisa enlaces, manifiesto y modo sin conexión. |

Las pruebas SQL corren **todas las migraciones** desde cero. Si una migración nueva rompe algo anterior, se ve ahí.

**Auditoría permanente (`tests/sql/fase3.mjs`, sección 9):** toda tabla de `public` con RLS, toda función `SECURITY DEFINER` con `search_path` fijo, anónimos solo ejecutan `parche_publico` y `ubicacion_por_token`, y anónimos sin permisos de tabla. Si alguien agrega algo inseguro, el CI falla.

## 9. Qué no se pudo probar y riesgos conocidos

- **Con servicios reales:** pagos en el sandbox de Wompi, el captcha real de Cloudflare y un push a un celular real. Necesitan las llaves del equipo. Se probaron con simulaciones; falta la prueba en Preview (7.3).
- **El núcleo del OCR** (WebAssembly) y el modelo de idioma se siguen descargando de jsDelivr y de `tessdata.projectnaptha.com` la primera vez.
- **Privacidad (decisión del equipo):** la copia sin señal del panel de negocios guarda nombres de asistentes en el celular del local (7 días, se borra al cerrar sesión), y los errores del navegador ahora se asocian a la cuenta. **La Política de Privacidad todavía no menciona ninguna de las dos cosas.**
- **Texto legal:** `empresa.html` dice "Tienes 5 días hábiles de retracto". Con el cobro por resultados quizá ya no aplica. No se tocó.
- **Paneles:** `admin.html` (12), `dashboard.html` (4) y `empresa-dashboard.html` (7) tienen varios `<h1>`, uno por vista. No afecta el SEO (no se indexan), pero se puede pulir.

## 10. Solución de problemas

| Síntoma | Causa | Qué hacer |
| --- | --- | --- |
| `npm ci` avisa `EBADENGINE` | Node más viejo que 22.12 o 25 o más | Instalar Node 22 o 24. |
| `npm test` falla en Windows con errores raros en SQL | Saltos de línea CRLF | `git add --renormalize .` (paso 3.4). |
| `npm run build` dice "Enlaces o archivos que no existen" | Una página enlaza algo borrado o mal escrito | Corregir la ruta que dice el mensaje. |
| Una imagen no aparece en el sitio publicado pero sí localmente | Está fuera de `src/assets/web`, `fonts` o `Branding/favicon` | Moverla a `src/assets/web/` (el build solo publica esas carpetas). |
| Formulario: "El formulario no está disponible" | Falta `TURNSTILE_SECRET` en Supabase | Crear el secreto y redesplegar `contacto`. |
| Formulario o pago: 403 en Preview | El dominio de Preview no está en `ORIGENES_EXTRA` | Ver 7.3. |
| Salud del backend: "Nunca ha corrido" | La tarea no está programada o falta `CRON_SECRET` | Revisar los workflows en `main`, el secreto en GitHub y en Supabase, o programarla con pg_cron (README > Fase 4). |
| Pagos que siguen sin confirmar | No hay `WOMPI_PRIVATE_KEY` y el pago no tiene transacción | Crear la llave privada en Supabase (opcional) o revisar el pago en Wompi. |
| Push: `503 PUSH_MAL_CONFIGURADO` en los logs | Llaves VAPID mal copiadas | Revisar `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`. |
| Un negocio dice "Ya abriste 6 parches hoy" | No está verificado | Verificarlo desde el panel admin. |
| `npm run test:edge` no descarga | Sin internet o proxy | Necesita acceso a npm y jsr.io la primera vez. |

## 11. Próximas mejoras propuestas (en orden de prioridad)

**Ya hechas en la Fase 4 (sección 5.12):** índices de claves foráneas, retención de datos, conciliación de pagos, revisión de salud, tope de JSON y código compartido de las Edge Functions.

**Alta (antes o justo después de publicar)**
1. **Probar en Preview** con servicios reales (7.3): Wompi sandbox, captcha y push.
2. **Actualizar la Política de Privacidad:** errores asociados a la cuenta, copia sin señal del panel de negocios y la nueva Edge Function de contacto (el captcha lo procesa Cloudflare).
3. **Revisar el texto de retracto** de `empresa.html` con el modelo de cobro por resultados.
4. **Verificar a los negocios reales** para que el tope de 6 parches al día no los frene.
5. **Pasar los workflows a `main`** (`respaldo.yml` y `depurar-archivos.yml` solo corren desde ahí) y crear sus secretos en GitHub.

**Media (calidad y operación)**

6. **Pruebas de navegador permanentes** (Playwright en el CI): las comprobaciones que se hicieron a mano (sin conexión, versión nueva, OCR, páginas sin errores ni archivos faltantes) como pruebas automáticas.
7. **Alertas activas:** el panel "Salud del backend" (Fase 4) ya muestra los problemas; falta que **avise solo** (push o correo al equipo) cuando algo sale en naranja.
8. **OCR 100 % propio:** alojar también el núcleo WebAssembly y el modelo de Tesseract (unos MB) para quitar jsDelivr y tessdata de la CSP.
9. **LCP en celular:** el texto principal de `index` y `comercio` aparece con una animación hacia 1,1 s. Mostrarlo sin esperar la animación mejora la nota de rendimiento.
10. **Un `<h1>` por vista visible en los paneles** (o `<h2>` en las vistas ocultas).
11. **Tipos en el JS del navegador** (`// @ts-check` con JSDoc) para detectar errores antes de publicar.

**Baja (pulido)**

12. Quitar `'unsafe-inline'` de `style-src` en la CSP (hay unos 12 atributos `style=` en los HTML y estilos escritos desde JS).
13. Partir los archivos grandes (`dashboard.js` ~5.000 líneas, `empresa-dashboard.js` ~3.400) en módulos; el build ya está listo para empaquetarlos.
14. Script para actualizar las librerías de `src/vendor` desde npm con un solo comando.

## 12. Historial de commits de esta rama

| Commit | Qué |
| --- | --- |
| `4885e9c` | Footer más limpio. |
| `17f28fc` | Registro de cambios (`CAMBIOS-DAVID.md`). |
| `c4ce301` | Windows (CRLF), README al día, prueba de imágenes de vista previa. |
| `bc6c626` | Fase 3A: seguridad restante, notificaciones y PWA del panel de negocios. |
| `fa2e61b` | Fase 3B: rendimiento, limpieza, accesibilidad y mantenibilidad. |
| `32986d0` | Despliegue probado: contacto como Edge Function, pruebas con Deno, sitio de 13 MB, `es_miembro`. |
| `c6dad03` | Documentación completa (`docs/CONTEXTO-SubidaDavidClaudeWeb.md`, `CLAUDE.md`). |
| (este) | Fase 4: mantenimiento del backend. |

## 13. Estado de producción (22 de noviembre de 2026)

Producción tiene `a2e2bae` más la mejora visual (`fd307e7` sin el resto de la rama). En Supabase ya están las migraciones de las Fases 1 y 2; faltan las de las Fases 3 y 4. Edge Functions desplegadas: `wompi-checkout` y `wompi-webhook` (versión anterior). Faltan `contacto`, `enviar-push`, `depurar-archivos` y `conciliar-pagos`.

## 14. Asistente Parce y Google (pendiente de activar)

- **Asistente (solo en los paneles, exige sesión desde el 23/11):** crear el secreto `GROQ_API_KEY` en Supabase > Edge Functions > Secrets (nunca en el código, en un chat ni en Vercel) y correr `supabase functions deploy asistente` (CON verificación de JWT). Necesita la migración de la Fase 3 (`sistema_permitir_intento`). Modelo por defecto: `openai/gpt-oss-120b`; se cambia con el secreto opcional `GROQ_MODEL`. En un Preview, el dominio debe estar en `ORIGENES_EXTRA`.
- **Migración nueva:** `20261127120000_quitar_vaca.sql`, después de la Fase 4.
- **Google sin el dominio de Supabase:** en Google Cloud > Google Auth Platform > Clientes, agregar `https://modoparche.vercel.app` en Orígenes autorizados de JavaScript; en Branding, poner ModoParche como nombre de la app. Después se agrega el dominio a `GOOGLE_DOMINIOS` en `login.js`. La alternativa es un dominio personalizado de Supabase, que es pago.
- **Decisiones legales pendientes:** `terminos.html` aún menciona la vaca, y la Política de Privacidad debe decir que las preguntas al asistente se procesan con Groq antes de activarlo.

## 15. Pasada visual del 23 de noviembre (pedido de David)

- **Piezas de branding (`mp-energia.js` / `.css`):** antes salían hasta 6 por sección más 4 "pegadas" en las fotos, y algunas tapaban palabras. Ahora:
  - Máximo 1 por sección, una sección sí y otra no, y un tope por página: 4 en computador, 2 en tablet y celular, 1 en las páginas legales.
  - Miden cada línea de texto real de toda la página (no solo etiquetas), además de fotos, botones, tarjetas, el menú y el pie, con un margen igual a lo que se mueven.
  - En pantallas anchas usan los márgenes vacíos a los lados del contenido. Si no hay lugar libre, no se pone nada.
  - Siguen con movimiento suave (máximo unos 10 px), pero sin el efecto de scroll que las arrastraba encima del texto. Se reubican si cambia el alto o el ancho de la página.
  - Verificado en Chromium: 10 páginas × 4 pantallas (iPhone, iPad, portátil 1366 px y pantalla de 1920 px), con 0 piezas sobre texto, fotos o botones.
- **Barra de avance superior:** eliminada.
- **Acceso de personas (`login.css`):** la estrella pequeña del panel naranja era negra; ahora es naranja brasa (`#e8430c`), como la grande de al lado.
- **Asistente Parce:** quedó solo en los paneles (`dashboard.html`, `empresa-dashboard.html`); se quitó de las 10 páginas públicas y legales.
  - La Edge Function exige la sesión (`verify_jwt = true`, usa `usuarioDe()` de `_shared`) y el freno es por cuenta: 20 preguntas cada 10 min.
  - Las sugerencias cambian para personas y para negocios. En los paneles de ejemplo dice que responde solo con una cuenta real.
  - El chat abierto va por encima de los avisos del panel, y el botón se oculta mientras está el aviso de cookies (que lo tapaba en el celular).
- **Llave de Groq:** se pegó una en el chat. **Hay que revocarla** en console.groq.com y crear otra directamente en Supabase como `GROQ_API_KEY`.
