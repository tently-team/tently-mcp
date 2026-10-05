/**
 * HTTP client for the Tently decision store, over the public API, authenticated with a
 * workspace API key. It fails *soft* (returns a structured error rather than throwing) so
 * the coding agent stays usable when the API is unreachable or the key is missing.
 *
 * Contract — `POST {apiUrl}{SEARCH_DECISIONS_PATH}`
 *   headers: `authorization: Bearer <apiKey>`, `content-type: application/json`
 *   body:    { query: string, paths?: string[], limit?: number }
 *   200:     { decisions: Decision[], total?: number }
 *   4xx/5xx: any body; treated as a soft failure.
 */

import type { Decision } from './types.js';
import { normalizeApiUrl } from './config.js';

/** Endpoint path, kept as a constant so the contract lives in one place. */
export const SEARCH_DECISIONS_PATH = '/v1/decisions/search';

/** What the caller asks for. Mirrors the validated tool input. */
export interface SearchDecisionsInput {
  query: string;
  /** Optional path globs to bias/scope retrieval to the area being edited. */
  paths?: string[];
  /** Max hits to return. */
  limit?: number;
}

export interface SearchClientOptions {
  apiUrl: string;
  apiKey?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout (ms). Defaults to 10s. */
  timeoutMs?: number;
}

/** A decision the search returned. The API owns the full shape. */
export type DecisionHit = Decision;

export type SearchDecisionsResult =
  | { ok: true; decisions: DecisionHit[]; total: number }
  | { ok: false; status: number | null; message: string };

/**
 * Query the decision store. Never throws for expected failure modes (missing
 * key, non-200, network error, unparseable body) — those come back as
 * `{ ok: false }` so the tool handler can render a helpful message instead of
 * crashing the agent's turn.
 */
export async function searchDecisions(
  input: SearchDecisionsInput,
  opts: SearchClientOptions,
): Promise<SearchDecisionsResult> {
  if (!opts.apiKey) {
    return {
      ok: false,
      status: null,
      message:
        'No TENTLY_API_KEY configured. Run `tently init --api-key <key>` or set the env var so decisions can be retrieved.',
    };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const url = `${normalizeApiUrl(opts.apiUrl)}${SEARCH_DECISIONS_PATH}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        query: input.query,
        ...(input.paths?.length ? { paths: input.paths } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await safeReadText(res);
      return {
        ok: false,
        status: res.status,
        message: `Tently API returned ${res.status}${detail ? `: ${detail}` : ''}`,
      };
    }

    const body = (await res.json()) as unknown;
    return normalizeBody(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, message: `Could not reach Tently API: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Accept either `{ decisions: [...] }` or a bare array, for contract slack. */
function normalizeBody(body: unknown): SearchDecisionsResult {
  if (Array.isArray(body)) {
    return { ok: true, decisions: body as DecisionHit[], total: body.length };
  }
  if (
    body &&
    typeof body === 'object' &&
    Array.isArray((body as { decisions?: unknown }).decisions)
  ) {
    const decisions = (body as { decisions: DecisionHit[] }).decisions;
    const total = (body as { total?: number }).total;
    return { ok: true, decisions, total: typeof total === 'number' ? total : decisions.length };
  }
  return {
    ok: false,
    status: 200,
    message: 'Tently API returned an unexpected body (no `decisions` array).',
  };
}

async function safeReadText(res: { text(): Promise<string> }): Promise<string> {
  try {
    const t = (await res.text()).trim();
    return t.length > 300 ? `${t.slice(0, 300)}…` : t;
  } catch {
    return '';
  }
}
