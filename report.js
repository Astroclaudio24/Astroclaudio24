'use strict';

/* ==========================================================================
   Report mensile (formato «Report mensile» di Claudio)
   - un foglio COMMESSE con l'elenco di tutte le commesse;
   - un foglio per mese («SETTEMBRE 2026») con una riga per giorno e una
     colonna [%] solo per le commesse lavorate in quel mese, poi Trasferta,
     Nota spese, Vitto, Totale e Attività svolte;
   - importazione una tantum del vecchio report per portare lo storico nell'app.
   Usa le funzioni e lo stato di app.js.
   ========================================================================== */

const MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
const GIORNI_SETTIMANA = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const TRASFERTE = ['TRASFERTA', 'TRASFERTA GIORNALIERA', 'TRASFERTA + PERNOTTAMENTO'];

function oreGiornata() {
  return Number(state.impostazioni.oreGiornata) || 8;
}

/* ---------------- Dati della giornata (attività, ferie, trasferta, spese) ---------------- */

function giorno(data) {
  return state.giorni.find(g => g.id === data) || null;
}

function giornoVuoto(g) {
  return !g || (!g.attivita && !g.ferie && !g.trasferta && !(g.spese > 0) && !(g.vitto > 0));
}

function salvaGiorno(data, dati) {
  state.giorni = state.giorni.filter(g => g.id !== data);
  const g = Object.assign({ id: data }, dati);
  if (!giornoVuoto(g)) state.giorni.push(g);
  salva();
}

// Testo «Attività svolte»: quello scritto per la giornata o, se manca, le note delle registrazioni.
function attivitaGiorno(data) {
  const g = giorno(data);
  return g && g.attivita ? g.attivita : attivitaDaNote(data);
}

function attivitaDaNote(data) {
  const note = [];
  ordinaRegistrazioni(state.registrazioni.filter(r => r.data === data), false).forEach(r => {
    const n = (r.note || '').trim();
    if (n && !/^Revit:/i.test(n) && !note.includes(n)) note.push(n);
  });
  return note.join('; ');
}

// Percentuale della giornata per ogni commessa (Map commessaId -> frazione 0..1).
// Giorni importati dal vecchio report: percentuali originali. Altri giorni: quota delle
// ore registrate, arrotondata al 10% con somma 100% (metodo dei resti più grandi).
function percentualiGiorno(data) {
  const regs = state.registrazioni.filter(r => r.data === data && Number(r.ore) > 0);
  const ris = new Map();
  if (!regs.length) return ris;
  if (regs.every(r => typeof r.pct === 'number')) {
    regs.forEach(r => ris.set(r.commessaId, round2((ris.get(r.commessaId) || 0) + r.pct)));
    return ris;
  }
  const ore = new Map();
  regs.forEach(r => ore.set(r.commessaId, (ore.get(r.commessaId) || 0) + Number(r.ore)));
  const totale = [...ore.values()].reduce((a, b) => a + b, 0);
  const quote = [...ore.entries()].map(([id, h]) => {
    const decimi = h / totale * 10;
    return { id, base: Math.floor(decimi), resto: decimi - Math.floor(decimi) };
  });
  let mancanti = 10 - quote.reduce((a, q) => a + q.base, 0);
  quote.slice().sort((a, b) => b.resto - a.resto).forEach(q => { if (mancanti > 0) { q.base++; mancanti--; } });
  quote.forEach(q => { if (q.base > 0) ris.set(q.id, q.base / 10); });
  return ris;
}

/* ---------------- Dialog «Giornata» ---------------- */

const dlgGiorno = $('#dlgGiorno');
const formGiorno = $('#formGiorno');
let giornoInModifica = null;

function apriGiornata(data) {
  giornoInModifica = data;
  const g = giorno(data) || {};
  $('#dlgGiornoTitolo').textContent = fmtGiorno(data);
  formGiorno.attivita.value = g.attivita || '';
  formGiorno.attivita.placeholder = attivitaDaNote(data) || 'Descrivi le attività svolte';
  formGiorno.ferie.checked = !!g.ferie;
  formGiorno.trasferta.value = g.trasferta || '';
  formGiorno.spese.value = g.spese || '';
  formGiorno.vitto.value = g.vitto || '';
  dlgGiorno.showModal();
}

$('#btnGiornoNote').addEventListener('click', () => {
  formGiorno.attivita.value = attivitaDaNote(giornoInModifica);
});
$('#btnGiornoAnnulla').addEventListener('click', () => dlgGiorno.close());

formGiorno.addEventListener('submit', e => {
  e.preventDefault();
  const num = v => round2(parseFloat(String(v).replace(',', '.'))) || 0;
  salvaGiorno(giornoInModifica, {
    attivita: formGiorno.attivita.value.trim(),
    ferie: formGiorno.ferie.checked,
    trasferta: formGiorno.trasferta.value,
    spese: num(formGiorno.spese.value),
    vitto: num(formGiorno.vitto.value)
  });
  dlgGiorno.close();
  render();
  toast('Giornata salvata');
});

/* ---------------- Generazione del report Excel ---------------- */

function caricaScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error('impossibile caricare ' + src));
    document.head.appendChild(s);
  });
}

const meseDi = data => data.slice(0, 7);
function nomeFoglio(mese) {
  const [y, m] = mese.split('-').map(Number);
  return MESI[m - 1] + ' ' + y;
}
function giorniDelMese(mese) {
  const [y, m] = mese.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => mese + '-' + pad(i + 1));
}
function intestazioneCommessa(c) {
  return (c.codice ? c.codice + ' - ' + c.nome : c.nome) + '\n[%]';
}

function nomeFileReport() {
  const anno = new Date().getFullYear();
  const base = state.impostazioni.fileReport;
  if (base && /\d{4}/.test(base)) return base.replace(/(19|20)\d{2}(?!.*(19|20)\d{2})/, String(anno));
  return `Report_mensile_${anno}.xlsx`;
}

// Prepara i dati di tutti i mesi (dal primo con dati a quello corrente).
function datiReport() {
  const date = new Set();
  state.registrazioni.forEach(r => date.add(r.data));
  state.giorni.forEach(g => date.add(g.id));
  const mesi = [...new Set([...date].map(meseDi))].sort();
  const corrente = oggiISO().slice(0, 7);
  if (!mesi.length || mesi[mesi.length - 1] < corrente) mesi.push(corrente);
  // tutti i mesi in mezzo, anche se vuoti
  const tutti = [];
  let [y, m] = mesi[0].split('-').map(Number);
  while (true) {
    const k = y + '-' + pad(m);
    tutti.push(k);
    if (k >= mesi[mesi.length - 1]) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  const primoGiorno = {};
  ordinaRegistrazioni(state.registrazioni, false).forEach(r => { if (!primoGiorno[r.commessaId]) primoGiorno[r.commessaId] = r.data; });
  return tutti.map(mese => {
    const giorni = giorniDelMese(mese).map(data => ({
      data,
      pct: percentualiGiorno(data),
      info: giorno(data) || {},
      attivita: attivitaGiorno(data)
    }));
    const ids = new Set();
    giorni.forEach(g => g.pct.forEach((_, id) => ids.add(id)));
    const commesse = [...ids].map(id => commessa(id) || { id, codice: '', nome: '(commessa eliminata)' })
      .sort((a, b) => (primoGiorno[a.id] || '').localeCompare(primoGiorno[b.id] || '') || etichetta(a).localeCompare(etichetta(b), 'it'));
    return { mese, giorni, commesse };
  });
}

async function generaReportMensile() {
  if (!state.registrazioni.length && !state.giorni.length) { alert('Non ci sono ancora dati da mettere nel report.'); return; }
  toast('Preparazione del report…');
  if (!window.ExcelJS) await caricaScript('vendor/exceljs.min.js');
  const wb = await creaReportWorkbook(window.ExcelJS, datiReport());
  const buf = await wb.xlsx.writeBuffer();
  scaricaBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeFileReport());
}

// Separata dall'interfaccia così si può provare anche fuori dal browser.
async function creaReportWorkbook(ExcelJS, mesi) {
  const BLU = 'FFD9E5F7', GRIGIO = 'FFEDEDED', VERDE = 'FFDFF2E1', ARANCIO = 'FFFCE9D6';
  const bordo = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const bordi = { top: bordo, left: bordo, bottom: bordo, right: bordo };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const EURO = '#,##0.00 [$€-410]';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ore Commesse';
  wb.created = new Date();

  // ---- Foglio COMMESSE ----
  const stat = new Map();
  mesi.forEach(m => m.giorni.forEach(g => g.pct.forEach((p, id) => {
    const s = stat.get(id) || { giorni: 0, primo: g.data, ultimo: g.data };
    s.giorni += p; if (g.data < s.primo) s.primo = g.data; if (g.data > s.ultimo) s.ultimo = g.data;
    stat.set(id, s);
  })));
  const oreTot = new Map();
  state.registrazioni.forEach(r => oreTot.set(r.commessaId, (oreTot.get(r.commessaId) || 0) + (Number(r.ore) || 0)));
  const wsC = wb.addWorksheet('COMMESSE', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsC.columns = [
    { header: 'Codice', width: 12 }, { header: 'Commessa', width: 40 }, { header: 'Cliente', width: 24 },
    { header: 'Stato', width: 12 }, { header: 'Primo giorno', width: 13 }, { header: 'Ultimo giorno', width: 13 },
    { header: 'Giornate', width: 11 }, { header: 'Ore registrate', width: 14 }, { header: 'Modelli Revit', width: 30 }
  ];
  const elenco = state.commesse.slice().sort((a, b) =>
    ((stat.get(b.id) || {}).ultimo || '').localeCompare((stat.get(a.id) || {}).ultimo || '') || etichetta(a).localeCompare(etichetta(b), 'it'));
  elenco.forEach(c => {
    const s = stat.get(c.id);
    wsC.addRow([c.codice || '', c.nome, c.cliente || '', c.archiviata ? 'Archiviata' : 'Attiva',
      s ? daISO(s.primo) : null, s ? daISO(s.ultimo) : null, s ? round2(s.giorni) : 0,
      round2(oreTot.get(c.id) || 0), (c.modelliRevit || []).join(', ')]);
  });
  wsC.getRow(1).eachCell(c => { c.font = { bold: true }; c.fill = fill(BLU); c.border = bordi; c.alignment = { vertical: 'middle', wrapText: true }; });
  wsC.getColumn(5).numFmt = 'dd/mm/yyyy';
  wsC.getColumn(6).numFmt = 'dd/mm/yyyy';
  wsC.getColumn(7).numFmt = '0.0';
  wsC.getColumn(8).numFmt = '0.00';
  wsC.autoFilter = { from: 'A1', to: 'I1' };

  // ---- Un foglio per mese ----
  for (const m of mesi) {
    const ws = wb.addWorksheet(nomeFoglio(m.mese), { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
    const nc = m.commesse.length;
    const intest = ['Giorni', '', ...m.commesse.map(intestazioneCommessa), 'TRASFERTA', 'NOTA SPESE\n[euro]', 'VITTO\n[euro]', 'TOTALE\n[euro]', 'Attività svolte'];
    ws.addRow(intest);
    const cTrasf = 3 + nc, cSpese = cTrasf + 1, cVitto = cTrasf + 2, cTot = cTrasf + 3, cAtt = cTrasf + 4;
    ws.getColumn(1).width = 10; ws.getColumn(2).width = 11;
    for (let i = 0; i < nc; i++) ws.getColumn(3 + i).width = 16;
    ws.getColumn(cTrasf).width = 14; ws.getColumn(cSpese).width = 11; ws.getColumn(cVitto).width = 11;
    ws.getColumn(cTot).width = 12; ws.getColumn(cAtt).width = 70;
    const h = ws.getRow(1);
    h.height = 48;
    h.eachCell({ includeEmpty: true }, c => {
      c.font = { bold: true }; c.fill = fill(BLU); c.border = bordi;
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    m.giorni.forEach((g, i) => {
      const r = i + 2;
      const d = daISO(g.data);
      const festivo = d.getDay() === 0 || d.getDay() === 6;
      const row = ws.getRow(r);
      row.getCell(1).value = d; row.getCell(1).numFmt = 'dd/mm/yy';
      row.getCell(2).value = GIORNI_SETTIMANA[d.getDay()];
      m.commesse.forEach((c, k) => {
        const cell = row.getCell(3 + k);
        if (g.pct.has(c.id)) { cell.value = g.pct.get(c.id); cell.numFmt = '0%'; }
        else if (g.info.ferie && !festivo) cell.value = 'FERIE';
        cell.alignment = { horizontal: 'center' };
      });
      if (g.info.trasferta) row.getCell(cTrasf).value = g.info.trasferta;
      if (g.info.spese) row.getCell(cSpese).value = g.info.spese;
      if (g.info.vitto) row.getCell(cVitto).value = g.info.vitto;
      row.getCell(cSpese).numFmt = EURO; row.getCell(cVitto).numFmt = EURO; row.getCell(cTot).numFmt = EURO;
      if (g.info.spese || g.info.vitto) {
        const L = col => ws.getColumn(col).letter;
        row.getCell(cTot).value = { formula: `SUM(${L(cSpese)}${r}:${L(cVitto)}${r})`, result: round2((g.info.spese || 0) + (g.info.vitto || 0)) };
      }
      const att = g.info.ferie && !g.attivita ? 'FERIE' : g.attivita;
      if (att) row.getCell(cAtt).value = att;
      row.getCell(cAtt).alignment = { wrapText: true, vertical: 'top' };
      const colore = festivo ? GRIGIO : g.info.ferie ? VERDE : g.info.trasferta ? ARANCIO : null;
      for (let c = 1; c <= cAtt; c++) {
        const cell = row.getCell(c);
        cell.border = bordi;
        if (colore) cell.fill = fill(colore);
      }
    });

    // Riga dei totali: giornate per commessa e spese del mese
    const ultima = m.giorni.length + 1, rt = ultima + 1;
    const tot = ws.getRow(rt);
    tot.getCell(1).value = 'TOTALE';
    tot.getCell(2).value = 'giornate';
    const L = col => ws.getColumn(col).letter;
    m.commesse.forEach((c, k) => {
      const col = 3 + k;
      const somma = m.giorni.reduce((a, g) => a + (g.pct.get(c.id) || 0), 0);
      tot.getCell(col).value = { formula: `SUM(${L(col)}2:${L(col)}${ultima})`, result: round2(somma) };
      tot.getCell(col).numFmt = '0.0';
    });
    [cSpese, cVitto, cTot].forEach(col => {
      const chiave = col === cSpese ? 'spese' : col === cVitto ? 'vitto' : null;
      const somma = m.giorni.reduce((a, g) => a + (chiave ? (g.info[chiave] || 0) : (g.info.spese || 0) + (g.info.vitto || 0)), 0);
      tot.getCell(col).value = { formula: `SUM(${L(col)}2:${L(col)}${ultima})`, result: round2(somma) };
      tot.getCell(col).numFmt = EURO;
    });
    for (let c = 1; c <= cAtt; c++) {
      const cell = tot.getCell(c);
      cell.font = { bold: true }; cell.fill = fill(BLU); cell.border = bordi;
      if (c > 2) cell.alignment = { horizontal: 'center' };
    }
  }

  // apre il file sull'ultimo mese
  wb.views = [{ activeTab: wb.worksheets.length - 1, firstSheet: Math.max(0, wb.worksheets.length - 6) }];
  return wb;
}

/* ---------------- Importazione del vecchio report ---------------- */

// «I2805 - SAVLIS [%]» -> { codice: 'I2805', nome: 'SAVLIS' };  «LIBRERIA FAMIGLIE BIM» -> solo nome
function leggiIntestazione(testo) {
  const t = String(testo).replace(/\[%\]/g, '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^([A-Za-z]?\d{3,5})(?:\s*-\s*|\s+)(.+)$/);
  if (m) return { codice: m[1].toUpperCase(), nome: m[2].trim() };
  return { codice: '', nome: t };
}

function tipoColonna(testo) {
  const t = String(testo).toUpperCase();
  if (/ATTIVIT/.test(t)) return 'attivita';
  if (/TOTALE/.test(t)) return 'totale';
  if (/VITTO/.test(t)) return 'vitto';
  if (/SPESE|TELEPASS|AUTO|CARBURANTE|KM/.test(t)) return 'spese';
  if (/TRASFERTA/.test(t)) return 'trasferta';
  return 'commessa';
}

// «7,0 + 20,0» -> 27 ; 6.9 -> 6.9
function sommaImporti(v) {
  if (typeof v === 'number') return v;
  return round2((String(v).match(/\d+(?:[.,]\d+)?/g) || []).reduce((a, n) => a + parseFloat(n.replace(',', '.')), 0));
}

function tipoTrasferta(testo) {
  const t = testo.toUpperCase();
  if (/PERNOTT/.test(t)) return TRASFERTE[2];
  if (/GIORNALIER/.test(t)) return TRASFERTE[1];
  return TRASFERTE[0];
}

// Legge il file e restituisce i dati trovati, senza ancora modificare l'app.
function analizzaReport(XLSX, buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const commesse = new Map();   // chiave -> { codice, nome, ultimoMese }
  const giorni = new Map();     // data -> { pct: Map(chiave -> frazione), ferie, trasferta, spese, vitto, note[] }
  let fogli = 0;
  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome];
    if (!ws['!ref']) continue;
    const r = XLSX.utils.decode_range(ws['!ref']);
    const colonne = [];
    for (let c = 2; c <= r.e.c; c++) {
      const h = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (!h || h.v === '' || h.v == null) continue;
      const tipo = tipoColonna(h.v);
      const col = { c, tipo };
      if (tipo === 'commessa') {
        const { codice, nome: n } = leggiIntestazione(h.v);
        col.chiave = codice || n.toUpperCase();
        col.codice = codice; col.nome = n;
      }
      colonne.push(col);
    }
    let righe = 0;
    for (let R = 1; R <= r.e.r; R++) {
      const a = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
      if (!a || typeof a.v !== 'number') continue;
      const dc = XLSX.SSF.parse_date_code(a.v);
      if (!dc || !dc.y) continue;
      const data = dc.y + '-' + pad(dc.m) + '-' + pad(dc.d);
      const g = { pct: new Map(), daCompletare: [], ferie: false, trasferta: '', spese: 0, vitto: 0, note: [] };
      for (const col of colonne) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: col.c })];
        if (!cell || cell.v === '' || cell.v == null) continue;
        const v = cell.v;
        if (col.tipo === 'attivita') { const t = String(v).trim(); if (t) g.note.push(t); }
        else if (col.tipo === 'spese') g.spese += sommaImporti(v);
        else if (col.tipo === 'vitto') g.vitto += sommaImporti(v);
        else if (col.tipo === 'trasferta') g.trasferta = tipoTrasferta(String(v));
        else if (col.tipo === 'commessa') {
          if (typeof v === 'number') {
            const p = v > 1 ? v / 100 : v;         // «100» scritto senza % = 100%
            if (p > 0) g.pct.set(col.chiave, (g.pct.get(col.chiave) || 0) + p);
          } else {
            const t = String(v).trim();
            if (/FERIE/i.test(t)) { g.ferie = true; continue; }
            if (/TRASFERTA/i.test(t)) g.trasferta = tipoTrasferta(t);
            const num = t.match(/(\d+(?:[.,]\d+)?)\s*%/);
            if (num) g.pct.set(col.chiave, (g.pct.get(col.chiave) || 0) + parseFloat(num[1].replace(',', '.')) / 100);
            else {
              g.daCompletare.push(col.chiave);     // «(TRASFERTA)» = il resto della giornata
              const testo = t.replace(/\(?TRASFERTA[^)]*\)?/i, '').trim();
              if (testo) g.note.push(testo);
            }
          }
          // il nome più recente vince (es. «data 4» diventato «data 4 (DC11)»)
          const prec = commesse.get(col.chiave);
          if (!prec || data >= prec.ultimo) commesse.set(col.chiave, { codice: col.codice, nome: col.nome, ultimo: data });
        }
      }
      if (g.daCompletare.length) {
        const usato = [...g.pct.values()].reduce((s, p) => s + p, 0);
        const resto = Math.max(0, 1 - usato) / g.daCompletare.length;
        g.daCompletare.forEach(k => { if (resto > 0) g.pct.set(k, (g.pct.get(k) || 0) + resto); });
      }
      if (g.pct.size || g.ferie || g.trasferta || g.spese || g.vitto || g.note.length) { giorni.set(data, g); righe++; }
    }
    if (righe || colonne.length) fogli++;
  }
  // le commesse senza alcun giorno lavorato non servono
  const usate = new Set();
  giorni.forEach(g => g.pct.forEach((_, k) => usate.add(k)));
  for (const k of [...commesse.keys()]) if (!usate.has(k)) commesse.delete(k);
  return { fogli, commesse, giorni };
}

// Applica i dati letti: crea/riusa le commesse e scrive registrazioni e giornate.
function applicaImportazione(dati) {
  const mappa = new Map();   // chiave report -> id commessa nell'app
  let nuove = 0;
  const ultimoGiorno = [...dati.giorni.keys()].sort().pop() || oggiISO();
  const limiteArchivio = (() => { const d = daISO(ultimoGiorno); d.setMonth(d.getMonth() - 3); return isoData(d); })();
  for (const [chiave, info] of dati.commesse) {
    let c = state.commesse.find(x => (x.codice && x.codice.toUpperCase() === info.codice && info.codice) ||
      (!info.codice && x.nome.toUpperCase() === info.nome.toUpperCase()));
    if (!c) {
      c = { id: 'rep-' + chiave.replace(/[^\w-]+/g, '_'), codice: info.codice, nome: info.nome, cliente: '', tariffa: 0,
        colore: COLORI[state.commesse.length % COLORI.length], archiviata: info.ultimo < limiteArchivio, modelliRevit: [] };
      if (commessa(c.id)) c.id += '-' + uid();
      state.commesse.push(c);
      nuove++;
    }
    mappa.set(chiave, c.id);
  }
  // i giorni che hai già registrato nell'app non vengono toccati
  const giorniApp = new Set(state.registrazioni.filter(r => !r.importato).map(r => r.data));
  state.registrazioni = state.registrazioni.filter(r => !r.importato || !dati.giorni.has(r.data));
  let registrazioni = 0, saltati = 0, giornate = 0;
  for (const [data, g] of dati.giorni) {
    if (giorniApp.has(data)) { if (g.pct.size) saltati++; }
    else {
      g.pct.forEach((p, chiave) => {
        state.registrazioni.push({
          id: 'rep-' + data + '-' + mappa.get(chiave), commessaId: mappa.get(chiave), data,
          inizio: '', fine: '', pausa: 0, ore: round2(p * oreGiornata()), pct: round2(p), note: '', importato: true
        });
        registrazioni++;
      });
    }
    const esistente = giorno(data) || {};
    const nuovo = {
      attivita: esistente.attivita || g.note.join('; '),
      ferie: esistente.ferie || g.ferie,
      trasferta: esistente.trasferta || g.trasferta,
      spese: esistente.spese || round2(g.spese),
      vitto: esistente.vitto || round2(g.vitto)
    };
    state.giorni = state.giorni.filter(x => x.id !== data);
    if (!giornoVuoto(nuovo)) { state.giorni.push(Object.assign({ id: data }, nuovo)); giornate++; }
  }
  return { nuove, registrazioni, saltati, giornate };
}

async function importaReportExcel(file) {
  let dati;
  try {
    dati = analizzaReport(XLSX, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    alert('Non riesco a leggere il file: ' + e.message);
    return;
  }
  const date = [...dati.giorni.keys()].sort();
  if (!date.length) { alert('Nel file non ho trovato giorni compilati.'); return; }
  const lavorati = [...dati.giorni.values()].filter(g => g.pct.size).length;
  const ferie = [...dati.giorni.values()].filter(g => g.ferie).length;
  if (!confirm(`Nel report ho trovato:\n` +
    `• ${dati.fogli} fogli, dal ${fmtData(date[0])} al ${fmtData(date[date.length - 1])}\n` +
    `• ${dati.commesse.size} commesse\n• ${lavorati} giorni lavorati, ${ferie} giorni di ferie\n\n` +
    `Importare tutto nell'app? I giorni che hai già registrato nell'app restano come sono.`)) return;
  const esito = applicaImportazione(dati);
  state.impostazioni.fileReport = file.name;
  salva();
  render();
  alert(`Importazione completata.\n• ${esito.nuove} commesse nuove (quelle non usate negli ultimi 3 mesi sono archiviate)\n` +
    `• ${esito.registrazioni} percentuali giornaliere\n• ${esito.giornate} giornate con attività, ferie, trasferte o spese` +
    (esito.saltati ? `\n• ${esito.saltati} ${esito.saltati === 1 ? 'giorno lasciato' : 'giorni lasciati'} come già ${esito.saltati === 1 ? 'registrato' : 'registrati'} nell'app` : ''));
}

$('#fileReport').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) await importaReportExcel(f);
});
