// login.js - Inicio de sesión y registro en 3 pasos con Supabase Auth

/* ---------- Pestañas y asistente (los usa login.html con onclick) ---------- */
function switchAuth(view, btn) {
  document.querySelectorAll('.auth-tab').forEach(t => {
    const active = t === btn;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.auth-view').forEach(v => {
    const active = v.id === 'view-' + view;
    v.classList.toggle('active', active);
    v.hidden = !active;
  });
}

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
function authError(err) {
  const m = (err && (err.message || err.error_description || '')).toLowerCase();
  if (m.includes('invalid login credentials')) return ['Correo o contraseña incorrectos', 'Revisa los datos e intenta de nuevo.'];
  if (m.includes('email not confirmed')) return ['Confirma tu correo primero', 'Abre el enlace que te enviamos al registrarte.'];
  if (m.includes('already registered') || m.includes('already been registered')) return ['Ese correo ya tiene cuenta', 'Inicia sesión o usa otro correo.'];
  if (m.includes('database error saving new user')) return ['No pudimos crear la cuenta', 'Puede que esa cédula ya esté registrada.'];
  if (m.includes('password')) return ['Contraseña no válida', 'Usa mínimo 8 caracteres y una letra mayúscula.'];
  if (m.includes('rate limit') || m.includes('too many')) return ['Demasiados intentos', 'Espera un minuto y vuelve a intentar.'];
  if (m.includes('failed to fetch') || m.includes('network')) return ['Sin conexión', 'Revisa tu internet e intenta de nuevo.'];
  return ['Algo salió mal', err && err.message ? err.message : 'Intenta de nuevo en unos segundos.'];
}

function noClient(statusId) {
  showStatus(statusId, 'error', 'No pudimos conectar con el servidor', 'Revisa tu conexión y recarga la página.');
}

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.mpSupabase;

  // Si ya hay sesión, directo al dashboard
  if (sb) {
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) { window.location.replace('dashboard.html'); return; }
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
    });
  }

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
  const catEmpty = document.getElementById('catEmpty');
  const catSummary = document.getElementById('catSummary');

  function syncCategories() {
    if (!formReg) return;
    const checked = Array.from(formReg.querySelectorAll('input[name="categorias[]"]:checked'));
    if (checked.length > 0 && errorMsg) errorMsg.classList.remove('is-visible');
    if (!catEmpty || !catSummary) return;
    catEmpty.classList.toggle('has-selection', checked.length > 0);
    if (checked.length === 0) {
      catSummary.textContent = 'Elige al menos una categoría para encender tu radar personal.';
    } else {
      const names = checked.map(c => c.nextElementSibling?.textContent || '').filter(Boolean);
      catSummary.textContent = `Tu radar arrancará con: ${names.join(', ')}.`;
    }
  }

  // 4. Registro con Supabase Auth
  if (formReg) {
    formReg.addEventListener('change', syncCategories);
    formReg.addEventListener('submit', async e => {
      e.preventDefault();
      hideStatus('reg-status');
      const marcadas = formReg.querySelectorAll('input[name="categorias[]"]:checked');
      if (marcadas.length === 0) { errorMsg && errorMsg.classList.add('is-visible'); return; }
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
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL('dashboard.html', window.location.href).href,
            // Solo llenan el perfil inicial; los permisos nunca dependen de esto
            data: {
              nombre: String(fd.get('nombre') || '').trim(),
              cedula: String(fd.get('cedula') || '').replace(/\D/g, ''),
              telefono: String(fd.get('telefono') || '').replace(/\D/g, ''),
              ciudad: CIUDADES[fd.get('ciudad_id')] || 'Villavicencio',
              fecha_nacimiento: fd.get('fecha_nacimiento') || null,
              instagram: String(fd.get('instagram_usuario') || '').trim() || null,
              intereses: Array.from(marcadas).map(c => INTERESES[c.value]).filter(Boolean),
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          window.location.replace('dashboard.html');
          return;
        }
        // Supabase pide confirmar el correo antes de iniciar sesión
        showStatus('reg-status', 'ok', 'Revisa tu correo', `Te enviamos un enlace a ${email} para activar tu cuenta.`);
        formReg.reset();
        syncCategories();
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
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.replace('dashboard.html');
        return;
      } catch (err) {
        const [t, d] = authError(err);
        showStatus('login-status', 'error', t, d);
      }
      setLoading(btn, false);
    });
  }
});
