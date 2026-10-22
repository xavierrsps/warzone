import { Router } from 'express';
import { getDb, transaction, getSetting } from '../db.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

const rates = () => ({ ppk: Number(getSetting('ppk', 1)), ppw: Number(getSetting('ppw', 10)), ppd: Number(getSetting('ppd', 2)) });
const shuffle = (arr) => { const a = [...arr]; for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

// Build the full detail payload for one jam.
function jamDetail(jamId) {
  const db = getDb();
  const jam = db.prepare('SELECT * FROM jams WHERE id = ?').get(jamId);
  if (!jam) return null;
  const teams = JSON.parse(jam.teams_json || '[]');
  const bench = JSON.parse(jam.bench_json || '[]');
  const games = db.prepare('SELECT COUNT(*) c FROM games WHERE jam_id = ?').get(jamId).c;
  return {
    id: jam.id, name: jam.name, date: jam.date, status: jam.status,
    team_count: jam.team_count, teams, bench, games_played: games,
    leaderboard: leaderboard({ jamId }),
    sheet: perGameSheet(jamId),
  };
}

// Aggregate leaderboard. Scope by jam (jamId) or all-time (no jamId).
function leaderboard({ jamId = null } = {}) {
  const db = getDb();
  const { ppk, ppw, ppd } = rates();
  const where = jamId ? 'WHERE g.jam_id = ?' : '';
  const args  = jamId ? [jamId] : [];
  const rows = db.prepare(`
    SELECT p.id, p.name,
           COALESCE(SUM(gp.kills),0)  AS kills,
           COALESCE(SUM(gp.deaths),0) AS deaths,
           COALESCE(SUM(gp.won),0)    AS wins,
           COUNT(gp.id)               AS games
    FROM game_players gp
    JOIN games g   ON g.id = gp.game_id
    JOIN players p ON p.id = gp.player_id
    ${where}
    GROUP BY p.id
  `).all(...args);
  return rows
    .map(r => ({ ...r, points: r.kills * ppk + r.wins * ppw - r.deaths * ppd }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.kills - a.kills);
}

// Per-game matrix for one jam: [{game_number, winners:[teamIdx], players:{playerId:{kills,deaths,won}}}]
function perGameSheet(jamId) {
  const db = getDb();
  const games = db.prepare('SELECT * FROM games WHERE jam_id = ? ORDER BY game_number').all(jamId);
  const gp = db.prepare('SELECT * FROM game_players WHERE game_id = ?');
  return games.map(g => {
    const players = {};
    for (const r of gp.all(g.id)) players[r.player_id] = { kills: r.kills, deaths: r.deaths, won: r.won, team: r.team };
    let winners = [];
    try { winners = JSON.parse(g.winner_teams_json || '[]'); } catch { winners = []; }
    if (!winners.length && g.winner_team != null) winners = [g.winner_team];
    return { id: g.id, game_number: g.game_number, winner_team: g.winner_team, winners, players };
  });
}

// ─── Jams ──────────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const rows = getDb().prepare(`
    SELECT j.*, (SELECT COUNT(*) FROM games WHERE jam_id = j.id) AS games_played
    FROM jams j ORDER BY j.created_at DESC
  `).all();
  res.json(rows.map(j => ({ ...j, teams: undefined, bench: undefined })));
});

router.get('/:id', (req, res) => {
  const d = jamDetail(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

// POST /api/jams { name?, date? }  (admin) — creates an open jam
router.post('/', requireAdmin, (req, res) => {
  const db = getDb();
  const n  = db.prepare('SELECT COUNT(*) c FROM jams').get().c + 1;
  const name = (req.body?.name || '').trim() || `Jam #${n}`;
  const date = (req.body?.date || '').trim() || undefined;
  const info = date
    ? db.prepare("INSERT INTO jams (name, date) VALUES (?, ?)").run(name, date)
    : db.prepare("INSERT INTO jams (name) VALUES (?)").run(name);
  res.status(201).json(jamDetail(info.lastInsertRowid));
});

router.patch('/:id/status', requireAdmin, (req, res) => {
  const s = req.body?.status === 'closed' ? 'closed' : 'open';
  getDb().prepare('UPDATE jams SET status = ? WHERE id = ?').run(s, req.params.id);
  res.json(jamDetail(Number(req.params.id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  getDb().prepare('DELETE FROM jams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Roster of a jam (players on the bench / in teams) ──────────────────────
// POST /api/jams/:id/add { player_id } OR { name } -> adds to bench
router.post('/:id/add', requireAdmin, (req, res) => {
  const db = getDb();
  const jam = db.prepare('SELECT * FROM jams WHERE id = ?').get(req.params.id);
  if (!jam) return res.status(404).json({ error: 'Not found' });

  let pid = req.body?.player_id;
  if (!pid && req.body?.name) {
    const name = req.body.name.trim();
    const existing = db.prepare('SELECT id FROM players WHERE name = ? COLLATE NOCASE').get(name);
    pid = existing ? existing.id : db.prepare('INSERT INTO players (name) VALUES (?)').run(name).lastInsertRowid;
  }
  if (!pid) return res.status(400).json({ error: 'player_id or name required' });

  const teams = JSON.parse(jam.teams_json);
  const bench = JSON.parse(jam.bench_json);
  const inJam = [...teams.flat(), ...bench].includes(pid);
  if (!inJam) bench.push(pid);
  db.prepare('UPDATE jams SET bench_json = ? WHERE id = ?').run(JSON.stringify(bench), jam.id);
  res.json(jamDetail(jam.id));
});

// POST /api/jams/:id/remove { player_id } -> removes from this jam's arrangement
router.post('/:id/remove', requireAdmin, (req, res) => {
  const db = getDb();
  const jam = db.prepare('SELECT * FROM jams WHERE id = ?').get(req.params.id);
  if (!jam) return res.status(404).json({ error: 'Not found' });
  const pid = req.body?.player_id;
  const teams = JSON.parse(jam.teams_json).map(t => t.filter(x => x !== pid));
  const bench = JSON.parse(jam.bench_json).filter(x => x !== pid);
  db.prepare('UPDATE jams SET teams_json = ?, bench_json = ? WHERE id = ?')
    .run(JSON.stringify(teams), JSON.stringify(bench), jam.id);
  res.json(jamDetail(jam.id));
});

// POST /api/jams/:id/randomize { team_count } -> shuffle everyone into N teams
router.post('/:id/randomize', requireAdmin, (req, res) => {
  const db = getDb();
  const jam = db.prepare('SELECT * FROM jams WHERE id = ?').get(req.params.id);
  if (!jam) return res.status(404).json({ error: 'Not found' });
  const n = Math.max(2, Math.min(6, Number(req.body?.team_count) || jam.team_count));
  const pool = shuffle([...JSON.parse(jam.teams_json).flat(), ...JSON.parse(jam.bench_json)]);
  const teams = Array.from({ length: n }, () => []);
  pool.forEach((pid, i) => teams[i % n].push(pid));
  db.prepare('UPDATE jams SET team_count = ?, teams_json = ?, bench_json = ? WHERE id = ?')
    .run(n, JSON.stringify(teams), '[]', jam.id);
  res.json(jamDetail(jam.id));
});

// PATCH /api/jams/:id/teams { teams, bench } -> persist a manual arrangement
router.patch('/:id/teams', requireAdmin, (req, res) => {
  const db = getDb();
  const jam = db.prepare('SELECT * FROM jams WHERE id = ?').get(req.params.id);
  if (!jam) return res.status(404).json({ error: 'Not found' });
  const teams = Array.isArray(req.body?.teams) ? req.body.teams : JSON.parse(jam.teams_json);
  const bench = Array.isArray(req.body?.bench) ? req.body.bench : JSON.parse(jam.bench_json);
  db.prepare('UPDATE jams SET teams_json = ?, bench_json = ?, team_count = ? WHERE id = ?')
    .run(JSON.stringify(teams), JSON.stringify(bench), teams.length || jam.team_count, jam.id);
  res.json(jamDetail(jam.id));
});

// POST /api/jams/:id/games { winner_teams:[idx], kills:{pid:k}, deaths:{pid:d} } -> log a game
// (also accepts legacy winner_team: single index/null)
router.post('/:id/games', requireAdmin, (req, res) => {
  const db = getDb();
  const jam = db.prepare('SELECT * FROM jams WHERE id = ?').get(req.params.id);
  if (!jam) return res.status(404).json({ error: 'Not found' });
  const teams = JSON.parse(jam.teams_json);
  const placed = teams.flat();
  if (!placed.length) return res.status(400).json({ error: 'No teams set — randomize first' });

  // Resolve winning teams: winner_teams array wins; else back-compat winner_team.
  let winners = [];
  if (Array.isArray(req.body?.winner_teams)) winners = req.body.winner_teams.map(Number);
  else if (req.body?.winner_team !== null && req.body?.winner_team !== undefined) winners = [Number(req.body.winner_team)];
  winners = [...new Set(winners.filter(t => Number.isInteger(t) && t >= 0 && t < teams.length))];

  const kills  = req.body?.kills  || {};
  const deaths = req.body?.deaths || {};

  const detail = transaction((tx) => {
    const gn = tx.prepare('SELECT COALESCE(MAX(game_number),0)+1 n FROM games WHERE jam_id = ?').get(jam.id).n;
    const gameId = tx.prepare('INSERT INTO games (jam_id, game_number, winner_team, winner_teams_json) VALUES (?, ?, ?, ?)')
      .run(jam.id, gn, winners.length ? winners[0] : null, JSON.stringify(winners)).lastInsertRowid;
    const ins = tx.prepare('INSERT INTO game_players (game_id, player_id, team, kills, deaths, won) VALUES (?, ?, ?, ?, ?, ?)');
    teams.forEach((team, ti) => {
      for (const pid of team) {
        const k = Math.max(0, parseInt(kills[pid], 10)  || 0);
        const d = Math.max(0, parseInt(deaths[pid], 10) || 0);
        ins.run(gameId, pid, ti, k, d, winners.includes(ti) ? 1 : 0);
      }
    });
    return gn;
  });
  res.status(201).json({ game_number: detail, ...jamDetail(jam.id) });
});

// ─── Global leaderboard + settings ──────────────────────────────────────────
router.get('/stats/alltime', (_req, res) => res.json({ ...rates(), leaderboard: leaderboard() }));

export default router;
