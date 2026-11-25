// 1.0.49: Scheda Treno 67069/68918 del 25/11/2026 (Busto Arsizio → Modane), itinerario PARZIALE con un vuoto
// fra Ponte Tanaro e Solero. Nel database la Torino P.N. – Alessandria è divisa in due linee che si uniscono al
// Cippo km 88,52 (Ponte Tanaro sta sulla prima, Solero sulla seconda) e la Scheda non stampa quel cippo: il motore
// non trovava il punto in cui cambiare linea. Prove con dati inventati (i dati veri restano nel repository privato).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const M = n => require(path.join(__dirname, "..", "motore", n));
const Co = M("componi.js"), G = M("genera.js");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const ctx = vm.createContext({});
vm.runInContext(app.slice(0, app.indexOf("// Converte la data URL")), ctx);
const controlla = vm.runInContext("controlla", ctx);

// LA: Gamma 100 – Delta 99,4 – Giunto 98,5 (progressiva decrescente verso Giunto)
// LB: Giunto 98,5 – Epsilon 91 – Zeta 80 (stessa numerazione, prosegue a scendere)
const pl = (linea_id, loc_id, km) => ({ linea_id, loc_id, km, km_txt: String(km), fonte: "FLX", pag: "1", st: "V" });
const linea = (linea_id, nome) => ({ linea_id, nome, nome_breve: nome, fonte: "FLX", compartimento: "TO", senso_pari: "crescente", alimentazione: null, etcs_l2_obbl: null, st: "V" });
const base = punti_linea => ({
  fonti: [{ fonte_id: "FLX", tipo: "FL", documento: "FL prova", breve: "FL X", edizione: "2026", note: null }],
  linee: [linea("LA", "Giunto – Gamma"), linea("LB", "Zeta – Giunto")],
  localita: [["gamma", "Gamma"], ["delta", "Delta Ponte"], ["giunto", "Cippo 98,50"], ["epsilon", "Epsilon"], ["zeta", "Zeta"]]
    .map(([loc_id, nome]) => ({ loc_id, nome, tipo: "stazione", alias: null })),
  punti_linea,
  esercizio: [], fiancata: [], indicatori: [], affiancamenti: [], aff_linee: [], sez46_letta: [],
  sigle: [], accesso_sigle: [], loco: [], compatibilita: [], utenze: [], geo: [], pagine_fl: [], discrepanze: []
});
const T = base([pl("LA", "gamma", 100), pl("LA", "delta", 99.4), pl("LA", "giunto", 98.5),
  pl("LB", "giunto", 98.5), pl("LB", "epsilon", 91), pl("LB", "zeta", 80)]);
const loc = (nome, km, v) => ({ nome, km: [km], tipo: "loc", vls: v });
const cippo = (km, v) => ({ nome: "Cippo", km: [km], tipo: "pt", vls: v });
const scheda = righe => ({ intestazione: { treno: "67069", valida_per: "25/11/2026", fl: [] }, pagine: [{ treno: "67069", valida_per: "25/11/2026" }], controlli: [],
  righe: righe.map((r, k) => Object.assign({ pag: 1 }, r)) });
const ORA = new Date("2026-11-25T10:00:00Z");
const S = (...mezzo) => scheda([loc("Gamma", "100.000", "90"), loc("Delta Ponte", "99.400", "90"), ...mezzo,
  loc("Epsilon", "91.000", "100"), loc("Zeta", "80.000", "100")]);

test("due linee unite in un cippo non stampato nella Scheda: il tratto prosegue (prima: vuoto, PARZIALE)", () => {
  const c = Co.componi(T, null, S(cippo("99.000", "100")), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(c.viaggio.itinerario.map(t => `${t.da}-${t.a}-${t.linea}`), ["gamma-giunto-LA", "giunto-zeta-LB"]);
  assert.ok(c.rapporto.some(r => /Delta Ponte → Epsilon: passaggio dalla linea LA alla linea LB a Cippo 98,50 .*RICOSTRUITO/.test(r)), c.rapporto.join("\n"));
  const p = G.genera(T, c.viaggio, ORA);
  assert.ok(!p.intestazione.percorso.includes("PARZIALE"));
  const righe = p.condotta.R.filter(r => r.t === "loc" || r.t === "pt").map(r => `${r.t}:${r.n}`);
  assert.deepEqual(righe, ["loc:Gamma", "loc:Delta Ponte", "pt:Cippo", "loc:Cippo 98,50", "loc:Epsilon", "loc:Zeta"]);
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("giunzione anche con la sola località di partenza sulla prima linea (nessun tratto prima)", () => {
  const c = Co.componi(T, null, scheda([loc("Delta Ponte", "99.400", "90"), loc("Epsilon", "91.000", "100"), loc("Zeta", "80.000", "100")]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(c.viaggio.itinerario.map(t => `${t.da}-${t.a}-${t.linea}`), ["delta-giunto-LA", "giunto-zeta-LB"]);
  assert.equal(controlla(JSON.parse(JSON.stringify(G.genera(T, c.viaggio, ORA)))).length, 0);
});

test("giunzione fino all'ultima località della seconda linea", () => {
  const c = Co.componi(T, null, scheda([loc("Gamma", "100.000", "90"), loc("Delta Ponte", "99.400", "90"), loc("Epsilon", "91.000", "100")]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(c.viaggio.itinerario.map(t => `${t.da}-${t.a}-${t.linea}`), ["gamma-giunto-LA", "giunto-epsilon-LB"]);
});

test("riga della Scheda fuori dal percorso fra le due località: niente giunzione, il vuoto resta", () => {
  const c = Co.componi(T, null, S(cippo("120.000", "100")), "E494");
  assert.equal(c.completo, false);
  assert.match(c.lacune.join(), /vuoto tra Delta Ponte e Epsilon/);
});

test("località della Scheda non nel database fra le due: niente giunzione", () => {
  const c = Co.componi(T, null, S(loc("Ignota", "95.000", "100")), "E494");
  assert.equal(c.completo, false);
});

test("numerazione diversa nel punto comune (cambio di progressiva non stampato): niente giunzione", () => {
  const T2 = base([pl("LA", "gamma", 100), pl("LA", "delta", 99.4), pl("LA", "giunto", 98.5),
    pl("LB", "giunto", 0), pl("LB", "epsilon", 7.5), pl("LB", "zeta", 18.5)]);
  const c = Co.componi(T2, null, scheda([loc("Gamma", "100.000", "90"), loc("Delta Ponte", "99.400", "90"), loc("Epsilon", "7.500", "100"), loc("Zeta", "18.500", "100")]), "E494");
  assert.equal(c.completo, false);
});

test("senso invertito al punto comune: niente giunzione", () => {
  // Epsilon sulla LB a 99 (sopra il giunto): da Delta si scende al giunto e poi si risalirebbe
  const T2 = base([pl("LA", "gamma", 100), pl("LA", "delta", 99.4), pl("LA", "giunto", 98.5),
    pl("LB", "giunto", 98.5), pl("LB", "epsilon", 99.9), pl("LB", "zeta", 105)]);
  const c = Co.componi(T2, null, scheda([loc("Gamma", "100.000", "90"), loc("Delta Ponte", "99.400", "90"), loc("Epsilon", "99.900", "100"), loc("Zeta", "105.000", "100")]), "E494");
  assert.equal(c.completo, false);
});
