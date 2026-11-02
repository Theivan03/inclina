// Calibración automática: móvil montado con 35° de inclinación hacia atrás y 6° girado, sin pulsar Cero.
// 1) Parado 3 s → debe obtener una referencia "auto-still" y marcar ~0°.
// 2) Arranca y rueda recto 8 s → referencia "auto-ride".
// 3) Curva mantenida de 30° → debe medir 30° ±3.
// Además se parte de una referencia manual MALA (10° torcida) para comprobar que rodando recto se corrige sola.
const LeanCore = require('../www/lean-core.js');
const G = LeanCore.G, D2R = Math.PI / 180;
function axes(tiltDeg, yawDeg) {
  const t = tilt(tiltDeg), y = yawDeg * D2R;
  // ejes del móvil en coordenadas de la moto [f, l, u]: pantalla hacia el piloto, inclinada hacia atrás y algo girada
  const X = [Math.sin(y), -Math.cos(y), 0];
  const Y = [Math.sin(t) * Math.cos(y), Math.sin(t) * Math.sin(y), Math.cos(t)];
  const Z = [-Math.cos(t) * Math.cos(y), -Math.cos(t) * Math.sin(y), Math.sin(t)];
  return { X, Y, Z };
}
function tilt(d) { return d * D2R; }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const noise = s => (Math.random() - 0.5) * 2 * s;

function run(label, badManual) {
  const A = axes(35, 6), toPhone = b => [dot(b, A.X), dot(b, A.Y), dot(b, A.Z)];
  const est = LeanCore.createEstimator();
  const events = [];
  est.setOnFrame(f => events.push(f.kind));
  if (badManual) { const Abad = axes(45, 6), tp = b => [dot(b, Abad.X), dot(b, Abad.Y), dot(b, Abad.Z)]; est.setFrame(LeanCore.buildFrame(tp([0, 0, G])), [0, 0, 0], 'manual'); }
  const plan = [[3, 0, 0], [8, 70, 0], [1.5, 70, 30], [6, 70, 30], [1.5, 70, 0], [4, 70, 0]];
  const dt = 1 / 60; let t = 0, phi = 0, errs = [], stillPhi = null, straightPhi = [];
  for (const [dur, vKmh, target] of plan) {
    const v = vKmh / 3.6, n = Math.round(dur / dt);
    for (let i = 0; i < n; i++) {
      const prev = phi; phi += (target - phi) * Math.min(1, dt / 0.5);
      const p = (phi - prev) / dt, r = v > 0.5 ? -(G * Math.tan(phi * D2R) / v) / D2R : 0;
      const aBody = v > 0.5 ? [0.15 * Math.sin(t / 3), 0, G / Math.cos(phi * D2R)] : [0, G * Math.sin(phi * D2R), G * Math.cos(phi * D2R)]; // ligera aceleración/frenada alterna en marcha
      const acc = toPhone(aBody).map(x => x + noise(0.35));
      const rot = toPhone([p, 0, r]).map(x => x + noise(1.2) + 0.4); // sesgo de 0,4 °/s
      est.setSpeed(vKmh > 0 ? v : 0, t * 1000);
      const s = est.update(acc, rot, dt, t * 1000);
      if (t > 2.5 && t < 3 && s.ready) stillPhi = s.phi;
      if (t > 9 && t < 11) straightPhi.push(s.phi);
      if (t > 14 && t < 18.5) errs.push(Math.abs(s.phi - phi));
      t += dt;
    }
  }
  const st = est.state, worst = Math.max(...errs), straightMean = straightPhi.reduce((a, b) => a + b, 0) / straightPhi.length;
  const ok = st.ready && Math.abs(stillPhi == null ? 99 : stillPhi) < 3 && Math.abs(straightMean) < 2 && worst < 3.5 && events.indexOf('auto-ride') >= 0;
  console.log(`${label.padEnd(36)} parado: ${stillPhi == null ? 'sin ref' : stillPhi.toFixed(1) + '°'} · recta: ${straightMean.toFixed(1)}° · error máx en curva 30°: ${worst.toFixed(1)}° · referencias: ${events.join(' → ') || '—'} (${st.frameKind}) ${ok ? 'OK' : 'FALLO'}`);
  return ok;
}
let all = true;
all &= run('sin calibrar, móvil torcido', false);
all &= run('con Cero mal hecho (10° torcido)', true);
console.log(all ? '\nOK' : '\nFALLO'); process.exit(all ? 0 : 1);
