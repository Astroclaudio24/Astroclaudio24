// Sincronizzazione tra dispositivi tramite Firebase (accesso Google + Firestore).
//
// I dati restano salvati sul dispositivo (localStorage) e l'app funziona anche
// senza account. Dopo l'accesso, ogni modifica locale viene inviata a Firestore
// e le modifiche fatte sugli altri dispositivi arrivano in tempo reale.
//
// Struttura su Firestore:
//   utenti/{uid}/commesse/{id}
//   utenti/{uid}/registrazioni/{id}
//   utenti/{uid}/meta/stato        -> { timer, impostazioni }

const cfg = window.FIREBASE_CONFIG;
const App = window.OreApp;
const BASE_KEY = 'oreCommesse.syncBase';
const COLLEZIONI = ['commesse', 'registrazioni'];

let fb = null, auth = null, db = null, utente = null;
let ascolti = [];
let base = null;            // ciò che sappiamo essere su Firestore: id -> impronta
const flag = {};            // stato dei listener: { pendenti, cache }
let stato = cfg ? 'avvio' : 'non-configurata';
let errore = '';

/* ---------- impronte per confrontare i documenti ---------- */

function stabile(v) {
  if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + stabile(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

function impronta(v) {
  const s = stabile(v);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const pulisci = v => JSON.parse(JSON.stringify(v));
const meta = s => ({ timer: s.timer || null, impostazioni: s.impostazioni || {} });
const perId = arr => arr.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

function baseVuota(uid) { return { uid, commesse: {}, registrazioni: {}, meta: null }; }

function caricaBase() {
  try { return JSON.parse(localStorage.getItem(BASE_KEY)); } catch (e) { return null; }
}
function salvaBase() {
  try { localStorage.setItem(BASE_KEY, JSON.stringify(base)); } catch (e) { /* spazio esaurito */ }
}

/* ---------- stato mostrato nell'interfaccia ---------- */

function messaggioErrore(e) {
  const code = (e && e.code) || '';
  if (code === 'auth/unauthorized-domain') {
    return `Dominio non autorizzato. In Firebase → Authentication → Settings → Domini autorizzati aggiungi «${location.hostname}».`;
  }
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Accesso ai dati negato: controlla le regole di Firestore (vedi firestore.rules).';
  }
  if (code === 'auth/network-request-failed') return 'Nessuna connessione: riprova quando sei online.';
  return (e && e.message) || String(e);
}

function segnalaErrore(e) {
  console.error(e);
  errore = messaggioErrore(e);
  stato = 'errore';
  App.aggiornaSync();
}

function ricalcolaStato() {
  if (!utente) { stato = 'disconnesso'; }
  else if (stato !== 'errore') {
    const f = Object.values(flag);
    if (f.some(x => x.pendenti)) stato = 'in-attesa';
    else if (f.length < 3 || f.some(x => x.cache)) stato = 'offline';
    else stato = 'sincronizzato';
  }
  App.aggiornaSync();
}

/* ---------- invio delle modifiche locali ---------- */

function refDoc(col, id) { return fb.doc(db, 'utenti', utente.uid, col, id); }

function push() {
  if (!utente || !db || !base) return;
  const s = App.state;
  const ops = [];
  for (const col of COLLEZIONI) {
    const noti = base[col];
    const presenti = new Set();
    for (const item of s[col]) {
      if (!item || !item.id) continue;
      presenti.add(item.id);
      const h = impronta(item);
      if (noti[item.id] !== h) {
        ops.push({ ref: refDoc(col, item.id), dati: pulisci(item) });
        noti[item.id] = h;
      }
    }
    for (const id of Object.keys(noti)) {
      if (!presenti.has(id)) {
        ops.push({ ref: refDoc(col, id), dati: null });
        delete noti[id];
      }
    }
  }
  const m = meta(s);
  const hm = impronta(m);
  if (base.meta !== hm) {
    ops.push({ ref: refDoc('meta', 'stato'), dati: pulisci(m) });
    base.meta = hm;
  }
  if (!ops.length) return;
  salvaBase();
  // Firestore accetta al massimo 500 operazioni per batch.
  for (let i = 0; i < ops.length; i += 400) {
    const batch = fb.writeBatch(db);
    ops.slice(i, i + 400).forEach(o => (o.dati ? batch.set(o.ref, o.dati) : batch.delete(o.ref)));
    batch.commit().catch(segnalaErrore);
  }
}

/* ---------- ricezione delle modifiche remote ---------- */

function ascoltaCollezione(col) {
  return fb.onSnapshot(fb.collection(db, 'utenti', utente.uid, col), { includeMetadataChanges: true }, snap => {
    flag[col] = { pendenti: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache };
    // Prudenza: una cache vuota non deve cancellare i dati locali; si attende il server.
    if (snap.metadata.fromCache && snap.empty && App.state[col].length) { ricalcolaStato(); return; }
    const arr = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
    const noti = {};
    arr.forEach(x => { noti[x.id] = impronta(x); });
    base[col] = noti;
    salvaBase();
    const cambiato = impronta(perId(App.state[col])) !== impronta(perId(arr));
    App.applicaRemoto(col, arr, cambiato);
    ricalcolaStato();
  }, segnalaErrore);
}

function ascoltaMeta() {
  return fb.onSnapshot(refDoc('meta', 'stato'), { includeMetadataChanges: true }, snap => {
    flag.meta = { pendenti: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache };
    if (!snap.exists()) {
      // Nessun dato remoto (primo accesso assoluto): invia quelli locali.
      if (!snap.metadata.fromCache) { base.meta = null; push(); }
    } else {
      const m = snap.data();
      base.meta = impronta(m);
      salvaBase();
      App.applicaRemoto('meta', m, impronta(meta(App.state)) !== base.meta);
      push(); // riallinea eventuali impostazioni predefinite mancanti sul server
    }
    ricalcolaStato();
  }, segnalaErrore);
}

/* ---------- accesso ---------- */

function avvia(u) {
  utente = u;
  errore = '';
  stato = 'offline';
  const salvata = caricaBase();
  if (salvata && salvata.uid === u.uid) {
    base = salvata;
  } else {
    // Primo accesso con questo account su questo dispositivo: i dati locali
    // vengono uniti a quelli già presenti nel cloud. Il timer locale viene
    // inviato solo se è in corso, per non annullarne uno avviato altrove.
    base = baseVuota(u.uid);
    if (!App.state.timer) base.meta = impronta(meta(App.state));
  }
  push();
  ascolti = [ascoltaCollezione('commesse'), ascoltaCollezione('registrazioni'), ascoltaMeta()];
  ricalcolaStato();
}

function ferma() {
  ascolti.forEach(fn => fn());
  ascolti = [];
  Object.keys(flag).forEach(k => delete flag[k]);
  utente = null;
  ricalcolaStato();
}

async function accedi() {
  if (!auth) return;
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.signInWithRedirect(auth, provider).catch(segnalaErrore);
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      segnalaErrore(e);
    }
  }
}

async function esci() {
  if (!auth) return;
  await fb.signOut(auth);
  localStorage.removeItem(BASE_KEY);
  base = null;
}

window.OreSync = {
  push,
  accedi,
  esci,
  info: () => ({
    configurata: !!cfg,
    stato,
    errore,
    email: utente ? utente.email : '',
    nome: utente ? utente.displayName : ''
  })
};

if (cfg) {
  try {
    fb = await import('./vendor/firebase.js');
    const app = fb.initializeApp(cfg);
    auth = fb.getAuth(app);
    auth.languageCode = 'it';
    db = fb.initializeFirestore(app, {
      localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() })
    });
    // Solo per sviluppo/test: emulatori locali di Firebase.
    const emu = window.FIREBASE_EMULATORI;
    if (emu) {
      fb.connectAuthEmulator(auth, emu.auth, { disableWarnings: true });
      fb.connectFirestoreEmulator(db, emu.firestoreHost, emu.firestorePort);
    }
    fb.getRedirectResult(auth).catch(segnalaErrore);
    fb.onAuthStateChanged(auth, u => (u ? avvia(u) : ferma()));
  } catch (e) {
    segnalaErrore(e);
  }
}
App.aggiornaSync();
