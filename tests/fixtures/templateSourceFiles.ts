export const LAUNCH_TEMPLATE = {
  title: 'Launch Checklist',
  sections: [{ title: 'Preparation', items: [{ title: 'Review content', description: 'Read every page once.' }] }],
};

export const LAUNCH_YAML = [
  'title: Launch Checklist',
  'sections:',
  '  - title: Preparation',
  '    items:',
  '      - title: Review content',
  '        description: Read every page once.',
  '',
].join('\n');

export const LAUNCH_JSON = `${JSON.stringify(LAUNCH_TEMPLATE, null, 2)}\n`;

export const LAUNCH_PACK_YAML = JSON.stringify({
  kind: 'serplists-template-pack',
  schemaVersion: '2.0.0',
  exportedAt: '2026-01-01T00:00:00.000Z',
  templates: [LAUNCH_TEMPLATE],
});
