# ADC COPILOT GPS — PWA sperimentale 1.0.7

Questa repository è **indipendente** da `andreaac9120-dot/adc-copilot` (versione stabile).

- Sito previsto: https://andreaac9120-dot.github.io/adc-copilot-gps/ (dopo l’attivazione di GitHub Pages).
- Database IndexedDB: `adc-copilot-gps`.
- Cache Service Worker: `adc-copilot-gps-*`.
- Manifest installabile distinto: ID `./gps-pwa`, nome `ADC GPS`.
- La posizione GPS non viene archiviata. La funzione richiede coordinate verificate `condotta.GEO` e non è destinata alla condotta ferroviaria.

## Pubblicazione

Caricare i file **nella root** della nuova repository, poi GitHub → Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save. Non modificare la repository stabile.

Il primo caricamento richiede tutti i file alla root, comprese le tre icone `.png`; la cache offline si installa solo se tutti i file indicati in `sw.js` risultano disponibili.

Le prove software non sostituiscono i test reali su Android, specialmente per GPS, permessi e località ripetute.

## Rallentamenti M3 nella scheda

Le nuove righe `condotta.R` di tipo `m3` possono contenere un oggetto `m3` con `velocita`, `inizio_km`, `lunghezza_m`, `binario` (`S`, `D` o `SD` se riguarda entrambi), `note` (array di testi) e `modulo` facoltativo. Anche `S/D` è accettato per compatibilità; entrambe le forme sono visualizzate come `S/D`. Il cippo di inizio resta testo, anche quando è spostabile. Le note si aprono toccando il triangolo giallo. Per un dato non verificabile usare una stringa vuota: la scheda mostra un trattino o `?` senza deduzioni.

I pacchetti precedenti senza l'oggetto `m3` rimangono leggibili con la riga originale completa: il testo `n` resta visibile e toccandolo si aprono le prescrizioni.
