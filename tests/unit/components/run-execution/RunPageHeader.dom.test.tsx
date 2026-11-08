import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RunPageHeader } from '@/components/run-execution/RunPageHeader';

import { runPageHeaderProps } from '../../../fixtures/runPageHeader';
import { renderSettled } from '../../../support/renderInTheDom';

afterEach(cleanup);

async function renderTheTitleField() {
  const props = runPageHeaderProps({ isEditingTitle: true });
  await renderSettled(<RunPageHeader {...props} />);
  return { props, field: screen.getByRole('textbox', { name: 'Run title' }) };
}

const press = (field: HTMLElement, key: string) =>
  act(async () => {
    fireEvent.keyDown(field, { key });
  });

describe('renaming a run in its page header', () => {
  it('hands each edit of the title to the page', async () => {
    const { props, field } = await renderTheTitleField();

    fireEvent.change(field, { target: { value: 'Launch v2' } });

    expect(props.onEditTitleChange).toHaveBeenCalledWith('Launch v2');
  });

  it('saves the title on Enter and cancels on Escape, ignoring other keys', async () => {
    const { props, field } = await renderTheTitleField();

    await press(field, 'a');
    expect(props.onSaveTitle).not.toHaveBeenCalled();
    expect(props.onCancelRename).not.toHaveBeenCalled();

    await press(field, 'Enter');
    expect(props.onSaveTitle).toHaveBeenCalledTimes(1);

    await press(field, 'Escape');
    expect(props.onCancelRename).toHaveBeenCalledTimes(1);
  });
});
