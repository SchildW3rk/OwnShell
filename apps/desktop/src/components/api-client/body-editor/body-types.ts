import type { RequestBodyType } from '@ownshell/core';

export const BODY_TYPES: Array<{ value: RequestBodyType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'form-urlencoded', label: 'x-www-form-urlencoded' },
  { value: 'raw', label: 'Raw' },
  { value: 'binary', label: 'Binary' },
];
