# ADC COPILOT 1.0.42 — versione unica

Dal 22/10/2026 la fase di prova GPS è conclusa: questa è l'**unica** app ADC COPILOT. Il pacchetto viaggio è uno solo (`<treno>_<data>.adc.json`, scheda 16c del progetto) e contiene coordinate `condotta.GEO` e righe M3 compatte. Il comando «PROCEDI CON PACCHETTO GPS» non esiste più.

La vecchia repository `andreaac9120-dot/adc-copilot` (1.0.2) non è più il bersaglio del pacchetto e non viene modificata.

- Sito: https://andreaac9120-dot.github.io/adc-copilot-gps/
- Per non perdere l'app installata e i viaggi salvati restano **invariati** i nomi tecnici: ID manifest `./gps-pwa`, database IndexedDB `adc-copilot-gps`, cache `adc-copilot-gps-*`, indirizzo del sito. Cambia solo il nome visibile (`ADC COPILOT`).
- La posizione GPS non viene archiviata. Il GPS richiede coordinate verificate in `condotta.GEO` e non è destinato alla condotta ferroviaria.


## 1.0.42 (05/11/2026) – pagine principali per località su tutti i FL

Il database ha ora l'intervallo km di ogni pagina principale per tutti i FL caricati, quindi il filtro della 1.0.41 vale ovunque. Nuova regola di sicurezza in `motore/genera.js`: se il km di una località non cade in nessuna pagina (pagina non caricata nel database), il fumetto mostra tutte le principali della linea come prima, invece di nessuna.

## 1.0.41 (05/11/2026) – fiancate principali solo della pagina della località

Prima, toccando una località, il fumetto mostrava **tutte** le fiancate principali della linea (es. Torino – Novara storica: p.60–67). Ora il generatore (`motore/genera.js`) sceglie per ogni località solo le pagine principali la cui progressiva `km_da`–`km_a` (tabella `pagine_fl` del database) contiene il km della località:
- una coppia sinistro/destro di norma; due coppie se la località è al confine tra due pagine (es. Chivasso, ultima riga di p.60 e prima di p.62);
- una pagina senza km nel database si mostra sempre (nessuna pagina va persa); le fiancate di linea e lo schema unifilare restano per linea e senso;
- le località con le stesse pagine condividono lo stesso gruppo in `FLPAG` (chiavi `<linea>_<senso>_fianc`, `_fianc_2`, …).

**Serve rigenerare il viaggio** (i viaggi già salvati tengono le pagine con cui sono stati creati).

## 1.0.40 (04/11/2026) – riconoscimento delle località con la sola traccia

Correzione del compositore del viaggio (generatore senza IA), dalla traccia del treno 67351 del 04/11/2026 (Modane → Quattro Ville Z.I.):
- con la **sola traccia** una località della traccia prende solo le località del database con il **nome più simile** (prima tutte quelle sopra la soglia 0,8: «TORINO PORTA SUSA» prendeva anche Torino Orbassano, «TORINO STURA» anche Torino P. Susa, e l'itinerario si fermava con «più linee possibili»);
- un **nome uguale vince sul prefisso** («TORINO STURA» = Torino Stura, non Torino Stura Origine AV).

Stesse correzioni in `lettori/componi_viaggio.py` del database dati di linea (commit m28 del 04/11/2026). Serve il database del 04/11/2026 (FL 2 e FL 4 Torino) per il percorso Modane – Torino – Novara.

## 1.0.39 (03/11/2026) – cambio di sigla a metà pagina della Scheda Treno

Correzione del lettore della Scheda Treno e del compositore del viaggio (generatore senza IA), dalla Scheda del treno 46593/46592 del 03/11/2026:
- l'**intestazione ripetuta a metà pagina** (Prestazione / Int. alla Sigla / Sigla di Composizione, es. «DE18» dopo Alessandria Sm.) non viene più letta come una località: prima interrompeva l'itinerario («ITINERARIO PARZIALE»);
- la località ripetuta subito dopo quell'intestazione è unita alla riga precedente (un solo passaggio, con l'indicatore di partenza);
- mezzo intestatario della sigla, sigla e % freno si leggono **riga per riga** (valgono partendo da ogni località): senza traccia e senza locomotiva indicata, ogni tratto prende il mezzo della sua località di partenza. Prima, se le località Da/A delle pagine non erano nel database (es. «P.L.A. km 3+859»), tutti i mezzi finivano su tutti i tratti e un mezzo assente dal database (DE18) rendeva gialle tutte le A.

Stesse correzioni in `lettori/leggi_scheda.py` e `lettori/componi_viaggio.py` del database dati di linea.

## 1.0.38 (02/11/2026) – tolti i comandi di studio con IA

Dalla PWA sono stati tolti i tasti **Studio linea condotta** e **Studio linea formazione** (riquadro «Nuovo studio»), il riquadro «Da Claude: da studiare e mancanti», i tasti **Studia** nella scheda e il riquadro «Allega documenti del treno»: l'app non invia più comandi a Claude. Il generatore senza IA è in cima alla Home («Nuovo viaggio senza IA»). Per studiare una linea con l'IA si scrive in chat a Claude (progetto ADC COPILOT, STUDIO LINEA CONDOTTA con la Scheda Treno allegata); il pacchetto .adc.json e il blocco formazione che ne risultano si importano ancora con **Importa pacchetto** nel riquadro «Viaggi da Claude (chat)». I punti aperti restano elencati nella scheda, senza tasto di invio.

## Generatore senza IA (prova, 1.0.17–1.0.23)

1.0.37: orientamento Automatico, Verticale e Orizzontale con pulsante Applica orientamento. Richiede lo schermo intero prima del comando di orientamento a Chrome; salva la scelta solo dopo accettazione. Gestisce rifiuti e uscita da schermo intero, senza ripristinare automaticamente una spunta fuorviante. Nessun blocco automatico all’avvio. Prove di gestione con API simulate; rotazione fisica da verificare sui dispositivi.

1.0.36: il pulsante con tre pallini apre un menu a lista. La voce Schermo apre le impostazioni di visualizzazione esistenti. Conservati formato telefono/tablet, rotazione e preferenze salvate; nessuna modifica ai viaggi.

1.0.35: rimosso dalla testata della schermata del viaggio il riepilogo dei riquadri M3. Le prescrizioni rimangono nelle rispettive progressive della scheda e nel pulsante Prescrizioni M3/M40. Conservati gli altri avvisi e tutti i dati salvati, anche nei viaggi precedenti.

1.0.34: indicatori raggruppati per cifra e ordinati in ordine crescente, conservando i contesti nei dettagli dei segnali. Cerchio rosso sul numero del percorso della Scheda Treno, A verde per le affiancate e A gialla per dubbi o restrizioni. Rimossa la dicitura NON il tuo dai nomi visualizzati. Nessuna modifica ai dati salvati o al motore.

1.0.33: dal rapporto di verifica normativa del 02/11/2026. Il divieto delle colonne 11 (grado IX) e 12 (gradi VII–IX) si controlla solo sul tratto affiancato effettivamente percorso. La linea scelta con le progressive doppie della Scheda è segnalata nel rapporto come ricostruita, da confermare: nessuna norma fissa l'ordine delle due progressive (PGOS-CTI All. IX art. 2/5).

1.0.32: colonna delle Sigle Complementari secondo la PGOS-CTI All. IX art. 9 c.3 b): velocità, rango e percentuale della colonna uguali o inferiori a quelli del treno; treno in regime G solo colonne G, treno in regime P colonne P o G. Tra le colonne valide si propone la meno restrittiva. Sigla 11 mai con grado di frenatura IX e sigla 12 mai con VII, VIII, IX: controllo sui gradi dell'affiancata presenti nel database. Serve il database del 02/11/2026 ore 13:04 o successivo.

1.0.31 (sostituita dalla 1.0.32): corretta la regola della 1.0.30 (indicazione dell'utente): le Sigle Complementari devono essere più restrittive della sigla della Scheda. Valida la colonna con velocità e percentuale UGUALI O PIÙ PICCOLE di quelle del treno (stesso rango, regime G con G); tra le valide la più vicina al treno (velocità più alta, poi percentuale più alta).

1.0.30 (regola sostituita dalla 1.0.31): colonna delle Sigle Complementari con la regola del macchinista: velocità e percentuale di massa frenata del treno uguali o più piccole di quelle della colonna (stesso rango; colonne G solo per treni in regime G); tra le colonne valide la più vicina. La sigla si legge sulla pagina della Scheda di ogni tratto (es. DE18 G60% e poi E494 P55%). Prima serviva la stessa velocità e una percentuale non superiore a quella del treno: con M100A P55% nessuna colonna era valida e le affiancate uscivano con la A gialla.

1.0.29: generatore senza IA con la sola Scheda Treno (prova reale treno 47033 del 02/11/2026, prima pagina intestata DE18 senza «Valida per»). Data del treno dalla prima pagina che la riporta; mezzo intestatario anche diesel (DE18); senza traccia le locomotive vengono dai mezzi intestatari di ogni pagina, ognuna sul suo tratto. A parità di linee si sceglie quella coerente con le progressive doppie della Scheda (prima = arrivo, ultima = partenza: inversione ad Alessandria Sm); a parità di progressiva vince il nome più simile; tolleranza di 2 m inclusa. PL, P.L.A., Plp e RTB della Scheda non entrano nel pacchetto. Stesse correzioni nei programmi Python del database (commit 5e73e9e). Serve il database del 02/11/2026 ore 10:18 o successivo.

1.0.28: rimosse le diciture PERCORRIBILE e NON PERCORRIBILE dai nomi visualizzati delle linee affiancate. Le condizioni nelle note mantengono la A gialla anche quando un vecchio titolo riporta PERCORRIBILE. Nessuna modifica ai viaggi salvati.

1.0.27: A gialla con pulsante dedicato alle note della linea non percorribile o alle condizioni da verificare. Il dettaglio mostra motivi e fonti, senza collegamento alle Sigle Complementari. I dati dei viaggi salvati restano invariati.

1.0.26: nella scheda treno l’indicatore di direzione apre l’elenco delle direzioni e delle linee. La A delle affiancate è mostrata accanto alla linea nella finestra, con il dettaglio delle Sigle Complementari e il ritorno all’elenco. I viaggi già salvati usano la nuova interfaccia senza reimportazione; i dati mancanti restano da studiare.

1.0.25: correzioni dal rapporto di debug, seconda parte. **F10** ogni viaggio senza IA salvato tiene la sua copia delle pagine FL che usa: una nuova edizione scaricata con «Aggiorna dati» non cambia i viaggi già salvati (quelli salvati prima continuano a usare le pagine comuni). **F04** ogni locomotiva della traccia vale solo sui tratti che percorre (cambio mezzo, doppia trazione). **F15** il database importato si controlla anche nella struttura (righe, chiavi, riferimenti, conteggi), non solo nell'impronta. **F07** un solo aggiornamento dati alla volta; import manuali rimandati durante l'aggiornamento. **F09** tempi massimi e un nuovo tentativo per le richieste a GitHub; indice e file dalla stessa revisione. **F11** spegnere il GPS senza un fix non seleziona più la prima riga. **F12** l'archivio del telefono si riapre dopo un errore. **F13** un'apertura lenta non riporta più al viaggio dopo «Home». **F14** un viaggio senza IA danneggiato non blocca l'elenco: si può esportare o eliminare. Prove: `node tests/debug-astra.test.js`; nel browser `node tests/browser/debug-astra.browser.js` (serve Playwright).

1.0.24: correzioni dal rapporto di debug del 29/10/2026 (punti P1). **F01** i valori della Scheda (velocità, grado, indicatore) restano del loro passaggio nelle località attraversate più volte (`loc_1`, `loc_2`…). **F02** se l'itinerario non copre tutto il viaggio il pacchetto è segnato «ITINERARIO PARZIALE» (chip, percorso, primo punto aperto) e il salvataggio chiede conferma. **F03** Scheda Treno di un altro giorno o di un altro treno: non viene unita alla traccia; numeri in parte diversi restano come discrepanza nel pacchetto. **F05** un pacchetto senza IA importato (anche da un altro telefono) conserva le pagine FL incorporate, salvate con il viaggio. **F06** database + informazioni e pagine FL + catalogo si salvano in una sola transazione: un errore non lascia mai metà dei dati. **F08** «Rimuovi token» annulla le richieste in corso: una risposta tardiva non rimette più il token. Prove: `node tests/debug-astra.test.js`.

1.0.23: tasto «Aggiorna dati». Con un token GitHub fine-grained di sola lettura (solo `adc-copilot-db`, Contents: Read-only), salvato solo nel telefono con «Collegamento», la PWA legge `export/indice.json` del repository privato, confronta le impronte con database e pagine FL del telefono e, se c'è qualcosa di nuovo, colora il tasto di rosso con l'elenco delle novità. Toccandolo scarica solo i file cambiati e ne ricontrolla l'impronta prima di installarli; se un file non torna resta quello di prima. Controllo automatico all'avvio, al ritorno della rete e alla riapertura (al massimo ogni 15 minuti); avviso 21 giorni prima della scadenza del token, se indicata. L'importazione manuale resta.

1.0.22: «Importa pagine FL» accetta anche i file con nome non numerico (FERROVIENORD: `img/flfnm_…`).

1.0.21: pagine FL nel fumetto dei viaggi senza IA. Il tasto «Importa pagine FL» legge i file `.adcimg.json` (uno per FL, dal repository privato del database, impronta SHA-256 controllata) e salva le pagine nel telefono (archivio `img`, chiave `fl|img/…`, comuni a tutti i viaggi; un file più recente dello stesso FL sostituisce le pagine). Il generatore mette nel pacchetto, per ogni linea e senso, il gruppo «fiancate» (principale sinistra/destra, poi fiancata di linea) e lo «schema unifilare» solo se le immagini sono nel telefono; le linee senza immagini restano tra i punti da studiare. Il pacchetto scaricato incorpora le pagine usate. Nessuna pagina FL è nel codice pubblico.

1.0.20: i viaggi generati senza IA hanno un archivio separato (IndexedDB versione 2, archivio `viaggi_si`) e un loro elenco «Viaggi senza IA salvati» nel riquadro del generatore, con etichetta SENZA IA anche nella scheda. Convivono con il viaggio di Claude dello stesso treno e data, che resta in «Viaggi salvati». Al primo avvio i viaggi senza IA salvati con la 1.0.17–1.0.19 vengono spostati nel nuovo archivio; un file .adc.json senza IA importato con «Importa pacchetto» va anche lui nel nuovo archivio.

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

