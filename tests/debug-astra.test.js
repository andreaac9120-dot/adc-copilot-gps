// Prove di regressione delle correzioni dal rapporto di debug del 29/10/2026 (F01…F18), con dati inventati.
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

const T = {
  fonti: [{ fonte_id: "FLX", tipo: "FL", documento: "FL prova", breve: "FL X", edizione: "2026", note: null }],
  linee: [{ linea_id: "L1", nome: "Alfa – Beta", nome_breve: "Alfa – Beta", fonte: "FLX", compartimento: "MI", senso_pari: "crescente", alimentazione: null, etcs_l2_obbl: null, st: "V" }],
  localita: [{ loc_id: "alfa", nome: "Alfa", tipo: "stazione", alias: null }, { loc_id: "beta", nome: "Beta", tipo: "stazione", alias: null }],
  punti_linea: [{ linea_id: "L1", loc_id: "alfa", km: 0, km_txt: "0,000", fonte: "FLX", pag: "1", st: "V" },
                { linea_id: "L1", loc_id: "beta", km: 10, km_txt: "10,000", fonte: "FLX", pag: "1", st: "V" }],
  esercizio: [{ linea_id: "L1", senso: "entrambi", km_da: 0, km_a: 10, sistema: "DCO", testo: "DCO Alfa", riscontro: null, fonte: "FLX", pag: "2", st: "V" }],
  fiancata: [], indicatori: [], affiancamenti: [], aff_linee: [],
  sez46_letta: [{ linea_id: "L1", km_da: 0, km_a: 10, fonte: "FLX", pag: "3", st: "V" }],
  sigle: [], accesso_sigle: [], loco: [], compatibilita: [], utenze: [], geo: [], pagine_fl: [], discrepanze: []
};
const loc = (nome, km, v) => ({ nome, km: [km], tipo: "loc", vls: v });
const scheda = (righe, extra = {}) => ({ intestazione: Object.assign({ treno: "12345", valida_per: "03/11/2026", fl: [] }, extra),
  pagine: [{ treno: "12345" }], controlli: [], righe });
const vel = p => p.condotta.R.filter(r => r.t === "loc").map(r => `${r.id}=${r.v}`).join(" ");

test("F01: località ripetuta, ogni passaggio tiene i suoi valori della Scheda", () => {
  const c = Co.componi(T, null, scheda([loc("Alfa", "0.000", "80"), loc("Beta", "10.000", "60"), loc("Alfa", "0.000", "40")]), "E494");
  assert.ok(c.ok, c.rapporto.join("\n"));
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.equal(vel(p), "alfa_1=80 beta=60 alfa_2=40");
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("F01: tre passaggi e punto della Scheda dopo il secondo passaggio", () => {
  const S = scheda([loc("Alfa", "0.000", "80"), loc("Beta", "10.000", "60"), loc("Alfa", "0.000", "40"),
    { nome: "Cippo", km: ["0.500"], tipo: "pt", vls: "30" }, loc("Beta", "10.000", "50")]);
  const c = Co.componi(T, null, S, "E494");
  assert.deepEqual(c.viaggio.punti_scheda.map(p => p.dopo), ["alfa_2"]);
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.equal(vel(p), "alfa_1=80 beta_1=60 alfa_2=40 beta_2=50");
  const i = p.condotta.R.findIndex(r => r.id === "alfa_2");
  assert.equal(p.condotta.R[i + 1].n, "Cippo");
});

test("F01: valore senza passaggio indicato su località ripetuta non viene assegnato", () => {
  const V = { treno: "12345", data: "2026-11-03", loco: [{ tipo: "E494" }], scheda: { alfa: { v: "80" } },
    itinerario: [{ da: "alfa", a: "beta", linea: "L1" }, { da: "beta", a: "alfa", linea: "L1" }] };
  const p = G.genera(T, V, new Date("2026-11-03T08:00:00Z"));
  assert.equal(vel(p), "alfa_1=undefined beta=undefined alfa_2=undefined");
  assert.ok(p.aperti.some(a => /non è chiaro a quale passaggio/.test(a.cosa)));
});

// Database più ampio per F02: Alfa(0) Beta(10) Gamma(20) Delta(30) su L1; Beta(10) ed Epsilon(40) anche su L2 e L3 (ambiguità)
const T2 = JSON.parse(JSON.stringify(T));
T2.linee.push(Object.assign({}, T.linee[0], { linea_id: "L2", nome: "Beta – Epsilon 2", nome_breve: "B–E 2" }),
  Object.assign({}, T.linee[0], { linea_id: "L3", nome: "Beta – Epsilon 3", nome_breve: "B–E 3" }));
for (const [id, nome] of [["gamma", "Gamma"], ["delta", "Delta"], ["epsilon", "Epsilon"]]) T2.localita.push({ loc_id: id, nome, tipo: "stazione", alias: null });
const pl = (linea_id, loc_id, km) => ({ linea_id, loc_id, km, km_txt: String(km), fonte: "FLX", pag: "1", st: "V" });
T2.punti_linea.push(pl("L1", "gamma", 20), pl("L1", "delta", 30), pl("L2", "beta", 10), pl("L2", "epsilon", 40), pl("L3", "beta", 10), pl("L3", "epsilon", 40));
T2.esercizio[0].km_a = 30; T2.sez46_letta[0].km_a = 30;
const comp = nomiKm => Co.componi(T2, null, scheda(nomiKm.map(([n, k]) => loc(n, k, "50"))), "E494");

test("F02: itinerario completo", () => {
  const c = comp([["Alfa", "0.000"], ["Beta", "10.000"], ["Gamma", "20.000"], ["Delta", "30.000"]]);
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(c.viaggio.copertura, { completa: true, lacune: [] });
  const p = G.genera(T2, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.ok(!p.intestazione.chip.includes("ITINERARIO PARZIALE"));
});

test("F02: destinazione sconosciuta → parziale, segnato nel pacchetto", () => {
  const c = comp([["Alfa", "0.000"], ["Beta", "10.000"], ["Ignota", "55.000"]]);
  assert.equal(c.ok, true); assert.equal(c.completo, false);
  assert.match(c.lacune.join(), /destinazione non raggiunta: mancano Ignota/);
  const p = G.genera(T2, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.ok(p.intestazione.chip.includes("ITINERARIO PARZIALE"));
  assert.match(p.intestazione.percorso, /PARZIALE/);
  assert.match(p.aperti[0].cosa, /^ITINERARIO PARZIALE/);
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("F02: origine sconosciuta, vuoto intermedio, ambiguità dopo un tratto valido", () => {
  assert.match(comp([["Ignota", "55.000"], ["Alfa", "0.000"], ["Beta", "10.000"]]).lacune.join(), /origine non riconosciuta: Ignota/);
  const v = comp([["Alfa", "0.000"], ["Beta", "10.000"], ["Ignota", "15.000"], ["Gamma", "20.000"], ["Delta", "30.000"]]);
  assert.equal(v.completo, false); assert.match(v.lacune.join(), /vuoto tra Beta e Gamma: Ignota/);
  const a = comp([["Alfa", "0.000"], ["Beta", "10.000"], ["Epsilon", "40.000"]]);
  assert.equal(a.completo, false); assert.match(a.lacune.join(), /più linee possibili \(L2, L3\)/);
  assert.equal(a.viaggio.itinerario.length, 1);
});

// F03: identità traccia ⇆ Scheda
const LT = M("leggi_traccia.js");
const traccia = (cambio = "") => LT.leggi("Treno 12345 del 3 novembre 2026: Info treno\nLocomotive\nLocomotiva\tDa\tA\nE 494 - 001\tAlfa\tBeta\n" +
  `Posizione\tTratta\tCambio numero\tPartenza\tArrivo\n1\tAlfa - Beta\t${cambio}\t10:00\t10:30\nCordiali saluti\n`);
const schedaPag = pagine => ({ intestazione: Object.assign({ fl: [] }, pagine[0]), pagine, controlli: [],
  righe: [loc("Alfa", "0.000", "80"), loc("Beta", "10.000", "60")] });

test("F03: Scheda di un altro giorno → non si uniscono", () => {
  const c = Co.componi(T, traccia(), schedaPag([{ treno: "12345", valida_per: "02/11/2026" }]));
  assert.equal(c.ok, false); assert.equal(c.viaggio, null); assert.match(c.errore, /non sono lo stesso viaggio/);
});

test("F03: Scheda di un altro treno → non si uniscono", () => {
  const c = Co.componi(T, traccia(), schedaPag([{ treno: "99999", valida_per: "03/11/2026" }]));
  assert.equal(c.ok, false); assert.match(c.errore, /Scheda Treno è del treno 99999/);
});

test("F03: pagine della Scheda con date diverse → ferma", () => {
  const c = Co.componi(T, null, schedaPag([{ treno: "12345", valida_per: "03/11/2026" }, { treno: "12345", valida_per: "04/11/2026" }]), "E494");
  assert.equal(c.ok, false); assert.match(c.errore, /date diverse/);
});

test("F03: cambio numero presente nella traccia → valido, nessuna discrepanza", () => {
  const c = Co.componi(T, traccia("12346"), schedaPag([{ treno: "12345", valida_per: "03/11/2026" }, { treno: "12346", valida_per: "03/11/2026" }]));
  assert.ok(c.ok, c.rapporto.join("\n")); assert.deepEqual(c.viaggio.discrepanze, []);
});

test("F03: numero in parte diverso → generato, discrepanza conservata nel pacchetto", () => {
  const c = Co.componi(T, traccia(), schedaPag([{ treno: "12345", valida_per: "03/11/2026" }, { treno: "77777", valida_per: "03/11/2026" }]));
  assert.ok(c.ok); assert.equal(c.viaggio.discrepanze.length, 1);
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.ok(p.aperti.some(a => /Discrepanza traccia ⇆ Scheda Treno: .*77777/.test(a.cosa)));
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

// F04: ambito delle locomotive
const tracciaLoco = loc => LT.leggi("Treno 12345 del 3 novembre 2026: Info treno\nLocomotive\nLocomotiva\tDa\tA\n" + loc +
  "Posizione\tTratta\tCambio numero\tPartenza\tArrivo\n1\tAlfa - Beta\t\t10:00\t10:30\n2\tBeta - Alfa\t\t11:00\t11:30\nCordiali saluti\n");
const locoTratti = p => Object.fromEntries(p.intestazione.loco.map(l => [l.etichetta, l.tratti.join("")]));

test("F04: cambio mezzo, ogni locomotiva solo sul suo tratto", () => {
  const c = Co.componi(T, tracciaLoco("E 494 - 001\tAlfa\tBeta\nE 436 - 002\tBeta\tAlfa\n"), null);
  assert.ok(c.ok, c.rapporto.join("\n"));
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.deepEqual(locoTratti(p), { "E494-001": "A", "E436-002": "B" });
  assert.deepEqual(p.condotta.LOCO.map(x => x.t[0] + x.loco), ["AE494", "BE436"]);
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
});

test("F04: doppia trazione e località di cambio ripetuta", () => {
  const c = Co.componi(T, tracciaLoco("E 494 - 001\tAlfa\tAlfa\nE 436 - 002\tBeta\tAlfa\n"), null);
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.deepEqual(locoTratti(p), { "E494-001": "AB", "E436-002": "B" });
});

test("F04: locomotiva indicata dall'utente vale su tutti i tratti", () => {
  const c = Co.componi(T, tracciaLoco("E 494 - 001\tAlfa\tBeta\n"), null, "E405");
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.deepEqual(locoTratti(p), { E405: "AB" });
});

// F15: struttura del database importato, non solo l'impronta
const A = M("adcdb.js");
async function fileDb(modifica) {
  const tab = {}; for (const t of A.TABELLE) tab[t] = JSON.parse(JSON.stringify(T[t] || []));
  modifica(tab);
  const d = { formato: "adc-copilot-database", versione_formato: 1, versione: "20261103-0800", tabelle: tab,
    conteggi: Object.fromEntries(Object.entries(tab).map(([k, v]) => [k, v.length])) };
  d.sha256 = await A.sha256(A.canonico(tab));   // impronta corretta: il file è «integro» ma difettoso
  return JSON.stringify(d);
}
test("F15: database integro ma strutturalmente sbagliato non viene accettato", async () => {
  assert.ok((await A.controlla(await fileDb(() => {}))).db);
  const casi = [
    [t => { t.localita = [null]; }, /non è una riga valida/],
    [t => { t.punti_linea[0].km = "dieci"; }, /km non numerico/],
    [t => { t.localita.push({ ...t.localita[0] }); }, /ripetuto/],
    [t => { t.punti_linea[0].loc_id = "zeta"; }, /loc_id «zeta» inesistente/],
    [t => { t.esercizio[0].km_da = 20; }, /km_da maggiore di km_a/],
    [t => { t.linee[0].st = "X"; }, /stato «X» non ammesso/],
    [t => { t.punti_linea = []; }, /tabella punti_linea vuota/]
  ];
  for (const [m, re] of casi) assert.match((await A.controlla(await fileDb(m))).err || "", re);
  const senzaConteggi = JSON.parse(await fileDb(() => {})); delete senzaConteggi.conteggi;
  assert.match((await A.controlla(JSON.stringify(senzaConteggi))).err, /conteggi mancanti/);
});

// F12: un errore di apertura di IndexedDB non resta in memoria per sempre
test("F12: dopo un primo errore di apertura l'archivio si riprova", async () => {
  let aperture = 0;
  const finto = { result: { onversionchange: null, onclose: null, transaction: () => { throw new Error("non usato"); } } };
  const indexedDB = { open() {
    aperture++;
    const r = { result: finto.result, error: new Error("temporaneo") };
    setTimeout(() => (aperture === 1 ? r.onerror() : r.onsuccess()), 0);
    return r;
  } };
  const ctx = vm.createContext({ indexedDB, setTimeout, IDBKeyRange: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8") + "\nthis.DB = DB;", ctx);
  await assert.rejects(ctx.DB.getConf("x"), /temporaneo/);
  await assert.rejects(ctx.DB.getConf("x"), /non usato/);   // seconda volta: aperto davvero (poi transaction finta)
  assert.equal(aperture, 2);
});
