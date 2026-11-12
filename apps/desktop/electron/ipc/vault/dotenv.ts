/**
 * .env serialization for the vault upload, written for the Docker Compose `.env` / `env_file`
 * parser (compose-go dotenv):
 * - KEY must match /^[A-Za-z_][A-Za-z0-9_]*$/; anything else is refused.
 * - Values made only of [A-Za-z0-9_./:@,+-] stay unquoted (and the empty value is `KEY=`).
 * - Everything else is double-quoted with `\` -> `\\`, `"` -> `\"`, `$` -> `\$` (no variable
 *   interpolation by Compose or dotenv-expand), newline -> `\n`, carriage return -> `\r`.
 */

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SIMPLE_VALUE = /^[A-Za-z0-9_./:@,+-]*$/;

const ESCAPES: Record<string, string> = { '\\': '\\\\', '"': '\\"', $: '\\$', '\n': '\\n', '\r': '\\r' };

export function dotenvValue(value: string): string {
  return SIMPLE_VALUE.test(value) ? value : `"${value.replace(/[\\"$\n\r]/g, (char) => ESCAPES[char])}"`;
}

export function serializeDotenv(variables: Array<{ key: string; value: string }>): string {
  const invalid = variables.filter((variable) => !KEY.test(variable.key)).map((variable) => variable.key);
  if (invalid.length) {
    throw new Error(
      `Invalid .env variable name(s): ${invalid.map((key) => JSON.stringify(key)).join(', ')}. ` +
        'Names must start with a letter or underscore and contain only letters, digits and underscores.'
    );
  }
  return variables.map((variable) => `${variable.key}=${dotenvValue(variable.value)}`).join('\n') + '\n';
}
