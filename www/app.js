/* Inclina v2 — grabador de rutas con inclinación real.
   Secciones: arranque · tema · indicadores · sensores · GPS · mapa · grabación · render · vistas ·
   rutas · detalle y reproducción · estadísticas · garaje · ajustes · simulación. */
(function () {
  'use strict';
  var APP_VERSION = '2.0.0';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var clamp = function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); };
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  window.addEventListener('error', function (e) {
    try { var n = document.getElementById('toast'); n.textContent = 'Error (v' + APP_VERSION + '): ' + (e.message || e); n.className = 'toast notice bad'; n.hidden = false; } catch (x) {}
  });
  if (typeof LeanCore === 'undefined' || typeof Platform === 'undefined' || typeof Geo === 'undefined' || typeof DB === 'undefined') throw new Error('faltan archivos de la app (versión antigua en caché)');
  var HAS_MAP = typeof maplibregl !== 'undefined';

  /* ---------- ajustes (localStorage: pequeños y síncronos) ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var settings = Object.assign({ invert: false, vMin: 15, minPeak: 10, theme: 'auto', gyroGain: 1, gyroGainSrc: 'web', voice: true, autoPause: true, autoStart: false, follow: true, headingUp: false, colorMode: 'lean' }, LS.get('inclina.settings', {}));
  var MOTION_SRC = Platform.hasNativeMotion() ? 'native' : 'web';
  if (settings.gyroGainSrc !== MOTION_SRC) { settings.gyroGain = 1; settings.gyroGainSrc = MOTION_SRC; }
  var calib = LS.get('inclina.calib', null);
  function saveSettings() { LS.set('inclina.settings', settings); }
  function isDark() { return settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
    if (map) setMapStyle(map); if (dmap) setMapStyle(dmap, true);
  }
  applyTheme();
  if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (settings.theme === 'auto') applyTheme(); }); } catch (e) {} }

  /* ---------- datos en memoria ---------- */
  var rides = [], vehicles = [];

  /* ---------- utilidades de formato ---------- */
  function fmtTime(ms) { var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); }
  function fmtClockS(ms) { return fmtTime(ms).replace(/^00:/, ''); }
  function fmtDur(ms) { var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); if (!h && !m) return s + ' s'; return h ? h + ' h ' + String(m).padStart(2, '0') + ' min' : m + ' min'; }
  function fmtKm(km, d) { return (km || 0).toFixed(d == null ? 1 : d).replace('.', ',') + ' km'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtDate(ts) { var d = new Date(ts); return cap(d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\.|,/g, '')); }
  function fmtDateLong(ts) { var d = new Date(ts); return cap(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); }
  function fmtClock(ts) { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
  function monthName(y, m) { return cap(new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function rideTitle(r) { return r.name ? r.name : fmtDate(r.start); }

  /* ---------- indicadores (SVG) ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function makeGauge(container, mini) {
    var CX = 190, CY = mini ? 200 : 222, R = mini ? 150 : 160, EDGE = 64, SPAN = 60;
    var svg = el('svg', { viewBox: mini ? '0 0 380 232' : '0 0 380 178' });
    function pt(a, r) { var k = a * Math.PI / 180; return [CX + r * Math.sin(k), CY - r * Math.cos(k)]; }
    function arc(r, a0, a1) { var p0 = pt(a0, r), p1 = pt(a1, r); return 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 ' + (a1 > a0 ? 1 : 0) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1); }
    svg.appendChild(el('path', { 'class': 'track', d: arc(R, -EDGE, EDGE) }));
    var fill = el('path', { 'class': 'fill', d: '' }); svg.appendChild(fill);
    for (var a = -SPAN; a <= SPAN; a += (mini ? 30 : 10)) {
      var major = a % 30 === 0, o = pt(a, R - 13), i = pt(a, R - (major ? 30 : 23));
      svg.appendChild(el('line', { 'class': 'tick' + (major ? ' major' : ''), x1: o[0].toFixed(1), y1: o[1].toFixed(1), x2: i[0].toFixed(1), y2: i[1].toFixed(1) }));
      if (major && !mini) { var lp = pt(a, R - 46); var t = el('text', { 'class': 'tlabel', x: lp[0].toFixed(1), y: (lp[1] + 6).toFixed(1), 'text-anchor': 'middle' }); t.textContent = Math.abs(a); svg.appendChild(t); }
    }
    var mL = el('path', { 'class': 'mark l', d: '' }), mR = el('path', { 'class': 'mark r', d: '' }); svg.appendChild(mL); svg.appendChild(mR);
    var needle = el('line', { 'class': 'needle', x1: CX, y1: CY - R - 20, x2: CX, y2: CY - R + 20 }); svg.appendChild(needle);
    var num = null; if (mini) { num = el('text', { 'class': 'num', x: CX, y: CY - 6 }); num.textContent = '0°'; svg.appendChild(num); }
    container.innerHTML = ''; container.appendChild(svg);
    function markPath(a) { if (!(Math.abs(a) > 0.5)) return ''; var tip = pt(a, R + 18), b1 = pt(a - 3.2, R + 40), b2 = pt(a + 3.2, R + 40); return 'M' + tip[0].toFixed(1) + ' ' + tip[1].toFixed(1) + ' L' + b1[0].toFixed(1) + ' ' + b1[1].toFixed(1) + ' L' + b2[0].toFixed(1) + ' ' + b2[1].toFixed(1) + ' Z'; }
    var last = {};
    return function update(phi, maxL, maxR) {
      var c = clamp(phi, -EDGE, EDGE), key = c.toFixed(1) + '|' + maxL.toFixed(0) + '|' + maxR.toFixed(0);
      if (last.k === key) return; last.k = key;
      fill.setAttribute('d', Math.abs(c) < 0.5 ? '' : arc(R, 0, c)); fill.setAttribute('class', 'fill' + (c > 0 ? ' r' : ''));
      var n1 = pt(c, R - 20), n2 = pt(c, R + 20);
      needle.setAttribute('x1', n1[0].toFixed(1)); needle.setAttribute('y1', n1[1].toFixed(1)); needle.setAttribute('x2', n2[0].toFixed(1)); needle.setAttribute('y2', n2[1].toFixed(1));
      mL.setAttribute('d', markPath(-Math.min(maxL, EDGE))); mR.setAttribute('d', markPath(Math.min(maxR, EDGE)));
      if (num) num.textContent = Math.round(Math.abs(phi)) + '°';
    };
  }
  var gaugeFull = makeGauge($('#gaugeFull'), false), gaugeMini = makeGauge($('#gaugeMini'), true);

  /* ---------- sensores y estimador ---------- */
  var est = LeanCore.createEstimator({ invert: settings.invert, gyroGain: settings.gyroGain });
  var det = LeanCore.createCornerDetector({ minPeak: settings.minPeak });
  if (calib && calib.up) est.setFrame(LeanCore.buildFrame(calib.up), calib.bias);
  est.setOnGain(function (g) { settings.gyroGain = g; settings.gyroGainSrc = MOTION_SRC; saveSettings(); });
  var sens = { gyro: false, lastMotion: 0, lastGps: 0, speedKmh: null, speedMs: null, heading: null, gpsAcc: null, listening: false, nativeStop: null, gpsError: null, demo: false, rate: 0, src: MOTION_SRC, fix: null };
  var lastMotionT = null, rateCount = 0, rateT0 = 0, lastNativeTs = null;
  var live = { phi: 0, source: 'gyro', leanMaxSinceFix: 0 };

  function handleSample(acc, rot, now, dtOverride) {
    var dt = dtOverride != null ? dtOverride : (lastMotionT == null ? 0 : (now - lastMotionT) / 1000);
    lastMotionT = now; sens.lastMotion = now; sens.gyro = !!rot;
    rateCount++; if (now - rateT0 > 1000) { sens.rate = rateCount * 1000 / (now - rateT0); rateCount = 0; rateT0 = now; }
    if (calibrating) { calibCollect(acc, rot); return; }
    var s = est.update(acc, rot, dt, now);
    live.phi = s.phi; live.source = s.source;
    if (Math.abs(s.phi) > live.leanMaxSinceFix) live.leanMaxSinceFix = Math.abs(s.phi);
    if (rec) recFeed(s.phi, now);
  }
  function onMotion(e) {
    var a = e.accelerationIncludingGravity, g = e.rotationRate, acc = null, rot = null;
    if (a && a.x != null) acc = IOS ? [-a.x, -a.y, -a.z] : [a.x, a.y, a.z];
    if (g && g.beta != null) rot = [g.beta, g.gamma, g.alpha];
    handleSample(acc, rot, performance.now());
  }
  function onNativeBatch(data) {
    var now = performance.now(), ss = data.samples, n = ss.length;
    for (var i = 0; i < n; i++) {
      var q = ss[i], ts = q[6], dt = lastNativeTs == null ? 0 : (ts - lastNativeTs) / 1000; lastNativeTs = ts;
      handleSample([q[0], q[1], q[2]], q[3] == null ? null : [q[3], q[4], q[5]], now - (n - 1 - i) * 5, dt);
    }
  }
  function startMotion() {
    return new Promise(function (resolve) {
      if (Platform.hasNativeMotion()) {
        if (!sens.listening) { sens.nativeStop = Platform.startNativeMotion(onNativeBatch, 200); sens.listening = !!sens.nativeStop; }
        resolve(sens.listening ? 'ok' : 'unsupported'); return;
      }
      if (typeof DeviceMotionEvent === 'undefined') { resolve('unsupported'); return; }
      var attach = function () { if (!sens.listening) { window.addEventListener('devicemotion', onMotion); sens.listening = true; } resolve('ok'); };
      if (typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission().then(function (r) { if (r === 'granted') attach(); else resolve('denied'); }, function () { resolve('denied'); });
      else attach();
    });
  }

  /* ---------- calibración ---------- */
  var calibrating = false, calSum = null, calN = 0, calTimer = null;
  function calibCollect(acc, rot) { if (!acc) return; if (!calSum) calSum = { a: [0, 0, 0], r: [0, 0, 0] }; for (var k = 0; k < 3; k++) { calSum.a[k] += acc[k]; if (rot) calSum.r[k] += rot[k]; } calN++; }
  function startCalibration() {
    startMotion().then(function (r) {
      if (r !== 'ok') { toast(r === 'denied' ? 'Sin permiso para los sensores de movimiento.' : 'Este dispositivo no da acceso a los sensores de movimiento.', 'bad'); return; }
      calibrating = true; calSum = null; calN = 0; $('#calOverlay').hidden = false;
      var left = 2; $('#calCount').textContent = left;
      calTimer = setInterval(function () { left--; if (left > 0) { $('#calCount').textContent = left; return; } clearInterval(calTimer); calTimer = null; finishCalibration(); }, 1000);
    });
  }
  function finishCalibration() {
    calibrating = false; $('#calOverlay').hidden = true;
    if (!calSum || calN < 10) { toast('No llegan datos del sensor de movimiento. Comprueba el permiso y repite.', 'bad'); return; }
    var up = calSum.a.map(function (x) { return x / calN; }), bias = calSum.r.map(function (x) { return x / calN; }), n = Math.hypot(up[0], up[1], up[2]);
    if (n < 8 || n > 11.5) { toast('La moto se ha movido durante la calibración. Repítela parado.', 'bad'); return; }
    calib = { up: up, bias: bias, at: Date.now() }; LS.set('inclina.calib', calib);
    est.setFrame(LeanCore.buildFrame(up), bias);
    toast('Calibrado. Si marca el lado contrario, activa Invertir en Ajustes.', 'ok');
  }
  $('#calCancel').addEventListener('click', function () { if (calTimer) clearInterval(calTimer); calTimer = null; calibrating = false; $('#calOverlay').hidden = true; });

  /* ---------- GPS ---------- */
  var gpsStop = null, gpsMode = null, lastFix = null, autoStartSince = null;
  function onFix(pos) {
    var c = pos.coords, now = performance.now();
    sens.lastGps = now; sens.gpsError = null; sens.gpsAcc = c.accuracy;
    var v = c.speed;
    if ((v == null || isNaN(v)) && lastFix && c.accuracy < 40) { var d = Geo.dist(lastFix.lat, lastFix.lon, c.latitude, c.longitude), dtp = (pos.timestamp - lastFix.ts) / 1000; if (dtp > 0.5) v = d / dtp; }
    if (v != null && !isNaN(v)) { sens.speedMs = v; sens.speedKmh = v * 3.6; est.setSpeed(v, now); }
    if (c.heading != null && !isNaN(c.heading) && v > 1.5) sens.heading = c.heading;
    else if (lastFix && v > 1.5 && Geo.dist(lastFix.lat, lastFix.lon, c.latitude, c.longitude) > 5) sens.heading = Geo.bearing(lastFix.lat, lastFix.lon, c.latitude, c.longitude);
    var fix = { lat: c.latitude, lon: c.longitude, ts: pos.timestamp || Date.now(), acc: c.accuracy, alt: (c.altitude != null && !isNaN(c.altitude)) ? c.altitude : null, v: (v != null && !isNaN(v)) ? v : null };
    sens.fix = fix;
    if (rec) recFix(fix, lastFix);
    else if (settings.autoStart && currentView === 'map' && !demoTimer && calib) {
      if (sens.speedKmh != null && sens.speedKmh > 20) { if (autoStartSince == null) autoStartSince = now; else if (now - autoStartSince > 5000) { autoStartSince = null; startRide(true); } }
      else autoStartSince = null;
    }
    lastFix = fix;
    updatePosition(fix);
  }
  function onFixError(err) { sens.gpsError = err && err.code === 1 ? 'denegado' : (err && err.code === 0 ? 'no disponible' : 'sin señal'); }
  function startGps(mode) {
    if (gpsMode === mode) return;
    stopGps();
    gpsMode = mode;
    gpsStop = mode === 'bg' ? Platform.watchPositionBackground(onFix, onFixError, { title: 'Inclina está grabando tu ruta', message: 'Toca Parar en la app cuando acabes.' }) : Platform.watchPosition(onFix, onFixError);
  }
  function stopGps() { if (gpsStop) { try { gpsStop(); } catch (e) {} } gpsStop = null; gpsMode = null; }

  /* ---------- mapa ---------- */
  var map = null, dmap = null, posMarker = null, mapReady = false, liveFeatures = [], mapFollow = settings.follow !== false;
  function styleUrl() { return isDark() ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty'; }
  function fallbackStyle() { return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': isDark() ? '#1f1e1b' : '#e6e3da' } }] }; }
  function loadStyle() { return fetch(styleUrl(), { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return fallbackStyle(); }); }
  function setMapStyle(m, isDetail) { loadStyle().then(function (st) { m.setStyle(st); m.once('style.load', function () { if (isDetail) { if (detailTrack) drawDetailTrack(); } else drawLiveTrack(true); }); }); }
  function addTrackLayers(m, prefix) {
    if (m.getSource(prefix + '-track')) return;
    m.addSource(prefix + '-track', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: prefix + '-track-casing', type: 'line', source: prefix + '-track', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.55 } });
    m.addLayer({ id: prefix + '-track-line', type: 'line', source: prefix + '-track', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
  }
  function initMap() {
    if (!HAS_MAP || map) return;
    loadStyle().then(function (st) {
      map = new maplibregl.Map({ container: 'map', style: st, center: [-3.7, 40.4], zoom: 5, attributionControl: { compact: true }, pitchWithRotate: false, touchPitch: false });
      map.on('load', function () { mapReady = true; addTrackLayers(map, 'live'); drawLiveTrack(true); if (lastFix) { map.jumpTo({ center: [lastFix.lon, lastFix.lat], zoom: 15 }); updatePosition(lastFix); } });
      map.on('style.load', function () { if (mapReady) { addTrackLayers(map, 'live'); } });
      map.on('dragstart', function () { setFollow(false); });
      map.on('error', function () {});
      var pe = document.createElement('div'); pe.className = 'pos-marker';
      pe.innerHTML = '<svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="rgba(29,95,204,.25)"/><path d="M17 5l8 20-8-5-8 5z" fill="#1D5FCC" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';
      posMarker = new maplibregl.Marker({ element: pe, rotationAlignment: 'map' });
    });
  }
  function setFollow(on) { mapFollow = on; settings.follow = on; saveSettings(); $('#btnFollow').setAttribute('aria-pressed', String(on)); if (on && lastFix) updatePosition(lastFix, true); }
  $('#btnFollow').addEventListener('click', function () { setFollow(!mapFollow); });
  $('#btnHeading').addEventListener('click', function () { settings.headingUp = !settings.headingUp; saveSettings(); $('#btnHeading').setAttribute('aria-pressed', String(settings.headingUp)); if (map && !settings.headingUp) map.easeTo({ bearing: 0 }); });
  $('#btnHeading').setAttribute('aria-pressed', String(!!settings.headingUp)); $('#btnFollow').setAttribute('aria-pressed', String(mapFollow));
  var firstFixCentered = false;
  function updatePosition(fix, force) {
    if (!map || !mapReady) return;
    if (posMarker) { posMarker.setLngLat([fix.lon, fix.lat]); if (!posMarker._added) { posMarker.addTo(map); posMarker._added = true; } if (sens.heading != null) posMarker.setRotation(sens.heading - (settings.headingUp ? map.getBearing() : 0) + (settings.headingUp ? map.getBearing() : 0)); }
    if (!firstFixCentered) { firstFixCentered = true; map.jumpTo({ center: [fix.lon, fix.lat], zoom: 15 }); return; }
    if (mapFollow && (currentView === 'map')) {
      var opts = { center: [fix.lon, fix.lat], duration: force ? 300 : 900, easing: function (t) { return t; } };
      if (settings.headingUp && sens.heading != null) opts.bearing = sens.heading;
      if (rec && map.getZoom() < 14) opts.zoom = 15;
      map.easeTo(opts);
    }
  }
  function drawLiveTrack(full) {
    if (!map || !mapReady || !map.getSource('live-track')) return;
    map.getSource('live-track').setData({ type: 'FeatureCollection', features: liveFeatures });
  }

  /* ---------- grabación ---------- */
  var rec = null, recTick = null, lastSave = 0, demoTimer = null, pausedSince = null;
  function newRec() { var principal = vehicles.filter(function (v) { return v.principal; })[0]; return { id: Date.now(), start: Date.now(), end: null, name: '', maxL: 0, maxR: 0, vMax: 0, dist: 0, movingS: 0, corners: [], points: [], vehicleId: principal ? principal.id : null, favorite: false, stars: 0, note: '' }; }
  function recFeed(phi, now) {
    if (phi < -2 && -phi > rec.maxL) rec.maxL = -phi;
    if (phi > 2 && phi > rec.maxR) rec.maxR = phi;
    var v = (sens.speedKmh != null && (now - sens.lastGps) < 5000) ? Math.round(sens.speedKmh) : null;
    var c = det.feed(phi, v, now);
    if (c) addCorner(c);
  }
  function addCorner(c) {
    if (c.vPeak != null && c.vPeak < settings.vMin) return;
    var tEpoch = Date.now() - Math.round(performance.now() - c.t), idx = rec.points.length ? Geo.indexAtTime(rec.points, tEpoch) : -1, p = idx >= 0 ? rec.points[idx] : null;
    var corner = { t: tEpoch, side: c.side, peak: Math.round(c.peak * 10) / 10, v: c.vPeak, dur: Math.round(c.dur * 10) / 10, lat: p ? p[1] : null, lon: p ? p[2] : null, idx: idx };
    rec.corners.push(corner);
    if (settings.voice && Platform.canSpeak() && !sens.demo) Platform.speak(String(Math.round(c.peak)));
  }
  function recFix(fix, prev) {
    var moving = fix.v != null ? fix.v > 0.8 : (prev ? Geo.dist(prev.lat, prev.lon, fix.lat, fix.lon) / Math.max(0.5, (fix.ts - prev.ts) / 1000) > 0.8 : false);
    if (settings.autoPause) { if (!moving) { if (pausedSince == null) pausedSince = fix.ts; } else pausedSince = null; }
    var paused = settings.autoPause && pausedSince != null && fix.ts - pausedSince > 20000;
    var lean = calib ? (live.leanMaxSinceFix > 3 ? (live.phi < 0 ? -live.leanMaxSinceFix : live.leanMaxSinceFix) : live.phi) : null;
    if (lean != null) lean = Math.round(lean * 10) / 10;
    live.leanMaxSinceFix = 0;
    var pt = [fix.ts, +fix.lat.toFixed(6), +fix.lon.toFixed(6), fix.alt == null ? null : Math.round(fix.alt), fix.v == null ? null : Math.round(fix.v * 100) / 100, Math.round(fix.acc || 0), lean];
    if (paused && rec.points.length) { var lp = rec.points[rec.points.length - 1]; if (Geo.dist(lp[1], lp[2], fix.lat, fix.lon) < 15) return; }
    rec.points.push(pt);
    if (prev && fix.acc <= 40 && moving) {
      var seg = Geo.dist(prev.lat, prev.lon, fix.lat, fix.lon), dt = (fix.ts - prev.ts) / 1000;
      if (seg < 2000 && dt > 0 && dt < 120) { rec.dist += seg / 1000; rec.movingS += dt; if (fix.v != null && fix.v * 3.6 > rec.vMax && fix.v < 120) rec.vMax = fix.v * 3.6; }
      liveFeatures.push({ type: 'Feature', properties: { color: Geo.leanColor(lean || 0) }, geometry: { type: 'LineString', coordinates: [[prev.lon, prev.lat], [fix.lon, fix.lat]] } });
      drawLiveTrack();
    }
    rec.paused = paused;
    if (performance.now() - lastSave > 10000) persistRec();
  }
  function persistRec() { lastSave = performance.now(); var meta = recMeta(rec); meta.saved = Date.now(); meta.inProgress = true; DB.putRide(meta).then(function () { return DB.putTrack(rec.id, rec.points); }).catch(function () {}); }
  function recMeta(r) {
    var pts = r.points || [];
    return { id: r.id, start: r.start, end: r.end, name: r.name || '', maxL: Math.round(r.maxL * 10) / 10, maxR: Math.round(r.maxR * 10) / 10, vMax: Math.round(r.vMax), dist: Math.round(r.dist * 100) / 100, movingS: Math.round(r.movingS),
      corners: r.corners.map(function (c) { var o = {}; for (var k in c) o[k] = c[k]; return o; }), vehicleId: r.vehicleId || null, favorite: !!r.favorite, stars: r.stars || 0, note: r.note || '',
      hasTrack: pts.length > 1, hasLean: !!calib && !sens.demo ? true : (!!calib), nPoints: pts.length, thumb: pts.length > 1 ? Geo.simplify(pts, 25).slice(0, 400).map(function (p) { return [p[1], p[2]]; }) : null, recovered: !!r.recovered, demo: !!r.demo, imported: !!r.imported };
  }
  function startRide(auto) {
    if (rec) return;
    if (!calib && !sens.demo) { toast('Primero pulsa Cero con la moto vertical para calibrar.', 'warn'); openLeanFull(); return; }
    startMotion().then(function (r) {
      if (r !== 'ok' && !sens.demo) toast('Sin acceso a los sensores: se grabará la ruta sin inclinación.', 'warn');
      if (!sens.demo) startGps('bg');
      Platform.keepAwake(true);
      rec = newRec(); if (sens.demo) rec.demo = true; det.setOptions({ minPeak: settings.minPeak }); liveFeatures = []; drawLiveTrack(true); pausedSince = null; lastSave = performance.now();
      LS.set('inclina.recording', rec.id);
      recTick = setInterval(render, 1000);
      setFollow(true);
      hideNotice(); render();
      if (auto) toast('Grabando ruta (inicio automático).', 'ok');
    });
  }
  function stopRide() {
    if (!rec) return;
    var c = det.flush(performance.now()); if (c) addCorner(c);
    rec.end = Date.now();
    var done = rec; rec = null;
    if (recTick) clearInterval(recTick); recTick = null;
    LS.del('inclina.recording');
    Platform.keepAwake(false);
    if (sens.demo) stopDemo(); else { stopGps(); if (currentView === 'map') startGps('fg'); }
    if (done.points.length > 1) { var st = Geo.stats(done.points); done.altMax = st.altMax; done.climb = Math.round(st.climb); if (!done.dist) done.dist = st.distKm; if (!done.movingS) done.movingS = st.movingS; if (!done.vMax) done.vMax = st.vMaxKmh; }
    var meta = recMeta(done); meta.inProgress = false; meta.altMax = done.altMax; meta.climb = done.climb;
    if (done.points.length < 2 && !done.corners.length) { toast('Ruta demasiado corta: no se ha guardado.', 'warn'); liveFeatures = []; drawLiveTrack(true); DB.deleteRide(done.id).catch(function () {}); render(); return; }
    DB.putRide(meta).then(function () { return DB.putTrack(done.id, done.points); }).then(function () { return reloadRides(); }).then(function () { liveFeatures = []; drawLiveTrack(true); openDetail(done.id); });
  }
  function recoverRide() {
    var id = LS.get('inclina.recording', null); if (!id) return Promise.resolve();
    LS.del('inclina.recording');
    return DB.getRide(id).then(function (r) { if (!r) return; r.inProgress = false; r.recovered = true; r.end = r.saved || r.start + 1; return DB.putRide(r); }).catch(function () {});
  }
  $('#btnRide').addEventListener('click', function () { startRide(false); });
  $('#btnStop').addEventListener('click', stopRide);
  window.addEventListener('pagehide', function () { if (rec) persistRec(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && rec) Platform.keepAwake(true); });

  /* ---------- render en vivo ---------- */
  var prev = {};
  function setText(id, v) { if (prev[id] !== v) { prev[id] = v; var e = $(id); if (e) e.textContent = v; } }
  function setHTML(id, v) { if (prev[id] !== v) { prev[id] = v; var e = $(id); if (e) e.innerHTML = v; } }
  function setClass(id, v) { if (prev['c' + id] !== v) { prev['c' + id] = v; var e = $(id); if (e) e.className = v; } }
  var toastTimer = null;
  function toast(msg, kind) { var n = $('#toast'); n.textContent = msg; n.className = 'toast notice' + (kind ? ' ' + kind : ''); n.hidden = false; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(function () { n.hidden = true; }, kind === 'bad' ? 9000 : 5000); }
  function showNotice(msg, kind) { var n = $('#notice'); n.textContent = msg; n.className = 'notice' + (kind ? ' ' + kind : ''); n.hidden = false; }
  function hideNotice() { $('#notice').hidden = true; }
  function render() {
    var now = performance.now(), phi = live.phi, ar = Math.round(Math.abs(phi));
    var mL = rec ? rec.maxL : sessMax.l, mR = rec ? rec.maxR : sessMax.r;
    if (!rec) { if (phi < -2 && -phi > sessMax.l) sessMax.l = -phi; if (phi > 2 && phi > sessMax.r) sessMax.r = phi; }
    var gpsFresh = sens.lastGps && (now - sens.lastGps) < 5000, speedTxt = (gpsFresh && sens.speedKmh != null) ? String(Math.round(sens.speedKmh)) : '—';
    var motionFresh = sens.lastMotion && (now - sens.lastMotion) < 2000;
    // HUD
    if (rec) {
      gaugeMini(phi, mL, mR);
      setText('#hudSpeed', speedTxt); setText('#hudMaxL', Math.round(mL) + '°'); setText('#hudMaxR', Math.round(mR) + '°');
      setHTML('#hudMeta', '<b>' + fmtKm(rec.dist) + '</b> · ' + rec.corners.length + (rec.corners.length === 1 ? ' curva' : ' curvas') + (rec.paused ? ' · <span class="pause">en pausa</span>' : ''));
      setText('#rideTimer', fmtTime(Date.now() - rec.start));
    }
    $('#rideTimer').hidden = !rec; $('#rideTimer').className = 'timer cifra' + (rec ? ' on' : '');
    $('#hudCard').hidden = !rec; $('#idleCard').hidden = !!rec;
    // pantalla completa
    if (!$('#leanFull').hidden) {
      gaugeFull(phi, mL, mR);
      setText('#lfNum', ar + '°');
      if (ar >= 3) { setText('#lfSide', phi < 0 ? 'Izquierda' : 'Derecha'); setClass('#lfSide', 'side ' + (phi < 0 ? 'l' : 'r')); } else { setText('#lfSide', calib ? 'Vertical' : 'Sin calibrar'); setClass('#lfSide', 'side'); }
      setText('#lfMaxL', Math.round(mL) + '°'); setText('#lfMaxR', Math.round(mR) + '°');
      setHTML('#lfSpeed', speedTxt + '<span class="unit">km/h</span>');
      setText('#lfMinor', rec ? rec.corners.length + ' curvas · ' + fmtKm(rec.dist) : (calib ? 'Sin grabar · pulsa Grabar ruta en el mapa' : 'Pulsa Cero para calibrar'));
      setText('#lfTimer', rec ? fmtTime(Date.now() - rec.start) : '00:00:00'); setClass('#lfTimer', 'timer cifra' + (rec ? ' on' : ''));
      setClass('#lfSens', 'chip ' + (motionFresh ? (sens.gyro ? 'ok' : 'warn') : (sens.listening ? 'bad' : ''))); setText('#lfSens', motionFresh ? (sens.gyro ? 'Sensores' : 'Sin giróscopo') : 'Sensores');
      setClass('#lfGps', 'chip ' + (gpsFresh ? 'ok' : (sens.gpsError ? 'bad' : (gpsMode ? 'warn' : '')))); setText('#lfGps', gpsFresh ? 'GPS' : (sens.gpsError ? 'GPS ' + sens.gpsError : (gpsMode ? 'GPS…' : 'GPS')));
    }
    // chips
    setClass('#chipSens', 'chip ' + (motionFresh ? (sens.gyro ? 'ok' : 'warn') : (sens.listening ? 'bad' : ''))); setText('#chipSens', motionFresh ? (sens.gyro ? 'Sensores' : 'Sin giróscopo') : 'Sensores');
    var gpsWeak = gpsFresh && sens.gpsAcc > 25;
    setClass('#chipGps', 'chip ' + (gpsFresh ? (gpsWeak ? 'warn' : 'ok') : (sens.gpsError ? 'bad' : (gpsMode ? 'warn' : '')))); setText('#chipGps', gpsFresh ? 'GPS' : (sens.gpsError ? 'GPS ' + sens.gpsError : (gpsMode ? 'GPS…' : 'GPS')));
    var awake = Platform.isAwake(); setClass('#chipWake', 'chip ' + (awake ? 'ok' : '')); setText('#chipWake', awake ? 'Pantalla fija' : 'Pantalla');
    if (currentView === 'settings' && now - (prev.diagT || 0) > 250) { prev.diagT = now; renderDiag(); }
  }
  var sessMax = { l: 0, r: 0 };
  function loop() { render(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  Platform.onWakeChange(function () { render(); });
  $('#chipWake').addEventListener('click', function () { Platform.keepAwake(!Platform.isAwake()); });

  /* ---------- vistas ---------- */
  var views = { map: $('#view-map'), rides: $('#view-rides'), detail: $('#view-detail'), stats: $('#view-stats'), garage: $('#view-garage'), settings: $('#view-settings') };
  var currentView = 'map';
  function showView(name) {
    currentView = name;
    for (var k in views) views[k].hidden = k !== name;
    $$('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.view === (name === 'detail' ? 'rides' : name))); });
    if (name === 'map') { if (!rec) startGps('fg'); if (map) setTimeout(function () { map.resize(); }, 50); }
    else if (!rec && gpsMode === 'fg' && name !== 'detail') stopGps();
    if (name === 'rides') renderRides();
    if (name === 'stats') renderStats();
    if (name === 'garage') renderGarage();
    if (name === 'settings') renderSettings();
    if (name !== 'detail') stopReplay();
    views[name].scrollTop = 0;
  }
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { showView(t.dataset.view); }); });
  function openLeanFull() { $('#leanFull').hidden = false; startMotion(); if (!gpsMode && !rec) startGps('fg'); }
  function closeLeanFull() { $('#leanFull').hidden = true; }
  $('#btnLeanFull').addEventListener('click', openLeanFull); $('#btnHudLean').addEventListener('click', openLeanFull); $('#btnLeanClose').addEventListener('click', closeLeanFull);
  $('#btnZero').addEventListener('click', startCalibration);

  /* ---------- rutas: totales y lista ---------- */
  var ridesFilter = 'all', ridesQuery = '';
  function reloadRides() { return DB.allRides().then(function (a) { rides = a.filter(function (r) { return !r.inProgress; }); renderTotals(); return rides; }); }
  function renderTotals() {
    var km = rides.reduce(function (s, r) { return s + (r.dist || 0); }, 0);
    setHTML('#totKm', Math.round(km) + '<span class="unit">km</span>'); setText('#totRides', String(rides.length));
  }
  function renderRides() {
    var list = $('#ridesList'); list.innerHTML = '';
    var km = rides.reduce(function (s, r) { return s + (r.dist || 0); }, 0), year = new Date().getFullYear();
    var kmYear = rides.filter(function (r) { return new Date(r.start).getFullYear() === year; }).reduce(function (s, r) { return s + (r.dist || 0); }, 0);
    var hours = rides.reduce(function (s, r) { return s + (r.movingS || 0); }, 0) / 3600;
    $('#ridesSummary').innerHTML = fig('Total', Math.round(km) + '<span class="unit">km</span>') + fig('Este año', Math.round(kmYear) + '<span class="unit">km</span>') + fig('Horas', hours.toFixed(1).replace('.', ',')) + fig('Media', (rides.length ? Math.round(km / rides.length) : 0) + '<span class="unit">km</span>');
    $('#ridesActions').hidden = rides.length === 0;
    var q = ridesQuery.trim().toLowerCase();
    var shown = rides.filter(function (r) {
      if (ridesFilter === 'fav' && !r.favorite) return false;
      if (ridesFilter === 'lean' && !(r.maxL > 5 || r.maxR > 5)) return false;
      if (q && (rideTitle(r) + ' ' + fmtDateLong(r.start) + ' ' + (r.note || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (!shown.length) { list.innerHTML = '<div class="empty">' + (rides.length ? 'Ninguna ruta coincide con el filtro.' : 'Aún no hay rutas. Calibra con Cero, pulsa Grabar ruta y a rodar.') + '</div>'; return; }
    var lastMonth = null;
    shown.forEach(function (r) {
      var d = new Date(r.start), mk = d.getFullYear() + '-' + d.getMonth();
      if (mk !== lastMonth) {
        lastMonth = mk;
        var inMonth = shown.filter(function (x) { var dd = new Date(x.start); return dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth(); });
        var h = document.createElement('div'); h.className = 'month';
        h.innerHTML = '<span class="label">' + monthName(d.getFullYear(), d.getMonth()) + ' <span class="muted">· ' + inMonth.length + (inMonth.length === 1 ? ' ruta' : ' rutas') + '</span></span><span class="label" style="color:var(--color-accent)">' + Math.round(inMonth.reduce(function (s, x) { return s + (x.dist || 0); }, 0)) + ' km</span>';
        list.appendChild(h);
      }
      var b = document.createElement('button'); b.type = 'button'; b.className = 'row';
      var thumb = r.thumb && r.thumb.length > 1 ? Geo.thumbSvg(r.thumb.map(function (p) { return [0, p[0], p[1]]; }), 56) : '<svg width="28" height="28" viewBox="0 0 24 24"><use href="#i-gauge"/></svg>';
      b.innerHTML = '<span class="thumb">' + thumb + '</span>' +
        '<span class="date">' + esc(rideTitle(r)) + ' <span>· ' + fmtClock(r.start) + (r.recovered ? ' · recuperada' : '') + (r.imported ? ' · GPX' : '') + (r.demo ? ' · simulada' : '') + '</span>' + (r.favorite ? '<svg class="fav" width="16" height="16" viewBox="0 0 24 24"><use href="#i-star"/></svg>' : '') + '</span>' +
        '<span class="big"><span><span class="n l">' + Math.round(r.maxL) + '°</span><span class="label l">Izq</span></span><span><span class="n r">' + Math.round(r.maxR) + '°</span><span class="label r">Dcha</span></span></span>' +
        '<span class="sub">' + fmtKm(r.dist) + ' · ' + fmtDur((r.movingS || 0) * 1000) + ' · ' + r.corners.length + ' curvas · ' + (r.vMax || 0) + ' km/h máx</span>' +
        '<span class="chev"><svg><use href="#i-chev"/></svg></span>';
      b.addEventListener('click', function () { openDetail(r.id); });
      list.appendChild(b);
    });
  }
  function fig(label, valHtml, cls) { return '<div class="fig' + (cls ? ' ' + cls : '') + '"><span class="label">' + label + '</span><span class="val cifra">' + valHtml + '</span></div>'; }
  $$('#ridesFilters .pill').forEach(function (p) { p.addEventListener('click', function () { ridesFilter = p.dataset.f; $$('#ridesFilters .pill').forEach(function (x) { x.setAttribute('aria-pressed', String(x === p)); }); renderRides(); }); });
  $('#ridesSearch').addEventListener('input', function (e) { ridesQuery = e.target.value; renderRides(); });
  $('#btnImportGpx').addEventListener('click', function () { $('#gpxFile').value = ''; $('#gpxFile').click(); });
  $('#gpxFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var g = Geo.fromGpx(reader.result), pts = g.points;
        if (pts.length < 2) throw new Error('El archivo no tiene puntos de trazado.');
        var st = Geo.stats(pts), r = { id: pts[0][0] + Math.floor(Math.random() * 1000), start: pts[0][0], end: pts[pts.length - 1][0], name: g.name || f.name.replace(/\.gpx$/i, ''), maxL: 0, maxR: 0, vMax: Math.round(st.vMaxKmh), dist: Math.round(st.distKm * 100) / 100, movingS: Math.round(st.movingS), corners: [], vehicleId: null, favorite: false, stars: 0, note: '', hasTrack: true, hasLean: false, nPoints: pts.length, imported: true, altMax: st.altMax, climb: Math.round(st.climb), thumb: Geo.simplify(pts, 25).slice(0, 400).map(function (p) { return [p[1], p[2]]; }) };
        pts.forEach(function (p) { if (p[6] != null) { r.hasLean = true; if (p[6] < -r.maxL) r.maxL = -p[6]; if (p[6] > r.maxR) r.maxR = p[6]; } });
        r.maxL = Math.round(r.maxL * 10) / 10; r.maxR = Math.round(r.maxR * 10) / 10;
        DB.putRide(r).then(function () { return DB.putTrack(r.id, pts); }).then(reloadRides).then(function () { toast('Ruta importada: ' + fmtKm(r.dist), 'ok'); openDetail(r.id); });
      } catch (err) { toast('No se pudo importar: ' + err.message, 'bad'); }
    };
    reader.readAsText(f);
  });

  /* ---------- detalle ---------- */
  var detailId = null, detailRide = null, detailTrack = [], detailCum = null, cornerMarkers = [], replayMarker = null, rp = { playing: false, speed: 10, t: 0, raf: null, lastFrame: 0 };
  function ensureDetailMap() {
    if (!HAS_MAP || dmap) return Promise.resolve(dmap);
    return loadStyle().then(function (st) {
      dmap = new maplibregl.Map({ container: 'detailMap', style: st, center: [-3.7, 40.4], zoom: 5, attributionControl: { compact: true }, pitchWithRotate: false, touchPitch: false });
      dmap.on('style.load', function () { addTrackLayers(dmap, 'd'); if (detailTrack.length) drawDetailTrack(); });
      dmap.on('error', function () {});
      var re = document.createElement('div'); re.className = 'replay-marker'; replayMarker = new maplibregl.Marker({ element: re });
      return new Promise(function (resolve) { dmap.once('load', function () { addTrackLayers(dmap, 'd'); resolve(dmap); }); });
    });
  }
  function drawDetailTrack() {
    if (!dmap || !dmap.getSource('d-track')) return;
    dmap.getSource('d-track').setData(detailTrack.length > 1 ? Geo.segmentsGeoJson(detailTrack, settings.colorMode) : { type: 'FeatureCollection', features: [] });
  }
  function openDetail(id) {
    var r = rides.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    detailId = id; detailRide = r; stopReplay();
    $('#detailTitle').innerHTML = esc(rideTitle(r)) + ' <span class="muted">· ' + fmtClock(r.start) + '</span>';
    $('#detailSummary').innerHTML =
      fig('Máx izquierda', Math.round(r.maxL) + '°', 'l') + fig('Máx derecha', Math.round(r.maxR) + '°', 'r') +
      fig('Distancia', fmtKm(r.dist).replace(' km', '<span class="unit">km</span>'), 'm') + fig('Tiempo en marcha', r.movingS ? fmtClockS(r.movingS * 1000) : '—', 'm') +
      fig('Vel. media', (r.movingS ? Math.round(r.dist / (r.movingS / 3600)) : 0) + '<span class="unit">km/h</span>', 'm') + fig('Vel. máx', (r.vMax || 0) + '<span class="unit">km/h</span>', 'm') +
      fig('Altitud máx', r.altMax != null ? Math.round(r.altMax) + '<span class="unit">m</span>' : '—', 'm') + fig('Desnivel +', r.climb != null ? Math.round(r.climb) + '<span class="unit">m</span>' : '—', 'm');
    renderCornersTable(r);
    renderStars(r); $('#noteText').value = r.note || '';
    $('#btnFav').setAttribute('aria-pressed', String(!!r.favorite));
    var sel = $('#rideVehicle'); sel.innerHTML = '<option value="">Sin vehículo</option>' + vehicles.map(function (v) { return '<option value="' + v.id + '"' + (r.vehicleId === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('');
    $('#btnExportRide span').textContent = Platform.native ? 'Curvas CSV' : 'Curvas CSV';
    $('#btnGmaps').disabled = !r.hasTrack; $('#btnGpx').disabled = !r.hasTrack; $('#replay').hidden = !r.hasTrack;
    disarm($('#btnDeleteRide'), 'Borrar esta ruta');
    renderPhotos(r.id);
    showView('detail');
    detailTrack = []; cornerMarkers.forEach(function (m) { m.remove(); }); cornerMarkers = [];
    DB.getTrack(r.id).then(function (pts) {
      if (detailId !== r.id) return;
      detailTrack = pts || []; detailCum = detailTrack.length ? Geo.cumulative(detailTrack) : null;
      $('#replayTotal').textContent = detailTrack.length > 1 ? fmtClockS(detailTrack[detailTrack.length - 1][0] - detailTrack[0][0]) : '00:00';
      $('#replayRange').value = 0; rp.t = detailTrack.length ? detailTrack[0][0] : 0; updateReplayPoint();
      return ensureDetailMap().then(function () {
        if (!dmap || detailId !== r.id) return;
        dmap.resize(); drawDetailTrack();
        if (detailTrack.length > 1) { var b = Geo.bounds(detailTrack); dmap.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 36, duration: 0, maxZoom: 16 }); replayMarker.setLngLat([detailTrack[0][2], detailTrack[0][1]]).addTo(dmap); }
        r.corners.forEach(function (c, i) {
          if (c.lat == null) return;
          var e = document.createElement('div'); e.className = 'corner-marker ' + (c.side === 'I' ? 'l' : 'r'); e.textContent = Math.round(c.peak) + '°';
          e.addEventListener('click', function () { selectCorner(i); });
          cornerMarkers.push(new maplibregl.Marker({ element: e }).setLngLat([c.lon, c.lat]).addTo(dmap));
        });
      });
    });
  }
  function renderCornersTable(r) {
    var tb = $('#detailTable tbody'); tb.innerHTML = '';
    r.corners.forEach(function (c, i) {
      var tr = document.createElement('tr'); tr.dataset.i = i;
      tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + fmtClock(c.t) + '</td><td><span class="' + (c.side === 'I' ? 'l' : 'r') + '">' + (c.side === 'I' ? 'Izq' : 'Dcha') + '</span></td><td class="n">' + Math.round(c.peak) + '°</td><td class="n">' + (c.v == null ? '—' : c.v) + '</td><td class="n">' + (c.dur || 0).toFixed(1).replace('.', ',') + '</td>';
      tr.addEventListener('click', function () { selectCorner(i); });
      tb.appendChild(tr);
    });
    $('#cornersWrap').hidden = r.corners.length === 0; $('#detailEmpty').hidden = r.corners.length > 0;
  }
  function selectCorner(i) {
    var c = detailRide.corners[i]; if (!c) return;
    $$('#detailTable tr').forEach(function (tr) { tr.classList.toggle('sel', tr.dataset.i == i); });
    if (detailTrack.length && c.t) { rp.playing = false; updatePlayBtn(); rp.t = c.t; updateReplayPoint(true); }
    if (dmap && c.lat != null) dmap.easeTo({ center: [c.lon, c.lat], zoom: Math.max(dmap.getZoom(), 15) });
  }
  $('#btnBack').addEventListener('click', function () { showView('rides'); });
  $$('#colorMode button').forEach(function (b) { b.addEventListener('click', function () { settings.colorMode = b.dataset.m; saveSettings(); $$('#colorMode button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); drawDetailTrack(); }); });
  $$('#colorMode button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.m === settings.colorMode)); });
  // reproducción
  function updatePlayBtn() { $('#rpPlay').innerHTML = '<svg><use href="#i-' + (rp.playing ? 'pause' : 'play') + '"/></svg>'; }
  function updateReplayPoint(moveMap) {
    if (!detailTrack.length) { ['#rpV', '#rpLean', '#rpAlt', '#rpKm'].forEach(function (id) { $(id).textContent = '—'; }); return; }
    var t0 = detailTrack[0][0], t1 = detailTrack[detailTrack.length - 1][0], t = clamp(rp.t, t0, t1), p = Geo.interpolate(detailTrack, t), i = Geo.indexAtTime(detailTrack, t);
    $('#replayRange').value = Math.round((t - t0) / Math.max(1, t1 - t0) * 1000); $('#replayT').textContent = fmtClockS(t - t0);
    $('#rpV').textContent = p[4] != null ? String(Math.round(p[4] * 3.6)) : '—';
    $('#rpLean').innerHTML = p[6] != null ? '<span class="' + (p[6] < 0 ? 'l' : 'r') + '">' + Math.round(Math.abs(p[6])) + '°</span>' : '—';
    $('#rpAlt').textContent = p[3] != null ? Math.round(p[3]) + ' m' : '—';
    $('#rpKm').textContent = detailCum ? detailCum[i].toFixed(1).replace('.', ',') : '—';
    if (replayMarker && dmap) { replayMarker.setLngLat([p[2], p[1]]); if (moveMap || rp.playing) { var ctr = dmap.getCenter(), b = dmap.getBounds(); if (p[2] < b.getWest() || p[2] > b.getEast() || p[1] < b.getSouth() || p[1] > b.getNorth()) dmap.easeTo({ center: [p[2], p[1]], duration: 300 }); } }
  }
  function replayFrame(ts) {
    if (!rp.playing) return;
    var dt = rp.lastFrame ? ts - rp.lastFrame : 0; rp.lastFrame = ts;
    rp.t += dt * rp.speed;
    var t1 = detailTrack[detailTrack.length - 1][0];
    if (rp.t >= t1) { rp.t = t1; rp.playing = false; updatePlayBtn(); }
    updateReplayPoint();
    if (rp.playing) rp.raf = requestAnimationFrame(replayFrame);
  }
  function stopReplay() { rp.playing = false; rp.lastFrame = 0; if (rp.raf) cancelAnimationFrame(rp.raf); rp.raf = null; updatePlayBtn(); }
  $('#rpPlay').addEventListener('click', function () {
    if (!detailTrack.length) return;
    if (rp.playing) { stopReplay(); return; }
    if (rp.t >= detailTrack[detailTrack.length - 1][0]) rp.t = detailTrack[0][0];
    rp.playing = true; rp.lastFrame = 0; updatePlayBtn(); rp.raf = requestAnimationFrame(replayFrame);
  });
  $('#rpSpeed').addEventListener('click', function () { rp.speed = rp.speed === 1 ? 10 : (rp.speed === 10 ? 50 : 1); $('#rpSpeed').textContent = rp.speed + '×'; });
  $('#replayRange').addEventListener('input', function (e) { if (!detailTrack.length) return; var t0 = detailTrack[0][0], t1 = detailTrack[detailTrack.length - 1][0]; rp.playing = false; updatePlayBtn(); rp.t = t0 + (t1 - t0) * (e.target.value / 1000); updateReplayPoint(true); });
  function jumpCorner(dir) {
    if (!detailRide || !detailRide.corners.length) return;
    var cs = detailRide.corners, idx = -1;
    for (var i = 0; i < cs.length; i++) { if (dir > 0 && cs[i].t > rp.t + 500) { idx = i; break; } if (dir < 0 && cs[i].t < rp.t - 500) idx = i; }
    if (idx >= 0) selectCorner(idx);
  }
  $('#rpPrev').addEventListener('click', function () { jumpCorner(-1); }); $('#rpNext').addEventListener('click', function () { jumpCorner(1); });
  // nota, estrellas, favorita, vehículo, nombre
  function renderStars(r) { var s = $('#stars'); s.innerHTML = ''; for (var i = 1; i <= 5; i++) { var b = document.createElement('button'); b.type = 'button'; b.className = i <= (r.stars || 0) ? 'on' : ''; b.innerHTML = '<svg><use href="#i-star"/></svg>'; b.dataset.v = i; b.addEventListener('click', function (e) { var v = +e.currentTarget.dataset.v; r.stars = r.stars === v ? 0 : v; DB.putRide(r); renderStars(r); }); s.appendChild(b); } var lbl = document.createElement('span'); lbl.className = 'muted'; lbl.style.marginLeft = '8px'; lbl.textContent = r.stars ? r.stars + '/5' : 'Sin puntuar'; s.appendChild(lbl); }
  var noteTimer = null;
  $('#noteText').addEventListener('input', function (e) { if (!detailRide) return; detailRide.note = e.target.value; if (noteTimer) clearTimeout(noteTimer); noteTimer = setTimeout(function () { DB.putRide(detailRide); }, 500); });
  $('#btnFav').addEventListener('click', function () { if (!detailRide) return; detailRide.favorite = !detailRide.favorite; $('#btnFav').setAttribute('aria-pressed', String(detailRide.favorite)); DB.putRide(detailRide); });
  $('#rideVehicle').addEventListener('change', function (e) { if (!detailRide) return; detailRide.vehicleId = e.target.value ? +e.target.value : null; DB.putRide(detailRide); });
  $('#btnRename').addEventListener('click', function () {
    if (!detailRide) return;
    var wrap = document.createElement('div'); wrap.className = 'form'; wrap.style.marginTop = '8px';
    wrap.innerHTML = '<input type="text" id="renameInput" maxlength="60" placeholder="Nombre de la ruta" value="' + esc(detailRide.name || '') + '"><div class="actions"><button class="btn" type="button" id="renameCancel">Cancelar</button><button class="btn primary" type="button" id="renameOk">Guardar</button></div>';
    $('#btnRename').parentNode.insertBefore(wrap, $('#btnRename').parentNode.firstChild);
    $('#renameInput').focus();
    $('#renameCancel').addEventListener('click', function () { wrap.remove(); });
    $('#renameOk').addEventListener('click', function () { detailRide.name = $('#renameInput').value.trim(); DB.putRide(detailRide).then(function () { wrap.remove(); $('#detailTitle').innerHTML = esc(rideTitle(detailRide)) + ' <span class="muted">· ' + fmtClock(detailRide.start) + '</span>'; }); });
  });
  function disarm(b, label) { b.classList.remove('armed'); b.dataset.armed = ''; b.textContent = label; if (b._t) clearTimeout(b._t); }
  function armOrRun(b, label, armedLabel, fn) { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.classList.add('armed'); b.textContent = armedLabel; b._t = setTimeout(function () { disarm(b, label); }, 4000); return; } disarm(b, label); fn(); }
  $('#btnDeleteRide').addEventListener('click', function () { armOrRun($('#btnDeleteRide'), 'Borrar esta ruta', 'Toca otra vez para borrar', function () { DB.deleteRide(detailId).then(reloadRides).then(function () { showView('rides'); }); }); });
  // fotos
  function renderPhotos(rideId) {
    DB.photosOf(rideId).then(function (ps) {
      var g = $('#photos'); g.innerHTML = '';
      ps.forEach(function (p) {
        var d = document.createElement('div'); d.className = 'ph';
        var img = document.createElement('img'); img.src = p.data; img.alt = ''; img.addEventListener('click', function () { $('#lightboxImg').src = p.data; $('#lightbox').hidden = false; });
        var del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.innerHTML = '<svg><use href="#i-close"/></svg>'; del.addEventListener('click', function () { DB.deletePhoto(p.id).then(function () { renderPhotos(rideId); }); });
        d.appendChild(img); d.appendChild(del); g.appendChild(d);
      });
      var add = document.createElement('button'); add.type = 'button'; add.className = 'add'; add.innerHTML = '<svg><use href="#i-camera"/></svg>Añadir foto'; add.addEventListener('click', function () { $('#photoFile').value = ''; $('#photoFile').click(); }); g.appendChild(add);
    });
  }
  $('#lightbox').addEventListener('click', function () { $('#lightbox').hidden = true; });
  $('#photoFile').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []), rideId = detailId; if (!files.length || !rideId) return;
    Promise.all(files.slice(0, 10).map(function (f) { return shrinkImage(f, 1280); })).then(function (datas) {
      return Promise.all(datas.filter(Boolean).map(function (data) { return DB.putPhoto({ id: Date.now() + Math.random(), rideId: rideId, data: data, t: Date.now() }); }));
    }).then(function () { renderPhotos(rideId); }).catch(function () { toast('No se pudo guardar la foto.', 'bad'); });
  });
  function shrinkImage(file, max) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  // exportaciones
  function rideFileBase(r) { return 'inclina_' + new Date(r.start).toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
  function exportFail(e) { if (!/abort|cancel/i.test(String(e))) toast('No se ha podido exportar en este dispositivo.', 'bad'); }
  $('#btnGpx').addEventListener('click', function () {
    if (!detailRide) return;
    DB.getTrack(detailRide.id).then(function (pts) { return Platform.downloadCsv(rideFileBase(detailRide) + '.gpx', Geo.toGpx(detailRide, pts), 'Ruta Inclina ' + rideTitle(detailRide)); }).catch(exportFail);
  });
  $('#btnGmaps').addEventListener('click', function () { if (!detailRide) return; DB.getTrack(detailRide.id).then(function (pts) { var u = Geo.googleMapsUrl(pts); if (u) Platform.openExternal(u); else toast('Esta ruta no tiene trazado.', 'warn'); }); });
  $('#btnShareCard').addEventListener('click', function () { if (!detailRide) return; DB.getTrack(detailRide.id).then(function (pts) { return makeShareCard(detailRide, pts); }).then(function (data) { return Platform.sharePng(rideFileBase(detailRide) + '.png', data, 'Ruta Inclina ' + rideTitle(detailRide)); }).catch(exportFail); });
  function csvFor(list) {
    var rows = [['fecha', 'hora_inicio', 'ruta', 'curva', 'hora_curva', 'lado', 'angulo_max_grados', 'velocidad_kmh', 'duracion_s', 'lat', 'lon', 'max_izq_ruta', 'max_dcha_ruta', 'km_ruta']];
    list.forEach(function (r) {
      var d = new Date(r.start), fecha = d.toISOString().slice(0, 10), hora = d.toTimeString().slice(0, 5);
      if (!r.corners.length) rows.push([fecha, hora, rideTitle(r), '', '', '', '', '', '', '', '', r.maxL, r.maxR, r.dist || 0]);
      r.corners.forEach(function (c, i) { rows.push([fecha, hora, rideTitle(r), i + 1, new Date(c.t).toTimeString().slice(0, 8), c.side === 'I' ? 'izquierda' : 'derecha', c.peak, c.v == null ? '' : c.v, c.dur, c.lat == null ? '' : c.lat, c.lon == null ? '' : c.lon, r.maxL, r.maxR, r.dist || 0]); });
    });
    return '﻿' + rows.map(function (r) { return r.map(function (x) { var s = String(x); return (typeof x === 'number') ? s.replace('.', ',') : (/[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s); }).join(';'); }).join('\r\n');
  }
  $('#btnExportRide').addEventListener('click', function () { if (!detailRide) return; Platform.downloadCsv(rideFileBase(detailRide) + '_curvas.csv', csvFor([detailRide]), 'Curvas ' + rideTitle(detailRide)).catch(exportFail); });
  $('#btnExportAll').addEventListener('click', function () { Platform.downloadCsv('inclina_todas_las_curvas.csv', csvFor(rides), 'Inclina: todas las curvas').catch(exportFail); });

  /* tarjeta para compartir (canvas 1080×1350) */
  function makeShareCard(r, pts) {
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d');
    var dark = isDark(), bg = dark ? '#121110' : '#F4F2EC', fg = dark ? '#F2EDE3' : '#15140F', fg2 = dark ? '#A39E93' : '#5C5A52', accent = dark ? '#FFAE1A' : '#B8420E', left = dark ? '#5FA8FF' : '#1D5FCC', right = dark ? '#FF66B8' : '#B3177A', line = dark ? '#3A3833' : '#C9C5B9';
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 60px "Barlow Condensed"'), document.fonts.load('600 30px "Barlow"')]).catch(function () {}) : Promise.resolve();
    return ready.then(function () {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = accent; g.font = '800 54px "Barlow Condensed", sans-serif'; g.fillText('INCLINA', 72, 110);
      g.fillStyle = fg2; g.font = '600 30px "Barlow", sans-serif'; g.fillText(fmtDateLong(r.start) + ' · ' + fmtClock(r.start), 72, 160);
      g.fillStyle = fg; g.font = '700 64px "Barlow Condensed", sans-serif'; g.fillText(rideTitle(r), 72, 240);
      // trazado
      var box = { x: 72, y: 290, w: W - 144, h: 560 };
      g.fillStyle = dark ? '#1C1B19' : '#FCFBF8'; roundRect(g, box.x, box.y, box.w, box.h, 24); g.fill(); g.strokeStyle = line; g.lineWidth = 3; g.stroke();
      if (pts && pts.length > 1) {
        var s = Geo.simplify(pts, 10), b = Geo.bounds(s), cosLat = Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180), w = (b[2] - b[0]) * cosLat, h = (b[3] - b[1]), span = Math.max(w, h, 1e-6), pad = 50, k = Math.min((box.w - 2 * pad) / Math.max(w, 1e-6), (box.h - 2 * pad) / Math.max(h, 1e-6));
        var ox = box.x + pad + ((box.w - 2 * pad) - w * k) / 2, oy = box.y + pad + ((box.h - 2 * pad) - h * k) / 2;
        g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.9)';
        g.beginPath(); s.forEach(function (p, i) { var x = ox + (p[2] - b[0]) * cosLat * k, y = oy + (b[3] - p[1]) * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
        g.lineWidth = 8;
        for (var i = 1; i < s.length; i++) { var a = s[i - 1], q = s[i]; g.strokeStyle = Geo.leanColor(Math.max(Math.abs(a[6] || 0), Math.abs(q[6] || 0))); g.beginPath(); g.moveTo(ox + (a[2] - b[0]) * cosLat * k, oy + (b[3] - a[1]) * k); g.lineTo(ox + (q[2] - b[0]) * cosLat * k, oy + (b[3] - q[1]) * k); g.stroke(); }
      } else { g.fillStyle = fg2; g.font = '600 32px "Barlow", sans-serif'; g.textAlign = 'center'; g.fillText('Sin trazado', box.x + box.w / 2, box.y + box.h / 2); g.textAlign = 'left'; }
      // cifras
      var y0 = 930, cols = [[72, 'MÁX IZQ', Math.round(r.maxL) + '°', left], [W / 2 - 100, 'MÁX DCHA', Math.round(r.maxR) + '°', right], [W - 330, 'VEL. MÁX', (r.vMax || 0) + ' km/h', fg]];
      cols.forEach(function (col) { g.fillStyle = fg2; g.font = '600 26px "Barlow Condensed", sans-serif'; g.fillText(col[1], col[0], y0); g.fillStyle = col[3]; g.font = '800 110px "Barlow Condensed", sans-serif'; g.fillText(col[2], col[0], y0 + 110); });
      var y1 = 1160, cols2 = [[72, 'DISTANCIA', fmtKm(r.dist)], [W / 2 - 100, 'EN MARCHA', fmtDur((r.movingS || 0) * 1000)], [W - 330, 'CURVAS', String(r.corners.length)]];
      cols2.forEach(function (col) { g.fillStyle = fg2; g.font = '600 26px "Barlow Condensed", sans-serif'; g.fillText(col[1], col[0], y1); g.fillStyle = fg; g.font = '700 64px "Barlow Condensed", sans-serif'; g.fillText(col[2], col[0], y1 + 70); });
      g.fillStyle = fg2; g.font = '500 24px "Barlow", sans-serif'; g.fillText('Ángulo de inclinación medido con giróscopo · inclina.arrelbit.es', 72, H - 50);
      return c.toDataURL('image/png');
    });
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------- estadísticas ---------- */
  var stats = { mode: 'month', y: new Date().getFullYear(), m: new Date().getMonth() };
  function ridesIn(y, m) { return rides.filter(function (r) { var d = new Date(r.start); return d.getFullYear() === y && (m == null || d.getMonth() === m); }); }
  function renderStats() {
    // metas semanales (lunes a domingo)
    var now = new Date(), dow = (now.getDay() + 6) % 7, monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
    var week = rides.filter(function (r) { return r.start >= monday; }), wh = week.reduce(function (s, r) { return s + (r.movingS || 0); }, 0) / 3600, wdays = {}; week.forEach(function (r) { wdays[new Date(r.start).toDateString()] = 1; });
    var goals = [['Horas en carretera', wh, 3, function (v) { return v.toFixed(1).replace('.', ','); }], ['Días activos', Object.keys(wdays).length, 3, String], ['Rutas de la semana', week.length, 3, String]];
    var done = goals.filter(function (g) { return g[1] >= g[2]; }).length;
    $('#goals').innerHTML = '<div class="goal"><span class="label" style="color:var(--color-text)">Metas semanales</span><span class="label">' + done + ' / 3</span></div>' + goals.map(function (g) { return '<div class="goal"><span>' + g[0] + '</span><span class="muted cifra">' + g[3](g[1]) + ' / ' + g[2] + '</span><span class="bar3"><i style="width:' + Math.min(100, g[1] / g[2] * 100) + '%"></i></span></div>'; }).join('');
    // periodo
    var inP = stats.mode === 'month' ? ridesIn(stats.y, stats.m) : ridesIn(stats.y, null);
    $('#perLabel').textContent = stats.mode === 'month' ? monthName(stats.y, stats.m) : String(stats.y);
    var km = inP.reduce(function (s, r) { return s + (r.dist || 0); }, 0), secs = inP.reduce(function (s, r) { return s + (r.movingS || 0); }, 0);
    $('#perKm').innerHTML = Math.round(km) + '<small>km</small>';
    $('#perRow').innerHTML = fig('Rutas', String(inP.length)) + fig('Horas', fmtDur(secs * 1000).replace(' min', 'm').replace(' h ', 'h ')) + fig('Media', (secs ? Math.round(km / (secs / 3600)) : 0) + '<span class="unit">km/h</span>') + fig('Curvas', String(inP.reduce(function (s, r) { return s + r.corners.length; }, 0)));
    // gráfico
    var bars = [], labels = [];
    if (stats.mode === 'month') { var days = new Date(stats.y, stats.m + 1, 0).getDate(); for (var d = 1; d <= days; d++) { bars.push(0); labels.push(d % 5 === 0 || d === 1 ? String(d) : ''); } inP.forEach(function (r) { bars[new Date(r.start).getDate() - 1] += r.dist || 0; }); $('#chartLabel').textContent = 'Km por día · máx ' + Math.round(Math.max.apply(null, bars.concat([0]))) + ' km'; }
    else { for (var mo = 0; mo < 12; mo++) { bars.push(0); labels.push('EFMAMJJASOND'[mo]); } inP.forEach(function (r) { bars[new Date(r.start).getMonth()] += r.dist || 0; }); $('#chartLabel').textContent = 'Km por mes · máx ' + Math.round(Math.max.apply(null, bars.concat([0]))) + ' km'; }
    var svg = $('#chart'); svg.innerHTML = ''; var n = bars.length, max = Math.max.apply(null, bars.concat([1])), bw = 360 / n;
    bars.forEach(function (v, i) { var h = v / max * 120, re = el('rect', { x: (i * bw + 1).toFixed(1), y: (130 - h).toFixed(1), width: Math.max(1, bw - 2).toFixed(1), height: h.toFixed(1), rx: 2, 'class': v ? '' : 'dim' }); if (!v) { re.setAttribute('height', 2); re.setAttribute('y', 128); } svg.appendChild(re); if (labels[i]) { var t = el('text', { x: (i * bw + bw / 2).toFixed(1), y: 146, 'text-anchor': 'middle' }); t.textContent = labels[i]; svg.appendChild(t); } });
    // récords del periodo
    var vMax = inP.reduce(function (s, r) { return Math.max(s, r.vMax || 0); }, 0), longest = inP.reduce(function (b, r) { return !b || (r.dist || 0) > (b.dist || 0) ? r : b; }, null), lean = inP.reduce(function (s, r) { return Math.max(s, r.maxL || 0, r.maxR || 0); }, 0);
    $('#perRecords').innerHTML = fig('Vel. máx', vMax + '<span class="unit">km/h</span>') + fig('Incl. máx', Math.round(lean) + '°') + fig('Ruta más larga', longest ? fmtKm(longest.dist).replace(' km', '<span class="unit">km</span>') : '—') + fig('Km totales', Math.round(rides.reduce(function (s, r) { return s + (r.dist || 0); }, 0)) + '<span class="unit">km</span>');
    // racha
    var daysSet = {}; rides.forEach(function (r) { daysSet[new Date(r.start).toDateString()] = 1; });
    var streak = 0, cur = new Date(); cur.setHours(0, 0, 0, 0); if (!daysSet[cur.toDateString()]) cur.setDate(cur.getDate() - 1);
    while (daysSet[cur.toDateString()]) { streak++; cur.setDate(cur.getDate() - 1); }
    var best = 0, run = 0, keys = Object.keys(daysSet).map(function (k) { return new Date(k).getTime(); }).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) { run = (i > 0 && keys[i] - keys[i - 1] <= 86400000 * 1.5) ? run + 1 : 1; if (run > best) best = run; }
    $('#streak').innerHTML = '<div class="goal"><span class="label" style="color:var(--color-text)">Racha activa</span><span class="cifra" style="font-size:26px;color:var(--color-accent)">' + streak + (streak === 1 ? ' día' : ' días') + '</span><span class="muted" style="grid-column:1/-1">' + (streak ? 'Días seguidos con al menos una ruta.' : 'Sal hoy y empieza una.') + ' Mejor racha: ' + best + (best === 1 ? ' día' : ' días') + '.</span></div>';
  }
  $$('#statsMode button').forEach(function (b) { b.addEventListener('click', function () { stats.mode = b.dataset.m; $$('#statsMode button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderStats(); }); });
  $('#perPrev').addEventListener('click', function () { if (stats.mode === 'month') { stats.m--; if (stats.m < 0) { stats.m = 11; stats.y--; } } else stats.y--; renderStats(); });
  $('#perNext').addEventListener('click', function () { if (stats.mode === 'month') { stats.m++; if (stats.m > 11) { stats.m = 0; stats.y++; } } else stats.y++; renderStats(); });

  /* ---------- garaje ---------- */
  var editingVehicle = null, vType = 'moto';
  function renderGarage() {
    var box = $('#vehicles'); box.innerHTML = '';
    var km = rides.reduce(function (s, r) { return s + (r.dist || 0); }, 0);
    $('#garageSummary').innerHTML = fig('Km totales', Math.round(km) + '<span class="unit">km</span>') + fig('Rutas', String(rides.length)) + fig('Vehículos', String(vehicles.length)) + fig('Horas', (rides.reduce(function (s, r) { return s + (r.movingS || 0); }, 0) / 3600).toFixed(0));
    if (!vehicles.length) { box.innerHTML = '<div class="empty">Añade tu moto para llevar el odómetro y asociarle las rutas.</div>'; return; }
    var principal = vehicles.filter(function (v) { return v.principal; })[0];
    vehicles.forEach(function (v) {
      var mine = rides.filter(function (r) { return r.vehicleId === v.id || (!r.vehicleId && principal && principal.id === v.id); });
      var vkm = mine.reduce(function (s, r) { return s + (r.dist || 0); }, 0), vs = mine.reduce(function (s, r) { return s + (r.movingS || 0); }, 0), odo = Math.round((v.odoStart || 0) + vkm), digits = String(odo).padStart(6, '0');
      var d = document.createElement('div'); d.className = 'vehicle' + (v.principal ? ' main' : '');
      d.innerHTML = '<div class="vhead"><div><span class="label" style="color:' + (v.principal ? 'var(--color-accent)' : 'var(--color-text-2)') + '">' + (v.principal ? 'Principal' : (v.type === 'coche' ? 'Coche' : 'Moto')) + '</span><div class="name">' + esc(v.name) + '</div><div class="muted">' + esc([v.make, v.model].filter(Boolean).join(' ')) + '</div></div><svg style="width:32px;height:32px;color:var(--color-text-2)"><use href="#i-bike"/></svg></div>' +
        '<div><span class="label">Odómetro · km</span><br><span class="odo">' + digits.slice(0, 5) + '<b>' + digits.slice(5) + '</b></span></div>' +
        '<div class="vstats">' + fig('Rutas', String(mine.length)) + fig('Horas', (vs / 3600).toFixed(0)) + fig('Km en Inclina', Math.round(vkm) + '') + '</div>' +
        '<div class="actions">' + (v.principal ? '' : '<button class="btn small" type="button" data-act="main">Hacer principal</button>') + '<button class="btn small" type="button" data-act="edit">Editar</button><button class="btn small danger wide" type="button" data-act="del">Quitar del garaje</button></div>';
      d.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () {
        if (b.dataset.act === 'main') { vehicles.forEach(function (x) { x.principal = x.id === v.id; }); Promise.all(vehicles.map(DB.putVehicle)).then(renderGarage); }
        if (b.dataset.act === 'edit') openVehicleForm(v);
        if (b.dataset.act === 'del') armOrRun(b, 'Quitar del garaje', 'Toca otra vez para quitar', function () { DB.deleteVehicle(v.id).then(reloadVehicles).then(renderGarage); });
      }); });
      box.appendChild(d);
    });
  }
  function reloadVehicles() { return DB.allVehicles().then(function (a) { vehicles = a; return a; }); }
  function openVehicleForm(v) {
    editingVehicle = v || null; vType = v ? v.type : 'moto';
    $('#vehicleFormTitle').textContent = v ? 'Editar vehículo' : 'Nuevo vehículo';
    $('#vName').value = v ? v.name : ''; $('#vMake').value = v ? v.make || '' : ''; $('#vModel').value = v ? v.model || '' : ''; $('#vOdo').value = v ? (v.odoStart || 0) : '';
    $$('#vType button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.t === vType)); });
    $('#vehicleForm').hidden = false; $('#vName').focus();
  }
  $('#btnAddVehicle').addEventListener('click', function () { openVehicleForm(null); });
  $$('#vType button').forEach(function (b) { b.addEventListener('click', function () { vType = b.dataset.t; $$('#vType button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); });
  $('#vCancel').addEventListener('click', function () { $('#vehicleForm').hidden = true; });
  $('#vSave').addEventListener('click', function () {
    var name = $('#vName').value.trim(); if (!name) { $('#vName').focus(); return; }
    var v = editingVehicle || { id: Date.now(), principal: vehicles.length === 0 };
    v.name = name; v.make = $('#vMake').value.trim(); v.model = $('#vModel').value.trim(); v.type = vType; v.odoStart = Math.max(0, parseInt($('#vOdo').value, 10) || 0);
    DB.putVehicle(v).then(reloadVehicles).then(function () { $('#vehicleForm').hidden = true; renderGarage(); });
  });

  /* ---------- ajustes ---------- */
  function renderSettings() {
    $('#setVoice').checked = !!settings.voice; $('#setAutoPause').checked = !!settings.autoPause; $('#setAutoStart').checked = !!settings.autoStart; $('#setInvert').checked = !!settings.invert;
    $('#vminVal').innerHTML = settings.vMin + '<small>km/h</small>'; $('#peakVal').textContent = settings.minPeak + '°';
    $$('#themeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.theme === settings.theme)); });
    $('#versionLine').textContent = 'Inclina v' + APP_VERSION + (Platform.native ? ' · app' : ' · web');
    renderDiag();
    DB.estimateUsage().then(function (u) { if (u) setText('#dgStore', (u.used / 1048576).toFixed(1).replace('.', ',') + ' MB usados'); });
  }
  function applySettings() { saveSettings(); est.setInvert(settings.invert); det.setOptions({ minPeak: settings.minPeak }); applyTheme(); renderSettings(); }
  $('#setVoice').addEventListener('change', function (e) { settings.voice = e.target.checked; applySettings(); if (settings.voice) Platform.speak('Voz activada'); });
  $('#setAutoPause').addEventListener('change', function (e) { settings.autoPause = e.target.checked; applySettings(); });
  $('#setAutoStart').addEventListener('change', function (e) { settings.autoStart = e.target.checked; applySettings(); });
  $('#setInvert').addEventListener('change', function (e) { settings.invert = e.target.checked; applySettings(); });
  $('#vminDown').addEventListener('click', function () { settings.vMin = clamp(settings.vMin - 5, 0, 200); applySettings(); });
  $('#vminUp').addEventListener('click', function () { settings.vMin = clamp(settings.vMin + 5, 0, 200); applySettings(); });
  $('#peakDown').addEventListener('click', function () { settings.minPeak = clamp(settings.minPeak - 1, 3, 60); applySettings(); });
  $('#peakUp').addEventListener('click', function () { settings.minPeak = clamp(settings.minPeak + 1, 3, 60); applySettings(); });
  $$('#themeSeg button').forEach(function (b) { b.addEventListener('click', function () { settings.theme = b.dataset.theme; applySettings(); }); });
  $('#btnRecal').addEventListener('click', function () { showView('map'); openLeanFull(); startCalibration(); });
  $('#btnWipe').addEventListener('click', function () { armOrRun($('#btnWipe'), 'Borrar todos los datos', 'Toca otra vez para borrar', function () { DB.wipe().then(function () { try { localStorage.clear(); } catch (e) {} location.reload(); }); }); });
  function renderDiag() {
    var s = est.state, now = performance.now(), motionFresh = sens.lastMotion && (now - sens.lastMotion) < 2000, f1 = function (x) { return x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + '°'; };
    setText('#dgRate', (motionFresh ? Math.round(sens.rate) + ' muestras/s' : (sens.listening ? 'sin datos' : 'no iniciado')) + (sens.src === 'native' ? ' · sensores nativos' : ' · navegador'));
    setText('#dgGyro', motionFresh ? (sens.gyro ? 'sí' : 'no (solo acelerómetro)') : '—');
    setText('#dgGain', (Math.abs(s.gain) > 10 ? 'rad/s' : '°/s') + (s.gain < 0 ? ', invertido' : ', normal') + (s.gainConf ? ' · conf ' + Math.round(s.gainConf * 100) + '%' : ' · por defecto'));
    setText('#dgPhi', calib ? f1(s.phi) : 'sin calibrar'); setText('#dgAcc', calib && motionFresh ? f1(s.phiAcc) : '—'); setText('#dgPhys', f1(s.phiPhys));
    setText('#dgSrc', { gyro: 'giróscopo', phys: 'giróscopo + física', acc: 'giróscopo + acelerómetro', 'acc-still': 'acelerómetro (parado)', 'acc-only': 'solo acelerómetro' }[s.source] || s.source);
    var gpsFresh = sens.lastGps && (now - sens.lastGps) < 5000;
    setText('#dgGps', gpsFresh ? Math.round(sens.speedKmh || 0) + ' km/h · ±' + Math.round(sens.gpsAcc || 0) + ' m' + (gpsMode === 'bg' ? ' · segundo plano' : '') : (sens.gpsError || (gpsMode ? 'buscando' : 'parado')));
  }

  /* ---------- ruta simulada (sin sensores ni GPS) ---------- */
  function stopDemo() {
    if (demoTimer) clearInterval(demoTimer); demoTimer = null; sens.demo = false; sens.speedKmh = null; sens.lastGps = 0; lastMotionT = null; lastNativeTs = null;
    calib = LS.get('inclina.calib', null); est.setFrame(calib && calib.up ? LeanCore.buildFrame(calib.up) : null, calib ? calib.bias : null);
  }
  $('#btnDemo').addEventListener('click', function () {
    if (rec) return;
    showView('map');
    var tilt = 30 * Math.PI / 180, G = LeanCore.G, D2R = Math.PI / 180;
    var X = [0, -1, 0], Y = [Math.sin(tilt), 0, Math.cos(tilt)], Z = [-Math.cos(tilt), 0, Math.sin(tilt)], dot = LeanCore.v3.dot, toPhone = function (b) { return [dot(b, X), dot(b, Y), dot(b, Z)]; };
    var up = toPhone([0, 0, G]); calib = { up: up, bias: [0, 0, 0], at: Date.now(), demo: true }; est.setFrame(LeanCore.buildFrame(up), [0, 0, 0]);
    sens.demo = true; lastMotionT = null; stopGps();
    // carretera de montaña simulada: 60 s, curvas alternas
    var plan = [[3, 0, 0], [4, 60, 0], [1.2, 60, -30], [4, 60, -30], [1.2, 60, 0], [3, 90, 0], [1, 70, 36], [3, 70, 36], [1, 70, 0], [2.5, 70, -20], [2.5, 70, 20], [3, 80, 0], [1.5, 65, -42], [3, 65, -42], [1.5, 65, 0], [4, 50, 0], [2, 0, 0]];
    var seg = 0, segT = 0, phi = 0, last = performance.now(), lat = lastFix ? lastFix.lat : 39.47, lon = lastFix ? lastFix.lon : -0.38, hdg = 20, tAcc = 0, lastFixAt = 0;
    startRide(false);
    toast('Ruta simulada: no son datos reales. Se para sola al acabar.', 'warn');
    demoTimer = setInterval(function () {
      var now = performance.now(), step = (now - last) / 1000; last = now;
      if (seg >= plan.length) { stopRide(); return; }
      var p = plan[seg], v = p[1] / 3.6, target = p[2];
      segT += step; if (segT >= p[0]) { seg++; segT = 0; }
      var prevPhi = phi; phi += (target - phi) * Math.min(1, step / 0.25);
      var roll = (phi - prevPhi) / step, yaw = v > 0.5 ? -(G * Math.tan(phi * D2R) / v) / D2R : 0;
      var aBody = v > 0.5 ? [0, 0, G / Math.cos(phi * D2R)] : [0, G * Math.sin(phi * D2R), G * Math.cos(phi * D2R)];
      var acc = toPhone(aBody).map(function (x) { return x + (Math.random() - 0.5) * 1.2; }), rot = toPhone([roll, 0, yaw]).map(function (x) { return x + (Math.random() - 0.5) * 3; });
      hdg += yaw * step; var dM = v * step; lat += dM * Math.cos(hdg * D2R) / 111320; lon += dM * Math.sin(hdg * D2R) / (111320 * Math.cos(lat * D2R));
      sens.lastGps = now; sens.speedKmh = p[1]; sens.speedMs = v; sens.gpsAcc = 8; sens.heading = ((hdg % 360) + 360) % 360; est.setSpeed(v, now);
      handleSample(acc, rot, now);
      tAcc += step;
      if (now - lastFixAt >= 1000) { lastFixAt = now; var fix = { lat: lat, lon: lon, ts: Date.now(), acc: 8, alt: 400 + 60 * Math.sin(tAcc / 20), v: v }; sens.fix = fix; if (rec) recFix(fix, lastFix); lastFix = fix; updatePosition(fix); }
    }, 1000 / 60);
  });

  /* ---------- arranque ---------- */
  Platform.onBack(function () {
    if (!$('#calOverlay').hidden) { $('#calCancel').click(); return true; }
    if (!$('#lightbox').hidden) { $('#lightbox').hidden = true; return true; }
    if (!$('#leanFull').hidden) { closeLeanFull(); return true; }
    if (currentView === 'detail') { showView('rides'); return true; }
    if (currentView !== 'map') { showView('map'); return true; }
    return false;
  });
  DB.open().then(function () { return DB.migrateFromLocalStorage(); }).then(function (n) { if (n) toast(n + ' salidas antiguas importadas al historial.', 'ok'); return recoverRide(); })
    .then(reloadVehicles).then(reloadRides).then(function () {
      if (!calib) showNotice('Monta el móvil, pon la moto vertical y pulsa Cero (botón del indicador) para calibrar.', 'warn');
      initMap(); startGps('fg'); render(); Platform.ready();
    }).catch(function (e) { toast('Error al iniciar la base de datos: ' + (e && e.message ? e.message : e), 'bad'); initMap(); Platform.ready(); });
  if (!Platform.native && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
