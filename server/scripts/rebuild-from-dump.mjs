// Rebuild warzone.db losslessly from a live API dump (data/backups/live-dump-*.json),
// preserving player ids (teams reference them), and bake in the in-progress Jam #2
// game that wasn't submitted yet. Run with the SAME admin password you use to log in:
//   WARZONE_ADMIN_PASSWORD=warzone node rebuild-from-dump.mjs [path-to-dump.json]
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { getDb, transaction, initDb } from '../db.js';

// locate dump
let dumpPath = process.argv[2];
if (!dumpPath) {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'data', 'backups');
  const files = readdirSync(dir).filter(f => f.startsWith('live-dump-') && f.endsWith('.json')).sort();
  dumpPath = path.join(dir, files[files.length - 1]);
}
console.log('Using dump:', dumpPath);
const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));

// initDb creates schema + settings (ppk/ppw/ppd/clan/admin pw) + seeds Jam #1.
// We then wipe the seeded data and import the real dump in its place.
initDb();
const db = getDb();

transaction((tx) => {
  tx.exec('DELETE FROM game_players; DELETE FROM games; DELETE FROM jams; DELETE FROM players;');

  const insP = tx.prepare('INSERT INTO players (id, name, active) VALUES (?, ?, 1)');
  for (const p of dump.players) insP.run(p.id, p.name);

  const insJ  = tx.prepare('INSERT INTO jams (id, name, date, status, team_count, teams_json, bench_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insG  = tx.prepare('INSERT INTO games (jam_id, game_number, winner_team, winner_teams_json) VALUES (?, ?, ?, ?)');
  const insGP = tx.prepare('INSERT INTO game_players (game_id, player_id, team, kills, deaths, won) VALUES (?, ?, ?, ?, ?, ?)');

  for (const j of dump.jams) {
    insJ.run(j.id, j.name, j.date, j.status, j.team_count, JSON.stringify(j.teams), JSON.stringify(j.bench));
    for (const g of (j.sheet || [])) {
      const winners = g.winner_team != null ? [g.winner_team] : [];
      const gid = insG.run(j.id, g.game_number, winners.length ? winners[0] : null, JSON.stringify(winners)).lastInsertRowid;
      for (const [pid, s] of Object.entries(g.players)) insGP.run(gid, Number(pid), s.team, s.kills || 0, s.deaths || 0, s.won || 0);
    }
  }

  // ── bake the in-progress Jam #2 game (Team 2 won; kills from the screenshot; deaths 0) ──
  const jam2 = dump.jams.find(j => j.name === 'Jam #2');
  if (jam2) {
    const teams = jam2.teams;                 // [[6,12,14,7],[1,13,16,2]]
    const winners = [1];                      // Team 2 marked winner
    const kills = { 1: 28, 13: 28, 16: 30, 2: 15 };  // Xavier/Native/Sportsbet/Wanted
    const already = tx.prepare('SELECT COUNT(*) c FROM games WHERE jam_id = ?').get(jam2.id).c;
    if (already === 0) {
      const gid = insG.run(jam2.id, 1, winners[0], JSON.stringify(winners)).lastInsertRowid;
      teams.forEach((team, ti) => { for (const pid of team) insGP.run(gid, pid, ti, kills[pid] || 0, 0, winners.includes(ti) ? 1 : 0); });
      console.log('Baked Jam #2 game 1 (Team 2 win; Xavier 28, Native 28, Sportsbet 30, Wanted 15).');
    }
  }
});

// report
const pc = db.prepare('SELECT COUNT(*) c FROM players').get().c;
const jc = db.prepare('SELECT COUNT(*) c FROM jams').get().c;
const gc = db.prepare('SELECT COUNT(*) c FROM games').get().c;
console.log(`Rebuilt: ${pc} players, ${jc} jams, ${gc} games.`);
