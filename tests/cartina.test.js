// Cartina delle linee (1.0.44): prove del modello con dati INVENTATI (i dati veri restano nel repository privato).
// Confronta anche il modello JavaScript con il gemello Python (strumenti/cartina_modello.py): risultato identico.
// Con ADC_DB=<file .adcdb.json> il confronto JS ⇆ Python si fa anche sul database vero (tutte le linee).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const M = require(path.join(__dirname, "..", "motore", "cartina_modello.js"));
const PY = path.join(__dirname, "..", "strumenti", "cartina_modello.py");
const CONF = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cartina", "config.json"), "utf8"));

const s = (fonte = "F1", pag = "p.1", st = "V") => ({ fonte, pag, st });
function prova() {
  return {
    fonti: [{ fonte_id: "F1", tipo: "FL", documento: "FL di prova", breve: "FL 1 XX", edizione: "C.T. 1/2026" }, { fonte_id: "D1", tipo: "DE", documento: "DE di prova", breve: "DE 1", edizione: "2016" }],
    linee: [
      { linea_id: "L_A", nome: "Alfa – Delta", nome_breve: "Alfa", compartimento: "XX", binari: "doppio", senso_pari: "crescente", alimentazione: "3 kVcc", etcs_l2_obbl: 0, note: null, fonte: "F1", pag: "p.2", st: "V" },
      { linea_id: "L_B", nome: "Beta – Delta", nome_breve: "Beta", compartimento: "XX", binari: null, senso_pari: "decrescente", alimentazione: null, etcs_l2_obbl: null, note: null, fonte: "F1", pag: "p.3", st: "R" },
      { linea_id: "L_C", nome: "Gamma", nome_breve: "Gamma", compartimento: "YY", binari: null, senso_pari: null, alimentazione: null, etcs_l2_obbl: null, note: null, fonte: "F1", pag: null, st: "R" },
      { linea_id: "L_D", nome: "Senza località", nome_breve: "Vuota", compartimento: "YY", binari: null, senso_pari: null, alimentazione: null, etcs_l2_obbl: null, note: null, fonte: "F1", pag: null, st: "R" }
    ],
    localita: [
      { loc_id: "a1", nome: "Alfa", tipo: "stazione" }, { loc_id: "a2", nome: "Beta Nodo", tipo: "stazione" },
      { loc_id: "a3", nome: "Fermata Senza", tipo: "fermata" }, { loc_id: "a4", nome: "Bivio Delta", tipo: "bivio" },
      { loc_id: "b0", nome: "Beta Capo", tipo: "stazione" }, { loc_id: "c1", nome: "Gamma Uno", tipo: "stazione" }, { loc_id: "c2", nome: "Gamma Due", tipo: "fermata" }
    ],
    punti_linea: [
      { linea_id: "L_A", loc_id: "a3", km: 20, km_txt: "20,000", posto: null, nota: null, ...s() },
      { linea_id: "L_A", loc_id: "a1", km: 0, km_txt: "0,000", posto: "P1", nota: null, ...s() },
      { linea_id: "L_A", loc_id: "a4", km: 30, km_txt: "30,000", posto: null, nota: null, ...s() },
      { linea_id: "L_A", loc_id: "a2", km: 10, km_txt: "10,000", posto: null, nota: null, ...s() },
      { linea_id: "L_B", loc_id: "b0", km: 120, km_txt: "120,000", posto: null, nota: null, ...s() },
      { linea_id: "L_B", loc_id: "a2", km: 100, km_txt: "100,000", posto: null, nota: null, ...s() },
      { linea_id: "L_B", loc_id: "a4", km: 80, km_txt: "80,000", posto: null, nota: null, ...s() },
      { linea_id: "L_C", loc_id: "c1", km: 1, km_txt: "1,000", posto: null, nota: null, ...s() },
      { linea_id: "L_C", loc_id: "c2", km: 2, km_txt: "2,000", posto: null, nota: null, ...s() }
    ],
    geo: [
      { loc_id: "a1", lat: 45.0, lon: 9.0, cod_rinf: null, src: "prova", st: "V" }, { loc_id: "a2", lat: 45.1, lon: 9.1, cod_rinf: null, src: "prova", st: "V" },
      { loc_id: "a3", lat: 45.2, lon: 9.2, cod_rinf: null, src: "prova", st: "R" },   // R: non si usa
      { loc_id: "a4", lat: 45.3, lon: 9.3, cod_rinf: null, src: "prova", st: "V" }, { loc_id: "c1", lat: 44.0, lon: 8.0, cod_rinf: null, src: "prova", st: "V" }
    ],
    esercizio: [{ linea_id: "L_A", senso: "entrambi", km_da: 0, km_a: 20, sistema: "DCO", testo: "DCO di prova", riscontro: null, ...s() }],
    fiancata: [
      { linea_id: "L_A", senso: "pari", km: 0, presso_loc: null, posizione: null, punto: "Alfa", tipo: "grado", testo: "Grado di prestazione 3 (ascesa 4 ‰)", gdp: 3, ...s() },
      { linea_id: "L_A", senso: "pari", km: null, presso_loc: "a2", posizione: "presso", punto: "Beta Nodo", tipo: "grado", testo: "Grado 5", gdp: 5, ...s() },
      { linea_id: "L_A", senso: "pari", km: 20, presso_loc: null, posizione: null, punto: "km 20", tipo: "grado", testo: "Grado 7", gdp: 7, ...s() },
      { linea_id: "L_A", senso: "pari", km: 20, presso_loc: null, posizione: null, punto: "km 20", tipo: "grado", testo: "Grado 8", gdp: 8, ...s("F1", "p.9", "R") },
      { linea_id: "L_A", senso: "pari", km: 15, presso_loc: null, posizione: null, punto: "Velocità", tipo: "velocita", testo: "100", gdp: null, ...s() },
      { linea_id: "L_B", senso: "dispari", km: 80, presso_loc: null, posizione: null, punto: "Bivio Delta", tipo: "grado", testo: "Grado 2", gdp: 2, ...s() },
      { linea_id: "L_C", senso: "pari", km: 2, presso_loc: null, posizione: null, punto: "Gamma Due", tipo: "grado", testo: "Grado 1", gdp: 1, ...s() }
    ],
    indicatori: [
      { loc_id: "a2", senso: "pari", segnale: "partenza", cifra: "1", verso_linea: "L_B", dove: "linea Beta", nota: null, ...s() },
      { loc_id: "a2", senso: "pari", segnale: "partenza", cifra: "2", verso_linea: null, dove: "linea non nel database", nota: null, ...s() }
    ],
    affiancamenti: [{ aff_id: "G1", descrizione: "Alfa ⇆ Gamma", categoria: "tutti", condizioni: "Nessuna nota", ...s() }],
    aff_linee: [{ aff_id: "G1", linea_id: "L_A", km_da: 0, km_a: 10, tratto: "Alfa – Beta Nodo", lato: "1" }, { aff_id: "G1", linea_id: "L_C", km_da: null, km_a: null, tratto: "Gamma", lato: "2" }],
    sez46_letta: [{ linea_id: "L_A", km_da: 0, km_a: 30, ...s() }],
    sigle: [], accesso_sigle: [],
    loco: [
      { loco: "E1", colonna_de10: "COL1", raggr_sigle: null, rango_dpc: "B", vmax: 140, pantografi: null, etcs_l2: 0, ...s("D1") },
      { loco: "E2", colonna_de10: "COL2", raggr_sigle: null, rango_dpc: "A", vmax: 120, pantografi: null, etcs_l2: 0, ...s("D1") },
      { loco: "E3", colonna_de10: "COL3", raggr_sigle: null, rango_dpc: "C", vmax: 160, pantografi: null, etcs_l2: 0, ...s("D1") }
    ],
    compatibilita: [
      { colonna_de10: "COL1", tratto_de: "Alfa – Delta", linea_id: "L_A", km_da: 0, km_a: 30, simbolo: "◊B", rango_max: "B", vmax_nota: null, nota: null, ...s("D1") },
      { colonna_de10: "COL2", tratto_de: "Alfa – Beta", linea_id: "L_A", km_da: 0, km_a: 10, simbolo: "◊ (1)", rango_max: "A", vmax_nota: 60, nota: "nota 1", ...s("D1") },
      { colonna_de10: "COL2", tratto_de: "Beta – Delta", linea_id: "L_A", km_da: 10, km_a: 30, simbolo: "■", rango_max: null, vmax_nota: null, nota: null, ...s("D1") }
    ],
    utenze: [
      { ruolo: "DM", chi: "DM Beta", loc_id: "a2", linea_id: null, km_da: null, km_a: null, compartimento: null, gsmr: "111", fs: null, altro: null, ...s() },
      { ruolo: "DCO", chi: "DCO Alfa", loc_id: null, linea_id: "L_A", km_da: 0, km_a: 30, compartimento: null, gsmr: "222", fs: "333", altro: null, ...s() },
      { ruolo: "DCCM", chi: "DCCM XX", loc_id: null, linea_id: null, km_da: null, km_a: null, compartimento: "XX", gsmr: "444", fs: null, altro: null, ...s() },
      { ruolo: "DM", chi: "DM di altra linea", loc_id: "a2", linea_id: "L_C", km_da: null, km_a: null, compartimento: null, gsmr: "555", fs: null, altro: null, ...s() }
    ],
    pagine_fl: [{ fonte: "F1", pag: "p.5", pag_pdf: 5, tipo: "principale", linea_id: "L_A", senso: "pari", km_da: 0, km_a: 30, img: "img/prova.jpg" }],
    discrepanze: [{ disc_id: "D2", testo: "aperta", fonti: "F1", linea_id: "L_A", stato: "aperta" }, { disc_id: "D1", testo: "chiusa", fonti: "F1", linea_id: "L_A", stato: "chiusa" }]
  };
}
const VUOTO = () => Object.fromEntries(Object.keys(prova()).map(k => [k, []]));
const sez = (R, id) => R.sezioni.find(x => x.id === id);

test("tracciati: ordine di progressiva, solo coordinate V, tratteggio dove manca una coordinata", () => {
  const m = M.costruisci(prova(), {});
  const a = m.linee.find(l => l.linea_id === "L_A");
  assert.deepEqual(a.sequenza, ["a1", "a2", "a4"]);
  assert.deepEqual(a.tratti.map(t => [t.da, t.a, t.tipo, t.senza_coord]), [["a1", "a2", "pieno", []], ["a2", "a4", "tratteggiato", ["a3"]]]);
  const b = m.linee.find(l => l.linea_id === "L_B");
  assert.deepEqual(b.sequenza, ["a4", "a2"]);   // b0 senza coordinate in testa: nessun tratto inventato
  assert.equal(b.tratti.length, 1);
  assert.equal(m.conteggi.tratti_tratteggiati, 1);
});
test("linee senza coordinate sufficienti: elencate, non sparite", () => {
  const m = M.costruisci(prova(), {});
  assert.deepEqual(m.senza_coordinate.map(l => [l.linea_id, l.motivo]), [["L_C", "una sola località con coordinate V"], ["L_D", "nessuna località nel database"]]);
  assert.equal(m.conteggi.linee, 4); assert.equal(m.conteggi.disegnate, 2);
});
test("linee sullo stesso tratto: scostamenti diversi", () => {
  const m = M.costruisci(prova(), {});
  const o = Object.fromEntries(m.linee.map(l => [l.linea_id, l.scostamento]));
  // L_A va a2→a4, L_B va a4→a2 (versi opposti): le corsie effettive devono differire
  assert.notEqual(o.L_A, -o.L_B);
});
test("località importanti calcolate dai dati, con eccezioni di configurazione", () => {
  const m = M.costruisci(prova(), {});
  const lv = Object.fromEntries(m.localita.map(l => [l.loc_id, l.livello]));
  assert.deepEqual(lv, { a2: 0, a1: 1, c1: 1, a4: 2 });   // a2: stazione con 2 linee; a1, c1: stazioni con 1 linea; a4: bivio con 2 linee
  assert.equal(m.localita[0].loc_id, "a2");
  assert.ok(!("a3" in lv));                                 // senza coordinate V: non c'è
  const m2 = M.costruisci(prova(), { localita: { sempre: ["a1", "inesistente"], mai: ["a4"] } });
  const lv2 = Object.fromEntries(m2.localita.map(l => [l.loc_id, l.livello]));
  assert.equal(lv2.a1, 0); assert.equal(lv2.a4, 3);
});
test("località della scheda in ordine di senso pari (crescente e decrescente)", () => {
  assert.deepEqual(sez(M.riepilogo(prova(), "L_A"), "localita").righe.map(r => r.loc_id), ["a1", "a2", "a3", "a4"]);
  const b = sez(M.riepilogo(prova(), "L_B"), "localita");
  assert.equal(b.ordine, "pari_decrescente");
  assert.deepEqual(b.righe.map(r => r.loc_id), ["b0", "a2", "a4"]);
  assert.equal(sez(M.riepilogo(prova(), "L_C"), "localita").ordine, "senso_pari_da_studiare");
});
test("grado di prestazione per tratto e per senso; conflitti mostrati, non risolti", () => {
  const g = sez(M.riepilogo(prova(), "L_A"), "gdp");
  const pari = g.sensi.find(z => z.senso === "pari");
  assert.equal(pari.verso, "progressive_crescenti");
  assert.deepEqual(pari.tratti.map(t => [t.da_km, t.a_km, t.gdp, t.conflitto]), [[0, 10, 3, false], [10, 20, 5, false], [20, 30, null, true]]);
  assert.equal(pari.tratti[1].righe[0].km_da_localita, true);   // km preso dalla località a2 su questa linea
  assert.deepEqual(pari.tratti[2].valori, [7, 8]); assert.equal(pari.tratti[2].st, "R");
  const disp = g.sensi.find(z => z.senso === "dispari");
  assert.deepEqual(disp.tratti.map(t => [t.da_km, t.a_km, t.gdp]), [[30, 0, null]]);   // nessun dato: tutta la linea da studiare
  assert.equal(g.stato, "parziale");
  const b = sez(M.riepilogo(prova(), "L_B"), "gdp").sensi.find(z => z.senso === "dispari");
  assert.equal(b.verso, "progressive_crescenti");
  assert.deepEqual(b.tratti.map(t => [t.da_km, t.a_km, t.gdp, t.da_loc, t.a_loc]), [[80, 120, 2, "Bivio Delta", "Beta Capo"]]);
  const c = sez(M.riepilogo(prova(), "L_C"), "gdp").sensi.find(z => z.senso === "pari");
  assert.ok(c.motivo && c.tratti.length === 0 && c.righe.length === 1);   // senso pari ignoto: niente tratti composti
});
test("circolabilità: ammessa, con limitazione, esclusa, da studiare (mai «non ammessa» per mancanza di righe)", () => {
  const c = sez(M.riepilogo(prova(), "L_A"), "compatibilita");
  assert.deepEqual(c.tratti.map(t => t.tratto_de), ["Alfa – Beta", "Alfa – Delta", "Beta – Delta"]);
  const e = Object.fromEntries(c.loco.map(l => [l.loco, l.celle.map(x => x.esito)]));
  assert.deepEqual(e.E1, ["da_studiare", "ammessa", "da_studiare"]);
  assert.deepEqual(e.E2, ["limitazione", "da_studiare", "esclusa"]);
  assert.deepEqual(e.E3, ["da_studiare", "da_studiare", "da_studiare"]);
  assert.equal(c.loco.find(l => l.loco === "E3").stato, "da_studiare");
  assert.equal(c.loco.find(l => l.loco === "E2").celle[0].righe[0].vmax_nota, 60);
  assert.equal(sez(M.riepilogo(prova(), "L_B"), "compatibilita").stato, "da_studiare");
});
test("altre sezioni: esercizio scoperto, indicatori, affiancate, utenze, pagine, discrepanze aperte", () => {
  const R = M.riepilogo(prova(), "L_A");
  assert.deepEqual(sez(R, "esercizio").scoperti, [[20, 30]]);
  const ind = sez(R, "indicatori").localita[0].righe;
  assert.deepEqual(ind.map(r => [r.cifra, r.verso_linea, r.verso_nome]), [["1", "L_B", "Beta"], ["2", null, null]]);
  const aff = sez(R, "affiancate");
  assert.equal(aff.gruppi[0].sez46, "coperto"); assert.equal(aff.gruppi[0].altre[0].relazione, "affiancata"); assert.equal(aff.stato, "popolata");
  assert.deepEqual(sez(R, "utenze").righe.map(r => [r.chi, r.ambito]), [["DM Beta", "localita"], ["DCO Alfa", "tratto"], ["DCCM XX", "compartimento"]]);
  assert.equal(sez(R, "pagine_fl").righe.length, 1);
  assert.deepEqual(sez(R, "discrepanze").righe.map(r => r.disc_id), ["D2"]);
  const I = sez(R, "intestazione");
  assert.equal(I.campi.find(c => c.campo === "etcs_l2_obbl").valore, "no");
  assert.equal(sez(M.riepilogo(prova(), "L_B"), "intestazione").campi.find(c => c.campo === "binari").valore, null);
});
test("database vuoto o parziale: nessuna eccezione, solo «da studiare»", () => {
  const m = M.costruisci(VUOTO(), CONF);
  assert.equal(m.linee.length, 0); assert.equal(m.bbox, null);
  const T = VUOTO(); T.fonti = prova().fonti; T.linee = [prova().linee[3]];
  const R = M.riepilogo(T, "L_D");
  assert.ok(R.sezioni.every(x => ["da_studiare", "parziale", "nessuna"].includes(x.stato)), JSON.stringify(R.sezioni.map(x => x.stato)));
  assert.equal(M.riepilogo(T, "inesistente"), null);
  assert.deepEqual(M.costruisci({}, null).conteggi.linee, 0);
});

function python(file, args) {
  const r = spawnSync("python3", ["-I", PY, file, path.join(__dirname, "..", "cartina", "config.json"), ...args], { encoding: "utf8", maxBuffer: 1 << 30 });
  if (r.error || r.status !== 0) throw new Error("python3: " + (r.error ? r.error.message : r.stderr));
  return JSON.parse(r.stdout);
}
const haPython = spawnSync("python3", ["--version"]).status === 0;
function confronta(T, file) {
  const py = python(file, ["--tutte"]);
  assert.deepStrictEqual(M.costruisci(T, CONF), py.modello);
  for (const l of T.linee) assert.deepStrictEqual(M.riepilogo(T, l.linea_id), py.riepiloghi[l.linea_id], l.linea_id);
}
test("JavaScript e Python danno lo stesso risultato (dati di prova)", { skip: !haPython && "python3 non disponibile" }, () => {
  for (const T of [prova(), VUOTO()]) {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cartina-")), "db.json");
    fs.writeFileSync(f, JSON.stringify({ tabelle: T }));
    confronta(T, f);
  }
});
test("JavaScript e Python danno lo stesso risultato (database vero, ADC_DB)", { skip: (!process.env.ADC_DB || !haPython) && "ADC_DB non impostato" }, () => {
  const T = JSON.parse(fs.readFileSync(process.env.ADC_DB, "utf8")).tabelle;
  confronta(T, process.env.ADC_DB);
});
