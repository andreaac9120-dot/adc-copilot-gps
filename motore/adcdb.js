// Database dati di linea importato dal file .adcdb.json (repository privato adc-copilot-db).
// Il codice della PWA è pubblico e non contiene dati: i dati arrivano solo da questo file, che resta nel telefono.
(function (root) {
  "use strict";
  const TABELLE = ["fonti", "linee", "localita", "punti_linea", "esercizio", "fiancata", "indicatori",
    "affiancamenti", "aff_linee", "sez46_letta", "sigle", "accesso_sigle", "loco",
    "compatibilita", "utenze", "geo", "pagine_fl", "discrepanze"];

  // JSON con chiavi ordinate e senza spazi, come json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)
  function canonico(x) {
    if (Array.isArray(x)) return "[" + x.map(canonico).join(",") + "]";
    if (x !== null && typeof x === "object") return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonico(x[k])).join(",") + "}";
    return JSON.stringify(x);
  }
  async function sha256(testo) {
    const c = (typeof crypto !== "undefined" && crypto.subtle) ? crypto : require("node:crypto").webcrypto;
    const h = await c.subtle.digest("SHA-256", new TextEncoder().encode(testo));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // Controlla il file: formato, versione, tabelle e impronta. Restituisce { db } oppure { err }.
  async function controlla(txt) {
    let d;
    try { d = JSON.parse(txt); } catch (_) { return { err: "file non leggibile (JSON non valido)" }; }
    if (!d || d.formato !== "adc-copilot-database") return { err: "non è un database ADC COPILOT (formato diverso)" };
    if (d.versione_formato !== 1) return { err: `versione del formato ${d.versione_formato} non supportata da questa app` };
    if (typeof d.versione !== "string" || !/^\d{8}-\d{4}$/.test(d.versione)) return { err: "versione del database mancante" };
    if (!d.tabelle || typeof d.tabelle !== "object") return { err: "tabelle mancanti" };
    for (const t of TABELLE) if (!Array.isArray(d.tabelle[t])) return { err: `tabella ${t} mancante` };
    const imp = await sha256(canonico(d.tabelle));
    if (imp !== d.sha256) return { err: "impronta SHA-256 diversa: file rovinato o modificato" };
    return { db: d };
  }

  const API = { TABELLE, controlla, canonico, sha256 };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.AdcDb = API;
})(typeof self !== "undefined" ? self : this);
