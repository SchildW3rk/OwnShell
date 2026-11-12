import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Wand2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { CodeEditor } from './CodeEditor';
import type { BodyEditorMemory, BodyValue } from './types';
import { hasBodyContent } from './utils';

interface JsonEditorProps {
  value: BodyValue;
  onChange: (value: BodyValue) => void;
  memory: BodyEditorMemory;
}

interface JsonResult {
  id: number;
  error: string | null;
  formatted?: string;
  parseMs: number;
  formatMs: number;
}

export const JsonEditor: React.FC<JsonEditorProps> = ({ value, onChange, memory }) => {
  const { t } = useTranslation();
  const workerRef = useRef<Worker | null>(null);
  const currentRef = useRef({ value, onChange });
  const sequenceRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const pendingRef = useRef<{ id: number; value: BodyValue; format: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [validation, setValidation] = useState<{
    value: BodyValue;
    error: string | null;
    parseMs: number;
    formatMs: number;
  } | null>(null);
  const hasContent = hasBodyContent(value);
  useLayoutEffect(() => {
    currentRef.current.value = value;
    currentRef.current.onChange = onChange;
  }, [value, onChange]);

  useEffect(() => {
    const worker = new Worker(new URL('./json-worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setReady(true);
    worker.onmessage = ({ data }: MessageEvent<JsonResult>) => {
      const pending = pendingRef.current;
      if (!pending || pending.id !== data.id || pending.value !== currentRef.current.value) return;
      pendingRef.current = null;
      setFormatting(false);
      const nextValue = pending.format && data.formatted !== undefined && !data.error
        ? data.formatted
        : pending.value;
      setValidation({ value: nextValue, error: data.error, parseMs: data.parseMs, formatMs: data.formatMs });
      if (nextValue !== pending.value) currentRef.current.onChange(nextValue);
    };
    worker.onerror = () => {
      pendingRef.current = null;
      setReady(false);
      setFormatting(false);
      workerRef.current = null;
      worker.terminate();
      setFailure(t('api.body.jsonProcessingFailed'));
    };
    return () => {
      clearTimeout(timerRef.current);
      workerRef.current = null;
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    pendingRef.current = null;
    setFormatting(false);
    if (!hasBodyContent(value)) {
      setValidation({ value, error: null, parseMs: 0, formatMs: 0 });
      return;
    }
    const id = ++sequenceRef.current;
    timerRef.current = window.setTimeout(() => {
      pendingRef.current = { id, value, format: false };
      workerRef.current?.postMessage({ id, value: value.toString(), format: false });
    }, 100);
    return () => clearTimeout(timerRef.current);
  }, [value]);

  const handleChange = useCallback((nextValue: BodyValue) => {
    clearTimeout(timerRef.current);
    pendingRef.current = null;
    currentRef.current.value = nextValue;
    setFormatting(false);
    currentRef.current.onChange(nextValue);
  }, []);

  const handleBeautify = useCallback(() => {
    const worker = workerRef.current;
    const value = currentRef.current.value;
    if (!worker || !hasBodyContent(value)) return;
    clearTimeout(timerRef.current);
    const id = ++sequenceRef.current;
    pendingRef.current = { id, value, format: true };
    setFormatting(true);
    worker.postMessage({ id, value: value.toString(), format: true });
  }, []);

  const currentValidation = validation?.value === value ? validation : null;
  const error = failure ?? currentValidation?.error;
  const pending = hasContent && !currentValidation && !failure;

  return (
    <div className="flex flex-col h-full" data-api-validation-ms={currentValidation?.parseMs}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          {error ? (
            <div className="flex items-center gap-1.5 text-destructive text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="truncate max-w-[300px]">{error}</span>
            </div>
          ) : (pending || formatting) && (
            <span className="text-xs text-muted-foreground">
              {t(formatting ? 'api.body.formatting' : 'api.body.validating')}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBeautify}
          className="h-7 text-xs"
          disabled={!hasContent || !ready || formatting}
        >
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
          {t('api.body.beautify', 'Beautify')}
        </Button>
      </div>

      <div className="flex-1 min-h-0 p-2">
        <CodeEditor
          value={value}
          onChange={handleChange}
          memory={memory}
          language="json"
          placeholder='{ "key": "value" }'
        />
      </div>
    </div>
  );
};
