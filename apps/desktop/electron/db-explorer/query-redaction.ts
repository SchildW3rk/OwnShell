const REDACTION = '[REDACTED]';
const MAX_HISTORY_QUERY_LENGTH = 20000;

const ASSIGNMENT_PATTERNS = [
  /\b(password|passwd|pwd|passphrase|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key)\b\s*=\s*'([^']|'')*'/gi,
  /\b(password|passwd|pwd|passphrase|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key)\b\s*=\s*"([^"]|"")*"/gi,
  /\b(password|passwd|pwd|passphrase|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key)\b\s*=\s*[^,\s;)]+/gi,
];

const CONNECTION_URI_PATTERN =
  /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/@]+:)([^@\s]+)(@)/gi;

const SQL_SECRET_CLAUSE_PATTERNS = [
  /\b(WITH\s+PASSWORD\s+)'([^']|'')*'/gi,
  /\b(WITH\s+PASSWORD\s+)"([^"]|"")*"/gi,
  /\b(IDENTIFIED\s+BY\s+)'([^']|'')*'/gi,
  /\b(IDENTIFIED\s+BY\s+)"([^"]|"")*"/gi,
];

const AUTH_HEADER_PATTERN =
  /\b(authorization\s*[:=]\s*)(bearer|basic)\s+[a-z0-9._~+/=-]+/gi;

const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redactQueryHistoryText(value: string): string {
  let redacted = value;

  for (const pattern of ASSIGNMENT_PATTERNS) {
    redacted = redacted.replace(pattern, (_match, key) => `${key}=${REDACTION}`);
  }

  for (const pattern of SQL_SECRET_CLAUSE_PATTERNS) {
    redacted = redacted.replace(pattern, (_match, prefix) => `${prefix}${REDACTION}`);
  }

  redacted = redacted
    .replace(CONNECTION_URI_PATTERN, `$1${REDACTION}$3`)
    .replace(AUTH_HEADER_PATTERN, `$1$2 ${REDACTION}`)
    .replace(PRIVATE_KEY_PATTERN, REDACTION);

  if (redacted.length > MAX_HISTORY_QUERY_LENGTH) {
    return `${redacted.slice(0, MAX_HISTORY_QUERY_LENGTH)}...[TRUNCATED]`;
  }

  return redacted;
}
