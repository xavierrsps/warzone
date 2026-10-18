#!/usr/bin/env bash
# Prod smoke: server serves the built client/dist + API.
set -uo pipefail
cd "$(dirname "$0")/../server"
TMP=$(mktemp -d)
export WARZONE_DATA_DIR="$TMP" PORT=3998
node --no-warnings index.js >"$TMP/s.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -rf "$TMP"' EXIT
for i in $(seq 1 30); do curl -sf http://localhost:3998/api/health >/dev/null 2>&1 && break; sleep 0.3; done
echo "-- GET / (SPA) --";   curl -s -o /dev/null -w 'HTTP %{http_code}, %{size_download} bytes\n' http://localhost:3998/
echo "-- title --";          curl -s http://localhost:3998/ | grep -oE '<title>[^<]+</title>'
echo "-- /api/health --";    curl -s http://localhost:3998/api/health; echo
echo "-- /api/settings --";  curl -s http://localhost:3998/api/settings; echo
echo "-- SPA fallback /roster --"; curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:3998/roster
echo "-- server log --"; grep -E 'Warzone|Seeded|🔐' "$TMP/s.log"
echo "PROD SMOKE DONE"
