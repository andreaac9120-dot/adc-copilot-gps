// Cartina delle linee (1.0.44): modello dati costruito SOLO dal database importato (tabelle .adcdb.json).
// Nessun valore inventato, nessuna coordinata stimata, nessun dato esteso a linee vicine: ciò che manca resta
// mancante ed esce come «da studiare». Stessa funzione in Python: strumenti/cartina_modello.py (risultato identico,
// confrontato da tests/cartina.test.js). Ogni modifica qui va fatta anche lì.
//
//   costruisci(T, conf) → tracciati delle linee, linee senza coordinate sufficienti, località per priorità
//   riepilogo(T, linea_id) → sezioni della scheda riepilogativa della linea (elenco SEZIONI qui sotto)
(function (root) {
  "use strict";
  const VERSIONE_MODELLO = 1;
  const TOLL = 0.0005;   // km: due progressive più vicine di così sono la stessa (mezzo metro)
  const ORDINE_ST = { V: 3, R: 2, I: 1, N: 0 };
  const RANGO_TIPO = { stazione: 0, scalo: 1, bivio: 2, PC: 3, PM: 4, fermata: 5, deviatoio: 6, punto: 7 };
  const RANGO_POS = { prima: 0, presso: 1, dopo: 2 };
  const RANGO_SENSO = { pari: 0, dispari: 1, entrambi: 2 };
  const ORDINE_PAGINE = { schema: 0, fiancata_linea: 1, principale: 2, principale_sx: 3, principale_dx: 4, sigle: 5, sez46: 6, sez420: 7, altro: 8 };

  // Confronto per codice dei caratteri (come Python), mai localeCompare: il risultato deve essere identico.
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function cmpChiavi(a, b) {
    for (let i = 0; i < a.length; i++) { const c = cmp(a[i], b[i]); if (c) return c; }
    return 0;
  }
  const ordina = (arr, chiave) => arr.map((x, i) => [chiave(x, i), x]).sort((p, q) => cmpChiavi(p[0], q[0])).map(p => p[1]);
  const vuoto = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  const val = v => (vuoto(v) ? null : v);
  const tab = (T, n) => (T && Array.isArray(T[n]) ? T[n] : []);
  const peggiore = stati => stati.reduce((p, s) => (ORDINE_ST[s] < ORDINE_ST[p] ? s : p), "V");

  // ---------- Indice delle tabelle (una volta per database) ----------
  const CACHE = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function indice(T) {
    if (CACHE && T && typeof T === "object" && CACHE.has(T)) return CACHE.get(T);
    const per = (n, k) => { const m = new Map(); tab(T, n).forEach((r, i) => { const v = r[k]; if (vuoto(v)) return; if (!m.has(v)) m.set(v, []); m.get(v).push([r, i]); }); return m; };
    const I = {
      fonti: new Map(tab(T, "fonti").map(r => [r.fonte_id, r])),
      linee: new Map(tab(T, "linee").map(r => [r.linea_id, r])),
      localita: new Map(tab(T, "localita").map(r => [r.loc_id, r])),
      geoV: new Map(tab(T, "geo").filter(g => g.st === "V" && typeof g.lat === "number" && typeof g.lon === "number").map(g => [g.loc_id, g])),
      punti: per("punti_linea", "linea_id"), puntiLoc: per("punti_linea", "loc_id"),
      fiancata: per("fiancata", "linea_id"), esercizio: per("esercizio", "linea_id"), indicatori: per("indicatori", "loc_id"),
      compat: per("compatibilita", "linea_id"), aff: per("aff_linee", "aff_id"), affLinea: per("aff_linee", "linea_id"),
      affiancamenti: new Map(tab(T, "affiancamenti").map(r => [r.aff_id, r])), sez46: per("sez46_letta", "linea_id"),
      pagine: per("pagine_fl", "linea_id"), disc: per("discrepanze", "linea_id")
    };
    if (CACHE && T && typeof T === "object") CACHE.set(T, I);
    return I;
  }
  function src(I, fonte, pag) {
    const f = I.fonti.get(fonte);
    return { fonte: val(fonte), fonte_breve: f ? f.breve : val(fonte), edizione: f ? val(f.edizione) : null, pag: val(pag) };
  }
  // Località della linea in ordine di progressiva crescente (a parità di km, per loc_id)
  function puntiOrdinati(I, linea_id) {
    return ordina((I.punti.get(linea_id) || []).map(p => p[0]).filter(p => typeof p.km === "number"), p => [p.km, p.loc_id]);
  }
  function estensione(punti) {
    if (!punti.length) return null;
    return { km_min: punti[0].km, km_max: punti[punti.length - 1].km, loc_min: punti[0].loc_id, loc_max: punti[punti.length - 1].loc_id };
  }
  // Tratti di [lo, hi] non coperti dagli intervalli (km_da, km_a)
  function scoperti(intervalli, lo, hi) {
    const iv = ordina(intervalli.filter(x => typeof x[0] === "number" && typeof x[1] === "number").map(x => [Math.min(x[0], x[1]), Math.max(x[0], x[1])]), x => [x[0], x[1]]);
    const out = []; let cur = lo;
    for (const [a, b] of iv) {
      if (b <= cur + TOLL) continue;
      if (a > cur + TOLL) out.push([cur, Math.min(a, hi)]);
      if (b > cur) cur = b;
      if (cur >= hi - TOLL) break;
    }
    if (cur < hi - TOLL) out.push([cur, hi]);
    return out.filter(x => x[1] - x[0] > TOLL);
  }
  const nomeLoc = (I, id) => { const l = I.localita.get(id); return l ? l.nome : id; };

  // ---------- Cartina: tracciati, località, scostamenti ----------
  function costruisci(T, conf) {
    conf = conf || {};
    const I = indice(T);
    const sempre = new Set((conf.localita && conf.localita.sempre) || []);
    const mai = new Set((conf.localita && conf.localita.mai) || []);
    const linee = [], senza = [];
    const usate = new Set();
    const lineeOrd = ordina(tab(T, "linee"), l => [l.linea_id]);
    for (const l of lineeOrd) {
      const ps = puntiOrdinati(I, l.linea_id);
      const conCoord = ps.map((p, i) => [p, i]).filter(x => I.geoV.has(x[0].loc_id));
      const base = { linea_id: l.linea_id, nome: l.nome, nome_breve: l.nome_breve, compartimento: l.compartimento, st: l.st,
        senso_pari: val(l.senso_pari), n_punti: ps.length, n_coord: conCoord.length };
      if (conCoord.length < 2) {
        base.motivo = !ps.length ? "nessuna località nel database" : !conCoord.length ? "nessuna località con coordinate V" : "una sola località con coordinate V";
        senza.push(base); continue;
      }
      const tratti = [];
      for (let k = 1; k < conCoord.length; k++) {
        const [a, ia] = conCoord[k - 1], [b, ib] = conCoord[k];
        const mancanti = ps.slice(ia + 1, ib).map(p => p.loc_id);
        tratti.push({ da: a.loc_id, a: b.loc_id, tipo: mancanti.length ? "tratteggiato" : "pieno", senza_coord: mancanti });
      }
      const sequenza = conCoord.map(x => x[0].loc_id);
      sequenza.forEach(id => usate.add(id));
      const lat = sequenza.map(id => I.geoV.get(id).lat), lon = sequenza.map(id => I.geoV.get(id).lon);
      linee.push(Object.assign(base, { sequenza, tratti, bbox: [Math.min(...lon), Math.min(...lat), Math.max(...lon), Math.max(...lat)], scostamento: 0 }));
    }
    assegnaScostamenti(I, linee);
    const collegamenti = giunzioni(I, lineeOrd);

    // Località con coordinate V che stanno su almeno una linea: grado = numero di linee che vi passano
    const localita = [];
    for (const [id, g] of I.geoV) {
      const pl = I.puntiLoc.get(id) || [];
      if (!pl.length) continue;
      const lo = I.localita.get(id) || { nome: id, tipo: "punto" };
      const grado = new Set(pl.map(p => p[0].linea_id)).size;
      let livello = (grado >= 3 || (lo.tipo === "stazione" && grado >= 2)) ? 0 : lo.tipo === "stazione" ? 1 : 2;
      if (sempre.has(id)) livello = 0;
      if (mai.has(id)) livello = 3;   // mai etichettata
      localita.push({ loc_id: id, nome: lo.nome, tipo: lo.tipo, lat: g.lat, lon: g.lon, grado, livello, sempre: sempre.has(id),
        linee: ordina(pl.map(p => p[0].linea_id), x => [x]) });
    }
    const locOrd = ordina(localita, x => [x.livello, -x.grado, RANGO_TIPO[x.tipo] ?? 9, x.nome, x.loc_id]);
    locOrd.forEach((x, i) => { x.priorita = i; });

    const nComp = new Map();
    for (const l of lineeOrd) nComp.set(l.compartimento, (nComp.get(l.compartimento) || 0) + 1);
    const compartimenti = ordina([...nComp].map(([id, n]) => ({ id, n_linee: n })), c => [-c.n_linee, c.id]);
    const bb = linee.length ? [Math.min(...linee.map(l => l.bbox[0])), Math.min(...linee.map(l => l.bbox[1])), Math.max(...linee.map(l => l.bbox[2])), Math.max(...linee.map(l => l.bbox[3]))] : null;
    return {
      versione_modello: VERSIONE_MODELLO, linee, senza_coordinate: senza, collegamenti, localita: locOrd, compartimenti, bbox: bb,
      conteggi: { linee: lineeOrd.length, disegnate: linee.length, senza_coordinate: senza.length,
        localita_con_coordinate: localita.length, tratti_pieni: linee.reduce((s, l) => s + l.tratti.filter(t => t.tipo === "pieno").length, 0),
        tratti_tratteggiati: linee.reduce((s, l) => s + l.tratti.filter(t => t.tipo === "tratteggiato").length, 0),
        collegamenti: collegamenti.length }
    };
  }

  // Giunzioni senza coordinate (1.0.44): due linee che finiscono nello stesso punto senza coordinate V (es. il cippo di
  // un cambio di progressiva) e lì si continuano. Si collegano con un tratto TRATTEGGIATO (indicativo) fra la località
  // con coordinate più vicina di ciascuna linea. Nessuna coordinata inventata; con 3 o più linee nel punto, niente.
  function giunzioni(I, lineeOrd) {
    const capi = new Map();   // loc senza coordinate → [{linea, vicina, saltate}]
    for (const l of lineeOrd) {
      const ps = puntiOrdinati(I, l.linea_id);
      if (ps.length < 2) continue;
      for (const [capo, verso] of [[0, 1], [ps.length - 1, -1]]) {
        const id = ps[capo].loc_id;
        if (I.geoV.has(id)) continue;
        let k = capo + verso; const saltate = [];
        while (k >= 0 && k < ps.length && !I.geoV.has(ps[k].loc_id)) { saltate.push(ps[k].loc_id); k += verso; }
        if (!capi.has(id)) capi.set(id, []);
        capi.get(id).push({ linea: l.linea_id, vicina: k >= 0 && k < ps.length ? ps[k].loc_id : null, saltate });
      }
    }
    const out = [];
    for (const via of ordina([...capi.keys()], x => [x])) {
      const c = capi.get(via);
      // esattamente due linee, e il punto non sta su altre linee in mezzo al loro percorso
      if (c.length !== 2 || c[0].linea === c[1].linea || (I.puntiLoc.get(via) || []).length !== 2) continue;
      if (!c[0].vicina || !c[1].vicina) continue;
      const [a, b] = ordina(c, x => [x.linea]);
      out.push({ via, linee: [a.linea, b.linea], da: a.vicina, a: b.vicina, tipo: "tratteggiato",
        senza_coord: a.saltate.slice().reverse().concat([via], b.saltate) });
    }
    return out;
  }

  // Scostamento parallelo (in «corsie»): linee che condividono un tratto fra le stesse due località, o che la
  // Sez. 4.6 dà affiancate (lati diversi dello stesso gruppo), non stanno sulla stessa corsia. Il segno tiene conto
  // del verso di disegno: due linee percorse in versi opposti hanno i lati scambiati.
  function assegnaScostamenti(I, linee) {
    const per = new Map(linee.map(l => [l.linea_id, l]));
    const vic = new Map(linee.map(l => [l.linea_id, new Map()]));
    const lega = (a, b, r) => { if (a === b) return; if (!vic.get(a).has(b)) { vic.get(a).set(b, r); vic.get(b).set(a, r); } };
    const tratti = new Map();
    for (const l of linee) for (const t of l.tratti) {
      const k = t.da < t.a ? t.da + "|" + t.a : t.a + "|" + t.da, verso = t.da < t.a ? 1 : -1;
      if (!tratti.has(k)) tratti.set(k, []);
      tratti.get(k).push([l.linea_id, verso]);
    }
    for (const k of ordina([...tratti.keys()], x => [x])) {
      const v = tratti.get(k);
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) lega(v[i][0], v[j][0], v[i][1] * v[j][1]);
    }
    const dir = l => { const a = I.geoV.get(l.sequenza[0]), b = I.geoV.get(l.sequenza[l.sequenza.length - 1]); return [b.lon - a.lon, b.lat - a.lat]; };
    for (const aff of ordina([...I.aff.keys()], x => [x])) {
      const righe = ordina(I.aff.get(aff).map(x => x[0]).filter(r => per.has(r.linea_id)), r => [r.linea_id]);
      for (const a of righe) for (const b of righe) {
        if (a.linea_id >= b.linea_id || a.lato === b.lato) continue;
        const da = dir(per.get(a.linea_id)), db = dir(per.get(b.linea_id));
        lega(a.linea_id, b.linea_id, da[0] * db[0] + da[1] * db[1] >= 0 ? 1 : -1);
      }
    }
    const ordine = ordina(linee, l => [-vic.get(l.linea_id).size, l.linea_id]);
    const fatto = new Map();
    for (const l of ordine) {
      for (const c of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
        let ok = true;
        for (const [y, r] of vic.get(l.linea_id)) if (fatto.has(y) && c === r * fatto.get(y)) { ok = false; break; }
        if (ok) { fatto.set(l.linea_id, c); break; }
      }
      if (!fatto.has(l.linea_id)) fatto.set(l.linea_id, 0);
      l.scostamento = fatto.get(l.linea_id);
    }
  }

  // ---------- Scheda riepilogativa della linea ----------
  const VALORI_SENSO = { crescente: "in senso pari le progressive crescono", decrescente: "in senso pari le progressive calano" };
  function sezIntestazione(I, L) {
    const f = I.fonti.get(L.fonte);
    const campi = [
      ["nome", "Nome", val(L.nome)], ["nome_breve", "Nome breve", val(L.nome_breve)], ["compartimento", "Compartimento", val(L.compartimento)],
      ["binari", "Binari", val(L.binari)], ["senso_pari", "Senso pari", vuoto(L.senso_pari) ? null : (VALORI_SENSO[L.senso_pari] || L.senso_pari)],
      ["alimentazione", "Alimentazione", val(L.alimentazione)],
      ["fonte", "Fonte FL", f ? f.breve + (vuoto(f.edizione) ? "" : " – " + f.edizione) : val(L.fonte)],
      ["note", "Note", val(L.note)]
    ].map(([campo, etichetta, valore]) => ({ campo, etichetta, valore }));
    const mancano = campi.filter(c => c.valore === null && c.campo !== "note").length;
    return { stato: mancano ? "parziale" : "popolata", campi, src: src(I, L.fonte, L.pag), st: L.st };
  }
  function sezEsercizio(I, L, ctx) {
    const righe = ordina((I.esercizio.get(L.linea_id) || []), ([r, i]) => [r.km_da, r.km_a, RANGO_SENSO[r.senso] ?? 9, i])
      .map(([r]) => ({ senso: r.senso, km_da: r.km_da, km_a: r.km_a, sistema: r.sistema, testo: r.testo, riscontro: val(r.riscontro), src: src(I, r.fonte, r.pag), st: r.st }));
    const sc = ctx.est ? scoperti(righe.map(r => [r.km_da, r.km_a]), ctx.est.km_min, ctx.est.km_max) : [];
    return { stato: !righe.length ? "da_studiare" : sc.length ? "parziale" : "popolata", righe, scoperti: sc };
  }
  function sezLocalita(I, L, ctx) {
    const righe = ctx.ordinePari.map(p => {
      const lo = I.localita.get(p.loc_id) || {};
      return { loc_id: p.loc_id, nome: lo.nome ?? p.loc_id, tipo: val(lo.tipo), km: p.km, km_txt: p.km_txt, posto: val(p.posto), nota: val(p.nota),
        coordinate: I.geoV.has(p.loc_id), src: src(I, p.fonte, p.pag), st: p.st };
    });
    const ordine = L.senso_pari === "decrescente" ? "pari_decrescente" : L.senso_pari === "crescente" ? "pari_crescente" : "senso_pari_da_studiare";
    return { stato: !righe.length ? "da_studiare" : righe.every(r => r.coordinate) && ordine !== "senso_pari_da_studiare" ? "popolata" : "parziale", ordine, righe };
  }
  // Grado di prestazione: colonna gdp della fiancata, vale dall'inizio del tratto nel senso di marcia fino alla riga
  // successiva dello stesso senso. Senza km sulla riga si usa la progressiva della località (presso_loc) su QUESTA linea.
  function sezGdp(I, L, ctx) {
    const kmLoc = new Map((I.punti.get(L.linea_id) || []).map(([p]) => [p.loc_id, p.km]));
    const tutte = (I.fiancata.get(L.linea_id) || []).filter(([r]) => r.gdp !== null && r.gdp !== undefined);
    const sensi = [];
    let conDato = 0, senzaDato = 0;
    for (const senso of ["pari", "dispari"]) {
      const righe = [], senzaKm = [];
      for (const [r, i] of tutte) {
        if (r.senso !== senso) continue;
        const daLoc = typeof r.km !== "number";
        const km = daLoc ? (kmLoc.has(r.presso_loc) ? kmLoc.get(r.presso_loc) : null) : r.km;
        const riga = { gdp: r.gdp, punto: r.punto, testo: r.testo, posizione: val(r.posizione), presso_loc: val(r.presso_loc),
          km, km_da_localita: daLoc, src: src(I, r.fonte, r.pag), st: r.st, i };
        (km === null ? senzaKm : righe).push(riga);
      }
      let cresc = null;
      if (L.senso_pari === "crescente" || L.senso_pari === "decrescente") cresc = (L.senso_pari === "crescente") === (senso === "pari");
      const out = { senso, verso: cresc === null ? null : cresc ? "progressive_crescenti" : "progressive_decrescenti", tratti: [], senza_progressiva: senzaKm.map(pulisci) };
      if (cresc === null || !ctx.est) {
        out.righe = ordina(righe, r => [r.km, RANGO_POS[r.posizione] ?? 1, r.i]).map(pulisci);
        out.motivo = cresc === null ? "senso pari della linea da studiare: i tratti non si possono comporre" : "linea senza località: i tratti non si possono comporre";
        if (righe.length) conDato++; else senzaDato++;
        sensi.push(out); continue;
      }
      const s = cresc ? 1 : -1;
      const ord = ordina(righe, r => [s * r.km, RANGO_POS[r.posizione] ?? 1, r.i]);
      // righe allo stesso punto (stessa progressiva e posizione): un solo inizio di tratto; valori diversi = conflitto mostrato
      const gruppi = [];
      for (const r of ord) {
        const g = gruppi[gruppi.length - 1];
        if (g && Math.abs(g.km - r.km) <= TOLL && (RANGO_POS[g.posizione] ?? 1) === (RANGO_POS[r.posizione] ?? 1)) g.righe.push(r);
        else gruppi.push({ km: r.km, posizione: r.posizione, righe: [r] });
      }
      const inizio = cresc ? ctx.est.km_min : ctx.est.km_max, fine = cresc ? ctx.est.km_max : ctx.est.km_min;
      const locA = km => { const p = ctx.punti.find(x => Math.abs(x.km - km) <= TOLL); return p ? nomeLoc(I, p.loc_id) : null; };
      const nomeGruppo = g => { const r = g.righe[0]; return r.presso_loc ? nomeLoc(I, r.presso_loc) : (locA(g.km) || r.punto); };
      if (!gruppi.length || Math.abs(gruppi[0].km - inizio) > TOLL) {
        out.tratti.push({ da_km: inizio, a_km: gruppi.length ? gruppi[0].km : fine, da_loc: locA(inizio), a_loc: gruppi.length ? nomeGruppo(gruppi[0]) : locA(fine), posizione: null,
          gdp: null, conflitto: false, valori: [], righe: [], st: "N" });
      }
      gruppi.forEach((g, k) => {
        const valori = [...new Set(g.righe.map(r => r.gdp))];
        const nx = gruppi[k + 1];
        out.tratti.push({ da_km: g.km, a_km: nx ? nx.km : fine, da_loc: nomeGruppo(g), a_loc: nx ? nomeGruppo(nx) : locA(fine), posizione: g.posizione,
          gdp: valori.length === 1 ? valori[0] : null, conflitto: valori.length > 1, valori, righe: g.righe.map(pulisci), st: peggiore(g.righe.map(r => r.st)) });
      });
      for (const t of out.tratti) (t.gdp === null ? senzaDato++ : conDato++);
      sensi.push(out);
    }
    return { stato: !conDato ? "da_studiare" : senzaDato ? "parziale" : "popolata", sensi };
  }
  function pulisci(r) { const o = Object.assign({}, r); delete o.i; return o; }
  function sezIndicatori(I, L, ctx) {
    const gruppi = [];
    for (const p of ctx.ordinePari) {
      const righe = ordina(I.indicatori.get(p.loc_id) || [], ([r, i]) => [RANGO_SENSO[r.senso] ?? 9, i]).map(([r]) => {
        const vl = val(r.verso_linea), ln = vl ? I.linee.get(vl) : null;
        return { senso: r.senso, segnale: r.segnale, cifra: r.cifra, verso_linea: ln ? vl : null, verso_nome: ln ? ln.nome_breve : null,
          dove: r.dove, nota: val(r.nota), src: src(I, r.fonte, r.pag), st: r.st };
      });
      if (righe.length) gruppi.push({ loc_id: p.loc_id, nome: nomeLoc(I, p.loc_id), km_txt: p.km_txt, righe });
    }
    return { stato: gruppi.length ? "popolata" : "da_studiare", localita: gruppi };
  }
  function esitoCompat(r) { return vuoto(r.rango_max) ? "esclusa" : (typeof r.vmax_nota === "number" ? "limitazione" : "ammessa"); }
  function sezCompat(I, L, ctx, T) {
    const righe = (I.compat.get(L.linea_id) || []);
    const chiave = r => r.km_da + "|" + r.km_a + "|" + r.tratto_de;
    const visti = new Map();
    for (const [r] of righe) if (!visti.has(chiave(r))) visti.set(chiave(r), { km_da: r.km_da, km_a: r.km_a, tratto_de: r.tratto_de });
    const tratti = ordina([...visti.values()], t => [t.km_da, t.km_a, t.tratto_de]);
    const loco = ordina(tab(T, "loco"), l => [l.loco]).map(l => {
      const mie = righe.filter(([r]) => r.colonna_de10 === l.colonna_de10);
      const celle = tratti.map(t => {
        const qui = mie.filter(([r]) => chiave(r) === chiave(t)).map(([r]) => ({ esito: esitoCompat(r), simbolo: r.simbolo, rango_max: val(r.rango_max),
          vmax_nota: typeof r.vmax_nota === "number" ? r.vmax_nota : null, nota: val(r.nota), src: src(I, r.fonte, r.pag), st: r.st }));
        return { esito: qui.length ? (new Set(qui.map(q => q.esito)).size === 1 ? qui[0].esito : "conflitto") : "da_studiare", righe: qui };
      });
      const sc = ctx.est ? scoperti(mie.map(([r]) => [r.km_da, r.km_a]), ctx.est.km_min, ctx.est.km_max) : [];
      return { loco: l.loco, colonna_de10: l.colonna_de10, rango_dpc: val(l.rango_dpc), vmax: typeof l.vmax === "number" ? l.vmax : null,
        stato: !mie.length ? "da_studiare" : sc.length ? "parziale" : "popolata", celle, scoperti: sc, src: src(I, l.fonte, l.pag), st: l.st };
    });
    const stati = loco.map(l => l.stato);
    return { stato: !righe.length || !loco.length ? "da_studiare" : stati.every(s => s === "popolata") ? "popolata" : "parziale", tratti, loco };
  }
  function copertura(intervalli, a, b) {
    if (typeof a !== "number" || typeof b !== "number") return "progressive_non_trascritte";
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const sc = scoperti(intervalli, lo, hi);
    if (!sc.length) return "coperto";
    const buco = sc.reduce((s, x) => s + x[1] - x[0], 0);
    return buco >= hi - lo - TOLL ? "non_coperto" : "parziale";
  }
  function sezAffiancate(I, L, ctx) {
    const letti = ordina(I.sez46.get(L.linea_id) || [], ([r, i]) => [r.km_da, r.km_a, i]).map(([r]) => ({ km_da: r.km_da, km_a: r.km_a, src: src(I, r.fonte, r.pag), st: r.st }));
    const iv = letti.map(r => [r.km_da, r.km_a]);
    const gruppi = ordina(I.affLinea.get(L.linea_id) || [], ([r]) => [r.aff_id]).map(([r]) => {
      const a = I.affiancamenti.get(r.aff_id) || {};
      const altre = ordina((I.aff.get(r.aff_id) || []).map(x => x[0]).filter(x => x.linea_id !== L.linea_id),
        x => [x.lato === r.lato ? 1 : 0, x.linea_id]).map(x => ({
          linea_id: x.linea_id, nome_breve: I.linee.has(x.linea_id) ? I.linee.get(x.linea_id).nome_breve : x.linea_id, tratto: x.tratto,
          km_da: typeof x.km_da === "number" ? x.km_da : null, km_a: typeof x.km_a === "number" ? x.km_a : null, lato: x.lato,
          relazione: x.lato === r.lato ? "stesso_percorso" : "affiancata" }));
      return { aff_id: r.aff_id, descrizione: val(a.descrizione), categoria: val(a.categoria), condizioni: val(a.condizioni),
        src: a.fonte ? src(I, a.fonte, a.pag) : null, st: a.st || "N",
        tratto: r.tratto, km_da: typeof r.km_da === "number" ? r.km_da : null, km_a: typeof r.km_a === "number" ? r.km_a : null, lato: r.lato,
        sez46: copertura(iv, r.km_da, r.km_a), altre };
    });
    const sc = ctx.est ? scoperti(iv, ctx.est.km_min, ctx.est.km_max) : null;
    const coperta = sc !== null && !sc.length && letti.length > 0;
    let stato;
    if (gruppi.length) stato = coperta ? "popolata" : "parziale";
    else stato = coperta ? "popolata" : letti.length ? "parziale" : "da_studiare";
    return { stato, gruppi, sez46_letta: letti, sez46_scoperti: sc || [], nessuna_affiancata: !gruppi.length && coperta };
  }
  function sezUtenze(I, L, ctx, T) {
    const posLoc = new Map(ctx.ordinePari.map((p, k) => [p.loc_id, k]));
    const righe = [];
    tab(T, "utenze").forEach((r, i) => {
      const lin = val(r.linea_id), loc = val(r.loc_id), comp = val(r.compartimento);
      let ambito = null, ord;
      if (loc && posLoc.has(loc) && (lin === null || lin === L.linea_id)) { ambito = "localita"; ord = [0, posLoc.get(loc), 0, i]; }
      else if (!loc && lin === L.linea_id) { ambito = typeof r.km_da === "number" ? "tratto" : "linea"; ord = [1, 0, typeof r.km_da === "number" ? r.km_da : -1e9, i]; }
      else if (!loc && lin === null && comp !== null && comp === L.compartimento) { ambito = "compartimento"; ord = [2, 0, 0, i]; }
      if (!ambito) return;
      righe.push([ord, { ruolo: r.ruolo, chi: r.chi, ambito, loc_id: loc, loc_nome: loc ? nomeLoc(I, loc) : null,
        km_da: typeof r.km_da === "number" ? r.km_da : null, km_a: typeof r.km_a === "number" ? r.km_a : null, compartimento: comp,
        gsmr: val(r.gsmr), fs: val(r.fs), altro: val(r.altro), src: src(I, r.fonte, r.pag), st: r.st }]);
    });
    const out = ordina(righe, x => x[0]).map(x => x[1]);
    return { stato: out.length ? "popolata" : "da_studiare", righe: out };
  }
  function sezPagine(I, L) {
    const righe = ordina(I.pagine.get(L.linea_id) || [], ([r, i]) => [ORDINE_PAGINE[r.tipo] ?? 9, r.fonte, RANGO_SENSO[r.senso] ?? 9,
      typeof r.pag_pdf === "number" ? r.pag_pdf : 1e9, i]).map(([r]) => ({ fonte: r.fonte, fonte_breve: src(I, r.fonte, null).fonte_breve, pag: r.pag,
      pag_pdf: typeof r.pag_pdf === "number" ? r.pag_pdf : null, tipo: r.tipo, senso: val(r.senso),
      km_da: typeof r.km_da === "number" ? r.km_da : null, km_a: typeof r.km_a === "number" ? r.km_a : null, img: val(r.img) }));
    return { stato: righe.length ? "popolata" : "da_studiare", righe };
  }
  function sezDiscrepanze(I, L) {
    const righe = ordina((I.disc.get(L.linea_id) || []).filter(([r]) => r.stato === "aperta"), ([r]) => [r.disc_id])
      .map(([r]) => ({ disc_id: r.disc_id, testo: r.testo, fonti: r.fonti }));
    return { stato: righe.length ? "avviso" : "nessuna", righe };
  }

  // Sezioni della scheda, in quest'ordine. Per aggiungerne una: una riga qui (e la stessa in Python); la vista
  // ha un disegno generico per le sezioni che non conosce.
  const SEZIONI = [
    { id: "intestazione", titolo: "Intestazione", fn: sezIntestazione },
    { id: "esercizio", titolo: "Sistema di esercizio", fn: sezEsercizio },
    { id: "localita", titolo: "Località", fn: sezLocalita },
    { id: "gdp", titolo: "Grado di prestazione", fn: sezGdp },
    { id: "indicatori", titolo: "Indicatori di direzione", fn: sezIndicatori },
    { id: "compatibilita", titolo: "Circolabilità delle locomotive", fn: sezCompat },
    { id: "affiancate", titolo: "Linee affiancate (Sez. 4.6)", fn: sezAffiancate },
    { id: "utenze", titolo: "Utenze telefoniche", fn: sezUtenze },
    { id: "pagine_fl", titolo: "Pagine FL in immagine", fn: sezPagine },
    { id: "discrepanze", titolo: "Discrepanze aperte", fn: sezDiscrepanze }
  ];

  function riepilogo(T, linea_id) {
    const I = indice(T);
    const L = I.linee.get(linea_id);
    if (!L) return null;
    const punti = puntiOrdinati(I, linea_id);
    const ctx = { punti, est: estensione(punti), ordinePari: L.senso_pari === "decrescente" ? punti.slice().reverse() : punti };
    return {
      versione_modello: VERSIONE_MODELLO, linea_id, nome: L.nome, nome_breve: L.nome_breve, compartimento: L.compartimento, st: L.st,
      estensione: ctx.est,
      sezioni: SEZIONI.map(s => Object.assign({ id: s.id, titolo: s.titolo }, s.fn(I, L, ctx, T)))
    };
  }

  const API = { costruisci, riepilogo, scoperti, SEZIONI: SEZIONI.map(s => ({ id: s.id, titolo: s.titolo })), VERSIONE_MODELLO };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.CartinaModello = API;
})(typeof self !== "undefined" ? self : this);
