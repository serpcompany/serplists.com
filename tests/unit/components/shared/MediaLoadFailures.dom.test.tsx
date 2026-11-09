import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TaskImage } from '@/components/shared/TaskImage';
import { VideoEmbed } from '@/components/shared/VideoEmbed';

import { renderSettled } from '../../../support/renderInTheDom';

afterEach(cleanup);

describe('media on a run that fails to load', () => {
  it('says an image is unavailable once it fails to load', async () => {
    await renderSettled(<TaskImage alt="Wiring diagram" url="https://cdn.example.com/diagram.png" />);

    await act(async () => {
      fireEvent.error(screen.getByRole('img', { name: 'Wiring diagram' }));
    });

    expect(screen.getByRole('img', { name: 'Image unavailable' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Wiring diagram' })).toBeNull();
  });

  it('links to a video the player could not load', async () => {
    await renderSettled(<VideoEmbed title="Walkthrough" url="https://cdn.example.com/walkthrough.mp4" />);
    const player = document.querySelector('video');
    if (!player) throw new Error('No video player');

    await act(async () => {
      fireEvent.error(player);
    });

    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open video' }).getAttribute('href')).toBe('https://cdn.example.com/walkthrough.mp4');
  });
});
