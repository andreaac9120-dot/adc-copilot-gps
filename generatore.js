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
}

async function genImportaDb(file) {
  let r;
  try { r = await AdcDb.controlla(await file.text()); } catch (err) { r = { err: testoErrore(err) }; }
  if (r.err) return openSheet(shHead("Database non importato", file.name || "file") + fact("Problema", esc(r.err), "", "N"));
  const d = r.db;
  let vecchio = null; try { vecchio = await DB.getConf("adcdb_info"); } catch (_) {}
  if (vecchio && vecchio.versione > d.versione && !confirm(`Nel telefono c'è il database ${vecchio.versione}, più recente di ${d.versione}. Sostituirlo con quello più vecchio?`)) return;
  try {
    await DB.setConf("adcdb", d.tabelle);
    await DB.setConf("adcdb_info", { versione: d.versione, creato: d.creato, sha256: d.sha256, conteggi: d.conteggi, importato: new Date().toISOString() });
  } catch (err) { return toast("Salvataggio non riuscito: " + testoErrore(err)); }
  await genInfo();
  toast(`Database ${d.versione} importato`);
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
  if (!testo) { $("#gTraccia").focus(); return toast("Incolla la traccia Softrail: serve sempre"); }
  const f = $("#gScheda").files[0] || null;
  GEN.occupato = true; const etichetta = btn.innerHTML; btn.disabled = true; btn.textContent = f ? "Lettura della Scheda Treno…" : "Generazione…";
  try {
    const Tr = LeggiTraccia.leggi(testo);
    if (!Tr.treni.length || !Tr.tratte.length)
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
    const c = Componi.componi(T, Tr, S);
    GEN.rapporto = c.rapporto;
    if (!c.ok) return genEsito("Itinerario non ricostruito", `treno ${Tr.treni.join("/")}`, [fact("Esito", "Nessun tratto riconosciuto nel database: le linee di questo treno non sono ancora state caricate.", "", "N")], c.rapporto);
    let p;
    try { p = Genera.genera(T, c.viaggio); }
    catch (err) { return genEsito("Pacchetto non generato", `treno ${Tr.treni.join("/")}`, [fact("Errore", esc(err.message || String(err)), "", "N")], c.rapporto); }
    const e = controlla(p);
    if (e.length) return genEsito("Pacchetto non valido", p.id, e.slice(0, 8).map(x => fact("Problema", esc(x), "", "N")), c.rapporto);
    GEN.ultimo = p;
    const I = p.intestazione, ap = p.aperti || [];
    const seg = Object.entries(p.condotta.SEG).map(([k, s]) => `${k} · ${s.nome}`).join("<br>");
    genEsito("Pacchetto generato senza IA", `${I.treno} · ${I.data_viaggio}`, [
      fact("Percorso", esc(I.percorso), "", null),
      fact("Tratti", seg.split("<br>").map(esc).join("<br>"), "", null),
      fact("Da studiare", ap.length ? esc(ap.map(a => a.cosa).join(" · ")) : "nessun punto aperto", "", ap.length ? "N" : "V"),
      `<div class="note">È una prova: confrontalo con il pacchetto di Claude. Se salvi, sostituisce il viaggio con lo stesso treno e data già nel telefono.</div>`,
      `<div class="btns left"><button class="studia" type="button" data-gen="anteprima">Anteprima</button><button class="studia" type="button" data-gen="salva">Salva nei viaggi</button><button class="studia alt" type="button" data-gen="scarica">Scarica .adc.json</button></div>`
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
  try { Scheda.show(p, {}); } catch (err) { return toast("Scheda non visualizzabile: " + testoErrore(err)); }
  $("#home").hidden = true; $("#viaggio").hidden = false; scrollTo(0, 0);
  if (typeof GPS !== "undefined") GPS.open(p);
  toast("Anteprima: il pacchetto non è salvato");
}
async function genSalva() {
  const p = GEN.ultimo; if (!p) return;
  const v = await DB.getViaggio(p.id);
  if (v && !confirm(`Nel telefono c'è già il viaggio ${p.intestazione.treno} del ${p.intestazione.data_viaggio} (rev. ${v.revisione}). Sostituirlo con il pacchetto generato senza IA?`)) return;
  const r = await importaTesto(JSON.stringify(p), `${p.id}.adc.json`);
  if (r.err) return openSheet(shHead("Non salvato", p.id) + fact("Problema", esc(r.err), "", "N"));
  await home(); apri(r.id);
}
function genScarica() {
  const p = GEN.ultimo; if (!p) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 1)], { type: "application/json" }));
  a.download = `${p.id.replace(/[^0-9A-Za-z_-]/g, "_")}.adc.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

document.addEventListener("click", e => {
  const t = e.target.closest("button[data-gen]"); if (!t) return;
  const g = t.dataset.gen;
  if (g === "genera") return genGenera(t);
  if (g === "anteprima") return genAnteprima();
  if (g === "salva") return genSalva();
  if (g === "scarica") return genScarica();
});
document.addEventListener("change", e => {
  if (e.target && e.target.id === "fDb") { const f = e.target.files[0]; e.target.value = ""; if (f) genImportaDb(f); }
});
genInfo();
