#!/bin/bash
# Inicia MOUTH OF CHAOS en una Mac. Doble clic (la primera vez: clic derecho > Abrir).
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Instala Node.js desde https://nodejs.org"; read -r; exit 1; }
[ -d node_modules ] || npm install
node server.js
