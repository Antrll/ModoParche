/* ModoParche · arranque antes de pintar: tema, clase de JS y ayudas sin código en línea */
(function () {
  var r = document.documentElement, s = document.currentScript, t = 'sistema';
  try { t = localStorage.getItem('mp_tema') || 'sistema'; } catch (e) { /* sin almacenamiento */ }
  var d = t === 'oscuro' || (t !== 'claro' && t !== 'mixto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  if (d) r.classList.add('is-dark'); else if (t === 'mixto') r.classList.add('is-mixto');
  if (s && s.hasAttribute('data-js')) r.classList.add('mp-js');
  if (s && s.dataset.auth && location.hash.indexOf(s.dataset.auth) === 0) r.classList.add('auth-start-signup');
  if (s && s.dataset.redirige) location.replace(s.dataset.redirige + location.hash);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-recargar]');
    if (b) location.reload();
  });
  document.addEventListener('error', function (e) {
    var i = e.target;
    if (i && i.tagName === 'IMG' && i.hasAttribute('data-quitar-si-falla')) i.remove();
  }, true);
})();
