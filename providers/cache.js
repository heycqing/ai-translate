// AI Translate - IndexedDB 译文缓存（background 专用）
// 缓存读写失败一律静默降级为"无缓存"，绝不阻塞翻译主流程
(function (root) {
  const DB_NAME = 'ai-translate-cache';
  const STORE = 'translations';
  let dbPromise = null;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore(STORE, { keyPath: 'key' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }

  // 按序返回每个 key 的命中译文，未命中为 null
  async function getMany(keys) {
    try {
      const db = await openDB();
      return await Promise.all(keys.map(function (key) {
        return new Promise(function (resolve) {
          const req = db.transaction(STORE).objectStore(STORE).get(key);
          req.onsuccess = function () { resolve(req.result ? req.result.translation : null); };
          req.onerror = function () { resolve(null); };
        });
      }));
    } catch (e) {
      return keys.map(function () { return null; });
    }
  }

  async function putMany(entries) {
    if (!entries.length) return;
    try {
      const db = await openDB();
      await new Promise(function (resolve) {
        const tx = db.transaction(STORE, 'readwrite');
        entries.forEach(function (e) {
          tx.objectStore(STORE).put({ key: e.key, translation: e.translation, ts: Date.now() });
        });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    } catch (e) { /* 静默 */ }
  }

  root.AITCache = { getMany, putMany };
})(self);
