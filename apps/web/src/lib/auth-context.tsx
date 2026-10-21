'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken, type MeResponse } from './api';

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  activeOrgId: null,
  setActiveOrgId: () => {},
  logout: () => {},
});

const ORG_KEY = 'novamind.activeOrg';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setActiveOrgIdState(localStorage.getItem(ORG_KEY));
    if (!getToken()) {
      setLoading(false);
      router.replace('/login');
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        setToken(null);
        router.replace('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const setActiveOrgId = useCallback((id: string | null) => {
    setActiveOrgIdState(id);
    if (id) localStorage.setItem(ORG_KEY, id);
    else localStorage.removeItem(ORG_KEY);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(ORG_KEY);
    router.replace('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, loading, activeOrgId, setActiveOrgId, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
