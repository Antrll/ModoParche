(function () {
var e = document.getElementById('e');
  function volver() { e.textContent = 'Conectando…'; location.reload(); }
  document.getElementById('r').addEventListener('click', function () { navigator.onLine ? volver() : (e.textContent = 'Todavía sin conexión. Revisa el wifi o los datos.'); });
  window.addEventListener('online', volver);
})();
