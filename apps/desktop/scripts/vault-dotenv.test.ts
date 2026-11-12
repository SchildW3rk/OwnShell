import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeDotenv } from '../electron/ipc/vault/dotenv';

// Expected output checked with `docker compose config` (env_file), which reads every value back unchanged.
test('.env upload: simple values unquoted, the rest double-quoted with escapes', () => {
  const content = serializeDotenv([
    { key: 'SIMPLE', value: 'abc-1.2:3@x,y+z/_' },
    { key: 'SPACES', value: 'hello world' },
    { key: 'HASH', value: 'a #not comment' },
    { key: 'QUOTES', value: `say "hi" and 'yo'` },
    { key: 'DOLLAR', value: 'pa$$word ${HOME} $USER' },
    { key: 'BACKSLASH', value: 'C:\\path\\n' },
    { key: 'NEWLINE', value: 'line1\nline2\r\n' },
    { key: 'EMPTY', value: '' },
    { key: '_eq', value: 'a=b' },
  ]);
  assert.equal(
    content,
    [
      'SIMPLE=abc-1.2:3@x,y+z/_',
      'SPACES="hello world"',
      'HASH="a #not comment"',
      `QUOTES="say \\"hi\\" and 'yo'"`,
      'DOLLAR="pa\\$\\$word \\${HOME} \\$USER"',
      'BACKSLASH="C:\\\\path\\\\n"',
      'NEWLINE="line1\\nline2\\r\\n"',
      'EMPTY=',
      '_eq="a=b"',
      '',
    ].join('\n')
  );
});

test('.env upload: invalid variable names are refused before anything is written', () => {
  for (const key of ['1ABC', 'MY-VAR', 'A B', 'X=Y', '', 'Ä']) {
    assert.throws(() => serializeDotenv([{ key, value: 'v' }]), /Invalid \.env variable name/);
  }
});
