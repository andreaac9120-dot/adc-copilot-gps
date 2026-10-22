const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source.slice(0, source.indexOf("// Converte la data URL")), context);
const controlla = vm.runInContext("controlla", context);

function pacchetto(riga) {
  return {
    formato: "adc-copilot-pacchetto", versione_formato: 1, id: "T1_2026-10-22",
    revisione: 1, creato: "2026-10-22T00:00:00Z", comandi: ["test"],
    fonti: [{ doc: "M3", edizione: "2026" }],
    intestazione: { treno: "T1", percorso: "A–B", data_viaggio: "22/10/2026", loco: [{ tipo: "E", etichetta: "E" }] },
    condotta: {
      R: [riga, { t: "loc", id: "B", n: "B", km: "160", s: "A", end: true }],
      SEG: { A: { nome: "A–B", fl: "1", pag: "1", esercizio: "DC", st: "V" } },
      FIANC: {}, DM: {}, DCO: {}, AFF: {}, IND: {}, AFFLOC: {}, FLPAG: {}, FLLOC: {}, LOCO: [], TRENO: "T1",
      PRESC: { riep: { n: "1", tratto: "A–B", consegnati: "1" }, src: "M3", dentro: [], fuori: [], moduli: [{ tipo: "M3", n: "2345436" }] }
    }
  };
}

const m3Claude = {
  t: "m3", n: "Rallentamento M3", km: "159.000", v: "80",
  m3: { velocita: "80", inizio_km: "159 (spostabile fino al km 166)", lunghezza_m: "4000", binario: "D",
    note: ["Spostabile tra il km 159 e il km 166"], modulo: "M3 n. 2345436 riga 3" }
};

test("il validatore importa il formato di Claude, SD e il vecchio M3", () => {
  assert.equal(controlla(pacchetto(m3Claude)).length, 0);
  assert.equal(controlla(pacchetto({ ...m3Claude, m3: { ...m3Claude.m3, binario: "SD" } })).length, 0);
  assert.equal(controlla(pacchetto({ t: "m3", n: "M3 riga 3 · solo binario destro: 80 km/h per 4000 m", km: "159.000", v: "—/80" })).length, 0);
});

test("il validatore rifiuta M3 incoerenti", () => {
  assert.ok(controlla(pacchetto({ ...m3Claude, v: "60" })).some(x => x.includes("dati M3 non validi")));
  assert.ok(controlla(pacchetto({ ...m3Claude, m3: { ...m3Claude.m3, binario: "X" } })).some(x => x.includes("dati M3 non validi")));
  assert.ok(controlla(pacchetto({ ...m3Claude, t: "pt" })).some(x => x.includes("dati M3 su una riga non M3")));
});
