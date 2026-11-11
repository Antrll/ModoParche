/* =====================================================================
   Modo Parche · supabase-client.js
   Crea el cliente de Supabase para el navegador (window.mpSupabase).

   La llave "anon" es pública por diseño: lo que protege los datos son las
   políticas RLS de supabase/migrations. Nunca pongas aquí la llave
   service_role ni la secreta.

   Requiere cargar antes la librería:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js"></script>
===================================================================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://quxqqxnowlwiahorifpy.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1eHFxeG5vd2x3aWFob3JpZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MzMzMTIsImV4cCI6MjEwODIwOTMxMn0.rO4W027LLI5CR-wz753KFzyYiLAn-I-avLre7nbVoII';

  window.MP_SUPABASE = { url: SUPABASE_URL };

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    window.mpSupabase = null; // la librería no cargó (sin internet o página sin ella)
    return;
  }

  // Con mala señal una petición puede quedarse colgada para siempre ("cargando…"
  // eterno). Se corta a los 20 s (60 s para subir fotos) y la app muestra el
  // error normal ("Sin conexión. Revisa tu internet.").
  function fetchConLimite(url, opciones) {
    if (typeof AbortController === 'undefined') return fetch(url, opciones);
    var ctrl = new AbortController();
    var externo = opciones && opciones.signal;
    if (externo) {
      if (externo.aborted) ctrl.abort();
      else externo.addEventListener('abort', function () { ctrl.abort(); }, { once: true });
    }
    var largo = /\/storage\/v1\/object|\/functions\/v1\//.test(String(url)) ? 60000 : 20000;
    var reloj = setTimeout(function () { ctrl.abort(); }, largo);
    var o = Object.assign({}, opciones, { signal: ctrl.signal });
    return fetch(url, o).then(function (r) { clearTimeout(reloj); return r; }, function (e) {
      clearTimeout(reloj);
      // Mensaje que los manejadores de la app ya reconocen como "sin conexión"
      if (e && e.name === 'AbortError' && !(externo && externo.aborted)) throw new TypeError('Failed to fetch (tiempo de espera agotado)');
      throw e;
    });
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: fetchConLimite },
  });
  window.mpSupabase = sb;

  function unwrap(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  // Catálogo público que usan otras páginas del sitio
  window.ModoParcheDB = {
    getCiudades: function () { return sb.from('ciudades').select('*').order('id').then(unwrap); },
    getCategorias: function () { return sb.from('categorias').select('*').order('id').then(unwrap); },
    getComercios: function () { return sb.from('comercios').select('*').order('nombre').then(unwrap); },
  };
})();
