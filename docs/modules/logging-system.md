# Logging System Module

The logging system provides basic error tracking and analytics through console logging and a simple analytics service.

**Related Files:**
- `/src/components/ErrorBoundary.tsx` - React error boundary component
- `/src/lib/analytics.ts` - Basic analytics and error tracking
- Console-based logging throughout the codebase

## Architecture Overview

The logging system consists of:
1. **Console Logging** - Basic console.log/error/info usage throughout app
2. **Error Boundary** - React component to catch and display errors
3. **Analytics Service** - Simple event tracking and error capture
4. **Development Mode** - Enhanced logging in development environment

**Note**: This is a minimal logging implementation. No centralized logger or advanced error tracking system is implemented.

## Current Implementation

### Error Boundary (src/components/ErrorBoundary.tsx)

```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Log to console for debugging
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2">
                <Button onClick={this.handleReset} variant="outline" className="w-full">
                  Try Again
                </Button>
                <Button onClick={this.handleRefresh} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Page
                </Button>
              </div>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 p-3 bg-muted rounded text-xs">
                  <summary className="cursor-pointer font-medium">Error Details</summary>
                  <pre className="mt-2 overflow-auto">
                    {this.state.error.message}
                    {'\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Analytics Service (src/lib/analytics.ts)

```typescript
// Simple analytics tracking for MVP
interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: number;
  url: string;
  userAgent: string;
}

class Analytics {
  private events: AnalyticsEvent[] = [];
  private isEnabled: boolean = true;

  constructor() {
    // Track page views automatically
    this.trackPageView();
    
    // Track page navigation for SPAs
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPushState.apply(history, args);
      setTimeout(() => this.trackPageView(), 0);
    };
    
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      originalReplaceState.apply(history, args);
      setTimeout(() => this.trackPageView(), 0);
    };
    
    window.addEventListener('popstate', () => {
      this.trackPageView();
    });
  }

  track(event: string, properties?: Record<string, unknown>) {
    if (!this.isEnabled) return;

    const analyticsEvent: AnalyticsEvent = {
      event,
      properties,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    this.events.push(analyticsEvent);
    
    // Log for debugging
    console.info('Analytics:', event, properties);
    
    // Keep only last 100 events in memory
    if (this.events.length > 100) {
      this.events = this.events.slice(-100);
    }
  }

  trackPageView() {
    this.track('page_view', {
      path: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      title: document.title,
      referrer: document.referrer
    });
  }

  trackError(error: Error, context?: string) {
    this.track('error', {
      message: error.message,
      stack: error.stack,
      context,
      url: window.location.href
    });
  }

  trackUser(userId: string, properties?: Record<string, unknown>) {
    this.track('user_identified', {
      userId,
      ...properties
    });
  }

  trackTemplateView(templateId: string, templateTitle: string) {
    this.track('template_view', {
      templateId,
      templateTitle
    });
  }

  trackTemplateRun(templateId: string, runId: string) {
    this.track('template_run_started', {
      templateId,
      runId
    });
  }

  trackTemplateComplete(templateId: string, runId: string, completionTime: number) {
    this.track('template_completed', {
      templateId,
      runId,
      completionTime
    });
  }

  // Get events for debugging/export
  getEvents() {
    return [...this.events];
  }

  // Enable/disable tracking
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }
}

// Global analytics instance
export const analytics = new Analytics();

// Error tracking setup
window.addEventListener('error', (event) => {
  analytics.trackError(new Error(event.error?.message || 'Window error'), 'window_error');
});

window.addEventListener('unhandledrejection', (event) => {
  analytics.trackError(new Error(event.reason), 'unhandled_promise_rejection');
});
```

## Console Logging Patterns

Throughout the codebase, basic console logging is used:

### Authentication Context (src/contexts/CloudflareAuthContext.tsx)
```typescript
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
```

### Templates Context (src/contexts/TemplatesContext.tsx)
```typescript
const { data: templates = [] } = useQuery({
  queryKey: ['templates', user?.id],
  queryFn: async () => {
    try {
      const templatesData = await api.getTemplates();
      // Transform API response...
      return transformedTemplates;
    } catch (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
  },
});
```

### Account Page (src/pages/Account.tsx)
```typescript
const loadProfile = async () => {
  try {
    const { api } = await import('@/lib/api');
    const data = await api.getProfile();
    // Update profile data...
  } catch (error) {
    console.error('Error loading profile:', error);
  }
};

const handleProfileUpdate = async () => {
  try {
    await api.updateProfile(profileData);
    toast.success('Profile updated successfully');
  } catch (error) {
    console.error('Error updating profile:', error);
    toast.error('Failed to update profile');
  }
};
```

## Development Logging

### Dev Login Bar (src/components/DevLoginBar.tsx)
```typescript
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
```

### API Client (src/lib/api.ts)
```typescript
private async request(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}
```

## API Logging

### API Handlers (functions/api/[[route]].ts)
```typescript
async function handleRequest(context: { request: Request; env: Env }): Promise<Response> {
  try {
    // Handle routing...
  } catch (error) {
    console.error('API Error:', error);
    response = new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return response;
}
```

## What's Missing

### No Centralized Logger
- No structured logging system
- No log levels (debug, info, warn, error)
- No log formatting or metadata
- No log aggregation

### No Advanced Error Tracking
- No error reporting service (like Sentry)
- No error categorization or grouping
- No error monitoring or alerts
- No performance monitoring

### No Debug Tools
- No debug panel or console
- No log export functionality
- No performance metrics
- No request/response logging

### No Production Logging
- No server-side logging for Cloudflare Workers
- No log rotation or retention
- No log streaming or aggregation
- No monitoring dashboards

## Current Logging Strategy

### Development Environment
1. **Console Logging**: Basic console.log/error/warn usage
2. **Error Boundary**: Catches React component errors and displays them
3. **Analytics**: Simple event tracking with console output
4. **Toast Notifications**: User-facing error/success messages
5. **Dev Tools**: Browser DevTools for debugging

### Production Environment
1. **Error Boundary**: Graceful error handling with user-friendly messages
2. **Analytics**: Basic event tracking (stored in memory only)
3. **Console Errors**: Still logged but not aggregated
4. **User Feedback**: Toast notifications for errors

## Logging Levels Used

- **console.log**: General information and debugging
- **console.info**: Analytics events and informational messages
- **console.warn**: Warnings (minimal usage)
- **console.error**: Errors and exceptions
- **toast messages**: User-facing notifications

## Recommendations for Enhancement

### Short Term
1. **Structured Console Logging**: Add consistent log formatting
2. **Error Context**: Include more context in error messages
3. **Debug Mode**: Add development debug logging toggle

### Medium Term
1. **Centralized Logger**: Create a proper logging service
2. **Error Reporting**: Integrate with service like Sentry
3. **Performance Monitoring**: Add timing and metrics

### Long Term
1. **Log Aggregation**: Collect and analyze logs
2. **Monitoring Dashboard**: Real-time error and performance tracking
3. **Alerting System**: Notifications for critical errors

## Technology Stack
- **Frontend Logging**: Console API, React Error Boundary
- **Analytics**: Custom in-memory event tracking
- **Error Display**: Toast notifications (sonner)
- **Debug Tools**: Browser DevTools
- **Error Handling**: Try-catch blocks with console.error

## See Also:
- [Data Persistence Module](./data-persistence.md)
- [Frontend Admin Module](./frontend-admin.md)
- [Add Data Type Recipe](../recipes/add-data-type.md)