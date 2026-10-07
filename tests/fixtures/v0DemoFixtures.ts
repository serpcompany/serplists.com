import type { ChecklistTemplate } from '@/types/checklist';

const V0_DEMO_PROFILE = {
  username: 'designops',
} as const;

const V0_DEMO_PRIVATE_TEMPLATE_ID = 'tpl-1' as const;

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

export function buildV0DemoPrivateTemplate(): ChecklistTemplate {
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
    ownerProfile: {
      full_name: 'Design Ops Team',
      username: V0_DEMO_PROFILE.username,
    },
  };
}
