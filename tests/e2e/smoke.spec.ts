import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";

const sitemapSchema = readFileSync(new URL("../fixtures/sitemap.xsd", import.meta.url), "utf8");
const sitemapIndexSchema = readFileSync(new URL("../fixtures/siteindex.xsd", import.meta.url), "utf8");

async function expectSchemaValid(xml: string, schema: string, fileName: string) {
  const result = await validateXML({ xml: [{ fileName, contents: xml }], schema: [schema] });
  expect(result.errors, result.rawOutput).toEqual([]);
  expect(result.valid, result.rawOutput).toBe(true);
}

const apiTemplate = {
  id: "serp-template-technical-seo-audit",
  user_id: "serp-user",
  title: "Technical SEO Audit Checklist",
  description: "A practical technical SEO audit you can run in 60-90 minutes.",
  items: JSON.stringify([
    {
      id: "section-1",
      title: "Crawl and Indexation",
      items: [
        {
          id: "item-1",
          title: "Check robots.txt and meta robots",
          contents: [
            {
              type: "text",
              value: "Confirm important sections are crawlable.",
            },
          ],
        },
      ],
    },
  ]),
  sections: [
    {
      id: "section-1",
      title: "Crawl and Indexation",
      items: [
        {
          id: "item-1",
          title: "Check robots.txt and meta robots",
          contents: [
            {
              type: "text",
              value: "Confirm important sections are crawlable.",
            },
          ],
        },
      ],
    },
  ],
  version: 1,
  type: "checklist",
  owner_type: "user",
  team_id: null,
  is_public: true,
  category: JSON.stringify(["SEO", "Technical SEO"]),
  categories: ["SEO", "Technical SEO"],
  tags: ["audit", "crawl"],
  slug: "technical-seo-audit-checklist",
  created_at: "2026-07-04T00:16:35.000Z",
  updated_at: "2026-07-04T00:16:35.000Z",
  owner_username: "serp",
  owner_full_name: "SERP",
};

async function mockApiBackedPublicTemplate(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/auth/get-session" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(null),
      });
      return;
    }

    if (path === "/api/templates/slug/technical-seo-audit-checklist") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(apiTemplate),
      });
      return;
    }

    if (path === "/api/templates") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([apiTemplate]),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ error: `Unexpected API route in smoke test: ${path}` }),
      status: 404,
    });
  });
}

test("@smoke login page renders", async ({ page }) => {
  const maximumDepthErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Maximum update depth exceeded")) {
      maximumDepthErrors.push(message.text());
    }
  });

  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
  await expect(page.getByText("Sign in to your account to continue")).toBeVisible();
  await page.waitForTimeout(100);
  expect(maximumDepthErrors).toEqual([]);
});

test("@smoke removed docs prototype renders the public not-found page", async ({ page }) => {
  await page.goto("/docs");

  await expect(
    page.getByRole("heading", { level: 1, name: "That page does not exist" }),
  ).toBeVisible();
  await expect(page.getByText("The route /docs could not be found.")).toBeVisible();
  await expect(page.getByText("Checklist & Template Experience")).toHaveCount(0);
});

test("@smoke public document installs the configured Google Tag Manager container", async ({ request }) => {
  const pagesOrigin = new URL(
    process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api",
  ).origin;
  const response = await request.get(`${pagesOrigin}/`);
  const html = await response.text();
  const csp = response.headers()["content-security-policy"] ?? "";

  expect(response.ok()).toBe(true);
  expect(html).toContain("GTM-PZZFQBGG");
  expect(html.indexOf("googletagmanager.com/gtm.js")).toBeLessThan(
    html.indexOf("</head>"),
  );
  expect(html.indexOf("googletagmanager.com/ns.html?id=GTM-PZZFQBGG")).toBeGreaterThan(
    html.indexOf("<body>"),
  );
  expect(csp).toContain("script-src");
  expect(csp).toContain("https://www.googletagmanager.com");
  expect(csp).toContain("frame-src");
});

test("@smoke authenticated template API returns the seeded private template", async ({ request }) => {
  const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api";
  const signInResponse = await request.post(`${apiBaseUrl}/auth/sign-in/email`, {
    data: {
      email: "admin@test.com",
      password: "password123",
    },
  });

  expect(signInResponse.status()).toBe(200);

  const templatesResponse = await request.get(`${apiBaseUrl}/templates?scope=personal`);
  expect(templatesResponse.status()).toBe(200);

  const templates = await templatesResponse.json();
  expect(templates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "template-4",
        title: "Internal Publishing Checklist",
        is_public: false,
      }),
    ]),
  );

  // The public catalog is edge-cached and shared by every visitor, so it must never
  // include a private template, even for its owner.
  const catalogResponse = await request.get(`${apiBaseUrl}/templates?scope=public`);
  expect(catalogResponse.status()).toBe(200);
  const catalogIds = ((await catalogResponse.json()) as Array<{ id: string }>).map((template) => template.id);
  expect(catalogIds).not.toContain("template-4");
});

test("@smoke sitemap index and every listed shard pass the public XML audit", async ({ request }) => {
  const pagesOrigin = new URL(
    process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api",
  ).origin;
  const indexResponse = await request.get(`${pagesOrigin}/sitemap.xml`);
  const indexXml = await indexResponse.text();
  const childLocations = Array.from(
    indexXml.matchAll(/<loc>(https:\/\/serplists\.com\/sitemaps\/(?:pages|categories|profiles|templates)\/\d+\.xml)<\/loc>/g),
    (match) => match[1],
  );
  const shardLastmods = Array.from(
    indexXml.matchAll(/<loc>(https:\/\/serplists\.com\/sitemaps\/(?:pages|categories|profiles|templates)\/\d+\.xml)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g),
    (match) => [match[1], match[2]],
  );

  expect(indexResponse.ok()).toBe(true);
  expect(indexResponse.headers()["content-type"]).toContain("application/xml");
  expect(indexXml).toContain("<sitemapindex");
  expect(indexXml).not.toContain("?page=");
  expect(indexXml).not.toContain("/sitemaps/static/");
  expect(childLocations.length).toBeGreaterThan(0);
  const rootEntryCount = indexXml.match(/<sitemap>/g)?.length ?? 0;
  expect(childLocations).toHaveLength(rootEntryCount);
  expect(indexXml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(rootEntryCount);
  expect(rootEntryCount).toBeLessThanOrEqual(50_000);
  expect(new TextEncoder().encode(indexXml).byteLength).toBeLessThanOrEqual(50 * 1024 * 1024);
  await expectSchemaValid(indexXml, sitemapIndexSchema, "sitemap-index.xml");

  const robotsResponse = await request.get(`${pagesOrigin}/robots.txt`);
  expect(robotsResponse.ok()).toBe(true);
  expect(await robotsResponse.text()).toContain("Sitemap: https://serplists.com/sitemap.xml");
  const allPageLocations = new Set<string>();
  const pageLocationsByShard = new Map<string, string[]>();

  for (const childLocation of childLocations) {
    const localLocation = childLocation.replace("https://serplists.com", pagesOrigin);
    const childResponse = await request.get(localLocation);
    const childXml = await childResponse.text();
    const pageLocations = Array.from(
      childXml.matchAll(/<loc>(https:\/\/serplists\.com\/[^<]*)<\/loc>/g),
      (match) => match[1],
    );
    const lastmods = Array.from(
      childXml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g),
      (match) => match[1],
    );
    pageLocationsByShard.set(childLocation, pageLocations);

    expect(childResponse.ok(), childLocation).toBe(true);
    expect(childResponse.headers()["content-type"]).toContain("application/xml");
    expect(childXml).toContain("<urlset");
    expect(childXml).not.toContain("<sitemapindex");
    expect(pageLocations.length).toBeGreaterThan(0);
    expect(pageLocations.length).toBeLessThanOrEqual(25_000);
    expect(new TextEncoder().encode(childXml).byteLength).toBeLessThanOrEqual(50 * 1024 * 1024);
    expect(lastmods).toHaveLength(pageLocations.length);
    for (const location of pageLocations) {
      expect(allPageLocations.has(location), `duplicate URL ${location}`).toBe(false);
      allPageLocations.add(location);
    }
    expect(lastmods.every((value) => Number.isFinite(Date.parse(value)))).toBe(true);
    expect(childXml).not.toContain("<priority>");
    expect(childXml).not.toContain("<changefreq>");
    await expectSchemaValid(childXml, sitemapSchema, new URL(childLocation).pathname);

    const headResponse = await request.head(localLocation);
    expect(headResponse.status(), childLocation).toBe(200);
    expect(headResponse.headers()["content-type"]).toContain("application/xml");
    expect(headResponse.headers()["cache-control"]).toContain("s-maxage=86400");
    expect(await headResponse.text()).toBe("");
  }

  expect(allPageLocations).toContain("https://serplists.com/profile/admin");
  expect(allPageLocations).toContain(
    "https://serplists.com/profile/admin/technical-seo-audit-checklist",
  );
  expect(allPageLocations).toContain("https://serplists.com/categories/seo");
  expect(allPageLocations).not.toContain(
    "https://serplists.com/profile/admin/internal-publishing-checklist",
  );
  expect(allPageLocations).not.toContain(
    "https://serplists.com/profile/admin/shared-growth-launch-checklist",
  );
  expect(allPageLocations).not.toContain(
    "https://serplists.com/profile/jane/client-reporting-qa-checklist",
  );

  const unchangedIndexResponse = await request.get(`${pagesOrigin}/sitemap.xml`);
  const unchangedIndexXml = await unchangedIndexResponse.text();
  const unchangedShardLastmods = Array.from(
    unchangedIndexXml.matchAll(/<loc>(https:\/\/serplists\.com\/sitemaps\/(?:pages|categories|profiles|templates)\/\d+\.xml)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g),
    (match) => [match[1], match[2]],
  );
  expect(unchangedIndexResponse.ok()).toBe(true);
  expect(unchangedShardLastmods).toEqual(shardLastmods);

  for (const childLocation of childLocations) {
    const localLocation = childLocation.replace("https://serplists.com", pagesOrigin);
    const unchangedChildXml = await (await request.get(localLocation)).text();
    const unchangedPageLocations = Array.from(
      unchangedChildXml.matchAll(/<loc>(https:\/\/serplists\.com\/[^<]*)<\/loc>/g),
      (match) => match[1],
    );
    expect(unchangedPageLocations, childLocation).toEqual(pageLocationsByShard.get(childLocation));
  }

  // Pages the index never listed are refused before any build, and not cached.
  for (const unpublished of ["profiles/999999", "templates/2", "templates/999", "categories/2"]) {
    const unpublishedResponse = await request.get(`${pagesOrigin}/sitemaps/${unpublished}.xml`);
    expect(unpublishedResponse.status(), unpublished).toBe(404);
    expect(unpublishedResponse.headers()["cache-control"], unpublished).toBe("no-store");
  }
  expect((await request.get(`${pagesOrigin}/sitemaps/static.xml`, { maxRedirects: 0 })).status()).toBe(308);
  expect((await request.get(`${pagesOrigin}/categories/sitemap.xml`, { maxRedirects: 0 })).status()).toBe(308);
});

test("@smoke login link renders the login page without refresh", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^log in$/i }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
});

test("@smoke protected routes render login after redirect without refresh", async ({
  page,
}) => {
  await page.goto("/dashboard/settings");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
});

test("@smoke API-backed public template single renders", async ({ page }) => {
  await mockApiBackedPublicTemplate(page);

  await page.goto("/profile/serp/technical-seo-audit-checklist");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Technical SEO Audit Checklist",
    }),
  ).toBeVisible();
  await expect(page.getByText("Loading template")).toHaveCount(0);
  await expect(page.getByText("Check robots.txt and meta robots")).toBeVisible();
});

test("@smoke run task descriptions preserve line breaks", async ({ page }) => {
  const description =
    "First URL instruction line\nSecond URL instruction line\\nThird URL instruction line";

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/auth/get-session" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: "session-run-lines",
            createdAt: "2026-07-04T00:00:00.000Z",
            expiresAt: "2026-07-11T00:00:00.000Z",
            token: "session-token-run-lines",
            updatedAt: "2026-07-04T00:00:00.000Z",
            userId: "user-run-lines",
          },
          user: {
            id: "user-run-lines",
            email: "run-lines@example.com",
            emailVerified: true,
            name: "Run Lines",
            username: "runlines",
          },
        }),
      });
      return;
    }

    if (path === "/api/teams" && request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: "[]" });
      return;
    }

    if (path === "/api/teams/invites/pending" && request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: "[]" });
      return;
    }

    if (path === "/api/billing/status" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ billingEnabled: true, plan: "free" }),
      });
      return;
    }

    if (path === "/api/templates" && request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: "[]" });
      return;
    }

    if (path === "/api/checklists" && request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: "[]" });
      return;
    }

    if (
      path === "/api/checklists/run-line-breaks/history" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          checklistId: "run-line-breaks",
          events: [],
          subject: { id: "user-run-lines", type: "user" },
        }),
      });
      return;
    }

    if (path === "/api/checklists/run-line-breaks" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "run-line-breaks",
          template_id: "template-line-breaks",
          title: "Run Line Break Verification",
          status: "in_progress",
          sections: [
            {
              id: "section-1",
              title: "Crawl Prep",
              items: [
                {
                  id: "item-1",
                  title: "Create a .txt file of URLs",
                  description,
                  isCompleted: false,
                  contents: [],
                },
              ],
            },
          ],
          started_at: "2026-07-04T00:00:00.000Z",
          user_id: "user-run-lines",
          template_version: 1,
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ error: `Unexpected API route in smoke test: ${path}` }),
      status: 404,
    });
  });

  await page.goto("/dashboard/runs/run-line-breaks");

  await expect(
    page.getByRole("heading", { name: "Create a .txt file of URLs" }),
  ).toBeVisible();

  const renderedDescription = page
    .locator("p.whitespace-pre-line")
    .filter({ hasText: "First URL instruction line" })
    .first();
  await expect(renderedDescription).toBeVisible();
  await expect(renderedDescription).toContainText("Second URL instruction line");
  await expect(renderedDescription).toContainText("Third URL instruction line");

  const whiteSpace = await renderedDescription.evaluate(
    (node) => getComputedStyle(node).whiteSpace,
  );
  expect(whiteSpace).toBe("pre-line");
  await expect(page.getByRole("button", { name: "More options" })).toHaveCount(0);
});

[
  "/templates",
  "/pricing",
  "/features",
  "/categories/outdoor",
].forEach((startPath) => {
  test(`@smoke login link renders from ${startPath} without refresh`, async ({
    page,
  }) => {
    await page.goto(startPath);
    await page.getByRole("link", { name: /^log in$/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i })
    ).toBeVisible();
  });
});

test("@smoke login password visibility toggles", async ({ page }) => {
  await page.goto("/login");

  const password = page.locator("#password");

  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("@smoke register password visibility toggles", async ({ page }) => {
  await page.goto("/register");

  const password = page.locator("#password");
  const confirmPassword = page.locator("#confirmPassword");

  await expect(password).toHaveAttribute("type", "password");
  await expect(confirmPassword).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Show password" }).click();
  await page.getByRole("button", { name: "Show confirm password" }).click();

  await expect(password).toHaveAttribute("type", "text");
  await expect(confirmPassword).toHaveAttribute("type", "text");

  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Hide confirm password" }).click();

  await expect(password).toHaveAttribute("type", "password");
  await expect(confirmPassword).toHaveAttribute("type", "password");
});
