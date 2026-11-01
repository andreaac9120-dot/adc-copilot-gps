// Prove nel browser (Chromium + Playwright, profilo temporaneo) delle correzioni del debug del 29/10/2026:
// F05, F06, F07, F08, F09, F10, F13, F14. Facoltative: servono Node, Playwright e Chromium.
//   node tests/browser/debug-astra.browser.js
// Usa solo dati inventati e un token fittizio; nessuna richiesta reale a GitHub (fetch sostituita).
const { chromium } = require("playwright");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const RADICE = path.join(__dirname, "..", "..");
const M = n => require(path.join(RADICE, "motore", n));
const Co = M("componi.js"), G = M("genera.js");
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgKKKK+eP2EKKKKACiiigAooooAKKKKACiiigD/9k=";

function pacchetto() {
  const T = { fonti: [{ fonte_id: "FLX", tipo: "FL", documento: "FL prova", breve: "FL X", edizione: "2026", note: null }],
    linee: [{ linea_id: "L1", nome: "Alfa – Beta", nome_breve: "Alfa – Beta", fonte: "FLX", compartimento: "MI", senso_pari: "crescente", alimentazione: null, etcs_l2_obbl: null, st: "V" }],
    localita: [{ loc_id: "alfa", nome: "Alfa", tipo: "stazione", alias: null }, { loc_id: "beta", nome: "Beta", tipo: "stazione", alias: null }],
    punti_linea: [{ linea_id: "L1", loc_id: "alfa", km: 0, km_txt: "0,000", fonte: "FLX", pag: "1", st: "V" }, { linea_id: "L1", loc_id: "beta", km: 10, km_txt: "10,000", fonte: "FLX", pag: "1", st: "V" }],
    esercizio: [{ linea_id: "L1", senso: "entrambi", km_da: 0, km_a: 10, sistema: "DCO", testo: "DCO Alfa", riscontro: null, fonte: "FLX", pag: "2", st: "V" }],
    fiancata: [], indicatori: [], affiancamenti: [], aff_linee: [], sez46_letta: [{ linea_id: "L1", km_da: 0, km_a: 10, fonte: "FLX", pag: "3", st: "V" }],
    sigle: [], accesso_sigle: [], loco: [], compatibilita: [], utenze: [], geo: [], discrepanze: [],
    pagine_fl: [{ linea_id: "L1", senso: "pari", tipo: "principale", pag: "5", fonte: "FLX", pag_pdf: 5, img: "img/flx_p5_principale_pari.jpg", km_da: 0, km_a: 10 }] };
  const S = { intestazione: { treno: "12345", valida_per: "03/11/2026", fl: [] }, pagine: [{ treno: "12345", valida_per: "03/11/2026" }], controlli: [],
    righe: [{ nome: "Alfa", km: ["0.000"], tipo: "loc", vls: "80" }, { nome: "Beta", km: ["10.000"], tipo: "loc", vls: "60" }] };
  const c = Co.componi(T, null, S, "E494");
  const p = G.genera(T, c.viaggio, new Date("2026-11-03T08:00:00Z"), new Set(["img/flx_p5_principale_pari.jpg"]));
  p.immagini = { "img/flx_p5_principale_pari.jpg": JPG };
  return JSON.stringify(p);
}
const TIPI = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };
function server() {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const f = path.join(RADICE, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
      if (!f.startsWith(RADICE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { "Content-Type": TIPI[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
    }).listen(0, "127.0.0.1", () => res(s));
  });
}

(async () => {
  const srv = await server();
  const b = await chromium.launch(); const ctx = await b.newContext(); const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await pg.waitForTimeout(800);
  const pkg = pacchetto();
  const out = {};
  const prove = ["F05", "F06", "F07", "F08", "F09", "F10", "F13", "F14", "SYNCOK"];
  if (prove.includes("F05")) out.F05 = await pg.evaluate(async txt => {
    const r = await importaTesto(txt, "x.adc.json");
    const id = "12345_2026-11-03", path = "img/flx_p5_principale_pari.jpg";
    const b1 = await DB.getImg("si|" + id, path);
    await apriSI(id); await new Promise(r => setTimeout(r, 300));
    const urls = Object.keys(imgURLs);
    // esportazione dal telefono A: le pagine tornano incorporate
    const p = await DB.getSI(id); const q = await conPagineFL(p);
    await DB.delSI(id); const b2 = await DB.getImg("si|" + id, path);
    return { r, salvata: !!b1, urls, esportata: Object.keys(q.immagini || {}), dopoElimina: !!b2 };
  }, pkg);
  if (prove.includes("F06")) out.F06 = await pg.evaluate(async () => {
    await DB.setConfInsieme({ adcdb: { vecchio: 1 }, adcdb_info: { versione: "OLD" } });
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, k) { if (k === "adcdb_info") throw new DOMException("simulato", "QuotaExceededError"); return orig.call(this, v, k); };
    let errore = null;
    try { await salvaDb({ tabelle: { nuovo: 1 }, versione: "NEW", sha256: "x", conteggi: {} }); } catch (e) { errore = e.name; }
    IDBObjectStore.prototype.put = orig;
    const dati = await DB.getConf("adcdb"), info = await DB.getConf("adcdb_info");
    // pagine FL: errore sul catalogo → nessuna pagina nuova
    IDBObjectStore.prototype.put = function (v, k) { if (k === "pagine_fl_info") throw new DOMException("simulato", "QuotaExceededError"); return orig.call(this, v, k); };
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    let e2 = null; try { await DB.putPagineFL([], { "img/flz_p1.jpg": blob }, { FLZ: {} }); } catch (e) { e2 = e.name; }
    IDBObjectStore.prototype.put = orig;
    return { errore, dati, info, e2, paginaRimasta: !!(await DB.getImg("fl", "img/flz_p1.jpg")) };
  });
  if (prove.includes("F08")) out.F08 = await pg.evaluate(async () => {
    window.confirm = () => true;
    const indice = JSON.stringify({ formato: "adc-copilot-indice", versione_formato: 1, database: { file: "adc_linee_20261029-1102.adcdb.json", sha256: "a".repeat(64), versione: "20261029-1102", byte: 1 }, pagine: {} });
    const esito = {};
    for (const rispettaAbort of [false, true]) {
      let rilascia; const attesa = new Promise(r => (rilascia = r));
      window.fetch = (url, o) => new Promise((res, rej) => {
        if (rispettaAbort && o && o.signal) o.signal.addEventListener("abort", () => rej(new DOMException("abort", "AbortError")));
        attesa.then(() => res(new Response(indice, { status: 200 })));
      });
      await DB.setConf("sync", { token: "github_pat_TEST_ONLY_00000000000000000000" });
      SYNC.controllo = 0;
      const p = syncControlla(true);
      await new Promise(r => setTimeout(r, 50));
      await syncRimuovi();
      rilascia(); const r = await p;
      await new Promise(r => setTimeout(r, 50));
      const c = await DB.getConf("sync");
      esito[rispettaAbort ? "conAbort" : "senzaAbort"] = { risultato: r, tokenRipristinato: !!(c && c.token), conf: c };
    }
    return esito;
  });
  if (prove.includes("SYNCOK")) out.SYNCOK = await pg.evaluate(async () => {
    const indice = JSON.stringify({ formato: "adc-copilot-indice", versione_formato: 1, database: { file: "adc_linee_20261029-1102.adcdb.json", sha256: "a".repeat(64), versione: "20261029-1102", byte: 1 }, pagine: {} });
    window.fetch = async () => new Response(indice, { status: 200 });
    await DB.setConf("sync", { token: "github_pat_TEST_ONLY_00000000000000000000", scadenza: "2027-07-01" });
    const r = await syncControlla(true); const c = await DB.getConf("sync");
    window.fetch = async () => new Response("", { status: 401 });
    await syncControlla(true); const c2 = await DB.getConf("sync");
    return { nov: r && r.nov.length, token: !!c.token, scadenza: c.scadenza, controllo: !!c.controllo, errore401: c2.errore, tokenDopo401: !!c2.token };
  });
  if (prove.includes("F10")) out.F10 = await pg.evaluate(async txt => {
    const p = JSON.parse(txt); delete p.immagini;                 // pacchetto generato nel telefono, senza pagine incorporate
    const path = "img/flx_p5_principale_pari.jpg", id = p.id;
    const vecchia = new Blob([new Uint8Array([1, 1, 1])], { type: "image/jpeg" }), nuova = new Blob([new Uint8Array([2, 2, 2, 2])], { type: "image/jpeg" });
    await DB.putPagineFL([], { [path]: vecchia }, { FLX: { versione: "20261101-1000", pagine: [path] } });
    const r = await salvaSI(p, "gen");
    await DB.putPagineFL([path], { [path]: nuova }, { FLX: { versione: "20261201-1000", pagine: [path] } });   // nuova edizione
    const salvato = await DB.getSI(id);
    const b = await pagina(salvato, path);
    const esportato = await conPagineFL(salvato);
    return { r, dimensioneVista: b && b.size, esportataLungh: (esportato.immagini[path] || "").length };
  }, pkg);
  if (prove.includes("F07")) out.F07 = await pg.evaluate(async () => {
    const indice = JSON.stringify({ formato: "adc-copilot-indice", versione_formato: 1, database: { file: "adc_linee_20261029-1102.adcdb.json", sha256: "a".repeat(64), versione: "20261029-1102", byte: 1 }, pagine: {} });
    const chiamate = [];
    window.fetch = async (url) => { chiamate.push(String(url).replace(/.*export\//, "")); await new Promise(r => setTimeout(r, 100));
      if (String(url).includes("indice.json")) return new Response(indice, { status: 200 });
      return new Response("{}", { status: 200 }); };
    window.openSheet = () => {}; window.toast = () => {};
    await DB.setConf("sync", { token: "github_pat_TEST_ONLY_00000000000000000000" });
    await Promise.all([syncAggiorna(), syncAggiorna(), syncControlla(true)]);
    const bloccatoDurante = (() => { const p = syncAggiorna(); const occ = !!SYNC.occupato; return p.then(() => occ); })();
    return { chiamate, occupatoDurante: await bloccatoDurante, liberoDopo: SYNC.occupato === null, pulsante: document.querySelector("#bSync").disabled };
  });
  if (prove.includes("F09")) out.F09 = await pg.evaluate(async () => {
    SYNC.attesa = { risposta: 200, corpo: 200, riprova: 50 };
    window.openSheet = () => {}; window.toast = () => {};
    const appesa = (url, o) => new Promise((res, rej) => o.signal.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))));
    await DB.setConf("sync", { token: "github_pat_TEST_ONLY_00000000000000000000" });
    let n = 0; window.fetch = (u, o) => { n++; return appesa(u, o); };
    const t0 = Date.now(); await syncAggiorna(); const durata = Date.now() - t0;
    const c = await DB.getConf("sync");
    // 500 poi successo: un nuovo tentativo
    const indice = JSON.stringify({ formato: "adc-copilot-indice", versione_formato: 1, database: { file: "adc_linee_20261029-1102.adcdb.json", sha256: "a".repeat(64), versione: "20261029-1102", byte: 1 }, pagine: {} });
    let k = 0, urls = [];
    window.fetch = async u => { urls.push(String(u)); if (String(u).includes("/commits/")) return new Response("b".repeat(40), { status: 200 });
      if (k++ === 0) return new Response("", { status: 503 }); return new Response(indice, { status: 200 }); };
    const r = await syncControlla(true);
    return { richiesteAppese: n, durataMs: durata, errore: c.errore, pulsanteLibero: !document.querySelector("#bSync").disabled && SYNC.occupato === null,
      dopo503: !!r, refUsata: urls.filter(u => u.includes("indice")).map(u => u.split("ref=")[1]) };
  });
  if (prove.includes("F13")) out.F13 = await pg.evaluate(async txt => {
    window.confirm = () => true; const r = await importaTesto(txt, "x"); const id = r.id;
    await home(); await new Promise(r => setTimeout(r, 100));
    const esito = {};
    for (const [nome, metodo, apriFn] of [["SI", "getSI", apriSI], ["Claude", "getViaggio", apri]]) {
      const orig = DB[metodo]; let rilascia; const att = new Promise(r => (rilascia = r));
      DB[metodo] = async k => { await att; return orig.call(DB, k); };
      const p = apriFn(id);
      await home();
      rilascia(); await p; await new Promise(r => setTimeout(r, 100));
      DB[metodo] = orig;
      esito[nome] = { homeVisibile: !document.querySelector("#home").hidden, viaggioNascosto: document.querySelector("#viaggio").hidden, hash: location.hash };
    }
    await apriSI(id); await new Promise(r => setTimeout(r, 100));
    esito.aperturaNormale = { viaggioVisibile: !document.querySelector("#viaggio").hidden, hash: location.hash };
    return esito;
  }, pkg);
  if (prove.includes("F14")) out.F14 = await pg.evaluate(async txt => {
    window.confirm = () => true;
    await importaTesto(txt, "x");
    await DB.putSI({ id: "BAD", intestazione: { loco: {} } });
    await genLista();
    const html = document.querySelector("#viaggiSI").innerHTML;
    await eliminaSI("BAD"); await new Promise(r => setTimeout(r, 100));
    return { buono: html.includes("12345"), recupero: html.includes("non leggibile") && html.includes('data-id="BAD"'), eliminato: !(await DB.getSI("BAD")) };
  }, pkg);
  await b.close(); srv.close();
  console.log(JSON.stringify(out, null, 1));
  assert.deepEqual(errs, []);
  assert.equal(out.F05.salvata, true); assert.deepEqual(out.F05.urls, ["img/flx_p5_principale_pari.jpg"]); assert.equal(out.F05.dopoElimina, false);
  assert.deepEqual(out.F06.dati, { vecchio: 1 }); assert.equal(out.F06.info.versione, "OLD"); assert.equal(out.F06.paginaRimasta, false);
  assert.equal(out.F07.occupatoDurante, true); assert.equal(out.F07.liberoDopo, true);
  assert.equal(out.F07.chiamate.filter(u => u.includes("adcdb")).length, 2);   // due aggiornamenti in sequenza, non quattro
  assert.equal(out.F08.senzaAbort.tokenRipristinato, false); assert.equal(out.F08.conAbort.tokenRipristinato, false);
  assert.match(out.F09.errore, /tempo scaduto/); assert.equal(out.F09.pulsanteLibero, true); assert.equal(out.F09.dopo503, true);
  assert.equal(out.F10.dimensioneVista, 3);
  assert.equal(out.F13.SI.homeVisibile, true); assert.equal(out.F13.Claude.homeVisibile, true); assert.equal(out.F13.aperturaNormale.viaggioVisibile, true);
  assert.deepEqual(out.F14, { buono: true, recupero: true, eliminato: true });
  assert.equal(out.SYNCOK.tokenDopo401, true);
  console.log("PROVE NEL BROWSER SUPERATE");
})().catch(e => { console.error(e); process.exit(1); });
