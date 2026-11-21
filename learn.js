// gnARly lessons: tap-to-play clips + interactive widgets tied to the compass-gait model (sim.js).
import { defaultParams, withLegLength, findGait, swingPendulumPeriod, Runner, G } from './sim.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const deg = Math.PI / 180;

// ---------- device + service worker ----------
const qa = document.createElement('a');
const isIOS = (qa.relList && qa.relList.supports && qa.relList.supports('ar')) || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (!isIOS) document.body.classList.add('not-ios');
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

// ---------- clips: YouTube player loads only when tapped (keeps pages light and offline-safe) ----------
$$('.clip[data-yt]').forEach((el) => {
  const b = el.querySelector('button');
  b.addEventListener('click', () => {
    const id = el.dataset.yt, s = el.dataset.start || 0, e = el.dataset.end;
    const q = new URLSearchParams({ start: s, autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1' });
    if (e) q.set('end', e);
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${id}?${q}`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true; f.title = el.dataset.title || 'Xobotix video';
    el.innerHTML = ''; el.appendChild(f);
  });
});

// ---------- canvas helper ----------
function canvas2d(c, aspect) {
  const ctx = c.getContext('2d');
  const fit = () => {
    const w = c.clientWidth || 320;
    let h = Math.round(w / aspect);
    const maxH = Math.max(160, innerHeight * (matchMedia('(orientation: landscape) and (max-height: 600px)').matches ? 0.62 : 0.5));
    if (h > maxH) h = maxH;
    c.style.height = h + 'px';
    const r = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
    c._w = w; c._h = h;
  };
  fit();
  addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250));
  return ctx;
}
const bindRange = (id, fmt, on) => {
  const el = document.getElementById(id), out = document.getElementById(id + '-v');
  const upd = () => { out.textContent = fmt(+el.value); on && on(+el.value); };
  el.addEventListener('input', upd); upd(); return el;
};
const visible = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

// ---------- Lesson 1: driven oscillator (linear vs hardening spring, fixed-frequency vs phase-locked drive) ----------
function wOscillator(root) {
  const c = $('canvas', root), ctx = canvas2d(c, 1.6);
  let r = 1, beta = 0, F = 0.08, mode = 'fixed';
  const z = 0.04; // damping ratio
  let x = 0, v = 0, t = 0, ph = 0, trace = [], lastCross = null, freq = 0, ampMax = 0, ampDecay = 0;
  bindRange('osc-r', (a) => a.toFixed(2) + ' × ω₀', (a) => { r = a; });
  bindRange('osc-f', (a) => (a * 100).toFixed(0) + '%', (a) => { F = a; });
  const hb = $('#osc-hard');
  hb.addEventListener('click', () => { beta = beta ? 0 : 1.5; hb.classList.toggle('on', !!beta); hb.textContent = beta ? 'Hardening spring: ON' : 'Hardening spring: OFF'; });
  $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; $$('[data-mode]', root).forEach((o) => o.classList.toggle('on', o === b)); }));
  $('#osc-reset').addEventListener('click', () => { x = 0.02; v = 0; trace = []; ampMax = 0; });
  // steady-state amplitude A(r) for x'' + 2 z x' + x + beta x^3 = F cos(r t)  (harmonic balance, all branches)
  function responsePts() {
    const pts = [];
    for (let i = 0; i <= 260; i++) {
      const rr = 0.3 + i * (2.2 / 260);
      // unknown u = A^2: [(1 - rr^2 + 0.75 beta u)^2 + (2 z rr)^2] u = F^2  -> cubic in u
      const k = 0.75 * beta, d = 1 - rr * rr, e = (2 * z * rr) ** 2;
      const roots = [];
      if (k === 0) roots.push(F * F / (d * d + e));
      else {
        // k^2 u^3 + 2 d k u^2 + (d^2 + e) u - F^2 = 0 ; scan + bisection
        const f = (u) => k * k * u ** 3 + 2 * d * k * u * u + (d * d + e) * u - F * F;
        let prev = f(0), pu = 0;
        for (let j = 1; j <= 400; j++) { const u = (j / 400) ** 2 * 4; const fu = f(u); if (prev === 0 || prev * fu < 0) { let lo = pu, hi = u; for (let q = 0; q < 40; q++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0) ? hi = m : lo = m; } roots.push((lo + hi) / 2); } prev = fu; pu = u; }
      }
      roots.forEach((u) => pts.push([rr, Math.sqrt(u)]));
    }
    return pts;
  }
  function frame() {
    requestAnimationFrame(frame);
    if (!visible(c)) return;
    const dt = 1 / 60 * 2.2, n = 40, h = dt / n;
    for (let i = 0; i < n; i++) {
      let force;
      if (mode === 'fixed') { force = F * Math.cos(ph); ph += r * h; }
      else { const s = Math.hypot(v, x) || 1; force = F * 1.2 * (v / s); } // drive in phase with velocity (phase-locked)
      const a = force - 2 * z * v - x - beta * x * x * x;
      v += a * h; x += v * h; t += h;
      if (lastCross !== null && x > 0 && x - v * h <= 0) { const T = t - lastCross; if (T > 0.5) freq = 2 * Math.PI / T; lastCross = t; } else if (lastCross === null && x > 0 && x - v * h <= 0) lastCross = t;
    }
    ampDecay = Math.max(Math.abs(x), ampDecay * 0.995);
    trace.push(x); if (trace.length > 360) trace.shift();
    const W = c._w, H = c._h; ctx.clearRect(0, 0, W, H);
    // left: response curve; right: animated mass
    const pw = W * 0.62, ph2 = H, pad = 26;
    const pts = responsePts();
    const amax = Math.max(1.2, ...pts.map((p) => p[1])) * 1.05;
    const X = (rr) => pad + (rr - 0.3) / 2.2 * (pw - pad - 8), Y = (A) => ph2 - pad - A / amax * (ph2 - pad - 10);
    ctx.strokeStyle = '#24356c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, 8); ctx.lineTo(pad, ph2 - pad); ctx.lineTo(pw - 6, ph2 - pad); ctx.stroke();
    ctx.fillStyle = '#9aa9cf'; ctx.font = '11px system-ui'; ctx.fillText('drive frequency / natural frequency', pad + 4, ph2 - 8); ctx.save(); ctx.translate(11, ph2 / 2 + 30); ctx.rotate(-Math.PI / 2); ctx.fillText('amplitude', 0, 0); ctx.restore();
    ctx.fillStyle = beta ? '#ffc94d' : '#7fb0ff'; pts.forEach((p) => ctx.fillRect(X(p[0]) - 1, Y(p[1]) - 1, 2.2, 2.2));
    ctx.strokeStyle = 'rgba(255,95,184,.7)'; ctx.setLineDash([4, 4]); const rx = mode === 'fixed' ? r : Math.min(2.5, freq || 1); ctx.beginPath(); ctx.moveTo(X(rx), 8); ctx.lineTo(X(rx), ph2 - pad); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ff5fb8'; ctx.beginPath(); ctx.arc(X(rx), Y(ampDecay), 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfd9f7'; ctx.fillText('1.0', X(1) - 8, ph2 - pad + 13);
    // mass on spring
    const cx = pw + (W - pw) / 2, top = 14, scale = (H * 0.32) / amax, y0 = H * 0.55 + x * scale;
    ctx.strokeStyle = '#9aa9cf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 30, top); ctx.lineTo(cx + 30, top); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, top); const coils = 12; for (let i = 1; i <= coils; i++) ctx.lineTo(cx + (i % 2 ? 12 : -12), top + (y0 - 22 - top) * i / coils); ctx.lineTo(cx, y0 - 22); ctx.stroke();
    ctx.fillStyle = beta ? '#ffc94d' : '#2f7bff'; ctx.fillRect(cx - 22, y0 - 22, 44, 44);
    $('#osc-amp').textContent = ampDecay.toFixed(2);
    $('#osc-freq').textContent = freq ? (freq).toFixed(2) + ' × ω₀' : '…';
    $('#osc-energy').textContent = mode === 'fixed' ? 'fixed frequency' : 'phase-locked';
  }
  x = 0.02; frame();
}

// ---------- Lesson 1b: your walker's rhythm (pendulum vs step time from the gait solver) ----------
function wRhythm(root) {
  const out = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  let timer;
  bindRange('rh-l', (v) => (v * 100).toFixed(0) + ' cm', (l) => {
    clearTimeout(timer); timer = setTimeout(() => {
      const p = withLegLength(defaultParams(), l);
      const g = findGait(p);
      const Tp = swingPendulumPeriod(p);
      if (!g.ok) { out('rh-step', '—'); return; }
      out('rh-pend', (Tp / 2).toFixed(3) + ' s'); out('rh-step', g.period.toFixed(3) + ' s');
      out('rh-match', Math.round(100 * Math.min(g.period, Tp / 2) / Math.max(g.period, Tp / 2)) + '%');
      out('rh-hz', (1 / g.period).toFixed(2) + ' Hz');
    }, 60);
  });
}

// ---------- Lesson 2: rimless wheel ----------
function wRimless(root) {
  const c = $('canvas', root), ctx = canvas2d(c, 1.7);
  let N = 8, gam = 6 * deg; const l = 1;
  let phi, w, x0 = 0, steps = 0, lost = 0, ss = null, stuck = false, trail = [];
  const alpha = () => Math.PI / N;
  function analytic() {
    const a = alpha(), cc = Math.cos(2 * a);
    const K = 4 * G / l * Math.sin(gam) * Math.sin(a);
    const wm2 = K / (1 - cc * cc); const wp = cc * Math.sqrt(wm2);
    const need = 2 * G / l * (1 - Math.cos(gam - a)); // energy to vault over vertical
    return { wm: Math.sqrt(wm2), wp, ok: wp * wp > need, loss: 1 - cc * cc, stepLen: 2 * l * Math.sin(a) };
  }
  function reset() { const a = analytic(); phi = gam - alpha(); w = Math.max(a.ok ? a.wp : 0, 1.2); x0 = 0; steps = 0; stuck = false; trail = []; }
  bindRange('rw-n', (v) => v + ' spokes', (v) => { N = v; reset(); });
  bindRange('rw-g', (v) => v.toFixed(1) + '°', (v) => { gam = v * deg; reset(); });
  $('#rw-kick').addEventListener('click', () => { w *= 1.6; });
  function frame() {
    requestAnimationFrame(frame);
    if (!visible(c)) return;
    const dt = 1 / 60, n = 20, h = dt / n;
    for (let i = 0; i < n && !stuck; i++) {
      w += G / l * Math.sin(phi) * h; phi += w * h;
      if (phi >= gam + alpha()) { w *= Math.cos(2 * alpha()); phi = gam - alpha(); x0 += 2 * l * Math.sin(alpha()); steps++; }
      if (w < 0 && phi < gam - alpha() + 1e-3) { stuck = true; w = 0; }
    }
    const a = analytic();
    const W = c._w, H = c._h; ctx.clearRect(0, 0, W, H);
    const s = H / 3.2; // px per m
    const foot = [x0 * Math.cos(gam), -x0 * Math.sin(gam)];
    const hubW = [foot[0] + l * Math.sin(phi), foot[1] + l * Math.cos(phi)];
    const ox = W * 0.45 - hubW[0] * s, oy = H * 0.36 + hubW[1] * s;
    const S = (q) => [ox + q[0] * s, oy - q[1] * s];
    const yS = (X) => -X * Math.tan(gam);
    ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(...S([hubW[0] - 5, yS(hubW[0] - 5) - 0.02])); ctx.lineTo(...S([hubW[0] + 5, yS(hubW[0] + 5) - 0.02])); ctx.stroke();
    const hub = S(hubW); ctx.lineCap = 'round';
    for (let k = 0; k < N; k++) {
      const ang = phi + Math.PI + k * 2 * alpha();
      const tip = S([hubW[0] + l * Math.sin(ang), hubW[1] + l * Math.cos(ang)]);
      ctx.strokeStyle = k === 0 ? '#ff5fb8' : '#d62828'; ctx.lineWidth = k === 0 ? 6 : 4; ctx.beginPath(); ctx.moveTo(...hub); ctx.lineTo(...tip); ctx.stroke();
    }
    ctx.fillStyle = '#1f4fd8'; ctx.beginPath(); ctx.arc(...hub, 9, 0, 7); ctx.fill();
    $('#rw-loss').textContent = Math.round(a.loss * 100) + '%';
    $('#rw-step').textContent = (a.stepLen * 100).toFixed(0) + ' cm';
    $('#rw-ss').textContent = a.ok ? a.wp.toFixed(2) + ' rad/s' : 'stops';
    $('#rw-state').innerHTML = stuck ? '<span class="status-bad">Stopped: not enough slope for this many-spoke impact loss</span>' : `<span class="status-ok">Rolling · ${steps} steps</span>`;
  }
  reset(); frame();
}

// ---------- 2D compass-gait animation (shared by lessons 3 and 5) ----------
function gaitCanvas(c, getRunner) {
  const ctx = canvas2d(c, 1.7);
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const R = getRunner(); if (!R || !visible(c)) return;
    R.advance(dt * 0.6);
    const W = c._w, H = c._h; ctx.clearRect(0, 0, W, H);
    const p = R.p, gam = p.gammaDeg * deg, s = H / (p.l * 2.6);
    const [t1, t2] = R.s; const f = R.foot;
    const hip = [f[0] + p.l * Math.sin(t1), f[1] + p.l * Math.cos(t1)];
    const sw = [hip[0] - p.l * Math.sin(t2), hip[1] - p.l * Math.cos(t2)];
    const ox = W * 0.45 - hip[0] * s, oy = H * 0.3 + hip[1] * s;
    const S = (q) => [ox + q[0] * s, oy - q[1] * s];
    // slope line through world origin direction (cos gam, -sin gam)
    ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = 6; ctx.beginPath();
    const yS = (X) => f[1] - (X - f[0]) * Math.tan(gam), L = 3 * p.l;
    ctx.moveTo(...S([hip[0] - L, yS(hip[0] - L) - 0.004])); ctx.lineTo(...S([hip[0] + L, yS(hip[0] + L) - 0.004])); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#d62828'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(...S(f)); ctx.lineTo(...S(hip)); ctx.stroke();
    ctx.strokeStyle = '#ff7a7a'; ctx.beginPath(); ctx.moveTo(...S(sw)); ctx.lineTo(...S(hip)); ctx.stroke();
    ctx.fillStyle = '#1f4fd8'; ctx.beginPath(); ctx.arc(...S(hip), 9, 0, 7); ctx.fill();
    if (R.fell) { ctx.fillStyle = '#ff8a8a'; ctx.font = '600 15px system-ui'; ctx.fillText('Fell. Tap "Release" to try again.', 12, 22); }
  }
  requestAnimationFrame(frame);
}

// ---------- Lesson 3: slope → stability (Poincaré eigenvalue), with live walker ----------
function wSlope(root) {
  const plot = $('#sl-plot'), pctx = canvas2d(plot, 2.4);
  let runner = null, curve = [], gam = 3.0, cache = new Map();
  gaitCanvas($('#sl-walk'), () => runner);
  function gaitAt(gd, guess) {
    const key = gd.toFixed(2); if (cache.has(key)) return cache.get(key);
    const p = { ...defaultParams(), gammaDeg: gd }; const g = findGait(p, guess); g.p = p; cache.set(key, g); return g;
  }
  function release() {
    let g = gaitAt(gam, nearestGuess(gam));
    const p = { ...defaultParams(), gammaDeg: gam };
    if (g.ok) runner = new Runner(p, g.state);
    else { const g3 = gaitAt(3.0); runner = new Runner(p, g3.state); }
    const rd = (id, v) => { $(id).textContent = v; };
    rd('#sl-rho', g.ok ? g.rho.toFixed(2) : '—'); rd('#sl-T', g.ok ? g.period.toFixed(3) + ' s' : '—'); rd('#sl-len', g.ok ? (g.stepLength * 100).toFixed(1) + ' cm' : '—');
    $('#sl-verdict').innerHTML = !g.ok ? '<span class="status-bad">No period-1 gait here</span>' : g.stable ? '<span class="status-ok">Stable: disturbances die out</span>' : '<span class="status-bad">Unstable period-1 gait: expect period doubling, chaos or a fall</span>';
    drawPlot();
  }
  function nearestGuess(gd) { let best = null, bd = 1e9; curve.forEach((c) => { if (c.ok && Math.abs(c.g - gd) < bd) { bd = Math.abs(c.g - gd); best = c.x; } }); return best || undefined; }
  function drawPlot() {
    const W = plot._w, H = plot._h, pad = 28; pctx.clearRect(0, 0, W, H);
    const X = (g) => pad + (g - 0.5) / 5.0 * (W - pad - 8), Y = (r) => H - 20 - Math.min(r, 1.6) / 1.6 * (H - 30);
    pctx.fillStyle = 'rgba(125,255,176,.08)'; pctx.fillRect(pad, Y(1), W - pad - 8, Y(0) - Y(1));
    pctx.strokeStyle = '#24356c'; pctx.beginPath(); pctx.moveTo(pad, 6); pctx.lineTo(pad, H - 20); pctx.lineTo(W - 6, H - 20); pctx.stroke();
    pctx.strokeStyle = '#ffc94d'; pctx.setLineDash([5, 4]); pctx.beginPath(); pctx.moveTo(pad, Y(1)); pctx.lineTo(W - 6, Y(1)); pctx.stroke(); pctx.setLineDash([]);
    pctx.fillStyle = '#9aa9cf'; pctx.font = '11px system-ui'; pctx.fillText('|λ| = 1', W - 50, Y(1) - 4); pctx.fillText('ramp angle (deg) →', W - 120, H - 6); pctx.fillText('|λ|', 4, 14);
    [1, 2, 3, 4, 5].forEach((g) => pctx.fillText(g, X(g) - 3, H - 6));
    pctx.strokeStyle = '#7fb0ff'; pctx.lineWidth = 2; pctx.beginPath(); let on = false;
    curve.forEach((c) => { if (!c.ok) { on = false; return; } const q = [X(c.g), Y(c.rho)]; on ? pctx.lineTo(...q) : pctx.moveTo(...q); on = true; }); pctx.stroke();
    pctx.fillStyle = '#ff5fb8'; const cur = cache.get(gam.toFixed(2)); if (cur && cur.ok) { pctx.beginPath(); pctx.arc(X(gam), Y(cur.rho), 5, 0, 7); pctx.fill(); }
    pctx.strokeStyle = 'rgba(255,95,184,.6)'; pctx.beginPath(); pctx.moveTo(X(gam), 6); pctx.lineTo(X(gam), H - 20); pctx.stroke();
  }
  // continuation sweep 1.0 → 5.4 deg, computed in small chunks so the page stays responsive
  let gd = 1.0, guess;
  (function sweep() {
    for (let k = 0; k < 2 && gd <= 5.41; k++, gd += 0.1) {
      const g = gaitAt(+gd.toFixed(2), guess); curve.push({ g: +gd.toFixed(2), ok: g.ok, rho: g.rho, x: g.x }); if (g.ok) guess = g.x;
    }
    drawPlot();
    if (gd <= 5.41) setTimeout(sweep, 0); else $('#sl-sweep').textContent = 'Curve: compass-gait model, l = 25 cm, mh/m = 2.';
  })();
  bindRange('sl-g', (v) => v.toFixed(1) + '°', (v) => { gam = +v.toFixed(1); });
  $('#sl-g').addEventListener('change', release);
  $('#sl-release').addEventListener('click', release);
  $('#sl-push').addEventListener('click', () => { if (runner && !runner.fell) { runner.s[2] *= 1.12; runner.s[3] *= 0.9; } });
  $$('[data-g]', root).forEach((b) => b.addEventListener('click', () => { $('#sl-g').value = b.dataset.g; $('#sl-g').dispatchEvent(new Event('input')); release(); }));
  release();
}

// ---------- Lesson 4: dimensionless velocity ----------
function wFroude(root) {
  const presets = { you: [0.9, 2.0], bolt: [1.0, 12.4], ostrich: [1.2, 13.4], xti: null, fastrunner: [0.038, 4.47] };
  let h = 0.9, v = 2.0;
  const hEl = bindRange('fr-h', (x) => (x * 100).toFixed(0) + ' cm', (x) => { h = x; upd(); });
  const vEl = bindRange('fr-v', (x) => x.toFixed(2) + ' m/s (' + (x * 2.237).toFixed(1) + ' mph)', (x) => { v = x; upd(); });
  function upd() {
    const vh = v / Math.sqrt(G * h);
    $('#fr-vhat').textContent = vh.toFixed(2);
    $('#fr-fr').textContent = (vh * vh).toFixed(2);
    $('#fr-unit').textContent = (Math.sqrt(G * h) * 2.237).toFixed(1) + ' mph';
    $('#fr-feel').textContent = vh < 0.5 ? 'a stroll' : vh < 1 ? 'brisk walk; walking ends near v̂ = 1' : vh < 2 ? 'a jog' : vh < 3 ? 'real running' : vh < 4 ? 'world-class sprint' : 'faster than any human ("highway speed")';
  }
  $$('[data-pre]', root).forEach((b) => b.addEventListener('click', () => {
    let pv = presets[b.dataset.pre];
    if (b.dataset.pre === 'xti') { const g = findGait(defaultParams()); pv = [0.25, g.ok ? g.stepLength / g.period : 0.3]; }
    hEl.value = pv[0]; vEl.value = Math.min(+vEl.max, pv[1]); hEl.dispatchEvent(new Event('input')); vEl.dispatchEvent(new Event('input'));
  }));
  upd();
}

// ---------- Lesson 5: scale your XTI print ----------
function wBuild(root) {
  let runner = null, timer;
  gaitCanvas($('#bd-walk'), () => runner);
  bindRange('bd-l', (v) => (v * 100).toFixed(0) + ' cm legs', (l) => {
    clearTimeout(timer); timer = setTimeout(() => {
      const p = { ...withLegLength(defaultParams(), l), gammaDeg: +$('#bd-g').value };
      const g = findGait(p);
      if (g.ok) { runner = new Runner(p, g.state); $('#bd-hz').textContent = (1 / g.period).toFixed(2) + ' Hz'; $('#bd-speed').textContent = (g.stepLength / g.period * 100).toFixed(0) + ' cm/s'; $('#bd-len').textContent = (g.stepLength * 100).toFixed(1) + ' cm'; $('#bd-ramp').textContent = (g.stepLength * 12 * 100 / 100).toFixed(2) + ' m'; $('#bd-ok').innerHTML = g.stable ? '<span class="status-ok">stable</span>' : '<span class="status-bad">unstable</span>'; }
      else { $('#bd-ok').innerHTML = '<span class="status-bad">no gait</span>'; }
    }, 80);
  });
  bindRange('bd-g', (v) => v.toFixed(1) + '°', () => $('#bd-l').dispatchEvent(new Event('input')));
}

const W = { oscillator: wOscillator, rhythm: wRhythm, rimless: wRimless, slope: wSlope, froude: wFroude, build: wBuild };
$$('[data-widget]').forEach((el) => { try { W[el.dataset.widget](el); } catch (e) { console.error(e); el.insertAdjacentHTML('beforeend', '<p class="status-bad">This interactive could not start on this device.</p>'); } });
window.__gnarlyLearn = { ready: true };
