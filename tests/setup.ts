// Test setup file
import { beforeAll, afterAll } from 'vitest';

// Mock localStorage for Node environment
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
};

// Polyfill FileReader for Node environment
if (typeof FileReader === 'undefined') {
  (global as any).FileReader = class FileReader {
    onload: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    result: string | null = null;

    readAsText(blob: Blob) {
      // For test purposes, handle File/Blob reading synchronously
      if (blob instanceof Blob) {
        // Convert blob to text
        const textDecoder = new TextDecoder();
        const fileReader = this;
        
        // Use a simple approach for test files
        blob.arrayBuffer().then(buffer => {
          const text = textDecoder.decode(buffer);
          fileReader.result = text;
          if (fileReader.onload) {
            setTimeout(() => {
              fileReader.onload!({ target: { result: text } });
            }, 0);
          }
        }).catch(() => {
          if (fileReader.onerror) {
            setTimeout(() => {
              fileReader.onerror!();
            }, 0);
          }
        });
      }
    }
  };
}