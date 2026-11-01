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
  // F15: controllo della struttura prima di installare il database. L'impronta prova solo che il file non è
  // cambiato, non che sia utilizzabile: qui si controllano righe, tipi, chiavi, riferimenti e conteggi.
  const NUMERI = ["km", "km_da", "km_a", "lat", "lon"];
  const RIF = { fonte: "fonti", linea_id: "linee", loc_id: "localita", presso_loc: "localita", aff_id: "affiancamenti", verso_linea: "linee" };
  const CHIAVI = { fonti: ["fonte_id"], linee: ["linea_id"], localita: ["loc_id"], affiancamenti: ["aff_id"],
    punti_linea: ["linea_id", "loc_id"], aff_linee: ["aff_id", "linea_id"] };
  const NON_VUOTE = ["fonti", "linee", "localita", "punti_linea"];
  function struttura(d) {
    const T = d.tabelle, err = [];
    const testo = v => typeof v === "string" && v.trim() !== "";
    if (!d.conteggi || typeof d.conteggi !== "object") return ["conteggi mancanti"];
    for (const t of TABELLE) {
      if (T[t].length !== d.conteggi[t]) err.push(`${t}: ${T[t].length} righe, dichiarate ${d.conteggi[t]}`);
      T[t].forEach((r, i) => { if (!r || typeof r !== "object" || Array.isArray(r)) err.push(`${t} riga ${i + 1}: non è una riga valida`); });
    }
    if (err.length) return err;
    for (const t of NON_VUOTE) if (!T[t].length) err.push(`tabella ${t} vuota`);
    const ids = {};
    for (const [t, k] of Object.entries(CHIAVI)) {
      const visti = new Set();
      T[t].forEach((r, i) => {
        if (!k.every(c => testo(r[c]))) return err.push(`${t} riga ${i + 1}: ${k.join("/")} mancante`);
        const v = k.map(c => r[c]).join("|");
        if (visti.has(v)) err.push(`${t}: ${v} ripetuto`);
        visti.add(v);
      });
      if (k.length === 1) ids[t] = visti;
    }
    for (const t of TABELLE) T[t].forEach((r, i) => {
      const dove = `${t} riga ${i + 1}`;
      if ("st" in r && !["V", "R", "I", "N"].includes(r.st)) err.push(`${dove}: stato «${r.st}» non ammesso`);
      for (const c of NUMERI) if (c in r && r[c] !== null && !(typeof r[c] === "number" && isFinite(r[c]))) err.push(`${dove}: ${c} non numerico`);
      if (typeof r.km_da === "number" && typeof r.km_a === "number" && r.km_da > r.km_a) err.push(`${dove}: km_da maggiore di km_a`);
      for (const [c, rt] of Object.entries(RIF))
        if (c in r && r[c] !== null && !(t === rt && CHIAVI[rt][0] === c) && !ids[rt].has(r[c])) err.push(`${dove}: ${c} «${r[c]}» inesistente`);
    });
    T.localita.forEach((r, i) => { if (!testo(r.nome)) err.push(`localita riga ${i + 1}: nome mancante`); });
    T.punti_linea.forEach((r, i) => { if (typeof r.km !== "number") err.push(`punti_linea riga ${i + 1}: km mancante`); });
    return err;
  }

  // Controlla il file: formato, versione, tabelle, struttura e impronta. Restituisce { db } oppure { err }.
  async function controlla(txt) {
    let d;
    try { d = JSON.parse(txt); } catch (_) { return { err: "file non leggibile (JSON non valido)" }; }
    if (!d || d.formato !== "adc-copilot-database") return { err: "non è un database ADC COPILOT (formato diverso)" };
    if (d.versione_formato !== 1) return { err: `versione del formato ${d.versione_formato} non supportata da questa app` };
    if (typeof d.versione !== "string" || !/^\d{8}-\d{4}$/.test(d.versione)) return { err: "versione del database mancante" };
    if (!d.tabelle || typeof d.tabelle !== "object") return { err: "tabelle mancanti" };
    for (const t of TABELLE) if (!Array.isArray(d.tabelle[t])) return { err: `tabella ${t} mancante` };
    const e = struttura(d);
    if (e.length) return { err: `database non utilizzabile: ${e.slice(0, 5).join("; ")}${e.length > 5 ? ` (e altri ${e.length - 5} problemi)` : ""}` };
    const imp = await sha256(canonico(d.tabelle));
    if (imp !== d.sha256) return { err: "impronta SHA-256 diversa: file rovinato o modificato" };
    return { db: d };
  }

  const API = { TABELLE, controlla, canonico, sha256, struttura };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.AdcDb = API;
})(typeof self !== "undefined" ? self : this);
