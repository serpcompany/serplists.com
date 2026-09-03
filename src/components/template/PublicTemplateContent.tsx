import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Image,
  Link2,
  ListTodo,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Checkbox } from '@/components/ui/checkbox';
import { buildPublicTemplateSectionId } from '@/components/template/publicTemplateSectionId';
import { cn } from '@/lib/utils';
import {
  normalizeDisplayText,
  normalizeMarkdownDisplayText,
} from '@/lib/utils/markdownDisplay';
import { safeUrl } from '@/lib/utils/safeUrl';
import type {
  ChecklistItem,
  ChecklistItemContent,
  ChecklistSection,
} from '@/types/checklist';
import { VideoEmbed } from '@/components/shared/VideoEmbed';

interface PublicTemplateContentProps {
  initialExpandedItems?: Record<string, boolean>;
  sections: ChecklistSection[];
}

export function PublicTemplateContent({
  initialExpandedItems,
  sections,
}: PublicTemplateContentProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    initialExpandedItems ?? {},
  );

  const toggleItem = (itemId: string) => {
    setExpandedItems((previous) => ({
      ...previous,
      [itemId]: !previous[itemId],
    }));
  };

  const renderContent = (content: ChecklistItemContent) => {
    switch (content.type) {
      case 'text':
        return content.value ? (
          <div className="mt-3 border-l-2 border-border/70 pl-4">
            <div className="prose prose-sm max-w-none whitespace-pre-line">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                urlTransform={safeUrl}
              >
                {normalizeMarkdownDisplayText(content.value)}
              </ReactMarkdown>
            </div>
          </div>
        ) : null;

      case 'video':
        return content.value ? (
          <div className="mt-3 overflow-hidden rounded-md border border-border/70">
            <VideoEmbed title="Template video preview" url={content.value} />
          </div>
        ) : null;

      case 'image':
        return content.value ? (
          <div className="mt-3 border-l-2 border-border/70 pl-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Image content attached
            </div>
          </div>
        ) : null;

      case 'embed':
        return content.value ? (
          <div className="mt-3 border-l-2 border-border/70 pl-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              {safeUrl(content.value) ? (
                <a
                  href={safeUrl(content.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {content.value}
                </a>
              ) : (
                <span className="text-muted-foreground">Invalid link</span>
              )}
            </div>
          </div>
        ) : null;

      case 'subItems':
        return content.subItems?.length ? (
          <div className="mt-4 space-y-2 border-l-2 border-border/70 pl-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListTodo className="h-4 w-4" />
              Sub-steps
            </div>
            {content.subItems.map((subItem, index) => (
              <div
                key={subItem.id || index}
                className="flex items-center gap-2 text-sm text-foreground/90"
              >
                <Checkbox disabled className="h-4 w-4" />
                <span>{subItem.title}</span>
              </div>
            ))}
          </div>
        ) : null;

      default:
        return null;
    }
  };

  const renderItem = (
    item: ChecklistItem,
    sectionIndex: number,
    itemIndex: number,
  ) => {
    const itemKey = `${sectionIndex}-${itemIndex}`;
    const isExpanded = expandedItems[itemKey];
    const hasContent = item.contents && item.contents.length > 0;
    const hasDescription = item.description && item.description.trim() !== '';
    const isExpandable = Boolean(hasContent || hasDescription);

    return (
      <div key={item.id || itemIndex} className="py-4 first:pt-0 last:pb-0">
        <div className="flex items-start gap-3">
          <Checkbox disabled className="mt-1 h-4 w-4 rounded-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              {isExpandable ? (
                <button
                  type="button"
                  onClick={() => toggleItem(itemKey)}
                  className="mt-1 rounded-md p-0.5 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span className="mt-1 h-4 w-4" />
              )}

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => isExpandable && toggleItem(itemKey)}
                  className={cn(
                    'text-left text-base font-medium leading-6 text-foreground',
                    isExpandable && 'transition hover:text-foreground/80',
                  )}
                >
                  {item.title}
                </button>

                {isExpanded ? (
                  <div className="mt-3 space-y-3">
                    {hasDescription ? (
                      <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                        {normalizeDisplayText(item.description)}
                      </p>
                    ) : null}

                    {hasContent ? (
                      <div className="space-y-2">
                        {item.contents?.map((content, contentIndex) => (
                          <div key={content.id || contentIndex}>
                            {renderContent(content)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!sections.length) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No sections are available for this template yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/70">
      {sections.map((section, sectionIndex) => (
        <section
          key={section.id || sectionIndex}
          id={buildPublicTemplateSectionId(section, sectionIndex)}
          className="py-6 first:pt-6 last:pb-6 scroll-mt-28"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Section {sectionIndex + 1}
              </div>
              <h3 className="mt-2 text-xl font-semibold text-foreground">
                {section.title}
              </h3>
            </div>
            <div className="text-sm text-muted-foreground">
              {section.items?.length ?? 0} tasks
            </div>
          </div>

          {section.items?.length ? (
            <div className="mt-4 divide-y divide-border/60">
              {section.items.map((item, itemIndex) =>
                renderItem(item, sectionIndex, itemIndex),
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              This section does not have any items yet.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
