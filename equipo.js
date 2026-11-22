(() => {
  const chips = Array.from(document.querySelectorAll('[data-set-topic]'));
  const topicIn = document.getElementById('contactTopic');
  const msgIn = document.getElementById('msg');

  function selectTopic(label) {
    chips.forEach(c => c.classList.toggle('is-active', c.dataset.setTopic === label));
    if (topicIn) topicIn.value = label;
  }

  chips.forEach(c => c.addEventListener('click', () => selectTopic(c.dataset.setTopic)));

  document.querySelectorAll('[data-topic]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectTopic(btn.dataset.topic);
      if (msgIn && !msgIn.value.trim()) {
        msgIn.placeholder = 'Cuéntanos qué haces en Villavo y en qué te gustaría aportar al equipo…';
      }
    });
  });
})();

/* Formulario de contacto y empleo: se guarda en la base y lo ve el equipo en el panel */
(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const btn = form.querySelector('button[type="submit"]'), status = form.querySelector('.status'), txt = status.querySelector('.status-text');
  const MOTIVOS = { 'Tengo una idea o parche': 'contacto', 'Quiero sumarme al equipo': 'empleo', 'Tengo un negocio en Villavo': 'negocio', 'Prensa o alianza': 'prensa' };
  const aviso = (titulo, detalle, error) => {
    txt.replaceChildren();
    const b = document.createElement('b'), s2 = document.createElement('small');
    b.textContent = titulo; s2.textContent = detalle;
    txt.append(b, s2);
    status.classList.toggle('is-error', !!error);
    status.classList.add('is-visible');
    status.focus({ preventScroll: true });
  };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (btn.disabled) return;
    if (window.MPValidar && !window.MPValidar(form)) return;
    btn.disabled = true; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
    status.classList.remove('is-visible');
    // Captcha de Cloudflare (casi siempre invisible). El servidor lo verifica antes de guardar.
    let token;
    try { token = window.MPCaptcha ? await window.MPCaptcha.token(form) : undefined; }
    catch (err) {
      const [t, d] = window.MPCaptcha ? window.MPCaptcha.mensaje(err) : ['No pudimos verificarte', 'Recarga la página e intenta de nuevo.'];
      aviso(t, d, true);
      btn.disabled = false; btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy');
      return;
    }
    try {
      const r = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.name.value, correo: form.email.value, motivo: MOTIVOS[form.topic.value] || 'contacto',
          mensaje: form.msg.value, sitio: form.sitio ? form.sitio.value : '', token: token || '',
        }),
        signal: AbortSignal.timeout(15000),
      });
      const d = await r.json().catch(() => null);
      // El servidor explica qué pasó (captcha, sin configurar) aunque no sea 200
      if (!r.ok && !(d && d.hint)) throw new Error('servidor');
      if (!d || d.ok !== true) { aviso('No se envió', (d && d.hint) || 'Revisa los datos e intenta de nuevo.', true); return; }
      aviso('¡Mensaje enviado!', 'Lo leemos y te respondemos al correo que dejaste.', false);
      form.reset();
    } catch (err) {
      aviso('No pudimos enviarlo', 'Revisa tu conexión e intenta otra vez, o escríbenos a modoparcheoficial@gmail.com.', true);
    } finally {
      btn.disabled = false; btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy');
    }
  });
})();
