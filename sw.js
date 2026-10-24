// Service worker: app disponibile offline + ricezione dei pacchetti condivisi da altre app.
// Cache con nomi propri dell'app (prefisso "adc-copilot-"): non tocca le cache di altre app sullo stesso dominio (D08).
// Ogni versione scarica la shell completa in una cache nuova e la attiva solo su conferma dell'utente (R01).
// A ogni rilascio cambia VER: è ciò che fa vedere al telefono che c'è una versione nuova.
const NS = "adc-copilot-gps-";
const VER = NS + "shell-1.0.10";
const FONT = NS + "font";
const CONDIVISI = NS + "condivisi";
const SHELL = ["./", "index.html", "style.css", "db.js", "scheda.js", "gps.js", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
// Non cancella cache di altre app sullo stesso dominio (es. la vecchia 1.0.2, se ancora installata).
const VECCHIA = k => false;

self.addEventListener("install", e => {
  // addAll è tutto o niente: se un file non arriva, la versione nuova non si installa e resta quella vecchia.
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => (k.startsWith(NS + "shell-") && k !== VER) || VECCHIA(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "aggiorna") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Condividi → ADC COPILOT (share_target del manifest)
  if (e.request.method === "POST" && url.pathname.endsWith("/condividi")) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const c = await caches.open(CONDIVISI);
      let n = 0;
      for (const f of form.getAll("pacchetto")) {
        if (f && typeof f !== "string") { await c.put(new Request(`condiviso/${Date.now()}_${n++}_${encodeURIComponent(f.name || "pacchetto.json")}`), new Response(f)); }
      }
      return Response.redirect("./?condivisi=1", 303);
    })());
    return;
  }
  if (e.request.method !== "GET") return;
  // Font Google: dalla cache, aggiornati quando c'è rete
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONT).then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // App: solo dalla cache della versione attiva (nessun aggiornamento file per file in sottofondo).
  e.respondWith((async () => {
    const c = await caches.open(VER);
    const hit = await c.match(e.request, { ignoreSearch: true }) || (e.request.mode === "navigate" ? await c.match("index.html") : undefined);
    if (hit) return hit;
    try { return await fetch(e.request); } catch (_) { return Response.error(); }
  })());
});
