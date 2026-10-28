// Archivio locale dei viaggi (IndexedDB). Nulla lascia il telefono.
const DB = (() => {
  const NAME = "adc-copilot-gps", VER = 2; // 2 (1.0.20): archivio separato dei viaggi generati senza IA
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("viaggi")) d.createObjectStore("viaggi", { keyPath: "id" });
        if (!d.objectStoreNames.contains("img")) d.createObjectStore("img"); // chiave "id|img/..." → Blob
        if (!d.objectStoreNames.contains("conf")) d.createObjectStore("conf");
        if (!d.objectStoreNames.contains("viaggi_si")) d.createObjectStore("viaggi_si", { keyPath: "id" }); // viaggi senza IA
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function done(tx) { return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
  async function store(name, mode) { const d = await open(); const tx = d.transaction(name, mode); return [tx, tx.objectStore(name)]; }

  return {
    async listViaggi() { const [, s] = await store("viaggi", "readonly"); return req(s.getAll()); },
    async getViaggio(id) { const [, s] = await store("viaggi", "readonly"); return req(s.get(id)); },
    // Salva il pacchetto (senza immagini) e le immagini come Blob, in una sola transazione.
    async putViaggio(pkg, blobs) {
      const d = await open(); const tx = d.transaction(["viaggi", "img"], "readwrite");
      tx.objectStore("viaggi").put(pkg);
      for (const [path, blob] of Object.entries(blobs)) tx.objectStore("img").put(blob, pkg.id + "|" + path);
      return done(tx);
    },
    async imgKeys(id) {
      const [, s] = await store("img", "readonly");
      return req(s.getAllKeys(IDBKeyRange.bound(id + "|", id + "|￿")));
    },
    async getImg(id, path) { const [, s] = await store("img", "readonly"); return req(s.get(id + "|" + path)); },
    async delViaggio(id) {
      const d = await open(); const tx = d.transaction(["viaggi", "img"], "readwrite");
      tx.objectStore("viaggi").delete(id);
      tx.objectStore("img").delete(IDBKeyRange.bound(id + "|", id + "|￿"));
      return done(tx);
    },
    // Viaggi generati senza IA: archivio separato, così convivono con quelli di Claude dello stesso treno e data
    async listSI() { const [, s] = await store("viaggi_si", "readonly"); return req(s.getAll()); },
    async getSI(id) { const [, s] = await store("viaggi_si", "readonly"); return req(s.get(id)); },
    async putSI(p) { const [tx, s] = await store("viaggi_si", "readwrite"); s.put(p); return done(tx); },
    async delSI(id) { const [tx, s] = await store("viaggi_si", "readwrite"); s.delete(id); return done(tx); },
    async getConf(k) { const [, s] = await store("conf", "readonly"); return req(s.get(k)); },
    async setConf(k, v) { const [tx, s] = await store("conf", "readwrite"); s.put(v, k); return done(tx); }
  };
})();
