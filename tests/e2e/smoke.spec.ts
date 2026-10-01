import { expect, test, type Page } from "@playwright/test";
import { API_BASE_URL, APP_URL } from "./support/stack";
import { routeTheApi } from "./support/mocked-api";

const WINDOWS_PATH_WITH_BACKSLASH_N = "Save the list to C:\\new_folder";

const seededSampleTemplateResponse = {
  id: "template-1",
  user_id: "user-1",
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
  slug: "sample-technical-seo-audit-checklist",
  created_at: "2026-07-04T00:16:35.000Z",
  updated_at: "2026-07-04T00:16:35.000Z",
  owner_username: "admin",
  owner_full_name: "Admin (Pro)",
};

async function mockApiBackedPublicTemplate(page: Page) {
  await routeTheApi(page, async ({ route, request, path }) => {
    if (path === "/api/auth/get-session" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(null),
      });
      return;
    }

    if (path === "/api/templates/slug/sample-technical-seo-audit-checklist") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(seededSampleTemplateResponse),
      });
      return;
    }

    if (path === "/api/templates") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([seededSampleTemplateResponse]),
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

test("@smoke removed docs prototype renders the public not-found page", async ({ page }) => {
  await page.goto("/docs/");

  await expect(
    page.getByRole("heading", { level: 1, name: "That page does not exist" }),
  ).toBeVisible();
  await expect(page.getByText("The route /docs/ could not be found.")).toBeVisible();
  await expect(page.getByText("Checklist & Template Experience")).toHaveCount(0);
});

test("@smoke public document installs the configured Google Tag Manager container", async ({ request }) => {
  const pagesOrigin = new URL(APP_URL).origin;
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
  expect(csp).toContain("https://static.cloudflareinsights.com");
  expect(csp).toContain("https://analytics.ahrefs.com");
  expect(csp).toContain("frame-src");
});

test("@smoke the template API returns the owner's seeded private template, and the public catalog every visitor shares never lists it", async ({ request }) => {
  const apiBaseUrl = API_BASE_URL;
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

  const catalogResponse = await request.get(`${apiBaseUrl}/templates?scope=public`);
  expect(catalogResponse.status()).toBe(200);
  const catalogIds = ((await catalogResponse.json()) as Array<{ id: string }>).map((template) => template.id);
  expect(catalogIds).not.toContain("template-4");
});

test("@smoke API-backed public template single renders", async ({ page }) => {
  await mockApiBackedPublicTemplate(page);

  await page.goto("/profile/admin/sample-technical-seo-audit-checklist/");

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
    `First URL instruction line\nSecond URL instruction line\n${WINDOWS_PATH_WITH_BACKSLASH_N}\nThird URL instruction line`;

  await routeTheApi(page, async ({ route, request, path }) => {
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

  await page.goto("/dashboard/runs/run-line-breaks/");

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
  await expect(renderedDescription).toContainText(WINDOWS_PATH_WITH_BACKSLASH_N);

  const whiteSpace = await renderedDescription.evaluate(
    (node) => getComputedStyle(node).whiteSpace,
  );
  expect(whiteSpace).toBe("pre-line");
  await expect(page.getByRole("button", { name: "More options" })).toHaveCount(0);
});
