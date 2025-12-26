import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
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
    const token = localStorage.getItem('auth_token');
    if (token) {
      setSession({ token }); // Mock session with token
      api.getProfile()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('auth_token');
          setSession(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { user, token } = await api.login(email, password);
      setUser(user);
      setSession({ token });
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const { user, token } = await api.register(email, password, name);
      setUser(user);
      setSession({ token });
      return true;
    } catch (error) {
      console.error('Registration failed:', error);
      return false;
    }
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.token) {
      try {
        const profile = await api.getProfile();
        setUser(profile);
      } catch (error) {
        console.error('Failed to refresh profile:', error);
      }
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
