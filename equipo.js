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

/* Formulario de contacto y empleo: envía a /api/contacto y ofrece respaldo directo si falla */
(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const btn = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.status');
  const txt = status.querySelector('.status-text');
  const msgIn = document.getElementById('msg');
  const countEl = document.getElementById('msgCount');
  const MOTIVOS = {
    'Tengo una idea o parche': 'contacto',
    'Quiero sumarme al equipo': 'empleo',
    'Tengo un negocio en Villavo': 'negocio',
    'Prensa o alianza': 'prensa',
  };

  if (msgIn && countEl) {
    const syncCount = () => { countEl.textContent = `${msgIn.value.length}/1500`; };
    msgIn.addEventListener('input', syncCount);
    syncCount();
  }

  const aviso = (titulo, detalle, error, respaldo) => {
    txt.replaceChildren();
    const b = document.createElement('b');
    const s2 = document.createElement('small');
    b.textContent = titulo;
    s2.textContent = detalle;
    txt.append(b, s2);
    if (respaldo) {
      const acciones = document.createElement('div');
      acciones.className = 'status-actions';
      const mailto = document.createElement('a');
      mailto.className = 'status-link';
      const asunto = encodeURIComponent(`[ModoParche] ${respaldo.tema}`);
      const cuerpo = encodeURIComponent(`Nombre: ${respaldo.nombre}\nCorreo: ${respaldo.correo}\n\n${respaldo.mensaje}`);
      mailto.href = `mailto:modoparcheoficial@gmail.com?subject=${asunto}&body=${cuerpo}`;
      mailto.textContent = 'Enviar por correo';
      const wa = document.createElement('a');
      wa.className = 'status-link status-link--alt';
      wa.target = '_blank';
      wa.rel = 'noopener noreferrer';
      wa.href = `https://wa.me/573112363903?text=${encodeURIComponent(`Hola ModoParche (${respaldo.tema}). Soy ${respaldo.nombre} (${respaldo.correo}): ${respaldo.mensaje}`)}`;
      wa.textContent = 'Enviar por WhatsApp';
      acciones.append(mailto, wa);
      txt.append(acciones);
    }
    status.classList.toggle('is-error', !!error);
    status.classList.add('is-visible');
    status.focus({ preventScroll: true });
  };

  const URL_EDGE = ((window.MP_SUPABASE && window.MP_SUPABASE.url) || 'https://quxqqxnowlwiahorifpy.supabase.co') + '/functions/v1/contacto';
  const enviarA = async (url, cuerpo) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json().catch(() => null);
    return { r, d };
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (btn.disabled) return;
    if (window.MPValidar && !window.MPValidar(form)) return;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    status.classList.remove('is-visible');

    const respaldo = {
      tema: form.topic ? form.topic.value : 'Contacto',
      nombre: form.name.value.trim(),
      correo: form.email.value.trim(),
      mensaje: form.msg.value.trim(),
    };

    // Token de Turnstile opcional (si bloqueador o red lo frena, no bloquea el envío)
    let token = '';
    if (window.MPCaptcha && window.MPCaptcha.activo && window.MPCaptcha.activo()) {
      try { token = (await window.MPCaptcha.token(form)) || ''; }
      catch { token = ''; }
    }

    const cuerpo = {
      nombre: respaldo.nombre,
      correo: respaldo.correo,
      motivo: MOTIVOS[respaldo.tema] || 'contacto',
      mensaje: respaldo.mensaje,
      sitio: form.sitio ? form.sitio.value : '',
      token,
    };

    try {
      let { r, d } = await enviarA('/api/contacto', cuerpo);
      if (r.status === 404) ({ r, d } = await enviarA(URL_EDGE, cuerpo));
      if (r.ok && d && d.ok === true) {
        aviso('¡Mensaje enviado!', 'Lo recibimos en nuestro panel y te respondemos pronto al correo que dejaste.', false);
        form.reset();
        if (countEl) countEl.textContent = '0/1500';
        return;
      }
      if (d && d.hint) {
        aviso('No se pudo enviar automático', d.hint, true, r.status >= 500 ? respaldo : null);
        return;
      }
      throw new Error('servidor');
    } catch {
      aviso(
        'No pudimos enviarlo por aquí',
        'Puedes mandarnos exactamente este mismo mensaje en un toque por correo o WhatsApp:',
        true,
        respaldo
      );
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
    }
  });
})();
