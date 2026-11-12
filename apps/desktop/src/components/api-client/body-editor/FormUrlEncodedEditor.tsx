import React from 'react';

import { KeyValueEditor } from '../KeyValueEditor';
import { parseFormUrlEncoded, serializeFormUrlEncoded } from './utils';

interface FormUrlEncodedEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const FormUrlEncodedEditor: React.FC<FormUrlEncodedEditorProps> = ({
  value,
  onChange,
}) => (
  <div className="h-full">
    <KeyValueEditor
      items={parseFormUrlEncoded(value)}
      onChange={(items) => onChange(serializeFormUrlEncoded(items))}
      keyPlaceholder="Key"
      valuePlaceholder="Value"
    />
  </div>
);
