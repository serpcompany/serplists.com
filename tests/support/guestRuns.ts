import type { ChecklistTemplate } from '@/types/checklist';

export const GUEST_RUN_STORAGE_KEY = 'serplists:guest-run:template-camping';

export const guestRunTemplate: ChecklistTemplate = {
  id: 'template-camping',
  slug: 'weekend-camping',
  title: 'Weekend Camping',
  isPublic: true,
  userId: 'user-1',
  ownerProfile: { username: 'alice' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  sections: [
    {
      id: 'section-pack',
      title: 'Pack',
      items: [
        {
          id: 'task-tent',
          title: 'Pack the tent',
          isCompleted: true,
          contents: [
            {
              id: 'block-tent',
              type: 'subItems',
              value: '',
              subItems: [
                { id: 'sub-poles', title: 'Poles', isCompleted: true },
                { id: 'sub-stakes', title: 'Stakes' },
              ],
            },
          ],
        },
        { id: 'task-food', title: 'Pack the food' },
      ],
    },
    {
      id: 'section-leave',
      title: 'Leave',
      items: [{ id: 'task-lock', title: 'Lock the house' }],
    },
  ],
};

export const otherGuestRunTemplate: ChecklistTemplate = {
  ...guestRunTemplate,
  id: 'template-moving',
  slug: 'moving-day',
  title: 'Moving Day',
};

export const guestRunTemplateWithAForm: ChecklistTemplate = {
  ...guestRunTemplate,
  sections: [{
    id: 'section-intake',
    title: 'Intake',
    items: [
      {
        id: 'task-details',
        title: 'Collect details',
        contents: [{
          id: 'form-details',
          type: 'form',
          value: '',
          fields: [
            { id: 'field-name', label: 'Client name', kind: 'text', required: true },
            { id: 'field-contract', label: 'Signed contract', kind: 'file', required: false },
          ],
        }],
      },
      { id: 'task-welcome', title: 'Send the welcome email' },
    ],
  }],
};
