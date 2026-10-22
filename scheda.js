// Scheda treno interattiva: stessa logica del modello 16b, ma i dati arrivano dal pacchetto importato.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
// Stato del dato: solo V/R/I/N. Qualsiasi altro valore diventa N (da studiare), mai V.
const ST = s => (s === "V" || s === "R" || s === "I" || s === "N") ? s : "N";
const bold = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, 3500); }
function openSheet(html) { $("#sheetIn").innerHTML = html; $("#sheet").hidden = false; $("#scrim").hidden = false; $("#sheet").scrollTop = 0; const b = $("#sheetIn .close"); b && b.focus(); }
function closeSheet() { $("#sheet").hidden = true; $("#scrim").hidden = true; }
function shHead(t, sub, back) { return `${back ? `<button class="back" type="button" data-back="${esc(back)}">‹ Indietro</button>` : ""}<div class="sh-top"><div><div class="sh-title">${esc(t)}</div><div class="sh-sub">${esc(sub)}</div></div><button class="close" type="button">Chiudi</button></div>`; }
function fact(lbl, val, src, st) { return `<div class="fact ${ST(st)}"><span class="lbl">${esc(lbl)}</span><span class="val">${val}</span>${src ? `<span class="src">${esc(src)}</span>` : ""}</div>`; }

const Scheda = (() => {
  let P = null, IMG = {};
  let SEG = {}, R = [], FIANC = {}, DM = {}, DCO = {}, AFF = {}, IND = {}, AFFLOC = {}, PLPROT = {}, FLPAG = {}, FLLOC = {}, PRESC = null, LOCO = [], TRENO = "";

  function show(pkg, imgURLs) {
    P = pkg; IMG = imgURLs || {};
    ({ SEG, R, FIANC, DM, DCO, AFF, IND, AFFLOC, PLPROT, FLPAG, FLLOC, PRESC, LOCO, TRENO } = pkg.condotta);
    PLPROT = PLPROT || {};
    const I = pkg.intestazione;
    $("#vTreno").textContent = I.treno;
    $("#vPercorso").textContent = I.percorso;
    $("#vLoco").innerHTML = I.loco.map((l, k) => `<button class="chip loco" type="button" data-loco="${k}">${esc(l.etichetta)} ▾</button>`).join("");
    const ap = pkg.aperti || [];
    $("#vMeta").innerHTML = (I.chip || []).map(c => `<span class="chip">${esc(c)}</span>`).join("") +
      (PRESC ? `<button class="chip warnchip" type="button" data-presc="1">${esc(I.prescrizioni_chip || "Prescrizioni")} ▾</button>` : "") +
      (pkg.formazione ? `<button class="chip" type="button" data-form="1">Formazione ▾</button>` : "") +
      (ap.length ? `<button class="chip warnchip" type="button" data-aperti="1">Da studiare: ${ap.length} ▾</button>` : "") +
      `<span class="chip">rev. ${pkg.revisione}</span>`;
    $("#vAvvisi").innerHTML = (I.avvisi || []).map(a => `<div class="alert">${bold(a)}</div>`).join("") +
      (pkg.input && pkg.input.fase === "fase1_traccia" ? `<div class="alert">Studio con la sola traccia (fase 1): sigle complementari, Rs/NoRS e confronto con le velocità della Scheda restano in attesa della Scheda Treno.</div>` : "");
    $("#vNota").textContent = I.nota || "Tocca il nome di una località per fiancata, utenze, indicatori e pagine del FL. Strumento di consultazione: fa fede la Scheda Treno ufficiale con le prescrizioni ricevute.";
    $("#vPiede").textContent = [I.piede, "Fonti: " + pkg.fonti.map(f => `${f.doc} ${f.edizione}`).join(" · ")].filter(Boolean).join(" ");
    render();
  }

  function render() {
    let h = "", lastSeg = null;
    R.forEach((r, i) => {
      if (r.t === "loc" && r.s && r.s !== lastSeg && !r.end && SEG[r.s]) { h += `<div class="row seg">${esc(SEG[r.s].fl)} · ${esc(SEG[r.s].nome)}</div>`; lastSeg = r.s; }
      if (r.t === "m3" && r.m3) { h += m3Row(r, i); return; }
      let name = esc(r.n);
      if (r.t === "loc") name = `<button type="button" data-i="${i}" aria-label="Apri ${esc(r.n)}">${esc(r.n)}</button>`;
      if (r.t === "m3" && PRESC) name = `<button type="button" data-presc="1">${esc(r.n)}</button>`;
      const ind = r.ind ? `<span class="ind" title="Indicatore di direzione dalla Scheda Treno">${esc(r.ind)}</span>` : "";
      const aff = r.t === "loc" && AFFLOC[r.id] ? `<button class="affA" type="button" data-a="${i}" aria-label="Linee affiancate da ${esc(r.n)}">A</button>` : "";
      const kp = String(r.km).split("/");
      const km = kp.length > 1 ? `<span>${esc(kp[0])}</span><span class="k2">${esc(kp[1])}</span>` : `<span>${esc(kp[0])}</span>`;
      h += `<div class="row ${r.t}" data-row="${i}"><span class="grado">${esc(r.g || "")}</span><span class="vel">${esc(r.v || "")}</span><span class="km">${km}</span><span class="name">${name}</span><span class="dircell">${ind}${aff}</span></div>`;
    });
    $("#rows").innerHTML = h;
  }

  function m3Row(r, i) {
    const d = r.m3;
    const binario = d.binario === "SD" || d.binario === "S/D" ? "S/D" : d.binario;
    const noteHtml = d.note.length ? d.note.map(n => `<p>${esc(n)}</p>`).join("") : `<p>Nessuna nota nel pacchetto.</p>`;
    const modulo = d.modulo ? `<p class="m3-modulo">${esc(d.modulo)}</p>` : "";
    return `<div class="row m3 m3-compact" data-row="${i}">
      <span class="grado">M3</span><span class="vel" aria-label="Velocità massima">${d.velocita ? `${esc(d.velocita)}<small> km/h</small>` : "—"}</span>
      <span class="km" aria-label="Chilometro iniziale">${d.inizio_km ? `<small>km</small>${esc(d.inizio_km)}` : "—"}</span>
      <span class="name">${d.lunghezza_m ? `${esc(d.lunghezza_m)} m` : "Lunghezza —"}</span>
      <span class="dircell"><span class="m3-side" aria-label="${binario === "S/D" ? "Binari sinistro e destro" : binario === "S" ? "Binario sinistro" : binario === "D" ? "Binario destro" : "Binario non indicato"}">${binario || "?"}</span><button class="m3-toggle" type="button" data-m3="${i}" aria-label="Note del rallentamento" aria-expanded="false" aria-controls="m3-note-${i}">▲</button></span>
      <div class="m3-notes" id="m3-note-${i}" hidden>${modulo}${noteHtml}</div>
    </div>`;
  }

  function marcaRiga(i, centro = false) {
    const root = $("#rows");
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(".gps-current").forEach(n => n.classList.remove("gps-current"));
    const r = root.querySelector(`[data-row="${i}"]`);
    if (r) {
      r.classList.add("gps-current");
      if (centro && r.scrollIntoView) r.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }

  const nextLoc = i => { for (let j = i + 1; j < R.length; j++) if (R[j].t === "loc") return R[j]; return null; };
  const kmNum = s => { const p = String(s).split("/"); return parseFloat(p[p.length - 1].replace(",", ".")); };
  function phone(who, num, src, st) {
    return `<div class="phone"><div class="who"><span class="dot d-${ST(st)}"></span>${esc(who)}<div class="note">${esc(src)}</div>${num ? `<div class="num">${esc(num)}</div>` : ""}</div>${num ? `<button class="copy" type="button" data-copy="${esc(num)}">Copia</button>` : ""}</div>`;
  }
  function studiaBtn(cosa, i) { const r = R[i]; const req = `STUDIA SOLO ${cosa} – ${r.n} (km ${r.km}), ${TRENO}`; return `<button class="studia" type="button" data-req="${esc(req)}">Studia</button>`; }
  function stItem(label, cosa, i) { return `<div class="item row-st"><span>${esc(label)}<br><small>da studiare</small></span>${studiaBtn(cosa, i)}</div>`; }
  const pagFL = (id, kind) => FLLOC[id] && FLLOC[id][kind] && FLPAG[FLLOC[id][kind]];

  function locMenu(i) {
    const r = R[i], nx = nextLoc(i), seg = SEG[r.s] || { fl: "" };
    openSheet(shHead(r.n, `km ${r.km} · ${seg.fl}`) + `<div class="menu">
     ${nx ? `<button class="item" type="button" data-act="fianc" data-i="${i}"><span>Fiancata fino a ${esc(nx.n)}</span><small>${esc(seg.fl)}</small></button>` : ""}
     <button class="item" type="button" data-act="tel" data-i="${i}"><span>Utenze DM / DC</span><small>GSM-R</small></button>
     ${IND[r.id] ? `<button class="item" type="button" data-act="ind" data-i="${i}"><span>Indicatori di direzione</span><span class="ind">${esc(IND[r.id].treno)}</span></button>` : stItem("Indicatori di direzione", "indicatori di direzione (schema unifilare)", i)}
     <button class="item" type="button" data-act="aff" data-i="${i}"><span>Linee affiancate</span><small>${esc(affLabel(r))}</small></button>
     ${PLPROT[r.id] ? `<button class="item" type="button" data-act="pl" data-i="${i}"><span>PL protetti dai segnali</span><small>trascritti</small></button>` : ""}
     ${pagFL(r.id, "fianc") ? `<button class="item" type="button" data-pg="fianc" data-i="${i}"><span>Segnali e PL: fiancata principale<br><small>pagina del FL</small></span><small>apri ›</small></button>` : stItem("Segnali che proteggono i PL", "segnali che proteggono i PL", i)}
     ${pagFL(r.id, "schema") ? `<button class="item" type="button" data-pg="schema" data-i="${i}"><span>Schema unifilare<br><small>pagina del FL</small></span><small>apri ›</small></button>` : stItem("Schema unifilare", "schema unifilare", i)}
    </div>`);
  }
  function indicatori(i) {
    const r = R[i], d = IND[r.id];
    openSheet(shHead("Indicatori di direzione", r.n, "loc:" + i) +
      d.tutti.map(x => `<div class="phone"><div class="who"><span class="dot d-${ST(d.st)}"></span>${esc(x[1])}${x[2] ? `<div class="note"><b>${esc(x[2])}</b></div>` : ""}</div><span class="num">${esc(x[0])}</span></div>`).join("") +
      `${d.nota ? `<div class="note">${esc(d.nota)}</div>` : ""}<div class="note">${esc(d.src)}</div>`);
  }
  function plprot(i) {
    const r = R[i], d = PLPROT[r.id];
    openSheet(shHead("PL protetti dai segnali", r.n, "loc:" + i) +
      d.pl.map(x => `<div class="phone"><div class="who"><span class="dot d-${ST(d.st)}"></span><b>${esc(x[0])}</b><div>${esc(x[1])}</div><div class="note">${esc(x[2])}</div></div></div>`).join("") +
      `${d.nota ? `<div class="note">${esc(d.nota)}</div>` : ""}<div class="note">${esc(d.src)}</div>`);
  }
  function fiancata(i) {
    const r = R[i], nx = nextLoc(i), seg = SEG[r.s] || { nome: "", fl: "", pag: "", esercizio: "", st: "N" };
    const a = kmNum(r.km), b = nx ? parseFloat(String(nx.km).split("/")[0].replace(",", ".")) : Infinity;
    const lo = Math.min(a, b), hi = Math.max(a, b); // vale anche per le progressive decrescenti
    const evs = (FIANC[r.s] || []).filter(e => { const k = parseFloat(String(e.k).replace(",", ".")); return isNaN(k) || (k >= lo - 0.001 && k <= hi + 0.001); });
    const sch = [];
    for (let j = i; j < R.length; j++) { if (j > i && R[j] === nx) break; const x = R[j]; if (x.v || x.g) sch.push(`<div class="ev"><span class="k">${esc(x.km)}</span><span>${x.v ? "Vel. " + esc(x.v) : ""}${x.v && x.g ? " · " : ""}${x.g ? "Frenatura " + esc(x.g) : ""} <span class="note">(${esc(x.n)})</span></span></div>`); }
    openSheet(shHead(`${r.n} → ${nx ? nx.n : ""}`, `${seg.fl} · ${seg.pag}`, "loc:" + i) +
      fact("Tratto", esc(seg.nome), seg.fl + " " + seg.pag, seg.st) +
      fact("Regime di esercizio", esc(seg.esercizio), "", seg.st) +
      `<h3 class="grp">Dalla Scheda Treno e dalle prescrizioni</h3>${sch.join("")}
       ${seg.notaScheda ? `<div class="note">${esc(seg.notaScheda)}</div>` : ""}
       <h3 class="grp">Dalla fiancata del FL</h3>${evs.length ? evs.map(e => `<div class="ev"><span class="k">${esc(e.k)}</span><span><span class="dot d-${ST(e.st)}"></span>${esc(e.x)} <span class="note">${esc(e.src)}</span></span></div>`).join("") : stItem("Nessun dato di fiancata studiato in questo intervallo", "fiancata di linea fino a " + (nx ? nx.n : ""), i)}
       <div class="note">Per il treno valgono la Scheda Treno e le prescrizioni ricevute.</div>`);
  }
  function utenze(i) {
    const r = R[i], dm = r.id && DM[r.id], dc = DCO[r.s];
    openSheet(shHead("Utenze", r.n, "loc:" + i) +
      `<h3 class="grp">DM della stazione</h3>${dm ? dm.map(p => phone(...p)).join("") : stItem("Nessuna utenza DM nei FL studiati", "utenza telefonica DM", i)}
       <h3 class="grp">DC / D.O.T.E. / DCCM del tratto</h3>${dc && dc.length ? dc.map(p => phone(...p)).join("") : stItem("Utenze del tratto non studiate", "utenze DC/DCO del tratto", i)}
       ${SEG[r.s] ? `<div class="note">${esc(SEG[r.s].esercizio)}.</div>` : ""}`);
  }
  // D02 – Esito delle affiancate del tratto (AFF[s].esito): "nessuna", "presenti", "non_verificabile".
  // Senza AFF il dato NON è studiato: l'assenza del quadrato A non prova che non ci siano affiancate.
  const ESITO_AFF = { nessuna: "nessuna secondo la fonte", presenti: "vedi esito del tratto", non_verificabile: "non verificabile" };
  function affLabel(r) {
    if (AFFLOC[r.id]) return "A";
    const a = AFF[r.s];
    if (!a) return "da studiare";
    return ESITO_AFF[a.esito] || "vedi esito del tratto";
  }
  function affiancate(i, back) {
    const r = R[i], L = AFFLOC[r.id], a = AFF[r.s];
    const esito = a ? fact("Esito del tratto", esc(a.txt), a.src, a.st) : "";
    if (L) return openSheet(shHead("Linee affiancate", `partono da ${r.n}`, back ? "loc:" + i : null) + `<div class="menu">${L.map((l, k) => `<button class="item" type="button" data-sig="${i}:${k}"><span>${esc(l.linea)}<br><small>${esc(l.tratto)} · ${esc(l.fl)}</small></span><span class="ind">${esc(l.ind)}</span></button>`).join("")}</div>` + esito);
    let corpo, nota;
    if (!a) {
      corpo = stItem("Linee affiancate del tratto", "linee affiancate", i);
      nota = "Dato non ancora studiato: l'assenza del quadrato A non significa che non ci siano linee affiancate.";
    } else if (a.esito === "nessuna") {
      corpo = esito; nota = "Secondo la fonte indicata, nel tratto non ci sono linee affiancate percorribili.";
    } else if (a.esito === "presenti") {
      corpo = esito; nota = "Il tratto ha linee affiancate, ma nei dati studiati nessuna parte da questa località.";
    } else if (a.esito === "non_verificabile") {
      corpo = esito + stItem("Linee affiancate del tratto", "linee affiancate", i);
      nota = "Con i documenti disponibili non si può stabilire se ci siano linee affiancate.";
    } else {
      corpo = esito; nota = "Esito riportato solo come testo (pacchetto senza esito codificato): leggi descrizione e fonte.";
    }
    openSheet(shHead("Linee affiancate", `da ${r.n}`, back ? "loc:" + i : null) + corpo + `<div class="note">${nota}</div>`);
  }
  function colTbl(lbl, b) {
    return `<h3 class="grp">${esc(lbl)}</h3><div class="note">${esc(b.sez)}</div><div class="stbl-wrap"><table class="stbl"><thead><tr><th>Località</th><th>Km</th><th>Rs</th><th>NoRS</th></tr></thead><tbody>${b.rows.map(x => `<tr><td class="loc">${esc(x[0])}</td><td>${esc(x[1])}</td><td class="${x[4] ? "new" : "cont"}">${esc(x[2])}</td><td class="${x[4] ? "new" : "cont"}">${esc(x[3])}</td></tr>`).join("")}</tbody></table></div><div class="note">${esc(b.pag)}</div>`;
  }
  function sigle(i, k) {
    const r = R[i], l = AFFLOC[r.id][k], sg = l.sigle || [];
    if (l.colonna) {
      const c = l.colonna;
      return openSheet(shHead(l.linea, `Sigle Complementari · ${l.tratto}`, null) +
        `<div class="sh-top"><div><div class="sigla-big">Sigla ${esc(c.sigla)}</div><div class="sh-sub">${esc(c.tit)} · indicatore ${esc(l.ind)} a ${esc(r.n)}</div></div></div>` +
        (l.nota ? fact("Colonna scelta", esc(l.nota), "Sigla di composizione e gruppo del treno", "V") : "") +
        colTbl("Binario legale o di sinistra", c.sx) + colTbl("Binario illegale o di destra", c.dx) +
        (c.nota ? `<div class="note">${esc(c.nota)}</div>` : "") +
        sg.map(x => fact(x.t, esc(x.x), x.src, x.st)).join(""));
    }
    openSheet(shHead(l.linea, `Sigle Complementari · ${l.tratto}`, null) + (l.nota ? fact("Colonna scelta", esc(l.nota), "", "R") : "") +
      (sg.length ? sg.map(x => fact(x.t, esc(x.x), x.src, x.st)).join("") : "") +
      stItem("Colonna delle Sigle Complementari", "fiancata delle Sigle Complementari per la linea affiancata " + l.linea + " (" + l.tratto + ")", i));
  }
  function loco(k) {
    const L = P.intestazione.loco[k], tipo = L.tipo, multi = P.intestazione.loco.length > 1;
    const rows = LOCO.filter(l => !multi || !l.loco || l.loco === tipo);
    openSheet(shHead(`${tipo} · compatibilità`, L.tratti ? "Tratti " + L.tratti.join(", ") : "") + rows.map(l => fact(l.t, esc(l.x), l.src, l.st)).join("") +
      `<div class="note">Le limitazioni di compatibilità non sono comprese nelle velocità della Scheda Treno: le prescrive il formatore con M40 Tecnico. Con locomotiva isolata vanno rispettate d'iniziativa.</div>`);
  }
  function presc() {
    const Q = PRESC;
    if (!Q) return openSheet(shHead("Prescrizioni di movimento", "") + `<div class="note">Le prescrizioni non sono nel pacchetto. Questo non significa che non ce ne siano: fanno fede i moduli ricevuti.</div>`);
    const isOut = s => Q.fuori.some(f => String(s).toUpperCase().includes(f.toUpperCase()));
    const isIn = s => Q.dentro.some(f => String(s).toUpperCase().includes(f.toUpperCase()));
    const nota = (m, codes) => String(codes || "").split("/").map(c => m.note && m.note[c] ? `<div class="pnote"><b>${esc(c)})</b> ${esc(m.note[c])}</div>` : "").join("");
    const riga = (m, x) => {
      if (!Array.isArray(x)) return `<h3 class="grp">${esc(x.sub)}</h3>`;
      const dentro = isIn(x[1]) || isIn(x[2]); const fuori = !dentro && (isOut(x[1]) || isOut(x[2]));
      return `<div class="prow${dentro ? " pin" : ""}${fuori ? " pout" : ""}"><div class="ptop"><span class="pnum">${esc(x[0])}</span><span class="pvel">${esc(x[4])}<small> km/h</small></span><span class="plen">${esc(x[5])} m</span><span class="pkm">dopo cippo km ${esc(x[3])}</span></div>
        <div class="pbin"><span><small>Sinistro / legale</small>${esc(x[1])}</span><span><small>Destro / illegale</small>${esc(x[2])}</span></div>
        ${dentro ? `<div class="note"><b>Nel tratto studiato</b></div>` : ""}${fuori ? `<div class="note">${esc(Q.fuoriNota || "fuori dal tratto studiato")}</div>` : ""}${nota(m, x[6])}</div>`;
    };
    const avv = a => { const fuori = isOut(a.loc); return `<div class="prow${fuori ? " pout" : ""}"><div class="ploc">${esc(a.loc)}</div><div class="pnote"><b>${esc(a.tit)}</b></div><div class="ptxt">${esc(a.txt)}</div>${fuori ? `<div class="note">${esc(Q.fuoriNota || "")}</div>` : ""}</div>`; };
    const mod = m => `<h3 class="grp">${esc(m.tipo)} n. ${esc(m.n)}</h3><div class="note">${esc(m.linea)} · consegnato a ${esc(m.stazione)} · ${esc(m.data)}</div>${(m.righe || []).map(x => riga(m, x)).join("")}${(m.avvisi || []).map(avv).join("")}`;
    openSheet(shHead("Prescrizioni di movimento", `Riepilogo n. ${Q.riep.n} · ${Q.riep.tratto}`) +
      fact("Moduli consegnati", esc(Q.riep.consegnati), Q.src, "V") + Q.moduli.map(mod).join("") +
      `<div class="note">Trascrizione dei moduli ricevuti; le righe fuori dal tratto studiato sono attenuate. In servizio fanno fede i moduli originali.</div>`);
  }
  // STUDIO LINEA FORMAZIONE
  // D03 – la nota del dato (condizioni, eccezioni) resta sempre visibile accanto al valore.
  function dcell(d) { return d ? `<span class="dot d-${ST(d.st)}"></span>${esc(d.v ?? "—")}${d.nota ? `<div class="dnota">${esc(d.nota)}</div>` : ""}` : `<span class="note">—</span>`; }
  function formazione() {
    const F = P.formazione;
    const srcs = [];
    const tr = F.tratti.map(t => {
      ["codifica_tc", "d4", "frenatura", "gdp"].forEach(k => t[k] && t[k].src && srcs.push(`${t.da}–${t.a} · ${k === "codifica_tc" ? "codifica" : k}: ${t[k].src}`));
      return `<tr><td class="loc">${esc(t.da)} – ${esc(t.a)}${t.affiancata ? `<br><span class="ind">affiancata</span>` : ""}<div class="note">${esc(t.linea)}${t.fl ? " · " + esc(t.fl) : ""}</div></td><td>${dcell(t.codifica_tc)}</td><td>${dcell(t.d4)}</td><td>${dcell(t.frenatura)}</td><td>${dcell(t.gdp)}</td></tr>`;
    }).join("");
    const pm = F.prestazione_massima.map(x => fact(`${x.loco} · GDP ${x.gdp}`, `${x.t != null ? `<b>${esc(x.t)} t</b> · ` : ""}${esc(x.dove)}`, x.src, x.st)).join("");
    const pg = F.pgos;
    // D13 – provenienza della massa: fornita da te o ricavata dai documenti del treno (M18, M40 Tecnico…), mai dalla Prestazione della Scheda Treno.
    const massaFact = pg => {
      if (pg.massa_t == null) return fact("Massa del treno", "non fornita: controlli non eseguibili", "La Prestazione della Scheda Treno non si usa", "N");
      const o = pg.massa_origine;
      const lbl = o === "utente" ? "Massa del treno (fornita da te)" : o === "documenti" ? "Massa del treno (dai documenti del treno)" : "Massa del treno (origine non indicata)";
      const st = o === "utente" ? "V" : o === "documenti" ? ST(pg.massa_st || "I") : "I";
      return fact(lbl, `<b>${esc(pg.massa_t)} t</b>`, pg.massa_fonte || (o === "documenti" ? "documento non indicato" : ""), st);
    };
    const pgos = `<h3 class="grp">Controlli PGOS</h3>` +
      massaFact(pg) +
      pg.controlli.map(c => fact(`${c.t} · ${{ ok: "OK", non_ok: "NON OK", attenzione: "ATTENZIONE", non_eseguibile: "non eseguibile" }[c.esito]}`, esc(c.x || ""), c.src, c.esito === "non_ok" ? "R" : c.st)).join("") +
      (pg.nota ? `<div class="note">${esc(pg.nota)}</div>` : "");
    const S = F.staffe;
    const staffe = S ? `<h3 class="grp">Staffe di immobilizzazione</h3>` +
      fact("Pendenza massima del percorso", dcell(S.pendenza_max), S.pendenza_max.src, S.pendenza_max.st) +
      fact("Grado di frenatura più gravoso", dcell(S.grado_gravoso), S.grado_gravoso.src, S.grado_gravoso.st) +
      (S.tab36_min ? fact("Tab. 36 – % minima", dcell(S.tab36_min), S.tab36_min.src, S.tab36_min.st) : "") +
      fact("Esito", esc({ ok: "OK", non_ok: "NON OK", non_eseguibile: "non eseguibile" }[S.esito] + (S.x ? " – " + S.x : "")), S.src || "", S.esito === "ok" ? "V" : "N") : "";
    // Dati mancanti per staffe o PGOS: si possono mandare i documenti del treno.
    const manca = pg.massa_t == null || (S && S.esito === "non_eseguibile") || pg.controlli.some(c => c.esito === "non_eseguibile");
    openSheet(shHead("Studio linea formazione", P.intestazione.percorso) +
      `<h3 class="grp">Per tratto</h3><div class="stbl-wrap"><table class="stbl"><thead><tr><th>Tratto</th><th>Codifica</th><th>D4</th><th>Fren.</th><th>GDP</th></tr></thead><tbody>${tr}</tbody></table></div>` +
      `<h3 class="grp">Prestazione massima</h3>${pm || `<div class="note">Non studiata.</div>`}` + pgos + staffe +
      (manca ? docBox(TRENO) : `<details class="docmore"><summary>Allega altri documenti del treno</summary>${docBox(TRENO)}</details>`) +
      `<h3 class="grp">Fonti per tratto</h3>${srcs.map(s => `<div class="note">${esc(s)}</div>`).join("")}`);
  }
  function aperti() {
    const A = P.aperti || [];
    const lab = { da_studiare: "da studiare", attesa_scheda_treno: "in attesa della Scheda Treno", attesa_massa_treno: "serve la massa del treno", fl_mancante: "FL mancante", illeggibile: "documento illeggibile" };
    const serveDoc = A.some(a => a.motivo === "attesa_massa_treno");
    openSheet(shHead("Da studiare", `${A.length} punti aperti`) + `<div class="menu">${A.map(a => `<div class="item row-st"><span>${esc(a.cosa)}<br><small>${esc(lab[a.motivo] || "da studiare")}</small></span><button class="studia" type="button" data-req="${esc(a.richiesta)}">Studia</button></div>`).join("")}</div>
      ${serveDoc ? docBox(TRENO) : ""}
      <div class="note">Studia invia la richiesta a Claude. Poi importa il pacchetto aggiornato: sostituisce questa revisione.</div>`);
  }
  // Riquadro "Allega documenti del treno": M18, BFC ecc. per massa, freni a mano e staffe.
  function docBox(treno) {
    return `<div class="docbox"><div class="docbox-t"><b>Allega documenti del treno</b>
      <small>M18, BFC, M40 Tecnico, lista carri: PDF o foto. Claude ne ricava massa rimorchiata, massa frenata a mano, % di carri carichi e massa assiale minima dei vuoti, poi fa il calcolo delle staffe e i controlli PGOS.</small></div>
      <label class="btn file-btn">Scegli documenti<input type="file" class="fDoc" accept="application/pdf,.pdf,image/*" multiple hidden data-treno="${esc(treno)}"></label>
      <div class="doclist note" hidden></div>
      <button class="btn primary" type="button" data-docsend="1" hidden>Invia a Claude<small>Studio delle staffe con i documenti scelti</small></button></div>`;
  }
  // Fumetto con la pagina del FL
  const POP = { d: null, k: 0, z: 1 };
  function popShow() {
    const d = POP.d, p = d.pag[POP.k], url = IMG[p.img];
    $("#popSrc").textContent = p.src;
    $("#popTabs").innerHTML = d.pag.length > 1 ? d.pag.map((x, k) => `<button class="tab" type="button" data-tab="${k}" aria-pressed="${k === POP.k}">${esc(x.t)}</button>`).join("") : `<span class="pop-note"><b>${esc(p.t)}</b></span>`;
    const img = $("#popImg"), miss = $("#popMiss");
    img.hidden = !url; miss.hidden = !!url;
    if (url) { img.src = url; img.alt = d.titolo + " – " + p.t; img.style.width = (POP.z * 100) + "%"; }
    else miss.textContent = "Pagina non presente nel pacchetto (" + p.img + "). Chiedi a Claude di ripubblicare il pacchetto con le pagine del FL.";
    $("#zVal").textContent = Math.round(POP.z * 100) + "%";
  }
  function popOpen(kind, i) {
    const r = R[i]; POP.d = pagFL(r.id, kind); POP.k = 0; POP.z = 1;
    $("#popTitle").textContent = `${POP.d.titolo} · ${r.n}`; $("#popNote").textContent = POP.d.nota || "";
    popShow(); $("#popBody").scrollTo(0, 0); $("#pop").hidden = false; $("#popScrim").hidden = false; $("#popClose").focus();
  }
  function popClose() { $("#pop").hidden = true; $("#popScrim").hidden = true; }
  function popZoom(f) {
    const b = $("#popBody"), cx = (b.scrollLeft + b.clientWidth / 2) / b.scrollWidth, cy = (b.scrollTop + b.clientHeight / 2) / b.scrollHeight;
    POP.z = Math.min(4, Math.max(1, Math.round(POP.z * f * 100) / 100)); popShow();
    requestAnimationFrame(() => { b.scrollLeft = cx * b.scrollWidth - b.clientWidth / 2; b.scrollTop = cy * b.scrollHeight - b.clientHeight / 2; });
  }

  // Ritorna true se il tocco riguarda la scheda.
  function click(t) {
    const d = t.dataset;
    if (d.m3 !== undefined) {
      const notes = $("#m3-note-" + d.m3);
      if (notes) { notes.hidden = !notes.hidden; t.setAttribute("aria-expanded", String(!notes.hidden)); }
      return true;
    }
    if (d.pg) return popOpen(d.pg, +d.i), true;
    if (d.a) return affiancate(+d.a, false), true;
    if (d.sig) { const [a, b] = d.sig.split(":"); return sigle(+a, +b), true; }
    if (t.id === "popClose") return popClose(), true;
    if (d.tab) { POP.k = +d.tab; POP.z = 1; popShow(); $("#popBody").scrollTo(0, 0); return true; }
    if (t.id === "zIn") return popZoom(1.5), true;
    if (t.id === "zOut") return popZoom(1 / 1.5), true;
    if (d.presc) return presc(), true;
    if (d.form) return formazione(), true;
    if (d.aperti) return aperti(), true;
    if (d.loco) return loco(+d.loco), true;
    if (t.matches(".row.loc .name button")) return locMenu(+d.i), true;
    if (d.back) return locMenu(+d.back.split(":")[1]), true;
    if (d.act === "fianc") return fiancata(+d.i), true;
    if (d.act === "ind") return indicatori(+d.i), true;
    if (d.act === "pl") return plprot(+d.i), true;
    if (d.act === "tel") return utenze(+d.i), true;
    if (d.act === "aff") return affiancate(+d.i, true), true;
    return false;
  }
  return { show, click, popClose, docBox, marcaRiga, popOpenVisible: () => !$("#pop").hidden };
})();
