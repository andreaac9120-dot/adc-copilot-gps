const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("il GPS centra una località una sola volta e lascia libero lo scorrimento", () => {
  const calls = [];
  const elements = new Map();
  const context = vm.createContext({
    document: { querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, {
        textContent: "", setAttribute() {}, classList: { toggle() {} }
      });
      return elements.get(selector);
    } },
    navigator: { geolocation: { watchPosition: () => 1, clearWatch() {} } },
    isSecureContext: true,
    Scheda: { marcaRiga: (i, centro) => calls.push([i, centro]) },
    Date, Math
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "gps.js"), "utf8");
  vm.runInContext(source, context);
  const GPS = vm.runInContext("GPS", context);
  GPS.open({ condotta: {
    R: [{ t: "loc", id: "a", n: "A", km: "0" }, { t: "loc", id: "b", n: "B", km: "10" }],
    GEO: {
      a: { lat: 45, lon: 9, st: "V", src: "fonte" },
      b: { lat: 46, lon: 10, st: "V", src: "fonte" }
    }
  } });
  GPS.handle("toggle");
  const fix = (latitude, longitude) => GPS.fix({
    coords: { latitude, longitude, accuracy: 10 }, timestamp: Date.now()
  });

  fix(45, 9);
  assert.deepEqual(calls, []); // due rilevazioni per confermare la località
  fix(45, 9);
  assert.deepEqual(calls, [[0, true]]);
  fix(45, 9);
  fix(45, 9);
  assert.deepEqual(calls, [[0, true]]); // nessuna nuova centratura mentre si resta fermi

  GPS.handle("center");
  assert.deepEqual(calls, [[0, true], [0, true]]); // il comando esplicito funziona ancora
  fix(45, 9);
  assert.equal(calls.length, 2);

  fix(46, 10);
  assert.equal(calls.length, 2);
  fix(46, 10);
  assert.deepEqual(calls, [[0, true], [0, true], [1, true]]);
});

test("background conserva ON, ripresa senza duplicati e stop definitivo", () => {
  const watches = [], cleared = [], marks = [];
  const elements = new Map();
  const document = { hidden: false, querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: "", setAttribute() {}, classList: { toggle() {} }
    });
    return elements.get(selector);
  } };
  const context = vm.createContext({ document, isSecureContext: true, Date, Math,
    navigator: { geolocation: {
      watchPosition(ok, error, options) { watches.push({ ok, error, options }); return watches.length; },
      clearWatch(id) { cleared.push(id); }
    } }, Scheda: { marcaRiga: i => marks.push(i) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "gps.js"), "utf8"), context);
  const GPS = vm.runInContext("GPS", context);
  const pkg = { condotta: { R: [{ t: "loc", id: "a", n: "A", km: "0" }],
    GEO: { a: { lat: 45, lon: 9, st: "V", src: "fonte" } } } };
  const pos = () => ({ coords: { latitude: 45, longitude: 9, accuracy: 10 }, timestamp: Date.now() });
  const toggle = () => document.querySelector("#gpsToggle").textContent;
  GPS.open(pkg);
  GPS.handle("toggle");
  watches[0].ok(pos());
  document.hidden = true;
  GPS.visibilityChanged();
  assert.match(toggle(), /ON/);
  assert.deepEqual(cleared, []);
  document.hidden = false;
  GPS.visibilityChanged();
  assert.equal(watches.length, 2);
  assert.deepEqual(cleared, [1]);
  assert.equal(watches[1].options.maximumAge, 0);
  watches[0].error({ code: 1 }); // callback tardiva della vecchia richiesta
  watches[0].ok(pos());
  assert.match(toggle(), /ON/);
  watches[1].ok(pos());
  assert.deepEqual(marks, []); // servono due nuove conferme
  watches[1].ok(pos());
  assert.deepEqual(marks, [0]);
  watches[1].error({ code: 2 });
  watches[1].error({ code: 3 });
  assert.match(toggle(), /ON/);
  GPS.handle("toggle");
  assert.match(toggle(), /OFF/);
  const count = marks.length;
  watches[1].ok(pos());
  assert.equal(marks.length, count);
  GPS.visibilityChanged();
  assert.equal(watches.length, 2);
  GPS.handle("toggle");
  watches[2].error({ code: 1 });
  assert.match(toggle(), /OFF/);
  GPS.visibilityChanged();
  assert.equal(watches.length, 3);
  GPS.handle("toggle");
  GPS.close(); // uscita dal viaggio
  GPS.visibilityChanged();
  assert.equal(watches.length, 4);
  assert.deepEqual(cleared, [1, 2, 3, 4]);
});
