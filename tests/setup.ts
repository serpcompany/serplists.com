import { forgetGitRepositoryOverrides } from '../scripts/lib/git-env';

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
