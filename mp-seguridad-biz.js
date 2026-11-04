/* =====================================================================
   ModoParche · mp-seguridad-biz.js
   Seguridad en el panel de negocios:
   - Botón "Emergencia": llamar al 123 (Policía) o a la Línea 155.
   - Verificar a un cliente con su QR de identidad (nombre, sello de
     cédula verificada y calificación; nunca el número de cédula).
   - Un consejo de seguridad para el local que cambia cada día.
   Usa el lector de mp-checkin.js y la sesión de supabase-client.js.
===================================================================== */
(function () {
  'use strict';
  var DEMO = new URLSearchParams(location.search).has('demo');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var CONSEJOS = [
    'Pide el QR de identidad de ModoParche a los grupos grandes: verás si su cédula está verificada.',
    'Ten a la vista el número 123 y la ubicación exacta del local para darla rápido si hace falta.',
    'Revisa la edad de quien pide licor. Ante la duda, pide documento.',
    'Si un cliente incomoda a otros, pídele que se retire con calma y, si sigue, llama al 123.',
    'Mantén las salidas de emergencia libres y señalizadas, sobre todo en noches llenas.',
    'Acompaña a la salida a quien veas en mal estado y ayúdale a pedir transporte seguro.',
    'No entregues objetos olvidados sin confirmar de quién son.',
    'Capacita a tu equipo: quién llama, quién acompaña y quién atiende si hay una emergencia.',
  ];
  var hoy = Math.floor(Date.now() / 864e5);

  function sb() { return window.mpSupabase || null; }
  function icono(id) { return '<svg class="ic" aria-hidden="true"><use href="#' + id + '"/></svg>'; }

  function pintarConsejo() {
    var el = $('#biz-tip-txt');
    if (el) el.textContent = CONSEJOS[hoy % CONSEJOS.length];
    var t = $('#sos-biz-tip');
    if (t) t.textContent = CONSEJOS[(hoy + 3) % CONSEJOS.length];
  }

  var lector = null;
  function cerrarLector() { if (lector) { lector.detener(); lector = null; } }

  function abrirVerificar() {
    var dlg = $('#dlg-qrid');
    if (!dlg) return;
    $('#qrid-res').innerHTML = '';
    $('#qrid-reader').hidden = false;
    $('#qrid-msg').textContent = 'Apunta la cámara al QR de identidad del cliente (en su perfil de ModoParche).';
    dlg.showModal();
    if (!window.MPCheckin) { $('#qrid-msg').textContent = 'No pudimos cargar el lector.'; return; }
    lector = window.MPCheckin.escanear('qrid-reader', function (r) {
      lector = null;
      $('#qrid-reader').hidden = true;
      $('#qrid-msg').textContent = 'Revisando…';
      verificar(r.codigo);
    }, function (err, sigue) { $('#qrid-msg').textContent = err.message; if (!sigue) $('#qrid-reader').hidden = true; }, window.MPCheckin.parsearIdentidad);
  }

  function verificar(codigo) {
    var mostrar = function (d) {
      var ok = !!d.verificado;
      $('#qrid-msg').textContent = '';
      $('#qrid-res').innerHTML = '<div class="qrv ' + (ok ? 'is-ok' : 'is-warn') + '">'
        + '<b class="qrv-nombre">' + esc(d.nombre) + '</b>'
        + '<p class="qrv-sello">' + icono(ok ? 'i-shield' : 'i-alert') + ' ' + (ok ? 'Cédula verificada por ModoParche' : 'Sin verificar: pide documento') + '</p>'
        + (d.resenas ? '<p class="qrv-dato">' + Number(d.rating).toFixed(1).replace('.', ',') + ' de 5 · ' + d.resenas + ' calificaciones</p>' : '<p class="qrv-dato">Sin calificaciones todavía</p>')
        + '<button type="button" class="btn" data-action="qr-cliente">' + icono('i-scan') + 'Verificar otro</button></div>';
    };
    if (DEMO || !sb()) { mostrar({ nombre: 'Cliente de ejemplo', verificado: true, rating: 4.8, resenas: 12 }); return; }
    sb().rpc('verificar_qr_identidad', { p_codigo: codigo }).then(function (r) {
      if (r.error) {
        var m = (r.error.message || '') + ' ' + (r.error.hint || '');
        $('#qrid-msg').textContent = /QR_VENCIDO/.test(m) ? 'Ese QR ya venció. Pide que lo muestre de nuevo (cambia cada 30 s).' : /PGRST202|verificar_qr/.test(m) ? 'Falta activar esta función en la base de datos.' : 'No pudimos verificarlo. Intenta de nuevo.';
        return;
      }
      mostrar(r.data || {});
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'sos': $('#dlg-sos').showModal(); break;
      case 'cerrar-sos': $('#dlg-sos').close(); break;
      case 'qr-cliente': if ($('#dlg-sos').open) $('#dlg-sos').close(); cerrarLector(); abrirVerificar(); break;
      case 'cerrar-qrid': $('#dlg-qrid').close(); break;
    }
  });

  function iniciar() {
    pintarConsejo();
    var q = $('#dlg-qrid');
    if (q) q.addEventListener('close', cerrarLector);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
