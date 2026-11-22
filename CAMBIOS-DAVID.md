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
