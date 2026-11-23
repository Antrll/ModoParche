/* =====================================================================
   ModoParche - mp-cargando.js
   Indicador de "actualizando" con el logo de ModoParche, igual al de
   deslizar para recargar en el celular: un círculo flotante debajo de la
   barra, con el isotipo que se mece y un anillo naranja que gira. La página
   sigue a la vista y se puede usar mientras tanto.

   Uso:
     MPCargando.con(boton, () => cargarAlgo())   // muestra, espera y oculta
     const fin = MPCargando.mostrar(boton); ...; fin();
   Se ve al menos 650 ms para que no parpadee; varias cargas a la vez
   comparten el mismo indicador.
===================================================================== */
(() => {
  'use strict';
  const MINIMO = 650;
  let el = null, activos = 0, ocultar = 0;

  function crear() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'mp-cargando';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="mp-cargando-badge" aria-hidden="true">' +
        '<svg class="mp-cargando-ring" viewBox="0 0 48 48"><circle class="mp-cargando-trk" cx="24" cy="24" r="21"/><circle class="mp-cargando-val" cx="24" cy="24" r="21" pathLength="100"/></svg>' +
        '<img class="mp-cargando-lt" src="src/assets/web/isotipo-96.png" alt="" width="30" height="30">' +
        '<img class="mp-cargando-dk" src="src/assets/web/isotipo-light-96.png" alt="" width="30" height="30">' +
      '</div><span class="mp-cargando-txt">Actualizando…</span>';
    document.body.appendChild(el);
    return el;
  }

  function mostrar(boton) {
    crear();
    clearTimeout(ocultar);
    activos++;
    const desde = performance.now();
    el.classList.remove('is-fuera');
    requestAnimationFrame(() => el.classList.add('is-on'));
    if (boton) { boton.classList.add('is-cargando'); boton.setAttribute('aria-busy', 'true'); boton.disabled = true; }
    let hecho = false;
    return function fin() {
      if (hecho) return;
      hecho = true;
      const espera = Math.max(0, MINIMO - (performance.now() - desde));
      setTimeout(() => {
        if (boton) { boton.classList.remove('is-cargando'); boton.removeAttribute('aria-busy'); boton.disabled = false; }
        activos = Math.max(0, activos - 1);
        if (activos) return;
        el.classList.add('is-fuera');
        ocultar = setTimeout(() => el.classList.remove('is-on', 'is-fuera'), 420);
      }, espera);
    };
  }

  async function con(boton, tarea) {
    const fin = mostrar(boton);
    try { return await tarea(); } finally { fin(); }
  }

  window.MPCargando = { mostrar, con };
})();
