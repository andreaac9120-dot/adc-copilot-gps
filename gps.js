// GPS v1.0.4: solo consultazione, fonte geografica verificata e consenso esplicito.
// Nessuna posizione viene registrata su IndexedDB, log, server o cache.
const GPS = (() => {
  let P = null, rows = [], localita = [], enabled = false, watchId = null;
  let indice = null, pending = null, pendingCount = 0;
  const $g = s => document.querySelector(s);
  const km = 6371000;
  const deg = Math.PI / 180;
  const distanza = (a, b) => {
    const p1 = a.lat * deg, p2 = b.lat * deg;
    const dp = (b.lat - a.lat) * deg, dl = (b.lon - a.lon) * deg;
    const x = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2 * km * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1-x)));
  };
  const coordinateOk = g => g && Number.isFinite(g.lat) && Number.isFinite(g.lon) &&
    g.lat >= -90 && g.lat <= 90 && g.lon >= -180 && g.lon <= 180 && g.st === "V" &&
    typeof g.src === "string" && g.src.trim();

  function stato(s) { const el = $g("#gpsStatus"); if (el) el.textContent = s; }
  function pulsante() {
    const el = $g("#gpsToggle"); if (!el) return;
    el.textContent = enabled ? "GPS ON · Ferma" : "GPS OFF · Attiva";
    el.setAttribute("aria-pressed", enabled ? "true" : "false");
    el.classList.toggle("on", enabled);
  }
  function descrizione(i) {
    const r = i === null ? null : rows[i];
    return r ? `${r.n} · km ${r.km} · riga ${i+1}/${rows.length}` : "Nessuna riga";
  }
  function segna(i, centro, extra = "") {
    indice = Math.max(0, Math.min(rows.length-1, i));
    if (typeof Scheda !== "undefined" && Scheda.marcaRiga) Scheda.marcaRiga(indice, centro);
    stato(`${enabled ? "GPS attivo" : "Manuale"}: ${descrizione(indice)}${extra ? " · " + extra : ""}`);
  }
  function close(messaggio = "") {
    if (watchId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
    }
    watchId = null; enabled = false; pending = null; pendingCount = 0;
    pulsante();
    if (messaggio) stato(messaggio);
  }
  function open(pkg) {
    close(); P = pkg; rows = pkg.condotta.R;
    const geo = pkg.condotta.GEO || {};
    localita = rows.flatMap((r, i) => r.t === "loc" && coordinateOk(geo[r.id]) ?
      [{ i, n: r.n, lat: geo[r.id].lat, lon: geo[r.id].lon }] : []);
    indice = null;
    stato(localita.length ?
      `Posizione non determinata. ${localita.length} località con coordinate verificate. GPS disattivato; attivalo o usa le frecce.` :
      "Posizione non determinata. GPS non disponibile: coordinate GEO verificate assenti nel pacchetto. Usa le frecce.");
  }
  function fix(pos) {
    if (!enabled || !P) return;
    const acc = pos.coords.accuracy;
    if (!Number.isFinite(pos.coords.latitude) || !Number.isFinite(pos.coords.longitude) ||
        !Number.isFinite(acc) || acc > 100 ||
        !Number.isFinite(pos.timestamp) || Date.now() - pos.timestamp > 30000 || pos.timestamp > Date.now() + 30000) {
      pending = null; pendingCount = 0;
      stato("GPS: posizione assente, vecchia o con precisione insufficiente (oltre 100 m). Indicatore fermo sull’ultima riga.");
      return;
    }
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const near = localita.map(g => ({ ...g, d: distanza(g, p) })).sort((a,b) => a.d-b.d);
    const soglia = Math.min(300, Math.max(150, acc * 2.5));
    if (!near.length || near[0].d > soglia) {
      pending = null; pendingCount = 0;
      stato(`GPS attivo · ±${Math.round(acc)} m. Non vicino a una località verificata: ultima posizione nella scheda ${descrizione(indice)}. Nessuna stima lungo il binario.`);
      return;
    }
    const best = near[0];
    // Nessuna scelta automatica presso stazioni ripetute, piazzali o linee affiancate.
    if (near.length > 1 && near[1].d - best.d < Math.max(80, acc)) {
      pending = null; pendingCount = 0;
      stato("GPS: località ambigua (più punti vicini). Usa le frecce per individuare il passaggio corretto.");
      return;
    }
    if (indice !== null && best.i < indice) {
      pending = null; pendingCount = 0;
      stato(`GPS: rilevata località precedente (${best.n}); avanzamento automatico sospeso. Usa le frecce per riallineare.`);
      return;
    }
    if (pending === best.i) pendingCount++;
    else { pending = best.i; pendingCount = 1; }
    if (pendingCount < 2) {
      stato(`GPS: possibile ${best.n} (${Math.round(best.d)} m, ±${Math.round(acc)} m). In attesa di conferma.`);
      return;
    }
    // Centra solo al passaggio a una nuova riga: i fix successivi non interrompono lo scorrimento manuale.
    if (best.i !== indice) segna(best.i, true, `vicino a ${best.n} · distanza indicativa ${Math.round(best.d)} m · precisione ±${Math.round(acc)} m`);
  }
  function errore(e) {
    if (!enabled) return;
    const m = e && e.code === 1 ? "permesso negato; abilita Posizione per questa PWA in Android/Chrome" :
      e && e.code === 2 ? "segnale non disponibile (es. galleria)" : "tempo di acquisizione scaduto";
    stato("GPS: " + m + ". L'avanzamento manuale resta disponibile.");
    if (e && e.code === 1) close();
  }
  function toggle() {
    if (enabled) { close(); segna(indice, false, "GPS spento; avanza con le frecce."); return; }
    if (!P) return;
    if (localita.length === 0) {
      stato("Impossibile attivare il GPS: mancano coordinate verificate delle località nel campo condotta.GEO. Richiedi un pacchetto aggiornato.");
      return;
    }
    if (!navigator.geolocation || !isSecureContext) {
      stato("GPS non disponibile: apri la PWA in HTTPS su un dispositivo con localizzazione attiva."); return;
    }
    enabled = true; pulsante(); pending = null; pendingCount = 0;
    stato("GPS attivo: attendo il consenso e una posizione affidabile…");
    try { watchId = navigator.geolocation.watchPosition(fix, errore,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }); }
    catch (_) { close(); stato("Impossibile avviare il GPS. Riprova o usa le frecce."); }
  }
  function handle(cmd) {
    if (cmd === "toggle") { toggle(); return; }
    if (cmd === "center") {
      if (indice === null) { stato("Posizione non ancora individuata: attiva il GPS o usa le frecce."); return; }
      segna(indice, true, "centrato sulla riga selezionata"); return;
    }
    if (cmd === "prev" || cmd === "next") {
      if (enabled) close(); // manuale ha sempre precedenza
      segna(indice === null ? 0 : indice + (cmd === "next" ? 1 : -1), true, "GPS spento; avanzamento manuale");
    }
  }
  return { open, close, handle, fix, distanza };
})();
