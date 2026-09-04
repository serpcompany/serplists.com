-- Synthetic future migration fixture. This is not repository migration history.
ALTER TABLE usage_analytics ADD COLUMN synthetic_dimension TEXT;
