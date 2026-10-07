import { act } from 'react';

import { settle } from './queryHookProbe';

const ROUNDS_FOR_AN_ANSWER_TO_REACH_OBSERVERS = 5;

export const letQueryUpdatesReachObservers = () =>
  act(async () => {
    for (let round = 0; round < ROUNDS_FOR_AN_ANSWER_TO_REACH_OBSERVERS; round += 1) await settle();
  });
