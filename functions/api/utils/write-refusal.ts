import { json, jsonError } from './response';

export type WriteRefusal = {
  message: string;
  status: number;
  code?: string | undefined;
  details?: unknown;
};

export type WriteResult<Saved> = { saved: Saved } | { refused: WriteRefusal };

export function writeRefusal(
  message: string,
  status: number,
  options: { code?: string | undefined; details?: unknown } = {},
): WriteRefusal {
  return { message, status, ...options };
}

export function refuse(...args: Parameters<typeof writeRefusal>): { refused: WriteRefusal } {
  return { refused: writeRefusal(...args) };
}

export function refusalResponse({ message, status, code, details }: WriteRefusal): Response {
  return jsonError(message, status, { code, details });
}

export function writeResultResponse<Saved>(result: WriteResult<Saved>): Response {
  return 'refused' in result ? refusalResponse(result.refused) : json(result.saved);
}
