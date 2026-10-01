import { noExternalDataCasts } from '../../../scripts/eslint-rules/no-external-data-casts.mjs';
import { typescriptRuleTester } from '../../support/ruleTester';

typescriptRuleTester().run('no-external-data-casts', noExternalDataCasts, {
  valid: [
    { name: 'JSON parsed with a schema', code: 'const draft = draftSchema.parse(JSON.parse(text));' },
    { name: 'JSON read as unknown', code: 'const value: unknown = JSON.parse(text);' },
    { name: 'JSON widened to unknown', code: 'const value = JSON.parse(text) as unknown;' },
    { name: 'a response body read as unknown', code: 'const body: unknown = await response.json();' },
    { name: 'the API client with a schema', code: 'const runs = await apiRequest("/checklists", apiRunListSchema);' },
    { name: 'a stored value parsed with a schema', code: 'const kept = keptSchema.safeParse(JSON.parse(storage.getItem(key) ?? "null"));' },
    { name: 'message data parsed with a schema', code: 'channel.onmessage = (event) => listener(reportSchema.safeParse(event.data));' },
    { name: 'a form field checked by type', code: 'const file = form.get("file");\nif (file instanceof File) upload(file);' },
    { name: 'a cast of a value that is not external data', code: 'const item = value as ChecklistItem;' },
    { name: 'data that is not a message', code: 'const rows = query.data as Row[];' },
    { name: 'a const assertion', code: 'const roles = ["owner", "admin"] as const;' },
    { name: 'a get call on a map', code: 'const entry = cache.get(key) as Entry;' },
  ],
  invalid: [
    { name: 'JSON.parse cast to a shape', code: 'const event = JSON.parse(payload) as StripeEvent;', errors: [{ messageId: 'jsonParse' }] },
    {
      name: 'JSON.parse in an angle-bracket cast',
      code: 'const event = <StripeEvent>JSON.parse(payload);',
      filename: 'webhook.ts',
      errors: [{ messageId: 'jsonParse' }],
    },
    { name: 'a response body cast without await', code: 'return response.json() as Promise<T>;', errors: [{ messageId: 'responseBody' }] },
    { name: 'an awaited response body cast', code: 'const status = (await response.json()) as AuthStatus;', errors: [{ messageId: 'responseBody' }] },
    { name: 'an optional-chained response body cast', code: 'const body = (await response?.json()) as Body;', errors: [{ messageId: 'responseBody' }] },
    { name: 'a response body typed by json<T>()', code: 'const body = await response.json<Body>();', errors: [{ messageId: 'responseBody' }] },
    { name: 'a stored value cast', code: 'const theme = storage.getItem(key) as Theme;', errors: [{ messageId: 'storage' }] },
    { name: 'an awaited stored value cast', code: 'const draft = (await store.getItem(key)) as Draft;', errors: [{ messageId: 'storage' }] },
    { name: 'event.data cast', code: 'const report = event.data as SessionReport;', errors: [{ messageId: 'messageData' }] },
    { name: 'message.data cast', code: 'const reply = message.data as Reply;', errors: [{ messageId: 'messageData' }] },
    { name: 'a message event named by kind', code: 'const report = messageEvent.data as SessionReport;', errors: [{ messageId: 'messageData' }] },
    { name: 'a form field cast', code: 'const bucket = form.get("bucket") as Bucket;', errors: [{ messageId: 'formData' }] },
    { name: 'form fields cast', code: 'const tags = formData.getAll("tag") as string[];', errors: [{ messageId: 'formData' }] },
    { name: 'a whole form cast', code: 'const form = (await request.formData()) as UploadForm;', errors: [{ messageId: 'formData' }] },
    { name: 'a double cast through unknown', code: 'const row = existing as unknown as Record<string, unknown>;', errors: [{ messageId: 'doubleCast' }] },
    { name: 'a double cast of external data', code: 'const event = JSON.parse(payload) as unknown as StripeEvent;', errors: [{ messageId: 'doubleCast' }] },
    { name: 'a double angle-bracket cast', code: 'const env = <Env>(<unknown>context.env);', filename: 'env.ts', errors: [{ messageId: 'doubleCast' }] },
  ],
});
