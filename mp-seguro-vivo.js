/* ModoParche · página de ubicación en vivo (/seguro/<token>) */
(function () {
var D = document.body.dataset, TOKEN = D.token, URL_ = D.url, KEY = D.key;
  var map = L.map('map').setView([4.142, -73.6266], 13), pin = null, circulo = null, primera = true;
  // Mosaicos de OpenStreetMap; si fallan (bloqueo o sin red) se cambia a CARTO
  var capa = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin', attribution: '&copy; OpenStreetMap' }).addTo(map);
  var fallos = 0;
  capa.on('tileerror', function () {
    if (++fallos !== 3) return;
    map.removeLayer(capa);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);
  });
  function hace(iso) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? 'hace ' + s + ' s' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : 'hace ' + Math.round(s / 3600) + ' h';
  }
  var fin = false;
  function cargar() {
    fetch(URL_ + '/rest/v1/rpc/ubicacion_por_token', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: TOKEN }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) { document.getElementById('t').textContent = 'Este enlace no existe o ya venció'; document.getElementById('s').textContent = 'Pídele a la persona que lo vuelva a compartir.'; return; }
        document.getElementById('t').textContent = d.nombre + (d.activa ? ' está compartiendo su ubicación' : ' dejó de compartir su ubicación');
        document.getElementById('s').textContent = d.parche ? 'Va al parche "' + d.parche.titulo + '" en ' + d.parche.lugar : '';
        // ¿Ya llegó? Si el parche empezó hace más de 30 min y no ha marcado su llegada, se avisa
        var alerta = document.getElementById('a');
        var tarde = d.parche && d.parche.inicio ? Math.round((Date.now() - new Date(d.parche.inicio).getTime()) / 60000) : -1;
        if (d.llego) { alerta.hidden = false; alerta.className = 'ok'; alerta.textContent = 'Ya llegó al parche.'; }
        else if (d.activa && tarde >= 30) { alerta.hidden = false; alerta.className = 'alerta'; alerta.textContent = 'Aún no confirma que llegó. El parche empezó hace ' + (tarde < 120 ? tarde + ' min' : Math.round(tarde / 60) + ' h') + '. Escríbele o llámale; si no responde y te preocupa, llama al 123.'; }
        else alerta.hidden = true;
        if (d.activa === false) { fin = true; pausar(); }
        if (d.lat == null) { document.getElementById('e').textContent = d.activa ? 'Esperando la primera ubicación… (la persona debe tener ModoParche abierto)' : 'No alcanzó a enviar su ubicación.'; return; }
        var ll = [d.lat, d.lng];
        if (!pin) { pin = L.marker(ll).addTo(map); circulo = L.circle(ll, { radius: d.precision || 30, color: '#FF5A1F', weight: 1.5, fillOpacity: .12 }).addTo(map); }
        else { pin.setLatLng(ll); circulo.setLatLng(ll).setRadius(d.precision || 30); }
        if (primera) { map.setView(ll, 16); primera = false; }
        document.getElementById('e').textContent = 'Actualizado ' + hace(d.actualizado) + (d.activa ? ' · se refresca solo' : ' · última ubicación conocida');
        document.getElementById('g').href = 'https://maps.google.com/?q=' + d.lat + ',' + d.lng;
      })
      .catch(function () { document.getElementById('e').textContent = 'Sin conexión. Reintentando…'; });
  }
  var reloj = null;
  function programar() { if (!reloj && !fin && !document.hidden) reloj = setInterval(cargar, 20000); }
  function pausar() { if (reloj) { clearInterval(reloj); reloj = null; } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pausar(); else if (!fin) { cargar(); programar(); } });
  cargar(); programar();
})();
