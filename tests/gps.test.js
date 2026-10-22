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
