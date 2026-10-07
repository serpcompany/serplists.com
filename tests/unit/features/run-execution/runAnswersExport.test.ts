import { describe, expect, it } from 'vitest';

import {
  buildRunAnswersCsv,
  buildRunAnswersFile,
  buildRunAnswersJson,
  runAnswersFileName,
  runHasFormFields,
} from '@/features/run-execution/runAnswersExport';
import type { ChecklistFormField } from '@/types/checklist';

import { CONTRACT_URL, runWithAnsweredForms, runWithOneField, runWithoutForms } from '../../../support/runAnswers';

const ORIGIN = 'https://serplists.com';
const BOM = String.fromCharCode(0xfeff);
const CRLF = '\r\n';
const EXPORTED_AT = '2026-10-06T12:00:00.000Z';

const csvLines = (csv: string): string[] => {
  expect(csv.startsWith(BOM)).toBe(true);
  expect(csv.endsWith(CRLF)).toBe(true);
  return csv.slice(BOM.length, -CRLF.length).split(CRLF);
};

const answerCell = (field: ChecklistFormField, titles?: { section?: string; task?: string }): string => {
  const [, row] = csvLines(buildRunAnswersCsv(runWithOneField(field, titles), ORIGIN));
  return row ?? '';
};

const textField = (answer: string): ChecklistFormField => ({ id: 'field-text', label: 'Answer', kind: 'text', required: false, answer });

describe('the CSV export of a run\'s form answers', () => {
  it('writes a header, then one row per form field in run order across sections, tasks and forms, with each kind\'s answer as text', () => {
    expect(csvLines(buildRunAnswersCsv(runWithAnsweredForms, ORIGIN))).toEqual([
      'Section,Task,Field,Type,Required,Answer,Task done',
      'Intake,Collect details,Client name,Short text,Yes,"Acme, Inc.",Yes',
      'Intake,Collect details,Brief,Long text,No,"Line one\nSay ""hi""",Yes',
      'Intake,Collect details,Website,URL,No,https://acme.example,Yes',
      'Intake,Collect details,Contact,Email,No,ops@acme.example,Yes',
      'Intake,Collect details,Seats,Number,No,12,Yes',
      'Intake,Collect details,Start date,Date,No,2026-10-06,Yes',
      'Intake,Choose a plan,Plan,Dropdown,No,Growth,No',
      'Intake,Choose a plan,Channels,Multiple choice,No,"Email, Ads",No',
      'Intake,Choose a plan,Terms accepted,Checkbox,No,Checked,No',
      `Paperwork,Contract,Signed contract,File,No,contract.pdf (${ORIGIN}${CONTRACT_URL}),No`,
      'Paperwork,Contract,Notes for legal,Short text,Yes,,No',
    ]);
  });

  it('starts with a UTF-8 byte order mark so spreadsheets read accents, and ends every record with CRLF', () => {
    const csv = buildRunAnswersCsv(runWithOneField(textField('Café crème')), ORIGIN);

    expect(csv).toBe(`${BOM}Section,Task,Field,Type,Required,Answer,Task done${CRLF}Section,Task,Answer,Short text,No,Café crème,No${CRLF}`);
  });

  it('quotes a cell holding a comma, a quote, a carriage return or a line feed, and doubles the quotes inside it', () => {
    expect(answerCell(textField('a,b'))).toContain(',"a,b",');
    expect(answerCell(textField('say "yes"'))).toContain(',"say ""yes""",');
    expect(answerCell(textField('one\rtwo'))).toContain(',"one\rtwo",');
    expect(answerCell(textField('one\ntwo'))).toContain(',"one\ntwo",');
    expect(answerCell(textField('plain'))).toContain(',plain,');
  });

  it.each([
    ['=', '=1+2', "'=1+2"],
    ['+', '+1+cmd', "'+1+cmd"],
    ['-', '-1+cmd', "'-1+cmd"],
    ['@', '@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['a tab', '\tcmd', "'\tcmd"],
    ['a carriage return', '\rcmd', `"'\rcmd"`],
  ])('puts a quote mark before a cell starting with %s, so a spreadsheet never runs it as a formula', (_start, answer, cell) => {
    expect(answerCell(textField(answer))).toBe(`Section,Task,Answer,Short text,No,${cell},No`);
  });

  it('guards every column and a formula that needs quoting too, but leaves a plain signed number as it is', () => {
    expect(answerCell(
      { id: 'field-formula', label: '-Label', kind: 'text', required: false, answer: '=HYPERLINK("https://evil.example","Open")' },
      { section: '=Section', task: '@Task' },
    )).toBe(`'=Section,'@Task,'-Label,Short text,No,"'=HYPERLINK(""https://evil.example"",""Open"")",No`);
    expect(answerCell({ id: 'field-number', label: 'Change', kind: 'number', required: false, answer: -5 })).toContain(',-5,');
    expect(answerCell({ id: 'field-number', label: 'Change', kind: 'number', required: false, answer: -0.25 })).toContain(',-0.25,');
    expect(answerCell(textField('+12'))).toContain(',+12,');
    expect(answerCell(textField('-1+2'))).toContain(",'-1+2,");
    expect(answerCell(textField('-2e3*A1'))).toContain(",'-2e3*A1,");
    expect(answerCell(textField('a=b'))).toContain(',a=b,');
  });

  it('leaves the answer empty for an unanswered field, blank text, no choices and an unticked checkbox', () => {
    const empty: ChecklistFormField[] = [
      { id: 'a', label: 'Name', kind: 'text', required: true },
      { id: 'b', label: 'Name', kind: 'text', required: false, answer: '   ' },
      { id: 'c', label: 'Pick', kind: 'multiSelect', required: false, options: [{ id: 'o', label: 'One' }], answer: [] },
      { id: 'd', label: 'Agree', kind: 'checkbox', required: false, answer: false },
    ];

    for (const field of empty) {
      expect(answerCell(field).split(',').at(-2)).toBe('');
    }
  });

  it('shows an option by its id when the option is gone, and a file by its name or its link alone', () => {
    expect(answerCell({ id: 'p', label: 'Plan', kind: 'select', required: false, options: [], answer: 'option-old' })).toContain(',option-old,');
    expect(answerCell({ id: 'f', label: 'File', kind: 'file', required: false, answer: { url: CONTRACT_URL, fileName: '', fileSize: 0 } }))
      .toContain(`,${ORIGIN}${CONTRACT_URL},`);
    expect(answerCell({ id: 'f', label: 'File', kind: 'file', required: false, answer: { url: ' ', fileName: 'brief.pdf', fileSize: 1 } }))
      .toContain(',brief.pdf,');
  });

  it('keeps an absolute file link as it is and a relative one relative when no origin is given', () => {
    const external = { id: 'f', label: 'File', kind: 'file' as const, required: false, answer: { url: 'https://files.example/a.pdf', fileName: 'a.pdf', fileSize: 1 } };
    expect(answerCell(external)).toContain(',a.pdf (https://files.example/a.pdf),');

    const [, row] = csvLines(buildRunAnswersCsv(runWithOneField({ ...external, answer: { url: CONTRACT_URL, fileName: 'a.pdf', fileSize: 1 } })));
    expect(row).toContain(`,a.pdf (${CONTRACT_URL}),`);
  });

  it('writes only the header for a run without forms', () => {
    expect(csvLines(buildRunAnswersCsv(runWithoutForms, ORIGIN))).toEqual(['Section,Task,Field,Type,Required,Answer,Task done']);
  });
});

describe('the JSON export of a run\'s form answers', () => {
  const exported = (): unknown =>
    JSON.parse(buildRunAnswersJson(runWithAnsweredForms, { exportedAt: EXPORTED_AT, origin: ORIGIN }));

  it('names the run, its Template and when it was exported, then lists each field with its raw answer and its text', () => {
    expect(exported()).toMatchObject({
      run: {
        id: 'run-onboarding',
        title: 'Client onboarding: Acme',
        status: 'in_progress',
        startedAt: '2026-10-01T09:00:00.000Z',
        completedAt: null,
        template: { id: 'template-onboarding', title: 'Client onboarding' },
      },
      exportedAt: EXPORTED_AT,
    });
  });

  it('keeps each answer as stored, null when unanswered, beside the same text the CSV holds', () => {
    const json = buildRunAnswersJson(runWithAnsweredForms, { exportedAt: EXPORTED_AT, origin: ORIGIN });
    const parsed: unknown = JSON.parse(json);

    expect(parsed).toMatchObject({
      answers: [
        {
          section: { id: 'section-intake', title: 'Intake' },
          task: { id: 'task-details', title: 'Collect details', isCompleted: true },
          field: { id: 'field-name', label: 'Client name', kind: 'text', required: true },
          answer: 'Acme, Inc.',
          answerText: 'Acme, Inc.',
        },
        { field: { id: 'field-brief' }, answer: 'Line one\nSay "hi"', answerText: 'Line one\nSay "hi"' },
        { field: { id: 'field-site' }, answer: 'https://acme.example' },
        { field: { id: 'field-contact' }, answer: 'ops@acme.example' },
        { field: { id: 'field-seats', kind: 'number' }, answer: 12, answerText: '12' },
        { field: { id: 'field-start', kind: 'date' }, answer: '2026-10-06' },
        {
          task: { id: 'task-plan', title: 'Choose a plan', isCompleted: false },
          field: { id: 'field-plan', kind: 'select' },
          answer: 'option-growth',
          answerText: 'Growth',
        },
        { field: { id: 'field-channels' }, answer: ['option-email', 'option-ads'], answerText: 'Email, Ads' },
        { field: { id: 'field-terms' }, answer: true, answerText: 'Checked' },
        {
          section: { id: 'section-paperwork', title: 'Paperwork' },
          field: { id: 'field-contract', kind: 'file', required: false },
          answer: { url: CONTRACT_URL, fileName: 'contract.pdf', fileSize: 2048 },
          answerText: `contract.pdf (${ORIGIN}${CONTRACT_URL})`,
        },
        { field: { id: 'field-legal', required: true }, answer: null, answerText: '' },
      ],
    });
    expect(json).toContain('\n  "run": {\n');
  });

  it('names the Template the page gives, leaves it out when unknown, and keeps the completion time of a completed run', () => {
    const completed = { ...runWithAnsweredForms, status: 'completed' as const, completedAt: '2026-10-05T10:00:00.000Z', provenance: undefined };

    expect(JSON.parse(buildRunAnswersJson(completed, { exportedAt: EXPORTED_AT }))).toMatchObject({
      run: { status: 'completed', completedAt: '2026-10-05T10:00:00.000Z' },
    });
    expect(JSON.parse(buildRunAnswersJson(completed, { exportedAt: EXPORTED_AT }))).not.toHaveProperty('run.template');
    expect(JSON.parse(buildRunAnswersJson(completed, {
      exportedAt: EXPORTED_AT,
      template: { id: 'template-camping', title: 'Weekend Camping' },
    }))).toMatchObject({ run: { template: { id: 'template-camping', title: 'Weekend Camping' } } });
  });

  it('lists no answers for a run without forms', () => {
    expect(JSON.parse(buildRunAnswersJson(runWithoutForms, { exportedAt: EXPORTED_AT }))).toMatchObject({ answers: [] });
  });
});

describe('the answers export file', () => {
  it.each([
    ['Client onboarding: Acme', 'csv', 'client-onboarding-acme-answers.csv'],
    ['Café launch — Q4', 'json', 'cafe-launch-q4-answers.json'],
    ['!!!', 'csv', 'run-answers.csv'],
    ['', 'json', 'run-answers.json'],
  ] as const)('names the file after the run title %j as %s', (title, format, fileName) => {
    expect(runAnswersFileName(title, format)).toBe(fileName);
  });

  it('gives a CSV file its type and the CSV, and a JSON file its type and the JSON', () => {
    const options = { exportedAt: EXPORTED_AT, origin: ORIGIN };

    expect(buildRunAnswersFile(runWithAnsweredForms, 'csv', options)).toEqual({
      content: buildRunAnswersCsv(runWithAnsweredForms, ORIGIN),
      fileName: 'client-onboarding-acme-answers.csv',
      type: 'text/csv;charset=utf-8',
    });
    expect(buildRunAnswersFile(runWithAnsweredForms, 'json', options)).toEqual({
      content: buildRunAnswersJson(runWithAnsweredForms, options),
      fileName: 'client-onboarding-acme-answers.json',
      type: 'application/json',
    });
  });

  it('is offered only for a run with at least one form field', () => {
    expect(runHasFormFields(runWithAnsweredForms)).toBe(true);
    expect(runHasFormFields(runWithoutForms)).toBe(false);
    expect(runHasFormFields({ sections: [{ id: 's', title: 'S', items: [{ id: 't', title: 'T', contents: [{ type: 'form', value: '', fields: [] }] }] }] })).toBe(false);
  });
});
