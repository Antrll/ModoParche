/* =====================================================================
   ModoParche - empresa.js
   Crear cuenta de negocio (3 pasos + plan) y entrar como negocio.
   La cuenta se crea con Supabase Auth; la base de datos arma la fila
   en "negocios" (migración 20261027120000_cuentas_negocio.sql).
   empresa.html#entrar abre directo el acceso; ?plan=villavo preselecciona.
===================================================================== */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  const PLANES = { basico: 'Parche básico', villavo: 'Parche Villavo', sedes: 'Varias sedes' };
  const CAT_LABEL = { comida: 'Comida', rumba: 'Rumba', chill: 'Plan chill', pueblear: 'Aventura', deportes: 'Deporte', conciertos: 'Conciertos', cultura: 'Cultura', gaming: 'Gaming' };

  /* ---------- Pestañas Crear / Entrar ---------- */
  function setView(view, { updateHash = true, focus = false } = {}) {
    const entrar = view === 'entrar';
    document.documentElement.classList.remove('auth-start-signup');
    document.body.classList.toggle('auth-signup', entrar); // mueve la píldora a la derecha
    $$('.auth-tab').forEach(t => {
      const on = t.dataset.biz === view;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$('.auth-view').forEach(v => {
      const on = v.id === 'view-' + view;
      v.classList.toggle('active', on);
      v.hidden = !on;
    });
    if (updateHash && history.replaceState) history.replaceState(null, '', entrar ? '#entrar' : location.pathname + location.search);
    if (focus) setTimeout(() => $(entrar ? '#bz-login-email' : '#bz-nombre')?.focus({ preventScroll: true }), 60);
    if (window.innerWidth <= 980) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Asistente de 3 pasos ---------- */
  function goStep(n) {
    $$('#form-negocio .wz-step').forEach(s => s.classList.toggle('active', s.id === 'bz-step-' + n));
    $$('#view-crear .wz-dot').forEach(d => d.classList.toggle('active', Number(d.dataset.dot) <= n));
    const first = $(`#bz-step-${n} input, #bz-step-${n} select`);
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 80);
    if (window.innerWidth <= 980) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const valid = el => (window.MP ? window.MP.validateWithin(el) : true);

  /* ---------- Estado y mensajes ---------- */
  function showStatus(id, type, title, text = '') {
    const box = document.getElementById(id);
    if (!box) return;
    box.classList.toggle('status--error', type === 'error');
    box.querySelector('.status-icon').innerHTML = type === 'error' ? '!'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
    const t = box.querySelector('.status-text');
    t.innerHTML = '';
    const b = document.createElement('strong'); b.textContent = title; t.appendChild(b);
    if (text) { const s = document.createElement('small'); s.textContent = text; t.appendChild(s); }
    box.classList.add('is-visible');
    box.focus({ preventScroll: false });
  }
  const hideStatus = id => document.getElementById(id)?.classList.remove('is-visible');
  function setLoading(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-loading', on);
    if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
  }
  function authError(err) {
    const m = String((err && (err.message || err.error_description)) || '').toLowerCase();
    if (m.includes('invalid login credentials')) return ['Correo o contraseña incorrectos', 'Revisa los datos e intenta de nuevo.'];
    if (m.includes('email not confirmed')) return ['Confirma tu correo primero', 'Abre el enlace que te enviamos al crear la cuenta.'];
    if (m.includes('already registered') || m.includes('already been registered')) return ['Ese correo ya tiene cuenta', 'Entra con él o usa otro correo para el negocio.'];
    if (m.includes('database error saving new user')) return ['No pudimos crear la cuenta', 'Revisa los datos del negocio e intenta de nuevo.'];
    if (m.includes('password')) return ['Contraseña no válida', 'Usa mínimo 8 caracteres y una letra mayúscula.'];
    if (m.includes('rate limit') || m.includes('too many')) return ['Demasiados intentos', 'Espera un minuto y vuelve a intentar.'];
    if (m.includes('failed to fetch') || m.includes('network')) return ['Sin conexión', 'Revisa tu internet e intenta de nuevo.'];
    return ['Algo salió mal', (err && err.message) || 'Intenta de nuevo en unos segundos.'];
  }

  /* ---------- Vista previa en vivo ---------- */
  function categoria() {
    const opt = $('#bz-tipo')?.selectedOptions[0];
    return (opt && opt.dataset.cat) || 'comida';
  }
  function plan() { return ($('input[name="plan"]:checked') || {}).value || 'villavo'; }
  function syncPreview() {
    const cat = categoria();
    const name = $('#bz-nombre').value.trim();
    const barrio = $('#bz-barrio').value.trim();
    const ciudad = $('#bz-ciudad').value;
    $('#pvName').textContent = name || 'Tu negocio';
    $('#pvZone').textContent = barrio ? `${barrio} · ${ciudad}` : ciudad;
    $('#pvCat').textContent = CAT_LABEL[cat] || 'Comida';
    $('#pvPlan').textContent = PLANES[plan()];
    $('#sedesField').hidden = plan() !== 'sedes';
  }

  /* ---------- Inicio ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    const sb = window.mpSupabase;

    // Plan desde el enlace (?plan=basico|villavo|sedes)
    const qp = new URLSearchParams(location.search).get('plan');
    if (qp && PLANES[qp]) { const r = $(`input[name="plan"][value="${qp}"]`); if (r) r.checked = true; }
    if (/^#entrar/.test(location.hash)) setView('entrar', { updateHash: false });
    syncPreview();

    // Si ya hay sesión de negocio, directo al panel
    if (sb) {
      try {
        const { data } = await sb.auth.getSession();
        const u = data && data.session && data.session.user;
        if (u && u.user_metadata && u.user_metadata.tipo === 'empresa') { location.replace('empresa-dashboard.html'); return; }
      } catch (e) { /* seguimos aquí */ }
    }

    document.addEventListener('click', e => {
      const t = e.target.closest('[data-biz]');
      if (t) { setView(t.dataset.biz, { focus: !t.classList.contains('auth-tab') }); return; }
      const n = e.target.closest('[data-bz-next]');
      if (n) { const k = Number(n.dataset.bzNext); if (valid($('#bz-step-' + k))) goStep(k + 1); return; }
      const p = e.target.closest('[data-bz-prev]');
      if (p) goStep(Number(p.dataset.bzPrev) - 1);
    });
    window.addEventListener('hashchange', () => setView(/^#entrar/.test(location.hash) ? 'entrar' : 'crear', { updateHash: false }));

    const form = $('#form-negocio');
    form.addEventListener('input', syncPreview);
    form.addEventListener('change', syncPreview);

    // Reglas de la contraseña en vivo
    const pass = $('#bz-pass'), rules = $('#bzPassRules');
    pass.addEventListener('input', () => {
      rules.querySelector('[data-rule="len"]').classList.toggle('is-met', pass.value.length >= 8);
      rules.querySelector('[data-rule="upper"]').classList.toggle('is-met', /[A-Z]/.test(pass.value));
    });

    // Crear cuenta de negocio
    form.addEventListener('submit', async e => {
      e.preventDefault();
      hideStatus('bz-status');
      if (!$('#bz-acepto').checked) { showStatus('bz-status', 'error', 'Falta tu confirmación', 'Marca la casilla para crear la cuenta.'); return; }
      if (!$('#bz-terminos').checked) { showStatus('bz-status', 'error', 'Falta tu autorización', 'Acepta los términos y la política de privacidad para crear la cuenta.'); return; }
      if (plan() === 'sedes' && !valid($('#sedesField'))) return;
      // Revalida pasos anteriores por si alguien volvió y borró algo
      for (const k of [1, 2]) if (!valid($('#bz-step-' + k))) { goStep(k); return; }
      if (!sb) { showStatus('bz-status', 'error', 'No pudimos conectar con el servidor', 'Revisa tu conexión y recarga la página.'); return; }

      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const btn = $('#bz-submit');
      setLoading(btn, true);
      // Buscamos la ubicación exacta del local con su dirección (OpenStreetMap, gratis).
      // Si no aparece, el dueño la ajusta tocando el mapa en su panel.
      let geo = null;
      if (window.MPMapa) {
        try {
          geo = await Promise.race([
            window.MPMapa.geocodificarDireccion({ direccion: fd.get('direccion'), barrio: fd.get('barrio'), ciudad: fd.get('ciudad'), nombre: fd.get('negocio') }),
            new Promise(r => setTimeout(() => r(null), 7000)),
          ]);
        } catch (e) { geo = null; }
      }
      const planElegido = plan();
      try {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: new URL('empresa-dashboard.html?bienvenida=1', location.href).href,
            data: {
              tipo: 'empresa',
              negocio: String(fd.get('negocio') || '').trim(),
              tipo_negocio: String(fd.get('tipo_negocio') || ''),
              categoria: categoria(),
              nit: String(fd.get('nit') || '').trim(),
              ciudad: String(fd.get('ciudad') || 'Villavicencio'),
              barrio: String(fd.get('barrio') || '').trim(),
              direccion: String(fd.get('direccion') || '').trim(),
              descripcion: String(fd.get('descripcion') || '').trim(),
              responsable: String(fd.get('responsable') || '').trim(),
              telefono: String(fd.get('telefono') || '').replace(/\D/g, ''),
              // El plan pago queda pendiente hasta que se pague (la base arranca en básico)
              plan: planElegido,
              sedes: planElegido === 'sedes' ? Number(fd.get('sedes') || 2) : 1,
              lat: geo ? geo.lat : null,
              lng: geo ? geo.lng : null,
              // Prueba de la autorización
              acepta_terminos: '1.0',
              autoriza_datos: '1.0',
              recibe_anuncios: !!$('#bz-anuncios').checked,
              consentimiento_en: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        if (data.session) { location.replace('empresa-dashboard.html?bienvenida=1' + (planElegido === 'villavo' ? '&pagar=villavo' : '')); return; }
        showStatus('bz-status', 'ok', '¡Cuenta creada! Revisa tu correo', `Te enviamos un enlace a ${email}. Ábrelo para activar el panel de tu negocio.${planElegido === 'villavo' ? ' Al entrar te mostramos el pago de Parche Villavo.' : ''}`);
        btn.disabled = true;
      } catch (err) {
        const [t, d] = authError(err);
        showStatus('bz-status', 'error', t, d);
      }
      setLoading(btn, false);
    });

    // ¿Olvidaste tu contraseña? El enlace vuelve a login.html, que deja crear una nueva
    const fBtn = $('#bz-forgot'), fBox = $('#bz-forgot-box'), fMsg = $('#bz-forgot-msg');
    fBtn.addEventListener('click', () => {
      const open = fBox.hidden;
      fBox.hidden = !open; fBtn.setAttribute('aria-expanded', String(open));
      if (open) { const fe = $('#bz-forgot-email'); fe.value = fe.value || $('#bz-login-email').value.trim(); fe.focus(); }
    });
    $('#bz-forgot-send').addEventListener('click', async e => {
      const email = $('#bz-forgot-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fMsg.textContent = 'Escribe el correo del negocio.'; fMsg.className = 'forgot-msg is-error'; return; }
      if (!sb) { fMsg.textContent = 'Sin conexión con el servidor.'; fMsg.className = 'forgot-msg is-error'; return; }
      setLoading(e.currentTarget, true);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL('login.html', location.href).href });
      setLoading($('#bz-forgot-send'), false);
      if (error) { fMsg.textContent = authError(error).join('. '); fMsg.className = 'forgot-msg is-error'; return; }
      fMsg.textContent = `Listo. Revisa ${email} y abre el enlace.`;
      fMsg.className = 'forgot-msg is-ok';
    });

    // Entrar como negocio
    const formIn = $('#form-entrar');
    formIn.addEventListener('submit', async e => {
      e.preventDefault();
      hideStatus('bz-login-status');
      if (!valid(formIn)) return;
      if (!sb) { showStatus('bz-login-status', 'error', 'No pudimos conectar con el servidor', 'Revisa tu conexión y recarga la página.'); return; }
      const btn = $('#bz-login-submit');
      setLoading(btn, true);
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email: $('#bz-login-email').value.trim(), password: $('#bz-login-pass').value });
        if (error) throw error;
        try { const r = await sb.rpc('soy_admin'); if (r.data === true) { location.replace('admin.html'); return; } } catch (e2) { /* cuenta normal */ }
        const tipo = data.user && data.user.user_metadata && data.user.user_metadata.tipo;
        if (tipo !== 'empresa') {
          showStatus('bz-login-status', 'error', 'Esta es una cuenta personal', 'Te llevamos a tu radar. Para un negocio, crea una cuenta aparte con el correo del local.');
          setTimeout(() => location.replace('dashboard.html'), 1800);
          return;
        }
        location.replace('empresa-dashboard.html');
        return;
      } catch (err) {
        const [t, d] = authError(err);
        showStatus('bz-login-status', 'error', t, d);
      }
      setLoading(btn, false);
    });
  });
})();
