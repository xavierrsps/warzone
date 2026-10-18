import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signAdminToken } from '../lib/auth.js';
import { getSetting, setSetting } from '../db.js';

const router = Router();

// POST /api/auth/admin-login { password } -> { token }
router.post('/admin-login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const hash = getSetting('admin_password_hash');
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.json({ token: signAdminToken() });
});

// POST /api/auth/change-password { current, next } (admin, verified by current pw)
router.post('/change-password', (req, res) => {
  const { current, next } = req.body || {};
  const hash = getSetting('admin_password_hash');
  if (!hash || !bcrypt.compareSync(current || '', hash)) {
    return res.status(401).json({ error: 'Current password is wrong' });
  }
  if (!next || next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  setSetting('admin_password_hash', bcrypt.hashSync(next, 10));
  res.json({ ok: true });
});

export default router;
