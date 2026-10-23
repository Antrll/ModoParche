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
3. En **Authentication > URL Configuration** agrega la URL del sitio (por ejemplo la de Vercel) en *Site URL* y en *Redirect URLs*, para que el enlace de confirmación del correo vuelva al dashboard.

El script se puede correr más de una vez. Crea perfiles, parches, chat, rutas, notificaciones, calificaciones y parceros frecuentes con seguridad por filas (RLS). Las tablas viejas del prototipo (`parches`, `parche_miembros`, `usuarios`, `intereses_usuario`) quedan renombradas como `legacy_*` y sin acceso público. No se borra ningún dato.

### Archivos

| Archivo | Qué hace |
| --- | --- |
| `supabase-client.js` | Crea el cliente de Supabase con la llave pública (anon). |
| `login.js` | Registro en 3 pasos e inicio de sesión con Supabase Auth. |
| `dashboard.js` | Explorar, mapa en tiempo real con GPS del usuario, mis parches con chat, perfil y constructor de avatar; lee y guarda en Supabase y escucha cambios en tiempo real. |
| `supabase/migrations/` | Esquema, seguridad, triggers y parches de ejemplo de Villavicencio. |

### Modo demo

`dashboard.html?demo=1` abre el panel con datos de ejemplo guardados solo en el navegador, sin cuenta ni conexión a la base de datos.
