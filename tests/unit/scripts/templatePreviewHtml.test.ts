import { describe, expect, it } from 'vitest';
import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';
import { renderTemplatePreviewHtml } from '@/../scripts/lib/templatePreviewHtml';
import { launchChecklistTemplate as template } from '../../fixtures/launchChecklistTemplate';

describe('templatePreviewHtml', () => {
  it('renders an html preview with card-like media blocks', () => {
    const html = renderTemplatePreviewHtml(template);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('class="content-block card media-card"');
    expect(html).toContain('class="content-block card"');
    expect(html).toContain('Launch Checklist');
  });

  it('links an embed to its URL or iframe src in the html preview, as the app does, and shows other code as text', () => {
    const embedTemplate = normalizePortableTemplate({
      title: 'Embeds',
      sections: [{
        title: 'Watch',
        items: [{
          title: 'Walkthrough',
          contents: [
            { type: 'embed', value: 'https://status.example.com' },
            { type: 'embed', value: `<iframe src='https://www.youtube.com/embed/abc'></iframe>` },
            { type: 'embed', value: '<script src="https://example.com/widget.js"></script>' },
          ],
        }],
      }],
    });

    const html = renderTemplatePreviewHtml(embedTemplate);
    const hrefs = Array.from(html.matchAll(/href="([^"]*)"/g), (match) => match[1]);

    expect(hrefs).toEqual(['https://status.example.com', 'https://www.youtube.com/embed/abc']);
    expect(html).toContain('&lt;script src=&quot;https://example.com/widget.js&quot;&gt;&lt;/script&gt;</pre>');
    expect(html).not.toContain('<script src');
    expect(html).not.toContain('<iframe');
  });
});
