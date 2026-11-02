const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function apri(linea, sigle, { tutti = [["2", "Alternativa", ""]], mio = "1" } = {}) {
  const elementi = new Map();
  const document = { querySelector(s) { if (!elementi.has(s)) elementi.set(s, { innerHTML: '', focus() {} }); return elementi.get(s); } };
  const ctx = vm.createContext({ document });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scheda.js'), 'utf8'), ctx);
  const scheda = vm.runInContext('Scheda', ctx);
  scheda.show({ revisione: 1, fonti: [], intestazione: { treno: '1', percorso: 'A–B', loco: [] }, condotta: {
    R: [{ t: 'loc', id: 'a', n: 'A', km: '1', ind: mio }], SEG: {}, FIANC: {}, DM: {}, DCO: {}, AFF: {},
    IND: { a: { treno: mio, tutti, src: 'FL', st: 'V' } },
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
test('un vecchio titolo PERCORRIBILE non nasconde le condizioni delle note ES', () => {
  assert.match(apri('Alternativa · PERCORRIBILE', [note]).html(), /affA-dubbio/);
  assert.doesNotMatch(apri('Alternativa · PERCORRIBILE', []).html(), /affA-dubbio/);
  assert.match(apri('Alternativa', [note]).html(), /affA-dubbio/);
  assert.match(apri('Alternativa', [{ t: 'Percorribilità', x: 'NON PERCORRIBILE', src: 'FL', st: 'V' }]).html(), /affA-dubbio/);
  assert.match(apri('Alternativa · DA VERIFICARE', []).html(), /affA-dubbio/);
});

test('il nome delle linee non ripete PERCORRIBILE, senza alterare il colore', () => {
  for (const esito of ['PERCORRIBILE', 'NON PERCORRIBILE']) {
    const p = apri('linea Cintura · ' + esito + ' · NON il tuo (il tuo: 4)', []);
    assert.doesNotMatch(p.html(), /direction-name[^<]*>[^<]*PERCORRIBILE/);
    assert.match(p.html(), /linea Cintura/);
    assert.doesNotMatch(p.html(), /NON il tuo/);
    assert.equal(/affA-dubbio/.test(p.html()), esito === 'NON PERCORRIBILE');
    p.click({ sig: '0:0', sigBack: 'ind' });
    assert.doesNotMatch(p.html(), /sh-sub[^<]*>[^<]*PERCORRIBILE/);
  }
});

test('raggruppa le cifre ripetute, ordina e conserva i contesti dei segnali', () => {
  const tutti = [['6','Segnale 6',''],['1','Partenza FV','Nota FV'],['4','Linea del treno',''],['1','Protezione esterna','Nota esterna'],['5','Segnale 5',''],['3','Segnale 3',''],['2','Segnale 2','']];
  const p = apri('Linea alternativa · NON il tuo (il tuo: 4)', [], { tutti, mio: '4' });
  assert.deepEqual([...p.html().matchAll(/data-indicator="(.*?)"/g)].map(x => x[1]), ['1','2','3','4','5','6']);
  assert.equal((p.html().match(/class="ind ind-current"/g) || []).length, 1);
  assert.match(p.html(), /ind-current[^>]*>4<\/span>/);
  assert.match(p.html(), /Partenza FV/);
  assert.match(p.html(), /Protezione esterna/);
  assert.match(p.html(), /Nota esterna/);
  assert.match(p.html(), /affA-verde/);
  assert.doesNotMatch(p.html(), /NON il tuo/);
});
