/**
 * Pure curl command parser for "Import curl".
 *
 * Produces the stored request shape (JSON strings like api_requests). Unknown
 * flags never fail the import; they are returned in `unsupported`.
 */

import type {
  HttpMethod,
  RawRequestContentType,
  RequestAuthType,
  RequestBodyType,
} from '@ownshell/core';

export type CurlParseErrorCode = 'NOT_CURL' | 'UNTERMINATED_QUOTE' | 'NO_URL' | 'MIXED_BODY';

export class CurlParseError extends Error {
  constructor(readonly code: CurlParseErrorCode) {
    super(code);
    this.name = 'CurlParseError';
  }
}

export interface CurlImport {
  method: HttpMethod;
  url: string;
  params: string;
  headers: string;
  body: string;
  bodyType: RequestBodyType;
  rawContentType: RawRequestContentType;
  authType: RequestAuthType;
  authConfig: string;
  /** null = keep the default. */
  timeoutSeconds: number | null;
  followRedirects: boolean | null;
  verifyTls: boolean | null;
  /** Flags that were ignored, as written. */
  unsupported: string[];
  /** File paths the user has to select again (picked-files allowlist). */
  files: string[];
}

const ANSI_ESCAPES: Record<string, string> = {
  n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v',
  '\\': '\\', "'": "'", '"': '"', '?': '?',
};

/** POSIX-ish shell words: quotes, backslash escapes, `\` line continuations and $'...'. */
export function tokenizeShell(input: string): string[] {
  const words: string[] = [];
  let word = '';
  let inWord = false;
  let i = 0;
  const fail = () => {
    throw new CurlParseError('UNTERMINATED_QUOTE');
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '\n') i += 2;
      else if (next === '\r' && input[i + 2] === '\n') i += 3;
      else if (next === undefined) i += 1;
      else {
        word += next;
        inWord = true;
        i += 2;
      }
    } else if (ch === "'") {
      const end = input.indexOf("'", i + 1);
      if (end < 0) fail();
      word += input.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (ch === '$' && input[i + 1] === "'") {
      i += 2;
      inWord = true;
      for (;;) {
        if (i >= input.length) fail();
        const c = input[i];
        if (c === "'") {
          i += 1;
          break;
        }
        if (c !== '\\') {
          word += c;
          i += 1;
          continue;
        }
        const e = input[i + 1];
        const hex = e === 'x' ? /^[0-9a-fA-F]{1,2}/.exec(input.slice(i + 2)) : null;
        const uni = e === 'u' ? /^[0-9a-fA-F]{1,4}/.exec(input.slice(i + 2)) : null;
        if (hex || uni) {
          const digits = (hex ?? uni)![0];
          word += String.fromCodePoint(parseInt(digits, 16));
          i += 2 + digits.length;
        } else if (e !== undefined && e in ANSI_ESCAPES) {
          word += ANSI_ESCAPES[e];
          i += 2;
        } else {
          word += c;
          i += 1;
        }
      }
    } else if (ch === '"') {
      i += 1;
      inWord = true;
      for (;;) {
        if (i >= input.length) fail();
        const c = input[i];
        if (c === '"') {
          i += 1;
          break;
        }
        if (c === '\\' && i + 1 < input.length && '$`"\\\n'.includes(input[i + 1])) {
          if (input[i + 1] !== '\n') word += input[i + 1];
          i += 2;
        } else {
          word += c;
          i += 1;
        }
      }
    } else if (/\s/.test(ch)) {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
      i += 1;
    } else {
      word += ch;
      inWord = true;
      i += 1;
    }
  }
  if (inWord) words.push(word);
  return words;
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const LONG_ALIASES: Record<string, string> = {
  '--request': '-X',
  '--header': '-H',
  '--user-agent': '-A',
  '--referer': '-e',
  '--user': '-u',
  '--cookie': '-b',
  '--data': '-d',
  '--data-ascii': '-d',
  '--form': '-F',
  '--get': '-G',
  '--head': '-I',
  '--insecure': '-k',
  '--location': '-L',
  '--max-time': '-m',
};
/** Short flags that take a value. */
const SHORT_WITH_VALUE = new Set(['X', 'H', 'A', 'e', 'u', 'b', 'd', 'F', 'm', 'o', 'x', 'U', 'E', 'w', 'T', 'c', 'K', 'r', 'z', 'C', 'Y', 'y', 'P', 'Q']);
/** Long flags that take a value (supported or not), so the value is not taken for the URL. */
const LONG_WITH_VALUE = new Set([
  '--request', '--header', '--user-agent', '--referer', '--user', '--cookie', '--data', '--data-ascii',
  '--data-raw', '--data-binary', '--data-urlencode', '--form', '--form-string', '--max-time', '--url',
  '--oauth2-bearer', '--max-redirs', '--output', '--proxy', '--proxy-user', '--cert', '--key', '--cacert',
  '--capath', '--resolve', '--connect-to', '--connect-timeout', '--write-out', '--upload-file',
  '--limit-rate', '--cookie-jar', '--config', '--retry', '--retry-delay', '--retry-max-time',
  '--interface', '--range', '--time-cond', '--cert-type', '--key-type', '--pass', '--ciphers',
  '--dns-servers', '--unix-socket', '--abstract-unix-socket', '--aws-sigv4', '--continue-at',
  '--speed-limit', '--speed-time', '--local-port', '--trace', '--trace-ascii', '--stderr',
  '--noproxy', '--preproxy', '--proxy-header', '--request-target', '--json',
]);
/** Accepted without effect (output/verbosity/transport details). */
const IGNORED = new Set([
  '--compressed', '-s', '--silent', '-S', '--show-error', '-v', '--verbose', '-i', '--include',
  '-f', '--fail', '--fail-with-body', '-g', '--globoff', '--http1.1', '--http2', '--http1.0',
  '--no-progress-meter', '-#', '--progress-bar', '-N', '--no-buffer', '--max-redirs', '--path-as-is',
  '--tr-encoding', '--no-keepalive', '-q', '--disable',
]);

function decodeComponent(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

function splitPairs(text: string): Array<{ key: string; value: string }> {
  return text
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq < 0
        ? { key: decodeComponent(pair), value: '' }
        : { key: decodeComponent(pair.slice(0, eq)), value: decodeComponent(pair.slice(eq + 1)) };
    });
}

const RAW_TYPES: Record<string, RawRequestContentType> = {
  'text/plain': 'text',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
};

export function parseCurl(command: string): CurlImport {
  const words = tokenizeShell(command.trim());
  if (words[0] !== 'curl') throw new CurlParseError('NOT_CURL');

  let method: HttpMethod | undefined;
  let url: string | undefined;
  const headers: Array<{ key: string; value: string }> = [];
  const data: string[] = [];
  let dataFile: string | undefined;
  const form: Array<{ key: string; value: string; type: 'text' | 'file' }> = [];
  let getMode = false;
  let head = false;
  let authType: RequestAuthType = 'none';
  let authConfig: Record<string, string> = {};
  let timeoutSeconds: number | null = null;
  let followRedirects: boolean | null = null;
  let verifyTls: boolean | null = null;
  const unsupported: string[] = [];
  const files: string[] = [];
  let json: string | undefined;
  let jsonMode = false;

  const handle = (flag: string, value: string | undefined): void => {
    const name = LONG_ALIASES[flag] ?? flag;
    const v = value ?? '';
    switch (name) {
      case '-X': {
        const upper = v.toUpperCase() as HttpMethod;
        if (METHODS.includes(upper)) method = upper;
        else unsupported.push(`-X ${v}`);
        break;
      }
      case '-H': {
        const colon = v.indexOf(':');
        // "Name;" sends an empty header; "Name:" removes one. Only real headers are kept.
        if (colon > 0) headers.push({ key: v.slice(0, colon).trim(), value: v.slice(colon + 1).trim() });
        else if (v.endsWith(';')) headers.push({ key: v.slice(0, -1).trim(), value: '' });
        break;
      }
      case '-A':
        headers.push({ key: 'User-Agent', value: v });
        break;
      case '-e':
        headers.push({ key: 'Referer', value: v });
        break;
      case '-b':
        if (v.includes('=')) headers.push({ key: 'Cookie', value: v });
        else unsupported.push(`${flag} ${v}`); // a cookie file
        break;
      case '-u': {
        const colon = v.indexOf(':');
        authType = 'basic';
        authConfig = colon < 0
          ? { username: v, password: '' }
          : { username: v.slice(0, colon), password: v.slice(colon + 1) };
        break;
      }
      case '--oauth2-bearer':
        authType = 'bearer';
        authConfig = { token: v };
        break;
      case '-d':
      case '--data-binary':
        if (v.startsWith('@')) {
          dataFile = v.slice(1);
          files.push(dataFile);
        } else data.push(v);
        break;
      case '--data-raw':
        data.push(v);
        break;
      case '--json':
        // The body model holds one file or one text, not ordered file+text fragments.
        if (v.startsWith('@')) {
          if (dataFile !== undefined || json !== undefined) throw new CurlParseError('MIXED_BODY');
          dataFile = v.slice(1);
          files.push(dataFile);
        } else {
          if (dataFile !== undefined) throw new CurlParseError('MIXED_BODY');
          json = (json ?? '') + v; // curl appends --json pieces without a separator
        }
        jsonMode = true;
        break;
      case '--data-urlencode': {
        const eq = v.indexOf('=');
        if (v.startsWith('@') || (eq < 0 && v.includes('@'))) unsupported.push(`${flag} ${v}`);
        else if (eq < 0) data.push(encodeURIComponent(v));
        else data.push(`${v.slice(0, eq)}${eq > 0 ? '=' : ''}${encodeURIComponent(v.slice(eq + 1))}`);
        break;
      }
      case '-F':
      case '--form-string': {
        const eq = v.indexOf('=');
        if (eq <= 0) {
          unsupported.push(`${flag} ${v}`);
          break;
        }
        const key = v.slice(0, eq);
        const fieldValue = v.slice(eq + 1);
        if (name === '-F' && fieldValue.startsWith('@')) {
          const filePath = fieldValue.slice(1).split(';')[0];
          form.push({ key, value: filePath, type: 'file' });
          files.push(filePath);
        } else if (name === '-F' && fieldValue.startsWith('<')) {
          unsupported.push(`${flag} ${v}`);
        } else {
          form.push({ key, value: name === '-F' ? fieldValue.split(';type=')[0] : fieldValue, type: 'text' });
        }
        break;
      }
      case '-G':
        getMode = true;
        break;
      case '-I':
        head = true;
        break;
      case '-k':
        verifyTls = false;
        break;
      case '-L':
        followRedirects = true;
        break;
      case '-m': {
        const seconds = Math.ceil(Number(v));
        if (Number.isFinite(seconds) && seconds > 0) timeoutSeconds = Math.min(600, Math.max(1, seconds));
        break;
      }
      case '--url':
        if (url === undefined) url = v;
        break;
      default:
        if (!IGNORED.has(flag)) unsupported.push(value === undefined ? flag : `${flag} ${value}`);
    }
  };

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (word.startsWith('--') && word.length > 2) {
      const eq = word.indexOf('=');
      if (eq > 0) handle(word.slice(0, eq), word.slice(eq + 1));
      else if (LONG_WITH_VALUE.has(word)) handle(word, words[++i]);
      else handle(word, undefined);
    } else if (word.startsWith('-') && word.length > 1) {
      // Combined short flags: -sSL, -XPOST, -HAccept:x
      for (let j = 1; j < word.length; j++) {
        const flag = `-${word[j]}`;
        if (SHORT_WITH_VALUE.has(word[j])) {
          handle(flag, j + 1 < word.length ? word.slice(j + 1) : words[++i]);
          break;
        }
        handle(flag, undefined);
      }
    } else if (url === undefined) {
      url = word;
    } else {
      unsupported.push(word);
    }
  }

  if (!url) throw new CurlParseError('NO_URL');
  if (json !== undefined) data.push(json);
  // --json sets both headers unless the command sets them itself.
  if (jsonMode) {
    for (const key of ['Content-Type', 'Accept']) {
      if (!headers.some((h) => h.key.toLowerCase() === key.toLowerCase())) {
        headers.push({ key, value: 'application/json' });
      }
    }
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith('{{')) url = `http://${url}`;

  const hash = url.indexOf('#');
  if (hash >= 0) url = url.slice(0, hash);
  const query = url.indexOf('?');
  const params = query >= 0 ? splitPairs(url.slice(query + 1)) : [];
  if (query >= 0) url = url.slice(0, query);

  const hasBody = data.length > 0 || form.length > 0 || dataFile !== undefined;
  if (getMode && data.length > 0) {
    params.push(...splitPairs(data.join('&')));
    data.length = 0;
  }

  // An Authorization: Bearer header becomes bearer auth, so it is not stored twice.
  const authHeader = headers.findIndex((h) => h.key.toLowerCase() === 'authorization');
  const bearer = authHeader >= 0 ? /^Bearer\s+(.+)$/i.exec(headers[authHeader].value) : null;
  if (bearer && authType === 'none') {
    authType = 'bearer';
    authConfig = { token: bearer[1] };
    headers.splice(authHeader, 1);
  }

  const contentTypeIndex = headers.findIndex((h) => h.key.toLowerCase() === 'content-type');
  const contentTypeValue = contentTypeIndex >= 0 ? headers[contentTypeIndex].value.trim().toLowerCase() : '';
  const contentType = contentTypeValue.split(';')[0].trim();
  // Dropped only when OwnShell sends exactly this value for the body type (no charset etc.).
  const dropContentType = () => {
    if (contentTypeIndex >= 0 && contentTypeValue === contentType) headers.splice(contentTypeIndex, 1);
  };

  let bodyType: RequestBodyType = 'none';
  let body = '';
  let rawContentType: RawRequestContentType = 'text';
  if (form.length > 0) {
    bodyType = 'form-data';
    body = JSON.stringify(form.map((item) => ({ ...item, enabled: true })));
    // The boundary is generated on send, so a pasted multipart Content-Type would not match.
    if (contentType.startsWith('multipart/') && contentTypeIndex >= 0) headers.splice(contentTypeIndex, 1);
  } else if (dataFile !== undefined && data.length === 0) {
    bodyType = 'binary';
    body = JSON.stringify({ path: dataFile, name: dataFile.split(/[\\/]/).pop() });
  } else if (data.length > 0) {
    const text = data.join('&');
    const looksJson = (() => {
      if (!/^\s*[[{]/.test(text)) return false;
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    })();
    if (contentType === 'application/json' || (!contentType && looksJson)) {
      bodyType = 'json';
      body = text;
      if (contentType) dropContentType();
    } else if (contentType in RAW_TYPES) {
      bodyType = 'raw';
      rawContentType = RAW_TYPES[contentType];
      body = text;
      // text/xml is kept: the xml raw type sends application/xml.
      if (contentType !== 'text/xml') dropContentType();
    } else if (contentType === 'application/x-www-form-urlencoded' || (!contentType && text.includes('='))) {
      bodyType = 'form-urlencoded';
      body = JSON.stringify(splitPairs(text).map((pair) => ({ ...pair, enabled: true })));
      if (contentType) dropContentType();
    } else {
      bodyType = 'raw';
      body = text;
    }
  }

  const toItems = (items: Array<{ key: string; value: string }>) =>
    JSON.stringify(items.map((item) => ({ key: item.key, value: item.value, enabled: true })));

  return {
    method: method ?? (head ? 'HEAD' : hasBody && !getMode ? 'POST' : 'GET'),
    url,
    params: toItems(params),
    headers: toItems(headers),
    body,
    bodyType,
    rawContentType,
    authType,
    authConfig: JSON.stringify(authConfig),
    timeoutSeconds,
    followRedirects,
    verifyTls,
    unsupported,
    files,
  };
}

/** True when pasted text should be imported instead of inserted as a URL. */
export function looksLikeCurl(text: string): boolean {
  return /^curl\s/.test(text.trimStart());
}
