import jwt from 'jsonwebtoken';
import { getSecret } from './secrets.js';

// Env JWT_SECRET when set, otherwise a persistent auto-generated secret.
// No more public hardcoded fallback (which made every token forgeable).
const SECRET = getSecret('jwt', 'JWT_SECRET');

/** 30-day session token for logged-in players */
export function signPlayerToken(playerId) {
  return jwt.sign({ playerId, purpose: 'session' }, SECRET, { expiresIn: '30d' });
}

/** 24-hour admin session token */
export function signAdminToken() {
  return jwt.sign({ purpose: 'admin_session' }, SECRET, { expiresIn: '24h' });
}

/** 15-minute token granted after OTP verification, used to set a new password */
export function signOtpToken(playerId) {
  return jwt.sign({ playerId, purpose: 'otp_verified' }, SECRET, { expiresIn: '15m' });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
