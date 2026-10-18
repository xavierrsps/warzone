// Loads .env before anything else reads process.env. Imported as the very first
// import in index.js so ESM hoisting can't run env-reading modules first.
// Zero-dependency (Node ≥20.12 built-in). Real environment variables win.
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
for (const p of [path.join(here, '..', '.env'), path.join(here, '.env')]) {
  if (existsSync(p)) {
    try { process.loadEnvFile(p); } catch { /* older node / already set */ }
  }
}
