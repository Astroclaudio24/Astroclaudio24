# Ore Commesse

App per tenere traccia delle ore lavorate sulle commesse, utilizzabile su **Windows** e **Android**
(è una *Progressive Web App*: si installa dal browser e funziona anche offline). Esporta tutto in **Excel (.xlsx)**.

## Funzioni

- **Commesse**: codice, nome, cliente, tariffa oraria facoltativa, colore; si possono archiviare.
- **Timer**: avvia/ferma il cronometro su una commessa. Il timer continua anche se chiudi l'app;
  quando lo fermi puoi controllare e correggere il tempo prima di salvarlo. Arrotondamento opzionale (5/10/15/30/60 min).
- **Promemoria** «Stai ancora lavorando su…?» ogni 30 min / 1–8 ore (predefinito 2 ore) mentre il timer è attivo:
  finestra nell'app e notifica di sistema con i pulsanti *Sì, continuo* / *No, fermalo*. Se rispondi «No» più tardi,
  come ora di fine viene proposta quella del promemoria, così non conti ore non lavorate.
- **Revit automatico** (PC Windows): con il *ponte Revit* l'app vede quale modello è aperto in Revit e, quando
  cambi modello, salva le ore della commessa precedente e avvia il timer su quella associata.
- **Report mensile** (Excel): foglio *COMMESSE* con tutte le commesse e un foglio per mese con solo le commesse svolte,
  in percentuale della giornata (arrotondata al 10%, somma 100%), più trasferta, nota spese, vitto, totale e attività svolte.
  Il vecchio report si importa una volta per portare nell'app tutto lo storico.
- **Giornata** (📝): attività svolte, ferie, trasferta, nota spese e vitto di ogni giorno.
- **Inserimento manuale**: data, ora inizio/fine, pausa (le ore si calcolano da sole) oppure ore dirette, note.
- **Registro**: filtri per periodo (oggi, settimana, mese, mese scorso, anno, personalizzato) e per commessa,
  totali di ore e importo.
- **Esporta Excel** con tre fogli:
  - *Registrazioni*: Data, Codice, Commessa, Cliente, Inizio, Fine, Pausa, Ore, Note, Tariffa, Importo + riga TOTALE (formule `SOMMA`);
  - *Riepilogo commesse*: ore e importo totali per commessa;
  - *Riepilogo mensile*: ore per mese e per commessa.
- Su Android il pulsante **Condividi Excel** invia il file direttamente a email, WhatsApp, Drive…
- **Sincronizzazione** tra PC e telefono con accesso Google (Firebase): commesse, registrazioni e timer
  si aggiornano in tempo reale; offline le modifiche restano in coda e partono al ritorno della rete.
- **Backup/ripristino** in JSON (con opzione *unisci*).

I dati sono sempre salvati anche sul dispositivo: l'app funziona pure senza account e senza connessione.

## Report mensile

*Dati → Report mensile → Genera report mensile* crea `…Report_mensile_AAAA.xlsx` ([`report.js`](report.js), con
[ExcelJS](https://github.com/exceljs/exceljs)):

- **COMMESSE**: codice, nome, cliente, stato, primo/ultimo giorno lavorato, giornate, ore, modelli Revit;
- **un foglio per mese** («SETTEMBRE 2026»), dal primo mese con dati a quello corrente: data, giorno, una colonna `[%]`
  per ogni commessa lavorata nel mese (in ordine di inizio), TRASFERTA, NOTA SPESE, VITTO, TOTALE, Attività svolte;
  weekend in grigio, ferie in verde, trasferte in arancione, riga TOTALE con giornate per commessa e spese del mese.

Percentuali: quota delle ore registrate nel giorno, arrotondata al 10% con somma 100% (metodo dei resti più grandi);
per i giorni importati restano le percentuali originali (anche le mezze giornate). Le *Attività svolte* sono quelle
scritte nella Giornata (📝) oppure, se mancano, le note delle registrazioni (escluse quelle automatiche di Revit).

*Importa il vecchio report* legge un file con un foglio per mese (colonne commessa «CODICE - NOME [%]», NOTA SPESE,
VITTO, TOTALE, Attività svolte; anche i formati del 2024 con `100` al posto di `100%`, «(TRASFERTA)», «FERIE», spese
come «7,0 + 20,0»): crea le commesse (quelle non usate negli ultimi 3 mesi archiviate), le percentuali giornaliere
(convertite in ore con *Ore di una giornata piena*, predefinito 8) e i dati di giornata. I giorni già registrati
nell'app non vengono toccati; reimportare lo stesso file non crea doppioni.

## Revit automatico (Windows)

1. In **Commesse** apri una commessa e scrivi in **Modelli Revit** i nomi dei modelli (uno per riga; basta una
   parte del nome del file, es. `Villa_Rossi` oppure il codice `C-014`). Vince la corrispondenza più lunga.
2. In **Dati → Revit automatico** attiva l'opzione, scarica `ponte-revit.zip`, estrailo e fai doppio clic su
   **Installa ponte Revit.cmd** (non servono permessi di amministratore).

Il ponte ([`ponte-revit/ponte-revit.ps1`](ponte-revit/ponte-revit.ps1), PowerShell) parte all'accensione del PC,
legge il titolo della finestra di Revit (qualsiasi versione) e risponde solo in locale su
`http://127.0.0.1:47800/stato`. Mostra l'icona di Ore Commesse nell'area di notifica (vicino all'orologio):
un clic apre l'app o la riporta in primo piano. Se l'app viene chiusa mentre in Revit c'è un modello aperto, il ponte
la riapre da solo entro pochi minuti, nello stesso browser (Edge o Chrome) in finestra a sé; si disattiva dal menu
dell'icona. Con un timer in corso, chiudendo l'app il browser chiede conferma.
I test del ponte girano su Windows in GitHub Actions ([`tools/test-ponte.ps1`](tools/test-ponte.ps1)).

Regole del cambio automatico:
- il modello deve restare lo stesso per due letture (circa 10 secondi) prima di cambiare commessa;
- con più Revit aperti conta quello in primo piano; se lavori in un'altra finestra il timer resta dov'è;
- cambiando modello le ore della commessa precedente vengono salvate senza chiedere (al minuto esatto);
- chiudendo Revit o aprendo un modello senza commessa il timer avviato da Revit si ferma (disattivabile);
- se fermi il timer a mano non riparte finché non apri un altro modello;
- un timer avviato a mano resta finché non cambi modello;
- se l'app è rimasta chiusa a lungo, la fine registrata è l'ultima volta in cui il modello risultava aperto.
- se non usi Revit (tastiera e mouse) per 15 minuti (impostabile, anche «mai») il timer si ferma: le ore contano
  fino all'ultima attività e il timer riparte da solo quando torni a lavorare sul modello;
- se il PC va in standby il timer si ferma all'ora in cui il PC si è addormentato.

## Configurare la sincronizzazione (Firebase, gratuito)

1. <https://console.firebase.google.com> → **Crea un progetto**.
2. **Authentication** → *Inizia* → *Metodo di accesso* → **Google** → Abilita → Salva.
3. **Authentication → Impostazioni → Domini autorizzati** → aggiungi il dominio dell'app (es. `astroclaudio24.github.io`).
4. **Firestore Database** → *Crea database* (posizione in Europa, modalità produzione) →
   scheda **Regole** → incolla il contenuto di [`firestore.rules`](firestore.rules) → *Pubblica*.
5. **Impostazioni progetto → Le tue app → Web (`</>`)** → registra l'app e copia l'oggetto `firebaseConfig`
   in [`firebase-config.js`](firebase-config.js) al posto di `null`.

I valori di `firebaseConfig` non sono segreti: i dati sono protetti dall'accesso Google e dalle regole,
che permettono a ciascun utente di leggere e scrivere solo i propri dati (`utenti/{uid}/…`).

## Pubblicazione (una volta sola)

1. Il workflow parte a ogni push sul branch `main` (o sul branch di sviluppo attuale).
2. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Il workflow `.github/workflows/pages.yml` pubblica l'app su
   `https://<utente>.github.io/<repository>/`.

## Installazione

- **Windows**: apri l'indirizzo con Edge o Chrome → icona «Installa app» nella barra degli indirizzi
  (oppure menu ⋯ → *App* → *Installa questo sito come app*). Comparirà nel menu Start come un'app normale.
- **Android**: apri l'indirizzo con Chrome → menu ⋮ → *Installa app* / *Aggiungi a schermata Home*.

## Uso in locale

Puoi anche aprire `index.html` direttamente con doppio clic (in questo caso non funziona la modalità offline),
oppure avviare un piccolo server: `python -m http.server` e aprire `http://localhost:8000`.

## Struttura

| File | Contenuto |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'app |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installazione e funzionamento offline |
| `sync.js`, `firebase-config.js`, `firestore.rules` | Sincronizzazione tramite Firebase |
| `ponte-revit/` | Ponte Revit per Windows (script PowerShell + installazione/disinstallazione) |
| `report.js` | Report mensile: generazione, importazione dello storico, dati della giornata |
| `vendor/exceljs.min.js` | [ExcelJS](https://github.com/exceljs/exceljs) 4.4.0 per il report formattato (licenza MIT) |
| `vendor/xlsx.mini.min.js` | [SheetJS](https://sheetjs.com) 0.18.5 per creare i file Excel (licenza Apache 2.0) |
| `vendor/firebase.js` | Firebase JS SDK 12.19.0 in un unico file (licenza Apache 2.0), rigenerabile con `tools/build-firebase.sh` |
