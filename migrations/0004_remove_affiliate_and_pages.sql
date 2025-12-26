-- Remove legacy, out-of-scope tables and indexes.
-- These were introduced for affiliate tracking and "Pages" content, both cut from MVP.

DROP INDEX IF EXISTS idx_users_affiliate_code;

-- Affiliate tables
DROP INDEX IF EXISTS idx_referral_visits_referral_code;
DROP INDEX IF EXISTS idx_referral_visits_referrer_id;
DROP INDEX IF EXISTS idx_referrals_referrer_id;
DROP INDEX IF EXISTS idx_referrals_referred_user_id;
DROP TABLE IF EXISTS referral_visits;
DROP TABLE IF EXISTS referrals;

-- Pages table
DROP INDEX IF EXISTS idx_pages_user_id;
DROP INDEX IF EXISTS idx_pages_slug;
DROP INDEX IF EXISTS idx_pages_public;
DROP TABLE IF EXISTS pages;

