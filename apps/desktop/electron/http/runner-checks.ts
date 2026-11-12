/**
 * Collection runner checks: declarative assertions on a response and captures of a
 * JSON value into a run-only variable. No scripting and no eval; JSON paths use a
 * small dot/bracket resolver. Captured values live only in memory for one run.
 */

import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

export const ASSERTION_TYPES = [
  'status-equals',
  'status-range',
  'header-exists',
  'header-equals',
  'json-equals',
  'json-exists',
  'json-contains',
  'time-below',
] as const;
export type AssertionType = (typeof ASSERTION_TYPES)[number];

export const assertionSchema = z.object({
  id: z.string().max(64),
  enabled: z.boolean(),
  type: z.enum(ASSERTION_TYPES),
  /** Header name or JSON path; unused for status and time. */
  target: z.string().max(1024),
  /** Expected value: status list ("200,201"), range ("200-299"), text/JSON, or milliseconds. */
  value: z.string().max(10000),
});
export type Assertion = z.infer<typeof assertionSchema>;

export const captureSchema = z.object({
  id: z.string().max(64),
  enabled: z.boolean(),
  variable: z.string().max(255),
  path: z.string().max(1024),
});
export type Capture = z.infer<typeof captureSchema>;

export const MAX_CHECKS = 100;

function parseList<T>(json: string | null | undefined, schema: z.ZodType<T>): T[] {
  try {
    const items = JSON.parse(json || '[]') as unknown;
    if (!Array.isArray(items)) return [];
    return items.slice(0, MAX_CHECKS).flatMap((item) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

/** Stored JSON → valid entries only (an invalid entry is dropped, never thrown). */
export const parseAssertions = (json: string | null | undefined) => parseList(json, assertionSchema);
export const parseCaptures = (json: string | null | undefined) => parseList(json, captureSchema);

const MAX_PATH_SEGMENTS = 64;

/**
 * `$.items[0].name`, `items[0]["odd key"]`, `data.0.id` → segments, or null when malformed.
 * A leading `$` is optional.
 */
export function parseJsonPath(path: string): Array<string | number> | null {
  let rest = path.trim();
  if (rest.startsWith('$')) rest = rest.slice(1);
  const segments: Array<string | number> = [];
  while (rest) {
    let match: RegExpExecArray | null;
    // The dot is optional only before the first segment (`items.0` and `$.items` both work).
    const dotted = segments.length === 0 ? /^\.?([A-Za-z_$][\w$-]*|\d+)/ : /^\.([A-Za-z_$][\w$-]*|\d+)/;
    if ((match = dotted.exec(rest))) {
      segments.push(/^\d+$/.test(match[1]) ? Number(match[1]) : match[1]);
    } else if ((match = /^\[(\d+)\]/.exec(rest))) {
      segments.push(Number(match[1]));
    } else if ((match = /^\[("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/.exec(rest))) {
      segments.push(match[1].slice(1, -1).replace(/\\(.)/g, '$1'));
    } else {
      return null;
    }
    rest = rest.slice(match[0].length);
    if (segments.length > MAX_PATH_SEGMENTS) return null;
  }
  return segments;
}

/** Own properties only, so `constructor` or `__proto__` never reach the prototype. */
export function resolveJsonPath(root: unknown, path: string): { found: boolean; value?: unknown } {
  const segments = parseJsonPath(path);
  if (!segments) return { found: false };
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current) && typeof segment === 'number') {
      if (segment >= current.length) return { found: false };
      current = current[segment];
    } else if (current && typeof current === 'object' && !Array.isArray(current)) {
      const key = String(segment);
      if (!Object.prototype.hasOwnProperty.call(current, key)) return { found: false };
      current = (current as Record<string, unknown>)[key];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

export interface CheckedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  time: number;
}

export interface AssertionResult {
  id: string;
  type: AssertionType;
  target: string;
  expected: string;
  passed: boolean;
  /** Short display text of what was found; not logged and not persisted. */
  actual?: string;
}

const MAX_ACTUAL_CHARS = 200;
const display = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return text.length > MAX_ACTUAL_CHARS ? `${text.slice(0, MAX_ACTUAL_CHARS)}…` : text;
};

/** Expected text as JSON when it parses (`42`, `true`, `"x"`, `{...}`), else as a plain string. */
function expectedValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function valueEquals(actual: unknown, expectedText: string): boolean {
  if (isDeepStrictEqual(actual, expectedValue(expectedText))) return true;
  // `abc` (no quotes) against the string "abc", `42` against the string "42".
  return (typeof actual === 'string' || typeof actual === 'number' || typeof actual === 'boolean') &&
    String(actual) === expectedText.trim();
}

export function evaluateAssertions(assertions: Assertion[], response: CheckedResponse): AssertionResult[] {
  let parsed: { ok: boolean; value?: unknown } | undefined;
  const json = () => {
    if (!parsed) {
      try {
        parsed = { ok: true, value: JSON.parse(response.body) };
      } catch {
        parsed = { ok: false };
      }
    }
    return parsed;
  };
  const header = (name: string) => {
    const lower = name.trim().toLowerCase();
    const key = Object.keys(response.headers).find((item) => item.toLowerCase() === lower);
    return key === undefined ? undefined : response.headers[key];
  };

  return assertions
    .filter((assertion) => assertion.enabled)
    .map((assertion) => {
      const result = (passed: boolean, actual?: unknown): AssertionResult => ({
        id: assertion.id,
        type: assertion.type,
        target: assertion.target,
        expected: assertion.value,
        passed,
        ...(actual !== undefined && { actual: display(actual) }),
      });
      switch (assertion.type) {
        case 'status-equals': {
          const allowed = assertion.value.split(',').map((item) => Number(item.trim()));
          return result(allowed.includes(response.status), response.status);
        }
        case 'status-range': {
          const match = /^\s*(\d{3})\s*-\s*(\d{3})\s*$/.exec(assertion.value);
          return result(
            !!match && response.status >= Number(match[1]) && response.status <= Number(match[2]),
            response.status
          );
        }
        case 'header-exists':
          return result(header(assertion.target) !== undefined);
        case 'header-equals': {
          const value = header(assertion.target);
          return result(value !== undefined && value === assertion.value, value);
        }
        case 'time-below': {
          const limit = Number(assertion.value);
          return result(Number.isFinite(limit) && response.time < limit, response.time);
        }
        case 'json-exists':
        case 'json-equals':
        case 'json-contains': {
          const body = json();
          const found = body.ok ? resolveJsonPath(body.value, assertion.target) : { found: false };
          if (assertion.type === 'json-exists') return result(found.found);
          if (!found.found) return result(false);
          if (assertion.type === 'json-equals') return result(valueEquals(found.value, assertion.value), found.value);
          const value = found.value;
          const contains =
            typeof value === 'string'
              ? value.includes(assertion.value)
              : Array.isArray(value) && value.some((item) => valueEquals(item, assertion.value));
          return result(contains, value);
        }
      }
    });
}

export const MAX_CAPTURED_VALUE_CHARS = 64 * 1024;

/**
 * Captured values for the next requests of the same run. A path that is not found
 * (or a non-JSON body) captures nothing, so a later request reports the variable as missing.
 */
export function applyCaptures(captures: Capture[], body: string, into: Record<string, string>): string[] {
  // A null-prototype map, so a variable named __proto__ is just a key.
  if (Object.getPrototypeOf(into) !== null) throw new Error('Captures need a null-prototype map');
  const enabled = captures.filter((capture) => capture.enabled && capture.variable.trim());
  if (enabled.length === 0) return [];
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    return [];
  }
  const captured: string[] = [];
  for (const capture of enabled) {
    const found = resolveJsonPath(root, capture.path);
    if (!found.found || found.value === undefined) continue;
    const text = typeof found.value === 'string' ? found.value : JSON.stringify(found.value);
    if (text.length > MAX_CAPTURED_VALUE_CHARS) continue;
    into[capture.variable.trim()] = text;
    captured.push(capture.variable.trim());
  }
  return captured;
}
