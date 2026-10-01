interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown> | undefined;
  timestamp: number;
  url: string;
  userAgent: string;
}

const MAX_EVENTS_KEPT = 100;

class Analytics {
  private events: AnalyticsEvent[] = [];
  private isEnabled: boolean = true;

  constructor(inBrowser: boolean) {
    this.isEnabled = inBrowser;
    if (!inBrowser) return;

    this.trackPageView();
    this.trackClientSideNavigations();
  }

  private trackClientSideNavigations() {
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
    console.info('Analytics:', event, properties);
    if (this.events.length > MAX_EVENTS_KEPT) {
      this.events = this.events.slice(-MAX_EVENTS_KEPT);
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

  getEvents() {
    return [...this.events];
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }
}

const isBrowser = typeof window !== 'undefined';

export const analytics = new Analytics(isBrowser);

const trackUncaughtErrors = () => {
  window.addEventListener('error', (event) => {
    analytics.trackError(new Error(event.message), 'window_error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    analytics.trackError(new Error(reason === undefined ? undefined : String(reason)), 'unhandled_promise_rejection');
  });
};

if (isBrowser) trackUncaughtErrors();
