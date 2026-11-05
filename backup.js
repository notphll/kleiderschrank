// Backup als JSON: reine Logik ohne DOM, damit sie sich mit Node testen lässt.
// Fotos werden über die übergebenen Funktionen umgewandelt (Blob ↔ Data-URL), alle anderen Felder
// (auch neue wie cut, stretch, shrink, fitDetail, advice) werden unverändert übernommen.
import { cleanFitDetail } from './fit.js';

export const BACKUP_APP = 'kleiderschrank';
export const BACKUP_VERSION = 1;

/** state: { [store]: [...] } → Backup-Objekt (Fotos als Data-URL). */
export async function toBackup(state, stores, toDataUrl, now = new Date()) {
  const out = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString() };
  for (const s of stores) {
    out[s] = await Promise.all((state[s] || []).map(async (x) => ({
      ...x,
      photo: x.photo ? await toDataUrl(x.photo) : null,
      ...(x.fitpics ? { fitpics: await Promise.all(x.fitpics.map(toDataUrl)) } : {}),
    })));
  }
  return out;
}

/**
 * Backup-Objekt → { [store]: [...] } zum Speichern. Stores, die im Backup fehlen (ältere Backups),
 * werden weggelassen, damit vorhandene Daten erhalten bleiben. Wirft bei fremden Dateien.
 */
export async function fromBackup(data, stores, fromDataUrl) {
  if (!data || data.app !== BACKUP_APP) throw new Error('kein Kleiderschrank-Backup');
  const conv = {};
  for (const s of stores) {
    if (!Array.isArray(data[s])) continue;
    conv[s] = await Promise.all(data[s].map(async (x) => {
      const o = {
        ...x,
        photo: x.photo ? await fromDataUrl(x.photo) : null,
        ...(x.fitpics ? { fitpics: await Promise.all(x.fitpics.map(fromDataUrl)) } : {}),
      };
      // Passform je Maß nur mit gültigen Werten übernehmen (z. B. nach Hand-Bearbeitung der Datei)
      if ('fitDetail' in o) { const fd = cleanFitDetail(o.fitDetail); if (fd) o.fitDetail = fd; else delete o.fitDetail; }
      return o;
    }));
  }
  return conv;
}
