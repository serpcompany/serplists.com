import { describe, expect, it } from 'vitest';

import type { PortableChecklistTemplate } from '@/lib/schemas/checklistSchema';
import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';
import { parseTemplateMarkdown, renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';

import { seededRandom } from '../../../support/reproducibleRandom';

const FENCE = '```';

const withTask = (
  task: PortableChecklistTemplate['sections'][number]['items'][number],
  description?: string,
): PortableChecklistTemplate =>
  normalizePortableTemplate({
    title: 'Release checklist',
    ...(description ? { description } : {}),
    sections: [
      {
        title: 'Ship',
        items: [task, { title: 'Announce', description: 'Post the notes.' }],
      },
    ],
  });

const textTask = (value: string, description = 'Do X') =>
  withTask({ title: 'Install', description, contents: [{ type: 'text', value }] });

describe('templateMarkdown round-trip with Markdown inside blocks, where headings and code fences are ordinary text', () => {
  it.each([
    ['a fenced bash block and trailing prose', `Run:\n${FENCE}bash\nnpm i\n${FENCE}\nDone`],
    ['a line that is only a fence', `Before\n${FENCE}\nAfter`],
    ['a 4-backtick fence around a 3-backtick fence', `${FENCE}\`md\n${FENCE}js\nx()\n${FENCE}\n${FENCE}\``],
    ['a first line that is an item heading', '### Tips\nUse X'],
    ['a section heading line', 'Intro\n## Tips\nUse Y'],
    ['a literal serplists fence line', `${FENCE}serplists:text\nnested\n${FENCE}`],
    ['a fence that opens the value', `${FENCE}sh\nls\n${FENCE}`],
    ['a closing fence with trailing spaces', `${FENCE}sh\nls\n${FENCE}   \nafter`],
    ['a deeper heading and a tilde fence', '#### Deep\n~~~\n## not a section\n~~~'],
  ])('keeps a text block with %s', (_label, value) => {
    const template = textTask(value);

    expect(parseTemplateMarkdown(renderTemplateMarkdown(template))).toEqual(template);
  });

  it('keeps an embed block that contains a fence', () => {
    const template = withTask({
      title: 'Embed',
      contents: [{ type: 'embed', value: `<pre>\n${FENCE}\n</pre>` }],
    });

    expect(parseTemplateMarkdown(renderTemplateMarkdown(template))).toEqual(template);
  });

  it('keeps several blocks in order when an earlier one holds a fence', () => {
    const template = withTask({
      title: 'Several',
      contents: [
        { type: 'text', value: `${FENCE}\ninside\n${FENCE}` },
        { type: 'text', value: '## Second block' },
        { type: 'subItems', value: '', subItems: [{ title: 'One' }, { title: 'Two' }] },
      ],
    });

    expect(parseTemplateMarkdown(renderTemplateMarkdown(template))).toEqual(template);
  });

  it('keeps an item description with heading-like and fence-like lines', () => {
    const template = textTask('Body', `First\n## Not a section\n### Not an item\n${FENCE}serplists:text\n\\## already escaped\n\\plain backslash`);

    expect(parseTemplateMarkdown(renderTemplateMarkdown(template))).toEqual(template);
  });

  it('keeps a template description with an item heading line', () => {
    const template = withTask({ title: 'Task' }, 'Overview\n### Not an item\n## Not a section');

    expect(parseTemplateMarkdown(renderTemplateMarkdown(template))).toEqual(template);
  });

  it('renders plain content with the same 3-backtick fences as before', () => {
    const markdown = renderTemplateMarkdown(textTask('Publish the **notes**.'));

    expect(markdown).toContain(`${FENCE}serplists:text\nPublish the **notes**.\n${FENCE}\n`);
  });

  it('still parses a hand-written file with plain 3-backtick fences', () => {
    const markdown = [
      '---',
      'title: Legacy',
      '---',
      '# Legacy',
      '',
      '## Prep',
      '',
      '### Pack',
      '',
      'Bring the tent.',
      '',
      `${FENCE}serplists:text`,
      'Check the poles.',
      FENCE,
      '',
      `${FENCE}serplists:subItems`,
      '- Poles',
      '- Stakes',
      FENCE,
    ].join('\n');

    expect(parseTemplateMarkdown(markdown).sections[0]?.items[0]).toEqual({
      title: 'Pack',
      description: 'Bring the tent.',
      contents: [
        { type: 'text', value: 'Check the poles.' },
        { type: 'subItems', value: '', subItems: [{ title: 'Poles' }, { title: 'Stakes' }] },
      ],
    });
  });

  it('still reports a block with no closing fence', () => {
    const markdown = ['---', 'title: T', '---', '# T', '', '## S', '', '### I', '', `${FENCE}serplists:text`, 'open'].join('\n');

    expect(() => parseTemplateMarkdown(markdown)).toThrow('Content block "text" is missing a closing fence');
  });

  it('round-trips generated Markdown-like text blocks and descriptions', () => {
    const pieces = ['#', '##', '## x', '### y', '#### z', FENCE, `${FENCE}js`, `${FENCE}\``, `${FENCE}serplists:text`, '~~~', 'plain', '\\## e', '\\\\### f', '`x`', ''];
    const random = seededRandom(7);
    const pick = (max: number) => Math.floor(random() * max);
    const randomText = () =>
      Array.from({ length: 1 + pick(6) }, () => pieces[pick(pieces.length)]).join('\n');

    for (let run = 0; run < 200; run += 1) {
      const template = withTask({
        title: 'Generated',
        description: `Lead ${run}\n${randomText()}`,
        contents: [
          { type: 'text', value: `Start ${run}\n${randomText()}\nEnd` },
          { type: 'embed', value: `<x>\n${randomText()}\n</x>` },
        ],
      });

      expect(parseTemplateMarkdown(renderTemplateMarkdown(template))).toEqual(template);
    }
  });
});
