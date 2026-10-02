export function apiRequest(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost/api/${path}`, body === undefined ? { method } : { method, body: JSON.stringify(body) });
}
