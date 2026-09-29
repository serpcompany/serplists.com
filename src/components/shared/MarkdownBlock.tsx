import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';
import { expandLegacyEscapedNewlines } from '@/lib/utils/markdownDisplay';
import { rehypeTrimBlockNewlines } from '@/lib/utils/markdownWhitespace';
import { safeUrl } from '@/lib/utils/safeUrl';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeTrimBlockNewlines];

interface MarkdownBlockProps {
  value: string;
  className?: string;
}

/**
 * Author-written markdown (task text) with the typography styles configured in
 * src/app/globals.css. `whitespace-pre-line` keeps single newlines as line breaks; raw HTML
 * is skipped and links go through safeUrl. Every markdown surface uses this component.
 */
export function MarkdownBlock({ value, className }: MarkdownBlockProps) {
  return (
    <div className={cn('prose prose-sm max-w-none whitespace-pre-line', className)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        skipHtml
        urlTransform={safeUrl}
      >
        {expandLegacyEscapedNewlines(value)}
      </ReactMarkdown>
    </div>
  );
}
