/* Inclina — logros, XP y niveles. Sin DOM. Todo se calcula a partir de las rutas guardadas y unos
   pocos "hechos" de uso de la app (flags). Sin logros de velocidad a propósito: no premiamos correr. */
var Achievements = (function () {
  var LEVELS = [
    { n: 1, name: 'Novato', xp: 0 }, { n: 2, name: 'Rodador', xp: 500 }, { n: 3, name: 'Curvero', xp: 1500 }, { n: 4, name: 'Piloto', xp: 3000 },
    { n: 5, name: 'Veterano', xp: 5000 }, { n: 6, name: 'Leyenda', xp: 8000 }, { n: 7, name: 'Mito', xp: 12000 }
  ];
  var CATS = { rutas: 'Rutas', distancia: 'Distancia', inclinacion: 'Inclinación', rachas: 'Rachas', consistencia: 'Consistencia', exploracion: 'Exploración', especiales: 'Especiales', app: 'App' };
  function A(id, cat, name, desc, xp, metric, target, fmt) { return { id: id, cat: cat, name: name, desc: desc, xp: xp, metric: metric, target: target, fmt: fmt || null }; }
  var km = function (v) { return Math.round(v) + ' km'; }, n = function (v) { return String(Math.round(v)); }, deg = function (v) { return Math.round(v) + '°'; };
  var LIST = [
    A('r1', 'rutas', 'Primera ruta', 'Graba tu primera ruta.', 50, 'rides', 1, n),
    A('r5', 'rutas', 'Cogiendo el gusto', 'Graba 5 rutas.', 100, 'rides', 5, n),
    A('r10', 'rutas', 'Habitual', 'Graba 10 rutas.', 150, 'rides', 10, n),
    A('r25', 'rutas', 'De la casa', 'Graba 25 rutas.', 250, 'rides', 25, n),
    A('r50', 'rutas', 'Medio centenar', 'Graba 50 rutas.', 400, 'rides', 50, n),
    A('r100', 'rutas', 'Centurión', 'Graba 100 rutas.', 800, 'rides', 100, n),
    A('d100', 'distancia', 'Primeros 100', 'Acumula 100 km.', 100, 'km', 100, km),
    A('d500', 'distancia', 'Rodando', 'Acumula 500 km.', 200, 'km', 500, km),
    A('d1000', 'distancia', 'Mil', 'Acumula 1.000 km.', 300, 'km', 1000, km),
    A('d2500', 'distancia', 'Kilometrero', 'Acumula 2.500 km.', 500, 'km', 2500, km),
    A('d5000', 'distancia', 'Cinco mil', 'Acumula 5.000 km.', 800, 'km', 5000, km),
    A('d10000', 'distancia', 'Diez mil', 'Acumula 10.000 km.', 1200, 'km', 10000, km),
    A('s100', 'distancia', 'Tirada larga', 'Más de 100 km en una sola ruta.', 150, 'rideKmMax', 100, km),
    A('s200', 'distancia', 'Espíritu touring', 'Más de 200 km en una sola ruta.', 250, 'rideKmMax', 200, km),
    A('s300', 'distancia', 'Maratón', 'Más de 300 km en una sola ruta.', 400, 'rideKmMax', 300, km),
    A('i20', 'inclinacion', 'Empiezas a tumbar', 'Inclina 20° en una curva.', 100, 'leanMax', 20, deg),
    A('i30', 'inclinacion', 'Treinta', 'Inclina 30° en una curva.', 200, 'leanMax', 30, deg),
    A('i35', 'inclinacion', 'Rodilla cerca', 'Inclina 35° en una curva.', 300, 'leanMax', 35, deg),
    A('i40', 'inclinacion', 'Cuarenta', 'Inclina 40° en una curva.', 500, 'leanMax', 40, deg),
    A('i45', 'inclinacion', 'Cuarenta y cinco', 'Inclina 45° en una curva.', 800, 'leanMax', 45, deg),
    A('ieq', 'inclinacion', 'El Equilibrista', 'Inclina 40° tanto a izquierda como a derecha.', 500, 'leanBoth40', 1, null),
    A('isim', 'inclinacion', 'Simétrico', 'Máximos a izquierda y derecha con menos de 3° de diferencia (rutas de 20+ curvas).', 200, 'symmetric', 1, null),
    A('c100', 'inclinacion', 'Cien curvas', 'Acumula 100 curvas registradas.', 150, 'corners', 100, n),
    A('c1000', 'inclinacion', 'Mil curvas', 'Acumula 1.000 curvas registradas.', 400, 'corners', 1000, n),
    A('c50r', 'inclinacion', 'Puerto de montaña', '50 curvas o más en una sola ruta.', 200, 'rideCornersMax', 50, n),
    A('st3', 'rachas', 'Tres seguidos', 'Rueda 3 días seguidos.', 150, 'streakBest', 3, n),
    A('st7', 'rachas', 'Una semana', 'Rueda 7 días seguidos.', 400, 'streakBest', 7, n),
    A('st30', 'rachas', 'Un mes entero', 'Rueda 30 días seguidos.', 1000, 'streakBest', 30, n),
    A('w4', 'consistencia', 'Cada semana', 'Al menos una ruta en 4 semanas seguidas.', 300, 'weeksRun', 4, n),
    A('m3', 'consistencia', 'Trimestre', 'Al menos una ruta en 3 meses seguidos.', 500, 'monthsRun', 3, n),
    A('m10', 'consistencia', 'Mes intenso', '10 rutas en un mismo mes.', 300, 'monthRidesMax', 10, n),
    A('e10', 'exploracion', 'Curioso', 'Visita 10 zonas distintas (cuadrículas de 10 km).', 100, 'cells', 10, n),
    A('e50', 'exploracion', 'Explorador', 'Visita 50 zonas distintas.', 300, 'cells', 50, n),
    A('e200', 'exploracion', 'Cartógrafo', 'Visita 200 zonas distintas.', 800, 'cells', 200, n),
    A('cl1000', 'exploracion', 'Mil metros arriba', 'Más de 1.000 m de desnivel positivo en una ruta.', 300, 'climbMax', 1000, function (v) { return Math.round(v) + ' m'; }),
    A('a1000', 'exploracion', 'Por encima de 1.000', 'Alcanza 1.000 m de altitud.', 200, 'altMax', 1000, function (v) { return Math.round(v) + ' m'; }),
    A('a2000', 'exploracion', 'Alta montaña', 'Alcanza 2.000 m de altitud.', 500, 'altMax', 2000, function (v) { return Math.round(v) + ' m'; }),
    A('night', 'especiales', 'Nocturno', 'Una ruta que empiece entre las 22:00 y las 05:00.', 150, 'night', 1, null),
    A('early', 'especiales', 'Madrugador', 'Una ruta que empiece antes de las 07:00.', 100, 'early', 1, null),
    A('h2', 'especiales', 'Sin bajarse', 'Más de 2 horas en marcha en una ruta.', 200, 'rideHoursMax', 2, function (v) { return v.toFixed(1).replace('.', ',') + ' h'; }),
    A('wk', 'especiales', 'Fin de semana completo', 'Ruta en sábado y en domingo de la misma semana.', 150, 'weekendBoth', 1, null),
    A('v1', 'app', 'Garaje abierto', 'Añade tu primer vehículo.', 50, 'vehicles', 1, n),
    A('gpx', 'app', 'Exportador', 'Exporta una ruta en GPX.', 50, 'flag:gpxExport', 1, null),
    A('imp', 'app', 'Importador', 'Importa una ruta GPX.', 50, 'flag:gpxImport', 1, null),
    A('ph', 'app', 'Recuerdo', 'Añade una foto a una ruta.', 50, 'flag:photo', 1, null),
    A('card', 'app', 'Presume', 'Comparte una tarjeta de ruta.', 50, 'flag:card', 1, null),
    A('st5', 'app', 'Cinco estrellas', 'Puntúa una ruta con 5 estrellas.', 50, 'stars5', 1, null),
    A('voice', 'app', 'Oído', 'Activa la voz al salir de curva.', 25, 'flag:voice', 1, null),
    A('name', 'app', 'Con nombre', 'Pon nombre a una ruta.', 25, 'named', 1, null),
    A('plan', 'app', 'Planificador', 'Guarda una ruta planificada en el mapa.', 50, 'flag:plan', 1, null),
    A('park', 'app', 'Dónde la dejé', 'Guarda un aparcamiento.', 25, 'flag:park', 1, null),
    A('mant', 'app', 'Al día', 'Registra un mantenimiento en el garaje.', 50, 'flag:maint', 1, null)
  ];

  function weekKey(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x.getTime(); }
  function computeContext(rides, vehicles, flags) {
    var c = { rides: rides.length, km: 0, rideKmMax: 0, leanMax: 0, leanL: 0, leanR: 0, leanBoth40: 0, symmetric: 0, corners: 0, rideCornersMax: 0, streakBest: 0, weeksRun: 0, monthsRun: 0, monthRidesMax: 0, cells: 0, climbMax: 0, altMax: 0, night: 0, early: 0, rideHoursMax: 0, weekendBoth: 0, vehicles: vehicles.length, stars5: 0, named: 0 };
    var cells = {}, days = {}, weeks = {}, months = {}, satWeeks = {}, sunWeeks = {};
    rides.forEach(function (r) {
      c.km += r.dist || 0; if ((r.dist || 0) > c.rideKmMax) c.rideKmMax = r.dist;
      if (r.maxL > c.leanL) c.leanL = r.maxL; if (r.maxR > c.leanR) c.leanR = r.maxR;
      c.corners += r.corners ? r.corners.length : 0; if (r.corners && r.corners.length > c.rideCornersMax) c.rideCornersMax = r.corners.length;
      if (r.corners && r.corners.length >= 20 && Math.abs(r.maxL - r.maxR) < 3 && r.maxL > 15) c.symmetric = 1;
      if (r.climb > c.climbMax) c.climbMax = r.climb; if (r.altMax > c.altMax) c.altMax = r.altMax;
      var h = (r.movingS || 0) / 3600; if (h > c.rideHoursMax) c.rideHoursMax = h;
      var d = new Date(r.start), hr = d.getHours(); if (hr >= 22 || hr < 5) c.night = 1; if (hr < 7 && hr >= 4) c.early = 1;
      days[d.toDateString()] = 1; var wk = weekKey(d); weeks[wk] = 1; months[d.getFullYear() + '-' + d.getMonth()] = (months[d.getFullYear() + '-' + d.getMonth()] || 0) + 1;
      if (d.getDay() === 6) satWeeks[wk] = 1; if (d.getDay() === 0) sunWeeks[wk] = 1;
      (r.cells || []).forEach(function (k) { cells[k] = 1; });
      if (r.stars === 5) c.stars5 = 1; if (r.name) c.named = 1;
    });
    c.leanMax = Math.max(c.leanL, c.leanR); c.leanBoth40 = (c.leanL >= 40 && c.leanR >= 40) ? 1 : 0;
    c.cells = Object.keys(cells).length;
    for (var w in satWeeks) if (sunWeeks[w]) c.weekendBoth = 1;
    for (var m in months) if (months[m] > c.monthRidesMax) c.monthRidesMax = months[m];
    // racha mejor
    var ds = Object.keys(days).map(function (k) { return new Date(k).getTime(); }).sort(function (a, b) { return a - b; }), run = 0;
    for (var i = 0; i < ds.length; i++) { run = (i > 0 && ds[i] - ds[i - 1] <= 86400000 * 1.5) ? run + 1 : 1; if (run > c.streakBest) c.streakBest = run; }
    var ws = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; }); run = 0;
    for (var j = 0; j < ws.length; j++) { run = (j > 0 && ws[j] - ws[j - 1] <= 7 * 86400000 + 3600000) ? run + 1 : 1; if (run > c.weeksRun) c.weeksRun = run; }
    var ms = Object.keys(months).map(function (k) { var p = k.split('-'); return +p[0] * 12 + +p[1]; }).sort(function (a, b) { return a - b; }); run = 0;
    for (var q = 0; q < ms.length; q++) { run = (q > 0 && ms[q] - ms[q - 1] === 1) ? run + 1 : 1; if (run > c.monthsRun) c.monthsRun = run; }
    for (var f in (flags || {})) c['flag:' + f] = flags[f] ? 1 : 0;
    return c;
  }
  function evaluate(ctx, unlocked) {
    var fresh = [];
    LIST.forEach(function (a) { if (unlocked[a.id]) return; var v = ctx[a.metric] || 0; if (v >= a.target) { unlocked[a.id] = Date.now(); fresh.push(a); } });
    return fresh;
  }
  function xpOf(unlocked) { return LIST.reduce(function (s, a) { return s + (unlocked[a.id] ? a.xp : 0); }, 0); }
  function levelOf(xp) { var lv = LEVELS[0], next = null; for (var i = 0; i < LEVELS.length; i++) { if (xp >= LEVELS[i].xp) lv = LEVELS[i]; else { next = LEVELS[i]; break; } } return { level: lv, next: next, xp: xp }; }
  function progress(a, ctx) { if (!a.fmt) return null; var v = ctx[a.metric] || 0; return { value: Math.min(v, a.target), target: a.target, text: a.fmt(Math.min(v, a.target)) + ' / ' + a.fmt(a.target) }; }
  /* Celdas de exploración (~10 km) de un trazado. */
  function cellsOf(points) { var out = {}; for (var i = 0; i < points.length; i += 5) { out[Math.floor(points[i][1] * 10) + '_' + Math.floor(points[i][2] * 10)] = 1; } return Object.keys(out); }
  return { LIST: LIST, LEVELS: LEVELS, CATS: CATS, computeContext: computeContext, evaluate: evaluate, xpOf: xpOf, levelOf: levelOf, progress: progress, cellsOf: cellsOf };
})();
if (typeof module !== 'undefined') module.exports = Achievements;
