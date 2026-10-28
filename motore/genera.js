// Generatore del pacchetto .adc.json (blocco condotta, schema 1.0.4) senza IA:
// traduzione fedele di strumenti/genera_pacchetto.py del database dati di linea.
// Solo ricerche nelle tabelle e regole fisse: ciò che manca diventa stato N e una voce in "aperti";
// lo stato di una conclusione non è mai migliore della premessa peggiore; la A solo dove un indicatore
// della località porta su una linea affiancata valida per il treno (regola del quadrato A, scheda 16f).
// Le ricerche riproducono anche l'ordine delle righe di SQLite (scansione per rowid o per indice).
(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./comune.js") : root.MotoreComune;
  const { f3, fg, pyFloat, unici, get } = C;

  const ORDINE = { V: 3, R: 2, I: 1, N: 0 };
  const EPS = 0.0005;
  const CATEGORIE = { tutti: "tutti i treni", solo_viaggiatori: "i treni viaggiatori",
    solo_viaggiatori_ertms_l2: "i treni viaggiatori con ERTMS L2", solo_impostati_av: "i treni impostati su linea AV/AC" };

  class Errore extends Error {}

  function peggiore(...stati) {
    const s = stati.filter(x => x in ORDINE);
    if (!s.length) return "N";
    return s.reduce((a, b) => (ORDINE[b] < ORDINE[a] ? b : a));
  }
  // intervalli di [lo, hi] non coperti dalle righe (tolleranza 1 m)
  function scoperti(righe, lo, hi, a = "km_da", b = "km_a") {
    const iv = righe.filter(r => r[b] > lo && r[a] < hi).map(r => [Math.max(r[a], lo), Math.min(r[b], hi)])
      .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const buchi = []; let x = lo;
    for (const [u, v] of iv) { if (u > x + 0.001) buchi.push([x, u]); x = Math.max(x, v); }
    if (hi > x + 0.001) buchi.push([x, hi]);
    return buchi;
  }
  // confronti SQL: con NULL il risultato è falso
  const nn = v => v !== null && v !== undefined;
  const lt = (a, b) => nn(a) && nn(b) && a < b, gt = (a, b) => nn(a) && nn(b) && a > b;
  const le = (a, b) => nn(a) && nn(b) && a <= b, ge = (a, b) => nn(a) && nn(b) && a >= b;
  const eq = (a, b) => nn(a) && nn(b) && a === b;
  const between = (x, a, b) => nn(x) && x >= a && x <= b;
  // sovrapposizione stretta usata in tutte le ricerche per tratto
  const sovr = (r, lo, hi) => (lt(r.km_da, hi) && gt(r.km_a, lo)) || (eq(r.km_da, r.km_a) && between(r.km_da, lo, hi));
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const ordina = (a, ...chiavi) => a.map((r, i) => [r, i]).sort((x, y) => {
    for (const k of chiavi) { const c = k(x[0], y[0]); if (c) return c; }
    return x[1] - y[1];
  }).map(x => x[0]);

  function Database(T) {
    const per = (t, k) => new Map(T[t].map(r => [r[k], r]));
    const fonti = per("fonti", "fonte_id"), linee = per("linee", "linea_id"), localita = per("localita", "loc_id"),
      loco = per("loco", "loco"), geo = per("geo", "loc_id"), aff = per("affiancamenti", "aff_id");
    return {
      T, fonti, linee, localita, loco, geo, aff,
      src(fonte, pag) {
        const f = fonti.get(fonte); const b = f ? f.breve : fonte;
        return pag ? `${b} ${pag}`.trim() : b;
      },
      breve: f => fonti.get(f).breve,
      punto: (linea, loc) => T.punti_linea.find(p => p.linea_id === linea && p.loc_id === loc) || null,
      // aff_linee per aff_id, nell'ordine dell'indice (aff_id, linea_id)
      affLinee: affId => ordina(T.aff_linee.filter(r => r.aff_id === affId), (x, y) => cmpStr(x.linea_id, y.linea_id))
    };
  }

  function sensoSu(linea, kmDa, kmA) {
    if (!nn(linea.senso_pari)) throw new Errore(`linea ${linea.linea_id}: senso delle progressive non studiato, non posso instradare`);
    const cresce = kmA > kmDa;
    return cresce === (linea.senso_pari === "crescente") ? "pari" : "dispari";
  }
  const numeri = u => [u.gsmr ? `GSM-R ${u.gsmr}` : "", u.fs ? `FS ${u.fs}` : "", u.altro || ""].filter(x => x).join(" · ");

  // T: tabelle del database; V: viaggio (componi); ora: data di creazione (facoltativa)
  function genera(T, V, ora) {
    const db = Database(T);
    const aperti = [], fontiUsate = [];
    const usa = f => { if (!fontiUsate.includes(f)) fontiUsate.push(f); };
    const treno = V.treno, data = V.data;
    const [a_, m_, g_] = data.split("-");
    const dataIt = `${g_}/${m_}/${a_}`;
    const TRENO = `treno ${treno} del ${dataIt}`;
    const categoria = V.categoria || "merci";
    const scheda = V.scheda || {};
    const locoTipi = V.loco.map(l => l.tipo);

    // ------------------------------------------------------------- itinerario
    const tratti = [];
    V.itinerario.forEach((t, i) => {
      const da = t.da, a = t.a;
      let lid = t.linea;
      if (!lid) {
        const cand = ordina(T.punti_linea.filter(p => p.loc_id === da), (x, y) => cmpStr(x.linea_id, y.linea_id))
          .filter(p => T.punti_linea.some(q => q.linea_id === p.linea_id && q.loc_id === a)).map(p => p.linea_id);
        if (cand.length !== 1) throw new Errore(`tratto ${da} → ${a}: linea non univoca [${cand.map(x => "'" + x + "'").join(", ")}], indicarla in 'linea'`);
        lid = cand[0];
      }
      const linea = db.linee.get(lid);
      if (!linea) throw new Errore(`linea ${lid} non nel database`);
      const pDa = db.punto(lid, da), pA = db.punto(lid, a);
      if (!pDa || !pA) throw new Errore(`tratto ${da} → ${a}: località non presenti sulla linea ${lid}`);
      const senso = sensoSu(linea, pDa.km, pA.km);
      const lo = Math.min(pDa.km, pA.km), hi = Math.max(pDa.km, pA.km);
      const cresce = pA.km > pDa.km;
      // indice (linea_id, loc_id), poi ORDER BY km (a parità resta l'ordine dell'indice)
      let punti = ordina(T.punti_linea.filter(p => p.linea_id === lid && between(p.km, lo, hi) && db.localita.has(p.loc_id)), (x, y) => cmpStr(x.loc_id, y.loc_id))
        .map(p => Object.assign({}, p, { nome: db.localita.get(p.loc_id).nome }));
      punti = ordina(punti, cresce ? ((x, y) => x.km - y.km) : ((x, y) => y.km - x.km));
      tratti.push({ lettera: String.fromCharCode(65 + i), linea, senso, da, a, km_da: pDa.km, km_a: pA.km, lo, hi, cresce, punti, ultimo: i === V.itinerario.length - 1 });
      usa(linea.fonte);
      if (i && tratti[i - 1].a !== da) throw new Errore(`itinerario non continuo: ${tratti[i - 1].a} → ${da}`);
    });

    // ------------------------------------------------------------- righe R
    const occ = [];
    for (const t of tratti) {
      t.punti.forEach((p, j) => {
        if (j === 0 && occ.length && occ[occ.length - 1].loc === p.loc_id) {
          const prev = occ[occ.length - 1];
          if (prev.kmv !== p.km) prev.km = prev.km + "/" + f3(p.km);
          prev.out = t;
          return;
        }
        occ.push({ loc: p.loc_id, nome: p.nome, km: f3(p.km), kmv: p.km, inn: j ? t : null, out: p.loc_id !== t.a ? t : null, s: t.lettera });
      });
    }
    for (const o of occ) o.s = (o.out || o.inn).lettera;
    const conta = {}, visti = {};
    for (const o of occ) conta[o.loc] = (conta[o.loc] || 0) + 1;
    for (const o of occ) { visti[o.loc] = (visti[o.loc] || 0) + 1; o.id = conta[o.loc] === 1 ? o.loc : `${o.loc}_${visti[o.loc]}`; }
    const kmSu = (t, loc) => t.punti.find(p => p.loc_id === loc).km;
    const sch = o => get(scheda, o.id) || get(scheda, o.loc) || {};

    const R = [];
    for (const o of occ) {
      const kl = {}; for (const t of [o.inn, o.out]) if (t) kl[t.lettera] = kmSu(t, o.loc);
      const r = { km: o.km, n: o.nome, s: o.s, t: "loc", id: o.id, _kl: kl };
      const sc = sch(o);
      for (const k of ["g", "v", "ind"]) if (sc[k]) r[k] = String(sc[k]);
      R.push(r);
    }
    for (const pt of (V.punti_scheda || []).slice().reverse()) {
      const pos = R.findIndex(r => r.id === pt.dopo);
      if (pos < 0) throw new Errore(`punto della Scheda «${pt.n}» dopo ${pt.dopo}: località non nella scheda`);
      const riga = { km: pt.km, n: pt.n, t: "pt", s: R[pos].s, _kl: { [R[pos].s]: parseFloat(pt.km) } };
      for (const k of ["g", "v", "ind"]) if (pt[k]) riga[k] = String(pt[k]);
      R.splice(pos + 1, 0, riga);
    }

    // ------------------------------------------------------------- prescrizioni M3/M40
    const [PRESC, avvisiM3] = prescrizioni(db, V, R, occ, tratti);
    for (const r of R) delete r._kl;
    R[R.length - 1].end = true;

    // ------------------------------------------------------------- SEG, FIANC, DCO, LOCO
    const SEG = {}, FIANC = {}, DCO = {}, AFF = {}, LOCO = [];
    for (const t of tratti) {
      const L = t.linea, s = t.senso;
      const es = T.esercizio.filter(e => e.linea_id === L.linea_id && (e.senso === s || e.senso === "entrambi") && sovr(e, t.lo, t.hi));
      const nomeDa = db.localita.get(t.da).nome, nomeA = db.localita.get(t.a).nome;
      const pagine = T.pagine_fl.filter(p => p.linea_id === L.linea_id && (p.senso === s || p.senso === "entrambi") &&
        /^principale/i.test(p.tipo || "") && sovr(p, t.lo, t.hi)).map(p => p.pag);
      let testo, st;
      if (es.length) {
        testo = es.map(e => `${e.sistema}: ${e.testo} (${db.src(e.fonte, e.pag)}` + (e.riscontro ? `; riscontro ${e.riscontro}` : "") + ")").join(" · ");
        st = peggiore(...es.map(e => e.st));
        for (const e of es) usa(e.fonte);
        for (const [u, v] of scoperti(es, t.lo, t.hi)) {
          testo += ` · km ${f3(u)}–${f3(v)}: sistema di esercizio da studiare`;
          st = "N";
          aperti.push({ cosa: `Sistema di esercizio km ${f3(u)}–${f3(v)} (${L.nome_breve})`, seg: t.lettera, motivo: "da_studiare",
            richiesta: `STUDIA SOLO sistema di esercizio – ${L.nome_breve} km ${f3(u)}–${f3(v)}, ${TRENO}` });
        }
      } else {
        testo = "sistema di esercizio da studiare"; st = "N";
        aperti.push({ cosa: `Sistema di esercizio ${nomeDa} – ${nomeA}`, seg: t.lettera, motivo: "da_studiare",
          richiesta: `STUDIA SOLO sistema di esercizio – ${nomeDa} – ${nomeA}, ${TRENO}` });
      }
      const fl = db.breve(L.fonte);
      SEG[t.lettera] = { nome: `${nomeDa} – ${nomeA} (${L.nome_breve}, senso ${s})`, fl, pag: pagine.join(", ") || "da indicare", esercizio: testo, st };

      // FIANC: eventi nel verso di marcia, intervallo semiaperto tranne l'ultimo tratto
      const kmLoc = {}; for (const p of t.punti) kmLoc[p.loc_id] = p.km;
      const ev = [];
      for (const e of T.fiancata.filter(e => e.linea_id === L.linea_id && e.senso === s)) {
        let chiave;
        if (nn(e.km)) chiave = e.km;
        else if (nn(e.presso_loc) && e.presso_loc in kmLoc) {
          const d = { prima: -EPS, presso: 0, dopo: EPS }[e.posizione || "presso"];
          chiave = kmLoc[e.presso_loc] + (t.cresce ? d : -d);
        } else continue;
        const pos = t.cresce ? chiave - t.km_da : t.km_da - chiave;
        const lung = Math.abs(t.km_a - t.km_da);
        if (pos < -1e-9 || pos > lung + 1e-9 || (!t.ultimo && pos >= lung - 1e-9)) continue;
        ev.push([pos, e]);
      }
      const evo = ordina(ev, (x, y) => x[0] - y[0]);
      FIANC[t.lettera] = evo.map(([, e]) => ({ k: e.punto + (nn(e.km) && !e.punto.includes("km") ? ` (km ${f3(e.km)})` : ""),
        x: e.testo, st: e.st, src: db.src(e.fonte, e.pag) }));
      for (const [, e] of evo) usa(e.fonte);

      // DCO/DC/DOTE/DCCM del tratto
      const righe = [], vistiTel = new Set();
      for (const u of T.utenze.filter(u => ["DC", "DCO", "DOTE"].includes(u.ruolo) && u.linea_id === L.linea_id && sovr(u, t.lo, t.hi))) {
        const num = numeri(u), k = JSON.stringify([u.chi, num]);
        if (!vistiTel.has(k)) { vistiTel.add(k); righe.push([u.chi, num, db.src(u.fonte, u.pag), u.st]); usa(u.fonte); }
      }
      for (const u of ordina(T.utenze.filter(u => ["DC", "DCO", "DOTE", "DCCM"].includes(u.ruolo) && !nn(u.linea_id) && !nn(u.loc_id) && eq(u.compartimento, L.compartimento)),
        (x, y) => cmpStr(y.ruolo, x.ruolo))) {
        righe.push([u.chi, numeri(u), db.src(u.fonte, u.pag), u.st]); usa(u.fonte);
      }
      if (righe.length) DCO[t.lettera] = righe;

      // LOCO: compatibilità per ogni locomotiva sul tratto
      for (const tipo of locoTipi) {
        const lo_ = db.loco.get(tipo);
        const tt = `${t.lettera} · ${SEG[t.lettera].nome}`;
        if (!lo_) { LOCO.push({ t: tt, x: `${tipo}: locomotiva non nel database`, st: "N", src: "database dati di linea", loco: tipo }); continue; }
        const cc = T.compatibilita.filter(c => c.colonna_de10 === lo_.colonna_de10 && c.linea_id === L.linea_id && sovr(c, t.lo, t.hi));
        if (!cc.length) {
          LOCO.push({ t: tt, x: `${tipo}: compatibilità da studiare`, st: "N", src: "database dati di linea", loco: tipo });
          aperti.push({ cosa: `Compatibilità ${tipo} ${nomeDa} – ${nomeA}`, seg: t.lettera, motivo: "da_studiare",
            richiesta: `STUDIA SOLO compatibilità ${tipo} – ${nomeDa} – ${nomeA}, ${TRENO}` });
          continue;
        }
        for (const c of cc) {
          let x = `${tipo} ${c.simbolo} su «${c.tratto_de}»`;
          if (!c.rango_max) x += ": ESCLUSA";
          else {
            x += `: ammessa fino al rango ${c.rango_max}`;
            if (lo_.rango_dpc && c.rango_max < lo_.rango_dpc) x += ` (più basso del rango ${lo_.rango_dpc} della DPC: velocità del rango ${c.rango_max} d'iniziativa)`;
          }
          if (c.vmax_nota) x += `; limitazione da M40 Tecnico: max ${c.vmax_nota} km/h`;
          if (c.nota) x += `. ${c.nota}`;
          LOCO.push({ t: tt, x, st: c.st, src: db.src(c.fonte, c.pag), loco: tipo });
          usa(c.fonte);
        }
        for (const [u, v] of scoperti(cc, t.lo, t.hi)) {
          LOCO.push({ t: tt, loco: tipo, st: "N", src: "database dati di linea", x: `${tipo}: km ${f3(u)}–${f3(v)} senza riga di compatibilità nel database (da studiare)` });
          aperti.push({ cosa: `Compatibilità ${tipo} ${L.nome_breve} km ${f3(u)}–${f3(v)}`, seg: t.lettera, motivo: "da_studiare",
            richiesta: `STUDIA SOLO compatibilità ${tipo} – ${L.nome_breve} km ${f3(u)}–${f3(v)}, ${TRENO}` });
        }
      }
    }

    // ------------------------------------------------------------- affiancate per tratto
    const latoDi = (affId, lid) => { const r = T.aff_linee.find(x => x.aff_id === affId && x.linea_id === lid); return r ? r.lato : null; };
    const altreLinee = (affId, lid) => { const lato = latoDi(affId, lid); return db.affLinee(affId).filter(al => nn(lato) && al.lato !== lato && db.linee.has(al.linea_id)); };
    const validoPerTreno = cat => {
      if (cat === "tutti") return true;
      if (cat === "solo_impostati_av") return !!V.impostato_av;
      return categoria === "viaggiatori" && (cat === "solo_viaggiatori" || !!V.ertms_l2);
    };
    for (const t of tratti) {
      const L = t.linea;
      const gr = T.aff_linee.filter(al => al.linea_id === L.linea_id && lt(al.km_da, t.hi) && gt(al.km_a, t.lo) && db.aff.has(al.aff_id))
        .map(al => Object.assign({}, db.aff.get(al.aff_id), { g_da: al.km_da, g_a: al.km_a }));
      const letto = T.sez46_letta.find(r => r.linea_id === L.linea_id && le(r.km_da, t.lo) && ge(r.km_a, t.hi)) || null;
      const valide = [], escluse = [];
      for (const g of gr) {
        const nomi = altreLinee(g.aff_id, L.linea_id).map(x => `${db.linee.get(x.linea_id).nome_breve} (${x.tratto})`).join(", ");
        (validoPerTreno(g.categoria) ? valide : escluse).push([g, nomi]);
        usa(g.fonte);
      }
      if (!gr.length && !letto) {
        aperti.push({ cosa: `Linee affiancate ${SEG[t.lettera].nome}`, seg: t.lettera, motivo: "da_studiare",
          richiesta: `STUDIA SOLO linee affiancate – ${SEG[t.lettera].nome}, ${TRENO}` });
        continue;
      }
      const parti = valide.map(([g, n]) => `Affiancata percorribile per categoria: ${n} – ${g.condizioni}`)
        .concat(escluse.map(([g, n]) => `${n}: affiancata solo per ${CATEGORIE[g.categoria]}, quindi NON affiancata per il tuo treno (${categoria}): niente A – ${g.condizioni}`));
      let esito;
      if (valide.length) esito = "presenti";
      else if (letto) { esito = "nessuna"; parti.unshift("Nessuna linea affiancata valida per il tuo treno"); }
      else esito = "non_verificabile";
      let fontiAff = valide.concat(escluse).map(([g]) => db.src(g.fonte, g.pag));
      if (!fontiAff.length) fontiAff = letto ? [db.src(letto.fonte, letto.pag)] : [];
      const stati = valide.concat(escluse).map(([g]) => g.st).concat(letto ? [letto.st] : []);
      AFF[t.lettera] = { txt: parti.join(". "), src: unici(fontiAff).join("; "), st: peggiore(...stati), esito };
    }

    // ------------------------------------------------------------- IND, AFFLOC, DM, GEO
    const IND = {}, AFFLOC = {}, DM = {}, GEO = {};
    for (const o of occ) {
      const tOut = o.out, tIn = o.inn, tRif = tOut || tIn, senso = tRif.senso, sc = sch(o);
      const rows = ordina(T.indicatori.filter(r => r.loc_id === o.loc && r.senso === senso), (x, y) => cmpStr(x.segnale, y.segnale), (x, y) => cmpStr(x.cifra, y.cifra));
      if (rows.length) {
        const piuSegnali = new Set(rows.map(r => r.segnale)).size > 1;
        const tutti = rows.map(r => [r.cifra, (piuSegnali ? `${r.segnale}: ` : "") + r.dove, r.nota || ""]);
        let st = peggiore(...rows.map(r => r.st));
        const src = unici(rows.map(r => db.src(r.fonte, r.pag))).join("; ");
        for (const r of rows) usa(r.fonte);
        const note = []; let trenoInd = "";
        if (tOut) {
          // cifre (senza ripetizioni) che portano sulla linea in uscita: la stessa cifra su due segnali vale una volta
          const mie = unici(rows.filter(r => r.verso_linea === tOut.linea.linea_id).map(r => r.cifra));
          if (mie.length === 1) trenoInd = mie[0];
          else if (mie.length > 1) note.push("più cifre portano sulla tua linea: confrontare con la Scheda Treno");
        }
        if (sc.ind) {
          if (trenoInd && trenoInd !== String(sc.ind)) { note.push(`DISCREPANZA: la Scheda Treno dà ${sc.ind}, il database ${trenoInd}`); st = peggiore(st, "I"); }
          else if (trenoInd) note.push("indicatore della Scheda Treno coerente con il database");
          trenoInd = String(sc.ind);
        } else if (trenoInd) {
          note.push("indicatore del tuo treno ricostruito dal database (linea in uscita): confermare con la Scheda Treno");
          st = peggiore(st, "R");
        }
        IND[o.id] = { treno: trenoInd, tutti, src, st };
        if (note.length) IND[o.id].nota = note.join("; ");

        // AFFLOC (regola del quadrato A, scheda 16f)
        if (tOut) {
          const L = tOut.linea, kml = tOut.punti.find(p => p.loc_id === o.loc).km;
          const voci = [], gia = new Set();
          const gruppi = T.aff_linee.filter(al => al.linea_id === L.linea_id && le(al.km_da, kml) && ge(al.km_a, kml) &&
            ((tOut.cresce && gt(al.km_a, kml + 0.001)) || (!tOut.cresce && lt(al.km_da, kml - 0.001))) && db.aff.has(al.aff_id))
            .map(al => db.aff.get(al.aff_id));
          for (const g of gruppi) {
            for (const al of altreLinee(g.aff_id, L.linea_id)) {
              const ol = Object.assign({}, db.linee.get(al.linea_id), al);       // al.* prima di l.* (vince la prima colonna)
              const indO = rows.filter(r => r.verso_linea === ol.linea_id);
              if (!indO.length) continue;
              if (!validoPerTreno(g.categoria)) continue;
              if (gia.has(ol.linea_id)) continue;
              gia.add(ol.linea_id);
              voci.push(voceAffloc(db, V, o, ol, g, indO[0], trenoInd, rows, src, st, usa, aperti, TRENO));
            }
          }
          if (voci.length) AFFLOC[o.id] = voci;
        }
      }
      const dm = T.utenze.filter(u => u.ruolo === "DM" && eq(u.loc_id, o.loc));
      if (dm.length) {
        DM[o.id] = dm.map(u => [u.chi, numeri(u), db.src(u.fonte, u.pag), u.st]);
        for (const u of dm) usa(u.fonte);
      }
      const gp = db.geo.get(o.loc);
      if (gp && gp.st === "V") GEO[o.id] = { lat: gp.lat, lon: gp.lon, src: gp.src, st: "V" };
    }

    // ------------------------------------------------------------- pagine FL: nella PWA le immagini non ci sono
    const FLPAG = {}, FLLOC = {}, immagini = {};
    aperti.push({ cosa: "Pagine FL del fumetto (fiancata principale e schema unifilare)", motivo: "da_studiare",
      richiesta: `Allegare le immagini delle pagine FL nel database (tabella pagine_fl) – ${TRENO}` });

    // ------------------------------------------------------------- pacchetto
    const fonti = fontiUsate.map(f => { const r = db.fonti.get(f); return { doc: r.documento, edizione: r.edizione, uso: r.note || "" }; });
    if (Object.keys(GEO).length) {
      const r = db.fonti.get("RINF_GPS17");
      if (r) fonti.push({ doc: r.documento, edizione: r.edizione, uso: r.note || "" });
    }
    const nomi = [occ[0].nome, occ[occ.length - 1].nome];
    const quando = (ora || new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
    const intestazione = {
      treno: V.treno_testo || `${treno}`,
      percorso: nomi.join(" → "),
      data_viaggio: dataIt,
      loco: V.loco.map(l => ({ tipo: l.tipo, etichetta: l.etichetta || l.tipo, tratti: Object.keys(SEG) })),
      chip: [V.sigla, unici(Object.values(SEG).map(s => s.fl)).join(", ")].filter(x => x)
    };
    if (PRESC) {
      intestazione.prescrizioni_chip = `Prescrizioni: ${PRESC.moduli.filter(m => m.tipo === "M3").length} M3 · ${PRESC.moduli.filter(m => m.tipo !== "M3").length} M40`;
      intestazione.avvisi = avvisiM3;
    }
    intestazione.nota = "Pacchetto generato dal software (database dati di linea), senza IA: ogni dato viene da una riga del database con fonte e stato.";
    intestazione.piede = "Fonti: " + fonti.map(x => `${x.doc} – ${x.edizione}`).join("; ");
    const p = {
      formato: "adc-copilot-pacchetto", versione_formato: 2, id: `${treno}_${data}`,
      revisione: parseInt(V.revisione === undefined ? 1 : V.revisione, 10), creato: quando,
      input: V.input || { tipo: "traccia", fase: "fase1_traccia" }, comandi: ["STUDIO LINEA CONDOTTA"],
      intestazione, fonti,
      condotta: { TRENO, SEG, R, FIANC, DM, DCO, AFF, IND, AFFLOC, FLPAG, FLLOC, PRESC, LOCO, GEO },
      formazione: V.formazione === undefined ? null : V.formazione, immagini, aperti
    };
    if (p.formazione === null) delete p.formazione;
    return p;
  }

  function prescrizioni(db, V, R, occ, tratti) {
    const P = V.prescrizioni;
    if (!P || !P.moduli || !P.moduli.length) return [null, []];
    const norma = x => x.toUpperCase().replace(/\bMI\b\.?/g, "MILANO").replace(/[^A-Z0-9]/g, "");
    const nomi = new Map();
    for (const o of occ) { const l = db.localita.get(o.loc); nomi.set(o.id, [l.nome].concat((l.alias || "").split("|").filter(a => a))); }
    function trova(nome) {
      const n = norma(nome); let best = 0, bid = null;
      for (const [oid, ns] of nomi) for (const x of ns) {
        const y = norma(x);
        const sc = (n.length >= 5 && y.length >= 5 && (n.startsWith(y) || y.startsWith(n))) ? 0.95 : C.ratio(n, y);
        if (sc > best) { best = sc; bid = oid; }
      }
      return best >= 0.75 ? bid : null;
    }
    const numero = x => (typeof x === "string" ? pyFloat(x.replace(/,/g, ".").replace(/\+/g, ".")) : null);
    const vuoto = x => x === "" || x === "-";
    const lett = {}; for (const t of tratti) lett[t.lettera] = t;
    const moduliOut = [], gruppi = new Map(), dentro = [], fuori = [];
    for (const m of P.moduli) {
      if (m.tipo === "M3") {
        const righeOut = []; let ultimaLinea = null;
        const affiancati = m.linea.toLowerCase().includes("affiancat");
        for (const r of m.righe) {
          if (r.linea && r.linea !== ultimaLinea) { righeOut.push({ sub: `Linea : ${r.linea}` }); ultimaLinea = r.linea; }
          righeOut.push([r.n, r.sinistro, r.destro, r.inizio_cippo, r.velocita, r.lunghezza_m, r.note.join("/")]);
          const bin = (!vuoto(r.sinistro) ? "S" : "") + (!vuoto(r.destro) ? "D" : "");
          const luoghi = !vuoto(r.sinistro) ? r.sinistro : r.destro;
          const linea = affiancati && r.linea ? `affiancata linea ${r.linea}` : (affiancati ? "affiancata" : "tua linea");
          const chiave = JSON.stringify([luoghi, r.inizio_cippo, r.spostabile, r.velocita, r.lunghezza_m, bin, r.note]);
          if (!gruppi.has(chiave)) gruppi.set(chiave, { r, luoghi, bin, linee: [], moduli: [], note: m.note });
          const g = gruppi.get(chiave);
          g.linee.push(linea); g.moduli.push(`M3 n. ${m.n} riga ${r.n}`);
        }
        moduliOut.push({ tipo: "M3", n: m.n, linea: m.linea, stazione: m.stazione || "", data: m.data || "", righe: righeOut, note: m.note });
      } else {
        moduliOut.push({ tipo: "M40", n: m.n, linea: m.linea, stazione: m.stazione || "", data: m.data || "",
          avvisi: m.avvisi.map(a => ({ loc: a.loc, tit: `M40 n. ${m.n} punto ${a.n}`, txt: a.txt })) });
      }
    }
    const avvisi = [];
    for (const g of gruppi.values()) {
      const r = g.r;
      const locs = g.luoghi.split(" – ").map(x => x.trim());
      const ids = locs.map(trova);
      const cippo = !vuoto(r.inizio_cippo) ? numero(r.inizio_cippo) : numero(r.spostabile[0]);
      if (!ids[0]) { fuori.push(g.luoghi); continue; }
      const i0 = R.findIndex(x => x.id === ids[0]);
      let cand = Object.entries(R[i0]._kl);
      if (ids.length > 1 && ids[1]) {
        const i1 = R.findIndex(x => x.id === ids[1]);
        if (i1 >= 0) {
          const comuni = new Set(Object.keys(R[i0]._kl).filter(k => k in R[i1]._kl));
          const c2 = cand.filter(c => comuni.has(c[0]));
          if (c2.length) cand = c2;
        }
      }
      let leg, pos, dove;
      if (cippo !== null) {
        let best = cand[0];
        for (const c of cand) if (Math.abs(c[1] - cippo) < Math.abs(best[1] - cippo)) best = c;
        leg = best[0];
        const t = lett[leg];
        const lungo = k => (t.cresce ? k - t.km_da : t.km_da - k);
        const idx = R.map((x, i) => [x, i]).filter(([x]) => x._kl && leg in x._kl).map(([, i]) => i);
        const prima = idx.filter(i => lungo(R[i]._kl[leg]) <= lungo(cippo) + 1e-9);
        pos = prima.length ? Math.max(...prima) + 1 : (idx.length ? Math.min(...idx) : i0 + 1);
        dove = `cippo km ${fg(cippo)} sulla ${t.linea.nome_breve} (tratto ${leg})`;
      } else {
        leg = R[i0].s; pos = i0 + 1; dove = "subito dopo la località (cippo non indicato)";
      }
      dentro.push(g.luoghi);
      const linee = unici(g.linee);
      let inizio = !vuoto(r.inizio_cippo) ? r.inizio_cippo : r.spostabile[0];
      if (!vuoto(r.spostabile[0]) && !vuoto(r.spostabile[1])) inizio = `${r.spostabile[0]} (spostabile fino al km ${r.spostabile[1]})`;
      const note = ["Linee interessate: " + g.linee.map((l, k) => `${l} (${g.moduli[k]})`).join("; ")];
      for (const k of r.note) if (Object.prototype.hasOwnProperty.call(g.note, k)) note.push(`${k}) ${g.note[k]}`);
      note.push(`Località: ${g.luoghi}; binario ${g.bin === "S" ? "sinistro/legale" : g.bin === "D" ? "destro/illegale" : "sinistro e destro"}`);
      note.push(`Posizione nella scheda calcolata dal programma: ${dove}`);
      const vel = r.velocita.replace(/\D/g, "") || "0", lun = r.lunghezza_m.replace(/\D/g, "") || "0";
      R.splice(pos, 0, { t: "m3", n: `M3 ${g.luoghi} cippo ${inizio} · ${linee.join(" + ")}`, km: cippo !== null ? f3(cippo) : R[i0].km,
        v: vel, s: leg, m3: { velocita: vel, inizio_km: inizio, lunghezza_m: lun, binario: g.bin || "SD", note, modulo: g.moduli.join(", ") } });
      avvisi.push(`**M3 ${vel} km/h** – ${g.luoghi}, cippo ${inizio}, ${lun} m (${linee.join(" + ")})`);
    }
    const rp = P.riepilogo || {};
    const PRESC = { riep: { n: rp.n || "", tratto: rp.tratto || "", consegnati: rp.consegnati || "" },
      dentro: unici(dentro), fuori: unici(fuori), src: P.fonte || "Scheda Treno, moduli richiamati", moduli: moduliOut };
    if (fuori.length) PRESC.fuoriNota = "Località dei moduli non trovate sul percorso del database: righe solo nel tasto Prescrizioni";
    return [PRESC, avvisi];
  }

  function voceAffloc(db, V, o, ol, g, indRow, trenoInd, rows, indSrc, indSt, usa, aperti, TRENO) {
    const T = db.T, controlli = [];
    usa(g.fonte);
    controlli.push(["Categoria del treno ammessa dalla Sez. 4.6", "ok", g.st, db.src(g.fonte, g.pag)]);
    for (const tipo of V.loco.map(l => l.tipo)) {
      const lo = db.loco.get(tipo) || null;
      const kmA = ol.km_a || 0, kmDa = ol.km_da || 0;
      const cc = lo ? T.compatibilita.filter(c => c.colonna_de10 === lo.colonna_de10 && c.linea_id === ol.linea_id && lt(c.km_da, kmA) && gt(c.km_a, kmDa)) : [];
      if (!cc.length) controlli.push([`Compatibilità ${tipo}: non nel database`, "manca", "N", "database dati di linea"]);
      else for (const c of cc) {
        usa(c.fonte);
        const ok = !!c.rango_max;
        controlli.push([`Compatibilità ${tipo}: ${c.simbolo} su «${c.tratto_de}»` + (ok ? "" : " (esclusa)") + (c.vmax_nota ? `, max ${c.vmax_nota} km/h da M40 Tecnico` : ""),
          ok ? "ok" : "no", c.st, db.src(c.fonte, c.pag)]);
      }
      if (lo) {
        usa(lo.fonte);
        const prove = [
          ["alimentazione", () => ol.alimentazione && ol.alimentazione.includes("25") && !(lo.pantografi || "").includes("25"), "Alimentazione"],
          ["etcs_l2_obbl", () => ol.etcs_l2_obbl === 1 && lo.etcs_l2 === 0, "ERTMS/ETCS L2"]];
        for (const [campo, condNo, descr] of prove) {
          if (nn(ol[campo])) controlli.push([`${descr}: ${condNo() ? "incompatibile" : "compatibile"} con ${tipo}`, condNo() ? "no" : "ok", lo.st, db.src(lo.fonte, lo.pag)]);
          else if (cc.length && cc.every(c => c.rango_max && !["25 kV", "ETCS"].some(k => (c.nota || "").includes(k))))
            controlli.push([`${descr}: non trascritta per la linea; coperta dalla DE CTI 10/2016 (ammessa senza note su ETCS o 25 kV)`, "ok", "R", db.src(cc[0].fonte, cc[0].pag)]);
          else controlli.push([`${descr}: dato mancante`, "manca", "N", "database dati di linea"]);
        }
      }
    }
    // colonna delle Sigle: le linee affiancate si percorrono nello stesso senso di marcia del treno
    let colonna = null;
    const sensoO = (o.out || o.inn).senso;
    const colId = String(V.colonna_sigle === undefined || V.colonna_sigle === null ? "" : V.colonna_sigle);
    const sig = colId ? ordina(T.sigle.filter(r => r.linea_id === ol.linea_id && r.senso === (sensoO || "") && r.colonna === colId),
      (x, y) => cmpStr(x.sezione, y.sezione), (x, y) => cmpStr(x.binario, y.binario), (x, y) => x.ordine - y.ordine) : [];
    if (sig.length) {
      const lati = {};
      for (const b of ["sx", "dx"]) {
        const rr = sig.filter(r => r.binario === b || r.binario === "sxdx");
        if (rr.length) { lati[b] = { pag: rr[0].pag, sez: rr[0].sezione, rows: rr.map(r => [r.punto, r.km_txt, r.rs, r.nors, r.stampato]) }; usa(rr[0].fonte); }
      }
      const pieni = Object.keys(lati).length > 0;
      for (const b of ["sx", "dx"]) if (!(b in lati) && pieni) lati[b] = { pag: "—", sez: `binario ${b === "dx" ? "destro" : "sinistro"} non trascritto nel database`, rows: [] };
      if ("sx" in lati && "dx" in lati)
        colonna = { sigla: V.sigla || "", tit: `Colonna ${colId} ${sig[0].titolo}`, nota: sig.every(r => r.binario === "sxdx") ? "binario sinistro e destro uguali" : "", sx: lati.sx, dx: lati.dx };
      const stSig = peggiore(...sig.map(r => r.st));
      let acc = null;
      for (const tipo of V.loco.map(l => l.tipo)) {
        const lo = db.loco.get(tipo) || null;
        const rg = lo ? lo.raggr_sigle : "";
        acc = T.accesso_sigle.find(a => a.fonte === ol.fonte && eq(a.raggruppamento, rg)) || null;
      }
      if (acc && acc.colonne && acc.colonne.split(",").includes(colId))
        controlli.push([`Colonna ${colId} ammessa per il raggruppamento ${acc.raggruppamento}`, "ok", peggiore(stSig, acc.st), db.src(acc.fonte, acc.pag)]);
      else if (acc && acc.colonne)
        controlli.push([`Colonna ${colId} NON ammessa per il raggruppamento ${acc.raggruppamento}`, "no", acc.st, db.src(acc.fonte, acc.pag)]);
      else
        controlli.push([`Colonna ${colId} presente; accesso per il raggruppamento della loco da confermare` + (acc && acc.nota ? ` (${acc.nota})` : ""),
          "ok", "I", acc ? db.src(acc.fonte, acc.pag) : "database dati di linea"]);
    } else {
      controlli.push([`Colonna ${colId || "?"} delle Sigle Complementari della linea affiancata: da studiare`, "manca", "N", "database dati di linea"]);
      aperti.push({ cosa: `Sigle Complementari ${ol.nome_breve} da ${o.nome}`, loc: o.id, motivo: "da_studiare",
        richiesta: `STUDIA SOLO Sigle Complementari ${ol.nome_breve} – ${o.nome} (km ${o.km}), ${TRENO}` });
    }
    const esito = controlli.some(c => c[1] === "no") ? "NON PERCORRIBILE" : controlli.some(c => c[1] === "manca") ? "DA VERIFICARE" : "PERCORRIBILE";
    const stPerc = peggiore(...controlli.map(c => c[2]));
    const ilTuo = trenoInd || "?";
    const lineaTxt = ilTuo !== indRow.cifra ? `${ol.nome_breve} · ${esito} · NON il tuo (il tuo: ${ilTuo})` : `${ol.nome_breve} · ${esito}`;
    const tutti = rows.map(r => `${r.cifra} = ${r.dove}`).join(", ");
    const sigle = [
      { t: "Il tuo indicatore", x: `Tuo: ${ilTuo}. Questa linea: ${indRow.cifra} – NON è quello del tuo treno. Indicatori della località: ${tutti}`, st: indSt, src: indSrc },
      { t: "Percorribilità per il tuo treno", x: `${esito}. ` + controlli.map(c => `[${c[1]}] ${c[0]}`).join(" · "), st: stPerc, src: unici(controlli.map(c => c[3])).join("; ") },
      { t: "Condizioni (note Sez. 4.6)", x: g.condizioni || "Nessuna nota", st: g.st, src: db.src(g.fonte, g.pag) }
    ];
    const voce = { linea: lineaTxt, ind: indRow.cifra, fl: db.breve(ol.fonte), tratto: ol.tratto,
      nota: `Colonna scelta con la sigla ${V.sigla === undefined ? "?" : V.sigla} (colonna ${colId})`, sigle };
    if (colonna) voce.colonna = colonna;
    return voce;
  }

  const API = { genera, Errore, peggiore, scoperti };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Genera = API;
})(typeof self !== "undefined" ? self : this);
