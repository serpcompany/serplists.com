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

  it('renders a form as its fields, with each kind, required mark, help text and options, never as an embed', () => {
    const html = renderTemplatePreviewHtml(normalizePortableTemplate({
      title: 'Intake',
      sections: [{ title: 'Kickoff', items: [{ title: 'Brief', contents: [{ type: 'form', value: '', fields: [
        { label: 'Client <name>', kind: 'text', required: true, description: 'As on the contract' },
        { label: 'Plan', kind: 'select', options: [{ label: 'Basic' }, { label: 'Pro' }] },
        { label: 'Seats', kind: 'number', min: 1, max: 9 },
      ] }] }] }],
    }));

    expect(html).toContain('<div class="card-label">Form</div>');
    expect(html).toContain('Client &lt;name&gt; <span class="card-meta">Short text, required</span>');
    expect(html).toContain('<p>As on the contract</p>');
    expect(html).toContain('<ul class="form-options"><li>Basic</li><li>Pro</li></ul>');
    expect(html).toContain('Number, optional, 1 to 9');
    expect(html).not.toContain('embed-card');
  });
});
