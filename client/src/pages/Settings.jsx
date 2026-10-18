import { useState } from 'react';
import { saveSettings, changePassword } from '../api.js';

export default function Settings({ settings, onSaved }) {
  const [clan, setClan] = useState(settings.clan_name);
  const [ppk, setPpk] = useState(settings.ppk);
  const [ppw, setPpw] = useState(settings.ppw);
  const [msg, setMsg] = useState('');

  const [cur, setCur] = useState('');
  const [nxt, setNxt] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const save = async () => {
    await saveSettings({ clan_name: clan, ppk: Number(ppk), ppw: Number(ppw) });
    setMsg('Saved ✓'); onSaved?.(); setTimeout(() => setMsg(''), 2000);
  };
  const doPw = async () => {
    setPwMsg('');
    try { await changePassword(cur, nxt); setPwMsg('Password changed ✓'); setCur(''); setNxt(''); }
    catch (e) { setPwMsg(e.response?.data?.error || 'Failed'); }
  };

  return (
    <>
      <h1 className="h1">Settings</h1>
      <p className="sub">Admin only</p>

      <div className="card" style={{ maxWidth: 460 }}>
        <h2>Branding & scoring</h2>
        <label className="mini muted">Clan / site name</label>
        <input value={clan} onChange={e => setClan(e.target.value)} style={{ width: '100%', margin: '4px 0 12px' }} />
        <div className="row">
          <div><label className="mini muted">Points per kill</label><br /><input type="number" min="0" value={ppk} onChange={e => setPpk(e.target.value)} style={{ width: 90 }} /></div>
          <div><label className="mini muted">Points per win</label><br /><input type="number" min="0" value={ppw} onChange={e => setPpw(e.target.value)} style={{ width: 90 }} /></div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={save}>Save</button>
          <span className="lead">{msg}</span>
        </div>
        <div className="mini muted" style={{ marginTop: 8 }}>Changing rates recalculates every leaderboard live.</div>
      </div>

      <div className="card" style={{ maxWidth: 460 }}>
        <h2>Change admin password</h2>
        <input type="password" placeholder="Current password" value={cur} onChange={e => setCur(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        <input type="password" placeholder="New password (min 6)" value={nxt} onChange={e => setNxt(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
        <div className="row"><button className="btn" onClick={doPw}>Update password</button><span className="lead">{pwMsg}</span></div>
      </div>
    </>
  );
}
