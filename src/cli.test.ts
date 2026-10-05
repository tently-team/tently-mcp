import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isEntryPoint, resolveInitOptions } from './cli.js';

describe('isEntryPoint', () => {
  it('matches the bin through the symlink npm installs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tently-cli-'));
    const real = join(dir, 'cli.js');
    writeFileSync(real, '');
    const link = join(dir, 'tently');
    symlinkSync(real, link);
    expect(isEntryPoint(pathToFileURL(real).href, link)).toBe(true);
    expect(isEntryPoint(pathToFileURL(real).href, real)).toBe(true);
  });

  it('is false when imported from elsewhere', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tently-cli-'));
    const real = join(dir, 'cli.js');
    writeFileSync(real, '');
    expect(isEntryPoint(pathToFileURL(real).href, join(dir, 'other.js'))).toBe(false);
    expect(isEntryPoint(pathToFileURL(real).href, undefined)).toBe(false);
  });
});

describe('resolveInitOptions', () => {
  it('falls back to TENTLY_API_KEY and TENTLY_API_URL', () => {
    expect(
      resolveInitOptions({}, { TENTLY_API_KEY: 'k', TENTLY_API_URL: 'https://api.example' }),
    ).toEqual({ apiKey: 'k', apiUrl: 'https://api.example' });
  });

  it('prefers flags over the environment', () => {
    expect(resolveInitOptions({ apiKey: 'flag' }, { TENTLY_API_KEY: 'env' }).apiKey).toBe('flag');
  });

  it('ignores empty env values', () => {
    expect(resolveInitOptions({}, { TENTLY_API_KEY: '' })).toEqual({
      apiKey: undefined,
      apiUrl: undefined,
    });
  });
});
