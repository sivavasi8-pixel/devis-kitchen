import { createContext, useContext, useEffect, useState } from "react";
import { api, setAuthToken } from "../api";

const AuthContext = createContext(null);
const STORAGE_KEY = "devis_kitchen_auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // On load, trust a saved token until proven invalid (avoids a login flash on refresh).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setReady(true);
      return;
    }
    const { token, user: savedUser } = JSON.parse(saved);
    setAuthToken(token);
    setUser(savedUser);
    api
      .me()
      .then(({ user: fresh }) => setUser(fresh))
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const persist = (token, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    setAuthToken(token);
    setUser(user);
  };

  const login = async (email, password) => {
    const { token, user } = await api.login(email, password);
    persist(token, user);
    return user;
  };

  const signup = async (name, email, password, phone) => {
    const { token, user } = await api.signup(name, email, password, phone);
    persist(token, user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
