const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source.slice(0, source.indexOf("// Converte la data URL")), context);
const controlla = vm.runInContext("controlla", context);
const vuoto = e => assert.equal(e.length, 0, [...e].join(" | "));

function pacchetto(riga) {
  return {
    formato: "adc-copilot-pacchetto", versione_formato: 2, id: "T1_2026-10-22",
    revisione: 1, creato: "2026-10-22T00:00:00Z", comandi: ["STUDIO LINEA CONDOTTA"],
    input: { tipo: "scheda_treno", fase: "completa" },
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

test("il validatore importa il formato M3 dello schema 1.0.4, anche SD", () => {
  vuoto(controlla(pacchetto(m3Claude)));
  vuoto(controlla(pacchetto({ ...m3Claude, m3: { ...m3Claude.m3, binario: "SD" } })));
  const { v, ...senzaV } = m3Claude;
  vuoto(controlla(pacchetto(senzaV)));
});

test("il validatore rifiuta M3 incoerenti, vecchi o con campi vuoti (come GPS_16e 1.0.4)", () => {
  const no = r => assert.ok(controlla(pacchetto(r)).some(x => x.includes("dati M3 non validi")), JSON.stringify(r));
  no({ ...m3Claude, v: "60" });
  no({ ...m3Claude, v: "" });                                          // D14
  no({ ...m3Claude, m3: { ...m3Claude.m3, binario: "X" } });
  no({ ...m3Claude, m3: { ...m3Claude.m3, binario: "S/D" } });         // D12
  no({ ...m3Claude, m3: { ...m3Claude.m3, velocita: "" } });           // D13
  no({ ...m3Claude, m3: { ...m3Claude.m3, inizio_km: " " } });
  no({ t: "m3", n: "M3 riga 3 · solo binario destro: 80 km/h per 4000 m", km: "159.000", v: "—/80" }); // D11
  assert.ok(controlla(pacchetto({ ...m3Claude, t: "pt" })).some(x => x.includes("dati M3 su una riga non M3")));
});
