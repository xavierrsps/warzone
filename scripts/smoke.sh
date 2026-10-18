#!/usr/bin/env bash
# Boot the server against a throwaway DB, exercise the API, tear down.
set -uo pipefail
cd "$(dirname "$0")/../server"

TMP=$(mktemp -d)
export WARZONE_DATA_DIR="$TMP"
export PORT=3999
export WARZONE_ADMIN_PASSWORD=changeme

node --no-warnings index.js >"$TMP/server.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -rf "$TMP"' EXIT

# wait for health
for i in $(seq 1 30); do
  curl -sf http://localhost:$PORT/api/health >/dev/null 2>&1 && break
  sleep 0.3
done

B=http://localhost:$PORT/api
say(){ echo; echo "== $1 =="; }

say "health";    curl -s $B/health
say "settings";  curl -s $B/settings
say "players (seeded)"; curl -s $B/players
say "jams";      curl -s $B/jams
say "jam #1 detail"; curl -s $B/jams/1

say "admin-login"
TOKEN=$(curl -s -X POST $B/auth/admin-login -H 'Content-Type: application/json' -d '{"password":"changeme"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
echo "token length: ${#TOKEN}"
AUTH="-H x-admin-token:$TOKEN -H Content-Type:application/json"

say "write WITHOUT token (expect 403)"; curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/jams -H 'Content-Type: application/json' -d '{"name":"nope"}'

say "create jam #2"; J=$(curl -s $AUTH -X POST $B/jams -d '{"name":"Test Jam"}'); echo "$J"
JID=$(echo "$J" | sed -E 's/.*"id":([0-9]+).*/\1/')

say "add 4 players by name"
for n in Alpha Bravo Charlie Delta; do curl -s $AUTH -X POST $B/jams/$JID/add -d "{\"name\":\"$n\"}" >/dev/null; done
curl -s $B/jams/$JID | sed -E 's/,"leaderboard.*//'

say "randomize into 2 teams"; curl -s $AUTH -X POST $B/jams/$JID/randomize -d '{"team_count":2}' | sed -E 's/,"leaderboard.*//'

say "submit a game (team 0 wins, kills via first two player ids)"
# grab the 4 player ids just added (ids 7..10 after 6 seeded)
IDS=$(curl -s $B/players | grep -oE '"id":[0-9]+' | grep -oE '[0-9]+' | tail -4 | tr '\n' ' ')
set -- $IDS
curl -s $AUTH -X POST $B/jams/$JID/games -d "{\"winner_team\":0,\"kills\":{\"$1\":5,\"$2\":3,\"$3\":2,\"$4\":1}}" | sed -E 's/"sheet".*//'

say "jam leaderboard"; curl -s $B/jams/$JID | grep -oE '"leaderboard":\[.*\]' | head -c 600; echo
say "all-time"; curl -s $B/jams/stats/alltime | head -c 600; echo
echo; echo "== server log tail =="; tail -5 "$TMP/server.log"
echo; echo "SMOKE DONE"
