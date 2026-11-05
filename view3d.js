// 3D-Anprobe: Körper aus Körpermaßen (elliptische Querschnitte), Kleidungsstück als Hülle darüber.
// Einfärbung nach Passform. Rein lokal (three.js liegt in vendor/), kein Server.
import * as THREE from './vendor/three.module.min.js';
import { bodyModel, flatValues, setKind } from './fit.js';

// ---------- Geometrie-Helfer ----------
const lerp = (a, b, t) => a + (b - a) * t;
const perim = (a, b) => { const h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))); };
const axes = (C, r) => { const a = C / perim(1, r); return [a, a * r]; }; // halbe Breite, halbe Tiefe aus Umfang

// Querschnitte weich interpolieren (Catmull-Rom), damit die Silhouette nicht kantig wirkt
function smoothSecs(secs, n = 4) {
  if (secs.length < 3) return secs;
  const keys = ['x', 'y', 'z', 'a', 'b'];
  const out = [];
  for (let i = 0; i < secs.length - 1; i++) {
    const p0 = secs[Math.max(0, i - 1)], p1 = secs[i], p2 = secs[i + 1], p3 = secs[Math.min(secs.length - 1, i + 2)];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      const o = {};
      for (const k of keys) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      o.a = Math.max(0.3, o.a); o.b = Math.max(0.3, o.b);
      if (p1.c && p2.c) o.c = p1.c.clone().lerp(p2.c, t);
      out.push(o);
    }
  }
  out.push(secs[secs.length - 1]);
  return out;
}

function loft(rawSecs, { seg = 48, smooth = 4, capStart = true, capEnd = true } = {}) {
  const secs = smoothSecs(rawSecs, smooth);
  const pos = [], col = [], idx = [];
  const hasCol = !!secs[0].c;
  secs.forEach((s) => {
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      pos.push(s.x + s.a * Math.cos(t), s.y, s.z + s.b * Math.sin(t));
      if (hasCol) col.push(s.c.r, s.c.g, s.c.b);
    }
  });
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (i, flip) => {
    const s = secs[i], ci = pos.length / 3;
    pos.push(s.x, s.y, s.z);
    if (hasCol) col.push(s.c.r, s.c.g, s.c.b);
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(secs.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (hasCol) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 32, 20);
  g.scale(rx, ry, rz);
  return g;
}

// ---------- Körper ----------
function bodyShape(raw) {
  const m = bodyModel(raw);
  const H = m.H, Y = (y) => H - y;
  const neckC = 0.215 * H;
  // Rumpf (2D-y von oben, Umfang, Tiefe/Breite-Verhältnis, z-Versatz)
  const T = [
    [m.y.crotch - 1, m.hip * 0.9, 0.8, -1],
    [m.y.hip, m.hip, 0.82, -1.5],
    [(m.y.hip + m.y.waist) / 2, (m.hip + m.waist) / 2, 0.78, -0.8],
    [m.y.waist, m.waist, 0.74, 0],
    [m.y.chest, m.chest, 0.66, 0.8],
    [m.y.armpit, m.chest * 0.97, 0.62, 0.5],
  ];
  const torsoAt = (y) => {
    if (y >= T[0][0]) return { C: m.hip, r: 0.82, z: -1 };
    for (let i = 0; i < T.length - 1; i++) {
      const [y0, C0, r0, z0] = T[i], [y1, C1, r1, z1] = T[i + 1];
      if (y <= y0 && y >= y1) { const k = (y0 - y) / (y0 - y1); return { C: lerp(C0, C1, k), r: lerp(r0, r1, k), z: lerp(z0, z1, k) }; }
    }
    const l = T[T.length - 1]; return { C: l[1], r: l[2], z: l[3] };
  };
  const sa = m.shoulder / 2 - 0.5;
  const nr = neckC / (2 * Math.PI);
  const torso = T.map(([y, C, r, z]) => { const [a, b] = axes(C, r); return { x: 0, y: Y(y), z, a, b }; });
  torso.push(
    { x: 0, y: Y(m.y.shoulder + 2.5), z: 0, a: sa, b: 7.5 },
    { x: 0, y: Y(m.y.shoulder), z: 0, a: sa * 0.8, b: 6.5 },
    { x: 0, y: Y(m.y.hps + 0.5), z: -0.5, a: sa * 0.45, b: 5.5 },
    { x: 0, y: Y(m.y.hps - 1.5), z: 0, a: nr, b: nr },
    { x: 0, y: Y(m.y.chin + 1), z: 0.5, a: nr * 0.95, b: nr * 0.95 },
  );
  // Beine
  const th = m.thigh, ank = m.ankle;
  const legDef = [
    [m.y.crotch - 5, th * 1.02, 0.92, 0.95, 0],
    [m.y.crotch + 3, th, 0.95, 1, 0],
    [(m.y.crotch + m.y.knee) / 2, th * 0.82, 0.95, 0.98, 0],
    [m.y.knee, th * 0.66, 0.92, 0.95, 0.3],
    [m.y.knee + (m.y.ankle - m.y.knee) * 0.3, th * 0.64, 0.95, 0.93, -1],
    [m.y.ankle, ank, 0.8, 0.9, 0],
    [H - 2, ank * 1.05, 0.8, 0.9, 0],
  ];
  const legAt = (y) => {
    const L = legDef;
    if (y <= L[0][0]) return { C: L[0][1], r: L[0][2], xf: L[0][3], z: L[0][4] };
    for (let i = 0; i < L.length - 1; i++) {
      const p = L[i], q = L[i + 1];
      if (y >= p[0] && y <= q[0]) { const k = (y - p[0]) / (q[0] - p[0]); return { C: lerp(p[1], q[1], k), r: lerp(p[2], q[2], k), xf: lerp(p[3], q[3], k), z: lerp(p[4], q[4], k) }; }
    }
    const l = L[L.length - 1]; return { C: l[1], r: l[2], xf: l[3], z: l[4] };
  };
  const legs = [1, -1].map((s) => legDef.map(([y, C, r, xf, z]) => { const [a, b] = axes(C, r); return { x: s * m.legCx * xf, y: Y(y), z, a, b }; }));
  // Arme (leicht abgespreizt)
  const ang = 0.12;
  const upper = m.chest * 0.31, fore = m.chest * 0.27, wrist = 0.098 * H;
  const arms = [1, -1].map((s) => {
    const J = new THREE.Vector3(s * (sa - 3.5), Y(m.y.shoulder + 3), 0);
    const dir = new THREE.Vector3(s * Math.sin(ang), -Math.cos(ang), 0);
    const at = (t) => J.clone().addScaledVector(dir, t);
    const def = [[0, upper * 1.15], [0.2, upper], [0.5, upper * 0.82], [0.65, fore], [1, wrist]];
    return { J, dir, at, secs: def.map(([f, C]) => { const p = at(f * m.arm); const r = C / (2 * Math.PI); return { x: p.x, y: p.y, z: p.z, a: r, b: r * 0.95 }; }) };
  });
  const armC = (t) => { const f = t / m.arm; return f < 0.2 ? upper * 1.1 : f < 0.5 ? lerp(upper, upper * 0.82, (f - 0.2) / 0.3) : f < 0.65 ? fore : lerp(fore, wrist, (f - 0.65) / 0.35); };
  return { m, H, Y, torso, torsoAt, legs, legAt, arms, armC, sa, nr, neckC, foot: raw.foot || 0.15 * H };
}

function bodyMeshes(B, mat) {
  const grp = new THREE.Group();
  const add = (g) => grp.add(new THREE.Mesh(g, mat));
  add(loft(B.torso));
  B.legs.forEach((l) => add(loft(l)));
  B.arms.forEach((a) => {
    add(loft(a.secs));
    const h = new THREE.Mesh(ellipsoid(2.3, 8.5, 4.3), mat);
    h.position.copy(a.at(B.m.arm + 7.5));
    h.rotation.z = a.dir.x > 0 ? 0.12 : -0.12;
    grp.add(h);
  });
  const head = new THREE.Mesh(ellipsoid(0.046 * B.H, B.m.y.chin / 2, 0.056 * B.H), mat);
  head.position.set(0, B.H - B.m.y.chin / 2, 0.5);
  grp.add(head);
  B.legs.forEach((l) => {
    const f = new THREE.Mesh(ellipsoid(4.6, 3.4, B.foot / 2), mat);
    f.position.set(l[l.length - 1].x, 3.2, B.foot * 0.28);
    grp.add(f);
  });
  return grp;
}

// ---------- Passform-Farben ----------
export const HEAT = {
  tight2: '#d64541', tight1: '#e89a3d', ok: '#4caf6a', loose1: '#7fb3e0', loose2: '#3d6fb6', none: '#b9b3a8',
};
function heatColor(result, key) {
  const c = result?.checks?.find((x) => x.k === key);
  if (!c || c.status == null) return null;
  if (c.status === 0) return HEAT.ok;
  const dir = c.zone != null && c.zone !== 0 ? Math.sign(c.zone) : c.refDiff != null ? Math.sign(c.refDiff) : 0;
  if (c.status === 1) return dir < 0 ? HEAT.tight1 : HEAT.loose1;
  return dir < 0 ? HEAT.tight2 : HEAT.loose2;
}

// ---------- Kleidungsstück ----------
function garmentParts(B, cat, measures, result) {
  const kind = setKind(cat);
  const g = flatValues(measures);
  const { m, H, Y, torsoAt } = B;
  const col = (key) => new THREE.Color(heatColor(result, key) || HEAT.none);
  const torsoRing = (y, C, key) => {
    const t = torsoAt(y);
    const [a, b] = axes(Math.max(C, t.C * 1.015 + 1), t.r);
    return { x: 0, y: Y(y), z: t.z, a, b, c: col(key) };
  };
  const parts = [];

  const upper = (withSkirt) => {
    const gs = g.shoulder ?? m.shoulder + 1;
    const drop = Math.max(0, (gs - m.shoulder) / 2);
    const chestG = g.chest != null ? g.chest * 2 : m.chest + 10;
    let hemY, rings = [];
    if (!withSkirt) {
      hemY = m.y.hps + (g.length ?? (m.y.hip + 0.03 * H - m.y.hps));
      const bodyHem = torsoAt(Math.min(hemY, m.y.crotch)).C;
      const hemG = g.hem != null ? g.hem * 2 : Math.max(chestG, bodyHem + 6);
      rings.push(torsoRing(hemY, hemG, g.hem != null ? 'hem' : 'length'));
      for (const yy of [m.y.hip, (m.y.hip + m.y.waist) / 2, m.y.waist]) {
        if (hemY > yy + 2) rings.push(torsoRing(yy, lerp(chestG, hemG, (yy - m.y.chest) / (hemY - m.y.chest)), '_'));
      }
    } else {
      const waistG = g.waist != null ? g.waist * 2 : m.waist + 8;
      const hipG = g.hip != null ? g.hip * 2 : Math.max(m.hip + 8, waistG);
      hemY = m.y.hps + (g.length ?? (m.y.knee - m.y.hps));
      const hemG = Math.max(hipG * 1.2, hipG + (hemY - m.y.hip) * 0.8);
      const hemT = torsoAt(m.y.crotch);
      const [ha, hb] = axes(hemG, hemT.r * 0.9);
      rings.push({ x: 0, y: Y(hemY), z: -0.5, a: ha, b: hb, c: col('length') });
      if (hemY > m.y.hip + 3) rings.push(torsoRing(m.y.hip, hipG, 'hip'));
      rings.push(torsoRing(m.y.waist, waistG, 'waist'));
    }
    rings.push(torsoRing(m.y.chest, chestG, 'chest'));
    rings.push(torsoRing(m.y.armpit + drop * 0.5, chestG * 0.98, 'chest'));
    const sc = new THREE.Color(heatColor(result, 'shoulder') || HEAT.none);
    rings.push({ x: 0, y: Y(m.y.shoulder + 2.5), z: 0, a: Math.max(gs / 2 + 0.5, B.sa + 1.2), b: 8.6, c: sc });
    rings.push({ x: 0, y: Y(m.y.shoulder - 0.6), z: 0, a: Math.max(gs / 2 * 0.82, B.sa * 0.8 + 1), b: 7.4, c: sc });
    rings.push({ x: 0, y: Y(m.y.hps - 1.2), z: -0.3, a: B.nr + 1.9, b: B.nr + 1.6, c: new THREE.Color(HEAT.none) });
    parts.push({ geo: loft(rings, { capStart: false, capEnd: false }), open: true });

    // Ärmel
    const sleeve = g.sleeve ?? (withSkirt ? 0 : cat === 'Oberteile' || cat === 'Sport' ? 0.11 * H : m.arm - 1);
    if (sleeve > 0) {
      for (const a of B.arms) {
        const t0 = drop, t1 = drop + sleeve;
        const long = t1 > m.arm * 0.6;
        const C0 = Math.max(B.armC(0) * 1.45, chestG * 0.4), C1 = long ? Math.max(B.armC(t1) + 9, 24) : Math.max(B.armC(t1) * 1.3, C0 * 0.85);
        const ring = (t, C, key) => { const p = a.at(Math.min(t, m.arm + 14)); const r = Math.max(C, B.armC(Math.min(t, m.arm)) + 2) / (2 * Math.PI); return { x: p.x, y: p.y, z: p.z, a: r, b: r * 0.95, c: col(key) }; };
        const rs = [ring(t0 - 3, C0, '_'), ring(t0 + 4, C0 * 0.97, '_'), ring(lerp(t0, t1, 0.6), lerp(C0, C1, 0.6), '_'), ring(t1, C1, 'sleeve')];
        parts.push({ geo: loft(rs, { capStart: false, capEnd: false, smooth: 3 }), open: true });
      }
    }
  };

  if (kind === 'top') upper(false);
  else if (kind === 'dress' && (g.shoulder != null || g.chest != null)) upper(true);
  else if (kind === 'dress') {
    const waistG = g.waist != null ? g.waist * 2 : m.waist + 4;
    const hipG = g.hip != null ? g.hip * 2 : Math.max(m.hip + 8, waistG);
    const hemY = m.y.waist + (g.length ?? 0.3 * H);
    const hemG = Math.max(hipG * 1.15, hipG + (hemY - m.y.hip) * 0.8);
    const [ha, hb] = axes(hemG, 0.75);
    const rings = [{ x: 0, y: Y(hemY), z: -0.5, a: ha, b: hb, c: col('length') }];
    if (hemY > m.y.hip + 3) rings.push(torsoRing(m.y.hip, hipG, 'hip'));
    rings.push(torsoRing(m.y.waist, waistG, 'waist'));
    parts.push({ geo: loft(rings, { capStart: false, capEnd: false }), open: true });
  } else if (kind === 'bottom') {
    const rise = g.rise != null ? g.rise * 0.86 : (m.y.crotch - m.y.waist) * 0.92;
    const wbY = m.y.crotch - rise;
    const waistG = g.waist != null ? g.waist * 2 : torsoAt(wbY).C + 2;
    const hipG = g.hip != null ? g.hip * 2 : Math.max(m.hip + 6, waistG);
    const thighG = g.thigh != null ? g.thigh * 2 : m.thigh * 1.25;
    // Sitzteil: unten so breit wie beide Hosenbeine zusammen, damit der Übergang ohne Stufe ist
    const L0 = B.legAt(m.y.crotch + 2);
    const [ta, tb] = axes(Math.max(thighG, L0.C * 1.02 + 1), Math.max(0.9, L0.r));
    const seat = { x: 0, y: Y(m.y.crotch + 2), z: L0.z, a: m.legCx * L0.xf + ta, b: tb, c: col(g.thigh != null ? 'thigh' : '_') };
    const rings = [seat];
    if (m.y.hip > wbY + 2) {
      const hr = torsoRing(m.y.hip, hipG, 'hip');
      hr.a = Math.max(hr.a, seat.a * 0.99); // Hüfte nie schmaler als die Hosenbeine darunter
      rings.push(hr);
    }
    rings.push(torsoRing(wbY, waistG, 'waist'));
    parts.push({ geo: loft(rings, { capStart: false, capEnd: false }), open: true });

    const openG = g.legOpening != null ? g.legOpening * 2 : thighG * 0.7;
    let inseam = g.inseam ?? (H - m.y.crotch - 2);
    if (measures?.hemmable && inseam > m.inseam + 2) inseam = m.inseam + 2;
    const hemY = Math.min(H - 0.5, m.y.crotch + inseam);
    for (const s of [1, -1]) {
      const legRing = (y, C, key) => {
        const L = B.legAt(y);
        const [a, b] = axes(Math.max(C, L.C * 1.02 + 1), Math.max(0.9, L.r));
        return { x: s * m.legCx * L.xf, y: Y(y), z: L.z, a, b, c: col(key) };
      };
      const lr = [legRing(m.y.crotch + 1, thighG, g.thigh != null ? 'thigh' : '_'), legRing(m.y.crotch + 3, thighG, g.thigh != null ? 'thigh' : '_')];
      if (hemY > m.y.knee + 3) lr.push(legRing(m.y.knee, Math.max(lerp(thighG, openG, 0.55), m.thigh * 0.66 + 5), '_'));
      lr.push(legRing(hemY, lerp(thighG, openG, Math.min(1, (hemY - m.y.crotch) / (H - m.y.crotch))), g.inseam != null ? 'inseam' : g.legOpening != null ? 'legOpening' : '_'));
      parts.push({ geo: loft(lr, { capStart: false, capEnd: false }), open: true });
    }
  }
  return parts;
}

// ---------- Szene ----------
export function mount(host, { body = {}, cat, measures, result, color }) {
  const B = bodyShape(body);
  const W = () => host.clientWidth || 300, Hh = () => host.clientHeight || 400;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), Hh());
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(80, 160, 140); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-120, 120, -120); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(28, W() / Hh(), 1, 3000);
  const target = new THREE.Vector3(0, B.H * 0.52, 0);
  let dist = B.H * 2.35, rotY = 0.35, rotX = 0.05, goalY = null;
  const placeCam = () => {
    camera.position.set(target.x + dist * Math.sin(rotY) * Math.cos(rotX), target.y + dist * Math.sin(rotX), target.z + dist * Math.cos(rotY) * Math.cos(rotX));
    camera.lookAt(target);
  };

  const fig = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe2d4c0, roughness: 0.75, metalness: 0 });
  fig.add(bodyMeshes(B, skin));
  const heatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const plainMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color || '#5b6b62'), roughness: 0.9, side: THREE.DoubleSide });
  const gMeshes = garmentParts(B, cat, measures, result).map((p) => new THREE.Mesh(p.geo, heatMat));
  gMeshes.forEach((x) => fig.add(x));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(B.H * 0.17, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.1;
  fig.add(shadow);
  scene.add(fig);

  let dirty = true, raf = 0, alive = true;
  const loop = () => {
    if (!alive) return;
    if (goalY != null) {
      let d = goalY - rotY; d = Math.atan2(Math.sin(d), Math.cos(d));
      rotY += d * 0.18; dirty = true;
      if (Math.abs(d) < 0.002) { rotY = goalY; goalY = null; }
    }
    if (dirty) { placeCam(); renderer.render(scene, camera); dirty = false; }
    raf = requestAnimationFrame(loop);
  };
  loop();

  // Bedienung: ziehen = drehen, Pinch/Mausrad = zoomen
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const pts = new Map(); let pinch0 = null;
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); goalY = null; });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const [px, py] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      rotY -= (e.clientX - px) * 0.012;
      rotX = Math.max(-0.4, Math.min(0.6, rotX + (e.clientY - py) * 0.006));
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch0) dist = Math.max(B.H * 0.8, Math.min(B.H * 4, dist * (pinch0 / d)));
      pinch0 = d;
    }
    dirty = true;
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(B.H * 0.8, Math.min(B.H * 4, dist * (1 + e.deltaY * 0.001))); dirty = true; }, { passive: false });

  const ro = new ResizeObserver(() => { renderer.setSize(W(), Hh()); camera.aspect = W() / Hh(); camera.updateProjectionMatrix(); dirty = true; });
  ro.observe(host);

  return {
    setView(angle) { goalY = angle; },
    setMode(mode) { gMeshes.forEach((x) => { x.material = mode === 'color' ? plainMat : heatMat; }); dirty = true; },
    zoom(f) { dist = Math.max(B.H * 0.8, Math.min(B.H * 4, dist * f)); dirty = true; },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      [skin, heatMat, plainMat].forEach((x) => x.dispose());
      renderer.dispose(); el.remove();
    },
  };
}
