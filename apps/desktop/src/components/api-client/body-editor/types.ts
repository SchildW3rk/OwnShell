import type { RawRequestContentType, RequestBodyType } from '@ownshell/core';
import type { EditorState, Text } from '@codemirror/state';
import type { EditorView } from 'codemirror';

import type { KeyValueItem } from '../KeyValueEditor';
export type BodyValue = string | Text;

export interface BodyEditorMemory {
  state?: EditorState;
  scrollSnapshot?: ReturnType<EditorView['scrollSnapshot']>;
}

export interface BodyEditorProps {
  bodyType: RequestBodyType;
  body: BodyValue;
  memory: BodyEditorMemory;
  rawContentType: RawContentType;
  onRawContentTypeChange: (type: RawContentType) => void;
  onBodyTypeChange: (type: RequestBodyType) => void;
  onBodyChange: (body: BodyValue) => void;
  /** GraphQL: runs the introspection query; resolves to the response body, null on failure. */
  onFetchGraphqlSchema?: () => Promise<string | null>;
}

export interface FormDataItem extends KeyValueItem {
  type: 'text' | 'file';
}

export type RawContentType = RawRequestContentType;
