import * as db from './db.js';
import { MEASURES, measureSet, setKind, FITS, fmtCm, BODY_FIELDS, PREFS, analyze, analyzeBodyChart, recommend, mannequinSVG, MODEL_FIELDS, analyzeModel, BODY_HOWTO, measureGuideSVG, estimatedMeasures, CUTS, STRETCHES, detailKeys, detailScale, cleanFitDetail, adviceFor, adviceOutcome, adviceStats } from './fit.js';
import { toBackup, fromBackup } from './backup.js';
import { addWash, removeWash, lastWash, wearsSinceWash } from './pflege.js';
import { shiftMonth, monthGrid, wornOn, setWornOn, costPerWear } from './kalender.js';

// ---------- Konstanten ----------
const CATEGORIES = ['Oberteile', 'Pullover & Strick', 'Hemden & Blusen', 'Hosen', 'Röcke & Kleider',
  'Jacken & Mäntel', 'Schuhe', 'Accessoires', 'Sport', 'Unterwäsche & Socken', 'Sonstiges'];
const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
const COLORS = [
  ['Schwarz', '#1d1d1d'], ['Weiß', '#f7f6f2'], ['Grau', '#9a9a9a'], ['Beige', '#d9c8a9'],
  ['Braun', '#7a5537'], ['Navy', '#1f2c4c'], ['Blau', '#3d6fb6'], ['Grün', '#4f7a4a'],
  ['Oliv', '#6b6b3a'], ['Rot', '#b33a3a'], ['Rosa', '#e3a5b5'], ['Gelb', '#e6c34a'],
  ['Orange', '#d9792f'], ['Lila', '#7a5a9a'], ['Bunt', 'multi'],
];
const PRIO = { 1: 'Hoch', 2: 'Mittel', 3: 'Niedrig' };

const TITLES = { schrank: 'Kleiderschrank', kalender: 'Kalender', outfits: 'Outfits', wunsch: 'Wunschliste', stats: 'Statistik' };
const SORTS = [['neu', 'Neueste'], ['oft', 'Oft getragen'], ['selten', 'Selten getragen'],
  ['lange', 'Lange nicht getragen'], ['waesche', 'Länger nicht gewaschen'], ['kosten', 'Kosten pro Tragen'], ['name', 'Name'], ['preis', 'Preis']];

const ICON = {
  hanger: '<svg viewBox="0 0 24 24"><path d="M12 8.5V7.6c1.2-.6 2-1.3 2-2.6a2 2 0 1 0-4 0"/><path d="M12 8.5 3.4 14.8c-.8.6-.4 1.7.6 1.7h16c1 0 1.4-1.1.6-1.7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>',
};

// ---------- Zustand ----------
const state = {
  items: [], wishlist: [], outfits: [], profile: [], days: [],
  tab: 'schrank',
  calMonth: null,
  filter: { q: '', cat: 'Alle', sort: 'neu' },
};

// ---------- Helfer ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysSince = (iso) => Math.round((new Date(today()) - new Date(iso)) / 864e5);
const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur = (n) => (n == null || n === '' || isNaN(n) ? '—' : eurFmt.format(n));
const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const parsePrice = (v) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const lastWorn = (x) => (x.wears && x.wears.length ? x.wears[x.wears.length - 1] : null);
const cpw = (it) => (it.price != null && it.wears?.length ? it.price / it.wears.length : null);
const relDays = (iso) => {
  if (!iso) return 'nie';
  const d = daysSince(iso);
  return d === 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
};

const photoUrls = new WeakMap();
function photoUrl(blob) {
  if (!blob) return '';
  let u = photoUrls.get(blob);
  if (!u) { u = URL.createObjectURL(blob); photoUrls.set(blob, u); }
  return u;
}
function swatch(name) {
  const c = COLORS.find((c) => c[0] === name);
  if (!c) return '';
  const bg = c[1] === 'multi' ? 'conic-gradient(#d33,#e93,#ec3,#4a4,#38c,#84c,#d33)' : c[1];
  return `<span class="dot" style="background:${bg}"></span>`;
}
function thumb(blob, cls = 'ph') {
  return `<div class="${cls}">${blob ? `<img src="${photoUrl(blob)}" alt="" loading="lazy">` : `<span class="ph-empty">${ICON.hanger}</span>`}</div>`;
}

// Foto verkleinern (max. 1100 px, JPEG), damit der Speicher nicht vollläuft
async function shrinkImage(file, max = 1100) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Bottom-Sheet ----------
const sheet = () => $('#sheet');
function openSheet(html, mount) {
  const d = sheet();
  $('#sheetBody').innerHTML = `<div class="grabber"></div>${html}`;
  if (!d.open) d.showModal();
  $('#sheetBody').scrollTop = 0;
  mount?.($('#sheetBody'));
}
function closeSheet() { if (sheet().open) sheet().close(); }

// ---------- Datenoperationen ----------
async function saveItem(it) {
  const i = state.items.findIndex((x) => x.id === it.id);
  if (i >= 0) state.items[i] = it; else state.items.push(it);
  await db.put('items', it);
}
async function saveOutfit(o) {
  const i = state.outfits.findIndex((x) => x.id === o.id);
  if (i >= 0) state.outfits[i] = o; else state.outfits.push(o);
  await db.put('outfits', o);
}
async function saveWish(w) {
  const i = state.wishlist.findIndex((x) => x.id === w.id);
  if (i >= 0) state.wishlist[i] = w; else state.wishlist.push(w);
  await db.put('wishlist', w);
}
async function deleteItem(id) {
  state.items = state.items.filter((x) => x.id !== id);
  await db.del('items', id);
  const touched = [];
  for (const o of state.outfits) {
    if (o.itemIds.includes(id)) { o.itemIds = o.itemIds.filter((x) => x !== id); touched.push(o); }
  }
  if (touched.length) await db.putMany('outfits', touched);
}
async function deleteOutfit(id) { state.outfits = state.outfits.filter((x) => x.id !== id); await db.del('outfits', id); }
async function deleteWish(id) { state.wishlist = state.wishlist.filter((x) => x.id !== id); await db.del('wishlist', id); }

function addWear(x, date) {
  x.wears = x.wears || [];
  if (!x.wears.includes(date)) { x.wears.push(date); x.wears.sort(); return true; }
  return false;
}
function removeWear(x, date) { x.wears = (x.wears || []).filter((d) => d !== date); }

// ---------- Rendering ----------
function render() {
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#title').textContent = TITLES[state.tab];
  $('#fab').hidden = state.tab === 'stats';
  const v = $('#view');
  ({ schrank: renderSchrank, kalender: renderKalender, outfits: renderOutfits, wunsch: renderWunsch, stats: renderStats })[state.tab](v);
}

// ===== Kleiderschrank =====
function renderSchrank(v) {
  const f = state.filter;
  if (!state.items.length) {
    v.innerHTML = empty('Dein Schrank ist noch leer', 'Tippe auf <b>+</b> und fotografiere dein erstes Teil.');
    return;
  }
  const counts = {};
  for (const it of state.items) counts[it.category] = (counts[it.category] || 0) + 1;
  const cats = CATEGORIES.filter((c) => counts[c]);
  if (f.cat !== 'Alle' && !counts[f.cat]) f.cat = 'Alle';

  v.innerHTML = `
    <div class="toolbar">
      <label class="search">${ICON.search}<input id="q" type="search" placeholder="Suchen: Name, Marke, Farbe …" value="${esc(f.q)}" autocomplete="off"></label>
      <select id="sort" class="select-sm" aria-label="Sortierung">${SORTS.map(([k, l]) => `<option value="${k}" ${k === f.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="chips scroll" id="cats">
      <button class="chip ${f.cat === 'Alle' ? 'on' : ''}" data-cat="Alle">Alle <span>${state.items.length}</span></button>
      ${cats.map((c) => `<button class="chip ${c === f.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)} <span>${counts[c]}</span></button>`).join('')}
    </div>
    <div id="grid" class="grid"></div>`;

  $('#q', v).addEventListener('input', (e) => { f.q = e.target.value; renderGrid(); });
  $('#sort', v).addEventListener('change', (e) => { f.sort = e.target.value; renderGrid(); });
  $('#cats', v).addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    f.cat = b.dataset.cat;
    $$('.chip', v).forEach((c) => c.classList.toggle('on', c === b));
    renderGrid();
  });
  renderGrid();
}

function filteredItems() {
  const { q, cat, sort } = state.filter;
  const needle = q.trim().toLowerCase();
  let list = state.items.filter((it) => (cat === 'Alle' || it.category === cat) &&
    (!needle || [it.name, it.brand, it.color, it.category, it.size, it.notes, ...(it.seasons || [])].join(' ').toLowerCase().includes(needle)));
  const n = (it) => it.wears?.length || 0;
  const cmp = {
    neu: (a, b) => b.createdAt - a.createdAt,
    oft: (a, b) => n(b) - n(a),
    selten: (a, b) => n(a) - n(b),
    lange: (a, b) => (lastWorn(a) || '').localeCompare(lastWorn(b) || ''),
    waesche: (a, b) => wearsSinceWash(b) - wearsSinceWash(a),
    kosten: (a, b) => (costPerWear(b) ?? -1) - (costPerWear(a) ?? -1),
    name: (a, b) => a.name.localeCompare(b.name, 'de'),
    preis: (a, b) => (b.price ?? -1) - (a.price ?? -1),
  }[sort];
  return list.sort(cmp);
}

function renderGrid() {
  const g = $('#grid'); if (!g) return;
  const list = filteredItems();
  if (!list.length) { g.innerHTML = `<p class="muted center pad">Nichts gefunden.</p>`; return; }
  const t = today();
  g.innerHTML = list.map((it) => `
    <button class="card" data-id="${it.id}">
      ${thumb(it.photo)}
      ${it.wears?.includes(t) ? `<span class="badge-today" title="Heute getragen">${ICON.check}</span>` : ''}
      <div class="meta">
        <div class="name">${esc(it.name)}</div>
        <div class="sub">${swatch(it.color)}<span>${esc(it.brand || it.category)}</span><span class="n">${state.filter.sort === 'kosten' ? eur(costPerWear(it)) : `${it.wears?.length || 0}×`}</span></div>
      </div>
    </button>`).join('');
  g.onclick = (e) => { const c = e.target.closest('[data-id]'); if (c) openItem(c.dataset.id); };
}

function openItem(id) {
  const it = state.items.find((x) => x.id === id); if (!it) return;
  const t = today();
  const wornToday = it.wears?.includes(t);
  const inOutfits = state.outfits.filter((o) => o.itemIds.includes(id));
  const recent = [...(it.wears || [])].reverse();
  const washedToday = it.washes?.includes(t);
  const recentWashes = [...(it.washes || [])].reverse();
  // Outfit-Fotos aus dem Kalender: alle Tage, an denen das Teil getragen wurde und es ein Foto gibt
  const dayShots = recent.map((d) => state.days.find((x) => x.id === d)).filter((x) => x?.photo);
  openSheet(`
    ${it.photo ? `<img class="hero" src="${photoUrl(it.photo)}" alt="">` : ''}
    <h2>${esc(it.name)}</h2>
    <div class="tags">
      <span class="tag">${esc(it.category)}</span>
      ${it.color ? `<span class="tag">${swatch(it.color)}${esc(it.color)}</span>` : ''}
      ${it.brand ? `<span class="tag">${esc(it.brand)}</span>` : ''}
      ${it.size ? `<span class="tag">Gr. ${esc(it.size)}</span>` : ''}
      ${styleTags(it)}${it.lengthStyle ? '<span class="tag soft">Länge = Stil</span>' : ''}
      ${(it.seasons || []).map((s) => `<span class="tag soft">${s}</span>`).join('')}
    </div>
    <div class="kpis">
      <div><b>${it.wears?.length || 0}×</b><span>getragen</span></div>
      <div><b>${relDays(lastWorn(it))}</b><span>zuletzt</span></div>
      <div><b>${eur(cpw(it))}</b><span>pro Tragen</span></div>
      <div><b>${it.washes?.length || 0}×</b><span>gewaschen</span></div>
      <div><b>${relDays(lastWash(it))}</b><span>letzte Wäsche</span></div>
      <div><b>${wearsSinceWash(it)}×</b><span>seit der Wäsche getragen</span></div>
    </div>
    <button class="btn ${wornToday ? 'ghost' : 'primary'} block" id="wearBtn">${wornToday ? 'Heute getragen ✓ (rückgängig)' : 'Heute getragen'}</button>
    <button class="btn ${washedToday ? 'ghost' : ''} block" id="washBtn">${washedToday ? 'Heute gewaschen ✓ (rückgängig)' : 'Heute gewaschen'}</button>
    ${adviceOutcome(it) === 'pending' ? '<button class="btn block rate-ask" id="rateFit">Wie sitzt es? Jetzt bewerten – damit der Berater dazulernt</button>' : ''}
    ${measureView(it)}
    ${Object.keys(it.measures?.values || {}).length ? `<details class="sect fitdet"><summary>Passform-Check & Puppe</summary><div id="fitHost"></div></details>` : ''}
    ${(it.fitpics || []).length ? `<h3>Fitpics</h3><div class="fitstrip">${it.fitpics.map((b, i) => `<a href="${photoUrl(b)}" target="_blank" data-fp="${i}"><img src="${photoUrl(b)}" alt="Fitpic ${i + 1}"></a>`).join('')}</div>` : ''}
    ${dayShots.length ? `<h3>Outfit-Fotos</h3><div class="fitstrip">${dayShots.map((x) => `<a href="#" data-day="${x.id}"><img src="${photoUrl(x.photo)}" alt="Outfit vom ${fmtDate(x.id)}"></a>`).join('')}</div>` : ''}
    <dl class="facts">
      <dt>Preis</dt><dd>${eur(it.price)}</dd>
      <dt>Gekauft</dt><dd>${fmtDate(it.purchaseDate)}</dd>
      ${modelLine(it.model) ? `<dt>Model</dt><dd>${esc(modelLine(it.model))}</dd>` : ''}
      ${it.advice?.recommended ? `<dt>Berater</dt><dd>${adviceLine(it)}</dd>` : ''}
      ${it.notes ? `<dt>Notizen</dt><dd class="pre">${esc(it.notes)}</dd>` : ''}
      ${inOutfits.length ? `<dt>Outfits</dt><dd>${inOutfits.map((o) => `<a href="#" data-outfit="${o.id}">${esc(o.name)}</a>`).join(', ')}</dd>` : ''}
    </dl>
    <details class="history">
      <summary>Tragen-Verlauf (${recent.length})</summary>
      <div class="row gap"><input type="date" id="pastDate" max="${t}"><button class="btn small" id="addPast">Nachtragen</button></div>
      <ul class="dates">${recent.map((d) => `<li><a href="#" data-day="${d}">${fmtDate(d)}</a> <button class="x" data-d="${d}" aria-label="Entfernen">×</button></li>`).join('') || '<li class="muted">Noch nie getragen</li>'}</ul>
    </details>
    <details class="history wash-history">
      <summary>Wasch-Verlauf (${recentWashes.length})</summary>
      <div class="row gap"><input type="date" id="pastWash" max="${t}"><button class="btn small" id="addWash">Nachtragen</button></div>
      <ul class="dates">${recentWashes.map((d) => `<li>${fmtDate(d)} <button class="x" data-w="${d}" aria-label="Entfernen">×</button></li>`).join('') || '<li class="muted">Noch nie gewaschen</li>'}</ul>
    </details>
    <div class="actions">
      <button class="btn danger-text" id="del">Löschen</button>
      <button class="btn" id="edit">Bearbeiten</button>
    </div>`, (el) => {
    $('#wearBtn', el).onclick = async () => {
      if (wornToday) removeWear(it, t); else addWear(it, t);
      await saveItem(it); render(); openItem(id);
    };
    $('#addPast', el).onclick = async () => {
      const d = $('#pastDate', el).value; if (!d) return;
      addWear(it, d); await saveItem(it); render(); openItem(id);
      $('.history', $('#sheetBody')).open = true;
    };
    $$('.dates .x[data-d]', el).forEach((b) => b.onclick = async () => {
      removeWear(it, b.dataset.d); await saveItem(it); render(); openItem(id);
      $('.history', $('#sheetBody')).open = true;
    });
    $$('[data-day]', el).forEach((a) => a.onclick = (e) => { e.preventDefault(); openDay(a.dataset.day); });
    $('#washBtn', el).onclick = async () => {
      if (washedToday) removeWash(it, t); else addWash(it, t);
      await saveItem(it); render(); openItem(id);
    };
    $('#addWash', el).onclick = async () => {
      const d = $('#pastWash', el).value; if (!d) return;
      addWash(it, d); await saveItem(it); render(); openItem(id);
      $('.wash-history', $('#sheetBody')).open = true;
    };
    $$('.dates .x[data-w]', el).forEach((b) => b.onclick = async () => {
      removeWash(it, b.dataset.w); await saveItem(it); render(); openItem(id);
      $('.wash-history', $('#sheetBody')).open = true;
    });
    $$('[data-outfit]', el).forEach((a) => a.onclick = (e) => { e.preventDefault(); openOutfit(a.dataset.outfit); });
    const fh = $('#fitHost', el);
    if (fh) fitBox(fh, { cat: it.category, title: it.name, options: [{ label: it.size, measures: withStyle(it.measures, it) }], color: colorHex(it.color), excludeId: it.id, back: () => openItem(id) });
    $('#edit', el).onclick = () => openItemForm(it);
    const ra = $('#rateFit', el); if (ra) ra.onclick = () => openItemForm(it, { focusFit: true });
    $('#del', el).onclick = async () => {
      if (!confirm(`„${it.name}“ wirklich löschen?`)) return;
      await deleteItem(id); closeSheet(); render(); toast('Gelöscht');
    };
  });
}

// Was der Berater beim Kauf empfohlen hat und ob er richtig lag
const OUTCOME_TEXT = { hit: '✓ lag richtig', miss: '✗ lag daneben', pending: 'noch nicht bewertet', null: 'nicht eindeutig' };
function adviceLine(it) {
  const a = it.advice;
  return `empfahl ${esc(a.recommended)}${a.confidence ? ` (Sicherheit ${esc(a.confidence)})` : ''}${a.alt ? `, Alternative ${esc(a.alt)}` : ''} · gekauft ${esc(a.bought || '?')} · ${OUTCOME_TEXT[adviceOutcome(it)]}`;
}

// ----- Maße & Passform -----
function measureView(it) {
  const m = it.measures || {};
  const keys = Object.keys(m.values || {}).filter((k) => MEASURES[k] && m.values[k] != null);
  if (!keys.length && !it.fit && !it.fitNote && !it.fitDetail) return '';
  const circ = m.widthMode === 'circ';
  return `
    <section class="panel flat measures">
      <h3>Maße & Passform ${keys.length ? `<span class="muted">· ${m.source === 'web' ? 'laut Webseite' : 'selbst gemessen'}${circ ? ', Weiten als Umfang' : ', flach liegend'}</span>` : ''}</h3>
      ${it.fit ? `<p class="fitline"><span class="fit f${FITS.indexOf(it.fit)}">${esc(it.fit)}</span>${it.fitNote ? ` ${esc(it.fitNote)}` : ''}</p>` : it.fitNote ? `<p class="small">${esc(it.fitNote)}</p>` : ''}
      ${it.fitDetail ? `<p class="small">Je Maß: ${esc(fitDetailText(it.fitDetail))}</p>` : ''}
      ${keys.length ? `<dl class="mtable">${keys.map((k) => {
        const v = m.values[k], d = MEASURES[k];
        const alt = d.w ? `<small>${circ ? `≈ ${fmtCm(v / 2)} flach` : `≈ ${fmtCm(v * 2)} Umfang`}</small>` : '';
        return `<dt>${d.l}</dt><dd>${fmtCm(v)} ${alt}</dd>`;
      }).join('')}</dl>` : ''}
    </section>`;
}

function measureFields(cat, m) {
  const vals = m.values || {};
  // aktuelle Kategorie zuerst, dazu alle schon befüllten Felder anderer Sätze
  const keys = [...new Set([...measureSet(cat), ...Object.keys(vals).filter((k) => vals[k] != null)])];
  return keys.map((k) => {
    const d = MEASURES[k];
    return `<label>${d.l}${d.w ? ' <i class="wtag">Weite</i>' : ''}<span class="unit"><input data-m="${k}" inputmode="decimal" value="${vals[k] != null ? String(vals[k]).replace('.', ',') : ''}" placeholder="${d.h ? esc(d.h) : 'cm'}"><em>cm</em></span></label>`;
  }).join('');
}

// Schnitt & Stretch (optional): Auswahl per Tippen, nochmal tippen hebt sie auf
const CUT_NAME = Object.fromEntries(CUTS);
const STRETCH_NAME = Object.fromEntries(STRETCHES.map(([k, l]) => [k, l]));
function styleFields(cut, stretch, shrink) {
  return `
    <fieldset><legend>Schnitt <span class="muted">(optional)</span></legend><div class="seg" id="cutSeg">
      ${CUTS.map(([k, l]) => `<button type="button" data-v="${k}" class="${k === cut ? 'on' : ''}">${l}</button>`).join('')}
    </div></fieldset>
    <fieldset><legend>Stretch <span class="muted">(optional)</span></legend><div class="seg" id="stretchSeg">
      ${STRETCHES.map(([k, l, h]) => `<button type="button" data-v="${k}" title="${esc(h)}" class="${k === stretch ? 'on' : ''}">${l}</button>`).join('')}
    </div></fieldset>
    <p class="muted small">Schnitt so, wie der Shop ihn nennt (Slim Fit, Oversized …) – dann heißt ein gewollt weites Teil nicht „zu weit“. Stretch: Webstoff ohne Elasthan = kein, ${esc(STRETCHES[1][2])} = leicht, ${esc(STRETCHES[2][2])} = stark. Nochmal tippen hebt die Auswahl auf.</p>
    <label class="check"><input type="checkbox" id="shrinkChk" ${shrink ? 'checked' : ''}> Baumwolle, nicht vorgewaschen (kann beim Waschen ~3 % in der Länge einlaufen)</label>`;
}
function bindToggleSeg(el, id, init) {
  let v = init || '';
  $$(`#${id} button`, el).forEach((b) => b.onclick = () => {
    v = v === b.dataset.v ? '' : b.dataset.v;
    $$(`#${id} button`, el).forEach((x) => x.classList.toggle('on', x.dataset.v === v));
  });
  return () => v || undefined;
}
const styleTags = (x) => `${x.cut && CUT_NAME[x.cut] ? `<span class="tag soft">${CUT_NAME[x.cut]}</span>` : ''}${x.stretch && STRETCH_NAME[x.stretch] ? `<span class="tag soft">Stretch: ${x.stretch}</span>` : ''}${x.shrink ? '<span class="tag soft">läuft evtl. ein</span>' : ''}`;
// Schnitt/Stretch an den Größenberater durchreichen (gespeichert am Teil, gebraucht in measures)
const withStyle = (measures, x) => ({ ...measures, cut: x.cut, stretch: x.stretch, shrink: !!x.shrink });

// „Wie sitzt es je Maß?“ – je wichtigem Maß eine Auswahl (leer = keine Angabe)
function fitDetailFields(cat, fd = {}) {
  return detailKeys(cat).map((k) => `<label>${MEASURES[k].l}<select data-fd="${k}"><option value="">–</option>${detailScale(k).map((l) => `<option ${fd?.[k] === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`).join('');
}
const fitDetailText = (fd) => Object.entries(fd || {}).filter(([k]) => MEASURES[k]).map(([k, v]) => `${MEASURES[k].s}: ${v}`).join(' · ');

function fitpicsField(list) {
  return `<div class="fitpics" id="fitpics">
    ${list.map((b, i) => `<div class="fp"><img src="${photoUrl(b)}" alt=""><button type="button" class="x" data-rm="${i}" aria-label="Entfernen">×</button></div>`).join('')}
    <label class="fp add">${ICON.camera}<span>Fitpic</span><input type="file" accept="image/*" multiple hidden id="fpInput"></label>
  </div>`;
}
function bindFitpics(el, list) {
  const rerender = () => { $('#fitpics', el).outerHTML = fitpicsField(list); bindFitpics(el, list); };
  $('#fpInput', el).onchange = async (e) => {
    for (const f of e.target.files) {
      try { list.push(await shrinkImage(f, 1400)); } catch { toast('Foto konnte nicht gelesen werden'); }
    }
    rerender();
  };
  $$('[data-rm]', el).forEach((b) => b.onclick = () => { list.splice(+b.dataset.rm, 1); rerender(); });
}

// ----- Passform-Berater -----
const body = () => state.profile.find((p) => p.id === 'body') || {};
const colorHex = (n) => { const c = COLORS.find((x) => x[0] === n); return c && c[1] !== 'multi' ? c[1] : null; };
const numStr = (v) => (v == null ? '' : Array.isArray(v) ? (v[0] === v[1] ? String(v[0]) : `${v[0]}–${v[1]}`) : String(v)).replace(/\./g, ',');

/** cfg: { cat, options: [{label, measures, type}], color, excludeId, back, onSelect } */
function fitBox(host, cfg) {
  const b = body();
  const results = cfg.options.map((o) => (o.type === 'body'
    ? analyzeBodyChart(cfg.cat, o.measures.values, b)
    : analyze(cfg.cat, o.measures, b, state.items, cfg.excludeId)));
  const multi = cfg.options.length > 1;
  // Empfehlung über alle Größen (fehlende Maße zählen ungünstig, Sicherheit mit Begründung)
  const rec = recommend(results, cfg.options.map((o) => o.label || '?'));
  const best = rec.index;
  let sel = best >= 0 ? best : 0;
  // Details (Maße, Puppe, 3D) bei Wünschen mit mehreren Größen zugeklappt, sonst offen; Zustand bleibt beim Größenwechsel
  let open = !multi;
  const paint = () => {
    const r = results[sel], o = cfg.options[sel];
    const missing = !r.hasBody && !r.nRefs;
    const svg = r.bodyChart ? '' : mannequinSVG(b, cfg.cat, o.measures, r, cfg.color);
    const verdict = `<div class="verdict lv${r.level}"><b>${multi ? `Größe ${esc(o.label || '?')}: ` : ''}${r.verdict}</b>${r.basis ? `<span>Basis: ${r.basis}</span>` : ''}</div>`;
    // Mehrere Größen: Empfehlung oben; ein einzelnes Teil: erst das Urteil, darunter wie sicher es ist
    const recoBox = best < 0 ? '' : `<div class="reco conf-${rec.confidence}">
        <div class="reco-head">${multi ? `<b>Empfehlung: Größe ${esc(rec.size)}</b>` : ''}<span class="conf">Sicherheit: ${rec.confidence}</span></div>
        <ul class="reco-why">${rec.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${rec.alt ? `<p class="reco-alt">Alternative: <b>${esc(rec.alt.reason)}</b></p>` : ''}
      </div>`;
    host.innerHTML = `
      ${multi ? recoBox : ''}
      ${multi ? `<div class="chips sizes">${cfg.options.map((op, i) => `<button type="button" class="chip ${i === sel ? 'on' : ''}" data-i="${i}"><span class="dot lv lv${results[i].level}"></span>${esc(op.label || '?')}${i === best ? ' ★' : ''}</button>`).join('')}</div>` : ''}
      ${verdict}
      ${multi ? '' : recoBox}
      ${missing ? `<p class="small hint">Mir fehlen Vergleichswerte: Trag deine <a href="#" data-body>Körpermaße</a> ein und/oder bewerte Teile im Schrank mit Maßen als „perfekt“.</p>` : ''}
      <details class="fitdetails" ${open ? 'open' : ''}><summary>Details: Maße${svg ? ', Puppe & 3D' : ''}</summary>
        ${r.sources?.length ? `<p class="small muted sources">Spielräume – ${r.sources.map(esc).join(' · ')}</p>` : ''}
        <div class="fitwrap ${svg ? '' : 'nosvg'}">
          ${svg}
          <ul class="checks">${r.checks.map((c) => `<li><span class="dot lv s${c.status ?? 'i'}"></span><div><b>${c.label}</b> <span class="muted">${r.bodyChart ? '' : fmtCm(c.value) + (MEASURES[c.k].w ? ' flach' : '')}</span><br><span class="small">${c.notes.map(esc).join(' · ') || '<span class="muted">kein Vergleichswert</span>'}</span></div></li>`).join('')}</ul>
        </div>
        ${svg ? '<button type="button" class="btn block btn-3d" data-3d>3D-Ansicht – drehen &amp; von allen Seiten ansehen</button>' : ''}
        ${svg ? `<p class="muted small">Schematische Puppe ${b.height ? 'mit deinen Maßen' : 'mit Standardmaßen – <a href="#" data-body>eigene Körpermaße eintragen</a>'}. Grün = passt · Gelb = knapp · Rot = passt nicht.${o.measures?.hemmable ? ' Länge so dargestellt, wie sie nach dem Kürzen sitzt.' : ''}${(() => { const est = estimatedMeasures(cfg.cat, o.measures); return est.length ? ` <b>Geschätzt</b> (nicht angegeben): ${est.join(', ')}.` : ''; })()}</p>` : ''}
      </details>`;
    $('.fitdetails', host).ontoggle = (e) => { open = e.target.open; };
    $$('[data-i]', host).forEach((x) => x.onclick = () => { sel = +x.dataset.i; cfg.onSelect?.(sel); paint(); });
    const b3 = $('[data-3d]', host);
    if (b3) b3.onclick = () => open3D({ cat: cfg.cat, measures: o.measures, result: r, color: cfg.color, title: `${cfg.title || ''}${multi ? ` · Größe ${o.label || '?'}` : ''}` });
    $$('[data-body]', host).forEach((x) => x.onclick = (e) => { e.preventDefault(); openBodyForm(cfg.back); });
  };
  cfg.onSelect?.(sel);
  paint();
  return rec;
}

function openBodyForm(back) {
  const b = body();
  openSheet(`
    <h2>Meine Körpermaße</h2>
    <div class="guide">
      <div class="guide-fig">${measureGuideSVG(b)}</div>
      <div class="guide-tip" id="tip"></div>
    </div>
    <form id="f" class="form">
      <div class="mgrid">${BODY_FIELDS.map(([k, l, h, u], i) => `<label data-k="${k}"><span class="lbl"><i class="num">${i + 1}</i>${l}</span><span class="unit"><input data-b="${k}" inputmode="decimal" value="${numStr(b[k])}" placeholder="${esc(h)}"><em>${u || 'cm'}</em></span></label>`).join('')}</div>
      <p class="muted small">Alles optional – je mehr, desto genauer Passform-Check, Puppe und Model-Vergleich. Tippe auf ein Feld, um zu sehen, wie man misst.</p>
      <fieldset><legend>Ich trage Sachen am liebsten</legend><div class="seg" id="pref">${PREFS.map(([k, l]) => `<button type="button" data-v="${k}" class="${(b.pref || 'normal') === k ? 'on' : ''}">${l}</button>`).join('')}</div></fieldset>
      <p class="muted small">Noch genauer: Bewerte Teile im Schrank mit „perfekt“ und trag ihre Maße ein. Dann vergleicht der Berater neue Teile direkt mit deiner Lieblings-Passform.</p>
      <div class="actions"><button type="button" class="btn" id="cancel">Abbrechen</button><button class="btn primary">Speichern</button></div>
    </form>`, (el) => {
    const show = (k) => {
      const h = BODY_HOWTO[k] || BODY_HOWTO._;
      const n = BODY_FIELDS.findIndex(([x]) => x === k) + 1;
      $('#tip', el).innerHTML = `<b>${n ? `<i class="num">${n}</i>` : ''}${h.t}</b><p>${h.d}</p>`;
      $$('.mg [data-g]', el).forEach((g) => g.classList.toggle('on', g.dataset.g === k));
      $('.mg', el).classList.toggle('focus', !!n);
      $$('label[data-k]', el).forEach((l) => l.classList.toggle('on', l.dataset.k === k));
    };
    show('_');
    $$('[data-b]', el).forEach((i) => { i.addEventListener('focus', () => show(i.dataset.b)); i.addEventListener('click', () => show(i.dataset.b)); });
    $$('.mg [data-g]', el).forEach((g) => g.addEventListener('click', () => { show(g.dataset.g); $(`[data-b=${g.dataset.g}]`, el).focus({ preventScroll: true }); }));
    let pref = b.pref || 'normal';
    $$('#pref button', el).forEach((x) => x.onclick = () => { pref = x.dataset.v; $$('#pref button', el).forEach((y) => y.classList.toggle('on', y === x)); });
    $('#cancel', el).onclick = () => (back ? back() : closeSheet());
    $('#f', el).onsubmit = async (e) => {
      e.preventDefault();
      const nb = { id: 'body', pref };
      $$('[data-b]', el).forEach((i) => { const n = parsePrice(i.value); if (n != null && n > 0) nb[i.dataset.b] = n; });
      state.profile = [...state.profile.filter((p) => p.id !== 'body'), nb];
      await db.put('profile', nb);
      toast('Körpermaße gespeichert');
      back ? back() : closeSheet();
    };
  });
}

// Größentabelle (Wunschliste): eine Zeile pro Größe
function chartEditor(cat, chart) {
  const rows = chart.rows?.length ? chart.rows : [{ size: '', values: {} }];
  const used = rows.flatMap((r) => Object.keys(r.values || {}));
  const keys = [...new Set([...measureSet(cat), ...used])].filter((k) => MEASURES[k]);
  return `<div class="chart-scroll"><table class="chart">
    <thead><tr><th>Größe</th>${keys.map((k) => `<th title="${MEASURES[k].l}">${MEASURES[k].s}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-row="${i}"><td><input data-size value="${esc(r.size)}" placeholder="M"></td>${keys.map((k) => `<td><input data-cm="${k}" inputmode="decimal" value="${numStr(r.values?.[k])}"></td>`).join('')}<td><button type="button" class="x" data-delrow="${i}" aria-label="Zeile entfernen">×</button></td></tr>`).join('')}</tbody>
  </table></div>`;
}
function readChart(el, type) {
  return $$('tr[data-row]', el).map((tr) => {
    const values = {};
    $$('[data-cm]', tr).forEach((i) => {
      const m = i.value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?$/);
      if (!m) return;
      const a = parsePrice(m[1]), b = m[2] ? parsePrice(m[2]) : a;
      if (!(a > 0)) return;
      values[i.dataset.cm] = type === 'body' ? [Math.min(a, b), Math.max(a, b)] : (a + b) / 2;
    });
    return { size: $('[data-size]', tr).value.trim(), values };
  });
}
const chartOptions = (w) => (w.chart?.rows || []).filter((r) => Object.keys(r.values || {}).length)
  .map((r) => ({ label: r.size, type: w.chart.type, measures: { widthMode: w.chart.widthMode, values: r.values, hemmable: !!w.chart.hemmable, cut: w.cut, stretch: w.stretch, shrink: !!w.shrink } }));

// ----- 3D-Ansicht -----
const HEAT_LEGEND = [['#d64541', 'zu eng / kurz'], ['#e89a3d', 'knapp'], ['#4caf6a', 'passt'], ['#7fb3e0', 'etwas weit / lang'], ['#3d6fb6', 'zu weit / lang'], ['#b9b3a8', 'keine Angabe']];
async function open3D({ cat, measures, result, color, title }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'v3d';
  dlg.innerHTML = `
    <div class="v3d-top">
      <div><b>${esc(title || '3D-Ansicht')}</b><br><span class="muted small">Ziehen = drehen · zwei Finger / Mausrad = zoomen</span></div>
      <button class="icon-btn v3d-x" data-close aria-label="Schließen">×</button>
    </div>
    <div class="v3d-stage"><p class="muted center pad">3D wird geladen …</p></div>
    <div class="v3d-bar">
      <div class="seg v3d-views"><button data-view="0">Vorne</button><button data-view="1.5708">Seite</button><button data-view="3.1416">Hinten</button></div>
      <div class="seg two-seg v3d-mode"><button data-mode="heat" class="on">Passform</button><button data-mode="color">Farbe</button></div>
    </div>
    <div class="v3d-legend">${HEAT_LEGEND.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
    <p class="muted small v3d-note">Stilisierte Hülle aus den Maßen – zeigt Abstände zum Körper, keinen echten Stofffall.${estimatedMeasures(cat, measures).length ? ` Geschätzt: ${estimatedMeasures(cat, measures).join(', ')}.` : ''}</p>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  let api = null;
  dlg.addEventListener('close', () => { api?.dispose(); dlg.remove(); });
  $('[data-close]', dlg).onclick = () => dlg.close();
  $$('[data-view]', dlg).forEach((b) => b.onclick = () => api?.setView(+b.dataset.view));
  $$('[data-mode]', dlg).forEach((b) => b.onclick = () => {
    $$('[data-mode]', dlg).forEach((x) => x.classList.toggle('on', x === b));
    $('.v3d-legend', dlg).style.visibility = b.dataset.mode === 'heat' ? 'visible' : 'hidden';
    api?.setMode(b.dataset.mode);
  });
  const stage = $('.v3d-stage', dlg);
  try {
    const mod = await import('./view3d.js');
    stage.innerHTML = '';
    api = mod.mount(stage, { body: body(), cat, measures, result, color });
  } catch (e) {
    console.error(e);
    stage.innerHTML = `<p class="center pad">3D konnte nicht geladen werden.<br><span class="muted small">${esc(e.message || e)}</span></p>`;
  }
}

// ----- Model im Shop -----
function modelLine(m) {
  if (!m) return '';
  const parts = [m.height && `${numStr(m.height)} cm`, m.weight && `${numStr(m.weight)} kg`, m.chest && `Brust ${numStr(m.chest)}`, m.waist && `Taille ${numStr(m.waist)}`, m.hip && `Hüfte ${numStr(m.hip)}`].filter(Boolean);
  return [parts.join(' / '), m.size && `trägt ${m.size}`].filter(Boolean).join(', ');
}
function readModel(el) {
  const m = {};
  $$('[data-model]', el).forEach((i) => {
    const k = i.dataset.model, v = i.value.trim();
    if (!v) return;
    if (k === 'size') m.size = v; else { const n = parsePrice(v); if (n > 0) m[k] = n; }
  });
  return Object.keys(m).length ? m : null;
}
function modelBlock(r) {
  if (!r) return '';
  const b = body();
  const need = !b.height || !b.weight;
  return `<div class="modelcmp">
    <h3>Vergleich mit dem Model <span class="muted">· ${esc(r.who)}</span></h3>
    ${r.suggestion ? (r.rough
      ? `<p class="small muted">${esc(r.suggestion)}.</p>`
      : `<p class="verdict-mini"><b>${esc(r.suggestion)}</b><br><span class="muted small">Schätzung aus den Maßen des Models – die Größentabelle und deine perfekt sitzenden Teile sind genauer</span></p>`) : ''}
    <ul class="checks">${r.notes.map((n) => `<li><span class="dot lv s${n.s}"></span><div class="small">${esc(n.t)}</div></li>`).join('')}</ul>
    ${need ? `<p class="muted small">Für den Vergleich brauche ich deine Größe und dein Gewicht (besser noch Brust/Taille/Hüfte): <a href="#" data-body>Körpermaße eintragen</a>.</p>` : ''}
  </div>`;
}
function bindBodyLinks(host, back) {
  $$('[data-body]', host).forEach((x) => x.onclick = (e) => { e.preventDefault(); openBodyForm(back); });
}

function photoField(blob, hint = 'am besten flach liegend, heller Untergrund') {
  return `
    <div class="photo-field">
      <label class="photo-drop" id="photoDrop">
        ${blob ? `<img src="${photoUrl(blob)}" alt="">` : `<span>${ICON.camera}<br>Foto aufnehmen oder wählen<br><small>${hint}</small></span>`}
        <input type="file" accept="image/*" id="photoInput" hidden>
      </label>
      ${blob ? '<button type="button" class="btn small ghost" id="photoRemove">Foto entfernen</button>' : ''}
    </div>`;
}
function bindPhoto(el, get, set, hint) {
  const rerender = () => {
    $('.photo-field', el).outerHTML = photoField(get(), hint);
    bindPhoto(el, get, set, hint);
  };
  $('#photoInput', el).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $('#photoDrop', el).classList.add('loading');
    try { set(await shrinkImage(f)); } catch { toast('Foto konnte nicht gelesen werden'); }
    rerender();
  };
  const rm = $('#photoRemove', el);
  if (rm) rm.onclick = () => { set(null); rerender(); };
}

function openItemForm(existing, opts = {}) {
  const it = existing ? { ...existing } : { category: CATEGORIES[0], seasons: [], ...(opts.prefill || {}) };
  let photo = it.photo || null;
  const fitpics = [...(it.fitpics || [])];
  const m0 = it.measures || {};
  openSheet(`
    <h2>${existing ? 'Teil bearbeiten' : 'Neues Teil'}</h2>
    <form id="f" class="form">
      ${photoField(photo)}
      <label>Name<input name="name" required value="${esc(it.name)}" placeholder="z. B. Weißes Oxford-Hemd"></label>
      <label>Kategorie<select name="category">${CATEGORIES.map((c) => `<option ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <fieldset><legend>Farbe</legend><div class="swatches">
        ${COLORS.map(([n]) => `<button type="button" class="sw ${n === it.color ? 'on' : ''}" data-color="${n}" title="${n}" aria-label="${n}">${swatch(n)}</button>`).join('')}
      </div></fieldset>
      <div class="two">
        <label>Marke<input name="brand" value="${esc(it.brand)}" placeholder="optional"></label>
        <label>Größe<input name="size" value="${esc(it.size)}" placeholder="z. B. M / 32"></label>
      </div>
      <fieldset><legend>Saison</legend><div class="chips">
        ${SEASONS.map((s) => `<button type="button" class="chip ${(it.seasons || []).includes(s) ? 'on' : ''}" data-season="${s}">${s}</button>`).join('')}
      </div></fieldset>
      <div class="two">
        <label>Preis (€)<input name="price" inputmode="decimal" value="${it.price ?? ''}" placeholder="0,00"></label>
        <label>Gekauft am<input name="purchaseDate" type="date" value="${it.purchaseDate || ''}"></label>
      </div>
      <label>Notizen<textarea name="notes" rows="3" placeholder="Material, Pflege, Kombi-Ideen …">${esc(it.notes)}</textarea></label>

      <details class="sect" ${Object.keys(m0.values || {}).length || it.fit || opts.focusFit ? 'open' : ''}>
        <summary>Maße & Passform</summary>
        <fieldset><legend>Quelle</legend><div class="seg two-seg" id="mSource">
          <button type="button" data-v="self" class="${m0.source !== 'web' ? 'on' : ''}">Selbst gemessen</button>
          <button type="button" data-v="web" class="${m0.source === 'web' ? 'on' : ''}">Webseite</button>
        </div></fieldset>
        <fieldset><legend>Weiten angegeben als</legend><div class="seg two-seg" id="mMode">
          <button type="button" data-v="flat" class="${m0.widthMode !== 'circ' ? 'on' : ''}">Flach (halbe Weite)</button>
          <button type="button" data-v="circ" class="${m0.widthMode === 'circ' ? 'on' : ''}">Umfang</button>
        </div></fieldset>
        <p class="muted small">Flach messen: Teil glatt hinlegen, quer von Kante zu Kante. Webseiten geben Brust/Bund oft als Umfang an – dann „Umfang“ wählen.</p>
        <div class="mgrid" id="mFields">${measureFields(it.category, m0)}</div>
        ${styleFields(it.cut, it.stretch, it.shrink)}
        <label class="check"><input type="checkbox" id="lenStyle" ${it.lengthStyle ? 'checked' : ''}> Längen sind Stil, nicht Maßstab (absichtlich kurz/lang geschnitten) – Länge und Ärmel dieses Teils dienen nicht als Vergleich</label>
        <fieldset id="fitAsk"><legend>Wie sitzt es?</legend><div class="seg fit-seg" id="fitSeg">
          ${FITS.map((f) => `<button type="button" data-v="${f}" class="${f === it.fit ? 'on' : ''}">${f}</button>`).join('')}
        </div></fieldset>
        <fieldset><legend>Wie sitzt es je Maß? <span class="muted">(optional – macht den Berater genauer)</span></legend>
          <div class="mgrid" id="fdFields">${fitDetailFields(it.category, it.fitDetail)}</div>
        </fieldset>
        <label>Passform-Notiz<input name="fitNote" value="${esc(it.fitNote)}" placeholder="z. B. Ärmel 2 cm zu lang, Schulter perfekt"></label>
        <fieldset><legend>Fitpics (angezogen)</legend>${fitpicsField(fitpics)}</fieldset>
      </details>

      <div class="actions">
        <button type="button" class="btn" id="cancel">Abbrechen</button>
        <button class="btn primary">Speichern</button>
      </div>
      ${!existing && !opts.fromWishId ? '<button class="btn block" id="saveNext">Speichern &amp; nächstes Teil</button>' : ''}
    </form>`, (el) => {
    bindPhoto(el, () => photo, (b) => { photo = b; });
    bindFitpics(el, fitpics);
    const segVal = (id, init) => {
      let v = init;
      $$(`#${id} button`, el).forEach((b) => b.onclick = () => {
        v = id === 'fitSeg' && v === b.dataset.v ? '' : b.dataset.v;
        $$(`#${id} button`, el).forEach((x) => x.classList.toggle('on', x.dataset.v === v));
      });
      return () => v;
    };
    const getSource = segVal('mSource', m0.source === 'web' ? 'web' : 'self');
    const getMode = segVal('mMode', m0.widthMode === 'circ' ? 'circ' : 'flat');
    const getFit = segVal('fitSeg', it.fit || '');
    const getCut = bindToggleSeg(el, 'cutSeg', it.cut);
    const getStretch = bindToggleSeg(el, 'stretchSeg', it.stretch);
    const readMeasures = () => {
      const values = {};
      $$('[data-m]', el).forEach((i) => { const n = parsePrice(i.value); if (n != null && n > 0) values[i.dataset.m] = n; });
      return values;
    };
    const readFitDetail = () => cleanFitDetail(Object.fromEntries($$('[data-fd]', el).map((s) => [s.dataset.fd, s.value])));
    $('[name=category]', el).onchange = (e) => {
      $('#mFields', el).innerHTML = measureFields(e.target.value, { values: readMeasures() });
      $('#fdFields', el).innerHTML = fitDetailFields(e.target.value, readFitDetail());
    };
    // „Wie sitzt es?“ direkt anspringen (z. B. nach einem Kauf aus der Teil-Ansicht)
    if (opts.focusFit) { $('details.sect', el).open = true; setTimeout(() => $('#fitAsk', el)?.scrollIntoView({ block: 'center' }), 50); }
    let color = it.color || '';
    $$('.sw', el).forEach((b) => b.onclick = () => {
      color = color === b.dataset.color ? '' : b.dataset.color;
      $$('.sw', el).forEach((x) => x.classList.toggle('on', x.dataset.color === color));
    });
    $$('[data-season]', el).forEach((b) => b.onclick = () => b.classList.toggle('on'));
    $('#cancel', el).onclick = () => (existing ? openItem(existing.id) : closeSheet());
    $('#f', el).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const item = {
        ...it,
        id: it.id || uid(),
        createdAt: it.createdAt || Date.now(),
        wears: it.wears || [],
        name: fd.get('name').trim(),
        category: fd.get('category'),
        color,
        brand: fd.get('brand').trim(),
        size: fd.get('size').trim(),
        seasons: $$('[data-season].on', el).map((b) => b.dataset.season),
        price: parsePrice(fd.get('price')),
        purchaseDate: fd.get('purchaseDate') || '',
        notes: fd.get('notes').trim(),
        photo,
        fitpics,
        measures: { source: getSource(), widthMode: getMode(), values: readMeasures() },
        cut: getCut(),
        stretch: getStretch(),
        shrink: $('#shrinkChk', el).checked || undefined,
        lengthStyle: $('#lenStyle', el).checked || undefined,
        fit: getFit(),
        fitDetail: readFitDetail(),
        fitNote: fd.get('fitNote').trim(),
      };
      await saveItem(item);
      // Gleich das nächste Teil: Kategorie bleibt, weil man meist mehrere derselben Art einträgt
      if (e.submitter?.id === 'saveNext') {
        toast(`„${item.name}“ gespeichert`);
        render();
        openItemForm(null, { prefill: { category: item.category } });
        return;
      }
      if (opts.fromWishId) { await deleteWish(opts.fromWishId); toast('In den Schrank verschoben'); }
      else toast('Gespeichert');
      render();
      openItem(item.id);
    };
  });
}

// ----- Teile auswählen (Outfit-Formular und Kalender): Suche, Kategorie-Chips, Raster zum Antippen -----
function itemPickerHtml() {
  const cats = CATEGORIES.filter((c) => state.items.some((it) => it.category === c));
  return `
    <input id="pq" type="search" placeholder="Teil suchen …" autocomplete="off">
    <div class="chips scroll" id="pcats"><button type="button" class="chip on" data-cat="Alle">Alle</button>${cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="grid picker" id="picker"></div>`;
}
/** selected: Set von Teile-IDs, wird direkt geändert. Gibt die Funktion zum Neuzeichnen zurück. */
function bindItemPicker(el, selected, onChange) {
  let cat = 'Alle', q = '';
  const paint = () => {
    const needle = q.trim().toLowerCase();
    const list = state.items.filter((it) => (cat === 'Alle' || it.category === cat) &&
      (!needle || [it.name, it.brand, it.color, it.category].join(' ').toLowerCase().includes(needle)));
    $('#picker', el).innerHTML = list.map((it) => `
      <button type="button" class="card pick ${selected.has(it.id) ? 'on' : ''}" data-id="${it.id}">
        ${thumb(it.photo)}<span class="tick">${ICON.check}</span>
        <div class="meta"><div class="name">${esc(it.name)}</div></div>
      </button>`).join('') || `<p class="muted small">${state.items.length ? 'Nichts gefunden.' : 'Noch keine Teile im Schrank.'}</p>`;
  };
  paint();
  $('#picker', el).onclick = (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    selected.has(b.dataset.id) ? selected.delete(b.dataset.id) : selected.add(b.dataset.id);
    b.classList.toggle('on');
    onChange();
  };
  $('#pcats', el).onclick = (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    cat = b.dataset.cat;
    $$('#pcats .chip', el).forEach((c) => c.classList.toggle('on', c === b));
    paint();
  };
  const pq = $('#pq', el);
  pq.oninput = () => { q = pq.value; paint(); };
  pq.onkeydown = (e) => { if (e.key === 'Enter') e.preventDefault(); }; // Enter soll nicht das Formular speichern
  return paint;
}

// ===== Kalender =====
const longDate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function renderKalender(v) {
  const t = today(), thisMonth = t.slice(0, 7);
  const ym = state.calMonth ??= thisMonth;
  const [y, m] = ym.split('-').map(Number);
  const title = new Date(y, m - 1, 1, 12).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const photos = new Map(state.days.filter((d) => d.photo).map((d) => [d.id, d.photo]));
  const perDay = {};
  for (const it of state.items) for (const d of it.wears || []) perDay[d] = (perDay[d] || 0) + 1;
  const cells = monthGrid(ym);
  const logged = cells.filter((d) => d && (perDay[d] || photos.has(d))).length;
  v.innerHTML = `
    <div class="cal-nav">
      <button class="icon-btn" id="calPrev" aria-label="Voriger Monat">‹</button>
      <div class="cal-title"><b>${title}</b><span class="muted small">${logged === 1 ? '1 Tag' : `${logged} Tage`} eingetragen</span></div>
      <button class="icon-btn" id="calNext" aria-label="Nächster Monat" ${ym >= thisMonth ? 'disabled' : ''}>›</button>
    </div>
    <div class="cal-week">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="cal">${cells.map((d) => {
      if (!d) return '<span></span>';
      const n = perDay[d] || 0, photo = photos.get(d);
      return `<button class="cal-day ${d === t ? 'today' : ''} ${n && !photo ? 'worn' : ''}" data-day="${d}" ${d > t ? 'disabled' : ''} aria-label="${longDate(d)}${n ? `, ${n} Teile` : ''}">
        ${photo ? `<img src="${photoUrl(photo)}" alt="" loading="lazy">` : ''}
        <b>${Number(d.slice(8))}</b>${n ? `<i>${n}</i>` : ''}
      </button>`;
    }).join('')}</div>
    <p class="muted small center pad">Tippe auf einen Tag: Outfit-Foto hochladen und getragene Teile auswählen.</p>`;
  $('#calPrev', v).onclick = () => { state.calMonth = shiftMonth(ym, -1); render(); };
  $('#calNext', v).onclick = () => { state.calMonth = shiftMonth(ym, 1); render(); };
  $('.cal', v).onclick = (e) => { const b = e.target.closest('[data-day]'); if (b) openDay(b.dataset.day); };
}

function openDay(date) {
  const day = state.days.find((d) => d.id === date);
  const its = wornOn(state.items, date);
  if (!day?.photo && !its.length) { openDayForm(date); return; }
  openSheet(`
    ${day?.photo ? `<img class="hero" src="${photoUrl(day.photo)}" alt="Outfit-Foto">` : ''}
    <h2>${longDate(date)}</h2>
    <h3>Getragen <span class="muted">· ${its.length} ${its.length === 1 ? 'Teil' : 'Teile'}</span></h3>
    ${its.length ? `<div class="grid mini">${its.map((it) => `<button class="card" data-item="${it.id}">${thumb(it.photo)}<div class="meta"><div class="name">${esc(it.name)}</div></div></button>`).join('')}</div>` : '<p class="muted small">Noch keine Teile ausgewählt.</p>'}
    <div class="actions">
      <button class="btn danger-text" id="del">Löschen</button>
      <button class="btn" id="edit">Bearbeiten</button>
    </div>`, (el) => {
    $$('[data-item]', el).forEach((b) => b.onclick = () => openItem(b.dataset.item));
    $('#edit', el).onclick = () => openDayForm(date);
    $('#del', el).onclick = async () => {
      if (!confirm(`Eintrag vom ${fmtDate(date)} löschen?\n\nDas Foto wird entfernt, und die Teile gelten an diesem Tag nicht mehr als getragen.`)) return;
      await saveDay(date, null, []);
      closeSheet(); render(); toast('Gelöscht');
    };
  });
}

// Tag speichern: Getragen steht an den Teilen, der Tag-Eintrag hält nur das Foto
async function saveDay(date, photo, ids) {
  const changed = setWornOn(state.items, date, ids);
  if (changed.length) await db.putMany('items', changed);
  state.days = state.days.filter((d) => d.id !== date);
  if (photo) {
    const d = { id: date, photo };
    state.days.push(d);
    await db.put('days', d);
  } else await db.del('days', date);
}

function openDayForm(date) {
  const day = state.days.find((d) => d.id === date);
  const hadEntry = !!day?.photo || wornOn(state.items, date).length > 0;
  let photo = day?.photo || null;
  const selected = new Set(wornOn(state.items, date).map((it) => it.id));
  const hint = 'dein Outfit an diesem Tag';
  openSheet(`
    <h2>${longDate(date)}</h2>
    <form id="f" class="form">
      ${photoField(photo, hint)}
      <fieldset><legend>Getragene Teile <span class="muted" id="selCount"></span></legend>
        <div class="sel-strip" id="selStrip"></div>
        ${itemPickerHtml()}
      </fieldset>
      <div class="actions sticky">
        <button type="button" class="btn" id="cancel">Abbrechen</button>
        <button class="btn primary">Speichern</button>
      </div>
    </form>`, (el) => {
    bindPhoto(el, () => photo, (b) => { photo = b; }, hint);
    const paintStrip = () => {
      const its = state.items.filter((it) => selected.has(it.id));
      $('#selCount', el).textContent = its.length ? `· ${its.length} ausgewählt` : '';
      $('#selStrip', el).innerHTML = its.map((it) => `<button type="button" data-rm="${it.id}" aria-label="${esc(it.name)} entfernen" title="${esc(it.name)}">${thumb(it.photo, 'ph')}<span>×</span></button>`).join('');
    };
    const paintPicker = bindItemPicker(el, selected, paintStrip);
    paintStrip();
    // Antippen in der Leiste wählt ab
    $('#selStrip', el).onclick = (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      selected.delete(b.dataset.rm);
      paintStrip(); paintPicker();
    };
    $('#cancel', el).onclick = () => (hadEntry ? openDay(date) : closeSheet());
    $('#f', el).onsubmit = async (e) => {
      e.preventDefault();
      await saveDay(date, photo, [...selected]);
      render();
      if (photo || selected.size) { openDay(date); toast('Gespeichert'); } else { closeSheet(); toast('Eintrag entfernt'); }
    };
  });
}

// ===== Outfits =====
function collage(o, cls = 'collage') {
  const its = o.itemIds.map((id) => state.items.find((x) => x.id === id)).filter(Boolean);
  const shown = its.slice(0, 4);
  return `<div class="${cls} n${Math.max(1, shown.length)}">${shown.map((it) => thumb(it.photo, 'cell')).join('') || thumb(null, 'cell')}</div>`;
}

function renderOutfits(v) {
  if (!state.outfits.length) {
    v.innerHTML = empty('Noch keine Outfits',
      state.items.length ? 'Tippe auf <b>+</b> und kombiniere Teile aus deinem Schrank.' : 'Leg zuerst ein paar Teile im Kleiderschrank an.');
    return;
  }
  const t = today();
  const list = [...state.outfits].sort((a, b) => b.createdAt - a.createdAt);
  v.innerHTML = `<div class="grid outfits">${list.map((o) => `
    <button class="card" data-id="${o.id}">
      ${collage(o)}
      ${o.wears?.includes(t) ? `<span class="badge-today">${ICON.check}</span>` : ''}
      <div class="meta"><div class="name">${esc(o.name)}</div>
      <div class="sub"><span>${o.itemIds.length} Teile</span><span class="n">${o.wears?.length || 0}×</span></div></div>
    </button>`).join('')}</div>`;
  $('.grid', v).onclick = (e) => { const c = e.target.closest('[data-id]'); if (c) openOutfit(c.dataset.id); };
}

function openOutfit(id) {
  const o = state.outfits.find((x) => x.id === id); if (!o) return;
  const t = today();
  const wornToday = o.wears?.includes(t);
  const its = o.itemIds.map((i) => state.items.find((x) => x.id === i)).filter(Boolean);
  const value = its.reduce((s, it) => s + (it.price || 0), 0);
  openSheet(`
    ${collage(o, 'collage big')}
    <h2>${esc(o.name)}</h2>
    <div class="kpis">
      <div><b>${o.wears?.length || 0}×</b><span>getragen</span></div>
      <div><b>${relDays(lastWorn(o))}</b><span>zuletzt</span></div>
      <div><b>${eur(value || null)}</b><span>Wert</span></div>
    </div>
    <button class="btn ${wornToday ? 'ghost' : 'primary'} block" id="wearBtn">${wornToday ? 'Heute getragen ✓ (rückgängig)' : 'Heute getragen'}</button>
    ${o.notes ? `<p class="pre">${esc(o.notes)}</p>` : ''}
    <h3>Teile</h3>
    <div class="grid mini">${its.map((it) => `<button class="card" data-item="${it.id}">${thumb(it.photo)}<div class="meta"><div class="name">${esc(it.name)}</div></div></button>`).join('')}</div>
    <div class="actions">
      <button class="btn danger-text" id="del">Löschen</button>
      <button class="btn" id="edit">Bearbeiten</button>
    </div>`, (el) => {
    $('#wearBtn', el).onclick = async () => {
      const changed = [];
      for (const it of its) {
        if (wornToday) { removeWear(it, t); changed.push(it); } else if (addWear(it, t)) changed.push(it);
      }
      if (wornToday) removeWear(o, t); else addWear(o, t);
      await saveOutfit(o);
      if (changed.length) await db.putMany('items', changed);
      render(); openOutfit(id);
      if (!wornToday) toast('Outfit + alle Teile als getragen markiert');
    };
    $$('[data-item]', el).forEach((b) => b.onclick = () => openItem(b.dataset.item));
    $('#edit', el).onclick = () => openOutfitForm(o);
    $('#del', el).onclick = async () => {
      if (!confirm(`Outfit „${o.name}“ löschen? (Die Teile bleiben erhalten.)`)) return;
      await deleteOutfit(id); closeSheet(); render(); toast('Gelöscht');
    };
  });
}

function openOutfitForm(existing) {
  if (!state.items.length) { toast('Leg zuerst Teile im Kleiderschrank an'); return; }
  const o = existing ? { ...existing } : { itemIds: [] };
  const selected = new Set(o.itemIds);
  openSheet(`
    <h2>${existing ? 'Outfit bearbeiten' : 'Neues Outfit'}</h2>
    <form id="f" class="form">
      <label>Name<input name="name" required value="${esc(o.name)}" placeholder="z. B. Büro Herbst"></label>
      <label>Notizen<textarea name="notes" rows="2" placeholder="Anlass, Wetter …">${esc(o.notes)}</textarea></label>
      <fieldset><legend>Teile auswählen <span class="muted" id="selCount"></span></legend>
        ${itemPickerHtml()}
      </fieldset>
      <div class="actions sticky">
        <button type="button" class="btn" id="cancel">Abbrechen</button>
        <button class="btn primary">Speichern</button>
      </div>
    </form>`, (el) => {
    const paintCount = () => { $('#selCount', el).textContent = selected.size ? `· ${selected.size} ausgewählt` : ''; };
    bindItemPicker(el, selected, paintCount);
    paintCount();
    $('#cancel', el).onclick = () => (existing ? openOutfit(existing.id) : closeSheet());
    $('#f', el).onsubmit = async (e) => {
      e.preventDefault();
      if (!selected.size) { toast('Wähle mindestens ein Teil aus'); return; }
      const fd = new FormData(e.target);
      const outfit = {
        ...o,
        id: o.id || uid(),
        createdAt: o.createdAt || Date.now(),
        wears: o.wears || [],
        name: fd.get('name').trim(),
        notes: fd.get('notes').trim(),
        itemIds: [...selected],
      };
      await saveOutfit(outfit);
      toast('Gespeichert'); render(); openOutfit(outfit.id);
    };
  });
}

// ===== Wunschliste =====
function renderWunsch(v) {
  if (!state.wishlist.length) {
    v.innerHTML = empty('Wunschliste ist leer', 'Sammle hier, was du dir kaufen möchtest – mit Link, Preis und Priorität.');
    return;
  }
  const list = [...state.wishlist].sort((a, b) => a.priority - b.priority || b.createdAt - a.createdAt);
  const total = list.reduce((s, w) => s + (w.price || 0), 0);
  v.innerHTML = `
    <div class="summary"><span>${list.length} Wünsche</span><span>Summe <b>${eur(total)}</b></span></div>
    <div class="list">${list.map((w) => `
      <button class="row-item" data-id="${w.id}">
        ${thumb(w.photo, 'ph sm')}
        <div class="grow"><div class="name">${esc(w.name)}</div>
          <div class="sub">${[w.category && esc(w.category), w.price != null && eur(w.price)].filter(Boolean).join(' · ')}</div></div>
        <span class="prio p${w.priority}">${PRIO[w.priority]}</span>
      </button>`).join('')}</div>`;
  $('.list', v).onclick = (e) => { const c = e.target.closest('[data-id]'); if (c) openWish(c.dataset.id); };
}

function safeUrl(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}

function openWish(id) {
  const w = state.wishlist.find((x) => x.id === id); if (!w) return;
  const url = safeUrl(w.url);
  const opts = chartOptions(w);
  let selSize = 0;
  openSheet(`
    ${w.photo ? `<img class="hero" src="${photoUrl(w.photo)}" alt="">` : ''}
    <h2>${esc(w.name)}</h2>
    <div class="tags">
      <span class="prio p${w.priority}">Priorität: ${PRIO[w.priority]}</span>
      ${w.category ? `<span class="tag">${esc(w.category)}</span>` : ''}
      <span class="tag">${eur(w.price)}</span>
      ${styleTags(w)}
    </div>
    ${w.notes ? `<p class="pre">${esc(w.notes)}</p>` : ''}
    <section class="panel flat fitbox">
      <h3>Passt das?</h3>
      ${opts.length ? '<div id="fitHost"></div>' : `<p class="small">Trag unter <b>Bearbeiten → Größentabelle</b> die Maße aus der Größentabelle des Shops ein – dann sage ich dir, welche Größe passt, und zeige sie an der Puppe.</p>`}
      <div id="modelHost"></div>
    </section>
    ${url ? `<a class="btn block" href="${esc(url)}" target="_blank" rel="noopener">${ICON.link} Zum Shop</a>` : ''}
    <button class="btn primary block" id="bought">${opts.length ? `Gekauft in Größe ${esc(opts[0].label || '?')}` : 'Gekauft'} → in den Schrank</button>
    ${opts.length > 1 ? '<p class="muted small center">Größe oben antippen, um eine andere zu wählen.</p>' : ''}
    <p class="muted small">Hinzugefügt ${relDays(new Date(w.createdAt).toISOString().slice(0, 10))}</p>
    <div class="actions">
      <button class="btn danger-text" id="del">Löschen</button>
      <button class="btn" id="edit">Bearbeiten</button>
    </div>`, (el) => {
    const fh = $('#fitHost', el);
    const mh = $('#modelHost', el);
    const mChart = { type: w.chart?.type, widthMode: w.chart?.widthMode, rows: opts.map((o) => ({ size: o.label, values: o.measures.values })) };
    const paintModel = () => { mh.innerHTML = modelBlock(analyzeModel(w.model, body(), mChart, selSize), () => openWish(id)); bindBodyLinks(mh, () => openWish(id)); };
    const boughtBtn = $('#bought', el);
    const onSelect = (i) => {
      selSize = i;
      if (opts[i]) boughtBtn.textContent = `Gekauft in Größe ${opts[i].label || '?'} → in den Schrank`;
      if (mh) paintModel();
    };
    // Empfehlung merken, damit sie beim Kauf gespeichert wird (für die Trefferquote)
    const rec = fh ? fitBox(fh, { cat: w.category || CATEGORIES[0], title: w.name, options: opts, back: () => openWish(id), onSelect }) : null;
    if (!fh) paintModel();
    boughtBtn.onclick = () => {
      const o = opts[selSize];
      openItemForm(null, {
        fromWishId: w.id,
        prefill: {
          name: w.name, category: w.category || CATEGORIES[0], price: w.price,
          photo: w.photo, notes: w.notes, purchaseDate: today(),
          ...(o ? { size: o.label } : {}),
          // Maße der gekauften Größe aus der Tabelle (bei Körpermaß-Tabellen gibt es keine Teilemaße)
          ...(o && o.type !== 'body' ? { measures: { source: 'web', widthMode: o.measures.widthMode, values: { ...o.measures.values } } } : {}),
          ...(w.model ? { model: w.model } : {}),
          cut: w.cut, stretch: w.stretch, shrink: w.shrink,
          ...(rec && o ? { advice: adviceFor(rec, o.label, today()) } : {}),
        },
      });
    };
    $('#edit', el).onclick = () => openWishForm(w);
    $('#del', el).onclick = async () => {
      if (!confirm(`„${w.name}“ von der Wunschliste löschen?`)) return;
      await deleteWish(id); closeSheet(); render(); toast('Gelöscht');
    };
  });
}

function openWishForm(existing, opts = {}) {
  const w = existing ? { ...existing } : { priority: 2, ...(opts.prefill || {}) };
  let photo = w.photo || null;
  const chart = { type: 'garment', widthMode: 'flat', rows: [], ...(w.chart || {}) };
  openSheet(`
    <h2>${existing ? 'Wunsch bearbeiten' : 'Neuer Wunsch'}</h2>
    <form id="f" class="form">
      ${photoField(photo)}
      <label>Was?<input name="name" required value="${esc(w.name)}" placeholder="z. B. Dunkelblaue Selvedge-Jeans"></label>
      <label>Kategorie<select name="category"><option value="">–</option>${CATEGORIES.map((c) => `<option ${c === w.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Link<input name="url" type="url" inputmode="url" value="${esc(w.url)}" placeholder="https://…"></label>
      <label>Preis (€)<input name="price" inputmode="decimal" value="${w.price ?? ''}" placeholder="0,00"></label>
      <fieldset><legend>Priorität</legend><div class="seg">
        ${[1, 2, 3].map((p) => `<button type="button" class="${p === w.priority ? 'on' : ''}" data-p="${p}">${PRIO[p]}</button>`).join('')}
      </div></fieldset>
      <label>Notizen<textarea name="notes" rows="3" placeholder="Größe, Farbe, wozu passt es …">${esc(w.notes)}</textarea></label>
      <details class="sect" ${w.chart?.rows?.length ? 'open' : ''}>
        <summary>Größentabelle & Passform-Check</summary>
        <fieldset><legend>Die Tabelle des Shops zeigt</legend><div class="seg two-seg" id="cType">
          <button type="button" data-v="garment" class="${chart.type !== 'body' ? 'on' : ''}">Maße des Teils</button>
          <button type="button" data-v="body" class="${chart.type === 'body' ? 'on' : ''}">Körpermaße</button>
        </div></fieldset>
        <fieldset id="cModeWrap" ${chart.type === 'body' ? 'hidden' : ''}><legend>Weiten angegeben als</legend><div class="seg two-seg" id="cMode">
          <button type="button" data-v="flat" class="${chart.widthMode !== 'circ' ? 'on' : ''}">Flach (halbe Weite)</button>
          <button type="button" data-v="circ" class="${chart.widthMode === 'circ' ? 'on' : ''}">Umfang</button>
        </div></fieldset>
        <p class="muted small">Eine Zeile pro Größe, Werte in cm. Bereiche wie <b>96–100</b> sind erlaubt. Steht über der Tabelle „Körpermaße“ oder „Brustumfang 96–100“, dann <b>Körpermaße</b> wählen.</p>
        <div id="chartHost">${chartEditor(w.category, chart)}</div>
        <label class="check"><input type="checkbox" id="cHem" ${chart.hemmable ? 'checked' : ''}> Wird gekürzt (absichtlich lang geschnitten / Schneider)</label>
        ${styleFields(w.cut, w.stretch, w.shrink)}
        <button type="button" class="btn small" id="addRow">+ Größe</button>
        <fieldset><legend>Model im Shop</legend>
          <p class="muted small">Steht z. B. „Model ist 177 cm / 60 kg und trägt M“ dabei? Dann hier eintragen – der Berater vergleicht es mit dir.</p>
          <div class="mgrid">
            <label>Trägt Größe<input data-model="size" value="${esc(w.model?.size)}" placeholder="z. B. M"></label>
            ${MODEL_FIELDS.map(([k, l, u]) => `<label>${l}<span class="unit"><input data-model="${k}" inputmode="decimal" value="${numStr(w.model?.[k])}"><em>${u}</em></span></label>`).join('')}
          </div>
        </fieldset>
      </details>
      <div class="actions">
        <button type="button" class="btn" id="cancel">Abbrechen</button>
        <button class="btn primary">Speichern</button>
      </div>
    </form>`, (el) => {
    bindPhoto(el, () => photo, (b) => { photo = b; });
    const chartEl = $('#chartHost', el);
    const repaintChart = (rows) => {
      chartEl.innerHTML = chartEditor($('[name=category]', el).value, { rows });
      $$('[data-delrow]', chartEl).forEach((b) => b.onclick = () => {
        const r = readChart(chartEl, chart.type); r.splice(+b.dataset.delrow, 1); repaintChart(r);
      });
    };
    repaintChart(chart.rows);
    $('#addRow', el).onclick = () => repaintChart([...readChart(chartEl, chart.type), { size: '', values: {} }]);
    $('[name=category]', el).addEventListener('change', () => repaintChart(readChart(chartEl, chart.type)));
    const segBind = (id, key, after) => $$(`#${id} button`, el).forEach((b) => b.onclick = () => {
      const rows = readChart(chartEl, chart.type);
      chart[key] = b.dataset.v;
      $$(`#${id} button`, el).forEach((x) => x.classList.toggle('on', x === b));
      after?.(rows);
    });
    segBind('cType', 'type', (rows) => { $('#cModeWrap', el).hidden = chart.type === 'body'; repaintChart(rows); });
    segBind('cMode', 'widthMode');
    const getCut = bindToggleSeg(el, 'cutSeg', w.cut);
    const getStretch = bindToggleSeg(el, 'stretchSeg', w.stretch);
    let prio = w.priority;
    $$('[data-p]', el).forEach((b) => b.onclick = () => {
      prio = +b.dataset.p;
      $$('[data-p]', el).forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#cancel', el).onclick = () => (existing ? openWish(existing.id) : closeSheet());
    $('#f', el).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const wish = {
        ...w,
        id: w.id || uid(),
        createdAt: w.createdAt || Date.now(),
        name: fd.get('name').trim(),
        category: fd.get('category'),
        url: fd.get('url').trim(),
        price: parsePrice(fd.get('price')),
        priority: prio,
        notes: fd.get('notes').trim(),
        photo,
        chart: { ...chart, hemmable: $('#cHem', el).checked, rows: readChart(chartEl, chart.type).filter((r) => r.size || Object.keys(r.values).length) },
        model: readModel(el),
        cut: getCut(),
        stretch: getStretch(),
        shrink: $('#shrinkChk', el).checked || undefined,
      };
      await saveWish(wish);
      toast('Gespeichert'); render(); openWish(wish.id);
    };
  });
}

// ===== Statistik =====
function renderStats(v) {
  const items = state.items;
  if (!items.length) { v.innerHTML = empty('Noch keine Daten', 'Sobald du Teile erfasst und als getragen markierst, siehst du hier Auswertungen.'); return; }
  const t = today();
  const total = items.reduce((s, it) => s + (it.price || 0), 0);
  const worn30 = items.filter((it) => (it.wears || []).some((d) => daysSince(d) <= 30)).length;
  const totalWears = items.reduce((s, it) => s + (it.wears?.length || 0), 0);
  const priced = items.filter((it) => it.price != null);
  const pricedWears = priced.reduce((s, it) => s + (it.wears?.length || 0), 0);
  const avgCpw = pricedWears ? priced.reduce((s, it) => s + it.price, 0) / pricedWears : null;

  const top = [...items].filter((it) => it.wears?.length).sort((a, b) => b.wears.length - a.wears.length).slice(0, 5);
  const forgotten = items
    .filter((it) => { const l = lastWorn(it); return l ? daysSince(l) > 90 : (Date.now() - it.createdAt) > 14 * 864e5; })
    .sort((a, b) => (lastWorn(a) || '').localeCompare(lastWorn(b) || '')).slice(0, 8);
  const expensive = items.filter((it) => it.price != null).map((it) => ({ it, v: costPerWear(it) }))
    .sort((a, b) => b.v - a.v).slice(0, 5);
  // Günstigste nur aus getragenen Teilen: Ein nie getragenes Teil hat noch nichts gekostet, weil es nichts gebracht hat
  const cheapest = items.filter((it) => it.price != null && it.wears?.length).map((it) => ({ it, v: costPerWear(it) }))
    .sort((a, b) => a.v - b.v).slice(0, 5);

  const totalWashes = items.reduce((s, it) => s + (it.washes?.length || 0), 0);
  const unwashed = items.filter((it) => wearsSinceWash(it) > 0).sort((a, b) => wearsSinceWash(b) - wearsSinceWash(a)).slice(0, 5);

  const counts = {};
  for (const it of items) counts[it.category] = (counts[it.category] || 0) + 1;
  const catRows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCat = catRows[0][1];

  // Letzte 12 Wochen: Anzahl getragener Teile pro Tag
  const perDay = {};
  for (const it of items) for (const d of it.wears || []) perDay[d] = (perDay[d] || 0) + 1;
  const days = [];
  const end = new Date(t + 'T00:00');
  // Start: Montag vor 11 Wochen → Spalten = Wochen, Zeilen = Mo–So
  const start = new Date(end); start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - 77);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    days.push([iso, perDay[iso] || 0]);
  }
  const maxDay = Math.max(1, ...days.map((d) => d[1]));

  const wishTotal = state.wishlist.reduce((s, w) => s + (w.price || 0), 0);
  let lastBackup = null; try { lastBackup = localStorage.getItem('lastBackup'); } catch {}
  const backupOld = !lastBackup || daysSince(lastBackup) > 30;

  const rowList = (arr, right) => arr.map((x) => {
    const it = x.it || x;
    return `<button class="row-item" data-item="${it.id}">${thumb(it.photo, 'ph sm')}<div class="grow"><div class="name">${esc(it.name)}</div><div class="sub">${esc(it.category)}</div></div><span class="num">${right(x)}</span></button>`;
  }).join('');

  v.innerHTML = `
    ${backupOld ? `<button class="notice" id="backupNotice">${lastBackup ? `Letztes Backup ${relDays(lastBackup)}.` : 'Noch kein Backup gemacht.'} Jetzt sichern →</button>` : ''}
    <div class="tiles">
      <div class="tile"><span>Teile</span><b>${items.length}</b></div>
      <div class="tile"><span>Gesamtwert</span><b>${eur(total)}</b></div>
      <div class="tile"><span>Ø pro Tragen</span><b>${eur(avgCpw)}</b></div>
      <div class="tile"><span>Letzte 30 Tage getragen</span><b>${Math.round((worn30 / items.length) * 100)} %</b><small>${worn30} von ${items.length} Teilen</small></div>
    </div>

    <section class="panel">
      <h3>Tragen – letzte 12 Wochen <span class="muted">· ${totalWears} Einträge gesamt</span></h3>
      <div class="heat" role="img" aria-label="Kalender der getragenen Teile">${days.map(([d, n]) =>
        `<i title="${fmtDate(d)}: ${n} Teil${n === 1 ? '' : 'e'}" style="--a:${n ? 0.25 + 0.75 * (n / maxDay) : 0}"${d === t ? ' class="today"' : ''}></i>`).join('')}</div>
    </section>

    ${top.length ? `<section class="panel"><h3>Am meisten getragen</h3><div class="list">${rowList(top, (it) => `${it.wears.length}×`)}</div></section>` : ''}

    ${unwashed.length ? `<section class="panel"><h3>Seit der letzten Wäsche am meisten getragen <span class="muted">· ${totalWashes} Wäschen gesamt</span></h3><div class="list">${rowList(unwashed, (it) => `${wearsSinceWash(it)}×`)}</div></section>` : ''}

    ${forgotten.length ? `<section class="panel"><h3>Lange nicht getragen <span class="muted">· über 90 Tage oder nie</span></h3><div class="list">${rowList(forgotten, (it) => relDays(lastWorn(it)))}</div></section>` : ''}

    ${expensive.length ? `<section class="panel"><h3>Höchste Kosten pro Tragen <span class="muted">· nie getragen zählt wie einmal</span></h3><div class="list">${rowList(expensive, (x) => eur(x.v))}</div></section>` : ''}

    ${cheapest.length ? `<section class="panel"><h3>Niedrigste Kosten pro Tragen</h3><div class="list">${rowList(cheapest, (x) => eur(x.v))}</div></section>` : ''}

    <section class="panel">
      <h3>Nach Kategorie</h3>
      <div class="bars">${catRows.map(([c, n]) => `<div class="bar"><span class="lbl">${esc(c)}</span><span class="track"><span style="width:${(n / maxCat) * 100}%"></span></span><span class="num">${n}</span></div>`).join('')}</div>
    </section>

    <section class="panel">
      <h3>Wunschliste</h3>
      <p>${state.wishlist.length} Wünsche · zusammen <b>${eur(wishTotal)}</b></p>
    </section>

    ${(() => {
      const a = adviceStats(items);
      if (!a.total && !a.pending && !a.unclear) return '';
      const open = items.filter((it) => adviceOutcome(it) === 'pending');
      return `<section class="panel">
        <h3>Größenberater</h3>
        ${a.total ? `<p>Berater lag bei <b>${a.hits} von ${a.total}</b> ${a.total === 1 ? 'Kauf' : 'Käufen'} richtig${a.total >= 3 ? ` (${Math.round((a.hits / a.total) * 100)} %)` : ''}.</p>` : '<p>Noch kein bewerteter Kauf mit Empfehlung.</p>'}
        ${a.unclear ? `<p class="muted small">${a.unclear === 1 ? '1 Kauf ist' : `${a.unclear} Käufe sind`} nicht eindeutig (andere Größe gekauft, sitzt nur „etwas“ daneben).</p>` : ''}
        ${open.length ? `<p class="muted small">Noch nicht bewertet – tipp an und sag, wie es sitzt:</p><div class="list">${rowList(open, (it) => `Gr. ${esc(it.advice.bought || '?')}`)}</div>` : ''}
      </section>`;
    })()}`;

  v.onclick = (e) => {
    const r = e.target.closest('[data-item]'); if (r) openItem(r.dataset.item);
    if (e.target.closest('#backupNotice')) openSettings();
  };
}

function empty(title, text) {
  return `<div class="empty"><div class="empty-icon">${ICON.hanger}</div><h2>${title}</h2><p>${text}</p></div>`;
}

// ---------- Einstellungen / Backup ----------
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
const dataUrlToBlob = async (u) => (await fetch(u)).blob();

async function exportBackup() {
  const out = await toBackup(state, db.STORES, blobToDataUrl);
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const name = `kleiderschrank-backup-${today()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: 'Kleiderschrank-Backup' }); } catch (e) { if (e.name === 'AbortError') return; }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  try { localStorage.setItem('lastBackup', today()); } catch {}
  toast('Backup erstellt');
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('Datei ist kein gültiges Backup'); return; }
  if (data.app !== 'kleiderschrank') { toast('Datei ist kein Kleiderschrank-Backup'); return; }
  const n = (data.items || []).length;
  if (!confirm(`Backup vom ${fmtDate((data.exportedAt || '').slice(0, 10))} mit ${n} Teilen laden?\n\nACHTUNG: Die aktuellen Daten auf diesem Gerät werden ersetzt.`)) return;
  // ältere Backups ohne z. B. Körpermaße: fehlende Stores werden nicht angefasst
  const conv = await fromBackup(data, db.STORES, dataUrlToBlob);
  await db.replaceAll(conv);
  for (const s of db.STORES) if (conv[s]) state[s] = conv[s];
  closeSheet(); render(); toast('Backup geladen');
}

async function openSettings() {
  let est = '';
  try {
    const e = await navigator.storage?.estimate?.();
    if (e) est = `${(e.usage / 1048576).toFixed(1)} MB belegt`;
  } catch {}
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.(); } catch {}
  let lastBackup = null; try { lastBackup = localStorage.getItem('lastBackup'); } catch {}
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openSheet(`
    <h2>Einstellungen</h2>
    <section class="panel flat">
      <h3>Meine Körpermaße</h3>
      <p class="muted small">Für den Passform-Check und die Puppe. ${body().height ? `Eingetragen: ${BODY_FIELDS.filter(([k]) => body()[k]).length} von ${BODY_FIELDS.length} Maßen.` : 'Noch nichts eingetragen.'}</p>
      <button class="btn block" id="bodyBtn">Körpermaße ${body().height ? 'bearbeiten' : 'eintragen'}</button>
    </section>
    <section class="panel flat">
      <h3>Backup</h3>
      <p class="muted small">Deine Daten liegen nur auf diesem Gerät. Erstelle regelmäßig ein Backup (z. B. in iCloud/Google Drive speichern) – damit kannst du auch auf ein anderes Gerät umziehen.</p>
      <p class="small">Letztes Backup: <b>${lastBackup ? `${fmtDate(lastBackup)} (${relDays(lastBackup)})` : 'noch nie'}</b></p>
      <button class="btn primary block" id="exp">Backup exportieren</button>
      <label class="btn block">Backup importieren<input type="file" accept="application/json,.json" id="imp" hidden></label>
    </section>
    <section class="panel flat">
      <h3>Speicher</h3>
      <p class="small">${state.items.length} Teile · ${state.outfits.length} Outfits · ${state.wishlist.length} Wünsche${est ? ` · ${est}` : ''}</p>
      <p class="small">Dauerhafter Speicher: <b>${persisted ? 'ja' : 'nicht garantiert'}</b>${persisted ? '' : ' – App zum Homescreen hinzufügen, dann löscht der Browser die Daten nicht.'}</p>
    </section>
    ${standalone ? '' : `<section class="panel flat">
      <h3>Als App installieren</h3>
      <p class="small"><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“.<br><b>Android (Chrome):</b> Menü ⋮ → „App installieren“ / „Zum Startbildschirm“.<br><b>PC (Chrome/Edge):</b> Installieren-Symbol rechts in der Adressleiste.</p>
    </section>`}
    <p class="muted small center">Kleiderschrank · v1.4</p>`, (el) => {
    $('#bodyBtn', el).onclick = () => openBodyForm(openSettings);
    $('#exp', el).onclick = exportBackup;
    $('#imp', el).onchange = (e) => { const f = e.target.files[0]; if (f) importBackup(f); };
  });
}

// ---------- Import vorbereiteter Teile: ?teil=<name> lädt import/<name>.json (+ Foto) ins Formular ----------
async function importFromUrl() {
  const p = new URLSearchParams(location.search);
  const kind = p.has('wunsch') ? 'wunsch' : 'teil';
  const name = p.get(kind);
  if (!name) return;
  history.replaceState(null, '', location.pathname);
  if (!/^[\w-]+$/.test(name)) return;
  try {
    const res = await fetch(`import/${name}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    const pic = async (f) => (f && /^[\w.-]+$/.test(f) ? shrinkImage(await (await fetch(`import/${f}`, { cache: 'no-store' })).blob()) : null);
    const prefill = {
      name: d.name, brand: d.brand, category: CATEGORIES.includes(d.category) ? d.category : CATEGORIES[0],
      color: d.color, size: d.size, seasons: d.seasons || [], notes: d.notes, price: d.price ?? null,
      purchaseDate: d.purchaseDate || '', measures: d.measures, fit: d.fit || '', fitNote: d.fitNote || '',
      cut: CUT_NAME[d.cut] ? d.cut : undefined, stretch: STRETCH_NAME[d.stretch] ? d.stretch : undefined, shrink: d.shrink === true || undefined, lengthStyle: d.lengthStyle === true || undefined,
      photo: await pic(d.photo), fitpics: (await Promise.all((d.fitpics || []).map(pic))).filter(Boolean),
    };
    if (kind === 'wunsch') {
      state.tab = 'wunsch'; render();
      openWishForm(null, { prefill: {
        name: d.name, category: CATEGORIES.includes(d.category) ? d.category : '', url: d.url || '', price: d.price ?? null,
        priority: d.priority || 2, notes: d.notes || '', photo: prefill.photo, chart: d.chart, model: d.model || null,
        cut: prefill.cut, stretch: prefill.stretch, shrink: prefill.shrink,
      } });
    } else {
      state.tab = 'schrank'; render();
      openItemForm(null, { prefill: { ...prefill, model: d.model || null } });
    }
    toast('Teil vorbereitet – prüfen und speichern');
  } catch (e) {
    toast(`Import „${name}“ fehlgeschlagen`);
  }
}

// ---------- Start ----------
document.addEventListener('db-blocked', () => {
  const v = document.querySelector('#view');
  if (v && !v.children.length) v.innerHTML = '<div class="empty"><h2>Bitte kurz warten</h2><p>Die App ist noch in einem anderen Tab mit einer älteren Version offen. Schließ die anderen Tabs der App – dann geht es hier automatisch weiter.</p></div>';
});

async function init() {
  const loaded = await Promise.all(db.STORES.map((s) => db.all(s)));
  db.STORES.forEach((s, i) => { state[s] = loaded[i]; });
  try { const t = localStorage.getItem('tab'); if (TITLES[t]) state.tab = t; } catch {}

  $('.tabbar').onclick = (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    state.tab = b.dataset.tab;
    try { localStorage.setItem('tab', state.tab); } catch {}
    render(); window.scrollTo(0, 0);
  };
  $('#fab').onclick = () => ({ kalender: () => openDay(today()), schrank: () => openItemForm(null, state.filter.cat !== 'Alle' ? { prefill: { category: state.filter.cat } } : {}), outfits: () => openOutfitForm(null), wunsch: () => openWishForm(null) })[state.tab]?.();
  $('#settingsBtn').onclick = openSettings;
  sheet().addEventListener('click', (e) => { if (e.target === sheet()) closeSheet(); });

  render();
  importFromUrl();

  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init().catch((e) => {
  console.error(e);
  $('#view').innerHTML = `<div class="empty"><h2>Fehler beim Laden</h2><p>${esc(e.message || e)}</p></div>`;
});
