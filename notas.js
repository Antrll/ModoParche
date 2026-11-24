/* =====================================================================
   ModoParche · notas.js
   Memofichas móviles sincronizadas con las 10 diapositivas de /pitch
===================================================================== */
(function () {
  'use strict';

  var FICHAS = [
    {
      titulo: 'Cover — ModoParche',
      tiempo: '~20 s',
      en: [
        'Hello everyone! Today we present <b>ModoParche</b>.',
        'It is a live web app made in <b>Villavicencio</b>.',
        'It helps people find <b>safe group plans</b>, and helps local venues get <b>real clients</b>.'
      ],
      tip: 'Tip: Sonríe, haz una pausa corta y señala el código QR en pantalla.',
      es: '¡Hola a todos! Hoy presentamos ModoParche. Es una app web en vivo hecha en Villavicencio. Ayuda a las personas a encontrar planes seguros en grupo y a los locales a recibir clientes reales.'
    },
    {
      titulo: '01 · The Problem',
      tiempo: '~25 s',
      en: [
        'We saw <b>two simple problems</b> in our city.',
        'For people: group chats die, plans get canceled, and going out alone feels <b>unsafe</b>.',
        'For businesses: they have <b>empty tables</b> on slow days and pay for ads even if nobody arrives.'
      ],
      tip: 'Tip: Señala primero la tarjeta naranja (personas) y luego la oliva (negocios).',
      es: 'Vimos dos problemas sencillos en nuestra ciudad. Para las personas: los chats mueren, los planes se cancelan y salir solo se siente inseguro. Para los negocios: tienen mesas vacías en días flojos y pagan publicidad aunque no llegue nadie.'
    },
    {
      titulo: '02 · How It Works',
      tiempo: '~25 s',
      en: [
        'ModoParche connects both sides in <b>three easy steps</b>.',
        'First, you open the <b>live map</b> and find a plan.',
        'Second, you join or create one in <b>30 seconds</b> — with an optional <b>Plan B</b> if it rains.',
        'Third, you chat with the group, arrive, and <b>scan a QR code</b>.'
      ],
      tip: 'Tip: Cuenta con los dedos: 1 (map), 2 (30 seconds + Plan B), 3 (chat + QR).',
      es: 'ModoParche conecta ambos lados en 3 pasos fáciles. Primero abres el mapa en vivo. Segundo te unes o creas un plan en 30 segundos, con Plan B opcional por lluvia. Tercero chateas, llegas y escaneas un QR.'
    },
    {
      titulo: '03 · User Dashboard Features',
      tiempo: '~30 s',
      en: [
        'Inside the <b>User Panel</b>, people have great tools to go out.',
        'They get a live map radar, real-time <b>group chat with polls and photos</b>, and a backup <b>Plan B</b> if it rains.',
        'They can also check in by QR for coupons, add friends, and log in with <b>email or Google</b> in three themes.'
      ],
      tip: 'Tip: No leas las 6 tarjetas palabra por palabra; menciona 3 o 4 con naturalidad.',
      es: 'Dentro del Panel de Usuarios tienen radar en el mapa, chat en vivo con encuestas y fotos, Plan B por lluvia, check-in por QR para cupones, amigos y acceso con correo o Google en 3 temas.'
    },
    {
      titulo: '04 · Business Panel Features',
      tiempo: '~30 s',
      en: [
        'For local venues, we built a complete <b>Business Panel</b>.',
        'Staff can use <b>Door Mode</b> to scan QR codes at the entrance in two seconds, or print a <b>fixed venue QR</b>.',
        'They can also launch <b>flash promos</b> on slow nights, send automatic coupons, and pay bills with <b>Wompi</b>.'
      ],
      tip: 'Tip: Enfatiza "Door Mode" (Modo Puerta) y "Flash promos" (Relámpagos).',
      es: 'Para los locales hicimos un Panel de Negocios completo: Modo Puerta para escanear QR en 2 segundos, QR fijo impreso, promos relámpago en noches flojas, cupones automáticos y pagos con Wompi.'
    },
    {
      titulo: '05 · Safety & Trust',
      tiempo: '~30 s',
      en: [
        'Safety is our <b>number one priority</b>.',
        'We built <b>six real layers</b>: an 18+ age gate, one-time <b>ID verification</b>, and meeting details visible only to signed-in users.',
        'We also include <b>QR identity</b>, live safe route sharing, host moderation, and a smart chat filter.'
      ],
      tip: 'Tip: Esta diapositiva impresiona mucho al jurado — habla pausado y seguro.',
      es: 'La seguridad es nuestra prioridad número uno. Creamos 6 capas reales: filtro +18, verificación de cédula, detalles del punto solo para usuarios con cuenta, QR de identidad con ruta segura, control del organizador y filtro en el chat.'
    },
    {
      titulo: '06 · Business Model (For Businesses)',
      tiempo: '~25 s',
      en: [
        'Our business model is built for <b>local businesses</b> with zero monthly fees.',
        'The app is free for users, and venues only pay a small fee when a <b>verified client actually arrives</b>.',
        'If nobody arrives, the business pays <b>zero</b> — and monthly bills are paid via <b>Wompi</b>.'
      ],
      tip: 'Tip: Haz una mini pausa antes de decir "the business pays zero".',
      es: 'Nuestro modelo está pensado para negocios sin mensualidades. Es gratis para usuarios y los locales solo pagan cuando llega un cliente verificado. Si nadie llega, pagan $0, y se paga por Wompi.'
    },
    {
      titulo: '07 · Meet Parce (AI Guide)',
      tiempo: '~25 s',
      en: [
        'We also built <b>Parce</b>, our own AI assistant powered by <b>Groq</b>.',
        'It lives inside both dashboards to answer questions <b>24/7</b> — helping users and local staff in seconds.',
        'It is secure by design: it requires login, has <b>rate limits</b>, and blocks sensitive data like card numbers.'
      ],
      tip: 'Tip: Señala la animación de tinta negra moviéndose detrás de Parce.',
      es: 'También creamos a Parce, nuestro asistente con IA usando Groq. Vive en ambos paneles 24/7 para ayudar a usuarios y personal de negocios en segundos, con inicio de sesión, límites de uso y bloqueo de datos sensibles.'
    },
    {
      titulo: '08 · Technology & Quality',
      tiempo: '~25 s',
      en: [
        'For technology, we built a fast <b>Progressive Web App</b> that works smoothly on phones.',
        'We use <b>Supabase</b> for Postgres and real-time chat, <b>Vercel</b> for serverless APIs, and free <b>OpenStreetMap</b> maps.',
        'Everything is verified with <b>67 automated tests</b> and zero lint errors.'
      ],
      tip: 'Tip: Destaca los números grandes arriba: 18 páginas, 3 paneles, 67 pruebas, $0 en mapas.',
      es: 'En tecnología hicimos una PWA rápida para celular. Usamos Supabase para Postgres y chat en tiempo real, Vercel para APIs, mapas gratis con OpenStreetMap y 67 pruebas automatizadas.'
    },
    {
      titulo: '09 · Thank You & Live Demo',
      tiempo: '~15 s',
      en: [
        'That is <b>ModoParche</b>: real people, real local venues, and real software <b>live today</b>.',
        'You can scan the QR code on screen to try it on your phone right now.',
        '<b>Thank you!</b> Would you like to see a quick live demo or ask any questions?'
      ],
      tip: 'Tip: Invita al jurado a escanear el QR o abre el Panel de Usuarios en vivo.',
      es: 'Eso es ModoParche: personas reales, locales reales y software real funcionando hoy. Pueden escanear el QR en pantalla para probarlo ahora. ¡Gracias! ¿Quieren ver una demo en vivo o tienen preguntas?'
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
