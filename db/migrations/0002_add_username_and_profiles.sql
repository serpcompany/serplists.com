-- Add username and affiliate fields to users table (without UNIQUE constraint initially)
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN affiliate_code TEXT;
ALTER TABLE users ADD COLUMN referral_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN total_earnings REAL DEFAULT 0;

-- Create unique indexes (acts like UNIQUE constraint)
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE UNIQUE INDEX idx_users_affiliate_code ON users(affiliate_code);

-- Referral visits table
CREATE TABLE IF NOT EXISTS referral_visits (
  id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL,
  referrer_id TEXT NOT NULL,
  visitor_ip TEXT,
  user_agent TEXT,
  template_id TEXT,
  converted INTEGER DEFAULT 0,
  converted_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_referral_visits_referral_code ON referral_visits(referral_code);
CREATE INDEX idx_referral_visits_referrer_id ON referral_visits(referrer_id);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  reward_amount REAL DEFAULT 5.00,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_user_id ON referrals(referred_user_id);

-- Pages table for blog/content
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT,
  is_public INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_pages_user_id ON pages(user_id);
CREATE INDEX idx_pages_slug ON pages(slug);
CREATE INDEX idx_pages_public ON pages(is_public);