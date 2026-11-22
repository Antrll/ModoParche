/* =====================================================================
   ModoParche - mp-utils.js
   Utilidades que comparten los paneles de usuarios, negocios y admin.
===================================================================== */
(function () {
  'use strict';
  var nf = new Intl.NumberFormat('es-CO');
  var MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAPA[c]; }); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function int(n) { return nf.format(Math.round(Number(n) || 0)); }
  function money(n) { return '$' + int(n); }
  window.MPUtil = { esc: esc, norm: norm, int: int, money: money };
})();
