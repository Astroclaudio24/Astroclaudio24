# Ore Commesse

App per tenere traccia delle ore lavorate sulle commesse, utilizzabile su **Windows** e **Android**
(è una *Progressive Web App*: si installa dal browser e funziona anche offline). Esporta tutto in **Excel (.xlsx)**.

## Funzioni

- **Commesse**: codice, nome, cliente, tariffa oraria facoltativa, colore; si possono archiviare.
- **Timer**: avvia/ferma il cronometro su una commessa. Il timer continua anche se chiudi l'app;
  quando lo fermi puoi controllare e correggere il tempo prima di salvarlo. Arrotondamento opzionale (5/10/15/30/60 min).
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
| `vendor/xlsx.mini.min.js` | [SheetJS](https://sheetjs.com) 0.18.5 per creare i file Excel (licenza Apache 2.0) |
| `vendor/firebase.js` | Firebase JS SDK 12.19.0 in un unico file (licenza Apache 2.0), rigenerabile con `tools/build-firebase.sh` |
