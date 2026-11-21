// Compass-gait passive dynamic walker (Goswami et al. 1998 / McGeer 1990 family).
// Planar, two straight legs, point masses: hip mass mh, each leg mass m located
// a from the foot (= b from the hip), leg length l. Walks down a slope gamma.
// q = [th1 (stance), th2 (swing)], angles from vertical (gravity), positive = leaning
// downhill (+x). Stance foot at origin; hip = l(sin th1, cos th1);
// swing foot = hip - l(sin th2, cos th2). Heel strike: th1 + th2 - 2*gamma crosses 0 upward with th1 > th2 (swing foot ahead reaches the slope).
// Derivation of M, Coriolis and gravity terms is in docs/SCIENCE_MODEL.md.
//
// This is a teaching model, not a model of the real XTI walker (which has knees,
// elastic cords and 3D rocking). See README "Model limits".

export const G = 9.81;

export function defaultParams() {
  return {
    gammaDeg: 3.0,  // ramp angle (deg)
    l: 0.25,        // leg length (m) - tabletop scale; real XTI value TBD from David's STLs
    a: 0.125,       // foot -> leg center of mass (m)
    b: 0.125,       // hip -> leg center of mass (m)
    mh: 0.10,       // hip mass (kg)  (mass ratio mh/m = 2, Goswami's classic case)
    m: 0.05,        // each leg mass (kg)
  };
}

// Scale a/b with leg length so the "leg length" slider keeps proportions.
export function withLegLength(p, l) {
  const r = l / p.l;
  return { ...p, l, a: p.a * r, b: p.b * r };
}

function deriv(p, s) {
  const [t1, t2, w1, w2] = s;
  const { l, a, b, mh, m } = p;
  const c12 = Math.cos(t1 - t2), S = m * l * b * Math.sin(t1 - t2);
  const M11 = m * a * a + mh * l * l + m * l * l;
  const M12 = -m * l * b * c12;
  const M22 = m * b * b;
  const r1 = S * w2 * w2 + G * (m * a + mh * l + m * l) * Math.sin(t1);
  const r2 = -S * w1 * w1 - G * m * b * Math.sin(t2);
  const det = M11 * M22 - M12 * M12;
  return [w1, w2, (M22 * r1 - M12 * r2) / det, (-M12 * r1 + M11 * r2) / det];
}

export function rk4(p, s, h) {
  const k1 = deriv(p, s);
  const k2 = deriv(p, s.map((v, i) => v + 0.5 * h * k1[i]));
  const k3 = deriv(p, s.map((v, i) => v + 0.5 * h * k2[i]));
  const k4 = deriv(p, s.map((v, i) => v + h * k3[i]));
  return s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

// Point positions (stance foot at origin) and velocities for state s.
export function points(p, s) {
  const [t1, t2, w1, w2] = s;
  const { l, a, b } = p;
  const s1 = Math.sin(t1), c1 = Math.cos(t1), s2 = Math.sin(t2), c2 = Math.cos(t2);
  return {
    hip: [l * s1, l * c1], vhip: [l * c1 * w1, -l * s1 * w1],
    m1: [a * s1, a * c1], v1: [a * c1 * w1, -a * s1 * w1],
    m2: [l * s1 - b * s2, l * c1 - b * c2],
    v2: [l * c1 * w1 - b * c2 * w2, -l * s1 * w1 + b * s2 * w2],
    foot2: [l * (s1 - s2), l * (c1 - c2)],
  };
}

const cross = (r, v) => r[0] * v[1] - r[1] * v[0];
const sub = (u, v) => [u[0] - v[0], u[1] - v[1]];

// Heel-strike impact: conserve (1) whole-system angular momentum about the new
// stance foot and (2) the trailing leg's angular momentum about the hip.
export function impact(p, s) {
  const { m, mh } = p;
  const pre = points(p, s);
  const f = pre.foot2;
  const Ltot = m * cross(sub(pre.m1, f), pre.v1) + mh * cross(sub(pre.hip, f), pre.vhip) + m * cross(sub(pre.m2, f), pre.v2);
  const Lhip = m * cross(sub(pre.m1, pre.hip), pre.v1);
  const qn = [s[1], s[0]];
  const mom = (u) => {
    const P = points(p, [qn[0], qn[1], u[0], u[1]]); // new frame: new stance foot at origin
    const LT = m * cross(P.m1, P.v1) + mh * cross(P.hip, P.vhip) + m * cross(P.m2, P.v2);
    const LH = m * cross(sub(P.m2, P.hip), P.v2);
    return [LT, LH];
  };
  const A = mom([1, 0]), B = mom([0, 1]);
  const det = A[0] * B[1] - B[0] * A[1];
  const u1 = (Ltot * B[1] - B[0] * Lhip) / det;
  const u2 = (A[0] * Lhip - A[1] * Ltot) / det;
  return { state: [qn[0], qn[1], u1, u2], stepVec: f };
}

const MIN_SPLIT = 0.05; // ignore foot scuffing near mid-stance (rad)

// Integrate one full step from just-after-impact state. Returns post-impact
// state of next step, step time, or {fell:true}.
export function step(p, s0, h = 0.001, record = null) {
  const gam = (p.gammaDeg * Math.PI) / 180;
  let s = s0.slice(), t = 0;
  const g = (x) => x[0] + x[1] - 2 * gam;
  let prev = g(s);
  for (let i = 0; i < 6000; i++) {
    const sn = rk4(p, s, h);
    const gn = g(sn);
    if (record) record.push(sn);
    // fell: hip below ~ horizontal
    if (Math.abs(sn[0]) > 1.2) return { fell: true, t: t + h };
    if (prev < 0 && gn >= 0 && sn[0] - sn[1] > MIN_SPLIT) {
      // refine with linear interpolation
      const frac = prev / (prev - gn);
      let sh = s.map((v, k) => v + frac * (sn[k] - v));
      const r = impact(p, sh);
      return { state: r.state, t: t + frac * h, stepVec: r.stepVec };
    }
    prev = gn; s = sn; t += h;
  }
  return { fell: true, t };
}

// Poincare map on [th1, w1, w2] (th2 = 2*gamma - th1 right after impact is the
// switching surface constraint); we use the 3 free coordinates.
function P(p, x) {
  const gam = (p.gammaDeg * Math.PI) / 180;
  const s = [x[0], 2 * gam - x[0], x[1], x[2]];
  const r = step(p, s, 0.002);
  if (r.fell) return null;
  return [r.state[0], r.state[2], r.state[3]];
}

function solve3(A, bv) {
  const M = A.map((r, i) => [...r, bv[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[3] / r[i]);
}

function eig3abs(J) {
  // spectral radius via power-ish approach: characteristic polynomial roots
  const a = -(J[0][0] + J[1][1] + J[2][2]);
  const b = J[0][0] * J[1][1] - J[0][1] * J[1][0] + J[0][0] * J[2][2] - J[0][2] * J[2][0] + J[1][1] * J[2][2] - J[1][2] * J[2][1];
  const c = -(J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]));
  // roots of x^3 + a x^2 + b x + c via Durand-Kerner (complex)
  let z = [[0.4, 0.9], [-0.65, 0.72], [0.3, -0.5]];
  const mul = (u, v) => [u[0] * v[0] - u[1] * v[1], u[0] * v[1] + u[1] * v[0]];
  const div = (u, v) => { const d = v[0] * v[0] + v[1] * v[1]; return [(u[0] * v[0] + u[1] * v[1]) / d, (u[1] * v[0] - u[0] * v[1]) / d]; };
  const f = (x) => { const x2 = mul(x, x), x3 = mul(x2, x); return [x3[0] + a * x2[0] + b * x[0] + c, x3[1] + a * x2[1] + b * x[1]]; };
  for (let it = 0; it < 200; it++) z = z.map((zi, i) => { let d = [1, 0]; z.forEach((zj, j) => { if (j !== i) d = mul(d, [zi[0] - zj[0], zi[1] - zj[1]]); }); const q = div(f(zi), d); return [zi[0] - q[0], zi[1] - q[1]]; });
  return z.map((v) => Math.hypot(v[0], v[1]));
}

// Find the periodic gait (fixed point of the step-to-step map) by Newton's method.
// Returns {ok, x, state, period, stepLength, rho (max |eigenvalue|), stable, eig}
export function findGait(p, guess) {
  // default guess = the 1 m / 3 deg Goswami gait, velocities rescaled by sqrt(1/l)
  if (!guess) { const k = Math.sqrt(1 / p.l); guess = [-0.2187, 1.0924 * k, 0.3774 * k]; }
  let x = guess.slice();
  for (let it = 0; it < 30; it++) {
    const fx = P(p, x);
    if (!fx) return { ok: false };
    const r = fx.map((v, i) => v - x[i]);
    const err = Math.hypot(...r);
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const eps = 1e-6;
    for (let j = 0; j < 3; j++) {
      const xp = x.slice(); xp[j] += eps;
      const fp = P(p, xp); if (!fp) return { ok: false };
      for (let i = 0; i < 3; i++) J[i][j] = (fp[i] - fx[i]) / eps;
    }
    if (err < 1e-9) {
      const eig = eig3abs(J);
      const rho = Math.max(...eig);
      const gam = (p.gammaDeg * Math.PI) / 180;
      const state = [x[0], 2 * gam - x[0], x[1], x[2]];
      const r1 = step(p, state, 0.001);
      return { ok: true, x, state, period: r1.t, stepLength: Math.hypot(...r1.stepVec), rho, eig, stable: rho < 1 };
    }
    const A = J.map((row, i) => row.map((v, j) => v - (i === j ? 1 : 0)));
    const dx = solve3(A, r.map((v) => -v));
    let lam = 1; const nd = Math.hypot(...dx); if (nd > 0.2) lam = 0.2 / nd;
    x = x.map((v, i) => v + lam * dx[i]);
  }
  return { ok: false };
}

// Natural (small-swing) period of the free swing leg as a pendulum hanging from the hip.
export function swingPendulumPeriod(p) { return 2 * Math.PI * Math.sqrt(p.b / G); }

// Real-time runner used by the app: advances the walker with fixed substeps and
// handles heel strikes. Keeps a world-frame stance-foot position.
export class Runner {
  constructor(p, state) { this.reset(p, state); }
  reset(p, state) {
    this.p = { ...p };
    this.s = state.slice();
    this.t = 0;            // time since last heel strike
    this.steps = 0;
    this.foot = [0, 0];    // world x,y of stance foot
    this.fell = false;
    this.lastPeriod = null;
    this.history = [];     // [th_stance, w_stance] for phase portrait
    this.onStep = null;
  }
  get gamma() { return (this.p.gammaDeg * Math.PI) / 180; }
  advance(dt, h = 0.0005) {
    if (this.fell) return;
    const n = Math.max(1, Math.round(dt / h));
    const hh = dt / n;
    for (let i = 0; i < n; i++) {
      const g0 = this.s[0] + this.s[1] - 2 * this.gamma;
      const sn = rk4(this.p, this.s, hh);
      const g1 = sn[0] + sn[1] - 2 * this.gamma;
      if (Math.abs(sn[0]) > 1.2 || this.t > 4) { this.fell = true; this.s = sn; return; }
      if (g0 < 0 && g1 >= 0 && sn[0] - sn[1] > MIN_SPLIT) {
        const frac = g0 / (g0 - g1);
        const sh = this.s.map((v, k) => v + frac * (sn[k] - v));
        const r = impact(this.p, sh);
        this.foot = [this.foot[0] + r.stepVec[0], this.foot[1] + r.stepVec[1]];
        this.s = r.state;
        this.lastPeriod = this.t + frac * hh;
        this.t = 0; this.steps++;
        if (this.onStep) this.onStep(this);
      } else { this.s = sn; this.t += hh; }
      this.history.push([this.s[0], this.s[2]]);
      if (this.history.length > 4000) this.history.splice(0, 1000);
    }
  }
}
