import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { z } from 'zod';

const ROUNDS_FOR_FINALIZERS_TO_RUN = 5;

function exposedGarbageCollector(): () => void {
  setFlagsFromString('--expose-gc');
  const gc = z.function().parse(runInNewContext('gc'));
  return () => {
    gc();
  };
}

export async function collectGarbageAndRunFinalizers(): Promise<void> {
  const gc = exposedGarbageCollector();
  for (let round = 0; round < ROUNDS_FOR_FINALIZERS_TO_RUN; round += 1) {
    gc();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
