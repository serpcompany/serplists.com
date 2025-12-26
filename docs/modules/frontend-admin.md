# Frontend Admin Module

The frontend admin module provides authentication, user management, and account features using Cloudflare Workers JWT authentication and React components.

**Related Files:**
- `/src/contexts/CloudflareAuthContext.tsx` - Main authentication context
- `/src/pages/Account.tsx` - Account settings page
- `/src/components/RequireAuth.tsx` - Route protection component
- `/src/components/DevLoginBar.tsx` - Development login helper
- `/src/components/account/` - Account management components
- `/functions/api/handlers/auth.ts` - Authentication API endpoints

## Architecture Overview

The admin module consists of:
1. **JWT Authentication** - Token-based auth with Cloudflare Workers
2. **React Auth Context** - Client-side auth state management  
3. **Protected Routes** - Route guards for authenticated content
4. **Account Management** - Profile, billing, and developer settings
5. **Development Tools** - Quick login bar for testing

## Authentication Implementation

### Auth Context (src/contexts/CloudflareAuthContext.tsx)

```typescript
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
  signInWithOAuth: (provider: 'github') => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<boolean>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

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

  const logout = () => {
    api.logout();
    setUser(null);
    setSession(null);
  };

  // OAuth and magic link not implemented yet
  const signInWithOAuth = async (provider: 'github'): Promise<void> => {
    throw new Error('OAuth login not yet implemented');
  };

  const signInWithMagicLink = async (email: string): Promise<boolean> => {
    throw new Error('Magic link login not yet implemented');
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
      signInWithOAuth,
      signInWithMagicLink,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### API Authentication (functions/api/handlers/auth.ts)

```typescript
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json();
  
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, name FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const token = await generateJWT(user.id, env.JWT_SECRET);
  
  return new Response(JSON.stringify({ 
    token, 
    user: { id: user.id, email: user.email, name: user.name } 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const { email, password, name } = await request.json();
  
  // Check if user exists
  const existingUser = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (existingUser) {
    return new Response(JSON.stringify({ error: 'User already exists' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const userId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(password, 10);
  
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, email, hashedPassword, name || email.split('@')[0], new Date().toISOString()).run();
  
  const token = await generateJWT(userId, env.JWT_SECRET);
  
  return new Response(JSON.stringify({ token, user: { id: userId, email, name } }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET);
  
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
  }
  
  if (request.method === 'GET') {
    const user = await env.DB.prepare(
      'SELECT id, email, name, username, affiliate_code, avatar_url, referral_count, total_earnings FROM users WHERE id = ?'
    ).bind(userId).first();
    
    return new Response(JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (request.method === 'PUT') {
    const { name, avatar_url, username } = await request.json();
    
    // Update user profile
    await env.DB.prepare(
      'UPDATE users SET name = ?, avatar_url = ?, username = ?, updated_at = ? WHERE id = ?'
    ).bind(name, avatar_url, username, new Date().toISOString(), userId).run();
    
    return new Response(JSON.stringify({ success: true }));
  }
}
```

## Route Protection

### RequireAuth Component (src/components/RequireAuth.tsx)

```typescript
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { Loader2 } from "lucide-react";

const RequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to the login page with a return path
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default RequireAuth;
```

## Account Management

### Account Page (src/pages/Account.tsx)

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';
import { useDevMode } from '@/hooks/useDevMode';
import { ProfileSection } from '@/components/account/ProfileSection';
import { BillingSection } from '@/components/account/BillingSection';
import { DeveloperSection } from '@/components/account/DeveloperSection';
import { AffiliateStats } from '@/components/affiliate/AffiliateStats';

interface ProfileData {
  email: string;
  fullName: string;
  username: string;
  affiliate_code: string;
  avatar_url: string;
}

const Account = () => {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    email: user?.email || '',
    fullName: '',
    username: '',
    affiliate_code: '',
    avatar_url: ''
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const { api } = await import('@/lib/api');
      const data = await api.getProfile();
      
      if (data) {
        setProfileData(prev => ({
          ...prev,
          fullName: data.name || '',
          username: data.username || '',
          affiliate_code: data.affiliate_code || '',
          avatar_url: data.avatar_url || '',
          ...data // Include affiliate data
        }));
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleProfileUpdate = async () => {
    if (!user) return;

    // Validate username
    if (profileData.username && profileData.username.length < 3) {
      toast.error('Username must be at least 3 characters long');
      return;
    }
    if (profileData.username && !/^[a-zA-Z0-9]+$/.test(profileData.username)) {
      toast.error('Username can only contain letters and numbers');
      return;
    }
    
    setLoading(true);
    try {
      const { api } = await import('@/lib/api');
      await api.updateProfile({
        name: profileData.fullName,
        avatar_url: profileData.avatar_url,
        username: profileData.username
      });

      // Refresh the profile in AuthContext so avatar updates
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      if (error instanceof Error && error.message.includes('Username is already taken')) {
        toast.error('Username is already taken. Please choose a different one.');
      } else {
        toast.error('Failed to update profile');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Manage your profile and billing preferences</p>
      </div>

      <div className="grid gap-6">
        {/* Profile Section */}
        <ProfileSection
          profileData={profileData}
          loading={loading}
          onProfileDataChange={setProfileData}
          onProfileUpdate={handleProfileUpdate}
          onAvatarUpdate={(newAvatarUrl: string) => {
            setProfileData(prev => ({ ...prev, avatar_url: newAvatarUrl }));
          }}
        />

        {/* Affiliate Program Section */}
        <AffiliateStats profile={profileData} />

        {/* Billing Section - placeholder for future implementation */}
        <BillingSection
          subscription={{ subscribed: false, subscription_tier: null, subscription_end: null }}
          onUpgrade={() => toast.info('Billing not yet implemented')}
          onManageSubscription={() => toast.info('Subscription management not yet implemented')}
        />

        {/* Developer Settings (only show in development) */}
        {process.env.NODE_ENV === 'development' && (
          <DeveloperSection
            devOverride={false}
            onToggleDevOverride={() => {}}
            onTestGHLIntegration={() => toast.info('GHL integration not implemented')}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};
```

## Development Tools

### Dev Login Bar (src/components/DevLoginBar.tsx)

```typescript
import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Users, X } from 'lucide-react';

interface TestUser {
  email: string;
  password: string;
  name: string;
  color: string;
}

const testUsers: TestUser[] = [
  { email: 'admin@test.com', password: 'password123', name: 'Admin', color: 'bg-red-500' },
  { email: 'john@test.com', password: 'password123', name: 'John', color: 'bg-blue-500' },
  { email: 'jane@test.com', password: 'password123', name: 'Jane', color: 'bg-purple-500' },
  { email: 'bob@test.com', password: 'password123', name: 'Bob', color: 'bg-green-500' },
];

export function DevLoginBar() {
  const { login, logout, user } = useAuth();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);

  // Only show in development
  if (!import.meta.env.DEV) return null;

  const handleQuickLogin = async (testUser: TestUser) => {
    setIsLoading(true);
    try {
      const success = await login(testUser.email, testUser.password);
      if (success) {
        toast.success(`Logged in as ${testUser.name}`);
        navigate('/dashboard');
      } else {
        toast.error('Login failed - check if API is running');
      }
    } catch (error) {
      toast.error('Login error - is the API running on port 8788?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/');
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 left-4 z-50 bg-yellow-500 text-black p-2 rounded-full shadow-lg hover:bg-yellow-400 transition-colors"
        title="Show Dev Login Bar"
      >
        <Users className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-yellow-100 dark:bg-yellow-900 border-t-4 border-yellow-500 p-3 shadow-lg">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-yellow-800 dark:text-yellow-200">
              🧪 DEV MODE
            </span>
            {user && (
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                | Logged in as: <strong>{user.name || user.email}</strong>
              </span>
            )}
          </div>
          
          <div className="flex gap-2">
            {testUsers.map((testUser) => (
              <Button
                key={testUser.email}
                size="sm"
                variant="outline"
                onClick={() => handleQuickLogin(testUser)}
                disabled={isLoading || user?.email === testUser.email}
                className={`
                  ${user?.email === testUser.email ? 'ring-2 ring-offset-2 ring-yellow-500' : ''}
                  hover:bg-white dark:hover:bg-gray-800
                `}
              >
                <div className={`w-2 h-2 rounded-full ${testUser.color} mr-2`} />
                {testUser.name}
              </Button>
            ))}
            
            {user && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleLogout}
                disabled={isLoading}
              >
                Logout
              </Button>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsVisible(false)}
          className="text-yellow-700 hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-2 text-center">
        API: http://localhost:8788 | Frontend: http://localhost:{window.location.port} | 
        <span className="ml-1">Password for all: <code className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">password123</code></span>
      </div>
    </div>
  );
}
```

## Account Components

### Profile Section (src/components/account/ProfileSection.tsx)

The `ProfileSection` component handles:
- Name and username editing
- Avatar upload functionality  
- Email display (read-only)
- Form validation and submission

### Billing Section (src/components/account/BillingSection.tsx)

The `BillingSection` component shows:
- Current subscription status (placeholder)
- Upgrade/downgrade options (placeholder)
- Billing history (not implemented)

### Developer Section (src/components/account/DeveloperSection.tsx)

The `DeveloperSection` component provides:
- Development mode toggles
- API testing tools (placeholder)
- Debug information

## Current Implementation Status

### What's Working
1. **JWT Authentication** - Login/register/logout with Cloudflare Workers
2. **Route Protection** - RequireAuth component with redirect
3. **Profile Management** - Name, username, avatar updates
4. **Development Tools** - Quick login bar with test accounts
5. **Auth Context** - React context for auth state management

### What's Not Implemented
1. **OAuth Login** - GitHub/Google authentication (placeholder)
2. **Magic Link Login** - Email-based passwordless auth (placeholder)
3. **Billing System** - Subscription management (placeholder)
4. **Role-Based Access** - Admin/user roles (basic structure only)
5. **Password Reset** - Forgot password flow
6. **Email Verification** - Account verification system

### What's Partially Implemented
1. **Affiliate System** - Database structure exists, UI components present but not fully functional
2. **User Profiles** - Username and profile data exist, but public profiles not fully implemented
3. **Account Settings** - Basic profile editing works, but advanced settings are placeholders

## Security Considerations

### Current Implementation
- JWT tokens stored in localStorage
- bcrypt password hashing (10 rounds)
- Basic input validation
- CORS headers configured

### Missing Security Features
- Token refresh mechanism
- Session management
- Rate limiting on auth endpoints
- Input sanitization
- Password strength requirements
- Account lockout protection

## Technology Stack
- **Frontend**: React, TypeScript, React Router
- **State Management**: React Context + useState
- **Validation**: Basic form validation
- **UI Components**: Custom components with Tailwind CSS
- **Backend**: Cloudflare Workers with JWT
- **Database**: D1 (SQLite) with bcrypt password hashing

## See Also:
- [Data Persistence Module](./data-persistence.md)
- [Logging System Module](./logging-system.md)
- [Add Data Type Recipe](../recipes/add-data-type.md)
