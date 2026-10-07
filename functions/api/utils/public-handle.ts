import { isUniqueViolationOn } from "./unique-violation";

export function isPublicHandleUniqueViolation(error: unknown): boolean {
  return isUniqueViolationOn(error, "public_handles.handle");
}
