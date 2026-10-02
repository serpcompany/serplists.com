#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";

const REFERENCES = [
  { file: "cloudflare-d1-llms.txt", url: "https://developers.cloudflare.com/d1/llms-full.txt" },
  { file: "cloudflare-pages-llms.txt", url: "https://developers.cloudflare.com/pages/llms-full.txt" },
  { file: "drizzle-llms.txt", url: "https://orm.drizzle.team/llms.txt" },
  { file: "stripe-llms.txt", url: "https://docs.stripe.com/llms.txt" },
  { file: "shadcn-ui-llms.txt", url: "https://ui.shadcn.com/llms.txt" },
  { file: "vitest-llms.txt", url: "https://vitest.dev/llms.txt" },
];

const today = new Date().toISOString().slice(0, 10);
for (const { file, url } of REFERENCES) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const body = (await response.text()).replace(/\r\n/g, "\n");
  await writeFile(path.join("docs/references", file), `Source: ${url} (fetched ${today})\n\n${body.trimEnd()}\n`, "utf8");
  console.log(`${file}: ${Math.round(body.length / 1024)} KB`);
}
