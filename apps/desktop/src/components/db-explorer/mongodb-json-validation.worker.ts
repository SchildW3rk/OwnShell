export interface JsonTextChange {
  from: number;
  to: number;
  insert: string;
}

export type JsonValidationRequest =
  | { type: 'reset'; version: number; value: string }
  | { type: 'format'; version: number; value: string }
  | { type: 'changes'; version: number; changes: JsonTextChange[] };

export interface JsonValidationResult {
  version: number;
  error: string | null;
  formattedValue?: string;
}

const scope = self as unknown as {
  onmessage: (event: MessageEvent<JsonValidationRequest>) => void;
  postMessage: (message: JsonValidationResult) => void;
};
let value = '{}';

scope.onmessage = ({ data }) => {
  if (data.type === 'format') {
    try {
      value = JSON.stringify(JSON.parse(data.value), null, 2);
      scope.postMessage({ version: data.version, error: null, formattedValue: value });
    } catch (cause) {
      scope.postMessage({ version: data.version, error: cause instanceof Error ? cause.message : 'Invalid JSON' });
    }
    return;
  }

  if (data.type === 'reset') {
    value = data.value;
  } else {
    // ChangeSet ranges refer to the previous document, so apply them from the end.
    for (let index = data.changes.length - 1; index >= 0; index--) {
      const change = data.changes[index];
      value = value.slice(0, change.from) + change.insert + value.slice(change.to);
    }
  }

  let error: string | null = null;
  try {
    JSON.parse(value);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Invalid JSON';
  }
  scope.postMessage({ version: data.version, error });
};
