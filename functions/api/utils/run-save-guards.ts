import { completedRunTaskChangeResponse } from './completed-run-freeze';
import { contentTooLargeResponse } from './content-limits';
import { formIncompleteResponse } from './run-form-guard';

export function runSectionsSaveRefusal(
  run: { status: unknown },
  nextStatus: unknown,
  storedSections: unknown[],
  nextSections: unknown[],
): Response | null {
  return completedRunTaskChangeResponse(run, nextStatus, storedSections, nextSections)
    ?? formIncompleteResponse(storedSections, nextSections)
    ?? contentTooLargeResponse('run', nextSections, storedSections);
}
