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

  // The server renders client components too, where there is no window or history: there
  // the instance records nothing, so no visitor's events are kept in a server module.
  constructor(inBrowser: boolean) {
    this.isEnabled = inBrowser;
    if (!inBrowser) return;

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

const isBrowser = typeof window !== 'undefined';

// Global analytics instance (it records only in the browser; see the constructor)
export const analytics = new Analytics(isBrowser);

// Error tracking setup
if (isBrowser) {
  window.addEventListener('error', (event) => {
    analytics.trackError(new Error(event.message), 'window_error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    analytics.trackError(new Error(event.reason), 'unhandled_promise_rejection');
  });
}
