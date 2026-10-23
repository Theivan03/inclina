/* Inclina — núcleo de cálculo del ángulo de inclinación.
   Sin DOM: se puede probar en Node. Convenciones:
   - Ejes del móvil (W3C DeviceMotion): x = derecha de la pantalla, y = parte superior, z = hacia el usuario.
   - acc: fuerza específica [x,y,z] en m/s² (en reposo apunta hacia ARRIBA, ~9,81 en el eje que mira al cielo).
   - rot: velocidad angular [beta, gamma, alpha] = giro sobre x, y, z (regla de la mano derecha).
     La unidad (°/s o rad/s) y el signo se aprenden solos comparando con el acelerómetro.
   - Ejes de la moto: f = adelante, l = izquierda, u = arriba. Ángulo positivo = tumbada a la DERECHA.
*/
var LeanCore = (function () {
  var G = 9.80665, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var v3 = {
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    norm: function (a) { return Math.hypot(a[0], a[1], a[2]); },
    scale: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    unit: function (a) { var n = Math.hypot(a[0], a[1], a[2]); return n > 1e-9 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]; }
  };

  /* Construye los ejes de la moto a partir del vector "arriba" medido con la moto vertical y parada.
     Supone que la pantalla mira al piloto: "adelante" es -z proyectado al plano horizontal.
     Si el móvil está casi tumbado (pantalla al cielo), la parte superior de la pantalla apunta adelante. */
  function buildFrame(upRaw) {
    var u = v3.unit(upRaw);
    var back = [0, 0, -1];
    var f = v3.sub(back, v3.scale(u, v3.dot(back, u)));
    if (v3.norm(f) < 0.35) {
      var top = [0, 1, 0];
      f = v3.sub(top, v3.scale(u, v3.dot(top, u)));
    }
    f = v3.unit(f);
    var l = v3.unit(v3.cross(u, f));
    return { u: u, f: f, l: l };
  }

  /* Estimador. El giróscopo se integra en cada muestra, así que la respuesta es inmediata.
     La deriva se corrige:
     - con la física de la curva (tan φ = v·ω/g) cuando hay velocidad GPS,
     - con el acelerómetro cuando no hay giro: rápido si la moto está parada (el acelerómetro es exacto),
       más lento en marcha (en recta vale, en curva se desactiva solo).
     Además aprende el signo y la unidad del giróscopo (°/s o rad/s) comparándolo con el acelerómetro
     mientras el móvil se mueve parado; así no depende de cómo lo reporte cada navegador. */
  function createEstimator(opts) {
    var o = {
      tauPhys: 0.8,        // s: hacia la estimación física (en marcha)
      tauAccStill: 0.25,   // s: hacia el acelerómetro con la moto parada
      tauAccUnknown: 0.5,  // s: idem sin dato de velocidad
      tauAccMoving: 1.0,   // s: idem en marcha y en recta
      vMinPhys: 4,         // m/s: velocidad mínima para fiarse de la física (~15 km/h)
      vStill: 1.0,         // m/s: por debajo, "parada"
      yawStill: 3,         // °/s: por debajo se considera que no hay giro
      rollStill: 12,       // °/s: por encima, la moto está cayendo o levantándose: solo giróscopo
      accTol: 1.2,         // m/s²: tolerancia de |a| ≈ g
      accTau: 0.08,        // s: filtro del acelerómetro
      gyroGain: 1,         // factor aprendido: ±1 (°/s) o ±57,3 (rad/s)
      invert: false
    };
    if (opts) for (var k in opts) if (opts.hasOwnProperty(k)) o[k] = opts[k];

    var frame = null, bias = [0, 0, 0], phi = 0, speed = null, speedAt = -1e9, accF = null;
    var learn = { sxy: 0, sxx: 0, syy: 0, lastPhiAcc: null, r: 0 };
    var onGain = null;
    var st = { phi: 0, phiAcc: 0, phiPhys: null, rollRate: 0, yawRate: 0, rollRaw: 0, source: 'gyro', ready: false, gain: o.gyroGain, gainConf: 0, speed: null };

    function setFrame(fr, b) { frame = fr; bias = b || [0, 0, 0]; phi = 0; accF = null; learn.lastPhiAcc = null; st.ready = !!fr; }
    function setSpeed(v, t) { speed = (v == null || isNaN(v)) ? null : v; speedAt = t; }
    function setInvert(inv) { o.invert = !!inv; }
    function setGain(g) { o.gyroGain = g; st.gain = g; }
    function setOnGain(f) { onGain = f; }
    function reset() { phi = 0; }

    function learnGain(pRaw, dPhiAcc, dt) {
      // Decaimiento lento para que lo aprendido se pueda revisar; sumas ponderadas por tiempo.
      var decay = Math.exp(-dt / 30);
      learn.sxy = learn.sxy * decay + pRaw * dPhiAcc * dt;
      learn.sxx = learn.sxx * decay + pRaw * pRaw * dt;
      learn.syy = learn.syy * decay + dPhiAcc * dPhiAcc * dt;
      if (learn.syy < 1500 || learn.sxx <= 0) return; // hace falta movimiento real (p. ej. 30°/s durante ~2 s)
      var r = learn.sxy / Math.sqrt(learn.sxx * learn.syy);
      learn.r = r; st.gainConf = Math.abs(r);
      if (Math.abs(r) < 0.75) return;
      var k = learn.sxy / learn.sxx;
      var g = (Math.abs(k) > 7.6 ? R2D : 1) * (k < 0 ? -1 : 1);
      if (g !== o.gyroGain) { setGain(g); learn.reseed = true; if (onGain) onGain(g); }
    }

    function update(acc, rot, dt, now) {
      if (!frame) return st;
      if (!(dt > 0)) dt = 0; if (dt > 0.25) dt = 0.25;
      var a = accF ? dt / (dt + o.accTau) : 1;
      if (acc) {
        if (!accF) accF = acc.slice();
        else { accF[0] += a * (acc[0] - accF[0]); accF[1] += a * (acc[1] - accF[1]); accF[2] += a * (acc[2] - accF[2]); }
      }
      var vFresh = speed != null && (now - speedAt) < 4000;
      var still = vFresh && speed < o.vStill;
      st.speed = vFresh ? speed : null;

      var phiAcc = 0, accMagOk = false;
      if (accF) {
        var au = v3.dot(accF, frame.u), al = v3.dot(accF, frame.l);
        phiAcc = Math.atan2(al, au) * R2D;
        accMagOk = Math.abs(v3.norm(accF) - G) < o.accTol;
      }
      var dPhiAcc = (learn.lastPhiAcc != null && dt > 0) ? (phiAcc - learn.lastPhiAcc) / dt : 0;
      learn.lastPhiAcc = accF ? phiAcc : null;

      var pRaw = 0, p = 0, r = 0, haveGyro = false;
      if (rot && !isNaN(rot[0])) {
        haveGyro = true;
        var w = [rot[0] - bias[0], rot[1] - bias[1], rot[2] - bias[2]];
        pRaw = v3.dot(w, frame.f);                // balanceo bruto, + = cae a la derecha (si el signo es el esperado)
        p = pRaw * o.gyroGain;
        r = v3.dot(w, frame.u) * o.gyroGain;      // guiñada, + = gira a la izquierda
        phi += p * dt;
        if (accMagOk && (still || !vFresh) && Math.abs(dPhiAcc) > 6 && dt > 0) learnGain(pRaw, dPhiAcc, dt);
        if (learn.reseed && accMagOk) { phi = phiAcc; learn.reseed = false; } // lo integrado hasta ahora iba con el signo/unidad antiguos
      }

      var phiPhys = null;
      if (vFresh && speed >= o.vMinPhys && haveGyro) phiPhys = -Math.atan(speed * r * D2R / G) * R2D;
      // El acelerómetro solo corrige cuando nada se mueve deprisa: en pleno movimiento su ángulo va con
      // retraso y tiraría del giróscopo hacia atrás (ese era el "tarda en llegar al valor").
      var accOk = accMagOk && Math.abs(r) < o.yawStill && (!haveGyro || Math.abs(p) < o.rollStill);

      var src = 'gyro';
      if (!haveGyro) { phi = phiAcc; src = 'acc-only'; }
      else if (phiPhys != null) { phi += Math.min(1, dt / o.tauPhys) * (phiPhys - phi); src = 'phys'; }
      else if (accOk) {
        var tau = still ? o.tauAccStill : (vFresh ? o.tauAccMoving : o.tauAccUnknown);
        phi += Math.min(1, dt / tau) * (phiAcc - phi); src = still ? 'acc-still' : 'acc';
      }
      if (phi > 89) phi = 89; if (phi < -89) phi = -89;

      var s = o.invert ? -1 : 1;
      st.phi = s * phi; st.phiAcc = s * phiAcc; st.phiPhys = phiPhys == null ? null : s * phiPhys;
      st.rollRate = s * p; st.yawRate = s * r; st.rollRaw = pRaw; st.source = src;
      return st;
    }
    return { setFrame: setFrame, setSpeed: setSpeed, setInvert: setInvert, setGain: setGain, setOnGain: setOnGain, update: update, reset: reset, state: st };
  }

  /* Detector de curvas: una curva empieza al pasar de "start" grados y acaba al bajar de "end"
     durante "hold" segundos. Si cambia de lado a mitad (chicane), cierra la curva y abre otra. */
  function createCornerDetector(opts) {
    var o = { start: 8, end: 5, hold: 0.7, minPeak: 10 };
    if (opts) for (var k in opts) if (opts.hasOwnProperty(k)) o[k] = opts[k];
    var cur = null, belowSince = null, out = [];
    function close(now) {
      if (!cur) return null;
      var c = cur; cur = null; belowSince = null;
      c.dur = (now - c.t0) / 1000;
      if (c.peak >= o.minPeak) { out.push(c); return c; }
      return null;
    }
    function feed(phi, speedKmh, now) {
      var a = Math.abs(phi), side = phi >= 0 ? 'D' : 'I';
      if (!cur) {
        if (a >= o.start) { cur = { t0: now, side: side, peak: a, v: speedKmh, vPeak: speedKmh, t: now }; belowSince = null; }
        return null;
      }
      if (side !== cur.side && a >= o.start) { var c = close(now); cur = { t0: now, side: side, peak: a, v: speedKmh, vPeak: speedKmh, t: now }; return c; }
      if (a > cur.peak) { cur.peak = a; cur.vPeak = speedKmh; cur.t = now; }
      if (a < o.end) { if (belowSince == null) belowSince = now; else if ((now - belowSince) / 1000 >= o.hold) return close(now); }
      else belowSince = null;
      return null;
    }
    function flush(now) { return close(now); }
    function setOptions(n) { for (var k in n) if (n.hasOwnProperty(k)) o[k] = n[k]; }
    return { feed: feed, flush: flush, setOptions: setOptions, corners: out, get current() { return cur; } };
  }

  return { G: G, v3: v3, buildFrame: buildFrame, createEstimator: createEstimator, createCornerDetector: createCornerDetector };
})();
if (typeof module !== 'undefined') module.exports = LeanCore;
