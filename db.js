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
  // Scritture di più record in una transazione: un errore immediato (es. DataCloneError, quota) annulla
  // anche quelle già messe in coda, così non resta mai metà dell'operazione (F06).
  function tutto(tx, scrivi) {
    const fine = done(tx);
    try { scrivi(); } catch (e) { try { tx.abort(); } catch (_) {} fine.catch(() => {}); return Promise.reject(e); }
    return fine;
  }
  async function store(name, mode) { const d = await open(); const tx = d.transaction(name, mode); return [tx, tx.objectStore(name)]; }

  return {
    async listViaggi() { const [, s] = await store("viaggi", "readonly"); return req(s.getAll()); },
    async getViaggio(id) { const [, s] = await store("viaggi", "readonly"); return req(s.get(id)); },
    // Salva il pacchetto (senza immagini) e le immagini come Blob, in una sola transazione.
    async putViaggio(pkg, blobs) {
      const d = await open(); const tx = d.transaction(["viaggi", "img"], "readwrite");
      return tutto(tx, () => {
        tx.objectStore("viaggi").put(pkg);
        for (const [path, blob] of Object.entries(blobs)) tx.objectStore("img").put(blob, pkg.id + "|" + path);
      });
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
    // F05: le pagine FL incorporate in un pacchetto senza IA importato restano del viaggio (chiave "si|<id>|img/…"),
    // salvate nella stessa transazione del viaggio; le pagine di una versione precedente dello stesso viaggio si tolgono.
    async putSI(p, blobs) {
      const d = await open(); const tx = d.transaction(["viaggi_si", "img"], "readwrite"), im = tx.objectStore("img");
      return tutto(tx, () => {
        tx.objectStore("viaggi_si").put(p);
        im.delete(IDBKeyRange.bound("si|" + p.id + "|", "si|" + p.id + "|\uffff"));
        for (const [path, blob] of Object.entries(blobs || {})) im.put(blob, "si|" + p.id + "|" + path);
      });
    },
    async delSI(id) {
      const d = await open(); const tx = d.transaction(["viaggi_si", "img"], "readwrite");
      tx.objectStore("viaggi_si").delete(id);
      tx.objectStore("img").delete(IDBKeyRange.bound("si|" + id + "|", "si|" + id + "|\uffff"));
      return done(tx);
    },
    // Pagine FL del generatore senza IA (1.0.21): nell'archivio "img" con chiave "fl|img/…", comuni a tutti i viaggi.
    // Sostituisce in una sola transazione le pagine di un FL (vecchi = percorsi da togliere, blobs = nuove pagine).
    // F06: pagine e loro catalogo (conf "pagine_fl_info") nella stessa transazione: o tutto o niente.
    async putPagineFL(vecchi, blobs, info) {
      const d = await open(); const tx = d.transaction(["img", "conf"], "readwrite"), s = tx.objectStore("img");
      return tutto(tx, () => {
        for (const p of vecchi) s.delete("fl|" + p);
        for (const [p, b] of Object.entries(blobs)) s.put(b, "fl|" + p);
        if (info !== undefined) tx.objectStore("conf").put(info, "pagine_fl_info");
      });
    },
    async chiaviPagineFL() {
      const [, s] = await store("img", "readonly");
      return (await req(s.getAllKeys(IDBKeyRange.bound("fl|", "fl|￿")))).map(k => String(k).slice(3));
    },
    async getConf(k) { const [, s] = await store("conf", "readonly"); return req(s.get(k)); },
    async setConf(k, v) { const [tx, s] = await store("conf", "readwrite"); s.put(v, k); return done(tx); },
    // F08: legge e riscrive una chiave di conf nella stessa transazione. fn(valore attuale) restituisce il nuovo
    // valore, oppure undefined per non scrivere nulla (es. il token è cambiato nel frattempo).
    async aggiornaConf(k, fn) {
      const [tx, s] = await store("conf", "readwrite");
      const fine = done(tx); let scritto = false;
      const r = s.get(k);
      r.onsuccess = () => {
        try { const v = fn(r.result); if (v !== undefined) { s.put(v, k); scritto = true; } }
        catch (e) { try { tx.abort(); } catch (_) {} }
      };
      await fine; return scritto;
    },
    // F06: più chiavi di conf in una sola transazione (es. database dati di linea + sue informazioni)
    async setConfInsieme(valori) {
      const [tx, s] = await store("conf", "readwrite");
      return tutto(tx, () => { for (const [k, v] of Object.entries(valori)) s.put(v, k); });
    }
  };
})();
