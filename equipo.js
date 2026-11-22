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
    const cfg = window.MP_SUPABASE;
    btn.disabled = true; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
    status.classList.remove('is-visible');
    try {
      const r = await fetch(cfg.url + '/rest/v1/rpc/enviar_contacto', {
        method: 'POST',
        headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_nombre: form.name.value, p_correo: form.email.value, p_motivo: MOTIVOS[form.topic.value] || 'contacto',
          p_mensaje: form.msg.value, p_sitio: form.sitio ? form.sitio.value : '',
        }),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error('servidor');
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
