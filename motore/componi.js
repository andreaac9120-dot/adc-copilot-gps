// Composizione del viaggio senza IA: traduzione fedele di lettori/componi_viaggio.py.
// Unisce traccia e Scheda Treno lette dai lettori e riconosce le località nel database dati di linea.
// Regole: confronto traccia ⇆ Scheda per nome; località della Scheda riconosciuta solo se progressiva (± 2 m)
// e nome coincidono; itinerario = sequenze di località sulla stessa linea (la linea che prosegue più a lungo);
// nessuna linea indovinata; colonna delle Sigle con stessa velocità e rango e percentuale non superiore.
// 1.0.43: l'indicatore di partenza della Scheda sceglie la linea (tabella indicatori); progressiva diversa
// dal database accettata solo se una discrepanza aperta della linea riporta le due progressive (RICOSTRUITA).
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
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;   // 1.0.40: uguale vince sul prefisso («TORINO STURA» / «TORINO STURA ORIGINE AV»)
    if (na.length >= 5 && nb.length >= 5 && (na.startsWith(nb) || nb.startsWith(na))) return 0.95;
    const r = C.ratio(na, nb);
    // 1.0.48: nome abbreviato parola per parola (Scheda 60755 del 19/11/2026: «S. Ant. di Sal.» = S. Antonino di Saluggia,
    // «Rho Dev.E.L.NO»): sotto il prefisso (0,95) e l'uguaglianza, così non cambia la scelta tra nomi già simili
    return r < 0.9 && (abbreviato(a, b) || abbreviato(b, a)) ? 0.9 : r;
  }
  // parole del nome senza accenti, punti e apostrofi («Sant'Antonino» → SANT ANTONINO, «Santhià» → SANTHIA)
  function parole(s) {
    s = String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[`\u00b4']/g, " ").toUpperCase().replace(/\(.*?\)/g, " ").replace(/°/g, " ");
    for (const [x, y] of ESPANDI) s = s.replace(x, y);
    return s.split(/[^A-Z0-9]+/).filter(w => w);
  }
  // ogni parola di «corto» è l'inizio della parola corrispondente di «lungo», stesse parole e stesso ordine;
  // almeno due parole e cinque lettere in tutto (una sola sigla come «S» o «E» non basta)
  function abbreviato(corto, lungo) {
    const a = parole(corto), b = parole(lungo);
    if (a.length < 2 || a.length !== b.length || a.join("").length < 5) return false;
    return a.every((w, i) => b[i].startsWith(w)) && a.some((w, i) => w !== b[i]);
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
    const vp = (S.pagine.find(p => p.valida_per) || {}).valida_per || S.intestazione.valida_per;
    if (vp) { const [g, m_, a] = vp.split("/"); data = `${a}-${m_}-${g}`; }
    // mezzi intestatari della sigla pagina per pagina (es. DE18 Sannazzaro → Alessandria Sm, poi E494 fino a Chiasso Sm):
    // come le locomotive della traccia, ognuno vale solo sul suo tratto (da → a)
    const mezzi = [];
    for (const p of S.pagine) {
      const tipo = tipoLoco(p.mezzo_sigla);
      if (!tipo) continue;
      if (mezzi.length && mezzi[mezzi.length - 1].tipo === tipo) mezzi[mezzi.length - 1].a = p.a || mezzi[mezzi.length - 1].a;
      else mezzi.push({ tipo, numero: "", da: p.da, a: p.a, da_scheda: true });
    }
    return { treni, data, loco: mezzi, tratte: [], localita: [], controlli: [], da_scheda: true };
  }
  // PL, P.L.A., Plp e RTB non si registrano (scheda 00c): l'utente li legge dalle immagini delle fiancate principali
  const NO_PL = /^\s*(P\.?\s?L\.?(\s?A\.?)?(\s|$|km)|Plp|R\.?T\.?B\.?)/i;
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
    // F04: dalla traccia anche il tratto percorso da ogni locomotiva (da → a), risolto più sotto sull'itinerario
    if (Tr.loco.length) {
      if (Tr.loco.some(l => l.da_scheda))
        R.push("  ! LOCOMOTIVA presa dalla Scheda Treno: è il mezzo intestatario della sigla di ogni pagina, non necessariamente quello che traina il treno: verificare (o indicare la locomotiva)");
      return Tr.loco.map(l => ({ tipo: l.tipo, etichetta: l.numero ? `${l.tipo}-${l.numero}` : `${l.tipo} (intestatario della sigla)`, da: l.da, a: l.a }));
    }
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
    const R = [], discrepanze = [];
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
      // Identità dei documenti (F03): data e numeri treno della Scheda devono essere quelli della traccia.
      // Un'incompatibilità ferma la composizione: i valori della Scheda di un altro treno o giorno non si uniscono.
      const ferma = msg => { R.push(`  ! ERRORE: ${msg}`); return { viaggio: null, rapporto: R, ok: false, errore: msg }; };
      const dateScheda = [...new Set(S.pagine.map(p => p.valida_per).filter(x => x))];
      if (dateScheda.length > 1) return ferma(`le pagine della Scheda Treno sono valide per date diverse (${dateScheda.join(", ")}): usare la Scheda di un solo treno`);
      if (h.valida_per && !Tr.da_scheda) {
        const [g, m_, a] = h.valida_per.split("/");
        if (`${a}-${m_}-${g}` !== Tr.data)
          return ferma(`Scheda Treno valida per il ${h.valida_per}, traccia del ${Tr.data}: non sono lo stesso viaggio (caricare la Scheda giusta, oppure generare con uno solo dei due documenti)`);
      }
      if (!Tr.da_scheda) {
        const nt = x => String(x).replace(/^0+(?=\d)/, "");
        const numTraccia = new Set(Tr.treni.concat(Tr.tratte.map(t => t.cambio_numero).filter(x => x)).map(nt));
        const numScheda = [...new Set(S.pagine.flatMap(p => String(p.treno || "").split("/")).filter(x => x).map(nt))];
        const estranei = numScheda.filter(n => !numTraccia.has(n));
        if (numScheda.length && estranei.length === numScheda.length)
          return ferma(`la Scheda Treno è del treno ${numScheda.join("/")}, la traccia del treno ${[...numTraccia].join("/")}: non sono lo stesso viaggio (caricare la Scheda giusta, oppure generare con uno solo dei due documenti)`);
        if (estranei.length) {
          const d = `numeri treno della Scheda non presenti nella traccia: ${estranei.join(", ")} (traccia: ${[...numTraccia].join("/")})`;
          R.push(`  ! DISCREPANZA: ${d}`); discrepanze.push(d);
        }
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
    const lineaPer = new Map((T.linee || []).map(l => [l.linea_id, l]));
    const lineeDisc = new Map();   // linea → discrepanze aperte (1.0.43)
    for (const d of (T.discrepanze || []))
      if (d.linea_id && /^aperta/i.test(d.stato || "")) lineeDisc.set(d.linea_id, (lineeDisc.get(d.linea_id) || []).concat({ disc_id: d.disc_id, testo: d.testo || "" }));
    if (S) {
      let ultima = null;
      S.righe.forEach((r, ord) => {
        const kms = r.km.map(k => parseFloat(k));
        const cand = [];
        for (const p of punti) {
          if (kms.some(k => Math.abs(p.km - k) <= 0.002 + 1e-9)) {
            const l = locPer.get(p.loc_id);
            let sim = Math.max(...nomiDb(l).map(n => simile(r.nome, n)));
            if (r.nome_traccia) sim = Math.max(sim, Math.max(...nomiDb(l).map(n => simile(r.nome_traccia, n))));
            if (sim >= 0.6) cand.push([p.loc_id, p.linea_id, p.km, sim]);
          }
        }
        // a parità di progressiva vince il nome più simile (es. «MILANO ROGORED» 0,000 non è Mi Smistamento 0,000)
        if (cand.length) {
          const smax = Math.max(...cand.map(c => c[3]));
          const tenuti = cand.filter(c => c[3] >= smax - 1e-9).map(c => c.slice(0, 3));
          cand.length = 0; cand.push(...tenuti);
        }
        // 1.0.43: progressiva della Scheda diversa da quella del database su una linea con DISCREPANZA APERTA
        // (es. D_NO_BOSCH_KM: Scheda e FL 22 Novara 0,170 – Novara Boschetto 0,495, database dal FL 13 0,090 – 0,430).
        // Solo località, nome quasi uguale (≥ 0,9), scarto ≤ 100 m, linee senza riscontro esatto: tratto RICOSTRUITO.
        if (r.tipo === "loc") {
          const lineeEsatte = new Set(cand.map(c => c[1]));
          const approx = [];
          for (const p of punti) {
            if (lineeEsatte.has(p.linea_id) || !lineeDisc.has(p.linea_id)) continue;
            const vicini = r.km.filter(k => Math.abs(p.km - parseFloat(k)) > 0.002 + 1e-9 && Math.abs(p.km - parseFloat(k)) <= 0.1 + 1e-9);
            // la discrepanza deve riportare entrambe le progressive (database e Scheda), es. «0,430» e «0,495»
            const virg = k => parseFloat(k).toFixed(3).replace(".", ",");
            const disc = (lineeDisc.get(p.linea_id) || []).filter(d => d.testo.includes(virg(p.km)) && vicini.some(k => d.testo.includes(virg(k))));
            if (!disc.length) continue;
            const l = locPer.get(p.loc_id);
            const sim = Math.max(...nomiDb(l).map(n => simile(r.nome, n)));
            if (sim >= 0.9 && (!cand.length || cand.some(c => c[0] === p.loc_id))) approx.push([p.loc_id, p.linea_id, p.km, sim, disc.map(d => d.disc_id)]);
          }
          if (approx.length) {
            const smax = Math.max(...approx.map(c => c[3]));
            for (const c of approx.filter(c => c[3] >= smax - 1e-9)) {
              cand.push([c[0], c[1], c[2], true]);
              R.push(`  ~ ${r.nome} (km ${r.km.join("/")}) = ${locPer.get(c[0]).nome} km ${C.fg(c[2])} della linea ${c[1]}: progressiva diversa, ` +
                `discrepanza aperta ${c[4].join(", ")}: RICOSTRUITA, da confermare sul FL`);
            }
          }
        }
        if (r.tipo === "loc" || cand.length) {
          sequenza.push({ riga: r, cand, ord });
          if (cand.length) ultima = sequenza.length - 1;   // indice dell'ultima località riconosciuta
        } else if (ultima !== null && r.km.length && !NO_PL.test(r.nome || "")) {
          const ps = { dopo: ultima, km: r.km[0], n: r.nome, ord };   // indice della località: diventa l'id del passaggio più sotto
          for (const [k1, k2] of [["grado", "g"], ["vls", "v"], ["simb", "ind"]]) if (r[k1]) ps[k2] = r[k1];
          puntiScheda.push(ps);
        }
      });
    } else {
      for (const a_ of Tr.localita) {
        let cand = [];
        // 1.0.40: come con la Scheda, a parità vince il nome più simile (es. «TORINO STURA» non è Torino P. Susa, 0,82)
        const sims = new Map(locDb.map(l => [l.loc_id, Math.max(...nomiDb(l).map(n => simile(a_, n)))]));
        const smax = Math.max(0, ...sims.values());
        for (const l of locDb) {
          const s_ = sims.get(l.loc_id);
          if (s_ >= 0.8 && s_ >= smax - 1e-9)
            cand = cand.concat(punti.filter(p => p.loc_id === l.loc_id).map(p => [p.loc_id, p.linea_id, p.km]));
        }
        sequenza.push({ riga: { nome: a_, km: [] }, cand });
      }
    }

    // 1.0.50: TRATTO CON PROGRESSIVA LOCALE della Scheda (Scheda 67069/68918 del 25/11/2026, FL 2 Torino p.128 e p.212:
    // il solo binario pari Bussoleno – Salbertrand ha progressive proprie, Bussoleno 43,166/0,000 → P.C. Meana 7,650 →
    // Chiomonte 15,079 → Exilles 21,992 → Salbertrand 25,945/66,809). Il database (m38) tiene di proposito quel tratto
    // sulla linea Modane – Q. Zappata con le progressive del binario di sinistra in senso dispari (Meana 50,523 …),
    // quindi le località intermedie non erano riconosciute e l'itinerario restava PARZIALE. Fra due località riconosciute
    // a e b della stessa linea L, le località intermedie si abbinano per nome alle località di L solo se TUTTE valgono:
    //  - la Scheda stampa la progressiva doppia in a (la prima è di L, l'ultima no: si passa al riferimento locale) e in
    //    b (l'ultima è di L, la prima no: si torna su L);
    //  - ogni località intermedia ha una progressiva dentro il riferimento locale, in ordine, e il nome (≥ 0,8, il più
    //    simile e una sola località) di una località di L fra a e b, nello stesso ordine lungo L;
    //  - ogni altra riga della Scheda fra a e b ha la progressiva nel riferimento locale o su L fra a e b;
    //  - la linea che soddisfa tutto è una sola.
    // Le località abbinate prendono la progressiva del database (L); il rapporto le segna RICOSTRUITE, da confermare sul FL.
    const vicino = (x, y) => Math.abs(x - y) <= 0.002 + 1e-9;
    const dentro = (v, x, y) => Math.min(x, y) - 1e-9 <= v && v <= Math.max(x, y) + 1e-9;
    const tratLocali = [];   // [a, b, L, inizio e fine del riferimento locale]
    if (S) for (let a = 0; a < sequenza.length; a++) {
      if (!sequenza[a].cand.length) continue;
      let b = a + 1; while (b < sequenza.length && !sequenza[b].cand.length) b++;
      if (b >= sequenza.length || b === a + 1) continue;
      const ka = (sequenza[a].riga.km || []).map(parseFloat), kb = (sequenza[b].riga.km || []).map(parseFloat);
      if (ka.length < 2 || kb.length < 2) continue;
      const loc0 = ka[ka.length - 1], loc1 = kb[0];
      if (vicino(loc0, loc1)) continue;
      const trovate = [];
      for (const L of new Set(sequenza[a].cand.map(c => c[1]))) {
        const pa = sequenza[a].cand.find(c => c[1] === L), pb = sequenza[b].cand.find(c => c[1] === L);
        if (!pb || vicino(pa[2], pb[2])) continue;
        if (!vicino(pa[2], ka[0]) || vicino(pa[2], loc0)) continue;                 // in a si lascia L
        if (!vicino(pb[2], kb[kb.length - 1]) || vicino(pb[2], loc1)) continue;     // in b si torna su L
        const cresceL = pb[2] > pa[2], cresceLoc = loc1 > loc0;
        const avanti = (da, x, cresce) => (cresce ? x > da + 1e-9 : x < da - 1e-9);
        const abbinate = [];
        let ok = true, ultL = pa[2], ultLoc = loc0;
        for (let x = a + 1; x < b && ok; x++) {
          const r = sequenza[x].riga;
          const kl = (r.km || []).map(parseFloat).find(v => avanti(ultLoc, v, cresceLoc) && dentro(v, loc0, loc1));
          if (kl === undefined) { ok = false; break; }
          const vicini = punti.filter(p => p.linea_id === L && avanti(ultL, p.km, cresceL) && avanti(p.km, pb[2], cresceL))
            .map(p => [p, Math.max(...nomiDb(locPer.get(p.loc_id)).map(n => simile(r.nome, n)))]).filter(([, s_]) => s_ >= 0.8);
          const smax = Math.max(0, ...vicini.map(([, s_]) => s_));
          const migliori = vicini.filter(([, s_]) => s_ >= smax - 1e-9);
          if (!migliori.length || new Set(migliori.map(([p]) => p.loc_id)).size !== 1 || migliori.length !== 1) { ok = false; break; }
          const p = migliori[0][0];
          abbinate.push([x, p, kl]); ultL = p.km; ultLoc = kl;
        }
        if (!ok) continue;
        const altre = S.righe.slice(sequenza[a].ord + 1, sequenza[b].ord)
          .filter(r => r.km.length && !NO_PL.test(r.nome || "") && !abbinate.some(([x]) => sequenza[x].riga === r));
        if (!altre.every(r => r.km.some(v => dentro(parseFloat(v), loc0, loc1) || dentro(parseFloat(v), pa[2], pb[2])))) continue;
        trovate.push({ L, abbinate, pa, pb });
      }
      if (trovate.length !== 1) continue;
      const { L, abbinate, pa, pb } = trovate[0];
      for (const [x, p, kl] of abbinate) {
        sequenza[x].cand = [[p.loc_id, L, p.km]];
        R.push(`  ~ ${sequenza[x].riga.nome} (km ${C.fg(kl)} della Scheda, progressiva locale fra ${sequenza[a].riga.nome} e ` +
          `${sequenza[b].riga.nome}) = ${p.nome} km ${C.fg(p.km)} della linea ${L}: RICOSTRUITA, da confermare sul FL`);
      }
      tratLocali.push([a, b, L, loc0, loc1, pa[2], pb[2], abbinate.map(([x, , kl]) => [x, kl])]);
      a = b - 1;
    }
    // i punti della Scheda dentro un tratto con progressiva locale seguono l'ultima località riconosciuta che li precede;
    // la progressiva locale non è della linea: il punto non si colloca su L (niente km per le prescrizioni)
    for (const [a, b, , loc0, loc1, kmA, kmB] of tratLocali)
      for (const ps of puntiScheda) {
        if (ps.ord <= sequenza[a].ord || ps.ord >= sequenza[b].ord) continue;
        let d = sequenza.findIndex(s => s.ord > ps.ord) - 1; if (d < 0) d = sequenza.length - 1;
        while (d > a && !sequenza[d].cand.length) d--;
        ps.dopo = d;
        const v = parseFloat(ps.km);
        if (dentro(v, loc0, loc1) && !dentro(v, kmA, kmB)) ps.km_locale = true;
      }

    const ric = sequenza.filter(s => s.cand.length);
    R.push(`DATABASE: località riconosciute ${ric.length} su ${sequenza.length}`);
    const mancanti = sequenza.filter(s => !s.cand.length).map(s => s.riga);
    if (mancanti.length) R.push("  Località non presenti nel database (da caricare): " + mancanti.map(m => `${m.nome} (${m.km.join("/")})`).join(", "));

    const su = (k, linea) => sequenza[k].cand.find(c => c[1] === linea) || null;
    // 1.0.48: prossima località riconosciuta sulla linea dopo j. Le località della Scheda NON nel database che stanno
    // in mezzo non interrompono il tratto se la loro progressiva della Scheda cade fra le due località riconosciute
    // della stessa linea (es. «Rho Dev.E.L.NO» km 13,963 fra Rho 16,348 e Rho Fiera 12,618): la linea la danno le
    // due località riconosciute, la riga resta nella scheda come punto della Scheda. Prima il tratto si spezzava e il
    // generatore si fermava con «itinerario non continuo» (nessun pacchetto).
    const prossima = (j, linea) => {
      let k = j + 1;
      while (k < sequenza.length && !sequenza[k].cand.length) k++;
      if (k >= sequenza.length || !su(k, linea)) return null;
      const lo = Math.min(su(j, linea)[2], su(k, linea)[2]), hi = Math.max(su(j, linea)[2], su(k, linea)[2]);
      for (let x = j + 1; x < k; x++)
        if (!(sequenza[x].riga.km || []).some(v => lo < parseFloat(v) && parseFloat(v) < hi)) return null;
      return k;
    };
    const saltate = [];   // località non nel database tenute dentro un tratto: [indice, linea]
    const itinerario = [], scheda = {}, estremi = [];   // estremi: indici in «sequenza» di inizio e fine di ogni tratto

    // 1.0.49: GIUNZIONE fra due linee in un punto che la Scheda non stampa (Scheda 67069/68918 del 25/11/2026:
    // Alessandria – Ponte Tanaro 89,420 sulla linea «Cippo 88,52 – Alessandria», Solero 81,843 sulla linea «Torino P.N. –
    // Alessandria»; le due linee del database si uniscono al Cippo km 88,52, che la Scheda non riporta: prima vuoto e
    // ITINERARIO PARZIALE). Il passaggio dalla linea A di i alla linea B della località riconosciuta seguente k si
    // ricostruisce solo se TUTTE queste condizioni valgono, altrimenti il vuoto resta:
    //  - fra i e k non c'è nessuna località della Scheda non riconosciuta, e k non è sulla linea A;
    //  - nel database A e B hanno una località comune g (diversa da i e k) con la STESSA progressiva sulle due linee
    //    (± 2 m): la Scheda stampa le progressive doppie, quindi un cambio di numerazione non stampato non si indovina;
    //  - i → g su A e g → k su B vanno nello stesso senso, che è anche quello del tratto che arriva a i su A;
    //  - ogni riga della Scheda fra i e k (cippi, deviatoi…) ha una progressiva sul percorso i → g → k;
    //  - la giunzione è una sola.
    // Il passaggio è segnato RICOSTRUITO, da confermare sul FL.
    const kmPunto = new Map();
    for (const p of punti) { const key = p.linea_id + "\u0000" + p.loc_id; if (!kmPunto.has(key)) kmPunto.set(key, p.km); }
    const kmSu = (linea, loc) => kmPunto.get(linea + "\u0000" + loc);
    const lineeDi = new Map();
    for (const p of punti) { if (!lineeDi.has(p.loc_id)) lineeDi.set(p.loc_id, new Set()); lineeDi.get(p.loc_id).add(p.linea_id); }
    const giunzione = i => {
      const k = i + 1;
      if (k >= sequenza.length || !sequenza[k].cand.length || !S) return null;
      const ordI = sequenza[i].ord, ordK = sequenza[k].ord;
      const inMezzo = S.righe.slice(ordI + 1, ordK).filter(r => r.km.length && !NO_PL.test(r.nome || ""));
      const tra = (v, a, b) => Math.min(a, b) - 0.002 - 1e-9 <= v && v <= Math.max(a, b) + 0.002 + 1e-9;
      const ultimo = itinerario[itinerario.length - 1];
      const trovate = [];
      for (const A of new Set(sequenza[i].cand.map(c => c[1]))) {
        if (su(k, A)) continue;
        const kAi = su(i, A)[2], locI = su(i, A)[0];
        let versoPrima = null;
        if (ultimo && ultimo.linea === A && ultimo.a === locI) versoPrima = kAi > kmSu(A, ultimo.da);
        for (const B of new Set(sequenza[k].cand.map(c => c[1]))) {
          if (B === A) continue;
          const kBk = su(k, B)[2], locK = su(k, B)[0];
          for (const [g, linee] of lineeDi) {
            if (g === locI || g === locK || !linee.has(A) || !linee.has(B)) continue;
            const kAg = kmSu(A, g), kBg = kmSu(B, g);
            if (Math.abs(kAg - kBg) > 0.002 + 1e-9) continue;
            const dA = kAg - kAi, dB = kBk - kBg;
            if (Math.abs(dA) <= 1e-9 || Math.abs(dB) <= 1e-9 || (dA > 0) !== (dB > 0)) continue;
            if (versoPrima !== null && versoPrima !== (dA > 0)) continue;
            if (!inMezzo.every(r => r.km.some(v => tra(parseFloat(v), kAi, kAg) || tra(parseFloat(v), kBg, kBk)))) continue;
            trovate.push({ A, B, g, k, kAg });
          }
        }
      }
      return trovate.length === 1 ? trovate[0] : null;
    };
    let ingresso = null;   // giunzione appena ricostruita: il tratto da k parte da g sulla linea B

    let i = 0, ambigua = null;
    while (i < sequenza.length) {
      if (!sequenza[i].cand.length) {
        if (itinerario.length) R.push(`  ! itinerario interrotto: «${sequenza[i].riga.nome}» non è nel database`);
        i++; continue;
      }
      const forzata = ingresso && ingresso.k === i ? ingresso : null;
      ingresso = null;
      const corse = new Map();
      for (const linea of forzata ? [forzata.B] : new Set(sequenza[i].cand.map(c => c[1]))) {
        let j = i, verso = null, k;
        while ((k = prossima(j, linea)) !== null) {
          const d = su(k, linea)[2] - su(j, linea)[2];
          if (verso !== null && (d > 0) !== verso) break;
          verso = d > 0; j = k;
        }
        corse.set(linea, j);
      }
      let migliore = Math.max(...corse.values());
      let scelte = [...corse].filter(([, j]) => j === migliore).map(([l]) => l);
      if (migliore === i) {
        if (forzata) {   // giunzione: la linea B arriva a k ma non prosegue oltre, il tratto è g → k
          itinerario.push({ da: forzata.g, a: su(i, forzata.B)[0], linea: forzata.B });
          estremi.push([forzata.ig, i]);
          continue;   // da k si riparte normalmente
        }
        const gz = giunzione(i);
        if (!gz) { i++; continue; }
        const locI = su(i, gz.A)[0], ultimo = itinerario[itinerario.length - 1];
        if (ultimo && ultimo.linea === gz.A && ultimo.a === locI) ultimo.a = gz.g;   // il tratto su A arriva fino a g
        else { itinerario.push({ da: locI, a: gz.g, linea: gz.A }); estremi.push([i, i]); }
        R.push(`  ~ ${sequenza[i].riga.nome} → ${sequenza[gz.k].riga.nome}: passaggio dalla linea ${gz.A} alla linea ${gz.B} a ` +
          `${(locPer.get(gz.g) || {}).nome || gz.g} km ${C.fg(gz.kAg)}, punto comune delle due linee non stampato nella Scheda: ` +
          `RICOSTRUITO, da confermare sul FL`);
        ingresso = Object.assign({ ig: i }, gz);
        i = gz.k; continue;
      }
      // 1.0.43: indicatore di partenza stampato nella Scheda (colonna Simbologia) + tabella «indicatori» del database
      // (località, senso, cifra → linea): se porta a una sola delle linee che proseguono, vale quella.
      // Es. 41501: Pioltello Limito indicatore 2 in dispari = linea VE AV/AC verso Melzo Scalo (FL 29 p.62).
      const ind = S && sequenza[i].riga.simb ? String(sequenza[i].riga.simb).trim() : "";
      if (ind) {
        const daInd = [...corse].filter(([l, j]) => {
          if (j <= i) return false;
          const li = lineaPer.get(l);
          if (!li || !li.senso_pari) return false;
          const cresce = su(prossima(i, l), l)[2] > su(i, l)[2];
          const senso = cresce === (li.senso_pari === "crescente") ? "pari" : "dispari";
          // tutte le righe con questa località, senso e cifra devono portare alla stessa linea (es. Mi Lambrate pari 3
          // vale per la linea Venezia «dalla Cintura» ma per Mi Greco P. «arrivi dalla VE DD»: ambiguo, non si usa)
          const righe = (T.indicatori || []).filter(x => x.loc_id === su(i, l)[0] && x.senso === senso &&
            String(x.cifra).trim() === ind && x.st !== "N");
          return righe.length > 0 && righe.every(x => x.verso_linea === l);
        }).map(([l]) => l);
        if (daInd.length === 1) {
          if (scelte.length !== 1 || scelte[0] !== daInd[0])
            R.push(`  ${sequenza[i].riga.nome}: linea ${daInd[0]} scelta dall'indicatore di partenza ${ind} della Scheda (tabella indicatori del database)`);
          scelte = daInd; migliore = corse.get(daInd[0]);
        }
      }
      if (scelte.length > 1 && S) {
        // progressive doppie della Scheda (es. «ALESSANDRIA SM 1,229 1,406»): la prima è della linea di arrivo,
        // l'ultima di quella di partenza → a parità di località si sceglie la linea coerente con queste
        const kmOk = (k, linea, quale) => {
          const kk = sequenza[k].riga.km || [];
          if (kk.length < 2) return 0;
          const v = parseFloat(quale === 0 ? kk[0] : kk[kk.length - 1]);
          return Math.abs(su(k, linea)[2] - v) <= 0.002 + 1e-9 ? 1 : 0;
        };
        const punteggi = new Map(scelte.map(l => [l, kmOk(i, l, -1) + kmOk(migliore, l, 0)]));
        const top = Math.max(...punteggi.values());
        if (top > 0 && [...punteggi.values()].filter(v => v === top).length === 1) {
          scelte = scelte.filter(l => punteggi.get(l) === top);
          R.push(`  ${sequenza[i].riga.nome} → ${sequenza[migliore].riga.nome}: linea ${scelte[0]} scelta dalle progressive doppie della Scheda (prima = arrivo, ultima = partenza): RICOSTRUITA, da confermare sul FL – nessuna norma fissa l'ordine delle due progressive (PGOS-CTI All. IX art. 2/5)`);
        }
      }
      if (scelte.length > 1) {
        R.push(`  ! ${sequenza[i].riga.nome}: più linee possibili [${scelte.sort().map(x => "'" + x + "'").join(", ")}]: serve la scelta dell'utente`);
        ambigua = `${sequenza[i].riga.nome}: più linee possibili (${scelte.sort().join(", ")})`;
        break;
      }
      const linea = scelte[0];
      itinerario.push({ da: forzata ? forzata.g : su(i, linea)[0], a: su(migliore, linea)[0], linea });
      for (let x = i + 1; x < migliore; x++) if (!sequenza[x].cand.length) saltate.push([x, linea]);
      estremi.push([forzata ? forzata.ig : i, migliore]);
      i = migliore < sequenza.length - 1 ? migliore : sequenza.length;
    }
    // Valori della Scheda per PASSAGGIO (F01): una località attraversata più volte ha id loc_1, loc_2, …
    // come le righe del generatore, così il secondo passaggio non sovrascrive il primo.
    const contaPass = {}, vistiPass = {};
    for (const s of sequenza) if (s.cand.length) contaPass[s.cand[0][0]] = (contaPass[s.cand[0][0]] || 0) + 1;
    for (const s of sequenza) {
      if (!s.cand.length) continue;
      const loc = s.cand[0][0];
      vistiPass[loc] = (vistiPass[loc] || 0) + 1;
      s.id = contaPass[loc] === 1 ? loc : `${loc}_${vistiPass[loc]}`;
      const r = s.riga, val = {};
      for (const [k1, k2] of [["grado", "g"], ["vls", "v"], ["simb", "ind"]]) if (r[k1]) val[k2] = r[k1];
      if (Object.keys(val).length) scheda[s.id] = val;
    }
    // località non nel database tenute dentro un tratto (1.0.48): punto della Scheda dopo l'ultima località riconosciuta
    for (const [x, linea] of saltate) {
      const r = sequenza[x].riga;
      let dopo = x - 1; while (!sequenza[dopo].cand.length) dopo--;
      const a = su(dopo, linea)[2], b = su(x + 1 + sequenza.slice(x + 1).findIndex(s => s.cand.length), linea)[2];
      const km = r.km.find(v => Math.min(a, b) < parseFloat(v) && parseFloat(v) < Math.max(a, b));
      const ps = { dopo, km, n: r.nome, ord: sequenza[x].ord };
      for (const [k1, k2] of [["grado", "g"], ["vls", "v"], ["simb", "ind"]]) if (r[k1]) ps[k2] = r[k1];
      puntiScheda.push(ps);
      R.push(`  ~ «${r.nome}» (km ${r.km.join("/")}) non è nel database ma sta fra ${sequenza[dopo].riga.nome} e la località seguente ` +
        `sulla linea ${linea}: tenuta come punto della Scheda, il tratto prosegue (caricare la località nel database)`);
    }
    puntiScheda.sort((p, q) => p.ord - q.ord);
    for (const ps of puntiScheda) { ps.dopo = sequenza[ps.dopo].id; delete ps.ord; }
    for (let k = 0; k + 1 < itinerario.length; k++)
      if (itinerario[k].a !== itinerario[k + 1].da) R.push(`  ! itinerario non continuo tra ${itinerario[k].a} e ${itinerario[k + 1].da}`);

    // Copertura dell'itinerario (F02): completa solo se i tratti coprono, senza vuoti, TUTTA la sequenza
    // dalla prima all'ultima località (della Scheda o della traccia). Altrimenti il viaggio è PARZIALE.
    const lacune = [];
    const nomiTra = (a, b) => sequenza.slice(a, b).map(s => s.riga.nome).join(", ");
    if (!itinerario.length) lacune.push("nessun tratto riconosciuto");
    else {
      if (estremi[0][0] > 0) lacune.push(`origine non riconosciuta: ${nomiTra(0, estremi[0][0])}`);
      for (let k = 0; k + 1 < estremi.length; k++)
        if (estremi[k + 1][0] !== estremi[k][1] || itinerario[k].a !== itinerario[k + 1].da)
          lacune.push(`vuoto tra ${sequenza[estremi[k][1]].riga.nome} e ${sequenza[estremi[k + 1][0]].riga.nome}` +
            (estremi[k + 1][0] - estremi[k][1] > 1 ? `: ${nomiTra(estremi[k][1] + 1, estremi[k + 1][0])}` : ""));
      const fine = estremi[estremi.length - 1][1];
      if (ambigua) lacune.push(ambigua);
      if (fine < sequenza.length - 1) lacune.push(`destinazione non raggiunta: mancano ${nomiTra(fine + 1, sequenza.length)}`);
    }
    const completo = !lacune.length;

    // Ambito delle locomotive della traccia (F04): ogni locomotiva vale solo sui tratti tra la sua località «da» e «a»
    // (cambio mezzo, doppia trazione su una parte). Se non si riesce a collocarla resta su tutti i tratti, con avviso.
    const chiamata = (s, nome) => [s.riga.nome, s.riga.nome_traccia].some(n => n && simile(n, nome) >= 0.8);
    // Senza traccia e senza locomotiva indicata: il mezzo intestatario della sigla si legge riga per riga (vale partendo
    // dalla riga, anche dopo un cambio di sigla a metà pagina); ogni tratto prende quello della sua località di partenza,
    // così non serve ritrovare per nome le località Da/A delle pagine.
    if (S && Tr.da_scheda && !(locoUtente && String(locoUtente).trim()) && estremi.length && estremi.every(([a_]) => sequenza[a_].riga.mezzo_sigla)) {
      const perTipo = new Map();
      estremi.forEach(([a_], k) => {
        const tipo = tipoLoco(sequenza[a_].riga.mezzo_sigla);
        if (tipo) { if (!perTipo.has(tipo)) perTipo.set(tipo, []); perTipo.get(tipo).push(k); }
      });
      if (perTipo.size) loco = [...perTipo].map(([t, tr]) => ({ tipo: t, etichetta: `${t} (intestatario della sigla)`, tratti: tr }));
    }
    for (const l of loco) {
      if (!("da" in l)) continue;
      const da = l.da, a = l.a; delete l.da; delete l.a;
      const ida = sequenza.findIndex(s => chiamata(s, da));
      const ia = ida < 0 ? -1 : sequenza.findIndex((s, k) => k > ida && chiamata(s, a));
      if (ida < 0 || ia < 0) { R.push(`  ! LOCOMOTIVA ${l.etichetta}: tratto ${da} → ${a} non collocato sull'itinerario, considerata su tutti i tratti`); continue; }
      const tr = estremi.map((e, k) => (e[0] < ia && e[1] > ida ? k : -1)).filter(k => k >= 0);
      if (!tr.length) R.push(`  ! LOCOMOTIVA ${l.etichetta}: nessun tratto dell'itinerario tra ${da} e ${a}`);
      l.tratti = tr;
    }
    if (loco.some(l => l.tratti)) R.push("LOCOMOTIVE per tratto: " + loco.map(l => `${l.etichetta} ${l.tratti ? l.tratti.map(k => String.fromCharCode(65 + k)).join("") || "nessuno" : "tutti"}`).join(", "));
    if (!completo) { R.push("  ! ITINERARIO PARZIALE: il pacchetto non copre tutto il viaggio"); for (const l of lacune) R.push(`    - ${l}`); }

    // colonna delle Sigle – PGOS-CTI All. IX art. 9 c.3 b) (pag. PDF 149), verificata dall'utente il 02/11/2026:
    // fra le sigle ammesse per il mezzo di trazione, quella con percentuale di massa frenata, rango e velocità UGUALI O
    // INFERIORI a quelli del treno, tenendo conto del tipo di frenatura: treno in regime G → solo colonne G; treno in
    // regime P → colonne P o G. Rango: A < B < C < P. La norma non dà un ordine tra le colonne valide: si propone la meno
    // restrittiva (velocità più alta, poi percentuale più alta). Sigla e percentuale dalla pagina della Scheda di ogni
    // tratto. I divieti per grado di frenatura (11 non su IX, 12 non su VII–IX) li controlla il generatore.
    const titoli = [], vistiT = new Set();
    for (const r of T.sigle) { const k = JSON.stringify([r.colonna, r.titolo]); if (!vistiT.has(k)) { vistiT.add(k); titoli.push([r.colonna, r.titolo]); } }
    const RANGO = { A: 1, B: 2, C: 3, P: 4 };
    const scegliColonna = (sigla, freno) => {
      const m = /^M?(\d+)([ABCP])/.exec(sigla || ""), mf = /^\s*([A-Z]?)\s*(\d+)%/.exec(freno || "");
      if (!m || !mf) return [null, null];
      const v = +m[1], rango = RANGO[m[2]], g = mf[1] === "G", perc = +mf[2], valide = [];
      for (const [col, tit] of titoli) {
        const mt = /^\*?(\d+)([ABCP])\s+(G?)(\d+)%/.exec(tit);
        if (!mt) continue;
        if (g && mt[3] !== "G") continue;              // regime G: solo sigle G
        if (+mt[1] <= v && RANGO[mt[2]] <= rango && +mt[4] <= perc) valide.push([+mt[1], +mt[4], RANGO[mt[2]], -parseInt(col, 10), col, tit]);
      }
      if (!valide.length) return [null, null];
      const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]) || (x[3] - y[3]);
      const best = valide.reduce((a, b) => (cmp(b, a) > 0 ? b : a));
      return [best[4], best[5]];
    };
    let colonna = null;
    if (S) {
      const pagH = new Map(S.pagine.map(h => [h.pdf_pag, h]));
      estremi.forEach(([a_, b_], k) => {
        const riga = sequenza[Math.min(a_ + 1, b_)].riga;   // prima riga dopo l'inizio: il tratto appartiene a quella pagina
        const h = pagH.get(riga.pag) || S.intestazione;
        let sg = h.sigla || S.intestazione.sigla, fr = h.freno || S.intestazione.freno;
        const part = sequenza[a_].riga;                    // sigla letta riga per riga (anche dopo un cambio a metà pagina)
        if (part.sigla && part.freno) { sg = part.sigla; fr = part.freno; }
        const [col] = scegliColonna(sg, fr);
        itinerario[k].sigla = `${sg || ""} ${fr || ""}`.trim();
        itinerario[k].colonna_sigle = col || "";
        if (col && !colonna) colonna = col;
      });
      const gruppi = new Map();
      itinerario.forEach((t, k) => { const key = JSON.stringify([t.sigla, t.colonna_sigle]); if (!gruppi.has(key)) gruppi.set(key, []); gruppi.get(key).push(String.fromCharCode(65 + k)); });
      for (const [key, lett] of gruppi) {
        const [sg, col] = JSON.parse(key);
        const tit = (titoli.find(([c]) => c === col) || [, ""])[1];
        R.push(`COLONNA SIGLE tratti ${lett.join("")}: ` + (col ? `${col} (${tit}) per la sigla ${sg}` : `nessuna colonna adatta alla sigla ${sg} tra quelle nel database`));
      }
    }

    // 1.0.50: tratti con progressiva locale della Scheda, per collocare i cippi dei moduli (M3) su quella progressiva
    const progressiveLocali = tratLocali.map(([a, b, L, loc0, loc1, , , abb]) => {
      const punti_ = { [sequenza[a].id]: loc0, [sequenza[b].id]: loc1 };
      for (const [x, kl] of abb) punti_[sequenza[x].id] = kl;
      return { linea: L, nome: `${sequenza[a].riga.nome} ${C.fg(loc0)} – ${sequenza[b].riga.nome} ${C.fg(loc1)}`, km_da: loc0, km_a: loc1, punti: punti_ };
    });
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
      itinerario, copertura: { completa: completo, lacune }, discrepanze, scheda, punti_scheda: puntiScheda,
      progressive_locali: progressiveLocali,
      prescrizioni: S ? { riepilogo: S.riepilogo === undefined ? null : S.riepilogo, moduli: S.moduli || [],
        fonte: `Scheda Treno SKT-M3M40 valida per il ${S.intestazione.valida_per || "?"}, moduli richiamati` } : null
    };
    R.push(`ITINERARIO per il generatore: ${itinerario.length} tratti ` + itinerario.map(t => `${t.da} → ${t.a} (${t.linea})`).join("; "));
    return { viaggio, rapporto: R, ok: itinerario.length > 0, completo, lacune };
  }

  const API = { componi, norm, simile, allinea, tipoLoco };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Componi = API;
})(typeof self !== "undefined" ? self : this);
