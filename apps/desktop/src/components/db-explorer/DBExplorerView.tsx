/**
 * Database Explorer View (v1.14.0)
 *
 * Main component for database management with:
 * - Connection management (Postgres, MySQL)
 * - Table browser with schema info
 * - Data grid with inline editing
 * - SQL query console
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { DBConnectionsTable } from '@ownshell/core';
import {
  useDBConnections,
  useDBTables,
  useDBTableSchema,
  useDBTableData,
  useDBRowCount,
  useConnectDB,
  useDisconnectDB,
  useUpdateDBConnection,
  useCreateDatabase,
  useCreateDatabaseUser,
  useDropDatabase,
  useListDatabases,
  useListSchemas,
  useCreateSchema,
  useDropSchema,
  useCreateTable,
  useDropTable,
  useDBExportImport,
} from '../../hooks/db-explorer';
import { queryKeys } from '../../lib/queryClient';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useDBExplorerViewStore } from '../../stores/useDBExplorerViewStore';
import { DBExplorerHeader } from './view/DBExplorerHeader';
import { DBExplorerContent, MainTab } from './view/DBExplorerContent';
import { DBExplorerDialogs } from './view/DBExplorerDialogs';
import { useDBExplorerActions } from './view/useDBExplorerActions';
import { DBShellMissingToolDialog } from './DBShellMissingToolDialog';

interface DBExplorerViewProps {
  /** SSH session ID for tunnel support (optional for standalone/local mode) */
  sessionId?: string;
  /** Filter connections to only show those linked to this SSH host (optional) */
  filteredHostId?: string;
  /** Pre-selected connection ID when opened from sidebar */
  initialConnectionId?: string;
  /** Stable per-pane key so multiple panes for the same connection keep separate UI state */
  viewKey?: string;
}

export const DBExplorerView: React.FC<DBExplorerViewProps> = ({
  sessionId,
  filteredHostId,
  initialConnectionId,
  viewKey,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createLocalSession = useTerminalStore((state) => state.createLocalSession);
  const addPane = useWorkspaceStore((state) => state.addPane);
  const explorerStateKey = useMemo(() => {
    if (viewKey) return `view:${viewKey}`;
    if (initialConnectionId) return `connection:${initialConnectionId}`;
    if (filteredHostId) return `host:${filteredHostId}`;
    if (sessionId) return `session:${sessionId}`;
    return 'standalone';
  }, [filteredHostId, initialConnectionId, sessionId, viewKey]);
  const persistedViewState = useDBExplorerViewStore((state) => state.views[explorerStateKey]);
  const setStoredViewState = useDBExplorerViewStore((state) => state.setViewState);

  // State
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(
    persistedViewState?.selectedConfigId ?? initialConnectionId ?? null
  );
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    persistedViewState?.activeConnectionId ?? null
  );
  const [selectedTable, setSelectedTable] = useState<string | null>(
    persistedViewState?.selectedTable ?? null
  );
  const [selectedSchema, setSelectedSchema] = useState<string | undefined>(
    persistedViewState?.selectedSchema
  );
  const [mainTab, setMainTab] = useState<MainTab>(
    persistedViewState?.mainTab ?? 'data'
  );
  const [page, setPage] = useState(persistedViewState?.page ?? 0);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showCreateDBDialog, setShowCreateDBDialog] = useState(false);
  const [createDBForConfig, setCreateDBForConfig] = useState<string | null>(null);
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showDeleteDBDialog, setShowDeleteDBDialog] = useState(false);
  const [showCreateSchemaDialog, setShowCreateSchemaDialog] = useState(false);
  const [showDeleteSchemaDialog, setShowDeleteSchemaDialog] = useState(false);
  const [selectedSchemaToManage, setSelectedSchemaToManage] = useState<string | null>(null);
  const [isSwitchingDatabase, setIsSwitchingDatabase] = useState(false);
  const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);
  const [showDeleteTableDialog, setShowDeleteTableDialog] = useState(false);
  const [selectedTableToDelete, setSelectedTableToDelete] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [missingShellTool, setMissingShellTool] = useState<string | null>(null);
  const previousActiveConnectionIdRef = useRef(activeConnectionId);
  const previousSelectedTableRef = useRef(selectedTable);

  useEffect(() => {
    setStoredViewState(explorerStateKey, {
      selectedConfigId,
      activeConnectionId,
      selectedTable,
      selectedSchema,
      mainTab,
      page,
    });
  }, [
    activeConnectionId,
    explorerStateKey,
    mainTab,
    page,
    selectedConfigId,
    selectedSchema,
    selectedTable,
    setStoredViewState,
  ]);

  useEffect(() => {
    if (!activeConnectionId) return;

    let cancelled = false;
    void window.electronAPI.dbExplorer
      .status(activeConnectionId)
      .then((result) => {
        if (cancelled) return;
        if (!result?.success || result.state?.status !== 'connected') {
          setActiveConnectionId(null);
          setSelectedTable(null);
          setSelectedSchema(undefined);
          setPage(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveConnectionId(null);
          setSelectedTable(null);
          setSelectedSchema(undefined);
          setPage(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeConnectionId]);

  // Query hooks
  const {
    data: allConnections,
    isLoading: loadingConnections,
    isFetching: fetchingConnections,
    refetch: refetchConnections,
  } = useDBConnections();
  const connectMutation = useConnectDB();
  const disconnectMutation = useDisconnectDB();
  const updateConnectionMutation = useUpdateDBConnection();

  // DDL Mutations
  const createDatabaseMutation = useCreateDatabase(activeConnectionId);
  const createUserMutation = useCreateDatabaseUser(activeConnectionId);
  const dropDatabaseMutation = useDropDatabase(activeConnectionId);
  const createSchemaMutation = useCreateSchema(activeConnectionId);
  const dropSchemaMutation = useDropSchema(activeConnectionId);
  const createTableMutation = useCreateTable(activeConnectionId);
  const dropTableMutation = useDropTable(activeConnectionId);

  // List databases for PostgreSQL/MySQL (for database selector and delete)
  const {
    data: availableDatabases,
    refetch: refetchDatabases,
    isLoading: isLoadingDatabases,
    isFetching: fetchingDatabases,
  } = useListDatabases(activeConnectionId);

  // Export/Import hook
  const {
    exportDatabase,
    importDatabase,
    isOperationInProgress,
    isImporting,
    progress: transferProgress,
  } = useDBExportImport();

  // Filter connections based on filteredHostId (for session-specific view)
  const connections = filteredHostId
    ? allConnections?.filter((c: DBConnectionsTable) => c.ssh_host_id === filteredHostId)
    : allConnections;

  // Table data (only when connected and table selected)
  const {
    data: tables,
    isLoading: loadingTables,
    isFetching: fetchingTables,
    refetch: refetchTables,
  } = useDBTables(activeConnectionId);
  const {
    data: tableSchema,
    isLoading: loadingSchema,
    isFetching: fetchingSchema,
  } = useDBTableSchema(
    activeConnectionId,
    selectedTable,
    selectedSchema
  );
  const {
    data: tableData,
    isLoading: loadingData,
    isFetching: fetchingData,
  } = useDBTableData(activeConnectionId, selectedTable, {
    schema: selectedSchema,
    page,
    pageSize: 100,
  });
  const { data: rowCount, isFetching: fetchingRowCount } = useDBRowCount(
    activeConnectionId,
    selectedTable,
    {
      schema: selectedSchema,
    }
  );

  // Get selected connection config
  const selectedConnection = connections?.find(
    (c: DBConnectionsTable) => c.id === selectedConfigId
  );

  // Look up SSH session for the selected connection's host
  // This allows DB connections to work even when opened from sidebar (not from terminal)
  const resolvedSshSessionId = useTerminalStore((state) => {
    // Use prop if provided (for embedded DB explorer in terminal)
    if (sessionId) return sessionId;

    // Otherwise, look up based on selected connection's SSH host
    const sshHostId = selectedConnection?.ssh_host_id;
    if (!sshHostId || selectedConnection?.connection_mode !== 'ssh') return undefined;

    // First check active terminal sessions
    const activeSession = state.sessions.find(
      (s) => s.kind === 'ssh' && s.host?.id === sshHostId && s.sessionId
    );
    if (activeSession?.sessionId) return activeSession.sessionId;

    // Then check background sessions (detached but still alive)
    const backgroundSession = state.backgroundSessions.get(sshHostId);
    return backgroundSession?.sshSessionId;
  });

  // Derived connection properties
  const isConnected = !!activeConnectionId;
  const isPostgres = selectedConnection?.type === 'postgres';
  const canOpenShell = Boolean(
    selectedConnection &&
      isConnected &&
      selectedConnection.connection_mode !== 'ssh' &&
      selectedConnection.read_only !== 1 &&
      !connectMutation.isPending &&
      !disconnectMutation.isPending &&
      !isOperationInProgress
  );

  // List schemas for PostgreSQL (for schema selector)
  const {
    data: availableSchemas,
    refetch: refetchSchemas,
    isLoading: isLoadingSchemas,
    isFetching: fetchingSchemas,
  } = useListSchemas(activeConnectionId, isPostgres && isConnected);

  const {
    handleConnect,
    handleDisconnect,
    handleCreateDatabase,
    handleCreateUser,
    handleCreateSchema,
    handleCreateTable,
    handleDropSchema,
    handleDropTable,
    handleDropDatabase,
    handleDatabaseSwitch,
  } = useDBExplorerActions({
    t,
    sessionId,
    selectedConfigId,
    activeConnectionId,
    selectedConnection,
    selectedSchema,
    selectedTable,
    selectedSchemaToManage,
    selectedTableToDelete,
    createDBForConfig,
    resolvedSshSessionId,
    isOperationInProgress,
    connectMutation,
    disconnectMutation,
    updateConnectionMutation,
    createDatabaseMutation,
    createUserMutation,
    dropDatabaseMutation,
    createSchemaMutation,
    dropSchemaMutation,
    createTableMutation,
    dropTableMutation,
    setActiveConnectionId,
    setSelectedTable,
    setSelectedSchema,
    setPage,
    setShowCreateDBDialog,
    setCreateDBForConfig,
    setShowCreateUserDialog,
    setShowCreateSchemaDialog,
    setShowDeleteSchemaDialog,
    setSelectedSchemaToManage,
    setShowCreateTableDialog,
    setShowDeleteTableDialog,
    setSelectedTableToDelete,
    setShowDeleteDBDialog,
    setIsSwitchingDatabase,
    refetchDatabases,
    refetchSchemas,
    refetchTables,
    refetchConnections,
  });

  // Reset selection when connection changes
  useEffect(() => {
    if (previousActiveConnectionIdRef.current === activeConnectionId) {
      return;
    }
    previousActiveConnectionIdRef.current = activeConnectionId;
    setSelectedTable(null);
    setSelectedSchema(undefined);
    setPage(0);
    setStoredViewState(explorerStateKey, {
      mongoSelectedCollection: null,
      mongoSelectedDocumentId: null,
      mongoFilterJson: '{}',
      mongoSkip: 0,
    });
  }, [activeConnectionId, explorerStateKey, setStoredViewState]);

  // Reset page when table changes
  useEffect(() => {
    if (previousSelectedTableRef.current === selectedTable) {
      return;
    }
    previousSelectedTableRef.current = selectedTable;
    setPage(0);
  }, [selectedTable]);

  const isConnecting = connectMutation.isPending;
  const isDisconnecting = disconnectMutation.isPending;
  const isRefreshingExplorer =
    fetchingConnections ||
    fetchingDatabases ||
    fetchingSchemas ||
    fetchingTables ||
    fetchingSchema ||
    fetchingData ||
    fetchingRowCount;

  const refreshConnectionQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dbExplorer.connections() });

    if (!activeConnectionId) return;

    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === queryKeys.dbExplorer.all[0] &&
        query.queryKey[2] === activeConnectionId,
    });
  }, [activeConnectionId, queryClient]);

  const refreshSelectedTableQueries = useCallback(() => {
    if (!activeConnectionId || !selectedTable) {
      refreshConnectionQueries();
      return;
    }

    void queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        const section = key[1];

        if (key[0] !== queryKeys.dbExplorer.all[0] || key[2] !== activeConnectionId) {
          return false;
        }

        if (section === 'tables') {
          return true;
        }

        return (
          (section === 'data' || section === 'rowCount' || section === 'schema') &&
          key[3] === selectedTable
        );
      },
    });
  }, [activeConnectionId, queryClient, refreshConnectionQueries, selectedTable]);

  const handleMongoViewStateChange = useCallback(
    (update: {
      selectedCollection: string | null;
      selectedDocumentId: string | null;
      filterJson: string;
      skip: number;
    }) => {
      setStoredViewState(explorerStateKey, {
        mongoSelectedCollection: update.selectedCollection,
        mongoSelectedDocumentId: update.selectedDocumentId,
        mongoFilterJson: update.filterJson,
        mongoSkip: update.skip,
      });
    },
    [explorerStateKey, setStoredViewState]
  );

  const handleOpenShell = useCallback(async () => {
    if (!selectedConnection) return;

    if (!activeConnectionId) {
      toast.error(t('db.openShellConnectFirst', 'Connect to the database first'));
      return;
    }

    if (selectedConnection.connection_mode === 'ssh') {
      toast.error(t('db.openShellUnsupported', 'Shell is available for local/direct connections'));
      return;
    }

    if (selectedConnection.read_only === 1) {
      toast.error(t('db.openShellReadOnlyUnsupported', 'Shell is disabled for read-only connections'));
      return;
    }

    const result = await window.electronAPI.dbConnections.createShellPty({
      connectionId: selectedConnection.id,
      cols: 120,
      rows: 32,
    });
    if (!result.success || !result.sessionId) {
      if (result.reason === 'missing-tool') {
        setMissingShellTool(result.tool || 'Database CLI');
        return;
      }

      toast.error(
        result.reason === 'ssh'
          ? t('db.openShellUnsupported', 'Shell is available for local/direct connections')
          : t('db.openShellMissingTarget', 'Shell command cannot be built for this connection')
      );
      return;
    }

    const termSessionId = createLocalSession({
      sessionId: result.sessionId,
    });
    addPane({
      type: 'terminal',
      contentId: termSessionId,
      title: `Shell: ${selectedConnection.name}`,
    });
  }, [activeConnectionId, addPane, createLocalSession, selectedConnection, t]);

  // Check if connection is Redis (key-value store, not SQL-based)
  const isRedisConnection = selectedConnection?.type === 'redis';
  // Check if connection is MongoDB (document store, not SQL-based)
  const isMongoDBConnection = selectedConnection?.type === 'mongodb';
  // Remote SQLite files open as a read-only local copy (no write-back to the server).
  const isReadOnlyConnection =
    selectedConnection?.read_only === 1 ||
    (selectedConnection?.type === 'sqlite' && selectedConnection.is_remote === 1);

  return (
    <div className="flex flex-col h-full bg-background">
      <DBExplorerHeader
        selectedConfigId={selectedConfigId}
        connections={connections}
        selectedConnection={selectedConnection}
        isConnected={isConnected}
        isPostgres={isPostgres}
        isConnecting={isConnecting}
        isDisconnecting={isDisconnecting}
        isOperationInProgress={isOperationInProgress}
        isLoadingDatabases={isLoadingDatabases}
        isSwitchingDatabase={isSwitchingDatabase}
        isLoadingSchemas={isLoadingSchemas}
        loadingConnections={loadingConnections || fetchingConnections}
        loadingTables={loadingTables || isRefreshingExplorer}
        selectedSchema={selectedSchema}
        availableDatabases={availableDatabases}
        availableSchemas={availableSchemas}
        onSelectConnection={(id) => {
          setSelectedConfigId(id);
          if (activeConnectionId) {
            handleDisconnect();
          }
        }}
        onDatabaseSwitch={handleDatabaseSwitch}
        onSchemaChange={setSelectedSchema}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onNewConnection={() => setShowConnectionModal(true)}
        onRefresh={refreshConnectionQueries}
        onCreateDatabase={() => {
          if (selectedConfigId) {
            setCreateDBForConfig(selectedConfigId);
            setShowCreateDBDialog(true);
          }
        }}
        onCreateUser={() => setShowCreateUserDialog(true)}
        onCreateSchema={() => setShowCreateSchemaDialog(true)}
        onDropSchema={() => {
          if (selectedSchema) {
            setSelectedSchemaToManage(selectedSchema);
            setShowDeleteSchemaDialog(true);
          }
        }}
        onCreateTable={() => setShowCreateTableDialog(true)}
        onDropTable={() => {
          if (selectedTable) {
            setSelectedTableToDelete(selectedTable);
            setShowDeleteTableDialog(true);
          }
        }}
        onExportDatabase={() => setShowExportModal(true)}
        onImportDatabase={() => setShowImportModal(true)}
        onDropDatabase={() => setShowDeleteDBDialog(true)}
        onOpenShell={handleOpenShell}
        canCreateDatabase={!!(
          selectedConnection &&
          (selectedConnection.type === 'postgres' || selectedConnection.type === 'mysql') &&
          selectedConfigId &&
          !isReadOnlyConnection &&
          !isConnecting &&
          !isDisconnecting
        )}
        canCreateUser={!!(
          isConnected &&
          activeConnectionId &&
          selectedConnection &&
          ['postgres', 'mysql', 'mongodb', 'redis'].includes(selectedConnection.type) &&
          !isReadOnlyConnection &&
          !isConnecting &&
          !isDisconnecting &&
          !isOperationInProgress
        )}
        canCreateSchema={!!(
          isConnected &&
          isPostgres &&
          !isReadOnlyConnection &&
          !isConnecting &&
          !isDisconnecting
        )}
        canDropSchema={!!(
          isConnected &&
          isPostgres &&
          selectedSchema &&
          !isReadOnlyConnection &&
          !['public', 'information_schema', 'pg_catalog'].includes(selectedSchema.toLowerCase()) &&
          !isConnecting &&
          !isDisconnecting &&
          !dropSchemaMutation.isPending
        )}
        canCreateTable={!!(
          isConnected &&
          ['postgres', 'mysql', 'sqlite'].includes(selectedConnection?.type ?? '') &&
          !isReadOnlyConnection &&
          !isConnecting &&
          !isDisconnecting
        )}
        canDropTable={!!(
          isConnected &&
          selectedTable &&
          !isReadOnlyConnection &&
          !isConnecting &&
          !isDisconnecting
        )}
        canExportDatabase={!!(
          isConnected &&
          activeConnectionId &&
          selectedConfigId &&
          !isOperationInProgress
        )}
        canImportDatabase={!!(
          isConnected &&
          activeConnectionId &&
          selectedConfigId &&
          !isReadOnlyConnection &&
          !isOperationInProgress
        )}
        canDropDatabase={!!(
          isConnected &&
          selectedConnection?.database &&
          !isReadOnlyConnection &&
          !isConnecting &&
          !isDisconnecting &&
          !isOperationInProgress
        )}
        canOpenShell={canOpenShell}
        isReadOnly={isReadOnlyConnection}
      />

      <DBExplorerContent
        isConnected={isConnected}
        isRedisConnection={isRedisConnection}
        isMongoDBConnection={isMongoDBConnection}
        isReadOnly={isReadOnlyConnection}
        activeConnectionId={activeConnectionId}
        selectedTable={selectedTable}
        selectedSchema={selectedSchema}
        mainTab={mainTab}
        page={page}
        mongoSelectedCollection={persistedViewState?.mongoSelectedCollection ?? null}
        mongoSelectedDocumentId={persistedViewState?.mongoSelectedDocumentId ?? null}
        mongoFilterJson={persistedViewState?.mongoFilterJson ?? '{}'}
        mongoSkip={persistedViewState?.mongoSkip ?? 0}
        rowCount={rowCount}
        connectionsLength={connections?.length || 0}
        tables={tables || []}
        tableData={tableData}
        tableSchema={tableSchema}
        loadingTables={loadingTables || fetchingTables}
        loadingSchema={loadingSchema || fetchingSchema}
        loadingData={loadingData || fetchingData}
        onSelectTable={(table, schema) => {
          setSelectedTable(table);
          setSelectedSchema(schema);
        }}
        onRefreshTables={refreshConnectionQueries}
        onNewConnection={() => setShowConnectionModal(true)}
        onTabChange={setMainTab}
        onPageChange={setPage}
        onRefreshData={refreshSelectedTableQueries}
        onMongoViewStateChange={handleMongoViewStateChange}
      />

      <DBExplorerDialogs
        showConnectionModal={showConnectionModal}
        setShowConnectionModal={setShowConnectionModal}
        onConnectionCreated={setSelectedConfigId}
        showCreateDBDialog={showCreateDBDialog}
        createDBForConfig={createDBForConfig}
        setShowCreateDBDialog={setShowCreateDBDialog}
        setCreateDBForConfig={setCreateDBForConfig}
        handleCreateDatabase={handleCreateDatabase}
        createDatabasePending={createDatabaseMutation.isPending}
        connections={connections}
        showCreateUserDialog={showCreateUserDialog}
        setShowCreateUserDialog={setShowCreateUserDialog}
        handleCreateUser={handleCreateUser}
        createUserPending={createUserMutation.isPending}
        showCreateSchemaDialog={showCreateSchemaDialog}
        setShowCreateSchemaDialog={setShowCreateSchemaDialog}
        handleCreateSchema={handleCreateSchema}
        createSchemaPending={createSchemaMutation.isPending}
        showDeleteSchemaDialog={showDeleteSchemaDialog}
        selectedSchemaToManage={selectedSchemaToManage}
        setShowDeleteSchemaDialog={setShowDeleteSchemaDialog}
        setSelectedSchemaToManage={setSelectedSchemaToManage}
        handleDropSchema={handleDropSchema}
        dropSchemaPending={dropSchemaMutation.isPending}
        showDeleteTableDialog={showDeleteTableDialog}
        selectedTableToDelete={selectedTableToDelete}
        setShowDeleteTableDialog={setShowDeleteTableDialog}
        setSelectedTableToDelete={setSelectedTableToDelete}
        handleDropTable={handleDropTable}
        dropTablePending={dropTableMutation.isPending}
        showCreateTableDialog={showCreateTableDialog}
        selectedConnection={selectedConnection}
        selectedSchema={selectedSchema}
        setShowCreateTableDialog={setShowCreateTableDialog}
        handleCreateTable={handleCreateTable}
        createTablePending={createTableMutation.isPending}
        showDeleteDBDialog={showDeleteDBDialog}
        setShowDeleteDBDialog={setShowDeleteDBDialog}
        handleDropDatabase={handleDropDatabase}
        dropDatabasePending={dropDatabaseMutation.isPending}
        disconnectPending={disconnectMutation.isPending}
        connectPending={connectMutation.isPending}
        showExportModal={showExportModal}
        activeConnectionId={activeConnectionId}
        selectedConfigId={selectedConfigId}
        setShowExportModal={setShowExportModal}
        exportDatabase={exportDatabase}
        isOperationInProgress={isOperationInProgress}
        isImporting={isImporting}
        transferProgress={transferProgress}
        showImportModal={showImportModal}
        setShowImportModal={setShowImportModal}
        importDatabase={importDatabase}
      />

      <DBShellMissingToolDialog
        isOpen={!!missingShellTool}
        tool={missingShellTool}
        onClose={() => setMissingShellTool(null)}
      />
    </div>
  );
};

export default DBExplorerView;
