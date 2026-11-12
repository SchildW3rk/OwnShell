import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCurlCommand } from '../electron/http/curl-export';
import { parseOwnShellApiFile } from '../electron/http/ownshell-api-format';
import {
  ApiRequestError,
  parseGraphqlBody,
  prepareRequest,
  prepareRequestWithPlaceholders,
  type RequestInput,
} from '../electron/http/prepare-request';

const graphql = (body: Record<string, unknown>): RequestInput => ({
  method: 'POST',
  url: 'https://api.example.com/graphql',
  params: '[]',
  headers: '[]',
  body: JSON.stringify(body),
  bodyType: 'graphql',
  authType: 'bearer',
  authConfig: JSON.stringify({ token: '{{token}}' }),
});

const noFiles = async () => {
  throw new Error('no files expected');
};

test('graphql body: POST application/json {query, variables, operationName} with variables resolved', async () => {
  const prepared = await prepareRequest(
    graphql({ query: 'query Me($id: ID!) { user(id: $id) { name } }', variables: '{"id": "{{userId}}"}', operationName: 'Me' }),
    { variables: { userId: '42', token: 't' }, loadFile: noFiles }
  );
  assert.equal(prepared.headers['Content-Type'], 'application/json');
  assert.equal(prepared.headers['Authorization'], 'Bearer t');
  assert.deepEqual(JSON.parse(prepared.body!.toString()), {
    query: 'query Me($id: ID!) { user(id: $id) { name } }',
    variables: { id: '42' },
    operationName: 'Me',
  });
});

test('graphql body: empty variables and operation name are omitted; empty query sends no body', async () => {
  const prepared = await prepareRequest(graphql({ query: '{ me { id } }', variables: '  ' }), {
    variables: { token: 't' },
    loadFile: noFiles,
  });
  assert.deepEqual(JSON.parse(prepared.body!.toString()), { query: '{ me { id } }' });
  const empty = await prepareRequest(graphql({ query: ' ', variables: '{}' }), { variables: { token: 't' }, loadFile: noFiles });
  assert.equal(empty.body, undefined);
});

test('graphql body: invalid variables JSON fails with its own code; missing variables win over it', async () => {
  await assert.rejects(
    prepareRequest(graphql({ query: '{ a }', variables: '{ nope' }), { variables: { token: 't' }, loadFile: noFiles }),
    (error: ApiRequestError) => error.code === 'INVALID_GRAPHQL_VARIABLES'
  );
  await assert.rejects(
    prepareRequest(graphql({ query: '{ a }', variables: '{"id": {{id}}}' }), { variables: { token: 't' }, loadFile: noFiles }),
    (error: ApiRequestError) => error.code === 'MISSING_VARIABLES' && error.detail === 'id'
  );
  // An unquoted number placeholder resolves to valid JSON.
  const prepared = await prepareRequest(graphql({ query: '{ a }', variables: '{"id": {{id}}}' }), {
    variables: { token: 't', id: '7' },
    loadFile: noFiles,
  });
  assert.deepEqual(JSON.parse(prepared.body!.toString()).variables, { id: 7 });
});

test('graphql curl export keeps placeholders, also unquoted ones in the variables', async () => {
  const exported = await prepareRequestWithPlaceholders(
    graphql({ query: '{ "variables":null }', variables: '{"id": {{id}}}', operationName: 'Op' }),
    {}
  );
  const body = exported.body!.toString();
  assert.equal(body, '{"variables":{"id": {{id}}},"query":"{ \\"variables\\":null }","operationName":"Op"}');
  const curl = toCurlCommand(exported);
  assert.match(curl, /-X POST/);
  assert.match(curl, /-H 'Content-Type: application\/json'/);
  assert.match(curl, /-H 'Authorization: Bearer \{\{token\}\}'/);
  assert.match(curl, /--data-raw '\{"variables":\{"id": \{\{id\}\}\}/);
});

test('parseGraphqlBody accepts object variables (older JSON bodies) and garbage', () => {
  assert.deepEqual(parseGraphqlBody('{"query":"{ a }","variables":{"x":1}}'), {
    query: '{ a }',
    variables: '{\n  "x": 1\n}',
    operationName: '',
  });
  assert.deepEqual(parseGraphqlBody('not json'), { query: '', variables: '', operationName: '' });
});

test('OwnShell API file round-trips a graphql body', () => {
  const content = JSON.stringify({ query: '{ me { id } }', variables: '{"a":1}' });
  const folder = parseOwnShellApiFile(
    JSON.stringify({
      format: 'ownshell-api',
      version: 1,
      folder: {
        id: 'f',
        name: 'F',
        description: null,
        auth: { type: 'none', config: {} },
        variables: [],
        folders: [],
        requests: [
          {
            id: 'r',
            name: 'Q',
            method: 'POST',
            url: 'https://x.test/graphql',
            params: [],
            headers: [],
            body: { type: 'graphql', rawContentType: 'json', content, items: null, fileName: null },
            auth: { type: 'inherit', config: {} },
            variables: [],
            settings: { timeoutSeconds: null, followRedirects: null, verifyTls: null },
          },
        ],
      },
    })
  );
  assert.equal(folder.requests[0].body_type, 'graphql');
  assert.equal(folder.requests[0].body, content);
});

test('schema summary: root types first, type refs rendered, built-ins hidden, non-introspection is null', async () => {
  const { summarizeSchema, parseGraphqlBody: parseInRenderer } = await import(
    '../src/components/api-client/body-editor/graphql-schema'
  );
  const named = (name: string) => ({ kind: 'SCALAR', name });
  const body = JSON.stringify({
    data: {
      __schema: {
        queryType: { name: 'Query' },
        mutationType: null,
        types: [
          { kind: 'OBJECT', name: 'User', fields: [{ name: 'id', type: { kind: 'NON_NULL', ofType: named('ID') } }] },
          {
            kind: 'OBJECT',
            name: 'Query',
            fields: [{ name: 'users', type: { kind: 'LIST', ofType: { kind: 'NON_NULL', ofType: { kind: 'OBJECT', name: 'User' } } } }],
          },
          { kind: 'ENUM', name: 'Role', enumValues: [{ name: 'ADMIN' }] },
          { kind: 'OBJECT', name: '__Type', fields: [] },
        ],
      },
    },
  });
  assert.deepEqual(summarizeSchema(body), [
    { name: 'Query', kind: 'OBJECT', root: 'query', fields: [{ name: 'users', type: '[User!]' }] },
    { name: 'Role', kind: 'ENUM', fields: [{ name: 'ADMIN', type: '' }] },
    { name: 'User', kind: 'OBJECT', fields: [{ name: 'id', type: 'ID!' }] },
  ]);
  assert.equal(summarizeSchema('{"errors":[]}'), null);
  assert.equal(summarizeSchema('<html>'), null);
  // Renderer and main read the stored body the same way.
  const stored = '{"query":"{ a }","variables":{"x":1},"operationName":"Op"}';
  assert.deepEqual(parseInRenderer(stored), parseGraphqlBody(stored));
});

test('graphql body: a stored GET/HEAD/PUT method is always sent (and exported) as POST with the body', async () => {
  for (const method of ['GET', 'HEAD', 'PUT'] as const) {
    const prepared = await prepareRequest({ ...graphql({ query: '{ me { id } }' }), method }, { variables: { token: 't' }, loadFile: noFiles });
    assert.equal(prepared.method, 'POST', method);
    assert.deepEqual(JSON.parse(prepared.body!.toString()), { query: '{ me { id } }' });
  }
  const exported = await prepareRequestWithPlaceholders({ ...graphql({ query: '{ me { id } }' }), method: 'GET' }, {});
  assert.equal(exported.method, 'POST');
  assert.match(toCurlCommand(exported), /-X POST/);
});
