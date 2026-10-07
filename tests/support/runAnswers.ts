import type { ChecklistFormField, ChecklistRun } from '@/types/checklist';

export const CONTRACT_URL = '/api/uploads/file?key=template-files%2Fuser-1%2Fcontract.pdf';

export const runWithAnsweredForms: ChecklistRun = {
  id: 'run-onboarding',
  templateId: 'template-onboarding',
  title: 'Client onboarding: Acme',
  status: 'in_progress',
  progress: 33,
  startedAt: '2026-10-01T09:00:00.000Z',
  userId: 'user-1',
  provenance: {
    origin: 'web',
    startedBy: null,
    template: { id: 'template-onboarding', title: 'Client onboarding', version: 3 },
  },
  sections: [
    {
      id: 'section-intake',
      title: 'Intake',
      items: [
        {
          id: 'task-details',
          title: 'Collect details',
          isCompleted: true,
          contents: [{
            id: 'form-details',
            type: 'form',
            value: '',
            fields: [
              { id: 'field-name', label: 'Client name', kind: 'text', required: true, answer: 'Acme, Inc.' },
              { id: 'field-brief', label: 'Brief', kind: 'longText', required: false, answer: 'Line one\nSay "hi"' },
              { id: 'field-site', label: 'Website', kind: 'url', required: false, answer: 'https://acme.example' },
              { id: 'field-contact', label: 'Contact', kind: 'email', required: false, answer: 'ops@acme.example' },
              { id: 'field-seats', label: 'Seats', kind: 'number', required: false, answer: 12 },
              { id: 'field-start', label: 'Start date', kind: 'date', required: false, answer: '2026-10-06' },
            ],
          }],
        },
        {
          id: 'task-plan',
          title: 'Choose a plan',
          contents: [
            { id: 'text-plan', type: 'text', value: 'Ask which plan fits.' },
            {
              id: 'form-plan',
              type: 'form',
              value: '',
              fields: [
                {
                  id: 'field-plan',
                  label: 'Plan',
                  kind: 'select',
                  required: false,
                  options: [{ id: 'option-starter', label: 'Starter' }, { id: 'option-growth', label: 'Growth' }],
                  answer: 'option-growth',
                },
                {
                  id: 'field-channels',
                  label: 'Channels',
                  kind: 'multiSelect',
                  required: false,
                  options: [{ id: 'option-email', label: 'Email' }, { id: 'option-ads', label: 'Ads' }],
                  answer: ['option-email', 'option-ads'],
                },
                { id: 'field-terms', label: 'Terms accepted', kind: 'checkbox', required: false, answer: true },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'section-paperwork',
      title: 'Paperwork',
      items: [
        {
          id: 'task-contract',
          title: 'Contract',
          contents: [
            {
              id: 'form-contract',
              type: 'form',
              value: '',
              fields: [{
                id: 'field-contract',
                label: 'Signed contract',
                kind: 'file',
                required: false,
                answer: { url: CONTRACT_URL, fileName: 'contract.pdf', fileSize: 2048 },
              }],
            },
            {
              id: 'form-legal',
              type: 'form',
              value: '',
              fields: [{ id: 'field-legal', label: 'Notes for legal', kind: 'text', required: true }],
            },
          ],
        },
        { id: 'task-file', title: 'File the paperwork' },
      ],
    },
  ],
};

export const runWithoutForms: ChecklistRun = {
  ...runWithAnsweredForms,
  sections: [{
    id: 'section-plain',
    title: 'Plain',
    items: [{
      id: 'task-plain',
      title: 'Just a task',
      contents: [{ id: 'sub-tasks', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'A step' }] }],
    }],
  }],
};

export const runWithOneField = (field: ChecklistFormField, titles: { section?: string; task?: string } = {}): ChecklistRun => ({
  ...runWithAnsweredForms,
  sections: [{
    id: 'section-one',
    title: titles.section ?? 'Section',
    items: [{
      id: 'task-one',
      title: titles.task ?? 'Task',
      contents: [{ id: 'form-one', type: 'form', value: '', fields: [field] }],
    }],
  }],
});
