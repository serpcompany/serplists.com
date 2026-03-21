import React, { createContext, useContext, useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  username?: string;
}

type AuthErrorCode = "EMAIL_NOT_VERIFIED" | "UNKNOWN";

interface AuthActionResult {
  ok: boolean;
  error?: string;
  errorCode?: AuthErrorCode;
}

interface RegisterResult extends AuthActionResult {
  requiresEmailVerification?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
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

  const login = async (email: string, password: string): Promise<AuthActionResult> => {
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result?.error) {
        const message = result.error.message ?? "Login failed";
        if (message.toLowerCase().includes("email not verified")) {
          return { ok: false, error: message, errorCode: "EMAIL_NOT_VERIFIED" };
        }
        return { ok: false, error: message, errorCode: "UNKNOWN" };
      }

      const immediateUser = result?.data?.user;
      if (immediateUser) {
        setUser(immediateUser as unknown as User);
        setSession(result.data);
        return { ok: true };
      }

      const nextSession = await authClient.getSession();
      if (nextSession?.data?.user) {
        setUser(nextSession.data.user as unknown as User);
        setSession(nextSession.data);
        return { ok: true };
      }
      setUser(null);
      setSession(null);
      return { ok: false, error: "Unable to establish session", errorCode: "UNKNOWN" };
    } catch (error) {
      console.error('Login failed:', error);
      return { ok: false, error: "Login failed", errorCode: "UNKNOWN" };
    }
  };

  const register = async (name: string, email: string, password: string): Promise<RegisterResult> => {
    try {
      const callbackURL = "/login?verified=1";
      const result = await authClient.signUp.email({ name, email, password, callbackURL });
      if (result?.error) {
        return { ok: false, error: result.error.message ?? "Registration failed", errorCode: "UNKNOWN" };
      }

      const nextSession = await authClient.getSession();
      if (nextSession?.data?.user) {
        setUser(nextSession.data.user as unknown as User);
        setSession(nextSession.data);
        return { ok: true, requiresEmailVerification: false };
      }

      return { ok: true, requiresEmailVerification: true };
    } catch (error) {
      console.error('Registration failed:', error);
      return { ok: false, error: "Registration failed", errorCode: "UNKNOWN" };
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
