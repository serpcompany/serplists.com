-- Clear existing test data (optional)
DELETE FROM checklist_runs
WHERE team_id IN ('team-seed-growth', 'team-seed-client')
   OR template_id IN ('team-template-growth-launch', 'team-template-client-reporting')
   OR user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');

DELETE FROM template_versions
WHERE template_id IN ('team-template-growth-launch', 'team-template-client-reporting');

DELETE FROM audit_events
WHERE subject_id IN ('team-seed-growth', 'team-seed-client')
   OR resource_id IN (
     'team-seed-growth',
     'team-seed-client',
     'team-template-growth-launch',
     'team-template-client-reporting',
     'team-invite-seed-client-john'
   );

DELETE FROM template_likes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM usage_analytics WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM templates
WHERE team_id IN ('team-seed-growth', 'team-seed-client')
   OR user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM team_entitlement_overrides WHERE team_id IN ('team-seed-growth', 'team-seed-client');
DELETE FROM team_invites WHERE team_id IN ('team-seed-growth', 'team-seed-client');
DELETE FROM team_members
WHERE team_id IN ('team-seed-growth', 'team-seed-client')
   OR user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM teams WHERE id IN ('team-seed-growth', 'team-seed-client');
DELETE FROM entitlement_overrides WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM session WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM account WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM users WHERE email LIKE '%@test.com';

-- Insert test users
-- Password for all test users is: "password123" (hashed with bcrypt)
-- Hash: "$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa"
INSERT INTO users (id, email, password_hash, name, username, display_username, avatar_url, email_verified, auth_created_at, auth_updated_at, created_at) VALUES
  ('user-1', 'admin@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Admin (Pro)', 'admin', 'admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, datetime('now')),
  ('user-2', 'john@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'John (Free)', 'john', 'john', 'https://api.dicebear.com/7.x/avataaars/svg?seed=john', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, datetime('now')),
  ('user-3', 'jane@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Jane (Pro)', 'jane', 'jane', 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, datetime('now')),
  ('user-4', 'bob@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Bob (Free)', 'bob', 'bob', 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, datetime('now'));

-- Better Auth credential accounts for the seeded users
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES
  (lower(hex(randomblob(16))), 'user-1', 'credential', 'user-1', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  (lower(hex(randomblob(16))), 'user-2', 'credential', 'user-2', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  (lower(hex(randomblob(16))), 'user-3', 'credential', 'user-3', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  (lower(hex(randomblob(16))), 'user-4', 'credential', 'user-4', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- Seed entitlements so local personas match their labels.
INSERT INTO entitlement_overrides (user_id, plan, expires_at, note, created_at, updated_at) VALUES
  ('user-1', 'pro', NULL, 'Seeded dev persona: Admin (Pro)', datetime('now'), datetime('now')),
  ('user-3', 'pro', NULL, 'Seeded dev persona: Jane (Pro)', datetime('now'), datetime('now'));

-- Insert shared team fixtures for local verification.
INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at, updated_at) VALUES
  ('team-seed-growth', 'SERP Growth Team', 'serp-growth-team', 'user-1', 'user-1', datetime('now', '-5 days'), datetime('now', '-1 days')),
  ('team-seed-client', 'Local SEO Client Team', 'local-seo-client-team', 'user-3', 'user-3', datetime('now', '-4 days'), datetime('now', '-2 days'));

INSERT INTO team_members (id, team_id, user_id, role, status, invited_by_user_id, joined_at, created_at, updated_at) VALUES
  ('team-member-growth-owner-admin', 'team-seed-growth', 'user-1', 'owner', 'active', NULL, datetime('now', '-5 days'), datetime('now', '-5 days'), datetime('now', '-5 days')),
  ('team-member-growth-admin-jane', 'team-seed-growth', 'user-3', 'admin', 'active', 'user-1', datetime('now', '-4 days'), datetime('now', '-4 days'), datetime('now', '-3 days')),
  ('team-member-growth-editor-john', 'team-seed-growth', 'user-2', 'editor', 'active', 'user-1', datetime('now', '-3 days'), datetime('now', '-3 days'), datetime('now', '-3 days')),
  ('team-member-growth-runner-bob', 'team-seed-growth', 'user-4', 'runner', 'active', 'user-1', datetime('now', '-2 days'), datetime('now', '-2 days'), datetime('now', '-2 days')),
  ('team-member-client-owner-jane', 'team-seed-client', 'user-3', 'owner', 'active', NULL, datetime('now', '-4 days'), datetime('now', '-4 days'), datetime('now', '-4 days')),
  ('team-member-client-viewer-bob', 'team-seed-client', 'user-4', 'viewer', 'active', 'user-3', datetime('now', '-1 days'), datetime('now', '-1 days'), datetime('now', '-1 days'));

INSERT INTO team_invites (id, team_id, email, role, token_hash, invited_by_user_id, expires_at, created_at, updated_at) VALUES
  ('team-invite-seed-client-john', 'team-seed-client', 'john@test.com', 'editor', '0de44e8d656bd6e84c00315f9bbb63b42706edd10a8ad2281e56439ce29bb33e', 'user-3', datetime('now', '+30 days'), datetime('now', '-12 hours'), datetime('now', '-12 hours'));

INSERT INTO team_entitlement_overrides (team_id, plan, expires_at, note, created_at, updated_at) VALUES
  ('team-seed-growth', 'team', NULL, 'Seeded premium team workspace for local verification', datetime('now'), datetime('now'));

-- Insert test templates
INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, slug, created_at) VALUES
  ('template-1', 'user-1', 'Technical SEO Audit Checklist', 'A practical technical SEO audit you can run in 60-90 minutes.', 
   '[
     {
       "id":"sec-1",
       "title":"Crawl and Indexation",
       "items":[
         {
           "id":"t-1",
           "title":"Check robots.txt and meta robots",
           "description":"Confirm important sections are crawlable and not accidentally blocked.",
           "contents":[
             {"type":"text","value":"- Verify `robots.txt` returns `200` and is reachable.\\n- Confirm important paths are not disallowed.\\n- Spot check key pages for `meta robots` (noindex/nofollow).\\n\\nUseful: https://developers.google.com/search/docs/crawling-indexing/robots/intro"}
           ]
         },
         {
           "id":"t-2",
           "title":"Validate XML sitemap(s)",
           "description":"Make sure sitemaps are clean and represent the URLs you want indexed.",
           "contents":[
             {"type":"text","value":"- Confirm sitemap URL(s) are listed in `robots.txt`.\\n- Ensure the sitemap has only canonical, indexable URLs.\\n\\nSpec: https://www.sitemaps.org/protocol.html"}
           ]
         }
       ]
     },
     {
       "id":"sec-2",
       "title":"Performance and Core Web Vitals",
       "items":[
         {
           "id":"t-3",
           "title":"Run a quick PageSpeed test",
           "description":"Check LCP, INP, CLS on mobile for your top pages.",
           "contents":[
             {"type":"embed","value":"https://pagespeed.web.dev/"}
           ]
         },
         {
           "id":"t-4",
           "title":"Fix obvious render-blocking issues",
           "description":"Biggest wins are usually images, fonts, and unused JS/CSS.",
           "contents":[
             {"type":"subItems","value":"","subItems":[
               {"id":"s-1","title":"Compress/resize large images and add lazy loading"},
               {"id":"s-2","title":"Preload critical fonts and use font-display swap"},
               {"id":"s-3","title":"Remove unused scripts and defer non-critical JS"}
             ]}
           ]
         }
       ]
     }
   ]',
   1, '["SEO","Technical SEO"]', '["audit","crawl","indexation","cwv"]', 'technical-seo-audit-checklist', datetime('now')),

  ('template-2', 'user-2', 'Keyword Research and Mapping Checklist', 'From seed keywords to keyword-to-page mapping and tracking.',
   '[
     {
       "id":"sec-1",
       "title":"Research",
       "items":[
         {
           "id":"k-1",
           "title":"Collect seed terms",
           "description":"Start with products, problems, and competitor language.",
           "contents":[
             {"type":"subItems","value":"","subItems":[
               {"id":"k-1-1","title":"List core products/services"},
               {"id":"k-1-2","title":"List problems your users search for"},
               {"id":"k-1-3","title":"Pull top terms from competitor nav + headings"}
             ]}
           ]
         },
         {
           "id":"k-2",
           "title":"Map one primary keyword per page",
           "description":"Avoid cannibalization by giving each page a clear job.",
           "contents":[
             {"type":"text","value":"- Assign a primary keyword per URL.\\n- Add a few close variants as secondary.\\n- If two pages compete, merge or differentiate."}
           ]
         }
       ]
     }
   ]',
   1, '["SEO","Research"]', '["keywords","intent","mapping"]', 'keyword-research-mapping-checklist', datetime('now')),

  ('template-3', 'user-3', 'Content Refresh Checklist', 'A repeatable workflow for updating existing pages and improving rankings.',
   '[
     {
       "id":"sec-1",
       "title":"Triage",
       "items":[
         {
           "id":"c-1",
           "title":"Pick candidates",
           "description":"Focus on pages with impressions and declining clicks.",
           "contents":[
             {"type":"text","value":"Start with pages ranking 4-20 and pages that recently lost traffic."}
           ]
         },
         {
           "id":"c-2",
           "title":"Improve the outline and headings",
           "description":"Make the page easier to scan and more complete than competitors.",
           "contents":[
             {"type":"subItems","value":"","subItems":[
               {"id":"c-2-1","title":"Add missing sections based on top competitors"},
               {"id":"c-2-2","title":"Rewrite H1/H2 to match intent and clarity"},
               {"id":"c-2-3","title":"Add a short summary near the top"}
             ]}
           ]
         }
       ]
     }
   ]',
   1, '["Content","SEO"]', '["refresh","update","on-page"]', 'content-refresh-checklist', datetime('now')),

  ('template-4', 'user-1', 'Internal Publishing Checklist', 'Private checklist for shipping an SEO-focused page update.',
   '[
     {
       "id":"sec-1",
       "title":"Before Publish",
       "items":[
         {"id":"p-1","title":"Title + meta description reviewed","description":"Ensure title and description match intent and include primary term."},
         {"id":"p-2","title":"Internal links added","description":"Link from at least 2 relevant pages to the updated URL."},
         {"id":"p-3","title":"Tracking updated","description":"Add the keyword to your tracking list and note the publish date."}
       ]
     }
   ]',
   0, '["Operations","SEO"]', '["publish","qa","tracking"]', 'internal-publishing-checklist', datetime('now')),

  ('template-5', 'user-4', 'Local SEO: Google Business Profile Checklist', 'Basics that move the needle for GBP visibility and conversions.',
   '[
     {
       "id":"sec-1",
       "title":"Profile Setup",
       "items":[
         {
           "id":"l-1",
           "title":"Categories and services",
           "description":"Choose a specific primary category and fill supporting services.",
           "contents":[
             {"type":"text","value":"- Primary category should match your core offer.\\n- Add secondary categories sparingly.\\n- Fill services with natural phrasing."}
           ]
         },
         {
           "id":"l-2",
           "title":"Photos and posts",
           "description":"Add real photos and publish weekly updates.",
           "contents":[
             {"type":"subItems","value":"","subItems":[
               {"id":"l-2-1","title":"Add exterior/interior photos"},
               {"id":"l-2-2","title":"Add team/product photos"},
               {"id":"l-2-3","title":"Publish 1 post per week (offer, update, event)"}
             ]}
           ]
         }
       ]
     }
  ]',
   1, '["SEO","Local SEO"]', '["gbp","local","maps"]', 'local-seo-gbp-checklist', datetime('now'));

-- Insert shared team templates.
INSERT INTO templates (
  id,
  user_id,
  title,
  description,
  items,
  owner_type,
  team_id,
  created_by_user_id,
  updated_by_user_id,
  is_public,
  category,
  tags,
  slug,
  created_at,
  updated_at
) VALUES
  (
    'team-template-growth-launch',
    'user-1',
    'Shared Growth Launch Checklist',
    'Team-owned checklist used to verify shared editing, runs, and history.',
    '[
      {
        "id":"team-sec-1",
        "title":"Launch Prep",
        "items":[
          {"id":"team-l-1","title":"Confirm owners and due date","description":"Assign the launch owner and confirm the target date."},
          {"id":"team-l-2","title":"Review SEO requirements","description":"Make sure indexation, redirects, metadata, and internal links are ready."},
          {"id":"team-l-3","title":"Create launch run","description":"Start a team run so members can verify runner/editor permissions."}
        ]
      }
    ]',
    'team',
    'team-seed-growth',
    'user-1',
    'user-3',
    0,
    '["Operations","SEO"]',
    '["team","launch","qa"]',
    'shared-growth-launch-checklist',
    datetime('now', '-3 days'),
    datetime('now', '-1 days')
  ),
  (
    'team-template-client-reporting',
    'user-3',
    'Client Reporting QA Checklist',
    'Team-owned checklist for verifying limited viewer access and pending invites.',
    '[
      {
        "id":"client-sec-1",
        "title":"Report QA",
        "items":[
          {"id":"client-r-1","title":"Confirm ranking screenshots","description":"Screenshots match the reporting period."},
          {"id":"client-r-2","title":"Check action item owners","description":"Each action has one responsible owner."},
          {"id":"client-r-3","title":"Verify client-ready summary","description":"Summary is clear and avoids internal notes."}
        ]
      }
    ]',
    'team',
    'team-seed-client',
    'user-3',
    'user-3',
    0,
    '["Client Work","SEO"]',
    '["team","reporting","qa"]',
    'client-reporting-qa-checklist',
    datetime('now', '-2 days'),
    datetime('now', '-2 days')
  );

-- Insert test checklist runs
INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at, progress) VALUES
  ('run-1', 'user-1', 'template-1', 'Technical SEO Audit - Sprint', 
   '[
     {"id":"sec-1","title":"Crawl and Indexation","items":[
       {"id":"t-1","title":"Check robots.txt and meta robots","isCompleted":true},
       {"id":"t-2","title":"Validate XML sitemap(s)","isCompleted":false}
     ]},
     {"id":"sec-2","title":"Performance and Core Web Vitals","items":[
       {"id":"t-3","title":"Run a quick PageSpeed test","isCompleted":false},
       {"id":"t-4","title":"Fix obvious render-blocking issues","isCompleted":false,"contents":[
         {"type":"subItems","value":"","subItems":[
           {"id":"s-1","title":"Compress/resize large images and add lazy loading","isCompleted":true},
           {"id":"s-2","title":"Preload critical fonts and use font-display swap","isCompleted":false},
           {"id":"s-3","title":"Remove unused scripts and defer non-critical JS","isCompleted":false}
         ]}
       ]}
     ]}
   ]',
   'in_progress', datetime('now', '-2 days'), datetime('now', '-2 days'), 20),

  ('run-2', 'user-2', 'template-2', 'Keyword Mapping - Week 1', 
   '[
     {"id":"sec-1","title":"Research","items":[
       {"id":"k-1","title":"Collect seed terms","isCompleted":true},
       {"id":"k-2","title":"Map one primary keyword per page","isCompleted":true}
     ]}
   ]',
   'completed', datetime('now', '-1 days'), datetime('now', '-1 days'), 100),

  ('run-3', 'user-3', 'template-3', 'Refresh - Top Page', 
   '[
     {"id":"sec-1","title":"Triage","items":[
       {"id":"c-1","title":"Pick candidates","isCompleted":true},
       {"id":"c-2","title":"Improve the outline and headings","isCompleted":false,"contents":[
         {"type":"subItems","value":"","subItems":[
           {"id":"c-2-1","title":"Add missing sections based on top competitors","isCompleted":true},
           {"id":"c-2-2","title":"Rewrite H1/H2 to match intent and clarity","isCompleted":false},
           {"id":"c-2-3","title":"Add a short summary near the top","isCompleted":false}
         ]}
       ]}
     ]}
   ]',
   'in_progress', datetime('now', '-3 hours'), datetime('now', '-3 hours'), 50);

-- Insert shared team checklist runs.
INSERT INTO checklist_runs (
  id,
  user_id,
  team_id,
  template_id,
  title,
  items,
  status,
  started_at,
  created_by_user_id,
  assigned_to_user_id,
  started_by_user_id,
  created_at,
  updated_at,
  progress
) VALUES
  (
    'team-run-growth-launch',
    'user-1',
    'team-seed-growth',
    'team-template-growth-launch',
    'Growth Launch - Shared Run',
    '[
      {"id":"team-sec-1","title":"Launch Prep","items":[
        {"id":"team-l-1","title":"Confirm owners and due date","isCompleted":true},
        {"id":"team-l-2","title":"Review SEO requirements","isCompleted":false},
        {"id":"team-l-3","title":"Create launch run","isCompleted":false}
      ]}
    ]',
    'in_progress',
    datetime('now', '-1 days'),
    'user-1',
    'user-4',
    'user-2',
    datetime('now', '-1 days'),
    datetime('now', '-6 hours'),
    33
  ),
  (
    'team-run-client-reporting',
    'user-3',
    'team-seed-client',
    'team-template-client-reporting',
    'Client Reporting QA - July',
    '[
      {"id":"client-sec-1","title":"Report QA","items":[
        {"id":"client-r-1","title":"Confirm ranking screenshots","isCompleted":true},
        {"id":"client-r-2","title":"Check action item owners","isCompleted":true},
        {"id":"client-r-3","title":"Verify client-ready summary","isCompleted":false}
      ]}
    ]',
    'in_progress',
    datetime('now', '-10 hours'),
    'user-3',
    'user-4',
    'user-3',
    datetime('now', '-10 hours'),
    datetime('now', '-3 hours'),
    67
  );

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

-- Insert team template history for changelog verification.
INSERT INTO template_versions (
  id,
  template_id,
  version,
  changed_by_user_id,
  subject_type,
  subject_id,
  snapshot_json,
  content_hash,
  change_summary,
  created_at
) VALUES
  (
    'team-version-growth-launch-1',
    'team-template-growth-launch',
    1,
    'user-1',
    'team',
    'team-seed-growth',
    '{"title":"Shared Growth Launch Checklist","items":[{"title":"Launch Prep"}]}',
    'seed-growth-launch-v1',
    'template.created',
    datetime('now', '-3 days')
  ),
  (
    'team-version-growth-launch-2',
    'team-template-growth-launch',
    2,
    'user-3',
    'team',
    'team-seed-growth',
    '{"title":"Shared Growth Launch Checklist","items":[{"title":"Launch Prep","items":["Confirm owners and due date","Review SEO requirements","Create launch run"]}]}',
    'seed-growth-launch-v2',
    'template.updated',
    datetime('now', '-1 days')
  ),
  (
    'team-version-client-reporting-1',
    'team-template-client-reporting',
    1,
    'user-3',
    'team',
    'team-seed-client',
    '{"title":"Client Reporting QA Checklist","items":[{"title":"Report QA"}]}',
    'seed-client-reporting-v1',
    'template.created',
    datetime('now', '-2 days')
  );

-- Insert team activity audit rows for local verification.
INSERT INTO audit_events (
  id,
  actor_user_id,
  subject_type,
  subject_id,
  resource_type,
  resource_id,
  action,
  before_json,
  after_json,
  diff_json,
  metadata_json,
  request_id,
  ip_hash,
  user_agent,
  created_at
) VALUES
  (
    'audit-team-growth-created',
    'user-1',
    'team',
    'team-seed-growth',
    'team',
    'team-seed-growth',
    'team.created',
    NULL,
    '{"name":"SERP Growth Team","slug":"serp-growth-team"}',
    NULL,
    '{"source":"seed"}',
    NULL,
    NULL,
    'seed',
    datetime('now', '-5 days')
  ),
  (
    'audit-template-growth-created',
    'user-1',
    'team',
    'team-seed-growth',
    'template',
    'team-template-growth-launch',
    'template.created',
    NULL,
    '{"title":"Shared Growth Launch Checklist"}',
    NULL,
    '{"source":"seed"}',
    NULL,
    NULL,
    'seed',
    datetime('now', '-3 days')
  ),
  (
    'audit-template-growth-updated',
    'user-3',
    'team',
    'team-seed-growth',
    'template',
    'team-template-growth-launch',
    'template.updated',
    '{"title":"Shared Growth Launch Checklist"}',
    '{"title":"Shared Growth Launch Checklist","reviewedBy":"jane@test.com"}',
    '{"updated_by_user_id":"user-3"}',
    '{"source":"seed"}',
    NULL,
    NULL,
    'seed',
    datetime('now', '-1 days')
  ),
  (
    'audit-team-client-created',
    'user-3',
    'team',
    'team-seed-client',
    'team',
    'team-seed-client',
    'team.created',
    NULL,
    '{"name":"Local SEO Client Team","slug":"local-seo-client-team"}',
    NULL,
    '{"source":"seed"}',
    NULL,
    NULL,
    'seed',
    datetime('now', '-4 days')
  ),
  (
    'audit-team-client-invite-john',
    'user-3',
    'team',
    'team-seed-client',
    'team_invite',
    'team-invite-seed-client-john',
    'team_invite.created',
    NULL,
    '{"email":"john@test.com","role":"editor"}',
    NULL,
    '{"source":"seed","inviteUrlPath":"/team-invites/dev-client-john-invite"}',
    NULL,
    NULL,
    'seed',
    datetime('now', '-12 hours')
  );

-- Display test user credentials
SELECT 'Test Users Created:' as message;
SELECT '-------------------' as divider;
SELECT email || ' - Password: password123' as credentials FROM users WHERE email LIKE '%@test.com';
