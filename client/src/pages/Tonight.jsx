import { useEffect, useRef, useState, useCallback } from 'react';
import { useAdmin } from '../admin.jsx';
import {
  getJams, getJam, getPlayers, createJam, setJamStatus,
  jamAddPlayer, jamRemovePlayer, jamRandomize, jamSaveTeams, jamSubmitGame,
} from '../api.js';

export default function Tonight({ settings }) {
  const { isAdmin } = useAdmin();
  const [jams, setJams] = useState([]);
  const [jamId, setJamId] = useState(null);
  const [jam, setJam] = useState(null);
  const [names, setNames] = useState({});     // id -> name
  const [sel, setSel] = useState(null);        // {where, pid}
  const [draft, setDraft] = useState({});      // pid -> kills (this round)
  const [pendingWin, setPendingWin] = useState(null);
  const [teamCount, setTeamCount] = useState(3);
  const [addName, setAddName] = useState('');
  const [summary, setSummary] = useState('');
  const pauseUntil = useRef(0);                 // skip polling right after a local write

  const nameOf = (pid) => names[pid] || `#${pid}`;

  const loadNames = useCallback(async () => {
    const ps = await getPlayers();
    setNames(Object.fromEntries(ps.map(p => [p.id, p.name])));
    return ps;
  }, []);

  // initial: pick the newest OPEN jam, else newest jam
  useEffect(() => {
    (async () => {
      await loadNames();
      const js = await getJams();
      setJams(js);
      const pick = js.find(j => j.status === 'open') || js[0];
      if (pick) setJamId(pick.id);
    })();
  }, [loadNames]);

  const refresh = useCallback(async () => {
    if (!jamId) return;
    const d = await getJam(jamId);
    setJam(d);
    setTeamCount(d.team_count || 3);
  }, [jamId]);

  useEffect(() => { if (jamId) refresh(); }, [jamId, refresh]);

  // poll every 4s (skips a beat right after a local admin write)
  useEffect(() => {
    if (!jamId) return;
    const t = setInterval(() => {
      if (Date.now() < pauseUntil.current) return;
      getJam(jamId).then(setJam).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [jamId]);

  const afterWrite = (d) => { pauseUntil.current = Date.now() + 1500; setJam(d); loadNames(); };

  // ── admin actions ──
  const doCreate = async () => {
    const d = await createJam('');
    const js = await getJams(); setJams(js); setJamId(d.id); setJam(d);
  };
  const doAdd = async () => {
    const n = addName.trim(); if (!n) return;
    const d = await jamAddPlayer(jamId, { name: n }); setAddName(''); afterWrite(d);
  };
  const quickAdd = async (pid) => afterWrite(await jamAddPlayer(jamId, { player_id: pid }));
  const doRemove = async (pid) => { setSel(null); afterWrite(await jamRemovePlayer(jamId, pid)); };
  const doRandomize = async () => { setSel(null); setPendingWin(null); afterWrite(await jamRandomize(jamId, teamCount)); };
  const saveArrangement = async (teams, bench) => { pauseUntil.current = Date.now() + 1500; setJam(j => ({ ...j, teams, bench })); afterWrite(await jamSaveTeams(jamId, teams, bench)); };

  const listOf = (where, teams, bench) => where === 'bench' ? bench : teams[where];
  const pick = (where, pid) => {
    if (!isAdmin) return;
    if (!sel) { setSel({ where, pid }); return; }
    if (sel.pid === pid) { setSel(null); return; }
    const teams = jam.teams.map(t => [...t]); const bench = [...jam.bench];
    const src = listOf(sel.where, teams, bench), dst = listOf(where, teams, bench);
    const si = src.indexOf(sel.pid), ti = dst.indexOf(pid);
    if (si >= 0 && ti >= 0) { src[si] = pid; dst[ti] = sel.pid; }
    setSel(null); saveArrangement(teams, bench);
  };
  const moveToGroup = (where) => {
    if (!isAdmin || !sel) return;
    const teams = jam.teams.map(t => [...t]); const bench = [...jam.bench];
    const src = listOf(sel.where, teams, bench), si = src.indexOf(sel.pid);
    if (si >= 0 && sel.where !== where) { src.splice(si, 1); listOf(where, teams, bench).push(sel.pid); }
    setSel(null); saveArrangement(teams, bench);
  };

  const setKill = (pid, v) => setDraft(d => { const n = { ...d }; const k = parseInt(v, 10); if (isNaN(k)) delete n[pid]; else n[pid] = k; return n; });

  const submit = async () => {
    const d = await jamSubmitGame(jamId, pendingWin, draft);
    const winNames = pendingWin != null && jam.teams[pendingWin] ? jam.teams[pendingWin].map(nameOf).join(', ') : null;
    setSummary(winNames ? `✅ Game ${d.game_number} logged — Winner: Team ${pendingWin + 1} (${winNames}) +1 win each.` : `✅ Game ${d.game_number} logged — no winner.`);
    setDraft({}); setPendingWin(null); afterWrite(d);
  };

  if (!jamId && !jam) {
    return (
      <>
        <h1 className="h1">Tonight</h1>
        <p className="sub">No jams yet.</p>
        {isAdmin
          ? <button className="btn big" onClick={doCreate}>⚔️ Start a jam</button>
          : <div className="card"><div className="empty">No jam has been started yet. Check back when the squad's online.</div></div>}
      </>
    );
  }
  if (!jam) return <div className="empty">Loading…</div>;

  const placed = jam.teams.flat();
  const pool = [...placed, ...jam.bench];
  const notInJam = Object.keys(names).map(Number).filter(id => !pool.includes(id));
  const lb = jam.leaderboard || [];
  const maxW = Math.max(0, ...lb.map(r => r.wins)), maxK = Math.max(0, ...lb.map(r => r.kills));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">{jam.name} <span className={'pill ' + jam.status}>{jam.status}</span></h1>
          <p className="sub">{jam.date} · {jam.games_played} game{jam.games_played === 1 ? '' : 's'} played</p>
        </div>
        <div className="row">
          {jams.length > 1 && (
            <select value={jamId} onChange={e => { setJamId(Number(e.target.value)); setSel(null); setDraft({}); setPendingWin(null); }}>
              {jams.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          )}
          {isAdmin && <button className="btn ghost" onClick={doCreate}>+ New jam</button>}
          {isAdmin && <button className="btn ghost" onClick={async () => afterWrite(await setJamStatus(jamId, jam.status === 'open' ? 'closed' : 'open'))}>{jam.status === 'open' ? 'Close' : 'Reopen'}</button>}
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <h2>Pool ({pool.length})</h2>
          <div>
            {pool.length === 0 && <span className="empty">Add players below, then randomize.</span>}
            {pool.map(pid => (
              <span className="chip" key={pid}>
                {nameOf(pid)}
                <span className="where">{jam.bench.includes(pid) ? 'bench' : 'T' + (jam.teams.findIndex(t => t.includes(pid)) + 1)}</span>
                <span className="x" title="remove" onClick={() => doRemove(pid)}>✕</span>
              </span>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <input className="grow" placeholder="Add a gamertag…" value={addName}
              onChange={e => setAddName(e.target.value)} onKeyDown={e => e.key === 'Enter' && doAdd()} />
            <button className="btn" onClick={doAdd}>+ Add</button>
            <span className="row" style={{ gap: 6 }}>
              <span className="mini muted">Teams</span>
              <select value={teamCount} onChange={e => setTeamCount(Number(e.target.value))}>
                {[2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="btn" onClick={doRandomize}>🎲 Randomize</button>
            </span>
          </div>
          {notInJam.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="mini muted" style={{ marginBottom: 4 }}>Quick-add from roster:</div>
              {notInJam.map(id => <span className="chip" key={id} style={{ cursor: 'pointer' }} onClick={() => quickAdd(id)}>+ {nameOf(id)}</span>)}
            </div>
          )}
        </div>
      )}

      {/* bench */}
      {isAdmin && jam.bench.length > 0 && (
        <div className="card" onClick={() => moveToGroup('bench')}>
          <h2>Bench — tap a player then tap a team to deploy them</h2>
          <div>
            {jam.bench.map(pid => (
              <span className={'chip' + (sel && sel.where === 'bench' && sel.pid === pid ? ' sel' : '')} key={pid}
                style={sel && sel.where === 'bench' && sel.pid === pid ? { outline: '2px solid var(--accent)' } : null}
                onClick={e => { e.stopPropagation(); pick('bench', pid); }}>{nameOf(pid)}</span>
            ))}
          </div>
        </div>
      )}

      {/* teams */}
      {jam.teams.length > 0 && (
        <div className="teams">
          {jam.teams.map((team, ti) => (
            <div className={'team' + (pendingWin === ti ? ' winner' : '')} key={ti} onClick={() => moveToGroup(ti)}>
              <div className="th">
                <h3>Team {ti + 1} · {team.length}</h3>
                {isAdmin && jam.status === 'open' && (
                  <button className={'wintoggle' + (pendingWin === ti ? ' on' : '')}
                    onClick={e => { e.stopPropagation(); setPendingWin(pendingWin === ti ? null : ti); }}>
                    🏆 {pendingWin === ti ? 'Winner ✓' : 'Winner'}
                  </button>
                )}
              </div>
              <ul className="plist">
                {team.map(pid => (
                  <li key={pid} className={sel && sel.where === ti && sel.pid === pid ? 'sel' : ''}
                    onClick={e => { e.stopPropagation(); pick(ti, pid); }}>
                    <span>{nameOf(pid)}</span>
                    {isAdmin && jam.status === 'open' && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <input className="k" type="number" min="0" placeholder="K"
                          value={draft[pid] ?? ''} onChange={e => setKill(pid, e.target.value)} />
                        <span className="rm" title="remove" onClick={() => doRemove(pid)}>✕</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {isAdmin && jam.status === 'open' && placed.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row">
            <button className="btn big" onClick={submit}>✅ Submit game scores</button>
            <span className="mini muted grow">Enter kills, mark the winning team (optional — the whole team gets the win), then Submit.</span>
          </div>
          <div className="summary">{summary}</div>
        </div>
      )}

      {/* tonight's leaderboard */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>🏆 Tonight's leaderboard</h2>
        {lb.length === 0 ? <div className="empty">No games logged yet.</div> : (
          <div className="scroll"><table>
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Games</th><th className="num">Wins</th><th className="num">Kills</th><th className="num">Points</th></tr></thead>
            <tbody>
              {lb.map((r, i) => (
                <tr key={r.id}>
                  <td className={'rank r' + (i + 1)}>{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="num">{r.games}</td>
                  <td className={'num' + (r.wins === maxW && maxW > 0 ? ' lead' : '')}>{r.wins}{r.wins === maxW && maxW > 0 ? ' 🏆' : ''}</td>
                  <td className={'num' + (r.kills === maxK && maxK > 0 ? ' lead' : '')}>{r.kills}{r.kills === maxK && maxK > 0 ? ' 💀' : ''}</td>
                  <td className="num pts">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <div className="mini muted" style={{ marginTop: 8 }}>Points = kills × {settings.ppk} + wins × {settings.ppw}.</div>
      </div>

      {/* per-game sheet */}
      {jam.sheet && jam.sheet.length > 0 && (
        <div className="card">
          <h2>📊 Per-game breakdown</h2>
          <div className="scroll"><table>
            <thead><tr><th>Player</th>{jam.sheet.map(g => <th key={g.id} className="num">G{g.game_number}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {lb.map(r => {
                let tot = 0;
                const cells = jam.sheet.map(g => {
                  const e = g.players[r.id];
                  if (!e) return <td key={g.id} className="num muted">–</td>;
                  const p = e.kills * settings.ppk + (e.won ? settings.ppw : 0); tot += p;
                  return <td key={g.id} className="num">{e.won ? '🟡 ' : ''}{p} <span className="muted mini">({e.kills}k)</span></td>;
                });
                return <tr key={r.id}><td>{r.name}</td>{cells}<td className="num pts">{tot}</td></tr>;
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}
