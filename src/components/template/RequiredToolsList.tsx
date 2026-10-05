import { useId } from 'react';
import { ExternalLink, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { RequiredTool } from '@/lib/schemas/requiredTools';
import { cn } from '@/lib/utils';
import { absoluteHttpUrl } from '@/lib/utils/embedLink';

type RequiredToolsListProps = {
  className?: string;
  compact?: boolean;
  headingLevel?: 'h2' | 'h3';
  tools: readonly RequiredTool[] | undefined;
};

const hostOf = (href: string): string => {
  try {
    return new URL(href).host;
  } catch {
    return '';
  }
};

function ToolRow({ tool }: { tool: RequiredTool }) {
  const href = absoluteHttpUrl(tool.url);
  const host = href ? hostOf(href) : '';
  return (
    <li className="flex min-w-0 items-start justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="flex min-w-0 flex-col gap-0.5">
        {href ? (
          <a
            className="font-medium wrap-break-word underline-offset-4 hover:underline"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {tool.name}
            <ExternalLink aria-hidden="true" className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span className="font-medium wrap-break-word">{tool.name}</span>
        )}
        {host ? <span className="truncate text-xs text-muted-foreground">{host}</span> : null}
      </span>
      <Badge variant={tool.required ? 'secondary' : 'outline'}>{tool.required ? 'Required' : 'Optional'}</Badge>
    </li>
  );
}

export function RequiredToolsList({ className, compact = false, headingLevel: Heading = 'h2', tools }: RequiredToolsListProps) {
  const headingId = useId();
  if (!tools?.length) return null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        compact
          ? 'flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10'
          : 'flex flex-col gap-4',
        className,
      )}
      data-slot="required-tools"
    >
      <Heading
        className={compact ? 'flex items-center gap-2 text-sm font-medium' : 'text-xl font-semibold tracking-tight'}
        id={headingId}
      >
        {compact ? <Wrench aria-hidden="true" className="size-4 text-muted-foreground" /> : null}
        Required tools
      </Heading>
      <ul className="grid gap-2 sm:grid-cols-2">
        {tools.map((tool, index) => (
          <ToolRow key={`${index}:${tool.url}`} tool={tool} />
        ))}
      </ul>
    </section>
  );
}
