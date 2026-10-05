import { describe, expect, it, vi } from 'vitest';
import { SEARCH_DECISIONS_PATH, searchDecisions } from './search-client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const opts = (fetchImpl: typeof fetch) => ({
  apiUrl: 'https://api.example.test',
  apiKey: 'k_test',
  fetchImpl,
});

describe('searchDecisions', () => {
  it('fails soft with no API key and never calls fetch', async () => {
    const fetchImpl = vi.fn();
    const res = await searchDecisions(
      { query: 'x' },
      { apiUrl: 'https://api.example.test', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/TENTLY_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs to the documented endpoint with auth and body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ decisions: [], total: 0 }));
    await searchDecisions(
      { query: 'add a repo method', paths: ['packages/db/**'], limit: 5 },
      opts(fetchImpl as unknown as typeof fetch),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.example.test${SEARCH_DECISIONS_PATH}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k_test');
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'add a repo method',
      paths: ['packages/db/**'],
      limit: 5,
    });
  });

  it('returns decisions from a { decisions } body', async () => {
    const decisions = [{ id: 'd1', title: 'api must not import db' }];
    const fetchImpl = vi.fn(async () => jsonResponse({ decisions, total: 1 }));
    const res = await searchDecisions({ query: 'x' }, opts(fetchImpl as unknown as typeof fetch));
    expect(res).toEqual({ ok: true, decisions, total: 1 });
  });

  it('accepts a bare array body', async () => {
    const decisions = [{ id: 'd1' }, { id: 'd2' }];
    const fetchImpl = vi.fn(async () => jsonResponse(decisions));
    const res = await searchDecisions({ query: 'x' }, opts(fetchImpl as unknown as typeof fetch));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.total).toBe(2);
  });

  it('fails soft on a non-200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'nope' }, 503));
    const res = await searchDecisions({ query: 'x' }, opts(fetchImpl as unknown as typeof fetch));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(503);
      expect(res.message).toMatch(/503/);
    }
  });

  it('fails soft on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const res = await searchDecisions({ query: 'x' }, opts(fetchImpl as unknown as typeof fetch));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBeNull();
      expect(res.message).toMatch(/ECONNREFUSED/);
    }
  });

  it('fails soft on an unexpected body shape', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nope: true }));
    const res = await searchDecisions({ query: 'x' }, opts(fetchImpl as unknown as typeof fetch));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/unexpected body/);
  });
});
