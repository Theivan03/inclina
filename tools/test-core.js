// Simulación: móvil en vertical en la tija, pantalla hacia el piloto, inclinado 30° hacia atrás.
const LeanCore = require('../www/lean-core.js');
const G = LeanCore.G, D2R = Math.PI / 180;
const tilt = 30 * D2R;
// Ejes del móvil expresados en coordenadas de la moto [f, l, u]
const X = [0, -1, 0];                                  // derecha de la pantalla = derecha de la moto
const Y = [Math.sin(tilt), 0, Math.cos(tilt)];         // parte superior: arriba y algo adelante
const Z = [-Math.cos(tilt), 0, Math.sin(tilt)];        // normal de pantalla: hacia el piloto y algo arriba
const toPhone = b => [dot(b, X), dot(b, Y), dot(b, Z)];
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// Escenario (t en s): tramos de [dur, velocidad km/h, ángulo objetivo °]
const plan = [
  [3, 0, 0],      // parado, calibración
  [3, 0, 10],     // parado, el piloto apoya la moto a la derecha 10°
  [3, 0, 0],
  [6, 60, 0],     // recta
  [2, 60, -30],   // entra a izquierda
  [5, 60, -30],   // curva mantenida 5 s
  [2, 60, 0],
  [4, 90, 0],
  [1.5, 70, 36],  // derecha rápida
  [4, 70, 36],
  [1.5, 70, 0],
  [3, 70, -20], [3, 70, 20], // chicane
  [4, 50, 0]
];
const est = LeanCore.createEstimator();
const det = LeanCore.createCornerDetector({ minPeak: 10 });
const dt = 1 / 60;
let t = 0, phi = 0, calibAcc = [0, 0, 0], calibRot = [0, 0, 0], nCal = 0, calibrated = false;
const noise = s => (Math.random() - 0.5) * 2 * s;
let log = [], worst = 0, stoppedLeanErr = 0;
for (const [dur, vKmh, target] of plan) {
  const v = vKmh / 3.6;
  const n = Math.round(dur / dt);
  for (let i = 0; i < n; i++) {
    const phiPrev = phi;
    phi += (target - phi) * Math.min(1, dt / 0.6);   // la moto se inclina con suavidad
    const p = (phi - phiPrev) / dt;                   // velocidad de balanceo °/s (+ derecha)
    const r = v > 0.5 ? -(G * Math.tan(phi * D2R) / v) / D2R : 0; // guiñada °/s (+ izquierda)
    // fuerza específica en ejes de la moto
    let aBody;
    if (v > 0.5) aBody = [0, 0, G / Math.cos(phi * D2R)];           // curva coordinada: alineada con la moto
    else aBody = [0, G * Math.sin(phi * D2R), G * Math.cos(phi * D2R)]; // parado: solo gravedad
    // vector de giro en ejes de la moto: balanceo sobre f, guiñada sobre u
    const wBody = [p, 0, r];
    const acc = toPhone(aBody).map(x => x + noise(0.6));
    const rot = toPhone(wBody).map(x => x + noise(1.5) + 0.3); // sesgo de 0,3 °/s
    const now = t * 1000;
    if (t < 2) { // calibración durante los 2 primeros segundos
      for (let k = 0; k < 3; k++) { calibAcc[k] += acc[k]; calibRot[k] += rot[k]; }
      nCal++;
    } else if (!calibrated) {
      const up = calibAcc.map(x => x / nCal), bias = calibRot.map(x => x / nCal);
      est.setFrame(LeanCore.buildFrame(up), bias);
      calibrated = true;
    } else {
      if (v > 0.5 && Math.floor(t) !== Math.floor(t - dt)) est.setSpeed(v, now - 800); // GPS a 1 Hz con 0,8 s de retraso
      if (v <= 0.5) est.setSpeed(0, now);
      const s = est.update(acc, rot, dt, now);
      const c = det.feed(s.phi, vKmh, now);
      if (c) log.push(`curva ${c.side} pico ${c.peak.toFixed(1)}° a ${c.vPeak} km/h, ${c.dur.toFixed(1)} s`);
      const err = Math.abs(s.phi - phi);
      if (vKmh > 0 && Math.abs(target - phi) < 1) worst = Math.max(worst, err);
      if (vKmh === 0 && Math.abs(target - phi) < 1 && t > 5) stoppedLeanErr = Math.max(stoppedLeanErr, err);
      if (i % 30 === 0) console.log(`t=${t.toFixed(1).padStart(5)} v=${vKmh.toString().padStart(3)} real=${phi.toFixed(1).padStart(6)} est=${s.phi.toFixed(1).padStart(6)} acc=${s.phiAcc.toFixed(1).padStart(6)} phys=${s.phiPhys == null ? '  --' : s.phiPhys.toFixed(1).padStart(6)} src=${s.source}`);
    }
    t += dt;
  }
}
det.flush(t * 1000);
console.log('\nCurvas detectadas:'); log.forEach(l => console.log('  ' + l));
console.log(`\nError máximo en curva mantenida (en marcha): ${worst.toFixed(2)}°`);
console.log(`Error máximo con la moto parada e inclinada: ${stoppedLeanErr.toFixed(2)}°`);
if (worst > 3 || stoppedLeanErr > 2) { console.log('FALLO: error demasiado grande'); process.exit(1); }
console.log('OK');
