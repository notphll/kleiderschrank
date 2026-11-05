// Passform-Berater: vergleicht Kleidungsmaße mit Körpermaßen und mit Teilen, die „perfekt“ sitzen.
// Läuft komplett lokal, regelbasiert – keine KI, kein Server.

export const MEASURES = {
  shoulder: { l: 'Schulterbreite', s: 'Schulter', h: 'Naht zu Naht' },
  chest: { l: 'Brust', s: 'Brust', h: 'Achsel zu Achsel', w: 1 },
  waist: { l: 'Bund / Taille', s: 'Bund', w: 1 },
  hip: { l: 'Hüfte', s: 'Hüfte', w: 1 },
  length: { l: 'Länge', s: 'Länge', h: 'höchster Punkt Schulter/Bund bis Saum' },
  sleeve: { l: 'Ärmellänge', s: 'Ärmel', h: 'Schulternaht bis Bündchen' },
  hem: { l: 'Saumweite', s: 'Saum', w: 1 },
  thigh: { l: 'Oberschenkel', s: 'Obersch.', h: '2–3 cm unter Schritt', w: 1 },
  rise: { l: 'Leibhöhe vorn', s: 'Leibhöhe', h: 'Schritt bis Bund' },
  inseam: { l: 'Innenbein', s: 'Innenbein', h: 'Schritt bis Saum' },
  legOpening: { l: 'Beinöffnung', s: 'Beinöffn.', w: 1 },
  insole: { l: 'Innensohle', s: 'Sohle' },
  width: { l: 'Breite', s: 'Breite' },
};
export const MEASURE_SETS = {
  top: ['shoulder', 'chest', 'length', 'sleeve', 'hem'],
  bottom: ['waist', 'hip', 'thigh', 'rise', 'inseam', 'legOpening', 'length'],
  dress: ['shoulder', 'chest', 'waist', 'hip', 'length', 'sleeve'],
  shoes: ['insole'],
  other: ['length', 'width'],
};
export const setKind = (cat) => ({
  Hosen: 'bottom', 'Röcke & Kleider': 'dress', Schuhe: 'shoes',
  Accessoires: 'other', 'Unterwäsche & Socken': 'other', Sonstiges: 'other',
}[cat] || 'top');
export const measureSet = (cat) => MEASURE_SETS[setKind(cat)];
// Unterart: trennt Oberteile nach Spielraum und Referenz (Jacke ≠ Hemd ≠ T-Shirt).
// setKind bleibt die Grundart für Puppe und 3D; außerhalb der Oberteile ist die Unterart = Grundart.
const SUB_KINDS = { Oberteile: 'shirt', Sport: 'shirt', 'Hemden & Blusen': 'hemd', 'Pullover & Strick': 'strick', 'Jacken & Mäntel': 'jacke' };
export const SUB_LABEL = { shirt: 'Shirt', hemd: 'Hemd', strick: 'Pullover', jacke: 'Jacke' };
export const subKind = (cat) => SUB_KINDS[cat] || (setKind(cat) === 'top' ? 'shirt' : setKind(cat));
export const FITS = ['zu eng', 'etwas eng', 'perfekt', 'etwas weit', 'zu weit'];

export const BODY_FIELDS = [
  ['height', 'Körpergröße', 'ohne Schuhe'],
  ['shoulder', 'Schulterbreite', 'hinten, Schulterspitze zu Schulterspitze'],
  ['chest', 'Brustumfang', 'breiteste Stelle, unter den Achseln'],
  ['waist', 'Bundumfang', 'da, wo deine Hosen sitzen'],
  ['hip', 'Hüftumfang', 'breiteste Stelle am Po'],
  ['thigh', 'Oberschenkelumfang', 'direkt unter dem Schritt'],
  ['arm', 'Armlänge', 'Schulterspitze bis Handgelenk'],
  ['inseam', 'Innenbeinlänge', 'Schritt bis Boden, barfuß'],
  ['foot', 'Fußlänge', 'Ferse bis längster Zeh'],
  ['weight', 'Gewicht', 'für den Vergleich mit Models', 'kg'],
];
const BODY_LABEL = Object.fromEntries(BODY_FIELDS.map(([k, l]) => [k, l]));
const FEM = new Set(['height', 'shoulder', 'arm', 'inseam', 'foot']);
const NOT_FIT = new Set(['height', 'weight']);
const dein = (bk, kasus = 'nom') => `${FEM.has(bk) ? (kasus === 'dat' ? 'deiner' : 'deine') : (kasus === 'dat' ? 'deinem' : 'dein')} ${BODY_LABEL[bk]}`;
const ord = (order) => (a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
export const PREFS = [['eng', 'Körpernah'], ['normal', 'Normal'], ['locker', 'Locker']];

export const fmtCm = (n) => `${String(Math.round(n * 10) / 10).replace('.', ',')} cm`;
const sgn = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmtCm(Math.abs(n))}`;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

// Alle Weiten auf „flach“ (halbe Weite) normalisieren
export function flatValues(m) {
  const out = {}; const v = m?.values || {};
  for (const k in v) if (MEASURES[k] && v[k] != null) out[k] = m.widthMode === 'circ' && MEASURES[k].w ? v[k] / 2 : v[k];
  return out;
}

// ---------- Regeln ----------
const PREF_SHIFT = { eng: -3, normal: 0, locker: 6 };
const CIRC = new Set(['chest', 'waist', 'hip', 'thigh']);
// Spielraum (Kleidung − Körper) in cm: [zu wenig, knapp, … großzügig, zu viel]
// Schlüssel = Unterart (subKind)
const TOP_RANGES = { chest: [0, 4, 24, 34], shoulder: [-3, -1.5, 3, 7], sleeve: [-4, -1, 4, 7] };
const RANGES = {
  shirt: TOP_RANGES, hemd: TOP_RANGES, strick: TOP_RANGES,
  // Jacken werden über Hemd/Pullover getragen: Brust braucht deutlich mehr Spielraum,
  // Ärmel sollen etwas länger sein (decken das Hemdbündchen), Schulter darf etwas breiter sein.
  jacke: { chest: [6, 10, 32, 44], shoulder: [-2, -0.5, 4, 8], sleeve: [-2, 0, 6, 9] },
  bottom: { waist: [-3, -1, 4, 8], hip: [0, 2, 12, 18], thigh: [0, 2, 12, 18], inseam: [-8, -3, 2, 6] },
  dress: { chest: [0, 3, 18, 28], waist: [0, 2, 14, 24], hip: [0, 3, 20, 40], shoulder: [-3, -1.5, 3, 7], sleeve: [-4, -1, 4, 7] },
  shoes: { insole: [0, 0.4, 1.8, 2.6] },
};
const BODY_KEY = { chest: 'chest', waist: 'waist', hip: 'hip', thigh: 'thigh', shoulder: 'shoulder', sleeve: 'arm', inseam: 'inseam', insole: 'foot' };
// Toleranz ggü. Referenzteilen [ok bis, knapp bis]
const REF_TOL = { shoulder: [1.5, 3], chest: [2, 4], waist: [1, 2.5], hip: [1.5, 3], length: [2, 4.5], sleeve: [1.5, 3.5], hem: [2.5, 5], thigh: [1.5, 3], rise: [1, 2.5], inseam: [2, 4.5], legOpening: [1.5, 3], insole: [0.3, 0.7], width: [2, 4] };
// Referenz aus einer anderen Unterart (z. B. Hemd für eine Jacke): Toleranz ×1,5, weil die Teile anders sitzen sollen
const REF_FALLBACK_TOL = 1.5;
const ZW = {
  w: ['zu eng', 'knapp', 'ok', 'weit', 'zu weit'],
  shoulder: ['zu schmal', 'schmal', 'ok', 'breit', 'zu breit'],
  len: ['zu kurz', 'kurz', 'ok', 'lang', 'zu lang'],
  insole: ['zu klein', 'knapp', 'ok', 'groß', 'zu groß'],
};
const zwFor = (k) => (CIRC.has(k) || MEASURES[k]?.w ? ZW.w : k === 'shoulder' ? ZW.shoulder : k === 'insole' ? ZW.insole : ZW.len);
const zone = (v, [a, b, c, d]) => (v < a ? -2 : v < b ? -1 : v <= c ? 0 : v <= d ? 1 : 2);

// ---------- Schnitt (cut) und Stretch ----------
// Beide optional. Ohne Angabe gilt „regular“ bzw. kein Stretch, also dieselben Bereiche wie bisher.
export const CUTS = [['slim', 'Slim'], ['regular', 'Regular'], ['relaxed', 'Relaxed'], ['oversized', 'Oversized']];
export const STRETCHES = [['keine', 'Kein Stretch', 'Webstoff ohne Elasthan'], ['leicht', 'Leicht', 'ca. 1–3 % Elasthan, Strick'], ['stark', 'Stark', 'Jersey, Rippe, über 3 % Elasthan']];
const CUT_LABEL = Object.fromEntries(CUTS);
const CUT_ORDER = CUTS.map(([k]) => k);
// Gewollte Mehrweite ggü. „regular“ in cm Umfang. Grobe Richtwerte aus der Schnittkonstruktion:
// Brust-Mehrweite bei Hemden/Shirts etwa slim 6–10, regular 10–16, relaxed 16–22, oversized ab ~26 cm.
// Verschoben werden nur die OBEREN Grenzen (ab wann es weit/zu weit ist) – zu eng bleibt zu eng.
const CUT_EASE = { slim: -4, regular: 0, relaxed: 6, oversized: 14 };
// Bei überschnittenen (Drop-)Schultern liegt die Naht gewollt weit auf dem Oberarm – oft 4–6 cm je Seite
// hinter der Schulterspitze. Gemessen Naht zu Naht ist ein Oversized-Teil deshalb ~10 cm breiter als die
// Schulter, ein Relaxed-Teil ~3 cm. Auch hier nur die obere Grenze – eine zu schmale Schulter bleibt ein Problem.
const CUT_SHOULDER = { slim: -1, regular: 0, relaxed: 3, oversized: 10 };
// Dehnbarer Stoff darf enger sein als der Körper (negativer Spielraum). Verschiebt die UNTEREN Grenzen
// der Weiten in cm Umfang. Richtwert: Jersey/Rippe sitzt mit bis zu ca. −5 % Umfang noch bequem.
const STRETCH_EASE = { keine: 0, leicht: -3, stark: -6 };
const knownCut = (c) => (CUT_EASE[c] != null ? c : null);
// Bei Hosen wird der Bund nicht nach Schnitt verschoben: Auch eine weite Hose muss am Bund sitzen.
const cutApplies = (k, kind) => CIRC.has(k) && !(kind === 'bottom' && k === 'waist');

/** Spielraum-Bereich nach Vorliebe, Schnitt und Stretch verschieben. */
function adjustRange(rng, k, kind, { pref = 0, cut = null, stretch = null }) {
  const [a, b, c, d] = rng;
  if (CIRC.has(k)) {
    const lo = pref + (STRETCH_EASE[stretch] || 0);
    const hi = pref + (cutApplies(k, kind) ? CUT_EASE[cut] || 0 : 0);
    return [a + lo, b + lo, c + hi, d + hi];
  }
  if (k === 'shoulder') { const s = CUT_SHOULDER[cut] || 0; return [a, b, c + s, d + s]; }
  return rng;
}
// ---------- Aus dem Schrank lernen ----------
// ---------- Passform je Maß (fitDetail) ----------
// Je Maß eine 5er-Skala; Index − 2 = Bewertung (−2 zu eng/kurz … 0 perfekt … +2 zu weit/lang)
const SCALE_W = ['zu eng', 'etwas eng', 'perfekt', 'etwas weit', 'zu weit'];
const SCALE_SHOULDER = ['zu schmal', 'etwas schmal', 'perfekt', 'etwas breit', 'zu breit'];
const SCALE_LEN = ['zu kurz', 'etwas kurz', 'perfekt', 'etwas lang', 'zu lang'];
const SCALE_SHOE = ['zu klein', 'etwas klein', 'perfekt', 'etwas groß', 'zu groß'];
export const detailScale = (k) => (k === 'shoulder' ? SCALE_SHOULDER : k === 'insole' ? SCALE_SHOE : MEASURES[k]?.w ? SCALE_W : SCALE_LEN);
// Welche Maße die App nach dem Kauf abfragt („Wie sitzt es?“)
const DETAIL_KEYS = { top: ['shoulder', 'chest', 'length', 'sleeve'], bottom: ['waist', 'hip', 'thigh', 'rise', 'inseam'], dress: ['shoulder', 'chest', 'waist', 'hip', 'length'], shoes: ['insole'], other: [] };
export const detailKeys = (cat) => DETAIL_KEYS[setKind(cat)] || [];
const RATING = Object.fromEntries([SCALE_W, SCALE_SHOULDER, SCALE_LEN, SCALE_SHOE].flatMap((s) => s.map((l, i) => [l, i - 2])));
/** Bewertung eines Teils für ein Maß: fitDetail[k], sonst Gesamtbewertung. −2…2 oder undefined. */
export const ratingFor = (it, k) => RATING[it?.fitDetail?.[k] ?? it?.fit];
/** Nur gültige Einträge behalten (z. B. beim Speichern oder aus einem Backup); leer → undefined. */
export function cleanFitDetail(fd) {
  const out = {};
  for (const [k, v] of Object.entries(fd || {})) if (MEASURES[k] && detailScale(k).includes(v)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}
// Gewicht der gelernten Bereiche nach Anzahl bewerteter Teile: unter 2 nur feste Werte,
// dann linear steigend, ab 5 Teilen 90 % gelernt (10 % feste Werte als Sicherheitsnetz).
const LEARN_MIN = 2, LEARN_FULL = 5, LEARN_MAX_W = 0.9;
export const learnWeight = (n) => (n < LEARN_MIN ? 0 : Math.min(1, (n - 1) / (LEARN_FULL - 1)) * LEARN_MAX_W);
const SUB_PLURAL = { shirt: 'Shirts', hemd: 'Hemden', strick: 'Pullovern', jacke: 'Jacken', bottom: 'Hosen', dress: 'Kleidern', shoes: 'Schuhen' };

// Spielraum eines Teils zum Körper (Umfänge: flach × 2 − Körper). Ärmel inkl. überschnittener Schulter.
function easeFor(k, g, body) {
  const bk = BODY_KEY[k];
  let gv = g[k];
  if (k === 'sleeve' && g.shoulder && body.shoulder) gv += Math.max(0, (g.shoulder - body.shoulder) / 2);
  return CIRC.has(k) ? gv * 2 - body[bk] : gv - body[bk];
}
// Was Schnitt und Vorliebe zum Spielraum beitragen – wird beim Lernen abgezogen, damit Teile vergleichbar sind
function normShift(k, kind, cut, pref) {
  if (CIRC.has(k)) return pref + (cutApplies(k, kind) ? CUT_EASE[cut] || 0 : 0);
  if (k === 'shoulder') return CUT_SHOULDER[cut] || 0;
  return 0;
}
const isShortSleeve = (k, val, body) => k === 'sleeve' && body.arm && val < body.arm * 0.6;

/** Gelernter Bereich aus Punkten {e: Spielraum, r: Bewertung −2…2}. null ohne „perfekt“-Teil. */
function rangeFromPoints(fixed, pts) {
  const P = pts.filter((p) => p.r === 0).map((p) => p.e);
  if (!P.length) return null;
  const center = median(P), minP = Math.min(...P), maxP = Math.max(...P);
  // „perfekt“ legt die Mitte fest: fester Bereich wird dorthin verschoben und umfasst alle perfekten Teile
  let [a, b, c, d] = fixed.map((x) => x + center - (fixed[1] + fixed[2]) / 2);
  b = Math.min(b, minP); c = Math.max(c, maxP);
  // „etwas eng/weit“ liegen im knappen/weiten Rand: Grünbereich endet davor, Rot beginnt dahinter
  for (const { e, r } of pts) {
    if (r === -1 && e < center) { b = Math.min(Math.max(b, e + 0.5), minP); a = Math.min(a, e); }
    if (r === 1 && e > center) { c = Math.max(Math.min(c, e - 0.5), maxP); d = Math.max(d, e); }
  }
  // „zu eng/weit“ legt das Aus fest
  for (const { e, r } of pts) {
    if (r === -2 && e < center) a = Math.min(Math.max(a, e + 0.5), b);
    if (r === 2 && e > center) d = Math.max(Math.min(d, e - 0.5), c);
  }
  return [a, b, c, d];
}

/**
 * Persönliche Spielraum-Bereiche aus bewerteten Schrankteilen (fitDetail je Maß, sonst Gesamtbewertung fit).
 * @returns {{[sub]: {[k]: {n, w, fixed, learned, range}}}} – range = Mischung aus festen und gelernten Werten,
 *   ohne Vorliebe/Schnitt (die kommen wie bei den festen Werten über adjustRange dazu).
 */
export function learnRanges(items = [], body = {}) {
  const pref = PREF_SHIFT[body.pref] || 0;
  const pts = {};
  for (const it of items) {
    const sub = subKind(it.category), kind = setKind(it.category), fixed = RANGES[sub];
    if (!fixed) continue;
    const g = flatValues(it.measures), cut = knownCut(it.cut ?? it.measures?.cut);
    for (const k of Object.keys(fixed)) {
      const r = ratingFor(it, k); // fitDetail je Maß, sonst Gesamtbewertung
      if (r == null || g[k] == null || !body[BODY_KEY[k]] || isShortSleeve(k, g[k], body)) continue;
      if (lengthIsStyle(it, k)) continue; // „Längen sind Stil“: Länge/Ärmel dieses Teils sagen nichts über dich
      ((pts[sub] ??= {})[k] ??= []).push({ e: easeFor(k, g, body) - normShift(k, kind, cut, pref), r });
    }
  }
  const out = {};
  for (const sub in pts) for (const k in pts[sub]) {
    const p = pts[sub][k], fixed = RANGES[sub][k], learned = rangeFromPoints(fixed, p);
    const w = learned ? learnWeight(p.length) : 0;
    (out[sub] ??= {})[k] = { n: p.length, w, fixed, learned, range: w ? fixed.map((f, i) => f * (1 - w) + learned[i] * w) : fixed };
  }
  return out;
}

// ---------- Maße ohne Körper-Gegenstück: aus dem Schrank lernen, welche Werte du trägst ----------
// Beinöffnung, Leibhöhe, Hosenlänge, Saumweite: Dafür gibt es kein Körpermaß, aber deine Teile zeigen, was dir passt.
export const ABS_KEYS = { bottom: ['rise', 'legOpening', 'length'], top: ['hem'] };
const ABS_MIN = 2; // ab so vielen bewerteten Teilen (davon mind. eins „perfekt“) wird bewertet
// Grundbreite um die perfekten Teile herum [ok bis, knapp bis] in cm (flach bzw. Länge) – wie bei Referenzen
const ABS_TOL = { rise: [1, 2.5], legOpening: [1.5, 3], length: [2, 4.5], hem: [2.5, 5] };
// Weiter geschnittene Teile dürfen bei Weiten (Beinöffnung, Saum) weiter sein: obere Grenzen + Anteil der Mitte
const ABS_CUT_WIDEN = { relaxed: 0.1, oversized: 0.2 };
const ABS_OWN = { bottom: 'deine Hosen', shirt: 'deine Shirts', hemd: 'deine Hemden', strick: 'deine Pullover', jacke: 'deine Jacken' };

/**
 * Absolute Wohlfühl-Bereiche je Unterart und Maß aus bewerteten Teilen (fitDetail je Maß, sonst Gesamtbewertung).
 * @returns {{[sub]: {[k]: {n, center, range: [a, b, c, d]}}}} – nur Maße mit ≥ 2 Teilen und mind. einem „perfekt“
 */
export function learnAbsolute(items = []) {
  const pts = {};
  for (const it of items) {
    const kind = setKind(it.category), sub = subKind(it.category), keys = ABS_KEYS[kind];
    if (!keys) continue;
    const g = flatValues(it.measures);
    for (const k of keys) {
      const r = ratingFor(it, k);
      if (r == null || g[k] == null || lengthIsStyle(it, k)) continue;
      ((pts[sub] ??= {})[k] ??= []).push({ e: g[k], r });
    }
  }
  const out = {};
  for (const sub in pts) for (const k in pts[sub]) {
    const p = pts[sub][k], P = p.filter((x) => x.r === 0).map((x) => x.e);
    if (p.length < ABS_MIN || !P.length) continue;
    const center = median(P), [t1, t2] = ABS_TOL[k];
    const range = rangeFromPoints([center - t2, center - t1, center + t1, center + t2], p);
    (out[sub] ??= {})[k] = { n: p.length, center, range };
  }
  return out;
}

// Gewicht der Referenz ggü. den Körpermaßen beim gemeinsamen Status.
// weak: Länge/Ärmel einer Referenz, die nur insgesamt „perfekt“ ist (nicht ausdrücklich je Maß) –
// Längen sind oft Stil (absichtlich kurz/lang) und sollen andere Teile nicht dominieren.
const REF_WEIGHT = { one: 0.6, two: 0.65, many: 0.7, alt: 0.35, conflict: 0.3, weak: 0.2 };
const LENGTH_REF_KEYS = new Set(['length', 'sleeve']);
// Teil mit Häkchen „Längen sind Stil, nicht Maßstab“: Länge und Ärmel dienen nicht als Vergleich
export const lengthIsStyle = (it, k) => !!it?.lengthStyle && LENGTH_REF_KEYS.has(k);
// Eine Größe darf nie gewinnen, wenn ihre Schulter mehr als so viele cm schmaler ist als die Referenz
const SHOULDER_GUARD = 2;
// Wo Oberteile üblicherweise enden: cm unter dem Schritt (negativ = darüber), [zu kurz, kurz, … lang, zu lang].
// Nur für den Hinweis „üblich / eher kurz / eher lang“ – fließt nicht in Ampel oder Empfehlung ein.
const TOP_LENGTH_NAME = { hemd: 'ein Hemd', shirt: 'ein Shirt', strick: 'einen Pullover', jacke: 'eine Jacke' };
const TOP_LENGTH = {
  hemd: [0, 5, 12, 18], // Hemd: ~5–12 cm unter dem Schritt (lässt sich einstecken)
  shirt: [-5, 0, 8, 14], // T-Shirt/Sport: 0–8 cm
  strick: [-6, -2, 8, 14], // Pullover: etwa auf Schritthöhe
  jacke: [-10, -4, 45, 60], // Jacken & Mäntel: Typ unbekannt (kurze Jacke bis knielanger Mantel) – nur grobe Grenzen
};

// ---------- Stetiger Abstand zum Ideal (für die Größenempfehlung) ----------
// Wichtigkeit je Grundart: bei Oberteilen Schulter & Brust (Weiten) deutlich vor den Längen.
const IMPORTANCE = {
  top: { shoulder: 3, chest: 3, sleeve: 1, length: 0.8, hem: 0.8 },
  bottom: { waist: 3, thigh: 2.5, hip: 2, rise: 1.5, inseam: 1, legOpening: 0.6, length: 0.6 },
  dress: { chest: 2.5, waist: 2.5, hip: 2, shoulder: 2, length: 1, sleeve: 1 },
  shoes: { insole: 3 },
  other: { length: 1, width: 1 },
};
const IMPORTANT_MIN = 2; // ab diesem Gewicht gilt ein Maß als „wichtig“ (fehlt es → geringere Sicherheit)
const HEM_WEIGHT = 0.3; // Längen, die gekürzt werden, zählen kaum
const LENGTH_KEYS = new Set(['length', 'sleeve', 'inseam']);
const importance = (kind, k) => IMPORTANCE[kind]?.[k] ?? 1;
const importantKeys = (kind) => Object.keys(IMPORTANCE[kind] || {}).filter((k) => IMPORTANCE[kind][k] >= IMPORTANT_MIN);
// Messtoleranz: Angaben aus dem Shop ±1,5 cm, selbst gemessen ±1 cm
export const MEASURE_TOL = { web: 1.5, self: 1 };
// Baumwolle ohne Vorwäsche läuft beim ersten Waschen ein, v. a. in der Länge (~3 %)
export const SHRINK_LEN = 0.03;

/** Abstand eines Werts zum Ideal (Mitte von [b, c]): 0 ideal, 1 am Rand von Grün, 2 am Rand von Rot, stetig. */
export function zoneDist(v, [a, b, c, d]) {
  if (v >= b && v <= c) return Math.abs(v - (b + c) / 2) / Math.max((c - b) / 2, 0.5);
  if (v > c) return 1 + (v - c) / Math.max(d - c, 0.5);
  return 1 + (b - v) / Math.max(b - a, 0.5);
}

// Gewichteter Abstand, Abdeckung wichtiger Maße und Unsicherheiten eines Ergebnisses
function fitSummary(kind, checks, bodyChart = false) {
  const graded = checks.filter((c) => c.dist != null);
  const sw = graded.reduce((s, c) => s + c.weight, 0);
  // Körpertabellen der Shops nennen fast nie die Schulterbreite – dort zählt sie nicht als fehlend
  const imp = importantKeys(kind).filter((k) => !(bodyChart && k === 'shoulder'));
  return {
    fitScore: sw ? graded.reduce((s, c) => s + c.weight * c.dist, 0) / sw : null,
    missingImportant: imp.filter((k) => !graded.some((c) => c.k === k)),
    coverage: imp.length ? imp.filter((k) => graded.some((c) => c.k === k)).length / imp.length : 1,
  };
}

// Erwarteter Unterschied (flach, in cm) zwischen zwei Schnitten – zum Herausrechnen bei Referenzen
function cutOffset(k, kind, cut, refCut) {
  if (!knownCut(cut) || !knownCut(refCut)) return 0;
  if (cutApplies(k, kind)) return (CUT_EASE[cut] - CUT_EASE[refCut]) / 2;
  if (k === 'shoulder') return CUT_SHOULDER[cut] - CUT_SHOULDER[refCut];
  return 0;
}
const WEIGHT = { chest: 1.5, shoulder: 1.5, waist: 1.5, hip: 1.2, insole: 2 };

const intendedText = (k) => (k === 'shoulder' ? 'breit wie gewollt' : 'weit wie gewollt');
function bodyText(k, ease, z) {
  const bk = BODY_KEY[k];
  let d;
  if (CIRC.has(k)) d = ease < 0 ? `${fmtCm(-ease)} kleiner als ${dein(bk)}` : `${fmtCm(ease)} Spielraum zu ${dein(bk, 'dat')}`;
  else if (k === 'sleeve') d = ease >= 0 ? `endet ${fmtCm(ease)} hinter dem Handgelenk` : `endet ${fmtCm(-ease)} vor dem Handgelenk`;
  else if (k === 'insole') d = `${fmtCm(ease)} Platz vor den Zehen`;
  else d = `${sgn(ease)} ggü. ${dein(bk, 'dat')}`;
  return z === 0 ? d : `${zwFor(k)[z + 2]}: ${d}`;
}

export function bodyModel(b = {}) {
  const H = b.height || 178;
  const r = (k, f) => b[k] || f * H;
  const m = {
    H, shoulder: r('shoulder', 0.255), chest: r('chest', 0.54), waist: r('waist', 0.46), hip: r('hip', 0.54),
    thigh: r('thigh', 0.31), arm: r('arm', 0.335), inseam: r('inseam', 0.45), ankle: 0.13 * H,
  };
  const y = { chin: 0.125 * H, hps: 0.155 * H, shoulder: 0.175 * H, armpit: 0.235 * H, chest: 0.27 * H, waist: 0.39 * H, hip: 0.5 * H, crotch: H - m.inseam };
  y.hip = Math.min(y.hip, y.crotch - 4);
  y.knee = (y.crotch + H) / 2 - 0.02 * H; y.ankle = H - 0.045 * H;
  m.y = y;
  m.w = { neck: 0.068 * H, shoulder: m.shoulder, chest: m.chest * 0.34, waist: m.waist * 0.34, hip: m.hip * 0.36, thigh: m.thigh * 0.31, knee: 0.06 * H, ankle: 0.04 * H };
  m.legCx = m.w.hip / 4 + 1;
  return m;
}

/**
 * Bewertet ein Kleidungsstück.
 * @returns {kind, checks[], score, level (-1 keine Daten, 0 passt … 3 passt nicht), verdict, basis}
 */
export function analyze(cat, measures, body = {}, items = [], excludeId = null) {
  const kind = setKind(cat), sub = subKind(cat);
  const g = flatValues(measures);
  const hasBody = BODY_FIELDS.some(([k]) => !NOT_FIT.has(k) && body[k]);
  const pref = PREF_SHIFT[body.pref] || 0;
  // Schnitt/Stretch des geprüften Teils (app.js reicht sie über measures durch)
  const cut = knownCut(measures?.cut), stretch = STRETCH_EASE[measures?.stretch] != null ? measures.stretch : null;
  const peers = items.filter((it) => it.id !== excludeId && setKind(it.category) === kind)
    .map((it) => ({ it, sub: subKind(it.category), cut: knownCut(it.cut ?? it.measures?.cut), v: flatValues(it.measures) }))
    .filter((x) => Object.keys(x.v).length);
  // Bewertung je Maß: fitDetail[k] (z. B. „Brust: perfekt, Länge: etwas lang“), sonst die Gesamtbewertung
  const perfect = peers.filter((x) => x.it.fit === 'perfekt' || Object.values(x.it.fitDetail || {}).includes('perfekt'));
  const perfectFor = (k) => peers.filter((x) => ratingFor(x.it, k) === 0);
  // Grenzen („nicht weiter als …“) nur aus derselben Unterart – ein enges Shirt sagt nichts über eine Jacke
  const tightFor = (k) => peers.filter((x) => x.sub === sub && ratingFor(x.it, k) < 0);
  // „zu weit“ gilt nicht als Grenze, wenn das neue Teil gewollt weiter geschnitten ist (z. B. oversized vs. regular)
  const wider = (x) => cut && x.cut && CUT_ORDER.indexOf(cut) > CUT_ORDER.indexOf(x.cut);
  const looseFor = (k) => peers.filter((x) => x.sub === sub && !wider(x) && ratingFor(x.it, k) > 0);
  const order = MEASURE_SETS[kind];
  const keys = Object.keys(g).sort(ord(order));
  const checks = [];
  const altSubs = new Set();
  const learnedAll = learnRanges(items.filter((it) => it.id !== excludeId), body)[sub] || {};
  const absAll = learnAbsolute(items.filter((it) => it.id !== excludeId))[sub] || {};
  const sources = [];
  // Messtoleranz (flach): Shop-Angabe oder selbst gemessen; bei Umfang-Eingabe halbiert sie sich flach
  const tolIn = MEASURE_TOL[measures?.source] ?? MEASURE_TOL.web;
  const shrink = !!measures?.shrink;
  let dev = 0;

  for (const k of keys) {
    const val = g[k], d = MEASURES[k], isW = !!d.w || k === 'shoulder';
    const c = { k, label: d.l, short: d.s, value: val, notes: [], status: null };

    // Ärmel nur mit gleichem Ärmeltyp vergleichen (Kurzarm vs. Langarm)
    const longSleeve = (v) => v >= (body.arm ? body.arm * 0.6 : 40);
    const usable = (x) => x.v[k] != null && !lengthIsStyle(x.it, k) && (k !== 'sleeve' || longSleeve(x.v[k]) === longSleeve(val));
    // Erst Referenzen derselben Unterart, sonst dieselbe Grundart mit größerer Toleranz
    const perfK = perfectFor(k);
    let refs = perfK.filter((x) => x.sub === sub && usable(x));
    const alt = !refs.length;
    if (alt) refs = perfK.filter((x) => x.sub !== sub && usable(x));
    // Schnitt: Referenzen mit gleichem Schnitt bevorzugen, sonst den Schnittunterschied herausrechnen
    const sameCut = cut ? refs.filter((x) => x.cut === cut) : [];
    if (sameCut.length) refs = sameCut;
    // Maß ohne Körper-Gegenstück mit gelerntem Bereich (≥ 2 Teile): ersetzt den Einzelvergleich mit den Referenzen
    const absL = ABS_KEYS[kind]?.includes(k) ? absAll[k] : null;
    if (absL) refs = [];
    // Längen: nur ausdrücklich je Maß „perfekt“ bewertete Referenzen zählen voll, sonst schwach
    let weak = false;
    if (LENGTH_REF_KEYS.has(k) && refs.length) {
      const explicit = refs.filter((x) => x.it.fitDetail?.[k] === 'perfekt');
      if (explicit.length) refs = explicit; else weak = true;
    }
    if (refs.length) {
      const offs = refs.map((x) => cutOffset(k, kind, cut, x.cut));
      const diff = val - median(refs.map((x, i) => x.v[k] + offs[i]));
      const [t1, t2] = (REF_TOL[k] || [2, 4]).map((t) => (alt ? t * REF_FALLBACK_TOL : t));
      c.refDiff = diff; dev += Math.abs(diff); c.refTol = [t1, t2];
      c.refStatus = Math.abs(diff) <= t1 ? 0 : Math.abs(diff) <= t2 ? 1 : 2;
      const w = isW ? ['enger', 'weiter'] : ['kürzer', 'länger'];
      const who = refs.length === 1 ? `„${refs[0].it.name}“` : `deine ${refs.length} perfekt sitzenden Teile`;
      const note = Math.abs(diff) < 0.5 ? `wie ${who}` : `${fmtCm(Math.abs(diff))} ${diff < 0 ? w[0] : w[1]} als ${who}`;
      const hints = [];
      if (alt) {
        const labels = [...new Set(refs.map((x) => SUB_LABEL[x.sub] || x.sub))];
        labels.forEach((l) => altSubs.add(l));
        c.refAlt = labels;
        hints.push(`Vergleich mit ${labels.join('/')} statt ${SUB_LABEL[sub]}`);
      }
      if (offs.some((o) => o !== 0)) {
        const from = [...new Set(refs.filter((x, i) => offs[i] !== 0).map((x) => CUT_LABEL[x.cut]))];
        c.cutAdjusted = true;
        hints.push(`Schnitt herausgerechnet: ${from.join('/')} → ${CUT_LABEL[cut]}`);
      }
      if (weak) hints.push('nur insgesamt „perfekt“ bewertet – zählt bei Längen schwach');
      c.notes.push(hints.length ? `${note} (${hints.join(', ')})` : note);
      c.nRefs = refs.length; c.alt = alt; if (weak) c.refWeak = true;
      // Einzelne Referenz, die nach den Standardregeln selbst rot zu deinen Körpermaßen wäre → Maße verdächtig
      const fixedRng = RANGES[sub]?.[k], r0 = refs[0];
      if (!weak && refs.length === 1 && fixedRng && body[BODY_KEY[k]] && !isShortSleeve(k, r0.v[k], body)) {
        const e = easeFor(k, r0.v, body) - normShift(k, setKind(r0.it.category), r0.cut, pref);
        if (Math.abs(zone(e, fixedRng)) === 2) {
          c.conflict = r0.it.name;
          c.notes.push(`Referenz und Körpermaße widersprechen sich – prüf die Maße von „${r0.it.name}“ und ${dein(BODY_KEY[k])}`);
        }
      }
    }

    if (isW && !absL) { // mit gelerntem Bereich stecken enge/weite Teile schon in dessen Rändern
      const how = (x) => (x.it.fitDetail?.[k] ? `${d.s} ${x.it.fitDetail[k]}` : x.it.fit);
      const tg = tightFor(k).filter((x) => x.v[k] != null && val <= x.v[k] + 0.5).sort((a, b) => b.v[k] - a.v[k])[0];
      if (tg) { c.boundStatus = 1; c.notes.push(`nicht weiter als „${tg.it.name}“ – das sitzt dir ${how(tg)}`); }
      const lo = looseFor(k).filter((x) => x.v[k] != null && val >= x.v[k] - 0.5).sort((a, b) => a.v[k] - b.v[k])[0];
      if (lo) { c.boundStatus = 1; c.notes.push(`mind. so weit wie „${lo.it.name}“ – das sitzt dir ${how(lo)}`); }
    }

    const learn = learnedAll[k];
    const rng = learn?.range ?? RANGES[sub]?.[k]; const bk = BODY_KEY[k];
    const shortSleeve = isShortSleeve(k, val, body);
    if (shortSleeve) c.notes.push(val < body.arm * 0.4 ? 'Kurzarm' : 'halber Arm / Dreiviertelarm');
    if (rng && body[bk] && !shortSleeve) {
      const ease = easeFor(k, g, body);
      if (learn?.w) {
        c.learn = { n: learn.n, w: learn.w };
        sources.push(`${d.s}: ${learn.w >= 0.5 ? 'gelernt' : 'teils gelernt'} aus ${learn.n} ${SUB_PLURAL[sub] || 'Teilen'}`);
      } else sources.push(`${d.s}: Standardwerte`);
      const adj = adjustRange(rng, k, kind, { pref, cut, stretch });
      const z = zone(ease, adj);
      c.ease = ease; c.zone = z; c.bodyStatus = Math.abs(z); c.range = adj;
      // Gewollt weit: mit Schnitt ok, als „regular“ wäre es weit/zu weit
      if (z === 0 && CUT_EASE[cut] > 0 && zone(ease, adjustRange(rng, k, kind, { pref, stretch })) > 0) c.intended = true;
      if (measures?.hemmable && (k === 'inseam' || k === 'sleeve') && z > 0) {
        // Absichtlich lang – wird beim Schneider gekürzt
        const target = body[bk] + (k === 'inseam' ? 2 : 1.5);
        c.zone = 0; c.bodyStatus = 0; c.hem = val - target;
        c.notes.push(`zu lang, wird gekürzt: ca. ${fmtCm(c.hem)} kürzen (auf ~${fmtCm(target)})`);
      } else {
        if (c.refDiff == null) dev += Math.abs(z) * 3;
        c.notes.push(c.intended ? `${intendedText(k)}: ${bodyText(k, ease, 0)}` : bodyText(k, ease, z));
      }
    }

    // Maße ohne Körper-Gegenstück: gegen den gelernten Bereich deiner Teile derselben Art
    if (absL) {
      const wf = d.w ? ABS_CUT_WIDEN[cut] || 0 : 0; // relaxed/oversized: Weiten dürfen größer sein
      const rngA = wf ? [absL.range[0], absL.range[1], absL.range[2] + absL.center * wf, absL.range[3] + absL.center * wf] : absL.range;
      const z = zone(val, rngA);
      c.ease = val; c.range = rngA; c.zone = z; c.bodyStatus = Math.abs(z); c.abs = { n: absL.n, center: absL.center };
      if (z === 0 && wf && zone(val, absL.range) > 0) c.intended = true;
      sources.push(`${d.s}: gelernt aus ${absL.n} ${SUB_PLURAL[sub] || 'Teilen'}`);
      const own = ABS_OWN[sub] || 'deine Teile', span = `${r1(rngA[1])}–${fmtCm(rngA[2])}`;
      const more = d.w ? ['enger', 'weiter'] : ['kürzer', 'länger'];
      if (measures?.hemmable && LENGTH_KEYS.has(k) && z > 0) {
        // Absichtlich lang – wird gekürzt, also nicht bestrafen
        c.zone = 0; c.bodyStatus = 0; c.hem = val - absL.center;
        c.notes.push(`${fmtCm(val)} – länger als ${own} (${span}), wird gekürzt: ca. ${fmtCm(c.hem)} kürzen`);
      } else {
        if (c.refDiff == null) dev += Math.abs(z) * 3;
        c.notes.push(z === 0
          ? (c.intended ? `${intendedText(k)}: ${fmtCm(val)} (${own}: ${span})` : `${fmtCm(val)} – wie ${own} (${span})`)
          : `${fmtCm(val)} – ${Math.abs(z) === 2 ? 'deutlich' : 'etwas'} ${more[z > 0 ? 1 : 0]} als ${own} (${span})`);
      }
    }

    if (k === 'length' && (kind === 'top' || kind === 'dress') && (g.shoulder || g.chest) && body.height && body.inseam) {
      const m = bodyModel(body); const rel = m.y.hps + val - m.y.crotch;
      const where = Math.abs(rel) <= 2 ? 'endet etwa auf Schritthöhe' : rel > 0 ? `endet ca. ${fmtCm(rel)} unter dem Schritt` : `endet ca. ${fmtCm(-rel)} über dem Schritt`;
      // Oberteile: nur ein Hinweis, wo es endet und ob das für die Art üblich ist – zählt NICHT für Ampel/Empfehlung
      // (Länge ist oft Geschmack bzw. Stil; einschätzen sollst du selbst)
      const lr = kind === 'top' ? TOP_LENGTH[sub] : null;
      if (lr) {
        const z = zone(Math.round(rel), lr); // gerundet wie im Text, damit „2 cm darüber“ nicht knapp als „kurz“ gilt
        const usual = lr[1] > 0 ? `${lr[1]}–${fmtCm(lr[2])} darunter`
          : `${lr[1] === 0 ? 'Schritthöhe' : `${fmtCm(-lr[1])} darüber`} bis ${fmtCm(lr[2])} darunter`;
        c.lengthHint = z;
        c.notes.push(`${where} – für ${TOP_LENGTH_NAME[sub]} ${z === 0 ? `üblich (${usual})` : `eher ${z < 0 ? 'kurz' : 'lang'} (üblich: ${usual})`}`);
      } else c.notes.push(where);
    }

    if (measures?.hemmable && c.refDiff > 0 && (k === 'inseam' || k === 'sleeve' || k === 'length')) c.refStatus = 0;
    const hemmed = !!c.hem || (measures?.hemmable && LENGTH_KEYS.has(k) && c.refStatus === 0 && c.refDiff > 0);

    // Messtoleranz: Kippt das Ergebnis, wenn der Wert ±Toleranz daneben liegt? → unsicher (für die Sicherheit)
    const tol = measures?.widthMode === 'circ' && d.w ? tolIn / 2 : tolIn;
    c.tol = tol;
    if (!hemmed) {
      const dE = CIRC.has(k) ? tol * 2 : tol;
      const flipBody = c.range && (zone(c.ease + dE, c.range) !== c.zone || zone(c.ease - dE, c.range) !== c.zone);
      const rs = (x) => (Math.abs(x) <= c.refTol[0] ? 0 : Math.abs(x) <= c.refTol[1] ? 1 : 2);
      const flipRef = c.refTol && (rs(c.refDiff + tol) !== c.refStatus || rs(c.refDiff - tol) !== c.refStatus);
      if (flipBody || flipRef) c.uncertain = true;
    }
    // Einlaufen: Längen nach dem ersten Waschen ~3 % kürzer
    let shrunkBody = null, shrunkRef = null;
    if (shrink && LENGTH_KEYS.has(k) && !hemmed) {
      const dl = val * SHRINK_LEN;
      if (c.range) shrunkBody = zone(c.ease - dl, c.range);
      if (c.refTol) shrunkRef = c.refDiff - dl;
      const worse = (shrunkBody != null && Math.abs(shrunkBody) > Math.abs(c.zone)) || (shrunkRef != null && Math.abs(shrunkRef) > c.refTol[0] && Math.abs(shrunkRef) > Math.abs(c.refDiff));
      c.shrink = dl;
      if (worse) { c.shrinkWorse = true; c.notes.push(`läuft beim Waschen evtl. ~${fmtCm(dl)} ein${shrunkBody != null && shrunkBody < 0 ? ` → dann ${zwFor(k)[shrunkBody + 2]}` : ''}`); }
    }
    // Referenz und Körpermaße gemeinsam gewichten (mehr Referenzen → mehr Gewicht; Ersatz-/widersprüchliche Referenz → weniger)
    let s = c.refStatus ?? c.bodyStatus ?? null;
    if (c.refStatus != null && c.bodyStatus != null) {
      const wr = c.refWeak ? REF_WEIGHT.weak : c.conflict ? REF_WEIGHT.conflict : c.alt ? REF_WEIGHT.alt : c.nRefs === 1 ? REF_WEIGHT.one : c.nRefs === 2 ? REF_WEIGHT.two : REF_WEIGHT.many;
      c.refWeight = wr;
      s = Math.round(wr * c.refStatus + (1 - wr) * c.bodyStatus + 1e-9);
    } else if (c.refWeak && c.refStatus != null) s = Math.min(c.refStatus, 1); // schwache Längen-Referenz allein ist nie rot
    if (c.boundStatus) s = Math.max(s ?? 0, c.boundStatus);
    c.status = s;
    c.tag = c.hem ? `−${fmtCm(c.hem)} kürzen` : c.refStatus > 0 && s > 0 && !(c.refWeak && c.zone != null) ? `${sgn(c.refDiff)} vs. Ref.` : c.intended && !s ? intendedText(k) : c.zone != null ? zwFor(k)[c.zone + 2] : s === 0 ? 'ok' : s ? 'prüfen' : fmtCm(val);

    // Stetiger Abstand zum Ideal (Referenz und Körper gemischt wie beim Status); Einlaufen: der schlechtere Wert zählt
    const bodyD = c.range ? (hemmed ? 0 : Math.max(zoneDist(c.ease, c.range), shrink && c.shrink ? zoneDist(c.ease - c.shrink, c.range) : 0)) : null;
    const refR = c.refTol && [-c.refTol[1], -c.refTol[0], c.refTol[0], c.refTol[1]];
    const refD = refR ? (hemmed ? 0 : Math.max(zoneDist(c.refDiff, refR), shrunkRef != null ? zoneDist(shrunkRef, refR) : 0)) : null;
    let dist = refD != null && bodyD != null ? c.refWeight * refD + (1 - c.refWeight) * bodyD
      : refD != null ? (c.refWeak ? refD * 0.5 : refD) : bodyD;
    if (c.boundStatus) dist = Math.max(dist ?? 0, 1.2);
    c.dist = dist;
    c.weight = importance(kind, k) * (measures?.hemmable && LENGTH_KEYS.has(k) ? HEM_WEIGHT : 1);
    checks.push(c);
  }

  const nSame = perfect.filter((x) => x.sub === sub).length;
  const refFallback = altSubs.size ? `Vergleich mit ${[...altSubs].join('/')} statt ${SUB_LABEL[sub]}` : null;
  const basis = [nSame ? `${nSame} perfekt sitzende${nSame === 1 ? 's' : ''} Teil${nSame === 1 ? '' : 'e'}` : '', refFallback || '', hasBody ? 'deine Körpermaße' : ''].filter(Boolean).join(' + ');
  const nRefs = nSame + (refFallback ? perfect.length - nSame : 0);
  return { kind, sub, checks, dev, basis, hasBody, nRefs, refFallback, sources, ...summarize(checks), ...fitSummary(kind, checks) };
}

function summarize(checks) {
  const graded = checks.filter((c) => c.status != null);
  const score = graded.reduce((s, c) => s + [0, 1, 3][c.status] * (WEIGHT[c.k] || 1), 0);
  const nBad = graded.filter((c) => c.status === 2).length, nWarn = graded.filter((c) => c.status === 1).length;
  let level, verdict;
  if (!graded.length) { level = -1; verdict = 'Noch keine Vergleichsdaten'; }
  else if (nBad) { level = 3; verdict = 'Passt eher nicht'; }
  else if (nWarn > 1) { level = 2; verdict = 'Passt mit Abstrichen'; }
  else if (nWarn === 1) { level = 1; verdict = 'Passt wahrscheinlich'; }
  else { level = 0; verdict = 'Passt'; }
  return { score, level, verdict };
}

// Shop-Tabelle mit Körpermaßen („Größe M = Brust 96–100“): eigene Maße gegen die Bereiche prüfen
const BODY_CHART_KEY = { ...BODY_KEY, length: null, hem: null, rise: null, legOpening: null, width: null };
export function analyzeBodyChart(cat, values, body = {}) {
  const kind = setKind(cat);
  const order = MEASURE_SETS[kind];
  const checks = Object.keys(values).filter((k) => MEASURES[k]).sort(ord(order)).map((k) => {
    const [lo, hi] = values[k]; const bk = BODY_CHART_KEY[k];
    const c = { k, label: MEASURES[k].l, short: MEASURES[k].s, value: (lo + hi) / 2, notes: [], status: null, tag: '?' };
    const range = lo === hi ? fmtCm(lo) : `${fmtCm(lo).replace(' cm', '')}–${fmtCm(hi)}`;
    if (!bk || !body[bk]) { c.notes.push(`Shop: ${range} · ${bk ? `${dein(bk)} fehlt` : 'kein Körpermaß zum Vergleich'}`); return c; }
    const v = body[bk]; const d = v < lo - 0.01 ? v - lo : v > hi + 0.01 ? v - hi : 0;
    c.status = d === 0 ? 0 : Math.abs(d) <= 2 ? 1 : 2;
    c.tag = d === 0 ? 'ok' : d < 0 ? 'zu groß' : 'zu klein';
    c.notes.push(d === 0 ? `${dein(bk)} (${fmtCm(v)}) liegt im Bereich ${range}` : `${dein(bk)} (${fmtCm(v)}) liegt ${fmtCm(Math.abs(d))} ${d < 0 ? 'unter' : 'über'} ${range}`);
    // Abstand: Mitte des Shop-Bereichs ideal, 2 cm daneben = Rand von Rot (wie beim Status)
    c.dist = zoneDist(v, [lo - 2, lo, hi, hi + 2]); c.weight = importance(kind, k);
    if (Math.abs(v - lo) <= 1 || Math.abs(v - hi) <= 1) c.uncertain = true; // dein Maß liegt am Rand der Größe
    return c;
  });
  const hasBody = BODY_FIELDS.some(([k]) => !NOT_FIT.has(k) && body[k]);
  const dev = checks.reduce((s, c) => s + (c.status || 0), 0);
  return { kind, sub: subKind(cat), checks, dev, basis: hasBody ? 'Größentabelle (Körpermaße) + deine Körpermaße' : '', hasBody, nRefs: 0, bodyChart: true, ...summarize(checks), ...fitSummary(kind, checks, true) };
}

// ---------- Größenempfehlung mit Sicherheit ----------
const CLOSE_GAP = 0.15; // Abstand-Unterschied, ab dem zwei Größen als „sehr nah“ gelten
const ALT_GAP = 0.6; // bis zu diesem Unterschied wird eine zweite Größe als Alternative genannt
const WIDTH_KEYS = ['shoulder', 'chest', 'waist', 'hip', 'thigh', 'insole'];
const LOOSER = {
  shirt: 'wenn du es lockerer magst', hemd: 'wenn du ein Shirt drunter trägst oder es lockerer magst',
  strick: 'wenn du ein Hemd drunter trägst oder es lockerer magst', jacke: 'wenn du einen dicken Pullover drunter trägst',
  bottom: 'wenn du es an Bund und Oberschenkel bequemer magst', dress: 'wenn du es lockerer magst', shoes: 'mit dicken Socken oder Einlagen',
};
const TIGHTER = { shoes: 'mit dünnen Socken' };

/**
 * Empfiehlt eine Größe aus den Ergebnissen von analyze/analyzeBodyChart (eine je Größe, Reihenfolge wie in der Tabelle).
 * Alle Größen werden über dieselben Maße verglichen: Fehlt einer Größe ein Maß, zählt dort der ungünstigste Wert
 * der anderen Größen – eine lückenhafte Zeile kann also nicht „gewinnen“, und die Sicherheit sinkt.
 * @returns {index, size, confidence: 'hoch'|'mittel'|'niedrig', reasons[], alt: {index, size, reason}|null, totals[]}
 */
export function recommend(results, labels = []) {
  const lab = (i) => labels[i] || `Größe ${i + 1}`;
  const idx = results.map((_, i) => i).filter((i) => results[i]?.level >= 0 && results[i].fitScore != null);
  if (!idx.length) return { index: -1, size: null, confidence: 'niedrig', reasons: ['Noch keine Vergleichsdaten – trag deine Körpermaße ein oder bewerte Teile im Schrank.'], alt: null, totals: [] };
  const { kind, sub } = results[idx[0]];
  const dOf = (i, k) => results[i].checks.find((c) => c.k === k && c.dist != null);
  const keyW = {}, worst = {};
  for (const i of idx) for (const c of results[i].checks) if (c.dist != null) { keyW[c.k] = Math.max(keyW[c.k] || 0, c.weight); worst[c.k] = Math.max(worst[c.k] ?? 0, c.dist); }
  const keys = Object.keys(keyW), sw = keys.reduce((s, k) => s + keyW[k], 0);
  const totals = results.map((_, i) => (idx.includes(i) ? keys.reduce((s, k) => s + keyW[k] * (dOf(i, k)?.dist ?? worst[k]), 0) / sw : null));
  const missing = results.map((_, i) => (idx.includes(i) ? keys.filter((k) => !dOf(i, k)) : []));
  // Schulter-Sperre: deutlich schmaler als ein perfekt sitzendes Referenzteil → darf nicht gewinnen
  // Nur gegen Referenzen derselben Art (ein T-Shirt darf schmaler sein als ein Hemd)
  const narrow = (i) => { const c = results[i].checks.find((x) => x.k === 'shoulder' && x.refDiff != null && !x.alt); return c && c.refDiff < -SHOULDER_GUARD - 1e-9 ? c : null; };
  const allowed = idx.filter((i) => !narrow(i));
  const pool = allowed.length ? allowed : idx;
  let best = pool[0];
  for (const i of pool) if (totals[i] < totals[best] - 1e-9 || (Math.abs(totals[i] - totals[best]) <= 1e-9 && missing[i].length < missing[best].length)) best = i;

  const r = results[best], lbl = (k) => MEASURES[k].l;
  const reasons = []; let conf = 2; // 2 hoch, 1 mittel, 0 niedrig
  const down = (lvl, text) => { conf = Math.min(conf, lvl); reasons.push(text); };
  if (!allowed.length) down(0, idx.length > 1 ? `Alle Größen sind an der Schulter mehr als ${SHOULDER_GUARD} cm schmaler als dein perfekt sitzendes Teil.`
    : `Schulter mehr als ${SHOULDER_GUARD} cm schmaler als dein perfekt sitzendes Teil.`);
  for (const i of idx) {
    const c = narrow(i);
    // Nur erwähnen, wenn die Größe ohne Sperre gewonnen hätte (dann widersprechen sich Körpermaße und Referenz)
    if (c && allowed.length && totals[i] < totals[best] - 1e-9) down(1, `${lab(i)} scheidet aus: Schulter ${fmtCm(-c.refDiff)} schmaler als dein perfekt sitzendes Teil – prüf auch deine eingetragene Schulterbreite.`);
  }
  if (!r.hasBody && !r.nRefs) down(0, 'Ohne Körpermaße und ohne Referenzteile ist das nur eine grobe Schätzung.');
  if (r.missingImportant.length) down(r.coverage < 0.5 ? 0 : 1, `Wichtige Maße ohne Vergleich: ${r.missingImportant.map(lbl).join(', ')}.`);
  if (missing[best].length) down(1, `Für ${lab(best)} fehlt in der Tabelle: ${missing[best].map(lbl).join(', ')} – zählt wie der ungünstigste Wert der anderen Größen.`);
  const multi = idx.length > 1;
  const reds = r.checks.filter((c) => c.status === 2).map((c) => c.label).join(', ');
  if (r.level === 3) down(0, multi ? `Auch die beste Größe ${lab(best)} passt an einer Stelle nicht (${reds}).` : `Passt an einer Stelle nicht (${reds}).`);
  else if (r.level === 2) down(1, multi ? `Auch ${lab(best)} passt nur mit Abstrichen.` : 'Passt nur mit Abstrichen.');
  const second = pool.filter((i) => i !== best).sort((a, b) => totals[a] - totals[b])[0];
  if (second != null && totals[second] - totals[best] < CLOSE_GAP) down(1, `${lab(best)} und ${lab(second)} liegen sehr nah beieinander.`);
  const unc = r.checks.filter((c) => c.uncertain && importance(kind, c.k) >= IMPORTANT_MIN);
  if (unc.length) {
    const names = unc.map((c) => c.label).join(', ');
    down(1, r.bodyChart ? `${names}: dein Maß liegt am Rand des Größenbereichs.`
      : `${names} ${unc.length > 1 ? 'liegen' : 'liegt'} nah an einer Grenze – Angaben haben ca. ±${fmtCm(unc[0].tol)} Toleranz.`);
  }
  const shr = r.checks.filter((c) => c.shrinkWorse);
  if (shr.length) down(1, `${shr.map((c) => c.label).join(', ')}: Baumwolle kann beim ersten Waschen ~3 % einlaufen.`);
  if (r.checks.some((c) => c.conflict)) down(1, 'Eine Referenz widerspricht deinen Körpermaßen – Maße prüfen.');
  if (conf === 2) reasons.push(multi ? 'Alle wichtigen Maße vorhanden, klarer Abstand zur nächsten Größe.' : 'Alle wichtigen Maße vorhanden und eindeutig.');

  // Alternative: nahe Größe (bevorzugt direkt daneben) mit Begründung
  let alt = null;
  const cands = pool.filter((i) => i !== best && totals[i] - totals[best] < ALT_GAP)
    .sort((a, b) => (Math.abs(a - best) === 1 ? 0 : 1) - (Math.abs(b - best) === 1 ? 0 : 1) || totals[a] - totals[b]);
  if (cands.length) {
    const ai = cands[0];
    let spec = null, gain = 0;
    for (const k of keys) {
      const cb = dOf(best, k), ca = dOf(ai, k);
      if (cb && ca && cb.status >= 1 && ca.status < cb.status && (cb.dist - ca.dist) * keyW[k] > gain) { gain = (cb.dist - ca.dist) * keyW[k]; spec = cb; }
    }
    const common = WIDTH_KEYS.filter((k) => dOf(best, k) && dOf(ai, k));
    const sum = (i) => common.reduce((s, k) => s + dOf(i, k).value, 0);
    const larger = common.length ? sum(ai) > sum(best) : ai > best;
    const reason = spec ? `${lab(ai)}, wenn dir ${spec.label} wichtiger ist – ${lab(best)} ist dort ${spec.tag}`
      : `${lab(ai)}, ${larger ? LOOSER[sub] || LOOSER[kind] || 'wenn du es lockerer magst' : TIGHTER[sub] || TIGHTER[kind] || 'wenn du es körpernah magst'}`;
    alt = { index: ai, size: lab(ai), larger, reason };
  }
  return { index: best, size: lab(best), confidence: ['niedrig', 'mittel', 'hoch'][conf], reasons, alt, totals };
}

// Index des besten Ergebnisses nach der alten Stufen-Punktzahl (bleibt für Abwärtskompatibilität; die App nutzt recommend)
export function bestIndex(results) {
  let best = -1;
  results.forEach((r, i) => {
    if (r.level < 0) return;
    const b = results[best];
    if (!b || r.score < b.score || (r.score === b.score && r.dev < b.dev)) best = i;
  });
  return best;
}

// ---------- Feedback-Schleife: Was hat der Berater empfohlen, und lag er richtig? ----------
/** Beim Kauf gespeichert (item.advice): Empfehlung damals + gekaufte Größe. */
export function adviceFor(rec, boughtSize, date = null) {
  if (!rec || rec.index < 0) return { recommended: null, confidence: null, alt: null, bought: boughtSize ?? null, date };
  return { recommended: rec.size, confidence: rec.confidence, alt: rec.alt?.size ?? null, bought: boughtSize ?? null, date };
}

// Gesamteindruck eines gekauften Teils: Gesamtbewertung, sonst das am schlechtesten bewertete Maß
function overallRating(it) {
  const r = RATING[it?.fit];
  if (r != null) return r;
  const rs = Object.values(it?.fitDetail || {}).map((l) => RATING[l]).filter((x) => x != null);
  return rs.length ? rs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) : null;
}

/**
 * Lag der Berater bei diesem Kauf richtig?
 * 'hit' / 'miss' / 'pending' (noch nicht bewertet) / null (keine Empfehlung oder nicht eindeutig).
 * - Empfohlene Größe (oder genannte Alternative) gekauft: richtig, wenn sie passt (perfekt oder nur „etwas“ daneben).
 * - Andere Größe gekauft: richtig, wenn die dann klar nicht passt (zu eng/weit …); falsch, wenn sie perfekt sitzt.
 */
export function adviceOutcome(it) {
  const a = it?.advice;
  if (!a?.recommended || !a.bought) return null;
  const r = overallRating(it);
  if (r == null) return 'pending';
  const followed = a.bought === a.recommended || (a.alt && a.bought === a.alt);
  if (followed) return Math.abs(r) <= 1 ? 'hit' : 'miss';
  return Math.abs(r) === 2 ? 'hit' : r === 0 ? 'miss' : null;
}

/** Trefferquote über alle Schrankteile mit gespeicherter Empfehlung. */
export function adviceStats(items = []) {
  const out = { hits: 0, total: 0, pending: 0, unclear: 0 };
  for (const it of items) {
    if (!it?.advice?.recommended) continue;
    const o = adviceOutcome(it);
    if (o === 'pending') out.pending++;
    else if (o === null) out.unclear++;
    else { out.total++; if (o === 'hit') out.hits++; }
  }
  return out;
}

// ---------- Puppe (SVG, Maßstab 1 Einheit = 1 cm) ----------
const f = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const poly = (pts) => `M${pts.map(f).join('L')}Z`;
function smooth(pts) {
  const n = pts.length; let d = `M${f(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
  }
  return `${d}Z`;
}
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
const both = (pts) => [...pts, ...mirror(pts).reverse()];
const lerp = (a, b, t) => a + (b - a) * t;
const ARM = { dir: [Math.sin(0.17), Math.cos(0.17)], n: [Math.cos(0.17), -Math.sin(0.17)] };
const along = (p, t, o = 0) => [p[0] + ARM.dir[0] * t + ARM.n[0] * o, p[1] + ARM.dir[1] * t + ARM.n[1] * o];

function bodyWAt(m, y) {
  const { y: Y, w } = m;
  if (y <= Y.chest) return w.chest;
  if (y <= Y.waist) return lerp(w.chest, w.waist, (y - Y.chest) / (Y.waist - Y.chest));
  if (y <= Y.hip) return lerp(w.waist, w.hip, (y - Y.waist) / (Y.hip - Y.waist));
  return w.hip;
}
function bodyCAt(m, y) {
  const { y: Y } = m;
  if (y <= Y.chest) return m.chest;
  if (y <= Y.waist) return lerp(m.chest, m.waist, (y - Y.chest) / (Y.waist - Y.chest));
  if (y <= Y.hip) return lerp(m.waist, m.hip, (y - Y.waist) / (Y.hip - Y.waist));
  return m.hip;
}

function drawBody(m) {
  const { y, w, H } = m, lc = m.legCx;
  const R = [
    [w.neck / 2, y.chin + 0.5], [w.neck / 2, y.hps], [w.shoulder / 2 - 1, y.shoulder], [w.chest / 2, y.armpit],
    [w.chest / 2, y.chest], [w.waist / 2, y.waist], [w.hip / 2, y.hip], [w.hip / 2 - 0.5, y.crotch],
    [lc + w.knee / 2, y.knee], [lc + w.ankle / 2, y.ankle], [lc + w.ankle / 2 + 2, H], [lc - w.ankle / 2 - 1, H],
    [lc - w.ankle / 2, y.ankle], [lc - w.knee / 2, y.knee], [0.6, y.crotch + 1.5],
  ];
  const A = [w.shoulder / 2 - 2.5, y.shoulder + 3];
  const wt = 0.026 * H, ww = 0.016 * H;
  const arm = [along(A, 1, wt * 0.95), along(A, m.arm * 0.45, wt * 0.85), along(A, m.arm, ww), along(A, m.arm, -ww),
    along(A, m.arm * 0.45, -wt * 0.8), along(A, 3, -wt * 0.9)];
  const hand = along(A, m.arm + 8);
  const head = `<ellipse cx="0" cy="${(y.chin / 2).toFixed(1)}" rx="${(0.045 * H).toFixed(1)}" ry="${(y.chin / 2).toFixed(1)}"/>`;
  return `<g class="mq-body">
    <path d="${smooth(arm)}"/><path d="${smooth(mirror(arm))}"/>
    <ellipse cx="${hand[0].toFixed(1)}" cy="${hand[1].toFixed(1)}" rx="3.2" ry="8" transform="rotate(-10 ${f(hand).replace(',', ' ')})"/>
    <ellipse cx="${(-hand[0]).toFixed(1)}" cy="${hand[1].toFixed(1)}" rx="3.2" ry="8" transform="rotate(10 ${(-hand[0]).toFixed(1)} ${hand[1].toFixed(1)})"/>
    <path d="${smooth(both(R))}"/>${head}</g>`;
}

function drawUpper(m, g, a, cat, kind) {
  const { y, w, H } = m;
  const gs = g.shoulder ?? m.shoulder;
  const drop = Math.max(0, (gs - m.shoulder) / 2);
  const ratio = (k, circ, bw) => (g[k] != null ? bw * ((g[k] * 2) / circ) : null);
  const chestW = ratio('chest', m.chest, w.chest) ?? w.chest * 1.12;
  const A = [w.shoulder / 2 - 1.5, y.shoulder + 1.5];
  const sleeve = g.sleeve ?? (kind === 'dress' ? 0 : cat === 'Oberteile' || cat === 'Sport' ? 0.11 * H : m.arm - 1);
  const wTop = 0.026 * H * 1.3 + Math.max(0, chestW - w.chest) * 0.15;
  const wc = sleeve > 35 ? 0.016 * H * 1.5 : wTop * 0.9;
  const S0 = along(A, drop, wTop);
  const armpitY = y.armpit + drop * 0.5;
  let sl = '';
  if (sleeve > 0) {
    const s = [along(A, drop, wTop), along(A, drop + sleeve, wc), along(A, drop + sleeve, -wc), along(A, drop, -wTop)];
    sl = `<path d="${poly(s)}"/><path d="${poly(mirror(s))}"/>`;
    a.sleeve = along(A, drop + sleeve, wc);
  }
  a.shoulder = S0; a.chest = [chestW / 2, y.chest];
  const neck = [w.neck / 2 + 1.5, y.hps];
  const pts = [neck, S0, [chestW / 2, armpitY], [chestW / 2, y.chest]];
  let hemY, hemW;
  if (kind === 'top') {
    hemY = y.hps + (g.length ?? (y.hip + 0.03 * H - y.hps));
    hemW = g.hem != null ? bodyWAt(m, hemY) * ((g.hem * 2) / bodyCAt(m, hemY)) : Math.max(chestW, bodyWAt(m, hemY) * 1.06);
    if (hemY > y.waist + 3) pts.push([Math.max(lerp(chestW, hemW, (y.waist - y.chest) / (hemY - y.chest)), w.waist * 1.02) / 2, y.waist]);
  } else {
    const waistW = ratio('waist', m.waist, w.waist) ?? w.waist * 1.1;
    const hipW = ratio('hip', m.hip, w.hip) ?? Math.max(w.hip * 1.1, waistW);
    hemY = y.hps + (g.length ?? (y.knee - y.hps));
    hemW = Math.max(hipW * 1.15, hipW + (hemY - y.hip) * 0.25);
    pts.push([waistW / 2, y.waist]);
    if (hemY > y.hip + 3) pts.push([hipW / 2, y.hip]);
    a.waist = [waistW / 2, y.waist]; a.hip = [hipW / 2, y.hip];
  }
  pts.push([hemW / 2, hemY]);
  a.length = [hemW / 2, hemY]; a.hem = a.length;
  const torso = [...pts, ...mirror(pts).reverse(), [0, y.hps + 0.025 * H]];
  return `${sl}<path d="${poly(torso)}"/>`;
}

function drawSkirt(m, g, a) {
  const { y, w, H } = m;
  const waistW = g.waist != null ? w.waist * ((g.waist * 2) / m.waist) : w.waist * 1.04;
  const hipW = g.hip != null ? w.hip * ((g.hip * 2) / m.hip) : Math.max(w.hip * 1.08, waistW);
  const hemY = y.waist + (g.length ?? 0.3 * H);
  const hemW = Math.max(hipW * 1.12, hipW + (hemY - y.hip) * 0.25);
  const pts = [[waistW / 2, y.waist]];
  if (hemY > y.hip + 3) pts.push([hipW / 2, y.hip]);
  pts.push([hemW / 2, hemY]);
  a.waist = pts[0]; a.hip = [hipW / 2, y.hip]; a.length = [hemW / 2, hemY];
  return `<path d="${poly(both(pts))}"/>`;
}

function drawBottom(m, g, a, hemmable) {
  const { y, w, H } = m, lc = m.legCx;
  // Leibhöhe wird entlang der Nahtkurve gemessen – senkrecht ist es etwas weniger
  const rise = g.rise != null ? g.rise * 0.86 : (y.crotch - y.waist) * 0.92;
  const wbY = y.crotch - rise;
  const wbW = g.waist != null ? bodyWAt(m, wbY) * ((g.waist * 2) / m.waist) : bodyWAt(m, wbY) * 1.03;
  const hipW = g.hip != null ? w.hip * ((g.hip * 2) / m.hip) : Math.max(wbW, w.hip * 1.06);
  const thighW = g.thigh != null ? w.thigh * ((g.thigh * 2) / m.thigh) : w.thigh * 1.2;
  let inseam = g.inseam ?? (H - y.crotch - 2);
  if (hemmable && inseam > m.inseam + 2) inseam = m.inseam + 2; // so, wie sie nach dem Kürzen sitzt
  let hemY = y.crotch + inseam;
  const stack = Math.max(0, hemY - (H - 0.5));
  hemY = Math.min(hemY, H - 0.5);
  const openW = g.legOpening != null ? w.ankle * ((g.legOpening * 2) / m.ankle) : thighW * 0.68;
  const tY = Math.min(y.crotch + 3, hemY);
  const R = [[wbW / 2, wbY]];
  if (y.hip > wbY + 2) R.push([hipW / 2, y.hip]);
  R.push([lc + thighW / 2, tY]);
  const kneeW = Math.max(lerp(thighW, openW, 0.55), w.knee * 1.08);
  const hasKnee = hemY > y.knee + 3;
  if (hasKnee) R.push([lc + kneeW / 2, y.knee]);
  const oW = hasKnee ? openW : lerp(thighW, openW, Math.max(0, (hemY - tY) / (H - tY)));
  R.push([lc + oW / 2, hemY], [lc - oW / 2, hemY]);
  if (hasKnee) R.push([lc - kneeW / 2, y.knee]);
  R.push([Math.max(0.4, lc - thighW / 2), tY]);
  const pts = [...R, [0, y.crotch], ...mirror(R).reverse()];
  a.waist = [wbW / 2, wbY]; a.hip = [hipW / 2, y.hip]; a.thigh = [lc + thighW / 2, tY];
  a.rise = [lerp(wbW / 2, hipW / 2, 0.5), (wbY + y.crotch) / 2];
  a.inseam = [lc + oW / 2, hemY - 4]; a.legOpening = [lc + oW / 2, hemY]; a.length = a.legOpening;
  let st = '';
  if (stack > 0.5) {
    for (const s of [1, -1]) for (let i = 1; i <= Math.min(3, Math.ceil(stack / 2)); i++) {
      const yy = H - 1 - i * 2.2;
      st += `<path class="mq-stack" d="M${(s * lc - oW / 2).toFixed(1)},${yy.toFixed(1)} q${(oW / 2).toFixed(1)},1.6 ${oW.toFixed(1)},0"/>`;
    }
  }
  return `<path d="${poly(pts)}"/>${st}`;
}

export function mannequinSVG(body, cat, measures, result, color) {
  const kind = setKind(cat);
  if (!['top', 'bottom', 'dress'].includes(kind)) return '';
  const m = bodyModel(body);
  const g = flatValues(measures);
  const a = {};
  let garment;
  if (kind === 'bottom') garment = drawBottom(m, g, a, measures?.hemmable);
  else if (kind === 'dress' && g.shoulder == null && g.chest == null) garment = drawSkirt(m, g, a);
  else garment = drawUpper(m, g, a, cat, kind);

  const LX = 46;
  const labels = (result?.checks || []).filter((c) => a[c.k]).map((c) => ({ c, ax: a[c.k][0], ay: a[c.k][1], y: a[c.k][1] }))
    .sort((p, q) => p.ay - q.ay);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 6.5);
  const lab = labels.map(({ c, ax, ay, y }) => `
    <path class="mq-lead" d="M${ax.toFixed(1)},${ay.toFixed(1)} L${(LX - 3).toFixed(1)},${y.toFixed(1)}"/>
    <circle class="s${c.status ?? 'i'}" cx="${LX - 1.5}" cy="${y.toFixed(1)}" r="1.5"/>
    <text x="${LX + 1}" y="${(y + 1.5).toFixed(1)}">${c.short}: ${c.tag}</text>`).join('');
  const style = color ? ` style="--gc:${color}"` : '';
  const bottom = Math.max(m.H, ...labels.map((l) => l.y + 3));
  return `<svg class="mq" viewBox="-44 -3 152 ${(bottom + 6).toFixed(0)}" role="img" aria-label="Schematische Puppe mit dem Kleidungsstück">
    ${drawBody(m)}<g class="mq-garment"${style}>${garment}</g>${lab}</svg>`;
}

// ---------- Vergleich mit dem Model im Shop ----------
export const MODEL_FIELDS = [['height', 'Größe', 'cm'], ['weight', 'Gewicht', 'kg'], ['chest', 'Brust', 'cm'], ['waist', 'Taille', 'cm'], ['hip', 'Hüfte', 'cm']];
const SIZE_ORDERS = [['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'], ['0', '1', '2', '3', '4', '5', '6']];
const norm = (x) => String(x ?? '').trim().toUpperCase();
const SIZE_ALIAS = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L', 'X-LARGE': 'XL', 'XX-LARGE': 'XXL', 'X-SMALL': 'XS' };
const sz = (x) => SIZE_ALIAS[norm(x)] || norm(x);
// → { size, steps (tatsächlich verschoben), capped }
function shiftSize(rows, size, n) {
  const labels = (rows || []).map((r) => sz(r.size)).filter(Boolean);
  const lists = [labels.length > 1 ? labels : null, ...SIZE_ORDERS].filter(Boolean);
  for (const l of lists) {
    const i = l.indexOf(sz(size));
    if (i >= 0) { const j = Math.max(0, Math.min(l.length - 1, i + n)); return { size: l[j], steps: j - i, capped: j - i !== n }; }
  }
  const num = parseFloat(size);
  return isNaN(num) ? null : { size: String(num + n * (num >= 30 ? 2 : 1)), steps: n, capped: false };
}
const bmi = (kg, cm) => kg / (cm / 100) ** 2;
const r1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
// Rückfallwerte, wenn die Tabelle keine Größenschritte hergibt: ~5 cm Umfang bzw. ~3 BMI-Punkte je Größe
const STEP_FALLBACK_CM = 5, STEP_FALLBACK_BMI = 3;

/** Typischer Größenschritt eines Maßes laut Shop-Tabelle (cm Umfang je Größe, Median der Nachbar-Differenzen) oder null. */
export function sizeStep(chart, k) {
  const vals = (chart?.rows || []).map((r) => {
    const v = r.values?.[k];
    if (v == null) return null;
    if (chart.type === 'body') return Array.isArray(v) ? (v[0] + v[1]) / 2 : v;
    const f = flatValues({ widthMode: chart.widthMode, values: { [k]: v } })[k];
    return f == null ? null : MEASURES[k]?.w ? f * 2 : f;
  });
  const diffs = [];
  for (let i = 1; i < vals.length; i++) if (vals[i] != null && vals[i - 1] != null && vals[i] - vals[i - 1] > 0) diffs.push(vals[i] - vals[i - 1]);
  return diffs.length ? median(diffs) : null;
}

/** Liefert Hinweise ({s: Status, t: Text}) + Größen-Tendenz aus den Model-Angaben. */
export function analyzeModel(model, body = {}, chart = null, selIdx = 0) {
  if (!model || (!model.size && !model.height)) return null;
  const notes = []; const mH = model.height, bH = body.height;
  const who = `Model${mH ? ` (${mH} cm${model.weight ? ` / ${model.weight} kg` : ''})` : ''}${model.size ? ` trägt ${model.size}` : ''}`;
  if (mH && bH) {
    const d = bH - mH;
    notes.push({ s: Math.abs(d) > 8 ? 1 : 0, t: Math.abs(d) < 2 ? 'Model ist etwa so groß wie du.' : `Model ist ${fmtCm(Math.abs(d))} ${d > 0 ? 'kleiner' : 'größer'} als du – Längen wirken an dir ${d > 0 ? 'kürzer' : 'länger'}.` });
  }
  let widthSteps = null, stepNote = '', roughOnly = false;
  for (const [k, l] of [['chest', 'Brust'], ['waist', 'Taille'], ['hip', 'Hüfte']]) {
    if (!model[k] || !body[k]) continue;
    const d = body[k] - model[k];
    if (k === 'chest' || widthSteps == null) {
      // Größenschritt aus der Shop-Tabelle (Bund in Hosen-Tabellen heißt „waist“ wie die Taille)
      const step = sizeStep(chart, k);
      widthSteps = d / (step || STEP_FALLBACK_CM);
      stepNote = step ? ` · laut Tabelle ~${fmtCm(step)} ${l} je Größe` : '';
    }
    notes.push({ s: Math.abs(d) > 6 ? 1 : 0, t: `${l}: Model ${fmtCm(model[k])}, du ${fmtCm(body[k])} → in gleicher Größe ${Math.abs(d) < 1.5 ? 'gleich viel' : `${fmtCm(Math.abs(d))} ${d > 0 ? 'weniger' : 'mehr'}`} Spielraum als auf den Fotos.` });
  }
  if (model.weight && mH && body.weight && bH) {
    const bm = bmi(model.weight, mH), by = bmi(body.weight, bH), d = by - bm;
    // Nur Größe/Gewicht, keine Brust/Taille/Hüfte: höchstens ein grober Hinweis, keine konkrete Größe
    if (widthSteps == null) { widthSteps = d / STEP_FALLBACK_BMI; roughOnly = true; }
    notes.push({ s: Math.abs(d) > 3 ? 1 : 0, t: Math.abs(d) < 1.5 ? `Ähnliche Statur wie das Model (BMI ${r1(bm)} / du ${r1(by)}).` : `Model ist ${d > 0 ? 'schlanker' : 'kräftiger'} (BMI ${r1(bm)} / du ${r1(by)}) – an dir sitzt es ${d > 0 ? 'enger' : 'lockerer'} als auf den Fotos.` });
  }
  // Ausgewählte Größe im Verhältnis zu den Fotos
  const rows = chart?.rows || []; const sel = rows[selIdx];
  const mRow = model.size ? rows.find((r) => sz(r.size) === sz(model.size)) : null;
  if (chart?.type !== 'body' && sel && mRow) {
    const sv = flatValues({ widthMode: chart.widthMode, values: sel.values }), mv = flatValues({ widthMode: chart.widthMode, values: mRow.values });
    const pre = sel === mRow ? `In ${sel.size}` : `${sel.size} statt ${mRow.size}`;
    if (mH && bH) for (const k of ['length', 'sleeve', 'inseam']) {
      if (sv[k] == null || mv[k] == null) continue;
      const d = sv[k] * (mH / bH) - mv[k];
      notes.push({ s: Math.abs(d) > 4 ? 1 : 0, t: `${pre}: ${MEASURES[k].l} wirkt an dir ${Math.abs(d) < 1 ? 'etwa wie' : `ca. ${fmtCm(Math.abs(d))} ${d < 0 ? 'kürzer' : 'länger'} als`} auf den Fotos.` });
    }
    if (sv.chest != null && mv.chest != null && model.chest && body.chest) {
      const d = (sv.chest * 2 - body.chest) - (mv.chest * 2 - model.chest);
      notes.push({ s: d < -6 ? 1 : 0, t: `${pre}: Brust hat an dir ${Math.abs(d) < 1.5 ? 'etwa so viel' : `${fmtCm(Math.abs(d))} ${d < 0 ? 'weniger' : 'mehr'}`} Spielraum als beim Model.` });
    }
  }
  let suggestion = null;
  if (model.size && widthSteps != null && roughOnly) {
    // BMI sagt wenig über Brust/Schulter (Muskeln vs. Bauch) → nur Richtung, keine Größe
    const n = Math.round(widthSteps);
    const dir = n > 0 ? 'eher größer als das Model' : n < 0 ? 'eher kleiner als das Model' : 'etwa die Größe des Models';
    suggestion = `Grobe Tendenz (nur über Größe und Gewicht): ${dir} – ohne Brustmaße keine konkrete Größe`;
  } else if (model.size && widthSteps != null) {
    const n = Math.round(widthSteps);
    const t = n ? shiftSize(rows, model.size, n) : null;
    if (!n || (t && t.steps === 0)) suggestion = `Tendenz: gleiche Größe wie das Model (${model.size})`;
    else if (!t) suggestion = `Tendenz: ${Math.abs(n)} Größe${Math.abs(n) > 1 ? 'n' : ''} ${n > 0 ? 'größer' : 'kleiner'} als das Model`;
    else suggestion = `Tendenz: ${Math.abs(t.steps)} Größe${Math.abs(t.steps) > 1 ? 'n' : ''} ${t.steps > 0 ? 'größer' : 'kleiner'} als das Model → ${t.size}${t.capped ? ` (${t.steps > 0 ? 'größte' : 'kleinste'} verfügbare)` : ''}`;
    if (suggestion) suggestion += stepNote;
  }
  return { who, notes, suggestion, rough: roughOnly };
}

// ---------- Messanleitung für Körpermaße ----------
export const BODY_HOWTO = {
  _: { t: 'So misst du richtig', d: 'Weiches Maßband, in Unterwäsche, gerade und entspannt stehen. Band anliegend, aber nicht einschnürend, und waagerecht halten. Mit einer zweiten Person geht es leichter und genauer.' },
  height: { t: 'Körpergröße', d: 'Barfuß mit Fersen, Po und Hinterkopf an die Wand stellen, Blick geradeaus. Ein Buch flach auf den Kopf legen, Unterkante an der Wand markieren und vom Boden bis zur Markierung messen.' },
  shoulder: { t: 'Schulterbreite', d: 'Am Rücken von Schulterknochen zu Schulterknochen – das ist der äußerste knöcherne Punkt, wo der Arm beginnt. Band dem Rücken folgen lassen. Allein schwierig: alternativ ein gut sitzendes Hemd flach hinlegen und von Schulternaht zu Schulternaht messen.' },
  chest: { t: 'Brustumfang', d: 'Waagerecht rundherum an der breitesten Stelle, direkt unter den Achseln über die Schulterblätter. Arme locker hängen lassen und normal ausatmen – nicht die Luft anhalten.' },
  waist: { t: 'Bundumfang', d: 'Rundherum genau da, wo deine Hosen normalerweise sitzen (meist etwas unter dem Bauchnabel). Bauch nicht einziehen, ein Finger soll noch unter das Band passen.' },
  hip: { t: 'Hüftumfang', d: 'Füße zusammen, waagerecht rundherum an der breitesten Stelle des Pos messen. Im Spiegel prüfen, dass das Band hinten nicht nach unten rutscht.' },
  thigh: { t: 'Oberschenkelumfang', d: 'Rundherum am obersten, dicksten Teil des Oberschenkels, direkt unter dem Schritt. Bein dabei locker lassen, Gewicht auf beide Beine verteilen.' },
  arm: { t: 'Armlänge', d: 'Hand locker auf die Hüfte legen, so dass der Arm leicht angewinkelt ist. Vom Schulterknochen über den Ellbogen bis zum Handgelenkknochen messen.' },
  inseam: { t: 'Innenbeinlänge', d: 'Barfuß an die Wand stellen, ein Buch hochkant fest in den Schritt drücken (wie ein Fahrradsattel), Oberkante an der Wand markieren, bis zum Boden messen. Alternativ: Innennaht einer perfekt langen Hose vom Schritt bis zum Saum.' },
  foot: { t: 'Fußlänge', d: 'Abends messen (Füße sind dann etwas größer), mit dünnen Socken. Ferse an die Wand auf ein Blatt Papier stellen, vor dem längsten Zeh markieren, Abstand zur Wand messen. Beide Füße messen, den größeren Wert nehmen.' },
  weight: { t: 'Gewicht', d: 'Morgens ohne Kleidung wiegen. Wird nur für den Vergleich mit Models im Shop genutzt.' },
};

export function measureGuideSVG(body = {}) {
  const m = bodyModel(body);
  const { y, w, H } = m, lc = m.legCx;
  const nums = Object.fromEntries(BODY_FIELDS.map(([k], i) => [k, i + 1]));
  const tag = (k, x, yy) => `<g class="mg-num"><circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="3.6"/><text x="${x.toFixed(1)}" y="${(yy + 1.6).toFixed(1)}">${nums[k]}</text></g>`;
  const band = (k, cx, cy, rx, lx) => `<g data-g="${k}"><ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="1.8"/>${tag(k, lx, cy)}</g>`;
  const A = [w.shoulder / 2 - 2.5, y.shoulder + 3];
  const wrist = along(A, m.arm);
  const pantsY = y.waist + 0.3 * (y.hip - y.waist);
  const g = [
    `<g data-g="height"><path d="M-36,0 L-36,${H.toFixed(1)} M-38.5,0 L-33.5,0 M-38.5,${H.toFixed(1)} L-33.5,${H.toFixed(1)}"/>${tag('height', -36, H * 0.45)}</g>`,
    `<g data-g="shoulder"><path d="M${(-w.shoulder / 2 + 1).toFixed(1)},${(y.shoulder + 0.5).toFixed(1)} Q0,${(y.shoulder - 2.5).toFixed(1)} ${(w.shoulder / 2 - 1).toFixed(1)},${(y.shoulder + 0.5).toFixed(1)}"/>${tag('shoulder', 0, y.shoulder - 4.5)}</g>`,
    band('chest', 0, y.chest, w.chest / 2 + 1, -w.chest / 2 - 6),
    band('waist', 0, pantsY, (w.waist + w.hip) / 4 + 1, -w.hip / 2 - 6),
    band('hip', 0, y.hip, w.hip / 2 + 1, -w.hip / 2 - 6),
    band('thigh', lc, y.crotch + 3, w.thigh / 2 + 0.8, lc + w.thigh / 2 + 5),
    `<g data-g="arm"><path d="M${A[0].toFixed(1)},${(y.shoulder + 0.5).toFixed(1)} L${wrist[0].toFixed(1)},${wrist[1].toFixed(1)}"/>${tag('arm', wrist[0] + 6, (y.shoulder + wrist[1]) / 2)}</g>`,
    `<g data-g="inseam"><path d="M0,${(y.crotch + 1).toFixed(1)} L0,${H.toFixed(1)}"/>${tag('inseam', -6, (y.crotch + H) / 2 + 8)}</g>`,
    `<g data-g="foot"><path d="M${(lc - 3).toFixed(1)},${(H + 3).toFixed(1)} L${(lc + 9).toFixed(1)},${(H + 3).toFixed(1)}"/>${tag('foot', lc + 13, H + 3)}</g>`,
  ];
  return `<svg class="mq mg" viewBox="-44 -3 88 ${(H + 10).toFixed(0)}" role="img" aria-label="Wo wird gemessen">${drawBody(m)}${g.join('')}</svg>`;
}

// Welche wichtigen Maße fehlen und werden an der Puppe nur geschätzt?
const KEY_MEASURES = { top: ['shoulder', 'chest', 'length', 'sleeve'], bottom: ['waist', 'hip', 'thigh', 'rise', 'inseam'], dress: ['chest', 'waist', 'hip', 'length'] };
export function estimatedMeasures(cat, measures) {
  const v = measures?.values || {};
  return (KEY_MEASURES[setKind(cat)] || []).filter((k) => v[k] == null).map((k) => MEASURES[k].l);
}
