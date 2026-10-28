// Parole e testo di una pagina PDF con le stesse regole di pdfplumber 0.11 (extract_words, extract_text):
// così i lettori in JavaScript danno gli stessi risultati di quelli in Python del database dati di linea.
// Si appoggia a pdf.js: ogni frammento di testo viene diviso in caratteri usando le larghezze dei glifi.
(function (root) {
  "use strict";
  const XT = 3, YT = 3, XD = 7.25, YD = 13;

  // Descent dei font dichiarato nel PDF (FontDescriptor), come lo usa pdfminer.
  // pdf.js lo ricalcola dal file del font e per Courier New dà un valore diverso (-0.300 invece di -0.188):
  // si leggono i descrittori non compressi direttamente dai byte del file.
  function descrittori(bytes) {
    const d = {};
    let s = "";
    for (let i = 0; i < bytes.length; i += 65536) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 65536));
    const re = /<<((?:(?!<<|>>)[\s\S])*?\/Type\s*\/FontDescriptor(?:(?!<<|>>)[\s\S])*?)>>|<<((?:(?!<<|>>)[\s\S])*?\/FontDescriptor\b(?:(?!<<|>>)[\s\S])*?)>>/g;
    let m;
    while ((m = re.exec(s))) {
      const t = m[1] || m[2];
      const n = /\/FontName\s*\/([^\s/<>\[\]()]+)/.exec(t), de = /\/Descent\s+(-?[\d.]+)/.exec(t);
      if (n && de) d[n[1]] = parseFloat(de[1]) * 0.001;   // come pdfminer: Descent × vscale
    }
    return d;
  }

  // Caratteri della pagina nell'ordine del contenuto (come page.chars di pdfplumber).
  async function caratteri(page, desc = {}) {
    const vp = page.getViewport({ scale: 1 });
    const H = vp.viewBox[3] - vp.viewBox[1], W = vp.viewBox[2] - vp.viewBox[0];
    await page.getOperatorList();               // carica i font (larghezze dei glifi, nomi)
    const tc = await page.getTextContent();
    const larg = {};                             // fontName → { carattere: larghezza/1000 }
    function tabella(fn) {
      if (larg[fn]) return larg[fn];
      const m = {}; let nome = fn, spazio = null;
      try {
        const f = page.commonObjs.get(fn);
        nome = f.name || fn;
        const map = f.toUnicode && f.toUnicode._map;
        if (f.widths && map) for (const [cod, w] of Object.entries(f.widths)) { const u = map[cod]; if (typeof u === "string" && u.length === 1 && !(u in m)) m[u] = w / 1000; }
        if (f.widths && !map) for (const [cod, w] of Object.entries(f.widths)) m[String.fromCharCode(+cod)] = w / 1000;
        spazio = m[" "] || null;
      } catch (_) {}
      return (larg[fn] = { m, nome, spazio });
    }
    const out = [];
    for (const it of tc.items) {
      if (!it.str || it.str === "") continue;
      const t = it.transform, fs = Math.hypot(t[2], t[3]) || 1;
      const F = tabella(it.fontName), st = tc.styles[it.fontName] || {};
      const descent = (F.nome in desc ? desc[F.nome] : (st.descent || 0)) * fs;
      const ch0 = [...it.str];
      if (!F.spazio && /^\s+$/.test(it.str)) continue;
      // Larghezza naturale dei glifi diversi dallo spazio; il resto della larghezza va agli spazi.
      // pdf.js unisce gli spazi doppi e inserisce spazi «finti» dove c'è un vuoto: lo spazio resta un carattere
      // solo se il vuoto corrisponde a uno o più glifi spazio veri, altrimenti è solo distanza (come in pdfplumber).
      const wn = c => (F.m[c] != null ? F.m[c] : 0.5) * fs;
      const nsp = ch0.filter(c => /\s/.test(c)).length;
      const nat0 = ch0.filter(c => !/\s/.test(c)).reduce((a, c) => a + wn(c), 0);
      let ch = [], adv = [];
      if (!nsp) {
        const k = nat0 > 0 ? it.width / nat0 : 1;
        ch = ch0; adv = ch0.map(c => wn(c) * k);
      } else {
        const g = (it.width - nat0) / nsp, sw = (F.spazio || 0) * fs;
        const kk = sw > 0 ? Math.round(g / sw) : 0, vero = sw > 0 && kk >= 1 && Math.abs(g - kk * sw) <= 0.3;
        if (g < -0.01) { const k = it.width / (nat0 + nsp * sw || 1); ch = ch0; adv = ch0.map(c => (/\s/.test(c) ? sw : wn(c)) * k); }
        else for (const c of ch0) {
          if (!/\s/.test(c)) { ch.push(c); adv.push(wn(c)); }
          else if (vero) for (let j = 0; j < kk; j++) { ch.push(" "); adv.push(g / kk); }
          else { ch.push(null); adv.push(g); }          // solo distanza, nessun carattere
        }
      }
      // direzione della scrittura (u) e verso l'alto del glifo (v), in unità
      const ux = t[0] / fs, uy = t[1] / fs, vx = t[2] / fs, vy = t[3] / fs;
      const upright = (t[0] * t[3] > 0) && (t[1] * t[2] <= 0);
      let ox = t[4], oy = t[5];
      for (let i = 0; i < ch.length; i++) {
        const a = adv[i];
        if (ch[i] !== null) {
          // stessi calcoli (e stesso ordine) di pdfminer: apply_matrix_rect sul riquadro (0, descent, adv, descent+size)
          const xa = (ux * 0 + vx * descent) + ox, ya = (uy * 0 + vy * descent) + oy;
          const xb = (ux * a + vx * (descent + fs)) + ox, yb = (uy * a + vy * (descent + fs)) + oy;
          const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
          const top = H - (y1 - vp.viewBox[1]), bottom = H - (y0 - vp.viewBox[1]);
          out.push({ text: ch[i], x0: x0 - vp.viewBox[0], x1: x1 - vp.viewBox[0], top, bottom, size: y1 - y0, upright, fontname: F.nome });
        }
        ox += ux * a; oy += uy * a;
      }
    }
    return { chars: out, width: W, height: H };
  }

  // cluster_objects di pdfplumber (non preserva l'ordine: ordina per gruppo, stabile)
  function cluster(xs, key, tol) {
    const vals = [...new Set(xs.map(key))].sort((a, b) => a - b);
    const gid = new Map(); let g = -1, last = null;
    for (const v of vals) { if (last === null || v > last + tol) g++; gid.set(v, g); last = v; }
    const tup = xs.map((x, i) => [x, gid.get(key(x)), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    const res = []; let cur = null, cg = null;
    for (const [x, gg] of tup) { if (gg !== cg) { cur = []; res.push(cur); cg = gg; } cur.push(x); }
    return res;
  }
  function unisci(cs, extra) {
    const w = { text: cs.map(c => c.text).join(""), x0: Math.min(...cs.map(c => c.x0)), x1: Math.max(...cs.map(c => c.x1)),
      top: Math.min(...cs.map(c => c.top)), bottom: Math.max(...cs.map(c => c.bottom)) };
    for (const k of extra) w[k] = cs[0][k];
    return w;
  }
  // extract_words / extract_wordmap: restituisce coppie [parola, caratteri]
  function wordmap(chars, extra = []) {
    const res = [];
    // gruppi consecutivi con gli stessi attributi (upright + extra, itertools.groupby)
    const gruppi = []; let prec = null;
    for (const c of chars) { const k = JSON.stringify([c.upright, ...extra.map(e => c[e])]); if (k !== prec) { gruppi.push([]); prec = k; } gruppi[gruppi.length - 1].push(c); }
    for (const gr of gruppi) {
      const up = gr[0].upright;
      // testo dritto: righe per top, caratteri per x0; ruotato: «righe» per x0, caratteri per top
      const linee = up ? cluster(gr, c => c.top, YT) : cluster(gr, c => c.x0, XT);
      for (const linea of linee) {
        const ord = linea.map((c, i) => [c, i]).sort(up ? ((a, b) => a[0].x0 - b[0].x0 || a[1] - b[1]) : ((a, b) => a[0].top - b[0].top || a[0].bottom - b[0].bottom || a[1] - b[1])).map(a => a[0]);
        let cur = [];
        const chiudi = () => { if (cur.length) res.push([unisci(cur, extra), cur]); cur = []; };
        for (const c of ord) {
          if (/^\s+$/.test(c.text)) { chiudi(); continue; }
          if (cur.length) {
            const p = cur[cur.length - 1];
            const nuova = up ? (c.x0 < p.x0 || c.x0 > p.x1 + XT || Math.abs(c.top - p.top) > YT)
                             : (c.top < p.top || c.top > p.bottom + YT || Math.abs(c.x0 - p.x0) > XT);
            if (nuova) chiudi();
          }
          cur.push(c);
        }
        chiudi();
      }
    }
    return res;
  }
  const parole = (chars, extra) => wordmap(chars, extra).map(t => t[0]);

  // extract_text (layout facoltativo), come TextMap di pdfplumber
  function testo(P, layout = false) {
    const wm = wordmap(P.chars);
    if (!wm.length) return "";
    const larghezza = layout ? Math.round(P.width / XD) : 0, altezza = layout ? Math.round(P.height / YD) : 0;
    const vuota = " ".repeat(larghezza);
    let s = "", nl = 0, ultimoNL = true;
    // presorted: parole nell'ordine del wordmap, righe = parole consecutive dello stesso gruppo di top
    const vals = [...new Set(wm.map(t => t[0].top))].sort((a, b) => a - b);
    const gid = new Map(); let g = -1, last = null;
    for (const v of vals) { if (last === null || v > last + YT) g++; gid.set(v, g); last = v; }
    const linee = []; let cg = null;
    for (const t of wm) { const k = gid.get(t[0].top); if (k !== cg) { linee.push([]); cg = k; } linee[linee.length - 1].push(t); }
    linee.forEach((lt, i) => {
      const yd = layout ? lt[0][0].top / YD : 0;
      const n = Math.max(i > 0 ? 1 : 0, pyRound(yd) - nl);
      for (let j = 0; j < n; j++) { if (!s.length || ultimoNL) s += vuota; s += "\n"; ultimoNL = true; }
      nl += n;
      let len = 0;
      for (const [w, cs] of lt) {
        const xd = layout ? w.x0 / XD : 0;
        const sp = Math.max(Math.min(1, len), pyRound(xd) - len);
        s += " ".repeat(Math.max(0, sp)); len += Math.max(0, sp);
        for (const c of cs) { s += c.text; len += c.text.length; }
        ultimoNL = false;
      }
      if (layout) { s += " ".repeat(Math.max(0, larghezza - len)); }
    });
    if (layout) {
      const fine = altezza - (nl + 1);
      for (let i = 0; i < fine; i++) { if (i > 0) s += vuota; s += "\n"; }
      if (s.endsWith("\n")) s = s.slice(0, -1);
    }
    return s;
  }
  // round() di Python: metà al pari
  function pyRound(x) { const f = Math.floor(x), d = x - f; if (d > 0.5) return f + 1; if (d < 0.5) return f; return f % 2 === 0 ? f : f + 1; }

  const API = { descrittori, caratteri, parole, testo, pyRound };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.PdfParole = API;
})(typeof self !== "undefined" ? self : this);
