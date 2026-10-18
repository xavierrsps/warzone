# ⚔️ Warzone Manager

A clan manager for jam nights: build a roster, randomize teams, track kills + wins
per game, and watch a live leaderboard. Public read-only for the crew; every
action is gated behind an admin login.

Built on the proven Badminton-app stack: React + Vite client, Express + `node:sqlite`
server, single service, PM2 + nginx, deploy via `scripts/deploy.sh`.

## Local dev
```bash
npm run install:all
# terminal A — API on :3003, terminal B — Vite on :5173 (proxies /api)
npm run dev
```
First boot sets the admin password from `WARZONE_ADMIN_PASSWORD` (default `changeme`),
and seeds "Jam #1" from the imported 6-player leaderboard. Change the password in Settings.

## Verify
```bash
npm run smoke            # API end-to-end against a throwaway DB
bash scripts/smoke-prod.sh   # prod mode: server serves the built SPA
```

## Data model
- `players` — the clan roster (unique gamertag)
- `jams` — a jam night; holds the current team arrangement (`teams_json` / `bench_json`)
- `games` — one logged game within a jam (`winner_team` nullable)
- `game_players` — per-player result in a game (`kills`, `won`; `deaths`/`placement` reserved for later)
- `settings` — `ppk`, `ppw`, `clan_name`, `admin_password_hash`

Points = `kills × ppk + wins × ppw`, computed at read time so changing rates recalcs everything live.

## Deploy (VM: xenith / play.oasis-ps.com)
Runs as PM2 app `warzone` on **:3003** (badminton=:3001, coc-portal=:3002).

1. **GitHub repo** (once): push this repo to `xavierrsps/warzone` (main branch).
2. **VM clone** (once):
   ```bash
   cd ~ && git clone git@github.com:xavierrsps/warzone.git
   cp ~/warzone/.env.example ~/warzone/.env && nano ~/warzone/.env   # set a real admin password
   ```
3. **nginx** (once): add the server block in `deploy/nginx-warzone.conf` to the VM's
   `default` site (or its own file), `sudo nginx -t && sudo systemctl reload nginx`.
4. **DNS** (once): Cloudflare A/CNAME `warzone.oasis-ps.com` → the VM (proxied).
5. **Deploy** (every update): `bash ~/warzone/scripts/deploy.sh`
