import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';

export const mediaTemplate = normalizePortableTemplate({
  title: 'Media Kit',
  type: 'recipe',
  seoTitle: 'Media Kit for launches',
  tags: ['press'],
  sections: [
    {
      title: 'Assets',
      items: [
        {
          title: 'Collect the files',
          contents: [
            { type: 'image', value: 'https://example.com/logo.png' },
            { type: 'video', value: 'https://example.com/intro.mp4', fileName: 'intro.mp4' },
            { type: 'video', value: 'https://example.com/teaser.mp4' },
            { type: 'file', value: 'https://example.com/kit.zip', fileName: 'kit.zip', fileSize: 2_621_440 },
            { type: 'file', value: 'https://example.com/notes.txt' },
            { type: 'embed', value: 'https://www.youtube.com/watch?v=abc' },
          ],
        },
      ],
    },
  ],
});
