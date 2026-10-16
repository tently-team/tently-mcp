import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectRepos, parseRepoSlug } from './repo.js';

describe('parseRepoSlug', () => {
  it.each([
    ['https://github.com/tently-team/tently-mcp.git', 'tently-team/tently-mcp'],
    ['https://github.com/tently-team/tently-mcp', 'tently-team/tently-mcp'],
    ['https://github.com/tently-team/tently-mcp/', 'tently-team/tently-mcp'],
    ['https://token@github.com/tently-team/tently-mcp.git', 'tently-team/tently-mcp'],
    ['git@github.com:tently-team/tently-mcp.git', 'tently-team/tently-mcp'],
    ['ssh://git@github.com/tently-team/tently-mcp.git', 'tently-team/tently-mcp'],
    ['https://github.com/acme/my.repo.js.git\n', 'acme/my.repo.js'],
    ['acme/api', 'acme/api'],
    ['  acme/api  ', 'acme/api'],
  ])('%s → %s', (value, slug) => {
    expect(parseRepoSlug(value)).toBe(slug);
  });

  it.each([
    [''],
    ['not a url'],
    ['https://gitlab.com/group/sub/repo.git'],
    ['git@gitlab.com:acme/api.git'],
    ['https://example.com/acme/api'],
    ['https://github.com/acme'],
    ['/home/me/src/acme/api'],
  ])('returns null for %j', (value) => {
    expect(parseRepoSlug(value)).toBeNull();
  });
});

describe('detectRepos', () => {
  function checkout(remotes: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'tently-repo-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    for (const [name, url] of Object.entries(remotes)) {
      execFileSync('git', ['remote', 'add', name, url], { cwd: dir });
    }
    return dir;
  }

  it('is empty outside a git checkout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tently-repo-'));
    await expect(detectRepos(dir)).resolves.toEqual([]);
  });

  it('reads origin', async () => {
    const dir = checkout({ origin: 'git@github.com:acme/api.git' });
    await expect(detectRepos(dir)).resolves.toEqual(['acme/api']);
  });

  it('lists origin before upstream, so the API can take the first connected one', async () => {
    const dir = checkout({
      origin: 'https://github.com/me/api.git',
      upstream: 'https://github.com/acme/api.git',
    });
    await expect(detectRepos(dir)).resolves.toEqual(['me/api', 'acme/api']);
  });

  it('lists a repo once when origin and upstream agree', async () => {
    const dir = checkout({
      origin: 'git@github.com:acme/api.git',
      upstream: 'https://github.com/acme/api',
    });
    await expect(detectRepos(dir)).resolves.toEqual(['acme/api']);
  });

  it('skips a non-GitHub remote', async () => {
    const dir = checkout({ origin: 'https://gitlab.com/group/sub/api.git' });
    await expect(detectRepos(dir)).resolves.toEqual([]);
  });
});
