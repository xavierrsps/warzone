import { useEffect, useState } from 'react';
import { useAdmin } from '../admin.jsx';
import { getPlayers, addPlayer, updatePlayer, deletePlayer } from '../api.js';

export default function Roster() {
  const { isAdmin } = useAdmin();
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const load = () => getPlayers().then(setPlayers).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    const n = name.trim(); if (!n) return;
    try { await addPlayer(n); setName(''); setErr(''); load(); }
    catch (e) { setErr(e.response?.data?.error || 'Could not add'); }
  };
  const rename = async (p) => {
    const next = prompt('Rename gamertag', p.name); if (!next || next === p.name) return;
    await updatePlayer(p.id, { name: next }); load();
  };
  const remove = async (p) => {
    if (!confirm(`Remove ${p.name}? This deletes their game records too.`)) return;
    await deletePlayer(p.id); load();
  };

  return (
    <>
      <h1 className="h1">Roster</h1>
      <p className="sub">{players.length} player{players.length === 1 ? '' : 's'}{isAdmin ? '' : ' · log in as admin to edit'}</p>

      {isAdmin && (
        <div className="card">
          <div className="row">
            <input className="grow" placeholder="New gamertag…" value={name}
              onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
            <button className="btn" onClick={add}>+ Add player</button>
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{err}</div>}
        </div>
      )}

      <div className="card">
        <div className="scroll"><table>
          <thead><tr><th>Player</th><th className="num">Games</th><th className="num">Wins</th><th className="num">Kills</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">{p.games}</td>
                <td className="num">{p.wins}</td>
                <td className="num">{p.kills}</td>
                {isAdmin && (
                  <td className="num">
                    <button className="btn ghost mini" onClick={() => rename(p)} style={{ padding: '4px 10px' }}>Rename</button>{' '}
                    <button className="btn danger mini" onClick={() => remove(p)} style={{ padding: '4px 10px' }}>Remove</button>
                  </td>
                )}
              </tr>
            ))}
            {players.length === 0 && <tr><td colSpan={isAdmin ? 5 : 4} className="empty">No players yet.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
