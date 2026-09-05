-- Local disposable browser fixtures only. Credential matches existing local
-- rehearsal fixture (password123); never import into a shared database.
INSERT INTO users (id,email,name,username,email_verified,created_at,auth_created_at,auth_updated_at)
VALUES ('coverage-owner','coverage-owner@e2e.local','Coverage Owner','coverage-owner',1,'2026-09-05',1788566400000,1788566400000),
('coverage-admin','coverage-admin@e2e.local','Coverage Admin','coverage-admin',1,'2026-09-05',1788566400000,1788566400000),
('coverage-editor','coverage-editor@e2e.local','Coverage Editor','coverage-editor',1,'2026-09-05',1788566400000,1788566400000),
('coverage-runner','coverage-runner@e2e.local','Coverage Runner','coverage-runner',1,'2026-09-05',1788566400000,1788566400000),
('coverage-viewer','coverage-viewer@e2e.local','Coverage Viewer','coverage-viewer',1,'2026-09-05',1788566400000,1788566400000);
INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at)
SELECT id||'-credential',id,'credential',id,'$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa',1788566400000,1788566400000 FROM users WHERE id LIKE 'coverage-%';
INSERT INTO entitlement_overrides (user_id,plan,created_at,updated_at) VALUES ('coverage-owner','pro','2026-09-05','2026-09-05');
INSERT INTO teams (id,name,slug,created_by_user_id,billing_owner_user_id,created_at) VALUES ('coverage-team','Coverage Team','coverage-team','coverage-owner','coverage-owner','2026-09-05');
INSERT INTO team_members (id,team_id,user_id,role,status,created_at)
SELECT id||'-membership','coverage-team',id,substr(id,10),'active','2026-09-05' FROM users WHERE id LIKE 'coverage-%';
INSERT INTO team_entitlement_overrides (team_id,plan,created_at,updated_at) VALUES ('coverage-team','team','2026-09-05','2026-09-05');
INSERT INTO templates (id,user_id,title,description,items,owner_type,is_public,slug,category,created_at)
VALUES ('coverage-public','coverage-owner','Coverage Public Template','Route fixture','[{"id":"section","title":"Coverage Section","items":[{"id":"item","title":"Coverage Item"}]}]','user',1,'coverage-public','["Operations"]','2026-09-05'),
('coverage-private','coverage-owner','Coverage Private Template','Route fixture','[{"id":"section","title":"Coverage Section","items":[{"id":"item","title":"Coverage Item"}]}]','user',0,'coverage-private','["Operations"]','2026-09-05');
INSERT INTO templates (id,user_id,title,items,owner_type,team_id,created_at) VALUES ('coverage-team-template','coverage-owner','Coverage Team Template','[]','team','coverage-team','2026-09-05');
-- Dedicated invalid legacy fixtures never belong to another test's account.
INSERT INTO users (id,email,name,username,email_verified,created_at,auth_created_at,auth_updated_at) VALUES ('coverage-legacy','coverage-legacy@e2e.local','Legacy Fixture','coverage-legacy',1,'2026-09-05',1788566400000,1788566400000);
INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('coverage-legacy-credential','coverage-legacy','credential','coverage-legacy','$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa',1788566400000,1788566400000);
INSERT INTO templates (id,user_id,title,items,owner_type,is_public,slug,created_at)
VALUES ('legacy-invalid-template','coverage-legacy','Invalid Legacy Template','[{"id":"s","items":[{"id":"i","title":"Bad image","contents":[{"type":"image","value":{"url":"https://example.test/image"}}]}]}]','user',0,'legacy-invalid-template','2026-09-05'),
('legacy-valid-template','coverage-legacy','Valid Legacy Template','[{"title":"Legacy task","completed":true,"contents":[{"type":"text","value":"Legacy text remains readable"}]}]','user',0,'legacy-valid-template','2026-09-05');
INSERT INTO templates (id,user_id,title,items,owner_type,is_public,slug,created_at) VALUES ('legacy-duplicate-template','coverage-legacy','Duplicate Legacy Template','[{"id":"s","title":"Section","items":[{"id":"i","title":"Item","contents":[{"id":"c","type":"text","value":"A","extension":"A"},{"id":"c","type":"text","value":"B","extension":"B"}]}]}]','user',0,'legacy-duplicate-template','2026-09-05');
INSERT INTO checklist_runs (id,user_id,title,items,status,started_at,created_at)
VALUES ('legacy-invalid-run','coverage-legacy','Invalid Legacy Run','[{"id":"s","items":[{"id":"i","contents":[{"type":"text","value":{"bad":true}}]}]}]','in_progress','2026-09-05','2026-09-05'),
('legacy-valid-run','coverage-legacy','Valid Legacy Run','[{"title":"Legacy run task","completed":true}]','in_progress','2026-09-05','2026-09-05');
INSERT INTO checklist_runs (id,user_id,template_id,title,items,is_public,share_token,status,started_at,created_at)
VALUES ('coverage-run','coverage-owner','coverage-public','Coverage Run','[{"id":"section","title":"Coverage Section","items":[{"id":"item","title":"Coverage Item","isCompleted":false}]}]',1,'coverage-share','in_progress','2026-09-05','2026-09-05');
