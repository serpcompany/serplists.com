import type { Line } from "./markdown";

const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/;
const HTML_ANCHOR = /<a\s+(?:id|name)="([^"]+)"/g;

function withoutTags(text: string): string {
  let kept = "";
  let insideTag: string | null = null;
  for (const character of text) {
    if (character === "<") {
      kept += insideTag ?? "";
      insideTag = "";
    } else if (character === ">") {
      insideTag = null;
    } else if (insideTag === null) {
      kept += character;
    } else {
      insideTag += character;
    }
  }
  return kept + (insideTag ?? "");
}

export function headingSlug(text: string): string {
  return withoutTags(text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "")
    .replace(/ /g, "-");
}

export function headingAnchors(prose: readonly Line[]): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const { text } of prose) {
    for (const match of text.matchAll(HTML_ANCHOR)) if (match[1]) anchors.add(match[1].toLowerCase());
    const heading = HEADING.exec(text)?.[1];
    if (heading === undefined) continue;
    const slug = headingSlug(heading);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}

export function anchorOf(target: string): string | null {
  const hash = target.indexOf("#");
  if (hash === -1) return null;
  try {
    return decodeURIComponent(target.slice(hash + 1)).toLowerCase();
  } catch {
    return target.slice(hash + 1).toLowerCase();
  }
}
