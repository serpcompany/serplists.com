import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  assertApprovalMatchesRequest,
  assertMigrationClassification,
  validateApprovalEvidence,
} from "./production-executor-lib.mjs";

const targets = [
  "parents",
  'main."parents"',
  '`main`.`parents`',
  "[main].[parents]",
  '"semi;--/*parents"',
  '`semi;--/*parents`',
  '[quote\'"`;--/*parents]',
];
const replacements = targets.flatMap((target) => [
  `REPLACE INTO ${target} (id, name) VALUES (3, 'taken');`,
  `/* leading */ InSeRt/* between */OR-- between\nREPLACE INTO ${target} (id, name) VALUES (3, 'taken');`,
  `/* leading */ UpDaTe-- between\nOR/* between */REPLACE ${target} SET name = 'taken' WHERE id = 2;`,
]);
const classify = (sqlTexts, requested = "destructive") => assertMigrationClassification({ requested, sqlTexts });

describe("SQLite conflict replacement risk (#106)", () => {
  it.each(replacements)("requires destructive classification for %s", (sql) => {
    expect(classify([sql])).toBe("destructive");
    for (const requested of ["additive", "backfill"]) {
      expect(() => classify([sql], requested)).toThrow(/at least destructive/);
    }
    expect(classify([sql], "irreversible")).toBe("destructive");
  });

  it.each(replacements)("inherits the strictest risk in mixed SQL: %s", (sql) => {
    const additive = "CREATE TABLE extra (id INTEGER PRIMARY KEY);";
    const backfill = "UPDATE parents SET name = 'ordinary' WHERE id = 2;";
    expect(classify([additive, backfill, sql])).toBe("destructive");
    expect(classify([sql, backfill, additive])).toBe("destructive");
    expect(classify([sql, "VACUUM;"], "irreversible")).toBe("irreversible");
  });

  it.each(targets)("keeps ordinary UPDATE and INSERT OR IGNORE as backfills for %s", (target) => {
    expect(classify([
      `UPDATE ${target} SET name = 'UPDATE OR REPLACE; -- literal' WHERE id = 2;`,
      `INSERT/* comment */OR-- comment\nIGNORE INTO ${target} (id, name) VALUES (3, 'taken');`,
    ], "backfill")).toBe("backfill");
  });

  it.each(replacements)("cannot reuse weaker approval or omit the recovery decision: %s", (sql) => {
    const classification = classify([sql]);
    const request = { classification, changeProvenance: { changeAuthors: ["author"] } };
    const review = { state: "approved", user: { type: "User", login: "reviewer" }, environments: [{ name: "production" }], comment: "Reviewed replacement cascades and exact recovery evidence." };
    const input = { classification, reviews: [review], actor: "operator", changeAuthors: ["author"] };
    const approval = validateApprovalEvidence(input);
    expect(assertApprovalMatchesRequest({ request, approval })).toEqual(approval);
    expect(() => assertApprovalMatchesRequest({ request, approval: { ...approval, classification: "backfill" } })).toThrow(/classification/);
    expect(() => validateApprovalEvidence({ ...input, reviews: [] })).toThrow(/approval is missing/);
    expect(() => validateApprovalEvidence({ ...input, reviews: [{ ...review, comment: "" }] })).toThrow(/recovery evidence/);
  });

  it.each([
    ["UPDATE OR REPLACE main.parents SET name = 'taken' WHERE id = 2;", 1, 0],
    ["INSERT OR REPLACE INTO main.parents VALUES (3, 'taken');", 2, 0],
    ["REPLACE INTO main.parents VALUES (3, 'taken');", 2, 0],
    ["UPDATE main.parents SET name = 'changed' WHERE id = 2;", 2, 1],
    ["INSERT OR IGNORE INTO main.parents VALUES (3, 'taken');", 2, 1],
  ])("reproduces actual parent and cascading child effects for %s", (sql, parentCount, childCount) => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE parents (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
        CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE);
        INSERT INTO parents VALUES (1, 'taken'), (2, 'other');
        INSERT INTO children VALUES (10, 1);
      `);
      db.exec(sql);
      expect(db.prepare("SELECT count(*) AS n FROM parents").get().n).toBe(parentCount);
      expect(db.prepare("SELECT count(*) AS n FROM children").get().n).toBe(childCount);
      expect(classify([sql])).toBe(childCount === 0 ? "destructive" : "backfill");
    } finally {
      db.close();
    }
  });
});
