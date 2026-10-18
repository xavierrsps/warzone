import crypto from 'crypto';
import path   from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// Secrets live next to the DB in the (gitignored) data dir so they persist
// across restarts and travel with the data dir. Honours BADMINTON_DATA_DIR the
// same way db.js does.
const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR     = process.env.WARZONE_DATA_DIR || path.join(__dirname, '..', 'data');
const SECRETS_PATH = path.join(DATA_DIR, '.secrets.json');

let cache = null;

function loadStore() {
  if (cache) return cache;
  try {
    cache = existsSync(SECRETS_PATH) ? JSON.parse(readFileSync(SECRETS_PATH, 'utf8')) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(store) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SECRETS_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

/**
 * Returns a stable secret for `name`.
 *
 * Precedence:
 *   1. process.env[envVar]  — explicit config (env-driven handover path).
 *   2. a random secret persisted to DATA_DIR/.secrets.json, generated on first
 *      use and reused forever after.
 *
 * This replaces the old public hardcoded fallbacks (which made every JWT and
 * QR check-in token forgeable) without forcing a manual setup step or risking a
 * boot failure on the live VM. Rotating a secret (deleting the file / changing
 * the env) invalidates existing tokens — see the docs for the one-time impact.
 */
export function getSecret(name, envVar) {
  const fromEnv = envVar ? process.env[envVar] : undefined;
  if (fromEnv) return fromEnv;

  const store = loadStore();
  if (!store[name]) {
    store[name] = crypto.randomBytes(48).toString('base64url');
    persist(store);
    console.warn(`  🔐  ${envVar || name} not set — generated a persistent secret in ${SECRETS_PATH}`);
  }
  return store[name];
}
