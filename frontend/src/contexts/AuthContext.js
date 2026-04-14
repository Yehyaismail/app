import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshIntervalRef = useRef(null);

  const API_URL = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    checkAuth();
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, []);

  const startTokenRefresh = () => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    // Refresh access token every 12 minutes (token expires at 15 min)
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
        setUser(data);
      } catch (error) {
        setUser(false);
        if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      }
    }, 12 * 60 * 1000);
  };

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/auth/me`, { withCredentials: true });
      setUser(data);
      startTokenRefresh();
    } catch (error) {
      // Try refresh token
      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
        setUser(data);
        startTokenRefresh();
      } catch (refreshError) {
        setUser(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data } = await axios.post(
      `${API_URL}/api/auth/login`,
      { email, password },
      { withCredentials: true }
    );
    setUser(data);
    startTokenRefresh();
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await axios.post(
      `${API_URL}/api/auth/register`,
      { name, email, password },
      { withCredentials: true }
    );
    setUser(data);
    startTokenRefresh();
    return data;
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    } catch (e) {
      // ignore
    }
    setUser(false);
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
