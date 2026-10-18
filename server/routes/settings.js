import { Router } from 'express';
import { getSetting, setSetting } from '../db.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// GET /api/settings (public) — rates + branding the UI needs
router.get('/', (_req, res) => {
  res.json({
    clan_name: getSetting('clan_name', 'Warzone Manager'),
    ppk: Number(getSetting('ppk', 1)),
    ppw: Number(getSetting('ppw', 10)),
  });
});

// PATCH /api/settings { clan_name?, ppk?, ppw? } (admin)
router.patch('/', requireAdmin, (req, res) => {
  const { clan_name, ppk, ppw } = req.body || {};
  if (clan_name !== undefined) setSetting('clan_name', String(clan_name).trim() || 'Warzone Manager');
  if (ppk !== undefined) setSetting('ppk', Math.max(0, parseInt(ppk, 10) || 0));
  if (ppw !== undefined) setSetting('ppw', Math.max(0, parseInt(ppw, 10) || 0));
  res.json({
    clan_name: getSetting('clan_name'), ppk: Number(getSetting('ppk')), ppw: Number(getSetting('ppw')),
  });
});

export default router;
