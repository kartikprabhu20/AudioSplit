#!/bin/bash
#
# AudioSplit launcher — starts the dev server in the background, opens the
# browser, then closes this Terminal window automatically.
#
# The server keeps running after the window closes. Use "Stop AudioSplit.command"
# (or close the browser tab and run that) to stop it.
#

# Move to the folder this script lives in (the project root).
cd "$(dirname "$0")" || exit 1

echo "▶  Starting AudioSplit…"

# Load nvm and select a compatible Node version (Vite 5 needs Node >= 18).
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  \. "$NVM_DIR/nvm.sh"
  # Prefer a project .nvmrc, else Node 22, else the nvm default.
  nvm use >/dev/null 2>&1 || nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1
fi

URL="http://localhost:5173"
LOG="${TMPDIR:-/tmp}/audiosplit-dev.log"
PIDFILE="${TMPDIR:-/tmp}/audiosplit-dev.pid"

if curl -s -o /dev/null "$URL"; then
  # Server is already running — just open the browser.
  open "$URL"
else
  # Install dependencies the first time.
  if [ ! -d node_modules ]; then
    echo "Installing dependencies (first run only)…"
    npm install || { echo "npm install failed."; read -r -p "Press Return to close."; exit 1; }
  fi

  # Start the dev server detached so it survives this window closing.
  nohup npm run dev > "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  disown

  # Wait until the server responds, then open the browser.
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$URL"; then
      open "$URL"
      break
    fi
    sleep 0.5
  done
fi

# Close this Terminal window (match by tty so we only close our own window).
osascript -e "tell application \"Terminal\" to close (every window whose tty is \"$(tty)\")" >/dev/null 2>&1 &
exit 0
