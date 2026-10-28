# ADC COPILOT 1.0.19 — versione unica

Dal 22/10/2026 la fase di prova GPS è conclusa: questa è l'**unica** app ADC COPILOT. Il pacchetto viaggio è uno solo (`<treno>_<data>.adc.json`, scheda 16c del progetto) e contiene coordinate `condotta.GEO` e righe M3 compatte. Il comando «PROCEDI CON PACCHETTO GPS» non esiste più.

La vecchia repository `andreaac9120-dot/adc-copilot` (1.0.2) non è più il bersaglio del pacchetto e non viene modificata.

- Sito: https://andreaac9120-dot.github.io/adc-copilot-gps/
- Per non perdere l'app installata e i viaggi salvati restano **invariati** i nomi tecnici: ID manifest `./gps-pwa`, database IndexedDB `adc-copilot-gps`, cache `adc-copilot-gps-*`, indirizzo del sito. Cambia solo il nome visibile (`ADC COPILOT`).
- La posizione GPS non viene archiviata. Il GPS richiede coordinate verificate in `condotta.GEO` e non è destinato alla condotta ferroviaria.

## Generatore senza IA (prova, 1.0.17–1.0.19)

1.0.19: la traccia non è più obbligatoria. Con la sola Scheda Treno numeri treno e data vengono dalla Scheda (numero di ogni pagina, «Valida per il treno del») e il confronto traccia ⇆ Scheda non si fa. Campo **Locomotiva**: se compilato vale quello (es. E494 o E494.504); se vuoto vale la locomotiva della traccia; senza traccia quella scritta nella Scheda (mezzo intestatario della sigla), con avviso nel rapporto perché può non essere quella che traina il treno.

1.0.18: indicatore del treno come nel generatore del database aggiornato (la stessa cifra su due segnali della località vale una volta). Serve con il database del 28/10/2026 ore 16:05 o successivo.


Nuova sezione in Home, **separata** dallo studio con Claude (i tasti Studio linea condotta/formazione e Studia non cambiano).
- **Importa database**: carica il file `adc_linee_<versione>.adcdb.json` del repository **privato** `adc-copilot-db`. L'app controlla formato e impronta SHA-256 e lo salva solo nel telefono (IndexedDB, `conf`). Questa repository è pubblica e **non contiene dati di linea**.
- **Genera pacchetto**: traccia Softrail (obbligatoria) + Scheda Treno PDF (facoltativa) → lettori → composizione dell'itinerario → generatore → pacchetto `.adc.json` controllato con le regole 1.0.4. Poi: Anteprima (non salva), Salva nei viaggi (chiede conferma se il viaggio esiste già), Scarica.
- Tutto offline. Il codice in `motore/` è la traduzione fedele dei programmi Python del database (stessi ingressi → stesso pacchetto, verificato sul treno 51455 del 28/10/2026 e sui viaggi di prova). La Scheda PDF si legge con pdf.js (`vendor/pdfjs`, Apache 2.0) riproducendo le regole di pdfplumber.
- Funziona solo sulle linee caricate nel database; ciò che manca diventa stato N e punto aperto. Pagine FL (immagini) non incluse.

## Grafica e Schermo (1.0.16)

Nuovi temi giorno e notte, testi più leggibili e menu ⋮ → Schermo. Le modalità Telefono e Tablet adattano la larghezza della scheda; la preferenza viene salvata sul dispositivo. Il manifest consente entrambi gli orientamenti. La rotazione richiede che il dispositivo la consenta; il blocco verticale è disponibile solo nei browser che supportano la relativa API. Nessun cambiamento al formato dei pacchetti o alla logica dei viaggi.

## Comandi inviati a Claude

Nella Home restano due soli tasti:
- **Studio linea condotta**: usa la Scheda Treno se è stata scelta, altrimenti la traccia incollata.
- **Studio linea formazione**: Scheda Treno o traccia, con massa e documenti del treno facoltativi.

FL mancanti e coordinate GPS si passano direttamente in chat nel progetto. Le voci «da studiare» del viaggio hanno ancora il tasto Studia (STUDIA SOLO …). Le regole del pacchetto stanno nella scheda 16c del progetto.

## Pubblicazione

Caricare i file **nella root** della repository (comprese le tre icone `.png`). GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/(root)`. La cache offline si installa solo se tutti i file indicati in `sw.js` sono disponibili; sul telefono compare "Nuova versione dell'app pronta" → Aggiorna ora.

## Condotta ripubblicata dopo la formazione (1.0.13, 25/10/2026)

Se importi un pacchetto di ADC COPILOT **senza** blocco formazione (per esempio la fase 2 con la Scheda Treno) su un viaggio che nel telefono ha già la formazione, l'app la **conserva**: tiene formazione, punti aperti "[FORMAZIONE]", fonti di formazione e comando, e porta la revisione sopra quella salvata. Il controllo "revisione più vecchia" usa la revisione della condotta (`rev_condotta`, dato locale), perché l'unione del blocco alza la revisione. I collegamenti a tratti o località che non esistono più nella nuova condotta si tolgono e restano segnalati nella scheda. Un pacchetto che contiene la sua formazione sostituisce tutto, come prima. L'esportazione non contiene i dati locali (`importato`, `avvisi_import`, `rev_condotta`).

## Blocco formazione (1.0.12, 25/10/2026)

Il file `blocco_formazione_<treno>_<data>.json` che consegna il progetto ADC FORMAZIONE si importa con **Importa pacchetto** (o Condividi) come un pacchetto. L'app:
- cerca il viaggio di condotta già salvato con lo stesso id; se non c'è, cerca il viaggio della stessa data che ha quel numero treno nell'intestazione (es. blocco 63718 → viaggio "65720 / 65729 (origine 63718/56072 …)") e chiede conferma; se i viaggi possibili sono più di uno, si ferma;
- unisce come lo script F16g del progetto: formazione sostituita, revisione +1, fonti e comando senza doppioni, punti aperti "[FORMAZIONE]" rinnovati, pagine FL e condotta invariate;
- toglie e segnala i collegamenti a tratti o località che nel viaggio non esistono;
- controlla il risultato con le regole 1.0.4: se non è valido non salva nulla e spiega perché.

## Pacchetto schema 1.0.4 (1.0.11, 25/10/2026)

Dalla 1.0.11 l'app accetta solo pacchetti con `versione_formato` 2 (schema GPS_16d 1.0.4, validatore GPS_16e 1.0.4). I pacchetti precedenti vanno ripubblicati da Claude. Correzioni del rapporto di revisione del 22/10/2026:
- **stato ed esito separati** (C01, C16): la scheda mostra sempre lo stato del pacchetto; niente V automatico per la massa fornita da te o per le staffe "ok", niente R forzato sui controlli "non ok". L'esito è scritto nell'etichetta, lo stato è il colore;
- **stessi controlli del validatore di Claude** (C03, C15): fonti con documento ed edizione, `src` obbligatoria salvo stato N, regole della massa (utente → V; documenti → V o I; senza massa nessun campo massa e nota obbligatoria), stato dei controlli non migliore della massa, staffe con stato proprio e regola della premessa peggiore, identità del viaggio (numero treno e data dell'id = intestazione), riferimenti verificati solo come proprietà proprie;
- **riscontro della massa** (C09): se scrivi la massa e alleghi anche i documenti, vale la tua; i documenti vanno in `massa_riscontro` e, se discordi, i controlli restano incerti e compare il punto aperto "masse diverse";
- **pagine FL** (C02): alla revisione 1 devono esserci tutte; dalla revisione 2 quelle riusate dalla revisione precedente restano segnalate nella scheda a ogni apertura;
- **locomotiva isolata** (C04): tolta la frase fissa; la regola PE CTI 10/2025 è ancora aperta e deve arrivare dal pacchetto;
- **progetti**: la formazione, i documenti del treno e i punti aperti "[FORMAZIONE]" si inviano al progetto ADC FORMAZIONE; l'esportazione non contiene più i dati locali dell'app.

Restano da fare (non in questa versione): progressive con "+" nel filtro della fiancata (C07), import concorrenti (C06), backup completo con le pagine FL (C11), limiti di dimensione all'import (C12), punti GPS C10, accessibilità (C14).

## Rallentamenti M3 nella scheda

Le righe `condotta.R` di tipo `m3` contengono un oggetto `m3` con `velocita` (cifre), `inizio_km` (testo non vuoto), `lunghezza_m` (cifre), `binario` (`S`, `D` o `SD`), `note` (array di testi) e `modulo` facoltativo. Il campo `v` della riga, se c'è, deve essere uguale a `m3.velocita`. Il cippo di inizio resta testo, anche quando è spostabile. Le note si aprono toccando il triangolo giallo. Le righe M3 senza oggetto `m3` (formato vecchio) non sono più ammesse.

Le prove software non sostituiscono i test reali su Android, specialmente per GPS, permessi e località ripetute.

## GPS e passaggio in background (1.0.10)

Il passaggio a un’altra app o lo spegnimento dello schermo non spegne più volontariamente il GPS. Al ritorno la richiesta di posizione viene rinnovata automaticamente, con due nuove rilevazioni per confermare una località. Il tasto **GPS ON · Ferma** interrompe la richiesta e il ritorno nell’app non la riattiva.

Restano gli arresti quando si usano le frecce manuali, si chiude/cambia viaggio o si nega il permesso. Ricaricando o riaprendo da zero l’app occorre attivare nuovamente il GPS. Nessuna posizione viene salvata.

Una PWA non può garantire aggiornamenti continui in background: Android/iOS o il browser possono sospenderli o terminare l’app. Per la continuità a schermo spento serve un’implementazione nativa con i relativi permessi e servizi di localizzazione.

Verifica software: `node --test tests/*.test.js`. Sul telefono: attivare il GPS, passare a un’altra app per 10–30 secondi e tornare; ripetere bloccando lo schermo. Controllare ON e riacquisizione, poi premere Ferma e verificare che un nuovo passaggio in background non lo riattivi. Provare anche permesso negato, segnale assente e uscita dal viaggio.
