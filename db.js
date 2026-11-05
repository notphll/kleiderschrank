// Kleine IndexedDB-Hülle. Alle Daten (inkl. Fotos als Blobs) bleiben lokal im Browser.
const DB_NAME = 'kleiderschrank';
const VERSION = 3;
export const STORES = ['items', 'wishlist', 'outfits', 'profile', 'days'];

let dbPromise;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        }
      };
      // Ein anderer Tab hat noch die alte Datenbank-Version offen
      req.onblocked = () => document.dispatchEvent(new CustomEvent('db-blocked'));
      req.onsuccess = () => {
        const d = req.result;
        // Wenn ein neuerer Tab die Datenbank umstellen will: Verbindung freigeben und neu laden
        d.onversionchange = () => { d.close(); location.reload(); };
        resolve(d);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const all = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, obj) => run(store, 'readwrite', (s) => s.put(obj)).then(() => obj);
export const del = (store, id) => run(store, 'readwrite', (s) => s.delete(id));

export async function putMany(store, objs) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const o of objs) os.put(o);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function replaceAll(data) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const stores = STORES.filter((s) => data[s]);
    const t = d.transaction(stores, 'readwrite');
    for (const s of stores) {
      const os = t.objectStore(s);
      os.clear();
      for (const o of data[s] || []) os.put(o);
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
