# ADC COPILOT 1.0.9 — versione unica

Dal 22/10/2026 la fase di prova GPS è conclusa: questa è l'**unica** app ADC COPILOT. Il pacchetto viaggio è uno solo (`<treno>_<data>.adc.json`, scheda 16c del progetto) e contiene coordinate `condotta.GEO` e righe M3 compatte. Il comando «PROCEDI CON PACCHETTO GPS» non esiste più.

La vecchia repository `andreaac9120-dot/adc-copilot` (1.0.2) non è più il bersaglio del pacchetto e non viene modificata.

- Sito: https://andreaac9120-dot.github.io/adc-copilot-gps/
- Per non perdere l'app installata e i viaggi salvati restano **invariati** i nomi tecnici: ID manifest `./gps-pwa`, database IndexedDB `adc-copilot-gps`, cache `adc-copilot-gps-*`, indirizzo del sito. Cambia solo il nome visibile (`ADC COPILOT`).
- La posizione GPS non viene archiviata. Il GPS richiede coordinate verificate in `condotta.GEO` e non è destinato alla condotta ferroviaria.

## Comandi inviati a Claude

Nella Home restano due soli tasti:
- **Studio linea condotta**: usa la Scheda Treno se è stata scelta, altrimenti la traccia incollata.
- **Studio linea formazione**: Scheda Treno o traccia, con massa e documenti del treno facoltativi.

FL mancanti e coordinate GPS si passano direttamente in chat nel progetto. Le voci «da studiare» del viaggio hanno ancora il tasto Studia (STUDIA SOLO …). Le regole del pacchetto stanno nella scheda 16c del progetto.

## Pubblicazione

Caricare i file **nella root** della repository (comprese le tre icone `.png`). GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/(root)`. La cache offline si installa solo se tutti i file indicati in `sw.js` sono disponibili; sul telefono compare "Nuova versione dell'app pronta" → Aggiorna ora.

## Rallentamenti M3 nella scheda

Le righe `condotta.R` di tipo `m3` contengono un oggetto `m3` con `velocita`, `inizio_km`, `lunghezza_m`, `binario` (`S`, `D` o `SD`), `note` (array di testi) e `modulo` facoltativo. Anche `S/D` è accettato. Il cippo di inizio resta testo, anche quando è spostabile. Le note si aprono toccando il triangolo giallo. Per un dato non verificabile si usa una stringa vuota: la scheda mostra un trattino o `?`.

I pacchetti precedenti senza l'oggetto `m3` restano leggibili con la riga originale completa.

Le prove software non sostituiscono i test reali su Android, specialmente per GPS, permessi e località ripetute.
