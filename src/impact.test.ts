import { describe, expect, it } from 'vitest';
import { LocalImpactZone, type SdkGraph, type SdkStatic } from './impact.js';

const node = (id: string, name: string, filePath = 'src/a.ts', kind = 'function') => ({
  id,
  name,
  kind,
  filePath,
  startLine: 1,
  endLine: 2,
});

function fakeSdk(graph: Partial<SdkGraph>, initialized = false) {
  const calls: string[] = [];
  const full: SdkGraph = {
    indexAll: async () => {
      calls.push('indexAll');
    },
    getNode: () => null,
    getNodesByName: () => [],
    getCallers: () => [],
    getCallees: () => [],
    ...graph,
  };
  const sdk: SdkStatic = {
    isInitialized: () => initialized,
    init: async () => {
      calls.push('init');
      return full;
    },
    recreate: async () => {
      calls.push('recreate');
      return full;
    },
  };
  return { sdk, calls };
}

describe('LocalImpactZone', () => {
  it('indexes once and returns callers with depth', async () => {
    const { sdk, calls } = fakeSdk({
      getNodesByName: () => [node('t', 'target')],
      getCallers: (id) =>
        id === 't'
          ? [{ node: node('c1', 'caller', 'src/b.ts'), edge: { kind: 'calls' } }]
          : [{ node: node('c2', 'outer', 'src/c.ts'), edge: { kind: 'calls' } }],
    });
    const zone = new LocalImpactZone({ cwd: '/repo', loadSdk: () => sdk });

    const result = await zone.run({ symbol: 'target', maxDepth: 2 });
    await zone.run({ symbol: 'target' });

    expect(calls).toEqual(['init', 'indexAll']);
    expect(result.target.name).toBe('target');
    expect(result.impacted.map((i) => [i.symbol.name, i.depth, i.relationType])).toEqual([
      ['caller', 1, 'CALLS'],
      ['outer', 2, 'CALLS'],
    ]);
    expect(result.risk).toBe('MEDIUM');
    expect(result.epistemic).toBe('APPROXIMATE');
  });

  it('recreates a warm index instead of reusing it', async () => {
    const { sdk, calls } = fakeSdk({ getNodesByName: () => [node('t', 'target')] }, true);
    await new LocalImpactZone({ cwd: '/repo', loadSdk: () => sdk }).run({ symbol: 'target' });
    expect(calls).toEqual(['recreate', 'indexAll']);
  });

  it('prefers the symbol in the given file', async () => {
    const { sdk } = fakeSdk({
      getNodesByName: () => [node('a', 'dup', 'src/a.ts'), node('b', 'dup', 'src/b.ts')],
    });
    const result = await new LocalImpactZone({ cwd: '/repo', loadSdk: () => sdk }).run({
      symbol: 'dup',
      file: 'src/b.ts',
    });
    expect(result.target.uid).toBe('b');
  });

  it('throws a clear error for an unknown symbol', async () => {
    const { sdk } = fakeSdk({});
    await expect(
      new LocalImpactZone({ cwd: '/repo', loadSdk: () => sdk }).run({ symbol: 'nope' }),
    ).rejects.toThrow(/nope not found/);
  });
});
