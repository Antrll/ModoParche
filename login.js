// login.js - Inicio de sesión y registro en 3 pasos con Supabase Auth

/* ---------- Pestañas: Iniciar sesión / Crear cuenta ----------
   login.html#crear abre directo el registro. */
function switchAuth(view, { focus = false, updateHash = true } = {}) {
  const signup = view === 'signup';
  document.documentElement.classList.remove('auth-start-signup');
  document.body.classList.toggle('auth-signup', signup);
  document.querySelectorAll('.auth-tab').forEach(t => {
    const active = t.dataset.auth === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.auth-view').forEach(v => {
    const active = v.id === 'view-' + view;
    v.classList.toggle('active', active);
    v.hidden = !active;
  });
  document.title = signup ? 'Crear cuenta - ModoParche' : 'Iniciar sesión - ModoParche';
  if (updateHash && history.replaceState) history.replaceState(null, '', signup ? '#crear' : location.pathname + location.search);
  if (focus) {
    const first = document.querySelector(signup ? '#wz-step-1 input' : '#login-cred');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  }
  if (window.innerWidth <= 980) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initAuthTabs() {
  if (/^#crear/.test(location.hash)) switchAuth('signup', { updateHash: false });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-auth]');
    if (b) { switchAuth(b.dataset.auth, { focus: !b.classList.contains('auth-tab') }); return; }
    const next = e.target.closest('[data-wz-next]');
    if (next) { wzNext(Number(next.dataset.wzNext)); return; }
    const prev = e.target.closest('[data-wz-prev]');
    if (prev) wzPrev(Number(prev.dataset.wzPrev));
  });
  const tabs = Array.from(document.querySelectorAll('.auth-tab'));
  tabs.forEach((t, i) => t.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = tabs[(i + 1) % tabs.length];
    switchAuth(n.dataset.auth);
    n.focus();
  }));
  window.addEventListener('hashchange', () => switchAuth(/^#crear/.test(location.hash) ? 'signup' : 'login', { updateHash: false }));
}
initAuthTabs();

function goToStep(stepNumber) {
  document.querySelectorAll('.wz-step').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('wz-step-' + stepNumber);
  if (target) {
    target.classList.add('active');
    const firstInput = target.querySelector('input, select');
    if (firstInput) setTimeout(() => firstInput.focus(), 80);
  }
  document.querySelectorAll('.wz-dot').forEach(dot => {
    const n = parseInt(dot.dataset.dot, 10);
    dot.classList.toggle('active', n <= stepNumber);
  });
}

function stepIsValid(stepEl) {
  if (window.MP && typeof window.MP.validateWithin === 'function') return window.MP.validateWithin(stepEl);
  const inputs = stepEl.querySelectorAll('input[required], select[required]');
  for (const input of inputs) {
    if (!input.checkValidity()) { input.reportValidity(); return false; }
  }
  return true;
}

function wzNext(currentStep) {
  if (!stepIsValid(document.getElementById('wz-step-' + currentStep))) return;
  goToStep(currentStep + 1);
}
function wzPrev(currentStep) { goToStep(currentStep - 1); }

/* ---------- Edad mínima y versión de los documentos legales ---------- */
const TERMINOS_VERSION = '1.0';
function esMayorDeEdad(iso) {
  if (!iso) return false;
  const n = new Date(iso + 'T12:00:00'), hoy = new Date();
  if (isNaN(n)) return false;
  let edad = hoy.getFullYear() - n.getFullYear();
  if (hoy < new Date(hoy.getFullYear(), n.getMonth(), n.getDate())) edad--;
  return edad >= 18 && edad < 110;
}
// El calendario no deja elegir fechas de menores de 18
(function limitarFecha() {
  const f = document.getElementById('reg-fecha');
  if (!f) return;
  const d = new Date(); d.setFullYear(d.getFullYear() - 18);
  f.max = d.toISOString().slice(0, 10);
  f.min = '1915-01-01';
})();

/* ---------- Supabase Auth ---------- */
const CIUDADES = { 1: 'Villavicencio', 2: 'Acacías', 3: 'Restrepo' };
// value del formulario -> categoría del dashboard
const INTERESES = { 1: 'rumba', 2: 'comida', 3: 'pueblear', 4: 'deportes', 5: 'cultura', 6: 'gaming' };

function showStatus(id, type, title, text = '') {
  const box = document.getElementById(id);
  if (!box) return;
  box.classList.toggle('status--error', type === 'error');
  box.querySelector('.status-icon').innerHTML = type === 'error'
    ? '!'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
  box.querySelector('.status-text').innerHTML = '';
  const b = document.createElement('strong');
  b.textContent = title;
  box.querySelector('.status-text').appendChild(b);
  if (text) {
    const s = document.createElement('small');
    s.textContent = text;
    box.querySelector('.status-text').appendChild(s);
  }
  box.classList.add('is-visible');
  box.focus({ preventScroll: false });
}
function hideStatus(id) { document.getElementById(id)?.classList.remove('is-visible'); }

function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('is-loading', on);
  if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
}

// Traduce los errores de Supabase Auth a mensajes claros
// Token de Cloudflare Turnstile (undefined si el captcha no está activo)
const captcha = el => (window.MPCaptcha ? window.MPCaptcha.token(el) : Promise.resolve(undefined));

function authError(err) {
  const m = (err && (err.message || err.error_description || '')).toLowerCase();
  if (m.includes('captcha')) return window.MPCaptcha ? window.MPCaptcha.mensaje(err) : ['No pudimos verificarte', 'Recarga la página e intenta de nuevo.'];
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) return ['Ya te enviamos un correo', 'Espera unos minutos antes de pedir otro y revisa la carpeta de spam.'];
  if (m.includes('invalid login credentials')) return ['Correo o contraseña incorrectos', 'Revisa los datos e intenta de nuevo.'];
  if (m.includes('email not confirmed')) return ['Confirma tu correo primero', 'Abre el enlace que te enviamos al registrarte.'];
  if (m.includes('already registered') || m.includes('already been registered')) return ['Ese correo ya tiene cuenta', 'Inicia sesión o usa otro correo.'];
  if (m.includes('database error saving new user')) return ['No pudimos crear la cuenta', 'Revisa tu fecha de nacimiento (solo mayores de 18) o puede que esa cédula ya esté registrada.'];
  if (m.includes('password')) return ['Contraseña no válida', 'Usa mínimo 8 caracteres y una letra mayúscula.'];
  if (m.includes('rate limit') || m.includes('too many')) return ['Demasiados intentos', 'Espera un minuto y vuelve a intentar.'];
  if (m.includes('failed to fetch') || m.includes('network')) return ['Sin conexión', 'Revisa tu internet e intenta de nuevo.'];
  return ['Algo salió mal', err && err.message ? err.message : 'Intenta de nuevo en unos segundos.'];
}

// Cada tipo de cuenta tiene su panel. Ser admin lo decide solo la base de datos
// (tabla admins), nunca los metadatos que el usuario puede editar.
async function destino(user) {
  const sb = window.mpSupabase;
  if (sb) {
    try {
      const { data, error } = await sb.rpc('soy_admin');
      if (!error && data === true) return 'admin.html';
    } catch (e) { /* sin la función seguimos con el panel normal */ }
  }
  const tipo = user && user.user_metadata && user.user_metadata.tipo;
  return tipo === 'empresa' ? 'empresa-dashboard.html' : 'dashboard.html';
}

function noClient(statusId) {
  showStatus(statusId, 'error', 'No pudimos conectar con el servidor', 'Revisa tu conexión y recarga la página.');
}

// El enlace de "olvidé mi contraseña" vuelve aquí con type=recovery
const RECOVERY = /type=recovery/.test(location.hash + location.search);

function showRecover() {
  document.querySelector('.auth-tabs').hidden = true;
  document.querySelector('.biz-link').hidden = true;
  document.querySelectorAll('.auth-view').forEach(v => { const on = v.id === 'view-recover'; v.hidden = !on; v.classList.toggle('active', on); });
  document.title = 'Nueva contraseña - ModoParche';
  setTimeout(() => document.getElementById('rec-pass')?.focus(), 80);
}

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.mpSupabase;

  if (sb) sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') showRecover(); });
  if (RECOVERY) showRecover();

  // Si ya hay sesión (y no viene a cambiar la clave), directo a su panel
  if (sb && !RECOVERY) {
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) { window.location.replace(await destino(data.session.user)); return; }
    } catch (e) { /* seguimos en el login */ }
  }

  // 1. Recuperación de contraseña desplegable
  const forgotBtn = document.getElementById('forgotToggle');
  const forgotBox = document.getElementById('forgotBox');
  if (forgotBtn && forgotBox) {
    forgotBtn.addEventListener('click', () => {
      const open = forgotBox.hidden;
      forgotBox.hidden = !open;
      forgotBtn.setAttribute('aria-expanded', String(open));
      if (open) {
        const fe = document.getElementById('forgot-email');
        fe.value = fe.value || document.getElementById('login-cred').value.trim();
        fe.focus();
      }
    });
    // Enlace real para crear una contraseña nueva
    const sendBtn = document.getElementById('forgot-send');
    const fmsg = document.getElementById('forgot-msg');
    sendBtn.addEventListener('click', async () => {
      const email = document.getElementById('forgot-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fmsg.textContent = 'Escribe el correo de tu cuenta.'; fmsg.className = 'forgot-msg is-error'; return; }
      if (!sb) { fmsg.textContent = 'Sin conexión con el servidor. Intenta en un momento.'; fmsg.className = 'forgot-msg is-error'; return; }
      setLoading(sendBtn, true);
      let error;
      try {
        const captchaToken = await captcha(document.getElementById('forgotBox'));
        ({ error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL('login.html', location.href).href, captchaToken }));
      } catch (e) { error = e; }
      setLoading(sendBtn, false);
      if (error) { fmsg.textContent = authError(error).join('. '); fmsg.className = 'forgot-msg is-error'; return; }
      fmsg.textContent = `Listo. Revisa ${email} (y la carpeta de spam) y abre el enlace.`;
      fmsg.className = 'forgot-msg is-ok';
    });
  }

  // Reenviar el correo de confirmación
  const resend = document.getElementById('resend-confirm');
  resend?.addEventListener('click', async () => {
    const email = document.getElementById('login-cred').value.trim();
    if (!sb || !email) return;
    setLoading(resend, true);
    let error;
    try {
      const captchaToken = await captcha(document.getElementById('form-login'));
      ({ error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: new URL('dashboard.html?confirmado=1', location.href).href, captchaToken } }));
    } catch (e) { error = e; }
    setLoading(resend, false);
    resend.hidden = true;
    if (error) showStatus('login-status', 'error', ...authError(error));
    else showStatus('login-status', 'ok', 'Te lo enviamos de nuevo', `Revisa ${email} y abre el enlace para activar tu cuenta.`);
  });

  // Guardar la contraseña nueva
  const formRec = document.getElementById('form-recover');
  formRec?.addEventListener('submit', async e => {
    e.preventDefault();
    hideStatus('rec-status');
    if (window.MP && !window.MP.validateWithin(formRec)) return;
    const p1 = document.getElementById('rec-pass').value, p2 = document.getElementById('rec-pass2').value;
    if (p1 !== p2) { showStatus('rec-status', 'error', 'No coinciden', 'Escribe la misma contraseña en los dos campos.'); return; }
    if (!sb) { noClient('rec-status'); return; }
    const btn = document.getElementById('rec-submit');
    setLoading(btn, true);
    const { data, error } = await sb.auth.updateUser({ password: p1 });
    if (error) {
      setLoading(btn, false);
      const [t, d] = /session/i.test(error.message) ? ['El enlace venció', 'Pide uno nuevo desde «¿Olvidaste tu contraseña?».'] : authError(error);
      showStatus('rec-status', 'error', t, d);
      return;
    }
    showStatus('rec-status', 'ok', 'Contraseña actualizada', 'Te llevamos a tu cuenta…');
    const dest = await destino(data.user);
    setTimeout(() => window.location.replace(dest), 900);
  });

  // 2. Indicador en vivo de requisitos de contraseña
  const regPass = document.getElementById('reg-pass');
  const passRules = document.getElementById('passRules');
  if (regPass && passRules) {
    const lenRule = passRules.querySelector('[data-rule="len"]');
    const upRule = passRules.querySelector('[data-rule="upper"]');
    regPass.addEventListener('input', () => {
      const v = regPass.value;
      if (lenRule) lenRule.classList.toggle('is-met', v.length >= 8);
      if (upRule) upRule.classList.toggle('is-met', /[A-Z]/.test(v));
    });
  }

  // 3. Resumen en vivo de categorías + estado vacío
  const formReg = document.getElementById('form-registro');
  const errorMsg = document.getElementById('wz-error');
  const catSummary = document.getElementById('catSummary');

  function syncCategories() {
    if (!formReg) return;
    const checked = Array.from(formReg.querySelectorAll('input[name="categorias[]"]:checked'));
    if (checked.length > 0 && errorMsg) errorMsg.classList.remove('is-visible');
    if (!catSummary) return;
    catSummary.classList.toggle('has-selection', checked.length > 0);
    if (checked.length === 0) {
      catSummary.textContent = 'Elige al menos una para encender tu radar.';
    } else {
      const names = checked.map(c => c.nextElementSibling?.textContent || '').filter(Boolean);
      catSummary.textContent = `Tu radar arrancará con: ${names.join(', ')}.`;
    }
  }

  // Confirmar el correo: panel con el correo, botón para abrirlo y reenviar con espera
  const BUZONES = [
    [/@(gmail|googlemail)\.com$/i, 'https://mail.google.com/mail/u/0/#search/from%3Amodoparcheoficial%40gmail.com', 'Abrir Gmail'],
    [/@(outlook|hotmail|live|msn)\.[a-z.]+$/i, 'https://outlook.live.com/mail/0/', 'Abrir Outlook'],
    [/@yahoo\.[a-z.]+$/i, 'https://mail.yahoo.com/', 'Abrir Yahoo Mail'],
    [/@(icloud|me|mac)\.com$/i, 'https://www.icloud.com/mail', 'Abrir iCloud Mail'],
  ];
  const panelConf = document.getElementById('confirm-mail');
  let correoPendiente = '', esperaHasta = 0, relojEspera = 0;
  function pintarEspera() {
    const b = document.getElementById('confirm-reenviar');
    const s = Math.ceil((esperaHasta - Date.now()) / 1000);
    if (s > 0) { b.disabled = true; b.textContent = `Reenviar en ${s} s`; relojEspera = setTimeout(pintarEspera, 1000); }
    else { b.disabled = false; b.textContent = 'Reenviar el correo'; }
  }
  function mostrarConfirmacion(email) {
    if (!panelConf) { showStatus('reg-status', 'ok', 'Revisa tu correo', `Te enviamos un enlace a ${email} para activar tu cuenta.`); return; }
    correoPendiente = email;
    try { sessionStorage.setItem('mp_confirmar', email); } catch (e) { /* sin almacenamiento */ }
    document.getElementById('confirm-email').textContent = email;
    const buzon = BUZONES.find(([re]) => re.test(email));
    const abrir = document.getElementById('confirm-abrir');
    abrir.hidden = !buzon;
    if (buzon) { abrir.href = buzon[1]; abrir.textContent = buzon[2]; }
    document.getElementById('confirm-msg').textContent = '';
    formReg.hidden = true;
    document.querySelector('.wizard-progress')?.setAttribute('hidden', '');
    document.getElementById('signup-switch')?.setAttribute('hidden', '');
    panelConf.hidden = false;
    panelConf.focus();
    esperaHasta = Date.now() + 60000; clearTimeout(relojEspera); pintarEspera();
  }
  document.getElementById('confirm-reenviar')?.addEventListener('click', async () => {
    if (!sb || !correoPendiente || Date.now() < esperaHasta) return;
    const b = document.getElementById('confirm-reenviar'), msg = document.getElementById('confirm-msg');
    setLoading(b, true);
    let error;
    try {
      const captchaToken = await captcha(panelConf);
      ({ error } = await sb.auth.resend({ type: 'signup', email: correoPendiente, options: { emailRedirectTo: new URL('dashboard.html?confirmado=1', location.href).href, captchaToken } }));
    } catch (e) { error = e; }
    setLoading(b, false);
    msg.className = 'confirm-msg ' + (error ? 'is-error' : 'is-ok');
    msg.textContent = error ? authError(error).join('. ') : `Listo, te lo enviamos otra vez a ${correoPendiente}.`;
    esperaHasta = Date.now() + (error ? 15000 : 60000); clearTimeout(relojEspera); pintarEspera();
  });
  document.getElementById('confirm-cambiar')?.addEventListener('click', () => {
    clearTimeout(relojEspera);
    panelConf.hidden = true;
    formReg.hidden = false;
    document.querySelector('.wizard-progress')?.removeAttribute('hidden');
    document.getElementById('signup-switch')?.removeAttribute('hidden');
    goToStep(1);
    const em = document.getElementById('reg-email');
    if (em) { em.value = correoPendiente; em.focus(); em.select(); }
  });
  // Enlace de confirmación vencido o ya usado (Supabase vuelve con #error_code=...)
  const hashErr = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hashErr.get('error_code') || hashErr.get('error')) {
    const vencido = /otp_expired|expired/i.test(hashErr.get('error_code') + ' ' + hashErr.get('error_description'));
    showStatus('login-status', 'error', vencido ? 'El enlace ya venció' : 'No pudimos confirmar tu correo',
      vencido ? 'Escribe tu correo arriba y toca «Reenviar el correo de confirmación». Los enlaces duran 24 horas y sirven una sola vez.' : 'Intenta entrar con tu correo y contraseña. Si no puedes, pide un correo nuevo.');
    const r = document.getElementById('resend-confirm');
    if (r) r.hidden = false;
    try { const pend = sessionStorage.getItem('mp_confirmar'); const c = document.getElementById('login-cred'); if (pend && c && !c.value) c.value = pend; } catch (e) { /* nada */ }
    history.replaceState(null, '', location.pathname + location.search);
  }

  // 4. Registro con Supabase Auth
  if (formReg) {
    formReg.addEventListener('change', syncCategories);
    formReg.addEventListener('submit', async e => {
      e.preventDefault();
      hideStatus('reg-status');
      const marcadas = formReg.querySelectorAll('input[name="categorias[]"]:checked');
      if (marcadas.length === 0) { errorMsg && errorMsg.classList.add('is-visible'); return; }
      // Consentimiento expreso: términos y tratamiento de datos (Ley 1581 de 2012)
      for (const id of ['reg-terminos', 'reg-datos']) {
        const c = document.getElementById(id);
        if (!c.checked) { showStatus('reg-status', 'error', 'Falta tu autorización', c.dataset.error); c.focus(); return; }
      }
      // Solo mayores de 18
      if (!esMayorDeEdad(document.getElementById('reg-fecha').value)) {
        showStatus('reg-status', 'error', 'Solo para mayores de 18', 'ModoParche es solo para mayores de edad. Revisa tu fecha de nacimiento.');
        goToStep(2);
        return;
      }
      if (!sb) { noClient('reg-status'); return; }

      const fd = new FormData(formReg);
      const password = String(fd.get('password') || '');
      if (password.length < 8 || !/[A-Z]/.test(password)) {
        showStatus('reg-status', 'error', 'Contraseña no válida', 'Usa mínimo 8 caracteres y una letra mayúscula.');
        goToStep(1);
        return;
      }
      const btn = document.getElementById('wz-submit');
      setLoading(btn, true);
      try {
        const email = String(fd.get('email') || '').trim();
        const captchaToken = await captcha(formReg);
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            captchaToken,
            emailRedirectTo: new URL('dashboard.html?confirmado=1', window.location.href).href,
            // Solo llenan el perfil inicial; los permisos nunca dependen de esto
            data: {
              nombre: String(fd.get('nombre') || '').trim(),
              cedula: String(fd.get('cedula') || '').replace(/\D/g, ''),
              telefono: String(fd.get('telefono') || '').replace(/\D/g, ''),
              ciudad: CIUDADES[fd.get('ciudad_id')] || 'Villavicencio',
              fecha_nacimiento: fd.get('fecha_nacimiento') || null,
              instagram: String(fd.get('instagram_usuario') || '').trim() || null,
              intereses: Array.from(marcadas).map(c => INTERESES[c.value]).filter(Boolean),
              // Prueba de la autorización (versión de los documentos y fecha)
              acepta_terminos: TERMINOS_VERSION,
              autoriza_datos: TERMINOS_VERSION,
              recibe_anuncios: !!document.getElementById('reg-anuncios')?.checked,
              mayor_de_edad: true,
              consentimiento_en: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          window.location.replace('dashboard.html');
          return;
        }
        // Supabase pide confirmar el correo antes de iniciar sesión
        formReg.reset();
        syncCategories();
        mostrarConfirmacion(email);
      } catch (err) {
        const [t, d] = authError(err);
        showStatus('reg-status', 'error', t, d);
      }
      setLoading(btn, false);
    });
  }

  // 5. Inicio de sesión con Supabase Auth
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async e => {
      e.preventDefault();
      hideStatus('login-status');
      if (window.MP && !window.MP.validateWithin(formLogin)) return;
      if (!sb) { noClient('login-status'); return; }

      const email = document.getElementById('login-cred')?.value?.trim() || '';
      const password = document.getElementById('login-pass')?.value || '';
      if (!email.includes('@')) {
        showStatus('login-status', 'error', 'Entra con tu correo', 'El inicio de sesión es con el correo con el que te registraste.');
        return;
      }
      const btn = document.getElementById('login-submit');
      setLoading(btn, true);
      try {
        const captchaToken = await captcha(formLogin);
        const { data, error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (error) throw error;
        window.location.replace(await destino(data.user));
        return;
      } catch (err) {
        const [t, d] = authError(err);
        showStatus('login-status', 'error', t, d);
        const r = document.getElementById('resend-confirm');
        if (r) r.hidden = !/not confirmed/i.test(String(err && err.message));
      }
      setLoading(btn, false);
    });
  }
});
