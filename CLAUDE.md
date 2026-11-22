# ModoParche · guía para Claude (y para quien trabaje en el proyecto)

Planes en grupo en Villavicencio. Sitio estático (HTML + JS/CSS sin framework) en **Vercel** y backend en **Supabase** (Postgres con RLS, Auth, Storage, Realtime y Edge Functions con Deno). Proyecto académico; el equipo escribe y habla en **español** (textos de la app, comentarios y commits).

## Antes de empezar
- **Contexto completo del trabajo reciente:** [`docs/CONTEXTO-SubidaDavidClaudeWeb.md`](docs/CONTEXTO-SubidaDavidClaudeWeb.md). Léelo antes de cambiar algo.
- **Historial punto por punto:** [`CAMBIOS-DAVID.md`](CAMBIOS-DAVID.md). Agrega ahí cada cambio nuevo (qué, por qué, archivos).
- **Despliegue y configuración:** `README.md`.

## Ramas
- `SubidaDavidClaudeWeb`: aquí va el trabajo nuevo.
- `dashboard-usuarios-supabase`: versión base. **No se modifica** sin que el equipo lo pida.
- Para juntar cambios: pull request hacia la rama base, nunca push directo.

## Comandos (Node 22.12+ o 24; ver `engines` en package.json)
- `npm ci`: instalar.
- `npm run lint`: ESLint (con `no-unused-vars` y `eqeqeq`).
- `npm test`: Vitest. Unitarias (`tests/unit`) y suites SQL (`tests/sql`, todas las migraciones sobre PGlite, con la auditoría de seguridad de la base).
- `npm run test:edge`: `deno check` y pruebas de las Edge Functions (`tests/edge`, Supabase simulado).
- `npm run build`: genera `dist/` (lo que publica Vercel) y falla si hay enlaces o archivos rotos.

Corre los cuatro antes de dar algo por terminado.

## Reglas que no son obvias
- **Migraciones:** archivos nuevos en `supabase/migrations/` con fecha posterior a la última. Deben poder correrse **más de una vez** sin borrar datos. Las funciones `SECURITY DEFINER` siempre con `set search_path = ''`; toda tabla de `public` con RLS. Lo nuevo que solo use el servidor va con `grant ... to service_role`.
- **Secretos:** solo en Supabase (Edge Functions > Secrets) o en los secretos de GitHub. **Vercel no tiene variables de entorno** y no debe necesitarlas. Nunca escribas llaves en el código (la llave `anon` de Supabase es pública por diseño).
- **Assets:** el build solo publica `src/assets/web`, `src/assets/fonts` y `src/assets/Branding/favicon`. Las demás carpetas de `src/assets` son originales de diseño (no se publican). `dashboard.js` arma rutas de stickers con `STK('nombre')` (sin extensión): búscalas por nombre antes de borrar una imagen.
- **Librerías de `src/vendor`:** el build les pone hash en el nombre; referéncialas por su ruta normal (`/src/vendor/x.js`).
- **Service worker (`sw.js`):** si agregas un archivo que deba abrir sin conexión, ponlo en `BASICO` (el build revisa que exista). Una versión nueva espera a que la persona toque "Actualizar".
- **Errores de la base:** las reglas lanzan un código (`DEMASIADO_RAPIDO`, `BLOQUEADO`…) con la explicación en `hint`; los paneles muestran el `hint`.
- **Windows:** los `.sql` van con LF (`.gitattributes`). En PowerShell viejo no se puede usar `&&`.
- **Textos legales** (términos, privacidad, retracto): no se cambian sin que el equipo lo decida.

## Pendientes conocidos
Ver la sección "Próximas mejoras" en `docs/CONTEXTO-SubidaDavidClaudeWeb.md`.
