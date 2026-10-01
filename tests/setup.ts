import { forgetGitRepositoryOverrides } from '../scripts/lib/git-env.mjs';

forgetGitRepositoryOverrides();

const localStorageThatKeepsNothing = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
};

global.localStorage = localStorageThatKeepsNothing;

class TextOnlyFileReader {
  onload: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;

  readAsText(blob: Blob) {
    if (!(blob instanceof Blob)) return;
    blob.arrayBuffer().then((buffer) => {
      const text = new TextDecoder().decode(buffer);
      this.result = text;
      if (this.onload) {
        setTimeout(() => {
          this.onload!({ target: { result: text } });
        }, 0);
      }
    }).catch(() => {
      if (this.onerror) {
        setTimeout(() => {
          this.onerror!();
        }, 0);
      }
    });
  }
}

if (typeof FileReader === 'undefined') {
  (global as any).FileReader = TextOnlyFileReader;
}
