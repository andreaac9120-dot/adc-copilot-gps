// 1.0.51: correzioni dal debug di Astra, Blocco 1a Torino (27/11/2026, proposte/DEBUG_LETTORI del database):
// D01 cippo di un'altra linea, D02 deviazione isolata, D04 progressiva stampata, D06 refuso stampato, D07 pareggio
// prima del primo tratto, D08 itinerario vuoto, D09 RICOSTRUITA annunciata solo se usata. Dati inventati.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const M = n => require(path.join(__dirname, "..", "motore", n));
const Co = M("componi.js"), G = M("genera.js");

const pl = (linea_id, loc_id, km, km_txt) => ({ linea_id, loc_id, km, km_txt: km_txt === undefined ? String(km) : km_txt, fonte: "FLX", pag: "1", st: "V" });
const base = (linee, localita, punti, discrepanze = []) => ({
  fonti: [{ fonte_id: "FLX", tipo: "FL", documento: "FL prova", breve: "FL X", edizione: "2026", note: null }],
  linee: linee.map(([linea_id, nome]) => ({ linea_id, nome, nome_breve: nome, fonte: "FLX", compartimento: "TO", senso_pari: "crescente", alimentazione: null, etcs_l2_obbl: null, st: "V" })),
  localita: localita.map(([loc_id, nome, alias]) => ({ loc_id, nome, tipo: "stazione", alias: alias || null })),
  punti_linea: punti.map(p => pl(...p)), discrepanze,
  esercizio: [], fiancata: [], indicatori: [], affiancamenti: [], aff_linee: [], sez46_letta: [],
  sigle: [], accesso_sigle: [], loco: [], compatibilita: [], utenze: [], geo: [], pagine_fl: []
});
const loc = (nome, km) => ({ nome, km: [].concat(km), tipo: "loc" });
const pt = (nome, km) => ({ nome, km: [].concat(km), tipo: "pt" });
const scheda = righe => ({ intestazione: { treno: "990001", valida_per: "27/11/2026", fl: [] }, pagine: [{ treno: "990001", valida_per: "27/11/2026" }], controlli: [], righe });
const tratti = c => c.viaggio.itinerario.map(t => `${t.da}-${t.a}-${t.linea}`);

// LC Lanzo 31,119 – Balangero 27,881; LP/LQ: cippo 30,00/23,46 (altra linea); LZ G 10 – H 12; LX/LY cippo 0,00/88,52
const T1 = base([["LC", "Ceres – Torino"], ["LP", "Pavia – Rogoredo"], ["LQ", "Voghera – Cippo"], ["LZ", "G – H"], ["LX", "Torreberetti – Cippo"], ["LY", "Cippo – Alessandria"]],
  [["lanzo", "Lanzo Torinese"], ["balangero", "Balangero"], ["cippo_30", "Cippo 30,00/23,46"], ["g", "Gi"], ["h", "Acca"], ["cippo_88", "Cippo 0,00/88,52"]],
  [["LC", "lanzo", 31.119], ["LC", "balangero", 27.881], ["LP", "cippo_30", 30], ["LQ", "cippo_30", 23.462], ["LZ", "g", 10], ["LZ", "h", 12],
   ["LX", "cippo_88", 0], ["LY", "cippo_88", 88.522]]);

test("D01: «Cippo 30,000» fra due località della stessa linea non è il cippo di un'altra linea", () => {
  const c = Co.componi(T1, null, scheda([loc("Lanzo Torinese", "31.119"), pt("Cippo", "30.000"), loc("Balangero", "27.881")]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(tratti(c), ["lanzo-balangero-LC"]);
  assert.deepEqual(c.viaggio.punti_scheda.map(p => `${p.n}@${p.dopo}`), ["Cippo@lanzo"]);
  assert.ok(c.rapporto.some(r => /«Cippo» \(km 30\.000\) è nel database solo sulla linea LP, ma sta fra Lanzo Torinese e Balangero della linea LC/.test(r)), c.rapporto.join("\n"));
});

test("D01: cippo con progressiva doppia riconosciuto solo se coincidono tutte e due le progressive", () => {
  const c = Co.componi(T1, null, scheda([loc("Gi", "10.000"), loc("Acca", "12.000"), pt("Cippo 0,000/14,000", ["0.000", "14.000"])]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.ok(c.rapporto.includes("DATABASE: località riconosciute 2 su 2"));
  // il cippo giusto (30,000/23,462 su LP e LQ) resta riconosciuto
  const c2 = Co.componi(T1, null, scheda([pt("Cippo30.00/23.46", ["30.000", "23.462"])]), "E494");
  assert.ok(c2.rapporto.includes("DATABASE: località riconosciute 1 su 1"), c2.rapporto.join("\n"));
});

// LS Storica: Settimo 15,763 – Stura 10,935; LA accesso AV: Origine 12,347 – Stura 10,935
const T2 = base([["LS", "Storica"], ["LA", "Accesso AV"]], [["settimo", "Settimo"], ["stura", "Torino Stura"], ["orig", "Torino Stura (Origine AV)", "To Stura Orig.AV"]],
  [["LS", "settimo", 15.763], ["LS", "stura", 10.935], ["LA", "orig", 12.347], ["LA", "stura", 10.935]]);

test("D02: località di un'altra linea fra due località della Storica: resta punto della Scheda sulla Storica", () => {
  const c = Co.componi(T2, null, scheda([loc("Settimo", "15.763"), loc("To Stura Orig.AV", "12.347"), loc("Torino Stura", "10.935")]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(tratti(c), ["settimo-stura-LS"]);
  assert.deepEqual(c.viaggio.punti_scheda.map(p => `${p.n}@${p.dopo}`), ["To Stura Orig.AV@settimo"]);
  assert.ok(!c.rapporto.some(r => /non è nel database ma sta fra/.test(r)));
  assert.ok(!c.rapporto.some(r => /Località non presenti nel database/.test(r)));
  // partendo dall'Origine AV (nessuna località della Storica prima) il treno è sull'accesso AV
  const c2 = Co.componi(T2, null, scheda([loc("To Stura Orig.AV", "12.347"), loc("Torino Stura", "10.935")]), "E494");
  assert.deepEqual(tratti(c2), ["orig-stura-LA"]);
});

// LN P. Nuova −1,092 (stampata 0,000) – Zappata 1,465; LT Torino P.N. 0,000 – Lingotto 4,318; Sm. Nord su un'altra linea
const T4 = base([["LN", "P.N. – Zappata"], ["LT", "P.N. – Lingotto"], ["LM", "Zappata – Sm. Nord"]],
  [["pn", "Torino P. Nuova", "TORINO P.NUOVA"], ["zap", "Quadrivio Zappata"], ["lingotto", "Torino Lingotto"], ["smn", "Torino Smistamento Nord", "TORINO SM. NORD"]],
  [["LN", "pn", -1.092, "0,000"], ["LN", "zap", 1.465, "1,465"], ["LT", "pn", 0], ["LT", "lingotto", 4.318], ["LM", "zap", 1.465], ["LM", "smn", 2.329]]);

test("D04: località riconosciuta anche con la progressiva stampata (km_txt), non solo con quella interna", () => {
  const c = Co.componi(T4, null, scheda([loc("TORINO P.NUOVA", "0.000"), loc("QUADRIVIO ZAPPATA", "1.465")]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.deepEqual(tratti(c), ["pn-zap-LN"]);
});

test("D04: un nome poco simile alla stessa progressiva non vale se la Scheda nomina esattamente un'altra località", () => {
  const c = Co.componi(T4, null, scheda([loc("TORINO SM. NORD", "0.000"), loc("QUADRIVIO ZAPPATA", "1.465")]), "E494");
  assert.ok(!tratti(c).some(t => t.startsWith("pn-")), tratti(c).join());
  assert.ok(c.rapporto.some(r => /Località non presenti nel database.*TORINO SM\. NORD/.test(r)), c.rapporto.join("\n"));
});

// LV Vignale 0 – Varallo 54,095; discrepanza chiusa per refuso stampato (Sigle 54,098)
const T6 = base([["LV", "Vignale – Varallo"]], [["vignale", "Vignale"], ["varallo", "Varallo Sesia"]], [["LV", "vignale", 0], ["LV", "varallo", 54.095]],
  [{ disc_id: "D_VARALLO", testo: "Principali 54,095, Sigle 54,098. — refuso stampato (regola A dell'utente)", fonte: "FLX", linea_id: "LV", stato: "chiusa" }]);

test("D06: progressiva della Scheda uguale a quella di una discrepanza chiusa per refuso stampato", () => {
  const c = Co.componi(T6, null, scheda([loc("Vignale", "0.000"), loc("Varallo Sesia", "54.098")]), "E494");
  assert.equal(c.completo, true, c.rapporto.join("\n"));
  assert.ok(c.rapporto.some(r => /Varallo Sesia \(km 54\.098\) = Varallo Sesia km 54\.095 .*D_VARALLO \(chiusa: refuso stampato\): RICOSTRUITA/.test(r)), c.rapporto.join("\n"));
});

// L1 Beta 10 – Gamma 20; L2 e L3 Beta 10 – Epsilon 40 (pareggio); LB Nodo 0,090 con discrepanza aperta 0,000/0,090
const T7 = base([["L1", "Beta – Gamma"], ["L2", "Beta – Epsilon 2"], ["L3", "Beta – Epsilon 3"], ["LA", "Nodo – Avanti"], ["LB", "Nodo – Altrove"]],
  [["beta", "Beta"], ["gamma", "Gamma"], ["epsilon", "Epsilon"], ["nodo", "Nodo Centrale"], ["avanti", "Avanti"], ["altrove", "Altrove"]],
  [["L1", "beta", 10], ["L1", "gamma", 20], ["L2", "beta", 10], ["L2", "epsilon", 40], ["L3", "beta", 10], ["L3", "epsilon", 40],
   ["LA", "nodo", 0], ["LA", "avanti", 5], ["LB", "nodo", 0.09], ["LB", "altrove", 3]],
  [{ disc_id: "D_NODO", testo: "Scheda 0,000, database 0,090", fonte: "FLX", linea_id: "LB", stato: "aperta" }]);

test("D07: pareggio fra due linee prima del primo tratto: le lacune dicono dove e quali linee", () => {
  const c = Co.componi(T7, null, scheda([loc("Beta", "10.000"), loc("Epsilon", "40.000")]), "E494");
  assert.equal(c.viaggio.itinerario.length, 0);
  assert.deepEqual(c.lacune, ["nessun tratto riconosciuto", "Beta: più linee possibili (L2, L3)"]);
});

test("D08: itinerario vuoto, errore chiaro del generatore", () => {
  const c = Co.componi(T7, null, scheda([loc("Beta", "10.000"), loc("Epsilon", "40.000")]), "E494");
  assert.throws(() => G.genera(T7, c.viaggio, new Date("2026-11-27T10:00:00Z")), /itinerario vuoto: il compositore non ha riconosciuto nessun tratto/);
});

test("D09: località RICOSTRUITA annunciata solo se il viaggio usa quella linea", () => {
  const c = Co.componi(T7, null, scheda([loc("Nodo Centrale", "0.000"), loc("Avanti", "5.000")]), "E494");
  assert.deepEqual(tratti(c), ["nodo-avanti-LA"]);
  assert.ok(!c.rapporto.some(r => /RICOSTRUITA/.test(r)), c.rapporto.join("\n"));
  const c2 = Co.componi(T7, null, scheda([loc("Nodo Centrale", "0.000"), loc("Altrove", "3.000")]), "E494");
  assert.deepEqual(tratti(c2), ["nodo-altrove-LB"]);
  assert.ok(c2.rapporto.some(r => /Nodo Centrale \(km 0\.000\) = Nodo Centrale km 0\.09 della linea LB: progressiva diversa, discrepanza aperta D_NODO: RICOSTRUITA/.test(r)), c2.rapporto.join("\n"));
});
