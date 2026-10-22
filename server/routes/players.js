import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// GET /api/players  (public) — roster with all-time aggregate stats
router.get('/', (_req, res) => {
  const rows = getDb().prepare(`
    SELECT p.id, p.name, p.active,
           COALESCE(SUM(gp.kills), 0)        AS kills,
           COALESCE(SUM(gp.deaths), 0)       AS deaths,
           COALESCE(SUM(gp.won), 0)          AS wins,
           COUNT(gp.id)                       AS games
    FROM players p
    LEFT JOIN game_players gp ON gp.player_id = p.id
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE
  `).all();
  res.json(rows);
});

// POST /api/players { name }  (admin)
router.post('/', requireAdmin, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const info = getDb().prepare('INSERT INTO players (name) VALUES (?)').run(name);
    res.status(201).json({ id: info.lastInsertRowid, name });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'That gamertag already exists' });
    throw e;
  }
});

// PATCH /api/players/:id { name?, active? }  (admin)
router.patch('/:id', requireAdmin, (req, res) => {
  const { name, active } = req.body || {};
  const db = getDb();
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE players SET name = ?, active = ? WHERE id = ?')
    .run(name?.trim() || p.name, active == null ? p.active : (active ? 1 : 0), p.id);
  res.json({ ok: true });
});

// DELETE /api/players/:id  (admin) — removes player + their game rows
router.delete('/:id', requireAdmin, (req, res) => {
  getDb().prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
