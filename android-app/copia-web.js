// Copia i file dell'app web nella cartella www usata da Capacitor.
const fs = require('fs');
const path = require('path');
const radice = path.join(__dirname, '..');
const www = path.join(__dirname, 'www');
const FILE = ['index.html', 'styles.css', 'app.js', 'sync.js', 'firebase-config.js', 'manifest.webmanifest', 'icons', 'vendor'];
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www);
for (const f of FILE) fs.cpSync(path.join(radice, f), path.join(www, f), { recursive: true });
console.log('Web copiato in', www);
