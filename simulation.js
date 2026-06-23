/* ==========================================================================
   Sun Motions Simulator  —  accessible HTML5 port of the NAAP/UNL Flash sim.

   BEHAVIOR is ported verbatim from the decompiled ActionScript (AS1):
     - Solar Position Functions.as  (sun RA/Dec, equation of time, sidereal time)
     - CelestialSphere.as + the "CS" helpers (3D orthographic projection of the
       celestial sphere onto the screen, great/small-circle drawing with
       front/back hemisphere splitting, line horizon clipping, object placement)
     - Simulation Master.as         (state, day/time/latitude properties, animation)
     - Analemma Curve.as            (figure-eight curve + nearest-day picking)

   PRESENTATION follows the KL-UNL foundation + WCAG 2.1 AA: native controls,
   a single render() driven by one state object, a live region with spoken units.

   All trig constants are copied exactly from the source. AS color ints are
   decimal RGB; AS alpha is 0-100 (divided by 100 here).
   ========================================================================== */

'use strict';

/* ----- shared angle constants (verbatim from the AS) ---------------------- */
const DEG = 0.017453292519943295;          // pi/180
const RAD2DEG = 57.29577951308232;         // 180/pi
const HR = 0.2617993877991494;             // pi/12  (radians per RA hour)
const RAD2HR = 3.819718634205488;          // 12/pi  (radians -> RA hours)
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const PI = 3.141592653589793;

function mod(n, m) { return ((n % m) + m) % m; }

/* AS Number.prototype.toFixed re-implementation (round-half-up), used so the
   on-screen numbers match the original byte-for-byte (// Numerical Formatting). */
function toFixedAS(value, digits) {
  const d = digits | 0;
  if (isNaN(value)) return 'NaN';
  let sign = '';
  let v = value;
  if (v < 0) { sign = '-'; v = -v; }
  let out;
  let n = Math.round(v * Math.pow(10, d));
  out = (n === 0) ? '0' : n.toString();
  if (d > 0) {
    let len = out.length;
    if (len <= d) {
      let pad = '';
      for (let i = 0; i < d + 1 - len; i++) pad += '0';
      out = pad + out;
      len = d + 1;
    }
    out = out.substr(0, len - d) + '.' + out.substr(len - d);
  }
  return sign + out;
}

/* ==========================================================================
   SOLAR POSITION FUNCTIONS  (verbatim from Solar Position Functions.as)
   ========================================================================== */
function getPositionAndEqnOfTime(day) {
  const sin = Math.sin, cos = Math.cos;
  const eot = -0.0000043796019 + 0.001830724 * cos(0.017214206 * day)
    - 0.032070267 * sin(0.017214206 * day) - 0.015952904 * cos(0.034428413 * day)
    - 0.04026479 * sin(0.034428413 * day) - 0.00044373354 * cos(0.051642619 * day)
    - 0.0013114725 * sin(0.051642619 * day) - 0.00064591583 * cos(0.068856825 * day)
    - 0.00070547099 * sin(0.068856825 * day);
  const lon = 0.01721421 * day - 1.3793799796 - eot;
  return {
    ra: mod(RAD2HR * lon, 24),
    dec: RAD2DEG * Math.atan2(sin(lon), 2.30644456403329),
    eqn: 229.1831180523293 * eot
  };
}
function getEqnOfTime(day) {
  const sin = Math.sin, cos = Math.cos;
  return -0.0000043796019 + 0.001830724 * cos(0.017214206 * day)
    - 0.032070267 * sin(0.017214206 * day) - 0.015952904 * cos(0.034428413 * day)
    - 0.04026479 * sin(0.034428413 * day) - 0.00044373354 * cos(0.051642619 * day)
    - 0.0013114725 * sin(0.051642619 * day) - 0.00064591583 * cos(0.068856825 * day)
    - 0.00070547099 * sin(0.068856825 * day);
}
function getPosition(day) {
  const sin = Math.sin, cos = Math.cos;
  const lon = 0.01721421 * day - 1.3793756 - 0.001830724 * cos(0.017214206 * day)
    + 0.032070267 * sin(0.017214206 * day) + 0.015952904 * cos(0.034428413 * day)
    + 0.04026479 * sin(0.034428413 * day) + 0.00044373354 * cos(0.051642619 * day)
    + 0.0013114725 * sin(0.051642619 * day) + 0.00064591583 * cos(0.068856825 * day)
    + 0.00070547099 * sin(0.068856825 * day);
  return { ra: mod(RAD2HR * lon, 24), dec: RAD2DEG * Math.atan2(sin(lon), 2.30644456403329) };
}
function getSiderealTime(day) {
  return 24 * mod(0.280464857844662 + 1.0027397260274 * day, 1);
}

/* ==========================================================================
   CELESTIAL SPHERE 3D ENGINE  (port of CelestialSphere.as + CS helpers)
   ========================================================================== */
const R = 175;          // sphere radius in stage units (size 350 -> _c.r 175)
const STAGE = 440;      // canvas logical size; sphere centered at STAGE/2
const CX = STAGE / 2, CY = STAGE / 2;

const sphere = {
  r: R, r2: R * R,
  theta: 0, phi: 0, lat: 0, sTime: 0,
  showUnder: true,
  c: {},                // matrix coefficients (a*, m*, b*) like AS _c

  /* doA(): screen projection from viewer theta/phi (3 CS Geometry doA) */
  doA() {
    const c = this.c, r = this.r;
    const ct = Math.cos(this.theta), st = Math.sin(this.theta);
    const cp = Math.cos(this.phi), sp = Math.sin(this.phi);
    c.a0 = -r * st;       c.a1 = r * ct;
    c.a3 = r * ct * sp;   c.a4 = r * st * sp;   c.a5 = -r * cp;
    c.a6 = r * ct * cp;   c.a7 = r * st * cp;   c.a8 = r * sp;
  },
  /* doM(): celestial<->world from latitude & sidereal time (doM) */
  doM() {
    const c = this.c;
    c.m2 = Math.cos(this.lat);
    c.m3 = Math.sin(this.sTime);
    c.m4 = -Math.cos(this.sTime);
    c.m8 = Math.sin(this.lat);
    c.m0 = c.m4 * c.m8;  c.m1 = -c.m3 * c.m8;
    c.m6 = -c.m2 * c.m4; c.m7 = c.m2 * c.m3;
  },
  /* doB(): combined celestial->screen (doB) */
  doB() {
    const c = this.c;
    c.b0 = c.a0 * c.m0 + c.a1 * c.m3;
    c.b1 = c.a0 * c.m1 + c.a1 * c.m4;
    c.b2 = c.a0 * c.m2;
    c.b3 = c.a3 * c.m0 + c.a4 * c.m3 + c.a5 * c.m6;
    c.b4 = c.a3 * c.m1 + c.a4 * c.m4 + c.a5 * c.m7;
    c.b5 = c.a3 * c.m2 + c.a5 * c.m8;
    c.b6 = c.a6 * c.m0 + c.a7 * c.m3 + c.a8 * c.m6;
    c.b7 = c.a6 * c.m1 + c.a7 * c.m4 + c.a8 * c.m7;
    c.b8 = c.a6 * c.m2 + c.a8 * c.m8;
  },
  recompute() { this.doA(); this.doM(); this.doB(); },

  setViewerAzimuth(az) { this.theta = mod(360 - az, 360) * DEG; },
  getViewerAzimuth() { return mod(360 - this.theta * RAD2DEG, 360); },
  setViewerAltitude(alt) {
    if (alt > 90) alt = 90; else if (alt < 5) alt = 5; // minViewerAltitude = 5
    this.phi = alt * DEG;
  },
  getViewerAltitude() { return this.phi * RAD2DEG; },
  setLatitude(deg) {
    if (deg > 90) deg = 90; else if (deg < -90) deg = -90;
    this.lat = deg * DEG;
  },
  setSiderealTime(hours) { this.sTime = mod(hours, 24) * HR; },

  /* parsePointInput: {az,alt[,r]} | {ra,dec[,r]} | {x,y,z,system} -> normalized */
  parsePoint(p) {
    let r, rr, out = {};
    if (p.az !== undefined && p.alt !== undefined) {
      out.sys = 0; r = (p.r !== undefined) ? p.r : 1;
      rr = r * Math.cos(p.alt * DEG);
      out.x = rr * Math.cos(p.az * DEG);
      out.y = rr * Math.sin(-p.az * DEG);
      out.z = r * Math.sin(p.alt * DEG);
      out.r = Math.abs(r);
    } else if (p.ra !== undefined && p.dec !== undefined) {
      out.sys = 1; r = (p.r !== undefined) ? p.r : 1;
      rr = r * Math.cos(p.dec * DEG);
      out.x = rr * Math.cos(p.ra * HR);
      out.y = rr * Math.sin(p.ra * HR);
      out.z = r * Math.sin(p.dec * DEG);
      out.r = Math.abs(r);
    } else {
      out.sys = (p.system === 'celestial') ? 1 : 0;
      out.x = p.x; out.y = p.y; out.z = p.z;
      out.r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (out.r < 1.000001 && out.r > 0.999999) out.r = 1;
    }
    return out;
  },
  WtoSz(p, sp) {
    const c = this.c;
    sp.x = p.x * c.a0 + p.y * c.a1;
    sp.y = p.x * c.a3 + p.y * c.a4 + p.z * c.a5;
    sp.z = p.x * c.a6 + p.y * c.a7 + p.z * c.a8;
  },
  CtoSz(p, sp) {
    const c = this.c;
    sp.x = p.x * c.b0 + p.y * c.b1 + p.z * c.b2;
    sp.y = p.x * c.b3 + p.y * c.b4 + p.z * c.b5;
    sp.z = p.x * c.b6 + p.y * c.b7 + p.z * c.b8;
  },
  CtoW(p, wp) {
    const c = this.c;
    wp.x = p.x * c.m0 + p.y * c.m1 + p.z * c.m2;
    wp.y = p.x * c.m3 + p.y * c.m4;
    wp.z = p.x * c.m6 + p.y * c.m7 + p.z * c.m8;
  },
  /* StoMH (3 CS Geometry): screen -> mod-horizon (alt,az radians) */
  StoMH(sp, hp) {
    let rr = Math.sqrt(sp.x * sp.x + sp.y * sp.y) / this.r;
    if (rr > 1) rr = 1;
    const c4 = Math.asin(rr);
    const c5 = Math.atan2(sp.x, -sp.y);
    if (this.phi === HALF_PI) {
      hp.alt = HALF_PI - c4; hp.az = this.theta + PI - c5;
    } else if (this.phi === -HALF_PI) {
      hp.alt = -HALF_PI + c4; hp.az = this.theta + c5;
    } else {
      const c8 = HALF_PI - this.phi;
      const c10 = Math.cos(c8), c9 = Math.sin(c8);
      const c12 = Math.cos(c4), c11 = Math.sin(c4);
      const c13 = c12 * c10 + c11 * c9 * Math.cos(c5);
      hp.alt = HALF_PI - Math.acos(c13);
      hp.az = this.theta + Math.atan2(c11 * Math.sin(c5), (c12 - c13 * c10) / c9);
    }
    hp.az = mod(hp.az, TWO_PI);
  },
  /* MHtoC: mod-horizon -> celestial (radians) */
  MHtoC(hp, cp) {
    const s8 = Math.sin(hp.alt), c2 = Math.cos(hp.alt);
    const s11 = Math.sin(hp.az), c7 = Math.cos(hp.az);
    const s3 = Math.sin(this.lat), c4 = Math.cos(this.lat);
    const c9 = c2 * s11;
    const c5 = s8 * c4 - c2 * s3 * c7;
    cp.ra = (c5 === 0) ? 0 : mod(this.sTime - Math.atan2(c9, c5), TWO_PI);
    cp.dec = Math.asin(s8 * s3 + c2 * c7 * c4);
  },
  /* screenToCelestial -> {ra (hours), dec (deg)} */
  screenToCelestial(sx, sy) {
    const hp = {}, cp = {};
    this.StoMH({ x: sx, y: sy }, hp);
    this.MHtoC(hp, cp);
    return { ra: cp.ra * RAD2HR, dec: cp.dec * RAD2DEG };
  },
  /* horizon alt/az of a celestial point {x,y,z,r} (pointToHorizon, sys 1) */
  celestialToHorizon(p) {
    const w = {};
    this.CtoW(p, w);
    let c = w.z / p.r;
    if (c < -1) c = -1; else if (c > 1) c = 1;
    return {
      az: mod(-RAD2DEG * Math.atan2(w.y, w.x), 360),
      alt: RAD2DEG * Math.asin(c)
    };
  }
};

/* ----- Circle (port of CSCirclesClass: doW + front/back arc split) -------- */
const MIN_STEP = 0.7853981633974483; // pi/4

class Circle {
  constructor(opts) {
    this.sys = 0; this.tilt = 0; this.beta = 0; this.lambda = 0;
    this.gS = 0; this.gE = 0;
    this.color = opts.color; this.alpha = opts.alpha; this.thick = opts.thickness;
    this.visible = true;
    this.w = {};
    if (opts.def) this.setParameters(opts.def);
  }
  setParameters(arg) {
    if (arg.az !== undefined && arg.alt !== undefined && arg.tilt !== undefined) {
      this.sys = 0;
      this._applyTiltLambda(arg.tilt, arg.alt);
      if (isFinite(arg.az)) this.beta = DEG * mod(-arg.az, 360);
    } else if (arg.ra !== undefined && arg.dec !== undefined && arg.tilt !== undefined) {
      this.sys = 1;
      this._applyTiltLambda(arg.tilt, arg.dec);
      if (isFinite(arg.ra)) this.beta = HR * mod(arg.ra, 24);
    }
    if (isFinite(arg.gammaStart)) this.gS = DEG * mod(arg.gammaStart, 360);
    if (isFinite(arg.gammaEnd)) this.gE = DEG * mod(arg.gammaEnd, 360);
    this.doW();
  }
  _applyTiltLambda(tilt, lam) {
    if (isFinite(tilt)) {
      this.tilt = tilt < 0 ? 0 : tilt > 180 ? PI : tilt * DEG;
    }
    if (isFinite(lam)) {
      this.lambda = lam < -90 ? -PI : lam > 90 ? PI : lam * DEG;
    }
  }
  /* setCircleParameters for the daily sun-declination circle (dec only) */
  setDec(dec) { this.lambda = dec < -90 ? -PI : dec > 90 ? PI : dec * DEG; this.doW(); }
  doW() {
    const sT = Math.sin(this.tilt), cT = Math.cos(this.tilt);
    const sB = Math.sin(this.beta), cB = Math.cos(this.beta);
    const cL = Math.cos(this.lambda), sL = Math.sin(this.lambda);
    const w = this.w;
    w.w0 = cL * cB;       w.w1 = -cL * sB * cT;  w.w2 = sL * sB * sT;
    w.w3 = cL * sB;       w.w4 = cL * cB * cT;   w.w5 = -sL * cB * sT;
    w.w7 = cL * sT;       w.w8 = sL * cT;
  }
  /* compute screen projection coefficients + split into front/back arcs */
  computeArcs() {
    const c = sphere.c, w = this.w;
    let v0, v1, v2, v3, v4, v5, v6, v7, v8;
    if (this.sys === 0) {
      v0 = c.a0 * w.w0 + c.a1 * w.w3;
      v1 = c.a0 * w.w1 + c.a1 * w.w4;
      v2 = c.a0 * w.w2 + c.a1 * w.w5;
      v3 = c.a3 * w.w0 + c.a4 * w.w3;
      v4 = c.a3 * w.w1 + c.a4 * w.w4 + c.a5 * w.w7;
      v5 = c.a3 * w.w2 + c.a4 * w.w5 + c.a5 * w.w8;
      v6 = c.a6 * w.w0 + c.a7 * w.w3;
      v7 = c.a6 * w.w1 + c.a7 * w.w4 + c.a8 * w.w7;
      v8 = c.a6 * w.w2 + c.a7 * w.w5 + c.a8 * w.w8;
    } else {
      v0 = c.b0 * w.w0 + c.b1 * w.w3;
      v1 = c.b0 * w.w1 + c.b1 * w.w4 + c.b2 * w.w7;
      v2 = c.b0 * w.w2 + c.b1 * w.w5 + c.b2 * w.w8;
      v3 = c.b3 * w.w0 + c.b4 * w.w3;
      v4 = c.b3 * w.w1 + c.b4 * w.w4 + c.b5 * w.w7;
      v5 = c.b3 * w.w2 + c.b4 * w.w5 + c.b5 * w.w8;
      v6 = c.b6 * w.w0 + c.b7 * w.w3;
      v7 = c.b6 * w.w1 + c.b7 * w.w4 + c.b8 * w.w7;
      v8 = c.b6 * w.w2 + c.b7 * w.w5 + c.b8 * w.w8;
    }
    this.v = { v0, v1, v2, v3, v4, v5 };
    const front = [], back = [];
    const m32 = Math.sqrt(v6 * v6 + v7 * v7);
    const gS = this.gS, gE = this.gE;
    if (m32 === 0) {
      if (v8 < 0) back.push([gS, gE]); else front.push([gS, gE]);
    } else {
      const t = -v8 / m32;
      if (t <= -1) front.push([gS, gE]);
      else if (t >= 1) back.push([gS, gE]);
      else {
        const asinT = Math.asin(t);
        const at2 = Math.atan2(v6, v7);
        let l28, l30;
        if (Math.cos(asinT) < 0) {
          l28 = mod(asinT - at2, TWO_PI); l30 = mod(PI - asinT - at2, TWO_PI);
        } else {
          l28 = mod(PI - asinT - at2, TWO_PI); l30 = mod(asinT - at2, TWO_PI);
        }
        if (gS === gE) {
          front.push([l30, l28]); back.push([l28, l30]);
        } else {
          const arr = [[l30, 0], [l28, 1], [gS, 2], [gE, 3]];
          arr.sort((a, b) => a[0] - b[0]);
          let inFront = true, inside = false;
          for (let i = 0; i < 4; i++) {
            const tp = arr[i][1];
            if (tp === 0) inFront = true; else if (tp === 1) inFront = false;
            else if (tp === 2) inside = true; else inside = false;
          }
          let prev = arr[3];
          for (let i = 0; i < 4; i++) {
            const cur = arr[i];
            if (inside && prev[0] !== cur[0]) {
              (inFront ? front : back).push([prev[0], cur[0]]);
            }
            const tp = cur[1];
            if (tp === 0) inFront = true; else if (tp === 1) inFront = false;
            else if (tp === 2) inside = true; else inside = false;
            prev = cur;
          }
        }
      }
    }
    return { front, back };
  }
}

/* drawArc: tessellate a parametric arc with quadratic curves (CSCircles drawArc) */
function pathArc(ctx, v, g1, g2) {
  if (g2 < g1) g2 += TWO_PI;
  let span = g2 - g1;
  if (span === 0) span = TWO_PI;
  const steps = Math.ceil(span / MIN_STEP);
  const seg = span / steps;
  const half = seg / 2;
  const sec = 1 / Math.cos(half);
  let cs = Math.cos(g1), sn = Math.sin(g1);
  ctx.moveTo(v.v0 * cs + v.v1 * sn + v.v2, v.v3 * cs + v.v4 * sn + v.v5);
  let a = g1 + seg, b = a - half;
  for (let k = 0; k < steps; k++) {
    cs = Math.cos(a); sn = Math.sin(a);
    const cc = sec * Math.cos(b), cd = sec * Math.sin(b);
    ctx.quadraticCurveTo(
      v.v0 * cc + v.v1 * cd + v.v2, v.v3 * cc + v.v4 * cd + v.v5,
      v.v0 * cs + v.v1 * sn + v.v2, v.v3 * cs + v.v4 * sn + v.v5);
    a += seg; b += seg;
  }
}

function strokeArcs(ctx, circle, arcs) {
  if (!arcs.length) return;
  ctx.beginPath();
  for (const [g1, g2] of arcs) pathArc(ctx, circle.v, g1, g2);
  ctx.lineWidth = Math.max(circle.thick, 1);
  ctx.strokeStyle = colorHex(circle.color);
  ctx.globalAlpha = circle.alpha / 100;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ----- Line (port of CSLinesClass.update: sphere + horizon clipping) ------ */
class Line {
  constructor(head, tail, color, alpha, thickness) {
    this.head = sphere.parsePoint(head);
    this.tail = sphere.parsePoint(tail);
    this.color = color; this.alpha = alpha; this.thick = thickness;
    this.visible = true;
  }
  segments() {
    const H = {}, T = {};
    (this.head.sys === 0 ? sphere.WtoSz : sphere.CtoSz).call(sphere, this.head, H);
    (this.tail.sys === 0 ? sphere.WtoSz : sphere.CtoSz).call(sphere, this.tail, T);
    const dx = H.x - T.x, dy = H.y - T.y, dz = H.z - T.z;
    const A = dx * dx + dy * dy + dz * dz;
    const B = 2 * (dx * T.x + dy * T.y + dz * T.z);
    const C = T.x * T.x + T.y * T.y + T.z * T.z;
    const r2 = sphere.r2, phi = sphere.phi;
    const ts = [];
    const disc = B * B - 4 * A * (C - r2);
    if (disc > 0) { const s = Math.sqrt(disc); ts.push((-B + s) / (2 * A)); ts.push((-B - s) / (2 * A)); }
    let m;
    if (phi > -HALF_PI && phi < HALF_PI) {
      m = Math.tan(phi);
      if (dy !== m * dz) ts.push((m * T.z - T.y) / (dy - m * dz));
      if (dz !== 0) { const u = -T.z / dz; if (u * (u * A + B) + C >= r2) ts.push(u); }
    } else if (dz !== 0) ts.push(-T.z / dz);
    const bounds = [0, 1];
    for (const t of ts) {
      if (t > 0 && t < 1) { let j = 1; while (t > bounds[j]) j++; if (t !== bounds[j]) bounds.splice(j, 0, t); }
    }
    const segs = [];
    const showUnder = sphere.showUnder;
    for (let i = 0; i < bounds.length - 1; i++) {
      const t1 = bounds[i], t2 = bounds[i + 1], tm = t1 + (t2 - t1) / 2;
      const rr = tm * (tm * A + B) + C;
      let layer;
      if (rr < r2) {
        if (phi === -HALF_PI) layer = (tm * dz + T.z > 0) ? 'bI' : 'aI';
        else if (phi === HALF_PI) layer = (tm * dz + T.z > 0) ? 'aI' : 'bI';
        else if (tm * dy + T.y - (tm * dz + T.z) * m > 1e-9) layer = 'bI';
        else layer = 'aI';
        if (!showUnder && layer === 'bI') continue;
      } else if (tm * dz + T.z < 0) layer = 'bE';
      else layer = 'fE';
      segs.push({ layer, x1: t1 * dx + T.x, y1: t1 * dy + T.y, x2: t2 * dx + T.x, y2: t2 * dy + T.y });
    }
    return segs;
  }
}

/* ----- colour helper ----------------------------------------------------- */
function colorHex(n) {
  return '#' + (n & 0xFFFFFF).toString(16).padStart(6, '0');
}

/* ==========================================================================
   SCENE OBJECTS
   ========================================================================== */
// Month-label celestial positions (Simulation Master initializeSphere).
const MONTH_LABEL_POS = [
  { ra: 19.92, dec: -20.8 }, { ra: 21.93, dec: -12.59 }, { ra: 23.79, dec: -1.43 },
  { ra: 1.64, dec: 10.23 }, { ra: 3.59, dec: 19.29 }, { ra: 5.66, dec: 23.36 },
  { ra: 7.76, dec: 21.22 }, { ra: 9.77, dec: 13.45 }, { ra: 11.61, dec: 2.49 },
  { ra: 13.46, dec: -9.22 }, { ra: 15.47, dec: -18.85 }, { ra: 17.66, dec: -23.34 }
];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_POINTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

// Sphere circles (Simulation Master initializeSphere).
const circles = {
  meridian1: new Circle({ thickness: 1, color: 16777215, alpha: 20, def: { az: 0, alt: 0, tilt: 90 } }),
  meridian2: new Circle({ thickness: 1, color: 16777215, alpha: 20, def: { az: 90, alt: 0, tilt: 90 } }),
  zeroHours: new Circle({ thickness: 2, color: 2915326, alpha: 70, def: { ra: 0, dec: 0, tilt: 90, gammaStart: -90, gammaEnd: 90 } }),
  equator: new Circle({ thickness: 2, color: 2915326, alpha: 70, def: { ra: 0, dec: 0, tilt: 0 } }),
  ecliptic: new Circle({ thickness: 2, color: 16777215, alpha: 70, def: { ra: 0, dec: 0, tilt: 23.44 } }),
  decCircle: new Circle({ thickness: 2, color: 16773728, alpha: 70, def: { ra: 0, dec: 16, tilt: 0 } })
};
const ncpAxis = new Line({ x: 0, y: 0, z: 1, system: 'celestial' }, { x: 0, y: 0, z: 1.2, system: 'celestial' }, 2915326, 100, 2);
const scpAxis = new Line({ x: 0, y: 0, z: -1, system: 'celestial' }, { x: 0, y: 0, z: -1.2, system: 'celestial' }, 2915326, 100, 2);

/* ----- Analemma (port of Analemma Curve.as) ------------------------------ */
const analemma = {
  points: [],
  limitA: 22, limitB: -22,
  c: {},
  init(N) {
    const step = 365 / N;
    const sin = Math.sin, cos = Math.cos;
    this.points = [];
    for (let i = 0; i < N; i++) {
      const day = i * step;
      const pos = getPosition(day);
      const eot = -getEqnOfTime(day);
      const decR = DEG * pos.dec;
      const cd = cos(decR);
      const pt = { x: cd * cos(eot), y: cd * sin(eot), z: sin(decR) };
      if (pos.dec >= this.limitA) pt.interval = 1;
      else if (pos.dec <= this.limitB) pt.interval = 3;
      else if (day > 354.318929563686 || day < 170.941195869382) pt.interval = 0;
      else pt.interval = 2;
      this.points.push(pt);
    }
  },
  _k(latDeg, dayFrac) {
    const clat = DEG * (90 - latDeg);
    const itod = -TWO_PI * dayFrac;
    const s28 = Math.sin(clat), c27 = Math.cos(clat);
    const s26 = Math.sin(itod), c25 = Math.cos(itod);
    const k = this.c;
    k.k0 = c27 * c25; k.k1 = -c27 * s26; k.k2 = s28;
    k.k3 = s26; k.k4 = c25;
    k.k6 = -s28 * c25; k.k7 = s28 * s26; k.k8 = c27;
  },
  /* returns {front:[[x,y]...segments], back:[...]} ; each entry a polyline */
  build(latDeg, dayFrac) {
    this._k(latDeg, dayFrac);
    const a = sphere.c, k = this.c, pts = this.points, n = pts.length;
    const c0 = a.a0 * k.k0 + a.a1 * k.k3, c1 = a.a0 * k.k1 + a.a1 * k.k4, c2 = a.a0 * k.k2;
    const c3 = a.a3 * k.k0 + a.a4 * k.k3 + a.a5 * k.k6, c4 = a.a3 * k.k1 + a.a4 * k.k4 + a.a5 * k.k7, c5 = a.a3 * k.k2 + a.a5 * k.k8;
    const c6 = a.a6 * k.k0 + a.a7 * k.k3 + a.a8 * k.k6, c7 = a.a6 * k.k1 + a.a7 * k.k4 + a.a8 * k.k7, c8 = a.a6 * k.k2 + a.a8 * k.k8;
    const project = (p) => ({
      x: c0 * p.x + c1 * p.y + c2 * p.z,
      y: c3 * p.x + c4 * p.y + c5 * p.z,
      z: c6 * p.x + c7 * p.y + c8 * p.z
    });
    const front = [], back = [];
    let curFront = null, curBack = null;
    let last = project(pts[n - 1]);
    let isFront = last.z > 0;
    if (isFront) { curFront = [[last.x, last.y]]; } else { curBack = [[last.x, last.y]]; }
    for (let i = 0; i < n; i++) {
      const pr = project(pts[i]);
      if (pr.z > 0) {
        if (isFront) { curFront.push([pr.x, pr.y]); }
        else { if (curBack) { curBack.push([pr.x, pr.y]); back.push(curBack); curBack = null; } curFront = [[pr.x, pr.y]]; }
        isFront = true;
      } else {
        if (isFront) { if (curFront) { curFront.push([pr.x, pr.y]); front.push(curFront); curFront = null; } curBack = [[pr.x, pr.y]]; }
        else { curBack.push([pr.x, pr.y]); }
        isFront = false;
      }
    }
    if (curFront) front.push(curFront);
    if (curBack) back.push(curBack);
    return { front, back };
  },
  /* setClosestDay: nearest analemma point to the mouse (Analemma Curve.as) */
  setClosestDay(sx, sy) {
    let r = sphere.r;
    const d13 = Math.sqrt(sx * sx + sy * sy);
    if (d13 > r) r = d13;
    const ang = Math.atan2(sy, sx);
    const px = d13 * Math.cos(ang), py = d13 * Math.sin(ang);
    const pz = Math.sqrt(r * r - d13 * d13);
    this._k(sphere.lat * RAD2DEG, master._day % 1 < 0 ? (master._day % 1 + 1) : master._day % 1);
    const a = sphere.c, k = this.c, pts = this.points, n = pts.length;
    const c0 = a.a0 * k.k0 + a.a1 * k.k3, c1 = a.a0 * k.k1 + a.a1 * k.k4, c2 = a.a0 * k.k2;
    const c3 = a.a3 * k.k0 + a.a4 * k.k3 + a.a5 * k.k6, c4 = a.a3 * k.k1 + a.a4 * k.k4 + a.a5 * k.k7, c5 = a.a3 * k.k2 + a.a5 * k.k8;
    const c6 = a.a6 * k.k0 + a.a7 * k.k3 + a.a8 * k.k6, c7 = a.a6 * k.k1 + a.a7 * k.k4 + a.a8 * k.k7, c8 = a.a6 * k.k2 + a.a8 * k.k8;
    const inv = 1 / (r * r);
    const ux = inv * (c0 * px + c3 * py + c6 * pz);
    const uy = inv * (c1 * px + c4 * py + c7 * pz);
    const uz = inv * (c2 * px + c5 * py + c8 * pz);
    const day = master._day, decl = master.declination;
    let interval;
    if (decl >= this.limitA) interval = 3;
    else if (decl <= this.limitB) interval = 1;
    else if (day > 354.318929563686 || day < 170.941195869382) interval = 2;
    else interval = 0;
    let best = 4, bestI = 0;
    for (let i = 0; i < n; i++) {
      const q = pts[i];
      if (q.interval !== interval) {
        const ddx = ux - q.x, ddy = uy - q.y, ddz = uz - q.z;
        const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
        if (d2 < best) { best = d2; bestI = i; }
      }
    }
    const frac = mod(day, 1);
    let qa = pts[mod(bestI - 1, n)];
    let d18 = (ux - qa.x) ** 2 + (uy - qa.y) ** 2 + (uz - qa.z) ** 2;
    let qb = pts[(bestI + 1) % n];
    let d17 = (ux - qb.x) ** 2 + (uy - qb.y) ** 2 + (uz - qb.z) ** 2;
    let result;
    if (d18 <= best) result = Math.floor(365 * ((bestI - 1) / n)) + frac;
    else if (d17 <= best) result = Math.floor(365 * ((bestI + 1) / n)) + frac;
    else {
      const denom = (d18 > d17 ? d18 : d17) - best;
      const off = (d18 - d17) / (2 * denom);
      result = Math.floor(365 * ((bestI + off) / n)) + frac;
    }
    master.setDay(result);
  }
};
analemma.init(60);

/* ==========================================================================
   SIMULATION MASTER  (state + behavior, port of Simulation Master.as)
   ========================================================================== */
const master = {
  _day: 146.5, _doy: 146, _tod: 0.5,
  _latitude: 40.8,
  altitude: 0, azimuth: 0, declination: 0, rightAscension: 0,
  equationOfTime: 0, siderealTime: 0, hourAngle: 0,
  sunDragMode: 'timeOfDay',
  showAnalemma: false,
  show: { sundec: true, ecliptic: true, monthLabels: false, underside: true, stickfigure: true },

  // animation
  continuousMin: 0.000010416666666666666, continuousMax: 0.00075,
  discreteMin: 0.005, discreteMax: 0.122,
  continuousSpeed: 0.000125, discreteSpeed: 0.015,
  _speed: 0.000125, stepByDay: false, loopDay: false,
  animationState: false, _useLowQuality: false,
  _animateDay: 0, timeLast: 0,

  updateSphere() {
    const pos = getPositionAndEqnOfTime(this._day);
    this.sun = sphere.parsePoint({ ra: pos.ra, dec: pos.dec, r: 1 });
    circles.decCircle.setDec(pos.dec);
    const st = getSiderealTime(this._day);
    sphere.setSiderealTime(st);
    this.hourAngle = mod(st - pos.ra, 24);
    this.siderealTime = st;
    this.equationOfTime = pos.eqn;
    this.declination = pos.dec;
    this.rightAscension = pos.ra;
  },
  updateSky() {
    sphere.recompute();
    const h = sphere.celestialToHorizon(this.sun);
    this.altitude = h.alt;
    this.azimuth = h.az;
  },
  set day(v) { this.setDay(v); },
  get day() { return this._day; },
  setDay(arg) {
    if (isNaN(arg) || !isFinite(arg)) return;
    arg = mod(arg, 365);
    this._day = arg;
    this._tod = mod(arg, 1);
    this._doy = Math.floor(arg);
    this.refreshAll();
  },
  setTimeOfDay(arg) {
    if (isNaN(arg) || !isFinite(arg)) return;
    arg = mod(arg, 1);
    this._tod = arg;
    this._day = this._doy + arg;
    this.refreshAll();
  },
  setDayOfYear(arg) {
    if (isNaN(arg) || !isFinite(arg)) return;
    arg = mod(Math.floor(arg), 365);
    this._doy = arg;
    this._day = arg + this._tod;
    this.refreshAll();
  },
  setLatitude(arg) {
    if (isNaN(arg) || !isFinite(arg)) return;
    if (arg > 90) arg = 90; else if (arg < -90) arg = -90;
    this._latitude = arg;
    sphere.setLatitude(arg);
    this.refreshAll();
  },
  refreshAll() {
    this.updateSphere();
    this.updateSky();
    syncControls();
    render();
  },

  setAnimationMode(mode) {
    if (mode === 'continuous') {
      this.stepByDay = false; this._speed = this.continuousSpeed;
    } else {
      this.loopDay = false; this.stepByDay = true; this._speed = this.discreteSpeed;
    }
  },
  setAnimationSpeed(arg) {
    if (this.stepByDay) {
      if (arg < this.discreteMin) arg = this.discreteMin; else if (arg > this.discreteMax) arg = this.discreteMax;
      this.discreteSpeed = arg;
    } else {
      if (arg < this.continuousMin) arg = this.continuousMin; else if (arg > this.continuousMax) arg = this.continuousMax;
      this.continuousSpeed = arg;
    }
    this._speed = arg;
  },
  setAnimationState(on) {
    this.animationState = !!on;
    if (this.animationState) {
      this.timeLast = performance.now();
      this._animateDay = this._day;
      if (!rafId) rafId = requestAnimationFrame(tick);
    }
  },
  step(now) {
    const dt = now - this.timeLast;
    this._animateDay += this._speed * dt;
    if (this.stepByDay) this.setDayOfYear(this._animateDay);
    else if (this.loopDay) { this._animateDay = this._doy + mod(this._animateDay, 1); this.setTimeOfDay(this._animateDay); }
    else this.setDay(this._animateDay);
    this.timeLast = now;
  },
  reset() {
    this.discreteSpeed = 0.015; this.continuousSpeed = 0.000125;
    this._useLowQuality = false;
    this.setAnimationMode('continuous');
    this.loopDay = false;
    this.animationState = false;
    this.showAnalemma = false;
    this.show = { sundec: true, ecliptic: true, monthLabels: false, underside: true, stickfigure: true };
    this.sunDragMode = 'timeOfDay';
    sphere.showUnder = true;
    sphere.setViewerAzimuth(215);
    sphere.setViewerAltitude(35);
    this._latitude = 40.8; sphere.setLatitude(40.8);
    this._tod = 0.5; this._doy = 146; this._day = 146.5;
    applyStateToControls();
    this.refreshAll();
  }
};

/* ==========================================================================
   RENDERING
   ========================================================================== */
let canvas, ctx, dpr = 1;
const clock = {}, mapUI = {};
let worldImg = null;
let stickImg = null;

function setupCanvas() {
  canvas = document.getElementById('sphere-canvas');
  dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = STAGE * dpr;
  canvas.height = STAGE * dpr;
  ctx = canvas.getContext('2d');
}

function shadingValues() {
  const alt = master.altitude;
  let sky = 80 * Math.pow(Math.min(Math.max(alt / 90, 0), 1), 0.15);   // skyBack alpha
  let shade = 40 * Math.pow(1 - alt / 90, 4); if (shade > 40) shade = 40; // horizonShade
  if (shade < 0) shade = 0;
  return { sky: sky / 100, shade: shade / 100 };
}

function render() {
  if (!ctx) return;
  sphere.recompute();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, STAGE, STAGE);
  // dark space background gradient
  const bg = ctx.createRadialGradient(CX, CY, 10, CX, CY, R * 1.25);
  bg.addColorStop(0, '#10172e'); bg.addColorStop(1, '#070a16');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, STAGE, STAGE);

  ctx.save();
  ctx.translate(CX, CY);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  const sh = shadingValues();
  const arcs = {};
  for (const key in circles) {
    const c = circles[key];
    c.visible = circleVisible(key);
    arcs[key] = c.visible ? c.computeArcs() : { front: [], back: [] };
  }
  const ncp = ncpAxis.segments();
  const scp = scpAxis.segments();
  const ana = master.showAnalemma ? analemma.build(sphere.lat * RAD2DEG, mod(master._day, 1)) : { front: [], back: [] };

  // ---- BACK pass (far hemisphere) ----
  drawLineLayer(ncp, 'bE'); drawLineLayer(scp, 'bE');
  drawLineLayer(ncp, 'bI'); drawLineLayer(scp, 'bI');
  for (const key in circles) if (circles[key].visible) strokeArcs(ctx, circles[key], arcs[key].back);
  drawAnalemma(ana.back);
  drawObjectsForRegion(false);

  // ---- sky tint over the dome ----
  if (sh.sky > 0) {
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TWO_PI);
    ctx.fillStyle = colorHex(12575999); ctx.globalAlpha = sh.sky; ctx.fill(); ctx.globalAlpha = 1;
  }

  // ---- horizon plane (green ground ellipse) ----
  drawHorizonPlane();

  // night / twilight darkening
  if (sh.shade > 0) {
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TWO_PI);
    ctx.fillStyle = '#000000'; ctx.globalAlpha = sh.shade; ctx.fill(); ctx.globalAlpha = 1;
  }

  // ---- FRONT pass (near hemisphere) ----
  drawLineLayer(ncp, 'aI'); drawLineLayer(scp, 'aI');
  for (const key in circles) if (circles[key].visible) strokeArcs(ctx, circles[key], arcs[key].front);
  drawAnalemma(ana.front);
  drawLineLayer(ncp, 'fE'); drawLineLayer(scp, 'fE');
  drawObjectsForRegion(true);
  drawDirectionLabels();

  // sphere outline for definition
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TWO_PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.restore();
  updateSphereDescription();
}

function circleVisible(key) {
  if (key === 'ecliptic') return master.show.ecliptic;
  if (key === 'decCircle') return master.show.sundec;
  return true;
}

function drawLineLayer(segs, layer) {
  let started = false;
  for (const s of segs) {
    if (s.layer !== layer) continue;
    if (!started) { ctx.beginPath(); started = true; }
    ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
  }
  if (started) {
    ctx.lineWidth = 2; ctx.strokeStyle = colorHex(2915326); ctx.globalAlpha = 1; ctx.stroke();
  }
}

function drawAnalemma(polylines) {
  if (!polylines.length) return;
  ctx.beginPath();
  for (const pl of polylines) {
    ctx.moveTo(pl[0][0], pl[0][1]);
    for (let i = 1; i < pl.length; i++) ctx.lineTo(pl[i][0], pl[i][1]);
  }
  ctx.strokeStyle = colorHex(16720932); ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHorizonPlane() {
  // Fill the projected horizon circle (alt = 0). Projecting the true horizon
  // gives the exact ellipse of the ground disk for the current viewer angle.
  ctx.beginPath();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const p = sphere.parsePoint({ az: i / N * 360, alt: 0, r: 1 });
    const sp = {}; sphere.WtoSz(p, sp);
    if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, colorHex(5358673));   // inner green
  g.addColorStop(1, colorHex(3843386));   // outer green
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();
}

/* Sun (r=1), stickfigure (centre) and month labels, split by screen depth. */
function drawObjectsForRegion(front) {
  // Month labels
  if (master.show.monthLabels) {
    for (let i = 0; i < 12; i++) {
      const p = sphere.parsePoint({ ra: MONTH_LABEL_POS[i].ra, dec: MONTH_LABEL_POS[i].dec, r: 1.1 });
      const w = {}; sphere.CtoW(p, w);
      if (!sphere.showUnder && w.z < 0) continue;
      const sp = {}; sphere.CtoSz(p, sp);
      if ((sp.z >= 0) !== front) continue;
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe066'; ctx.globalAlpha = sp.z >= 0 ? 1 : 0.6;
      ctx.fillText(MONTH_ABBR[i], sp.x, sp.y);
      ctx.globalAlpha = 1;
    }
  }
  // Stickfigure + shadow at sphere centre (always "front" region; on the ground)
  if (front && master.show.stickfigure) drawStickfigure();
  // Sun
  const sp = {}; sphere.CtoSz(master.sun, sp);
  const w = {}; sphere.CtoW(master.sun, w);
  if (!sphere.showUnder && w.z < 0) return;
  if ((sp.z >= 0) === front) drawSun(sp.x, sp.y, sp.z >= 0);
}

function drawSun(x, y, isFront) {
  const rad = sunHover ? 11 : 9;
  ctx.globalAlpha = isFront ? 1 : 0.55;
  const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
  g.addColorStop(0, '#fff6c8'); g.addColorStop(0.6, '#ffd21e'); g.addColorStop(1, '#ff9a00');
  ctx.beginPath(); ctx.arc(x, y, rad, 0, TWO_PI); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#cc7000'; ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawStickfigure() {
  // observer stands at the centre of the sphere — reuse the original exported
  // Stickfigure bitmap (feet at the centre, figure standing up).
  if (stickImg && stickImg.complete && stickImg.naturalWidth) {
    const h = 30, w = h * stickImg.naturalWidth / stickImg.naturalHeight;
    ctx.drawImage(stickImg, -w / 2, -h, w, h);
    return;
  }
  ctx.save();                                                                 // fallback
  ctx.strokeStyle = '#1b1b1b'; ctx.fillStyle = '#1b1b1b'; ctx.lineWidth = 2;
  const baseY = 0, h = 16;
  ctx.beginPath(); ctx.arc(0, baseY - h, 3, 0, TWO_PI); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, baseY - h + 3); ctx.lineTo(0, baseY - 5);
  ctx.moveTo(-4, baseY - 11); ctx.lineTo(4, baseY - 11);
  ctx.moveTo(0, baseY - 5); ctx.lineTo(-4, baseY);
  ctx.moveTo(0, baseY - 5); ctx.lineTo(4, baseY);
  ctx.stroke();
  ctx.restore();
}

function drawDirectionLabels() {
  let labels;
  if (master._latitude === 90) labels = { 0: 'S', 90: 'S', 180: 'S', 270: 'S' };
  else if (master._latitude === -90) labels = { 0: 'N', 90: 'N', 180: 'N', 270: 'N' };
  else labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const az of [0, 90, 180, 270]) {
    const p = sphere.parsePoint({ az: az, alt: 0, r: 1.06 });
    const sp = {}; sphere.WtoSz(p, sp);
    ctx.globalAlpha = sp.z >= 0 ? 1 : 0.5;
    ctx.fillStyle = '#f4f4f4';
    ctx.fillText(labels[az], sp.x, sp.y);
  }
  ctx.globalAlpha = 1;
}

/* ==========================================================================
   FORMATTING (Info panel readouts — match the AS Numerical Formatting)
   ========================================================================== */
function fmtDeg(v) { return toFixedAS(v, 1) + '°'; }
function fmtHM(hours) {
  const h = Math.floor(hours);
  const m = Math.floor(60 * (hours - h));
  return h + 'h ' + m + 'm';
}
function fmtHourAngle(ha) {
  if (ha > 12) {
    const v = Math.abs(ha - 24);
    return '-' + Math.floor(v) + 'h ' + Math.floor(60 * (v - Math.floor(v))) + 'm';
  }
  return Math.floor(ha) + 'h ' + Math.floor(60 * (ha - Math.floor(ha))) + 'm';
}
function fmtEqnOfTime(eqn) {
  const neg = eqn < 0;
  const a = Math.abs(eqn);
  const min = Math.floor(a);
  const sec = Math.floor(60 * (a - min));
  return (neg ? '-' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
}
function fmtLatitude(lat) {
  return toFixedAS(Math.abs(lat), 1) + '° ' + (lat < 0 ? 'S' : 'N');
}
function dayOfMonth(doy) {
  let m = 0;
  while (m < 11 && doy >= MONTH_POINTS[m + 1]) m++;
  return { month: m, day: doy - MONTH_POINTS[m] + 1 };
}
function todTo24(tod) {
  let h = Math.floor(24 * tod);
  let m = Math.floor(60 * (24 * tod - h));
  if (m === 60) { m = 0; h++; }
  if (h === 24) h = 0;
  return { h, m };
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function todTo12(h, m) {
  let suffix = h < 12 ? 'am' : 'pm';
  let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + pad2(m) + ' ' + suffix;
}

/* animation-speed label + spoken text (AnimationSpeedSlider regimes) */
const SPEED_REGIMES = [
  { unit: 'min', word: 'minutes', precision: 0, rightLimit: 0.00008333333, ratio: 0.0000006944444 },
  { unit: 'hr', word: 'hours', precision: 1, rightLimit: 0.00025, ratio: 0.000041666667 },
  { unit: 'hr', word: 'hours', precision: 0, rightLimit: 0.001, ratio: 0.000041666667 },
  { unit: 'day', word: 'days', precision: 1, rightLimit: 0.01, ratio: 0.001 },
  { unit: 'day', word: 'days', precision: 0, rightLimit: 0.123, ratio: 0.001 }
];
function speedLabel(speed) {
  let reg = SPEED_REGIMES[SPEED_REGIMES.length - 1];
  for (const r of SPEED_REGIMES) { if (speed <= r.rightLimit) { reg = r; break; } }
  const val = toFixedAS(speed / reg.ratio, reg.precision);
  return { text: val + ' ' + reg.unit + '/sec', spoken: val + ' ' + reg.word + ' per second' };
}

/* ==========================================================================
   CONTROL WIRING
   ========================================================================== */
const el = {};
function $(id) { return document.getElementById(id); }

function buildMonthStrip() {
  // Month names INSIDE the strip (centred per month) with divider lines at each
  // month boundary — the Big Dipper Clock day-of-year strip design.
  const months = $('doy-months');
  months.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const start = MONTH_POINTS[i], end = MONTH_POINTS[i + 1];
    const centerFrac = ((start + end) / 2) / 365;
    const tick = document.createElement('span');
    tick.className = 'doy-slider__month';
    tick.style.left = (centerFrac * 100) + '%';
    tick.textContent = MONTH_ABBR[i];
    months.appendChild(tick);
    if (i > 0) {
      const div = document.createElement('span');
      div.className = 'doy-slider__divider';
      div.style.left = (start / 365 * 100) + '%';
      months.appendChild(div);
    }
  }
}

let suppressSync = false; // avoid feedback loops when programmatically setting controls

function syncControls() {
  if (suppressSync) return;
  suppressSync = true;
  const dm = dayOfMonth(master._doy);
  const t24 = todTo24(master._tod);
  const t12 = todTo12(t24.h, t24.m);

  // Day of year
  el.month.value = String(dm.month);
  el.day.value = String(dm.day);
  el.day.max = String(MONTH_POINTS[dm.month + 1] - MONTH_POINTS[dm.month]);
  el.doyCursor.style.left = ((master._doy + 0.5) / 365 * 100) + '%';
  el.doy.setAttribute('aria-valuenow', String(master._doy));
  el.doy.setAttribute('aria-valuetext', MONTH_FULL[dm.month] + ' ' + dm.day + ' (day ' + (master._doy + 1) + ' of 365)');

  // Time of day (hour:minute boxes + 12-hour suffix)
  el.hour.value = String(t24.h);
  el.minute.value = String(t24.m);
  $('ro-time12').textContent = t12;

  // Latitude (magnitude box + N/S select + map line)
  const south = master._latitude < 0;
  el.latInput.value = toFixedAS(Math.abs(master._latitude), 1);
  el.nsSelect.value = south ? 'S' : 'N';
  el.latLine.style.top = ((90 - master._latitude) / 180 * 100) + '%';
  el.latLine.setAttribute('aria-valuenow', String(master._latitude));
  el.latLine.setAttribute('aria-valuetext',
    toFixedAS(Math.abs(master._latitude), 1) + ' degrees ' + (south ? 'south' : 'north'));

  // Info readouts
  $('info-sentence').textContent = 'The horizon diagram is shown for an observer at latitude '
    + fmtLatitude(master._latitude) + ' on ' + dm.day + ' ' + MONTH_FULL[dm.month]
    + ' at ' + pad2(t24.h) + ':' + pad2(t24.m) + ' (' + t12 + ').';
  $('ro-altitude').textContent = fmtDeg(master.altitude);
  $('ro-azimuth').textContent = fmtDeg(master.azimuth);
  $('ro-ra').textContent = fmtHM(master.rightAscension);
  $('ro-dec').textContent = fmtDeg(master.declination);
  $('ro-eot').textContent = fmtEqnOfTime(master.equationOfTime);
  $('ro-sidereal').textContent = fmtHM(master.siderealTime);
  $('ro-hourangle').textContent = fmtHourAngle(master.hourAngle);

  // Speed
  const sl = speedLabel(master._speed);
  $('ro-speed').textContent = sl.text;
  el.speed.setAttribute('aria-valuetext', sl.spoken);
  el.speed.value = String(speedToSlider(master._speed));

  suppressSync = false;
}

/* Map slider <-> speed (logarithmic within the active mode's range). */
function speedRange() {
  return master.stepByDay
    ? { min: master.discreteMin, max: master.discreteMax }
    : { min: master.continuousMin, max: master.continuousMax };
}
function sliderToSpeed(v) {
  const r = speedRange();
  return r.min * Math.exp((v / 1000) * Math.log(r.max / r.min));
}
function speedToSlider(speed) {
  const r = speedRange();
  return Math.round(1000 * Math.log(speed / r.min) / Math.log(r.max / r.min));
}

/* Push full state into the DOM controls (used on load and reset). */
function applyStateToControls() {
  el.showAnalemma.checked = master.showAnalemma;
  el.showSundec.checked = master.show.sundec;
  el.showEcliptic.checked = master.show.ecliptic;
  el.showMonth.checked = master.show.monthLabels;
  el.showUnder.checked = master.show.underside;
  el.showStick.checked = master.show.stickfigure;
  el.modeCont.checked = !master.stepByDay;
  el.modeStep.checked = master.stepByDay;
  el.loopDay.checked = master.loopDay;
  el.loopDay.disabled = master.stepByDay;
  el.lowQ.checked = master._useLowQuality;
  el.dragTime.checked = master.sunDragMode === 'timeOfDay';
  el.dragDay.checked = master.sunDragMode === 'dayOfYear';
  el.animate.textContent = master.animationState ? 'stop animation' : 'start animation';
  setManualInputsEnabled(!master.animationState);
}

function setManualInputsEnabled(on) {
  [el.month, el.day, el.hour, el.minute, el.latInput, el.nsSelect].forEach(c => { c.disabled = !on; });
  // The day-of-year strip and latitude line are div sliders: take them out of the
  // tab order and mark disabled while animating (their handlers also guard on this).
  [el.doy, el.latLine].forEach(s => { s.setAttribute('aria-disabled', String(!on)); s.tabIndex = on ? 0 : -1; });
}

function announce(msg) { $('sr-status').textContent = msg; }
function announceState() {
  announce('Sun altitude ' + toFixedAS(master.altitude, 1) + ' degrees, azimuth '
    + toFixedAS(master.azimuth, 1) + ' degrees. ' + fmtLatitude(master._latitude) + '.');
}

function updateSphereDescription() {
  const dm = dayOfMonth(master._doy);
  const t24 = todTo24(master._tod);
  const aboveBelow = master.altitude >= 0 ? 'above' : 'below';
  $('sphere-desc').textContent =
    'Sky for an observer at latitude ' + fmtLatitude(master._latitude) + ' on '
    + dm.day + ' ' + MONTH_FULL[dm.month] + ' at ' + pad2(t24.h) + ':' + pad2(t24.m)
    + '. The sun is ' + aboveBelow + ' the horizon at altitude '
    + toFixedAS(master.altitude, 1) + ' degrees and azimuth '
    + toFixedAS(master.azimuth, 1) + ' degrees.';
}

function wireControls() {
  el.month = $('month-select'); el.day = $('day-input'); el.doy = $('doy-slider');
  el.doyMonths = $('doy-months'); el.doyCursor = $('doy-cursor');
  el.hour = $('hour-input'); el.minute = $('minute-input');
  el.latInput = $('lat-input'); el.nsSelect = $('ns-select');
  el.latLine = $('lat-line'); el.latMap = $('lat-map');
  el.speed = $('speed-slider');
  el.animate = $('animate-button');
  el.modeCont = $('mode-continuous'); el.modeStep = $('mode-step');
  el.loopDay = $('loop-day'); el.lowQ = $('low-quality');
  el.showAnalemma = $('show-analemma');
  el.showSundec = $('show-sundec'); el.showEcliptic = $('show-ecliptic');
  el.showMonth = $('show-monthlabels'); el.showUnder = $('show-underside');
  el.showStick = $('show-stickfigure');
  el.dragTime = $('drag-time'); el.dragDay = $('drag-day');

  // Day of year — custom strip slider (Big Dipper design)
  el.doy.addEventListener('pointerdown', beginDoyDrag);
  el.doy.addEventListener('pointermove', moveDoyDrag);
  el.doy.addEventListener('pointerup', endDoyDrag);
  el.doy.addEventListener('pointercancel', endDoyDrag);
  el.doy.addEventListener('keydown', doyKey);
  el.month.addEventListener('change', () => {
    const m = parseInt(el.month.value, 10);
    const cur = dayOfMonth(master._doy);
    let dom = Math.min(cur.day, MONTH_POINTS[m + 1] - MONTH_POINTS[m]);
    master.setDayOfYear(MONTH_POINTS[m] + dom - 1); announceState();
  });
  el.day.addEventListener('change', () => {
    const m = parseInt(el.month.value, 10);
    let dom = parseInt(el.day.value, 10);
    const maxDom = MONTH_POINTS[m + 1] - MONTH_POINTS[m];
    if (isNaN(dom) || dom < 1) dom = 1; if (dom > maxDom) dom = maxDom;
    master.setDayOfYear(MONTH_POINTS[m] + dom - 1); announceState();
  });

  // Time of day (hour + minute boxes)
  const commitTime = () => {
    let h = parseInt(el.hour.value, 10);
    let m = parseInt(el.minute.value, 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) { syncControls(); return; }
    master.setTimeOfDay((h + m / 60) / 24); announceState();
  };
  el.hour.addEventListener('change', commitTime);
  el.minute.addEventListener('change', commitTime);

  // Latitude (magnitude box + N/S select) — sign comes from the hemisphere select
  el.latInput.addEventListener('change', () => {
    let v = parseFloat(el.latInput.value);
    if (isNaN(v)) { syncControls(); return; }
    const sign = el.nsSelect.value === 'S' ? -1 : 1;
    master.setLatitude(sign * Math.abs(v)); announceState();
  });
  el.nsSelect.addEventListener('change', () => {
    const sign = el.nsSelect.value === 'S' ? -1 : 1;
    master.setLatitude(sign * Math.abs(master._latitude)); announceState();
  });

  // Animation
  el.animate.addEventListener('click', () => {
    master.setAnimationState(!master.animationState);
    el.animate.textContent = master.animationState ? 'stop animation' : 'start animation';
    setManualInputsEnabled(!master.animationState);
    announce(master.animationState ? 'Animation started.' : 'Animation stopped.');
  });
  el.modeCont.addEventListener('change', () => { if (el.modeCont.checked) { master.setAnimationMode('continuous'); afterModeChange(); } });
  el.modeStep.addEventListener('change', () => { if (el.modeStep.checked) { master.setAnimationMode('step'); afterModeChange(); } });
  el.speed.addEventListener('input', () => { if (suppressSync) return; master.setAnimationSpeed(sliderToSpeed(parseInt(el.speed.value, 10))); syncControls(); });
  el.loopDay.addEventListener('change', () => { master.loopDay = el.loopDay.checked; });
  el.lowQ.addEventListener('change', () => { master._useLowQuality = el.lowQ.checked; });

  // Info / settings toggles
  el.showAnalemma.addEventListener('change', () => { master.showAnalemma = el.showAnalemma.checked; render(); });
  el.showSundec.addEventListener('change', () => { master.show.sundec = el.showSundec.checked; render(); });
  el.showEcliptic.addEventListener('change', () => { master.show.ecliptic = el.showEcliptic.checked; render(); });
  el.showMonth.addEventListener('change', () => { master.show.monthLabels = el.showMonth.checked; render(); });
  el.showUnder.addEventListener('change', () => { master.show.underside = el.showUnder.checked; sphere.showUnder = el.showUnder.checked; render(); });
  el.showStick.addEventListener('change', () => { master.show.stickfigure = el.showStick.checked; render(); });
  el.dragTime.addEventListener('change', () => { if (el.dragTime.checked) master.sunDragMode = 'timeOfDay'; });
  el.dragDay.addEventListener('change', () => { if (el.dragDay.checked) master.sunDragMode = 'dayOfYear'; });
}

function afterModeChange() {
  el.loopDay.disabled = master.stepByDay;
  syncControls();
}

/* pause/resume animation while a slider is being dragged (matches AS) */
let wasAnimating = false;
function pauseDuringDrag() {
  if (master.animationState && !dragPaused) { dragPaused = true; }
}
let dragPaused = false;
function resumeAfterDrag() {
  if (dragPaused) { dragPaused = false; if (master.animationState) { master.timeLast = performance.now(); master._animateDay = master._day; } }
}

/* ----- Day-of-year strip slider (Big Dipper Clock design) ----------------- */
let doyDragging = false, doyGrabOffsetPx = 0;
function doyPointerFrac(ev) {
  const rect = el.doy.getBoundingClientRect();
  let f = (ev.clientX - rect.left) / rect.width;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}
function setDoyFromFrac(f) {
  let d = Math.floor(f * 365);
  if (d < 0) d = 0; else if (d > 364) d = 364;
  master.setDayOfYear(d);
}
function beginDoyDrag(ev) {
  if (master.animationState) return;
  doyDragging = true; el.doy.focus();
  const rect = el.doy.getBoundingClientRect();
  if (ev.target === el.doyCursor || el.doyCursor.contains(ev.target)) {
    // grab the handle, preserving the pointer-to-handle offset so it doesn't jump
    const cursorX = rect.left + (parseFloat(el.doyCursor.style.left) || 0) / 100 * rect.width;
    doyGrabOffsetPx = ev.clientX - cursorX;
  } else {
    doyGrabOffsetPx = 0;
    setDoyFromFrac(doyPointerFrac(ev));   // clicking the strip jumps to that day
  }
  ev.preventDefault();
  try { el.doy.setPointerCapture(ev.pointerId); } catch (e) {}
}
function moveDoyDrag(ev) {
  if (!doyDragging) return;
  const rect = el.doy.getBoundingClientRect();
  let f = (ev.clientX - doyGrabOffsetPx - rect.left) / rect.width;
  if (f < 0) f = 0; else if (f > 1) f = 1;
  setDoyFromFrac(f);
  ev.preventDefault();
}
function endDoyDrag(ev) {
  if (!doyDragging) return;
  doyDragging = false; announceState();
  try { el.doy.releasePointerCapture(ev.pointerId); } catch (e) {}
}
function doyKey(ev) {
  if (master.animationState) return;
  let handled = true; const doy = master._doy;
  switch (ev.key) {
    case 'ArrowLeft': case 'ArrowDown': master.setDayOfYear(doy - 1); break;
    case 'ArrowRight': case 'ArrowUp': master.setDayOfYear(doy + 1); break;
    case 'PageDown': master.setDayOfYear(doy - 7); break;
    case 'PageUp': master.setDayOfYear(doy + 7); break;
    case 'Home': master.setDayOfYear(0); break;
    case 'End': master.setDayOfYear(364); break;
    default: handled = false;
  }
  if (handled) { ev.preventDefault(); announceState(); }
}

/* ==========================================================================
   POINTER INTERACTION on the sphere canvas
   ========================================================================== */
function canvasToStage(ev) {
  const rect = canvas.getBoundingClientRect();
  const sx = (ev.clientX - rect.left) / rect.width * STAGE - CX;
  const sy = (ev.clientY - rect.top) / rect.height * STAGE - CY;
  return { x: sx, y: sy };
}

let sunHover = false;
let dragMode = null;          // 'view' | 'sun'
let dragStart = null;
let sunHourOffset = 0;

function hitSun(p) {
  const sp = {}; sphere.CtoSz(master.sun, sp);
  const dx = p.x - sp.x, dy = p.y - sp.y;
  return (dx * dx + dy * dy) <= 196 && sp.z > 0;   // within ~14px and in front
}

function wireCanvas() {
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    const p = canvasToStage(ev);
    if (hitSun(p)) {
      dragMode = 'sun';
      if (master.sunDragMode === 'timeOfDay') {
        const cel = sphere.screenToCelestial(p.x, p.y);
        sunHourOffset = cel.ra - master.rightAscension;
      }
      if (master.animationState) pauseDuringDrag();
    } else {
      const d = Math.sqrt(p.x * p.x + p.y * p.y);
      dragMode = 'view';
      dragStart = { x: p.x, y: p.y, theta: sphere.theta, phi: sphere.phi };
      if (d < sphere.r && master.animationState) pauseDuringDrag();
    }
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', (ev) => {
    const p = canvasToStage(ev);
    if (dragMode === 'view') {
      sphere.theta = dragStart.theta - (p.x - dragStart.x) / sphere.r;
      let phi = (dragStart.phi + (p.y - dragStart.y) / sphere.r) * RAD2DEG;
      sphere.setViewerAltitude(phi);
      render();
    } else if (dragMode === 'sun') {
      if (master.sunDragMode === 'timeOfDay') {
        const cel = sphere.screenToCelestial(p.x, p.y);
        let tod = (sphere.sTime * RAD2HR - cel.ra + sunHourOffset + 12) / 24;
        tod -= 0.0006944444444444445 * master.equationOfTime;
        master.setTimeOfDay(tod);
      } else {
        analemma.setClosestDay(p.x, p.y);
      }
      announceState();
    } else {
      const was = sunHover; sunHover = hitSun(p);
      if (was !== sunHover) render();
    }
  });
  const end = (ev) => {
    if (dragMode) { resumeAfterDrag(); if (dragMode !== 'view') announceState(); }
    dragMode = null; dragStart = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // Keyboard rotation of the view
  canvas.addEventListener('keydown', (ev) => {
    let used = true;
    const stepA = 5, stepP = 5;
    switch (ev.key) {
      case 'ArrowLeft': sphere.theta = mod(sphere.theta - stepA * DEG, TWO_PI); break;
      case 'ArrowRight': sphere.theta = mod(sphere.theta + stepA * DEG, TWO_PI); break;
      case 'ArrowUp': sphere.setViewerAltitude(sphere.getViewerAltitude() + stepP); break;
      case 'ArrowDown': sphere.setViewerAltitude(sphere.getViewerAltitude() - stepP); break;
      default: used = false;
    }
    if (used) { ev.preventDefault(); render(); announce('View azimuth ' + toFixedAS(sphere.getViewerAzimuth(), 0) + ' degrees, altitude ' + toFixedAS(sphere.getViewerAltitude(), 0) + ' degrees.'); }
  });
}

/* ==========================================================================
   CLOCK (24-hour dial; hour hand = 360*timeOfDay deg, minute hand normal)
   ========================================================================== */
function setupClock() {
  clock.canvas = $('clock-canvas');
  clock.size = 360;
  clock.canvas.width = clock.size * dpr;
  clock.canvas.height = clock.size * dpr;
  clock.ctx = clock.canvas.getContext('2d');
  wireClock();
}
/* 24-hour dial in the Big Dipper Clock style: hours 0–23 (bold every 3 hours,
   0 at top), a double outer ring, 12 am / 6 am / 12 pm / 6 pm labels, and tailed
   hour + minute hands. Midnight is up, noon is down (hour hand turns once/day). */
function drawClock() {
  const c = clock.ctx, s = clock.size, cx = s / 2, cy = s / 2, r = s / 2 - 10;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, s, s);
  // dial face
  const face = c.createRadialGradient(cx, cy - 30, 20, cx, cy, r);
  face.addColorStop(0, '#ffffff'); face.addColorStop(1, '#e6e6e6');
  c.fillStyle = face; c.beginPath(); c.arc(cx, cy, r, 0, TWO_PI); c.fill();
  // outer rings
  c.strokeStyle = '#000000'; c.lineWidth = 1.4;
  c.beginPath(); c.arc(cx, cy, r, 0, TWO_PI); c.stroke();
  c.beginPath(); c.arc(cx, cy, r - 12, 0, TWO_PI); c.stroke();
  // 24 hour ticks (longer/bolder every 3 hours)
  for (let h = 0; h < 24; h++) {
    const ang = h / 24 * TWO_PI, sin = Math.sin(ang), cos = Math.cos(ang), major = (h % 3 === 0);
    const inner = r - (major ? 15 : 9);
    c.lineWidth = major ? 2.8 : 1.2;
    c.beginPath(); c.moveTo(cx + sin * r, cy - cos * r); c.lineTo(cx + sin * inner, cy - cos * inner); c.stroke();
  }
  // hour numbers 0..23
  c.fillStyle = '#1a1a1a'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const numR = r - 26;
  for (let h = 0; h < 24; h++) {
    const ang = h / 24 * TWO_PI, major = (h % 3 === 0);
    c.font = (major ? '700 22px' : '400 16px') + " system-ui, -apple-system, 'Segoe UI', sans-serif";
    c.fillText(String(h), cx + Math.sin(ang) * numR, cy - Math.cos(ang) * numR);
  }
  // cardinal text labels
  c.fillStyle = '#000000'; c.font = "700 15px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const cardR = r - 72;
  c.fillText('12 am', cx, cy - cardR);
  c.fillText('12 pm', cx, cy + cardR);
  c.fillText('6 am', cx + cardR, cy);
  c.fillText('6 pm', cx - cardR, cy);
  // hands
  const tod = master._tod, clockHour = Math.floor(24 * tod), clockMinute = 60 * (24 * tod - clockHour);
  drawHand(c, cx, cy, 6 * clockMinute, r - 22, 6, '#666666');   // minute: 6°/min
  drawHand(c, cx, cy, 360 * tod, r - 68, 9, '#000000');         // hour: 360°/day
  c.fillStyle = '#333333'; c.beginPath(); c.arc(cx, cy, 7, 0, TWO_PI); c.fill();  // pivot
}
function drawHand(c, cx, cy, rotDeg, len, width, color) {
  const ang = rotDeg * Math.PI / 180;                 // 0 = up, clockwise
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - Math.sin(ang) * 16, cy + Math.cos(ang) * 16);    // small tail
  c.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);  // tip
  c.stroke();
}
function wireClock() {
  let dragging = false;
  const toTod = (ev) => {
    const rect = clock.canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width * clock.size - clock.size / 2;
    const y = (ev.clientY - rect.top) / rect.height * clock.size - clock.size / 2;
    let ang = Math.atan2(x, -y);       // 0 at top, clockwise
    return mod(ang / TWO_PI, 1);
  };
  clock.canvas.addEventListener('pointerdown', (ev) => {
    dragging = true; clock.canvas.setPointerCapture(ev.pointerId);
    if (master.animationState) pauseDuringDrag();
    master.setTimeOfDay(toTod(ev)); ev.preventDefault();
  });
  clock.canvas.addEventListener('pointermove', (ev) => { if (dragging) { master.setTimeOfDay(toTod(ev)); } });
  const end = (ev) => { if (dragging) { dragging = false; resumeAfterDrag(); announceState(); } try { clock.canvas.releasePointerCapture(ev.pointerId); } catch (e) {} };
  clock.canvas.addEventListener('pointerup', end);
  clock.canvas.addEventListener('pointercancel', end);
}

/* ==========================================================================
   LATITUDE MAP (reuses exported worldmap.png; vertical = latitude)
   ========================================================================== */
function setupMap() {
  mapUI.map = $('lat-map');
  mapUI.line = $('lat-line');
  wireLatMap();
}
function latFromClientY(clientY) {
  const rect = mapUI.map.getBoundingClientRect();
  let lat = 90 - ((clientY - rect.top) / rect.height) * 180;
  if (lat > 90) lat = 90; else if (lat < -90) lat = -90;
  return lat;
}
function wireLatMap() {
  const wrap = mapUI.map.parentElement;
  let dragging = false;
  const start = (e) => {
    if (master.animationState) return;
    dragging = true;
    try { wrap.setPointerCapture(e.pointerId); } catch (x) {}
    master.setLatitude(latFromClientY(e.clientY)); e.preventDefault();
  };
  const move = (e) => { if (dragging) master.setLatitude(latFromClientY(e.clientY)); };
  const end = () => { if (dragging) { dragging = false; announceState(); } };
  wrap.addEventListener('pointerdown', start);
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  mapUI.line.addEventListener('keydown', (e) => {
    if (master.animationState) return;
    let lat = master._latitude, handled = true;
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': lat += 0.1; break;
      case 'ArrowDown': case 'ArrowLeft': lat -= 0.1; break;
      case 'PageUp': lat += 1; break;
      case 'PageDown': lat -= 1; break;
      case 'Home': lat = 90; break;
      case 'End': lat = -90; break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); master.setLatitude(lat); announceState(); }
  });
}

/* override syncControls to also repaint clock + map each refresh */
const _syncControls = syncControls;
syncControls = function () {
  _syncControls();
  if (clock.ctx) drawClock();
};

/* ==========================================================================
   ANIMATION LOOP
   ========================================================================== */
let rafId = 0;
function tick(now) {
  if (master.animationState && !dragPaused) master.step(now);
  if (master.animationState) rafId = requestAnimationFrame(tick);
  else rafId = 0;
}

/* ==========================================================================
   INIT
   ========================================================================== */
function init() {
  setupCanvas();
  buildMonthStrip();
  wireControls();
  wireCanvas();
  setupClock();
  setupMap();

  // Reuse the original exported Stickfigure bitmap for the observer.
  stickImg = new Image();
  stickImg.onload = render;
  stickImg.src = 'assets/stickfigure.png';

  // initial state
  sphere.setViewerAzimuth(215);
  sphere.setViewerAltitude(35);
  sphere.setLatitude(master._latitude);
  sphere.showUnder = master.show.underside;
  master.updateSphere();
  master.updateSky();
  applyStateToControls();
  syncControls();
  render();

  // Wire the masthead Reset button.
  document.addEventListener('sim-reset', () => master.reset());

  // Repaint at correct resolution if the device pixel ratio changes (zoom).
  window.addEventListener('resize', () => {
    const ndpr = Math.max(1, window.devicePixelRatio || 1);
    if (ndpr !== dpr) {
      dpr = ndpr;
      canvas.width = STAGE * dpr; canvas.height = STAGE * dpr;
      clock.canvas.width = clock.size * dpr; clock.canvas.height = clock.size * dpr;
      render(); drawClock();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
