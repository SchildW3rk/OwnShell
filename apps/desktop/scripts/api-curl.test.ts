import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCurlCommand } from '../electron/http/curl-export';
import { prepareRequest, prepareRequestWithPlaceholders, type RequestInput } from '../electron/http/prepare-request';
import { CurlParseError, looksLikeCurl, parseCurl, tokenizeShell } from '../src/components/api-client/curl-import';

const items = (json: string) => JSON.parse(json) as Array<Record<string, unknown>>;
const kv = (pairs: Record<string, string>) =>
  Object.entries(pairs).map(([key, value]) => ({ key, value, enabled: true }));

test('tokenizer: quotes, escapes, continuations and $\'...\'', () => {
  assert.deepEqual(tokenizeShell(`curl 'a b' "c \\"d\\" \\$x" e\\ f`), ['curl', 'a b', 'c "d" $x', 'e f']);
  assert.deepEqual(tokenizeShell('curl \\\n  -X POST \\\r\n  url'), ['curl', '-X', 'POST', 'url']);
  assert.deepEqual(tokenizeShell(`curl $'line\\nnext \\'q\\' \\x41\\u00e9'`), ['curl', "line\nnext 'q' Aé"]);
  assert.deepEqual(tokenizeShell(`curl 'it'\\''s'`), ['curl', "it's"]);
  assert.deepEqual(tokenizeShell(`curl ''`), ['curl', '']);
  assert.throws(() => tokenizeShell(`curl 'open`), (e: unknown) => e instanceof CurlParseError && e.code === 'UNTERMINATED_QUOTE');
  assert.throws(() => tokenizeShell(`curl "open`), CurlParseError);
});

test('parse: errors', () => {
  assert.throws(() => parseCurl('wget http://x'), (e: unknown) => e instanceof CurlParseError && e.code === 'NOT_CURL');
  assert.throws(() => parseCurl('curl -s'), (e: unknown) => e instanceof CurlParseError && e.code === 'NO_URL');
  const mixed = (e: unknown) => e instanceof CurlParseError && e.code === 'MIXED_BODY';
  assert.throws(() => parseCurl("curl https://x --json @a.json --json '{}'"), mixed);
  assert.throws(() => parseCurl("curl https://x --json '{}' --json @a.json"), mixed);
  assert.throws(() => parseCurl('curl https://x --json @a.json --json @b.json'), mixed);
  assert.equal(looksLikeCurl('  curl https://x'), true);
  assert.equal(looksLikeCurl('https://curl.se'), false);
});

test('parse: simple GET with query, headers, -A, -e, cookie', () => {
  const r = parseCurl(
    `curl -sSL 'https://api.example.com/v1/users?page=2&q=a%20b+c#frag' -H 'Accept: application/json' -A 'agent/1' -e https://ref.example -b 'sid=1' --compressed`
  );
  assert.equal(r.method, 'GET');
  assert.equal(r.url, 'https://api.example.com/v1/users');
  assert.deepEqual(items(r.params), kv({ page: '2', q: 'a b c' }));
  assert.deepEqual(items(r.headers), kv({ Accept: 'application/json', 'User-Agent': 'agent/1', Referer: 'https://ref.example', Cookie: 'sid=1' }));
  assert.equal(r.bodyType, 'none');
  assert.equal(r.followRedirects, true);
  assert.deepEqual(r.unsupported, []);
});

test('parse: multiline JSON POST copied from browser devtools', () => {
  const r = parseCurl(`curl 'https://api.example.com/items' \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer abc.def' \\
  --data-raw '{"name":"x","tags":["a"]}' \\
  --compressed`);
  assert.equal(r.method, 'POST');
  assert.equal(r.bodyType, 'json');
  assert.equal(r.body, '{"name":"x","tags":["a"]}');
  assert.deepEqual(items(r.headers), []);
  assert.equal(r.authType, 'bearer');
  assert.deepEqual(JSON.parse(r.authConfig), { token: 'abc.def' });
});

test('parse: -X, -d variants, urlencoded, -G and JSON without header', () => {
  const form = parseCurl(`curl -X PUT http://h/x -d a=1 --data 'b=two words' --data-urlencode 'c=ä&x'`);
  assert.equal(form.method, 'PUT');
  assert.equal(form.bodyType, 'form-urlencoded');
  assert.deepEqual(items(form.body), kv({ a: '1', b: 'two words', c: 'ä&x' }));

  const get = parseCurl(`curl -G https://h/search -d q=1 -d lang=de`);
  assert.equal(get.method, 'GET');
  assert.equal(get.bodyType, 'none');
  assert.deepEqual(items(get.params), kv({ q: '1', lang: 'de' }));

  const json = parseCurl(`curl https://h -d '{"a":1}'`);
  assert.equal(json.bodyType, 'json');
  assert.equal(json.method, 'POST');

  const xml = parseCurl(`curl https://h -H 'Content-Type: application/xml' --data-binary '<a/>'`);
  assert.equal(xml.bodyType, 'raw');
  assert.equal(xml.rawContentType, 'xml');
  assert.deepEqual(items(xml.headers), []);

  const charset = parseCurl(`curl https://h -H 'Content-Type: application/json; charset=utf-8' -d '{}'`);
  assert.equal(charset.bodyType, 'json');
  assert.deepEqual(items(charset.headers), kv({ 'Content-Type': 'application/json; charset=utf-8' }));

  const attached = parseCurl(`curl -XDELETE -HX-Id:7 https://h/1`);
  assert.equal(attached.method, 'DELETE');
  assert.deepEqual(items(attached.headers), kv({ 'X-Id': '7' }));
  assert.equal(parseCurl('curl --request=patch https://h').method, 'PATCH');
  assert.equal(parseCurl('curl -I https://h').method, 'HEAD');
});

test('parse: -F text and file parts, files must be selected again', () => {
  const r = parseCurl(`curl https://h/upload -F 'meta=hello;type=text/plain' -F 'file=@/tmp/report.pdf;type=application/pdf' --form-string 'raw=@literal'`);
  assert.equal(r.method, 'POST');
  assert.equal(r.bodyType, 'form-data');
  assert.deepEqual(items(r.body), [
    { key: 'meta', value: 'hello', type: 'text', enabled: true },
    { key: 'file', value: '/tmp/report.pdf', type: 'file', enabled: true },
    { key: 'raw', value: '@literal', type: 'text', enabled: true },
  ]);
  assert.deepEqual(r.files, ['/tmp/report.pdf']);

  const binary = parseCurl(`curl https://h --data-binary @/data/blob.bin`);
  assert.equal(binary.bodyType, 'binary');
  assert.deepEqual(JSON.parse(binary.body), { path: '/data/blob.bin', name: 'blob.bin' });
  assert.deepEqual(binary.files, ['/data/blob.bin']);
});

test('parse: -u basic auth, -k, -m, scheme-less URL and unsupported flags', () => {
  const r = parseCurl(`curl -u 'admin:p:ss' -k -m 12.5 example.com:8080/health -o out.txt --proxy http://p:3128 --http2 -Z`);
  assert.equal(r.authType, 'basic');
  assert.deepEqual(JSON.parse(r.authConfig), { username: 'admin', password: 'p:ss' });
  assert.equal(r.verifyTls, false);
  assert.equal(r.timeoutSeconds, 13);
  assert.equal(r.url, 'http://example.com:8080/health');
  assert.deepEqual(r.unsupported, ['-o out.txt', '--proxy http://p:3128', '-Z']);
  assert.equal(parseCurl('curl -m 9999 https://h').timeoutSeconds, 600);
});

const base: RequestInput = {
  method: 'GET',
  url: 'https://api.example.com/v1/items',
  params: '[]',
  headers: '[]',
  body: '',
  bodyType: 'none',
  authType: 'none',
  authConfig: '{}',
};

async function roundTrip(input: RequestInput) {
  const exported = await prepareRequestWithPlaceholders(input, {});
  return { command: toCurlCommand(exported), parsed: parseCurl(toCurlCommand(exported)) };
}

test('round trip: export -> import gives the same request', async () => {
  const cases: RequestInput[] = [
    { ...base, params: JSON.stringify(kv({ page: '1', q: "it's a b&c" })), headers: JSON.stringify(kv({ Accept: 'application/json' })) },
    { ...base, method: 'POST', bodyType: 'json', body: '{\n  "a": "it\'s"\n}', authType: 'bearer', authConfig: JSON.stringify({ token: '{{TOKEN}}' }) },
    { ...base, method: 'PUT', bodyType: 'form-urlencoded', body: JSON.stringify(kv({ a: '1', b: 'x y' })), authType: 'basic', authConfig: JSON.stringify({ username: 'u', password: '{{PASSWORD}}' }) },
    { ...base, method: 'POST', bodyType: 'raw', rawContentType: 'xml', body: '<a b="1"/>' },
    { ...base, method: 'DELETE', url: '{{BASE_URL}}/v1/items/{{ID}}', params: JSON.stringify(kv({ token: '{{T}}' })) },
    {
      ...base,
      method: 'POST',
      bodyType: 'form-data',
      body: JSON.stringify([
        { key: 'name', value: 'x;type=y', enabled: true, type: 'text' },
        { key: 'file', value: '/tmp/a b.png', enabled: true, type: 'file' },
      ]),
    },
    { ...base, method: 'HEAD' },
  ];
  for (const input of cases) {
    const { command, parsed } = await roundTrip(input);
    const message = command;
    assert.equal(parsed.method, input.method, message);
    assert.equal(parsed.url, input.url, message);
    assert.deepEqual(items(parsed.params), items(input.params), message);
    assert.deepEqual(items(parsed.headers), items(input.headers), message);
    assert.equal(parsed.bodyType, input.bodyType, message);
    if (input.bodyType === 'form-urlencoded' || input.bodyType === 'form-data') {
      assert.deepEqual(items(parsed.body), items(input.body), message);
    } else {
      assert.equal(parsed.body, input.body, message);
    }
    assert.equal(parsed.authType, input.authType, message);
    assert.deepEqual(JSON.parse(parsed.authConfig), JSON.parse(input.authConfig), message);
    assert.deepEqual(parsed.unsupported, [], message);
  }
});

test('export: settings flags, resolved variables and no multipart Content-Type', async () => {
  const prepared = await prepareRequest(
    { ...base, url: '{{BASE}}/x', headers: JSON.stringify(kv({ 'X-Key': '{{KEY}}' })) },
    { variables: { BASE: 'https://h', KEY: 's3cret' }, loadFile: async () => assert.fail('no files') }
  );
  const command = toCurlCommand({ ...prepared, url: prepared.url.href }, { verifyTls: false, followRedirects: false, timeoutSeconds: 90 });
  assert.equal(command, "curl \\\n  'https://h/x' \\\n  -H 'X-Key: s3cret' \\\n  -k \\\n  --max-time 90");
  const parsed = parseCurl(command);
  assert.equal(parsed.verifyTls, false);
  assert.equal(parsed.timeoutSeconds, 90);

  const multipart = await prepareRequestWithPlaceholders(
    { ...base, method: 'POST', bodyType: 'form-data', body: JSON.stringify([{ key: 'a', value: '1', enabled: true }]) },
    {}
  );
  assert.doesNotMatch(toCurlCommand(multipart), /Content-Type/i);
  assert.match(toCurlCommand(multipart), /-L \\\n  --max-redirs 10 \\\n  --max-time 30$/);
});
