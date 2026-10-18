import './loadenv.js'; // MUST be first — loads .env before any env-reading module
import express   from 'express';
import cors      from 'cors';
import helmet    from 'helmet';
import rateLimit from 'express-rate-limit';
import path      from 'path';
import { fileURLToPath } from 'url';
import { existsSync }    from 'fs';

import { initDb } from './db.js';
import authRouter     from './routes/auth.js';
import playersRouter  from './routes/players.js';
import jamsRouter     from './routes/jams.js';
import settingsRouter from './routes/settings.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const PROD        = existsSync(CLIENT_DIST);

const app  = express();
const PORT = process.env.PORT || 3003;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
if (!PROD) app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json());

// Throttle the login endpoint against brute force.
app.use('/api/auth/admin-login', rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a few minutes.' },
}));

app.use('/api/auth',     authRouter);
app.use('/api/players',  playersRouter);
app.use('/api/jams',     jamsRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve the built SPA in production; SPA fallback for client routes.
if (PROD) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

initDb();
app.listen(PORT, () => console.log(`⚔️  Warzone Manager server on :${PORT} (${PROD ? 'prod' : 'dev'})`));
