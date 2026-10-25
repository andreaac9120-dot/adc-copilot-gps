// Regole dello schema 1.0.4 (25/10/2026) e disegno fedele degli stati (rapporto di revisione del 22/10/2026).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const ctx = vm.createContext({});
vm.runInContext(app.slice(0, app.indexOf("// Converte la data URL")), ctx);
const controlla = vm.runInContext("controlla", ctx);
// gli array arrivano da un altro contesto VM: si confronta il contenuto, non il prototipo
const vuoto = e => assert.equal(e.length, 0, [...e].join(" | "));

const base = () => ({
  formato: "adc-copilot-pacchetto", versione_formato: 2, id: "T1_2026-10-22", revisione: 2,
  creato: "2026-10-22T08:00:00Z", comandi: ["STUDIO LINEA CONDOTTA", "STUDIO LINEA FORMAZIONE"],
  input: { tipo: "traccia", fase: "fase1_traccia" }, fonti: [{ doc: "FL 23", edizione: "2026" }],
  intestazione: { treno: "T1", percorso: "A–B", data_viaggio: "22/10/2026", loco: [{ tipo: "E494", etichetta: "E494" }] },
  condotta: {
    TRENO: "T1", SEG: { A: { nome: "A–B", fl: "23", pag: "1", esercizio: "DC", st: "V" } },
    R: [{ t: "loc", id: "a", n: "A", km: "0", s: "A" }, { t: "loc", id: "b", n: "B", km: "10", s: "A", end: true }],
    FIANC: {}, DM: {}, DCO: {}, AFF: { A: { txt: "nessuna", src: "FL 23 p. 4", st: "V", esito: "nessuna" } },
    IND: {}, AFFLOC: {}, FLPAG: {}, FLLOC: {}, PRESC: null, LOCO: []
  },
  formazione: {
    tratti: [{ seg: "A", da: "A", a: "B", linea: "L", affiancata: false, gdp: { v: "19", st: "V", src: "FL 23 p. 94" } }],
    prestazione_massima: [],
    pgos: { massa_t: 1450, massa_origine: "utente", massa_fonte: "fornita dall'utente", massa_st: "V",
      controlli: [{ t: "Art. 60", esito: "ok", x: "1450 ≤ 1600", st: "V", src: "PGOS Art. 60" }] },
    staffe: { pendenza_max: { v: "16‰", st: "V", src: "FL 23 p. 94" }, grado_gravoso: { v: "VI", st: "V", src: "FL 23 p. 94" },
      esito: "ok", st: "V", src: "PE CTI 16/2017" }
  }
});
const errori = (mod) => { const p = base(); mod(p); return controlla(p); };
const rifiuta = (mod, frammento) => { const e = errori(mod); assert.ok(e.some(x => x.includes(frammento)), `atteso "${frammento}", trovato: ${e.join(" | ")}`); };

test("pacchetto 1.0.4 completo accettato", () => vuoto(controlla(base())));

test("formato 1 rifiutato con istruzione di ripubblicare", () => rifiuta(p => { p.versione_formato = 1; }, "fallo ripubblicare"));

test("C03 – fonti e src obbligatorie", () => {
  rifiuta(p => { p.fonti[0].edizione = " "; }, "fonti mancanti");
  rifiuta(p => { delete p.formazione.tratti[0].gdp.src; }, "fonte obbligatoria");
  vuoto(errori(p => { p.formazione.tratti[0].gdp = { v: null, st: "N" }; })); // N può non avere fonte
});

test("C05 – numero treno e data dell'id coincidono con l'intestazione", () => {
  rifiuta(p => { p.intestazione.treno = "T999"; }, "diverso da quello dell'id");
  vuoto(errori(p => { p.intestazione.treno = "TC T1 MTR"; }));
  rifiuta(p => { p.intestazione.data_viaggio = "23/10/2026"; }, "diversa da quella dell'id");
});

test("C01/C16 – stato ed esito separati, regola della premessa peggiore", () => {
  rifiuta(p => { p.formazione.pgos.massa_st = "I"; }, "fornita da te ha stato V");                         // D23
  rifiuta(p => { p.formazione.staffe.grado_gravoso.st = "I"; }, "migliore della premessa peggiore");       // D24
  vuoto(errori(p => { p.formazione.staffe.grado_gravoso.st = "I"; p.formazione.staffe.st = "I"; }));
  rifiuta(p => { p.formazione.pgos.controlli[0] = { t: "Art. 61", esito: "non_eseguibile", st: "V", src: "PGOS" }; }, "richiede stato N");
  vuoto(errori(p => { p.formazione.pgos.controlli[0].esito = "non_ok"; })); // non_ok può essere V
  rifiuta(p => { delete p.formazione.staffe.st; }, "staffe: dati non validi");
});

test("C09 – massa utente con riscontro discorde nei documenti", () => {
  const disc = p => { p.formazione.pgos.massa_riscontro = { t: 1600, fonte: "M18 riga 3", st: "V", esito: "discorde" }; };
  rifiuta(disc, "al massimo I");
  rifiuta(disc, "discrepanza_massa");
  vuoto(errori(p => { disc(p); p.formazione.pgos.controlli[0].st = "I";
    p.aperti = [{ cosa: "[FORMAZIONE] masse diverse", motivo: "discrepanza_massa", richiesta: "STUDIA SOLO controlli PGOS" }]; }));
  rifiuta(p => { p.formazione.pgos.massa_origine = "documenti"; disc(p); }, "senza riscontro");
});

test("senza massa: niente campi massa, controlli N e nota obbligatoria", () => {
  const senza = p => { const g = p.formazione.pgos; g.massa_t = null; delete g.massa_origine; delete g.massa_fonte; delete g.massa_st;
    g.controlli = [{ t: "Art. 60", esito: "non_eseguibile", st: "N", src: "PGOS" }]; g.nota = "non eseguibile: massa del treno non fornita";
    p.formazione.staffe = null; };
  vuoto(errori(senza));
  rifiuta(p => { senza(p); p.formazione.pgos.massa_st = "V"; }, "non vanno indicati");
  rifiuta(p => { senza(p); delete p.formazione.pgos.nota; }, "serve la nota");
  rifiuta(p => { p.formazione.pgos.massa_origine = "documenti"; p.formazione.pgos.massa_fonte = "Prestazione Scheda Treno"; }, "Prestazione della Scheda Treno"); // D20
});

test("riferimenti: niente nomi risolti dal prototipo, aperti e tratti esistenti", () => {
  rifiuta(p => { p.condotta.R[0].s = "toString"; }, "inesistente");                                        // L26
  rifiuta(p => { p.aperti = [{ cosa: "x", loc: "zzz", richiesta: "STUDIA SOLO x" }]; }, "località zzz inesistente"); // D17
  rifiuta(p => { p.formazione.tratti[0].seg = "Z"; }, "Z inesistente");                                   // D18
  rifiuta(p => { delete p.formazione; }, "comando formazione dichiarato");                               // D16
  rifiuta(p => { p.creato = "2026-10-22T24:00:00Z"; }, "data di creazione");                             // D27
  rifiuta(p => { delete p.condotta.AFF.A.esito; }, "esito non valido");                                  // D05
});

function scheda(pkg) {
  const el = new Map();
  const document = { querySelector: s => { if (!el.has(s)) el.set(s, { innerHTML: "", textContent: "", hidden: true, scrollTop: 0, focus() {} }); return el.get(s); } };
  const c = vm.createContext({ document, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "scheda.js"), "utf8"), c);
  const S = vm.runInContext("Scheda", c);
  S.show(pkg, {});
  S.click({ dataset: { form: "1" }, closest: () => null });
  return { html: el.get("#sheetIn").innerHTML, avvisi: el.get("#vAvvisi").innerHTML };
}
const blocco = (html, etichetta) => { const i = html.indexOf(etichetta); assert.ok(i >= 0, etichetta); return html.slice(html.lastIndexOf('<div class="fact', i), i); };

test("C01 – la scheda mostra lo stato del pacchetto, senza promuoverlo né forzarlo", () => {
  const p = base();
  p.formazione.pgos.controlli = [{ t: "Art. 73", esito: "non_ok", x: "", st: "V", src: "PGOS Art. 73" }];
  p.formazione.pgos.massa_riscontro = { t: 1600, fonte: "M18", st: "I", esito: "discorde" };
  p.formazione.staffe.st = "I";
  const { html } = scheda(p);
  assert.match(blocco(html, "Art. 73 · NON OK"), /fact V/);        // prima: forzato a R
  assert.match(blocco(html, "Esito · OK"), /fact I/);              // prima: V perché "ok"
  assert.match(blocco(html, "Riscontro nei documenti · DISCORDE"), /fact I/);
  assert.doesNotMatch(html, /locomotiva isolata/);
});

test("C02 – l'avviso sulle pagine FL riusate resta nella scheda", () => {
  const p = base(); p.avvisi_import = ["2 pagine FL prese dalla revisione precedente"];
  assert.match(scheda(p).avvisi, /pagine FL prese dalla revisione precedente/);
});
