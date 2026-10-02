import {
  CheckCircle,
  ListChecks,
  Share2,
  UploadCloud,
} from 'lucide-react';

export const FEATURES = [
  {
    slug: "template-builder",
    title: "Template Builder",
    description: "Create reusable checklists with sections, instructions, and structured steps.",
    icon: ListChecks,
    bullets: [
      "Build reusable SOPs with sections and tasks.",
      "Add instructions, media, and structured sub-items.",
      "Keep one source template for repeated execution.",
    ],
  },
  {
    slug: "checklist-runs",
    title: "Checklist Runs",
    description: "Run checklists, track progress, and keep work moving across items.",
    icon: CheckCircle,
    bullets: [
      "Launch a new run from any saved template.",
      "Track progress at the run level.",
      "Keep execution separate from the reusable template.",
    ],
  },
  {
    slug: "public-sharing",
    title: "Public Sharing",
    description: "Publish templates to the Template Library and share links with anyone.",
    icon: Share2,
    bullets: [
      "Publish templates to a public profile.",
      "Share public template URLs with a stable structure.",
      "Keep run-sharing separate from public template publishing.",
    ],
  },
  {
    slug: "import-export",
    title: "Import + Export",
    description: "Backup templates and move them between accounts (Pro).",
    icon: UploadCloud,
    bullets: [
      "Export templates as portable JSON packs.",
      "Import portable packs back into the app.",
      "Keep reusable SOP content versionable in the repo.",
    ],
  },
] as const;

export type PublicFeature = (typeof FEATURES)[number];

export const findFeature = (slug: string | undefined): PublicFeature | null =>
  FEATURES.find((feature) => feature.slug === slug) ?? null;
