// login.js — Lógica de la página de autenticación (login.php)

// ---------- Pestañas Iniciar sesión / Crear cuenta ----------
function switchAuth(view, btn) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('view-' + view).classList.add('active');
}

// ---------- Wizard de registro (3 pasos) ----------
function goToStep(stepNumber) {
  document.querySelectorAll('.wz-step').forEach(s => s.classList.remove('active'));
  document.getElementById('wz-step-' + stepNumber).classList.add('active');

  document.querySelectorAll('.wz-dot').forEach(dot => {
    const n = parseInt(dot.dataset.dot, 10);
    dot.classList.toggle('active', n <= stepNumber);
  });
}

// Valida los campos "required" que están DENTRO del paso actual antes de avanzar
function stepIsValid(stepEl) {
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

// Antes de enviar el formulario completo, exigimos al menos 1 categoría marcada
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('form-registro');
  const errorMsg = document.getElementById('wz-error');

  if (form) {
    form.addEventListener('submit', function (e) {
      const marcadas = form.querySelectorAll('input[name="categorias[]"]:checked');
      if (marcadas.length === 0) {
        e.preventDefault();
        errorMsg.textContent = 'Selecciona al menos una categoría de interés.';
        errorMsg.style.display = 'block';
      }
    });
  }
});
