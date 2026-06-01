#!/bin/bash
#
# Stops the AudioSplit dev server started by AudioSplit.command.
#

PIDFILE="${TMPDIR:-/tmp}/audiosplit-dev.pid"

# Kill whatever is listening on the dev port (the actual Vite server).
PIDS="$(lsof -ti:5173 2>/dev/null)"
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill 2>/dev/null
  echo "✔  AudioSplit dev server stopped."
else
  echo "No AudioSplit dev server appears to be running on port 5173."
fi

# Clean up the recorded launcher PID too.
if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null
  rm -f "$PIDFILE"
fi

# Close this Terminal window.
osascript -e "tell application \"Terminal\" to close (every window whose tty is \"$(tty)\")" >/dev/null 2>&1 &
exit 0
