// Waschen: reine Logik ohne DOM, damit sie sich mit Node testen lässt.
// it.washes = sortierte Liste von Daten (JJJJ-MM-TT), optional. Zählt auch chemische Reinigung.

export const lastWash = (it) => (it?.washes?.length ? it.washes[it.washes.length - 1] : null);

/** Trägt ein Datum ein. false, wenn es schon eingetragen ist. */
export function addWash(it, date) {
  it.washes = it.washes || [];
  if (it.washes.includes(date)) return false;
  it.washes.push(date);
  it.washes.sort();
  return true;
}

export function removeWash(it, date) {
  it.washes = (it.washes || []).filter((d) => d !== date);
}

/**
 * Wie oft seit der letzten Wäsche getragen. Nie gewaschen: alle Tragetage.
 * Am Waschtag getragen zählt als vor der Wäsche (Tragen und Waschen haben nur ein Datum, keine Uhrzeit).
 */
export function wearsSinceWash(it) {
  const last = lastWash(it);
  return (it?.wears || []).filter((d) => !last || d > last).length;
}
