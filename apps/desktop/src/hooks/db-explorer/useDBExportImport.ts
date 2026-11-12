/**
 * Database Export/Import Hook
 *
 * Provides export and import functionality for database connections.
 * Handles progress tracking and toast notifications.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { i18n } from '../../i18n';
import { queryKeys } from '../../lib/queryClient';

export interface DBTransferProgress {
  operationId?: string;
  connectionId?: string;
  bytesProcessed: number;
  totalBytes?: number;
  percentage?: number;
  stage: 'preparing' | 'exporting' | 'importing' | 'completed' | 'error';
  message?: string;
}

interface ExportOptions {
  compress?: boolean;
  tables?: string[];
  schemaOnly?: boolean;
  dataOnly?: boolean;
  // pg_dump specific options
  clean?: boolean;
  noOwner?: boolean;
  create?: boolean;
}

interface ImportOptions {
  /** Clear mode before import: none, truncate (delete data), drop (delete tables) */
  clearMode?: 'none' | 'truncate' | 'drop';
}

export function useDBExportImport() {
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<DBTransferProgress | null>(null);
  const exportOperationIdRef = useRef<string | null>(null);
  const importOperationIdRef = useRef<string | null>(null);

  const refreshConnectionQueries = useCallback(
    (connectionId: string) => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === queryKeys.dbExplorer.all[0] &&
          query.queryKey[2] === connectionId,
      });
    },
    [queryClient]
  );

  // Subscribe to progress events
  useEffect(() => {
    const unsubExport = window.electronAPI.dbExplorer.onExportProgress((prog) => {
      if (!prog.operationId || prog.operationId !== exportOperationIdRef.current) {
        return;
      }

      setProgress(prog);
      if (prog.stage === 'completed') {
        toast.success(prog.message || i18n.t('db.exportCompleted'));
        setIsExporting(false);
        exportOperationIdRef.current = null;
      } else if (prog.stage === 'error') {
        toast.error(prog.message || i18n.t('db.exportFailed'));
        setIsExporting(false);
        setProgress(null);
        exportOperationIdRef.current = null;
      }
    });

    const unsubImport = window.electronAPI.dbExplorer.onImportProgress((prog) => {
      if (!prog.operationId || prog.operationId !== importOperationIdRef.current) {
        return;
      }

      setProgress(prog);
      if (prog.stage === 'completed') {
        toast.success(prog.message || i18n.t('db.importCompleted'));
        setIsImporting(false);
        if (prog.connectionId) {
          refreshConnectionQueries(prog.connectionId);
        }
        importOperationIdRef.current = null;
      } else if (prog.stage === 'error') {
        toast.error(
          prog.i18nKey ? i18n.t(prog.i18nKey, prog.i18nParams) : prog.message || i18n.t('db.importFailed')
        );
        setIsImporting(false);
        setProgress(null);
        importOperationIdRef.current = null;
      }
    });

    return () => {
      unsubExport();
      unsubImport();
    };
  }, [refreshConnectionQueries]);

  /**
   * Export database to file
   */
  const exportDatabase = useCallback(
    async (connectionId: string, configId: string, options: ExportOptions = {}) => {
      if (isExporting || isImporting) {
        toast.error(i18n.t('db.operationInProgress'));
        return false;
      }

      const operationId = createOperationId('export');
      exportOperationIdRef.current = operationId;
      setIsExporting(true);
      setProgress({ bytesProcessed: 0, stage: 'preparing', message: 'Preparing export...' });

      try {
        const result = await window.electronAPI.dbExplorer.exportDatabase({
          connectionId,
          configId,
          operationId,
          compress: options.compress ?? true,
          tables: options.tables,
          schemaOnly: options.schemaOnly,
          dataOnly: options.dataOnly,
          clean: options.clean,
          noOwner: options.noOwner,
          create: options.create,
        });

        if (!result.success) {
          throw new Error(result.error || 'Export failed');
        }

        // Success toast is handled by progress event
        if (exportOperationIdRef.current === operationId) {
          toast.success(i18n.t('db.exportCompleted'));
          setIsExporting(false);
          exportOperationIdRef.current = null;
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        if (!isCancelledMessage(message)) {
          toast.error(message);
        }
        setIsExporting(false);
        setProgress(null);
        exportOperationIdRef.current = null;
        return false;
      }
    },
    [isExporting, isImporting]
  );

  /**
   * Import database from file
   */
  const importDatabase = useCallback(
    async (connectionId: string, configId: string, options: ImportOptions = {}) => {
      if (isExporting || isImporting) {
        toast.error(i18n.t('db.operationInProgress'));
        return false;
      }

      const operationId = createOperationId('import');
      importOperationIdRef.current = operationId;
      setIsImporting(true);
      setProgress({ bytesProcessed: 0, stage: 'preparing', message: 'Preparing import...' });

      try {
        const result = await window.electronAPI.dbExplorer.importDatabase({
          connectionId,
          configId,
          operationId,
          clearMode: options.clearMode,
        });

        if (!result.success) {
          throw new Error(result.error || 'Import failed');
        }

        // Success toast is handled by progress event
        if (importOperationIdRef.current === operationId) {
          toast.success(i18n.t('db.importCompleted'));
          setIsImporting(false);
          refreshConnectionQueries(connectionId);
          importOperationIdRef.current = null;
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        if (!isCancelledMessage(message)) {
          toast.error(message);
        }
        setIsImporting(false);
        setProgress(null);
        importOperationIdRef.current = null;
        return false;
      }
    },
    [isExporting, isImporting, refreshConnectionQueries]
  );

  /**
   * Check if local tools are available
   */
  const checkTools = useCallback(
    async (dbType: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'mongodb') => {
      try {
        const result = await window.electronAPI.dbExplorer.checkTools(dbType);
        return result;
      } catch {
        return { success: false, available: false };
      }
    },
    []
  );

  return {
    isExporting,
    isImporting,
    isOperationInProgress: isExporting || isImporting,
    progress,
    exportDatabase,
    importDatabase,
    checkTools,
  };
}

function createOperationId(prefix: 'export' | 'import'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isCancelledMessage(message: string): boolean {
  return message.toLowerCase().includes('cancelled');
}
