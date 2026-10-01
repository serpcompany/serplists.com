import { getApiErrorMessage, isApiError, isNotFoundError } from "@/lib/api-errors";

export const isStaleRecordError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.status === 404 ||
    (error.status === 409 && (error.code === "edit_conflict" || error.code === "shared_run_conflict")));

const isSourceTemplateUnavailableError = (error: unknown): boolean =>
  isApiError(error) && error.code === "source_template_unavailable";

export const getRevalidateRunErrorMessage = (error: unknown): string => {
  if (!isStaleRecordError(error)) return getApiErrorMessage(error, "Unable to revalidate run");
  if (isSourceTemplateUnavailableError(error)) {
    return "This run's template is no longer available, so it can't be revalidated. The list was refreshed.";
  }
  return isNotFoundError(error)
    ? "This run is no longer available. The list was refreshed."
    : "This run changed elsewhere. The list was refreshed; try again if it still needs revalidation.";
};

export const getTemplateChangeErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (!isStaleRecordError(error)) return getApiErrorMessage(error, fallbackMessage);
  return isNotFoundError(error)
    ? "This template is no longer available."
    : "This template changed elsewhere. It was reloaded; try again.";
};
