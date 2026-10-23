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

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
