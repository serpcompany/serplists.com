import React, { createContext, useContext, useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  username?: string;
}

interface AuthContextType {
  user: User | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<unknown | null>(null);

  const isAuthenticated = !!user;

  useEffect(() => {
    authClient
      .getSession()
      .then((result) => {
        if (result?.data?.user) {
          setUser(result.data.user as unknown as User);
          setSession(result.data);
        } else {
          setUser(null);
          setSession(null);
        }
      })
      .catch(() => {
        setUser(null);
        setSession(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result?.error) return false;

      const nextSession = await authClient.getSession();
      if (nextSession?.data?.user) {
        setUser(nextSession.data.user as unknown as User);
        setSession(nextSession.data);
        return true;
      }
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const register = async (name: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result = await authClient.signUp.email({ name, email, password });
      if (result?.error) {
        return { ok: false, error: result.error.message ?? "Registration failed" };
      }

      const nextSession = await authClient.getSession();
      if (nextSession?.data?.user) {
        setUser(nextSession.data.user as unknown as User);
        setSession(nextSession.data);
        return { ok: true };
      }
      return { ok: true };
    } catch (error) {
      console.error('Registration failed:', error);
      return { ok: false, error: "Registration failed" };
    }
  };

  const logout = () => {
    authClient.signOut().finally(() => {
      setUser(null);
      setSession(null);
    });
  };

  const refreshProfile = async () => {
    try {
      const nextSession = await authClient.getSession();
      if (nextSession?.data?.user) {
        setUser(nextSession.data.user as unknown as User);
        setSession(nextSession.data);
      } else {
        setUser(null);
        setSession(null);
      }
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session,
      isAuthenticated,
      isLoading, 
      login, 
      register, 
      logout,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
