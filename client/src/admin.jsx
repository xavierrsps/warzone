import { createContext, useContext, useState, useCallback } from 'react';
import { adminLogin } from './api.js';

const AdminCtx = createContext(null);

export function AdminProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('wzAdminToken'));
  const isAdmin = !!token;

  const login = useCallback(async (password) => {
    const { token } = await adminLogin(password);
    localStorage.setItem('wzAdminToken', token);
    setToken(token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('wzAdminToken');
    setToken(null);
  }, []);

  return <AdminCtx.Provider value={{ isAdmin, login, logout }}>{children}</AdminCtx.Provider>;
}

export const useAdmin = () => useContext(AdminCtx);
