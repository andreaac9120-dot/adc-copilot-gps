// Lettore della notifica Softrail «Info treno» (testo dell'email), senza IA:
// traduzione fedele di lettori/leggi_traccia.py. Non legge l'equipaggio (dati personali).
(function (root) {
  "use strict";
  const MESI = {};
  "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre".split(" ").forEach((m, i) => { MESI[m] = i + 1; });
  const pad = (n, k) => String(n).padStart(k, "0");

  // colonne separate da TAB; se i TAB sono diventati spazi, due o più spazi
  function colonne(riga) {
    if (riga.includes("\t")) return riga.split("\t").map(c => c.trim());
    return riga.trim().split(/\s{2,}/).map(c => c.trim());
  }
  // nome confrontabile: maiuscolo, senza punteggiatura né note tra parentesi
  function norm(s) { return s.toUpperCase().replace(/\(.*?\)/g, "").replace(/[^A-Z0-9]/g, ""); }

  function leggi(testo) {
    const righe = testo.split("\n").map(r => r.replace(/\r+$/, ""));
    const out = { treni: [], data: null, loco: [], dato_commerciale: null, tratte: [], controlli: [] };
    for (const r of righe) {
      const m = /Treno\s+([0-9A-Za-z/]+)\s+del\s+(\d{1,2})\s+([a-zà]+)\s+(\d{4})/i.exec(r);
      if (m) {
        out.treni = m[1].split("/").filter(t => t);
        const g = +m[2], mese = MESI[m[3].toLowerCase()], a = +m[4];
        if (mese) out.data = `${pad(a, 4)}-${pad(mese, 2)}-${pad(g, 2)}`;
        break;
      }
    }
    if (!out.treni.length) out.controlli.push("ERRORE: riga 'Treno … del …' non trovata");

    let sezione = null;
    for (const r of righe) {
      const s = r.trim();
      if (!s) continue;
      if (s.startsWith("Locomotive")) { sezione = "loco"; continue; }
      if (s.startsWith("Dato Commerciale")) { sezione = "commerciale"; continue; }
      if (s.startsWith("Equipaggio")) { sezione = "equipaggio"; continue; }
      if (s.startsWith("Posizione") && s.includes("Tratta")) { sezione = "tratte"; continue; }
      if (s.startsWith("Cordiali saluti")) { sezione = null; continue; }
      const c = colonne(r);
      if (sezione === "loco" && c[0] !== "Locomotiva") {
        const m = /^([A-Z]+\s?\d+)\s*-\s*(\S+)/.exec(c[0]);
        if (m && c.length >= 3) out.loco.push({ tipo: m[1].replace(/ /g, ""), numero: m[2], da: c[1], a: c[2] });
      } else if (sezione === "commerciale") {
        out.dato_commerciale = s;
      } else if (sezione === "tratte" && /^\d+$/.test(c[0])) {
        while (c.length < 5) c.push("");
        let [pos, tratta, cambio, part, arr] = c;
        if (!/^\d{1,2}:\d{2}$/.test(arr) && /^\d{1,2}:\d{2}$/.test(cambio)) { arr = part; part = cambio; cambio = ""; }
        const pezzi = tratta.split(" - ");
        if (pezzi.length !== 2) { out.controlli.push(`ERRORE: tratta ${pos} non divisibile in 'DA - A': «${tratta}»`); continue; }
        out.tratte.push({ pos: +pos, da: pezzi[0].trim(), a: pezzi[1].trim(), cambio_numero: cambio || null, partenza: part || null, arrivo: arr || null });
      }
    }
    const T = out.tratte;
    for (let i = 1; i < T.length; i++) {
      if (T[i].pos !== T[i - 1].pos + 1) out.controlli.push(`posizioni non consecutive: ${T[i - 1].pos} → ${T[i].pos}`);
      const a = norm(T[i - 1].a), d = norm(T[i].da);
      if (a !== d && !a.startsWith(d) && !d.startsWith(a)) out.controlli.push(`tratte non continue alla posizione ${T[i].pos}: «${T[i - 1].a}» ≠ «${T[i].da}»`);
    }
    if (T.length && out.loco.length && norm(out.loco[0].da).slice(0, 6) !== norm(T[0].da).slice(0, 6))
      out.controlli.push(`la prima locomotiva parte da «${out.loco[0].da}», il percorso da «${T[0].da}»`);
    let num = out.treni.length ? out.treni[0] : null;
    for (const t of T) { if (t.cambio_numero) num = t.cambio_numero; t.treno = num; }
    out.localita = T.length ? [T[0].da].concat(T.map(t => t.a)) : [];
    return out;
  }

  const API = { leggi, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.LeggiTraccia = API;
})(typeof self !== "undefined" ? self : this);
