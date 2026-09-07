#!/usr/bin/env bash
# ==============================================================================
# NOISES LYRICS STUDIO — LINUX LAUNCHER
# ==============================================================================

set -e

# Change directory to the repository folder (resolving any symlinks)
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
cd "$SCRIPT_DIR"

echo "===================================================="
echo " Noises Lyrics Studio"
echo "===================================================="

# 1. Pull latest updates from GitHub
echo "[1/4] Checking for updates from GitHub..."
git pull --rebase --autostash 2>/dev/null || echo "      (Offline or no git upstream changes)"

# 2. Load Node.js via nvm or system
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  \. "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi

# Ensure Node.js is at least v18
NODE_VER=$(node -v 2>/dev/null || echo "v0")
NODE_MAJOR=$(echo "$NODE_VER" | tr -d 'v' | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js 18 or higher is required. Found: $NODE_VER"
  echo "Please check that nvm with Node 20 is loaded."
  exit 1
fi

# 3. Clean up any previous Noises Studio instance on port 3000 or 3001
for check_port in 3000 3001; do
  pids=$(fuser "${check_port}/tcp" 2>/dev/null || true)
  for pid in $pids; do
    if pwdx "$pid" 2>/dev/null | grep -qi "noises studio"; then
      echo "      Terminating previous Noises Studio instance (PID $pid on port $check_port)..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
done

# 4. Determine available port (prefer 3000, fallback to 3001+)
is_port_free() {
  node -e "
    const net = require('net');
    const s = net.createServer();
    s.once('error', () => process.exit(1));
    s.listen(process.argv[1], () => { s.close(); process.exit(0); });
  " "$1" 2>/dev/null
}

PORT=3000
if ! is_port_free 3000; then
  if is_port_free 3001; then
    PORT=3001
  elif is_port_free 3002; then
    PORT=3002
  fi
  echo "      Notice: Port 3000 is in use by another app. Running on port ${PORT} instead."
fi
export PORT

APP_VERSION=$(node -e 'try { console.log(require("./package.json").version); } catch(e) { console.log("unknown"); }' 2>/dev/null || echo "9.3.7")
echo "      Using Node $(node -v) — App version: v${APP_VERSION} on port ${PORT}"

# 5. Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "[2/4] Installing dependencies (first run)..."
  npm install
else
  echo "[2/4] Dependencies verified ✓"
fi

# 6. Open browser in background once server is responsive
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

# 7. Start server
echo "[4/4] Starting server on http://localhost:${PORT}..."
npm start
