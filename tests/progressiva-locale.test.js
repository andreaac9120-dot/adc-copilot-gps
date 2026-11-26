// 1.0.50: tratto con progressiva locale della Scheda (Scheda 67069/68918 del 25/11/2026, FL 2 TO: il solo binario pari
// Bussoleno – Salbertrand ha progressive proprie 0,000–25,945; il database, per scelta della migrazione m38, tiene quel
// tratto sulla linea Modane – Q. Zappata con le progressive del binario di sinistra in senso dispari).
// Prove con dati inventati (i dati veri restano nel repository privato).
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

// L: Alfa 40 – Beta 43,166 – Gamma 50,5 – Delta 57 – Epsilon 63 – Zeta 66,8 – Eta 72 (progressiva crescente)
// sul binario pari la Scheda stampa Beta 43,166/0,000 – Gamma 7,650 – Delta 15,079 – Epsilon 21,992 – Zeta 25,945/66,809
const pl = (loc_id, km) => ({ linea_id: "L", loc_id, km, km_txt: String(km), fonte: "FLX", pag: "1", st: "V" });
const T = {
  fonti: [{ fonte_id: "FLX", tipo: "FL", documento: "FL prova", breve: "FL X", edizione: "2026", note: null }],
  linee: [{ linea_id: "L", nome: "Alfa – Eta", nome_breve: "Alfa – Eta", fonte: "FLX", compartimento: "TO", senso_pari: "crescente", alimentazione: null, etcs_l2_obbl: null, st: "V" }],
  localita: [["alfa", "Alfa"], ["beta", "Beta"], ["gamma", "P.C. Gamma"], ["delta", "Delta"], ["epsilon", "Epsilon"], ["zeta", "Zeta"], ["eta", "Eta"]]
    .map(([loc_id, nome]) => ({ loc_id, nome, tipo: "stazione", alias: null })),
  punti_linea: [pl("alfa", 40), pl("beta", 43.166), pl("gamma", 50.523), pl("delta", 57.097), pl("epsilon", 63.07), pl("zeta", 66.809), pl("eta", 72)],
  esercizio: [], fiancata: [], indicatori: [], affiancamenti: [], aff_linee: [], sez46_letta: [],
  sigle: [], accesso_sigle: [], loco: [], compatibilita: [], utenze: [], geo: [], pagine_fl: [], discrepanze: []
};
const loc = (nome, km, v) => ({ nome, km: [].concat(km), tipo: "loc", vls: v, pag: 1 });
const pt = (nome, km, v) => ({ nome, km: [km], tipo: "pt", vls: v, pag: 1 });
const scheda = (righe, moduli = []) => ({ intestazione: { treno: "67069", valida_per: "25/11/2026", fl: [] }, pagine: [{ treno: "67069", valida_per: "25/11/2026" }],
  controlli: [], righe, moduli });
const ORA = new Date("2026-11-25T18:00:00Z");
const righe = (gamma = "P.C. Gamma") => [loc("Alfa", "40.000", "100"), loc("Beta", ["43.166", "0.000"]), pt("Cippo(Sx)", "2.000", "100"),
  pt("Cippo(Dx)", "45.000"), loc(gamma, "7.650"), loc("Delta", "15.079"), loc("Epsilon", "21.992"), pt("Sb.G. Prova (Dx)", "65.270"),
  loc("Zeta", ["25.945", "66.809"]), loc("Eta", "72.000")];
const m3 = { tipo: "M3", n: "1", linea: "ALFA - ETA", stazione: "Alfa", data: "25/11/2026", note: {},
  righe: [{ n: "1", sinistro: "Delta", destro: "-", inizio_cippo: "14", spostabile: ["-", "-"], velocita: "40", lunghezza_m: "50", note: [] }] };

test("località della Scheda con progressiva locale abbinate per nome: itinerario completo (prima: vuoto, PARZIALE)", () => {
  const c = Co.componi(T, null, scheda(righe(), [m3]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(c.viaggio.itinerario.map(t => `${t.da}-${t.a}-${t.linea}`), ["alfa-eta-L"]);
  assert.ok(c.rapporto.some(r => /P\.C\. Gamma \(km 7\.65 della Scheda, progressiva locale fra Beta e Zeta\) = P\.C\. Gamma km 50\.523 .*RICOSTRUITA/.test(r)), c.rapporto.join("\n"));
  assert.deepEqual(c.viaggio.progressive_locali.map(t => [t.km_da, t.km_a, t.punti]),
    [[0, 25.945, { beta: 0, gamma: 7.65, delta: 15.079, epsilon: 21.992, zeta: 25.945 }]]);
  const p = G.genera(T, c.viaggio, ORA);
  assert.ok(!p.intestazione.percorso.includes("PARZIALE"));
  const R = p.condotta.R.map(r => `${r.t}:${r.n.replace(/ ·.*/, "")}`);
  // punti della Scheda dopo l'ultima località che li precede; l'M3 «Delta cippo 14» sulla progressiva locale
  // (14 < Delta 15,079): fra Gamma e Delta, non sulla progressiva della linea
  assert.deepEqual(R, ["loc:Alfa", "loc:Beta", "pt:Cippo(Sx)", "pt:Cippo(Dx)", "loc:P.C. Gamma", "m3:M3 Delta cippo 14", "loc:Delta",
    "loc:Epsilon", "pt:Sb.G. Prova (Dx)", "loc:Zeta", "loc:Eta"]);
  assert.match(p.condotta.R.find(r => r.t === "m3").m3.note.join(" "), /progressiva locale della Scheda/);
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("senza la progressiva doppia stampata in partenza: niente abbinamento, il vuoto resta", () => {
  const r = righe(); r[1] = loc("Beta", "43.166");
  const c = Co.componi(T, null, scheda(r), "E494");
  assert.equal(c.completo, false);
  assert.ok(!c.viaggio.progressive_locali.length);
});

test("nome che non corrisponde a una località della linea fra le due: niente abbinamento", () => {
  const c = Co.componi(T, null, scheda(righe("Ignota")), "E494");
  assert.equal(c.completo, false);
});

test("località in ordine diverso da quello della linea: niente abbinamento", () => {
  const r = righe(); [r[5], r[6]] = [loc("Epsilon", "15.079"), loc("Delta", "21.992")];
  const c = Co.componi(T, null, scheda(r), "E494");
  assert.equal(c.completo, false);
});

test("riga della Scheda fuori sia dalla progressiva locale sia da quella della linea: niente abbinamento", () => {
  const r = righe(); r[7] = pt("Cippo", "99.000");
  const c = Co.componi(T, null, scheda(r), "E494");
  assert.equal(c.completo, false);
});
