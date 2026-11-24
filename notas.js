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
      titulo: 'Q&A · Preguntas del jurado',
      tiempo: 'Extra',
      en: [
        '<b>1. ¿Cuánto nos cuesta operar?</b> Hoy <b>$0/mes</b> (Vercel, Supabase, OpenStreetMap, Groq y lector de cédula en el celular). A escala (miles de usuarios): <b>~$50 USD/mes (~$250.000 COP)</b>.',
        '<b>2. ¿Cuánto nos quita Wompi?</b> Aprox. <b>3.15% + $833 COP</b> por pago (2.65% + $700 + IVA). Como cobramos <b>una sola factura mensual</b> por negocio y no cliente por cliente, nos queda <b>~96% neto</b>.',
        '<b>3. ¿Cuántos negocios para ser rentables?</b> Hoy ($0 de operación): desde <b>1 negocio activo</b>. Con servidores pagos ($250k/mes): solo <b>6 negocios</b> (20 clientes/mes × $2.500 = $50k c/u). Con 20 negocios = <b>$1M COP/mes</b>.',
        '<b>4. ¿Y si el negocio no escanea el QR para no pagar?</b> El cliente gana <b>cupones y la insignia Cero fantasma</b> al escanear, así que él mismo lo pide. Además, el negocio solo paga cuando la persona sí llega.',
        '<b>5. ¿Qué pasa si un negocio no paga su factura?</b> Con liquidación vencida se bloquean promos y parches nuevos hasta pagar por Wompi, y cada check-in queda registrado con hora exacta.',
        '<b>6. ¿Por qué es gratis para usuarios?</b> Para crecer sin fricción y tener masa crítica. Cobramos del lado donde hay retorno directo: locales que llenan mesas vacías en días flojos.',
        '<b>7. ¿Cómo consiguen los primeros usuarios?</b> Arranque hiper-local en <b>Villavicencio</b>: universidades, parches oficiales del mes (conciertos) y <b>Promos Relámpago</b> de locales aliados.',
        '<b>8. ¿Qué nos diferencia de WhatsApp o Instagram?</b> WhatsApp no descubre planes nuevos, Instagram no maneja cupos ni check-in, y ninguno ofrece cédula verificada, Ruta Segura GPS ni cobro por cliente real.',
        '<b>9. ¿Cómo cumplen con privacidad y cédulas (Ley 1581)?</b> Consentimiento explícito, fotos en espacio privado, revisión humana y <b>borrado automático</b> de las fotos al aprobar o rechazar (solo queda el sello).',
        '<b>10. ¿Cómo escalan a otras ciudades?</b> OpenStreetMap cubre todo Colombia a $0 y todo filtra por ciudad. Validamos en Villavicencio y replicamos ciudad por ciudad (Acacías, Yopal, Tunja, etc.).'
      ],
      tip: 'Tip: Respuestas en español para la ronda de preguntas del profe/jurado.',
      es: 'Esta ficha ya está en español: cubre costos, Wompi, punto de equilibrio, control de pagos, adquisición de usuarios, diferenciadores, Ley 1581 y escalabilidad.'
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
