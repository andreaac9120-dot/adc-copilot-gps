// ADC COPILOT – app: archivio viaggi, import dei pacchetti, invio dei comandi a Claude.
const VERSION = "1.0.17";
const LAB_MOTIVO = { da_studiare: "da studiare", attesa_scheda_treno: "attesa Scheda Treno", attesa_massa_treno: "serve la massa", fl_mancante: "FL mancante", illeggibile: "illeggibile", discrepanza_massa: "masse diverse" };
let imgURLs = {};

// ---------- Tema ----------
function applyTheme(t) { if (t) document.documentElement.setAttribute("data-theme", t); }
function toggleTheme() {
  const root = document.documentElement, cur = root.getAttribute("data-theme");
  const isDark = cur === "dark" || (!cur && matchMedia("(prefers-color-scheme: dark)").matches);
  const nt = isDark ? "light" : "dark";
  root.setAttribute("data-theme", nt);
  DB.setConf("tema", nt).catch(() => {});
  toast(isDark ? "Tema Giorno attivato" : "Tema Notte attivato");
}

// ---------- Rete ----------
function net() {
  for (const el of [$("#net"), $("#net2")]) {
    el.className = "net " + (navigator.onLine ? "on" : "off");
    el.textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
  }
}

// ---------- Controllo dei pacchetti – schema 1.0.4, versione_formato 2 (25/10/2026) ----------
// Stessi vincoli dello schema GPS_16d 1.0.4 e del validatore GPS_16e 1.0.4 usati da Claude (rapporto di revisione
// del 22/10/2026, C03 e C15): un pacchetto che Claude consegna come VALIDO entra, uno che il validatore rifiuta no.
// I pacchetti con versione_formato 1 non sono più ammessi: vanno ripubblicati.
// Fa eccezione il controllo delle pagine FL alla revisione 1, che si fa all'import (le immagini non restano nel record).
const FORMATO = 2;
const STATI = ["V", "R", "I", "N"];
const ORDINE_ST = { V: 3, R: 2, I: 1, N: 0 }; // qualità della prova: V migliore, N peggiore
const ESITI_AFF = ["nessuna", "presenti", "non_verificabile"];
const ESITI_PGOS = ["ok", "non_ok", "attenzione", "non_eseguibile"];
const ESITI_STAFFE = ["ok", "non_ok", "non_eseguibile"];
const ORIGINI_MASSA = ["utente", "documenti"];
const MOTIVI = ["da_studiare", "attesa_scheda_treno", "attesa_massa_treno", "fl_mancante", "illeggibile", "discrepanza_massa"];
const MAX_IMG = 12 * 1024 * 1024; // caratteri base64 per immagine (circa 9 MB)
const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const isStr = x => typeof x === "string";
const isTxt = x => isStr(x) && /\S/.test(x); // testo non vuoto, non solo spazi
const isArr = Array.isArray;
const isSt = x => STATI.includes(x);
const has = (o, k) => isObj(o) && isStr(k) && Object.prototype.hasOwnProperty.call(o, k); // C12: mai riferimenti risolti dal prototipo
function dataVera(a, m, g) { const d = new Date(Date.UTC(a, m - 1, g)); return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g; }
function dataOraVera(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(isStr(s) ? s : "");
  return !!m && dataVera(+m[1], +m[2], +m[3]) && +m[4] < 24 && +m[5] < 60 && +m[6] < 60 && (!m[9] || (+m[9] < 24 && +m[10] < 60));
}

function controlla(p) {
  const e = [];
  const ok = (c, msg) => { if (!c) e.push(msg); return !!c; };
  // Dato {v, st, src, nota}: la fonte è obbligatoria per V, R e I; solo N (non reperito) può non averla.
  const datoOk = d => isObj(d) && "v" in d && (d.v === null || isStr(d.v) || Number.isFinite(d.v)) && isSt(d.st) &&
    (d.st === "N" ? (d.src === undefined || isTxt(d.src)) : isTxt(d.src)) && (d.nota === undefined || isStr(d.nota));
  const dato = (d, dove) => d === undefined || ok(datoOk(d), `${dove}: dato non valido (stato V/R/I/N e fonte obbligatoria salvo N)`);
  const tel = (L, dove) => ok(isArr(L) && L.every(x => isArr(x) && x.length === 4 && isStr(x[0]) && isStr(x[1]) && isStr(x[2]) && isSt(x[3])), `${dove}: utenze non valide`);

  if (!isObj(p) || p.formato !== "adc-copilot-pacchetto") return ["non è un pacchetto ADC COPILOT"];
  if (p.versione_formato !== FORMATO) return [p.versione_formato === 1
    ? "pacchetto vecchio (formato 1, prima del 25/10/2026): fallo ripubblicare a Claude con lo schema 1.0.4"
    : `formato v${p.versione_formato} non supportato da questa app (v${FORMATO}): aggiorna l'app`];
  const m = /^([0-9A-Za-z]+)_(\d{4})-(\d{2})-(\d{2})$/.exec(isStr(p.id) ? p.id : "");
  if (ok(m, "id mancante o non valido")) ok(dataVera(+m[2], +m[3], +m[4]), `id ${p.id}: data inesistente`);
  ok(Number.isInteger(p.revisione) && p.revisione >= 1, "revisione mancante o minore di 1");
  ok(dataOraVera(p.creato), "data di creazione mancante o non valida (es. 2026-10-25T09:00:00Z)");
  ok(isArr(p.comandi) && p.comandi.length && p.comandi.every(c => isStr(c) && /^(STUDIO LINEA CONDOTTA|STUDIO LINEA FORMAZIONE|STUDIA SOLO .+)$/.test(c)) && new Set(p.comandi).size === p.comandi.length, "comandi mancanti o non validi");
  ok(isArr(p.fonti) && p.fonti.length && p.fonti.every(f => isObj(f) && isTxt(f.doc) && isTxt(f.edizione) && (f.uso === undefined || isStr(f.uso))), "fonti mancanti o senza documento/edizione");
  ok(isObj(p.input) && ["scheda_treno", "traccia"].includes(p.input.tipo) && ["fase1_traccia", "completa"].includes(p.input.fase), "input del viaggio mancante o non valido");

  const I = p.intestazione;
  if (ok(isObj(I), "intestazione mancante")) {
    ok(isTxt(I.treno), "intestazione: numero treno mancante");
    ok(isStr(I.percorso), "intestazione: percorso mancante");
    const dv = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(isStr(I.data_viaggio) ? I.data_viaggio : "");
    if (ok(dv, "intestazione: data del viaggio mancante") && ok(dataVera(+dv[3], +dv[2], +dv[1]), `intestazione: data ${I.data_viaggio} inesistente`) && m)
      ok(+dv[3] === +m[2] && +dv[2] === +m[3] && +dv[1] === +m[4], `data del viaggio ${I.data_viaggio} diversa da quella dell'id ${p.id}`); // C05
    if (m && isTxt(I.treno)) ok(new RegExp(`(^|[^0-9A-Za-z])${m[1]}([^0-9A-Za-z]|$)`).test(I.treno), `numero treno "${I.treno}" diverso da quello dell'id ${p.id}`); // C05
    ok(isArr(I.loco) && I.loco.length && I.loco.every(l => isObj(l) && isStr(l.tipo) && isStr(l.etichetta) && (l.tratti === undefined || (isArr(l.tratti) && l.tratti.every(isStr)))), "intestazione: locomotive mancanti");
    for (const k of ["chip", "avvisi"]) if (I[k] !== undefined) ok(isArr(I[k]) && I[k].every(isStr), `intestazione: ${k} non valido`);
  }

  const c = p.condotta;
  if (!ok(isObj(c), "dati della scheda mancanti")) return e;
  for (const k of ["SEG", "FIANC", "DM", "DCO", "AFF", "IND", "AFFLOC", "FLPAG", "FLLOC"]) ok(isObj(c[k]), `scheda: ${k} mancante`);
  ok(c.PLPROT === undefined || isObj(c.PLPROT), "scheda: PLPROT non valido");
  ok(c.GEO === undefined || isObj(c.GEO), "scheda: GEO non valido");
  ok(isArr(c.LOCO), "scheda: LOCO mancante");
  ok(c.PRESC === null || isObj(c.PRESC), "scheda: PRESC mancante (null se non ci sono prescrizioni)");
  ok(isStr(c.TRENO), "scheda: TRENO mancante");
  if (!ok(isArr(c.R) && c.R.length >= 2, "scheda: righe del percorso mancanti") || e.length) return e;

  for (const [k, g] of Object.entries(c.SEG)) ok(/^[A-Z][0-9]?$/.test(k) && isObj(g) && isStr(g.nome) && isStr(g.fl) && isStr(g.pag) && isStr(g.esercizio) && isSt(g.st), `tratto ${k}: dati non validi`);
  // ogni riga località ha un id proprio: se il treno passa due volte dalla stessa località, due id diversi.
  const ids = new Set();
  c.R.forEach((r, i) => {
    const n = `riga ${i + 1}`;
    if (!ok(isObj(r) && isStr(r.n) && isStr(r.km) && ["loc", "pt", "m3"].includes(r.t), `${n}: riga non valida`)) return;
    for (const k of ["g", "v", "ind"]) if (r[k] !== undefined) ok(isStr(r[k]), `${n} (${r.n}): ${k} non valido`);
    if (r.s !== undefined) ok(has(c.SEG, r.s), `${n} (${r.n}): tratto ${r.s} inesistente`);
    if (r.end !== undefined) ok(r.end === true, `${n} (${r.n}): end non valido`);
    if (r.t === "loc") {
      ok(r.s !== undefined, `${n} (${r.n}): tratto mancante`);
      if (ok(isTxt(r.id), `${n} (${r.n}): id località mancante`)) {
        ok(!ids.has(r.id), `${n} (${r.n}): id "${r.id}" ripetuto (ogni passaggio da una località deve avere un id proprio)`);
        ids.add(r.id);
      }
    }
    if (r.t === "m3") {
      ok(c.PRESC, `${n} (${r.n}): riga prescrizioni senza il blocco delle prescrizioni`);
      const d = r.m3; // C15 – solo il formato strutturato dello schema: niente M3 vecchio, niente campi vuoti
      ok(isObj(d) && isStr(d.velocita) && /^\d{1,3}$/.test(d.velocita) && isTxt(d.inizio_km) &&
        isStr(d.lunghezza_m) && /^\d{1,6}$/.test(d.lunghezza_m) && ["S", "D", "SD"].includes(d.binario) &&
        isArr(d.note) && d.note.every(isTxt) && (d.modulo === undefined || isStr(d.modulo)) &&
        (r.v === undefined || r.v === d.velocita),
        `${n} (${r.n}): dati M3 non validi`);
    } else if (r.m3 !== undefined) ok(false, `${n} (${r.n}): dati M3 su una riga non M3`);
  });
  ok(c.R[c.R.length - 1].end === true, "l'ultima riga del percorso non è segnata come arrivo");

  for (const [s, L] of Object.entries(c.FIANC)) { ok(has(c.SEG, s), `fiancata: tratto ${s} inesistente`); ok(isArr(L) && L.every(x => isObj(x) && isStr(x.k) && isStr(x.x) && isSt(x.st) && isTxt(x.src)), `fiancata ${s}: righe non valide`); }
  for (const [s, L] of Object.entries(c.DCO)) { ok(has(c.SEG, s), `DCO: tratto ${s} inesistente`); tel(L, `DCO ${s}`); }
  for (const [s, a] of Object.entries(c.AFF)) {
    ok(has(c.SEG, s), `affiancate: tratto ${s} inesistente`);
    ok(isObj(a) && isStr(a.txt) && isTxt(a.src) && isSt(a.st) && ESITI_AFF.includes(a.esito), `affiancate ${s}: esito non valido`);
  }
  // GEO facoltativo: solo coordinate documentate e riferite all'id del passaggio, non al nome.
  if (isObj(c.GEO)) for (const [id, g] of Object.entries(c.GEO)) {
    ok(ids.has(id), `GEO: località ${id} inesistente`);
    ok(isObj(g) && Number.isFinite(g.lat) && Math.abs(g.lat) <= 90 &&
      Number.isFinite(g.lon) && Math.abs(g.lon) <= 180 && isTxt(g.src) && isSt(g.st),
      `GEO ${id}: coordinate/fonte/stato non validi`);
  }
  for (const [id, L] of Object.entries(c.DM)) { ok(ids.has(id), `DM: località ${id} inesistente`); tel(L, `DM ${id}`); }
  for (const [id, d] of Object.entries(c.IND)) { ok(ids.has(id), `indicatori: località ${id} inesistente`); ok(isObj(d) && isStr(d.treno) && isTxt(d.src) && isSt(d.st) && isArr(d.tutti) && d.tutti.every(x => isArr(x) && x.length === 3 && x.every(isStr)), `indicatori ${id}: non validi`); }
  for (const [id, d] of Object.entries(c.PLPROT || {})) { ok(ids.has(id), `PL protetti: località ${id} inesistente`); ok(isObj(d) && isTxt(d.src) && isSt(d.st) && isArr(d.pl) && d.pl.every(x => isArr(x) && x.length === 3 && x.every(isStr)), `PL protetti ${id}: non validi`); }
  const colOk = b => isObj(b) && isStr(b.pag) && isStr(b.sez) && isArr(b.rows) && b.rows.every(x => isArr(x) && x.length === 5 && x.slice(0, 4).every(isStr) && (x[4] === 0 || x[4] === 1));
  for (const [id, L] of Object.entries(c.AFFLOC)) {
    ok(ids.has(id), `affiancate: località ${id} inesistente`);
    ok(isArr(L) && L.length && L.every(l => isObj(l) && isStr(l.linea) && isStr(l.ind) && isStr(l.fl) && isStr(l.tratto) &&
      (l.colonna === undefined || (isObj(l.colonna) && isStr(l.colonna.sigla) && isStr(l.colonna.tit) && colOk(l.colonna.sx) && colOk(l.colonna.dx))) &&
      (l.sigle === undefined || (isArr(l.sigle) && l.sigle.every(x => isObj(x) && isStr(x.t) && isStr(x.x) && isSt(x.st) && (x.st === "N" ? (x.src === undefined || isTxt(x.src)) : isTxt(x.src)))))), `affiancate ${id}: linee non valide`);
  }
  for (const [k, g] of Object.entries(c.FLPAG)) ok(isObj(g) && isStr(g.titolo) && isArr(g.pag) && g.pag.length && g.pag.every(x => isObj(x) && isStr(x.t) && isTxt(x.src) && isStr(x.img) && x.img.startsWith("img/")), `pagine FL ${k}: non valide`);
  for (const [id, d] of Object.entries(c.FLLOC)) {
    ok(ids.has(id), `pagine FL: località ${id} inesistente`);
    if (ok(isObj(d), `pagine FL di ${id}: non valide`)) for (const [t, k] of Object.entries(d)) ok(["fianc", "schema"].includes(t) && has(c.FLPAG, k), `pagine FL di ${id}: ${k} inesistente`);
  }
  ok(c.LOCO.every(l => isObj(l) && isStr(l.t) && isStr(l.x) && isSt(l.st) && isTxt(l.src)), "scheda: compatibilità locomotiva non valida");
  const Q = c.PRESC;
  if (Q) ok(isObj(Q.riep) && isStr(Q.riep.n) && isStr(Q.riep.tratto) && isStr(Q.riep.consegnati) && isTxt(Q.src) &&
    isArr(Q.dentro) && Q.dentro.every(isStr) && isArr(Q.fuori) && Q.fuori.every(isStr) &&
    isArr(Q.moduli) && Q.moduli.every(md => isObj(md) && ["M3", "M40", "M40DL", "M40TELEC"].includes(md.tipo) && isStr(md.n) &&
      (md.righe === undefined || (isArr(md.righe) && md.righe.every(x => (isArr(x) && x.length === 7 && x.every(isStr)) || (isObj(x) && isStr(x.sub))))) &&
      (md.note === undefined || isObj(md.note)) &&
      (md.avvisi === undefined || (isArr(md.avvisi) && md.avvisi.every(a => isObj(a) && isStr(a.loc) && isStr(a.tit) && isStr(a.txt))))), "prescrizioni: dati non validi");

  const F = p.formazione;
  ok(!(isArr(p.comandi) && p.comandi.includes("STUDIO LINEA FORMAZIONE")) || isObj(F), "comando formazione dichiarato ma studio di formazione assente");
  if (F !== undefined && F !== null && ok(isObj(F), "formazione non valida")) {
    if (ok(isArr(F.tratti) && F.tratti.length, "formazione: tratti mancanti"))
      F.tratti.forEach((t, i) => {
        if (!ok(isObj(t) && isStr(t.da) && isStr(t.a) && isStr(t.linea) && typeof t.affiancata === "boolean", `formazione: tratto ${i + 1} non valido`)) return;
        if (t.seg !== undefined) ok(has(c.SEG, t.seg), `formazione: tratto ${i + 1}: ${t.seg} inesistente`);
        for (const k of ["codifica_tc", "d4", "frenatura", "gdp"]) dato(t[k], `formazione ${t.da}–${t.a} ${k}`);
      });
    ok(isArr(F.prestazione_massima) && F.prestazione_massima.every(x => isObj(x) && isStr(x.loco) && isStr(x.gdp) && isStr(x.dove) && (x.t === null || Number.isFinite(x.t)) && isSt(x.st) && isTxt(x.src)), "formazione: prestazione massima non valida");
    const G = F.pgos;
    let massa = null;
    if (ok(isObj(G) && isArr(G.controlli), "formazione: controlli PGOS mancanti")) {
      massa = G.massa_t;
      const campi = ["massa_origine", "massa_fonte", "massa_st", "massa_riscontro"].filter(k => G[k] !== undefined);
      if (massa === null) {
        ok(!campi.length, `PGOS: senza massa del treno non vanno indicati ${campi.join(", ")}`);
        ok(isTxt(G.nota), "PGOS: senza massa serve la nota \"non eseguibile: massa del treno non fornita\"");
      } else if (ok(Number.isFinite(massa) && massa > 0, "PGOS: massa del treno non valida")) {
        ok(ORIGINI_MASSA.includes(G.massa_origine), "PGOS: origine della massa mancante (solo utente o documenti del treno)");
        ok(isTxt(G.massa_fonte), "PGOS: fonte della massa mancante");
        ok(isSt(G.massa_st), "PGOS: stato della massa mancante");
        if (G.massa_origine === "utente") ok(G.massa_st === "V", "PGOS: la massa fornita da te ha stato V");
        if (G.massa_origine === "documenti") ok(["V", "I"].includes(G.massa_st) && G.massa_riscontro === undefined, "PGOS: massa dai documenti con stato V o I e senza riscontro");
        const f = String(G.massa_fonte || "").toLowerCase();
        ok(!(f.includes("prestazione") && f.includes("scheda")), "PGOS: la massa non si prende dalla Prestazione della Scheda Treno");
        const RS = G.massa_riscontro;
        if (RS !== undefined) ok(isObj(RS) && Number.isFinite(RS.t) && RS.t > 0 && isTxt(RS.fonte) && isSt(RS.st) && ["concorde", "discorde"].includes(RS.esito), "PGOS: riscontro della massa non valido");
      }
      ok(G.nota === undefined || isStr(G.nota), "PGOS: nota non valida");
      G.controlli.forEach((x, i) => {
        const nome = `PGOS: controllo ${i + 1}${isObj(x) && isStr(x.t) ? ` (${x.t})` : ""}`;
        if (!ok(isObj(x) && isStr(x.t) && ESITI_PGOS.includes(x.esito) && isSt(x.st) && isTxt(x.src) && (x.x === undefined || isStr(x.x)), `${nome}: non valido`)) return;
        // C01/C16 – stato ed esito sono separati: l'esito non può avere uno stato migliore delle sue premesse.
        if (x.esito === "non_eseguibile") ok(x.st === "N", `${nome}: non eseguibile richiede stato N`);
        else if (ok(massa !== null, `${nome}: esito senza massa del treno`) && isSt(G.massa_st)) {
          ok(ORDINE_ST[x.st] <= ORDINE_ST[G.massa_st], `${nome}: stato ${x.st} migliore di quello della massa (${G.massa_st})`);
          if (isObj(G.massa_riscontro) && G.massa_riscontro.esito === "discorde") ok(x.st === "I" || x.st === "N", `${nome}: con la massa discorde dai documenti lo stato è al massimo I`);
        }
      });
      if (isObj(G.massa_riscontro) && G.massa_riscontro.esito === "discorde")
        ok(isArr(p.aperti) && p.aperti.some(a => isObj(a) && a.motivo === "discrepanza_massa"), "PGOS: massa discorde dai documenti senza il punto aperto \"discrepanza_massa\"");
    }
    const S = F.staffe;
    if (S !== undefined && S !== null && ok(isObj(S) && ESITI_STAFFE.includes(S.esito) && isSt(S.st) && isTxt(S.src) && isObj(S.pendenza_max) && isObj(S.grado_gravoso) && (S.x === undefined || isStr(S.x)), "staffe: dati non validi (esito, stato e fonte obbligatori)")) {
      dato(S.pendenza_max, "staffe: pendenza"); dato(S.grado_gravoso, "staffe: grado"); dato(S.tab36_min, "staffe: tab. 36");
      if (S.esito === "non_eseguibile") ok(S.st === "N", "staffe: non eseguibile richiede stato N");
      else {
        ok(S.st !== "N", "staffe: esito con stato N");
        ok(massa !== null, "staffe: esito senza massa del treno");
        const prem = [S.pendenza_max, S.grado_gravoso, S.tab36_min].filter(d => isObj(d) && isSt(d.st)).map(d => d.st);
        const peggiore = prem.reduce((a, b) => ORDINE_ST[b] < ORDINE_ST[a] ? b : a, "V");
        ok(!isSt(S.st) || ORDINE_ST[S.st] <= ORDINE_ST[peggiore], `staffe: stato dell'esito ${S.st} migliore della premessa peggiore (${peggiore})`);
      }
    }
  }
  if (p.aperti !== undefined && ok(isArr(p.aperti), "punti aperti non validi"))
    p.aperti.forEach((a, i) => {
      if (!ok(isObj(a) && isStr(a.cosa) && isStr(a.richiesta) && (a.motivo === undefined || MOTIVI.includes(a.motivo)), `punto aperto ${i + 1}: non valido`)) return;
      if (a.loc !== undefined) ok(ids.has(a.loc), `punto aperto ${i + 1}: località ${a.loc} inesistente`);
      if (a.seg !== undefined) ok(has(c.SEG, a.seg), `punto aperto ${i + 1}: tratto ${a.seg} inesistente`);
    });
  // immagini: solo data URL JPEG/PNG/WebP in base64, con percorso img/… e dimensione ragionevole
  if (p.immagini !== undefined && ok(isObj(p.immagini), "immagini non valide"))
    for (const [k, v] of Object.entries(p.immagini))
      ok(/^img\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/.test(k) && isStr(v) && v.length <= MAX_IMG && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v), `immagine ${String(k).slice(0, 60)}: non è un'immagine incorporata valida`);
  // nessuno stato fuori da V/R/I/N in tutto il pacchetto
  const giro = (x, dove) => {
    if (isArr(x)) x.forEach((v, i) => giro(v, `${dove}[${i}]`));
    else if (isObj(x)) for (const [k, v] of Object.entries(x)) { if (k === "immagini") continue; if (k === "st" && !isSt(v)) e.push(`${dove}.st: stato "${String(v).slice(0, 20)}" non ammesso`); else giro(v, `${dove}.${k}`); }
  };
  giro(p, "pacchetto");
  return [...new Set(e)];
}

// Converte la data URL in immagine senza rete e verifica che si possa davvero aprire.
async function immagineDa(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) throw new Error("formato");
  const bin = atob(m[2]), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const b = new Blob([a], { type: m[1] });
  if (typeof createImageBitmap === "function") { const bm = await createImageBitmap(b); if (bm.close) bm.close(); }
  return b;
}
function testoErrore(err) {
  if (err && err.name === "QuotaExceededError") return "spazio esaurito nel telefono";
  return (err && (err.message || err.name)) || "errore sconosciuto";
}

// ---------- Import dei pacchetti ----------
// Restituisce { ok, id, avvisi } oppure { err }.
async function importaTesto(txt, nome) {
  let p;
  try { p = JSON.parse(txt); } catch (_) { return { err: `${nome}: file non leggibile (JSON non valido)` }; }
  if (eBlocco(p)) return importaBlocco(p, nome);
  const e = controlla(p);
  if (e.length) return { err: `${nome}: ${e.slice(0, 10).join("; ")}${e.length > 10 ? ` (e altri ${e.length - 10} problemi)` : ""}` };
  const vecchio = await DB.getViaggio(p.id);
  // 1.0.13 – pacchetto di sola condotta su un viaggio che nel telefono ha già la formazione (unita dal blocco):
  // il confronto delle revisioni si fa con la revisione della condotta, perché l'unione del blocco l'ha già alzata.
  const tieniF = !!(vecchio && isObj(vecchio.formazione) && !isObj(p.formazione));
  const revRif = vecchio ? (tieniF && Number.isInteger(vecchio.rev_condotta) ? vecchio.rev_condotta : vecchio.revisione) : 0;
  if (vecchio && Number.isInteger(revRif) && revRif > p.revisione && !confirm(`Hai già la revisione ${vecchio.revisione} del treno ${p.intestazione.treno}. Sostituirla con la ${p.revisione}, più vecchia?`)) return { err: `${nome}: non importato (tenuta la revisione ${vecchio.revisione})` };
  // D09 – tutte le immagini vengono decodificate prima di salvare: se una è rovinata il pacchetto non entra,
  // così non resta in uso una vecchia pagina con lo stesso nome al posto di quella nuova.
  const blobs = {};
  for (const [path, dataUrl] of Object.entries(p.immagini || {})) {
    try { blobs[path] = await immagineDa(dataUrl); }
    catch (_) { return { err: `${nome}: pagina FL ${path} rovinata o non leggibile, pacchetto non importato` }; }
  }
  // Pagine FL usate dalla scheda ma assenti dal pacchetto.
  // C02 – alla revisione 1 devono esserci tutte (come nel validatore GPS_16e 1.0.4). Dalla revisione 2 riuso quelle
  // già nel telefono, ma l'avviso resta salvato nel viaggio e compare a ogni apertura, non solo all'import.
  const avvisi = [], usate = new Set(Object.values(p.condotta.FLPAG).flatMap(g => g.pag.map(x => x.img)));
  const mancantiRev1 = [...usate].filter(path => !blobs[path]);
  if (p.revisione === 1 && mancantiRev1.length) return { err: `${nome}: revisione 1 senza ${mancantiRev1.length} pagine FL (${mancantiRev1.slice(0, 3).join(", ")}${mancantiRev1.length > 3 ? "…" : ""}): chiedi a Claude di ripubblicarlo con tutte le pagine` };
  let riusate = 0;
  for (const path of usate) {
    if (blobs[path]) continue;
    let b = null; try { b = await DB.getImg(p.id, path); } catch (_) {}
    if (b) riusate++; else avvisi.push(`pagina FL ${path} assente: la scheda la mostrerà come mancante`);
  }
  if (riusate) avvisi.push(`${riusate} pagine FL prese dalla revisione precedente: non sono state ripubblicate con questa revisione, verifica che l'edizione del FL non sia cambiata`);
  delete p.immagini;
  p.rev_condotta = p.revisione; // dato locale: revisione della condotta ricevuta da ADC COPILOT
  if (tieniF) {
    const r = conservaFormazione(p, vecchio);
    avvisi.push(...r.avvisi);
    const e2 = controlla(p);
    if (e2.length) return { err: `${nome}: non importato. Il viaggio salvato ha la formazione, ma non si può conservare con questa condotta: ${e2.slice(0, 6).join("; ")}. Rifai lo studio di formazione su questo pacchetto.` };
  }
  p.importato = new Date().toISOString();
  p.avvisi_import = avvisi; // dato locale dell'app, mostrato nella scheda (non fa parte del pacchetto di Claude)
  try { await DB.putViaggio(p, blobs); } catch (err) { return { err: `${nome}: salvataggio non riuscito (${testoErrore(err)})` }; }
  return { ok: true, id: p.id, avvisi: avvisi.map(a => `${p.intestazione.treno}: ${a}`) };
}
// ---------- Blocco formazione da ADC FORMAZIONE (1.0.12) ----------
// Il file blocco_formazione_<treno>_<data>.json contiene solo lo studio di formazione:
//   { id, comando, formazione, fonti?, aperti? }  (scheda F16 del progetto ADC FORMAZIONE)
// L'app lo unisce al viaggio già salvato, con le stesse regole dello script F16g_unisci_formazione.py:
// formazione sostituita, revisione +1, comando e fonti aggiunti senza doppioni, aperti "[FORMAZIONE]" rinnovati.
// Il risultato passa lo stesso controllo dei pacchetti: se non è valido non si salva nulla.
const PREF_F = "[FORMAZIONE] ";
const eBlocco = b => isObj(b) && b.formato === undefined && isObj(b.formazione) && (b.id === undefined || isStr(b.id));
const numeroTreno = id => (/^([0-9A-Za-z]+)_\d{4}-\d{2}-\d{2}$/.exec(String(id || "")) || [])[1];
const dataDi = id => (/_(\d{4}-\d{2}-\d{2})$/.exec(String(id || "")) || [])[1];
// Trova il viaggio: prima lo stesso id; altrimenti stessa data e numero treno del blocco scritto nell'intestazione
// (es. blocco 63718 e viaggio "65720 / 65729 (origine 63718/56072 …)"). In questo secondo caso chiede conferma.
async function viaggioPerBlocco(b) {
  if (!isStr(b.id)) return { err: "il blocco non ha l'id del viaggio (<treno>_<aaaa-mm-gg>)" };
  const stesso = await DB.getViaggio(b.id);
  if (stesso) return { v: stesso };
  const num = numeroTreno(b.id), data = dataDi(b.id);
  if (!num || !data) return { err: `id ${b.id} non valido` };
  const re = new RegExp(`(^|[^0-9A-Za-z])${num}([^0-9A-Za-z]|$)`);
  const tutti = await DB.listViaggi();
  const cand = tutti.filter(v => dataDi(v && v.id) === data && isObj(v.intestazione) && (re.test(String(v.intestazione.treno)) || re.test(String(v.condotta && v.condotta.TRENO))));
  if (!cand.length) return { err: `nessun viaggio salvato del ${data.split("-").reverse().join("/")} con il treno ${num}: importa prima il pacchetto di condotta` };
  if (cand.length > 1) return { err: `più viaggi del ${data.split("-").reverse().join("/")} contengono il treno ${num} (${cand.map(v => v.id).join(", ")}): chiedi a Claude il blocco con l'id esatto del viaggio` };
  const v = cand[0];
  if (!confirm(`Il blocco formazione è del treno ${num}. Aggiungerlo al viaggio ${v.intestazione.treno} del ${v.intestazione.data_viaggio}?`)) return { err: "non importato (unione annullata)" };
  return { v };
}
function unisciBlocco(v, b) {
  const p = JSON.parse(JSON.stringify(v)), avvisi = [];
  delete p.importato; delete p.avvisi_import; delete p.rev_condotta;
  const F = JSON.parse(JSON.stringify(b.formazione));
  // collegamenti a tratti o località che nel viaggio non esistono (studio fatto senza il pacchetto): tolti e segnalati
  const segOk = k => has(p.condotta.SEG, k);
  const locOk = new Set((p.condotta.R || []).filter(r => r && r.t === "loc").map(r => r.id));
  if (isArr(F.tratti)) F.tratti.forEach(t => { if (isObj(t) && t.seg !== undefined && !segOk(t.seg)) { avvisi.push(`formazione ${t.da}–${t.a}: collegamento al tratto "${t.seg}" tolto (non esiste nella scheda di condotta)`); delete t.seg; } });
  p.formazione = F;
  p.revisione = (Number.isInteger(v.revisione) ? v.revisione : 0) + 1;
  p.creato = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  // "STUDIA SOLO …" resta com'è; ogni altro testo (es. "STUDIO LINEA FORMAZIONE con la traccia") diventa il comando standard
  const cmd = isStr(b.comando) && /^STUDIA SOLO .+/.test(b.comando.split("\n")[0]) ? b.comando.split("\n")[0] : "STUDIO LINEA FORMAZIONE";
  if (!p.comandi.includes(cmd)) p.comandi.push(cmd);
  const viste = new Set(p.fonti.map(f => `${f.doc}\u0000${f.edizione}`));
  for (const f of isArr(b.fonti) ? b.fonti : []) {
    const k = isObj(f) ? `${f.doc}\u0000${f.edizione}` : "";
    if (isObj(f) && !viste.has(k)) { p.fonti.push(f); viste.add(k); }
  }
  const aperti = (isArr(p.aperti) ? p.aperti : []).filter(a => !(isObj(a) && isStr(a.cosa) && a.cosa.startsWith(PREF_F.trim())));
  for (const a0 of isArr(b.aperti) ? b.aperti : []) {
    if (!isObj(a0)) { aperti.push(a0); continue; }
    const a = { ...a0 };
    if (isStr(a.cosa) && !a.cosa.startsWith(PREF_F.trim())) a.cosa = PREF_F + a.cosa;
    if (a.seg !== undefined && !segOk(a.seg)) { avvisi.push(`punto aperto "${a.cosa}": tratto "${a.seg}" tolto`); delete a.seg; }
    if (a.loc !== undefined && !locOk.has(a.loc)) { avvisi.push(`punto aperto "${a.cosa}": località "${a.loc}" tolta`); delete a.loc; }
    aperti.push(a);
  }
  if (aperti.length || p.aperti !== undefined) p.aperti = aperti;
  return { p, avvisi };
}
async function importaBlocco(b, nome) {
  let r;
  try { r = await viaggioPerBlocco(b); } catch (err) { return { err: `${nome}: archivio non leggibile (${testoErrore(err)})` }; }
  if (r.err) return { err: `${nome}: ${r.err}` };
  const v = r.v;
  if (!valido(v)) return { err: `${nome}: il viaggio ${v.id} salvato nel telefono non è leggibile con le regole attuali: reimporta prima il pacchetto di condotta` };
  const { p, avvisi } = unisciBlocco(v, b);
  const e = controlla(p);
  if (e.length) return { err: `${nome}: formazione non aggiunta, il risultato non è valido: ${e.slice(0, 8).join("; ")}${e.length > 8 ? ` (e altri ${e.length - 8} problemi)` : ""}` };
  p.rev_condotta = Number.isInteger(v.rev_condotta) ? v.rev_condotta : v.revisione;
  p.importato = new Date().toISOString();
  p.avvisi_import = [...(isArr(v.avvisi_import) ? v.avvisi_import.filter(a => !String(a).startsWith("formazione ") && !String(a).startsWith("punto aperto ")) : []), ...avvisi];
  try { await DB.putViaggio(p, {}); } catch (err) { return { err: `${nome}: salvataggio non riuscito (${testoErrore(err)})` }; }
  return { ok: true, id: p.id, avvisi: [`${p.intestazione.treno}: formazione aggiunta (revisione ${p.revisione})`, ...avvisi.map(a => `${p.intestazione.treno}: ${a}`)] };
}

// 1.0.13 – ADC COPILOT ripubblica la condotta (es. fase 2 con la Scheda) senza il blocco formazione:
// si conservano formazione, punti aperti "[FORMAZIONE]", fonti e comando di formazione del viaggio salvato,
// e la revisione supera quella salvata. I collegamenti a tratti o località spariti dalla condotta si tolgono e si segnalano.
function conservaFormazione(p, v) {
  const avvisi = [];
  const F = JSON.parse(JSON.stringify(v.formazione));
  const segOk = k => has(p.condotta.SEG, k);
  const locOk = new Set((p.condotta.R || []).filter(r => r && r.t === "loc").map(r => r.id));
  if (isArr(F.tratti)) F.tratti.forEach(t => { if (isObj(t) && t.seg !== undefined && !segOk(t.seg)) { avvisi.push(`formazione ${t.da}–${t.a}: collegamento al tratto "${t.seg}" tolto (non esiste nella nuova condotta)`); delete t.seg; } });
  p.formazione = F;
  for (const c of isArr(v.comandi) ? v.comandi : []) if (c === "STUDIO LINEA FORMAZIONE" && !p.comandi.includes(c)) p.comandi.push(c);
  const viste = new Set(p.fonti.map(f => `${f.doc}\u0000${f.edizione}`));
  for (const f of isArr(v.fonti) ? v.fonti : []) {
    const k = isObj(f) ? `${f.doc}\u0000${f.edizione}` : "";
    if (isObj(f) && f.uso === "formazione" && !viste.has(k)) { p.fonti.push(f); viste.add(k); }
  }
  const apertiF = (isArr(v.aperti) ? v.aperti : []).filter(a => isObj(a) && isStr(a.cosa) && a.cosa.startsWith(PREF_F.trim())).map(a => ({ ...a }));
  for (const a of apertiF) {
    if (a.seg !== undefined && !segOk(a.seg)) { avvisi.push(`punto aperto "${a.cosa}": tratto "${a.seg}" tolto`); delete a.seg; }
    if (a.loc !== undefined && !locOk.has(a.loc)) { avvisi.push(`punto aperto "${a.cosa}": località "${a.loc}" tolta`); delete a.loc; }
  }
  const altri = (isArr(p.aperti) ? p.aperti : []).filter(a => !(isObj(a) && isStr(a.cosa) && a.cosa.startsWith(PREF_F.trim())));
  if (apertiF.length || p.aperti !== undefined) p.aperti = [...altri, ...apertiF];
  p.revisione = Math.max(p.revisione, (Number.isInteger(v.revisione) ? v.revisione : 0) + 1);
  avvisi.unshift(`formazione del viaggio salvato conservata (questo pacchetto contiene solo la condotta); revisione ${p.revisione}`);
  return { avvisi };
}

// D01 – ogni file ha il suo esito; un errore su un file non ferma gli altri.
async function importaFiles(files) {
  const esiti = [];
  for (const f of files) {
    const nome = f.name || "file";
    let r;
    try { r = await importaTesto(await f.text(), nome); } catch (err) { r = { err: `${nome}: errore imprevisto (${testoErrore(err)})` }; }
    esiti.push({ nome, ...r });
  }
  await home();
  const fatti = esiti.filter(x => x.ok), falliti = esiti.filter(x => x.err), avv = fatti.flatMap(x => x.avvisi || []);
  if (falliti.length || avv.length)
    openSheet(shHead("Importazione", `${fatti.length} importati · ${falliti.length} non importati`) +
      falliti.map(x => fact("Non importato", esc(x.err), "", "N")).join("") +
      fatti.map(x => fact("Importato", esc(x.nome), "", "V")).join("") +
      avv.map(a => fact("Attenzione", esc(a), "", "I")).join(""));
  else if (fatti.length) { toast(fatti.length === 1 ? "Viaggio importato" : `${fatti.length} viaggi importati`); if (fatti.length === 1) apri(fatti[0].id); }
  return esiti;
}

// ---------- File arrivati con "Condividi" (D07) ----------
// Il file ricevuto resta nella cache finché l'import non è riuscito; se fallisce si può riprovare o scartare.
const CONDIVISI = ["adc-copilot-gps-condivisi"]; // nome tecnico invariato per non perdere i file ricevuti
async function condivisi() {
  const L = [];
  if (!("caches" in window)) return L;
  for (const nome of CONDIVISI) {
    if (!(await caches.has(nome))) continue;
    const c = await caches.open(nome);
    for (const k of await c.keys()) L.push({ c, k, nome });
  }
  return L;
}
async function pulisciVecchiaCache() { /* Nessuna cache condivisa o legacy da eliminare. */ }
async function importaCondivisi() {
  history.replaceState(null, "", "./" + location.hash);
  const L = await condivisi();
  if (!L.length) return;
  const files = [];
  for (const x of L) { const r = await x.c.match(x.k); files.push(new File([await r.blob()], decodeURIComponent(x.k.url.split("/").pop()))); }
  const esiti = await importaFiles(files);
  for (let i = 0; i < L.length; i++) if (esiti[i] && esiti[i].ok) await L[i].c.delete(L[i].k);
  await pulisciVecchiaCache();
  await sospesi();
}
async function scartaCondivisi() {
  if (!confirm("Scartare i file ricevuti con Condividi e non importati?")) return;
  for (const x of await condivisi()) await x.c.delete(x.k);
  await pulisciVecchiaCache(); await sospesi(); toast("File scartati");
}
async function sospesi() {
  let n = 0; try { n = (await condivisi()).length; } catch (_) {}
  $("#sospesi").hidden = !n;
  $("#sospesi").innerHTML = n ? `<div class="alert">${n === 1 ? "1 file ricevuto" : n + " file ricevuti"} con Condividi non ${n === 1 ? "è stato importato" : "sono stati importati"}.<div class="btns left"><button class="studia" type="button" data-cond="riprova">Riprova</button><button class="studia alt" type="button" data-cond="scarta">Scarta</button></div></div>` : "";
}

// ---------- Home ----------
// D01 – un viaggio salvato rovinato (o di una versione vecchia) non blocca la Home: si può esportare o eliminare.
const valido = p => { try { return controlla(p).length === 0; } catch (_) { return false; } };
const dataId = p => String(p && p.id || "").split("_")[1] || "";
async function home() {
  if (typeof GPS !== "undefined") GPS.close();
  closeSheet(); Scheda.popClose();
  for (const u of Object.values(imgURLs)) URL.revokeObjectURL(u); imgURLs = {};
  $("#viaggio").hidden = true; $("#home").hidden = false;
  let V = [];
  try { V = await DB.listViaggi(); } catch (err) { toast("Archivio non leggibile: " + testoErrore(err)); }
  V.sort((a, b) => dataId(b).localeCompare(dataId(a)) || String(a && a.id).localeCompare(String(b && b.id)));
  const buoni = V.filter(valido);
  $("#viaggi").innerHTML = V.length ? V.map(p => {
    const id = String(p && p.id || "");
    if (!valido(p)) return `<div class="trip"><div class="item row-st bad"><span><b>Viaggio non leggibile</b><br><small>${esc(id || "senza id")} · danneggiato o salvato con regole vecchie: esportalo per Claude o eliminalo</small></span><button class="studia alt" type="button" data-exp="${esc(id)}">Esporta</button></div>
      <button class="del" type="button" data-del="${esc(id)}" aria-label="Elimina viaggio non leggibile">Elimina</button></div>`;
    const I = p.intestazione;
    return `<div class="trip"><button class="item" type="button" data-open="${esc(id)}"><span><span class="tno">${esc(I.treno)}</span><br>${esc(I.percorso)}<br><small>${esc(I.data_viaggio)} · rev. ${esc(p.revisione)} · ${esc(p.comandi.map(c => c.replace("STUDIO LINEA ", "")).join(" + ").toLowerCase())}${p.aperti && p.aperti.length ? ` · ${p.aperti.length} da studiare` : ""}</small></span><small>apri ›</small></button>
      <button class="del" type="button" data-del="${esc(id)}" aria-label="Elimina ${esc(I.treno)}">Elimina</button></div>`;
  }).join("") : `<div class="empty">Nessun viaggio salvato. Quando Claude ti consegna il file <b>.adc.json</b> alla fine dello studio, scaricalo e toccalo con <b>Importa pacchetto</b>, oppure condividilo con questa app.</div>`;
  const M = buoni.flatMap(p => (p.aperti || []).map(a => ({ ...a, treno: p.intestazione.treno, vid: p.id })));
  $("#messaggi").innerHTML = M.length ? M.map(a => `<div class="item row-st"><span><b>${esc(a.treno)}</b> · ${esc(a.cosa)}<br><small>${esc(LAB_MOTIVO[a.motivo] || "da studiare")}</small></span><span class="btns">${a.motivo === "attesa_massa_treno" ? `<button class="studia alt" type="button" data-docfor="${esc(a.vid)}">Allega doc.</button>` : ""}<button class="studia" type="button" data-req="${esc(a.richiesta)}" data-proj="${projDi(a)}">Studia</button></span></div>`).join("")
    : `<div class="note">Nessun punto aperto nei viaggi salvati. I messaggi completi di Claude restano nella chat del progetto.</div>`;
  try { const e = await navigator.storage.estimate(); $("#storeInfo").textContent = `Spazio usato nel telefono: ${(e.usage / 1048576).toFixed(1)} MB.`; } catch (_) {}
  await sospesi();
}
async function apri(id) {
  const p = await DB.getViaggio(id);
  if (!p) return toast("Viaggio non trovato");
  const e = (() => { try { return controlla(p); } catch (err) { return [testoErrore(err)]; } })();
  if (e.length) return openSheet(shHead("Viaggio non leggibile", id) + e.slice(0, 10).map(x => fact("Problema", esc(x), "", "N")).join("") +
    `<div class="note">Esporta il file e chiedi a Claude di ripubblicare il pacchetto, oppure elimina il viaggio.</div><div class="btns left"><button class="studia alt" type="button" data-exp="${esc(id)}">Esporta</button><button class="studia" type="button" data-del="${esc(id)}">Elimina</button></div>`);
  for (const u of Object.values(imgURLs)) URL.revokeObjectURL(u); imgURLs = {};
  const usate = new Set(Object.values(p.condotta.FLPAG).flatMap(g => g.pag.map(x => x.img)));
  for (const path of usate) { try { const b = await DB.getImg(id, path); if (b) imgURLs[path] = URL.createObjectURL(b); } catch (_) {} }
  try { Scheda.show(p, imgURLs); } catch (err) { return toast("Scheda non visualizzabile: " + testoErrore(err)); }
  $("#home").hidden = true; $("#viaggio").hidden = false; scrollTo(0, 0);
  if (typeof GPS !== "undefined") GPS.open(p);
  if (location.hash !== "#v=" + id) history.pushState({ v: id }, "", "#v=" + id);
}
async function elimina(id) {
  const p = await DB.getViaggio(id);
  const I = p && isObj(p.intestazione) ? p.intestazione : null;
  if (!confirm(I ? `Eliminare il viaggio ${I.treno} del ${I.data_viaggio} da questo telefono?` : `Eliminare il viaggio non leggibile ${id} da questo telefono?`)) return;
  try { await DB.delViaggio(id); toast("Viaggio eliminato"); } catch (err) { toast("Eliminazione non riuscita: " + testoErrore(err)); }
  home();
}
// Esporta il record salvato (senza le pagine FL e senza i dati locali dell'app) per farlo controllare o ripubblicare da Claude.
// Non è un backup completo: le pagine FL restano solo nel telefono.
async function esporta(id) {
  const p = await DB.getViaggio(id);
  if (!p) return toast("Viaggio non trovato");
  const a = document.createElement("a");
  const { importato, avvisi_import, rev_condotta, ...pacchetto } = p; // dati locali dell'app: non fanno parte del pacchetto di Claude
  a.href = URL.createObjectURL(new Blob([JSON.stringify(pacchetto, null, 1)], { type: "application/json" }));
  a.download = `${(id || "viaggio").replace(/[^0-9A-Za-z_-]/g, "_")}.adc.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------- Invio a Claude ----------
// Pacchetto unico dal 22/10/2026: le regole complete (GEO, righe M3 compatte, controllo) sono nella scheda 16c del progetto.
const CHIUSURA = 'Al termine consegnami il pacchetto unico .adc.json secondo la scheda 16c (GEO dal registro GPS_17, righe M3 compatte, controllo con GPS_16e).';
// Dal 25/10/2026 lo studio di formazione si fa nel progetto ADC FORMAZIONE, partendo dall'ultimo pacchetto del viaggio.
// Dalla 1.0.12 la PWA importa direttamente il file blocco_formazione e lo unisce al viaggio salvato.
const CHIUSURA_F = "Al termine consegnami il file blocco_formazione_<treno>_<data>.json (scheda F16) con l'id del viaggio del pacchetto di condotta, se lo conosci: lo importo nella PWA. Se ti ho allegato il pacchetto .adc.json, va bene anche il pacchetto aggiornato.";
const PROGETTO = { condotta: "ADC COPILOT", formazione: "ADC FORMAZIONE" };
async function copia(txt) { try { await navigator.clipboard.writeText(txt); return true; } catch (_) { return false; } }
async function inviaClaude(testo, files = [], proj = "condotta") {
  const copiato = await copia(testo);
  const dati = { title: "ADC COPILOT", text: testo };
  if (files.length) dati.files = files;
  if (navigator.share && (!navigator.canShare || navigator.canShare(dati))) {
    try { await navigator.share(dati); toast(`Scegli Claude, progetto ${PROGETTO[proj] || PROGETTO.condotta}.${copiato ? " Il comando è anche copiato: se non compare, incollalo" : ""}`); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  openSheet(shHead("Invia a Claude", copiato ? "Comando copiato negli appunti" : "Copia il testo") +
    `<div class="reqbox">${esc(testo)}</div>` +
    (files.length ? `<div class="note">Allega in chat anche: ${files.map(f => esc(f.name)).join(", ")}.</div>` : "") +
    `<div class="note">Apri l'app Claude, entra nel progetto <b>${PROGETTO[proj] || PROGETTO.condotta}</b> e incolla.${proj === "formazione" ? " Il file blocco_formazione che riceverai si importa qui con Importa pacchetto." : ""}</div>`);
}
function inputs() {
  return { scheda: [...$("#fScheda").files], traccia: $("#tTraccia").value.trim(), massa: $("#nMassa").value.trim(), doc: [...$("#fDocNuovo").files] };
}
// Documenti del treno (M18, BFC, M40 Tecnico…) per massa, freni a mano e staffe.
// C09 – un'unica regola sull'origine della massa: se l'hai scritta tu vale quella e i documenti sono solo il riscontro.
const DOC_DATI = "ricava massa rimorchiata, massa frenata a mano (freni a vite), % di carri carichi e massa assiale minima dei vuoti, poi fai il calcolo delle staffe (PE CTI 16/2017) e i controlli PGOS.";
const DOC_FINE = " Mai la Prestazione della Scheda Treno. I documenti valgono solo per questo viaggio.";
const DOC_USO = `${DOC_DATI} La massa del treno va presa da questi documenti: nel pacchetto metti pgos.massa_origine "documenti", in massa_fonte il documento e la riga usati e in massa_st lo stato della lettura (V o I).${DOC_FINE}`;
const DOC_RISCONTRO = `${DOC_DATI} La massa del treno resta quella che ti ho scritto (pgos.massa_origine "utente", massa_st V): la massa letta nei documenti mettila solo in pgos.massa_riscontro con fonte, stato ed esito concorde/discorde. Se è discorde aggiungi un punto aperto "discrepanza_massa" con le due masse e tieni lo stato dei controlli al massimo I; non sostituire la massa.${DOC_FINE}`;
function richiestaDoc(treno, files) {
  return `STUDIA SOLO staffe di immobilizzazione e controlli PGOS – ${treno}\nTi allego i documenti del treno (${files.map(f => f.name).join(", ")}): ${DOC_USO}\n${CHIUSURA_F}`;
}
const docScelti = new WeakMap(); // riquadro .docbox → File[]
function docScegli(inp) {
  const box = inp.closest(".docbox"), files = [...inp.files];
  docScelti.set(box, files);
  const list = box.querySelector(".doclist"), send = box.querySelector("[data-docsend]");
  list.hidden = send.hidden = !files.length;
  list.textContent = files.length ? `Scelti: ${files.map(f => f.name).join(", ")}` : "";
}
function docInvia(t) {
  const box = t.closest(".docbox"), files = docScelti.get(box) || [];
  if (!files.length) return toast("Scegli prima i documenti del treno");
  inviaClaude(richiestaDoc(box.querySelector(".fDoc").dataset.treno, files), files, "formazione");
}
async function docPer(id) {
  const p = await DB.getViaggio(id);
  if (!p) return toast("Viaggio non trovato");
  openSheet(shHead("Documenti del treno", `${p.intestazione.treno} · ${p.intestazione.data_viaggio}`) + Scheda.docBox(p.condotta.TRENO || `treno ${p.intestazione.treno} del ${p.intestazione.data_viaggio}`));
}
function comando(tipo) {
  const x = inputs();
  if (tipo === "condotta") {
    if (x.scheda.length) return inviaClaude(`STUDIO LINEA CONDOTTA\nScheda Treno allegata.\n${CHIUSURA}`, x.scheda);
    if (x.traccia) return inviaClaude(`STUDIO LINEA CONDOTTA con la traccia (la Scheda Treno arriverà dopo).\n\nTRACCIA:\n${x.traccia}\n\n${CHIUSURA}`);
    $("#dTraccia").open = true; $("#tTraccia").focus();
    return toast("Scegli la Scheda Treno o incolla la traccia");
  }
  if (tipo === "formazione") {
    if (!x.scheda.length && !x.traccia) return toast("Serve la Scheda Treno o la traccia");
    const mt = Number(x.massa);
    if (x.massa && !(Number.isFinite(mt) && mt > 0 && mt < 10000)) { $("#nMassa").focus(); return toast("Massa del treno non valida: scrivi le tonnellate, es. 1450"); }
    const massa = x.massa ? `\nMassa del treno: ${mt} t (fornita da me: pgos.massa_origine "utente", massa_fonte "fornita dall'utente", massa_st V).` : x.doc.length ? "\nMassa del treno: ricavala dai documenti del treno allegati (mai dalla Prestazione della Scheda Treno)." : "\nMassa del treno non fornita: i controlli PGOS restano non eseguibili.";
    const doc = x.doc.length ? `\nDocumenti del treno allegati (${x.doc.map(f => f.name).join(", ")}): ${x.massa ? DOC_RISCONTRO : DOC_USO}` : "";
    const base = x.scheda.length ? "STUDIO LINEA FORMAZIONE\nScheda Treno allegata." : `STUDIO LINEA FORMAZIONE con la traccia.\n\nTRACCIA:\n${x.traccia}\n`;
    return inviaClaude(`${base}${massa}${doc}\n${CHIUSURA_F}`, [...x.scheda, ...x.doc], "formazione");
  }
}
function studia(req, proj) {
  const f = proj === "formazione";
  inviaClaude(`${req}\n${f ? CHIUSURA_F : "Al termine ripubblica il pacchetto viaggio .adc.json con la revisione aggiornata."}`, [], f ? "formazione" : "condotta");
}
// I punti aperti dello studio di formazione hanno il prefisso "[FORMAZIONE]" (scheda F16): vanno al progetto ADC FORMAZIONE.
const projDi = a => (isObj(a) && isStr(a.cosa) && a.cosa.startsWith("[FORMAZIONE]")) || a.motivo === "attesa_massa_treno" || a.motivo === "discrepanza_massa" ? "formazione" : "condotta";

// ---------- Eventi ----------
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  const d = t.dataset;
  if (d.gps && typeof GPS !== "undefined") return GPS.handle(d.gps);
  if (d.cmd === "theme") return toggleTheme();
  if (d.cmd === "home") return history.length > 1 && location.hash ? history.back() : home();
  if (d.cmd) return comando(d.cmd);
  if (d.open) return apri(d.open);
  if (d.del) return elimina(d.del);
  if (d.req) return studia(d.req, d.proj);
  if (d.docsend) return docInvia(t);
  if (d.docfor) return docPer(d.docfor);
  if (d.exp) return esporta(d.exp);
  if (d.cond === "riprova") return importaCondivisi();
  if (d.cond === "scarta") return scartaCondivisi();
  if (d.agg) return aggiornaApp();
  if (d.copy) { copia(d.copy).then(ok => { t.textContent = ok ? "Copiato" : "Copia"; if (!ok) toast("Copia non riuscita: tieni premuto sul numero"); }); return; }
  if (Scheda.click(t)) return;
  if (t.classList.contains("close")) return closeSheet();
});
$("#scrim").addEventListener("click", closeSheet);
$("#popScrim").addEventListener("click", () => Scheda.popClose());
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (Scheda.popOpenVisible()) return Scheda.popClose(); closeSheet(); } });
$("#fImport").addEventListener("change", e => { importaFiles([...e.target.files]); e.target.value = ""; });
document.addEventListener("change", e => { if (e.target.classList && e.target.classList.contains("fDoc")) docScegli(e.target); });
// Mantieni la scelta dell'utente; al rientro riacquisisci un fix fresco.
document.addEventListener("visibilitychange", () => {
  if (typeof GPS !== "undefined") GPS.visibilityChanged();
});
addEventListener("online", net); addEventListener("offline", net);
addEventListener("popstate", () => { const m = location.hash.match(/^#v=(.+)$/); m ? apri(decodeURIComponent(m[1])) : home(); });

// ---------- Offline e aggiornamenti (R01, R02) ----------
// La nuova versione si scarica intera in sottofondo e si attiva solo quando tocchi "Aggiorna":
// niente pagine con file di versioni diverse. I viaggi salvati (IndexedDB) non vengono toccati.
let swInAttesa = null;
function statoOffline(t) { const el = $("#offInfo"); if (el) el.textContent = t; }
function mostraAggiornamento(w) {
  swInAttesa = w;
  $("#agg").hidden = false;
  $("#agg").innerHTML = `<div class="alert">Nuova versione dell'app pronta.<div class="btns left"><button class="studia" type="button" data-agg="1">Aggiorna ora</button></div></div>`;
}
function aggiornaApp() { if (swInAttesa) swInAttesa.postMessage("aggiorna"); }
async function registraSW() {
  if (!("serviceWorker" in navigator)) return statoOffline("Questo browser non permette l'uso offline.");
  const giaControllata = !!navigator.serviceWorker.controller;
  let ricaricata = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (giaControllata && !ricaricata) { ricaricata = true; location.reload(); } });
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    if (reg.waiting && navigator.serviceWorker.controller) mostraAggiornamento(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (w) w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) mostraAggiornamento(w); });
    });
    statoOffline("Uso offline: in preparazione (serve la rete al primo avvio)…");
    await navigator.serviceWorker.ready;
    statoOffline("Uso offline: app salvata nel telefono. Senza rete i caratteri possono apparire diversi.");
  } catch (_) { statoOffline("Uso offline NON disponibile: registrazione non riuscita. Riapri l'app con la rete."); }
}

// ---------- Avvio ----------
(async function avvio() {
  $("#ver").textContent = VERSION; net();
  try { applyTheme(await DB.getConf("tema")); } catch (_) {}
  registraSW();
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
  await home();
  if (new URLSearchParams(location.search).has("condivisi")) await importaCondivisi();
  const m = location.hash.match(/^#v=(.+)$/); if (m) apri(decodeURIComponent(m[1]));
})();
