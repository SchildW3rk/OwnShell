import type { DBConnectionConfig } from '@ownshell/core';

export interface ExportOptions {
  connectionId: string;
  config: DBConnectionConfig;
  outputPath: string;
  compress: boolean;
  tables?: string[];
  schemaOnly?: boolean;
  dataOnly?: boolean;
  clean?: boolean;
  noOwner?: boolean;
  create?: boolean;
}

export interface ImportOptions {
  connectionId: string;
  config: DBConnectionConfig;
  inputPath: string;
  compressed: boolean;
  clearMode?: 'none' | 'truncate' | 'drop';
}

export type ProgressCallback = (progress: {
  bytesProcessed: number;
  totalBytes?: number;
  percentage?: number;
  stage: 'preparing' | 'exporting' | 'importing' | 'completed' | 'error';
  message?: string;
  /** Translatable error for the renderer (falls back to `message`). */
  i18nKey?: string;
  i18nParams?: Record<string, string | number>;
}) => void;

export interface DumpCommandOptions {
  compress: boolean;
  tables?: string[];
  schemaOnly?: boolean;
  dataOnly?: boolean;
  clean?: boolean;
  noOwner?: boolean;
  create?: boolean;
}

