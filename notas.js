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
        'Hello everyone! Today we are happy to present <b>ModoParche</b>.',
        'ModoParche is a real web app built here in <b>Villavicencio</b>.',
        'It is not just a slide deck — it is <b>live online today</b> at modoparche.vercel.app.',
        'Our goal is very simple: help people find <b>safe group plans</b>, and help local places get <b>real clients</b>.',
        'If you want, you can scan the <b>QR code</b> on screen with your phone to see it live.'
      ],
      tip: 'Tip (~45 s): Saluda con calma, sonríe y señala el código QR grande en la pantalla.',
      es: '¡Hola a todos! Hoy presentamos ModoParche. Es una app web real hecha aquí en Villavicencio. No son solo diapositivas: ya está en vivo hoy en modoparche.vercel.app. Nuestra meta es simple: ayudar a la gente a encontrar planes seguros en grupo y ayudar a los negocios locales a recibir clientes reales. Si quieren, pueden escanear el QR en pantalla.'
    },
    {
      titulo: '01 · The Problem',
      tiempo: '~1 min',
      en: [
        'Before we built the app, we saw <b>two simple problems</b> in our city.',
        'First, <b>for people</b>: you want to go out, but WhatsApp groups die and plans get canceled.',
        'Also, going out alone feels <b>awkward or unsafe</b>, and it is hard to see what is happening <b>today</b>.',
        'Second, <b>for local businesses</b>: bars, cafes, and restaurants have <b>empty tables</b> on slow nights like Tuesday or Wednesday.',
        'They pay for social media ads, even when <b>nobody actually walks in</b>.'
      ],
      tip: 'Tip (~1 min): Señala primero la tarjeta naranja (personas) y luego la tarjeta oliva (negocios).',
      es: 'Antes de crear la app vimos dos problemas simples en nuestra ciudad. Primero, para las personas: los grupos de WhatsApp mueren, los planes se cancelan, salir solo se siente incómodo o inseguro y cuesta ver qué hay hoy. Segundo, para los negocios: tienen mesas vacías entre semana y pagan publicidad aunque no entre nadie.'
    },
    {
      titulo: '02 · How It Works',
      tiempo: '~1 min',
      en: [
        'ModoParche connects people and local places in <b>three easy steps</b>.',
        '<b>Step one:</b> open the live map and filter plans by mood, date, distance, or open spots.',
        '<b>Step two:</b> join a plan with one tap, or create your own in <b>30 seconds</b>.',
        'You can even add an optional <b>Plan B</b> indoors, just in case it rains.',
        '<b>Step three:</b> talk in the group chat before you go, meet at the place, and <b>check in with a QR code</b> to unlock coupons.'
      ],
      tip: 'Tip (~1 min): Cuenta con los dedos: 1 (map), 2 (join or create + Plan B), 3 (chat + QR).',
      es: 'ModoParche conecta personas y locales en 3 pasos fáciles. Paso 1: abres el mapa en vivo y filtras planes. Paso 2: te unes o creas tu plan en 30 segundos, incluso con un Plan B opcional bajo techo por si llueve. Paso 3: hablas en el chat antes de llegar, te encuentras con el grupo y haces check-in con QR para ganar cupones.'
    },
    {
      titulo: '03 · User Dashboard Features',
      tiempo: '~1 min',
      en: [
        'Now let us show you what users can actually do inside the <b>User Panel</b>.',
        'They have a <b>live map</b> to see nearby plans and how many spots are left.',
        'Every plan has a <b>real-time group chat</b> with quick polls and a shared photo album.',
        'If it starts to rain, the host can turn on their <b>Plan B</b> and alert the group.',
        'When users arrive, they use <b>QR check-in</b> to get partner coupons, add new friends, and rate the plan.',
        'And they can sign in easily with <b>email or Google</b>, and pick Light, Mixed, or Dark mode.'
      ],
      tip: 'Tip (~1 min): Habla tranquilo mirando al público; no hace falta leer cada tarjeta en orden exacto.',
      es: 'Ahora les mostramos qué pueden hacer los usuarios en su panel. Tienen mapa en vivo con cupos, chat en tiempo real con encuestas y álbum de fotos, y Plan B si llueve. Al llegar hacen check-in por QR para cupones, agregan amigos y califican. Además entran fácil con correo o Google y eligen entre 3 temas.'
    },
    {
      titulo: '04 · Business Panel Features',
      tiempo: '~1 min',
      en: [
        'For local venues, we built a dedicated <b>Business Panel</b>.',
        'At the entrance, staff can open <b>Door Mode</b> — a full-screen QR scanner that checks in guests in <b>two seconds</b>.',
        'Venues can also print a <b>fixed QR poster</b> for the door so guests check in on their own.',
        'On slow nights, the owner can launch a <b>Flash Promo</b> right away to bring groups in.',
        'They also get <b>automatic coupons</b>, Table Mode for groups, guest chat, Excel reports, and easy <b>Wompi</b> payments.'
      ],
      tip: 'Tip (~1 min): Remarca "Door Mode" (escáner en 2 segundos) y "Flash Promo" para noches flojas.',
      es: 'Para los locales creamos un Panel de Negocios completo. En la puerta abren Modo Puerta para escanear QR en 2 segundos, o imprimen un QR fijo. En noches flojas lanzan una Promo Relámpago para atraer grupos al instante. También tienen cupones automáticos, Modo Mesa, chat con asistentes, reportes Excel y pagos por Wompi.'
    },
    {
      titulo: '05 · Safety & Trust',
      tiempo: '~1:10',
      en: [
        'Safety is the <b>most important part</b> of ModoParche.',
        'We built <b>six real layers</b> of protection inside the app.',
        'First, an <b>18+ age check</b> before browsing, and one-time <b>ID verification</b> to earn the <em>Parcero Verificado</em> badge.',
        'Second, <b>account-only details</b>: only signed-in users can see exact meeting points and who is going.',
        'Third, <b>QR identity and Safe Route</b>: users can share their live GPS location with a trusted friend or family member.',
        'Finally, <b>host control</b> to remove rude guests, plus a <b>chat filter</b> that blocks bad links.'
      ],
      tip: 'Tip (~1:10): Esta diapositiva gusta mucho a los profes/jurados. Habla pausado y claro.',
      es: 'La seguridad es lo más importante en ModoParche. Creamos 6 capas reales: filtro +18, verificación de cédula para la insignia Parcero Verificado, detalles exactos solo para usuarios con cuenta, QR de identidad con Ruta Segura para compartir GPS a gente de confianza, control del anfitrión para sacar personas y filtro en el chat contra enlaces malos.'
    },
    {
      titulo: '06 · Business Model (For Businesses)',
      tiempo: '~1 min',
      en: [
        'Now let us talk about the <b>Business Model</b> — how ModoParche makes money with businesses.',
        'First: the app is <b>100% free for users</b>.',
        'For businesses, there are <b>zero monthly fees</b>.',
        'Any venue can start on the <b>Basic</b> plan for $0 with two plans per month.',
        'On the <b>Villavo</b> plan, they only pay <b>10% or $2,500 pesos</b> when a verified guest actually arrives — and <b>8%</b> for multi-branch brands.',
        'The rule is simple: <b>if nobody arrives, the business pays zero</b>. And monthly bills are paid easily with <b>Wompi</b>.'
      ],
      tip: 'Tip (~1 min): Haz una pausa corta antes de decir "if nobody arrives, the business pays zero".',
      es: 'Ahora el modelo de negocio para comercios. La app es 100% gratis para usuarios y para los negocios no hay mensualidades. Pueden empezar en el plan Básico por $0. En el plan Villavo solo pagan 10% o $2.500 por cliente verificado que sí llega (y 8% en Multisede). Regla simple: si nadie llega, pagan $0, y se paga fácil con Wompi.'
    },
    {
      titulo: '07 · Meet Parce (AI Guide)',
      tiempo: '~55 s',
      en: [
        'We also added our own AI helper called <b>Parce</b>, powered by <b>Groq</b>.',
        'Parce lives inside <b>both panels</b> and answers questions <b>24/7</b>.',
        'For users, it explains how to join plans, verify their ID, or use coupons.',
        'For business staff, it helps them run <b>Door Mode</b>, launch promos, or check Wompi bills in seconds.',
        'And it is safe: it requires login, has <b>usage limits</b>, and blocks sensitive info like card numbers.'
      ],
      tip: 'Tip (~55 s): Señala a Parce y la tinta negra animada mientras explicas qué hace.',
      es: 'También creamos a Parce, nuestro asistente con IA usando Groq. Vive en ambos paneles 24/7. A los usuarios les explica planes, verificación y cupones; al personal de negocios les ayuda con Modo Puerta, promos y cobros Wompi. Además es seguro: pide sesión, tiene límites de uso y bloquea datos sensibles como tarjetas.'
    },
    {
      titulo: '08 · Technology & Quality',
      tiempo: '~1 min',
      en: [
        'Let us briefly share how we built ModoParche.',
        'It is a fast <b>Progressive Web App</b> that works smoothly on any phone, with no heavy frameworks.',
        'We use <b>Supabase</b> for our Postgres database, login, and real-time chat, and <b>Vercel</b> for our server APIs.',
        'For maps, we use <b>OpenStreetMap and Leaflet</b> — which means <b>$0 in map API costs</b>.',
        'We also built a full <b>Admin Panel</b> to review IDs, and we tested the app with <b>67 automated tests</b>.'
      ],
      tip: 'Tip (~1 min): Señala los 4 números grandes arriba: 18 páginas, 3 paneles, 67 pruebas, $0 en mapas.',
      es: 'Les contamos rápido la tecnología. Es una PWA rápida para celular sin frameworks pesados. Usamos Supabase para base de datos Postgres, login y chat en vivo; Vercel para las APIs; y OpenStreetMap con Leaflet, que nos da mapas por $0. Además hicimos un Panel Admin completo y 67 pruebas automatizadas.'
    },
    {
      titulo: '09 · Thank You & Live Demo',
      tiempo: '~1 min',
      en: [
        'To wrap up: <b>ModoParche</b> connects real people, real local venues, and real software <b>working today</b>.',
        'You can scan the <b>QR code</b> on screen to try it on your own phone right now.',
        'If you would like, we can open the <b>live app</b> right here and show you a quick demo of the map, chat, or Door Mode.',
        '<b>Thank you very much!</b> Do you have any questions for us?'
      ],
      tip: 'Tip (~1 min): Si queda tiempo, abre "User Panel" o "Business Panel" abajo para mostrar 1 minuto en vivo.',
      es: 'Para cerrar: ModoParche conecta personas reales, locales reales y software real funcionando hoy. Pueden escanear el QR para probarlo en su celular. Si quieren abrimos la app en vivo aquí mismo para una demo rápida. ¡Muchas gracias! ¿Tienen alguna pregunta?'
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
  var fontSize = 1.32;
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
    fontSize = Math.max(1.0, Math.min(1.85, next));
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
