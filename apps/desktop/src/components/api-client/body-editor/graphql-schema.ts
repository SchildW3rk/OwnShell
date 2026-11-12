/** GraphQL body helpers and a read-only schema summary from an introspection response. */

export interface GraphqlBody {
  query: string;
  variables: string;
  operationName: string;
}

/** Same shape as the main process reads (prepare-request parseGraphqlBody). */
export function parseGraphqlBody(body: string): GraphqlBody {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(body) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    // An empty or old body starts a new query.
  }
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    query: text(parsed.query),
    variables:
      typeof parsed.variables === 'string'
        ? parsed.variables
        : parsed.variables && typeof parsed.variables === 'object'
          ? JSON.stringify(parsed.variables, null, 2)
          : '',
    operationName: text(parsed.operationName),
  };
}

export const serializeGraphqlBody = (body: GraphqlBody) => JSON.stringify(body);

export const INTROSPECTION_QUERY = `query OwnShellIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      fields(includeDeprecated: true) { name type { ...TypeRef } }
      inputFields { name type { ...TypeRef } }
      enumValues(includeDeprecated: true) { name }
    }
  }
}
fragment TypeRef on __Type {
  kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}`;

interface TypeRef {
  kind?: string;
  name?: string | null;
  ofType?: TypeRef | null;
}

export interface SchemaType {
  name: string;
  kind: string;
  /** Root operation type: query, mutation or subscription. */
  root?: 'query' | 'mutation' | 'subscription';
  fields: Array<{ name: string; type: string }>;
}

function typeName(ref: TypeRef | null | undefined, depth = 0): string {
  if (!ref || depth > 8) return '?';
  if (ref.kind === 'NON_NULL') return `${typeName(ref.ofType, depth + 1)}!`;
  if (ref.kind === 'LIST') return `[${typeName(ref.ofType, depth + 1)}]`;
  return ref.name ?? '?';
}

const MAX_TYPES = 2000;
const MAX_FIELDS = 500;

/** Types without the built-in `__*` ones, root types first; null when the body is no introspection result. */
export function summarizeSchema(body: string): SchemaType[] | null {
  let schema: {
    queryType?: { name?: string } | null;
    mutationType?: { name?: string } | null;
    subscriptionType?: { name?: string } | null;
    types?: unknown;
  };
  try {
    schema = (JSON.parse(body) as { data?: { __schema?: typeof schema } }).data?.__schema ?? {};
  } catch {
    return null;
  }
  if (!Array.isArray(schema.types)) return null;
  const roots = new Map<string, SchemaType['root']>();
  if (schema.queryType?.name) roots.set(schema.queryType.name, 'query');
  if (schema.mutationType?.name) roots.set(schema.mutationType.name, 'mutation');
  if (schema.subscriptionType?.name) roots.set(schema.subscriptionType.name, 'subscription');
  const order = { query: 0, mutation: 1, subscription: 2 };

  return (schema.types as Array<Record<string, unknown>>)
    .slice(0, MAX_TYPES)
    .filter((type) => typeof type?.name === 'string' && !(type.name as string).startsWith('__'))
    .map((type) => {
      const name = type.name as string;
      const list = (Array.isArray(type.fields) ? type.fields : Array.isArray(type.inputFields) ? type.inputFields : []) as Array<{
        name?: string;
        type?: TypeRef;
      }>;
      const fields = list.length
        ? list.slice(0, MAX_FIELDS).map((field) => ({ name: String(field?.name ?? '?'), type: typeName(field?.type) }))
        : ((Array.isArray(type.enumValues) ? type.enumValues : []) as Array<{ name?: string }>)
            .slice(0, MAX_FIELDS)
            .map((value) => ({ name: String(value?.name ?? '?'), type: '' }));
      const root = roots.get(name);
      return { name, kind: String(type.kind ?? ''), fields, ...(root && { root }) };
    })
    .sort((a, b) =>
      a.root || b.root
        ? (a.root ? order[a.root] : 3) - (b.root ? order[b.root] : 3)
        : a.name.localeCompare(b.name)
    );
}
