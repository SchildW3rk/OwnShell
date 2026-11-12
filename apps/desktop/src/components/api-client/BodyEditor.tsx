/**
 * Body Editor (v1.18.0)
 *
 * Request body editor with multiple content types:
 * - none: No body
 * - json: JSON with syntax highlighting and beautify
 * - form-data: Multipart form data
 * - form-urlencoded: URL-encoded form data
 * - raw: Plain text/XML/HTML/etc
 * - binary: File upload
 * - graphql: query + JSON variables, sent as application/json
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import { BinaryEditor } from './body-editor/BinaryEditor';
import { BodyTypeSelector } from './body-editor/BodyTypeSelector';
import { GraphqlEditor } from './body-editor/GraphqlEditor';
import { FormDataEditor } from './body-editor/FormDataEditor';
import { FormUrlEncodedEditor } from './body-editor/FormUrlEncodedEditor';
import { JsonEditor } from './body-editor/JsonEditor';
import { RawEditor } from './body-editor/RawEditor';
import type { BodyEditorProps } from './body-editor/types';

export const BodyEditor: React.FC<BodyEditorProps> = ({
  bodyType,
  body,
  memory,
  rawContentType,
  onRawContentTypeChange,
  onBodyTypeChange,
  onBodyChange,
  onFetchGraphqlSchema,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      <BodyTypeSelector value={bodyType} onChange={onBodyTypeChange} />

      <div className="flex-1 min-h-0">
        {bodyType === 'none' && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              {t('api.body.noBody', 'This request does not have a body')}
            </p>
          </div>
        )}

        {bodyType === 'json' && <JsonEditor value={body} onChange={onBodyChange} memory={memory} />}

        {bodyType === 'form-data' && <FormDataEditor value={body.toString()} onChange={onBodyChange} />}

        {bodyType === 'form-urlencoded' && (
          <FormUrlEncodedEditor value={body.toString()} onChange={onBodyChange} />
        )}

        {bodyType === 'raw' && (
          <RawEditor
            value={body}
            onChange={onBodyChange}
            memory={memory}
            contentType={rawContentType}
            onContentTypeChange={onRawContentTypeChange}
          />
        )}

        {bodyType === 'binary' && <BinaryEditor value={body.toString()} onChange={onBodyChange} />}

        {bodyType === 'graphql' && (
          <GraphqlEditor value={body} onChange={onBodyChange} onFetchSchema={onFetchGraphqlSchema} />
        )}
      </div>
    </div>
  );
};
