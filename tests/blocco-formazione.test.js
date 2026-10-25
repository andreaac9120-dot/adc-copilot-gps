// 1.0.12 – import del file blocco_formazione prodotto da ADC FORMAZIONE e unione al viaggio salvato.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
function ambiente(viaggi, conferma = true) {
  const salvati = [], chiesto = [];
  const DB = {
    getViaggio: async id => viaggi.find(v => v.id === id) || null,
    listViaggi: async () => viaggi,
    getImg: async () => null,
    putViaggio: async (p, blobs) => { salvati.push({ p, blobs }); }
  };
  const ctx = vm.createContext({ DB, confirm: m => { chiesto.push(m); return conferma; }, atob: x => Buffer.from(x, "base64").toString("binary"), Blob: class {}, Uint8Array });
  vm.runInContext(app.slice(0, app.indexOf("// D01 – ogni file ha il suo esito")) + "\nthis.valido = p => controlla(p).length === 0;", ctx);
  return { ctx, salvati, chiesto };
}
const viaggio = () => ({
  formato: "adc-copilot-pacchetto", versione_formato: 2, id: "65720_2026-10-26", revisione: 1,
  creato: "2026-10-25T08:00:00Z", comandi: ["STUDIO LINEA CONDOTTA"], input: { tipo: "traccia", fase: "fase1_traccia" },
  fonti: [{ doc: "FL 23", edizione: "2026" }],
  intestazione: { treno: "65720 / 65729 (origine 63718/56072, MPX Sacconago - Frosinone)", percorso: "Mi Certosa – Novara Nord", data_viaggio: "26/10/2026", loco: [{ tipo: "E494", etichetta: "E494" }] },
  condotta: {
    TRENO: "treno 65720 del 26/10/2026", SEG: { A: { nome: "A–B", fl: "23", pag: "1", esercizio: "DC", st: "V" } },
    R: [{ t: "loc", id: "a", n: "A", km: "0", s: "A" }, { t: "loc", id: "b", n: "B", km: "10", s: "A", end: true }],
    FIANC: {}, DM: {}, DCO: {}, AFF: { A: { txt: "nessuna", src: "FL 23 p. 4", st: "V", esito: "nessuna" } },
    IND: {}, AFFLOC: {}, FLPAG: {}, FLLOC: {}, PRESC: null, LOCO: []
  },
  aperti: [{ cosa: "Scheda Treno", motivo: "attesa_scheda_treno", richiesta: "STUDIA SOLO …" }, { cosa: "[FORMAZIONE] vecchio", richiesta: "x" }],
  importato: "2026-10-25T09:00:00Z"
});
const blocco = (id = "63718_2026-10-26") => ({
  id, comando: "STUDIO LINEA FORMAZIONE con la traccia",
  formazione: {
    tratti: [{ seg: "Z9", da: "A", a: "B", linea: "L", affiancata: false, gdp: { v: "19", st: "V", src: "FL 23 p. 94" } }],
    prestazione_massima: [],
    pgos: { massa_t: null, controlli: [{ t: "Art. 60", esito: "non_eseguibile", st: "N", src: "PGOS Art. 60" }], nota: "non eseguibile: massa del treno non fornita" },
    staffe: null
  },
  fonti: [{ doc: "DE CTI 03/2014", edizione: "Ed. 7 Rev. 0", uso: "formazione" }, { doc: "FL 23", edizione: "2026" }],
  aperti: [{ cosa: "massa del treno", motivo: "attesa_massa_treno", richiesta: "STUDIA SOLO controlli PGOS – massa … t" }]
});

test("blocco con numero treno diverso: trovato dall'intestazione, con conferma, unito e salvato rev. 2", async () => {
  const { ctx, salvati, chiesto } = ambiente([viaggio()]);
  const r = await ctx.importaTesto(JSON.stringify(blocco()), "blocco_formazione_63718_2026-10-26.json");
  assert.equal(r.err, undefined, r.err);
  assert.equal(chiesto.length, 1);
  const p = salvati[0].p;
  assert.equal(p.id, "65720_2026-10-26");
  assert.equal(p.revisione, 2);
  assert.equal(JSON.stringify([...p.comandi]), JSON.stringify(["STUDIO LINEA CONDOTTA", "STUDIO LINEA FORMAZIONE"]));
  assert.equal(p.fonti.length, 2);                                   // FL 23 non duplicata
  assert.equal(JSON.stringify(p.aperti.map(a => a.cosa)), JSON.stringify(["Scheda Treno", "[FORMAZIONE] massa del treno"]));
  assert.equal(p.formazione.tratti[0].seg, undefined);               // collegamento a tratto inesistente tolto…
  assert.ok(p.avvisi_import.some(a => a.includes("Z9")));            // …e segnalato
  assert.equal(Object.keys(salvati[0].blobs).length, 0);             // pagine FL del viaggio non toccate
  assert.equal(vm.runInContext("controlla", ctx)(p).length, 0);
});

test("stesso id: nessuna domanda", async () => {
  const { ctx, salvati, chiesto } = ambiente([viaggio()]);
  const r = await ctx.importaTesto(JSON.stringify(blocco("65720_2026-10-26")), "b.json");
  assert.ok(r.ok); assert.equal(chiesto.length, 0); assert.equal(salvati[0].p.revisione, 2);
});

test("nessun viaggio corrispondente, data diversa o unione annullata: niente salvato", async () => {
  for (const [viaggi, b, conferma, testo] of [
    [[], blocco(), true, "importa prima il pacchetto di condotta"],
    [[viaggio()], blocco("63718_2026-10-27"), true, "importa prima il pacchetto di condotta"],
    [[viaggio()], blocco(), false, "annullata"]
  ]) {
    const { ctx, salvati } = ambiente(viaggi, conferma);
    const r = await ctx.importaTesto(JSON.stringify(b), "b.json");
    assert.match(r.err, new RegExp(testo)); assert.equal(salvati.length, 0);
  }
});

test("due viaggi possibili: chiede l'id esatto", async () => {
  const v2 = viaggio(); v2.id = "56072_2026-10-26"; v2.intestazione.treno = "56072 (origine 63718)";
  const { ctx, salvati } = ambiente([viaggio(), v2]);
  const r = await ctx.importaTesto(JSON.stringify(blocco()), "b.json");
  assert.match(r.err, /più viaggi/); assert.equal(salvati.length, 0);
});

test("blocco che non rispetta le regole 1.0.4: rifiutato con il motivo", async () => {
  const b = blocco(); b.formazione.pgos.controlli[0].st = "V";   // non eseguibile con stato V
  const { ctx, salvati } = ambiente([viaggio()]);
  const r = await ctx.importaTesto(JSON.stringify(b), "b.json");
  assert.match(r.err, /richiede stato N/); assert.equal(salvati.length, 0);
});

test("seconda formazione: sostituisce la prima e rinnova i punti aperti di formazione", async () => {
  const v = viaggio();
  const { ctx, salvati } = ambiente([v]);
  await ctx.importaTesto(JSON.stringify(blocco("65720_2026-10-26")), "b1.json");
  const dopo = salvati[0].p;
  const b2 = blocco("65720_2026-10-26"); b2.aperti = [];
  const { ctx: ctx2, salvati: s2 } = ambiente([dopo]);
  await ctx2.importaTesto(JSON.stringify(b2), "b2.json");
  assert.equal(s2[0].p.revisione, 3);
  assert.equal(JSON.stringify(s2[0].p.aperti.map(a => a.cosa)), JSON.stringify(["Scheda Treno"]));
});

// 1.0.13 – ripubblicazione della sola condotta su un viaggio che ha già la formazione
function ambienteMem(iniziali) {
  const db = new Map(iniziali.map(v => [v.id, v])), chiesto = [];
  const DB = {
    getViaggio: async id => db.get(id) || null, listViaggi: async () => [...db.values()],
    getImg: async () => null, putViaggio: async p => { db.set(p.id, JSON.parse(JSON.stringify(p))); }
  };
  const ctx = vm.createContext({ DB, confirm: m => { chiesto.push(m); return true; }, atob: x => Buffer.from(x, "base64").toString("binary"), Blob: class {}, Uint8Array });
  vm.runInContext(app.slice(0, app.indexOf("// D01 – ogni file ha il suo esito")) + "\nthis.valido = p => controlla(p).length === 0;", ctx);
  return { ctx, db, chiesto };
}
const condotta = rev => { const v = viaggio(); delete v.importato; v.revisione = rev; v.aperti = [{ cosa: "Scheda Treno", motivo: "attesa_scheda_treno", richiesta: "STUDIA SOLO …" }]; return v; };

test("condotta ripubblicata senza formazione: la formazione unita dal blocco resta, revisione sopra quella salvata", async () => {
  const { ctx, db, chiesto } = ambienteMem([]);
  await ctx.importaTesto(JSON.stringify(condotta(1)), "c1.json");
  const b = blocco("65720_2026-10-26"); b.formazione.tratti[0].seg = "A";
  await ctx.importaTesto(JSON.stringify(b), "b.json");
  assert.equal(db.get("65720_2026-10-26").revisione, 2);
  const c2 = condotta(2); c2.input.fase = "completa"; c2.aperti = [];           // fase 2 con la Scheda, da ADC COPILOT
  const r = await ctx.importaTesto(JSON.stringify(c2), "c2.json");
  assert.equal(r.err, undefined, r.err);
  const p = db.get("65720_2026-10-26");
  assert.equal(p.revisione, 3);
  assert.equal(p.input.fase, "completa");                                       // condotta nuova
  assert.equal(p.formazione.tratti[0].gdp.v, "19");                             // formazione conservata
  assert.equal(p.formazione.tratti[0].seg, "A");
  assert.equal(JSON.stringify(p.aperti.map(a => a.cosa)), JSON.stringify(["[FORMAZIONE] massa del treno"]));
  assert.ok(p.comandi.includes("STUDIO LINEA FORMAZIONE"));
  assert.ok(p.fonti.some(f => f.doc === "DE CTI 03/2014"));
  assert.equal(p.rev_condotta, 2);
  assert.equal(chiesto.length, 0);                                              // nessuna domanda di "revisione più vecchia"
  assert.ok(p.avvisi_import.some(a => a.includes("formazione del viaggio salvato conservata")));
  assert.equal(vm.runInContext("controlla", ctx)(p).length, 0);
});

test("tratto sparito nella nuova condotta: collegamento tolto e segnalato", async () => {
  const { ctx, db } = ambienteMem([]);
  await ctx.importaTesto(JSON.stringify(condotta(1)), "c1.json");
  const b = blocco("65720_2026-10-26"); b.formazione.tratti[0].seg = "A";
  await ctx.importaTesto(JSON.stringify(b), "b.json");
  const c2 = condotta(2);
  c2.condotta.SEG = { B: c2.condotta.SEG.A }; c2.condotta.R.forEach(r => r.s = "B"); c2.condotta.AFF = { B: c2.condotta.AFF.A };
  const r = await ctx.importaTesto(JSON.stringify(c2), "c2.json");
  assert.equal(r.err, undefined, r.err);
  const p = db.get("65720_2026-10-26");
  assert.equal(p.formazione.tratti[0].seg, undefined);
  assert.ok(p.avvisi_import.some(a => a.includes('tratto "A" tolto')));
});

test("pacchetto completo con la sua formazione: sostituisce tutto come prima", async () => {
  const { ctx, db } = ambienteMem([]);
  await ctx.importaTesto(JSON.stringify(condotta(1)), "c1.json");
  await ctx.importaTesto(JSON.stringify(blocco("65720_2026-10-26")), "b.json");
  const pieno = condotta(3); pieno.comandi.push("STUDIO LINEA FORMAZIONE");
  pieno.formazione = JSON.parse(JSON.stringify(blocco().formazione)); delete pieno.formazione.tratti[0].seg;
  pieno.formazione.tratti[0].gdp.v = "21";
  await ctx.importaTesto(JSON.stringify(pieno), "p3.json");
  const p = db.get("65720_2026-10-26");
  assert.equal(p.revisione, 3); assert.equal(p.formazione.tratti[0].gdp.v, "21");
});

test("l'esportazione non contiene i dati locali dell'app", () => {
  assert.match(app, /const \{ importato, avvisi_import, rev_condotta, \.\.\.pacchetto \} = p;/);
});
