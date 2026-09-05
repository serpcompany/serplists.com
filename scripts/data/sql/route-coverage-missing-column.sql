-- NEGATIVE CONTROL. Apply only to the disposable local smoke database after
-- positive tests, then destroy that database. Application query is unchanged.
-- username is used in a qualified WHERE expression. An unqualified quoted
-- SELECT name can fall back to a string literal under SQLite DQS semantics.
ALTER TABLE users RENAME COLUMN username TO coverage_missing_username;
