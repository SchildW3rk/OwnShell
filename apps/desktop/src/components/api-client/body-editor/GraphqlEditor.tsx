import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Loader2, X } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { CodeEditor } from './CodeEditor';
import { parseGraphqlBody, serializeGraphqlBody, summarizeSchema, type SchemaType } from './graphql-schema';
import type { BodyEditorMemory, BodyValue } from './types';

interface GraphqlEditorProps {
  value: BodyValue;
  onChange: (value: BodyValue) => void;
  /** Sends the introspection query through the normal pipeline; resolves to the response body or null. */
  onFetchSchema?: () => Promise<string | null>;
}

/** Query (plain text, no GraphQL grammar is installed) + JSON variables; the stored body is one JSON string. */
export const GraphqlEditor: React.FC<GraphqlEditorProps> = ({ value, onChange, onFetchSchema }) => {
  const { t } = useTranslation();
  const text = value.toString();
  const body = useMemo(() => parseGraphqlBody(text), [text]);
  const queryMemory = useRef<BodyEditorMemory>({}).current;
  const variablesMemory = useRef<BodyEditorMemory>({}).current;
  const [schema, setSchema] = useState<SchemaType[] | null>(null);
  const [schemaError, setSchemaError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const update = (patch: Partial<typeof body>) => onChange(serializeGraphqlBody({ ...body, ...patch }));

  const fetchSchema = async () => {
    if (!onFetchSchema) return;
    setLoading(true);
    setSchemaError(false);
    try {
      const response = await onFetchSchema();
      const summary = response === null ? null : summarizeSchema(response);
      setSchema(summary);
      setSchemaError(response !== null && !summary);
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!schema || !query) return schema;
    return schema.filter(
      (type) => type.name.toLowerCase().includes(query) || type.fields.some((field) => field.name.toLowerCase().includes(query))
    );
  }, [schema, filter]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-1 min-w-0 flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <input
            value={body.operationName}
            onChange={(event) => update({ operationName: event.target.value })}
            placeholder={t('api.graphql.operationName')}
            aria-label={t('api.graphql.operationName')}
            className="h-7 w-48 rounded-md border border-border bg-background px-2 text-xs"
          />
          <div className="flex-1" />
          {onFetchSchema && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void fetchSchema()} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5 mr-1.5" />}
              {t('api.graphql.fetchSchema')}
            </Button>
          )}
        </div>
        <div className="flex-[3] min-h-0 p-2">
          <CodeEditor
            value={body.query}
            onChange={(query) => update({ query: query.toString() })}
            memory={queryMemory}
            language="text"
            placeholder="query { … }"
          />
        </div>
        <div className="px-4 pt-1 text-xs text-muted-foreground">{t('api.graphql.variables')}</div>
        <div className="flex-[2] min-h-0 p-2">
          <CodeEditor
            value={body.variables}
            onChange={(variables) => update({ variables: variables.toString() })}
            memory={variablesMemory}
            language="json"
            placeholder='{ "id": "{{userId}}" }'
          />
        </div>
      </div>

      {(schema || schemaError) && (
        <aside className="flex w-64 flex-shrink-0 flex-col border-l border-border" aria-label={t('api.graphql.schema')}>
          <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('api.graphql.filterSchema')}
              aria-label={t('api.graphql.filterSchema')}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                setSchema(null);
                setSchemaError(false);
              }}
              className="p-1 text-muted-foreground hover:text-foreground"
              aria-label={t('common.close')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-2 py-1 font-mono text-[11px]">
            {schemaError && <p className="p-2 font-sans text-xs text-destructive">{t('api.graphql.schemaFailed')}</p>}
            {visible?.map((type) => (
              <details key={type.name} open={!!type.root} className="py-0.5">
                <summary className="cursor-pointer truncate">
                  <span className="text-primary">{type.name}</span>{' '}
                  <span className="text-muted-foreground">{type.root ?? type.kind.toLowerCase()}</span>
                </summary>
                <ul className="pl-3">
                  {type.fields.map((field) => (
                    <li key={field.name} className="truncate">
                      {field.name}
                      {field.type && <span className="text-muted-foreground">: {field.type}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
};
