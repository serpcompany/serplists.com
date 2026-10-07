export const personalTemplateItems = {
  "template-1": [
    {
      id: "sec-1",
      title: "Crawl and Indexation",
      items: [
        {
          id: "t-1",
          title: "Check robots.txt and meta robots",
          description: "Confirm important sections are crawlable and not accidentally blocked.",
          contents: [
            {
              type: "text",
              value:
                "- Verify `robots.txt` returns `200` and is reachable.\n- Confirm important paths are not disallowed.\n- Spot check key pages for `meta robots` (noindex/nofollow).\n\nUseful: https://developers.google.com/search/docs/crawling-indexing/robots/intro",
            },
          ],
        },
        {
          id: "t-2",
          title: "Validate XML sitemap(s)",
          description: "Make sure sitemaps are clean and represent the URLs you want indexed.",
          contents: [
            {
              type: "text",
              value:
                "- Confirm sitemap URL(s) are listed in `robots.txt`.\n- Ensure the sitemap has only canonical, indexable URLs.\n\nSpec: https://www.sitemaps.org/protocol.html",
            },
          ],
        },
      ],
    },
    {
      id: "sec-2",
      title: "Performance and Core Web Vitals",
      items: [
        {
          id: "t-3",
          title: "Run a quick PageSpeed test",
          description: "Check LCP, INP, CLS on mobile for your top pages.",
          contents: [{ type: "embed", value: "https://pagespeed.web.dev/" }],
        },
        {
          id: "t-4",
          title: "Fix obvious render-blocking issues",
          description: "Biggest wins are usually images, fonts, and unused JS/CSS.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "s-1", title: "Compress/resize large images and add lazy loading" },
                { id: "s-2", title: "Preload critical fonts and use font-display swap" },
                { id: "s-3", title: "Remove unused scripts and defer non-critical JS" },
              ],
            },
          ],
        },
      ],
    },
  ],
  "template-2": [
    {
      id: "sec-1",
      title: "Research",
      items: [
        {
          id: "k-1",
          title: "Collect seed terms",
          description: "Start with products, problems, and competitor language.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "k-1-1", title: "List core products/services" },
                { id: "k-1-2", title: "List problems your users search for" },
                { id: "k-1-3", title: "Pull top terms from competitor nav + headings" },
              ],
            },
          ],
        },
        {
          id: "k-2",
          title: "Map one primary keyword per page",
          description: "Avoid cannibalization by giving each page a clear job.",
          contents: [
            {
              type: "text",
              value:
                "- Assign a primary keyword per URL.\n- Add a few close variants as secondary.\n- If two pages compete, merge or differentiate.",
            },
          ],
        },
      ],
    },
  ],
  "template-3": [
    {
      id: "sec-1",
      title: "Triage",
      items: [
        {
          id: "c-1",
          title: "Pick candidates",
          description: "Focus on pages with impressions and declining clicks.",
          contents: [
            {
              type: "text",
              value: "Start with pages ranking 4-20 and pages that recently lost traffic.",
            },
          ],
        },
        {
          id: "c-2",
          title: "Improve the outline and headings",
          description: "Make the page easier to scan and more complete than competitors.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "c-2-1", title: "Add missing sections based on top competitors" },
                { id: "c-2-2", title: "Rewrite H1/H2 to match intent and clarity" },
                { id: "c-2-3", title: "Add a short summary near the top" },
              ],
            },
          ],
        },
      ],
    },
  ],
  "template-4": [
    {
      id: "sec-1",
      title: "Before Publish",
      items: [
        {
          id: "p-1",
          title: "Title + meta description reviewed",
          description: "Ensure title and description match intent and include primary term.",
        },
        {
          id: "p-2",
          title: "Internal links added",
          description: "Link from at least 2 relevant pages to the updated URL.",
        },
        {
          id: "p-3",
          title: "Tracking updated",
          description: "Add the keyword to your tracking list and note the publish date.",
        },
      ],
    },
  ],
  "template-5": [
    {
      id: "sec-1",
      title: "Profile Setup",
      items: [
        {
          id: "l-1",
          title: "Categories and services",
          description: "Choose a specific primary category and fill supporting services.",
          contents: [
            {
              type: "text",
              value:
                "- Primary category should match your core offer.\n- Add secondary categories sparingly.\n- Fill services with natural phrasing.",
            },
          ],
        },
        {
          id: "l-2",
          title: "Photos and posts",
          description: "Add real photos and publish weekly updates.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "l-2-1", title: "Add exterior/interior photos" },
                { id: "l-2-2", title: "Add team/product photos" },
                { id: "l-2-3", title: "Publish 1 post per week (offer, update, event)" },
              ],
            },
          ],
        },
      ],
    },
  ],
};
