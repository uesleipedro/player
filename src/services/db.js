const DB_NAME = 'iptv-player-db';
const DB_VERSION = 1;

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('type_group', ['type', 'group'], { unique: false });
      }
      if (!db.objectStoreNames.contains('categories')) {
        const store = db.createObjectStore('categories', { keyPath: 'key' });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function clearLibrary() {
  const db = await openDb();
  await tx(db, ['items', 'categories', 'meta'], 'readwrite', stores => {
    stores.items.clear();
    stores.categories.clear();
    stores.meta.clear();
  });
}

export async function replaceLibrary(items, categories, meta = {}) {
  const db = await openDb();
  await tx(db, ['items', 'categories', 'meta'], 'readwrite', stores => {
    stores.items.clear();
    stores.categories.clear();
    stores.meta.clear();
    const itemStore = stores.items;
    for (const item of items) itemStore.put(item);
    for (const c of categories) stores.categories.put(c);
    stores.meta.put({ key: 'library', ...meta });
  });
}

export async function getCategories(type) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('categories').objectStore('categories').index('type').getAll(type);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    req.onerror = () => reject(req.error);
  });
}

export async function getItems({ type, group = null, search = '', limit = 80, offset = 0 }) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction('items').objectStore('items');
    const source = group ? store.index('type_group') : store.index('type');
    const range = group ? IDBKeyRange.only([type, group]) : IDBKeyRange.only(type);
    const req = source.openCursor(range);
    const result = [];
    const q = search.trim().toLocaleLowerCase('pt-BR');
    let skipped = 0;
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(result);
      const item = cursor.value;
      if (!q || `${item.name} ${item.group}`.toLocaleLowerCase('pt-BR').includes(q)) {
        if (skipped < offset) skipped += 1;
        else if (result.length < limit) result.push(item);
        else return resolve(result);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countItems({ type, group = null, search = '' }) {
  const items = await getItems({ type, group, search, limit: 1000000, offset: 0 });
  return items.length;
}

export async function getMeta(key = 'library') {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, names, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map(name => [name, transaction.objectStore(name)]));
    callback(stores);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transação abortada'));
  });
}

export async function getItemsByIds(ids) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items');
    const store = tx.objectStore('items');
    const result = [];
    if (!ids.length) return resolve(result);
    let remaining = ids.length;
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) result.push(req.result);
        remaining -= 1;
        if (!remaining) resolve(result);
      };
      req.onerror = () => reject(req.error);
    }
  });
}
