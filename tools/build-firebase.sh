#!/bin/sh
# Rigenera vendor/firebase.js (Firebase SDK in un unico file, usabile offline).
# Uso: sh tools/build-firebase.sh [versione]   (richiede Node.js)
set -e
VER="${1:-12.19.0}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y >/dev/null
npm i "firebase@$VER" esbuild >/dev/null
cp "$DIR/tools/firebase-entry.js" entry.js
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=eof \
  --outfile="$DIR/vendor/firebase.js"
echo "vendor/firebase.js creato (firebase $VER)"
