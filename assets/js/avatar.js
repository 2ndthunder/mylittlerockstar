// My Little Rockstar — 2.5D layered character renderer.
// Builds an SVG rockstar from an appearance object (see assets/data/catalog.json for every option).
// Every part is drawn separately, so any hair / outfit / tattoo / instrument combination works.
'use strict';

const Avatar = (() => {
  const INK = '#0c0a11';          // outline colour (near-black, bold cartoon ink)
  const CX = 120;                 // centre line
  let uid = 0;
  let CUR = null;                 // context of the avatar being drawn (for clip ids)

  /* ---------------------------------------------------------------- colour helpers */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hexToRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
  function shade(hex, amt) {             // amt -1..1 : darker..lighter
    const [r, g, b] = hexToRgb(hex);
    return amt >= 0 ? rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)
                    : rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  }
  const safe = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#888888');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------------------------------------------------------- body metrics */
  const BUILDS = {
    slim:     { sw: 36, ww: 25, hw: 27, arm: 16.5, leg: 22, neck: 8.5, bust: 0, muscle: 0.2 },
    average:  { sw: 40, ww: 30, hw: 30, arm: 17.5, leg: 23, neck: 9.5, bust: 0, muscle: 0.35 },
    athletic: { sw: 45, ww: 31, hw: 30, arm: 19.5, leg: 24, neck: 10.5, bust: 0, muscle: 0.8 },
    curvy:    { sw: 38, ww: 27, hw: 37, arm: 17.5, leg: 24.5, neck: 8.5, bust: 5, muscle: 0.3 },
    broad:    { sw: 47, ww: 37, hw: 36, arm: 21, leg: 25, neck: 11.5, bust: 0, muscle: 0.65 },
    heavy:    { sw: 47, ww: 43, hw: 42, arm: 21, leg: 26, neck: 11.5, bust: 3, muscle: 0.3 },
  };
  /** Body sliders (each -50..50, 0 = the build's default) on top of a build. */
  const BODY_KEYS = ['head', 'shoulders', 'chest', 'waist', 'hips', 'arms', 'legs', 'muscle'];
  const FACE_KEYS = ['eyeSize', 'eyeGap', 'browTilt', 'noseSize', 'mouthWidth', 'jaw'];
  const sl = (o, k) => clamp(+(o || {})[k] || 0, -50, 50);
  function bodyMetrics(a) {
    const base = BUILDS[a.build] || BUILDS.average, s = a.body || {};
    const v = k => sl(s, k);
    return {
      ...base,
      sw: base.sw + v('shoulders') * 0.18, ww: base.ww + v('waist') * 0.17, hw: base.hw + v('hips') * 0.17,
      bust: Math.max(0, base.bust + v('chest') * 0.09), chestPad: v('chest') * 0.08,
      arm: base.arm * (1 + v('arms') / 150), leg: base.leg * (1 + v('legs') / 150),
      muscle: clamp(base.muscle + v('muscle') / 60, 0, 1.6),
      neck: base.neck * (1 + v('muscle') / 260 + v('shoulders') / 400),
      head: HEAD_SCALE * (1 + v('head') / 210),
    };
  }
  /** Facial proportions from the face sliders. */
  function faceTune(a) {
    const f = a.face || {};
    return { gap: sl(f, 'eyeGap') * 0.07, eye: 1 + sl(f, 'eyeSize') / 115, tilt: sl(f, 'browTilt') * 0.32,
      nose: 1 + sl(f, 'noseSize') / 95, mouth: 1 + sl(f, 'mouthWidth') / 105, jaw: sl(f, 'jaw') * 0.1 };
  }
  /** Expressions for previews and stage moments; they override the face for one render. */
  const EXPRESSIONS = {
    rock: { mouth: 'fangs', brows: 'angry' }, sing: { mouth: 'sing' }, happy: { mouth: 'grin', eyes: 'happy' },
    smirk: { mouth: 'smirk' }, shout: { mouth: 'shout', brows: 'angry' }, cool: { mouth: 'smirk', eyes: 'toonlid' },
  };
  const Y = { head: 64, neckTop: 84, shoulder: 104, chest: 130, waist: 172, hip: 190, crotch: 204, knee: 254, ankle: 306, foot: 320 };
  const HEAD_SCALE = 1.5;   // big, characterful heads (~1/4 of total height) like the Gemini style sheet

  const FACES = {
    pointed: { cw: 27, jw: 17, chinW: 3, chinY: 98 },
    wide:   { cw: 28, jw: 25, chinW: 12, chinY: 92 },
    round:  { cw: 25, jw: 21, chinW: 9,  chinY: 91 },
    oval:   { cw: 23, jw: 18, chinW: 7,  chinY: 93 },
    square: { cw: 25, jw: 24, chinW: 14, chinY: 91 },
    heart:  { cw: 25, jw: 16, chinW: 5,  chinY: 93 },
    long:   { cw: 22, jw: 19, chinW: 8,  chinY: 97 },
  };

  /* ---------------------------------------------------------------- render context */
  class Ctx {
    constructor(a) {
      this.a = a;
      this.id = 'av' + (++uid);
      this.defs = [];
      this.gradCache = new Map();
      this.b = bodyMetrics(a);
      this.ft = faceTune(a);
      this.stance = ['relaxed', 'wide', 'power'].includes(a.stance) ? a.stance : 'wide';
      this.skin = safe(a.skin);
      this.pose = poseFor(a, this.b);
      this.legs = legPoints(this.b, this.stance);
    }
    grad(color) { return safe(color); }   // flat fill; cel shadows are drawn as shapes on top
    gradSmooth(color, dir = 'tl') {
      color = safe(color);
      const key = color + dir;
      if (this.gradCache.has(key)) return `url(#${this.gradCache.get(key)})`;
      const id = `${this.id}g${this.gradCache.size}`;
      const [x2, y2] = dir === 'tl' ? ['1', '0'] : ['0', '1'];   // shadow falls on the right edge
      // flat cartoon cel shading: one base tone, one hard shadow tone
      this.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">
        <stop offset="0" stop-color="${color}"/><stop offset=".74" stop-color="${color}"/>
        <stop offset=".74" stop-color="${shade(color, -0.18)}"/><stop offset="1" stop-color="${shade(color, -0.2)}"/></linearGradient>`);
      this.gradCache.set(key, id);
      return `url(#${id})`;
    }
    /** fill for clothing: solid gradient or a pattern */
    fabric(item) {
      const c1 = safe(item?.color), c2 = safe(item?.color2 || shade(c1, -0.45));
      const pat = item?.pattern || 'solid';
      if (pat === 'solid') return this.grad(c1);
      const key = `p${pat}${c1}${c2}`;
      if (this.gradCache.has(key)) return `url(#${this.gradCache.get(key)})`;
      const id = `${this.id}p${this.gradCache.size}`;
      const bodies = {
        stripes: `<rect width="12" height="12" fill="${c1}"/><rect width="12" height="5" fill="${c2}"/>`,
        plaid: `<rect width="16" height="16" fill="${c1}"/><rect x="0" y="5" width="16" height="4" fill="${c2}" opacity=".7"/>
                <rect x="5" y="0" width="4" height="16" fill="${c2}" opacity=".7"/><rect x="12" width="1.2" height="16" fill="${shade(c1, 0.5)}" opacity=".6"/>`,
        leopard: `<rect width="22" height="22" fill="${c1}"/>${[[4, 5], [15, 4], [9, 13], [19, 16], [3, 18]].map(([x, y]) =>
                  `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="2.4" fill="none" stroke="${c2}" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="1" fill="${shade(c1, -0.25)}"/>`).join('')}`,
        checker: `<rect width="12" height="12" fill="${c1}"/><rect width="6" height="6" fill="${c2}"/><rect x="6" y="6" width="6" height="6" fill="${c2}"/>`,
        polka: `<rect width="12" height="12" fill="${c1}"/><circle cx="3" cy="3" r="2" fill="${c2}"/><circle cx="9" cy="9" r="2" fill="${c2}"/>`,
        splatter: `<rect width="26" height="26" fill="${c1}"/><circle cx="6" cy="7" r="3" fill="${c2}"/><circle cx="18" cy="14" r="2" fill="${c2}"/>
                   <circle cx="10" cy="20" r="1.4" fill="${c2}"/><circle cx="22" cy="4" r="1.2" fill="${c2}"/><path d="M6 7 l6 2" stroke="${c2}" stroke-width="1"/>`,
        stars: `<rect width="18" height="18" fill="${c1}"/><path d="M5 2 l1.2 2.6 2.8.3-2.1 1.9.6 2.8L5 8.2 2.5 9.6l.6-2.8L1 4.9l2.8-.3z" fill="${c2}"/>
                <path d="M13 10 l.9 2 2.1.2-1.6 1.4.5 2.1-1.9-1.1-1.9 1.1.5-2.1-1.6-1.4 2.1-.2z" fill="${c2}"/>`,
      };
      Object.assign(bodies, {
        camo: `<rect width="30" height="30" fill="${c1}"/><path d="M2 4 q6 -4 10 2 q4 6 -4 8 q-8 0 -6 -10z M18 14 q8 -2 10 6 q0 8 -8 6 q-6 -4 -2 -12z M4 20 q6 0 6 6 l-6 3z" fill="${c2}"/><path d="M14 2 q5 2 3 7 l-5 -2z M22 0 q4 4 0 6z M0 12 q4 2 2 6z M12 22 q4 -2 5 4 l-5 3z" fill="${shade(c1, -0.35)}"/>`,
        cord: `<rect width="6" height="6" fill="${c1}"/><rect width="1.6" height="6" fill="${shade(c1, -0.25)}"/>`,
        pinstripe: `<rect width="9" height="9" fill="${c1}"/><rect x="4" width="0.9" height="9" fill="${c2}" opacity=".85"/>`,
        sparkle: `<rect width="10" height="10" fill="${c1}"/><circle cx="2" cy="2" r="1.1" fill="#fff" opacity=".9"/><circle cx="7" cy="6" r="1.3" fill="${shade(c1, 0.55)}"/><circle cx="4" cy="8.5" r=".7" fill="${c2}"/>`,
        zebra: `<rect width="20" height="20" fill="${c1}"/><path d="M0 3 q8 3 20 -1 v3 q-10 4 -20 1z M0 11 q6 -3 12 1 q4 3 8 1 v3 q-6 2 -10 -1 q-5 -3 -10 0z M2 17 q8 2 14 0 l2 3 h-16z" fill="${c2}"/>`,
        floral: `<rect width="24" height="24" fill="${c1}"/>${[[6, 6], [18, 16]].map(([x, y]) => `${[0, 72, 144, 216, 288].map(a => `<ellipse cx="${x + 3.4 * Math.cos(a * Math.PI / 180)}" cy="${y + 3.4 * Math.sin(a * Math.PI / 180)}" rx="2.6" ry="2" fill="${c2}" transform="rotate(${a} ${x + 3.4 * Math.cos(a * Math.PI / 180)} ${y + 3.4 * Math.sin(a * Math.PI / 180)})"/>`).join('')}<circle cx="${x}" cy="${y}" r="1.4" fill="#ffd23f"/>`).join('')}<path d="M14 4 q4 -2 6 2 q-4 2 -6 -2z M2 18 q4 -2 6 2 q-4 2 -6 -2z" fill="${shade(c1, -0.3)}"/>`,
        psychedelic: `<rect width="28" height="28" fill="${c1}"/><path d="M0 7 q7 -7 14 0 t14 0 M0 21 q7 -7 14 0 t14 0" stroke="${c2}" stroke-width="4" fill="none"/><path d="M0 14 q7 7 14 0 t14 0" stroke="${shade(c1, 0.45)}" stroke-width="2.4" fill="none"/><circle cx="7" cy="14" r="2" fill="${shade(c2, 0.4)}"/><circle cx="21" cy="0" r="2" fill="${shade(c2, 0.4)}"/><circle cx="21" cy="28" r="2" fill="${shade(c2, 0.4)}"/>`,
      });
      const size = { stripes: 12, plaid: 16, leopard: 22, checker: 12, polka: 12, splatter: 26, stars: 18, camo: 30, cord: 6, pinstripe: 9, sparkle: 10, zebra: 20, floral: 24, psychedelic: 28 }[pat] || 12;
      this.defs.push(`<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${bodies[pat] || ''}</pattern>`);
      this.gradCache.set(key, id);
      return `url(#${id})`;
    }
  }

  /* ---------------------------------------------------------------- poses */
  // Arm A = viewer-left arm, arm B = viewer-right arm. Each: shoulder, elbow, hand points.
  function poseFor(a, b) {
    const sA = [CX - b.sw + 5, Y.shoulder + 4], sB = [CX + b.sw - 5, Y.shoulder + 4];
    const type = a.showInstrument === false ? 'none' : (a.instrument?.type || 'none');
    const P = {
      none:   { A: [sA, [CX - b.sw - 8, 156], [CX - b.sw - 4, 198]], B: [sB, [CX + b.sw + 8, 156], [CX + b.sw + 4, 198]] },
      guitar: { A: [sA, [CX - b.sw - 10, 156], [CX - 12, 188]],      B: [sB, [CX + b.sw + 14, 150], [CX + 66, 150]] },
      bass:   { A: [sA, [CX - b.sw - 10, 158], [CX - 10, 192]],      B: [sB, [CX + b.sw + 16, 146], [CX + 74, 142]] },
      keys:   { A: [sA, [CX - b.sw - 8, 162], [CX - 16, 192]],       B: [sB, [CX + b.sw + 12, 152], [CX + 50, 160]] },
      vocals: { A: [sA, [CX - b.sw - 22, 110], [CX - b.sw - 34, 66]], B: [sB, [CX + b.sw + 14, 146], [CX + 18, 108]] },
      drums:  { A: [sA, [CX - b.sw - 14, 150], [CX - 30, 176]],      B: [sB, [CX + b.sw + 14, 150], [CX + 30, 176]] },
      violin: { A: [sA, [CX - b.sw - 16, 140], [CX - 30, 118]],      B: [sB, [CX + b.sw + 12, 128], [CX + 46, 112]] },
    };
    const key = instKey(type, a.instrument?.model);
    const K = {   // model-specific poses
      stand:      { A: [sA, [CX - b.sw - 6, 150], [CX + 4, 112]], B: [sB, [CX + b.sw + 6, 150], [CX + 10, 120]] },
      harmonica:  { A: [sA, [CX - b.sw - 10, 128], [CX - 2, 94]], B: [sB, [CX + b.sw + 10, 128], [CX + 14, 94]] },
      cello:      { A: [sA, [CX - b.sw - 6, 140], [CX - 6, 136]], B: [sB, [CX + b.sw + 12, 178], [CX + 34, 210]] },
      harp:       { A: [sA, [CX - b.sw - 8, 160], [CX - 22, 186]], B: [sB, [CX + b.sw + 8, 150], [CX + 18, 168]] },
      sitar:      { A: [sA, [CX - b.sw - 10, 150], [CX - 24, 176]], B: [sB, [CX + b.sw + 14, 132], [CX + 58, 118]] },
      synth:      { A: [sA, [CX - b.sw - 6, 162], [CX - 28, 204]], B: [sB, [CX + b.sw + 6, 162], [CX + 28, 204]] },
      piano:      { A: [sA, [CX - b.sw - 6, 162], [CX - 28, 206]], B: [sB, [CX + b.sw + 6, 162], [CX + 28, 206]] },
      decks:      { A: [sA, [CX - b.sw - 6, 162], [CX - 34, 204]], B: [sB, [CX + b.sw + 6, 162], [CX + 34, 204]] },
      accordion:  { A: [sA, [CX - b.sw - 12, 152], [CX - 40, 178]], B: [sB, [CX + b.sw + 12, 152], [CX + 40, 178]] },
      trombone:   { A: [sA, [CX - b.sw - 12, 130], [CX - 2, 104]], B: [sB, [CX + b.sw + 16, 160], [CX + 22, 200]] },
      sax:        { A: [sA, [CX - b.sw - 8, 146], [CX + 2, 146]], B: [sB, [CX + b.sw + 10, 176], [CX + 16, 196]] },
      trumpet:    { A: [sA, [CX - b.sw - 4, 132], [CX + 18, 100]], B: [sB, [CX + b.sw + 18, 124], [CX + 36, 96]] },
      boombox:    { A: [sA, [CX - b.sw - 8, 156], [CX - b.sw - 4, 198]], B: [sB, [CX + b.sw + 26, 104], [CX + b.sw + 26, 70]] },
      marching:   { A: [sA, [CX - b.sw - 12, 158], [CX - 26, 190]], B: [sB, [CX + b.sw + 12, 158], [CX + 26, 190]] },
    };
    return { type, key, ...(K[key] || P[type] || P.none) };
  }
  /** Which drawing + pose a type/model pair uses. */
  function instKey(type, model) {
    if (type === 'vocals' && (model === 'stand' || model === 'vintagestand')) return 'stand';
    if (type === 'vocals' && model === 'harmonica') return 'harmonica';
    if (type === 'violin' && ['cello', 'harp', 'sitar'].includes(model)) return model;
    if (type === 'keys' && ['synth', 'piano', 'accordion'].includes(model)) return model;
    if (type === 'horns') return ['sax', 'trumpet'].includes(model) ? model : 'trombone';
    if (type === 'dj') return model === 'boombox' ? 'boombox' : 'decks';
    if (type === 'drums' && model === 'marching') return 'marching';
    return type;
  }
  // instruments whose far hand sits in front of the instrument
  const FRONT_ARM = new Set(['guitar', 'bass', 'cello', 'harp', 'sitar', 'synth', 'piano', 'decks', 'accordion', 'trombone', 'sax', 'trumpet', 'harmonica', 'boombox', 'marching']);

  /* ---------------------------------------------------------------- primitives */
  const limbPath = pts => `M${pts.map(p => p.join(' ')).join(' L')}`;
  const fx = p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

  /** Outline of a tapered limb through 2-3 joint points with rounded ends (shoulder→elbow→wrist, hip→knee→ankle). */
  function taper(pts, ws, { flatEnd = false } = {}) {
    const n = pts.length, L = [], R = [];
    const nrm = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    const dir = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    for (let i = 0; i < n; i++) {
      let v;
      if (i === 0) v = nrm(pts[0], pts[1]);
      else if (i === n - 1) v = nrm(pts[n - 2], pts[n - 1]);
      else { const a = nrm(pts[i - 1], pts[i]), b = nrm(pts[i], pts[i + 1]); v = [a[0] + b[0], a[1] + b[1]]; const l = Math.hypot(...v) || 1; v = [v[0] / l, v[1] / l]; }
      const h = ws[i] / 2;
      L.push([pts[i][0] + v[0] * h, pts[i][1] + v[1] * h]); R.push([pts[i][0] - v[0] * h, pts[i][1] - v[1] * h]);
    }
    const de = dir(pts[n - 2], pts[n - 1]), ds = dir(pts[1], pts[0]);
    const ke = ws[n - 1] / 2 * 1.33, ks = ws[0] / 2 * 1.33;
    let d = `M${fx(L[0])}`;
    for (let i = 1; i < n; i++) d += ` L${fx(L[i])}`;
    d += flatEnd ? ` L${fx(R[n - 1])}` : ` C${fx([L[n - 1][0] + de[0] * ke, L[n - 1][1] + de[1] * ke])} ${fx([R[n - 1][0] + de[0] * ke, R[n - 1][1] + de[1] * ke])} ${fx(R[n - 1])}`;
    for (let i = n - 2; i >= 0; i--) d += ` L${fx(R[i])}`;
    d += ` C${fx([R[0][0] + ds[0] * ks, R[0][1] + ds[1] * ks])} ${fx([L[0][0] + ds[0] * ks, L[0][1] + ds[1] * ks])} ${fx(L[0])} Z`;
    return d;
  }

  /**
   * Organic limb outline: a smooth body through 2-3 joints with muscle bulges.
   * ws = widths at each joint; bulge[i] = extra width at the peak of segment i; peak[i] = where on the segment (0..1).
   */
  function organic(pts, ws, { bulge = [], peak = [], flatEnd = false } = {}) {
    const N = 7, P = [], W = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], pk = clamp(peak[i] ?? 0.5, 0.08, 0.92), ex = Math.log(0.5) / Math.log(pk);
      for (let k = i ? 1 : 0; k <= N; k++) {
        const t = k / N;
        P.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        W.push(ws[i] + (ws[i + 1] - ws[i]) * t + (bulge[i] || 0) * Math.sin(Math.PI * Math.pow(t, ex)));
      }
    }
    const n = P.length, L = [], R = [];
    for (let j = 0; j < n; j++) {
      const p0 = P[Math.max(0, j - 1)], p1 = P[Math.min(n - 1, j + 1)];
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, h = W[j] / 2;
      L.push([P[j][0] + nx * h, P[j][1] + ny * h]); R.push([P[j][0] - nx * h, P[j][1] - ny * h]);
    }
    const smooth = Q => {               // Catmull-Rom through the points → cubic Béziers
      let d = '';
      for (let i = 0; i < Q.length - 1; i++) {
        const q0 = Q[Math.max(0, i - 1)], q1 = Q[i], q2 = Q[i + 1], q3 = Q[Math.min(Q.length - 1, i + 2)];
        d += ` C${fx([q1[0] + (q2[0] - q0[0]) / 6, q1[1] + (q2[1] - q0[1]) / 6])} ${fx([q2[0] - (q3[0] - q1[0]) / 6, q2[1] - (q3[1] - q1[1]) / 6])} ${fx(q2)}`;
      }
      return d;
    };
    const dir = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const de = dir(P[n - 2], P[n - 1]), ds = dir(P[1], P[0]), ke = W[n - 1] / 2 * 1.33, ks = W[0] / 2 * 1.33;
    let d = `M${fx(L[0])}` + smooth(L);
    d += flatEnd ? ` L${fx(R[n - 1])}` : ` C${fx([L[n - 1][0] + de[0] * ke, L[n - 1][1] + de[1] * ke])} ${fx([R[n - 1][0] + de[0] * ke, R[n - 1][1] + de[1] * ke])} ${fx(R[n - 1])}`;
    d += smooth(R.slice().reverse());
    d += ` C${fx([R[0][0] + ds[0] * ks, R[0][1] + ds[1] * ks])} ${fx([L[0][0] + ds[0] * ks, L[0][1] + ds[1] * ks])} ${fx(L[0])} Z`;
    return d;
  }
  /** Muscle shapes for bare arms and legs (bicep + forearm, thigh + calf), scaled by the muscle slider. */
  const armShape = b => ({ ws: [b.arm * 1.3, b.arm * 0.84, b.arm * 0.68], bulge: [b.arm * 0.5 * b.muscle + 1, b.arm * 0.36 * b.muscle + 0.8], peak: [0.42, 0.24] });
  const legShape = b => ({ ws: [b.leg * 1.4, b.leg * 0.86, b.leg * 0.64], bulge: [b.leg * 0.3 * b.muscle + 1.5, b.leg * 0.34 * b.muscle + 1.2], peak: [0.35, 0.3] });

  /** Cel shading: a hard shadow crescent on the lower-right of any shape (works with patterns too). */
  function cel(d, { dx = -4, dy = -3, op = 0.22 } = {}) {
    const id = `${CUR.id}k${CUR.k = (CUR.k || 0) + 1}`;
    return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})" pointer-events="none">` +
      `<path d="M-999 -999H999V999H-999Z ${d}" fill-rule="evenodd" fill="${INK}" opacity="${op}" transform="translate(${dx} ${dy})"/></g>`;
  }
  /** Filled shape + cel shadow + bold outline. */
  function shape(d, fill, sw = 3.2, celOpt) {
    return `<path d="${d}" fill="${fill}"/>${celOpt === false ? '' : cel(d, celOpt)}<path d="${d}" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  }
  function limb(pts, w, fill, outline = true, opts = {}) {
    const ws = opts.ws || (pts.length === 3 ? [w * 1.18, w * 0.94, w * 0.8] : [w * 1.12, w * 0.92]);
    const d = organic(pts, ws, opts);
    return outline ? shape(d, fill, opts.sw || 3) : `<path d="${d}" fill="${fill}"/>`;
  }
  const mid = (p, q, t = 0.5) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const ang = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;

  /* ---------------------------------------------------------------- body */
  function torsoPath(b) {
    const { sw, ww, hw, bust } = b, cp = (b.chestPad || 0) + b.muscle * 2.5, trap = 8 + b.muscle * 5;
    return `M${CX - sw} ${Y.shoulder}
      C${CX - sw - 3 - cp} ${Y.chest - 10 + bust} ${CX - sw + 2 - bust - cp} ${Y.chest + 6} ${CX - ww} ${Y.waist}
      Q${CX - hw - 2} ${Y.hip - 8} ${CX - hw} ${Y.hip} L${CX - hw + 3} ${Y.crotch + 2} L${CX + hw - 3} ${Y.crotch + 2} L${CX + hw} ${Y.hip}
      Q${CX + hw + 2} ${Y.hip - 8} ${CX + ww} ${Y.waist}
      C${CX + sw - 2 + bust + cp} ${Y.chest + 6} ${CX + sw + 3 + cp} ${Y.chest - 10 + bust} ${CX + sw} ${Y.shoulder}
      Q${CX + sw * 0.55} ${Y.shoulder - trap} ${CX} ${Y.shoulder - trap - 1} Q${CX - sw * 0.55} ${Y.shoulder - trap} ${CX - sw} ${Y.shoulder} Z`;
  }
  /** Hip → knee → ankle for each leg. Stances: relaxed (straight), wide (rock stance), power (deep, knees out). */
  function legPoints(b, stance = 'wide') {
    const off = b.hw * 0.5;
    const [kx, ky, ax] = { relaxed: [2, 0, -1], wide: [12, -4, 21], power: [18, -9, 32] }[stance] || [2, 0, -1];
    return {
      L: [[CX - off, Y.crotch - 8], [CX - off - kx, Y.knee + ky], [CX - off - ax, Y.ankle]],
      R: [[CX + off, Y.crotch - 8], [CX + off + kx, Y.knee + ky], [CX + off + ax, Y.ankle]],
    };
  }
  /** How a garment hangs: skinny, regular or baggy. Items can carry their own default. */
  const DEFAULT_FIT = { skinny: 'skinny', leather: 'skinny', cargo: 'baggy', hoodie: 'regular', trackpants: 'baggy', harem: 'baggy', patched: 'regular', overalls: 'regular' };
  const fitOf = it => (['skinny', 'regular', 'baggy'].includes(it?.fit) ? it.fit : DEFAULT_FIT[it?.id] || 'regular');

  function drawLegs(c) {
    const { b } = c, legs = c.legs, skin = c.grad(c.skin);
    let s = limb(legs.L, b.leg, skin, true, legShape(b)) + limb(legs.R, b.leg, skin, true, legShape(b));
    s += tattoosOn(c, ['legL', 'legR']);
    const lw = c.a.outfit?.legwear?.id;
    if (lw && lw !== 'none') {
      const col = safe(c.a.outfit.legwear.color || '#121216');
      for (const L of [legs.L, legs.R]) {
        if (lw === 'tights') s += limb(L, b.leg + 0.5, col, false, { ...legShape(b), ws: legShape(b).ws.map(w => w + 1) });
        if (lw === 'fishnets') s += `<path d="${limbPath(L)}" stroke="${col}" stroke-width="${b.leg}" stroke-dasharray="1.2 2.4" stroke-linecap="round" fill="none" opacity=".85"/>`;
        if (lw === 'socks') { const a0 = mid(L[1], L[2], 0.72); s += limb([a0, L[2]], b.leg * 0.72, '#f4f1ea', true, { ws: [b.leg * 0.74, b.leg * 0.7], flatEnd: true, sw: 2 }) + `<path d="${limbPath([mid(a0, L[2], 0.15), mid(a0, L[2], 0.3)])}" stroke="${col === '#121216' ? '#d62828' : col}" stroke-width="${b.leg * 0.72}" fill="none"/>`; }
        if (lw === 'striped') s += `<path d="${limbPath([mid(L[1], L[2], 0.35), L[2]])}" stroke="${col}" stroke-width="${b.leg + 1}" stroke-dasharray="3 3" fill="none"/>`;
      }
    }
    return s;
  }

  function drawBottoms(c) {
    const it = c.a.outfit?.bottom; if (!it) return '';
    const { b } = c, legs = c.legs, f = c.fabric(it), fit = fitOf(it), w = b.leg + (fit === 'baggy' ? 13 : fit === 'skinny' ? 3 : 7);
    const hx = b.hw + (fit === 'baggy' ? 5 : 0);
    const hipBand = shape(`M${CX - hx - 1} ${Y.hip - 10} L${CX + hx + 1} ${Y.hip - 10} L${CX + hx + 2} ${Y.crotch + 8} L${CX - hx - 2} ${Y.crotch + 8} Z`, f, 3.2)
      + `<path d="M${CX - hx + 3} ${Y.hip - 6} q6 10 14 9 M${CX + hx - 3} ${Y.hip - 6} q-6 10 -14 9 M${CX} ${Y.hip - 7} v14" stroke="${INK}" stroke-width="1.3" fill="none" opacity=".5"/>`;
    const belt = drawBelt(c, hx);
    const lb = b.leg;
    const fitWs = { skinny: [lb * 1.5, lb * 0.98, lb * 0.82], regular: [lb * 1.55 + 4, lb * 1.12 + 4, lb * 1.0 + 5], baggy: [lb * 1.6 + 12, lb * 1.55 + 10, lb * 1.6 + 12] }[fit];
    const pantLeg = L => fit === 'baggy' ? [L[0], L[1], [L[2][0], L[2][1] + 7]] : L;
    const fullLeg = L => limb(pantLeg(L), w, f, true, { ws: fitWs, bulge: fit === 'skinny' ? [lb * 0.2 * b.muscle, lb * 0.18 * b.muscle] : [], peak: [0.35, 0.3], flatEnd: fit === 'baggy' });
    let s = '';
    switch (it.id) {
      case 'shorts':
        s = limb([legs.L[0], mid(legs.L[0], legs.L[1], 0.45)], w + 2, f) + limb([legs.R[0], mid(legs.R[0], legs.R[1], 0.45)], w + 2, f) + hipBand + belt;
        s += `<path d="M${CX - b.hw - 4} ${Y.crotch + 24} l4 3 l3 -3 l3 3" stroke="#e8e2d6" stroke-width="1.2" fill="none"/>`;
        break;
      case 'skirt': case 'kilt': case 'tutu': {
        const len = it.id === 'kilt' ? 64 : 42, flare = it.id === 'tutu' ? 22 : 12;
        if (it.id === 'tutu') {
          for (let i = 0; i < 3; i++) s += `<path d="M${CX - b.hw - 2} ${Y.hip - 10} L${CX + b.hw + 2} ${Y.hip - 10} L${CX + b.hw + flare - i * 3} ${Y.hip + len - i * 8}
            ${zigzag(CX + b.hw + flare - i * 3, CX - b.hw - flare + i * 3, Y.hip + len - i * 8)} Z" fill="${f}" stroke="${INK}" stroke-width="1.6" opacity="${0.75 + i * 0.1}"/>`;
        } else {
          s = `<path d="M${CX - b.hw - 1} ${Y.hip - 10} L${CX + b.hw + 1} ${Y.hip - 10} L${CX + b.hw + flare} ${Y.hip + len} L${CX - b.hw - flare} ${Y.hip + len} Z"
            fill="${f}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
          if (it.id === 'kilt') s += [-12, -4, 4, 12].map(x => `<path d="M${CX + x} ${Y.hip} L${CX + x * 1.4} ${Y.hip + len}" stroke="${INK}" stroke-width=".8" opacity=".4"/>`).join('');
        }
        s += belt;
        break;
      }
      case 'gown': {
        const W = b.hw + 44, top = Y.waist - 4;
        const d = `M${CX - b.ww - 1} ${top} C${CX - b.hw - 4} ${Y.hip + 10} ${CX - W + 10} ${Y.knee} ${CX - W} ${Y.foot - 2}
          Q${CX - W / 2} ${Y.foot + 8} ${CX} ${Y.foot + 2} Q${CX + W / 2} ${Y.foot + 8} ${CX + W} ${Y.foot - 2}
          C${CX + W - 10} ${Y.knee} ${CX + b.hw + 4} ${Y.hip + 10} ${CX + b.ww + 1} ${top} Z`;
        s = shape(d, f, 3.2, { dx: -6, dy: 0, op: 0.2 });
        s += [-0.55, -0.2, 0.2, 0.55].map(t => `<path d="M${CX + t * b.hw} ${Y.hip + 6} Q${CX + t * W * 0.9} ${Y.knee} ${CX + t * W * 1.05} ${Y.foot}" stroke="${INK}" stroke-width="1.5" fill="none" opacity=".4"/>`).join('');
        s += `<path d="M${CX - W + 4} ${Y.foot - 8} ${[...Array(10)].map((_, i) => `q${W / 10} 10 ${W / 5} 0`).join(' ')}" stroke="${shade(safe(it.color), 0.35)}" stroke-width="2.2" fill="none"/>`;
        s += `<path d="M${CX - b.ww - 1} ${top} Q${CX} ${top + 8} ${CX + b.ww + 1} ${top}" stroke="${INK}" stroke-width="2.4" fill="none"/>`;
        break;
      }
      case 'longskirt':
        s = `<path d="M${CX - b.hw - 1} ${Y.hip - 10} L${CX + b.hw + 1} ${Y.hip - 10} Q${CX + b.hw + 16} ${Y.knee} ${CX + b.hw + 20} ${Y.ankle - 4}
          L${CX - b.hw - 20} ${Y.ankle - 4} Q${CX - b.hw - 16} ${Y.knee} ${CX - b.hw - 1} ${Y.hip - 10} Z" fill="${f}" stroke="${INK}" stroke-width="3"/>` + belt;
        break;
      case 'flares':
        s = fullLeg(legs.L) + fullLeg(legs.R) + hipBand + belt;
        for (const L of [legs.L, legs.R]) {
          const [x, y] = L[2];
          s += `<path d="M${x - w / 2} ${y - 30} L${x - w / 2 - 9} ${y + 2} L${x + w / 2 + 9} ${y + 2} L${x + w / 2} ${y - 30} Z" fill="${f}" stroke="${INK}" stroke-width="2"/>`;
        }
        break;
      case 'harem': {
        const ws = [lb * 1.8 + 12, lb * 2 + 14, lb * 0.95 + 4];
        for (const L of [legs.L, legs.R]) s += limb(L, w, f, true, { ws, bulge: [6, 4], peak: [0.6, 0.15] });
        s += hipBand + `<rect x="${CX - hx - 2}" y="${Y.hip - 13}" width="${hx * 2 + 4}" height="8" rx="3" fill="${shade(safe(it.color), -0.2)}" stroke="${INK}" stroke-width="1.8"/>`;
        for (const L of [legs.L, legs.R]) {
          s += `<rect x="${L[2][0] - ws[2] * 0.55}" y="${L[2][1] - 8}" width="${ws[2] * 1.1}" height="8" rx="3" fill="${shade(safe(it.color), -0.2)}" stroke="${INK}" stroke-width="1.8"/>`;
          s += `<path d="M${L[1][0] - 8} ${L[1][1] - 16} q6 8 4 18 M${L[1][0] + 6} ${L[1][1] - 10} q4 10 -2 20" stroke="${INK}" stroke-width="1.4" fill="none" opacity=".45"/>`;
        }
        break;
      }
      default: // skinny, ripped, cargo, leather, trackpants, patched, overalls
        s = fullLeg(legs.L) + fullLeg(legs.R) + hipBand + (it.id === 'overalls' ? '' : belt);
        for (const [i, L] of [legs.L, legs.R].entries()) {
          const sg = i ? 1 : -1;
          if (it.id !== 'leather') s += `<path d="M${L[0][0] + sg * w * 0.42} ${L[0][1] + 6} L${L[1][0] + sg * w * 0.36} ${L[1][1]} L${L[2][0] + sg * w * 0.3} ${L[2][1] - 4}" stroke="${shade(safe(it.color), 0.4)}" stroke-width="1" stroke-dasharray="2.2 1.8" fill="none"/>`;
          const a2 = L[2];
          if (fit === 'baggy') {
            // fabric stacking over the shoe + a long drape crease
            s += [0, 7, 13].map(dy => `<path d="M${a2[0] - fitWs[2] * 0.36} ${a2[1] - 14 + dy} q${fitWs[2] * 0.2} 4 ${fitWs[2] * 0.36} -1 q${fitWs[2] * 0.18} -4 ${fitWs[2] * 0.34} 1" stroke="${INK}" stroke-width="1.5" fill="none" opacity=".55" stroke-linecap="round"/>`).join('');
            s += `<path d="M${L[0][0] - sg * 4} ${L[0][1] + 18} Q${L[1][0] - sg * 6} ${L[1][1] - 10} ${L[1][0] - sg * 2} ${L[1][1] + 16}" stroke="${INK}" stroke-width="1.4" fill="none" opacity=".45" stroke-linecap="round"/>`;
          } else {
            s += `<rect x="${a2[0] - w * 0.42}" y="${a2[1] - 6}" width="${w * 0.84}" height="6" rx="2" fill="${shade(safe(it.color), 0.15)}" stroke="${INK}" stroke-width="1.8"/>`;
          }
          // knee crease
          s += `<path d="M${L[1][0] - 4} ${L[1][1] - 2} q4 3 8 0" stroke="${INK}" stroke-width="1.1" fill="none" opacity=".45"/>`;
        }
        if (it.id === 'ripped') for (const L of [legs.L, legs.R]) {
          const k = mid(L[0], L[1], 0.82), k2 = mid(L[1], L[2], 0.45);
          for (const [p, sz] of [[k, 1], [k2, 0.7]]) {
            s += `<path d="M${p[0] - 6 * sz} ${p[1] - 3 * sz} l3 -2 l3 1.5 l3 -1.5 l3 2 l-1 5 l-3 1 l-3 -1 l-3 1 z" fill="${c.skin}" stroke="${INK}" stroke-width="1.2"/>
              <path d="M${p[0] - 6 * sz} ${p[1] - 1} h${12 * sz} M${p[0] - 5 * sz} ${p[1] + 1.5} h${10 * sz}" stroke="#f1ede6" stroke-width="1.1"/>`;
          }
        }
        if (it.id === 'cargo') for (const L of [legs.L, legs.R]) {
          const p = mid(L[0], L[1], 0.72), pw = fit === 'baggy' ? 16 : 12, sg = L === legs.L ? -1 : 1;
          s += `<rect x="${p[0] - pw / 2 + sg * 3}" y="${p[1] - pw / 2}" width="${pw}" height="${pw * 1.1}" rx="2" fill="${shade(safe(it.color), -0.12)}" stroke="${INK}" stroke-width="2"/>
            <path d="M${p[0] - pw / 2 + sg * 3} ${p[1] - pw / 2 + 4} h${pw}" stroke="${INK}" stroke-width="1.6"/>`;
        }
        if (it.id === 'trackpants') for (const [i, L] of [legs.L, legs.R].entries()) {
          const sg = i ? 1 : -1, off = pt => [pt[0] + sg * fitWs[0] * 0.36, pt[1]];
          s += `<path d="M${fx(off(L[0]))} L${fx([L[1][0] + sg * fitWs[1] * 0.4, L[1][1]])} L${fx([L[2][0] + sg * fitWs[2] * 0.36, L[2][1]])}" stroke="#f2efe8" stroke-width="2.6" fill="none"/>
            <path d="M${fx([L[0][0] + sg * fitWs[0] * 0.28, L[0][1]])} L${fx([L[1][0] + sg * fitWs[1] * 0.32, L[1][1]])} L${fx([L[2][0] + sg * fitWs[2] * 0.28, L[2][1]])}" stroke="#f2efe8" stroke-width="2.6" fill="none"/>`;
        }
        if (it.id === 'patched') for (const [i, L] of [legs.L, legs.R].entries()) {
          const p = mid(L[i ? 1 : 0], L[i ? 2 : 1], 0.55), pc = ['#5f8f3a', '#b3472e', '#c9a227'][i];
          s += `<rect x="${p[0] - 8}" y="${p[1] - 8}" width="16" height="15" rx="1.5" fill="${pc}" stroke="${INK}" stroke-width="1.8" transform="rotate(${i ? 8 : -6} ${p[0]} ${p[1]})"/>
            <rect x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="11" fill="none" stroke="#f2efe8" stroke-width=".9" stroke-dasharray="1.6 1.4" transform="rotate(${i ? 8 : -6} ${p[0]} ${p[1]})"/>`;
        }
        if (it.id === 'leather') for (const L of [legs.L, legs.R]) s += `<path d="${limbPath([L[0], L[1]])}" stroke="#fff" stroke-width="2" opacity=".18" fill="none" transform="translate(-3 0)"/>`;
    }
    return s;
  }
  /** Overalls bib and straps (drawn over the top). */
  function drawBib(c) {
    const it = c.a.outfit?.bottom; if (it?.id !== 'overalls') return '';
    const { b } = c, f = c.fabric(it), col = safe(it.color), bw = Math.max(16, b.ww - 6);
    let s = shape(`M${CX - bw} ${Y.chest + 2} L${CX + bw} ${Y.chest + 2} L${CX + bw + 3} ${Y.hip - 4} L${CX - bw - 3} ${Y.hip - 4} Z`, f, 3);
    s += `<rect x="${CX - 9}" y="${Y.chest + 10}" width="18" height="14" rx="2" fill="${shade(col, -0.12)}" stroke="${INK}" stroke-width="1.8"/>`;
    for (const sg of [-1, 1]) {
      s += `<path d="M${CX + sg * (bw - 3)} ${Y.chest + 4} L${CX + sg * (b.sw - 12)} ${Y.shoulder - 4}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M${CX + sg * (bw - 3)} ${Y.chest + 4} L${CX + sg * (b.sw - 12)} ${Y.shoulder - 4}" stroke="${col}" stroke-width="5.5" stroke-linecap="round"/>`;
      s += `<circle cx="${CX + sg * (bw - 4)}" cy="${Y.chest + 6}" r="3" fill="#d6b65c" stroke="${INK}" stroke-width="1.2"/>`;
    }
    s += `<path d="M${CX - bw + 3} ${Y.chest + 6} h${bw * 2 - 6}" stroke="${shade(col, 0.4)}" stroke-width="1" stroke-dasharray="2 2"/>`;
    return s;
  }

  /** Belts: plain, studded, wallet chain, bullet belt, pyramid studs. */
  function drawBelt(c, hx) {
    const it = c.a.outfit?.belt, id = it?.id || 'none', col = safe(it?.color || '#141014');
    const x0 = CX - hx - 1, wd = hx * 2 + 2, y = Y.hip - 12;
    let s = `<rect x="${x0}" y="${y}" width="${wd}" height="6" rx="2" fill="${id === 'none' ? '#141014' : col}" stroke="${INK}" stroke-width="1.6"/>`;
    if (id === 'studded') for (let x = x0 + 4; x < x0 + wd - 2; x += 5) s += `<circle cx="${x}" cy="${y + 3}" r="1.3" fill="#dfe3ea"/>`;
    if (id === 'pyramid') for (let x = x0 + 3; x < x0 + wd - 3; x += 6) s += `<path d="M${x} ${y + 5} l2.5 -4 2.5 4z" fill="#dfe3ea" stroke="${INK}" stroke-width=".5"/>`;
    if (id === 'bullet') for (let x = x0 + 3; x < x0 + wd - 3; x += 4) s += `<rect x="${x}" y="${y - 2}" width="2.6" height="9" rx="1.2" fill="#e3b94c" stroke="${INK}" stroke-width=".6"/>`;
    s += `<rect x="${CX - 4}" y="${y - 0.5}" width="8" height="7" rx="1" fill="#c9ccd6" stroke="${INK}" stroke-width="1.2"/>`;
    if (id === 'chain') {
      const a = [CX + hx - 8, y + 6], b2 = [CX + hx + 6, Y.crotch + 34], e = [CX + hx + 3, y + 8];
      const d = `M${a[0]} ${a[1]} Q${a[0] - 4} ${b2[1]} ${b2[0]} ${b2[1]} Q${b2[0] + 6} ${b2[1] - 10} ${e[0]} ${e[1]}`;
      s += `<path d="${d}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#c9ccd6" stroke-width="3" stroke-dasharray="3.2 1.6" fill="none"/>`;
    }
    return s;
  }
  function zigzag(x1, x2, y) {
    let d = '', n = 8;
    for (let i = 1; i <= n; i++) { const x = x1 + (x2 - x1) * i / n; d += ` L${x} ${y + (i % 2 ? 6 : 0)}`; }
    return d;
  }

  function drawShoes(c) {
    const it = c.a.outfit?.shoes, id = it?.id || 'sneakers';
    const legs = c.legs, col = safe(it?.color || '#121216'), splay = c.stance !== 'relaxed';
    const o = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"`;
    let s = '';
    for (const L of [legs.L, legs.R]) {
      const x = L[2][0], F = Y.foot, mirror = splay && L === legs.L;
      if (id === 'sandals') {
        let g = `<rect x="${x - 12}" y="${F - 4}" width="38" height="4" rx="2" fill="#6b4a2b" stroke="${INK}" stroke-width="1.8"/>`;
        g += shape(`M${x - 9} ${F - 4} Q${x + 2} ${F - 12} ${x + 15} ${F - 6} Q${x + 24} ${F - 4} ${x + 22} ${F - 4} Z`, c.skin, 2);
        g += `<path d="M${x + 4} ${F - 9} L${x - 2} ${F - 4} M${x + 4} ${F - 9} L${x + 12} ${F - 4}" stroke="${col}" stroke-width="2.6"/>`;
        s += `<g transform="translate(${x} ${F}) scale(${mirror ? -1.24 : 1.24} 1.24) translate(${-x} ${-F})">${g}</g>`; continue;
      }
      if (id === 'curled') {
        const g = shape(`M${x - 12} ${F} L${x - 12} ${F - 10} Q${x + 4} ${F - 16} ${x + 18} ${F - 6} Q${x + 28} ${F - 4} ${x + 28} ${F - 12} Q${x + 34} ${F - 8} ${x + 26} ${F} Z`, col, 2.2)
          + `<path d="M${x - 8} ${F - 10} q10 -4 20 2" stroke="#e3b94c" stroke-width="1.6" fill="none"/>`;
        s += `<g transform="translate(${x} ${F}) scale(${mirror ? -1.24 : 1.24} 1.24) translate(${-x} ${-F})">${g}</g>`; continue;
      }
      if (id === 'barefoot') { s += shape(`M${x - 9} ${F - 8} Q${x + 2} ${F - 12} ${x + 15} ${F - 4} Q${x + 15} ${F} ${x + 10} ${F} L${x - 9} ${F} Z`, c.skin, 2.2); continue; }
      const sole = id === 'platforms' ? 14 : id === 'moonboots' ? 10 : id === 'creepers' ? 8 : id === 'boots' ? 6 : 5;
      const shaft = { boots: 40, cowboy: 34, platforms: 46, hightops: 20, moonboots: 38 }[id] || 0;
      const top = F - sole, wd = id === 'moonboots' ? 15 : 13;
      let g = '';
      if (shaft) g += shape(`M${x - wd + 1} ${top - shaft} L${x + wd - 1} ${top - shaft} L${x + wd + 1} ${top - 6} L${x - wd - 1} ${top - 6} Z`, col, 2.4);
      // foot / toe box
      g += shape(`M${x - wd} ${top - 14} Q${x + 2} ${top - 20} ${x + 14} ${top - 9} Q${x + 24} ${top - 5} ${x + 23} ${top} L${x - wd - 1} ${top} Z`, col, 2.4);
      // sole with tread
      const soleCol = id === 'hightops' || id === 'sneakers' ? '#f2efe8' : '#18141a';
      g += `<rect x="${x - wd - 2}" y="${top}" width="${wd + 27}" height="${sole}" rx="3" fill="${soleCol}" ${o}/>`;
      if (soleCol === '#18141a') g += [...Array(6)].map((_, i) => `<rect x="${x - wd + 1 + i * 6}" y="${F - 2.4}" width="3" height="2.4" fill="#3a3340"/>`).join('');
      else g += `<line x1="${x - wd - 1}" y1="${top + sole * 0.45}" x2="${x + 24}" y2="${top + sole * 0.45}" stroke="${shade(col, -0.1)}" stroke-width="1.4"/>`;
      if (id === 'boots' || id === 'platforms' || id === 'hightops') {
        // laces: eyelets + criss-cross
        const y0 = top - shaft + 5, y1 = top - 12;
        for (let y = y0; y < y1; y += 6) g += `<path d="M${x - 4} ${y} L${x + 4} ${y + 6} M${x + 4} ${y} L${x - 4} ${y + 6}" stroke="#e9e4da" stroke-width="1.4"/><circle cx="${x - 4.5}" cy="${y}" r="1" fill="#c9ccd6"/><circle cx="${x + 4.5}" cy="${y}" r="1" fill="#c9ccd6"/>`;
        g += `<path d="M${x - wd + 1} ${top - shaft + 3} H${x + wd - 1}" stroke="${shade(col, -0.35)}" stroke-width="3"/>`;
      }
      if (id === 'sneakers' || id === 'hightops') {
        g += `<path d="M${x + 6} ${top - 2} Q${x + 14} ${top - 9} ${x + 22} ${top - 2} Z" fill="#f2efe8" ${o}/>`;
        g += `<path d="M${x - 6} ${top - 9} q8 -6 16 2" stroke="${shade(col, 0.55)}" stroke-width="2.4" fill="none"/>`;
        g += `<path d="M${x + 13} ${top - 1} Q${x + 18} ${top - 10} ${x + 23} ${top - 1}" fill="${shade(col, 0.6)}" stroke="${INK}" stroke-width="1.6"/>`;   // toe cap
        if (id === 'sneakers') g += [0, 1, 2].map(i => `<line x1="${x - 1 + i * 3}" y1="${top - 15 + i}" x2="${x + 4 + i * 3}" y2="${top - 13 + i}" stroke="#e9e4da" stroke-width="1.2"/>`).join('');
        if (id === 'hightops') g += `<circle cx="${x - 3}" cy="${top - shaft + 12}" r="3.6" fill="#f2efe8" ${o}/>`;
      }
      if (id === 'cowboy') g += `<path d="M${x - 6} ${top - 26} q6 -7 12 0 M${x - 5} ${top - 16} q5 -5 10 0" stroke="${shade(col, 0.45)}" stroke-width="1.4" fill="none"/><path d="M${x - wd - 2} ${F} l6 -6 h6 v6 z" fill="#18141a"/>`;
      if (id === 'moonboots') g += [0, 1, 2].map(i => `<path d="M${x - wd + 2} ${top - shaft + 8 + i * 12} H${x + wd - 2}" stroke="${safe(it?.color2 || '#29e0e0')}" stroke-width="2.6"/>`).join('') + `<rect x="${x - wd - 2}" y="${F - 3}" width="${wd + 27}" height="3" fill="${safe(it?.color2 || '#29e0e0')}"/>`;
      if (id === 'creepers') g += `<path d="M${x - wd} ${top - 8} h${wd + 16}" stroke="${shade(col, 0.4)}" stroke-width="1.6" stroke-dasharray="2 2"/>`;
      const k = id === 'sneakers' || id === 'hightops' ? 1.34 : 1.24;
      s += `<g transform="translate(${x} ${F}) scale(${mirror ? -k : k} ${k}) translate(${-x} ${-F})">${g}</g>`;
    }
    return s;
  }

  function drawTorso(c) {
    const b = c.b, k = shade(c.skin, -0.32);
    let s = shape(torsoPath(b), c.skin);
    if (b.muscle > 0.5 && b.bust < 2) {        // pecs + abs, only visible when the top shows skin
      const o = clamp((b.muscle - 0.5) * 1.2, 0.25, 0.8);
      s += `<path d="M${CX - b.sw + 9} ${Y.chest - 4} Q${CX - 12} ${Y.chest + 10} ${CX - 2} ${Y.chest + 2} M${CX + b.sw - 9} ${Y.chest - 4} Q${CX + 12} ${Y.chest + 10} ${CX + 2} ${Y.chest + 2}
        M${CX} ${Y.chest + 8} V${Y.waist + 8} M${CX - 9} ${Y.chest + 22} h7 M${CX + 2} ${Y.chest + 22} h7 M${CX - 9} ${Y.chest + 34} h7 M${CX + 2} ${Y.chest + 34} h7"
        stroke="${k}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="${o}"/>`;
    }
    return s;
  }

  function drawTop(c) {
    const it = c.a.outfit?.top; if (!it || it.id === 'none') return '';
    const fit = fitOf(it), special = ['fishnet', 'mesh', 'corset', 'crop'].includes(it.id);
    const grow = special ? 0 : fit === 'baggy' ? 6 : fit === 'skinny' ? -1 : 2;
    const b = { ...c.b, sw: c.b.sw + grow * 0.6, ww: c.b.ww + grow * 1.2, hw: c.b.hw + grow * 1.1 };
    const clip = `${c.id}tc`, f = c.fabric(it), col = safe(it.color);
    c.defs.push(`<clipPath id="${clip}"><path d="${torsoPath(b)}"/></clipPath>`);
    const bottomY = it.id === 'crop' ? Y.chest + 14 : it.id === 'corset' ? Y.hip - 4 : Y.hip + 4 + (fit === 'baggy' ? 8 : 0);
    const topY = it.id === 'tank' || it.id === 'mesh' || it.id === 'corset' ? Y.shoulder + 4 : Y.shoulder - 12;
    let s = `<g clip-path="url(#${clip})">`;
    if (it.id === 'fishnet' || it.id === 'mesh') {
      s += `<rect x="${CX - 60}" y="${topY}" width="120" height="${bottomY - topY}" fill="none" stroke="${col}" stroke-width="${b.sw * 2.2}" stroke-dasharray="1.4 2.8" opacity=".9"/>`;
      // dashed fill trick: draw hatch lines
      for (let y = topY; y < bottomY; y += 4) s += `<line x1="${CX - 60}" y1="${y}" x2="${CX + 60}" y2="${y + 8}" stroke="${col}" stroke-width=".9"/><line x1="${CX - 60}" y1="${y + 8}" x2="${CX + 60}" y2="${y}" stroke="${col}" stroke-width=".9"/>`;
    } else {
      s += `<rect x="${CX - 60}" y="${topY}" width="120" height="${bottomY - topY}" fill="${f}"/>`;
      if (it.id === 'tank') s += `<path d="M${CX - b.sw} ${Y.shoulder - 4} L${CX - b.sw + 10} ${Y.shoulder + 8} L${CX + b.sw - 10} ${Y.shoulder + 8} L${CX + b.sw} ${Y.shoulder - 4} Z" fill="${c.grad(c.skin)}"/>`;
      if (it.id === 'corset') {
        s += `<path d="M${CX - b.sw} ${Y.shoulder + 4} Q${CX} ${Y.chest - 10} ${CX + b.sw} ${Y.shoulder + 4} L${CX + b.sw} ${Y.shoulder - 20} L${CX - b.sw} ${Y.shoulder - 20} Z" fill="${c.grad(c.skin)}"/>`;
        for (let y = Y.chest - 6; y < Y.hip - 10; y += 9) s += `<path d="M${CX - 4} ${y} L${CX + 4} ${y + 6} M${CX + 4} ${y} L${CX - 4} ${y + 6}" stroke="${shade(col, 0.5)}" stroke-width="1.2"/>`;
        s += [-14, 14].map(x => `<line x1="${CX + x}" y1="${Y.chest}" x2="${CX + x * 0.8}" y2="${Y.hip}" stroke="${INK}" stroke-width=".8" opacity=".5"/>`).join('');
      }
      if (it.id === 'collar') {
        s += `<path d="M${CX - 11} ${Y.shoulder - 8} L${CX} ${Y.chest + 6} L${CX + 11} ${Y.shoulder - 8} Z" fill="${c.skin}"/>`;
        s += [-1, 1].map(sg => `<path d="M${CX + sg * 9} ${Y.shoulder - 9} L${CX + sg * 24} ${Y.shoulder - 5} L${CX + sg * 9} ${Y.chest - 4} L${CX + sg * 1} ${Y.chest + 6} Z" fill="${shade(col, 0.14)}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`).join('');
        for (let y = Y.chest + 14; y < Y.hip; y += 13) s += `<circle cx="${CX + 2}" cy="${y}" r="1.7" fill="${shade(col, -0.45)}"/>`;
        s += `<path d="M${CX + 2} ${Y.chest + 6} V${Y.hip + 4}" stroke="${INK}" stroke-width="1.2" opacity=".5"/>`;
      }
      if (it.id === 'sleeveless') {
        s += `<path d="M${CX - 50} ${bottomY} ${[...Array(12)].map((_, i) => `L${CX - 50 + (i + 0.5) * 100 / 12} ${bottomY - (i % 2 ? 2 : 7)}`).join(' ')} L${CX + 50} ${bottomY}" stroke="${INK}" stroke-width="1.8" fill="none"/>`;
        s += `<path d="M${CX + 8} ${Y.chest + 6} l4 6 -3 4 5 3 M${CX - 18} ${Y.waist - 10} l5 3 -2 5" stroke="${c.skin}" stroke-width="3.4" fill="none"/>`;
      }
      if (it.id === 'ripped') s += `<path d="M${CX - 12} ${Y.chest + 18} l5 4 -3 5 5 3 M${CX + 10} ${Y.waist - 8} l-4 4 4 3" stroke="${c.skin}" stroke-width="3" fill="none"/>`;
      if (it.id === 'buttonup') {
        s += `<path d="M${CX - 9} ${Y.shoulder - 4} L${CX} ${Y.chest + 14} L${CX + 9} ${Y.shoulder - 4} Z" fill="${c.grad(c.skin)}"/>`;
        s += `<path d="M${CX - 9} ${Y.shoulder - 4} L${CX} ${Y.chest + 14} L${CX + 9} ${Y.shoulder - 4}" stroke="${INK}" stroke-width="1.4" fill="none"/>`;
        for (let y = Y.chest + 22; y < Y.hip; y += 14) s += `<circle cx="${CX}" cy="${y}" r="1.6" fill="${shade(col, -0.5)}"/>`;
      }
      if (it.id === 'hoodie') s += `<path d="M${CX - 22} ${Y.waist - 4} h44 v14 h-44 z" fill="${shade(col, -0.15)}" stroke="${INK}" stroke-width="1"/>
        <path d="M${CX - 6} ${Y.shoulder + 2} l-2 22 M${CX + 6} ${Y.shoulder + 2} l2 22" stroke="#efe9df" stroke-width="1.4"/>`;
      if (it.id === 'turtleneck') s += `<rect x="${CX - c.b.neck - 3}" y="${Y.neckTop + 6}" width="${(c.b.neck + 3) * 2}" height="18" rx="4" fill="${f}" stroke="${INK}" stroke-width="1.6"/>`;
      if (it.id === 'sequin') for (let y = topY; y < bottomY; y += 6) for (let x = CX - 50 + (y % 12 ? 3 : 0); x < CX + 50; x += 6)
        s += `<circle cx="${x}" cy="${y}" r="1.3" fill="${shade(col, 0.6)}" opacity=".7"/>`;
      // print on tees
      const found = Avatar.catalog?.outfit?.top?.find(t => t.id === it.id);
      if (found?.print && it.print) {
        s += `<text x="${CX + 2}" y="${Y.chest + 16}" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="${it.print.length > 7 ? 8 : 10}"
          fill="${safe(it.printColor || shade(col, col === '#f2f2f2' ? -0.9 : 0.85))}" letter-spacing=".5">${esc(it.print.slice(0, 12).toUpperCase())}</text>`;
        s += `<path d="M${CX - 8} ${Y.chest + 22} l8 6 l8 -6" stroke="${safe(it.printColor || shade(col, 0.85))}" stroke-width="1.5" fill="none" opacity=".8"/>`;
      }
      // cel shadow + fabric folds
      s += cel(torsoPath(b), { dx: -5, dy: -3, op: 0.2 });
      s += `<path d="M${CX - b.sw + 8} ${Y.shoulder + 14} q4 6 2 12 M${CX + b.sw - 8} ${Y.shoulder + 14} q-4 6 -2 12 M${CX - 10} ${Math.min(bottomY, Y.waist) - 6} q6 4 14 1"
        stroke="${INK}" stroke-width="1.2" fill="none" opacity=".45" stroke-linecap="round"/>`;
      // neckline
      if (!['tank', 'corset', 'buttonup', 'turtleneck', 'collar'].includes(it.id)) s += `<path d="M${CX - 12} ${Y.shoulder - 7} Q${CX} ${Y.shoulder + 7} ${CX + 12} ${Y.shoulder - 7}" fill="${c.skin}" stroke="${shade(col, -0.3)}" stroke-width="4"/>
        <path d="M${CX - 12} ${Y.shoulder - 7} Q${CX} ${Y.shoulder + 7} ${CX + 12} ${Y.shoulder - 7}" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
      if (it.id === 'crop') s += `<line x1="${CX - 40}" y1="${bottomY}" x2="${CX + 40}" y2="${bottomY}" stroke="${INK}" stroke-width="2"/>`;
      if (fit === 'baggy') s += `<path d="M${CX - b.ww + 4} ${Y.waist + 6} q8 10 20 8 M${CX + b.ww - 4} ${Y.waist + 4} q-6 12 -18 10" stroke="${INK}" stroke-width="1.4" fill="none" opacity=".45"/>`;
    }
    s += `</g>`;
    if (!special) {                             // bold garment silhouette, cut at the hem
      const hc = `${c.id}th`;
      c.defs.push(`<clipPath id="${hc}"><rect x="${CX - 90}" y="${topY - 4}" width="180" height="${bottomY - topY + 4}"/></clipPath>`);
      s += `<path d="${torsoPath(b)}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round" clip-path="url(#${hc})"/>
        <path d="M${CX - b.hw - 3} ${bottomY} Q${CX} ${bottomY + 3} ${CX + b.hw + 3} ${bottomY}" stroke="${INK}" stroke-width="2.6" fill="none"/>`;
    }
    return s;
  }

  function drawOuter(c) {
    const it = c.a.outfit?.outer; if (!it || it.id === 'none') return '';
    const fit = fitOf(it), e = fit === 'baggy' ? 6 : fit === 'skinny' ? -1 : 1.5;
    const b = { ...c.b, sw: c.b.sw + e * 0.7, ww: c.b.ww + e, hw: c.b.hw + e }, f = c.fabric(it), col = safe(it.color), long = it.id === 'trench' || it.id === 'furcoat';
    const bottom = long ? Y.knee + 6 : ({ bomber: Y.hip - 4, cropjacket: Y.chest + 24, cardigan: Y.hip + 18, overshirt: Y.hip + 12, glam: Y.hip, waistcoat: Y.hip + 2 }[it.id] ?? Y.hip + 6);
    const lapel = { denimvest: 13, studvest: 13, waistcoat: 12, overshirt: 12, glam: 11, track: 2.5, tech: 2.5, uniform: 2.5, cardigan: 9, fringe: 9 }[it.id] ?? 9;
    const side = sign => {
      const x0 = CX + sign * lapel, xs = CX + sign * (b.sw + 2), xh = CX + sign * (Math.max(b.hw, b.ww) + (long ? 10 : 4));
      const d = `M${x0} ${Y.shoulder - 6} L${xs} ${Y.shoulder - 1} Q${xs + sign * 2} ${Y.chest} ${CX + sign * (b.ww + 3)} ${Y.waist} L${xh} ${bottom} L${CX + sign * (lapel - 2)} ${bottom} L${CX + sign * 3} ${Y.chest + 10} Z`;
      return shape(d, f, 3, { dx: -4, dy: -3, op: sign > 0 ? 0.26 : 0.16 });
    };
    let s = side(-1) + side(1);
    const pins = (pts) => pts.map(([x, y, pc]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${pc}" stroke="${INK}" stroke-width="1.2"/><circle cx="${x - 1}" cy="${y - 1}" r="1" fill="#fff" opacity=".7"/>`).join('');
    if (it.id === 'leather' || it.id === 'bomber') {
      // big lapel, diagonal zipper, zip pockets, snaps, pins
      s += `<path d="M${CX - lapel} ${Y.shoulder - 6} L${CX - b.sw + 4} ${Y.chest - 2} L${CX - 6} ${Y.chest + 12} Z" fill="${shade(col, -0.18)}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M${CX + lapel} ${Y.shoulder - 6} L${CX + b.sw - 4} ${Y.chest - 2} L${CX + 6} ${Y.chest + 12} Z" fill="${shade(col, -0.25)}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M${CX + b.sw - 6} ${Y.chest + 2} L${CX + 10} ${bottom - 2}" stroke="#c9ccd6" stroke-width="2.2" stroke-dasharray="1.6 1.2"/>
        <path d="M${CX - b.sw + 8} ${Y.waist - 10} l12 4 M${CX + b.sw - 8} ${Y.waist - 10} l-12 4" stroke="#c9ccd6" stroke-width="1.6"/>
        <circle cx="${CX - b.sw + 6}" cy="${Y.chest - 3}" r="1.6" fill="#dfe3ea"/><circle cx="${CX + b.sw - 6}" cy="${Y.chest - 3}" r="1.6" fill="#dfe3ea"/>`;
      if (it.id === 'leather') s += pins([[CX - 16, Y.chest + 4, '#ffcc1a'], [CX - 20, Y.chest + 14, '#ff3b6b'], [CX + 18, Y.chest + 10, '#29e0e0']]);
    }
    if (it.id === 'denimvest') {
      s += [[-20, 140, '#ffcc1a'], [16, 150, '#b3121f'], [-22, 172, '#f2f2f2']].map(([x, y, pc]) =>
        `<rect x="${CX + x - 6}" y="${y - 5}" width="12" height="10" rx="2" fill="${pc}" stroke="${INK}" stroke-width="1.2" transform="rotate(${x / 3} ${CX + x} ${y})"/>`).join('');
      s += pins([[CX + 20, Y.chest - 4, '#ff3b6b'], [CX + 14, Y.chest + 2, '#ffcc1a'], [CX - 16, Y.chest + 20, '#29e0e0']]);
      // frayed armholes + stitched seams
      s += [-1, 1].map(sg => `<path d="M${CX + sg * (b.sw + 1)} ${Y.shoulder} l${-sg * 3} 4 l${sg * 3} 3 l${-sg * 3} 4 l${sg * 3} 3 l${-sg * 3} 4" stroke="#eef0f4" stroke-width="1.6" fill="none"/>
        <path d="M${CX + sg * (lapel + 4)} ${Y.shoulder} L${CX + sg * (b.ww + 6)} ${Y.waist}" stroke="${shade(col, 0.45)}" stroke-width="1" stroke-dasharray="2 2"/>`).join('');
    }
    if (it.id === 'studvest') for (let y = Y.shoulder + 6; y < bottom - 6; y += 10) for (const x of [-lapel - 4, lapel + 4])
      s += `<circle cx="${CX + x + (x < 0 ? -4 : 4)}" cy="${y}" r="1.8" fill="#dfe3ea" stroke="${INK}" stroke-width=".6"/>`;
    if (it.id === 'furcoat') s += `<path d="M${CX - lapel - 6} ${Y.shoulder - 8} q-6 20 2 40 M${CX + lapel + 6} ${Y.shoulder - 8} q6 20 -2 40" stroke="${shade(col, 0.45)}" stroke-width="9" stroke-linecap="round" fill="none" opacity=".9"/>`;
    if (it.id === 'blazer') for (let y = Y.shoulder + 4; y < bottom; y += 7) for (let x = -b.sw; x < b.sw; x += 7)
      if (Math.abs(x) > lapel) s += `<circle cx="${CX + x}" cy="${y}" r="1.1" fill="${shade(col, 0.6)}" opacity=".6"/>`;
    if (it.id === 'bomber') s += `<rect x="${CX - b.hw - 4}" y="${bottom - 7}" width="${(b.hw + 4) * 2}" height="7" fill="${shade(col, -0.3)}" stroke="${INK}" stroke-width="1.6"/>`;
    const rib = (y, x0, x1, cc) => `<rect x="${x0}" y="${y - 7}" width="${x1 - x0}" height="7" fill="${cc}" stroke="${INK}" stroke-width="1.8"/>` + [...Array(Math.floor((x1 - x0) / 4))].map((_, i) => `<line x1="${x0 + 2 + i * 4}" y1="${y - 6}" x2="${x0 + 2 + i * 4}" y2="${y - 1}" stroke="${INK}" stroke-width=".7" opacity=".4"/>`).join('');
    const hx = Math.max(b.hw, b.ww) + 4;
    switch (it.id) {
      case 'cardigan':
        for (let y = Y.chest + 2; y < bottom - 10; y += 14) s += `<circle cx="${CX - lapel + 3}" cy="${y}" r="2.2" fill="${shade(col, -0.45)}" stroke="${INK}" stroke-width=".8"/>`;
        s += rib(bottom, CX - hx - 2, CX - lapel + 1, shade(col, -0.12)) + rib(bottom, CX + lapel - 1, CX + hx + 2, shade(col, -0.12));
        s += [-1, 1].map(sg => `<rect x="${CX + sg * (b.ww - 2) - 9}" y="${Y.waist + 2}" width="16" height="14" rx="2" fill="${shade(col, -0.08)}" stroke="${INK}" stroke-width="1.6"/>`).join('');
        break;
      case 'glam':
        s = [-1, 1].map(sg => `<path d="M${CX + sg * 6} ${Y.shoulder - 4} L${CX + sg * 20} ${Y.neckTop - 14} L${CX + sg * 26} ${Y.shoulder - 2} Z" fill="${shade(col, -0.15)}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`).join('') + s;
        s += [-1, 1].map(sg => `<path d="M${CX + sg * (b.sw - 10)} ${Y.shoulder - 6} L${CX + sg * (b.sw + 26)} ${Y.shoulder - 20} L${CX + sg * (b.sw + 8)} ${Y.shoulder + 20} Z" fill="${f}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>`).join('');
        break;
      case 'track':
        s += `<path d="M${CX} ${Y.shoulder - 6} V${bottom - 6}" stroke="#d9dde4" stroke-width="2"/><path d="M${CX - 10} ${Y.shoulder - 8} Q${CX} ${Y.shoulder - 2} ${CX + 10} ${Y.shoulder - 8} L${CX + 12} ${Y.shoulder - 16} Q${CX} ${Y.shoulder - 10} ${CX - 12} ${Y.shoulder - 16} Z" fill="${f}" stroke="${INK}" stroke-width="2"/>`;
        s += rib(bottom, CX - hx - 2, CX + hx + 2, shade(col, -0.15));
        s += [-1, 1].map(sg => `<path d="M${CX + sg * (b.sw - 2)} ${Y.shoulder + 2} Q${CX + sg * (b.ww + 6)} ${Y.waist - 10} ${CX + sg * (hx - 1)} ${bottom - 8}" stroke="#f2efe8" stroke-width="2.4" fill="none"/>`).join('');
        break;
      case 'tech': {
        const g = safe(it.color2 || '#29e0e0');
        s += `<rect x="${CX - c.b.neck - 4}" y="${Y.neckTop + 4}" width="${(c.b.neck + 4) * 2}" height="${Y.shoulder - Y.neckTop}" rx="4" fill="${f}" stroke="${INK}" stroke-width="2.4"/>`;
        s += `<path d="M${CX} ${Y.shoulder - 4} V${bottom - 2} M${CX - b.sw + 8} ${Y.chest - 6} L${CX - 8} ${Y.chest + 10} V${Y.waist} M${CX + b.sw - 8} ${Y.chest - 6} L${CX + 8} ${Y.chest + 10} V${Y.waist} M${CX - hx + 4} ${Y.waist + 8} H${CX + hx - 4}" stroke="${g}" stroke-width="2" fill="none"/>`;
        s += `<circle cx="${CX + 16}" cy="${Y.chest - 2}" r="4" fill="${g}" stroke="${INK}" stroke-width="1.4"/>`;
        break;
      }
      case 'waistcoat':
        s += [-1, 1].map(sg => `<path d="M${CX + sg * 2} ${bottom - 2} L${CX + sg * (lapel - 2)} ${bottom + 10} L${CX + sg * (hx - 2)} ${bottom - 2} Z" fill="${f}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`).join('');
        for (let y = Y.chest + 14; y < bottom - 6; y += 11) s += `<circle cx="${CX - 5}" cy="${y}" r="1.8" fill="#d6b65c" stroke="${INK}" stroke-width=".7"/>`;
        break;
      case 'cropjacket': case 'overshirt':
        s += [-1, 1].map(sg => `<path d="M${CX + sg * lapel} ${Y.shoulder - 6} L${CX + sg * (lapel + 14)} ${Y.shoulder - 2} L${CX + sg * (lapel + 2)} ${Y.chest} Z" fill="${shade(col, -0.15)}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`).join('');
        if (it.id === 'overshirt') for (let y = Y.chest + 8; y < bottom - 6; y += 13) s += `<circle cx="${CX - lapel + 3}" cy="${y}" r="1.7" fill="${shade(col, -0.45)}"/>`;
        else s += rib(bottom, CX - b.sw, CX - lapel + 2, shade(col, -0.2)) + rib(bottom, CX + lapel - 2, CX + b.sw, shade(col, -0.2));
        break;
      case 'uniform': {
        const gold = '#e9c04a';
        s += `<rect x="${CX - c.b.neck - 3}" y="${Y.neckTop + 6}" width="${(c.b.neck + 3) * 2}" height="${Y.shoulder - Y.neckTop - 2}" fill="${gold}" stroke="${INK}" stroke-width="2"/>`;
        for (let y = Y.chest - 4; y < bottom - 6; y += 11) for (const x of [-9, 9]) s += `<circle cx="${CX + x}" cy="${y}" r="2.2" fill="${gold}" stroke="${INK}" stroke-width=".8"/>`;
        s += `<path d="M${CX - b.sw + 6} ${Y.shoulder + 2} L${CX + b.ww + 2} ${Y.hip - 4}" stroke="${INK}" stroke-width="10"/><path d="M${CX - b.sw + 6} ${Y.shoulder + 2} L${CX + b.ww + 2} ${Y.hip - 4}" stroke="#f4f1ea" stroke-width="7"/>`;
        s += [-1, 1].map(sg => `<rect x="${CX + sg * (b.sw - 4) - 11}" y="${Y.shoulder - 8}" width="22" height="9" rx="3" fill="${gold}" stroke="${INK}" stroke-width="1.8"/>` +
          [...Array(6)].map((_, i) => `<line x1="${CX + sg * (b.sw - 4) - 9 + i * 3.6}" y1="${Y.shoulder + 1}" x2="${CX + sg * (b.sw - 4) - 9 + i * 3.6}" y2="${Y.shoulder + 8}" stroke="${gold}" stroke-width="1.6"/>`).join('')).join('');
        break;
      }
      case 'fringe':
        s += [-1, 1].map(sg => `<path d="M${CX + sg * (lapel + 2)} ${Y.chest + 4} Q${CX + sg * (b.sw * 0.6)} ${Y.chest - 4} ${CX + sg * (b.sw + 2)} ${Y.chest - 6}" stroke="${shade(col, -0.35)}" stroke-width="2" fill="none"/>` +
          [...Array(7)].map((_, i) => { const t = i / 6, x = CX + sg * (lapel + 2 + t * (b.sw - lapel)), y = Y.chest + 4 - t * 10; return `<path d="M${x} ${y} l${sg * 1} 11" stroke="${shade(col, -0.2)}" stroke-width="2.2" stroke-linecap="round"/>`; }).join('')).join('');
        break;
    }
    return s;
  }

  /* ---------------------------------------------------------------- arms */
  function sleeveFor(c) {
    const outer = c.a.outfit?.outer, top = c.a.outfit?.top;
    const outerDef = Avatar.catalog?.outfit?.outer?.find(o => o.id === outer?.id);
    if (outer && outer.id !== 'none' && outerDef?.sleeve === 'long') return { len: 1, item: outer, isOuter: true };
    const topDef = Avatar.catalog?.outfit?.top?.find(t => t.id === top?.id);
    if (!top || !topDef || topDef.sleeve === 'none') return null;
    return { len: topDef.sleeve === 'long' ? 1 : 0.45, item: top, sheer: topDef.sheer };
  }

  function drawArm(c, key) {
    const pts = c.pose[key], w = c.b.arm, skin = c.grad(c.skin), A = armShape(c.b);
    let s = limb(pts, w, skin, true, A);
    s += tattoosOn(c, key === 'A' ? ['armL_upper', 'armL_lower'] : ['armR_upper', 'armR_lower']);
    const sl = sleeveFor(c);
    if (sl) {
      const end = sl.len >= 1 ? pts.slice() : [pts[0], mid(pts[0], pts[1], 0.9)];
      if (sl.sheer) s += `<path d="${limbPath(end)}" stroke="${safe(sl.item.color)}" stroke-width="${w + 2}" stroke-dasharray="1.2 2.4" stroke-linecap="round" fill="none"/>`;
      else {
        if (sl.len >= 1) end[2] = mid(pts[1], pts[2], 0.8);
        const fit = fitOf(sl.item), add = (sl.isOuter ? 7 : 4) + (fit === 'baggy' ? 7 : fit === 'skinny' ? -2 : 0);
        const sw = w + add, mb = fit === 'baggy' ? 0 : 0.7;
        const ws = end.length === 3
          ? (fit === 'baggy' ? [A.ws[0] + add, A.ws[0] + add - 1, A.ws[0] + add + 3] : [A.ws[0] + add, A.ws[1] + add, A.ws[1] + add - 1])
          : (fit === 'baggy' ? [A.ws[0] + add, A.ws[0] + add + 4] : [A.ws[0] + add, A.ws[0] * 0.92 + add]);
        s += limb(end, sw, c.fabric(sl.item), true, { ws, bulge: [A.bulge[0] * mb, A.bulge[1] * mb * 0.5], peak: A.peak, flatEnd: true });
        // cuff / hem band
        const e1 = end[end.length - 1], e0 = end[end.length - 2], ca = ang(e0, e1);
        const cw = ws[ws.length - 1] * 1.02;
        s += `<g transform="translate(${e1[0].toFixed(1)} ${e1[1].toFixed(1)}) rotate(${ca.toFixed(1)})"><rect x="-4" y="${(-cw / 2).toFixed(1)}" width="4" height="${cw.toFixed(1)}" fill="${shade(safe(sl.item.color), -0.25)}" stroke="${INK}" stroke-width="2"/></g>`;
        // fabric fold near the elbow
        if (sl.len >= 1) { const f = mid(pts[0], pts[1], 0.7); s += `<path d="M${f[0] - 3} ${f[1] - 2} q4 3 7 0" stroke="${INK}" stroke-width="1.2" fill="none" opacity=".5"/>`; }
        if (sl.item.id === 'track' || sl.item.id === 'tech') {
          const off = (p, q, k) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [-dy / l * k, dx / l * k]; };
          const k = (key === 'A' ? -1 : 1) * ws[0] * 0.3, o1 = off(end[0], end[1], k), o2 = off(end[end.length - 2], end[end.length - 1], k);
          s += `<path d="M${fx([end[0][0] + o1[0], end[0][1] + o1[1] + 6])} L${end.slice(1).map((p, i) => fx([p[0] + (i ? o2 : o1)[0], p[1] + (i ? o2 : o1)[1]])).join(' L')}" stroke="${sl.item.id === 'tech' ? safe(sl.item.color2 || '#29e0e0') : '#f2efe8'}" stroke-width="2.4" fill="none"/>`;
        }
        if (sl.item.id === 'uniform') { const e = end[end.length - 1]; s += `<circle cx="${e[0]}" cy="${e[1]}" r="${ws[ws.length - 1] * 0.32}" fill="#e9c04a" stroke="${INK}" stroke-width="1.4"/>`; }
        if (sl.item.id === 'furcoat') s += `<circle cx="${end[end.length - 1][0]}" cy="${end[end.length - 1][1]}" r="${w * 0.9}" fill="${shade(safe(sl.item.color), 0.4)}"/>`;
      }
    }
    if (c.a.outfit?.wrist?.id === 'longgloves') s += limb([mid(pts[1], pts[2], 0.02), pts[2]], w, safe(c.a.outfit.wrist.color || '#3a1d4f'), true, { ws: [A.ws[1] + 2, A.ws[2] + 1.5], flatEnd: true });
    s += wristwear(c, pts);
    s += hand(c, pts, key);
    return s;
  }

  /** Hand at the end of a forearm. Styles: grip (fist around a neck/stick/mic), horns, open, relaxed. */
  function handStyle(c, key) {
    const t = c.pose.type, k = c.pose.key, stand = k === 'stand';
    if (['synth', 'piano', 'decks', 'harp'].includes(k)) return 'open';
    if (k === 'accordion' || k === 'harmonica') return 'grip';
    if (k === 'boombox') return key === 'A' ? 'horns' : 'grip';
    if (t === 'vocals') return key === 'A' && !stand ? 'horns' : 'grip';
    if (t === 'keys') return key === 'A' ? 'open' : 'grip';
    if (t === 'none') return 'relaxed';
    return 'grip';
  }
  function hand(c, pts, key) {
    const [x, y] = pts[2], a = ang(pts[1], pts[2]), w = c.b.arm * 1.0, skin = c.skin, style = handStyle(c, key);
    const flip = key === 'A' ? 1 : -1;   // which side the thumb sits on
    const o = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"`;
    const wid0 = c.a.outfit?.wrist?.id, full = wid0 === 'fullgloves' || wid0 === 'longgloves';
    const glove = wid0 === 'gloves' || full ? safe(c.a.outfit.wrist.color || '#141014') : null;
    const finger = (fx0, fy, len, wid, rot = 0) => `<g transform="rotate(${rot} ${fx0} ${fy})"><rect x="${fx0}" y="${fy - wid / 2}" width="${len}" height="${wid}" rx="${wid / 2}" fill="${full ? glove : skin}" ${o}/>` +
      (glove ? `<rect x="${fx0}" y="${fy - wid / 2}" width="${len * 0.52}" height="${wid}" rx="${wid * 0.3}" fill="${glove}" ${o}/>` : '') + `</g>`;
    const palm = glove || skin;
    let g = '';
    if (style === 'open' || style === 'relaxed') {
      const len = style === 'open' ? w * 1.05 : w * 0.8;
      g += [-0.42, -0.14, 0.14, 0.42].map((t, i) => finger(w * 0.8, t * w * 1.25, len - Math.abs(t) * w * 0.4, w * 0.36, t * (style === 'open' ? 22 : 8))).join('');
      g += `<ellipse cx="${w * 0.45}" cy="0" rx="${w * 0.62}" ry="${w * 0.62}" fill="${palm}" ${o}/>`;
      g += finger(w * 0.3, -flip * w * 0.5, w * 0.7, w * 0.36, -flip * 40);
    } else {
      if (style === 'horns') g += finger(w * 0.9, -w * 0.38, w * 1.25, w * 0.34, -6) + finger(w * 0.9, w * 0.4, w * 1.05, w * 0.32, 8);
      g += `<rect x="${-w * 0.15}" y="${-w * 0.66}" width="${w * 1.42}" height="${w * 1.32}" rx="${w * 0.46}" fill="${palm}" ${o}/>`;
      if (glove && !full) g += [-0.36, 0, 0.36].map(t => `<ellipse cx="${w * 1.2}" cy="${t * w * 1.1}" rx="${w * 0.22}" ry="${w * 0.19}" fill="${skin}" ${o}/>`).join('');   // fingertips poking out
      g += [-0.33, 0, 0.33].map(t => `<path d="M${w * 1.05} ${t * w * 1.2} q${w * 0.18} ${w * 0.08} 0 ${w * 0.3}" stroke="${shade(skin, -0.35)}" stroke-width="1.3" fill="none"/>`).join('');
      g += finger(w * 0.15, -flip * w * 0.58, w * 0.85, w * 0.36, flip * 8);   // thumb
    }
    g += `<path d="M${-w * 0.1} ${w * 0.4} Q${w * 0.6} ${w * 0.75} ${w * 1.1} ${w * 0.45}" stroke="${INK}" stroke-width="0" fill="${INK}" opacity=".18"/>`;
    const tat = c.a.tattoos?.find(t => t.slot === 'hands');
    if (tat && style !== 'open') g += [-0.33, 0, 0.33].map(t => `<circle cx="${w * 0.8}" cy="${t * w * 1.1}" r="${w * 0.1}" fill="${safe(tat.color)}"/>`).join('');
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})">${g}</g>`;
  }

  /** Wristbands, spiked cuffs, bracelets. */
  function wristwear(c, pts) {
    const it = c.a.outfit?.wrist; if (!it || it.id === 'none') return '';
    const p = mid(pts[1], pts[2], 0.86), a = ang(pts[1], pts[2]), w = c.b.arm * 0.82, col = safe(it.color || '#121216');
    let g = '';
    if (it.id === 'spiked') {
      g += `<rect x="-5" y="${-w / 2 - 1}" width="10" height="${w + 2}" rx="2" fill="#141014" stroke="${INK}" stroke-width="1.8"/>`;
      g += [-0.3, 0, 0.3].map(t => `<path d="M-2 ${t * w * 1.1} l-6 -2 v4 z" fill="#dfe3ea" stroke="${INK}" stroke-width=".8" transform="rotate(-90 0 ${t * w * 1.1}) translate(0 ${-w / 2})"/>`).join('');
      g += [-0.3, 0, 0.3].map(t => `<circle cx="0" cy="${t * w}" r="1.6" fill="#dfe3ea"/>`).join('');
    } else if (it.id === 'fullgloves' || it.id === 'longgloves') {
      g += `<rect x="-2" y="${-w / 2 - 1.5}" width="7" height="${w + 3}" rx="2" fill="${col}" stroke="${INK}" stroke-width="1.8"/>`;
    } else if (it.id === 'gloves') {
      g += `<rect x="-2" y="${-w / 2 - 1.5}" width="9" height="${w + 3}" rx="2" fill="${col}" stroke="${INK}" stroke-width="2"/><path d="M1 ${-w / 2} v${w}" stroke="${shade(col, 0.35)}" stroke-width="1.2"/>`;
    } else if (it.id === 'sweatband') {
      g += `<rect x="-6" y="${-w / 2 - 1.5}" width="12" height="${w + 3}" rx="3" fill="${col}" stroke="${INK}" stroke-width="1.8"/><line x1="-2" y1="${-w / 2}" x2="-2" y2="${w / 2}" stroke="#fff" stroke-width="1.5" opacity=".6"/>`;
    } else if (it.id === 'bracelets') {
      g += [-3, 1.5].map((x, i) => `<rect x="${x}" y="${-w / 2 - 1}" width="2.6" height="${w + 2}" rx="1.3" fill="${i ? '#e3c35a' : col}" stroke="${INK}" stroke-width=".9"/>`).join('');
    }
    return `<g transform="translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${a.toFixed(1)})">${g}</g>`;
  }

  /* ---------------------------------------------------------------- tattoos */
  const TATTOO = {
    rose: (k) => `<circle cx="10" cy="7" r="5" fill="none" stroke="${k}" stroke-width="1.4"/><path d="M8 6 q2 -3 4 0 q-2 3 -4 0 M10 12 v7 M10 15 q-4 -1 -5 -4 M10 16 q4 -1 5 -3" stroke="${k}" stroke-width="1.3" fill="none"/>`,
    skull: (k) => `<path d="M4 9 a6 6 0 1 1 12 0 v3 h-2 v3 h-8 v-3 h-2 z" fill="none" stroke="${k}" stroke-width="1.4"/><circle cx="7.5" cy="9" r="1.6" fill="${k}"/><circle cx="12.5" cy="9" r="1.6" fill="${k}"/><path d="M8 15 v-2 M10 15 v-2 M12 15 v-2" stroke="${k}"/>`,
    star: (k) => `<path d="M10 2 l2.4 5 5.4.6-4 3.7 1.1 5.4L10 14l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" fill="none" stroke="${k}" stroke-width="1.4"/>`,
    heart: (k) => `<path d="M10 17 C2 11 3 4 7 4 c2 0 3 2 3 2 s1 -2 3 -2 c4 0 5 7 -3 13z" fill="none" stroke="${k}" stroke-width="1.4"/><path d="M4 14 L16 6" stroke="${k}" stroke-width="1"/>`,
    dagger: (k) => `<path d="M10 1 l2 12 h-4z M5 13 h10 M10 13 v6" stroke="${k}" stroke-width="1.4" fill="none"/>`,
    bolt: (k) => `<path d="M12 1 L5 11 h5 l-2 8 7 -11 h-5z" fill="none" stroke="${k}" stroke-width="1.4"/>`,
    note: (k) => `<path d="M7 15 a2.5 2 0 1 1 0 -.1 V4 l8 -2 v11 a2.5 2 0 1 1 0 -.1 V5.5 L7 7.5" stroke="${k}" stroke-width="1.4" fill="none"/>`,
    flame: (k) => `<path d="M10 19 c-5 0 -7 -4 -5 -8 c1 2 2 2 2 2 c0 -4 2 -8 5 -11 c0 4 4 6 4 11 c0 4 -2 6 -6 6z" fill="none" stroke="${k}" stroke-width="1.4"/>`,
    swallow: (k) => `<path d="M2 8 q5 -1 8 3 q3 -4 8 -5 q-3 3 -5 6 l3 5 -6 -3 -6 3 3 -5 q-2 -2 -5 -4z" fill="none" stroke="${k}" stroke-width="1.3"/>`,
    tribal: (k) => `<path d="M0 10 q5 -6 10 0 t10 0 M0 13 q5 -4 10 0 t10 0" stroke="${k}" stroke-width="2.2" fill="none"/>`,
    web: (k) => `<path d="M10 10 L1 1 M10 10 L19 1 M10 10 L1 19 M10 10 L19 19 M10 10 L10 0 M10 10 L0 10 M4 4 q6 -3 12 0 q3 6 0 12 q-6 3 -12 0 q-3 -6 0 -12" stroke="${k}" stroke-width=".9" fill="none"/>`,
    sleeve: (k) => `<path d="M0 2 q5 4 10 0 t10 0 M0 7 l4 3 4-3 4 3 4-3 4 3 M0 13 q5 -4 10 0 t10 0 M2 17 l3 2 M8 16 l4 3 M15 16 l3 3" stroke="${k}" stroke-width="1.6" fill="none"/>`,
    snake: (k) => `<path d="M2 18 q6 -2 4 -6 t2 -6 q4 -3 7 -2 l3 1 -3 1" stroke="${k}" stroke-width="1.8" fill="none"/><circle cx="15" cy="4.5" r=".8" fill="${k}"/>`,
    wings: (k) => `<path d="M10 10 q-6 -8 -10 -6 q2 3 3 5 q-2 0 -3 2 q5 2 10 -1 M10 10 q6 -8 10 -6 q-2 3 -3 5 q2 0 3 2 q-5 2 -10 -1" stroke="${k}" stroke-width="1.2" fill="none"/>`,
  };
  function tattooAnchor(c, slot) {
    const P = c.pose, legs = c.legs;
    const seg = (p, q, t = 0.5) => ({ at: mid(p, q, t), rot: ang(p, q) - 90 });
    switch (slot) {
      case 'armL_upper': return seg(P.A[0], P.A[1], 0.55);
      case 'armL_lower': return seg(P.A[1], P.A[2], 0.5);
      case 'armR_upper': return seg(P.B[0], P.B[1], 0.55);
      case 'armR_lower': return seg(P.B[1], P.B[2], 0.5);
      case 'legL': return seg(legs.L[0], legs.L[1], 0.6);
      case 'legR': return seg(legs.R[0], legs.R[1], 0.6);
      case 'neck': return { at: [CX + 4, Y.neckTop + 12], rot: 0, scale: 0.55 };
      case 'chest': return { at: [CX - 13, Y.chest - 6], rot: -8, scale: 0.85 };
      case 'cheek': return { at: [CX + 15, 76], rot: 0, scale: 0.38 };
      default: return null;
    }
  }
  function tattoo(c, t) {
    const a = tattooAnchor(c, t.slot); if (!a || !TATTOO[t.design]) return '';
    const sc = a.scale ?? (t.slot.startsWith('arm') ? c.b.arm / 15 : c.b.leg / 15);
    return `<g transform="translate(${a.at[0]} ${a.at[1]}) rotate(${a.rot}) scale(${sc}) translate(-10 -10)" opacity=".88">${TATTOO[t.design](safe(t.color || '#1b2236'))}</g>`;
  }
  function tattoosOn(c, slots) { return (c.a.tattoos || []).filter(t => slots.includes(t.slot)).map(t => tattoo(c, t)).join(''); }

  /* ---------------------------------------------------------------- neck & accessories */
  function drawNeck(c) {
    const n = c.b.neck;
    const d = `M${CX - n} ${Y.neckTop} L${CX - n - 1.5} ${Y.shoulder + 2} L${CX + n + 1.5} ${Y.shoulder + 2} L${CX + n} ${Y.neckTop} Z`;
    return shape(d, shade(c.skin, -0.06), 2.6) + `<path d="M${CX - n} ${Y.neckTop + 2} Q${CX} ${Y.neckTop + 14} ${CX + n} ${Y.neckTop + 2} L${CX + n} ${Y.neckTop} L${CX - n} ${Y.neckTop} Z" fill="${INK}" opacity=".25"/>`
      + tattoosOn(c, ['neck', 'chest']);
  }
  function drawNeckwear(c) {
    const it = c.a.outfit?.neck; if (!it || it.id === 'none') return '';
    const col = safe(it.color || '#c0c5cc'), n = c.b.neck;
    switch (it.id) {
      case 'chain': return `<path d="M${CX - n - 2} ${Y.shoulder - 6} Q${CX} ${Y.chest + 4} ${CX + n + 2} ${Y.shoulder - 6}" stroke="${col}" stroke-width="2.2" stroke-dasharray="2.5 1.5" fill="none"/>`;
      case 'choker': return `<rect x="${CX - n - 1}" y="${Y.neckTop + 8}" width="${n * 2 + 2}" height="5" rx="2" fill="#141014"/>` +
        [-6, -2, 2, 6].map(x => `<path d="M${CX + x - 1.5} ${Y.neckTop + 13} l1.5 4 l1.5 -4" fill="${col}"/>`).join('');
      case 'bandana': return `<path d="M${CX - n - 4} ${Y.neckTop + 10} L${CX + n + 4} ${Y.neckTop + 10} L${CX + 2} ${Y.shoulder + 14} Z" fill="${c.fabric({ color: col, pattern: 'polka', color2: '#f2f2f2' })}" stroke="${INK}" stroke-width="1.8"/>`;
      case 'scarf': return `<path d="M${CX - n - 3} ${Y.neckTop + 8} Q${CX} ${Y.neckTop + 18} ${CX + n + 3} ${Y.neckTop + 8} L${CX + n + 3} ${Y.neckTop + 16} Q${CX} ${Y.neckTop + 26} ${CX - n - 3} ${Y.neckTop + 16} Z" fill="${c.grad(col)}" stroke="${INK}" stroke-width="1.6"/>
        <path d="M${CX + 6} ${Y.neckTop + 18} L${CX + 12} ${Y.waist} L${CX + 2} ${Y.waist + 2} L${CX - 2} ${Y.neckTop + 20} Z" fill="${c.grad(col)}" stroke="${INK}" stroke-width="1.6"/>`;
      case 'pendant': return `<path d="M${CX - n} ${Y.shoulder - 6} Q${CX} ${Y.chest} ${CX + n} ${Y.shoulder - 6}" stroke="#d6b65c" stroke-width="1.2" fill="none"/>
        <path d="M${CX - 4} ${Y.chest - 4} L${CX + 4} ${Y.chest - 4} L${CX} ${Y.chest + 5} Z" fill="${col}" stroke="${INK}" stroke-width="1"/>`;
      case 'tie': return `<path d="M${CX - 4} ${Y.neckTop + 14} h8 l-1 6 h-6z" fill="${col}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M${CX - 3} ${Y.neckTop + 20} L${CX + 3} ${Y.neckTop + 20} L${CX + 6} ${Y.waist - 6} L${CX} ${Y.waist + 2} L${CX - 6} ${Y.waist - 6} Z" fill="${col}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
      case 'medallion': return `<path d="M${CX - n - 6} ${Y.shoulder - 8} Q${CX} ${Y.chest + 26} ${CX + n + 6} ${Y.shoulder - 8}" stroke="${INK}" stroke-width="6" fill="none"/><path d="M${CX - n - 6} ${Y.shoulder - 8} Q${CX} ${Y.chest + 26} ${CX + n + 6} ${Y.shoulder - 8}" stroke="#e3b23c" stroke-width="4" stroke-dasharray="4 1.6" fill="none"/>
        <circle cx="${CX}" cy="${Y.chest + 18}" r="10" fill="#e9c04a" stroke="${INK}" stroke-width="2"/><circle cx="${CX}" cy="${Y.chest + 18}" r="6" fill="none" stroke="#b8901c" stroke-width="1.6"/><path d="M${CX - 3} ${Y.chest + 16} l3 -3 3 3 -3 6z" fill="#b8901c"/>`;
      case 'bowtie': return `<path d="M${CX} ${Y.neckTop + 14} l-9 -5 v10 z M${CX} ${Y.neckTop + 14} l9 -5 v10 z" fill="${col}" stroke="${INK}" stroke-width="1.4"/><circle cx="${CX}" cy="${Y.neckTop + 14}" r="2.4" fill="${shade(col, -0.3)}"/>`;
    }
    return '';
  }

  /* ---------------------------------------------------------------- head */
  function facePath(shape, jaw = 0) {
    const f0 = FACES[shape] || FACES.oval, f = { ...f0, jw: clamp(f0.jw + jaw, 8, 30), chinW: clamp(f0.chinW + jaw * 0.6, 1, 18) }, top = 37, tw = f.cw * 0.82;
    return `M${CX} ${top} C${CX + tw * 1.1} ${top} ${CX + f.cw} 46 ${CX + f.cw} 62 L${CX + f.cw - 0.5} 71 L${CX + f.jw} 83
      Q${CX + f.chinW + 5} ${f.chinY + 1} ${CX + f.chinW} ${f.chinY} Q${CX} ${f.chinY + 3} ${CX - f.chinW} ${f.chinY}
      Q${CX - f.chinW - 5} ${f.chinY + 1} ${CX - f.jw} 83 L${CX - f.cw + 0.5} 71 L${CX - f.cw} 62 C${CX - f.cw} 46 ${CX - tw * 1.1} ${top} ${CX} ${top} Z`;
  }

  function drawHead(c) {
    const a = c.a, fc = a.face || {}, f0 = FACES[fc.shape] || FACES.oval, skin = c.skin, T = c.ft;   // faces stay flat, cartoon style
    const f = { ...f0, jw: clamp(f0.jw + T.jaw, 8, 30), chinW: clamp(f0.chinW + T.jaw * 0.6, 1, 18) };
    const ox = 3; // features nudged right = 3/4 turn
    let s = '';
    // ears
    s += `<ellipse cx="${CX - f.cw + 1}" cy="66" rx="5" ry="7" fill="${skin}" stroke="${INK}" stroke-width="2"/>`;
    s += `<path d="M${CX - f.cw + 2} 63 q-3 1 -2 4 q1 2 3 1" stroke="${shade(c.skin, -0.35)}" stroke-width="1.2" fill="none"/>`;
    s += `<ellipse cx="${CX + f.cw - 1}" cy="66" rx="4" ry="7" fill="${skin}" stroke="${INK}" stroke-width="2"/>`;
    const pierce = new Set(a.piercings || []);
    if (pierce.has('ear')) s += `<circle cx="${CX - f.cw}" cy="74" r="3" fill="none" stroke="#e3c35a" stroke-width="1.5"/><circle cx="${CX + f.cw}" cy="74" r="3" fill="none" stroke="#e3c35a" stroke-width="1.5"/>`;
    if (pierce.has('gauge')) s += `<circle cx="${CX - f.cw + 1}" cy="71" r="2.6" fill="#141014" stroke="#c0c5cc" stroke-width="1"/>`;
    // face
    s += shape(facePath(fc.shape, T.jaw), skin, 2.6, { dx: -3, dy: -1.5, op: 0.1 });
    // cheekbone + jaw definition
    s += `<path d="M${CX + f.cw - 4} 70 q-3 6 -8 9" stroke="${shade(c.skin, -0.3)}" stroke-width="1.2" fill="none" opacity=".7"/>`;
    // jaw shadow for depth
    s += `<path d="M${CX - f.jw + 2} 82 Q${CX} ${f.chinY + 6} ${CX + f.jw - 2} 82" stroke="${shade(c.skin, -0.25)}" stroke-width="2" fill="none" opacity=".35"/>`;
    s += tattoosOn(c, ['cheek']);
    s += facePaint(c, f, ox);
    s += marks(c, f, ox);
    s += eyes(c, ox);
    s += brows(c, ox);
    s += `<g transform="translate(${CX + ox + 3} 72) scale(${T.nose}) translate(${-CX - ox - 3} -72)">${nose(c, ox)}</g>`;
    s += `<g transform="translate(${CX + ox + 2} 84) scale(${T.mouth} ${0.85 + T.mouth * 0.15}) translate(${-CX - ox - 2} -84)">${mouth(c, ox)}</g>`;
    if (pierce.has('nose')) s += `<circle cx="${CX + ox + 7}" cy="74" r="1.3" fill="#e3c35a"/>`;
    if (pierce.has('septum')) s += `<path d="M${CX + ox + 2} 76 a3 3 0 0 0 6 0" stroke="#d8dbe2" stroke-width="1.4" fill="none"/>`;
    if (pierce.has('brow')) s += `<line x1="${CX + ox + 17}" y1="51" x2="${CX + ox + 19}" y2="57" stroke="#d8dbe2" stroke-width="1.6"/>`;
    if (pierce.has('lip')) s += `<path d="M${CX + ox + 6} 85 a3 3 0 0 0 0 5" stroke="#d8dbe2" stroke-width="1.4" fill="none"/>`;
    s += facialHair(c, f, ox);
    return s;
  }

  function eyes(c, ox) {
    const fc = c.a.face || {}, iris = safe(fc.eyeColor || '#3b2414'), type = fc.eyes || 'almond';
    const mk = c.a.makeup || {};
    const one = (x, sz) => {
      let e = '';
      if (mk.shadow) e += `<ellipse cx="${x}" cy="61" rx="${8 * sz}" ry="${5 * sz}" fill="${safe(mk.shadow)}" opacity=".55"/>`;
      if (type === 'toon' || type === 'toonlid') {
        // big round cartoon eyes with small pupils (the style target)
        const r = 6.6 * sz;
        e += `<ellipse cx="${x}" cy="63.5" rx="${r}" ry="${r * 1.08}" fill="#fdfcf8" stroke="${INK}" stroke-width="2.1"/>`;
        e += `<circle cx="${x + 1.2 * sz}" cy="64" r="${2.5 * sz}" fill="${iris}"/><circle cx="${x + 1.2 * sz}" cy="64" r="${1.3 * sz}" fill="#0b0b0f"/>`;
        if (type === 'toonlid') e += `<path d="M${x - r - 1} ${63.5 - r * 0.25} L${x + r + 1} ${63.5 - r * 0.45} L${x + r + 1} ${63.5 - r * 1.3} L${x - r - 1} ${63.5 - r * 1.3} Z" fill="${c.skin}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
        if (mk.liner) e += `<path d="M${x - r} 61 Q${x} ${63.5 - r * 1.3} ${x + r} 61 l3.5 -3" stroke="#0b0b0f" stroke-width="2" fill="none"/>`;
        return e;
      }
      if (type === 'dot') return e + `<ellipse cx="${x}" cy="64" rx="${2.2 * sz}" ry="${2.8 * sz}" fill="${INK}"/>`;
      if (type === 'happy') return e + `<path d="M${x - 5 * sz} 65 q${5 * sz} -6 ${10 * sz} 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      const ry = { round: 5, almond: 4, sleepy: 2.8, sharp: 3.4, wide: 5.6 }[type] || 4, rx = type === 'wide' ? 5.6 : 5.2;
      e += `<ellipse cx="${x}" cy="64" rx="${rx * sz}" ry="${ry * sz}" fill="#fbfaf7" stroke="${INK}" stroke-width="1.6"/>`;
      e += `<circle cx="${x + 1}" cy="64.4" r="${Math.min(ry, 3.4) * sz}" fill="${iris}"/><circle cx="${x + 1}" cy="64.4" r="${1.5 * sz}" fill="#0b0b0f"/>`;
      e += `<circle cx="${x + 2.2}" cy="62.8" r="${1 * sz}" fill="#fff"/>`;
      // signature cartoon look: heavy upper lid in skin tone with a thick lash line
      const lid = { round: 0.18, almond: 0.42, sleepy: 0.6, sharp: 0.48, wide: 0 }[type] ?? 0.4;
      if (lid) {
        const ly = 64 - ry * sz + ry * 2 * sz * lid;
        e += `<path d="M${x - rx * sz - 1.2} ${ly} Q${x} ${64 - ry * sz - 2.5} ${x + rx * sz + 1.2} ${ly} L${x + rx * sz + 1.2} ${64 - ry * sz - 3} L${x - rx * sz - 1.2} ${64 - ry * sz - 3} Z" fill="${c.skin}"/>`;
        e += `<path d="M${x - rx * sz - 1.2} ${ly} L${x + rx * sz + 1.2} ${ly - 0.6}" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`;
      }
      if (type === 'sharp') e += `<path d="M${x + rx * sz} 62 l3 -2" stroke="${INK}" stroke-width="1.6"/>`;
      if (mk.liner) e += `<path d="M${x - rx * sz} 62.5 Q${x} ${64 - ry * sz - 1.5} ${x + rx * sz} 62.5 l4 -3" stroke="#0b0b0f" stroke-width="1.8" fill="none"/>`;
      return e;
    };
    const T = c.ft;
    return one(CX - 9 + ox - T.gap, 0.92 * T.eye) + one(CX + 11 + ox + T.gap, T.eye);
  }
  function brows(c, ox) {
    const t = c.a.face?.brows || 'soft'; if (t === 'none') return '';
    const col = safe(c.a.hair?.color || '#16120f'), w = { thick: 3.6, thin: 1.4 }[t] || 2.4, T = c.ft;
    if (t === 'slab') {   // chunky angular cartoon brows
      return [[CX - 16 + ox - T.gap, 1], [CX + 4 + ox + T.gap, -1]].map(([x, sg]) =>
        `<path d="M${x} ${sg > 0 ? 53 : 55} L${x + 13} ${sg > 0 ? 55 : 52} L${x + 13} ${sg > 0 ? 59 : 56} L${x} ${sg > 0 ? 57 : 59} Z" fill="${shade(col, -0.1)}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"
          transform="rotate(${sg * T.tilt} ${x + 6.5} 56)"/>`).join('');
    }
    const d = {
      soft: [`M${CX - 15 + ox} 55 q6 -3 12 0`, `M${CX + 5 + ox} 55 q6 -3 12 0`],
      thick: [`M${CX - 15 + ox} 55 q6 -4 12 -1`, `M${CX + 5 + ox} 54 q6 -3 12 1`],
      arched: [`M${CX - 15 + ox} 56 q5 -7 12 -2`, `M${CX + 5 + ox} 54 q7 -5 12 2`],
      angry: [`M${CX - 15 + ox} 52 l12 5`, `M${CX + 5 + ox} 57 l12 -5`],
      thin: [`M${CX - 15 + ox} 55 q6 -3 12 0`, `M${CX + 5 + ox} 55 q6 -3 12 0`],
    }[t] || [];
    return d.map((p, i) => `<g transform="translate(${i ? T.gap : -T.gap} 0) rotate(${i ? -T.tilt : T.tilt} ${CX + (i ? 11 : -9) + ox} 55)"><path d="${p}" stroke="${shade(col, -0.1)}" stroke-width="${w}" stroke-linecap="round" fill="none"/></g>`).join('');
  }
  function nose(c, ox) {
    const t = c.a.face?.nose || 'button', k = shade(c.skin, -0.35), x = CX + ox + 3;
    const d = {
      button: `M${x - 3} 74 q3 3 6 0`, straight: `M${x} 63 l2 10 q-2 2 -5 1`, wide: `M${x - 5} 74 q5 4 10 0 M${x - 2} 70 v3`,
      pointed: `M${x} 62 l4 12 l-6 0`, small: `M${x - 2} 74 q2 1.6 4 0`,
    }[t];
    if (t === 'triangle') return `<path d="M${x - 1} 67 L${x + 5} 76 L${x - 4} 76 Z" fill="${shade(c.skin, -0.18)}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
    return `<path d="${d}" stroke="${k}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  }
  function mouth(c, ox) {
    const t = c.a.face?.mouth || 'smile', x = CX + ox + 2, lips = c.a.makeup?.lips;
    const lc = lips ? safe(lips) : shade(c.skin, -0.45);
    switch (t) {
      case 'fangs': return `<path d="M${x - 12} 80 Q${x} 85 ${x + 12} 79 Q${x + 9} 92 ${x} 92 Q${x - 9} 92 ${x - 12} 80 Z" fill="#fdfcf8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M${x - 10} 85.5 l2.5 -3 2.5 3 2.5 -3 2.5 3 2.5 -3 2.5 3 2.5 -3 2.5 3" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linejoin="round"/>`;
      case 'shout': return `<path d="M${x - 9} 80 Q${x} 78 ${x + 9} 80 Q${x + 8} 95 ${x} 95 Q${x - 8} 95 ${x - 9} 80 Z" fill="#3a0f1c" stroke="${INK}" stroke-width="2.2"/>
        <path d="M${x - 8} 81 Q${x} 79.5 ${x + 8} 81 L${x + 7.5} 84 Q${x} 83 ${x - 7.5} 84 Z" fill="#fdfcf8"/><ellipse cx="${x}" cy="92" rx="4.5" ry="2.3" fill="#e0607a"/>`;
      case 'grin': return `<path d="M${x - 8} 82 q8 9 16 0 z" fill="#fff" stroke="${lc}" stroke-width="2"/><path d="M${x - 7} 83 h14" stroke="#ddd" stroke-width=".8"/>`;
      case 'sing': return `<ellipse cx="${x}" cy="84" rx="5" ry="6" fill="#4a1622" stroke="${lc}" stroke-width="2.2"/><ellipse cx="${x}" cy="87" rx="3" ry="2" fill="#d9677a"/>`;
      case 'smirk': return `<path d="M${x - 6} 84 q6 2 10 -3" stroke="${lc}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      case 'neutral': return `<path d="M${x - 5} 84 h10" stroke="${lc}" stroke-width="2.4" stroke-linecap="round"/>`;
      case 'snarl': return `<path d="M${x - 7} 84 q3 -4 7 -2 q4 -3 7 1 q-7 5 -14 1z" fill="#fff" stroke="${lc}" stroke-width="2"/>`;
      default: return `<path d="M${x - 7} 82 q7 7 14 0" stroke="${lc}" stroke-width="${lips ? 3 : 2.4}" fill="none" stroke-linecap="round"/>`;
    }
  }
  function marks(c, f, ox) {
    const m = c.a.face?.marks;
    if (m === 'freckles') return [[-14, 70], [-10, 73], [-16, 74], [14, 70], [18, 73], [12, 74]].map(([x, y]) => `<circle cx="${CX + ox + x}" cy="${y}" r=".9" fill="${shade(c.skin, -0.4)}"/>`).join('');
    if (m === 'mole') return `<circle cx="${CX + ox + 12}" cy="80" r="1.3" fill="#3a2418"/>`;
    if (m === 'scar') return `<path d="M${CX + ox + 14} 54 l4 16" stroke="${shade(c.skin, -0.3)}" stroke-width="1.6"/><path d="M${CX + ox + 14} 58 l4 -1 M${CX + ox + 15} 63 l4 -1" stroke="${shade(c.skin, -0.3)}" stroke-width="1"/>`;
    if (m === 'blush') return `<ellipse cx="${CX + ox - 13}" cy="73" rx="5" ry="3" fill="#ff7a8a" opacity=".35"/><ellipse cx="${CX + ox + 16}" cy="73" rx="5" ry="3" fill="#ff7a8a" opacity=".35"/>`;
    return '';
  }
  function facePaint(c, f, ox) {
    const p = c.a.makeup?.paint, col = safe(c.a.makeup?.paintColor || '#121216');
    switch (p) {
      case 'star': return `<path d="M${CX + 11 + ox} 52 l3 7.5 8 .6-6 5 2 8-7-4.4-7 4.4 2-8-6-5 8-.6z" fill="${col}" opacity=".9"/>`;
      case 'bolt': return `<path d="M${CX + ox - 20} 50 L${CX + ox - 2} 64 L${CX + ox - 8} 66 L${CX + ox + 6} 84 L${CX + ox - 14} 68 L${CX + ox - 7} 66 Z" fill="${col}" opacity=".85"/>`;
      case 'tears': return `<path d="M${CX + ox - 9} 68 q-1 6 0 10 M${CX + ox + 11} 68 q1 5 0 9" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/>`;
      case 'glitter': return [...Array(18)].map((_, i) => `<circle cx="${CX + ox - 18 + (i * 37) % 38}" cy="${58 + (i * 13) % 18}" r=".9" fill="${i % 2 ? '#fff6b0' : col}"/>`).join('');
      case 'corpse': return `<path d="${facePath(c.a.face?.shape)}" fill="#f4f1ec" opacity=".93"/>
        <ellipse cx="${CX - 9 + ox}" cy="63" rx="8" ry="8" fill="${col}"/><ellipse cx="${CX + 11 + ox}" cy="63" rx="8" ry="8" fill="${col}"/>
        <path d="M${CX + ox - 4} 80 l2 10 M${CX + ox + 2} 80 v12 M${CX + ox + 8} 80 l-2 10" stroke="${col}" stroke-width="2.4"/>`;
      case 'glamstar': {
        const lx = CX - 9 + ox - c.ft.gap, rx = CX + 11 + ox + c.ft.gap, st = (x, y, r) => [...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.45 : r; return `${(x + Math.cos(a) * k).toFixed(1)} ${(y + Math.sin(a) * k).toFixed(1)}`; }).join(' L');
        return `<path d="M${st(lx, 63, 13)} Z" fill="${col}" opacity=".85" stroke="${INK}" stroke-width="1.2"/><path d="M${rx - 9} 56 L${rx + 10} 60 L${rx + 4} 72 L${rx - 7} 70 Z" fill="#29b6f6" opacity=".85" stroke="${INK}" stroke-width="1.2"/>`;
      }
      case 'halfmask': return `<path d="M${CX} 37 C${CX - 18} 37 ${CX - 25} 48 ${CX - 25} 64 C${CX - 25} 76 ${CX - 21} 84 ${CX - 9} 88 L${CX} 90 Z" fill="${col}" opacity=".88"/>`;
    }
    return '';
  }
  function facialHair(c, f, ox) {
    const t = c.a.hair?.facial || 'none'; if (t === 'none') return '';
    const col = safe(c.a.hair?.facialColor || c.a.hair?.color || '#16120f'), g = c.grad(col);
    const x = CX + ox;
    switch (t) {
      case 'stubble': return `<path d="M${CX - f.jw} 78 Q${CX} ${f.chinY + 8} ${CX + f.jw} 78 Q${CX} ${f.chinY - 4} ${CX - f.jw} 78 Z" fill="${col}" opacity=".28"/>`;
      case 'mustache': return `<path d="M${x - 9} 81 q4 -5 9 -2 q5 -3 9 2 q-4 1 -9 -1 q-5 2 -9 1z" fill="${g}" stroke="${INK}" stroke-width="1"/>`;
      case 'goatee': return `<path d="M${x - 6} 88 q6 10 12 0 l-1 -2 q-5 3 -10 0z" fill="${g}" stroke="${INK}" stroke-width="1"/><path d="M${x - 8} 80 q8 -4 16 0" stroke="${col}" stroke-width="3" fill="none"/>`;
      case 'beard': return `<path d="M${CX - f.cw + 1} 66 C${CX - f.cw} 84 ${CX - 12} ${f.chinY + 12} ${CX} ${f.chinY + 13} C${CX + 12} ${f.chinY + 12} ${CX + f.cw} 84 ${CX + f.cw - 1} 66
        L${CX + f.cw - 6} 72 Q${x + 4} 92 ${x} 88 Q${x - 4} 92 ${CX - f.cw + 6} 72 Z" fill="${g}" stroke="${INK}" stroke-width="1.6"/>
        <path d="M${x - 9} 81 q4 -5 9 -2 q5 -3 9 2" fill="${g}" stroke="${INK}" stroke-width="1"/><path d="M${x - 5} 85 q5 4 10 0" stroke="#4a1622" stroke-width="2" fill="none"/>`;
      case 'bigbeard': {
        const by = f.chinY + 34;
        return `<path d="M${CX - f.cw - 1} 60 C${CX - f.cw - 6} 86 ${CX - 20} ${by - 4} ${CX - 12} ${by} L${CX - 6} ${by - 6} L${CX} ${by + 4} L${CX + 6} ${by - 6} L${CX + 12} ${by} C${CX + 20} ${by - 4} ${CX + f.cw + 6} 86 ${CX + f.cw + 1} 60
          L${CX + f.cw - 5} 70 Q${x + 6} 94 ${x} 90 Q${x - 6} 94 ${CX - f.cw + 5} 70 Z" fill="${g}" stroke="${INK}" stroke-width="2"/>
          <path d="M${x - 11} 81 q5 -6 11 -2 q6 -4 11 2 q-5 2 -11 -1 q-6 3 -11 1z" fill="${g}" stroke="${INK}" stroke-width="1.2"/><path d="M${x - 4} 86 q4 3 8 0" stroke="#4a1622" stroke-width="2" fill="none"/>
          <path d="M${CX - 12} ${by - 18} l2 8 M${CX + 2} ${by - 14} l-1 9 M${CX + 14} ${by - 20} l-2 8" stroke="${shade(col, -0.35)}" stroke-width="1.4"/>`;
      }
      case 'sideburns': return `<path d="M${CX - f.cw + 1} 58 v18 l5 2 v-20z M${CX + f.cw - 1} 58 v18 l-5 2 v-20z" fill="${g}"/>`;
      case 'soulpatch': return `<path d="M${x - 2} 89 l2 5 l2 -5z" fill="${g}"/>`;
    }
    return '';
  }

  /* ---------------------------------------------------------------- hair */
  function hairBack(c) {
    const h = c.a.hair || {}, st = h.style || 'messy', g = hairFill(c), o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
    switch (st) {
      case 'long': case 'bangs': return `<path d="M${CX - 28} 50 Q${CX - 34} 120 ${CX - 30} 168 L${CX + 32} 168 Q${CX + 36} 120 ${CX + 28} 50 Z" fill="${g}" ${o}/>`;
      case 'wavy': return `<path d="M${CX - 28} 50 Q${CX - 40} 90 ${CX - 30} 110 Q${CX - 42} 135 ${CX - 32} 160 Q${CX} 170 ${CX + 34} 160 Q${CX + 44} 135 ${CX + 32} 110 Q${CX + 42} 90 ${CX + 28} 50 Z" fill="${g}" ${o}/>`;
      case 'curly': return `<path d="${cloud(CX, 60, 46, 44, 14)}" fill="${g}" ${o}/>`;
      case 'hairmetal': return `<path d="${cloud(CX, 78, 54, 62, 16)}" fill="${g}" ${o}/>`;
      case 'locs': return [...Array(9)].map((_, i) => { const x = CX - 30 + i * 7.5; return `<path d="M${x} 52 Q${x + (i % 2 ? 4 : -4)} 110 ${x + (i - 4) * 1.5} 150" stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"/><path d="M${x} 52 Q${x + (i % 2 ? 4 : -4)} 110 ${x + (i - 4) * 1.5} 150" stroke="${g}" stroke-width="6" stroke-linecap="round" fill="none"/>`; }).join('');
      case 'bob': return `<path d="M${CX - 30} 46 Q${CX - 34} 80 ${CX - 30} 94 L${CX + 32} 94 Q${CX + 36} 80 ${CX + 30} 46 Z" fill="${g}" ${o}/>`;
      case 'mullet': return `<path d="M${CX - 24} 64 Q${CX - 30} 104 ${CX - 22} 122 L${CX + 24} 122 Q${CX + 30} 104 ${CX + 24} 64 Z" fill="${g}" ${o}/>`;
      case 'emo': return `<path d="M${CX - 28} 48 Q${CX - 32} 84 ${CX - 26} 100 L${CX + 28} 100 Q${CX + 32} 84 ${CX + 28} 48 Z" fill="${g}" ${o}/>`;
      case 'pigtails': return [-1, 1].map(sg => `<path d="M${CX + sg * 26} 56 q${sg * 22} 6 ${sg * 20} 50 q${sg * -6} 8 ${sg * -10} 0 q${sg * 6} -26 ${sg * -8} -40z" fill="${g}" ${o}/>`).join('');
      case 'braids': return '';
      case 'spiky': return '';   // drawn by headBack() so it scales with the head
      default: return '';
    }
  }
  /** Hair that sits behind the face but belongs to the head (scales with the head slider). */
  function headBack(c) {
    const h = c.a.hair || {}, g = hairFill(c), o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
    if (h.style === 'afro') return `<path d="${cloud(CX, 48, 50, 46, 20)}" fill="${g}" ${o}/>`;
    if (h.style === 'shag') return `<path d="${cloud(CX, 56, 36, 30, 14)}" fill="${g}" ${o}/>`;
    if (h.style === 'spiky') return `<path d="${spikes(CX, 56, 41, 37, 8, 0.8, 0.1, Math.PI * 0.86, Math.PI * 2.14)}" fill="${g}" ${o}/>`;
    return '';
  }
  function hairFront(c) {
    const h = c.a.hair || {}, st = h.style || 'messy', g = hairFill(c), o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
    const dark = shade(safe(h.color || '#16120f'), -0.45), light = shade(safe(h.color || '#16120f'), 0.35);
    const cap = (fr = 48, vol = 0) => {
      const top = 24 - vol;
      const d = `M${CX - 29} 70 C${CX - 35} 40 ${CX - 21} ${top} ${CX} ${top} C${CX + 21} ${top} ${CX + 35} 40 ${CX + 29} 70 L${CX + 25.5} 70
        L${CX + 24} 55 L${CX + 17} ${fr + 5} L${CX + 12} ${fr - 3} L${CX + 5} ${fr + 6} L${CX - 1} ${fr - 2} L${CX - 8} ${fr + 7} L${CX - 14} ${fr}
        L${CX - 21} ${fr + 9} L${CX - 24.5} 57 L${CX - 25.5} 70 Z`;
      return `<path d="${d}" fill="${g}"/>` + cel(d, { dx: -3, dy: -2, op: 0.2 }) + `<path d="${d}" fill="none" ${o}/>` +
        `<path d="M${CX - 10} ${top + 6} Q${CX - 17} 36 ${CX - 21} ${fr + 2} M${CX + 7} ${top + 5} Q${CX + 12} 34 ${CX + 18} ${fr} M${CX - 1} ${top + 3} Q${CX + 1} 36 ${CX + 3} ${fr - 4}
          M${CX - 26} 50 q1 8 1.5 16 M${CX + 26} 50 q-1 8 -1.5 16" stroke="${dark}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
        `<path d="M${CX - 14} ${top + 5} Q${CX - 4} ${top - 1} ${CX + 9} ${top + 4}" stroke="${light}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".75"/>`;
    };
    switch (st) {
      case 'bald': return `<ellipse cx="${CX + 8}" cy="42" rx="8" ry="3" fill="#fff" opacity=".22"/>`;
      case 'buzz': return `<path d="M${CX - 26} 58 C${CX - 28} 36 ${CX - 12} 33 ${CX} 33 C${CX + 12} 33 ${CX + 28} 36 ${CX + 26} 58 Q${CX} 44 ${CX - 26} 58 Z" fill="${g}" opacity=".75"/>`;
      case 'messy': return cap(48) + `<path d="M${CX - 24} 52 l4 -10 l3 9 l5 -12 l4 11 l6 -13 l3 12 l6 -10 l2 11 l5 -6 l-2 10" fill="${g}" ${o}/>`;
      case 'pompadour': return `<path d="M${CX - 27} 60 C${CX - 32} 30 ${CX - 20} 10 ${CX + 6} 12 C${CX + 30} 14 ${CX + 34} 30 ${CX + 27} 58 Q${CX + 10} 40 ${CX - 4} 44 Q${CX - 18} 46 ${CX - 27} 60 Z" fill="${g}" ${o}/>
        <path d="M${CX - 10} 22 q14 -8 28 4" stroke="#fff" stroke-width="2" opacity=".35" fill="none"/>`;
      case 'mohawk': return `<path d="M${CX - 26} 58 C${CX - 28} 36 ${CX - 12} 33 ${CX} 33 C${CX + 12} 33 ${CX + 28} 36 ${CX + 26} 58 Q${CX} 44 ${CX - 26} 58 Z" fill="${g}" opacity=".35"/>
        <path d="M${CX - 8} 40 L${CX - 14} 6 L${CX - 3} 30 L${CX - 2} -4 L${CX + 5} 28 L${CX + 12} 2 L${CX + 10} 32 L${CX + 22} 14 L${CX + 12} 42 Z" fill="${g}" ${o}/>`;
      case 'liberty': return cap(48) + [-60, -35, -12, 12, 35, 60].map(r => `<path d="M${CX - 5} 40 L${CX} -2 L${CX + 5} 40 Z" fill="${g}" ${o} transform="rotate(${r} ${CX} 52)"/>`).join('');
      case 'undercut': return `<path d="M${CX - 26} 58 C${CX - 28} 40 ${CX - 20} 34 ${CX - 10} 33 L${CX - 10} 58 Z" fill="${g}" opacity=".35"/>
        <path d="M${CX - 14} 48 C${CX - 14} 26 ${CX + 10} 22 ${CX + 26} 32 C${CX + 36} 42 ${CX + 32} 62 ${CX + 26} 72 Q${CX + 20} 54 ${CX + 4} 50 Q${CX - 6} 50 ${CX - 14} 48 Z" fill="${g}" ${o}/>`;
      case 'mullet': return cap(48) + `<path d="M${CX - 22} 52 l5 -8 l4 7 l5 -9 l4 8 l5 -9 l5 9 l5 -7 l4 8" fill="${g}" ${o}/>`;
      case 'emo': return cap(46) + `<path d="M${CX + 26} 48 C${CX + 10} 40 ${CX - 10} 44 ${CX - 22} 74 L${CX - 26} 60 C${CX - 26} 40 ${CX - 6} 32 ${CX + 20} 36 Z" fill="${g}" ${o}/>`;
      case 'bob': return cap(46) + `<path d="M${CX - 27} 56 h54 v-6 q-27 -10 -54 0 z" fill="${g}" ${o}/>`;
      case 'long': case 'wavy': return cap(48) + `<path d="M${CX} 30 L${CX - 2} 48" stroke="${INK}" stroke-width="1.4"/>`;
      case 'curly': return `<path d="${cloud(CX, 40, 32, 16, 9)}" fill="${g}" ${o}/>`;
      case 'hairmetal': return `<path d="${cloud(CX, 38, 36, 18, 10)}" fill="${g}" ${o}/>`;
      case 'locs': return cap(46) + [...Array(5)].map((_, i) => `<path d="M${CX - 20 + i * 10} 44 v8" stroke="${g}" stroke-width="6" stroke-linecap="round"/>`).join('');
      case 'pigtails': return cap(48) + [-1, 1].map(sg => `<circle cx="${CX + sg * 27}" cy="58" r="3.5" fill="${safe(h.color2 || '#ff4d8b')}" stroke="${INK}" stroke-width="1.2"/>`).join('') + `<path d="M${CX} 30 L${CX - 1} 48" stroke="${INK}" stroke-width="1.4"/>`;
      case 'spiky': {
        // a big wild mop: jagged crown, spiky fringe hanging over the brow, tufts over the ears
        const crown = spikes(CX, 38, 36, 26, 7, 0.74, 0.14, Math.PI * 1.04, Math.PI * 1.96);
        const d = `M${CX - 30} 72 L${CX - 33} 60 L${CX - 40} 56 L${CX - 31} 50 ${crown.replace(/^M/, 'L')} L${CX + 31} 50 L${CX + 40} 57 L${CX + 32} 60 L${CX + 29} 72
          L${CX + 25} 58 L${CX + 22} 66 L${CX + 17} 52 L${CX + 12} 62 L${CX + 7} 50 L${CX + 1} 63 L${CX - 4} 50 L${CX - 9} 61 L${CX - 14} 51 L${CX - 19} 64 L${CX - 23} 53 L${CX - 26} 66 Z`;
        return `<path d="${d}" fill="${g}"/>` + cel(d, { dx: -3, dy: -2, op: 0.2 }) + `<path d="${d}" fill="none" ${o}/>` +
          `<path d="M${CX - 18} 22 l4 14 M${CX - 4} 14 l1 18 M${CX + 12} 18 l-3 15 M${CX + 22} 30 l-6 10 M${CX - 26} 36 l7 7" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      }
      case 'afro': return `<path d="M${CX - 27} 54 C${CX - 26} 40 ${CX - 14} 36 ${CX} 36 C${CX + 14} 36 ${CX + 26} 40 ${CX + 27} 54 Q${CX + 14} 44 ${CX} 46 Q${CX - 14} 44 ${CX - 27} 54 Z" fill="${g}"/>
        <path d="M${CX - 27} 54 Q${CX - 14} 44 ${CX} 46 Q${CX + 14} 44 ${CX + 27} 54" stroke="${INK}" stroke-width="2.4" fill="none"/>`;
      case 'shag': return `<path d="${cloud(CX, 40, 32, 16, 12)}" fill="${g}" ${o}/>` + `<path d="${cloud(CX - 8, 50, 14, 6, 6)}" fill="${g}" ${o}/>`;
      case 'puff': return `<path d="M${CX - 27} 58 C${CX - 29} 32 ${CX - 12} 30 ${CX} 30 C${CX + 12} 30 ${CX + 29} 32 ${CX + 27} 58 Q${CX} 42 ${CX - 27} 58 Z" fill="${g}" ${o}/>
        <path d="${cloud(CX, 8, 24, 20, 13)}" fill="${g}" ${o}/><rect x="${CX - 9}" y="26" width="18" height="6" rx="3" fill="${safe(h.color2 || '#ff4d8b')}" stroke="${INK}" stroke-width="1.6"/>`;
      case 'updo': return `<ellipse cx="${CX + 2}" cy="14" rx="26" ry="24" fill="${g}" ${o}/><circle cx="${CX + 8}" cy="-12" r="11" fill="${g}" ${o}/>
        <path d="M${CX - 28} 62 C${CX - 32} 34 ${CX - 16} 30 ${CX} 32 C${CX + 18} 30 ${CX + 32} 36 ${CX + 28} 62 Q${CX + 10} 40 ${CX - 4} 44 Q${CX - 20} 44 ${CX - 28} 62 Z" fill="${g}" ${o}/>
        <path d="M${CX - 12} 4 q10 -10 24 0 M${CX - 16} 18 q14 -10 30 0" stroke="${dark}" stroke-width="1.6" fill="none"/><path d="M${CX - 24} 62 q-4 10 2 20" stroke="${g}" stroke-width="3" fill="none"/>`;
      case 'swept': return `<path d="M${CX - 26} 60 C${CX - 28} 40 ${CX - 18} 34 ${CX - 8} 33 L${CX - 8} 58 Z" fill="${g}" opacity=".4"/>
        <path d="M${CX - 10} 50 C${CX - 16} 22 ${CX + 4} 6 ${CX + 30} 4 L${CX + 52} -10 L${CX + 40} 10 L${CX + 58} 6 L${CX + 38} 24 C${CX + 34} 42 ${CX + 30} 58 ${CX + 27} 70 Q${CX + 18} 50 ${CX + 6} 50 Q${CX - 2} 52 ${CX - 10} 50 Z" fill="${g}" ${o}/>
        <path d="M${CX - 2} 30 q16 -16 40 -20 M${CX + 6} 42 q14 -12 30 -14" stroke="${dark}" stroke-width="1.6" fill="none"/>`;
      case 'bangs': return `<path d="M${CX - 29} 74 C${CX - 34} 36 ${CX - 20} 24 ${CX} 24 C${CX + 20} 24 ${CX + 34} 36 ${CX + 29} 74 L${CX + 25} 74 L${CX + 25} 54 L${CX - 25} 54 L${CX - 25} 74 Z" fill="${g}" ${o}/>
        <path d="M${CX - 14} 30 v22 M${CX} 26 v26 M${CX + 14} 30 v22" stroke="${dark}" stroke-width="1.3"/>`;
      case 'fade': return `<path d="M${CX - 26} 60 C${CX - 28} 46 ${CX - 26} 40 ${CX - 24} 38 L${CX + 24} 38 C${CX + 26} 40 ${CX + 28} 46 ${CX + 26} 60 Q${CX} 46 ${CX - 26} 60 Z" fill="${g}" opacity=".55"/>
        <path d="M${CX - 24} 44 L${CX - 25} 8 Q${CX} 2 ${CX + 25} 8 L${CX + 24} 44 Q${CX} 38 ${CX - 24} 44 Z" fill="${g}" ${o}/><path d="M${CX - 16} 10 v30 M${CX} 6 v34 M${CX + 16} 10 v30" stroke="${dark}" stroke-width="1" opacity=".5"/>`;
      case 'bun': return cap(48) + `<circle cx="${CX}" cy="24" r="12" fill="${g}" ${o}/>`;
      case 'braids': return cap(48) + [-1, 1].map(sg => [...Array(6)].map((_, i) =>
        `<ellipse cx="${CX + sg * (26 + i * 0.6)}" cy="${70 + i * 12}" rx="5.5" ry="7" fill="${g}" ${o}/>`).join('')).join('');
    }
    return '';
  }
  function hairFill(c) {
    const h = c.a.hair || {}, c1 = safe(h.color || '#16120f');
    if (!h.color2 || h.style === 'pigtails' || h.style === 'puff') return c.grad(c1, 'v');
    const key = 'hair' + c1 + h.color2;
    if (!c.gradCache.has(key)) {
      const id = `${c.id}hair`;
      c.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c1, 0.15)}"/><stop offset=".55" stop-color="${c1}"/><stop offset="1" stop-color="${safe(h.color2)}"/></linearGradient>`);
      c.gradCache.set(key, id);
    }
    return `url(#${c.gradCache.get(key)})`;
  }
  /** Jagged spike ring around an ellipse (inner = fraction of radius for the valleys). Optional arc a0..a1. */
  function spikes(cx, cy, rx, ry, n, inner, jitter = 0, a0 = 0, a1 = Math.PI * 2) {
    const full = a1 - a0 >= Math.PI * 2 - 0.01, steps = full ? n * 2 : n * 2 + 1, pts = [];
    for (let i = 0; i < steps; i++) {
      const t = a0 + (a1 - a0) * i / (full ? steps : steps - 1), outer = i % 2 === 0;
      const k = outer ? 1 + jitter * Math.sin(i * 2.7) : inner;
      pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
    }
    return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join(' L') + (full ? ' Z' : '');
  }
  function cloud(cx, cy, rx, ry, n) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, a2 = ((i + 0.5) / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      const qx = cx + Math.cos(a2) * rx * 1.18, qy = cy + Math.sin(a2) * ry * 1.18;
      d += i === 0 ? `M${x} ${y}` : ` Q${qx0} ${qy0} ${x} ${y}`;
      var qx0 = qx, qy0 = qy; // eslint-disable-line no-var
    }
    return d + 'Z';
  }

  /* ---------------------------------------------------------------- hats & glasses */
  function drawHat(c) {
    const it = c.a.outfit?.hat; if (!it || it.id === 'none') return '';
    const col = safe(it.color || '#121216'), g = c.fabric(it), o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
    switch (it.id) {
      case 'beanie': return `<path d="M${CX - 28} 52 C${CX - 30} 20 ${CX + 30} 20 ${CX + 28} 52 Z" fill="${g}" ${o}/><rect x="${CX - 30}" y="46" width="60" height="10" rx="4" fill="${shade(col, -0.2)}" ${o}/>`;
      case 'bandana': return `<path d="M${CX - 28} 50 C${CX - 28} 30 ${CX + 28} 30 ${CX + 28} 50 Q${CX} 44 ${CX - 28} 50 Z" fill="${c.fabric({ color: col, pattern: 'polka', color2: '#f2f2f2' })}" ${o}/><path d="M${CX - 28} 48 l-10 8 l6 -12z" fill="${col}" ${o}/>`;
      case 'cap': return `<path d="M${CX - 27} 50 C${CX - 28} 26 ${CX + 28} 26 ${CX + 27} 50 Z" fill="${g}" ${o}/><path d="M${CX - 27} 48 l-16 4 l16 4z" fill="${shade(col, -0.25)}" ${o}/>`;
      case 'cowboy': return `<path d="M${CX - 48} 48 Q${CX} 60 ${CX + 48} 48 Q${CX + 40} 54 ${CX} 56 Q${CX - 40} 54 ${CX - 48} 48 Z" fill="${g}" ${o}/>
        <path d="M${CX - 22} 50 C${CX - 24} 18 ${CX - 6} 22 ${CX} 28 C${CX + 6} 22 ${CX + 24} 18 ${CX + 22} 50 Z" fill="${g}" ${o}/><path d="M${CX - 22} 46 h44" stroke="${shade(col, 0.4)}" stroke-width="3"/>`;
      case 'fedora': return `<ellipse cx="${CX}" cy="48" rx="40" ry="7" fill="${g}" ${o}/><path d="M${CX - 22} 48 C${CX - 22} 22 ${CX + 22} 22 ${CX + 22} 48 Z" fill="${g}" ${o}/><path d="M${CX - 22} 43 h44" stroke="#141014" stroke-width="4"/>`;
      case 'tophat': return `<ellipse cx="${CX}" cy="44" rx="36" ry="7" fill="${g}" ${o}/><rect x="${CX - 20}" y="0" width="40" height="44" fill="${g}" ${o}/><rect x="${CX - 20}" y="32" width="40" height="6" fill="#b3121f"/>`;
      case 'porkpie': return `<ellipse cx="${CX}" cy="46" rx="36" ry="6" fill="${g}" ${o}/><path d="M${CX - 21} 46 L${CX - 20} 26 Q${CX} 22 ${CX + 20} 26 L${CX + 21} 46 Z" fill="${g}" ${o}/>
        <rect x="${CX - 21}" y="37" width="42" height="7" fill="${c.fabric({ color: '#f2efe8', color2: '#141014', pattern: 'checker' })}" stroke="${INK}" stroke-width="1.4"/><path d="M${CX - 14} 26 q14 4 28 0" stroke="${shade(col, -0.3)}" stroke-width="2" fill="none"/>`;
      case 'tam': return `<rect x="${CX - 29}" y="40" width="58" height="10" rx="4" fill="${safe(it.color2 || '#d62828')}" ${o}/>
        <ellipse cx="${CX + 6}" cy="30" rx="42" ry="18" fill="#f4c430" ${o}/><ellipse cx="${CX + 8}" cy="22" rx="32" ry="12" fill="${g}" ${o}/>`;
      case 'straw': return `<ellipse cx="${CX}" cy="47" rx="54" ry="10" fill="#e6c66e" ${o}/>${[-36, -18, 18, 36].map(x => `<path d="M${CX + x} 40 l${x / 6} 14" stroke="#b38f3a" stroke-width="1.2"/>`).join('')}
        <path d="M${CX - 24} 47 C${CX - 26} 16 ${CX + 26} 16 ${CX + 24} 47 Z" fill="#e6c66e" ${o}/><rect x="${CX - 24}" y="38" width="48" height="7" fill="${g}" stroke="${INK}" stroke-width="1.6"/>`;
      case 'trucker': return `<path d="M${CX - 27} 50 C${CX - 28} 22 ${CX + 28} 22 ${CX + 27} 50 Z" fill="#f2efe8" ${o}/><path d="M${CX - 22} 49 C${CX - 22} 24 ${CX + 22} 24 ${CX + 22} 49 Z" fill="${g}" ${o}/>
        <path d="M${CX - 26} 48 Q${CX + 8} 44 ${CX + 50} 54 Q${CX + 10} 58 ${CX - 26} 54 Z" fill="${shade(col, -0.25)}" ${o}/><circle cx="${CX}" cy="25" r="2.4" fill="${shade(col, -0.3)}"/>`;
      case 'backcap': return `<path d="M${CX - 27} 50 C${CX - 28} 24 ${CX + 28} 24 ${CX + 27} 50 Z" fill="${g}" ${o}/><path d="M${CX - 24} 46 Q${CX - 42} 40 ${CX - 54} 44 Q${CX - 44} 52 ${CX - 26} 52 Z" fill="${shade(col, -0.25)}" ${o}/>
        <path d="M${CX + 2} 50 a8 7 0 0 1 16 0" fill="${hairFill(c)}" stroke="${INK}" stroke-width="2"/><circle cx="${CX}" cy="27" r="2.4" fill="${shade(col, -0.3)}"/>`;
      case 'headphones': return `<path d="M${CX - 29} 64 C${CX - 34} 14 ${CX + 34} 14 ${CX + 29} 64" stroke="${INK}" stroke-width="7" fill="none"/><path d="M${CX - 29} 64 C${CX - 34} 14 ${CX + 34} 14 ${CX + 29} 64" stroke="${col}" stroke-width="4" fill="none"/>
        <rect x="${CX - 36}" y="54" width="13" height="22" rx="5" fill="${g}" ${o}/><rect x="${CX + 23}" y="54" width="13" height="22" rx="5" fill="${g}" ${o}/>`;
      case 'shako': return `<path d="M${CX - 22} 46 L${CX - 20} 2 Q${CX} -2 ${CX + 20} 2 L${CX + 22} 46 Z" fill="${g}" ${o}/><ellipse cx="${CX}" cy="2" rx="20" ry="4" fill="${shade(col, -0.2)}" ${o}/>
        <path d="M${CX - 9} 14 h18 l-2 16 -7 5 -7 -5z" fill="#e9c04a" stroke="${INK}" stroke-width="1.8"/><path d="M${CX - 24} 46 Q${CX} 54 ${CX + 24} 46 L${CX + 22} 40 Q${CX} 46 ${CX - 22} 40 Z" fill="#141014" ${o}/>
        <path d="M${CX} 0 C${CX - 10} -16 ${CX - 4} -30 ${CX + 4} -38 C${CX + 2} -26 ${CX + 10} -16 ${CX + 4} 0 Z" fill="${safe(it.color2 || '#f4c430')}" ${o}/><path d="M${CX - 22} 50 Q${CX} 62 ${CX + 22} 50" stroke="#e9c04a" stroke-width="1.8" fill="none"/>`;
      case 'turban': return `<path d="M${CX - 28} 50 C${CX - 36} 14 ${CX + 36} 14 ${CX + 28} 50 Q${CX} 40 ${CX - 28} 50 Z" fill="${g}" ${o}/>
        <path d="M${CX - 26} 40 Q${CX} 22 ${CX + 30} 34 M${CX - 30} 30 Q${CX + 4} 12 ${CX + 26} 24 M${CX - 22} 48 Q${CX + 4} 30 ${CX + 28} 46" stroke="${shade(col, -0.3)}" stroke-width="2" fill="none"/>
        <circle cx="${CX + 2}" cy="38" r="4" fill="#2bb673" stroke="#e9c04a" stroke-width="2"/>`;
      case 'crown': return `<path d="M${CX - 22} 40 L${CX - 24} 14 L${CX - 12} 28 L${CX} 8 L${CX + 12} 28 L${CX + 24} 14 L${CX + 22} 40 Z" fill="${c.grad('#f0c33c')}" ${o}/>
        <circle cx="${CX}" cy="30" r="3" fill="#b3121f"/><circle cx="${CX - 13}" cy="33" r="2" fill="#2453ff"/><circle cx="${CX + 13}" cy="33" r="2" fill="#1f8f4e"/>`;
    }
    return '';
  }
  function drawGlasses(c) {
    const it = c.a.outfit?.glasses; if (!it || it.id === 'none') return '';
    const col = safe(it.color || '#121216'), ox = 3, l = CX - 9 + ox - c.ft.gap, r = CX + 11 + ox + c.ft.gap;
    const lens = `fill="${shade(col, -0.2)}" fill-opacity=".85" stroke="${INK}" stroke-width="2"`;
    switch (it.id) {
      case 'round': return `<circle cx="${l}" cy="64" r="7" ${lens}/><circle cx="${r}" cy="64" r="7" ${lens}/><path d="M${l + 7} 63 h${r - l - 14}" stroke="${INK}" stroke-width="2"/>`;
      case 'aviators': return `<path d="M${l - 8} 59 h15 q0 11 -8 11 q-7 0 -7 -11z M${r - 7} 59 h15 q0 11 -7 11 q-8 0 -8 -11z" ${lens}/><path d="M${l + 7} 60 h${r - l - 14}" stroke="${INK}" stroke-width="2"/>`;
      case 'heart': return [l, r].map(x => `<path d="M${x} 70 C${x - 9} 64 ${x - 7} 56 ${x - 3} 57 c2 0 3 2 3 2 s1 -2 3 -2 c4 -1 6 7 -3 13z" ${lens}/>`).join('');
      case 'star': return [l, r].map(x => `<path d="M${x} 55 l2.6 6 6.4.6-4.8 4.3 1.4 6.4L${x} 69l-5.6 3.3 1.4-6.4-4.8-4.3 6.4-.6z" ${lens}/>`).join('');
      case 'visor': return `<path d="M${CX - 22} 58 h48 q2 10 -4 12 h-40 q-6 -2 -4 -12z" fill="${col}" fill-opacity=".8" stroke="${INK}" stroke-width="2"/><path d="M${CX - 18} 62 h40" stroke="#fff" stroke-width="1.4" opacity=".6"/>`;
      case 'square': return `<rect x="${l - 9}" y="57" width="17" height="13" rx="2" fill="#2a2433" fill-opacity=".85" stroke="${col === '#121216' ? INK : col}" stroke-width="3"/><rect x="${r - 8}" y="57" width="17" height="13" rx="2" fill="#2a2433" fill-opacity=".85" stroke="${col === '#121216' ? INK : col}" stroke-width="3"/><path d="M${l + 8} 61 h${r - l - 16}" stroke="${INK}" stroke-width="2.4"/>`;
      case 'eyepatch': return `<path d="M${CX - 26} 54 L${CX + 26} 60" stroke="#141014" stroke-width="1.6"/><ellipse cx="${r}" cy="64" rx="7" ry="6" fill="#141014"/>`;
    }
    return '';
  }

  /* ---------------------------------------------------------------- instruments */
  function finishFill(c, color, finish) {
    color = safe(color);
    if (finish === 'matte') return color;
    if (finish === 'chrome') return c.grad('#c9ced8');
    const id = `${c.id}fin${c.gradCache.size}`;
    if (finish === 'sunburst') {
      c.defs.push(`<radialGradient id="${id}" cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#f4c56a"/><stop offset=".6" stop-color="${color}"/><stop offset="1" stop-color="#1a0d06"/></radialGradient>`);
      c.gradCache.set(id, id); return `url(#${id})`;
    }
    if (finish === 'sparkle') {
      c.defs.push(`<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/>
        <circle cx="2" cy="2" r=".8" fill="#fff" opacity=".8"/><circle cx="6" cy="5" r=".6" fill="${shade(color, 0.6)}"/></pattern>`);
      c.gradCache.set(id, id); return `url(#${id})`;
    }
    return c.grad(color);
  }
  const GUITAR_BODIES = {
    classic: 'M-14 -28 C-8 -36 -2 -30 0 -24 C4 -34 14 -34 16 -24 C22 -10 14 -4 16 6 C20 22 12 34 0 34 C-14 34 -22 24 -18 8 C-16 0 -24 -14 -14 -28 Z',
    singlecut: 'M-10 -30 C0 -34 8 -26 6 -20 C18 -22 22 -8 18 4 C24 18 14 34 0 34 C-16 34 -24 20 -18 4 C-22 -8 -20 -26 -10 -30 Z',
    acoustic: 'M-14 -30 C-4 -36 4 -36 14 -30 C20 -24 16 -14 14 -10 C24 -2 26 20 14 30 C6 36 -6 36 -14 30 C-26 20 -24 -2 -14 -10 C-16 -14 -20 -24 -14 -30 Z',
    vee: 'M-3 -26 L-26 34 L-12 34 L0 6 L12 34 L26 34 L3 -26 Z',
    hollow: 'M-16 -28 C-6 -36 6 -36 16 -28 C24 -20 18 -12 18 -8 C30 2 28 24 14 32 C6 36 -6 36 -14 32 C-28 24 -30 2 -18 -8 C-18 -12 -24 -20 -16 -28 Z',
    star: 'M0 -34 L8 -12 L30 -10 L12 4 L20 30 L0 16 L-20 30 L-12 4 L-30 -10 L-8 -12 Z',
    banjo: 'M-24 6 A24 24 0 1 0 24 6 A24 24 0 1 0 -24 6 Z',
    offset: 'M-12 -30 C-2 -36 10 -30 8 -22 C20 -26 24 -10 18 2 C24 16 16 34 0 34 C-16 36 -26 22 -20 6 C-26 -6 -24 -26 -12 -30 Z',
  };
  const BASS_BODIES = {
    classic: 'M-12 -30 C-6 -40 0 -32 0 -26 C6 -38 18 -36 16 -22 C22 -8 14 -2 16 8 C20 24 12 36 0 36 C-14 36 -24 26 -18 10 C-16 0 -24 -16 -12 -30 Z',
    pshape: 'M-12 -28 C-2 -36 10 -34 14 -26 C22 -10 18 0 18 8 C22 24 12 36 0 36 C-14 36 -24 26 -20 8 C-20 -2 -22 -18 -12 -28 Z',
    fivestring: 'M-12 -30 C-6 -40 0 -32 0 -26 C6 -38 18 -36 16 -22 C22 -8 14 -2 16 8 C20 24 12 36 0 36 C-14 36 -24 26 -18 10 C-16 0 -24 -16 -12 -30 Z',
  };
  function stringed(c, body, neckLen, strings, fill, extra = '') {
    const o = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
    let s = `<rect x="-4.5" y="${-neckLen - 26}" width="9" height="${neckLen + 20}" rx="2" fill="#5a3b26" ${o}/>`;
    for (let i = 1; i < 9; i++) s += `<line x1="-4" y1="${-26 - i * neckLen / 9}" x2="4" y2="${-26 - i * neckLen / 9}" stroke="#d9d4cc" stroke-width=".8"/>`;
    s += `<path d="M-6 ${-neckLen - 26} L-7 ${-neckLen - 44} L7 ${-neckLen - 46} L6 ${-neckLen - 26} Z" fill="#2a1b12" ${o}/>`;
    s += `<path d="${body}" fill="${fill}" ${o}/>${extra}`;
    for (let i = 0; i < strings; i++) { const x = -3 + i * 6 / (strings - 1); s += `<line x1="${x}" y1="${-neckLen - 26}" x2="${x}" y2="18" stroke="#eee" stroke-width=".5" opacity=".9"/>`; }
    s += `<rect x="-7" y="16" width="14" height="4" rx="1" fill="#1a1a1a"/>`;
    return s;
  }
  /** The newer instruments (cello, harp, sitar, synth, piano, accordion, horns, DJ gear, marching snare, harmonica). */
  function drawExtra(c, key, ins, fill, o) {
    const hs = c.b.head, M = [CX + 5 * hs, 90 - 6 * hs];   // mouth in body space
    const brass = finishFill(c, ins.color || '#e3b23c', ins.finish === 'matte' ? 'gloss' : ins.finish);
    const wood = finishFill(c, ins.color || '#7a3b16', ins.finish || 'sunburst');
    const O = (w = 2.4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
    switch (key) {
      case 'cello': {
        const body = 'M-24 -60 C-8 -70 8 -70 24 -60 C30 -48 22 -36 20 -30 C38 -14 38 28 22 46 C10 56 -10 56 -22 46 C-38 28 -38 -14 -20 -30 C-22 -36 -30 -48 -24 -60 Z';
        return `<g transform="translate(${CX - 2} 240)">
          <line x1="0" y1="50" x2="0" y2="${Y.foot - 240}" stroke="#2b2b30" stroke-width="3"/>
          <rect x="-4" y="-150" width="8" height="96" rx="2" fill="#16110d" ${O(2)}/>
          <path d="M-5 -150 q-8 -6 0 -14 q10 -2 9 8 q-2 4 -6 3" fill="${wood}" ${O(2)}/>
          <path d="${body}" fill="${wood}" ${O(3)}/>
          <path d="M-12 -14 q-5 12 0 24 M12 -14 q5 12 0 24" stroke="#1a0d06" stroke-width="2.4" fill="none"/>
          <rect x="-8" y="14" width="16" height="3" fill="#e8d6a8" ${O(1)}/><path d="M-6 38 l6 10 6 -10z" fill="#16110d"/>
          ${[-3, -1, 1, 3].map(x => `<line x1="${x}" y1="-150" x2="${x}" y2="40" stroke="#eee" stroke-width=".6"/>`).join('')}</g>
          <line x1="${CX - 50}" y1="236" x2="${c.pose.B[2][0] + 8}" y2="${c.pose.B[2][1] + 2}" stroke="#5a3b26" stroke-width="2.6"/><line x1="${CX - 50}" y1="238" x2="${c.pose.B[2][0] + 8}" y2="${c.pose.B[2][1] + 4}" stroke="#e8e2d0" stroke-width="1"/>`;
      }
      case 'harp': {
        const x0 = CX - 40, x1 = CX + 46;
        let str = ''; for (let i = 0; i < 10; i++) { const x = x0 + 10 + i * 8; str += `<line x1="${x}" y1="${118 + i * 6}" x2="${x + 4}" y2="${300 - i * 4}" stroke="#f3ead2" stroke-width="1"/>`; }
        return `<g><path d="M${x0} ${Y.foot} L${x0 + 6} 100 Q${CX} 86 ${x1 - 10} 108 Q${x1 + 12} 118 ${x1} 140 L${x0 + 16} ${Y.foot} Z" fill="none"/>
          <path d="M${x0 - 6} ${Y.foot} L${x0} 106 L${x0 + 10} 106 L${x0 + 8} ${Y.foot} Z" fill="${wood}" ${O(2.6)}/>
          <path d="M${x0} 106 Q${CX - 6} 80 ${CX + 18} 100 Q${x1 + 4} 112 ${x1 + 8} 132 L${x1} 138 Q${CX + 10} 112 ${x0 + 10} 116 Z" fill="${wood}" ${O(2.6)}/>
          <path d="M${x1 + 6} 132 L${x0 + 22} ${Y.foot - 6} L${x0 + 8} ${Y.foot - 4} L${x1 - 4} 136 Z" fill="${shade(safe(ins.color || '#7a3b16'), 0.2)}" ${O(2.6)}/>
          ${str}<rect x="${x0 - 10}" y="${Y.foot - 6}" width="${x1 - x0 + 4}" height="8" rx="3" fill="${wood}" ${O(2)}/></g>`;
      }
      case 'sitar': {
        let frets = ''; for (let i = 0; i < 12; i++) frets += `<path d="M-5 ${-40 - i * 8} h10" stroke="#e8d6a8" stroke-width="1.2"/>`;
        return `<g transform="translate(${CX - 10} 196) rotate(52) scale(1.25)">
          <rect x="-6" y="-140" width="12" height="110" rx="3" fill="${wood}" ${O(2)}/>${frets}
          <circle cx="0" cy="-118" r="9" fill="${shade(safe(ins.color || '#7a3b16'), -0.2)}" ${O(2)}/>
          <path d="M-7 -150 l-2 -10 h18 l-2 10z" fill="${wood}" ${O(2)}/>${[-150, -140, -130].map(y => `<rect x="-12" y="${y}" width="5" height="3" fill="#e8d6a8"/><rect x="7" y="${y + 4}" width="5" height="3" fill="#e8d6a8"/>`).join('')}
          <ellipse cx="0" cy="0" rx="26" ry="28" fill="${wood}" ${O(2.6)}/><ellipse cx="0" cy="2" rx="16" ry="18" fill="#e8d6a8" ${O(1.6)}/>
          <path d="M-14 -6 q14 -10 28 0 M-12 10 q12 8 24 0" stroke="#7a3b16" stroke-width="1.4" fill="none"/>
          ${[-3, -1, 1, 3].map(x => `<line x1="${x}" y1="-150" x2="${x}" y2="16" stroke="#eee" stroke-width=".5"/>`).join('')}</g>`;
      }
      case 'synth': case 'piano': {
        const w = key === 'piano' ? 150 : 130, y = 204;
        let keys = '';
        for (let i = 0; i < 18; i++) keys += `<rect x="${CX - w / 2 + 6 + i * (w - 12) / 18}" y="${y}" width="${(w - 12) / 18 - 0.6}" height="13" fill="#fafafa" stroke="#222" stroke-width=".5"/>`;
        for (let i = 0; i < 17; i++) if (i % 7 !== 2 && i % 7 !== 6) keys += `<rect x="${CX - w / 2 + 6 + (i + 0.65) * (w - 12) / 18}" y="${y}" width="${(w - 12) / 30}" height="8" fill="#111"/>`;
        if (key === 'piano') return `<path d="M${CX - w / 2} ${y - 2} h${w} v${Y.foot - y - 10} h-10 v10 h-12 v-10 h${-(w - 44)} v10 h-12 v-10 h-10 z" fill="${finishFill(c, ins.color || '#17141c', ins.finish)}" ${O(3)}/>
          <rect x="${CX - w / 2 + 4}" y="${y - 2}" width="${w - 8}" height="17" fill="#0b0910" ${O(1.4)}/>${keys}
          <rect x="${CX - w / 2 + 16}" y="${y + 26}" width="${w - 32}" height="${Y.foot - y - 54}" rx="4" fill="none" stroke="${shade(safe(ins.color || '#17141c'), 0.25)}" stroke-width="2"/>
          <path d="M${CX - 10} ${Y.foot - 12} h6 M${CX + 4} ${Y.foot - 12} h6" stroke="#d6b65c" stroke-width="3"/>`;
        return `<path d="M${CX - 44} ${Y.foot} L${CX + 40} ${y + 20} M${CX + 44} ${Y.foot} L${CX - 40} ${y + 20}" stroke="#2b2b30" stroke-width="4"/>
          <rect x="${CX - w / 2}" y="${y - 10}" width="${w}" height="${30}" rx="4" fill="${fill}" ${O(2.6)}/>${keys}
          ${[0, 1, 2, 3].map(i => `<circle cx="${CX - w / 2 + 12 + i * 12}" cy="${y - 4}" r="2.6" fill="${['#ff3b8b', '#29e0e0', '#ffcc1a', '#7cff6b'][i]}" ${O(1)}/>`).join('')}
          <rect x="${CX + 10}" y="${y - 8}" width="40" height="6" rx="2" fill="#0b0910"/><rect x="${CX + 12}" y="${y - 7}" width="22" height="4" fill="#29e0e0" opacity=".8"/>`;
      }
      case 'accordion': {
        const x0 = CX - 30, y0 = 152, w = 60, h = 52;
        let folds = ''; for (let i = 1; i < 8; i++) folds += `<path d="M${x0 + 12 + i * 4.6} ${y0 + 2} l2.3 ${h / 2 - 2} -2.3 ${h / 2 - 2}" stroke="${INK}" stroke-width="1.2" fill="none"/>`;
        let keys = ''; for (let i = 0; i < 7; i++) keys += `<rect x="${x0 + w - 12}" y="${y0 + 4 + i * 6.6}" width="11" height="6" fill="#fafafa" stroke="#222" stroke-width=".5"/>${i % 2 ? '' : `<rect x="${x0 + w - 12}" y="${y0 + 8 + i * 6.6}" width="6" height="3.4" fill="#111"/>`}`;
        return `<rect x="${x0 + 10}" y="${y0}" width="${w - 22}" height="${h}" fill="${shade(safe(ins.color || '#d6334a'), 0.35)}" ${O(2.4)}/>${folds}
          <rect x="${x0}" y="${y0 - 3}" width="13" height="${h + 6}" rx="3" fill="${fill}" ${O(2.4)}/>${[0, 1, 2, 3, 4].map(i => `<circle cx="${x0 + 6.5}" cy="${y0 + 6 + i * 10}" r="2.2" fill="#f2efe8"/>`).join('')}
          <rect x="${x0 + w - 13}" y="${y0 - 3}" width="15" height="${h + 6}" rx="3" fill="${fill}" ${O(2.4)}/>${keys}`;
      }
      case 'trombone': {
        const x = M[0] + 2, y = M[1] + 2, bx = x + 16;
        return `<g ${O(2.2)} fill="${brass}">
          <rect x="${x - 3}" y="${y}" width="6" height="${210 - y}" rx="2"/><rect x="${x + 6}" y="${y + 20}" width="6" height="${236 - y}" rx="2"/>
          <path d="M${x - 3} ${y + 210 - y + 26} q7.5 14 15 0 v-10 h-6 v8 q-1.5 4 -3 0 v-8 h-6 z"/>
          <rect x="${bx - 2}" y="${y - 30}" width="6" height="${70}" rx="2"/><path d="M${x} ${y + 40} h${bx - x + 2}" stroke-width="5" stroke="${INK}"/><path d="M${x} ${y + 40} h${bx - x + 2}" stroke-width="2.6" stroke="${shade(safe(ins.color || '#e3b23c'), 0.15)}"/>
          <path d="M${bx - 2} ${y - 28} L${bx - 14} ${y - 62} Q${bx + 1} ${y - 70} ${bx + 18} ${y - 62} L${bx + 4} ${y - 28} Z"/>
          <ellipse cx="${bx + 2}" cy="${y - 64}" rx="16" ry="5" fill="${shade(safe(ins.color || '#e3b23c'), -0.35)}"/>
          <circle cx="${x}" cy="${y - 2}" r="3.4"/></g>`;
      }
      case 'sax': {
        const x = M[0], y = M[1] + 3, keysS = [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${CX + 6 - i * 0.6}" cy="${y + 50 + i * 16}" r="3.2" fill="${shade(safe(ins.color || '#e3b23c'), 0.3)}" ${O(1.2)}/>`).join('');
        return `<g ${O(2.4)}><path d="M${x - 2} ${y} q14 2 16 26 l-2 4 q-4 -22 -14 -24z" fill="#16110d"/>
          <path d="M${x + 10} ${y + 24} L${CX + 2} ${y + 34} Q${CX - 2} ${y + 120} ${CX + 2} 222 Q${CX + 12} 244 ${CX + 30} 226 L${CX + 36} 196 Q${CX + 48} 188 ${CX + 50} 198 L${CX + 42} 230 Q${CX + 26} 262 ${CX - 6} 230 Q${CX - 14} ${y + 120} ${CX - 8} ${y + 36} L${x + 6} ${y + 22} Z" fill="${brass}"/>
          <ellipse cx="${CX + 43}" cy="${195}" rx="8" ry="4" fill="${shade(safe(ins.color || '#e3b23c'), -0.35)}" transform="rotate(14 ${CX + 43} 195)"/>${keysS}</g>`;
      }
      case 'trumpet': {
        const x = M[0], y = M[1];
        return `<g transform="translate(${x} ${y}) rotate(-12)" ${O(2.2)}>
          <rect x="0" y="-3" width="56" height="6" rx="2" fill="${brass}"/><rect x="14" y="5" width="34" height="9" rx="4" fill="none" stroke-width="5" stroke="${INK}"/><rect x="14" y="5" width="34" height="9" rx="4" fill="none" stroke-width="2.6" stroke="${shade(safe(ins.color || '#e3b23c'), 0.1)}"/>
          ${[20, 28, 36].map(vx => `<rect x="${vx}" y="-12" width="6" height="26" rx="2" fill="${brass}"/><rect x="${vx - 1}" y="-16" width="8" height="5" rx="2" fill="${shade(safe(ins.color || '#e3b23c'), 0.3)}"/>`).join('')}
          <path d="M54 -3 L76 -14 Q82 0 76 14 L54 3 Z" fill="${brass}"/><ellipse cx="77" cy="0" rx="4" ry="13" fill="${shade(safe(ins.color || '#e3b23c'), -0.35)}"/>
          <rect x="-6" y="-2.5" width="8" height="5" rx="1.5" fill="#c9ccd6"/></g>`;
      }
      case 'decks': {
        const y = 200;
        const deck = dx => `<ellipse cx="${CX + dx}" cy="${y + 8}" rx="24" ry="9" fill="#16141a" ${O(2)}/><ellipse cx="${CX + dx}" cy="${y + 8}" rx="8" ry="3" fill="${fill}"/><circle cx="${CX + dx}" cy="${y + 8}" r="1.4" fill="#ddd"/>`;
        return `<path d="M${CX - 62} ${y + 30} L${CX - 54} ${Y.foot} M${CX + 62} ${y + 30} L${CX + 54} ${Y.foot}" stroke="#2b2b30" stroke-width="4"/>
          <rect x="${CX - 70}" y="${y - 6}" width="140" height="36" rx="5" fill="#2a2731" ${O(2.8)}/>${deck(-38)}${deck(38)}
          <rect x="${CX - 9}" y="${y - 2}" width="18" height="26" rx="2" fill="#16141a" ${O(1.4)}/>${[0, 1, 2].map(i => `<circle cx="${CX - 4 + (i % 2) * 8}" cy="${y + 4 + i * 6}" r="1.6" fill="${['#29e0e0', '#ff3b8b', '#7cff6b'][i]}"/>`).join('')}
          <rect x="${CX - 68}" y="${y + 18}" width="136" height="10" fill="${fill}" opacity=".85"/>`;
      }
      case 'boombox': {
        const x = CX + c.b.sw + 40, y = 46;
        return { front: `<g transform="translate(${x} ${y}) rotate(-8) scale(1.2)" ${O(2.4)}>
          <path d="M-22 -20 v-10 h44 v10" fill="none" stroke-width="5" stroke="${INK}"/><path d="M-22 -20 v-10 h44 v10" fill="none" stroke-width="2.6" stroke="#9aa0aa"/>
          <rect x="-40" y="-20" width="80" height="40" rx="5" fill="${fill}"/>
          <circle cx="-23" cy="2" r="12" fill="#1b1b22"/><circle cx="-23" cy="2" r="5" fill="#55555f"/><circle cx="23" cy="2" r="12" fill="#1b1b22"/><circle cx="23" cy="2" r="5" fill="#55555f"/>
          <rect x="-8" y="-12" width="16" height="18" rx="2" fill="#d9dde4"/><path d="M-6 -16 h12" stroke-width="1.6" stroke="#29e0e0"/></g>` };
      }
      case 'marching': {
        const y = 200;
        let lugs = ''; for (let i = 0; i < 9; i++) lugs += `<path d="M${CX - 36 + i * 8.5} ${y + 5} l4.2 24 4.2 -24" stroke="#f2efe8" stroke-width="1.6" fill="none"/>`;
        const sticks = [c.pose.A[2], c.pose.B[2]].map((h, i) => `<line x1="${h[0]}" y1="${h[1]}" x2="${h[0] + (i ? -12 : 12)}" y2="${h[1] - 32}" stroke="#d9b77c" stroke-width="3.4" stroke-linecap="round"/>`).join('');
        return { back: `<path d="M${CX - 22} ${Y.shoulder} L${CX + 18} ${y} M${CX + 22} ${Y.shoulder} L${CX - 18} ${y}" stroke="#f2efe8" stroke-width="5"/>`,
          front: `<rect x="${CX - 40}" y="${y}" width="80" height="36" fill="${fill}" ${O(2.8)}/>${lugs}<ellipse cx="${CX}" cy="${y}" rx="40" ry="9" fill="#f3efe6" ${O(2.6)}/>
            <rect x="${CX - 41}" y="${y + 31}" width="82" height="6" fill="#f2efe8" ${O(1.8)}/>${sticks}` };
      }
      case 'harmonica': {
        const x = M[0] + 1, y = M[1];
        return `<rect x="${x - 12}" y="${y - 4}" width="24" height="8" rx="2" fill="#c9ccd6" ${O(1.8)}/><path d="M${x - 10} ${y} h20" stroke="#55555f" stroke-width="1.4" stroke-dasharray="1.4 1.2"/>`;
      }
    }
    return '';
  }

  function drawInstrument(c) {
    const ins = c.a.instrument; if (!ins || c.pose.type === 'none') return '';
    const fill = finishFill(c, ins.color || '#b3121f', ins.finish), o = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
    const extra = drawExtra(c, c.pose.key, ins, fill, o);
    if (extra) return extra;
    switch (c.pose.type) {
      case 'guitar': {
        const body = GUITAR_BODIES[ins.model] || GUITAR_BODIES.classic;
        let extra = ins.model === 'banjo' ? `<circle cx="0" cy="6" r="19" fill="#f1e8cf" ${o}/>${[...Array(12)].map((_, i) => `<circle cx="${(22 * Math.cos(i * Math.PI / 6)).toFixed(1)}" cy="${(6 + 22 * Math.sin(i * Math.PI / 6)).toFixed(1)}" r="1.3" fill="#c9ccd6"/>`).join('')}<rect x="-6" y="10" width="12" height="3" fill="#5a3b26"/>` :
          ins.model === 'acoustic' ? `<circle cx="0" cy="-2" r="7" fill="#1a0d06" ${o}/>` :
          ins.model === 'hollow' ? `<path d="M-10 -6 q-3 8 0 16 M10 -6 q3 8 0 16" stroke="#1a0d06" stroke-width="2.4" fill="none"/>` :
          `<rect x="-6" y="-14" width="12" height="5" rx="1" fill="#e6e6e6" ${o}/><rect x="-6" y="2" width="12" height="5" rx="1" fill="#e6e6e6" ${o}/><circle cx="12" cy="20" r="2" fill="#e6e6e6"/>`;
        return `<g transform="translate(${CX - 6} 190) rotate(58) scale(1.3)">${stringed(c, body, 62, 6, fill, extra)}</g>`;
      }
      case 'bass': {
        const body = BASS_BODIES[ins.model] || BASS_BODIES.classic;
        const extra = `<rect x="-7" y="-6" width="14" height="6" rx="2" fill="#1a1a1a"/>`;
        return `<g transform="translate(${CX - 4} 194) rotate(60) scale(1.25)">${stringed(c, body, 78, ins.model === 'fivestring' ? 5 : 4, fill, extra)}</g>`;
      }
      case 'keys': {
        let keys = ''; for (let i = 0; i < 12; i++) keys += `<rect x="${-30 + i * 5}" y="-4" width="4.4" height="12" fill="#fafafa" stroke="#222" stroke-width=".5"/>`;
        for (const i of [0, 1, 3, 4, 5, 7, 8, 10]) keys += `<rect x="${-27 + i * 5}" y="-4" width="2.8" height="7" fill="#111"/>`;
        const retro = ins.model === 'retro' ? `<circle cx="34" cy="-2" r="2.4" fill="#ffcc1a"/><circle cx="40" cy="-2" r="2.4" fill="#13a8c4"/>` : '';
        return `<g transform="translate(${CX + 2} 186) rotate(-24)"><path d="M-38 -12 H30 L60 -6 L62 4 L30 14 H-38 Z" fill="${fill}" ${o}/>${keys}${retro}
          <rect x="44" y="-4" width="20" height="6" rx="2" fill="#222"/></g>`;
      }
      case 'vocals': {
        if (ins.model === 'vintagestand') return `<line x1="${CX + 8}" y1="${Y.foot}" x2="${CX + 8}" y2="100" stroke="#2b2b30" stroke-width="3.5"/>
          <path d="M${CX - 6} ${Y.foot} l14 -8 14 8" stroke="#2b2b30" stroke-width="3" fill="none"/><rect x="${CX + 1}" y="78" width="14" height="24" rx="6" fill="${c.grad('#c9ced8')}" ${o}/>
          ${[84, 89, 94].map(y => `<line x1="${CX + 2}" y1="${y}" x2="${CX + 14}" y2="${y}" stroke="#555" stroke-width=".8"/>`).join('')}`;
        if (ins.model === 'stand') return `<line x1="${CX + 8}" y1="${Y.foot}" x2="${CX + 8}" y2="88" stroke="#2b2b30" stroke-width="3.5"/>
          <path d="M${CX - 6} ${Y.foot} l14 -8 14 8" stroke="#2b2b30" stroke-width="3" fill="none"/><rect x="${CX + 4}" y="74" width="8" height="18" rx="4" fill="${fill}" ${o}/>`;
        const h = c.pose.B[2];
        if (ins.model === 'vintage') return `<g transform="translate(${h[0]} ${h[1]}) rotate(-20)"><rect x="-3" y="-2" width="6" height="16" fill="#2b2b30"/><rect x="-8" y="-22" width="16" height="22" rx="7" fill="${c.grad('#c9ced8')}" ${o}/>
          ${[-16, -11, -6].map(y => `<line x1="-7" y1="${y}" x2="7" y2="${y}" stroke="#555" stroke-width=".8"/>`).join('')}</g>`;
        return `<g transform="translate(${h[0]} ${h[1]}) rotate(-30)"><rect x="-3.5" y="-4" width="7" height="22" rx="2" fill="${fill}" ${o}/><circle cx="0" cy="-8" r="7" fill="${c.grad('#9aa0aa')}" ${o}/>
          <path d="M-5 -10 h10 M-5 -6 h10" stroke="#555" stroke-width=".7"/></g>`;
      }
      case 'drums': {
        const glow = ins.model === 'glow', sc = glow ? safe(ins.color) : '#d9b77c';
        const sticks = [c.pose.A[2], c.pose.B[2]].map((h, i) => `<line x1="${h[0]}" y1="${h[1]}" x2="${h[0] + (i ? 18 : -18)}" y2="${h[1] - 36}" stroke="${sc}" stroke-width="3.4" stroke-linecap="round"
          ${glow ? `filter="drop-shadow(0 0 3px ${sc})"` : ''}/>`).join('');
        const pads = ins.model === 'electronic' && c.a.stageDrums !== false;
        const snare = c.a.stageDrums === false ? '' : pads ? `<g transform="translate(${CX} 222)"><line x1="0" y1="8" x2="0" y2="${Y.foot - 222}" stroke="#2b2b30" stroke-width="3"/>
          ${[[-36, 2], [0, -6], [36, 2]].map(([x, y]) => `<path d="M${x - 18} ${y} l8 -9 h20 l8 9 -8 9 h-20z" fill="#25222c" ${o}/><path d="M${x - 13} ${y} l5 -5 h16 l5 5 -5 5 h-16z" fill="none" stroke="${safe(ins.color)}" stroke-width="1.8"/>`).join('')}</g>` :
          `<g transform="translate(${CX} 222)"><rect x="-26" y="0" width="52" height="16" fill="${fill}" ${o}/><ellipse cx="0" cy="0" rx="26" ry="6" fill="#f3efe6" ${o}/>
          <ellipse cx="0" cy="16" rx="26" ry="6" fill="${fill}" stroke="${INK}" stroke-width="2"/><line x1="-6" y1="22" x2="-14" y2="${Y.foot - 222}" stroke="#2b2b30" stroke-width="2"/><line x1="6" y1="22" x2="14" y2="${Y.foot - 222}" stroke="#2b2b30" stroke-width="2"/></g>`;
        void pads;
        return { back: snare, front: sticks };
      }
      case 'violin': {
        const body = 'M-8 -18 C-2 -22 2 -22 8 -18 C10 -14 7 -10 6 -8 C12 -2 12 10 6 16 C2 19 -2 19 -6 16 C-12 10 -12 -2 -6 -8 C-7 -10 -10 -14 -8 -18 Z';
        const vio = `<g transform="translate(${CX + 28} 112) rotate(-70) scale(.95)"><rect x="-2.5" y="-50" width="5" height="34" fill="#1a0d06"/><path d="${body}" fill="${ins.model === 'electric' ? fill : finishFill(c, ins.color || '#8a3b12', ins.finish || 'sunburst')}" ${o}/>
          <path d="M-4 -2 q-2 4 0 8 M4 -2 q2 4 0 8" stroke="#1a0d06" stroke-width="1.2" fill="none"/></g>`;
        const a = c.pose.A[2];
        return vio + `<line x1="${a[0] - 4}" y1="${a[1] + 2}" x2="${CX + 64}" y2="${100}" stroke="#d9c79a" stroke-width="1.8"/><line x1="${a[0] - 4}" y1="${a[1] + 2}" x2="${CX + 64}" y2="${100}" stroke="#5a3b26" stroke-width=".7" transform="translate(0 2)"/>`;
      }
    }
    return '';
  }

  /* ---------------------------------------------------------------- assemble */
  /**
   * @param {object} a appearance
   * @param {object} opt { anim: 'idle'|'play'|'cheer'|'none', title }
   */
  function svg(a, opt = {}) {
    a = a || {};
    if (opt.expression && EXPRESSIONS[opt.expression]) a = { ...a, face: { ...(a.face || {}), ...EXPRESSIONS[opt.expression] } };
    const c = new Ctx(a);
    CUR = c;
    const h = clamp(+a.height || 1, 0.88, 1.12);
    const inst = drawInstrument(c);
    const instBack = typeof inst === 'object' ? inst.back || '' : '';
    const instFront = typeof inst === 'object' ? inst.front || '' : inst;
    const instPre = typeof inst === 'object' ? inst.preHead || '' : '';
    const front = FRONT_ARM.has(c.pose.key);
    const bt = a.outfit?.bottom, shoesFirst = ['gown', 'longskirt', 'flares'].includes(bt?.id) || (fitOf(bt) === 'baggy' && !['harem', 'shorts', 'skirt', 'kilt', 'tutu'].includes(bt?.id));
    const armA = drawArm(c, 'A'), armB = drawArm(c, 'B');
    const shoulderA = c.pose.A[0], shoulderB = c.pose.B[0];

    const body = `
      <ellipse cx="${CX}" cy="${Y.foot + 2}" rx="${46 + c.b.hw * 0.4 + (c.stance === 'power' ? 22 : c.stance === 'wide' ? 12 : 0)}" ry="9" fill="#000" opacity=".28"/>
      <g class="av-bob">
        ${hairBack(c)}
        ${drawLegs(c)}
        ${drawNeck(c)}
        ${drawTorso(c)}
        ${tattoosOn(c, ['chest'])}
        ${shoesFirst ? drawShoes(c) + drawBottoms(c) : drawBottoms(c) + drawShoes(c)}
        ${drawTop(c)}
        ${drawBib(c)}
        ${drawOuter(c)}
        ${drawNeckwear(c)}
        ${instPre}
        <g class="av-head" style="transform-origin:${CX}px ${Y.neckTop}px"><g transform="translate(${CX} ${Y.neckTop + 6}) scale(${c.b.head.toFixed(3)}) translate(${-CX} ${-Y.neckTop - 6})">
          ${headBack(c)}
          ${drawHead(c)}
          ${hairFront(c)}
          ${drawGlasses(c)}
          ${drawHat(c)}
        </g></g>
        ${instBack}
        <g class="av-armB" style="transform-origin:${shoulderB[0]}px ${shoulderB[1]}px">${front ? '' : armB}</g>
        <g class="av-inst">${instFront}</g>
        <g class="av-armB2">${front ? armB : ''}</g>
        <g class="av-armA" style="transform-origin:${shoulderA[0]}px ${shoulderA[1]}px">${armA}</g>
      </g>`;

    const anim = opt.anim || 'idle';
    // face close-up: frame the head (it scales with the head slider and the body height)
    const headY = Y.foot + (Y.neckTop + 6 - (90 - 60) * c.b.head - Y.foot) * h;
    const vb = opt.view === 'face' ? `${CX - 75} ${(headY - 72).toFixed(1)} 150 150` : '-30 -70 300 410';
    return `<svg class="avatar anim-${anim} inst-${c.pose.type}${opt.view === 'face' ? ' view-face' : ''}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label="${esc(opt.title || 'Rockstar')}">
      <defs>${c.defs.join('')}</defs>
      <g transform="translate(${CX} ${Y.foot}) scale(${h}) translate(${-CX} ${-Y.foot})">${body}</g></svg>`;
  }

  /* ---------------------------------------------------------------- random looks */
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  function random(cat, { instrument, freeOnly = true } = {}) {
    const P = cat.palettes, free = list => list.filter(i => !freeOnly || (!(i.price > 0) && !(i.fame > 0)));
    const item = (list, palette = P.fabric) => ({ id: pick(free(list)).id, color: pick(palette), color2: pick(palette),
      pattern: Math.random() < 0.25 ? pick(cat.patterns).id : 'solid', fit: pick(['regular', 'regular', 'baggy', 'skinny']) });
    const top = item(cat.outfit.top);
    if (Math.random() < 0.4) top.print = pick(['ROCK', 'RIOT', 'NOISE', 'LOUD', 'STATIC', 'FUZZ', 'AMPED', 'VOLTS']);
    const types = Object.keys(cat.instruments).filter(k => k !== 'finishes');
    const type = instrument || pick(types);
    const tattoos = [];
    for (let i = 0; i < Math.floor(Math.random() * 4); i++) tattoos.push({ slot: pick(cat.tattoos.slots).id, design: pick(free(cat.tattoos.designs)).id, color: pick(P.ink.slice(0, 3)) });
    return {
      build: pick(cat.builds).id, height: +(0.94 + Math.random() * 0.12).toFixed(2), skin: pick(P.skin.slice(0, 10)),
      body: Object.fromEntries(BODY_KEYS.map(k => [k, Math.round((Math.random() - 0.5) * 40)])),
      stance: pick(['wide', 'wide', 'power', 'relaxed']),
      face: { shape: pick(cat.face.shape).id, eyes: pick(cat.face.eyes).id, eyeColor: pick(P.eyes), brows: pick(cat.face.brows.slice(0, 5)).id,
        nose: pick(cat.face.nose).id, mouth: pick(cat.face.mouth).id, marks: Math.random() < 0.6 ? 'none' : pick(cat.face.marks).id,
        ...Object.fromEntries(FACE_KEYS.map(k => [k, Math.round((Math.random() - 0.5) * 50)])) },
      hair: { style: pick(free(cat.hair)).id, color: pick(P.hair), color2: Math.random() < 0.3 ? pick(P.hair) : '',
        facial: Math.random() < 0.65 ? 'none' : pick(cat.facialHair).id, facialColor: '' },
      makeup: { liner: Math.random() < 0.35, shadow: Math.random() < 0.2 ? pick(P.fabric) : '', lips: Math.random() < 0.25 ? pick(P.lips) : '',
        paint: Math.random() < 0.15 ? pick(free(cat.makeup.paint)).id : 'none', paintColor: '#121216' },
      outfit: {
        top, bottom: item(cat.outfit.bottom), legwear: { id: Math.random() < 0.7 ? 'none' : pick(free(cat.outfit.legwear)).id, color: '#121216' },
        shoes: { id: pick(free(cat.outfit.shoes)).id, color: pick(P.fabric) },
        outer: Math.random() < 0.5 ? { id: 'none' } : item(cat.outfit.outer),
        hat: Math.random() < 0.75 ? { id: 'none' } : { id: pick(free(cat.outfit.hat)).id, color: pick(P.fabric) },
        glasses: Math.random() < 0.75 ? { id: 'none' } : { id: pick(free(cat.outfit.glasses)).id, color: '#121216' },
        neck: Math.random() < 0.6 ? { id: 'none' } : { id: pick(free(cat.outfit.neck)).id, color: '#c0c5cc' },
        wrist: Math.random() < 0.55 ? { id: 'none' } : { id: pick(free(cat.outfit.wrist)).id, color: pick(P.fabric) },
        belt: Math.random() < 0.5 ? { id: 'none' } : { id: pick(free(cat.outfit.belt || [{ id: 'none' }])).id, color: '#141014' },
      },
      piercings: cat.piercings.filter(() => Math.random() < 0.18).map(p => p.id),
      tattoos,
      instrument: { type, model: pick(free(cat.instruments[type].models)).id, color: pick(P.fabric), finish: pick(free(cat.instruments.finishes)).id },
    };
  }

  /** A full look from one of the catalog's archetypes (30 starter characters). jitter=true varies body, face and colours a little (for NPCs). */
  function fromArchetype(cat, id, { jitter = false } = {}) {
    const ar = (cat.archetypes || []).find(x => x.id === id) || cat.archetypes[0], L = ar.look;
    const none = { id: 'none' };
    const base = {
      build: 'average', height: 1, skin: '#eab48f', stance: 'wide',
      body: Object.fromEntries(BODY_KEYS.map(k => [k, 0])),
      face: { shape: 'oval', eyes: 'toon', eyeColor: '#3b2414', brows: 'soft', nose: 'button', mouth: 'smile', marks: 'none', ...Object.fromEntries(FACE_KEYS.map(k => [k, 0])) },
      hair: { style: 'messy', color: '#16120f', color2: '', facial: 'none', facialColor: '' },
      makeup: { liner: false, shadow: '', lips: '', paint: 'none', paintColor: '#121216' },
      outfit: { top: { id: 'tee', color: '#121216' }, outer: none, bottom: { id: 'skinny', color: '#1d2a4d' }, legwear: none, shoes: { id: 'sneakers', color: '#121216' },
        hat: none, glasses: none, neck: none, wrist: none, belt: none },
      piercings: [], tattoos: [],
    };
    const a = JSON.parse(JSON.stringify({ ...base, ...L, body: { ...base.body, ...(L.body || {}) }, face: { ...base.face, ...(L.face || {}) },
      hair: { ...base.hair, ...(L.hair || {}) }, makeup: { ...base.makeup, ...(L.makeup || {}) }, outfit: { ...base.outfit, ...(L.outfit || {}) } }));
    if (jitter) {
      BODY_KEYS.forEach(k => { a.body[k] = clamp(a.body[k] + Math.round((Math.random() - 0.5) * 30), -50, 50); });
      FACE_KEYS.forEach(k => { a.face[k] = clamp(a.face[k] + Math.round((Math.random() - 0.5) * 30), -50, 50); });
      if (Math.random() < 0.5) a.skin = pick(cat.palettes.skin.slice(0, 10));
      if (Math.random() < 0.3) a.hair.color = pick(cat.palettes.hair);
    }
    return a;
  }

  return { svg, random, fromArchetype, shade, catalog: null, BODY_KEYS, FACE_KEYS, EXPRESSIONS: Object.keys(EXPRESSIONS) };
})();
