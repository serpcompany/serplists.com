// Private preload for the sanitizer wrapper. Wrangler's installed remote
// exporter calls fs.promises.writeFile(output, response.body). Route only that
// exact output to the inherited allocation; reopening /dev/fd is neither
// portable across sandboxes nor necessary. No decoding/re-encoding of bytes.
import fs from 'node:fs';

const outputToken = '/dev/fd/3';
const originalWrite = fs.promises.writeFile;
fs.promises.writeFile = async (file, data, ...options) => {
  if (file !== outputToken) return originalWrite(file, data, ...options);
  if (!fs.fstatSync(3).isFile()) throw new Error('Missing owned export descriptor.');
  const chunks = typeof data === 'string' || ArrayBuffer.isView(data) ? [data] : data;
  for await (const chunk of chunks) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    if (!ArrayBuffer.isView(bytes)) throw new Error('Invalid export stream chunk.');
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = fs.writeSync(3, bytes, offset, bytes.byteLength - offset);
      if (written === 0) throw new Error('Incomplete export write.');
      offset += written;
    }
  }
  fs.fsyncSync(3);
};
