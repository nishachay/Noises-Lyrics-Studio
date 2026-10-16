#!/usr/bin/env bash
# ==============================================================================
# NOISES LYRICS STUDIO — macOS / LINUX LAUNCHER
# ==============================================================================

set -e

# Change directory to the repository folder (resolving any symlinks)
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
cd "$SCRIPT_DIR"

echo "===================================================="
echo " Noises Lyrics Studio"
echo "===================================================="

# Load Node.js via nvm if available
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  \. "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi

# 1. Require Node.js 20 or higher (matches package.json "engines")
echo "[1/4] Checking Node.js version..."
NODE_VER=$(node -v 2>/dev/null || echo "v0")
NODE_MAJOR=$(echo "$NODE_VER" | tr -d 'v' | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node.js 20 or higher is required. Found: ${NODE_VER}"
  echo "Install Node 20 (https://nodejs.org) or load it with nvm:  nvm use 20"
  exit 1
fi

# 2. Make sure the port is free. This script never terminates other processes.
PORT="${PORT:-3000}"

is_port_free() {
  node -e "
    const net = require('net');
    const s = net.createServer();
    s.once('error', () => process.exit(1));
    s.listen(process.argv[1], () => { s.close(); process.exit(0); });
  " "$1" 2>/dev/null
}

if ! is_port_free "$PORT"; then
  echo "ERROR: port ${PORT} is already in use by another process."
  echo "Free that port, or start on a different one:  PORT=3001 ./start.sh"
  exit 1
fi

APP_VERSION=$(node -e 'try { console.log(require("./package.json").version); } catch(e) { console.log("unknown"); }' 2>/dev/null || echo "unknown")
echo "      Using Node $(node -v) — App version: v${APP_VERSION} on port ${PORT}"

# 3. Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "[2/4] Installing dependencies (first run)..."
  npm install
else
  echo "[2/4] Dependencies verified"
fi

# 4. Open the browser in the background once the server is responsive
echo "[3/4] Launching browser monitor..."
(
  for i in $(seq 1 40); do
    if curl -s "http://localhost:${PORT}/api/version" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  echo "Opening browser at http://localhost:${PORT}..."
  xdg-open "http://localhost:${PORT}" 2>/dev/null || sensible-browser "http://localhost:${PORT}" 2>/dev/null || true
) &

# 5. Start the server
echo "[4/4] Starting server on http://localhost:${PORT}..."
npm start
