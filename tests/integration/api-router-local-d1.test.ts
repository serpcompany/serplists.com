import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import apiWorker from "../../functions/api/[[route]]";
import { startLocalD1, type LocalD1 } from "./local-d1-handler-env";

const ORIGIN = "http://localhost:8788";
const OWNER_EMAIL = "router-owner@example.test";
const OWNER_PASSWORD = "router-owner-password-1";
const FORGED_SESSION = "better-auth.session_token=forged.session.token";

type Json = Record<string, unknown>;
type SendOptions = { method?: string; body?: unknown; cookie?: string; origin?: boolean };

let d1: LocalD1;
let ownerCookie = "";

function send(path: string, options: SendOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.origin) headers.Origin = ORIGIN;
  const request = new Request(`${ORIGIN}/api/${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return apiWorker.fetch(request, d1.env as never);
}

const asOwner = (path: string, options: SendOptions = {}) => send(path, { ...options, cookie: ownerCookie });

const signUp = (body: Json) => send("auth/sign-up/email", { body, origin: true });

const signIn = (email: string, password: string) =>
  send("auth/sign-in/email", { body: { email, password }, origin: true });

async function json(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

function sessionCookieOf(response: Response): string {
  const cookie = (response.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=[^;]+/)?.[0];
  if (!cookie) throw new Error(`No session cookie in a ${response.status} response`);
  return cookie;
}

const checklistSections = [
  { id: "section-1", title: "Section 1", items: [{ id: "task-1", title: "Task 1", description: "Do something" }] },
];

async function createTemplate(body: Json): Promise<string> {
  const response = await asOwner("templates", { body: { sections: checklistSections, ...body } });
  expect(response.status).toBe(200);
  return (await json(response)).id as string;
}

async function archiveTemplate(id: string): Promise<Response> {
  return asOwner(`templates/${id}`, { method: "DELETE" });
}

describe.sequential("the API router against local D1", () => {
  beforeAll(async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    d1 = await startLocalD1("api-router");
    const response = await signUp({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Router Owner" });
    expect(response.status).toBe(200);
    ownerCookie = sessionCookieOf(response);
  }, 120_000);

  afterAll(async () => {
    await d1?.dispose();
    vi.restoreAllMocks();
  });

  describe("sign-up and sign-in", () => {
    it("signs up a new account and signs it in", async () => {
      const response = await signUp({ email: "New.Person@Example.test", password: "new-person-password-1", name: "New Person" });
      const body = await json(response);

      expect(response.status).toBe(200);
      expect(body.user).toMatchObject({ email: "new.person@example.test", name: "New Person" });
      expect(sessionCookieOf(response)).toMatch(/^better-auth\.session_token=/);
    });

    it("refuses a second account with an email that already has one", async () => {
      const response = await signUp({ email: OWNER_EMAIL, password: "another-password-1", name: "Someone Else" });

      expect(response.status).toBe(422);
      expect((await json(response)).message).toBe("User already exists");
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("refuses a sign-up without a password", async () => {
      const response = await signUp({ email: "no-password@example.test", name: "No Password" });

      expect(response.status).toBe(400);
      expect((await json(response)).message).toBe("Invalid password");
    });

    it("refuses a sign-up with an empty body", async () => {
      const response = await signUp({});

      expect(response.status).toBe(400);
    });

    it("signs in with the right password", async () => {
      const response = await signIn(OWNER_EMAIL, OWNER_PASSWORD);

      expect(response.status).toBe(200);
      expect((await json(response)).user).toMatchObject({ email: OWNER_EMAIL });
      expect(sessionCookieOf(response)).toMatch(/^better-auth\.session_token=/);
    });

    it("refuses a wrong password", async () => {
      const response = await signIn(OWNER_EMAIL, "wrong-password-1");

      expect(response.status).toBe(401);
      expect((await json(response)).message).toBe("Invalid email or password");
    });

    it("refuses an email that has no account", async () => {
      const response = await signIn("nobody@example.test", OWNER_PASSWORD);

      expect(response.status).toBe(401);
      expect((await json(response)).message).toBe("Invalid email or password");
    });

    it("never sends a password or its stored hash back in a sign-in error", async () => {
      const [stored] = (
        await d1.env.DB.prepare(
          "SELECT account.password AS hash FROM account JOIN users ON users.id = account.user_id WHERE users.email = ?",
        ).bind(OWNER_EMAIL).all<{ hash: string }>()
      ).results;
      const response = await signIn(OWNER_EMAIL, "wrong-password-2");
      const text = await response.text();

      expect(stored?.hash).toBeTruthy();
      expect(text).not.toContain(stored.hash);
      expect(text).not.toContain(OWNER_PASSWORD);
      expect(text).not.toContain("wrong-password-2");
    });
  });

  describe("sessions", () => {
    it("reads the signed-in account from its session cookie", async () => {
      const response = await asOwner("auth/get-session");

      expect(response.status).toBe(200);
      expect(((await json(response)).user as Json).email).toBe(OWNER_EMAIL);
    });

    it("has no session without a cookie", async () => {
      const response = await send("auth/get-session");

      expect(response.status).toBe(200);
      expect(await response.json()).toBeNull();
    });

    it("treats a forged session cookie as signed out", async () => {
      const session = await send("auth/get-session", { cookie: FORGED_SESSION });
      const runs = await send("checklists", { cookie: FORGED_SESSION });

      expect(await session.json()).toBeNull();
      expect(runs.status).toBe(401);
    });

    it("updates the account's name and username", async () => {
      const username = `routerowner${Date.now()}`;
      const response = await asOwner("auth/update-user", { body: { name: "Updated Name", username }, origin: true });

      expect(response.status).toBe(200);
      const user = (await json(await asOwner("auth/get-session"))).user as Json;
      expect(user).toMatchObject({ name: "Updated Name", username });
    });
  });

  describe("templates", () => {
    it("lists the public catalog without a session", async () => {
      const response = await send("templates");

      expect(response.status).toBe(200);
      expect(Array.isArray(await response.json())).toBe(true);
    });

    it("lists a private template for its owner only", async () => {
      const id = await createTemplate({ title: "Private Template", is_public: false });

      const own = (await (await asOwner("templates")).json()) as Json[];
      const anonymous = (await (await send("templates")).json()) as Json[];

      expect(own.map((template) => template.id)).toContain(id);
      expect(anonymous.map((template) => template.id)).not.toContain(id);
      expect((await archiveTemplate(id)).status).toBe(200);
    });

    it("creates a template and reads it back", async () => {
      const id = await createTemplate({
        title: "Launch Checklist",
        description: "A test template",
        categories: ["Test", "Demo"],
        tags: ["test", "automated"],
        is_public: true,
      });

      const response = await asOwner(`templates/${id}`);
      const template = await json(response);

      expect(response.status).toBe(200);
      expect(template).toMatchObject({ id, title: "Launch Checklist", categories: ["Test", "Demo"], tags: ["test", "automated"] });
      expect((await archiveTemplate(id)).status).toBe(200);
    });

    it("updates a template", async () => {
      const id = await createTemplate({ title: "Template to Update", is_public: true });

      const response = await asOwner(`templates/${id}`, {
        method: "PUT",
        body: {
          title: "Launch Checklist, Revised",
          description: "Updated description",
          categories: ["Updated"],
          is_public: true,
          expected_version: 1,
        },
      });

      expect(response.status).toBe(200);
      expect(await json(response)).toMatchObject({ success: true, id, version: 2 });
      expect(await json(await asOwner(`templates/${id}`))).toMatchObject({
        title: "Launch Checklist, Revised",
        description: "Updated description",
        categories: ["Updated"],
      });
      expect((await archiveTemplate(id)).status).toBe(200);
    });

    it("archives a template, which then reads as not found", async () => {
      const id = await createTemplate({ title: "Template to Delete" });

      const response = await archiveTemplate(id);

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ success: true });
      expect((await asOwner(`templates/${id}`)).status).toBe(404);
    });

    it("answers 404 when archiving a template that does not exist", async () => {
      const response = await archiveTemplate("non-existent-id");

      expect(response.status).toBe(404);
    });
  });

  describe("runs", () => {
    const startRun = async (title: string) => {
      const response = await asOwner("checklists", {
        body: { title, items: [{ id: "1", title: "Task 1", completed: false }] },
      });
      expect(response.status).toBe(200);
      return (await json(response)).id as string;
    };

    it("starts a run", async () => {
      const id = await startRun("My Checklist Run");

      const response = await asOwner(`checklists/${id}`);

      expect(response.status).toBe(200);
      expect(await json(response)).toMatchObject({ id, title: "My Checklist Run" });
    });

    it("lists the account's runs", async () => {
      const id = await startRun("Listed Run");

      const response = await asOwner("checklists");
      const runs = (await response.json()) as Json[];

      expect(response.status).toBe(200);
      expect(runs.map((run) => run.id)).toContain(id);
    });
  });

  describe("responses", () => {
    it("carries CORS headers", async () => {
      const response = await send("templates");

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    });

    it("answers the template catalog within a second", async () => {
      await send("templates");
      const start = Date.now();

      const response = await send("templates");

      expect(response.status).toBe(200);
      expect(Date.now() - start).toBeLessThan(1000);
    });

    it("answers ten concurrent catalog requests", async () => {
      const responses = await Promise.all(Array.from({ length: 10 }, () => send("templates")));

      expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
    });
  });
});
