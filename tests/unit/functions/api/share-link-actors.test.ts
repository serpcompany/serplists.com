import { describe, expect, it } from 'vitest';
import { findHiddenShareLinkActors } from '@functions/api/utils/share-link-actors';
import { apiEnv } from '../../../support/apiEnv';

const SHARE_LINK = JSON.stringify({ source: 'public_share' });
const row = (actor: string | null, metadata: string | null) => ({ actor_user_id: actor, metadata_json: metadata });

describe('findHiddenShareLinkActors for a Personal run', () => {
  it('hides only the signed-in outsiders who saved through the share link', async () => {
    const outsider = row('outsider', SHARE_LINK);
    const owner = row('owner', SHARE_LINK);
    const anonymous = row(null, SHARE_LINK);
    const ownerInTheApp = row('outsider', JSON.stringify({ source: 'app' }));
    const unreadable = row('outsider', '{"source":');
    const noMetadata = row('outsider', null);

    const isHidden = await findHiddenShareLinkActors(apiEnv(), { userId: 'owner', teamId: null }, [
      outsider, owner, anonymous, ownerInTheApp, unreadable, noMetadata,
    ]);

    expect([outsider, owner, anonymous, ownerInTheApp, unreadable, noMetadata].map(isHidden)).toEqual([true, false, false, false, false, false]);
  });
});
