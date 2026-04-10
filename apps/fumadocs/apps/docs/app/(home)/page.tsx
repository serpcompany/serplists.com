import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, BookOpen, ClipboardList, Sparkles } from 'lucide-react';

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-6 py-10 md:px-10 md:py-14">
      <section className="rounded-3xl border bg-gradient-to-br from-fd-card via-fd-card to-fd-secondary/70 p-8 shadow-sm md:p-12">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-fd-muted-foreground">
          <ClipboardList className="size-3.5" />
          Internal documentation shell
        </div>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-5xl">
          Serplists UI integration inventory
        </h1>
        <p className="mt-4 max-w-3xl text-base text-fd-muted-foreground md:text-lg">
          This docs app is the working checklist for documenting the current product surface before
          the redesigned UI is integrated. The goal is to define routes, content, structure,
          behavior, and reusable UI expectations without tying the inventory to the current frontend
          implementation.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/docs/overview"
            className="inline-flex items-center gap-2 rounded-full bg-fd-primary px-5 py-3 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Open docs
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/docs/inventory/page-template"
            className="inline-flex items-center gap-2 rounded-full border bg-fd-card px-5 py-3 font-medium transition-colors hover:bg-fd-accent"
          >
            Start with page template
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HomeCard
          href="/docs/overview"
          icon={<BookOpen className="size-5" />}
          title="Overview"
          description="Purpose, workflow, and operating model for using the docs as an integration checklist."
        />
        <HomeCard
          href="/docs/inventory"
          icon={<ClipboardList className="size-5" />}
          title="Inventory"
          description="Page-level records covering route shape, content, metadata, states, features, and dependencies."
        />
        <HomeCard
          href="/docs/features"
          icon={<Sparkles className="size-5" />}
          title="Features"
          description="Cross-page behavior records for flows like copy/save, start run, sharing, and upgrade gating."
        />
        <HomeCard
          href="/docs/ui-blocks"
          icon={<Boxes className="size-5" />}
          title="UI Blocks"
          description="Placeholder area for reusable blocks and component expectations once the UI documentation exists."
        />
      </section>
    </main>
  );
}

function HomeCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border bg-fd-card p-5 transition-colors hover:bg-fd-accent"
    >
      <div className="mb-4 inline-flex items-center justify-center rounded-xl border bg-fd-secondary p-2 text-fd-primary">
        {icon}
      </div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">{description}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-fd-primary">
        Open
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
