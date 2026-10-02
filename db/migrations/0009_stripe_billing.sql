CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at INTEGER,
  trial_end INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS stripe_subscriptions_user_id_idx ON stripe_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS stripe_subscriptions_customer_id_idx ON stripe_subscriptions(stripe_customer_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created INTEGER NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT NOT NULL,
  error TEXT
);
