import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./support/sign-in";
import {
  createTwoTaskTemplate,
  deleteTemplate,
  findTemplateByTitle,
  getTemplateSections,
  holdUntilReleased,
  ONE_PIXEL_PNG,
  registerAccount,
  saveAndReturnToTemplates,
  saveAndWaitUntilSaved,
} from "./support/template-editor";

async function answerUploadsWithoutStoringThem(
  page: Page,
  uploaded: Record<string, unknown>,
  answerOnceReleased: Promise<void> = Promise.resolve(),
) {
  await page.route("**/api/uploads", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await answerOnceReleased;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(uploaded) });
  });
}

async function captureUploadsWithoutStoringThem(page: Page) {
  const uploads: Array<{ body: Buffer; name: string }> = [];
  await page.route("**/api/uploads", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataBuffer() ?? Buffer.alloc(0);
    const name = /filename="([^"]+)"/.exec(body.toString("latin1"))?.[1] ?? "";
    uploads.push({ body, name });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ url: `/api/uploads/file?key=template-images/e2e/${name}`, fileName: name }),
    });
  });
  return uploads;
}

test.describe("template editor regressions", () => {
  test("keeps an uploaded image URL in the block and saves it", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA Upload ${stamp}`;
    const uploadedUrl = `/api/uploads/file?key=${encodeURIComponent(`template-images/e2e/${stamp}.png`)}`;
    await answerUploadsWithoutStoringThem(page, { url: uploadedUrl, fileName: "photo.png", fileSize: ONE_PIXEL_PNG.length });

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /add task to section 1/i }).click();
    await page.getByLabel("Task Title").fill(`Task with image ${stamp}`);
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Image", exact: true }).click();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });

    await expect(page.getByText("photo.png", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Image URL")).toHaveValue(uploadedUrl);

    await page.getByRole("button", { name: "Remove uploaded image" }).click();
    await expect(page.getByLabel("Image URL")).toHaveValue("");
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });
    await expect(page.getByLabel("Image URL")).toHaveValue(uploadedUrl);

    await saveAndReturnToTemplates(page);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    expect(savedTemplate).toBeTruthy();
    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect(sections[0]?.items[0]?.contents).toEqual([
      expect.objectContaining({ type: "image", value: uploadedUrl }),
    ]);

    if (savedTemplate && typeof savedTemplate.id === "string") {
      await deleteTemplate(page, savedTemplate.id);
    }
  });

  test("waits for a file upload before saving, and asks before leaving a form whose only change is the upload", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA Held upload ${stamp}`;
    const uploadedUrl = `/api/uploads/file?key=${encodeURIComponent(`template-images/e2e/held-${stamp}.png`)}`;
    const upload = holdUntilReleased();
    await answerUploadsWithoutStoringThem(
      page,
      { url: uploadedUrl, fileName: "held.png", fileSize: ONE_PIXEL_PNG.length },
      upload.held,
    );

    await loginAsAdmin(page);
    const templateId = await createTwoTaskTemplate(page, templateTitle);
    await page.goto(`/dashboard/templates/${templateId}/edit/`);
    await page.getByRole("button", { exact: true, name: "First task" }).click();
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Image", exact: true }).click();
    await saveAndWaitUntilSaved(page);

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "held.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });
    await expect(page.locator("header").getByRole("button", { name: "Uploading..." })).toBeDisabled();

    let confirmMessage: string | null = null;
    page.once("dialog", async (dialog) => {
      confirmMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Back to templates" }).click();
    await expect.poll(() => confirmMessage).toContain("still uploading");
    await expect(page).toHaveURL(new RegExp(`/dashboard/templates/${templateId}/edit/$`));

    upload.release();
    await expect(page.getByLabel("Image URL")).toHaveValue(uploadedUrl);
    await page.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(async () => {
        const savedTemplate = await findTemplateByTitle(page, templateTitle);
        const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
        return sections[0]?.items[0]?.contents?.[0]?.value;
      })
      .toBe(uploadedUrl);

    await deleteTemplate(page, templateId);
  });

  test("uploads a transparent PNG and an animated GIF in their own formats", async ({ page }) => {
    const transparentPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
      "base64",
    );
    const animatedGif = Buffer.from(
      "R0lGODlhAQABAPAAAP8AAAAA/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAQABAAACAkQBACH5BAAKAAAALAAAAAABAAEAgAAA/wAAAAICRAEAOw==",
      "base64",
    );
    const uploads = await captureUploadsWithoutStoringThem(page);

    await loginAsAdmin(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByRole("button", { name: /add task to section 1/i }).click();

    for (const upload of [
      { name: "logo.png", mimeType: "image/png", buffer: transparentPng },
      { name: "steps.gif", mimeType: "image/gif", buffer: animatedGif },
    ]) {
      await page.getByRole("button", { name: "Add Block" }).last().click();
      await page.getByRole("menuitem", { name: "Image", exact: true }).click();
      await page.locator('input[type="file"][accept="image/*"]').last().setInputFiles(upload);
      await expect(page.getByText(upload.name, { exact: true })).toBeVisible();
    }

    expect(uploads.map((upload) => upload.name)).toEqual(["logo.png", "steps.gif"]);
    expect(uploads[0]?.body.toString("latin1")).toContain("Content-Type: image/png");
    expect(uploads[1]?.body.toString("latin1")).toContain("Content-Type: image/gif");
    expect(uploads[1]?.body.includes(animatedGif)).toBe(true);
  });

  test("uploads the file types a File block offers, as Windows reports them, and refuses another type before uploading it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByRole("button", { name: /add task to section 1/i }).click();

    for (const upload of [
      { name: "report.zip", mimeType: "application/x-zip-compressed", buffer: Buffer.from([0x50, 0x4b, 0x05, 0x06]) },
      { name: "data.csv", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("a,b\n1,2\n") },
    ]) {
      await page.getByRole("button", { name: "Add Block" }).last().click();
      await page.getByRole("menuitem", { name: "File", exact: true }).click();
      const input = page.locator('input[type="file"]').last();
      await expect(input).not.toHaveAttribute("accept", "*/*");
      await expect(input).toHaveAttribute("accept", /\.zip/);

      await input.setInputFiles(upload);
      await expect(page.getByText(upload.name, { exact: true })).toBeVisible();
    }

    let uploadRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/uploads")) uploadRequests += 1;
    });
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "File", exact: true }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
      name: "page.html",
      mimeType: "text/html",
      buffer: Buffer.from("<p>hi</p>"),
    });
    await expect(page.getByText(/Use PDF, ZIP, CSV/)).toBeVisible();
    expect(uploadRequests).toBe(0);
  });

  test("drops an uploaded file's name when a URL is typed over it", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA File URL ${stamp}`;
    const uploadedUrl = `/api/uploads/file?key=${encodeURIComponent(`template-files/e2e/${stamp}.pdf`)}`;
    const externalUrl = "https://example.com/pricing.pdf";
    await answerUploadsWithoutStoringThem(page, { url: uploadedUrl, fileName: "report.pdf", fileSize: 2048 });

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /add task to section 1/i }).click();
    await page.getByLabel("Task Title").fill(`Task with file ${stamp}`);
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "File", exact: true }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
      name: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
    await expect(page.getByText("report.pdf", { exact: true })).toBeVisible();

    await page.getByLabel("File URL").fill(externalUrl);
    await expect(page.getByRole("button", { name: "Remove uploaded file" })).toHaveCount(0);
    await expect(page.getByText("report.pdf", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("File URL")).toHaveValue(externalUrl);

    await saveAndReturnToTemplates(page);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    expect(savedTemplate).toBeTruthy();
    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    const saved = sections[0]?.items[0]?.contents?.[0] as Record<string, unknown> | undefined;
    expect(saved).toEqual(expect.objectContaining({ type: "file", value: externalUrl, uploadType: "url" }));
    expect(saved).not.toHaveProperty("fileName");
    expect(saved).not.toHaveProperty("fileSize");

    if (savedTemplate && typeof savedTemplate.id === "string") {
      await deleteTemplate(page, savedTemplate.id);
    }
  });
});
