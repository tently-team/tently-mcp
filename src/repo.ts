/**
 * Which GitHub repo the agent is working in, as an `owner/name` slug.
 *
 * `search_decisions` sends it so the API searches that repo's decisions instead
 * of the whole workspace. Without it, unscoped decisions mined from the
 * workspace's other repos crowd out the ones for the code being edited.
 */

import { execFile } from 'node:child_process';

/**
 * Extract `owner/name` from a git remote URL. Handles the shapes `git remote`
 * prints: `https://github.com/o/n(.git)`, `git@github.com:o/n(.git)` and
 * `ssh://git@github.com/o/n(.git)`. Returns null for anything else.
 */
export function parseRepoSlug(remoteUrl: string): string | null {
  const match = /[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  if (!match) return null;
  const [, owner, name] = match;
  if (!owner || !name || owner === '.' || name === '.') return null;
  return `${owner}/${name}`;
}

/**
 * Read the `origin` remote of the checkout at `cwd`. Resolves undefined when
 * it can't be read (not a git checkout, no `origin`, git missing): the search
 * then runs workspace-wide, as it did before.
 */
export function detectRepo(cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd, timeout: 5_000 }, (err, stdout) => {
      resolve(err ? undefined : (parseRepoSlug(stdout) ?? undefined));
    });
  });
}
