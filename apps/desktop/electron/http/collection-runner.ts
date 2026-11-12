/**
 * Collection runner: runs every saved request of a folder (subfolders first, in sidebar
 * order) one after another through the injected normal send path, evaluates its
 * declarative assertions and applies its captures. Captured values exist only in
 * memory for this run and are never logged; results are not persisted.
 */

import type { ApiRequestsTable, Database } from '@ownshell/core';
import type { Kysely } from 'kysely';
import { publicAuthConfig } from './oauth';
import {
  applyCaptures,
  evaluateAssertions,
  parseAssertions,
  parseCaptures,
  type AssertionResult,
} from './runner-checks';
import type { HttpRequestConfig, HttpResponse } from './types';

export const MAX_RUN_REQUESTS = 500;

export interface RunRequestResult {
  requestId: string;
  name: string;
  method: string;
  status: number;
  time: number;
  /** Failure before a response (see ApiRequestErrorCode); `errorMessage` is the plain text. */
  errorCode?: string;
  errorDetail?: string;
  errorScopes?: string[];
  errorMessage?: string;
  assertions: AssertionResult[];
  /** Names of the variables this response set for later requests (never values). */
  captured: string[];
  passed: boolean;
  skipped?: 'websocket';
}

export interface RunSummary {
  results: RunRequestResult[];
  totalMs: number;
  cancelled: boolean;
  /** More requests than MAX_RUN_REQUESTS: the rest was not run. */
  truncated: boolean;
}

/** Saved requests of a folder tree, subfolders first, both in sidebar order. */
export async function collectRunRequests(db: Kysely<Database>, collectionId: string): Promise<ApiRequestsTable[]> {
  const [collections, requests] = await Promise.all([
    db.selectFrom('api_collections').select(['id', 'parent_id', 'sort_order', 'created_at']).execute(),
    db.selectFrom('api_requests').selectAll().execute(),
  ]);
  const order = <T extends { sort_order: number; created_at: number; id: string }>(a: T, b: T) =>
    a.sort_order - b.sort_order || a.created_at - b.created_at || a.id.localeCompare(b.id);
  const result: ApiRequestsTable[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const child of collections.filter((item) => item.parent_id === id).sort(order)) visit(child.id);
    result.push(...requests.filter((request) => request.collection_id === id).sort(order));
  };
  visit(collectionId);
  return result;
}

export function requestConfig(request: ApiRequestsTable): HttpRequestConfig {
  return {
    method: request.method,
    url: request.url,
    params: request.params,
    headers: request.headers,
    body: request.body,
    bodyType: request.body_type,
    rawContentType: request.raw_content_type,
    authType: request.auth_type,
    // Like the renderer sends it; the main process reveals the stored client secret itself.
    authConfig: publicAuthConfig(request.auth_type, request.auth_config),
    collectionId: request.collection_id,
    requestId: request.id,
    variables: request.variables,
    networkHostId: request.network_host_id,
    environmentId: request.environment_id,
    timeoutSeconds: request.timeout_seconds ?? undefined,
    followRedirects: request.follow_redirects !== 0,
    verifyTls: request.verify_tls !== 0,
    useCookieJar: request.cookie_jar !== 0,
  };
}

/** Runs the requests in order; `send` is the normal send path (injected for tests). */
export async function runRequests(
  requests: ApiRequestsTable[],
  options: {
    stopOnFailure: boolean;
    signal: AbortSignal;
    send: (config: HttpRequestConfig, runtimeVariables: Record<string, string>) => Promise<HttpResponse>;
    onResult?: (result: RunRequestResult) => void;
  }
): Promise<RunSummary> {
  const started = performance.now();
  // Null prototype: a captured name like __proto__ stays an ordinary key.
  const runtime: Record<string, string> = Object.create(null);
  const results: RunRequestResult[] = [];
  for (const request of requests.slice(0, MAX_RUN_REQUESTS)) {
    if (options.signal.aborted) break;
    const base = { requestId: request.id, name: request.name, method: request.method };
    let result: RunRequestResult;
    if (request.kind === 'websocket') {
      result = { ...base, status: 0, time: 0, assertions: [], captured: [], passed: true, skipped: 'websocket' };
    } else {
      const response = await options.send(requestConfig(request), runtime);
      if (response.errorCode === 'CANCELLED' || options.signal.aborted) break;
      const failed = response.status === 0;
      const assertions = failed
        ? []
        : evaluateAssertions(parseAssertions(request.assertions), {
            status: response.status,
            headers: response.headers,
            body: response.body,
            time: response.time,
          });
      result = {
        ...base,
        status: response.status,
        time: response.time,
        ...(failed && {
          errorCode: response.errorCode,
          errorDetail: response.errorDetail,
          errorScopes: response.errorScopes,
          errorMessage: errorText(response.body),
        }),
        assertions,
        captured: failed ? [] : applyCaptures(parseCaptures(request.captures), response.body, runtime),
        passed: !failed && assertions.every((assertion) => assertion.passed),
      };
    }
    results.push(result);
    options.onResult?.(result);
    if (!result.passed && options.stopOnFailure) break;
  }
  return {
    results,
    totalMs: Math.round(performance.now() - started),
    cancelled: options.signal.aborted,
    truncated: requests.length > MAX_RUN_REQUESTS,
  };
}

/** Failed sends carry `{ "error": message }` as body (see handleExecuteRequest). */
function errorText(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}
