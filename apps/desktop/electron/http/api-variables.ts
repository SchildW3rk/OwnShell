/**
 * Folder/collection and global API variables.
 *
 * Stored as a JSON array (api_collections.variables, app_settings for globals). A
 * secret variable keeps its value only in `value_encrypted` (cryptoManager), never in
 * `value`, and the renderer only ever sees that it has a value.
 */

/** app_settings key of the global API variables (same JSON format as a folder). */
export const GLOBAL_VARIABLES_SETTING = 'api_client_global_variables';

export interface StoredVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  secret: boolean;
  value_encrypted?: string;
}

/** What the renderer gets: secret values are never included. */
export interface PublicVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  secret: boolean;
  hasValue: boolean;
}

/** From the renderer: `value` undefined on a secret keeps the stored value of the same id. */
export interface VariableInput {
  id?: string;
  key: string;
  value?: string;
  enabled: boolean;
  secret: boolean;
}

/** Decrypted form (backup, imports). */
export interface PlainVariable {
  id?: string;
  key: string;
  value: string;
  enabled: boolean;
  secret: boolean;
}

type Codec = (value: string) => string;

export function parseStoredVariables(json: string | null | undefined): StoredVariable[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `var-${index}`,
      key: typeof item.key === 'string' ? item.key : '',
      value: item.secret ? '' : typeof item.value === 'string' ? item.value : '',
      enabled: item.enabled !== false,
      secret: item.secret === true,
      ...(typeof item.value_encrypted === 'string' && { value_encrypted: item.value_encrypted }),
    }));
}

export function toPublicVariables(json: string | null | undefined): PublicVariable[] {
  return parseStoredVariables(json).map(({ value_encrypted, ...variable }) => ({
    ...variable,
    hasValue: variable.secret ? !!value_encrypted : variable.value !== '',
  }));
}

/** Builds the stored JSON; only secrets are encrypted (throws while the vault is locked). */
export function buildStoredVariables(
  inputs: VariableInput[],
  existingJson: string | null | undefined,
  encrypt: Codec,
  newId: () => string
): string {
  const existing = new Map(parseStoredVariables(existingJson).map((item) => [item.id, item]));
  return JSON.stringify(
    inputs.map((input): StoredVariable => {
      const id = input.id || newId();
      const base = { id, key: input.key.trim(), enabled: input.enabled, secret: input.secret };
      if (!input.secret) return { ...base, value: input.value ?? '' };
      const kept = input.value === undefined ? existing.get(id)?.value_encrypted : undefined;
      const value_encrypted = kept ?? (input.value ? encrypt(input.value) : undefined);
      return { ...base, value: '', ...(value_encrypted && { value_encrypted }) };
    })
  );
}

export function decryptVariables(json: string | null | undefined, decrypt: Codec): PlainVariable[] {
  return parseStoredVariables(json).map(({ value_encrypted, ...variable }) => ({
    ...variable,
    value: variable.secret ? (value_encrypted ? decrypt(value_encrypted) : '') : variable.value,
  }));
}

export function encryptVariables(variables: PlainVariable[], encrypt: Codec, newId: () => string): string {
  return buildStoredVariables(
    variables.map((variable) => ({ ...variable, id: variable.id || newId() })),
    '[]',
    encrypt,
    newId
  );
}

/**
 * Enabled variables as a lookup map. Without `decrypt` (vault locked) secrets are left
 * out and `locked` tells the caller why they may be missing.
 */
export function resolveVariableMap(
  json: string | null | undefined,
  decrypt: Codec | null
): { variables: Record<string, string>; locked: boolean } {
  const variables: Record<string, string> = {};
  let locked = false;
  for (const variable of parseStoredVariables(json)) {
    if (!variable.enabled || !variable.key) continue;
    if (!variable.secret) {
      variables[variable.key] = variable.value;
    } else if (!decrypt) {
      locked = true;
    } else if (variable.value_encrypted) {
      try {
        variables[variable.key] = decrypt(variable.value_encrypted);
      } catch {
        // Left unresolved: prepareRequest reports it as a missing variable.
      }
    } else {
      variables[variable.key] = '';
    }
  }
  return { variables, locked };
}
