# Mensaje para pegarle a Claude (de parte de David)

> Julián: copia todo lo que está dentro del recuadro de abajo y pégalo como primer mensaje en Claude Code, con el proyecto abierto en tu computador.

```text
Hola Claude. Soy Julián, del equipo de ModoParche. David trabajó desde Claude Code en la web en la rama SubidaDavidClaudeWeb y necesito que quedes al tanto de todo antes de seguir.

1. Ponte al día (sin cambiar nada todavía):
   - Trae la rama: git fetch origin y luego git checkout SubidaDavidClaudeWeb y git pull.
   - Lee completos, en este orden: CLAUDE.md, docs/CONTEXTO-SubidaDavidClaudeWeb.md, CAMBIOS-DAVID.md y las secciones "Fase 3A", "Fase 3B" y "Fase 4" del README.md.
   - Revisa mi versión de Node (debe ser 22.12 o más nueva, menor que 25). Si no sirve, avísame antes de seguir.
   - Corre: npm ci, luego git add --renormalize . (una sola vez, por los saltos de línea de los .sql en Windows), y después npm run lint, npm test, npm run test:edge y npm run build. Dime si todo pasa. Lo esperado: lint con 0 errores, Vitest 62/62 (incluye 318 comprobaciones SQL), Edge Functions 39/39 y el build sin errores.

2. Resumen de lo que hizo David (el detalle está en los documentos):
   - Footer más limpio; compatibilidad con Windows en las migraciones.
   - Fase 3A: registro de negocios con datos mínimos, tope de 6 parches al día para negocios sin verificar, cupones sin spam, contacto con captcha a través de la Edge Function "contacto", Wompi más seguro, push a admins con número en el ícono, panel de negocios que abre sin señal (solo lectura) y aviso de versión nueva.
   - Fase 3B: buscador del mapa, batería y memoria, Inter local, librerías con hash, accesibilidad, limpieza de PHP e imágenes sin uso, eslint 10 y vitest 5 (0 vulnerabilidades).
   - Despliegue probado: Vercel no necesita variables de entorno (todos los secretos están en Supabase), el sitio publicado bajó de 51 MB a 13 MB, es_miembro ya no revela a qué parche va cada persona y hay una auditoría permanente de la seguridad de la base.
   - Fase 4: índices en las claves foráneas, limpieza diaria de datos viejos, conciliación de pagos con Wompi cada hora (Edge Function "conciliar-pagos"), "Salud del backend" en el panel admin, tope de tamaño a los JSON y utilidades compartidas en supabase/functions/_shared.

3. Reglas:
   - Trabaja solo en la rama SubidaDavidClaudeWeb. NO modifiques dashboard-usuarios-supabase ni main. Para juntar, pull request, nunca push directo.
   - No cambies textos legales (términos, privacidad, retracto) sin preguntarme.
   - No pongas secretos en el código ni variables de entorno en Vercel.
   - Cada cambio que hagas anótalo en CAMBIOS-DAVID.md (qué, por qué y archivos) y, si cambia algo importante, en docs/CONTEXTO-SubidaDavidClaudeWeb.md.
   - Antes de decir que algo está listo, corre lint, test, test:edge y build.

4. Lo que queda pendiente (necesita nuestras cuentas o decisiones; guíame, no lo hagas sin avisar):
   - Desplegar en este orden: secretos en Supabase (TURNSTILE_SECRET y CRON_SECRET; opcional WOMPI_PRIVATE_KEY), luego las 6 Edge Functions, luego Vercel, luego las migraciones 20261125120000 (Fase 3) y 20261126120000 (Fase 4), y por último programar las tareas (workflows en main con el secreto CRON_SECRET en GitHub). Está en la sección 7 de docs/CONTEXTO-SubidaDavidClaudeWeb.md.
   - Antes de producción, probar en un Preview de Vercel: un pago en el sandbox de Wompi, el formulario de contacto, la verificación de cédula en un celular y el panel de negocios en modo avión. Ojo: el dominio de Preview hay que agregarlo en ORIGENES_EXTRA (Supabase) y en Cloudflare Turnstile.
   - Verificar en el panel admin a los negocios reales que publican más de 6 parches al día.
   - Decidir si se actualiza la Política de Privacidad (errores asociados a la cuenta y copia sin señal del panel de negocios) y el texto de "5 días de retracto" en empresa.html.

Cuando termines el paso 1, dame un resumen corto de lo que entendiste y el resultado de las pruebas, y pregúntame por cuál pendiente seguimos.
```
