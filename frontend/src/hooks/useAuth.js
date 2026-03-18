import { useEffect, useState } from 'react';
import { clearSession, fetchProfile, getStoredToken, getStoredUser, login, register, storeSession } from '../services/auth.js';

export function useAuth() {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState(getStoredUser());
  const [loading, setLoading] = useState(Boolean(getStoredToken()));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    fetchProfile(token)
      .then((data) => {
        setUser(data.user);
        setError('');
      })
      .catch(() => {
        clearSession();
        setToken('');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleLogin(credentials) {
    setLoading(true);
    try {
      const data = await login(credentials);
      storeSession(data);
      setToken(data.token);
      setUser(data.user);
      setError('');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(payload) {
    setLoading(true);
    try {
      const data = await register(payload);
      storeSession(data);
      setToken(data.token);
      setUser(data.user);
      setError('');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearSession();
    setToken('');
    setUser(null);
  }

  return {
    token,
    user,
    loading,
    error,
    setError,
    login: handleLogin,
    register: handleRegister,
    logout
  };
}
