/**
 * Which GitHub repo the agent is working in, as an `owner/name` slug.
 *
 * `search_decisions` sends it so the API searches that repo's decisions instead
 * of the whole workspace. Without it, unscoped decisions mined from the
 * workspace's other repos crowd out the ones for the code being edited.
 */

import { execFile } from 'node:child_process';

const SEGMENT = '[A-Za-z0-9_.-]+';

/** `https://github.com/o/n`, `git@github.com:o/n`, `ssh://git@github.com/o/n`, optional `.git`. */
const GITHUB_REMOTE = new RegExp(
  `^(?:(?:https?|ssh|git)://(?:[^@/]+@)?github\\.com/|[^@/]+@github\\.com:)(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?/?$`,
  'i',
);

/** A bare `owner/name`, the form `TENTLY_REPO` usually takes. */
const BARE_SLUG = new RegExp(`^(${SEGMENT})/(${SEGMENT})$`);

/**
 * Extract `owner/name` from a github.com remote URL (https, `git@github.com:` or
 * `ssh://`) or a bare `owner/name`. Returns null for anything else, including
 * other hosts: Tently only knows GitHub repos, so a slug from elsewhere would
 * never match.
 */
export function parseRepoSlug(value: string): string | null {
  const trimmed = value.trim();
  const match = GITHUB_REMOTE.exec(trimmed) ?? BARE_SLUG.exec(trimmed);
  if (!match) return null;
  const [, owner, name] = match;
  if (!owner || !name || owner === '.' || name === '.' || name === '..') return null;
  return `${owner}/${name}`;
}

/** URL of the named remote at `cwd`, or undefined when git can't give one. */
function remoteUrl(cwd: string, remote: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', remote], { cwd, timeout: 5_000 }, (err, stdout) => {
      resolve(err ? undefined : stdout);
    });
  });
}

/**
 * The checkout's GitHub repos at `cwd`, as candidate slugs in preference order:
 * `origin`, then `upstream`. The API scopes the search to the first one
 * connected to the workspace, which covers both fork shapes: a contributor's
 * fork (origin is their copy, upstream is connected) and a team's fork of an
 * open-source project (origin is connected, upstream is not). Empty when
 * neither gives a GitHub slug (not a git checkout, git missing, another host);
 * the search then runs workspace-wide.
 */
export async function detectRepos(cwd: string): Promise<string[]> {
  const slugs: string[] = [];
  for (const remote of ['origin', 'upstream']) {
    const url = await remoteUrl(cwd, remote);
    const slug = url ? parseRepoSlug(url) : null;
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}
