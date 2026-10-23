// Latencia: móvil en la mano (parado), se inclina 30° a la derecha en 0,3 s.
// Se prueba con el giróscopo normal, con el signo invertido y en rad/s. En los tres casos
// el estimador debe estar a menos de 3° del valor real medio segundo después del movimiento.
const LeanCore = require('../www/lean-core.js');
const G = LeanCore.G, D2R = Math.PI / 180;
const tilt = 30 * D2R;
const X = [0, -1, 0], Y = [Math.sin(tilt), 0, Math.cos(tilt)], Z = [-Math.cos(tilt), 0, Math.sin(tilt)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toPhone = b => [dot(b, X), dot(b, Y), dot(b, Z)];
const noise = s => (Math.random() - 0.5) * 2 * s;

function run(label, gyroSign, gyroScale, learnFirst, maxS) {
  maxS = maxS || 0.5;
  const est = LeanCore.createEstimator();
  const up = toPhone([0, 0, G]);
  est.setFrame(LeanCore.buildFrame(up), [0, 0, 0]);
  const dt = 1 / 60;
  let t = 0, phi = 0, target = 0, worstAfterSettle = 0, firstWithin3 = null, moveStart = null;
  // Fase opcional de aprendizaje: 3 s balanceando el móvil ±20° (lo que hace cualquiera al probarlo)
  const plan = learnFirst ? [[3, 'wobble'], [1, 0], [0.3, 30], [1.5, 30], [0.3, 0], [1, 0]] : [[1, 0], [0.3, 30], [1.5, 30], [0.3, 0], [1, 0]];
  for (const [dur, tg] of plan) {
    const n = Math.round(dur / dt);
    for (let i = 0; i < n; i++) {
      const prev = phi;
      if (tg === 'wobble') phi = 20 * Math.sin(2 * Math.PI * 0.7 * t);
      else { target = tg; phi += (target - phi) * Math.min(1, dt / 0.08); }
      const p = (phi - prev) / dt;
      const aBody = [0, G * Math.sin(phi * D2R), G * Math.cos(phi * D2R)];
      const acc = toPhone(aBody).map(x => x + noise(0.4));
      const rot = toPhone([p, 0, 0]).map(x => (x + noise(1.0)) * gyroSign * gyroScale);
      est.setSpeed(0, t * 1000);
      const s = est.update(acc, rot, dt, t * 1000);
      if (tg === 30) {
        if (moveStart == null) moveStart = t;
        if (firstWithin3 == null && Math.abs(s.phi - 30) < 3) firstWithin3 = t - moveStart;
        if (t - moveStart > 0.5) worstAfterSettle = Math.max(worstAfterSettle, Math.abs(s.phi - phi));
      }
      t += dt;
    }
  }
  const st = est.state;
  const ok = firstWithin3 != null && firstWithin3 < maxS && worstAfterSettle < (maxS > 0.5 ? 6 : 3);
  console.log(`${label.padEnd(34)} a 3° del real en ${firstWithin3 == null ? '  --' : (firstWithin3 * 1000).toFixed(0).padStart(4)} ms · error tras 0,5 s ${worstAfterSettle.toFixed(1)}° · ganancia aprendida ${st.gain.toFixed(2)} (conf ${st.gainConf.toFixed(2)}) ${ok ? 'OK' : 'FALLO'}`);
  return ok;
}

let all = true;
all &= run('giróscopo normal (°/s)', 1, 1, false);
all &= run('signo invertido, primer movimiento', -1, 1, false, 1.0); // una sola vez: aprende el signo durante ese movimiento
all &= run('signo invertido, tras balancear 3 s', -1, 1, true);
all &= run('rad/s, tras balancear 3 s', 1, 1 / 57.2958, true);
all &= run('rad/s e invertido, tras balancear', -1, 1 / 57.2958, true);
console.log(all ? '\nOK' : '\nFALLO');
process.exit(all ? 0 : 1);
