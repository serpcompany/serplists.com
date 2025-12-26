-- Clear existing test data (optional)
DELETE FROM checklist_runs WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM template_likes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM templates WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM users WHERE email LIKE '%@test.com';

-- Insert test users
-- Password for all test users is: "password123" (hashed with bcrypt)
-- Hash: "$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa"
INSERT INTO users (id, email, password_hash, name, avatar_url, created_at) VALUES
  ('user-1', 'admin@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Admin User', 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin', datetime('now')),
  ('user-2', 'john@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'John Doe', 'https://api.dicebear.com/7.x/avataaars/svg?seed=john', datetime('now')),
  ('user-3', 'jane@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Jane Smith', 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane', datetime('now')),
  ('user-4', 'bob@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Bob Builder', 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob', datetime('now'));

-- Insert test templates
INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, created_at) VALUES
  ('template-1', 'user-1', 'Website Launch Checklist', 'Complete checklist for launching a new website', 
   '[{"id":"1","title":"Domain Setup","completed":false},{"id":"2","title":"SSL Certificate","completed":false},{"id":"3","title":"SEO Meta Tags","completed":false},{"id":"4","title":"Analytics Setup","completed":false},{"id":"5","title":"Performance Testing","completed":false}]',
   1, 'Technology', '["website","launch","deployment"]', datetime('now')),
  
  ('template-2', 'user-2', 'Daily Standup Template', 'Team standup meeting checklist',
   '[{"id":"1","title":"What did you do yesterday?","completed":false},{"id":"2","title":"What will you do today?","completed":false},{"id":"3","title":"Any blockers?","completed":false}]',
   1, 'Business', '["agile","scrum","meetings"]', datetime('now')),
  
  ('template-3', 'user-3', 'Home Inspection Checklist', 'Comprehensive home inspection checklist',
   '[{"id":"1","title":"Check Roof","completed":false},{"id":"2","title":"Inspect Foundation","completed":false},{"id":"3","title":"Test Electrical","completed":false},{"id":"4","title":"Check Plumbing","completed":false},{"id":"5","title":"HVAC System","completed":false},{"id":"6","title":"Windows and Doors","completed":false}]',
   1, 'Real Estate', '["home","inspection","property"]', datetime('now')),
  
  ('template-4', 'user-1', 'Private Admin Checklist', 'Admin only checklist',
   '[{"id":"1","title":"Review user reports","completed":false},{"id":"2","title":"Check system logs","completed":false},{"id":"3","title":"Update documentation","completed":false}]',
   0, 'Admin', '["admin","private"]', datetime('now')),
  
  ('template-5', 'user-4', 'Construction Safety Checklist', 'Daily safety inspection checklist',
   '[{"id":"1","title":"PPE Check","completed":false},{"id":"2","title":"Tool Inspection","completed":false},{"id":"3","title":"Site Hazards","completed":false},{"id":"4","title":"Emergency Exits Clear","completed":false}]',
   1, 'Construction', '["safety","construction","daily"]', datetime('now'));

-- Insert test checklist runs
INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at) VALUES
  ('run-1', 'user-1', 'template-1', 'Launch Product Website', 
   '[{"id":"1","title":"Domain Setup","completed":true},{"id":"2","title":"SSL Certificate","completed":true},{"id":"3","title":"SEO Meta Tags","completed":false},{"id":"4","title":"Analytics Setup","completed":false},{"id":"5","title":"Performance Testing","completed":false}]',
   'in_progress', datetime('now', '-2 days'), datetime('now', '-2 days')),
  
  ('run-2', 'user-2', 'template-2', 'Monday Standup', 
   '[{"id":"1","title":"What did you do yesterday?","completed":true},{"id":"2","title":"What will you do today?","completed":true},{"id":"3","title":"Any blockers?","completed":true}]',
   'completed', datetime('now', '-1 days'), datetime('now', '-1 days')),
  
  ('run-3', 'user-3', 'template-3', '123 Main St Inspection',
   '[{"id":"1","title":"Check Roof","completed":true},{"id":"2","title":"Inspect Foundation","completed":true},{"id":"3","title":"Test Electrical","completed":false},{"id":"4","title":"Check Plumbing","completed":false},{"id":"5","title":"HVAC System","completed":false},{"id":"6","title":"Windows and Doors","completed":false}]',
   'in_progress', datetime('now', '-3 hours'), datetime('now', '-3 hours'));

-- Insert template likes
INSERT INTO template_likes (user_id, template_id, created_at) VALUES
  ('user-2', 'template-1', datetime('now')),
  ('user-3', 'template-1', datetime('now')),
  ('user-4', 'template-1', datetime('now')),
  ('user-1', 'template-2', datetime('now')),
  ('user-3', 'template-5', datetime('now'));

-- Insert usage analytics
INSERT INTO usage_analytics (id, user_id, action, resource_id, created_at) VALUES
  ('analytics-1', 'user-1', 'template_created', 'template-1', datetime('now', '-7 days')),
  ('analytics-2', 'user-1', 'checklist_started', 'run-1', datetime('now', '-2 days')),
  ('analytics-3', 'user-2', 'template_created', 'template-2', datetime('now', '-5 days')),
  ('analytics-4', 'user-2', 'checklist_completed', 'run-2', datetime('now', '-1 days'));

-- Display test user credentials
SELECT 'Test Users Created:' as message;
SELECT '-------------------' as divider;
SELECT email || ' - Password: password123' as credentials FROM users WHERE email LIKE '%@test.com';