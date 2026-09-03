import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';
import { getOutboundLinkProps } from '@/lib/utils/clipyUrl';
import { normalizeMarkdownDisplayText } from '@/lib/utils/markdownDisplay';
import { safeUrl } from '@/lib/utils/safeUrl';

type MarkdownTextProps = {
  children: string;
  className?: string;
};

export function MarkdownText({ children, className }: MarkdownTextProps) {
  return (
    <div className={cn('prose prose-sm max-w-none whitespace-pre-line', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          a: ({ href, children: linkChildren, ...props }) => {
            const safeHref = href ? safeUrl(href) : '';
            if (!safeHref) return <span>{linkChildren}</span>;

            return (
              <a
                {...props}
                {...getOutboundLinkProps(safeHref)}
              >
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {normalizeMarkdownDisplayText(children)}
      </ReactMarkdown>
    </div>
  );
}
