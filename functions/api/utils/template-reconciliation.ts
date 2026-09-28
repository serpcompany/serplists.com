type JsonRecord = Record<string, unknown>;

export type RetiredRunEntry =
  | { kind: 'section'; section: JsonRecord }
  | { kind: 'item'; sectionId: string; sectionTitle?: string; item: JsonRecord }
  | {
      kind: 'subItem';
      sectionId: string;
      itemId: string;
      itemTitle?: string;
      subItem: JsonRecord;
    };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getId = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') {
    return null;
  }
  return value.id;
};

const getArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function normalizeLegacySectionShape(values: unknown[]): JsonRecord[] {
  const records = values.filter(isRecord);
  if (records.length === 0) return [];
  if (Array.isArray(records[0].items)) return records;

  return [{
    id: '1',
    title: 'Checklist',
    items: records,
  }];
}

function getSubItems(item: JsonRecord): JsonRecord[] {
  const direct = getArray(item.subItems).filter(isRecord);
  const nested = getArray(item.contents)
    .filter(isRecord)
    .flatMap((content) => getArray(content.subItems).filter(isRecord));
  return [...direct, ...nested];
}

function preserveRunState(templateValue: JsonRecord, runValue: JsonRecord | undefined): JsonRecord {
  const next = { ...templateValue };
  next.isCompleted = runValue?.isCompleted === true;

  if (typeof runValue?.notes === 'string') {
    next.notes = runValue.notes;
  } else {
    delete next.notes;
  }

  return next;
}

function freshRunState(value: JsonRecord): JsonRecord {
  // Clients still read the legacy `completed` key when `isCompleted` is missing.
  const { completed: _completed, ...next } = preserveRunState(value, undefined);
  return next;
}

const resetSubItems = (subItems: unknown[]): unknown[] =>
  subItems.map((subItem) => (isRecord(subItem) ? freshRunState(subItem) : subItem));

function resetTaskState(item: unknown): unknown {
  if (!isRecord(item)) return item;

  const next = freshRunState(item);
  if (Array.isArray(item.subItems)) next.subItems = resetSubItems(item.subItems);
  if (Array.isArray(item.contents)) {
    next.contents = item.contents.map((content) => (
      isRecord(content) && Array.isArray(content.subItems)
        ? { ...content, subItems: resetSubItems(content.subItems) }
        : content
    ));
  }
  return next;
}

/**
 * Sections for a new run started from a template. Every task and Sub-task (direct
 * `subItems` and Sub-tasks blocks in `contents`) starts unticked, and run-only state a stored
 * template may carry (`notes`, the legacy `completed` key) is dropped, as reconciliation
 * treats it. Sections, other content blocks, and non-record entries are left as they are.
 * Every path that starts a run from a template (web create, MCP start_run) uses this one
 * reset, so the same template always starts the same way.
 */
export function resetRunCompletionState(sections: unknown[]): unknown[] {
  return sections.map((section) => (
    isRecord(section) && Array.isArray(section.items)
      ? { ...section, items: section.items.map(resetTaskState) }
      : section
  ));
}

function reconcileSubItems(
  templateSubItems: unknown[],
  previousById: Map<string, JsonRecord>,
  retainedIds: Set<string>,
): JsonRecord[] {
  return templateSubItems.filter(isRecord).map((templateSubItem) => {
    const id = getId(templateSubItem);
    if (id) retainedIds.add(id);
    return preserveRunState(templateSubItem, id ? previousById.get(id) : undefined);
  });
}

function reconcileItem(
  templateItem: JsonRecord,
  previousItem: JsonRecord | undefined,
  retired: RetiredRunEntry[],
  sectionId: string,
): JsonRecord {
  const next = preserveRunState(templateItem, previousItem);
  const previousSubItems = previousItem ? getSubItems(previousItem) : [];
  const previousSubItemsById = new Map(
    previousSubItems.flatMap((subItem) => {
      const id = getId(subItem);
      return id ? [[id, subItem] as const] : [];
    }),
  );
  const retainedSubItemIds = new Set<string>();
  const context = {
    sectionId,
    itemId: getId(templateItem) ?? '',
    itemTitle: typeof templateItem.title === 'string' ? templateItem.title : undefined,
  };

  if (Array.isArray(templateItem.subItems)) {
    next.subItems = reconcileSubItems(templateItem.subItems, previousSubItemsById, retainedSubItemIds);
  }

  if (Array.isArray(templateItem.contents)) {
    next.contents = templateItem.contents.map((content) => {
      if (!isRecord(content) || !Array.isArray(content.subItems)) return content;
      return {
        ...content,
        subItems: reconcileSubItems(content.subItems, previousSubItemsById, retainedSubItemIds),
      };
    });
  }

  for (const previousSubItem of previousSubItems) {
    const id = getId(previousSubItem);
    if (id && !retainedSubItemIds.has(id)) {
      retired.push({ kind: 'subItem', ...context, subItem: previousSubItem });
    }
  }

  return next;
}

export function reconcileRunSections(
  previousSections: unknown[],
  templateSections: unknown[],
  previousRetired: unknown[],
): { sections: JsonRecord[]; retired: RetiredRunEntry[] } {
  const previousSectionShape = normalizeLegacySectionShape(previousSections);
  const templateSectionShape = normalizeLegacySectionShape(templateSections);
  const normalizedPreviousSections = assignMissingStableTemplateIdentities(previousSectionShape);
  const normalizedTemplateSections = assignMissingStableTemplateIdentities(
    templateSectionShape,
    previousSectionShape,
  );
  const retired = previousRetired.filter(isRecord) as RetiredRunEntry[];
  const previousById = new Map(
    normalizedPreviousSections.flatMap((section) => {
      const id = getId(section);
      return id ? [[id, section] as const] : [];
    }),
  );
  const retainedSectionIds = new Set<string>();

  const sections = normalizedTemplateSections.map((templateSection) => {
    const sectionId = getId(templateSection) ?? '';
    retainedSectionIds.add(sectionId);
    const previousSection = previousById.get(sectionId);
    const previousItems = getArray(previousSection?.items).filter(isRecord);
    const previousItemsById = new Map(
      previousItems.flatMap((item) => {
        const id = getId(item);
        return id ? [[id, item] as const] : [];
      }),
    );
    const retainedItemIds = new Set<string>();
    const items = getArray(templateSection.items).filter(isRecord).map((templateItem) => {
      const itemId = getId(templateItem) ?? '';
      retainedItemIds.add(itemId);
      return reconcileItem(templateItem, previousItemsById.get(itemId), retired, sectionId);
    });

    for (const previousItem of previousItems) {
      const itemId = getId(previousItem);
      if (itemId && !retainedItemIds.has(itemId)) {
        retired.push({
          kind: 'item',
          sectionId,
          sectionTitle: typeof templateSection.title === 'string' ? templateSection.title : undefined,
          item: previousItem,
        });
      }
    }

    return { ...templateSection, items };
  });

  for (const previousSection of normalizedPreviousSections) {
    const sectionId = getId(previousSection);
    if (sectionId && !retainedSectionIds.has(sectionId)) {
      retired.push({ kind: 'section', section: previousSection });
    }
  }

  return { sections, retired };
}

export function calculateRunProgress(sections: unknown[]): number {
  let completed = 0;
  let total = 0;

  for (const section of sections.filter(isRecord)) {
    for (const item of getArray(section.items).filter(isRecord)) {
      total += 1;
      if (item.isCompleted === true) completed += 1;

      for (const subItem of getSubItems(item)) {
        total += 1;
        if (subItem.isCompleted === true) completed += 1;
      }
    }
  }

  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function validateStableTemplateIdentities(sections: unknown[]): string | null {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const subItemIds = new Set<string>();

  for (const section of sections) {
    const sectionId = getId(section);
    if (!sectionId) return 'Every template section requires a stable id';
    if (sectionIds.has(sectionId)) return `Duplicate section id: ${sectionId}`;
    sectionIds.add(sectionId);

    for (const item of getArray((section as JsonRecord).items)) {
      const itemId = getId(item);
      if (!itemId) return `Every item in section ${sectionId} requires a stable id`;
      if (itemIds.has(itemId)) return `Duplicate item id: ${itemId}`;
      itemIds.add(itemId);

      for (const subItem of getSubItems(item as JsonRecord)) {
        const subItemId = getId(subItem);
        if (!subItemId) return `Every sub-item in item ${itemId} requires a stable id`;
        if (subItemIds.has(subItemId)) return `Duplicate sub-item id: ${subItemId}`;
        subItemIds.add(subItemId);
      }
    }
  }

  return null;
}

function matchSiblingIdentities(
  currentRecords: JsonRecord[],
  previousRaw: JsonRecord[],
  previousNormalized: JsonRecord[],
  fallbackId: (index: number) => string,
): Array<{ id: string; previousIndex: number | null }> {
  const matches: Array<{ id?: string; previousIndex: number | null }> = currentRecords.map(() => ({ previousIndex: null }));
  const usedPrevious = new Set<number>();

  currentRecords.forEach((current, currentIndex) => {
    const currentId = getId(current);
    if (!currentId) return;
    const previousIndex = previousNormalized.findIndex(
      (candidate, candidateIndex) => !usedPrevious.has(candidateIndex) && getId(candidate) === currentId,
    );
    if (previousIndex < 0) return;
    matches[currentIndex] = { id: currentId, previousIndex };
    usedPrevious.add(previousIndex);
  });

  currentRecords.forEach((current, currentIndex) => {
    if (matches[currentIndex].id) return;
    const title = typeof current.title === 'string' ? current.title : null;
    if (!title || currentRecords.filter((candidate) => candidate.title === title).length !== 1) return;
    const candidates = previousRaw.flatMap((candidate, candidateIndex) =>
      !usedPrevious.has(candidateIndex) && candidate.title === title ? [candidateIndex] : []
    );
    if (candidates.length !== 1 || getId(previousRaw[candidates[0]])) return;
    const previousIndex = candidates[0];
    matches[currentIndex] = {
      id: getId(previousNormalized[previousIndex]) ?? fallbackId(currentIndex),
      previousIndex,
    };
    usedPrevious.add(previousIndex);
  });

  currentRecords.forEach((current, currentIndex) => {
    if (matches[currentIndex].id) return;
    if (
      previousRaw[currentIndex]
      && !usedPrevious.has(currentIndex)
      && !getId(previousRaw[currentIndex])
    ) {
      matches[currentIndex] = {
        id: getId(previousNormalized[currentIndex]) ?? fallbackId(currentIndex),
        previousIndex: currentIndex,
      };
      usedPrevious.add(currentIndex);
      return;
    }
    matches[currentIndex] = {
      id: getId(current) ?? fallbackId(currentIndex),
      previousIndex: null,
    };
  });

  return matches.map((match, index) => ({
    id: match.id ?? fallbackId(index),
    previousIndex: match.previousIndex,
  }));
}

function assignIdentities(sections: JsonRecord[], previousSections: JsonRecord[]): JsonRecord[] {
  const previousNormalized = previousSections.length > 0
    ? assignIdentities(previousSections, [])
    : [];
  const sectionMatches = matchSiblingIdentities(
    sections,
    previousSections,
    previousNormalized,
    (index) => `legacy-section-${index + 1}`,
  );

  return sections.map((section, sectionIndex) => {
    const sectionMatch = sectionMatches[sectionIndex];
    const sectionId = sectionMatch.id;
    const previousSectionRaw = sectionMatch.previousIndex === null
      ? undefined
      : previousSections[sectionMatch.previousIndex];
    const previousSectionNormalized = sectionMatch.previousIndex === null
      ? undefined
      : previousNormalized[sectionMatch.previousIndex];
    const previousItemsRaw = getArray(previousSectionRaw?.items).filter(isRecord);
    const previousItemsNormalized = getArray(previousSectionNormalized?.items).filter(isRecord);
    const currentItems = getArray(section.items).filter(isRecord);
    const itemMatches = matchSiblingIdentities(
      currentItems,
      previousItemsRaw,
      previousItemsNormalized,
      (index) => `legacy-item-${sectionIndex + 1}-${index + 1}`,
    );

    return {
      ...section,
      id: sectionId,
      items: currentItems.map((item, itemIndex) => {
        const itemMatch = itemMatches[itemIndex];
        const itemId = itemMatch.id;
        const previousItemRaw = itemMatch.previousIndex === null
          ? undefined
          : previousItemsRaw[itemMatch.previousIndex];
        const previousItemNormalized = itemMatch.previousIndex === null
          ? undefined
          : previousItemsNormalized[itemMatch.previousIndex];
        const previousSubItemsRaw = previousItemRaw ? getSubItems(previousItemRaw) : [];
        const previousSubItemsNormalized = previousItemNormalized ? getSubItems(previousItemNormalized) : [];
        const currentSubItems = getSubItems(item);
        const subItemMatches = matchSiblingIdentities(
          currentSubItems,
          previousSubItemsRaw,
          previousSubItemsNormalized,
          (index) => `legacy-subitem-${sectionIndex + 1}-${itemIndex + 1}-${index + 1}`,
        );
        let subItemSequence = 0;
        const assignSubItems = (subItems: unknown[]) => subItems.filter(isRecord).map((subItem) => ({
          ...subItem,
          id: subItemMatches[subItemSequence++].id,
        }));

        return {
          ...item,
          id: itemId,
          ...(Array.isArray(item.subItems) ? { subItems: assignSubItems(item.subItems) } : {}),
          ...(Array.isArray(item.contents)
            ? {
                contents: item.contents.map((content) => {
                  if (!isRecord(content) || !Array.isArray(content.subItems)) return content;
                  return { ...content, subItems: assignSubItems(content.subItems) };
                }),
              }
            : {}),
        };
      }),
    };
  });
}

export function assignMissingStableTemplateIdentities(
  sections: unknown[],
  previousSections: unknown[] = [],
): JsonRecord[] {
  return assignIdentities(
    normalizeLegacySectionShape(sections),
    normalizeLegacySectionShape(previousSections),
  );
}
