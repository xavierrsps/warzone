import { verifyToken } from '../lib/auth.js';

// Opt-in local-machine admin shortcut (desktop/dev). Proxy-safe: disabled the
// moment the request carries a forwarding header, so it can't hand admin to the
// internet when running behind nginx/Cloudflare. Prod leaves it unset.
function isTrustedLoopback(req) {
  if (process.env.ALLOW_LOOPBACK_ADMIN !== '1') return false;
  if (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers['forwarded']) return false;
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function isAdmin(req) {
  if (isTrustedLoopback(req)) return true;
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  try { return verifyToken(token).purpose === 'admin_session'; }
  catch { return false; }
}

/** Gate a mutating route to admins only. */
export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

/** Attach req.auth = { isAdmin } for handlers that vary output by role. */
export function attachAuth(req, res, next) {
  req.auth = { isAdmin: isAdmin(req) };
  next();
}
