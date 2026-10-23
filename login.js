// login.js - Lógica de autenticación y wizard de registro en 3 pasos

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
  if (window.MP && typeof window.MP.validateWithin === 'function') {
    return window.MP.validateWithin(stepEl);
  }
  const inputs = stepEl.querySelectorAll('input[required], select[required]');
  for (const input of inputs) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  return true;
}

function wzNext(currentStep) {
  const currentEl = document.getElementById('wz-step-' + currentStep);
  if (!stepIsValid(currentEl)) return;
  goToStep(currentStep + 1);
}

function wzPrev(currentStep) {
  goToStep(currentStep - 1);
}

document.addEventListener('DOMContentLoaded', () => {
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
    const upRule  = passRules.querySelector('[data-rule="upper"]');
    regPass.addEventListener('input', () => {
      const v = regPass.value;
      if (lenRule) lenRule.classList.toggle('is-met', v.length >= 8);
      if (upRule)  upRule.classList.toggle('is-met', /[A-Z]/.test(v));
    });
  }

  // 3. Resumen en vivo de categorías seleccionadas + estado vacío
  const formReg    = document.getElementById('form-registro');
  const errorMsg   = document.getElementById('wz-error');
  const catEmpty   = document.getElementById('catEmpty');
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

  if (formReg) {
    formReg.addEventListener('change', syncCategories);
    formReg.addEventListener('submit', async e => {
      const marcadas = formReg.querySelectorAll('input[name="categorias[]"]:checked');
      if (marcadas.length === 0) {
        e.preventDefault();
        if (errorMsg) errorMsg.classList.add('is-visible');
        return;
      }

      // Si Supabase DB está configurado, procesar registro directamente
      if (window.ModoParcheDB) {
        e.preventDefault();
        const btn = document.getElementById('wz-submit');
        if (btn) {
          btn.classList.add('is-loading');
          btn.setAttribute('aria-busy', 'true');
        }

        const formData = new FormData(formReg);
        const cats = Array.from(marcadas).map(c => c.value);
        const datos = {
          nombre: formData.get('nombre'),
          cedula: formData.get('cedula'),
          telefono: formData.get('telefono'),
          email: formData.get('email'),
          password: formData.get('password'),
          ciudad_id: parseInt(formData.get('ciudad_id') || '1', 10),
          fecha_nacimiento: formData.get('fecha_nacimiento') || null,
          instagram: formData.get('instagram_usuario') || null,
          categorias: cats
        };

        try {
          const usuario = await window.ModoParcheDB.registrarUsuario(datos);
          localStorage.setItem('mp_user', JSON.stringify(usuario));
          alert('¡Cuenta creada exitosamente en Supabase! Bienvenido a ModoParche.');
          window.location.href = 'dashboard.html';
        } catch (err) {
          console.error(err);
          alert('Error al registrar: ' + (err.message || 'Verifica los datos ingresados.'));
          if (btn) {
            btn.classList.remove('is-loading');
            btn.removeAttribute('aria-busy');
          }
        }
        return;
      }

      const btn = document.getElementById('wz-submit');
      if (btn) {
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
      }
    });
  }

  // 4. Formulario de login: validación en línea + estado de carga + Supabase
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async e => {
      if (window.MP && !window.MP.validateWithin(formLogin)) {
        e.preventDefault();
        return;
      }

      if (window.ModoParcheDB) {
        e.preventDefault();
        const btn = document.getElementById('login-submit');
        if (btn) {
          btn.classList.add('is-loading');
          btn.setAttribute('aria-busy', 'true');
        }

        const cred = document.getElementById('login-cred')?.value?.trim();
        const pass = document.getElementById('login-pass')?.value;

        try {
          const usuario = await window.ModoParcheDB.login(cred, pass);
          localStorage.setItem('mp_user', JSON.stringify(usuario));
          alert('¡Bienvenido de nuevo, ' + usuario.nombre + '!');
          window.location.href = 'dashboard.html';
        } catch (err) {
          console.error(err);
          alert(err.message || 'Datos incorrectos. Intenta de nuevo.');
          if (btn) {
            btn.classList.remove('is-loading');
            btn.removeAttribute('aria-busy');
          }
        }
        return;
      }

      const btn = document.getElementById('login-submit');
      if (btn) {
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
      }
    });
  }
});