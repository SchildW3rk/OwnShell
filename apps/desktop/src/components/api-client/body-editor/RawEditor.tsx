import React, { useState } from 'react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { CodeEditor } from './CodeEditor';
import type { BodyEditorMemory, BodyValue, RawContentType } from './types';

const CONTENT_TYPES: Array<{ value: RawContentType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'xml', label: 'XML' },
  { value: 'html', label: 'HTML' },
];

interface RawEditorProps {
  value: BodyValue;
  onChange: (value: BodyValue) => void;
  memory: BodyEditorMemory;
}

export const RawEditor: React.FC<RawEditorProps> = ({ value, onChange, memory }) => {
  const { t } = useTranslation();
  const [contentType, setContentType] = useState<RawContentType>(memory.rawContentType ?? 'text');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">
          {t('api.body.contentType', 'Content Type')}:
        </span>
        {CONTENT_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => {
              memory.rawContentType = type.value;
              setContentType(type.value);
            }}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              contentType === type.value
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 p-2">
        <CodeEditor
          value={value}
          onChange={onChange}
          memory={memory}
          language={contentType === 'xml' || contentType === 'html' ? 'xml' : 'text'}
          placeholder={t('api.body.rawPlaceholder', 'Enter raw body content...')}
        />
      </div>
    </div>
  );
};
