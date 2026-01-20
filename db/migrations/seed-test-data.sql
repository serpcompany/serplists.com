-- Clear existing test data (optional)
DELETE FROM checklist_runs WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM template_likes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM templates WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM users WHERE email LIKE '%@test.com';

-- Insert test users
-- Password for all test users is: "password123" (hashed with bcrypt)
-- Hash: "$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa"
INSERT INTO users (id, email, password_hash, name, username, avatar_url, created_at) VALUES
  ('user-1', 'admin@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Admin User', 'admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin', datetime('now')),
  ('user-2', 'john@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'John Doe', 'john', 'https://api.dicebear.com/7.x/avataaars/svg?seed=john', datetime('now')),
  ('user-3', 'jane@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Jane Smith', 'jane', 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane', datetime('now')),
  ('user-4', 'bob@test.com', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', 'Bob Builder', 'bob', 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob', datetime('now'));

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
