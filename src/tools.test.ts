import type { Decision } from './types.js';
import { describe, expect, it, vi } from 'vitest';
import type { ImpactZoneRunner } from './impact.js';
import type { SearchDecisionsResult } from './search-client.js';
import {
  type ToolContext,
  formatImpact,
  handleQueryImpactZone,
  handleSearchDecisions,
} from './tools.js';

function makeContext(over: Partial<ToolContext> = {}): ToolContext {
  return {
    searchDecisions: async () => ({ ok: true, decisions: [], total: 0 }),
    impactZone: { run: async () => impactFixture() } satisfies ImpactZoneRunner,
    ...over,
  };
}

function decisionFixture(): Decision {
  return {
    id: 'dec-1',
    title: 'api/ must not import db/ directly',
    tier: 'EXPLICIT',
    status: 'ACTIVE',
    enforcement: 'BLOCKING',
    rationale: 'Keep the layering clean.',
    scope: { includePaths: ['apps/api/**'], excludePaths: [], modules: [] },
    exemplars: [{ path: 'apps/api/src/routes/health.ts', note: 'clean' }],
  } as unknown as Decision;
}

function impactFixture() {
  return {
    target: {
      uid: 'Function:src/a.ts:openSession',
      name: 'openSession',
      kind: 'Function',
      filePath: 'src/a.ts',
    },
    direction: 'upstream' as const,
    impacted: [
      {
        symbol: {
          uid: 'Function:src/b.ts:caller',
          name: 'caller',
          kind: 'Function',
          filePath: 'src/b.ts',
        },
        depth: 1,
        relationType: 'CALLS',
        confidence: 0.9,
      },
    ],
    risk: 'MEDIUM' as const,
    epistemic: 'APPROXIMATE' as const,
    boundaries: ['dynamic dispatch not traced'],
  };
}

describe('handleSearchDecisions', () => {
  it('rejects invalid input (missing query)', async () => {
    const res = await handleSearchDecisions({}, makeContext());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/query/);
  });

  it('formats decisions on success', async () => {
    const res = await handleSearchDecisions(
      { query: 'importing db' },
      makeContext({
        searchDecisions: async () => ({ ok: true, decisions: [decisionFixture()], total: 1 }),
      }),
    );
    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toMatch(/api\/ must not import db/);
    expect(text).toMatch(/BLOCKING/);
    expect(text).toMatch(/apps\/api\/\*\*/);
    expect(text).toMatch(/dec-1/);
  });

  it('warns (not proof of safety) on empty results', async () => {
    const res = await handleSearchDecisions({ query: 'x' }, makeContext());
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/not proof/i);
  });

  it('surfaces a soft API failure as an error result', async () => {
    const failure: SearchDecisionsResult = { ok: false, status: 503, message: 'boom' };
    const res = await handleSearchDecisions(
      { query: 'x' },
      makeContext({ searchDecisions: async () => failure }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/boom/);
  });

  it('passes validated input through to the client', async () => {
    const spy = vi.fn(
      async (): Promise<SearchDecisionsResult> => ({ ok: true, decisions: [], total: 0 }),
    );
    await handleSearchDecisions(
      { query: 'q', paths: ['a/**'], limit: 3 },
      makeContext({ searchDecisions: spy }),
    );
    expect(spy).toHaveBeenCalledWith({ query: 'q', paths: ['a/**'], limit: 3 });
  });
});

describe('handleQueryImpactZone', () => {
  it('rejects invalid input (missing symbol)', async () => {
    const res = await handleQueryImpactZone({ file: 'x.ts' }, makeContext());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/symbol/);
  });

  it('formats the impact zone with the not-proof reminder', async () => {
    const res = await handleQueryImpactZone({ symbol: 'openSession' }, makeContext());
    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toMatch(/openSession/);
    expect(text).toMatch(/caller/);
    expect(text).toMatch(/dynamic dispatch not traced/);
    expect(text).toMatch(/evidence, not proof/i);
  });

  it('forwards symbol/file/direction to the runner', async () => {
    const run = vi.fn(async () => impactFixture());
    await handleQueryImpactZone(
      { symbol: 'foo', file: 'src/x.ts', direction: 'downstream', maxDepth: 2 },
      makeContext({ impactZone: { run } }),
    );
    expect(run).toHaveBeenCalledWith({
      symbol: 'foo',
      file: 'src/x.ts',
      direction: 'downstream',
      maxDepth: 2,
    });
  });

  it('turns a runner failure into an error result, not a throw', async () => {
    const res = await handleQueryImpactZone(
      { symbol: 'foo' },
      makeContext({
        impactZone: {
          run: async () => {
            throw new Error('symbol not found');
          },
        },
      }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/symbol not found/);
    expect(res.content[0].text).toMatch(/NOT evidence of safety/);
  });
});

describe('formatImpact', () => {
  it('handles an empty impact list without claiming safety', () => {
    const text = formatImpact({ ...impactFixture(), impacted: [] });
    expect(text).toMatch(/No impacted symbols/);
    expect(text).toMatch(/do NOT guarantee/);
  });
});
