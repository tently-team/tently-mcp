import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectRepo, parseRepoSlug } from './repo.js';

describe('parseRepoSlug', () => {
  it.each([
    ['https://github.com/tently-team/tently-mcp.git', 'tently-team/tently-mcp'],
    ['https://github.com/tently-team/tently-mcp', 'tently-team/tently-mcp'],
    ['https://github.com/tently-team/tently-mcp/', 'tently-team/tently-mcp'],
    ['git@github.com:tently-team/tently-mcp.git', 'tently-team/tently-mcp'],
    ['ssh://git@github.com/tently-team/tently-mcp.git', 'tently-team/tently-mcp'],
    ['https://github.com/acme/my.repo.js.git\n', 'acme/my.repo.js'],
  ])('%s → %s', (url, slug) => {
    expect(parseRepoSlug(url)).toBe(slug);
  });

  it('returns null for something that is not a remote URL', () => {
    expect(parseRepoSlug('')).toBeNull();
    expect(parseRepoSlug('not a url')).toBeNull();
  });
});

describe('detectRepo', () => {
  it('resolves undefined outside a git checkout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tently-repo-'));
    await expect(detectRepo(dir)).resolves.toBeUndefined();
  });
});
