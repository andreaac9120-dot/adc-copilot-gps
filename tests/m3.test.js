const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function schedaCon(righe, moduli = []) {
  const elements = new Map();
  const document = { querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: "", textContent: "", hidden: true });
    return elements.get(selector);
  } };
  const context = vm.createContext({ document, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "scheda.js"), "utf8"), context);
  const Scheda = vm.runInContext("Scheda", context);
  Scheda.show({
    revisione: 1, fonti: [], intestazione: { treno: "1", percorso: "A–B", loco: [] },
    condotta: { R: righe, SEG: {}, FIANC: {}, DM: {}, DCO: {}, AFF: {}, IND: {},
      AFFLOC: {}, PLPROT: {}, FLPAG: {}, FLLOC: {}, LOCO: [], TRENO: "1",
      PRESC: { moduli, dentro: [], fuori: [], riep: { n: "1", tratto: "A–B", consegnati: "1" }, src: "M3" } }
  });
  return { Scheda, elements };
}

test("M3 strutturato mostra i quattro dati e tiene le note chiuse", () => {
  const { Scheda, elements } = schedaCon([{ t: "m3", n: "Rallentamento", km: "10", v: "30",
    m3: { velocita: "30", inizio_km: "10+200", lunghezza_m: "500", binario: "S", note: ["Segnale <temporaneo>"] } }]);
  const html = elements.get("#rows").innerHTML;
  assert.match(html, /30<small> km\/h/);
  assert.match(html, /10\+200/);
  assert.match(html, /500 m/);
  assert.match(html, /Binario sinistro/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /id="m3-note-0" hidden/);
  assert.match(html, /Segnale &lt;temporaneo&gt;/);
  assert.doesNotMatch(html.split('class="m3-notes"')[0], /Segnale &lt;temporaneo&gt;/);
  let expanded;
  assert.equal(Scheda.click({ dataset: { m3: "0" }, setAttribute: (_, v) => { expanded = v; } }), true);
  const notes = elements.get("#m3-note-0");
  assert.equal(notes.hidden, false);
  assert.equal(expanded, "true");
  Scheda.click({ dataset: { m3: "0" }, setAttribute: (_, v) => { expanded = v; } });
  assert.equal(notes.hidden, true);
  assert.equal(expanded, "false");
});

test("M3 precedente conserva la riga originale e il collegamento alle prescrizioni", () => {
  const { elements } = schedaCon([{ t: "m3", n: "M3 riga 3 · solo binario destro: 80 km/h per 4000 m", km: "12", v: "—/80" }]);
  const html = elements.get("#rows").innerHTML;
  assert.match(html, /—\/80/);
  assert.match(html, /solo binario destro: 80 km\/h per 4000 m/);
  assert.match(html, /data-presc="1"/);
  assert.doesNotMatch(html, /m3-toggle/);
});

test("M3 strutturato su entrambi i binari mostra S/D", () => {
  for (const valore of ["SD", "S/D"]) {
    const { elements } = schedaCon([{ t: "m3", n: "Rallentamento M3", km: "15", v: "40",
      m3: { velocita: "40", inizio_km: "15", lunghezza_m: "300", binario: valore, note: [] } }]);
    const html = elements.get("#rows").innerHTML;
    assert.match(html, /Binari sinistro e destro/);
    assert.match(html, />S\/D<\/span>/);
  }
});

test("M3 di Claude conserva il cippo spostabile e mostra modulo e note nel dettaglio", () => {
  const { elements } = schedaCon([{ t: "m3", n: "Rallentamento M3", km: "159.000", v: "80",
    m3: { velocita: "80", inizio_km: "159 (spostabile fino al km 166)", lunghezza_m: "4000", binario: "D",
      note: ["Spostabile tra il km 159 e il km 166"], modulo: "M3 n. 2345436 riga 3" } }]);
  const html = elements.get("#rows").innerHTML;
  assert.match(html, /159 \(spostabile fino al km 166\)/);
  assert.match(html, /4000 m/);
  assert.match(html, /Binario destro/);
  assert.match(html, /id="m3-note-0" hidden><p class="m3-modulo">M3 n\. 2345436 riga 3<\/p>/);
  assert.doesNotMatch(html.split('class="m3-notes"')[0], /M3 n\. 2345436 riga 3/);
});
