const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function apri(linea, sigle) {
  const elementi = new Map();
  const document = { querySelector(s) { if (!elementi.has(s)) elementi.set(s, { innerHTML: '', focus() {} }); return elementi.get(s); } };
  const ctx = vm.createContext({ document });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scheda.js'), 'utf8'), ctx);
  const scheda = vm.runInContext('Scheda', ctx);
  scheda.show({ revisione: 1, fonti: [], intestazione: { treno: '1', percorso: 'A–B', loco: [] }, condotta: {
    R: [{ t: 'loc', id: 'a', n: 'A', km: '1', ind: '1' }], SEG: {}, FIANC: {}, DM: {}, DCO: {}, AFF: {},
    IND: { a: { treno: '1', tutti: [['2', 'Alternativa', '']], src: 'FL', st: 'V' } },
    AFFLOC: { a: [{ linea, ind: '2', tratto: 'A–C', fl: 'FL', sigle }] }, PLPROT: {}, FLPAG: {}, FLLOC: {}, LOCO: [], TRENO: '1'
  } });
  const click = dataset => scheda.click({ dataset, matches: () => false });
  click({ act: 'ind', i: '0' });
  return { click, html: () => elementi.get('#sheetIn').innerHTML };
}
const note = { t: 'Condizioni (note ES)', x: 'Linea solo per i treni viaggiatori <nota>', src: 'FL Sez. 4.6', st: 'V' };
test('A gialla per esito negativo, note con fonte e navigazione separata dalle Sigle', () => {
  const p = apri('Alternativa · NON PERCORRIBILE', [note]);
  assert.match(p.html(), /button class="affA affA-dubbio"/);
  p.click({ affNote: '0:0' });
  assert.match(p.html(), /Note della linea affiancata/);
  assert.match(p.html(), /solo per i treni viaggiatori &lt;nota&gt;/);
  assert.match(p.html(), /FL Sez. 4.6/);
  assert.doesNotMatch(p.html(), /data-sig=|Apri Sigle Complementari/);
  p.click({ back: 'ind:0' });
  assert.match(p.html(), /Indicatori di direzione/);
  p.click({ sig: '0:0', sigBack: 'ind' });
  assert.match(p.html(), /sh-title">Sigle Complementari/);
});
test('esito specifico del treno prevale sulla condizione generale solo viaggiatori', () => {
  assert.doesNotMatch(apri('Alternativa · PERCORRIBILE', [note]).html(), /affA-dubbio/);
  assert.match(apri('Alternativa', [note]).html(), /affA-dubbio/);
  assert.match(apri('Alternativa', [{ t: 'Percorribilità', x: 'NON PERCORRIBILE', src: 'FL', st: 'V' }]).html(), /affA-dubbio/);
  assert.match(apri('Alternativa · DA VERIFICARE', []).html(), /affA-dubbio/);
});
