#!/usr/bin/env bash
# Verify multi-winner + deaths against a throwaway DB.
set -uo pipefail
cd "$(dirname "$0")/../server"
TMP=$(mktemp -d); export WARZONE_DATA_DIR="$TMP" PORT=3997 WARZONE_ADMIN_PASSWORD=pw
node --no-warnings index.js >"$TMP/s.log" 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null; rm -rf "$TMP"' EXIT
for i in $(seq 1 30); do curl -sf http://localhost:3997/api/health >/dev/null 2>&1 && break; sleep 0.3; done
B=http://localhost:3997/api
TOKEN=$(curl -s -X POST $B/auth/admin-login -H 'Content-Type: application/json' -d '{"password":"pw"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
AUTH="-H x-admin-token:$TOKEN -H Content-Type:application/json"
J=$(curl -s $AUTH -X POST $B/jams -d '{"name":"MW"}'); JID=$(echo "$J" | sed -E 's/.*"id":([0-9]+).*/\1/')
for n in A B C D; do curl -s $AUTH -X POST $B/jams/$JID/add -d "{\"name\":\"$n\"}" >/dev/null; done
curl -s $AUTH -X POST $B/jams/$JID/randomize -d '{"team_count":2}' >/dev/null
IDS=$(curl -s $B/players | grep -oE '"id":[0-9]+' | grep -oE '[0-9]+' | sort -n | tail -4); set -- $IDS
echo "player ids: $@"
echo "== submit: BOTH teams win, with deaths (p1:10k/2d, p2:5k/8d, p3:3k/1d, p4:1k/4d) =="
curl -s $AUTH -X POST $B/jams/$JID/games \
  -d "{\"winner_teams\":[0,1],\"kills\":{\"$1\":10,\"$2\":5,\"$3\":3,\"$4\":1},\"deaths\":{\"$1\":2,\"$2\":8,\"$3\":1,\"$4\":4}}" >/dev/null
echo "== leaderboard (expect ALL wins=1; points = kills - 2*deaths + 10) =="
curl -s $B/jams/$JID | grep -oE '"leaderboard":\[[^]]*\]' | tr '}' '\n' | grep -oE '"name":"[A-D]","kills":[0-9]+,"deaths":[0-9]+,"wins":[0-9]+,"games":[0-9]+,"points":-?[0-9]+'
echo "== winners stored on the game =="
curl -s $B/jams/$JID | grep -oE '"winners":\[[0-9,]*\]'
echo "MULTIWIN DONE"
