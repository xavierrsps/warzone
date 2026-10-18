import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.WARZONE_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH   = path.join(DATA_DIR, 'warzone.db');

let db;

export function getDb() {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

/** better-sqlite3-style db.transaction(fn)() — BEGIN/COMMIT, ROLLBACK on throw. */
export function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try { const r = fn(d); d.exec('COMMIT'); return r; }
  catch (err) { d.exec('ROLLBACK'); throw err; }
}

export function initDb() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jams (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      date        TEXT    NOT NULL DEFAULT (date('now')),
      status      TEXT    NOT NULL DEFAULT 'open',   -- open | closed
      team_count  INTEGER NOT NULL DEFAULT 3,
      teams_json  TEXT    NOT NULL DEFAULT '[]',     -- [[playerId,...], ...]
      bench_json  TEXT    NOT NULL DEFAULT '[]',     -- [playerId,...]
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      jam_id       INTEGER NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
      game_number  INTEGER NOT NULL,
      winner_team  INTEGER,                          -- team index, or NULL (no winner)
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id   INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team      INTEGER NOT NULL,
      kills     INTEGER NOT NULL DEFAULT 0,
      deaths    INTEGER NOT NULL DEFAULT 0,          -- reserved for later K/D
      placement INTEGER,                             -- reserved for later placement
      won       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_games_jam        ON games(jam_id);
    CREATE INDEX IF NOT EXISTS idx_gp_game           ON game_players(game_id);
    CREATE INDEX IF NOT EXISTS idx_gp_player         ON game_players(player_id);
  `);

  // ── settings defaults (points-per-kill / points-per-win + admin password) ──
  const setIfAbsent = (k, v) => {
    const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(k);
    if (!row) d.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, String(v));
  };
  setIfAbsent('ppk', 1);
  setIfAbsent('ppw', 10);
  setIfAbsent('clan_name', process.env.WARZONE_CLAN_NAME || 'Warzone Manager');

  // Admin password: env on first boot wins; otherwise a default we print loudly.
  const hasPw = d.prepare("SELECT value FROM settings WHERE key = 'admin_password_hash'").get();
  if (!hasPw) {
    const pw = process.env.WARZONE_ADMIN_PASSWORD || 'changeme';
    d.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('admin_password_hash', bcrypt.hashSync(pw, 10));
    console.warn(`  🔐  admin password set to ${process.env.WARZONE_ADMIN_PASSWORD ? '(from WARZONE_ADMIN_PASSWORD)' : "default 'changeme' — change it in Settings"}`);
  }

  seedFirstJam(d);
}

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  getDb().prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

// One-time seed of the 6-player board you pasted, as "Jam #1" so nothing's lost.
function seedFirstJam(d) {
  const already = d.prepare('SELECT COUNT(*) c FROM jams').get().c;
  if (already > 0) return;

  const seed = [
    { name: 'Xavier',  kills: 68, wins: 2 },
    { name: 'Wanted',  kills: 36, wins: 1 },
    { name: 'Tony',    kills: 31, wins: 1 },
    { name: 'CmonBro', kills: 27, wins: 1 },
    { name: 'Ausmos',  kills: 24, wins: 1 },
    { name: 'Eyes',    kills: 20, wins: 0 },
  ];
  transaction((tx) => {
    const insP = tx.prepare('INSERT INTO players (name) VALUES (?)');
    const ids = {};
    for (const s of seed) ids[s.name] = insP.run(s.name).lastInsertRowid;

    const jamId = tx.prepare(
      "INSERT INTO jams (name, status, team_count) VALUES ('Jam #1 (imported)', 'closed', 3)"
    ).run().lastInsertRowid;

    // Reconstruct 2 games consistent with the pasted totals (6 wins across 2 games):
    //  G1 winners: Xavier, Wanted, Tony   G2 winners: Xavier, CmonBro, Ausmos
    const games = [
      { winners: ['Xavier', 'Wanted', 'Tony'] },
      { winners: ['Xavier', 'CmonBro', 'Ausmos'] },
    ];
    // split each player's total kills across their 2 games (rough halves — editable later)
    const half = (k, g) => (g === 0 ? Math.ceil(k / 2) : Math.floor(k / 2));
    const insG  = tx.prepare('INSERT INTO games (jam_id, game_number, winner_team) VALUES (?, ?, ?)');
    const insGP = tx.prepare('INSERT INTO game_players (game_id, player_id, team, kills, won) VALUES (?, ?, ?, ?, ?)');
    games.forEach((g, gi) => {
      const gameId = insG.run(jamId, gi + 1, 0).lastInsertRowid;
      for (const s of seed) {
        const won = g.winners.includes(s.name) ? 1 : 0;
        insGP.run(gameId, ids[s.name], won ? 0 : 1, half(s.kills, gi), won);
      }
    });
  });
  console.log('  🌱  Seeded Jam #1 from imported leaderboard (6 players, 2 games)');
}
