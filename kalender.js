// Kalender: reine Logik ohne DOM, damit sie sich mit Node testen lässt.
// Getragen wird nur an den Teilen gespeichert (it.wears). Der Kalender liest daraus, ein Tag-Eintrag
// (Store „days“: { id: 'JJJJ-MM-TT', photo }) hält nur das Foto. So gibt es keine zweite Liste, die abweichen kann.

const pad = (n) => String(n).padStart(2, '0');

/** Monat 'JJJJ-MM' um n Monate verschieben. */
export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Kalenderblatt, Woche ab Montag: null = Lücke vor dem Monatsersten, sonst 'JJJJ-MM-TT'. */
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  // Mittags gerechnet, damit die Zeitumstellung den Tag nicht verschiebt
  const lead = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7;
  const days = new Date(y, m, 0, 12).getDate();
  return [
    ...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`),
  ];
}

/** Alle Teile, die an diesem Tag getragen wurden. */
export const wornOn = (items, date) => items.filter((it) => it.wears?.includes(date));

/**
 * Setzt die getragenen Teile eines Tages: ausgewählte bekommen das Datum, alle anderen verlieren es.
 * @returns die geänderten Teile (nur diese müssen gespeichert werden)
 */
export function setWornOn(items, date, selectedIds) {
  const selected = new Set(selectedIds);
  const changed = [];
  for (const it of items) {
    const has = !!it.wears?.includes(date);
    if (has === selected.has(it.id)) continue;
    it.wears = has ? it.wears.filter((d) => d !== date) : [...(it.wears || []), date].sort();
    changed.push(it);
  }
  return changed;
}

/** Kosten pro Tragen: Preis geteilt durch Tragetage, nie getragen zählt wie einmal. null ohne Preis. */
export const costPerWear = (it) => (it.price == null ? null : it.price / Math.max(1, it.wears?.length || 0));
