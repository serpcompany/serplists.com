-- Seed a small set of real, public templates owned by an official SERP user.
-- This is intended for production/remote DBs (idempotent via fixed IDs).
-- Rows whose id already exists are skipped. Any other conflict, such as another
-- Template already using one of these slugs, fails the statement with a UNIQUE
-- constraint error instead of silently dropping the row.

-- Official user (cannot be logged into; password hash is random and not shared).
INSERT INTO users (id, email, password_hash, name, username, avatar_url, created_at)
VALUES (
  'serp-user',
  'checklists@serp.co',
  '$2b$10$2SWedQoUQpcBcX8IAjh9bugK.RxoMXtxQG46gE0HADnyNQIe0OVXG',
  'SERP',
  'serp',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=serp',
  datetime('now')
)
ON CONFLICT(id) DO NOTHING;

-- Templates (stored in sections format, with descriptions + content payloads).
INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, slug, created_at)
VALUES
(
  'serp-template-technical-seo-audit',
  'serp-user',
  'Technical SEO Audit Checklist',
  'A practical technical SEO audit you can run in 60-90 minutes.',
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
            {"type":"text","value":"- Verify `robots.txt` returns `200` and is reachable.\n- Confirm important paths are not disallowed.\n- Spot check a few key pages for `meta robots` (noindex/nofollow).\n\nUseful: https://developers.google.com/search/docs/crawling-indexing/robots/intro"}
          ]
        },
        {
          "id":"t-2",
          "title":"Validate XML sitemap(s)",
          "description":"Make sure sitemaps are clean and actually represent the URLs you want indexed.",
          "contents":[
            {"type":"text","value":"- Confirm sitemap URL(s) are listed in `robots.txt`.\n- Ensure the sitemap has only canonical, indexable URLs.\n- Remove parameters and duplicates.\n\nSpec: https://www.sitemaps.org/protocol.html"}
          ]
        },
        {
          "id":"t-3",
          "title":"Review index coverage in Search Console",
          "description":"Look for spikes in excluded pages or sudden drops in indexed pages.",
          "contents":[
            {"type":"embed","value":"https://search.google.com/search-console"}
          ]
        }
      ]
    },
    {
      "id":"sec-2",
      "title":"Site Architecture",
      "items":[
        {
          "id":"t-4",
          "title":"Internal linking and crawl depth",
          "description":"Key pages should be reachable within a few clicks and have relevant internal anchors.",
          "contents":[
            {"type":"text","value":"- Identify your top money pages and confirm they have multiple internal links.\n- Ensure nav/footer do not link to thin/duplicate pages.\n- Add links from high authority pages to priority pages."}
          ]
        },
        {
          "id":"t-5",
          "title":"Canonical tags",
          "description":"Canonicals should self-reference on canonical pages and consolidate duplicates.",
          "contents":[
            {"type":"text","value":"- Spot check canonical tags across templates/variants.\n- Confirm canonical points to the preferred URL and returns `200`.\n- Avoid cross-domain canonicals unless intentional."}
          ]
        }
      ]
    },
    {
      "id":"sec-3",
      "title":"Performance and Core Web Vitals",
      "items":[
        {
          "id":"t-6",
          "title":"Run a quick PageSpeed test",
          "description":"Check LCP, INP, CLS on mobile for your top templates/pages.",
          "contents":[
            {"type":"embed","value":"https://pagespeed.web.dev/"}
          ]
        },
        {
          "id":"t-7",
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
  1,
  '["SEO","Technical SEO"]',
  '["audit","crawl","indexation","cwv"]',
  'technical-seo-audit-checklist',
  datetime('now')
),
(
  'serp-template-keyword-research-mapping',
  'serp-user',
  'Keyword Research and Mapping Checklist',
  'From seed keywords to final keyword-to-page mapping and tracking.',
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
          "title":"Expand to long-tail variations",
          "description":"Use modifiers, locations, and intent-based patterns.",
          "contents":[
            {"type":"text","value":"Examples: `best`, `near me`, `pricing`, `template`, `checklist`, `how to`, `vs`.\n\nTip: group by intent (learn, compare, buy)."}
          ]
        }
      ]
    },
    {
      "id":"sec-2",
      "title":"Mapping",
      "items":[
        {
          "id":"k-3",
          "title":"Map one primary keyword per page",
          "description":"Avoid cannibalization by giving each page a clear job.",
          "contents":[
            {"type":"text","value":"- Assign a primary keyword per URL.\n- Add a few close variants as secondary.\n- If two pages compete, merge or differentiate."}
          ]
        },
        {
          "id":"k-4",
          "title":"Create a tracking list",
          "description":"Track a small set that represents each major topic.",
          "contents":[
            {"type":"text","value":"Keep it lean: 10-50 priority terms is usually enough for MVP tracking."}
          ]
        }
      ]
    }
  ]',
  1,
  '["SEO","Research"]',
  '["keywords","intent","mapping"]',
  'keyword-research-mapping-checklist',
  datetime('now')
),
(
  'serp-template-content-refresh',
  'serp-user',
  'Content Refresh Checklist',
  'A repeatable workflow for updating existing pages and improving rankings.',
  '[
    {
      "id":"sec-1",
      "title":"Triage",
      "items":[
        {
          "id":"c-1",
          "title":"Pick candidates",
          "description":"Focus on pages with existing impressions and declining clicks.",
          "contents":[
            {"type":"text","value":"Start with pages ranking 4-20 and pages that recently lost traffic."}
          ]
        },
        {
          "id":"c-2",
          "title":"Confirm intent match",
          "description":"The page should match what the SERP rewards right now.",
          "contents":[
            {"type":"text","value":"Check top results: are they guides, lists, tools, or product pages? Adjust your structure accordingly."}
          ]
        }
      ]
    },
    {
      "id":"sec-2",
      "title":"Update",
      "items":[
        {
          "id":"c-3",
          "title":"Improve the outline and headings",
          "description":"Make the page easier to scan and more complete than competitors.",
          "contents":[
            {"type":"subItems","value":"","subItems":[
              {"id":"c-3-1","title":"Add missing sections based on top competitors"},
              {"id":"c-3-2","title":"Rewrite H1/H2 to match intent and clarity"},
              {"id":"c-3-3","title":"Add a short summary near the top"}
            ]}
          ]
        },
        {
          "id":"c-4",
          "title":"Add internal links",
          "description":"Link to and from relevant hub pages to pass context and authority.",
          "contents":[
            {"type":"text","value":"Add 3-8 internal links from related pages with descriptive anchors."}
          ]
        }
      ]
    }
  ]',
  1,
  '["Content","SEO"]',
  '["refresh","update","on-page"]',
  'content-refresh-checklist',
  datetime('now')
),
(
  'serp-template-local-seo-gbp',
  'serp-user',
  'Local SEO: Google Business Profile Checklist',
  'Basics that move the needle for GBP visibility and conversions.',
  '[
    {
      "id":"sec-1",
      "title":"Profile Setup",
      "items":[
        {
          "id":"l-1",
          "title":"Categories and services",
          "description":"Choose the most specific primary category and fill supporting services.",
          "contents":[
            {"type":"text","value":"- Primary category should match your core offer.\n- Add secondary categories sparingly.\n- Fill services with natural phrasing."}
          ]
        },
        {
          "id":"l-2",
          "title":"Photos and posts",
          "description":"Add real photos and publish simple weekly updates.",
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
  1,
  '["SEO","Local SEO"]',
  '["gbp","local","maps"]',
  'local-seo-gbp-checklist',
  datetime('now')
),
(
  'serp-template-serp-features',
  'serp-user',
  'SERP Features Optimization Checklist',
  'Optimize pages for rich results and features like snippets, FAQs, and sitelinks.',
  '[
    {
      "id":"sec-1",
      "title":"Opportunities",
      "items":[
        {
          "id":"s-1",
          "title":"Identify feature targets",
          "description":"Look at the current SERP and list the features present.",
          "contents":[
            {"type":"text","value":"Examples: Featured snippet, People Also Ask, video carousel, image pack, sitelinks."}
          ]
        }
      ]
    },
    {
      "id":"sec-2",
      "title":"Implementation",
      "items":[
        {
          "id":"s-2",
          "title":"Add structured data where appropriate",
          "description":"Only add markup that matches visible page content.",
          "contents":[
            {"type":"text","value":"Validate schema output after deploy.\n\nTool: https://search.google.com/test/rich-results"}
          ]
        }
      ]
    }
  ]',
  1,
  '["SEO","SERP"]',
  '["rich-results","snippets","schema"]',
  'serp-features-optimization-checklist',
  datetime('now')
)
ON CONFLICT(id) DO NOTHING;

