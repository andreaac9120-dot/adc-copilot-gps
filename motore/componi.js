// Composizione del viaggio senza IA: traduzione fedele di lettori/componi_viaggio.py.
// Unisce traccia e Scheda Treno lette dai lettori e riconosce le località nel database dati di linea.
// Regole: confronto traccia ⇆ Scheda per nome; località della Scheda riconosciuta solo se progressiva (± 2 m)
// e nome coincidono; itinerario = sequenze di località sulla stessa linea (la linea che prosegue più a lungo);
// nessuna linea indovinata; colonna delle Sigle con stessa velocità e rango e percentuale non superiore.
(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./comune.js") : root.MotoreComune;

  const ESPANDI = [[/\bMI\b\.?/g, "MILANO "], [/\bVE\b\.?/g, "VENEZIA "], [/\bVR\b/g, "VERONA "], [/\bBIV\b/g, "BIVIO "],
    [/\bS\.\s?/g, "S "], [/\bPM\b/g, "PM "], [/\bP\.M\./g, "PM "], [/\bP\.C\./g, "PC "], [/\bG\.S\./g, "GRUPPO SCAMBI "],
    [/\bGS\b/g, "GRUPPO SCAMBI "], [/\bSMIST\w*/g, "SMISTAMENTO"], [/\bMARGH\w*/g, "MARGHERA"]];

  function norm(s) {
    s = s.toUpperCase().replace(/\(.*?\)/g, "").replace(/°/g, " ");
    for (const [a, b] of ESPANDI) s = s.replace(a, b);
    return s.replace(/[^A-Z0-9]/g, "");
  }
  function simile(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a))) return 0.95;
    return C.ratio(a, b);
  }
  // allineamento in ordine (programmazione dinamica): coppie (i, j) di nomi simili
  function allinea(A, B, soglia = 0.72) {
    const n = A.length, m = B.length;
    const S = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const sim = Array.from({ length: n }, (_, i) => B.map(b => simile(A[i], b)));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      const s = sim[i][j];
      S[i][j] = Math.max(S[i + 1][j], S[i][j + 1], s >= soglia ? S[i + 1][j + 1] + s : 0);
    }
    let i = 0, j = 0; const coppie = [];
    while (i < n && j < m) {
      const s = sim[i][j];
      if (s >= soglia && Math.abs(S[i][j] - (S[i + 1][j + 1] + s)) < 1e-9) { coppie.push([i, j]); i++; j++; }
      else if (S[i + 1][j] >= S[i][j + 1]) i++;
      else j++;
    }
    return coppie;
  }

  // Senza traccia: numeri treno (uno per pagina, senza ripetizioni consecutive) e data dalla Scheda.
  function tracciaDaScheda(S) {
    const treni = [];
    for (const p of S.pagine) { const t = p.treno; if (t && (!treni.length || treni[treni.length - 1] !== t)) treni.push(t); }
    let data = null;
    const vp = S.intestazione.valida_per;
    if (vp) { const [g, m_, a] = vp.split("/"); data = `${a}-${m_}-${g}`; }
    return { treni, data, loco: [], tratte: [], localita: [], controlli: [], da_scheda: true };
  }
  // «E494», «E 494», «E494.504», «E494-504» → E494 (lettere e prime cifre)
  function tipoLoco(testo) {
    const m = /^\s*([A-Za-z]+)\s*(\d+)/.exec(testo || "");
    return m ? m[1].toUpperCase() + m[2] : null;
  }
  // Locomotiva: quella indicata; altrimenti quella della traccia; senza traccia il mezzo intestatario della sigla (con avviso).
  function scegliLoco(Tr, S, locoUtente, R) {
    if (locoUtente && locoUtente.trim()) {
      const tipo = tipoLoco(locoUtente);
      if (!tipo) throw new Error(`locomotiva «${locoUtente}» non riconosciuta (scrivere ad es. E494 o E494.504)`);
      R.push(`LOCOMOTIVA: ${locoUtente.trim()} (indicata dall'utente)`);
      const tt = new Set(Tr.loco.map(l => l.tipo));
      if (tt.size && !tt.has(tipo)) R.push(`  ! ATTENZIONE: la traccia indica ${[...tt].sort().join(", ")}, è stata usata la locomotiva indicata (${tipo})`);
      return [{ tipo, etichetta: locoUtente.trim() }];
    }
    if (Tr.loco.length) return Tr.loco.map(l => ({ tipo: l.tipo, etichetta: `${l.tipo}-${l.numero}` }));
    const ms = S ? S.intestazione.mezzo_sigla : null, tipo = tipoLoco(ms);
    if (tipo) {
      R.push(`  ! LOCOMOTIVA presa dalla Scheda Treno: ${ms} è il mezzo intestatario della sigla, non necessariamente quello che traina il treno: verificare (o indicare la locomotiva)`);
      return [{ tipo, etichetta: `${ms} (mezzo intestatario della sigla)` }];
    }
    throw new Error("locomotiva non indicata e non presente né nella traccia né nella Scheda Treno");
  }

  // T: tabelle del database ({localita: [...], punti_linea: [...], sigle: [...]}); traccia (o null); scheda (o null); locomotiva indicata (facoltativa)
  function componi(T, Tr0, S, locoUtente) {
    if (!Tr0 && !S) throw new Error("serve la traccia o la Scheda Treno");
    const Tr = Tr0 || tracciaDaScheda(S);
    const R = [];
    const locDb = T.localita;
    const locPer = new Map(locDb.map(l => [l.loc_id, l]));
    const punti = T.punti_linea.filter(p => locPer.has(p.loc_id)).map(p => Object.assign({}, p, { nome: locPer.get(p.loc_id).nome }));
    const nomiDb = r => [r.nome].concat((r.alias || "").split("|").filter(a => a));

    if (Tr.da_scheda) {
      R.push(`TRACCIA: non fornita; treni ${Tr.treni.join("/")} del ${Tr.data === null ? "None" : Tr.data} presi dalla Scheda Treno`);
      if (!Tr.treni.length || !Tr.data) R.push("  ! ERRORE: numero treno o data non leggibili nella Scheda");
    } else {
      R.push(`TRACCIA: treni ${Tr.treni.join("/")} del ${Tr.data}; ${Tr.tratte.length} tratte; locomotive ` +
        Tr.loco.map(l => `${l.tipo}-${l.numero} (${l.da} → ${l.a})`).join(", "));
    }
    for (const c of Tr.controlli) R.push(`  ! traccia: ${c}`);
    let loco;
    try { loco = scegliLoco(Tr, S, locoUtente, R); }
    catch (e) { R.push(`  ! ERRORE: ${e.message}`); return { viaggio: null, rapporto: R, ok: false, errore: e.message }; }

    if (S) {
      const h = S.intestazione;
      const ps = v => (v === undefined || v === null ? "None" : String(v));   // come f"{...}" di Python
      R.push(`SCHEDA: treno ${ps(h.treno)} · sigla ${ps(h.sigla)} ${ps(h.freno)} · FL ${(h.fl || []).join(" ")} · ` +
        `valida per il ${ps(h.valida_per)} · mezzo intestatario della sigla ${ps(h.mezzo_sigla)} ${h.rsc !== undefined ? ps(h.rsc) : ""}`);
      for (const c of S.controlli) R.push(`  ! scheda: ${c}`);
      if (h.valida_per && !Tr.da_scheda) {
        const [g, m_, a] = h.valida_per.split("/");
        if (`${a}-${m_}-${g}` !== Tr.data) R.push(`  ! DISCREPANZA: Scheda valida per il ${h.valida_per}, traccia del ${Tr.data}`);
      }
      const tipiTraccia = new Set(loco.map(l => l.tipo));
      if (h.mezzo_sigla && !tipiTraccia.has(h.mezzo_sigla))
        R.push(`  ! ATTENZIONE: la sigla della Scheda è intestata a ${h.mezzo_sigla}, la locomotiva del treno è ${[...tipiTraccia].sort().join(", ")}: verificare che la Scheda sia quella giusta per il mezzo`);
      const tutte = S.righe, A = Tr.da_scheda ? [] : Tr.localita, B = tutte.map(r => r.nome);
      let cp = allinea(A, B);
      const extra = [];
      for (let k = 0; k + 1 < cp.length; k++) {
        const [i1, j1] = cp[k], [i2, j2] = cp[k + 1];
        const gi = []; for (let i = i1 + 1; i < i2; i++) gi.push(i);
        const gj = []; for (let j = j1 + 1; j < j2; j++) if (tutte[j].tipo === "loc") gj.push(j);
        if (gi.length && gi.length === gj.length) gi.forEach((i, x) => extra.push([i, gj[x]]));
      }
      for (const [i, j] of extra) R.push(`  ~ abbinate per posizione: «${A[i]}» (traccia) = «${B[j]}» (Scheda) → aggiungere l'alias nel database`);
      cp = cp.concat(extra).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const ia = new Set(cp.map(c => c[0])), jb = new Set(cp.map(c => c[1]));
      if (Tr.da_scheda) R.push("CONFRONTO traccia ⇆ Scheda: non eseguito (traccia non fornita)");
      else R.push(`CONFRONTO traccia ⇆ Scheda: ${cp.length} località in comune su ${A.length} (traccia) e ${B.length} (Scheda)`);
      A.forEach((a, i) => { if (!ia.has(i)) R.push(`  - solo nella traccia: «${a}»`); });
      B.forEach((b, j) => { if (A.length && !jb.has(j) && tutte[j].tipo === "loc") R.push(`  - solo nella Scheda: «${b}» (km ${tutte[j].km.join("/")})`); });
      for (const [i, j] of cp) tutte[j].nome_traccia = A[i];
    }

    // riconoscimento nel database
    const sequenza = [], puntiScheda = [];
    if (S) {
      let ultima = null;
      for (const r of S.righe) {
        const kms = r.km.map(k => parseFloat(k));
        const cand = [];
        for (const p of punti) {
          if (kms.some(k => Math.abs(p.km - k) <= 0.002)) {
            const l = locPer.get(p.loc_id);
            let sim = Math.max(...nomiDb(l).map(n => simile(r.nome, n)));
            if (r.nome_traccia) sim = Math.max(sim, Math.max(...nomiDb(l).map(n => simile(r.nome_traccia, n))));
            if (sim >= 0.6) cand.push([p.loc_id, p.linea_id, p.km]);
          }
        }
        if (r.tipo === "loc" || cand.length) {
          sequenza.push({ riga: r, cand });
          if (cand.length) ultima = cand[0][0];
        } else if (ultima && r.km.length) {
          const ps = { dopo: ultima, km: r.km[0], n: r.nome };
          for (const [k1, k2] of [["grado", "g"], ["vls", "v"], ["simb", "ind"]]) if (r[k1]) ps[k2] = r[k1];
          puntiScheda.push(ps);
        }
      }
    } else {
      for (const a_ of Tr.localita) {
        let cand = [];
        for (const l of locDb) {
          if (Math.max(...nomiDb(l).map(n => simile(a_, n))) >= 0.8)
            cand = cand.concat(punti.filter(p => p.loc_id === l.loc_id).map(p => [p.loc_id, p.linea_id, p.km]));
        }
        sequenza.push({ riga: { nome: a_, km: [] }, cand });
      }
    }

    const ric = sequenza.filter(s => s.cand.length);
    R.push(`DATABASE: località riconosciute ${ric.length} su ${sequenza.length}`);
    const mancanti = sequenza.filter(s => !s.cand.length).map(s => s.riga);
    if (mancanti.length) R.push("  Località non presenti nel database (da caricare): " + mancanti.map(m => `${m.nome} (${m.km.join("/")})`).join(", "));

    const su = (k, linea) => sequenza[k].cand.find(c => c[1] === linea) || null;
    const itinerario = [], scheda = {};
    let i = 0;
    while (i < sequenza.length) {
      if (!sequenza[i].cand.length) {
        if (itinerario.length) R.push(`  ! itinerario interrotto: «${sequenza[i].riga.nome}» non è nel database`);
        i++; continue;
      }
      const corse = new Map();
      for (const linea of new Set(sequenza[i].cand.map(c => c[1]))) {
        let j = i, verso = null;
        while (j + 1 < sequenza.length && su(j + 1, linea)) {
          const d = su(j + 1, linea)[2] - su(j, linea)[2];
          if (verso !== null && (d > 0) !== verso) break;
          verso = d > 0; j++;
        }
        corse.set(linea, j);
      }
      const migliore = Math.max(...corse.values());
      const scelte = [...corse].filter(([, j]) => j === migliore).map(([l]) => l);
      if (migliore === i) { i++; continue; }
      if (scelte.length > 1) {
        R.push(`  ! ${sequenza[i].riga.nome}: più linee possibili [${scelte.sort().map(x => "'" + x + "'").join(", ")}]: serve la scelta dell'utente`);
        break;
      }
      const linea = scelte[0];
      itinerario.push({ da: su(i, linea)[0], a: su(migliore, linea)[0], linea });
      i = migliore < sequenza.length - 1 ? migliore : sequenza.length;
    }
    for (const s of sequenza) {
      if (s.cand.length) {
        const r = s.riga, val = {};
        for (const [k1, k2] of [["grado", "g"], ["vls", "v"], ["simb", "ind"]]) if (r[k1]) val[k2] = r[k1];
        if (Object.keys(val).length) scheda[s.cand[0][0]] = val;
      }
    }
    for (let k = 0; k + 1 < itinerario.length; k++)
      if (itinerario[k].a !== itinerario[k + 1].da) R.push(`  ! itinerario non continuo tra ${itinerario[k].a} e ${itinerario[k + 1].da}`);

    // colonna delle Sigle
    let colonna = null;
    if (S && S.intestazione.sigla) {
      const m = /^M?(\d+)([ABCP])/.exec(S.intestazione.sigla);
      const perc = parseInt(String(S.intestazione.freno || "0").replace(/\D/g, "") || "0", 10) || 0;
      if (m) {
        const v = +m[1], rango = m[2], migliori = [], visti = new Set();
        for (const r of T.sigle) {
          const k = JSON.stringify([r.colonna, r.titolo]); if (visti.has(k)) continue; visti.add(k);
          const mt = /^\*?(\d+)([ABCP])\s+(\d+)%/.exec(r.titolo);
          if (mt && +mt[1] === v && mt[2] === rango && +mt[3] <= perc) migliori.push([+mt[3], r.colonna, r.titolo]);
        }
        if (migliori.length) {
          const cmp = (x, y) => (x[0] - y[0]) || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0) || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
          const best = migliori.reduce((a, b) => (cmp(b, a) > 0 ? b : a));
          colonna = best[1];
          R.push(`COLONNA SIGLE: ${colonna} (${best[2]}) per la sigla ${S.intestazione.sigla} ${S.intestazione.freno === undefined ? "None" : S.intestazione.freno}`);
        } else R.push("COLONNA SIGLE: nessuna colonna adatta tra quelle nel database");
      }
    }

    const viaggio = {
      treno: Tr.treni.length ? Tr.treni[0] : "?",
      treno_testo: Tr.treni.join("/"),
      data: Tr.data,
      categoria: "merci",
      loco,
      sigla: S ? `${S.intestazione.sigla || ""} ${S.intestazione.freno || ""}`.trim() : "",
      colonna_sigle: colonna || "",
      input: { tipo: S ? "scheda_treno" : "traccia", fase: S ? "completa" : "fase1_traccia",
        descrizione: "composto dal motore della PWA (" + (Tr.da_scheda ? "" : "traccia Softrail") + (S && !Tr.da_scheda ? " + " : "") + (S ? "Scheda Treno PDF" : "") + ")" },
      itinerario, scheda, punti_scheda: puntiScheda,
      prescrizioni: S ? { riepilogo: S.riepilogo === undefined ? null : S.riepilogo, moduli: S.moduli || [],
        fonte: `Scheda Treno SKT-M3M40 valida per il ${S.intestazione.valida_per || "?"}, moduli richiamati` } : null
    };
    R.push(`ITINERARIO per il generatore: ${itinerario.length} tratti ` + itinerario.map(t => `${t.da} → ${t.a} (${t.linea})`).join("; "));
    return { viaggio, rapporto: R, ok: itinerario.length > 0 };
  }

  const API = { componi, norm, simile, allinea, tipoLoco };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Componi = API;
})(typeof self !== "undefined" ? self : this);
