// Funzioni comuni del motore (lettori, composizione del viaggio, generatore), scritte per dare
// esattamente gli stessi risultati delle versioni Python del database dati di linea.
(function (root) {
  "use strict";
  // difflib.SequenceMatcher(None, a, b).ratio() di Python (senza autojunk: i nomi sono corti)
  function ratio(a, b) {
    const la = a.length, lb = b.length;
    if (!la && !lb) return 1;
    const b2j = new Map();
    for (let j = 0; j < lb; j++) { const c = b[j]; if (!b2j.has(c)) b2j.set(c, []); b2j.get(c).push(j); }
    // (autojunk di difflib solo con b di almeno 200 caratteri)
    function longest(alo, ahi, blo, bhi) {
      let besti = alo, bestj = blo, best = 0, j2len = new Map();
      for (let i = alo; i < ahi; i++) {
        const nj = new Map();
        for (const j of (b2j.get(a[i]) || [])) {
          if (j < blo) continue;
          if (j >= bhi) break;
          const k = (j2len.get(j - 1) || 0) + 1;
          nj.set(j, k);
          if (k > best) { besti = i - k + 1; bestj = j - k + 1; best = k; }
        }
        j2len = nj;
      }
      return [besti, bestj, best];
    }
    const coda = [[0, la, 0, lb]]; let M = 0;
    while (coda.length) {
      const [alo, ahi, blo, bhi] = coda.pop();
      const [i, j, k] = longest(alo, ahi, blo, bhi);
      if (k) {
        M += k;
        if (alo < i && blo < j) coda.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) coda.push([i + k, ahi, j + k, bhi]);
      }
    }
    return 2 * M / (la + lb);
  }
  // f"{x:.3f}"
  const f3 = x => x.toFixed(3);
  // f"{x:g}" (6 cifre significative, senza zeri finali)
  function fg(x) {
    if (x === 0) return "0";
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e < -4 || e >= 6) { let [m, ex] = x.toExponential(5).split("e"); m = m.replace(/\.?0+$/, ""); const n = parseInt(ex, 10); return `${m}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`; }
    return String(parseFloat(x.toPrecision(6)));
  }
  // float() di Python su un testo (None se non è un numero)
  function pyFloat(s) {
    if (typeof s !== "string") return null;
    return /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(s) ? parseFloat(s) : null;
  }
  // valori unici nell'ordine (dict.fromkeys)
  const unici = a => [...new Set(a)];
  const has = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
  const get = (o, k) => (has(o, k) ? o[k] : undefined);

  const API = { ratio, f3, fg, pyFloat, unici, has, get };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MotoreComune = API;
})(typeof self !== "undefined" ? self : this);
