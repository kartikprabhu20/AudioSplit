#!/bin/bash
#
# AudioSplit launcher — double-click to start the dev server and open the browser.
#

# Move to the folder this script lives in (the project root).
cd "$(dirname "$0")" || exit 1

echo "▶  Starting AudioSplit…"
echo

# Load nvm and select a compatible Node version (Vite 5 needs Node >= 18).
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  \. "$NVM_DIR/nvm.sh"
  # Prefer a project .nvmrc, else Node 22, else the nvm default.
  nvm use >/dev/null 2>&1 || nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1
fi

echo "Using Node $(node --version)"
echo

# Install dependencies the first time.
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)…"
  npm install || { echo "npm install failed."; read -r -p "Press Return to close."; exit 1; }
  echo
fi

# Open the browser once the dev server is actually responding.
# Runs in the background; polls the port, then opens the default browser.
URL="http://localhost:5173"
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$URL"; then
      open "$URL"
      break
    fi
    sleep 0.5
  done
) &

echo "Launching dev server — your browser will open automatically."
echo "Close this window or press Ctrl+C to stop the server."
echo
npm run dev

# Keep the window open if the server exits unexpectedly.
echo
read -r -p "Server stopped. Press Return to close."
