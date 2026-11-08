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
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;   // 1.0.40: uguale vince sul prefisso («TORINO STURA» / «TORINO STURA ORIGINE AV»)
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
      for (const r of S.righe) {
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
          sequenza.push({ riga: r, cand });
          if (cand.length) ultima = sequenza.length - 1;   // indice dell'ultima località riconosciuta
        } else if (ultima !== null && r.km.length && !NO_PL.test(r.nome || "")) {
          const ps = { dopo: ultima, km: r.km[0], n: r.nome };   // indice della località: diventa l'id del passaggio più sotto
          for (const [k1, k2] of [["grado", "g"], ["vls", "v"], ["simb", "ind"]]) if (r[k1]) ps[k2] = r[k1];
          puntiScheda.push(ps);
        }
      }
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

    const ric = sequenza.filter(s => s.cand.length);
    R.push(`DATABASE: località riconosciute ${ric.length} su ${sequenza.length}`);
    const mancanti = sequenza.filter(s => !s.cand.length).map(s => s.riga);
    if (mancanti.length) R.push("  Località non presenti nel database (da caricare): " + mancanti.map(m => `${m.nome} (${m.km.join("/")})`).join(", "));

    const su = (k, linea) => sequenza[k].cand.find(c => c[1] === linea) || null;
    const itinerario = [], scheda = {}, estremi = [];   // estremi: indici in «sequenza» di inizio e fine di ogni tratto
    let i = 0, ambigua = null;
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
      let migliore = Math.max(...corse.values());
      let scelte = [...corse].filter(([, j]) => j === migliore).map(([l]) => l);
      if (migliore === i) { i++; continue; }
      // 1.0.43: indicatore di partenza stampato nella Scheda (colonna Simbologia) + tabella «indicatori» del database
      // (località, senso, cifra → linea): se porta a una sola delle linee che proseguono, vale quella.
      // Es. 41501: Pioltello Limito indicatore 2 in dispari = linea VE AV/AC verso Melzo Scalo (FL 29 p.62).
      const ind = S && sequenza[i].riga.simb ? String(sequenza[i].riga.simb).trim() : "";
      if (ind) {
        const daInd = [...corse].filter(([l, j]) => {
          if (j <= i) return false;
          const li = lineaPer.get(l);
          if (!li || !li.senso_pari) return false;
          const cresce = su(i + 1, l)[2] > su(i, l)[2];
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
      itinerario.push({ da: su(i, linea)[0], a: su(migliore, linea)[0], linea });
      estremi.push([i, migliore]);
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
    for (const ps of puntiScheda) ps.dopo = sequenza[ps.dopo].id;
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
      prescrizioni: S ? { riepilogo: S.riepilogo === undefined ? null : S.riepilogo, moduli: S.moduli || [],
        fonte: `Scheda Treno SKT-M3M40 valida per il ${S.intestazione.valida_per || "?"}, moduli richiamati` } : null
    };
    R.push(`ITINERARIO per il generatore: ${itinerario.length} tratti ` + itinerario.map(t => `${t.da} → ${t.a} (${t.linea})`).join("; "));
    return { viaggio, rapporto: R, ok: itinerario.length > 0, completo, lacune };
  }

  const API = { componi, norm, simile, allinea, tipoLoco };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Componi = API;
})(typeof self !== "undefined" ? self : this);
