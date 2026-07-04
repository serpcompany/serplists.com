import { expect, test, type Page } from "@playwright/test";

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
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
  await expect(page.getByText("Sign in to your account to continue")).toBeVisible();
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
