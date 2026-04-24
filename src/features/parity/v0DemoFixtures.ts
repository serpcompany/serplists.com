import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

export const V0_DEMO_PROFILE = {
  username: 'designops',
} as const;

export const V0_DEMO_PUBLIC_TEMPLATE_ROUTE = {
  templateSlug: 'website-launch-checklist',
  username: V0_DEMO_PROFILE.username,
} as const;

export const V0_DEMO_PRIVATE_TEMPLATE_ID = 'tpl-1' as const;
export const V0_DEMO_RUN_IDS = new Set(['run-1']);
export const V0_DEMO_SHARE_TOKENS = new Set(['abc123']);

export type DemoPublicTemplate = ChecklistTemplate & {
  copyCount: number;
  runCount: number;
  viewCount: number;
};

export type DemoChecklistRun = ChecklistRun & {
  templateOwner?: {
    full_name?: string;
    username?: string;
  };
};

const WEBSITE_LAUNCH_SECTIONS: ChecklistTemplate['sections'] = [
  {
    id: 'section-1',
    title: 'Pre-Launch Preparation',
    items: [
      {
        id: 'task-1',
        title: 'Review all page content for accuracy',
        description:
          'Check for typos, broken links, and outdated information across all pages.',
      },
      {
        id: 'task-2',
        title: 'Test all forms and user flows',
        description:
          'Submit test entries through all forms and verify data reaches the correct destination.',
      },
      {
        id: 'task-3',
        title: 'Verify analytics and tracking setup',
        description:
          'Confirm Google Analytics, conversion tracking, and any other analytics tools are properly configured.',
      },
      {
        id: 'task-4',
        title: 'Review mobile responsiveness',
        description: 'Test all pages on various device sizes and orientations.',
      },
    ],
  },
  {
    id: 'section-2',
    title: 'Technical Audit',
    items: [
      {
        id: 'task-5',
        title: 'Run Lighthouse performance audit',
        description:
          'Check performance, accessibility, best practices, and SEO scores. Target 90+ on all metrics.',
      },
      {
        id: 'task-6',
        title: 'Validate SSL certificate',
        description:
          'Ensure HTTPS is working correctly and the certificate is valid.',
      },
      {
        id: 'task-7',
        title: 'Test page load times',
        description:
          'Check load times across different network conditions and locations.',
      },
      {
        id: 'task-8',
        title: 'Verify backup and recovery procedures',
        description:
          'Confirm backups are running and test the recovery process.',
      },
    ],
  },
  {
    id: 'section-3',
    title: 'SEO Checklist',
    items: [
      {
        id: 'task-9',
        title: 'Review meta titles and descriptions',
        description: 'Ensure all pages have unique, optimized meta tags.',
      },
      {
        id: 'task-10',
        title: 'Submit sitemap to search engines',
        description:
          'Upload sitemap.xml to Google Search Console and Bing Webmaster Tools.',
      },
      {
        id: 'task-11',
        title: 'Set up structured data',
        description:
          'Implement schema markup for better search engine visibility.',
      },
    ],
  },
  {
    id: 'section-4',
    title: 'Launch Day',
    items: [
      {
        id: 'task-12',
        title: 'Update DNS records',
        description: 'Point the domain to the new hosting provider.',
      },
      {
        id: 'task-13',
        title: 'Monitor for errors',
        description:
          'Watch server logs and error tracking for the first 24 hours.',
      },
      {
        id: 'task-14',
        title: 'Announce the launch',
        description:
          'Send out launch announcements to stakeholders and social media.',
      },
    ],
  },
];

const PRODUCT_LAUNCH_SECTIONS: ChecklistTemplate['sections'] = [
  {
    id: 'detail-sec-001',
    title: 'Pre-Launch Preparation',
    items: [
      { id: 'detail-task-001', title: 'Finalize product documentation', contents: [] },
      { id: 'detail-task-002', title: 'QA sign-off', contents: [] },
      { id: 'detail-task-003', title: 'Marketing assets ready', contents: [] },
    ],
  },
  {
    id: 'detail-sec-002',
    title: 'Launch Day',
    items: [
      { id: 'detail-task-004', title: 'Deploy to production', contents: [] },
      { id: 'detail-task-005', title: 'Monitor metrics', contents: [] },
      { id: 'detail-task-006', title: 'Announce launch', contents: [] },
    ],
  },
  {
    id: 'detail-sec-003',
    title: 'Post-Launch',
    items: [
      { id: 'detail-task-007', title: 'Gather initial feedback', contents: [] },
      { id: 'detail-task-008', title: 'Schedule retrospective', contents: [] },
      { id: 'detail-task-009', title: 'Update roadmap', contents: [] },
    ],
  },
];

export const isV0DemoProfileUsername = (username?: string): boolean =>
  username?.toLowerCase() === V0_DEMO_PROFILE.username;

export const isV0DemoPublicTemplateRoute = (params: {
  username?: string;
  templateSlug?: string;
}): boolean =>
  params.username === V0_DEMO_PUBLIC_TEMPLATE_ROUTE.username &&
  params.templateSlug === V0_DEMO_PUBLIC_TEMPLATE_ROUTE.templateSlug;

export const isV0DemoPrivateTemplateId = (id?: string): boolean =>
  id === V0_DEMO_PRIVATE_TEMPLATE_ID;

export const isV0DemoRunId = (id?: string): boolean =>
  Boolean(id && V0_DEMO_RUN_IDS.has(id));

export const isV0DemoShareToken = (shareToken?: string): boolean =>
  Boolean(shareToken && V0_DEMO_SHARE_TOKENS.has(shareToken));

export function buildV0DemoPublicTemplate(): DemoPublicTemplate {
  return {
    id: 'template-1',
    title: 'Website Launch Checklist',
    description:
      'A comprehensive checklist for launching a new website. Covers pre-launch preparation, technical audits, SEO optimization, and launch day activities. Used by over 500 teams to ensure nothing falls through the cracks.',
    type: 'checklist',
    isPublic: true,
    userId: 'user-1',
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-12T15:30:00Z',
    slug: V0_DEMO_PUBLIC_TEMPLATE_ROUTE.templateSlug,
    seoTitle: 'Website Launch Checklist - Complete Guide',
    seoDescription: 'The ultimate checklist for launching websites successfully',
    categories: ['Web Development', 'Launch', 'Marketing'],
    tags: ['website', 'launch', 'seo', 'quality-assurance', 'deployment'],
    ownerProfile: {
      full_name: 'Design Ops Team',
      username: V0_DEMO_PUBLIC_TEMPLATE_ROUTE.username,
    },
    viewCount: 1250,
    copyCount: 342,
    runCount: 876,
    sections: WEBSITE_LAUNCH_SECTIONS,
  };
}

export function buildV0DemoPrivateTemplate(): ChecklistTemplate & {
  copyCount: number;
  runCount: number;
  viewCount: number;
} {
  return {
    id: V0_DEMO_PRIVATE_TEMPLATE_ID,
    title: 'Product Launch Checklist',
    description:
      'A comprehensive checklist for launching new products, covering pre-launch, launch day, and post-launch activities.',
    type: 'checklist',
    sections: PRODUCT_LAUNCH_SECTIONS,
    userId: 'user-1',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-02-20T14:30:00Z',
    isPublic: true,
    slug: 'product-launch-checklist',
    seoTitle: 'Product Launch Checklist - Complete Guide',
    seoDescription:
      'A comprehensive checklist covering pre-launch prep, launch day activities, and post-launch follow-up tasks.',
    categories: ['Product', 'Engineering'],
    tags: ['launch', 'release', 'product-management'],
    viewCount: 1234,
    copyCount: 89,
    runCount: 342,
    ownerProfile: {
      full_name: 'Design Ops Team',
      username: V0_DEMO_PROFILE.username,
    },
  };
}

export function buildV0DemoRun(): DemoChecklistRun {
  return {
    id: 'run-1',
    templateId: 'template-1',
    title: 'Website Launch Checklist',
    status: 'in_progress',
    progress: 35,
    startedAt: '2024-01-15T10:00:00Z',
    userId: 'user-1',
    templateVersion: 1,
    templateOwner: {
      username: V0_DEMO_PROFILE.username,
      full_name: 'Design Ops Team',
    },
    sections: [
      {
        id: 'section-1',
        title: 'Pre-Launch',
        items: [
          {
            id: 'task-1',
            title: 'Review all page content',
            description:
              'Check for typos, broken links, and outdated information across all pages.',
            isCompleted: true,
            contents: [
              {
                id: 'content-1',
                type: 'text',
                value:
                  'Go through each page systematically. Use the content audit spreadsheet to track your progress. Pay special attention to:\n\n• Homepage hero section\n• About page team bios\n• Contact information\n• Footer links',
              },
              {
                id: 'content-2',
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'sub-1', title: 'Homepage content reviewed', isCompleted: true },
                  { id: 'sub-2', title: 'About page reviewed', isCompleted: true },
                  { id: 'sub-3', title: 'Contact page reviewed', isCompleted: false },
                  { id: 'sub-4', title: 'Blog posts reviewed', isCompleted: false },
                ],
              },
            ],
          },
          {
            id: 'task-2',
            title: 'Test all forms',
            description:
              'Submit test entries through all forms and verify data reaches the correct destination.',
            isCompleted: true,
            contents: [
              {
                id: 'content-3',
                type: 'text',
                value:
                  'Use test data for each form submission. Check email notifications, database entries, and any integrations.',
              },
            ],
          },
          {
            id: 'task-3',
            title: 'Verify analytics tracking',
            description:
              'Confirm Google Analytics, conversion tracking, and any other analytics tools are properly configured.',
            isCompleted: false,
            contents: [
              {
                id: 'content-4',
                type: 'embed',
                value: 'https://analytics.google.com',
              },
              {
                id: 'content-5',
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'sub-5', title: 'GA4 tag verified', isCompleted: false },
                  { id: 'sub-6', title: 'Conversion events tested', isCompleted: false },
                  { id: 'sub-7', title: 'Real-time data visible', isCompleted: false },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'section-2',
        title: 'Technical Checks',
        items: [
          {
            id: 'task-4',
            title: 'Run Lighthouse audit',
            description:
              'Check performance, accessibility, best practices, and SEO scores.',
            isCompleted: false,
            contents: [
              {
                id: 'content-6',
                type: 'text',
                value:
                  'Target scores:\n• Performance: 90+\n• Accessibility: 100\n• Best Practices: 100\n• SEO: 100',
              },
              {
                id: 'content-7',
                type: 'image',
                value: 'lighthouse-scores.png',
              },
            ],
          },
          {
            id: 'task-5',
            title: 'Test mobile responsiveness',
            description:
              'Verify all pages render correctly on various device sizes.',
            isCompleted: false,
            contents: [
              {
                id: 'content-video-1',
                type: 'video',
                value: 'https://www.youtube.com/watch?v=PL4ktpwAxBE',
              },
            ],
          },
          {
            id: 'task-6',
            title: 'Check SSL certificate',
            description: 'Ensure HTTPS is working and the certificate is valid.',
            isCompleted: false,
            contents: [
              {
                id: 'content-8',
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'sub-8', title: 'Certificate valid', isCompleted: false },
                  { id: 'sub-9', title: 'HTTP redirects to HTTPS', isCompleted: false },
                  { id: 'sub-10', title: 'No mixed content warnings', isCompleted: false },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'section-3',
        title: 'Launch Day',
        items: [
          {
            id: 'task-7',
            title: 'Update DNS records',
            description: 'Point the domain to the new hosting provider.',
            isCompleted: false,
            contents: [
              {
                id: 'content-9',
                type: 'file',
                value: '',
                fileName: 'dns-configuration.txt',
                fileSize: 2048,
              },
            ],
          },
          {
            id: 'task-8',
            title: 'Monitor for errors',
            description:
              'Watch server logs and error tracking for the first 24 hours.',
            isCompleted: false,
            contents: [],
          },
          {
            id: 'task-9',
            title: 'Announce launch',
            description:
              'Send out launch announcements to stakeholders and social media.',
            isCompleted: false,
            contents: [
              {
                id: 'content-10',
                type: 'text',
                value:
                  'Channels to announce:\n• Company Slack\n• Twitter/X\n• LinkedIn\n• Email newsletter',
              },
            ],
          },
        ],
      },
    ],
  };
}

export function buildV0DemoSharedRun(): DemoChecklistRun {
  return {
    id: 'share-run-001',
    templateId: V0_DEMO_PRIVATE_TEMPLATE_ID,
    title: 'Project Setup Checklist',
    status: 'in_progress',
    progress: 33,
    startedAt: '2024-03-01T09:00:00Z',
    userId: 'user-1',
    templateOwner: {
      username: 'johndoe',
      full_name: 'John Doe',
    },
    sections: [
      {
        id: 'share-sec-001',
        title: 'Environment Setup',
        items: [
          {
            id: 'share-task-001',
            title: 'Install required dependencies',
            description: 'Set up the development environment',
            isCompleted: true,
            contents: [
              {
                id: 'share-content-001',
                type: 'text',
                value:
                  'Run the following commands to install dependencies:\n\nnpm install\nnpm run setup',
              },
              {
                id: 'share-content-002',
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'share-sub-001', title: 'Node.js 18+', isCompleted: true },
                  { id: 'share-sub-002', title: 'pnpm or npm', isCompleted: true },
                  { id: 'share-sub-003', title: 'Git', isCompleted: true },
                ],
              },
            ],
          },
          {
            id: 'share-task-002',
            title: 'Configure environment variables',
            isCompleted: true,
            contents: [
              {
                id: 'share-content-003',
                type: 'text',
                value:
                  'Copy .env.example to .env and fill in the required values.',
              },
            ],
          },
        ],
      },
      {
        id: 'share-sec-002',
        title: 'Repository Setup',
        items: [
          {
            id: 'share-task-003',
            title: 'Clone the repository',
            isCompleted: false,
            contents: [
              {
                id: 'share-content-004',
                type: 'embed',
                value: 'https://github.com/example/project',
              },
            ],
          },
          {
            id: 'share-task-004',
            title: 'Set up branch protection',
            isCompleted: false,
            contents: [],
          },
          {
            id: 'share-task-005',
            title: 'Configure CI/CD',
            isCompleted: false,
            contents: [
              {
                id: 'share-content-005',
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'share-sub-004', title: 'Set up GitHub Actions', isCompleted: false },
                  { id: 'share-sub-005', title: 'Configure deployment', isCompleted: false },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'share-sec-003',
        title: 'Documentation',
        items: [
          {
            id: 'share-task-006',
            title: 'Update README',
            isCompleted: false,
            contents: [],
          },
          {
            id: 'share-task-007',
            title: 'Add contribution guidelines',
            isCompleted: false,
            contents: [],
          },
        ],
      },
    ],
  };
}
