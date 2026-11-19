// 1.0.48: Scheda Treno 60755 del 19/11/2026 (Torino Orbassano → Milano Certosa) che non generava il viaggio.
// Una località della Scheda scritta abbreviata («S. Ant. di Sal.», «Rho Dev.E.L.NO») non era riconosciuta nel
// database: il tratto si spezzava e il generatore si fermava con «itinerario non continuo» (nessun pacchetto).
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

// L1: Alfa 0 – Santa Rosalia di Prova 5 – Beta 10 – Gamma 20; L2: Gamma 20 – Delta 30 (cambio di linea a Gamma)
const pl = (linea_id, loc_id, km) => ({ linea_id, loc_id, km, km_txt: String(km), fonte: "FLX", pag: "1", st: "V" });
const linea = (linea_id, nome) => ({ linea_id, nome, nome_breve: nome, fonte: "FLX", compartimento: "MI", senso_pari: "crescente", alimentazione: null, etcs_l2_obbl: null, st: "V" });
const T = {
  fonti: [{ fonte_id: "FLX", tipo: "FL", documento: "FL prova", breve: "FL X", edizione: "2026", note: null }],
  linee: [linea("L1", "Alfa – Gamma"), linea("L2", "Gamma – Delta")],
  localita: [["alfa", "Alfa"], ["rosalia", "Sant'Rosalia di Provaglio"], ["beta", "Beta"], ["gamma", "Gamma"], ["delta", "Delta"]]
    .map(([loc_id, nome]) => ({ loc_id, nome, tipo: "stazione", alias: null })),
  punti_linea: [pl("L1", "alfa", 0), pl("L1", "rosalia", 5), pl("L1", "beta", 10), pl("L1", "gamma", 20), pl("L2", "gamma", 20), pl("L2", "delta", 30)],
  esercizio: [], fiancata: [], indicatori: [], affiancamenti: [], aff_linee: [], sez46_letta: [],
  sigle: [], accesso_sigle: [], loco: [], compatibilita: [], utenze: [], geo: [], pagine_fl: [], discrepanze: []
};
const loc = (nome, km, v) => ({ nome, km: [km], tipo: "loc", vls: v });
const scheda = righe => ({ intestazione: { treno: "60755", valida_per: "19/11/2026", fl: [] }, pagine: [{ treno: "60755", valida_per: "19/11/2026" }], controlli: [], righe });
const ORA = new Date("2026-11-19T10:00:00Z");

test("nome abbreviato parola per parola riconosciuto (stessa progressiva)", () => {
  assert.ok(Co.simile("S. Ros. di Prov.", "Sant'Rosalia di Provaglio") >= 0.9);
  assert.ok(Co.simile("Rho Dev.E.L.NO", "Rho Deviatoio Est Linea Novara") >= 0.9);
  assert.ok(Co.simile("S. Ant. di Sal.", "Sant'Antonino di Saluggia") >= 0.9);
  // una sigla di una lettera da sola o parole diverse non bastano
  assert.ok(Co.simile("S. Ros.", "Santa Maria") < 0.9);
  assert.ok(Co.simile("Rho Fiera", "Rho Deviatoio") < 0.9);
  // l'abbreviazione non supera nomi uguali o con lo stesso inizio
  assert.equal(Co.simile("Torino Stura", "Torino Stura"), 1);
  const c = Co.componi(T, null, scheda([loc("Alfa", "0.000", "80"), loc("S. Ros. di Prov.", "5.000", "70"), loc("Beta", "10.000", "60"), loc("Gamma", "20.000", "50"), loc("Delta", "30.000", "40")]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.ok(c.rapporto.includes("DATABASE: località riconosciute 5 su 5"));
});

test("località della Scheda non nel database fra due località della stessa linea: il tratto prosegue", () => {
  const S = scheda([loc("Alfa", "0.000", "80"), loc("Beta", "10.000", "60"), loc("Ignota", "15.000", "45"),
    { nome: "Cippo", km: ["17.000"], tipo: "pt", vls: "55" }, loc("Gamma", "20.000", "50"), loc("Delta", "30.000", "40")]);
  const c = Co.componi(T, null, S, "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(c.viaggio.itinerario.map(t => `${t.da}-${t.a}-${t.linea}`), ["alfa-gamma-L1", "gamma-delta-L2"]);
  assert.ok(c.rapporto.some(r => /«Ignota» \(km 15\.000\) non è nel database ma sta fra Beta/.test(r)));
  // la località resta nella scheda come punto della Scheda, nell'ordine della Scheda (prima del Cippo)
  assert.deepEqual(c.viaggio.punti_scheda.map(p => `${p.n}@${p.dopo}`), ["Ignota@beta", "Cippo@beta"]);
  const p = G.genera(T, c.viaggio, ORA);
  const righe = p.condotta.R.map(r => `${r.t}:${r.n}:${r.v || ""}`);
  assert.deepEqual(righe.slice(2, 6), ["loc:Beta:60", "pt:Ignota:45", "pt:Cippo:55", "loc:Gamma:50"]);
  assert.ok(!p.intestazione.percorso.includes("PARZIALE"));
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("località sconosciuta dove cambia la linea: pacchetto PARZIALE generato (prima: nessun pacchetto)", () => {
  // progressiva di Ignota (40) fuori da Beta 10 – Gamma 20: nessuna linea la contiene, vero vuoto nell'itinerario
  const T2 = T;
  const c = Co.componi(T2, null, scheda([loc("Alfa", "0.000", "80"), loc("Beta", "10.000", "60"), loc("Ignota", "40.000", "45"),
    { nome: "Cippo", km: ["41.000"], tipo: "pt", vls: "55" }, loc("Gamma", "20.000", "50"), loc("Delta", "30.000", "40")]), "E494");
  assert.equal(c.completo, false);
  assert.match(c.lacune.join(), /vuoto tra Beta e Gamma: Ignota/);
  const p = G.genera(T2, c.viaggio, ORA);
  assert.match(p.intestazione.percorso, /ITINERARIO PARZIALE/);
  assert.match(p.aperti[0].cosa, /^ITINERARIO PARZIALE/);
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("punto della Scheda dopo una località fuori dall'itinerario: punto aperto, il pacchetto si genera", () => {
  const c = Co.componi(T, null, scheda([loc("Alfa", "0.000", "80"), loc("Beta", "10.000", "60"), loc("Gamma", "20.000", "50")]), "E494");
  c.viaggio.punti_scheda.push({ dopo: "delta", km: "31.000", n: "Cippo", v: "30" });
  const p = G.genera(T, c.viaggio, ORA);
  assert.ok(p.aperti.some(a => /«Cippo» km 31\.000 \(30 km\/h\) non collocato/.test(a.cosa)));
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("itinerario completo dichiarato ma non continuo: resta un errore (nessun pacchetto sbagliato)", () => {
  const V = { treno: "60755", data: "2026-11-19", loco: [{ tipo: "E494" }], copertura: { completa: true, lacune: [] },
    itinerario: [{ da: "alfa", a: "beta", linea: "L1" }, { da: "gamma", a: "delta", linea: "L2" }] };
  assert.throws(() => G.genera(T, V, ORA), /itinerario non continuo: beta → gamma/);
});
