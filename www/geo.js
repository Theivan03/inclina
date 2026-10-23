/* Inclina — utilidades geográficas y de rutas. Sin DOM, sin dependencias.
   Un punto de trazado es [t(ms), lat, lon, alt(m|null), v(m/s|null), acc(m), lean(°|null)]. */
var Geo = (function () {
  var R = 6371000, D2R = Math.PI / 180;
  function dist(lat1, lon1, lat2, lon2) {
    var dLat = (lat2 - lat1) * D2R, dLon = (lon2 - lon1) * D2R;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function bearing(lat1, lon1, lat2, lon2) {
    var y = Math.sin((lon2 - lon1) * D2R) * Math.cos(lat2 * D2R);
    var x = Math.cos(lat1 * D2R) * Math.sin(lat2 * D2R) - Math.sin(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.cos((lon2 - lon1) * D2R);
    return (Math.atan2(y, x) / D2R + 360) % 360;
  }
  /* Estadísticas de un trazado: distancia, tiempo en movimiento, velocidades, altitudes, desnivel. */
  function stats(pts) {
    var d = 0, moving = 0, vMax = 0, altMax = null, altMin = null, up = 0, lastAlt = null, lastT = null;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (i > 0) {
        var q = pts[i - 1], seg = dist(q[1], q[2], p[1], p[2]), dt = (p[0] - q[0]) / 1000;
        if (seg < 2000 && dt > 0 && dt < 120) {
          d += seg;
          var v = p[4] != null ? p[4] : seg / dt;
          if (v > 0.8) moving += dt;   // > 3 km/h cuenta como en movimiento
          if (v > vMax && v < 120) vMax = v;
        }
      }
      if (p[3] != null) {
        if (altMax == null || p[3] > altMax) altMax = p[3];
        if (altMin == null || p[3] < altMin) altMin = p[3];
        if (lastAlt != null && p[3] - lastAlt > 0 && p[3] - lastAlt < 50) up += p[3] - lastAlt;
        lastAlt = p[3];
      }
    }
    var total = pts.length > 1 ? (pts[pts.length - 1][0] - pts[0][0]) / 1000 : 0;
    return { distKm: d / 1000, movingS: moving, totalS: total, vMaxKmh: vMax * 3.6, vAvgKmh: moving > 0 ? (d / moving) * 3.6 : 0, altMax: altMax, altMin: altMin, climb: up };
  }
  /* Simplificación Douglas-Peucker (tolerancia en metros) para miniaturas y mapas ligeros. */
  function simplify(pts, tolM) {
    if (pts.length < 3) return pts.slice();
    var keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
    var stack = [[0, pts.length - 1]];
    var cosLat = Math.cos(pts[0][1] * D2R);
    function perp(p, a, b) { // distancia aproximada en metros del punto p al segmento ab (plano local)
      var ax = a[2] * cosLat, ay = a[1], bx = b[2] * cosLat, by = b[1], px = p[2] * cosLat, py = p[1];
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      var ex = ax + t * dx - px, ey = ay + t * dy - py;
      return Math.sqrt(ex * ex + ey * ey) * 111320;
    }
    while (stack.length) {
      var s = stack.pop(), i0 = s[0], i1 = s[1], best = 0, bi = -1;
      for (var i = i0 + 1; i < i1; i++) { var dd = perp(pts[i], pts[i0], pts[i1]); if (dd > best) { best = dd; bi = i; } }
      if (bi > 0 && best > tolM) { keep[bi] = 1; stack.push([i0, bi]); stack.push([bi, i1]); }
    }
    var out = []; for (var k = 0; k < pts.length; k++) if (keep[k]) out.push(pts[k]);
    return out;
  }
  function bounds(pts) {
    var b = null;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!b) b = [p[2], p[1], p[2], p[1]];
      else { if (p[2] < b[0]) b[0] = p[2]; if (p[1] < b[1]) b[1] = p[1]; if (p[2] > b[2]) b[2] = p[2]; if (p[1] > b[3]) b[3] = p[1]; }
    }
    return b; // [minLon, minLat, maxLon, maxLat]
  }
  /* Miniatura SVG del trazado (polilínea normalizada). */
  function thumbSvg(pts, size, stroke) {
    size = size || 64;
    var s = simplify(pts, 15); if (s.length < 2) return '';
    var b = bounds(s), cosLat = Math.cos(((b[1] + b[3]) / 2) * D2R);
    var w = (b[2] - b[0]) * cosLat, h = (b[3] - b[1]), span = Math.max(w, h, 1e-6), pad = 6, k = (size - 2 * pad) / span;
    var ox = pad + ((size - 2 * pad) - w * k) / 2, oy = pad + ((size - 2 * pad) - h * k) / 2;
    var d = s.map(function (p, i) { return (i ? 'L' : 'M') + (ox + (p[2] - b[0]) * cosLat * k).toFixed(1) + ' ' + (oy + (b[3] - p[1]) * k).toFixed(1); }).join('');
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + (stroke || 'currentColor') + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  /* Índice del punto más cercano a un instante t (ms). */
  function indexAtTime(pts, t) {
    var lo = 0, hi = pts.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (pts[mid][0] < t) lo = mid + 1; else hi = mid; }
    return lo;
  }
  /* Punto interpolado para la reproducción. */
  function interpolate(pts, t) {
    if (!pts.length) return null;
    if (t <= pts[0][0]) return pts[0];
    if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1];
    var i = indexAtTime(pts, t), a = pts[i - 1], b = pts[i], f = (t - a[0]) / Math.max(1, b[0] - a[0]);
    var lerp = function (x, y) { return x == null || y == null ? (x != null ? x : y) : x + (y - x) * f; };
    return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, lerp(a[3], b[3]), lerp(a[4], b[4]), lerp(a[5], b[5]), lerp(a[6], b[6])];
  }
  /* Distancia acumulada (km) hasta cada punto. */
  function cumulative(pts) {
    var out = new Float32Array(pts.length), d = 0;
    for (var i = 1; i < pts.length; i++) { var seg = dist(pts[i - 1][1], pts[i - 1][2], pts[i][1], pts[i][2]); if (seg < 2000) d += seg; out[i] = d / 1000; }
    return out;
  }

  /* ---- GPX ---- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toGpx(ride, pts) {
    var lines = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Inclina" xmlns="http://www.topografix.com/GPX/1/1" xmlns:inclina="https://inclina.arrelbit.es/gpx/1">',
      '<metadata><name>' + esc(ride.name || 'Ruta') + '</name><time>' + new Date(ride.start).toISOString() + '</time></metadata>',
      '<trk><name>' + esc(ride.name || 'Ruta') + '</name><trkseg>'];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var l = '<trkpt lat="' + p[1].toFixed(6) + '" lon="' + p[2].toFixed(6) + '">';
      if (p[3] != null) l += '<ele>' + p[3].toFixed(1) + '</ele>';
      l += '<time>' + new Date(p[0]).toISOString() + '</time>';
      if (p[4] != null || p[6] != null) {
        l += '<extensions>';
        if (p[4] != null) l += '<inclina:speed>' + p[4].toFixed(2) + '</inclina:speed>';
        if (p[6] != null) l += '<inclina:lean>' + p[6].toFixed(1) + '</inclina:lean>';
        l += '</extensions>';
      }
      lines.push(l + '</trkpt>');
    }
    lines.push('</trkseg></trk>');
    (ride.corners || []).forEach(function (c) {
      if (c.lat == null) return;
      lines.push('<wpt lat="' + c.lat.toFixed(6) + '" lon="' + c.lon.toFixed(6) + '"><name>' + (c.side === 'I' ? 'Izq ' : 'Dcha ') + Math.round(c.peak) + '°</name><type>curva</type></wpt>');
    });
    lines.push('</gpx>');
    return lines.join('\n');
  }
  function fromGpx(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('GPX no válido');
    var pts = [], tp = doc.getElementsByTagName('trkpt'), t0 = null, last = null;
    if (!tp.length) tp = doc.getElementsByTagName('rtept');
    for (var i = 0; i < tp.length; i++) {
      var e = tp[i], lat = parseFloat(e.getAttribute('lat')), lon = parseFloat(e.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lon)) continue;
      var tn = e.getElementsByTagName('time')[0], en = e.getElementsByTagName('ele')[0];
      var t = tn ? Date.parse(tn.textContent) : null;
      if (t == null || isNaN(t)) { t = last != null ? last + 1000 : (t0 != null ? t0 : Date.now()); }
      if (t0 == null) t0 = t;
      var sp = null, ln = null, ex = e.getElementsByTagName('extensions')[0];
      if (ex) { var all = ex.getElementsByTagName('*'); for (var k = 0; k < all.length; k++) { var nm = all[k].localName; if (nm === 'speed') sp = parseFloat(all[k].textContent); if (nm === 'lean') ln = parseFloat(all[k].textContent); } }
      pts.push([t, lat, lon, en ? parseFloat(en.textContent) : null, isNaN(sp) ? null : sp, 20, isNaN(ln) ? null : ln]);
      last = t;
    }
    // velocidad por diferencias si el GPX no la trae
    for (var j = 1; j < pts.length; j++) if (pts[j][4] == null) { var dt = (pts[j][0] - pts[j - 1][0]) / 1000; pts[j][4] = dt > 0 ? dist(pts[j - 1][1], pts[j - 1][2], pts[j][1], pts[j][2]) / dt : 0; }
    var nameEl = doc.getElementsByTagName('name')[0];
    return { name: nameEl ? nameEl.textContent.trim() : '', points: pts };
  }
  /* Enlace a Google Maps con hasta 9 paradas intermedias muestreadas del trazado. */
  function googleMapsUrl(pts) {
    if (pts.length < 2) return null;
    var s = simplify(pts, 200), n = Math.min(9, Math.max(0, s.length - 2)), wps = [];
    for (var i = 1; i <= n; i++) { var p = s[Math.round(i * (s.length - 1) / (n + 1))]; wps.push(p[1].toFixed(5) + ',' + p[2].toFixed(5)); }
    var a = pts[0], b = pts[pts.length - 1];
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + a[1].toFixed(5) + ',' + a[2].toFixed(5) + '&destination=' + b[1].toFixed(5) + ',' + b[2].toFixed(5) + (wps.length ? '&waypoints=' + wps.join('|') : '');
  }
  /* Color por inclinación (0-50°) y por velocidad (0-140 km/h) para el trazado. */
  function leanColor(deg) {
    var a = Math.min(1, Math.abs(deg || 0) / 50);
    var stops = [[0, [120, 118, 110]], [0.35, [255, 174, 26]], [0.7, [230, 70, 40]], [1, [180, 20, 90]]];
    return ramp(a, stops);
  }
  function speedColor(kmh) {
    var a = Math.min(1, Math.max(0, (kmh || 0) / 140));
    return ramp(a, [[0, [60, 120, 220]], [0.45, [40, 180, 110]], [0.75, [255, 174, 26]], [1, [230, 60, 60]]]);
  }
  function ramp(a, stops) {
    for (var i = 1; i < stops.length; i++) if (a <= stops[i][0]) {
      var f = (a - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]), c0 = stops[i - 1][1], c1 = stops[i][1];
      return 'rgb(' + Math.round(c0[0] + (c1[0] - c0[0]) * f) + ',' + Math.round(c0[1] + (c1[1] - c0[1]) * f) + ',' + Math.round(c0[2] + (c1[2] - c0[2]) * f) + ')';
    }
    return 'rgb(' + stops[stops.length - 1][1].join(',') + ')';
  }
  /* GeoJSON de segmentos coloreados (muestreado para que el mapa vaya fluido). */
  function segmentsGeoJson(pts, mode) {
    var s = pts.length > 2500 ? simplify(pts, 5) : pts, feats = [];
    for (var i = 1; i < s.length; i++) {
      var a = s[i - 1], b = s[i];
      if (dist(a[1], a[2], b[1], b[2]) > 2000) continue;
      var val = mode === 'lean' ? Math.max(Math.abs(a[6] || 0), Math.abs(b[6] || 0)) : ((a[4] || 0) + (b[4] || 0)) / 2 * 3.6;
      feats.push({ type: 'Feature', properties: { color: mode === 'lean' ? leanColor(val) : speedColor(val) }, geometry: { type: 'LineString', coordinates: [[a[2], a[1]], [b[2], b[1]]] } });
    }
    return { type: 'FeatureCollection', features: feats };
  }
  return { dist: dist, bearing: bearing, stats: stats, simplify: simplify, bounds: bounds, thumbSvg: thumbSvg, indexAtTime: indexAtTime, interpolate: interpolate, cumulative: cumulative,
    toGpx: toGpx, fromGpx: fromGpx, googleMapsUrl: googleMapsUrl, leanColor: leanColor, speedColor: speedColor, segmentsGeoJson: segmentsGeoJson };
})();
if (typeof module !== 'undefined') module.exports = Geo;
