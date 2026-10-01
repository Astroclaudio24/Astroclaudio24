'use strict';

/* ================== Stato e persistenza ================== */

const STORAGE_KEY = 'oreCommesse.v1';
const COLORI = ['#1f6feb', '#d1242f', '#1a7f37', '#bf8700', '#8250df', '#e16f24', '#0598bc', '#bf3989'];

function statoVuoto() {
  return {
    versione: 1,
    commesse: [],
    registrazioni: [],
    timer: null,
    impostazioni: { arrotondamento: 0, promemoria: 2 }
  };
}

function normalizza(s) {
  const d = statoVuoto();
  if (!s || typeof s !== 'object') return d;
  return {
    versione: 1,
    commesse: Array.isArray(s.commesse) ? s.commesse : [],
    registrazioni: Array.isArray(s.registrazioni) ? s.registrazioni : [],
    timer: s.timer && s.timer.commessaId && s.timer.start ? s.timer : null,
    impostazioni: Object.assign({}, d.impostazioni, s.impostazioni || {})
  };
}

function carica() {
  try {
    return normalizza(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (e) {
    return statoVuoto();
  }
}

let state = carica();

function salvaLocale() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('Impossibile salvare i dati: ' + e.message);
  }
}

// Salva sul dispositivo e, se attiva, invia le modifiche al cloud (sync.js).
function salva() {
  salvaLocale();
  if (window.OreSync) window.OreSync.push();
}

// Chiede al browser di non cancellare i dati in caso di poco spazio.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ================== Utilità ================== */

const $ = (sel, root = document) => root.querySelector(sel);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

const pad = n => String(n).padStart(2, '0');

function isoData(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function oggiISO() { return isoData(new Date()); }

function daISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtData(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

function fmtGiorno(iso) {
  return daISO(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function minuti(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function round2(n) { return Math.round(n * 100) / 100; }

function fmtOre(n) {
  return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtEuro(n) {
  return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function fmtDurata(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
}

function oreDaOrari(inizio, fine, pausa) {
  const a = minuti(inizio), b = minuti(fine);
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60; // attraversa la mezzanotte
  diff -= Number(pausa) || 0;
  return round2(Math.max(0, diff) / 60);
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function commessa(id) { return state.commesse.find(c => c.id === id); }

function etichetta(c) {
  if (!c) return '(commessa eliminata)';
  return c.codice ? c.codice + ' – ' + c.nome : c.nome;
}

function opzioniCommesse(selezionata, includiArchiviate) {
  return state.commesse
    .filter(c => includiArchiviate || !c.archiviata || c.id === selezionata)
    .slice()
    .sort((a, b) => etichetta(a).localeCompare(etichetta(b), 'it'))
    .map(c => `<option value="${esc(c.id)}"${c.id === selezionata ? ' selected' : ''}>${esc(etichetta(c))}</option>`)
    .join('');
}

function ordinaRegistrazioni(list, desc) {
  const k = r => r.data + ' ' + (r.inizio || '99:99');
  return list.slice().sort((a, b) => desc ? k(b).localeCompare(k(a)) : k(a).localeCompare(k(b)));
}

function totaleOre(list) { return round2(list.reduce((s, r) => s + (Number(r.ore) || 0), 0)); }

/* ================== Periodi ================== */

const filtro = { periodo: 'mese', da: '', a: '', commessaId: '' };

function intervalloPeriodo(p) {
  const oggi = new Date();
  const y = oggi.getFullYear(), m = oggi.getMonth();
  switch (p) {
    case 'oggi': return [oggiISO(), oggiISO()];
    case 'settimana': {
      const lun = new Date(oggi);
      lun.setDate(oggi.getDate() - ((oggi.getDay() + 6) % 7));
      const dom = new Date(lun);
      dom.setDate(lun.getDate() + 6);
      return [isoData(lun), isoData(dom)];
    }
    case 'mese': return [isoData(new Date(y, m, 1)), isoData(new Date(y, m + 1, 0))];
    case 'mese_scorso': return [isoData(new Date(y, m - 1, 1)), isoData(new Date(y, m, 0))];
    case 'anno': return [y + '-01-01', y + '-12-31'];
    case 'tutto': return ['', ''];
    default: return [filtro.da, filtro.a];
  }
}

function registrazioniFiltrate() {
  const [da, a] = intervalloPeriodo(filtro.periodo);
  return state.registrazioni.filter(r =>
    (!da || r.data >= da) &&
    (!a || r.data <= a) &&
    (!filtro.commessaId || r.commessaId === filtro.commessaId));
}

/* ================== Navigazione ================== */

let vista = 'timer';

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  vista = b.dataset.view;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  render();
  window.scrollTo(0, 0);
});

function render() {
  const app = $('#app');
  if (vista === 'timer') app.innerHTML = vistaTimer();
  else if (vista === 'registro') app.innerHTML = vistaRegistro();
  else if (vista === 'commesse') app.innerHTML = vistaCommesse();
  else app.innerHTML = vistaDati();
  aggiornaOrologio();
}

/* ================== Vista: Timer ================== */

function rigaRegistrazione(r, mostraData) {
  const c = commessa(r.commessaId);
  const orari = r.inizio && r.fine ? r.inizio + '–' + r.fine : '';
  const sub = [mostraData ? fmtData(r.data) : '', orari, r.note].filter(Boolean).join(' · ');
  return `<li data-reg="${esc(r.id)}">
    <span class="dot" style="background:${esc(c ? c.colore : '#999')}"></span>
    <div class="main">
      <div class="title">${esc(etichetta(c))}</div>
      <div class="sub">${esc(sub) || '&nbsp;'}</div>
    </div>
    <span class="hours">${fmtOre(r.ore)} h</span>
  </li>`;
}

function vistaTimer() {
  let html = '';
  const t = state.timer;
  if (t) {
    const c = commessa(t.commessaId);
    html += `<section class="card">
      <div class="running-title"><span class="dot" style="background:${esc(c ? c.colore : '#999')}"></span>${esc(etichetta(c))}</div>
      <div class="clock" id="clock">00:00:00</div>
      <p class="muted small" style="text-align:center">Avviato alle ${hhmm(new Date(t.start))} del ${fmtData(isoData(new Date(t.start)))}</p>
      <label>Note / attività
        <input id="timerNote" value="${esc(t.note || '')}" placeholder="Cosa stai facendo?">
      </label>
      <div class="actions">
        <button class="danger" data-act="timer-annulla">Annulla</button>
        <span class="spacer"></span>
        <button class="primary" data-act="timer-stop">■ Ferma e salva</button>
      </div>
    </section>`;
  } else if (state.commesse.some(c => !c.archiviata)) {
    html += `<section class="card">
      <h2>Avvia timer</h2>
      <label>Commessa
        <select id="timerCommessa">${opzioniCommesse(state.impostazioni.ultimaCommessa)}</select>
      </label>
      <label>Note / attività
        <input id="timerNote" placeholder="Facoltativo">
      </label>
      <button class="primary big" data-act="timer-start">▶ Avvia</button>
    </section>`;
  } else {
    html += `<section class="card empty">
      <p>Nessuna commessa attiva. Crea la tua prima commessa per iniziare.</p>
      <button class="primary" data-act="nuova-commessa">+ Nuova commessa</button>
    </section>`;
  }

  const oggi = ordinaRegistrazioni(state.registrazioni.filter(r => r.data === oggiISO()), false);
  const [ls, ds] = intervalloPeriodo('settimana');
  const [lm, dm] = intervalloPeriodo('mese');
  const sett = state.registrazioni.filter(r => r.data >= ls && r.data <= ds);
  const mese = state.registrazioni.filter(r => r.data >= lm && r.data <= dm);

  html += `<section class="card">
    <div class="stats">
      <div class="stat"><div class="v">${fmtOre(totaleOre(oggi))}</div><div class="l">ore oggi</div></div>
      <div class="stat"><div class="v">${fmtOre(totaleOre(sett))}</div><div class="l">ore questa settimana</div></div>
      <div class="stat"><div class="v">${fmtOre(totaleOre(mese))}</div><div class="l">ore questo mese</div></div>
    </div>
  </section>
  <section class="card">
    <div class="actions" style="margin:0 0 8px">
      <h2 style="margin:0">Oggi</h2>
      <span class="spacer"></span>
      <button data-act="nuova-reg"${state.commesse.length ? '' : ' disabled'}>+ Aggiungi ore</button>
    </div>
    ${oggi.length ? `<ul class="list">${oggi.map(r => rigaRegistrazione(r, false)).join('')}</ul>`
                  : '<p class="empty">Nessuna registrazione oggi.</p>'}
  </section>`;
  return html;
}

function aggiornaOrologio() {
  const el = $('#clock');
  if (state.timer && el) {
    const txt = fmtDurata(Date.now() - new Date(state.timer.start).getTime());
    el.textContent = txt;
    document.title = txt + ' · Ore Commesse';
  } else {
    document.title = 'Ore Commesse';
  }
}
setInterval(aggiornaOrologio, 1000);

function avviaTimer() {
  const id = $('#timerCommessa').value;
  if (!id) return;
  const ora = new Date().toISOString();
  state.timer = { commessaId: id, start: ora, confermato: ora, note: $('#timerNote').value.trim() };
  state.impostazioni.ultimaCommessa = id;
  salva();
  render();
  chiediPermessoNotifiche();
}

// fineStimata: ora di fine proposta (di default adesso).
function fermaTimer(fineStimata) {
  const t = state.timer;
  if (!t) return;
  const note = $('#timerNote') ? $('#timerNote').value.trim() : t.note;
  const inizio = new Date(t.start);
  const fine = fineStimata || new Date();
  let min = (fine - inizio) / 60000;
  const step = Number(state.impostazioni.arrotondamento) || 0;
  if (step > 0) min = Math.max(step, Math.round(min / step) * step);
  apriRegistrazione(null, {
    commessaId: t.commessaId,
    data: isoData(inizio),
    inizio: hhmm(inizio),
    fine: hhmm(fine),
    pausa: 0,
    ore: round2(min / 60),
    note
  }, true);
}

/* ================== Promemoria durante il timer ================== */

// Ogni N ore (impostazioni.promemoria) chiede se si sta ancora lavorando
// sulla commessa: finestra nell'app e, se permesso, notifica di sistema.

const dlgProm = $('#dlgPromemoria');
let ultimaNotifica = '';

function intervalloPromemoria() {
  return (Number(state.impostazioni.promemoria) || 0) * 3600000;
}

// Momento in cui scatta il prossimo promemoria (ms), o null.
function scadenzaPromemoria() {
  const t = state.timer;
  const ms = intervalloPromemoria();
  if (!t || !ms) return null;
  return new Date(t.confermato || t.start).getTime() + ms;
}

function chiediPermessoNotifiche() {
  if (!intervalloPromemoria() || !('Notification' in window) || Notification.permission !== 'default') return;
  Notification.requestPermission().then(() => { if (vista === 'dati') render(); }).catch(() => {});
}

function inviaNotifica(testo) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
  navigator.serviceWorker.ready.then(reg => reg.showNotification('Ore Commesse', {
    body: testo,
    tag: 'promemoria-timer',
    renotify: true,
    requireInteraction: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    actions: [{ action: 'si', title: 'Sì, continuo' }, { action: 'no', title: 'No, fermalo' }]
  })).catch(() => {});
}

function chiudiNotifiche() {
  if (!navigator.serviceWorker) return;
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg =>
    reg.getNotifications({ tag: 'promemoria-timer' }).then(ns => ns.forEach(n => n.close()))
  )).catch(() => {});
}

function controllaPromemoria() {
  const scad = scadenzaPromemoria();
  const dovuto = scad != null && Date.now() >= scad;
  if (!dovuto) {
    if (dlgProm.open) dlgProm.close();
    return;
  }
  const c = commessa(state.timer.commessaId);
  const testo = `Stai ancora lavorando su «${etichetta(c)}»?`;
  const chiave = state.timer.start + '|' + (state.timer.confermato || '');
  if (ultimaNotifica !== chiave) {
    ultimaNotifica = chiave;
    if (document.visibilityState !== 'visible') inviaNotifica(testo + ` Timer avviato alle ${hhmm(new Date(state.timer.start))}.`);
  }
  if (document.visibilityState === 'visible' && !dlgProm.open && !dlgReg.open) {
    $('#promTesto').textContent = testo;
    $('#promDettagli').textContent =
      `Timer avviato alle ${hhmm(new Date(state.timer.start))} del ${fmtData(isoData(new Date(state.timer.start)))}` +
      (state.timer.confermato && state.timer.confermato !== state.timer.start
        ? ` · ultima conferma alle ${hhmm(new Date(state.timer.confermato))}.` : '.');
    dlgProm.showModal();
  }
}

function rispostaPromemoria(azione) {
  if (dlgProm.open) dlgProm.close();
  chiudiNotifiche();
  if (!state.timer) return;
  if (azione === 'si') {
    state.timer.confermato = new Date().toISOString();
    salva();
    toast('Ok, il timer continua');
  } else if (azione === 'no') {
    // Se non hai risposto subito, propone come fine l'ora del promemoria.
    const scad = scadenzaPromemoria();
    const fine = new Date(Math.min(Date.now(), scad || Date.now()));
    vista = 'timer';
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.view === 'timer'));
    render();
    fermaTimer(fine);
    if (fine < Date.now() - 60000) toast('Controlla l\'ora di fine proposta');
  }
}

$('#btnPromSi').addEventListener('click', () => rispostaPromemoria('si'));
$('#btnPromNo').addEventListener('click', () => rispostaPromemoria('no'));
dlgProm.addEventListener('cancel', e => e.preventDefault());

setInterval(controllaPromemoria, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') controllaPromemoria(); });

// Risposte dai pulsanti della notifica (vedi sw.js).
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.tipo === 'promemoria') rispostaPromemoria(e.data.azione);
  });
}

/* ================== Vista: Registro ================== */

function vistaRegistro() {
  const list = registrazioniFiltrate();
  const totale = totaleOre(list);
  const perCommessa = {};
  list.forEach(r => { perCommessa[r.commessaId] = (perCommessa[r.commessaId] || 0) + (Number(r.ore) || 0); });
  let importo = 0;
  Object.keys(perCommessa).forEach(id => {
    const c = commessa(id);
    if (c && c.tariffa) importo += perCommessa[id] * c.tariffa;
  });

  const periodi = [
    ['oggi', 'Oggi'], ['settimana', 'Questa settimana'], ['mese', 'Questo mese'],
    ['mese_scorso', 'Mese scorso'], ['anno', "Quest'anno"], ['tutto', 'Tutto'], ['custom', 'Personalizzato…']
  ];
  const [da, a] = intervalloPeriodo(filtro.periodo);

  // Raggruppa per giorno (più recenti in alto)
  const gruppi = [];
  ordinaRegistrazioni(list, true).forEach(r => {
    const g = gruppi[gruppi.length - 1];
    if (g && g.data === r.data) g.items.push(r);
    else gruppi.push({ data: r.data, items: [r] });
  });

  const condivisione = !!(navigator.canShare && window.File);

  return `<section class="card">
    <div class="row">
      <label>Periodo
        <select id="fPeriodo">${periodi.map(([v, l]) => `<option value="${v}"${v === filtro.periodo ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      <label>Commessa
        <select id="fCommessa"><option value="">Tutte</option>${opzioniCommesse(filtro.commessaId, true)}</select>
      </label>
    </div>
    ${filtro.periodo === 'custom' ? `<div class="row">
      <label>Dal <input type="date" id="fDa" value="${esc(filtro.da)}"></label>
      <label>Al <input type="date" id="fA" value="${esc(filtro.a)}"></label>
    </div>` : `<p class="muted small" style="margin:0 0 8px">${da ? fmtData(da) + ' – ' + fmtData(a) : 'Tutte le date'}</p>`}
    <div class="stats">
      <div class="stat"><div class="v">${fmtOre(totale)}</div><div class="l">ore totali</div></div>
      <div class="stat"><div class="v">${list.length}</div><div class="l">registrazioni</div></div>
      ${importo ? `<div class="stat"><div class="v">${fmtEuro(importo)}</div><div class="l">importo</div></div>` : ''}
    </div>
    <div class="chips">${Object.keys(perCommessa).map(id => {
      const c = commessa(id);
      return `<span class="chip"><span class="dot" style="background:${esc(c ? c.colore : '#999')}"></span>${esc(etichetta(c))}: <b>&nbsp;${fmtOre(perCommessa[id])} h</b></span>`;
    }).join('')}</div>
    <div class="actions" style="margin-top:14px">
      <button class="primary" data-act="export"${list.length ? '' : ' disabled'}>⬇ Esporta Excel</button>
      ${condivisione ? `<button data-act="share"${list.length ? '' : ' disabled'}>Condividi Excel</button>` : ''}
      <span class="spacer"></span>
      <button data-act="nuova-reg"${state.commesse.length ? '' : ' disabled'}>+ Aggiungi ore</button>
    </div>
  </section>
  <section class="card">
    ${gruppi.length ? gruppi.map(g => `
      <div class="day-head"><span>${esc(fmtGiorno(g.data))}</span><span>${fmtOre(totaleOre(g.items))} h</span></div>
      <ul class="list">${g.items.map(r => rigaRegistrazione(r, false)).join('')}</ul>`).join('')
      : '<p class="empty">Nessuna registrazione nel periodo selezionato.</p>'}
  </section>`;
}

/* ================== Vista: Commesse ================== */

function vistaCommesse() {
  const ore = {};
  state.registrazioni.forEach(r => { ore[r.commessaId] = (ore[r.commessaId] || 0) + (Number(r.ore) || 0); });
  const ordinate = state.commesse.slice().sort((a, b) => etichetta(a).localeCompare(etichetta(b), 'it'));
  const attive = ordinate.filter(c => !c.archiviata);
  const archiviate = ordinate.filter(c => c.archiviata);
  const riga = c => `<li data-com="${esc(c.id)}">
    <span class="dot" style="background:${esc(c.colore)}"></span>
    <div class="main">
      <div class="title">${esc(etichetta(c))}</div>
      <div class="sub">${esc([c.cliente, c.tariffa ? fmtEuro(c.tariffa) + '/h' : ''].filter(Boolean).join(' · ')) || '&nbsp;'}</div>
    </div>
    <span class="hours">${fmtOre(ore[c.id] || 0)} h</span>
  </li>`;

  return `<section class="card">
    <div class="actions" style="margin:0 0 8px">
      <h2 style="margin:0">Commesse attive</h2>
      <span class="spacer"></span>
      <button class="primary" data-act="nuova-commessa">+ Nuova</button>
    </div>
    ${attive.length ? `<ul class="list">${attive.map(riga).join('')}</ul>` : '<p class="empty">Nessuna commessa attiva.</p>'}
  </section>
  ${archiviate.length ? `<section class="card">
    <h2>Archiviate</h2>
    <ul class="list">${archiviate.map(riga).join('')}</ul>
  </section>` : ''}`;
}

/* ================== Vista: Dati ================== */

function statoNotifiche() {
  if (!intervalloPromemoria()) return '';
  if (!('Notification' in window)) return '<p class="muted small">Questo browser non supporta le notifiche: il promemoria compare quando apri l\'app.</p>';
  if (Notification.permission === 'granted') return '<p class="muted small">Notifiche attive. Se l\'app è chiusa da tempo, la domanda compare alla prossima apertura.</p>';
  if (Notification.permission === 'denied') return '<p class="muted small">Notifiche bloccate: il promemoria compare solo ad app aperta. Puoi riattivarle dalle impostazioni del browser/sito.</p>';
  return '<button data-act="notifiche">🔔 Attiva le notifiche</button>';
}

function vistaDati() {
  const arr = Number(state.impostazioni.arrotondamento) || 0;
  const prom = Number(state.impostazioni.promemoria) || 0;
  return `${cardSync()}
  <section class="card">
    <h2>Impostazioni</h2>
    <label>Arrotondamento del timer
      <select id="impArrotonda">
        ${[[0, 'Nessuno (minuto esatto)'], [5, '5 minuti'], [10, '10 minuti'], [15, '15 minuti'], [30, '30 minuti'], [60, '1 ora']]
          .map(([v, l]) => `<option value="${v}"${v === arr ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
    </label>
    <label>Promemoria «Stai ancora lavorando?» con il timer attivo
      <select id="impPromemoria">
        ${[[0, 'Disattivato'], [0.5, 'Ogni 30 minuti'], [1, 'Ogni ora'], [2, 'Ogni 2 ore'], [3, 'Ogni 3 ore'], [4, 'Ogni 4 ore'], [6, 'Ogni 6 ore'], [8, 'Ogni 8 ore']]
          .map(([v, l]) => `<option value="${v}"${v === prom ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
    </label>
    ${statoNotifiche()}
  </section>
  <section class="card">
    <h2>Backup</h2>
    <p class="muted small">Esporta periodicamente un backup: è un file che contiene tutte le commesse e le registrazioni.
      Senza sincronizzazione serve anche per spostare i dati tra PC e telefono (puoi scegliere di unirli ai dati esistenti).</p>
    <div class="actions">
      <button data-act="backup">⬇ Esporta backup (.json)</button>
      <button data-act="import">⬆ Importa backup</button>
    </div>
    <p class="muted small">${state.commesse.length} commesse · ${state.registrazioni.length} registrazioni</p>
  </section>
  <section class="card">
    <h2>Installa l'app</h2>
    <p class="small"><b>Windows:</b> apri questa pagina con Edge o Chrome e clicca l'icona «Installa app» nella barra degli indirizzi
      (oppure menu ⋯ → App → Installa questo sito come app).</p>
    <p class="small"><b>Android:</b> apri la pagina con Chrome, menu ⋮ → «Installa app» / «Aggiungi a schermata Home».</p>
    <p class="small muted">Dopo l'installazione l'app funziona anche senza connessione.</p>
  </section>
  <section class="card">
    <h2>Zona pericolosa</h2>
    <button class="danger" data-act="reset">Cancella tutti i dati</button>
  </section>`;
}

/* ================== Sincronizzazione ================== */

const TESTI_SYNC = {
  'avvio': ['…', 'Avvio in corso'],
  'disconnesso': ['☁ non connesso', 'Non connesso'],
  'offline': ['☁ offline', 'Offline: le modifiche verranno inviate appena torna la connessione'],
  'in-attesa': ['☁ invio…', 'Invio delle modifiche in corso'],
  'sincronizzato': ['☁ ✓', 'Sincronizzato'],
  'errore': ['☁ errore', 'Errore']
};

function infoSync() {
  return window.OreSync ? window.OreSync.info() : { configurata: !!window.FIREBASE_CONFIG, stato: 'avvio' };
}

function cardSync() {
  const i = infoSync();
  if (!i.configurata) {
    return `<section class="card">
      <h2>Sincronizzazione</h2>
      <p class="muted small">Sincronizzazione non ancora configurata: i dati sono salvati solo su questo dispositivo.</p>
    </section>`;
  }
  const testo = (TESTI_SYNC[i.stato] || TESTI_SYNC.avvio)[1];
  if (i.email) {
    return `<section class="card">
      <h2>Sincronizzazione</h2>
      <p class="small">Connesso come <b>${esc(i.email)}</b></p>
      <p class="small">Stato: <b>${esc(testo)}</b></p>
      ${i.errore ? `<p class="small" style="color:var(--danger)">${esc(i.errore)}</p>` : ''}
      <p class="muted small">Accedi con lo stesso account Google su PC e telefono: commesse, registrazioni e timer
        si aggiornano automaticamente su tutti i dispositivi.</p>
      <button data-act="sync-esci">Esci</button>
    </section>`;
  }
  return `<section class="card">
    <h2>Sincronizzazione</h2>
    <p class="small">Accedi con il tuo account Google per avere gli stessi dati su PC e telefono.
      I dati già presenti su questo dispositivo verranno uniti a quelli nel cloud.</p>
    ${i.errore ? `<p class="small" style="color:var(--danger)">${esc(i.errore)}</p>` : ''}
    <button class="primary" data-act="sync-accedi"${i.stato === 'avvio' ? ' disabled' : ''}>Accedi con Google</button>
  </section>`;
}

function aggiornaBadge() {
  const b = $('#syncBadge');
  const i = infoSync();
  b.hidden = !i.configurata;
  const [breve, lungo] = TESTI_SYNC[i.stato] || TESTI_SYNC.avvio;
  b.textContent = breve;
  b.title = lungo;
  b.className = 'sync-badge ' + i.stato;
}

// Interfaccia usata da sync.js
window.OreApp = {
  get state() { return state; },
  applicaRemoto(parte, valore, cambiato) {
    if (parte === 'meta') {
      state.timer = valore.timer && valore.timer.commessaId ? valore.timer : null;
      state.impostazioni = Object.assign({}, statoVuoto().impostazioni, valore.impostazioni || {});
    } else {
      state[parte] = valore;
    }
    salvaLocale();
    if (cambiato) { render(); controllaPromemoria(); }
  },
  aggiornaSync() {
    aggiornaBadge();
    if (vista === 'dati') render();
  }
};

$('#syncBadge').addEventListener('click', () => $('#tabs button[data-view="dati"]').click());

/* ================== Dialog registrazione ================== */

const dlgReg = $('#dlgReg');
const formReg = $('#formReg');
let regInModifica = null;
let regDaTimer = false;

function apriRegistrazione(id, preset, daTimer) {
  const r = id ? state.registrazioni.find(x => x.id === id) : null;
  regInModifica = r ? r.id : null;
  regDaTimer = !!daTimer;
  const v = r || preset || {
    commessaId: filtro.commessaId || state.impostazioni.ultimaCommessa,
    data: oggiISO(), inizio: '', fine: '', pausa: '', ore: '', note: ''
  };
  $('#dlgRegTitle').textContent = daTimer ? 'Salva tempo del timer' : (r ? 'Modifica registrazione' : 'Nuova registrazione');
  formReg.commessaId.innerHTML = opzioniCommesse(v.commessaId);
  formReg.data.value = v.data || oggiISO();
  formReg.inizio.value = v.inizio || '';
  formReg.fine.value = v.fine || '';
  formReg.pausa.value = v.pausa || '';
  formReg.ore.value = v.ore === '' || v.ore == null ? '' : v.ore;
  formReg.note.value = v.note || '';
  $('#btnRegDelete').hidden = !r;
  dlgReg.showModal();
}

function ricalcolaOre() {
  const ore = oreDaOrari(formReg.inizio.value, formReg.fine.value, formReg.pausa.value);
  if (ore != null) formReg.ore.value = ore;
}
formReg.inizio.addEventListener('change', ricalcolaOre);
formReg.fine.addEventListener('change', ricalcolaOre);
formReg.pausa.addEventListener('input', ricalcolaOre);

$('#btnRegCancel').addEventListener('click', () => dlgReg.close());

$('#btnRegDelete').addEventListener('click', () => {
  if (!regInModifica || !confirm('Eliminare questa registrazione?')) return;
  state.registrazioni = state.registrazioni.filter(r => r.id !== regInModifica);
  salva();
  dlgReg.close();
  render();
});

formReg.addEventListener('submit', e => {
  e.preventDefault();
  const ore = round2(parseFloat(String(formReg.ore.value).replace(',', '.')));
  if (!formReg.commessaId.value) { alert('Seleziona una commessa.'); return; }
  if (!(ore > 0)) { alert('Inserisci un numero di ore maggiore di zero.'); return; }
  const dati = {
    commessaId: formReg.commessaId.value,
    data: formReg.data.value,
    inizio: formReg.inizio.value,
    fine: formReg.fine.value,
    pausa: Number(formReg.pausa.value) || 0,
    ore,
    note: formReg.note.value.trim()
  };
  const esistente = regInModifica && state.registrazioni.find(r => r.id === regInModifica);
  if (esistente) Object.assign(esistente, dati);
  else state.registrazioni.push(Object.assign({ id: regInModifica || uid() }, dati));
  if (regDaTimer) state.timer = null;
  state.impostazioni.ultimaCommessa = dati.commessaId;
  salva();
  dlgReg.close();
  render();
  toast('Registrazione salvata');
});

/* ================== Dialog commessa ================== */

const dlgCom = $('#dlgCom');
const formCom = $('#formCom');
let comInModifica = null;

function apriCommessa(id) {
  const c = id ? commessa(id) : null;
  comInModifica = c ? c.id : null;
  $('#dlgComTitle').textContent = c ? 'Modifica commessa' : 'Nuova commessa';
  formCom.codice.value = c ? c.codice || '' : '';
  formCom.nome.value = c ? c.nome : '';
  formCom.cliente.value = c ? c.cliente || '' : '';
  formCom.tariffa.value = c && c.tariffa ? c.tariffa : '';
  formCom.colore.value = c ? c.colore : COLORI[state.commesse.length % COLORI.length];
  formCom.archiviata.checked = !!(c && c.archiviata);
  $('#btnComDelete').hidden = !c;
  dlgCom.showModal();
}

$('#btnComCancel').addEventListener('click', () => dlgCom.close());

$('#btnComDelete').addEventListener('click', () => {
  const id = comInModifica;
  const n = state.registrazioni.filter(r => r.commessaId === id).length;
  const msg = n
    ? `Questa commessa ha ${n} registrazioni che verranno eliminate. Continuare?\n(Suggerimento: puoi invece archiviarla.)`
    : 'Eliminare questa commessa?';
  if (!confirm(msg)) return;
  state.commesse = state.commesse.filter(c => c.id !== id);
  state.registrazioni = state.registrazioni.filter(r => r.commessaId !== id);
  if (state.timer && state.timer.commessaId === id) state.timer = null;
  if (filtro.commessaId === id) filtro.commessaId = '';
  salva();
  dlgCom.close();
  render();
});

formCom.addEventListener('submit', e => {
  e.preventDefault();
  const dati = {
    codice: formCom.codice.value.trim(),
    nome: formCom.nome.value.trim(),
    cliente: formCom.cliente.value.trim(),
    tariffa: round2(parseFloat(String(formCom.tariffa.value).replace(',', '.'))) || 0,
    colore: formCom.colore.value,
    archiviata: formCom.archiviata.checked
  };
  if (!dati.nome) return;
  const esistente = comInModifica && commessa(comInModifica);
  if (esistente) Object.assign(esistente, dati);
  else state.commesse.push(Object.assign({ id: comInModifica || uid() }, dati));
  salva();
  dlgCom.close();
  render();
});

/* ================== Esportazione Excel ================== */

// Numero seriale di Excel per una data (senza problemi di fuso orario).
function serialeData(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}
function serialeOra(t) { return minuti(t) / 1440; }

function applicaFormati(ws, colonne, righe, formati) {
  for (let r = 1; r <= righe; r++) {
    Object.keys(formati).forEach(c => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: Number(c) })];
      if (cell && cell.t === 'n') cell.z = formati[c];
    });
  }
  ws['!cols'] = colonne.map(w => ({ wch: w }));
}

function rigaTotale(ws, r, col, primaRiga, ultimaRiga, valore, formato) {
  const lettera = XLSX.utils.encode_col(col);
  ws[XLSX.utils.encode_cell({ r, c: col })] = {
    t: 'n', v: valore, z: formato,
    f: `SUM(${lettera}${primaRiga}:${lettera}${ultimaRiga})`
  };
}

function creaWorkbook(list) {
  const XL = window.XLSX;
  const wb = XL.utils.book_new();
  const righe = ordinaRegistrazioni(list, false);

  // --- Foglio 1: dettaglio registrazioni
  const intest = ['Data', 'Codice commessa', 'Commessa', 'Cliente', 'Inizio', 'Fine', 'Pausa (min)', 'Ore', 'Note / attività', 'Tariffa (€/h)', 'Importo (€)'];
  const aoa = [intest];
  righe.forEach(r => {
    const c = commessa(r.commessaId) || {};
    const tariffa = Number(c.tariffa) || 0;
    aoa.push([
      serialeData(r.data),
      c.codice || null,
      c.nome || '(commessa eliminata)',
      c.cliente || null,
      r.inizio ? serialeOra(r.inizio) : null,
      r.fine ? serialeOra(r.fine) : null,
      r.pausa || null,
      Number(r.ore) || 0,
      r.note || null,
      tariffa || null,
      tariffa ? round2(tariffa * r.ore) : null
    ]);
  });
  aoa.push(['TOTALE']);
  const ws1 = XL.utils.aoa_to_sheet(aoa);
  applicaFormati(ws1, [12, 16, 30, 22, 8, 8, 11, 9, 40, 12, 12], righe.length,
    { 0: 'dd/mm/yyyy', 4: 'hh:mm', 5: 'hh:mm', 7: '0.00', 9: '#,##0.00', 10: '#,##0.00' });
  const rTot = righe.length + 1;
  rigaTotale(ws1, rTot, 7, 2, righe.length + 1, totaleOre(righe), '0.00');
  const totImporto = round2(righe.reduce((s, r) => s + ((commessa(r.commessaId) || {}).tariffa || 0) * r.ore, 0));
  if (totImporto) rigaTotale(ws1, rTot, 10, 2, righe.length + 1, totImporto, '#,##0.00');
  ws1['!ref'] = XL.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rTot, c: intest.length - 1 } });
  ws1['!autofilter'] = { ref: XL.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: righe.length, c: intest.length - 1 } }) };
  XL.utils.book_append_sheet(wb, ws1, 'Registrazioni');

  // --- Foglio 2: riepilogo per commessa
  const perCom = new Map();
  righe.forEach(r => {
    const g = perCom.get(r.commessaId) || { n: 0, ore: 0 };
    g.n++; g.ore += Number(r.ore) || 0;
    perCom.set(r.commessaId, g);
  });
  const aoa2 = [['Codice commessa', 'Commessa', 'Cliente', 'N. registrazioni', 'Ore', 'Tariffa (€/h)', 'Importo (€)']];
  [...perCom.entries()]
    .sort((a, b) => etichetta(commessa(a[0])).localeCompare(etichetta(commessa(b[0])), 'it'))
    .forEach(([id, g]) => {
      const c = commessa(id) || {};
      const tariffa = Number(c.tariffa) || 0;
      aoa2.push([c.codice || null, c.nome || '(commessa eliminata)', c.cliente || null, g.n, round2(g.ore),
        tariffa || null, tariffa ? round2(tariffa * g.ore) : null]);
    });
  const n2 = perCom.size;
  aoa2.push(['TOTALE']);
  const ws2 = XL.utils.aoa_to_sheet(aoa2);
  applicaFormati(ws2, [16, 30, 22, 15, 10, 12, 12], n2, { 4: '0.00', 5: '#,##0.00', 6: '#,##0.00' });
  rigaTotale(ws2, n2 + 1, 4, 2, n2 + 1, totaleOre(righe), '0.00');
  if (totImporto) rigaTotale(ws2, n2 + 1, 6, 2, n2 + 1, totImporto, '#,##0.00');
  ws2['!ref'] = XL.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: n2 + 1, c: 6 } });
  XL.utils.book_append_sheet(wb, ws2, 'Riepilogo commesse');

  // --- Foglio 3: riepilogo mensile per commessa
  const perMese = new Map();
  righe.forEach(r => {
    const k = r.data.slice(0, 7) + '|' + r.commessaId;
    perMese.set(k, (perMese.get(k) || 0) + (Number(r.ore) || 0));
  });
  const aoa3 = [['Mese', 'Codice commessa', 'Commessa', 'Ore']];
  [...perMese.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, ore]) => {
    const [mese, id] = k.split('|');
    const c = commessa(id) || {};
    const nomeMese = daISO(mese + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    aoa3.push([nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1), c.codice || null, c.nome || '(commessa eliminata)', round2(ore)]);
  });
  const ws3 = XL.utils.aoa_to_sheet(aoa3);
  applicaFormati(ws3, [18, 16, 30, 10], perMese.size, { 3: '0.00' });
  XL.utils.book_append_sheet(wb, ws3, 'Riepilogo mensile');

  return wb;
}

function nomeFileExcel() {
  const [da, a] = intervalloPeriodo(filtro.periodo);
  const parti = ['ore-commesse'];
  const c = filtro.commessaId && commessa(filtro.commessaId);
  if (c) parti.push((c.codice || c.nome).replace(/[^\w.-]+/g, '_'));
  parti.push(da && a ? da + '_' + a : 'tutto');
  return parti.join('_') + '.xlsx';
}

function controllaXLSX() {
  if (window.XLSX) return true;
  alert('Libreria Excel non caricata. Ricarica la pagina e riprova.');
  return false;
}

function esportaExcel() {
  if (!controllaXLSX()) return;
  const list = registrazioniFiltrate();
  if (!list.length) return;
  XLSX.writeFile(creaWorkbook(list), nomeFileExcel(), { compression: true });
}

async function condividiExcel() {
  if (!controllaXLSX()) return;
  const list = registrazioniFiltrate();
  if (!list.length) return;
  const buf = XLSX.write(creaWorkbook(list), { type: 'array', bookType: 'xlsx', compression: true });
  const file = new File([buf], nomeFileExcel(), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  if (!navigator.canShare({ files: [file] })) {
    XLSX.writeFile(creaWorkbook(list), nomeFileExcel(), { compression: true });
    return;
  }
  try {
    await navigator.share({ files: [file], title: 'Ore commesse' });
  } catch (e) {
    if (e.name !== 'AbortError') alert('Condivisione non riuscita: ' + e.message);
  }
}

/* ================== Backup ================== */

function scaricaBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function esportaBackup() {
  const dati = Object.assign({}, state, { esportatoIl: new Date().toISOString() });
  scaricaBlob(new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' }),
    'backup-ore-commesse_' + oggiISO() + '.json');
}

$('#fileImport').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let dati;
  try {
    dati = normalizza(JSON.parse(await f.text()));
  } catch (err) {
    alert('File non valido: ' + err.message);
    return;
  }
  const info = `${dati.commesse.length} commesse e ${dati.registrazioni.length} registrazioni.`;
  if (!state.commesse.length && !state.registrazioni.length) {
    state = dati;
  } else if (confirm(`Il backup contiene ${info}\n\nOK = UNISCI ai dati esistenti\nAnnulla = scegli se sostituire`)) {
    const idCom = new Set(state.commesse.map(c => c.id));
    const idReg = new Set(state.registrazioni.map(r => r.id));
    dati.commesse.forEach(c => { if (!idCom.has(c.id)) state.commesse.push(c); });
    dati.registrazioni.forEach(r => { if (!idReg.has(r.id)) state.registrazioni.push(r); });
  } else if (confirm('SOSTITUIRE tutti i dati di questo dispositivo con quelli del backup?')) {
    state = dati;
  } else {
    return;
  }
  salva();
  render();
  toast('Backup importato');
});

/* ================== Gestione eventi ================== */

document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act && !act.disabled) {
    switch (act.dataset.act) {
      case 'timer-start': avviaTimer(); break;
      case 'timer-stop': fermaTimer(); break;
      case 'timer-annulla':
        if (confirm('Annullare il timer senza salvare il tempo?')) { state.timer = null; salva(); render(); }
        break;
      case 'nuova-reg': apriRegistrazione(null); break;
      case 'nuova-commessa': apriCommessa(null); break;
      case 'export': esportaExcel(); break;
      case 'share': condividiExcel(); break;
      case 'backup': esportaBackup(); break;
      case 'notifiche': Notification.requestPermission().then(() => render()); break;
      case 'sync-accedi': window.OreSync && window.OreSync.accedi(); break;
      case 'sync-esci':
        if (confirm('Uscire dall\'account? I dati restano su questo dispositivo ma non verranno più sincronizzati.')) {
          window.OreSync.esci();
        }
        break;
      case 'import': $('#fileImport').click(); break;
      case 'reset':
        if (confirm('Cancellare TUTTE le commesse e le registrazioni? Operazione irreversibile.' +
              (infoSync().email ? '\nI dati verranno cancellati anche dal cloud e dagli altri dispositivi.' : '')) &&
            confirm('Sei proprio sicuro? Ti consigliamo di esportare prima un backup.')) {
          state = statoVuoto(); salva(); render();
        }
        break;
    }
    return;
  }
  const reg = e.target.closest('[data-reg]');
  if (reg) { apriRegistrazione(reg.dataset.reg); return; }
  const com = e.target.closest('[data-com]');
  if (com) apriCommessa(com.dataset.com);
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fPeriodo') {
    if (t.value === 'custom' && !filtro.da) [filtro.da, filtro.a] = intervalloPeriodo(filtro.periodo);
    filtro.periodo = t.value;
    render();
  } else if (t.id === 'fCommessa') { filtro.commessaId = t.value; render(); }
  else if (t.id === 'fDa') { filtro.da = t.value; render(); }
  else if (t.id === 'fA') { filtro.a = t.value; render(); }
  else if (t.id === 'impArrotonda') {
    state.impostazioni.arrotondamento = Number(t.value);
    salva();
    toast('Impostazione salvata');
  } else if (t.id === 'impPromemoria') {
    state.impostazioni.promemoria = Number(t.value);
    salva();
    chiediPermessoNotifiche();
    render();
    toast('Impostazione salvata');
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'timerNote' && state.timer) {
    state.timer.note = e.target.value;
    salva();
  }
});

// Sincronizza se l'app è aperta in più schede/finestre.
window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY) { state = carica(); render(); }
});

render();
aggiornaBadge();
controllaPromemoria();

// Apertura dell'app da un pulsante della notifica (app chiusa).
const azioneUrl = new URLSearchParams(location.search).get('promemoria');
if (azioneUrl) {
  history.replaceState(null, '', location.pathname);
  rispostaPromemoria(azioneUrl);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
