type Bytes = Uint8Array<ArrayBuffer>;

export type R2File = { key: string; bytes: Bytes; contentType: string; etag: string };

type R2Value = ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob;

export const R2_UNSATISFIABLE_RANGE_ERROR = 'get: The requested range is not satisfiable (10039)';

class StoredR2Object implements R2Object {
  readonly key: string;
  readonly version = 'version-1';
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly checksums: R2Checksums = { toJSON: () => ({}) };
  readonly uploaded = new Date(0);
  readonly httpMetadata: R2HTTPMetadata;
  readonly range?: R2Range;
  readonly storageClass = 'Standard';

  constructor(file: R2File, range?: R2Range) {
    this.key = file.key;
    this.size = file.bytes.length;
    this.etag = file.etag;
    this.httpEtag = `"${file.etag}"`;
    this.httpMetadata = { contentType: file.contentType };
    if (range) this.range = range;
  }

  writeHttpMetadata(headers: Headers): void {
    if (this.httpMetadata.contentType) headers.set('Content-Type', this.httpMetadata.contentType);
  }
}

class StoredR2ObjectBody extends StoredR2Object implements R2ObjectBody {
  private readonly response: Response;

  constructor(file: R2File, bytes: Bytes, range?: R2Range) {
    super(file, range);
    this.response = new Response(bytes);
  }

  get body(): ReadableStream {
    const { body } = this.response;
    if (!body) throw new Error(`${this.key} has no body`);
    return body;
  }

  get bodyUsed(): boolean {
    return this.response.bodyUsed;
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer();
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await this.response.arrayBuffer());
  }

  text(): Promise<string> {
    return this.response.text();
  }

  json<T>(): Promise<T>;
  async json(): Promise<unknown> {
    const parsed: unknown = JSON.parse(await this.response.text());
    return parsed;
  }

  blob(): Promise<Blob> {
    return this.response.blob();
  }
}

function byteSlice(bytes: Bytes, range: R2Range): Bytes {
  const start = 'suffix' in range ? Math.max(0, bytes.length - range.suffix) : (range.offset ?? 0);
  if (start >= bytes.length) throw new Error(R2_UNSATISFIABLE_RANGE_ERROR);
  const end = 'suffix' in range || range.length === undefined ? bytes.length : Math.min(bytes.length, start + range.length);
  return bytes.slice(start, end);
}

function matchesIfNoneMatch(onlyIf: R2Conditional | Headers | undefined, object: R2Object): boolean {
  return onlyIf instanceof Headers && onlyIf.get('If-None-Match') === object.httpEtag;
}

async function bytesOf(value: R2Value): Promise<Bytes> {
  if (value === null) return new Uint8Array();
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  return new Uint8Array(await new Response(value).arrayBuffer());
}

function contentTypeOf(options: R2PutOptions | undefined): string {
  const metadata = options?.httpMetadata;
  if (metadata instanceof Headers) return metadata.get('Content-Type') ?? '';
  return metadata?.contentType ?? '';
}

export class InMemoryR2Bucket implements R2Bucket {
  readonly files = new Map<string, R2File>();

  constructor(files: R2File[] = []) {
    for (const file of files) this.files.set(file.key, file);
  }

  async head(key: string): Promise<R2Object | null> {
    const file = this.files.get(key);
    return file ? new StoredR2Object(file) : null;
  }

  get(key: string, options: R2GetOptions & { onlyIf: R2Conditional | Headers }): Promise<R2ObjectBody | R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null> {
    const file = this.files.get(key);
    if (!file) return null;
    const object = new StoredR2Object(file);
    if (matchesIfNoneMatch(options?.onlyIf, object)) return object;
    const range = options?.range;
    if (range instanceof Headers) throw new Error('InMemoryR2Bucket reads a parsed range, not Range headers');
    return range ? new StoredR2ObjectBody(file, byteSlice(file.bytes, range), range) : new StoredR2ObjectBody(file, file.bytes);
  }

  put(key: string, value: R2Value, options?: R2PutOptions & { onlyIf: R2Conditional | Headers }): Promise<R2Object | null>;
  put(key: string, value: R2Value, options?: R2PutOptions): Promise<R2Object>;
  async put(key: string, value: R2Value, options?: R2PutOptions): Promise<R2Object> {
    const file = { key, bytes: await bytesOf(value), contentType: contentTypeOf(options), etag: `etag-${this.files.size + 1}` };
    this.files.set(key, file);
    return new StoredR2Object(file);
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of typeof keys === 'string' ? [keys] : keys) this.files.delete(key);
  }

  async list(): Promise<R2Objects> {
    return { objects: [...this.files.values()].map((file) => new StoredR2Object(file)), delimitedPrefixes: [], truncated: false };
  }

  createMultipartUpload(): Promise<R2MultipartUpload> {
    throw new Error('InMemoryR2Bucket has no multipart uploads: the API never starts one');
  }

  resumeMultipartUpload(): R2MultipartUpload {
    throw new Error('InMemoryR2Bucket has no multipart uploads: the API never resumes one');
  }
}
