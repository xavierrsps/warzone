import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('wzAdminToken');
  if (t) cfg.headers['x-admin-token'] = t;
  return cfg;
});

// If a stale/invalid admin token is rejected, clear it and reload so the UI
// drops back to the (correct) logged-out state instead of showing dead buttons.
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 403 && localStorage.getItem('wzAdminToken')) {
      localStorage.removeItem('wzAdminToken');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// settings
export const getSettings = () => api.get('/settings').then(r => r.data);
export const saveSettings = (d) => api.patch('/settings', d).then(r => r.data);

// auth
export const adminLogin = (password) => api.post('/auth/admin-login', { password }).then(r => r.data);
export const changePassword = (current, next) => api.post('/auth/change-password', { current, next }).then(r => r.data);

// players
export const getPlayers = () => api.get('/players').then(r => r.data);
export const addPlayer = (name) => api.post('/players', { name }).then(r => r.data);
export const updatePlayer = (id, d) => api.patch(`/players/${id}`, d).then(r => r.data);
export const deletePlayer = (id) => api.delete(`/players/${id}`).then(r => r.data);

// jams
export const getJams = () => api.get('/jams').then(r => r.data);
export const getJam = (id) => api.get(`/jams/${id}`).then(r => r.data);
export const createJam = (name) => api.post('/jams', { name }).then(r => r.data);
export const setJamStatus = (id, status) => api.patch(`/jams/${id}/status`, { status }).then(r => r.data);
export const deleteJam = (id) => api.delete(`/jams/${id}`).then(r => r.data);
export const jamAddPlayer = (id, body) => api.post(`/jams/${id}/add`, body).then(r => r.data);
export const jamRemovePlayer = (id, player_id) => api.post(`/jams/${id}/remove`, { player_id }).then(r => r.data);
export const jamRandomize = (id, team_count) => api.post(`/jams/${id}/randomize`, { team_count }).then(r => r.data);
export const jamSaveTeams = (id, teams, bench) => api.patch(`/jams/${id}/teams`, { teams, bench }).then(r => r.data);
export const jamSubmitGame = (id, winner_teams, kills, deaths) => api.post(`/jams/${id}/games`, { winner_teams, kills, deaths }).then(r => r.data);
export const getAllTime = () => api.get('/jams/stats/alltime').then(r => r.data);

export default api;
