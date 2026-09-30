import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';

export const launchChecklistTemplate = normalizePortableTemplate({
  title: 'Launch Checklist',
  description: 'Plan the release before launch day.',
  visibility: 'public',
  categories: ['ops'],
  tags: ['release'],
  rules: [
    {
      id: 'rule-1',
      type: 'required-field',
      path: 'sections[].items[].title',
      severity: 'error',
    },
  ],
  sections: [
    {
      title: 'Preparation',
      items: [
        {
          title: 'Review content',
          description: 'Confirm all content is final.',
          contents: [
            {
              type: 'text',
              value: 'Publish the final **release notes**.',
            },
            {
              type: 'image',
              value: 'https://example.com/image.png',
              uploadType: 'url',
            },
            {
              type: 'subItems',
              value: '',
              subItems: [
                { title: 'Check title' },
                { title: 'Check CTA' },
              ],
            },
          ],
        },
      ],
    },
  ],
});
