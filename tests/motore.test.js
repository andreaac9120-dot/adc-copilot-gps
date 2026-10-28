// Generatore senza IA (1.0.17): prove con dati inventati (i dati veri restano nel repository privato).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const M = n => require(path.join(__dirname, "..", "motore", n));
const C = M("comune.js"), LT = M("leggi_traccia.js"), Co = M("componi.js"), G = M("genera.js"), A = M("adcdb.js");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const ctx = vm.createContext({});
vm.runInContext(app.slice(0, app.indexOf("// Converte la data URL")), ctx);
const controlla = vm.runInContext("controlla", ctx);

test("somiglianza come difflib di Python", () => {
  assert.equal(C.ratio("ABCD", "BCDA"), 0.75);
  assert.equal(C.ratio("MILANO", "MILANO"), 1);
  assert.equal(C.fg(159.0), "159"); assert.equal(C.fg(26.5), "26.5");
});

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
const TRACCIA = "Treno 12345 del 3 novembre 2026: Info treno\nLocomotive\nLocomotiva\tDa\tA\nE 494 - 001\tAlfa\tBeta\nPosizione\tTratta\tCambio numero\tPartenza\tArrivo\n1\tAlfa - Beta\t\t10:00\t10:30\nCordiali saluti\n";

test("traccia, composizione e pacchetto valido per la PWA", () => {
  const Tr = LT.leggi(TRACCIA);
  assert.deepEqual([...Tr.treni], ["12345"]); assert.equal(Tr.data, "2026-11-03"); assert.equal(Tr.tratte.length, 1);
  const c = Co.componi(T, Tr, null);
  assert.ok(c.ok, c.rapporto.join("\n"));
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.equal(p.id, "12345_2026-11-03");
  assert.equal(p.condotta.SEG.A.esercizio.startsWith("DCO"), true);
  assert.equal(p.condotta.AFF.A.esito, "nessuna");
  assert.equal(p.condotta.LOCO[0].st, "N");   // locomotiva non nel database: stato N, nessun dato inventato
  const e = controlla(JSON.parse(JSON.stringify(p)));
  assert.equal(e.length, 0, [...e].join(" | "));
});

test("database importato: impronta controllata", async () => {
  const tab = {}; for (const t of A.TABELLE) tab[t] = T[t] || [];
  const d = { formato: "adc-copilot-database", versione_formato: 1, versione: "20261103-0800", tabelle: tab, sha256: await A.sha256(A.canonico(tab)) };
  assert.ok((await A.controlla(JSON.stringify(d))).db);
  d.tabelle.linee[0].nome = "cambiato";
  assert.match((await A.controlla(JSON.stringify(d))).err, /impronta/);
});

test("solo Scheda Treno: numeri e data dalla Scheda, locomotiva dal campo o dalla Scheda", () => {
  const S = () => ({ intestazione: { treno: "12345", valida_per: "03/11/2026", mezzo_sigla: "E436", sigla: "M100A", freno: "P75%", fl: [] },
    pagine: [{ treno: "12345" }], controlli: [], moduli: [],
    righe: [{ nome: "Alfa", tipo: "loc", km: ["0.000"] }, { nome: "Beta", tipo: "loc", km: ["10.000"] }] });
  const a = Co.componi(T, null, S());
  assert.ok(a.ok, a.rapporto.join("\n"));
  assert.equal(a.viaggio.data, "2026-11-03");
  assert.equal(a.viaggio.loco[0].tipo, "E436");
  assert.ok(a.rapporto.some(r => r.includes("LOCOMOTIVA presa dalla Scheda")));
  const b = Co.componi(T, null, S(), "E494.504");
  assert.deepEqual({ ...b.viaggio.loco[0] }, { tipo: "E494", etichetta: "E494.504" });
  const p = G.genera(T, b.viaggio, new Date("2026-11-03T08:00:00Z"));
  assert.equal(controlla(JSON.parse(JSON.stringify(p))).length, 0);
  assert.equal(Co.componi(T, null, S(), "zz").ok, false);
});
