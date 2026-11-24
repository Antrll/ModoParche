/* =====================================================================
   ModoParche · notas.js
   Memofichas móviles sincronizadas con las 10 diapositivas de /pitch
===================================================================== */
(function () {
  'use strict';

  var FICHAS = [
    {
      titulo: 'Cover — ModoParche',
      tiempo: '~45 s',
      en: [
        'Hi everyone! Today we present <b>ModoParche</b>.',
        'It is a real web app made here in <b>Villavicencio</b>.',
        'It is live today at <b>modoparche.vercel.app</b>.',
        'It helps people find <b>safe group plans</b>, and helps local places get <b>real clients</b>.',
        'You can scan the <b>QR code</b> on screen to try it on your phone.'
      ],
      tip: 'Tip: Saluda tranquilo, sonríe y señala el QR en pantalla.',
      es: '¡Hola a todos! Hoy presentamos ModoParche. Es una app web real hecha en Villavicencio, viva hoy en modoparche.vercel.app. Ayuda a la gente a encontrar planes seguros en grupo y a los locales a recibir clientes reales. Pueden escanear el QR para probarla.'
    },
    {
      titulo: '01 · The Problem',
      tiempo: '~1 min',
      en: [
        'We saw <b>two simple problems</b> in our city.',
        'First, <b>for people</b>: group chats die, and plans get canceled.',
        'Going out alone feels <b>unsafe</b>, and it is hard to find plans <b>today</b>.',
        'Second, <b>for businesses</b>: bars and cafes have <b>empty tables</b> on slow days.',
        'They pay for ads, even when <b>nobody comes</b>.'
      ],
      tip: 'Tip: Señala primero la tarjeta naranja (personas) y luego la oliva (negocios).',
      es: 'Vimos dos problemas simples en la ciudad. Para la gente: los chats mueren, los planes se cancelan, salir solo se siente inseguro y cuesta ver planes hoy. Para los negocios: mesas vacías en días flojos y pagan publicidad aunque no llegue nadie.'
    },
    {
      titulo: '02 · How It Works',
      tiempo: '~1 min',
      en: [
        'ModoParche works in <b>three easy steps</b>.',
        '<b>One:</b> open the <b>live map</b> and filter plans near you.',
        '<b>Two:</b> join a plan, or make your own in <b>30 seconds</b>.',
        'You can also add a <b>Plan B</b> indoors if it rains.',
        '<b>Three:</b> chat with the group, meet there, and <b>scan a QR code</b>.'
      ],
      tip: 'Tip: Cuenta con los dedos: 1 (map), 2 (join/make + Plan B), 3 (chat + QR).',
      es: 'Funciona en 3 pasos fáciles. 1: abres el mapa en vivo. 2: te unes o creas un plan en 30 segundos, con Plan B bajo techo si llueve. 3: chateas con el grupo, llegas y escaneas el QR.'
    },
    {
      titulo: '03 · User Panel',
      tiempo: '~1 min',
      en: [
        'Here is what users can do in the <b>User Panel</b>.',
        'They see plans on a <b>live map</b> with open spots.',
        'Each plan has a <b>group chat</b>, quick polls, and shared photos.',
        'If it rains, the host can turn on <b>Plan B</b> and alert the group.',
        'They also get <b>QR check-in</b> for coupons, add friends, and sign in with <b>email or Google</b>.'
      ],
      tip: 'Tip: Habla despacio y natural; no leas todas las tarjetas una por una.',
      es: 'En el Panel de Usuarios ven planes en el mapa con cupos, chat en grupo con encuestas y fotos, y Plan B si llueve. También hacen check-in por QR para cupones, agregan amigos y entran con correo o Google.'
    },
    {
      titulo: '04 · Business Panel',
      tiempo: '~1 min',
      en: [
        'For local places, we made a <b>Business Panel</b>.',
        'Staff can use <b>Door Mode</b> to scan QR codes at the door in <b>two seconds</b>.',
        'They can also print a <b>QR poster</b> so guests check in fast.',
        'On slow nights, they can post a <b>Flash Promo</b> to bring groups right now.',
        'They also get auto coupons, guest chat, Excel lists, and <b>Wompi</b> payments.'
      ],
      tip: 'Tip: Remarca "Door Mode" (2 segundos) y "Flash Promo" para noches flojas.',
      es: 'Para los locales hicimos un Panel de Negocios: Modo Puerta para escanear QR en 2 segundos, QR impreso en la puerta, Promos Relámpago en noches flojas, cupones automáticos, chat, Excel y pagos por Wompi.'
    },
    {
      titulo: '05 · Safety & Trust',
      tiempo: '~1:10',
      en: [
        'Safety is our <b>number one rule</b>.',
        'We have <b>six real layers</b> in the app.',
        'First: an <b>18+ check</b> and one-time <b>ID check</b> to get the verified badge.',
        'Second: <b>account-only details</b>, so only signed-in users see exact meeting points.',
        'Third: <b>QR ID and Safe Route</b> to share live GPS with trusted people.',
        'Last: <b>host control</b> to remove rude guests, and a <b>chat filter</b> for bad links.'
      ],
      tip: 'Tip: Habla pausado y seguro; esta parte le encanta al jurado.',
      es: 'La seguridad es nuestra regla #1 con 6 capas reales: filtro +18, cédula verificada, detalles solo con cuenta, QR + Ruta Segura con GPS en vivo, control del anfitrión y filtro de enlaces en el chat.'
    },
    {
      titulo: '06 · Business Model',
      tiempo: '~1 min',
      en: [
        'Now, let us see how we <b>make money</b>.',
        'One: the app costs <b>nothing</b> to use.',
        'Local places pay <b>no monthly fee</b>.',
        'They can begin on <b>Basic</b> at <b>no cost</b>, with two plans a month.',
        'On the <b>Villavo</b> plan, they only pay <b>10%</b> — at least <b>$2,500 pesos</b> — when a guest comes in.',
        'Easy deal: <b>if nobody comes, they pay nothing</b>. All bills go via <b>Wompi</b>.'
      ],
      tip: 'Tip: Haz una mini pausa antes de decir "if nobody comes, they pay nothing".',
      es: 'Ahora veamos cómo ganamos dinero. La app no cuesta nada para la gente, y los locales no pagan mensualidad. Pueden empezar sin costo en Básico (2 planes al mes). En Villavo solo pagan 10% (mínimo $2.500) cuando el cliente sí llega. Si nadie llega, no pagan nada, y todo se paga por Wompi.'
    },
    {
      titulo: '07 · Meet Parce (AI)',
      tiempo: '~55 s',
      en: [
        'We also built <b>Parce</b>, our own AI helper with <b>Groq</b>.',
        'Parce is inside <b>both panels</b> to help <b>24/7</b>.',
        'For users, it explains plans, ID check, and coupons.',
        'For business staff, it helps with <b>Door Mode</b>, promos, and Wompi bills.',
        'It is safe: it asks for login, has limits, and <b>blocks card numbers</b>.'
      ],
      tip: 'Tip: Señala a Parce y la tinta negra moviéndose detrás.',
      es: 'Creamos a Parce, nuestro asistente IA con Groq, dentro de ambos paneles 24/7. Ayuda a usuarios con planes/cupones y a negocios con Modo Puerta, promos y Wompi. Pide sesión, tiene límites y bloquea tarjetas.'
    },
    {
      titulo: '08 · How We Built It',
      tiempo: '~1 min',
      en: [
        'Now, let us see how we made <b>ModoParche</b>.',
        'It is a fast <b>mobile web app</b> — no download needed.',
        'We use <b>Supabase</b> to save data, login, and live chat, and <b>Vercel</b> to host the site.',
        'On maps, we use <b>OpenStreetMap</b>, so map costs stay at <b>$0</b>.',
        'We also made an <b>Admin Panel</b> to check IDs and keep the app safe.'
      ],
      tip: 'Tip: Señala los 4 números grandes: 18 páginas, 3 paneles, IA 24/7, $0 mapas.',
      es: 'Ahora veamos cómo hicimos ModoParche. Es una app web rápida para celular sin descargas. Usamos Supabase para datos, login y chat en vivo, Vercel para hospedarla, OpenStreetMap para que los mapas cuesten $0 y un Panel Admin para revisar cédulas.'
    },
    {
      titulo: '09 · Thank You & Demo',
      tiempo: '~1 min',
      en: [
        'That is <b>ModoParche</b>: safe plans, local spots, and a live app <b>today</b>.',
        'Scan the <b>code</b> to test it on any phone now.',
        'If you like, we can show a <b>fast live demo</b>.',
        '<b>Thank you!</b> Any questions?'
      ],
      tip: 'Tip: Si queda tiempo, abre "User Panel" o "Business Panel" para mostrar 1 min en vivo.',
      es: 'Eso es ModoParche: planes seguros, sitios locales y una app viva hoy. Escaneen el código para probarla en cualquier celular ahora. Si gustan, podemos mostrar una demo rápida en vivo. ¡Gracias! ¿Preguntas?'
    },
    {
      titulo: 'Preguntas del jurado',
      tiempo: 'Extra',
      en: [
        '<b>— COSTOS REALES (TASA REF. $1 USD ≈ $4.000 COP) —</b>',
        '<b>1. ¿Cuánto nos cuesta operar HOY (arranque / MVP)?</b> <b>$0 COP/mes:</b><br>• <b>Vercel (Plan Hobby):</b> $0 (100 GB tráfico/mes).<br>• <b>Supabase (Plan Free):</b> $0 (500 MB base de datos, 50.000 usuarios activos/mes, 1 GB archivos).<br>• <b>OpenStreetMap (Mapas):</b> $0 (vs. Google Maps que cobra por carga).<br>• <b>Groq (IA Parce):</b> $0 en capa gratuita.<br>• <b>Lector de cédula:</b> $0 (corre en el celular del usuario).',
        '<b>2. ¿Cuánto cuesta operar A ESCALA (miles de usuarios)?</b> <b>~$51 USD/mes ≈ $205.000–$220.000 COP/mes:</b><br>• <b>Supabase Pro:</b> $25 USD/mes (≈ $100.000 COP) → 8 GB BD, 100.000 usuarios/mes, 100 GB archivos, copias diarias y sin pausas.<br>• <b>Vercel Pro:</b> $20 USD/mes (≈ $80.000 COP) → 1 TB tráfico, funciones más rápidas y licencia comercial.<br>• <b>Dominio propio (.com/.co):</b> ~$15 USD/año (≈ $5.000 COP/mes).<br>• <b>IA Parce (Groq pago por uso):</b> ~$5–$10 USD/mes (≈ $20.000–$40.000 COP) si supera la capa gratis.',
        '<b>— WOMPI Y RENTABILIDAD (NÚMEROS EXACTOS) —</b>',
        '<b>3. ¿Cuánto nos quita Wompi?</b> Tarifa estándar: <b>2,65% + $700 COP + IVA (19%) = 3,15% + $833 COP</b> por pago.<br>• <b>Clave:</b> NO cobramos $2.500 uno por uno (ahí Wompi quitaría 36%). Consolidamos <b>1 sola factura mensual por negocio</b>:<br>• Factura de <b>$50.000</b> → Wompi quita $2.408 (4,8%) → quedan <b>$47.592 netos</b>.<br>• Factura de <b>$100.000</b> → Wompi quita $3.983 (4,0%) → quedan <b>$96.017 netos</b>.<br>• Factura de <b>$200.000</b> → Wompi quita $7.133 (3,6%) → quedan <b>$192.867 netos</b>.',
        '<b>4. ¿Cuántos parches al mes necesitamos para ser rentables?</b><br>• <b>Hoy ($0 de costo):</b> con <b>1 solo parche</b> ya generamos utilidad.<br>• <b>Para pagar servidores ($220.000 COP/mes):</b> necesitamos <b>93 asistentes/mes</b> a $2.500 (~$2.380 netos tras Wompi). Si cada parche lleva <b>6 personas</b> ($15.000 brutos / ~$14.300 netos), bastan <b>16 parches al mes</b> (~4 por semana en toda la ciudad).<br>• <b>Con equipo/sueldos ($3M + $220k servidores = $3,22M/mes):</b> ~<b>225 parches/mes</b> (~7–8 diarios) a $2.500/persona, o la mitad (<b>~115 parches/mes</b>) en locales donde aplique el 10% sobre cuentas de $50.000.',
        '<b>5. ¿Cuántos negocios necesitamos para ser rentables?</b><br>• <b>Hoy ($0):</b> desde <b>1 negocio activo</b>.<br>• <b>Para pagar servidores ($220.000/mes):</b> solo <b>5 negocios activos</b> con 20 clientes/mes c/u ($50.000 brutos / $47.592 netos × 5 = <b>$237.960 netos</b>).<br>• <b>Meta de crecimiento:</b> 20 negocios = <b>~$950.000 netos/mes</b>; 68 negocios = <b>~$3,2M netos/mes</b>.',
        '<b>6. ¿Cuánto gana un negocio frente a lo que nos paga?</b> Si un cliente consume <b>$40.000–$60.000 COP</b> y el local nos paga <b>$2.500 COP</b> (o 10%), su costo por cliente real es apenas <b>4%–10%</b> de una venta garantizada — mucho más seguro que pautar en redes sin saber si alguien va.',
        '<b>7. ¿Qué otras fuentes de ingreso tienen a futuro?</b> Plan multisede para cadenas, <b>parches oficiales</b> con patrocinadores (conciertos/eventos), locales destacados en el mapa y comisión por reservas de paquetes grupales.',
        '<b>— MEJORAS FUTURAS Y ESCALAMIENTO —</b>',
        '<b>8. ¿Qué mejoras implementarían más adelante y cuánto valen?</b><br>• <b>Infraestructura paga:</b> Supabase Pro ($25 USD/mes) + Vercel Pro ($20 USD/mes) + dominio (~$60.000 COP/año).<br>• <b>Tiendas móviles:</b> Google Play ($25 USD pago único ≈ $100.000 COP) y Apple ($99 USD/año ≈ $400.000 COP).<br>• <b>Validación automática oficial de cédula:</b> pago por uso (~$800–$1.500 COP por verificación) cuando el volumen supere la revisión manual.<br>• <b>Avisos por WhatsApp (API oficial):</b> ~$150–$250 COP por mensaje para recordatorios de planes y facturas.',
        '<b>9. ¿Cuándo pasarían de plan gratis a pago?</b> Solo con ingresos reales: al superar <b>5–10 negocios activos</b> o <b>2.000–5.000 usuarios/mes</b>. Así la plataforma se autofinancia sin sacar plata del bolsillo.',
        '<b>10. ¿Cómo escalan a otras ciudades?</b> OpenStreetMap cubre toda Colombia a $0 y los planes se filtran por ciudad. Validamos tracción en Villavicencio y replicamos ciudad por ciudad (Acacías, Yopal, Tunja, Bucaramanga, etc.).',
        '<b>— OPERACIÓN, CONTROL Y CRECIMIENTO —</b>',
        '<b>11. ¿Y si el negocio no escanea el QR para no pagar?</b> El cliente gana <b>cupones y la insignia Cero fantasma</b> al escanear, así que él mismo lo pide. Además, el negocio solo paga cuando la persona sí llega.',
        '<b>12. ¿Qué pasa si un negocio no paga su factura mensual?</b> Con liquidación vencida se bloquean promociones y parches nuevos hasta pagar por Wompi, y cada llegada queda registrada con fecha y hora exacta.',
        '<b>13. ¿Por qué es gratis para usuarios?</b> Para crecer sin fricción y lograr masa crítica rápido. Monetizamos del lado donde hay retorno económico directo: locales que llenan mesas vacías en días flojos.',
        '<b>14. ¿Cómo consiguen los primeros usuarios?</b> Arranque hiperlocal en <b>Villavicencio</b>: universidades, parches oficiales del mes (conciertos/eventos) y <b>Promos Relámpago</b> de locales aliados.',
        '<b>15. ¿Qué nos diferencia de WhatsApp o Instagram?</b> WhatsApp es cerrado (no descubres planes nuevos), Instagram no maneja cupos ni llegadas, y ninguno tiene cédula verificada, Ruta Segura GPS ni cobro por cliente real.',
        '<b>— SEGURIDAD, LEGAL Y TECNOLOGÍA —</b>',
        '<b>16. ¿Cómo cumplen con privacidad y cédulas (Ley 1581)?</b> Consentimiento explícito, fotos en espacio privado, revisión humana y <b>borrado automático</b> de las fotos al aprobar o rechazar (solo queda el sello).',
        '<b>17. ¿Qué pasa si ocurre un incidente en un parche?</b> Filtro obligatorio +18, cédula verificada para organizar, <b>Ruta Segura</b> con GPS en vivo para familiares, expulsión de usuarios molestos, reportes y suspensión en Panel Admin.',
        '<b>18. ¿Por qué web móvil y no aplicación de tienda desde el día 1?</b> Funciona en Android y iPhone con un solo código, <b>sin descargar nada</b> al escanear el QR, se actualiza al instante y evita costos de tiendas al arrancar.',
        '<b>19. ¿Qué pasa si falla la IA Parce o baja la señal?</b> Hay modo sin conexión para consultas básicas y el Modo Puerta sigue operando; si la IA falla o llega a su límite, toda la plataforma sigue funcionando al 100%.'
      ],
      tip: 'Tip: Números 100% cuadrados (tasa $4.000 COP/USD) y 100% en español, listos para defender ante el jurado.',
      es: 'Ficha completa en español con desglose exacto de costos (Supabase Pro $25 USD, Vercel Pro $20 USD), tabla de Wompi, punto de equilibrio en parches y negocios, mejoras futuras, operación y seguridad.'
    }
  ];

  var strip = document.getElementById('nfStrip');
  var countEl = document.getElementById('nfCount');
  var slideNumEl = document.getElementById('nfSlideNum');
  var timeEl = document.getElementById('nfTime');
  var titleEl = document.getElementById('nfTitle');
  var enEl = document.getElementById('nfEn');
  var tipEl = document.getElementById('nfTip');
  var esBox = document.getElementById('nfEsBox');
  var esEl = document.getElementById('nfEs');
  var btnPrev = document.getElementById('btnPrev');
  var btnNext = document.getElementById('btnNext');
  var btnLess = document.getElementById('btnLess');
  var btnMore = document.getElementById('btnMore');
  var btnEs = document.getElementById('btnEs');

  var idx = 0;
  var fontSize = 0.98;
  var buttons = FICHAS.map(function (_f, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nf-num';
    b.textContent = String(i + 1);
    b.addEventListener('click', function () { show(i); });
    strip.appendChild(b);
    return b;
  });

  function show(n) {
    idx = Math.max(0, Math.min(FICHAS.length - 1, n));
    var f = FICHAS[idx];
    countEl.textContent = (idx + 1) + ' / ' + FICHAS.length;
    slideNumEl.textContent = 'SLIDE ' + (idx + 1);
    timeEl.textContent = f.tiempo;
    titleEl.textContent = f.titulo;
    enEl.innerHTML = f.en.map(function (line) { return '<p>' + line + '</p>'; }).join('');
    tipEl.textContent = f.tip;
    esEl.textContent = f.es;
    buttons.forEach(function (b, i) {
      b.classList.toggle('is-on', i === idx);
      if (i === idx && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
    btnPrev.disabled = idx === 0;
    btnNext.disabled = idx === FICHAS.length - 1;
    document.getElementById('nfMain').scrollTop = 0;
    if (history.replaceState) history.replaceState(null, '', '#slide-' + (idx + 1));
  }

  function setSize(next) {
    fontSize = Math.max(0.82, Math.min(1.55, next));
    document.documentElement.style.setProperty('--en-size', fontSize.toFixed(2) + 'rem');
  }

  btnPrev.addEventListener('click', function () { show(idx - 1); });
  btnNext.addEventListener('click', function () { show(idx + 1); });
  btnLess.addEventListener('click', function () { setSize(fontSize - 0.12); });
  btnMore.addEventListener('click', function () { setSize(fontSize + 0.12); });
  btnEs.addEventListener('click', function () {
    var on = esBox.hidden;
    esBox.hidden = !on;
    btnEs.classList.toggle('is-on', on);
    btnEs.setAttribute('aria-pressed', String(on));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
  });

  var x0 = null, y0 = null;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    x0 = null; y0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      show(dx < 0 ? idx + 1 : idx - 1);
    }
  }, { passive: true });

  var m = /^#slide-(\d+)$/.exec(location.hash);
  show(m ? parseInt(m[1], 10) - 1 : 0);
})();
