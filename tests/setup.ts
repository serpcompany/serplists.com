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
  onload: ((event: { target: { result: string } }) => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;

  readAsText(blob: Blob) {
    if (!(blob instanceof Blob)) return;
    blob.arrayBuffer().then((buffer) => {
      const text = new TextDecoder().decode(buffer);
      this.result = text;
      const { onload } = this;
      if (onload) {
        setTimeout(() => {
          onload.call(this, { target: { result: text } });
        }, 0);
      }
    }).catch(() => {
      const { onerror } = this;
      if (onerror) {
        setTimeout(() => {
          onerror.call(this);
        }, 0);
      }
    });
  }
}

if (typeof FileReader === 'undefined') {
  Object.assign(globalThis, { FileReader: TextOnlyFileReader });
}
