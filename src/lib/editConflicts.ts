import { getApiErrorMessage, isApiError } from "@/lib/api-errors";

// Answers that mean the page's cached copy is out of date: the record changed elsewhere
// (409 edit_conflict), a run was made public elsewhere (409 shared_run_conflict), or it was
// archived (404). Refreshing the cache lets the next attempt use the current revision or
// version; without it every retry sends the same stale value and fails the same way.
export const isStaleRecordError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.status === 404 ||
    (error.status === 409 && (error.code === "edit_conflict" || error.code === "shared_run_conflict")));

// The server's "Refresh before ..." text is misleading once the page refreshed by itself.
export const getRevalidateRunErrorMessage = (error: unknown): string => {
  if (isStaleRecordError(error)) {
    return isApiError(error) && error.status === 404
      ? "This run is no longer available. The list was refreshed."
      : "This run changed elsewhere. The list was refreshed; try again if it still needs revalidation.";
  }
  return getApiErrorMessage(error, "Unable to revalidate run");
};

export const getTemplateChangeErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (isStaleRecordError(error)) {
    return isApiError(error) && error.status === 404
      ? "This template is no longer available."
      : "This template changed elsewhere. It was reloaded; try again.";
  }
  return getApiErrorMessage(error, fallbackMessage);
};
