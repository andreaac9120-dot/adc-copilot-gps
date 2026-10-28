// Lettore della Scheda Treno PDF (SKT-M3M40) senza IA: traduzione fedele di lettori/leggi_scheda.py
// del database dati di linea. Usa la posizione delle parole sulla pagina (colonne a coordinate fisse del modulo RFI).
// Non legge i disegni (triangoli e puntini SX/DX, freccia del grado, zig-zag): lo dichiara nel risultato.
(function (root) {
  "use strict";
  const PP = typeof module !== "undefined" && module.exports ? require("./pdfparole.js") : root.PdfParole;
  const ORA = /^\d{1,2}\.\d{2}½?$/;
  const NUM = /^\d+(\.\d+)?$/;
  const PUNTO = /^(Cippo|Dev\.|Dev |Segn|V\.COD|SI COD|Seg\.|PBA|P\.L\.|RTB)/i;
  // confini delle colonne (punti, pagina con «Località» a x=204)
  const COL = [["grado", 0, 58], ["vls", 58, 92], ["vmarc", 92, 122], ["km", 122, 163],
               ["nome", 163, 300], ["orario", 300, 375], ["vill", 375, 425], ["simb", 425, 480]];

  const split = s => { const t = String(s).trim(); return t ? t.split(/\s+/) : []; };
  const pyRound = PP.pyRound;
  const round1 = x => parseFloat(x.toFixed(1));
  const reprLista = a => "[" + a.map(x => "'" + x + "'").join(", ") + "]";

  function fontTipo(fn) {
    fn = fn.toLowerCase();
    if (fn.includes("courier")) return "courier";
    if (fn.includes("italic")) return "corsivo";
    if (fn.includes("bold")) return "grassetto";
    return "normale";
  }
  function colDi(x, shift) {
    for (const [k, a, b] of COL) if (a + shift <= x && x < b + shift) return k;
    return null;
  }

  function intestazione(testo) {
    const h = {};
    let m = /Fascicolo Linee[\s\S]*?\n\s*([\d ]+?)\s{2,}/.exec(testo);
    if (m) h.fl = split(m[1]);
    m = /\n\s*[\d ]+\s+([0-9/]+)\s+Scheda n°\s+(\d+)\/(\d+)\s+(\S+)/.exec(testo);
    if (m) { h.treno = m[1].replace(/^\/+|\/+$/g, ""); h.pagina = +m[2]; h.pagine = +m[3]; h.sigla = m[4]; }
    m = /^\s*([PG]\d+%)\s*$/m.exec(testo) || /\b([PG]\d+%)/.exec(testo);
    if (m) h.freno = m[1];
    m = /Da:\s*(.+?)\s*$/m.exec(testo);
    if (m) h.da = m[1].replace(/\s{2,}.*/g, "").trim();
    m = /\bA:\s+(.+?)\s*$/m.exec(testo);
    if (m) h.a = m[1].replace(/\s{2,}.*/g, "").trim();
    m = /Dal:\s*(\S+)\s+([\s\S]+?)\n\s*Al:\s*(\S+)/.exec(testo);
    if (m) { h.valida_dal = m[1]; h.termine = m[2].trim(); h.valida_al = m[3]; }
    m = /Classificazione[\s\S]*?Prestazione[\s\S]*?\n\s*(\S+)\s+(\S+)\s*(\S*)/.exec(testo);
    if (m) { h.classificazione = m[1]; h.prestazione = m[2]; }
    m = /Int\. alla Sigla[\s\S]*?\n[\s\S]*?(E\d{3,4}\S*)\s+(RSC\S*)/.exec(testo);
    if (m) { h.mezzo_sigla = m[1]; h.rsc = m[2]; }
    m = /Valida per il treno del (\d{2}\/\d{2}\/\d{4})/.exec(testo);
    if (m) h.valida_per = m[1];
    return h;
  }

  // raggruppa parole ordinate per (round(top), x0) in righe con tolleranza 2.5 dal primo
  function gruppiRiga(ws) {
    const ord = ws.map((w, i) => [w, i]).sort((a, b) => pyRound(a[0].top) - pyRound(b[0].top) || a[0].x0 - b[0].x0 || a[1] - b[1]).map(a => a[0]);
    const g = [];
    for (const w of ord) {
      if (g.length && Math.abs(w.top - g[g.length - 1][0].top) <= 2.5) g[g.length - 1].push(w); else g.push([w]);
    }
    return g;
  }

  function righeScheda(P) {
    const parole = PP.parole(P.chars, ["fontname", "size"]);
    const ancora = parole.find(w => w.text === "Località" && w.top < 300);
    const shift = ancora ? ancora.x0 - 204 : 0;
    const topTab = ancora ? ancora.top + 15 : 205;
    const fw = parole.find(w => w.top > topTab && w.fontname.endsWith("CourierNewPS-BoldMT"));
    const fine = fw ? fw.top : 800;
    const corpo = parole.filter(w => topTab < w.top && w.top < fine - 2);
    for (const w of corpo) w.col = colDi(w.x0, shift);

    const righe = [];
    for (const g of gruppiRiga(corpo.filter(w => w.col === "nome"))) {
      const top = g[0].top;
      const testo = g.filter(w => !ORA.test(w.text) && w.text !== "M");
      const orariNome = g.filter(w => ORA.test(w.text)).map(w => w.text);
      const segno = testo.some(w => w.text === "°");
      let nome = testo.slice().map((w, i) => [w, i]).sort((a, b) => a[0].x0 - b[0].x0 || a[1] - b[1]).map(a => a[0])
        .filter(w => w.text !== "°").map(w => w.text).join(" ");
      nome = nome.replace(/\.{3,}/g, "").trim();
      const fw0 = testo.find(w => w.text !== "°");
      const font = fontTipo(fw0 ? fw0.fontname : "");
      const r = { nome, font, segno_grado: segno, tipo: (font === "courier" || PUNTO.test(nome)) ? "pt" : "loc", top: round1(top) };
      const vicine = corpo.filter(w => w.col !== "nome" && Math.abs(w.top - top) <= 4.5);
      for (const k of ["grado", "vls", "vmarc", "vill", "simb"]) {
        const v = vicine.filter(w => w.col === k).map(w => w.text);
        if (v.length) r[k] = v.join(" ");
      }
      const orari = orariNome.concat(corpo.filter(w => w.col === "orario" && -4 <= w.top - top && w.top - top <= 4.5).map(w => w.text));
      if (orari.length) r.orari = orari;
      if (g.concat(vicine).some(w => w.text === "M")) r.segno_M = true;
      const km = corpo.filter(w => w.col === "km" && -4.5 <= w.top - top && w.top - top <= 9 && NUM.test(w.text))
        .map((w, i) => [w, i]).sort((a, b) => a[0].top - b[0].top || a[1] - b[1]).map(a => a[0]);
      r.km = km.map(w => w.text);
      righe.push(r);
    }
    const usateTop = righe.map(r => r.top);
    const orfane = corpo.filter(w => ["grado", "vls", "vmarc", "vill", "simb"].includes(w.col) && !usateTop.some(t => Math.abs(w.top - t) <= 4.5)).map(w => w.text);
    const note = [];
    for (const riga of PP.testo(P).split("\n")) {
      const s = riga.trim();
      if (s.startsWith("Nel tratto") || s.startsWith("DALLE ORE") || /^\s*[a-z]\)/.test(s)) note.push(s);
    }
    return { righe, orfane, note };
  }

  function leggiM3(P, testo) {
    const parole = PP.parole(P.chars);
    const fisso = parole.find(w => w.text === "Fisso");
    const s = fisso ? fisso.x0 - 361 : 0;
    const C = [["n", 0, 48], ["sin", 48, 204], ["des", 204, 360], ["inizio", 360, 388], ["sp_da", 388, 412],
               ["sp_a", 412, 437], ["vel", 437, 465], ["lung", 465, 500], ["note", 500, 600]];
    const ch = parole.find(w => w.text === "chilom.");
    const testa = (ch ? ch.top : 170) + 15;
    const righe = []; let linea = null;
    for (const g of gruppiRiga(parole.filter(w => w.top > testa))) {
      const t = g.map(w => w.text).join(" ");
      if (t.startsWith("***")) break;
      const m = /====\s*Linea\s*:?\s*(.+?)\s*====/.exec(t);
      if (m) { linea = m[1].trim(); continue; }
      if (!/^\d+$/.test(g[0].text)) continue;
      const cel = {}; for (const [k] of C) cel[k] = [];
      for (const w of g) for (const [k, a, b] of C) if (a + s <= w.x0 && w.x0 < b + s) cel[k].push(w);
      const unisci = (ws, meta) => {
        if (!ws.length) return "";
        ws = ws.map((w, i) => [w, i]).sort((a, b) => a[0].x0 - b[0].x0 || a[1] - b[1]).map(a => a[0]);
        const sx = ws.filter(w => w.x0 < meta + s).map(w => w.text), dx = ws.filter(w => w.x0 >= meta + s).map(w => w.text);
        if (sx.length && dx.length && ws[0].x1 < meta + s - 5 && ws[ws.length - 1].x0 > meta + s + 5) return sx.join(" ") + " – " + dx.join(" ");
        return ws.map(w => w.text).join(" ");
      };
      const j = k => cel[k].map(w => w.text).join(" ");
      righe.push({ n: cel.n[0].text, linea, sinistro: unisci(cel.sin, 126), destro: unisci(cel.des, 283),
        inizio_cippo: j("inizio"), spostabile: [j("sp_da"), j("sp_a")], velocita: j("vel"), lunghezza_m: j("lung"),
        note: j("note").split("/") });
    }
    const piano = PP.testo(P).split("\n").map(r => r.trim()).join("\n");
    const note = {};
    for (const mm of piano.matchAll(/^([A-Z])\)([\s\S]+?)(?=^[A-Z]\)|^IL DIRIGENTE|$(?![\s\S]))/gm)) note[mm[1]] = split(mm[2]).join(" ");
    const m = /N\.\s*(\d{6,})/.exec(testo), lin = /LINEA\s+(.+?)\s{2,}IL/.exec(testo);
    const st = /STAZIONE DI:\s*(.+?)\s*$/m.exec(testo), dt = /\bIL\s+(\d{2}\/\d{2}\/\d{4})/.exec(testo);
    return { tipo: "M3", n: m ? m[1] : "", linea: lin ? lin[1].trim() : "", stazione: st ? st[1].trim() : "", data: dt ? dt[1] : "", righe, note };
  }

  function leggiM40(testo) {
    const m = /N\.\s*(\d{6,})/.exec(testo), lin = /Linea\s+(.+?)\n/.exec(testo), sez = /======\s*Linea\s+(.+?)\s*======/.exec(testo);
    const avvisi = [];
    for (const blocco of testo.split(/\n-{60,}\n/)) {
      const mm = /(\d+)\)\s*(Nella Località di|Tra le Località di)\s*:\s*([\s\S]+?)\n([\s\S]*)/.exec(blocco);
      if (mm) avvisi.push({ n: mm[1], loc: mm[3].trim(), txt: split(mm[4].replace(/^-{20,}$/gm, "").replace(/\*/g, "")).join(" ") });
    }
    const st = /Stazione di\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})/.exec(testo);
    return { tipo: "M40", n: m ? m[1] : "", linea: sez ? sez[1] : (lin ? lin[1].trim() : ""),
      stazione: st ? st[1].trim() : "", data: st ? st[2] : "", avvisi };
  }

  // doc: documento pdf.js; desc: descrittori dei font letti dai byte (PdfParole.descrittori, PRIMA di passare i byte a pdf.js)
  async function leggi(doc, desc) {
    const out = { pagine: [], righe: [], note: [], moduli: [], controlli: [],
      non_letto: "simboli disegnati delle colonne SX/DX (triangoli, puntini), freccia accanto al grado, zig-zag" };
    for (let i = 1; i <= doc.numPages; i++) {
      const P = await PP.caratteri(await doc.getPage(i), desc || {});
      const testo = PP.testo(P, true);
      if (testo.slice(0, 400).includes("Scheda Treno") && testo.includes("Fascicolo Linee")) {
        const h = intestazione(testo);
        h.pdf_pag = i;
        out.pagine.push(h);
        const { righe, orfane, note } = righeScheda(P);
        for (const r of righe) r.pag = i;
        if (out.righe.length && righe.length && righe[0].nome === out.righe[out.righe.length - 1].nome) {
          const prima = righe.shift(), ult = out.righe[out.righe.length - 1];
          for (const [k, v] of Object.entries(prima)) {
            const pieno = x => !(x === undefined || x === null || x === false || x === "" || (Array.isArray(x) && !x.length));
            if (k !== "pag" && k !== "top" && pieno(v) && !pieno(ult[k])) ult[k] = v;
          }
          (ult.ripetuta_pag = ult.ripetuta_pag || []).push(i);
        }
        out.righe.push(...righe);
        if (orfane.length) out.controlli.push(`pag. ${i}: valori senza riga: ${reprLista(orfane)}`);
        for (const n of note) if (!out.note.includes(n)) out.note.push(n);
      } else if (testo.slice(0, 600).includes("M3") && testo.includes("RALLENTAMENTI")) {
        out.moduli.push(leggiM3(P, testo));
      } else if (testo.includes("RIEPILOGO DEI MODULI")) {
        const piano = PP.testo(P);
        const m = /N\.\s*(\d{6,})/.exec(piano), tr = /TRATTO DI LINEA DA\s+(.+?)\s+N\./.exec(piano);
        const cons = [...piano.matchAll(/^\s*([A-Za-zÀ-ù.' ]+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/gm)];
        out.riepilogo = { n: m ? m[1] : "", tratto: tr ? tr[1].trim() : "",
          consegnati: cons.map(c => `${c[1].trim()}: M3 ${c[2]}, M40 ${c[3]}, M40DL ${c[4]}, M40 TELEC ${c[5]}`).join("; ") };
      } else if (/M\s?40/.test(testo.slice(0, 600)) && testo.includes("Si dà avviso")) {
        out.moduli.push(leggiM40(PP.testo(P)));
      }
    }
    const Pg = out.pagine;
    Pg.forEach((h, j) => { if (h.pagina !== j + 1) out.controlli.push(`pagina ${h.pdf_pag}: numerazione ${h.pagina} attesa ${j + 1}`); });
    for (const k of ["sigla", "freno", "termine", "fl"]) {
      const vals = new Set(Pg.map(h => JSON.stringify(h[k] === undefined ? null : h[k])));
      if (vals.size > 1) out.controlli.push(`intestazione: «${k}» diverso tra le pagine: {${[...vals].join(", ")}}`);
    }
    for (const r of out.righe) if (!r.km.length) out.controlli.push(`pag. ${r.pag}: «${r.nome}» senza progressiva`);
    out.intestazione = Pg.length ? Pg[0] : {};
    return out;
  }

  const API = { leggi, intestazione };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.LeggiScheda = API;
})(typeof self !== "undefined" ? self : this);
