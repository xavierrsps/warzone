import { useEffect, useState } from 'react';
import { getAllTime, getJams } from '../api.js';

export default function AllTime({ settings }) {
  const [data, setData] = useState({ leaderboard: [], ppk: settings.ppk, ppw: settings.ppw });
  const [jams, setJams] = useState([]);

  const load = () => { getAllTime().then(setData).catch(() => {}); getJams().then(setJams).catch(() => {}); };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const lb = data.leaderboard || [];
  const maxW = Math.max(0, ...lb.map(r => r.wins)), maxK = Math.max(0, ...lb.map(r => r.kills));

  return (
    <>
      <h1 className="h1">All-Time Leaderboard</h1>
      <p className="sub">Every jam combined · Points = kills × {data.ppk} + wins × {data.ppw}</p>

      <div className="card">
        {lb.length === 0 ? <div className="empty">No games recorded yet.</div> : (
          <div className="scroll"><table>
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Games</th><th className="num">Wins</th><th className="num">Kills</th><th className="num">K/game</th><th className="num">Points</th></tr></thead>
            <tbody>
              {lb.map((r, i) => (
                <tr key={r.id}>
                  <td className={'rank r' + (i + 1)}>{i + 1}</td>
                  <td>{i === 0 ? '👑 ' : ''}{r.name}</td>
                  <td className="num">{r.games}</td>
                  <td className={'num' + (r.wins === maxW && maxW > 0 ? ' lead' : '')}>{r.wins}{r.wins === maxW && maxW > 0 ? ' 🏆' : ''}</td>
                  <td className={'num' + (r.kills === maxK && maxK > 0 ? ' lead' : '')}>{r.kills}{r.kills === maxK && maxK > 0 ? ' 💀' : ''}</td>
                  <td className="num muted">{r.games ? (r.kills / r.games).toFixed(1) : '0.0'}</td>
                  <td className="num pts">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <h2>Jam history</h2>
        {jams.length === 0 ? <div className="empty">No jams yet.</div> : (
          <div className="scroll"><table>
            <thead><tr><th>Jam</th><th>Date</th><th className="num">Games</th><th>Status</th></tr></thead>
            <tbody>
              {jams.map(j => (
                <tr key={j.id}><td>{j.name}</td><td className="muted">{j.date}</td><td className="num">{j.games_played}</td><td><span className={'pill ' + j.status}>{j.status}</span></td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
