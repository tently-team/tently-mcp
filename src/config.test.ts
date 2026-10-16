import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig repo', () => {
  it.each([
    ['acme/api', 'acme/api'],
    [' acme/api\n', 'acme/api'],
    ['https://github.com/acme/api.git', 'acme/api'],
  ])('normalizes TENTLY_REPO %j to %s', (value, slug) => {
    expect(loadConfig({ TENTLY_REPO: value }).repo).toBe(slug);
  });

  it.each([['acme'], ['https://gitlab.com/g/sub/api'], ['']])(
    'drops an unusable TENTLY_REPO %j so the repo is detected instead',
    (value) => {
      expect(loadConfig({ TENTLY_REPO: value }).repo).toBeUndefined();
    },
  );

  it('leaves repo unset when TENTLY_REPO is absent', () => {
    expect(loadConfig({}).repo).toBeUndefined();
  });
});
