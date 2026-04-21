import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { t } from '../utils/i18n.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('mobile_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('mobile_token') || null);

  const login = useCallback(async (username, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.message || data.error || t('loginFailedGeneric') };
      }

      const tok = data.token || data.access_token;
      const usr = data.user || { username, id: data.userId };

      localStorage.setItem('mobile_token', tok);
      localStorage.setItem('mobile_user', JSON.stringify(usr));
      setToken(tok);
      setUser(usr);

      return { success: true };
    } catch (err) {
      return { success: false, error: t('networkError') };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('mobile_token');
    localStorage.removeItem('mobile_user');
    setToken(null);
    setUser(null);
  }, []);

  // Keep state in sync if localStorage is cleared externally (e.g. useApi on 401)
  useEffect(() => {
    const syncFromStorage = () => {
      const storedToken = localStorage.getItem('mobile_token');
      if (!storedToken && token) {
        setToken(null);
        setUser(null);
      }
    };
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, [token]);

  // Memoize the context value so consumers don't re-render on every AuthProvider render
  const value = useMemo(
    () => ({ user, token, login, logout, isAuthenticated: !!token }),
    [user, token, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
