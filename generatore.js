// ---------- Generatore senza IA (prova, 1.0.17) ----------
// Crea il pacchetto .adc.json nel telefono, senza Claude e senza rete, dal database dati di linea importato
// (file .adcdb.json del repository privato adc-copilot-db). I lettori e il generatore in motore/ sono la
// traduzione fedele dei programmi Python del database: stessi dati in ingresso, stesso pacchetto in uscita.
// Non sostituisce lo studio con Claude (tasti Studio linea condotta/formazione), che resta invariato.
const GEN = { ultimo: null, rapporto: [], occupato: false };
let pdfjsP = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = import("./vendor/pdfjs/pdf.min.mjs").then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", location.href).href;
    return m;
  }).catch(e => { pdfjsP = null; throw e; });
  return pdfjsP;
}
const dataOra = iso => { try { return new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }); } catch (_) { return iso; } };

async function genInfo() {
  const el = $("#genDb"); if (!el) return;
  let i = null; try { i = await DB.getConf("adcdb_info"); } catch (_) {}
  el.innerHTML = i
    ? `Database dati di linea <b>${esc(i.versione)}</b> · ${esc(i.conteggi.linee)} linee, ${esc(i.conteggi.localita)} località · importato il ${esc(dataOra(i.importato))}`
    : "Nessun database nel telefono: importa il file <b>.adcdb.json</b> che ti consegna Claude (non è pubblico).";
  const ei = $("#genImg"); if (!ei) return;
  let f = null; try { f = await DB.getConf("pagine_fl_info"); } catch (_) {}
  const v = Object.entries(f || {}).sort((a, b) => a[0].localeCompare(b[0]));
  ei.innerHTML = v.length
    ? `Pagine FL nel telefono: <b>${v.reduce((n, [, x]) => n + x.conteggio, 0)}</b> (${v.map(([k, x]) => `${esc(k.replace(/_.*/, ""))} ${esc(x.conteggio)}`).join(", ")})`
    : "Nessuna pagina FL nel telefono: importa i file <b>.adcimg.json</b> (fiancate e schemi unifilari) per vederle nel fumetto.";
}

// ---------- Pagine FL (1.0.21) ----------
// File .adcimg.json (repository privato adc-copilot-db): pagine di un FL come immagini, comuni a tutti i viaggi.
const RE_PFL = /^img\/fl[0-9a-z]+_p[0-9A-Za-z_.-]+\.jpg$/;
async function importaPagineFL(d, nome, auto) {
  if (!d || d.formato !== "adc-copilot-pagine-fl") return { err: `${nome}: non è un file di pagine FL` };
  if (d.versione_formato !== 1) return { err: `${nome}: versione del formato ${d.versione_formato} non supportata da questa app` };
  if (typeof d.fonte !== "string" || !/^[A-Z0-9_]{2,30}$/.test(d.fonte) || typeof d.versione !== "string" || !/^\d{8}-\d{4}$/.test(d.versione))
    return { err: `${nome}: fonte o versione mancante` };
  if (!d.pagine || typeof d.pagine !== "object" || Array.isArray(d.pagine)) return { err: `${nome}: pagine mancanti` };
  const chiavi = Object.keys(d.pagine).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!chiavi.length || chiavi.length !== d.conteggio) return { err: `${nome}: numero di pagine diverso da quello dichiarato` };
  for (const k of chiavi) {
    const v = d.pagine[k];
    if (!RE_PFL.test(k) || typeof v !== "string" || v.length > MAX_IMG || !v.startsWith("data:image/jpeg;base64,")) return { err: `${nome}: pagina ${k.slice(0, 60)} non valida` };
  }
  if (await AdcDb.sha256(chiavi.map(k => k + "\n" + d.pagine[k] + "\n").join("")) !== d.sha256) return { err: `${nome}: impronta SHA-256 diversa: file rovinato o modificato` };
  let info = null; try { info = await DB.getConf("pagine_fl_info"); } catch (_) {}
  info = info || {};
  const prima = info[d.fonte];
  if (!auto && prima && prima.versione > d.versione && !confirm(`Nel telefono ci sono le pagine ${d.fonte} ${prima.versione}, più recenti di ${d.versione}. Sostituirle?`))
    return { err: `${nome}: non importato (tenute le pagine più recenti)` };
  const blobs = {};
  for (const k of chiavi) {
    try { blobs[k] = await immagineDa(d.pagine[k]); } catch (_) { return { err: `${nome}: pagina ${k} rovinata, file non importato` }; }
  }
  try {
    await DB.putPagineFL(prima ? prima.pagine || [] : [], blobs);
    info[d.fonte] = { versione: d.versione, edizione: d.edizione || "", conteggio: chiavi.length, sha256: d.sha256, importato: new Date().toISOString(), pagine: chiavi };
    await DB.setConf("pagine_fl_info", info);
  } catch (err) { return { err: `${nome}: salvataggio non riuscito (${testoErrore(err)})` }; }
  if (!auto) { await genInfo(); syncStato(); }
  return { ok: true, msg: `Pagine ${d.fonte}: ${chiavi.length} importate` };
}
async function genImportaImg(files) {
  const esiti = [];
  for (const f of files) {
    const nome = f.name || "file";
    let r;
    try { r = await importaPagineFL(JSON.parse(await f.text()), nome); } catch (err) { r = { err: `${nome}: ${err instanceof SyntaxError ? "file non leggibile (JSON non valido)" : testoErrore(err)}` }; }
    esiti.push(r);
  }
  const ok = esiti.filter(x => x.ok), ko = esiti.filter(x => x.err);
  if (ko.length) openSheet(shHead("Pagine FL", `${ok.length} importati · ${ko.length} non importati`) +
    ko.map(x => fact("Non importato", esc(x.err), "", "N")).join("") + ok.map(x => fact("Importato", esc(x.msg), "", "V")).join(""));
  else if (ok.length) toast(ok.length === 1 ? ok[0].msg : `${ok.length} file di pagine FL importati`);
}
// URL delle pagine FL usate dal pacchetto, lette dall'archivio del telefono
async function urlPagineFL(p) {
  const out = {};
  const usate = new Set(Object.values(p.condotta.FLPAG || {}).flatMap(g => g.pag.map(x => x.img)));
  for (const path of usate) { try { const b = await DB.getImg("fl", path); if (b) out[path] = URL.createObjectURL(b); } catch (_) {} }
  return out;
}
// Pacchetto da scaricare: con le pagine FL incorporate, così si apre anche in un altro telefono
async function conPagineFL(p) {
  const usate = new Set(Object.values(p.condotta.FLPAG || {}).flatMap(g => g.pag.map(x => x.img)));
  const imm = {};
  for (const path of usate) {
    let b = null; try { b = await DB.getImg("fl", path); } catch (_) {}
    if (b) imm[path] = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  }
  return Object.keys(imm).length ? { ...p, immagini: imm } : p;
}

async function genImportaDb(file) {
  let r;
  try { r = await AdcDb.controlla(await file.text()); } catch (err) { r = { err: testoErrore(err) }; }
  if (r.err) return openSheet(shHead("Database non importato", file.name || "file") + fact("Problema", esc(r.err), "", "N"));
  const d = r.db;
  let vecchio = null; try { vecchio = await DB.getConf("adcdb_info"); } catch (_) {}
  if (vecchio && vecchio.versione > d.versione && !confirm(`Nel telefono c'è il database ${vecchio.versione}, più recente di ${d.versione}. Sostituirlo con quello più vecchio?`)) return;
  try { await salvaDb(d); } catch (err) { return toast("Salvataggio non riuscito: " + testoErrore(err)); }
  await genInfo(); syncStato();
// spostamento una tantum dei viaggi senza IA salvati con la 1.0.17–1.0.19; poi si ridisegna la Home se è visibile
migraSI().then(m => { if (m && !$("#home").hidden) home(); else genLista(); });
  toast(`Database ${d.versione} importato`);
}

async function salvaDb(d) {
  await DB.setConf("adcdb", d.tabelle);
  await DB.setConf("adcdb_info", { versione: d.versione, creato: d.creato, sha256: d.sha256, conteggi: d.conteggi, importato: new Date().toISOString() });
}

function genEsito(titolo, sub, righe, rapporto) {
  openSheet(shHead(titolo, sub) + righe.join("") +
    (rapporto && rapporto.length ? `<div class="note">Rapporto dei lettori (traccia ⇆ Scheda Treno ⇆ database):</div><div class="reqbox">${esc(rapporto.join("\n"))}</div>` : ""));
}

async function genGenera(btn) {
  if (GEN.occupato) return;
  let T = null; try { T = await DB.getConf("adcdb"); } catch (_) {}
  if (!T) return toast("Importa prima il database dati di linea");
  const testo = $("#gTraccia").value.trim();
  const f = $("#gScheda").files[0] || null;
  const locoUtente = $("#gLoco").value.trim();
  if (!testo && !f) { $("#gTraccia").focus(); return toast("Serve la traccia Softrail o la Scheda Treno"); }
  if (locoUtente && !Componi.tipoLoco(locoUtente)) { $("#gLoco").focus(); return toast("Locomotiva non riconosciuta: scrivi ad es. E494 o E494.504"); }
  GEN.occupato = true; const etichetta = btn.innerHTML; btn.disabled = true; btn.textContent = f ? "Lettura della Scheda Treno…" : "Generazione…";
  try {
    const Tr = testo ? LeggiTraccia.leggi(testo) : null;
    if (Tr && (!Tr.treni.length || !Tr.tratte.length))
      return genEsito("Traccia non leggibile", "serve la notifica Softrail «Info treno»", [fact("Problema", esc(Tr.controlli.join("; ") || "nessuna tratta trovata"), "", "N")]);
    let S = null;
    if (f) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const desc = PdfParole.descrittori(bytes);          // prima di passare i byte a pdf.js
      const pj = await pdfjs();
      const task = pj.getDocument({ data: bytes, isEvalSupported: false, fontExtraProperties: true, verbosity: 0 });
      try { S = await LeggiScheda.leggi(await task.promise, desc); } finally { try { task.destroy(); } catch (_) {} }
      if (!S.pagine.length)
        return genEsito("Scheda Treno non riconosciuta", f.name, [fact("Problema", "Il PDF non contiene pagine «Scheda Treno» del modulo SKT-M3M40.", "", "N")]);
    }
    // Locomotiva: campo compilato → quella; vuoto → quella della traccia; senza traccia → quella scritta nella Scheda (con avviso)
    const c = Componi.componi(T, Tr, S, locoUtente);
    GEN.rapporto = c.rapporto;
    if (c.errore) return genEsito("Pacchetto non generato", "", [fact("Errore", esc(c.errore), "", "N")], c.rapporto);
    const nomeTreno = c.viaggio.treno_testo || c.viaggio.treno;
    if (!c.viaggio.data || !c.viaggio.treno || c.viaggio.treno === "?")
      return genEsito("Treno non identificato", "", [fact("Problema", "Numero treno o data non leggibili: incolla anche la traccia.", "", "N")], c.rapporto);
    if (!c.ok) return genEsito("Itinerario non ricostruito", `treno ${nomeTreno}`, [fact("Esito", "Nessun tratto riconosciuto nel database: le linee di questo treno non sono ancora state caricate.", "", "N")], c.rapporto);
    let p;
    let disp = new Set(); try { disp = new Set(await DB.chiaviPagineFL()); } catch (_) {}
    try { p = Genera.genera(T, c.viaggio, undefined, disp); }
    catch (err) { return genEsito("Pacchetto non generato", `treno ${nomeTreno}`, [fact("Errore", esc(err.message || String(err)), "", "N")], c.rapporto); }
    const e = controlla(p);
    if (e.length) return genEsito("Pacchetto non valido", p.id, e.slice(0, 8).map(x => fact("Problema", esc(x), "", "N")), c.rapporto);
    GEN.ultimo = p;
    const I = p.intestazione, ap = p.aperti || [];
    const seg = Object.entries(p.condotta.SEG).map(([k, s]) => `${k} · ${s.nome}`).join("<br>");
    genEsito("Pacchetto generato senza IA", `${I.treno} · ${I.data_viaggio}`, [
      fact("Percorso", esc(I.percorso), "", null),
      fact("Tratti", seg.split("<br>").map(esc).join("<br>"), "", null),
      fact("Da studiare", ap.length ? esc(ap.map(a => a.cosa).join(" · ")) : "nessun punto aperto", "", ap.length ? "N" : "V"),
      `<div class="note">È una prova: confrontalo con il pacchetto di Claude. Si salva nel riquadro «Viaggi senza IA salvati», separato da quelli di Claude.</div>`,
      `<div class="btns left"><button class="studia" type="button" data-gen="anteprima">Anteprima</button><button class="studia" type="button" data-gen="salva">Salva nei viaggi senza IA</button><button class="studia alt" type="button" data-gen="scarica">Scarica .adc.json</button></div>`
    ], c.rapporto);
  } catch (err) {
    genEsito("Errore del generatore", "", [fact("Errore", esc(testoErrore(err)), "", "N")], GEN.rapporto);
  } finally {
    GEN.occupato = false; btn.disabled = false; btn.innerHTML = etichetta;
  }
}

function genAnteprima() {
  const p = GEN.ultimo; if (!p) return;
  closeSheet();
  for (const u of Object.values(imgURLs)) URL.revokeObjectURL(u); imgURLs = {};
  mostraSI(p);
  toast("Anteprima: il pacchetto non è salvato");
}
// ---------- Archivio dei viaggi senza IA (1.0.20) ----------
// I viaggi generati senza IA stanno in un archivio separato (DB «viaggi_si»): convivono con quelli di Claude
// dello stesso treno e data, che restano nel riquadro «Viaggi salvati».
const NOTA_SI = "Pacchetto generato dal software (database dati di linea)";
function eSenzaIA(p) {
  return !!(p && p.intestazione && typeof p.intestazione.nota === "string" && p.intestazione.nota.startsWith(NOTA_SI));
}
async function salvaSI(p, nome) {
  const e = controlla(p);
  if (e.length) return { err: `${nome}: ${e.slice(0, 6).join("; ")}` };
  let v = null; try { v = await DB.getSI(p.id); } catch (_) {}
  if (v && !confirm(`Tra i viaggi senza IA c'è già ${p.intestazione.treno} del ${p.intestazione.data_viaggio}. Sostituirlo?`)) return { err: `${nome}: non salvato (tenuto quello già presente)` };
  const { immagini, ...q } = p;
  q.importato = new Date().toISOString(); q.avvisi_import = [];
  try { await DB.putSI(q); } catch (err) { return { err: `${nome}: salvataggio non riuscito (${testoErrore(err)})` }; }
  return { ok: true, id: p.id, avvisi: [], senzaIA: true };
}
// Viaggi senza IA salvati fino alla 1.0.19 nell'archivio di Claude: spostati una volta nel loro archivio.
async function migraSI() {
  let fatto = false; try { fatto = await DB.getConf("migrazione_si"); } catch (_) {}
  if (fatto) return false;
  let spostati = 0;
  try {
    for (const p of await DB.listViaggi()) {
      if (!eSenzaIA(p)) continue;
      let gia = null; try { gia = await DB.getSI(p.id); } catch (_) {}
      if (!gia) await DB.putSI(p);
      await DB.delViaggio(p.id);
      spostati++;
    }
    await DB.setConf("migrazione_si", new Date().toISOString());
  } catch (_) { /* si riprova al prossimo avvio */ }
  return spostati > 0;
}
async function genLista() {
  const el = $("#viaggiSI"); if (!el) return;
  let V = []; try { V = await DB.listSI(); } catch (_) {}
  V.sort((a, b) => dataId(b).localeCompare(dataId(a)) || String(a.id).localeCompare(String(b.id)));
  el.innerHTML = V.length ? V.map(p => {
    const id = String(p.id || ""), I = p.intestazione || {};
    return `<div class="trip"><button class="item" type="button" data-gen="apri" data-id="${esc(id)}"><span><span class="tno">${esc(I.treno)}</span> <small class="tag-si">senza IA</small><br>${esc(I.percorso)}<br><small>${esc(I.data_viaggio)} · ${esc((I.loco || []).map(l => l.etichetta).join(", "))}${p.aperti && p.aperti.length ? ` · ${p.aperti.length} da studiare` : ""}</small></span><small>apri ›</small></button>
      <button class="del" type="button" data-gen="elimina" data-id="${esc(id)}" aria-label="Elimina ${esc(I.treno)}">Elimina</button></div>`;
  }).join("") : `<div class="note">Nessun viaggio senza IA salvato. Genera un pacchetto qui sopra e tocca «Salva nei viaggi senza IA».</div>`;
}
async function apriSI(id) {
  const p = await DB.getSI(id);
  if (!p) return toast("Viaggio non trovato");
  const e = (() => { try { return controlla(p); } catch (err) { return [testoErrore(err)]; } })();
  if (e.length) return openSheet(shHead("Viaggio non leggibile", id) + e.slice(0, 8).map(x => fact("Problema", esc(x), "", "N")).join(""));
  mostraSI(p);
  if (location.hash !== "#s=" + id) history.pushState({ s: id }, "", "#s=" + id);
}
async function mostraSI(p) {
  closeSheet();
  for (const u of Object.values(imgURLs)) URL.revokeObjectURL(u); imgURLs = {};
  imgURLs = await urlPagineFL(p);
  try { Scheda.show(p, imgURLs); } catch (err) { return toast("Scheda non visualizzabile: " + testoErrore(err)); }
  $("#vNota").textContent = "SENZA IA · " + $("#vNota").textContent;
  $("#home").hidden = true; $("#viaggio").hidden = false; scrollTo(0, 0);
  if (typeof GPS !== "undefined") GPS.open(p);
}
async function eliminaSI(id) {
  const p = await DB.getSI(id);
  if (!confirm(`Eliminare il viaggio senza IA ${p ? p.intestazione.treno + " del " + p.intestazione.data_viaggio : id}?`)) return;
  try { await DB.delSI(id); toast("Viaggio eliminato"); } catch (err) { toast("Eliminazione non riuscita: " + testoErrore(err)); }
  genLista();
}
async function esportaSI(id) {
  const p = await DB.getSI(id); if (!p) return;
  const { importato, avvisi_import, ...q } = p;
  scaricaJSON(q, id);
}
async function scaricaJSON(p, id) {
  let q = p; try { q = await conPagineFL(p); } catch (_) {}
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(q, null, 1)], { type: "application/json" }));
  a.download = `${String(id).replace(/[^0-9A-Za-z_-]/g, "_")}.adc.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
async function genSalva() {
  const p = GEN.ultimo; if (!p) return;
  const r = await salvaSI(p, `${p.id}.adc.json`);
  if (r.err) return openSheet(shHead("Non salvato", p.id) + fact("Problema", esc(r.err), "", "N"));
  await genLista(); apriSI(r.id);
}
function genScarica() {
  const p = GEN.ultimo; if (!p) return;
  scaricaJSON(p, p.id);
}

document.addEventListener("click", e => {
  const t = e.target.closest("button[data-gen]"); if (!t) return;
  const g = t.dataset.gen;
  if (g === "genera") return genGenera(t);
  if (g === "anteprima") return genAnteprima();
  if (g === "salva") return genSalva();
  if (g === "scarica") return genScarica();
  if (g === "apri") return apriSI(t.dataset.id);
  if (g === "elimina") return eliminaSI(t.dataset.id);
  if (g === "esporta") return esportaSI(t.dataset.id);
});
document.addEventListener("change", e => {
  if (e.target && e.target.id === "fDb") { const f = e.target.files[0]; e.target.value = ""; if (f) genImportaDb(f); }
  if (e.target && e.target.id === "fImg") { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) genImportaImg(fs); }
});
genInfo();
// spostamento una tantum dei viaggi senza IA salvati con la 1.0.17–1.0.19; poi si ridisegna la Home se è visibile
migraSI().then(m => { if (m && !$("#home").hidden) home(); else genLista(); });

// ---------- Aggiornamento dal repository privato (1.0.23) ----------
// La PWA legge export/indice.json del repository privato adc-copilot-db con un token GitHub di SOLA LETTURA
// salvato solo in questo telefono (archivio conf). Confronta le impronte con i dati del telefono e scarica solo
// i file cambiati, controllando ogni impronta prima di installarli. Il codice pubblico non contiene né dati né token.
const SYNC = { owner: "andreaac9120-dot", repo: "adc-copilot-db", ref: "main", dir: "export", occupato: false, controllo: 0 };
const RE_FILE_SYNC = /^(adc_linee_\d{8}-\d{4}\.adcdb\.json|pagine\/pagine_[A-Z0-9_]{2,30}_\d{8}-\d{4}\.adcimg\.json)$/;
async function syncConf() { let c = null; try { c = await DB.getConf("sync"); } catch (_) {} return c || {}; }
async function ghGet(path, token) {
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${SYNC.owner}/${SYNC.repo}/contents/${SYNC.dir}/${path}?ref=${SYNC.ref}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" }, cache: "no-store" });
  } catch (_) { throw new Error("rete non raggiungibile"); }
  if (r.status === 401) throw new Error("token non valido o scaduto: creane uno nuovo su GitHub");
  if (r.status === 403) throw new Error(r.headers.get("X-RateLimit-Remaining") === "0" ? "troppe richieste a GitHub, riprova tra poco" : "il token non ha il permesso di lettura sul repository");
  if (r.status === 404) throw new Error("repository o file non visibile con questo token (controlla che il token sia per adc-copilot-db)");
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`);
  return r.text();
}
function leggiIndice(txt) {
  let d; try { d = JSON.parse(txt); } catch (_) { throw new Error("indice del repository non leggibile"); }
  if (!d || d.formato !== "adc-copilot-indice" || d.versione_formato !== 1 || !d.database || typeof d.pagine !== "object") throw new Error("indice del repository non valido");
  const hex = x => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
  if (!RE_FILE_SYNC.test(d.database.file) || !hex(d.database.sha256)) throw new Error("indice: voce del database non valida");
  for (const [f, v] of Object.entries(d.pagine)) if (!/^[A-Z0-9_]{2,30}$/.test(f) || !v || !RE_FILE_SYNC.test(v.file) || !hex(v.sha256)) throw new Error(`indice: voce ${f} non valida`);
  return d;
}
// Novità = file del repository la cui impronta è diversa da quella dei dati nel telefono
async function novita(ind) {
  let dbi = null, pfi = null;
  try { dbi = await DB.getConf("adcdb_info"); } catch (_) {}
  try { pfi = await DB.getConf("pagine_fl_info"); } catch (_) {}
  const n = [];
  if (!dbi || dbi.sha256 !== ind.database.sha256) n.push({ tipo: "db", nome: "database", file: ind.database.file, sha256: ind.database.sha256, byte: ind.database.byte || 0 });
  for (const [f, v] of Object.entries(ind.pagine).sort((a, b) => a[0].localeCompare(b[0])))
    if (!pfi || !pfi[f] || pfi[f].sha256 !== v.sha256) n.push({ tipo: "pag", nome: f.replace(/_.*/, "").replace(/^FL(?=\d)/, "FL ").replace(/^FL(?=[A-Z])/, ""), fonte: f, file: v.file, sha256: v.sha256, byte: v.byte || 0 });
  return n;
}
const mb = b => (b / 1048576).toFixed(1).replace(".", ",") + " MB";
async function syncStato() {
  const b = $("#bSync"), info = $("#syncInfo"), avv = $("#syncAvv"); if (!b) return;
  const c = await syncConf();
  b.classList.remove("sync-red", "sync-ok");
  if (!c.token) { b.firstChild.textContent = "Aggiorna dati"; info.textContent = "Non collegato al repository: tocca «Collegamento»"; }
  else if (c.novita && c.novita.length) {
    b.classList.add("sync-red");
    b.firstChild.textContent = `Aggiorna dati (${c.novita.length})`;
    info.textContent = `Novità: ${c.novita.map(x => x.nome).join(", ")} · ${mb(c.novita.reduce((s, x) => s + x.byte, 0))}`;
  } else {
    b.firstChild.textContent = "Aggiorna dati";
    if (c.errore) info.textContent = "Controllo non riuscito · tocca per riprovare";
    else { if (c.controllo) b.classList.add("sync-ok"); info.textContent = c.controllo ? `Dati aggiornati · controllato ${dataOra(c.controllo)}` : "Tocca per controllare"; }
  }
  if (avv) {
    let t = "";
    if (c.errore) t = "Ultimo controllo non riuscito: " + c.errore;
    if (c.token && c.scadenza) {
      const gg = Math.ceil((new Date(c.scadenza + "T23:59:59") - Date.now()) / 86400000);
      if (gg < 0) t = (t ? t + " · " : "") + `Il token è scaduto il ${c.scadenza.split("-").reverse().join("/")}: creane uno nuovo.`;
      else if (gg <= 21) t = (t ? t + " · " : "") + `Il token scade tra ${gg} giorni (${c.scadenza.split("-").reverse().join("/")}).`;
    }
    avv.textContent = t; avv.hidden = !t;
  }
}
async function syncControlla(silenzioso) {
  const c = await syncConf();
  if (!c.token || SYNC.occupato) return null;
  if (!navigator.onLine) { if (!silenzioso) toast("Senza rete: riprova quando sei connesso"); return null; }
  SYNC.controllo = Date.now();
  try {
    const ind = leggiIndice(await ghGet("indice.json", c.token));
    c.novita = await novita(ind); c.controllo = new Date().toISOString(); c.errore = "";
    await DB.setConf("sync", c); await syncStato();
    return { ind, nov: c.novita };
  } catch (err) {
    c.errore = testoErrore(err); await DB.setConf("sync", c).catch(() => {}); await syncStato();
    if (!silenzioso) openSheet(shHead("Aggiornamento dati", "controllo non riuscito") + fact("Problema", esc(c.errore), "", "N"));
    return null;
  }
}
async function syncAggiorna() {
  if (SYNC.occupato) return;
  const c0 = await syncConf();
  if (!c0.token) return syncCollegamento();
  const r = await syncControlla(false); if (!r) return;
  if (!r.nov.length) return toast("Dati già aggiornati");
  const b = $("#bSync"), info = $("#syncInfo");
  SYNC.occupato = true; b.disabled = true;
  const ok = [], ko = [];
  try {
    for (const [k, x] of r.nov.entries()) {
      info.textContent = `Scarico ${k + 1}/${r.nov.length}: ${x.nome}${x.byte ? " · " + mb(x.byte) : ""}…`;
      try {
        const txt = await ghGet(x.file, c0.token);
        if (x.tipo === "db") {
          const v = await AdcDb.controlla(txt);
          if (v.err) throw new Error(v.err);
          if (v.db.sha256 !== x.sha256) throw new Error("impronta diversa da quella dell'indice");
          await salvaDb(v.db);
        } else {
          let d; try { d = JSON.parse(txt); } catch (_) { throw new Error("file non leggibile"); }
          if (!d || d.fonte !== x.fonte || d.sha256 !== x.sha256) throw new Error("file diverso da quello dell'indice");
          const e = await importaPagineFL(d, x.file, true);
          if (e.err) throw new Error(e.err);
        }
        ok.push(x.nome);
      } catch (err) { ko.push(`${x.nome}: ${testoErrore(err)}`); }
    }
  } finally {
    SYNC.occupato = false; b.disabled = false;
    await syncControlla(true); await genInfo();
  }
  if (ko.length) openSheet(shHead("Aggiornamento dati", `${ok.length} aggiornati · ${ko.length} non riusciti`) +
    ko.map(x => fact("Non aggiornato", esc(x), "", "N")).join("") + ok.map(x => fact("Aggiornato", esc(x), "", "V")).join("") +
    `<div class="note">I dati non aggiornati restano quelli di prima. Riprova più tardi.</div>`);
  else toast(`Aggiornati: ${ok.join(", ")}`);
}
async function syncCollegamento() {
  const c = await syncConf();
  openSheet(shHead("Collegamento al database", `${SYNC.owner}/${SYNC.repo} (privato)`) +
    `<div class="note">Serve un token GitHub di <b>sola lettura</b>, valido solo per il repository <b>${esc(SYNC.repo)}</b>. Resta salvato solo in questo telefono.<br>
     Su GitHub: Settings › Developer settings › Personal access tokens › <b>Fine-grained tokens</b> › Generate new token.
     Repository access: <i>Only select repositories</i> › ${esc(SYNC.repo)}. Permissions › Repository › <b>Contents: Read-only</b>. Copia il token (inizia con github_pat_).</div>
     <label class="field"><span>Token</span><input type="password" id="syTok" autocomplete="off" spellcheck="false" placeholder="${c.token ? "salvato: lascia vuoto per non cambiarlo" : "github_pat_…"}"></label>
     <label class="field"><span>Scadenza del token (facoltativa, per l'avviso)</span><input type="date" id="syScad" value="${esc(c.scadenza || "")}"></label>
     <div class="btns left"><button class="studia" type="button" data-gen="sysalva">Salva e prova</button>${c.token ? `<button class="studia alt" type="button" data-gen="syrimuovi">Rimuovi token</button>` : ""}</div>`);
}
async function syncSalva() {
  const c = await syncConf();
  const tok = $("#syTok").value.trim(), scad = $("#syScad").value;
  if (tok && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tok)) return toast("Il token non sembra valido: deve iniziare con github_pat_");
  const token = tok || c.token; if (!token) return toast("Incolla il token");
  try { leggiIndice(await ghGet("indice.json", token)); }
  catch (err) { return openSheet(shHead("Collegamento non riuscito", "") + fact("Problema", esc(testoErrore(err)), "", "N") + `<div class="btns left"><button class="studia" type="button" data-gen="token">Riprova</button></div>`); }
  await DB.setConf("sync", { ...c, token, scadenza: scad || "", errore: "" });
  closeSheet(); toast("Collegato al repository");
  await syncControlla(true);
}
async function syncRimuovi() {
  if (!confirm("Rimuovere il token da questo telefono? I dati già scaricati restano.")) return;
  await DB.setConf("sync", {}); closeSheet(); await syncStato(); toast("Token rimosso");
}
document.addEventListener("click", e => {
  const t = e.target.closest("button[data-gen]"); if (!t) return;
  const g = t.dataset.gen;
  if (g === "sync") return syncAggiorna();
  if (g === "token") return syncCollegamento();
  if (g === "sysalva") return syncSalva();
  if (g === "syrimuovi") return syncRimuovi();
});
// controllo automatico: all'avvio, al ritorno della rete e quando si riapre l'app (al massimo ogni 15 minuti)
const syncAuto = () => { if (Date.now() - SYNC.controllo > 15 * 60000) syncControlla(true); };
addEventListener("online", syncAuto);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncAuto(); });
syncStato().then(syncAuto);
