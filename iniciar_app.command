#!/bin/bash
# Observatorio Textil, Moda y Calzado MX - servidor local (macOS / Linux)
# Uso: doble clic, o en Terminal:  bash iniciar_app.command

pausa() { echo; read -r -p "Pulsa Enter para cerrar esta ventana..." _; }

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/web" 2>/dev/null || { echo "No encuentro la carpeta 'web' junto a este archivo ($DIR)."; pausa; exit 1; }

if [ ! -f data/puntos.bin ] || [ ! -f data/meta.json ]; then
  echo "Faltan los datos en web/data/. Si usas Dropbox, marca la carpeta"
  echo "app_observatorio como 'Disponible sin conexion' y espera a que sincronice."
  pausa; exit 1
fi

# Buscar un Python 3 que funcione de verdad (en macOS /usr/bin/python3 puede ser
# solo un aviso para instalar las herramientas de desarrollo).
PY=""
for c in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys, http.server; sys.exit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "No se encontro Python 3."
  echo "Instalalo desde https://www.python.org/downloads/macos/"
  echo "o en Terminal:  xcode-select --install"
  pausa; exit 1
fi

# Puerto libre a partir de 8765
PUERTO=8765
while lsof -nP -iTCP:$PUERTO -sTCP:LISTEN >/dev/null 2>&1; do PUERTO=$((PUERTO+1)); done

URL="http://localhost:$PUERTO"
echo "Usando $("$PY" --version 2>&1) en $PWD"
echo "Abriendo $URL"
echo "Deja esta ventana abierta mientras usas la app. Ctrl+C para detenerla."
(sleep 1.5; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null) &
"$PY" -m http.server "$PUERTO" --bind 127.0.0.1
echo "El servidor se detuvo."
pausa
