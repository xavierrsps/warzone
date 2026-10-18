import { useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useAdmin } from './admin.jsx';
import { getSettings } from './api.js';
import Tonight from './pages/Tonight.jsx';
import AllTime from './pages/AllTime.jsx';
import Roster from './pages/Roster.jsx';
import Settings from './pages/Settings.jsx';

function LoginModal({ onClose }) {
  const { login } = useAdmin();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(pw); onClose(); }
    catch { setErr('Wrong password'); setBusy(false); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h3>Admin login</h3>
        <input autoFocus type="password" placeholder="Admin password" value={pw}
          onChange={e => setPw(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? '…' : 'Log in'}</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const { isAdmin, logout } = useAdmin();
  const [settings, setSettings] = useState({ clan_name: 'Warzone Manager', ppk: 1, ppw: 10 });
  const [showLogin, setShowLogin] = useState(false);

  const reloadSettings = () => getSettings().then(setSettings).catch(() => {});
  useEffect(() => { reloadSettings(); }, []);
  useEffect(() => { document.title = settings.clan_name; }, [settings.clan_name]);

  return (
    <>
      <nav className="nav">
        <div className="brand"><span className="mk">⚔️</span>{settings.clan_name}</div>
        <NavLink to="/" end className={({isActive}) => 'tab' + (isActive ? ' active' : '')}>Tonight</NavLink>
        <NavLink to="/alltime" className={({isActive}) => 'tab' + (isActive ? ' active' : '')}>All-Time</NavLink>
        <NavLink to="/roster" className={({isActive}) => 'tab' + (isActive ? ' active' : '')}>Roster</NavLink>
        {isAdmin && <NavLink to="/settings" className={({isActive}) => 'tab' + (isActive ? ' active' : '')}>Settings</NavLink>}
        <span className="spacer" />
        {isAdmin
          ? <button className="btn ghost" onClick={logout}>Log out</button>
          : <button className="btn ghost" onClick={() => setShowLogin(true)}>Admin</button>}
      </nav>

      <div className="page">
        <Routes>
          <Route path="/" element={<Tonight settings={settings} />} />
          <Route path="/alltime" element={<AllTime settings={settings} />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/settings" element={isAdmin ? <Settings settings={settings} onSaved={reloadSettings} /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
