import { afterEach, describe, expect, it, vi } from "vitest";

import { validateStableTemplateIdentities } from "@functions/api/utils/template-reconciliation";
import { applyTemplateSaveDefaults as applyDefaults } from "@/hooks/useTemplateValidation";
import type { ChecklistSection } from "@/types/checklist";

const emptySection = (id: string, title = "Phase 2"): ChecklistSection => ({
  id,
  title,
  items: [],
});

describe("applyTemplateSaveDefaults", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Runs match tasks by id: a new placeholder id on every save would retire the
  // runner's placeholder (with its completion) and add a fresh one each time.
  it("gives an empty section the same placeholder task id on every save", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"));
    const first = applyDefaults("Moving", [emptySection("section-2")]);
    vi.setSystemTime(new Date("2026-09-28T10:05:00.000Z"));
    const second = applyDefaults("Moving", [emptySection("section-2")]);

    expect(first.sections[0].items).toHaveLength(1);
    expect(first.sections[0].items[0].title).toBe("New task");
    expect(second.sections[0].items[0].id).toBe(first.sections[0].items[0].id);
  });

  it("gives each empty section its own placeholder id, unused by any other task", () => {
    const sections: ChecklistSection[] = [
      emptySection("section-a"),
      emptySection("section-b"),
      {
        id: "section-c",
        title: "Taken",
        // A real task that already has the id a placeholder would get.
        items: [{ id: "section-a-first-task", title: "Real task" }],
      },
    ];

    const result = applyDefaults("Moving", sections);
    const ids = result.sections.flatMap((section) => section.items.map((item) => item.id));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("section-a-first-task");
    expect(result.sections[2].items[0].title).toBe("Real task");
    expect(validateStableTemplateIdentities(result.sections)).toBeNull();
  });

  it("changes nothing when applied to its own result", () => {
    const once = applyDefaults("", [
      emptySection("section-1"),
      { id: "section-2", title: "Prep", items: [{ id: "item-1", title: "  " }] },
    ]);

    expect(applyDefaults(once.title, once.sections)).toEqual(once);
    expect(once.title).toBe("Untitled Template");
    expect(once.sections[1].items[0].title).toBe("Task 1");
  });

  it("uses fixed ids for the starter section of a template with none", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"));
    const first = applyDefaults("Moving", []);
    vi.setSystemTime(new Date("2026-09-28T11:00:00.000Z"));
    const second = applyDefaults("Moving", []);

    expect(second).toEqual(first);
    expect(first.sections[0].items).toHaveLength(1);
  });
});
