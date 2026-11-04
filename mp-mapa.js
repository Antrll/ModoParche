/* =====================================================================
   ModoParche · mp-mapa.js
   Herramientas de mapa para todos los paneles (usuario, negocio y admin).
   Todo es gratis y corre en el navegador:

   - buscar(q): busca lugares y direcciones en Villavo y el Meta.
     Photon (komoot) para sugerencias mientras se escribe y Nominatim
     (OpenStreetMap) como respaldo. Ambos sin llave.
   - inverso(lat, lng): convierte un punto del mapa en dirección y barrio.
   - geocodificarDireccion(): encuentra la ubicación exacta de un local a
     partir de su dirección, barrio y ciudad.
   - ubicar(): GPS que espera la mejor lectura (no la primera) hasta llegar
     a la precisión pedida.
   - buscador(map): caja de búsqueda dentro de cualquier mapa de Leaflet.

   Reglas de uso de Nominatim: máximo 1 consulta por segundo y nada de
   autocompletar en cada tecla. Por eso las sugerencias van con Photon y
   Nominatim solo se usa al confirmar o al soltar un pin.
===================================================================== */
(function () {
  'use strict';

  var CENTRO = { lat: 4.1420, lng: -73.6266 }; // Villavicencio
  // Caja del área de servicio: Villavicencio, Acacías, Restrepo y alrededores
  var BBOX = { minLng: -74.25, minLat: 3.70, maxLng: -73.25, maxLat: 4.50 };

  var cache = new Map();
  var ultimaNominatim = 0;

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function dentro(lat, lng) { return lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng; }

  // Distancia en metros entre dos puntos {lat, lng}
  function distancia(a, b) {
    var R = 6371000, r = function (x) { return x * Math.PI / 180; };
    var dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    var s = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function getJSON(url, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 8000) : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }

  // Nominatim pide 1 consulta por segundo: las ponemos en fila
  function nominatim(path) {
    var espera = Math.max(0, ultimaNominatim + 1100 - Date.now());
    ultimaNominatim = Date.now() + espera;
    return esperar(espera).then(function () {
      return getJSON('https://nominatim.openstreetmap.org/' + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'format=jsonv2&accept-language=es');
    });
  }

  // "Calle 15 # 40-01" -> "Calle 15 40-01" (los buscadores se confunden con # y No.)
  function limpiarDireccion(d) {
    return String(d || '')
      .replace(/\b(No\.?|N°|Nº|#)\s*/gi, ' ')
      .replace(/\b(Cl|Cll)\.?\s/gi, 'Calle ')
      .replace(/\b(Cra|Kr|Kra|Cr)\.?\s/gi, 'Carrera ')
      .replace(/\b(Av|Avda)\.?\s/gi, 'Avenida ')
      .replace(/\b(Dg)\.?\s/gi, 'Diagonal ')
      .replace(/\b(Tv|Tr)\.?\s/gi, 'Transversal ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resultadoPhoton(f) {
    var p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
    var calle = [p.street, p.housenumber].filter(Boolean).join(' ');
    var nombre = p.name || calle || p.district || p.city || 'Punto';
    var detalle = [p.name && calle ? calle : '', p.district || p.locality || '', p.city || p.county || ''].filter(Boolean).join(', ');
    return { nombre: nombre, detalle: detalle, lat: +c[1], lng: +c[0], fuente: 'photon' };
  }
  function resultadoNominatim(r) {
    var a = r.address || {};
    var nombre = r.name || [a.road, a.house_number].filter(Boolean).join(' ') || String(r.display_name || '').split(',')[0];
    var detalle = [a.road && r.name ? a.road : '', a.neighbourhood || a.suburb || a.quarter || '', a.city || a.town || a.village || ''].filter(Boolean).join(', ');
    return { nombre: nombre, detalle: detalle, lat: +r.lat, lng: +r.lon, fuente: 'osm' };
  }
  function sinRepetidos(lista) {
    var vistos = [];
    return lista.filter(function (x) {
      if (!isFinite(x.lat) || !isFinite(x.lng) || !dentro(x.lat, x.lng)) return false;
      if (vistos.some(function (v) { return distancia(v, x) < 25 && v.nombre === x.nombre; })) return false;
      vistos.push(x); return true;
    });
  }

  /* ---------- Buscar lugares y direcciones ---------- */
  function buscar(q, opts) {
    opts = opts || {};
    q = String(q || '').trim();
    if (q.length < 3) return Promise.resolve([]);
    var limite = opts.limite || 6;
    var clave = 'b:' + q.toLowerCase();
    if (cache.has(clave)) return Promise.resolve(cache.get(clave));
    var qq = limpiarDireccion(q);
    var cerca = opts.cerca || CENTRO;
    var photon = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(qq) + '&limit=' + (limite + 4)
      + '&lat=' + cerca.lat + '&lon=' + cerca.lng
      + '&bbox=' + [BBOX.minLng, BBOX.minLat, BBOX.maxLng, BBOX.maxLat].join(',');
    return getJSON(photon, 6000)
      .then(function (j) { return sinRepetidos((j.features || []).map(resultadoPhoton)); })
      .catch(function () { return []; })
      .then(function (lista) {
        if (lista.length || opts.soloRapido) return lista;
        // Respaldo: Nominatim dentro del área de servicio
        return nominatim('search?q=' + encodeURIComponent(qq) + '&countrycodes=co&addressdetails=1&limit=' + limite
          + '&viewbox=' + [BBOX.minLng, BBOX.maxLat, BBOX.maxLng, BBOX.minLat].join(',') + '&bounded=1')
          .then(function (r) { return sinRepetidos((r || []).map(resultadoNominatim)); })
          .catch(function () { return []; });
      })
      .then(function (lista) {
        lista = lista.slice(0, limite);
        cache.set(clave, lista);
        return lista;
      });
  }

  /* ---------- Del punto a la dirección ---------- */
  function inverso(lat, lng) {
    var clave = 'r:' + (+lat).toFixed(5) + ',' + (+lng).toFixed(5);
    if (cache.has(clave)) return Promise.resolve(cache.get(clave));
    return nominatim('reverse?lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1')
      .then(function (r) {
        var a = (r && r.address) || {};
        var direccion = [a.road, a.house_number].filter(Boolean).join(' ');
        var barrio = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.hamlet || '';
        var ciudad = a.city || a.town || a.village || a.municipality || '';
        var lugar = (r && r.name) || a.amenity || a.shop || a.leisure || a.tourism || a.building || '';
        var out = {
          lugar: lugar, direccion: direccion, barrio: barrio, ciudad: ciudad,
          texto: [lugar || direccion, barrio, ciudad].filter(Boolean).join(', ') || (r && r.display_name) || '',
        };
        cache.set(clave, out);
        return out;
      })
      .catch(function () { return null; });
  }

  /* ---------- Ubicación exacta de un local desde su dirección ---------- */
  function geocodificarDireccion(d) {
    d = d || {};
    var ciudad = d.ciudad || 'Villavicencio';
    var dir = limpiarDireccion(d.direccion), barrio = String(d.barrio || '').trim();
    var intentos = [];
    if (dir) {
      intentos.push({ q: 'search?street=' + encodeURIComponent(dir) + '&city=' + encodeURIComponent(ciudad) + '&state=Meta&country=Colombia&limit=1', precision: 'direccion' });
      intentos.push({ q: 'search?q=' + encodeURIComponent([dir, barrio, ciudad, 'Meta', 'Colombia'].filter(Boolean).join(', ')) + '&limit=1', precision: 'direccion' });
    }
    if (d.nombre) intentos.push({ q: 'search?q=' + encodeURIComponent([d.nombre, ciudad, 'Meta'].join(', ')) + '&limit=1', precision: 'lugar' });
    if (barrio) intentos.push({ q: 'search?q=' + encodeURIComponent([barrio, ciudad, 'Meta', 'Colombia'].join(', ')) + '&limit=1', precision: 'barrio' });
    intentos.push({ q: 'search?q=' + encodeURIComponent(ciudad + ', Meta, Colombia') + '&limit=1', precision: 'ciudad' });

    var i = 0;
    function siguiente() {
      if (i >= intentos.length) return Promise.resolve(null);
      var it = intentos[i++];
      return nominatim(it.q + '&countrycodes=co').then(function (r) {
        var x = r && r[0];
        if (x && dentro(+x.lat, +x.lon)) return { lat: +(+x.lat).toFixed(6), lng: +(+x.lon).toFixed(6), precision: it.precision, texto: x.display_name || '' };
        return siguiente();
      }).catch(siguiente);
    }
    return siguiente();
  }

  /* ---------- GPS preciso ----------
     Escucha varias lecturas y se queda con la mejor. Termina apenas una
     llega a la precisión pedida, o al cumplirse el tiempo máximo. */
  function ubicar(opts) {
    opts = opts || {};
    var objetivo = opts.objetivo || 30, maxMs = opts.maxMs || 12000;
    return new Promise(function (resolve, reject) {
      if (!('geolocation' in navigator)) { reject(Object.assign(new Error('Este navegador no comparte la ubicación.'), { code: 'SIN_GPS' })); return; }
      var mejor = null, listo = false, id = null, timer = null;
      function fin(err) {
        if (listo) return;
        listo = true;
        if (id !== null) navigator.geolocation.clearWatch(id);
        clearTimeout(timer);
        if (mejor) resolve(mejor); else reject(err || Object.assign(new Error('No pudimos leer tu ubicación.'), { code: 'TIEMPO' }));
      }
      id = navigator.geolocation.watchPosition(function (pos) {
        var p = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy || 9999, ts: pos.timestamp };
        if (!mejor || p.precision < mejor.precision) mejor = p;
        if (opts.onProgreso) opts.onProgreso(mejor);
        if (mejor.precision <= objetivo) fin();
      }, function (err) {
        var msg = err && err.code === 1 ? 'No diste permiso de ubicación. Actívalo en el candado de la barra de direcciones.'
          : err && err.code === 3 ? 'El GPS tardó demasiado. Intenta en un lugar abierto.' : 'No pudimos leer tu ubicación.';
        if (err && err.code === 1) { mejor = null; fin(Object.assign(new Error(msg), { code: 'PERMISO' })); }
        else if (!mejor) { /* seguimos esperando hasta el tiempo máximo */ }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs });
      timer = setTimeout(function () { fin(); }, maxMs);
    });
  }

  /* ---------- Caja de búsqueda dentro de un mapa de Leaflet ----------
     opts.onElegir(resultado) recibe { nombre, detalle, lat, lng }.
     opts.extras(q) devuelve lugares propios (ej. los lugares sugeridos). */
  function buscador(map, opts) {
    opts = opts || {};
    if (!map || typeof L === 'undefined') return null;
    var Control = L.Control.extend({
      options: { position: opts.posicion || 'topleft' },
      onAdd: function () {
        var box = L.DomUtil.create('div', 'mpm-search');
        box.innerHTML =
          '<form class="mpm-form" role="search">' +
            '<svg class="mpm-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>' +
            '<label class="mpm-sr">Buscar un lugar o dirección</label>' +
            '<input class="mpm-input" type="search" autocomplete="off" spellcheck="false" placeholder="' + (opts.placeholder || 'Busca un lugar o dirección') + '">' +
            '<button class="mpm-clear" type="button" aria-label="Limpiar" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>' +
          '</form>' +
          '<ul class="mpm-list" role="listbox" hidden></ul>' +
          '<p class="mpm-msg" role="status" aria-live="polite"></p>';
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        var input = box.querySelector('.mpm-input'), list = box.querySelector('.mpm-list');
        var msg = box.querySelector('.mpm-msg'), clear = box.querySelector('.mpm-clear');
        var resultados = [], activo = -1, t = null, turno = 0;

        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function pintar() {
          list.hidden = !resultados.length;
          list.innerHTML = resultados.map(function (r, i) {
            return '<li role="option" aria-selected="' + (i === activo) + '" data-i="' + i + '"><b>' + esc(r.nombre) + '</b>' + (r.detalle ? '<small>' + esc(r.detalle) + '</small>' : '') + '</li>';
          }).join('');
        }
        function elegir(i) {
          var r = resultados[i];
          if (!r) return;
          input.value = r.nombre;
          resultados = []; activo = -1; pintar();
          msg.textContent = '';
          map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 17), { duration: 0.8 });
          if (opts.onElegir) opts.onElegir(r);
        }
        function consultar(q, completo) {
          var mio = ++turno;
          var propios = opts.extras ? (opts.extras(q) || []) : [];
          msg.textContent = 'Buscando...';
          var c = map.getCenter();
          buscar(q, { cerca: { lat: c.lat, lng: c.lng }, soloRapido: !completo }).then(function (r) {
            if (mio !== turno) return;
            resultados = propios.concat(r).slice(0, 7); activo = resultados.length ? 0 : -1;
            msg.textContent = resultados.length ? '' : (completo ? 'No encontramos ese lugar. Prueba con el barrio o toca el mapa.' : '');
            pintar();
          });
        }
        input.addEventListener('input', function () {
          clear.hidden = !input.value;
          clearTimeout(t);
          var q = input.value.trim();
          if (q.length < 3) { resultados = []; pintar(); msg.textContent = ''; return; }
          t = setTimeout(function () { consultar(q, false); }, 350);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!resultados.length) return;
            e.preventDefault();
            activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length;
            pintar();
          } else if (e.key === 'Escape') { resultados = []; pintar(); }
        });
        box.querySelector('.mpm-form').addEventListener('submit', function (e) {
          e.preventDefault();
          if (activo >= 0 && resultados[activo]) { elegir(activo); return; }
          var q = input.value.trim();
          if (q.length >= 3) consultar(q, true);
        });
        list.addEventListener('click', function (e) {
          var li = e.target.closest('[data-i]');
          if (li) elegir(+li.dataset.i);
        });
        clear.addEventListener('click', function () { input.value = ''; clear.hidden = true; resultados = []; pintar(); msg.textContent = ''; input.focus(); });
        return box;
      },
    });
    var ctrl = new Control();
    ctrl.addTo(map);
    return ctrl;
  }

  window.MPMapa = {
    CENTRO: CENTRO, BBOX: BBOX,
    buscar: buscar, inverso: inverso, geocodificarDireccion: geocodificarDireccion,
    ubicar: ubicar, buscador: buscador, distancia: distancia, limpiarDireccion: limpiarDireccion,
  };
})();
