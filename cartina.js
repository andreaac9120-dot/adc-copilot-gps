// Cartina delle linee (1.0.44): vista. Il modello (tutta la logica di estrazione) sta in motore/cartina_modello.js.
// Disegno su canvas scritto a mano: nessuna libreria, nessun servizio di mappe, funziona offline.
// Coordinate: solo tabella geo con stato V (le filtra il modello). Il disegno unisce le località in ordine di
// progressiva con segmenti diritti: è uno schema di orientamento, non il tracciato reale dei binari.
const Cartina = (() => {
  "use strict";
  const RAD = Math.PI / 180;
  const TOCCO = 14;            // px: metà della fascia sensibile al tocco (28 px in tutto)
  const S = {
    conf: null, contorno: null, T: null, info: null, M: null, chiave: null, rip: new Map(),
    P: new Map(), linee: [], paesi: null, vis: [], sel: null, col: null, det: [], img: [], imgURL: [],
    cv: null, ctx: null, W: 0, H: 0, dpr: 1, V: null, fitS: 1, raf: 0, montata: false, linea: null,
    pos: null, posWatch: null, posCentra: false
  };
  const KX = Math.cos(44.5 * RAD);
  const wx = lon => lon * KX, wy = lat => -lat;

  // ---------- Dati ----------
  async function risorse() {
    if (!S.conf) { try { const r = await fetch("cartina/config.json"); S.conf = r.ok ? await r.json() : {}; } catch (_) { S.conf = {}; } }
    if (S.contorno === null) { try { const r = await fetch("cartina/contorno_italia.json"); S.contorno = r.ok ? await r.json() : false; } catch (_) { S.contorno = false; } }
  }
  // Il modello si ricostruisce quando il database cambia (impronta + data di importazione), altrimenti resta in memoria.
  async function dati() {
    let info = null;
    try { info = await DB.getConf("adcdb_info"); } catch (_) {}
    const chiave = info ? `${info.sha256}|${info.importato}` : null;
    if (S.M && chiave && chiave === S.chiave) return "uguale";
    let T = null;
    try { T = await DB.getConf("adcdb"); } catch (_) {}
    if (!T) { S.M = null; S.T = null; S.chiave = null; return false; }
    // Le Sigle (la parte più grande) non servono alla cartina: non restano in memoria
    S.T = Object.assign({}, T, { sigle: [], accesso_sigle: [] }); T = null;
    S.info = info; S.chiave = chiave;
    S.M = CartinaModello.costruisci(S.T, S.conf);
    S.rip.clear();
    prepara();
    return "nuovo";
  }
  function prepara() {
    S.P = new Map(S.M.localita.map(l => [l.loc_id, [wx(l.lon), wy(l.lat)]]));
    S.linee = S.M.linee.map(l => {
      const pts = l.sequenza.map(id => S.P.get(id));
      return Object.assign({}, l, { pts, wb: [wx(l.bbox[0]), wy(l.bbox[3]), wx(l.bbox[2]), wy(l.bbox[1])] });
    });
    S.perId = new Map(S.linee.map(l => [l.linea_id, l]));
    S.tutte = new Map(S.M.senza_coordinate.concat(S.linee).map(l => [l.linea_id, l]));
    // giunzioni senza coordinate (es. cippo di cambio di progressiva): collegamento tratteggiato fra due linee
    S.coll = (S.M.collegamenti || []).filter(g => S.P.has(g.da) && S.P.has(g.a)).map(g => Object.assign({}, g, { pts: [S.P.get(g.da), S.P.get(g.a)] }));
    S.locPer = new Map(S.M.localita.map(l => [l.loc_id, l]));
    if (S.contorno && !S.paesi && typeof Path2D !== "undefined") {
      S.paesi = S.contorno.paesi.map(p => {
        const path = new Path2D();
        for (const a of p.anelli) { a.forEach(([lo, la], i) => (i ? path.lineTo(wx(lo), wy(la)) : path.moveTo(wx(lo), wy(la)))); path.closePath(); }
        return { iso: p.iso, path };
      });
    }
    S.coloreComp = null; S.col = null;
  }
  function riep(id) {
    if (!S.rip.has(id)) S.rip.set(id, CartinaModello.riepilogo(S.T, id));
    return S.rip.get(id);
  }

  // ---------- Colori (tema dell'app) ----------
  const scuro = () => { const a = document.documentElement.getAttribute("data-theme"); return a === "dark" || (a !== "light" && matchMedia("(prefers-color-scheme: dark)").matches); };
  function colori() {
    if (S.col) return S.col;
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    const sc = scuro(), tema = sc ? "scuro" : "chiaro", cc = (S.conf.colori || {});
    const fissi = cc[tema] || {}, riserva = ((cc.riserva || {})[tema]) || ["#777"];
    const comp = {}; let k = 0;
    for (const c of (S.M ? S.M.compartimenti : [])) comp[c.id] = fissi[c.id] || riserva[k++ % riserva.length];
    S.col = { sc, comp, mare: v("--bg"), terra: v("--paper"), estero: v("--paper-alt"), confine: v("--rule-strong"), ink: v("--ink"), muted: v("--muted"), alone: v("--paper") };
    return S.col;
  }
  const coloreLinea = l => colori().comp[l.compartimento] || "#777";

  // ---------- Montaggio della vista ----------
  function monta() {
    if (S.montata) return;
    S.montata = true;
    S.cv = $("#cCanvas"); S.ctx = S.cv.getContext("2d");
    new ResizeObserver(() => dimensiona()).observe($("#cWrap"));
    gesti(S.cv, {
      stato: () => S.V,
      limiti: () => [S.fitS * 0.6, S.fitS * 250],
      cambia: () => ridisegna(),
      tocco: (x, y) => tocca(x, y),
      doppio: (x, y) => zoomA(x, y, 2)
    });
    S.cv.addEventListener("wheel", e => { e.preventDefault(); const r = S.cv.getBoundingClientRect(); zoomA(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    new MutationObserver(() => { S.col = null; ridisegna(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { S.col = null; ridisegna(); });
    const leg = $("#cLeg");
    let pref = null;
    try { pref = localStorage.getItem("adc-cartina-legenda"); } catch (_) {}
    leg.open = pref ? pref === "aperta" : innerWidth >= 700;   // sul telefono parte chiusa
    leg.addEventListener("toggle", () => { try { localStorage.setItem("adc-cartina-legenda", leg.open ? "aperta" : "chiusa"); } catch (_) {} });
  }
  function dimensiona() {
    const w = $("#cWrap"), r = w.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vecchio = S.W ? [S.W, S.H] : null;
    S.W = r.width; S.H = r.height; S.dpr = dpr;
    S.cv.width = Math.round(r.width * dpr); S.cv.height = Math.round(r.height * dpr);
    S.cv.style.width = r.width + "px"; S.cv.style.height = r.height + "px";
    if (!S.V) ricentra(); else if (vecchio) { S.V.tx += (S.W - vecchio[0]) / 2; S.V.ty += (S.H - vecchio[1]) / 2; }
    ridisegna();
  }
  function ricentra() {
    const bb = S.M && S.M.bbox;
    const b = bb ? [wx(bb[0]), wy(bb[3]), wx(bb[2]), wy(bb[1])] : [wx(6.6), wy(47.1), wx(18.5), wy(36.6)];
    const padT = 16, padB = 64, padX = 16;
    const s = Math.min((S.W - 2 * padX) / Math.max(b[2] - b[0], 0.01), (S.H - padT - padB) / Math.max(b[3] - b[1], 0.01));
    S.fitS = s;
    S.V = { s, tx: S.W / 2 - s * (b[0] + b[2]) / 2, ty: padT + (S.H - padT - padB) / 2 - s * (b[1] + b[3]) / 2 };
  }
  function zoomA(x, y, f) {
    const V = S.V, s = Math.min(S.fitS * 250, Math.max(S.fitS * 0.6, V.s * f)), k = s / V.s;
    V.tx = x - (x - V.tx) * k; V.ty = y - (y - V.ty) * k; V.s = s;
    ridisegna();
  }
  const ridisegna = () => { if (!S.raf && S.ctx) S.raf = requestAnimationFrame(disegna); };

  // ---------- Disegno ----------
  function larghezza() { const z = S.V.s / S.fitS; return z < 2 ? 2.4 : z < 6 ? 3 : 3.6; }
  function puntiSchermo(l, w) {
    const { s, tx, ty } = S.V;
    const sp = l.pts.map(([x, y]) => [x * s + tx, y * s + ty]);
    const off = l.scostamento * (w + 1.6);
    if (!off) return sp;
    // scostamento parallelo: normale media ai vertici, limitata nei gomiti stretti
    const n = sp.length, nor = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = sp[i + 1][0] - sp[i][0], dy = sp[i + 1][1] - sp[i][1], d = Math.hypot(dx, dy) || 1;
      nor.push([-dy / d, dx / d]);
    }
    return sp.map((p, i) => {
      const a = nor[Math.max(0, i - 1)], b = nor[Math.min(n - 2, i)];
      let mx = a[0] + b[0], my = a[1] + b[1]; const m = Math.hypot(mx, my);
      if (m < 1e-6) { mx = b[0]; my = b[1]; } else { mx /= m; my /= m; }
      const cos = Math.max(0.5, mx * b[0] + my * b[1]);
      return [p[0] + mx * off / cos, p[1] + my * off / cos];
    });
  }
  function tracciaPath(ctx, l, pts, tipo) {
    ctx.beginPath(); let aperto = false;
    l.tratti.forEach((t, k) => {
      if (t.tipo !== tipo) { aperto = false; return; }
      if (!aperto) ctx.moveTo(pts[k][0], pts[k][1]);
      ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); aperto = true;
    });
  }
  function disegna() {
    S.raf = 0;
    if (!S.V || !S.M) return;
    const ctx = S.ctx, c = colori(), { s, tx, ty } = S.V, W = S.W, H = S.H;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = c.mare; ctx.fillRect(0, 0, W, H);
    if (S.paesi) {
      ctx.save(); ctx.setTransform(S.dpr * s, 0, 0, S.dpr * s, S.dpr * tx, S.dpr * ty);
      for (const p of S.paesi) { ctx.fillStyle = p.iso === "ITA" ? c.terra : c.estero; ctx.fill(p.path, "evenodd"); }
      ctx.lineWidth = 1 / s; ctx.strokeStyle = c.confine; ctx.globalAlpha = 0.7;
      for (const p of S.paesi) ctx.stroke(p.path);
      ctx.restore();
    }
    // linee visibili
    const w = larghezza(), x0 = -tx / s, y0 = -ty / s, x1 = (W - tx) / s, y1 = (H - ty) / s, m = 30 / s;
    S.vis = [];
    for (const l of S.linee) {
      if (l.wb[2] < x0 - m || l.wb[0] > x1 + m || l.wb[3] < y0 - m || l.wb[1] > y1 + m) continue;
      S.vis.push([l, puntiSchermo(l, w)]);
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // 1) bordo chiaro sotto ogni linea, così le linee vicine restano distinte
    ctx.strokeStyle = c.alone; ctx.lineWidth = w + 2.4;
    for (const [l, p] of S.vis) {
      ctx.setLineDash([]); tracciaPath(ctx, l, p, "pieno"); ctx.stroke();
      ctx.setLineDash([w * 2.2, w * 1.8]); tracciaPath(ctx, l, p, "tratteggiato"); ctx.stroke();
    }
    // 2) colore del compartimento; tratteggio = collegamento indicativo (località intermedie senza coordinate)
    for (const [l, p] of S.vis) {
      if (S.sel === l.linea_id) continue;
      ctx.strokeStyle = coloreLinea(l); ctx.lineWidth = w;
      ctx.setLineDash([]); tracciaPath(ctx, l, p, "pieno"); ctx.stroke();
      ctx.setLineDash([w * 2.2, w * 1.8]); tracciaPath(ctx, l, p, "tratteggiato"); ctx.stroke();
      if (l.st !== "V") {   // linea con stato R/I/N: riga chiara al centro
        ctx.strokeStyle = c.alone; ctx.lineWidth = Math.max(0.9, w * 0.34); ctx.setLineDash([]);
        tracciaPath(ctx, l, p, "pieno"); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // 2b) collegamenti fra due linee che si toccano in un punto senza coordinate: sempre tratteggiati
    S.visColl = [];
    for (const g of S.coll || []) {
      const p = g.pts.map(([x, y]) => [x * s + tx, y * s + ty]);
      S.visColl.push([g, p]);
      const la = S.tutte.get(g.linee[0]) || { compartimento: null }, lb = S.tutte.get(g.linee[1]) || { compartimento: null };
      const evid = g.linee.includes(S.sel);
      ctx.setLineDash([w * 2.2, w * 1.8]);
      ctx.strokeStyle = c.alone; ctx.lineWidth = w + 2.4; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.stroke();
      ctx.strokeStyle = la.compartimento === lb.compartimento ? coloreLinea(la) : c.muted; ctx.lineWidth = evid ? w + 2.2 : w; ctx.stroke();
      ctx.setLineDash([]);
    }
    // 3) linea selezionata, sopra le altre
    const sel = S.vis.find(([l]) => l.linea_id === S.sel);
    if (sel) {
      const [l, p] = sel;
      ctx.strokeStyle = c.ink; ctx.globalAlpha = 0.28; ctx.lineWidth = w + 9;
      tracciaPath(ctx, l, p, "pieno"); ctx.stroke(); tracciaPath(ctx, l, p, "tratteggiato"); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = coloreLinea(l); ctx.lineWidth = w + 2.2;
      tracciaPath(ctx, l, p, "pieno"); ctx.stroke();
      ctx.setLineDash([w * 2.2, w * 1.8]); tracciaPath(ctx, l, p, "tratteggiato"); ctx.stroke(); ctx.setLineDash([]);
    }
    etichette(ctx, c, x0, y0, x1, y1);
    disegnaPos(ctx);
  }
  // Località: punti e nomi per priorità, più zoom = più località, senza sovrapporsi
  function etichette(ctx, c, x0, y0, x1, y1) {
    const { s, tx, ty } = S.V, sl = s * KX;   // pixel per grado di longitudine
    const E = (S.conf && S.conf.etichette) || {};
    const lmax = sl >= (E.scala_livello_2 || 900) ? 2 : sl >= (E.scala_livello_1 || 260) ? 1 : 0;
    // i pulsanti sopra la cartina sono ostacoli: nessun nome sotto di loro
    const wr = $("#cWrap").getBoundingClientRect();
    const occupati = ["#cElenco", ".carta-tools", "#cLeg"].map(q => $(q)).filter(e => e && !e.hidden)
      .map(e => { const r = e.getBoundingClientRect(); return [r.left - wr.left - 4, r.top - wr.top - 4, r.right - wr.left + 4, r.bottom - wr.top + 4]; });
    const libero = r => !occupati.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
    let n = 0;
    for (const l of S.M.localita) {
      if (l.livello > lmax) { if (l.livello === 3) continue; break; }
      const [wxp, wyp] = S.P.get(l.loc_id);
      if (wxp < x0 || wxp > x1 || wyp < y0 || wyp > y1) continue;
      const x = wxp * s + tx, y = wyp * s + ty, r = l.livello === 0 ? 4 : 2.6;
      const punto = () => { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = c.alone; ctx.fill(); ctx.lineWidth = l.livello === 0 ? 2 : 1.4; ctx.strokeStyle = c.ink; ctx.stroke(); };
      // a zoom basso solo le località con il nome; più vicino tutte quelle del livello visibile
      const tutti = S.V.s / S.fitS >= 3;
      if (tutti) punto();
      if (n > 260) continue;
      const fs = l.livello === 0 ? 13 : 12;
      ctx.font = `${l.livello === 0 ? 700 : 600} ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
      const tw = ctx.measureText(l.nome).width, h = fs + 2;
      const prove = [[x + r + 4, y - h / 2], [x - r - 4 - tw, y - h / 2], [x - tw / 2, y - r - 3 - h], [x - tw / 2, y + r + 3]];
      for (const [lx, ly] of prove) {
        const rect = [lx - 2, ly - 1, lx + tw + 2, ly + h + 1];
        if (rect[0] < 2 || rect[2] > S.W - 2 || rect[1] < 2 || rect[3] > S.H - 2 || !libero(rect)) continue;
        occupati.push(rect, [x - r, y - r, x + r, y + r]); n++;
        if (!tutti) punto();
        ctx.textBaseline = "top"; ctx.lineJoin = "round"; ctx.lineWidth = 3.6; ctx.strokeStyle = c.alone; ctx.strokeText(l.nome, lx, ly + 1);
        ctx.fillStyle = l.livello === 0 ? c.ink : c.muted; ctx.fillText(l.nome, lx, ly + 1);
        break;
      }
    }
  }

  // ---------- La mia posizione (GPS del telefono) ----------
  // Solo in memoria finché la cartina è aperta: nessuna posizione viene salvata. Si spegne uscendo dalla cartina.
  const BLU = "#1a73e8";
  function disegnaPos(ctx) {
    if (!S.pos) return;
    const { s, tx, ty } = S.V, x = wx(S.pos.lon) * s + tx, y = wy(S.pos.lat) * s + ty;
    const r = Math.max(0, S.pos.acc / 111320 * s);   // metri → gradi di latitudine → pixel
    if (r > 9) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(26,115,232,.15)"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(26,115,232,.55)"; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = BLU; ctx.fill();
  }
  function pulsantePos() {
    const b = $("#cPos"); if (!b) return;
    const on = S.posWatch !== null;
    b.classList.toggle("on", on && !!S.pos);
    b.classList.toggle("attesa", on && !S.pos);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function centraPos() {
    if (!S.pos || !S.V) return;
    const s = Math.max(S.V.s, S.fitS * 12);   // abbastanza vicino da vedere le località attorno
    S.V.s = s;
    S.V.tx = S.W / 2 - wx(S.pos.lon) * s;
    S.V.ty = S.H / 2 - wy(S.pos.lat) * s;
    ridisegna();
  }
  function fermaPos() {
    if (S.posWatch !== null && navigator.geolocation) { try { navigator.geolocation.clearWatch(S.posWatch); } catch (_) {} }
    S.posWatch = null; S.pos = null; S.posCentra = false;
    pulsantePos(); ridisegna();
  }
  function miaPosizione() {
    if (S.posWatch !== null) {   // già attivo: ricentra sulla posizione
      if (S.pos) centraPos(); else toast("Sto cercando la posizione…");
      return;
    }
    if (!navigator.geolocation || !window.isSecureContext) return toast("Posizione non disponibile su questo dispositivo o browser");
    S.posCentra = true;
    try {
      S.posWatch = navigator.geolocation.watchPosition(p => {
        const c = p.coords;
        S.pos = { lat: c.latitude, lon: c.longitude, acc: Number.isFinite(c.accuracy) ? c.accuracy : 0 };
        if (S.posCentra) { S.posCentra = false; centraPos(); } else ridisegna();
        pulsantePos();
      }, e => {
        const m = e && e.code === 1 ? "Permesso negato: abilita la Posizione per questa app nelle impostazioni del telefono/Chrome" :
          e && e.code === 3 ? "Posizione non trovata in tempo: riprova all'aperto" : "Posizione non disponibile: controlla che il GPS sia acceso";
        toast(m);
        if (!S.pos || (e && e.code === 1)) fermaPos();
      }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    } catch (_) { S.posWatch = null; toast("Posizione non disponibile"); }
    pulsantePos();
    if (S.posWatch !== null) toast("Cerco la tua posizione…");
  }

  // ---------- Tocco sulla cartina ----------
  function distSeg(x, y, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d2 = dx * dx + dy * dy;
    const t = d2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / d2)) : 0;
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  }
  function tocca(x, y) {
    const hit = [];
    for (const [l, p] of S.vis) {
      let d = Infinity;
      for (let k = 0; k < p.length - 1; k++) d = Math.min(d, distSeg(x, y, p[k], p[k + 1]));
      if (d <= TOCCO) hit.push([d, l]);
    }
    // un collegamento tra due linee le propone entrambe
    for (const [g, p] of S.visColl || []) {
      const d = distSeg(x, y, p[0], p[1]);
      if (d > TOCCO) continue;
      for (const id of g.linee) { const l = S.tutte.get(id); if (l && !hit.some(h => h[1] === l)) hit.push([d, l]); }
    }
    if (!hit.length) { if (S.sel) { S.sel = null; ridisegna(); } return; }
    hit.sort((a, b) => a[0] - b[0] || (a[1].linea_id < b[1].linea_id ? -1 : 1));
    if (hit.length === 1) { S.sel = hit[0][1].linea_id; ridisegna(); return apriLinea(S.sel); }
    S.sel = hit[0][1].linea_id; ridisegna();
    openSheet(shHead("Quale linea?", `${hit.length} linee nel punto toccato`) +
      `<div class="c-lista">${hit.map(([, l]) => vocLinea(l)).join("")}</div>`);
  }
  function vocLinea(l, extra) {
    return `<button class="c-voce" type="button" data-cl="${esc(l.linea_id)}"><span class="c-sw" style="background:${coloreLinea(l)}"></span>` +
      `<span><b>${esc(l.nome_breve)}</b> <small>${esc(l.compartimento)}</small><br><small>${esc(l.nome)}${extra ? " · " + esc(extra) : ""}</small></span><span class="dot d-${ST(l.st)}" title="stato ${ST(l.st)}"></span></button>`;
  }
  function elenco() {
    const sc = S.M.senza_coordinate, tutte = S.M.linee.concat(sc).slice().sort((a, b) => (a.nome_breve < b.nome_breve ? -1 : a.nome_breve > b.nome_breve ? 1 : 0));
    openSheet(shHead("Elenco linee", `${S.M.conteggi.linee} linee nel database · ${S.M.conteggi.disegnate} disegnate`) +
      `<h3 class="sub-h">Linee senza coordinate sufficienti (${sc.length})</h3>` +
      (sc.length ? `<p class="note">Non si disegnano: servono almeno due località con coordinate verificate (tabella geo, stato V). La scheda si apre comunque.</p><div class="c-lista">${sc.map(l => vocLinea(l, l.motivo)).join("")}</div>` : `<p class="note">Nessuna.</p>`) +
      `<h3 class="sub-h">Tutte le linee</h3><label class="field"><span>Cerca</span><input type="search" id="cFiltro" autocomplete="off" placeholder="nome, sigla o compartimento"></label>` +
      `<div class="c-lista" id="cTutte">${tutte.map(l => vocLinea(l)).join("")}</div>`);
  }

  // ---------- Gesti: trascinamento, pizzico, doppio tocco ----------
  function gesti(el, o) {
    const ptr = new Map(); let g = null, ultimo = null, attesa = 0;
    const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener("pointerdown", e => {
      el.setPointerCapture?.(e.pointerId);
      ptr.set(e.pointerId, pos(e));
      const V = o.stato();
      if (ptr.size === 1) g = { tipo: "pan", p0: pos(e), t0: performance.now(), mosso: false, tx: V.tx, ty: V.ty };
      else if (ptr.size === 2) {
        const [a, b] = [...ptr.values()];
        g = { tipo: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s0: V.s, tx: V.tx, ty: V.ty, mosso: true };
      }
    });
    el.addEventListener("pointermove", e => {
      if (!ptr.has(e.pointerId) || !g) return;
      ptr.set(e.pointerId, pos(e));
      const V = o.stato();
      if (g.tipo === "pan" && ptr.size === 1) {
        const p = pos(e), dx = p[0] - g.p0[0], dy = p[1] - g.p0[1];
        if (!g.mosso && Math.hypot(dx, dy) < 7) return;
        g.mosso = true; V.tx = g.tx + dx; V.ty = g.ty + dy; o.cambia();
      } else if (g.tipo === "pinch" && ptr.size >= 2) {
        const [a, b] = [...ptr.values()], [mn, mx] = o.limiti();
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const s = Math.min(mx, Math.max(mn, g.s0 * d / g.d0));
        const wx_ = (g.m0[0] - g.tx) / g.s0, wy_ = (g.m0[1] - g.ty) / g.s0;
        V.s = s; V.tx = m[0] - wx_ * s; V.ty = m[1] - wy_ * s; o.cambia();
      }
    });
    const fine = e => {
      if (!ptr.has(e.pointerId)) return;
      const p = ptr.get(e.pointerId); ptr.delete(e.pointerId);
      if (g && g.tipo === "pinch") {
        if (ptr.size === 1) { const V = o.stato(), q = [...ptr.values()][0]; g = { tipo: "pan", p0: q, t0: 0, mosso: true, tx: V.tx, ty: V.ty }; }
        else if (!ptr.size) g = null;
        return;
      }
      if (g && !g.mosso && e.type === "pointerup" && performance.now() - g.t0 < 600) {
        const ora = performance.now();
        if (ultimo && ora - ultimo.t < 300 && Math.hypot(p[0] - ultimo.p[0], p[1] - ultimo.p[1]) < 30) {
          clearTimeout(attesa); ultimo = null; o.doppio && o.doppio(p[0], p[1]);
        } else {
          ultimo = { t: ora, p };
          clearTimeout(attesa);
          attesa = setTimeout(() => { ultimo = null; o.tocco && o.tocco(p[0], p[1]); }, o.doppio ? 260 : 0);
        }
      }
      if (!ptr.size) g = null;
    };
    el.addEventListener("pointerup", fine); el.addEventListener("pointercancel", fine);
  }

  // ---------- Apertura e navigazione ----------
  function mostra(id) { if (typeof vista === "function") return vista(id); for (const v of ["#home", "#viaggio", "#cartina", "#lineaV"]) { const e = $(v); if (e) e.hidden = v !== id; } }
  function nascondi() {
    for (const v of ["#cartina", "#lineaV"]) { const e = $(v); if (e) e.hidden = true; }
    liberaImmagini(); chiudiImg(); fermaPos();
  }
  async function apri(push = true) {
    const t = typeof navNuova === "function" ? navNuova() : 0;
    closeSheet(); chiudiImg();
    if (push && location.hash !== "#cartina") history.pushState({ c: 1 }, "", "#cartina");
    mostra("#cartina"); scrollTo(0, 0);
    monta();
    $("#cInfo").textContent = "Lettura del database…";
    await risorse();
    const ok = await dati();
    if (typeof NAV !== "undefined" && t !== NAV.n) return;
    $("#cVuota").hidden = ok;
    $("#cElenco").hidden = !ok;
    if (!ok) { $("#cInfo").textContent = "Nessun database nel telefono"; S.vis = []; S.ctx && S.ctx.clearRect(0, 0, S.cv.width, S.cv.height); return; }
    const k = S.M.conteggi;
    $("#cInfo").textContent = `${k.disegnate} linee disegnate · ${k.localita_con_coordinate} località con coordinate`;
    $("#cElenco").innerHTML = `Elenco linee<small>${k.senza_coordinate} senza coordinate sufficienti</small>`;
    legenda();
    if (!S.contorno) $("#cNoContorno").hidden = false;
    if (ok === "nuovo") S.V = null;   // database nuovo: si ricentra; altrimenti resta la vista di prima
    dimensiona();
  }
  function legenda() {
    const c = colori();
    $("#cLegComp").innerHTML = S.M.compartimenti.map(x => `<li><span class="c-sw" style="background:${c.comp[x.id]}"></span>${esc(x.id)} <small>${x.n_linee}</small></li>`).join("");
  }

  // ---------- Scheda riepilogativa della linea ----------
  const NOME_STATO = { popolata: "presente", parziale: "parziale", da_studiare: "da studiare", avviso: "da vedere", nessuna: "nessuna" };
  const fkm = v => (typeof v === "number" ? v.toFixed(3).replace(".", ",") : "—");
  const DS = `<span class="c-ds">da studiare</span>`;
  function det(titolo, campi, src, st) { S.det.push({ titolo, campi, src, st }); return S.det.length - 1; }
  // riga toccabile: stato (V/R/I/N) col pallino, fonte e pagina al tocco
  function riga(html, titolo, campi, src, st, cls = "") {
    const k = det(titolo, campi, src, st);
    return `<button class="c-riga ${cls} st-${ST(st)}" type="button" data-cd="${k}"><span class="dot d-${ST(st)}" aria-label="stato ${ST(st)}"></span><span class="c-rc">${html}</span></button>`;
  }
  function mostraDet(k) {
    const d = S.det[k]; if (!d) return;
    const nomeSt = { V: "V – verificato", R: "R – ricostruito", I: "I – incerto", N: "N – non reperito" };
    openSheet(shHead(d.titolo, "") + d.campi.filter(c => c[1] !== undefined).map(([l, v]) => fact(l, v === null || v === "" ? DS : esc(v), "", null)).join("") +
      fact("Fonte", d.src ? esc([d.src.fonte_breve, d.src.edizione].filter(Boolean).join(" – ")) || DS : DS, d.src && d.src.fonte ? d.src.fonte : "", d.st) +
      fact("Pagina", d.src && d.src.pag ? esc(d.src.pag) : DS, "", d.st) +
      fact("Stato", esc(nomeSt[ST(d.st)]), "", d.st));
  }
  async function apriLinea(id, push = true) {
    if (!S.M) { await risorse(); if (!(await dati())) return apri(); }
    const R = riep(id);
    if (!R) return toast("Linea non trovata nel database");
    closeSheet(); chiudiImg(); liberaImmagini();
    S.det = []; S.img = []; S.linea = id; S.sel = id;
    if (push && location.hash !== "#linea=" + encodeURIComponent(id)) history.pushState({ cl: id }, "", "#linea=" + encodeURIComponent(id));
    mostra("#lineaV"); scrollTo(0, 0);
    $("#lTit").textContent = R.nome_breve;
    $("#lSub").innerHTML = `${esc(R.nome)} · ${esc(R.compartimento)} <span class="dot d-${ST(R.st)}"></span>${ST(R.st)}` +
      (R.estensione ? ` · km ${fkm(R.estensione.km_min)} – ${fkm(R.estensione.km_max)}` : "");
    $("#lBarra").innerHTML = R.sezioni.map(s => `<button type="button" class="c-seg s-${s.stato}" data-c="vai" data-csez="${s.id}" title="${esc(s.titolo)}: ${NOME_STATO[s.stato] || s.stato}"><span class="c-segb"></span><small>${esc(BREVE[s.id] || s.titolo)}</small></button>`).join("");
    let aperte = {};
    try { aperte = JSON.parse(localStorage.getItem("adc-cartina-sezioni") || "{}"); } catch (_) {}
    $("#lBody").innerHTML = R.sezioni.map(s => {
      const open = s.id in aperte ? aperte[s.id] : APERTE.includes(s.id);
      let corpo;
      try { corpo = (DISEGNO[s.id] || generica)(s, R); } catch (e) { corpo = `<p class="note">Sezione non visualizzabile: ${esc(e.message)}</p>`; }
      return `<details class="c-sez s-${s.stato}" id="sez-${s.id}"${open ? " open" : ""}><summary><span class="c-sez-t">${esc(s.titolo)}</span><span class="c-badge s-${s.stato}">${NOME_STATO[s.stato] || esc(s.stato)}</span></summary><div class="c-sez-b">${corpo}</div></details>`;
    }).join("");
    $("#lBody").querySelectorAll("details.c-sez").forEach(d => d.addEventListener("toggle", () => {
      try { const a = JSON.parse(localStorage.getItem("adc-cartina-sezioni") || "{}"); a[d.id.slice(4)] = d.open; localStorage.setItem("adc-cartina-sezioni", JSON.stringify(a)); } catch (_) {}
    }));
    const sel = $("#cLoco");
    if (sel) sel.addEventListener("change", () => { try { localStorage.setItem("adc-cartina-loco", sel.value); } catch (_) {} $("#cCompat").innerHTML = compatCorpo(R.sezioni.find(x => x.id === "compatibilita"), sel.value); });
    caricaMiniature();
  }
  const BREVE = { intestazione: "Linea", esercizio: "Esercizio", localita: "Località", gdp: "GdP", indicatori: "Indic.", compatibilita: "Loco", affiancate: "Affianc.", utenze: "Utenze", pagine_fl: "Pag. FL", discrepanze: "Discr." };
  const APERTE = ["intestazione", "esercizio", "gdp", "compatibilita", "discrepanze"];

  const DISEGNO = {
    intestazione(s) {
      return `<div class="c-campi">${s.campi.map(c => `<div class="c-campo"><span class="lbl">${esc(c.etichetta)}</span><span class="val">${c.valore === null ? (c.campo === "note" ? `<span class="c-vuoto">—</span>` : DS) : esc(c.valore)}</span></div>`).join("")}</div>` +
        riga(`Riga della linea nel database`, "Linea", [["Linea", s.campi[0].valore]], s.src, s.st, "c-fonte");
    },
    esercizio(s) {
      if (!s.righe.length) return `<p class="note">Sistema di esercizio ${DS}.</p>`;
      return s.righe.map(r => riga(`<b>${esc(r.sistema)}</b> · km ${fkm(r.km_da)} – ${fkm(r.km_a)} · ${esc(r.senso)}<br><small>${esc(r.testo)}</small>`,
        "Sistema di esercizio", [["Tratto", `km ${fkm(r.km_da)} – ${fkm(r.km_a)}`], ["Senso", r.senso], ["Sistema", r.sistema], ["Testo", r.testo], ["Riscontro", r.riscontro]], r.src, r.st)).join("") +
        s.scoperti.map(x => `<div class="c-buco">km ${fkm(x[0])} – ${fkm(x[1])}: ${DS}</div>`).join("");
    },
    localita(s) {
      const ord = { pari_crescente: "in senso pari (progressive crescenti)", pari_decrescente: "in senso pari (progressive decrescenti)", senso_pari_da_studiare: "per progressiva crescente: senso pari da studiare" }[s.ordine];
      if (!s.righe.length) return `<p class="note">Nessuna località della linea nel database: ${DS}.</p>`;
      const n = s.righe.filter(r => r.coordinate).length;
      return `<p class="note">Ordine ${ord}. ${n} su ${s.righe.length} con coordinate (◉ con coordinate verificate, ○ senza).</p>` +
        s.righe.map(r => riga(`<span class="c-km">${esc(r.km_txt)}</span> <b>${esc(r.nome)}</b> <small>${esc(r.tipo || "")}${r.posto ? " · posto " + esc(r.posto) : ""}</small><span class="c-geo" title="${r.coordinate ? "con coordinate" : "senza coordinate"}">${r.coordinate ? "◉" : "○"}</span>`,
          r.nome, [["Località", r.nome], ["Tipo", r.tipo], ["Progressiva", r.km_txt], ["Posto", r.posto], ["Nota", r.nota], ["Coordinate", r.coordinate ? "sì (geo, stato V)" : "no: da studiare"]], r.src, r.st)).join("");
    },
    gdp(s) {
      const intro = `<p class="note">Grado di prestazione (colonna della fiancata principale): vale dall'inizio del tratto, nel senso di marcia. L'ascesa è un dato diverso e qui non entra; il testo integrale della riga si vede al tocco. <b>*</b> = progressiva presa dalla località della riga.</p>`;
      return intro + s.sensi.map(z => {
        const tit = `<h4 class="c-h4">Senso ${z.senso}${z.verso ? ` <small>(${z.verso === "progressive_crescenti" ? "progressive crescenti" : "progressive decrescenti"})</small>` : ""}</h4>`;
        if (z.motivo) {
          return tit + `<p class="note">${esc(z.motivo)}.</p>` + (z.righe.length ? z.righe.map(r => riga(`<span class="c-km">${fkm(r.km)}${r.km_da_localita ? "*" : ""}</span> ${esc(r.punto)} <b class="c-gdp">${r.gdp}</b>`,
            "Grado di prestazione", [["Punto", r.punto], ["Progressiva", fkm(r.km)], ["Grado di prestazione", String(r.gdp)], ["Testo della riga di fiancata", r.testo]], r.src, r.st)).join("") : `<p class="note">${DS}</p>`);
        }
        return tit + z.tratti.map(t => {
          const v = t.conflitto ? `<b class="c-gdp c-conf">${t.valori.join(" / ")}</b>` : t.gdp === null ? DS : `<b class="c-gdp">${t.gdp}</b>`;
          const asterisco = t.righe.some(r => r.km_da_localita) ? "*" : "";
          const html = `<span class="c-tr">km ${fkm(t.da_km)}${asterisco} → ${fkm(t.a_km)}<br><small>${esc(t.da_loc || "—")} → ${esc(t.a_loc || "—")}</small></span>${v}`;
          const campi = [["Tratto", `km ${fkm(t.da_km)} → ${fkm(t.a_km)}`], ["Da", t.da_loc], ["A", t.a_loc],
            ["Grado di prestazione", t.conflitto ? `righe con valori diversi nello stesso punto: ${t.valori.join(" / ")} (non risolto)` : t.gdp === null ? null : String(t.gdp)]]
            .concat(t.righe.map((r, i) => [`Riga di fiancata ${i + 1} (${r.src.fonte_breve || ""} ${r.src.pag || ""}, ${r.st})`, r.testo]));
          const src = t.righe[0] ? t.righe[0].src : null;
          return riga(html, `Grado di prestazione · senso ${z.senso}`, campi, src, t.st, t.conflitto ? "c-alert" : "");
        }).join("") + (z.senza_progressiva.length ? `<p class="note">Righe senza progressiva (non collocabili): ${z.senza_progressiva.map(r => esc(r.punto) + " " + r.gdp).join("; ")}</p>` : "");
      }).join("");
    },
    indicatori(s) {
      if (!s.localita.length) return `<p class="note">Nessun indicatore registrato per le località della linea: ${DS}.</p>`;
      return `<p class="note">Indicatori delle località di questa linea. Tocca il nome di una linea per aprirne la scheda.</p>` + s.localita.map(g => `<h4 class="c-h4">${esc(g.nome)} <small>km ${esc(g.km_txt)}</small></h4>` + g.righe.map(r =>
        `<div class="c-ind">${riga(`<span class="c-cifra">${esc(r.cifra)}</span> <small>${esc(r.senso)} · ${esc(r.segnale)}</small><br>${esc(r.dove)}`,
          `Indicatore ${r.cifra} · ${g.nome}`, [["Località", g.nome], ["Senso", r.senso], ["Segnale", r.segnale], ["Cifra", r.cifra], ["Dove porta", r.dove], ["Linea del database", r.verso_nome || "non presente nel database"], ["Nota", r.nota]], r.src, r.st)}` +
        (r.verso_linea ? `<button class="c-link" type="button" data-cl="${esc(r.verso_linea)}">${esc(r.verso_nome)} ›</button>` : "") + `</div>`).join("")).join("");
    },
    compatibilita(s) {
      if (!s.loco.length) return `<p class="note">Nessuna locomotiva nel database: ${DS}.</p>`;
      let scelta = "";
      try { scelta = localStorage.getItem("adc-cartina-loco") || ""; } catch (_) {}
      if (scelta !== "tutte" && !s.loco.some(l => l.loco === scelta)) scelta = s.loco[0].loco;
      return `<label class="field c-sel"><span>Locomotiva (DE CTI 10/2016)</span><select id="cLoco">${s.loco.map(l => `<option value="${esc(l.loco)}"${l.loco === scelta ? " selected" : ""}>${esc(l.loco)}</option>`).join("")}<option value="tutte"${scelta === "tutte" ? " selected" : ""}>Tutte le locomotive (tabella)</option></select></label><div id="cCompat">${compatCorpo(s, scelta)}</div>`;
    },
    affiancate(s) {
      const CAT = { tutti: "tutti i treni", solo_viaggiatori: "solo treni viaggiatori", solo_viaggiatori_ertms_l2: "solo viaggiatori ERTMS L2", solo_impostati_av: "solo treni impostati AV" };
      const COP = { coperto: "tratto coperto dalla Sez. 4.6 letta", parziale: "Sez. 4.6 letta solo in parte del tratto", non_coperto: "Sez. 4.6 non letta su questo tratto", progressive_non_trascritte: "progressive del tratto non trascritte" };
      let h = "";
      if (s.nessuna_affiancata) h += `<p class="note"><b>Nessuna linea affiancata</b>: Sez. 4.6 letta su tutta la linea.</p>`;
      h += s.gruppi.map(g => `<div class="c-box">` + riga(`<b>${esc(g.descrizione || g.aff_id)}</b><br><small>${esc(g.tratto)}${g.km_da !== null ? ` · km ${fkm(g.km_da)} – ${fkm(g.km_a)}` : ""} · ${esc(CAT[g.categoria] || g.categoria || "categoria da studiare")}</small>`,
        "Linee affiancate", [["Gruppo", g.aff_id], ["Descrizione", g.descrizione], ["Validità", CAT[g.categoria] || g.categoria], ["Tratto di questa linea", g.tratto], ["Condizioni (Sez. 4.6, testo integrale)", g.condizioni]], g.src, g.st) +
        `<p class="note c-cop c-${g.sez46}">${COP[g.sez46]}</p>` +
        `<div class="c-cond"><span class="lbl">Condizioni</span>${g.condizioni ? esc(g.condizioni) : DS}</div>` +
        g.altre.map(a => `<button class="c-voce c-mini" type="button" data-cl="${esc(a.linea_id)}"><span>${a.relazione === "affiancata" ? "affiancata a" : "stesso percorso"}: <b>${esc(a.nome_breve)}</b><br><small>${esc(a.tratto)}</small></span><span>›</span></button>`).join("") + `</div>`).join("");
      h += `<h4 class="c-h4">Sez. 4.6 letta</h4>` + (s.sez46_letta.length ? s.sez46_letta.map(r => riga(`km ${fkm(r.km_da)} – ${fkm(r.km_a)}`, "Sez. 4.6 letta", [["Tratto", `km ${fkm(r.km_da)} – ${fkm(r.km_a)}`]], r.src, r.st)).join("") : `<p class="note">${DS}</p>`) +
        s.sez46_scoperti.map(x => `<div class="c-buco">km ${fkm(x[0])} – ${fkm(x[1])}: Sez. 4.6 ${DS}</div>`).join("");
      return h;
    },
    utenze(s) {
      if (!s.righe.length) return `<p class="note">Nessuna utenza registrata: ${DS}.</p>`;
      return s.righe.map(r => {
        const dove = r.ambito === "localita" ? r.loc_nome : r.ambito === "tratto" ? `km ${fkm(r.km_da)} – ${fkm(r.km_a)}` : r.ambito === "compartimento" ? `compartimento ${r.compartimento}` : "linea";
        const num = [r.gsmr ? `GSM-R <b>${esc(r.gsmr)}</b>` : "", r.fs ? `FS <b>${esc(r.fs)}</b>` : "", r.altro ? esc(r.altro) : ""].filter(Boolean).join(" · ");
        return riga(`<span class="c-ruolo">${esc(r.ruolo)}</span> ${esc(r.chi)}<br><small>${esc(dove)}</small><br>${num || `<small>numero ${DS}</small>`}`,
          `Utenza ${r.ruolo}`, [["Ruolo", r.ruolo], ["Chi", r.chi], ["Vale per", dove], ["GSM-R", r.gsmr], ["FS", r.fs], ["Altro", r.altro]], r.src, r.st);
      }).join("");
    },
    pagine_fl(s) {
      if (!s.righe.length) return `<p class="note">Nessuna pagina FL registrata: ${DS}.</p>`;
      const TIPO = { schema: "Schema", fiancata_linea: "Fiancata di linea", principale: "Fiancata principale", principale_sx: "Fiancata principale (sinistra)", principale_dx: "Fiancata principale (destra)", sigle: "Sigle", sez46: "Sez. 4.6", sez420: "Sez. 4.20", altro: "Altro" };
      const gruppi = new Map();
      s.righe.forEach(r => { if (!gruppi.has(r.tipo)) gruppi.set(r.tipo, []); gruppi.get(r.tipo).push(r); });
      return `<p class="note">Qui si leggono anche PL, P.L.A., Plp e RTB (non sono nel database). Tocca una pagina per ingrandirla.</p>` +
        [...gruppi].map(([t, rr]) => `<h4 class="c-h4">${esc(TIPO[t] || t)}</h4><div class="c-thumbs">` + rr.map(r => {
          const k = S.img.push(r) - 1;
          return `<button class="c-thumb" type="button" data-ci="${k}"><span class="c-th-img" id="cth${k}"><small>…</small></span><small>${esc(r.fonte_breve)} ${esc(r.pag)}${r.senso ? " · " + esc(r.senso) : ""}${r.km_da !== null ? `<br>km ${fkm(r.km_da)} – ${fkm(r.km_a)}` : ""}</small></button>`;
        }).join("") + `</div>`).join("");
    },
    discrepanze(s) {
      if (!s.righe.length) return `<p class="note">Nessuna discrepanza aperta registrata per questa linea.</p>`;
      return `<p class="note">Discrepanze tra fonti: si mostrano, non si risolvono.</p>` + s.righe.map(r => `<div class="c-disc"><b>${esc(r.disc_id)}</b><p>${esc(r.testo)}</p><small>Fonti: ${esc(r.fonti)}</small></div>`).join("");
    }
  };
  // Disegno generico per una sezione nuova (aggiunta nel modello senza disegno dedicato)
  function generica(s) {
    const righe = Array.isArray(s.righe) ? s.righe : [];
    if (!righe.length) return `<p class="note">${DS}</p>`;
    return righe.map(r => riga(Object.entries(r).filter(([k, v]) => k !== "src" && k !== "st" && v !== null && typeof v !== "object").map(([k, v]) => `<small>${esc(k)}:</small> ${esc(v)}`).join(" · "),
      s.titolo, Object.entries(r).filter(([k, v]) => k !== "src" && k !== "st" && typeof v !== "object").map(([k, v]) => [k, v === null ? null : String(v)]), r.src || null, r.st || "N")).join("");
  }
  function compatCorpo(s, scelta) {
    const ES = { ammessa: "ammessa", esclusa: "esclusa", limitazione: "con limitazione", da_studiare: "da studiare", conflitto: "righe in conflitto" };
    const cella = c => c.righe.length ? c.righe.map(r => `${esc(r.simbolo)}${r.rango_max ? " " + esc(r.rango_max) : ""}${r.vmax_nota !== null ? " " + r.vmax_nota : ""}`).join(" / ") : "—";
    if (!s.tratti.length) return `<p class="note">Nessuna riga della DE su questa linea: ${DS} per tutte le locomotive.</p>`;
    if (scelta === "tutte") {
      return `<div class="c-tab-wrap"><table class="c-tab"><thead><tr><th>Tratto</th>${s.loco.map(l => `<th>${esc(l.loco)}</th>`).join("")}</tr></thead><tbody>` +
        s.tratti.map((t, k) => `<tr><th><small>${esc(t.tratto_de)}<br>km ${fkm(t.km_da)} – ${fkm(t.km_a)}</small></th>` + s.loco.map(l => {
          const c = l.celle[k], r = c.righe[0];
          const idx = det(`${l.loco} · ${t.tratto_de}`, [["Locomotiva", l.loco], ["Tratto DE", t.tratto_de], ["Esito", ES[c.esito]]].concat(c.righe.map(x => [["Simbolo", x.simbolo], ["Rango massimo", x.rango_max], ["Limitazione di velocità della nota", x.vmax_nota === null ? null : x.vmax_nota + " km/h"], ["Nota", x.nota]]).flat()), r ? r.src : null, r ? r.st : "N");
          return `<td><button type="button" class="c-cella e-${c.esito}" data-cd="${idx}">${cella(c)}</button></td>`;
        }).join("") + `</tr>`).join("") + `</tbody></table></div>` +
        `<p class="note">Legenda: <span class="c-es e-ammessa">ammessa</span> <span class="c-es e-limitazione">con limitazione</span> <span class="c-es e-esclusa">esclusa</span> <span class="c-es e-da_studiare">da studiare</span></p>`;
    }
    const l = s.loco.find(x => x.loco === scelta) || s.loco[0];
    if (l.stato === "da_studiare") return `<p class="note"><b>${esc(l.loco)}</b>: nessuna riga della DE su questa linea → ${DS} (non vuol dire «non ammessa»).</p>`;
    return s.tratti.map((t, k) => {
      const c = l.celle[k];
      if (!c.righe.length) return `<div class="c-buco">${esc(t.tratto_de)} · km ${fkm(t.km_da)} – ${fkm(t.km_a)}: ${DS}</div>`;
      return c.righe.map(r => riga(`<span class="c-es e-${r.esito}">${ES[r.esito]}</span> <b>${esc(r.simbolo)}</b>${r.rango_max ? ` rango max <b>${esc(r.rango_max)}</b>` : ""}${r.vmax_nota !== null ? ` · max <b>${r.vmax_nota} km/h</b>` : ""}<br><small>${esc(t.tratto_de)} · km ${fkm(t.km_da)} – ${fkm(t.km_a)}</small>${r.nota ? `<br><small>${esc(r.nota)}</small>` : ""}`,
        `${l.loco} · ${t.tratto_de}`, [["Locomotiva", l.loco], ["Tratto DE", t.tratto_de], ["Progressive", `km ${fkm(t.km_da)} – ${fkm(t.km_a)}`], ["Esito", ES[r.esito]], ["Simbolo", r.simbolo], ["Rango massimo", r.rango_max], ["Limitazione di velocità della nota", r.vmax_nota === null ? null : r.vmax_nota + " km/h"], ["Nota", r.nota]], r.src, r.st)).join("");
    }).join("") + l.scoperti.map(x => `<div class="c-buco">km ${fkm(x[0])} – ${fkm(x[1])}: nessuna riga DE per ${esc(l.loco)} → ${DS}</div>`).join("");
  }

  // ---------- Pagine FL: miniature e visore con pizzico ----------
  async function caricaMiniature() {
    const id = S.linea;
    for (let k = 0; k < S.img.length; k++) {
      const r = S.img[k], el = $("#cth" + k);
      if (!el) continue;
      let b = null;
      try { b = r.img ? await DB.getImg("fl", r.img) : null; } catch (_) {}
      if (S.linea !== id) return;
      if (!b) { el.innerHTML = `<small>immagine non nel telefono<br>(menu ⋮ → Database)</small>`; el.classList.add("manca"); continue; }
      const u = URL.createObjectURL(b); S.imgURL.push(u); r._url = u;
      el.innerHTML = `<img alt="" loading="lazy" src="${u}">`;
    }
  }
  function liberaImmagini() { for (const u of S.imgURL) URL.revokeObjectURL(u); S.imgURL = []; }
  const IV = { V: { s: 1, tx: 0, ty: 0 }, pronta: false };
  function apriImg(k) {
    const r = S.img[k]; if (!r) return;
    if (!r._url) return toast("Immagine non presente nel telefono: menu ⋮ → Database (Aggiorna database o Importa pagine FL)");
    const box = $("#cImgV"), img = $("#cImgI");
    $("#cImgT").textContent = `${r.fonte_breve} ${r.pag}${r.senso ? " · " + r.senso : ""}`;
    box.hidden = false;
    img.onload = () => {
      const W = box.clientWidth, H = box.clientHeight - 56, s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      IV.V = { s, tx: (W - img.naturalWidth * s) / 2, ty: 56 + (H - img.naturalHeight * s) / 2 }; IV.min = s * 0.8; applicaImg();
    };
    img.src = r._url;
    if (!IV.pronta) {
      IV.pronta = true;
      gesti($("#cImgA"), { stato: () => IV.V, limiti: () => [IV.min || 0.1, (IV.min || 0.1) * 12], cambia: applicaImg,
        doppio: (x, y) => { const f = IV.V.s > IV.min * 2 ? IV.min / 0.8 / IV.V.s : 2.5; IV.V.tx = x - (x - IV.V.tx) * f; IV.V.ty = y - (y - IV.V.ty) * f; IV.V.s *= f; applicaImg(); } });
    }
  }
  function applicaImg() { $("#cImgI").style.transform = `translate(${IV.V.tx}px, ${IV.V.ty}px) scale(${IV.V.s})`; }
  function chiudiImg() { const b = $("#cImgV"); if (b) b.hidden = true; }

  // ---------- Eventi ----------
  document.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    const d = t.dataset;
    if (d.cl) { e.stopPropagation(); return apriLinea(d.cl); }
    if (d.cd !== undefined) return mostraDet(+d.cd);
    if (d.ci !== undefined) return apriImg(+d.ci);
    if (d.c === "centra") { ricentra(); return ridisegna(); }
    if (d.c === "pos") return miaPosizione();
    if (d.c === "zin") return zoomA(S.W / 2, S.H / 2, 1.6);
    if (d.c === "zout") return zoomA(S.W / 2, S.H / 2, 1 / 1.6);
    if (d.c === "elenco") return S.M && elenco();
    if (d.c === "mappa") return history.state && history.state.cl ? history.back() : apri();
    if (d.c === "imgchiudi") return chiudiImg();
    if (d.c === "vai") { const s = $("#sez-" + d.csez); if (s) { s.open = true; s.scrollIntoView({ behavior: "smooth", block: "start" }); } }
  }, true);
  document.addEventListener("input", e => {
    if (e.target.id !== "cFiltro") return;
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll("#cTutte .c-voce").forEach(b => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); });
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#cImgV") && !$("#cImgV").hidden) chiudiImg(); });

  return { apri, apriLinea, nascondi, _S: S };
})();
