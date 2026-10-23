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
    formReg.addEventListener('submit', e => {
      const marcadas = formReg.querySelectorAll('input[name="categorias[]"]:checked');
      if (marcadas.length === 0) {
        e.preventDefault();
        if (errorMsg) errorMsg.classList.add('is-visible');
        return;
      }
      const btn = document.getElementById('wz-submit');
      if (btn) {
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
      }
    });
  }

  // 4. Formulario de login: validación en línea + estado de carga
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', e => {
      if (window.MP && !window.MP.validateWithin(formLogin)) {
        e.preventDefault();
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
