import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import type { DBConnectionsTable } from '@ownshell/core';
import type { CreateDatabaseUserOptions } from '../../../hooks/db-explorer/useDBDDLMutations';

interface AsyncMutation<TVariables, TResult = unknown> {
  mutateAsync: (variables: TVariables) => Promise<TResult>;
}

type ConnectResult = string | { connectionId?: string; silent: true };
type ConnectMutation = AsyncMutation<
  { configId: string; sshSessionId?: string; silent?: boolean },
  ConnectResult
>;
type DisconnectMutation = AsyncMutation<string | { connectionId: string; silent?: boolean }>;
type UpdateConnectionMutation = AsyncMutation<{
  id: string;
  update: {
    database?: string | null;
  };
  silent?: boolean;
}>;
type NamedOptionsMutation = AsyncMutation<{ name: string; options?: Record<string, unknown> }>;
type CreateDatabaseUserMutation = AsyncMutation<{
  username: string;
  options: CreateDatabaseUserOptions;
}>;
type NamedCascadeMutation = AsyncMutation<{ name: string; cascade?: boolean }>;
type DropDatabaseMutation = AsyncMutation<string>;

interface CreateTableColumn {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  primaryKey?: boolean;
  defaultValue?: string | null;
  unique?: boolean;
}

type CreateTableMutation = AsyncMutation<{
  name: string;
  columns: CreateTableColumn[];
  schema?: string;
}>;
type DropTableMutation = AsyncMutation<{ name: string; schema?: string; cascade?: boolean }>;

interface DBExplorerActionsContext {
  t: TFunction;
  sessionId?: string;
  selectedConfigId: string | null;
  activeConnectionId: string | null;
  selectedConnection?: DBConnectionsTable;
  selectedSchema: string | undefined;
  selectedTable: string | null;
  selectedSchemaToManage: string | null;
  selectedTableToDelete: string | null;
  createDBForConfig: string | null;
  resolvedSshSessionId?: string;
  isOperationInProgress: boolean;
  connectMutation: ConnectMutation;
  disconnectMutation: DisconnectMutation;
  updateConnectionMutation: UpdateConnectionMutation;
  createDatabaseMutation: NamedOptionsMutation;
  createUserMutation: CreateDatabaseUserMutation;
  dropDatabaseMutation: DropDatabaseMutation;
  createSchemaMutation: NamedOptionsMutation;
  dropSchemaMutation: NamedCascadeMutation;
  createTableMutation: CreateTableMutation;
  dropTableMutation: DropTableMutation;
  setActiveConnectionId: (value: string | null) => void;
  setSelectedTable: (value: string | null) => void;
  setSelectedSchema: (value: string | undefined) => void;
  setPage: (value: number) => void;
  setShowCreateDBDialog: (value: boolean) => void;
  setCreateDBForConfig: (value: string | null) => void;
  setShowCreateUserDialog: (value: boolean) => void;
  setShowCreateSchemaDialog: (value: boolean) => void;
  setShowDeleteSchemaDialog: (value: boolean) => void;
  setSelectedSchemaToManage: (value: string | null) => void;
  setShowCreateTableDialog: (value: boolean) => void;
  setShowDeleteTableDialog: (value: boolean) => void;
  setSelectedTableToDelete: (value: string | null) => void;
  setShowDeleteDBDialog: (value: boolean) => void;
  setIsSwitchingDatabase: (value: boolean) => void;
  refetchDatabases: () => void;
  refetchSchemas: () => void;
  refetchTables: () => void;
  refetchConnections: () => void;
}

export function useDBExplorerActions(ctx: DBExplorerActionsContext) {
  const {
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
  } = ctx;

  // Handle connection
  const handleConnect = async () => {
    if (!selectedConfigId) return;

    try {
      const connectionId = await connectMutation.mutateAsync({
        configId: selectedConfigId,
        sshSessionId: resolvedSshSessionId, // Use resolved SSH session
      });
      setActiveConnectionId((connectionId as string) || null);
      setSelectedTable(null);
      setPage(0);
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    if (!activeConnectionId) return;

    try {
      await disconnectMutation.mutateAsync(activeConnectionId);
      setActiveConnectionId(null);
      setSelectedTable(null);
      setPage(0);
    } catch (error) {
      // Error handled by mutation
    }
  };

  // DDL Handlers
  const handleCreateDatabase = async (name: string, options?: Record<string, unknown>) => {
    if (!createDBForConfig) return;

    try {
      // First, connect to the server if not already connected
      let connectionId = activeConnectionId;

      if (!connectionId || selectedConfigId !== createDBForConfig) {
        // Connect to server (using default database like 'postgres')
        connectionId = (await connectMutation.mutateAsync({
          configId: createDBForConfig,
          sshSessionId: sessionId,
        })) as string;
      }

      if (!connectionId) {
        throw new Error('Failed to establish connection');
      }

      // Create the database
      await createDatabaseMutation.mutateAsync({ name, options });

      // Close dialog
      setShowCreateDBDialog(false);
      setCreateDBForConfig(null);

      // Refresh database list
      refetchDatabases();

      // TODO: Switch to the new database (requires reconnecting with new database name)
      // For now, just refresh tables
      refetchTables();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleCreateSchema = async (name: string, options?: Record<string, unknown>) => {
    try {
      await createSchemaMutation.mutateAsync({ name, options });

      // Close dialog
      setShowCreateSchemaDialog(false);

      // Refresh schema list and tables
      refetchSchemas();
      refetchTables();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleCreateUser = async (username: string, options: CreateDatabaseUserOptions) => {
    try {
      await createUserMutation.mutateAsync({ username, options });
      setShowCreateUserDialog(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleCreateTable = async (
    name: string,
    columns: Array<{
      name: string;
      type: string;
      length?: number;
      precision?: number;
      scale?: number;
      nullable?: boolean;
      primaryKey?: boolean;
      defaultValue?: string | null;
      unique?: boolean;
    }>
  ) => {
    try {
      await createTableMutation.mutateAsync({
        name,
        columns,
        schema: selectedSchema,
      });

      // Close dialog
      setShowCreateTableDialog(false);

      // Refresh tables list
      refetchTables();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDropSchema = async () => {
    if (!selectedSchemaToManage) return;

    try {
      await dropSchemaMutation.mutateAsync({ name: selectedSchemaToManage, cascade: false });

      // Close dialog
      setShowDeleteSchemaDialog(false);
      setSelectedSchemaToManage(null);

      // If the deleted schema was selected, reset to 'public'
      if (selectedSchema === selectedSchemaToManage) {
        setSelectedSchema('public');
      }

      // Refresh schema list and tables
      refetchSchemas();
      refetchTables();
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Handle table drop
  const handleDropTable = async () => {
    if (!selectedTableToDelete) return;

    try {
      await dropTableMutation.mutateAsync({
        name: selectedTableToDelete,
        schema: selectedSchema,
        cascade: false,
      });

      // Close dialog
      setShowDeleteTableDialog(false);
      setSelectedTableToDelete(null);

      // If the deleted table was selected, clear selection
      if (selectedTable === selectedTableToDelete) {
        setSelectedTable(null);
      }

      // Refresh tables list
      refetchTables();
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Handle database drop
  const handleDropDatabase = async () => {
    if (!selectedConnection?.database || !activeConnectionId) return;

    const dbToDelete = selectedConnection.database;

    try {
      // Step 1: Disconnect from current database first (can't drop connected DB)
      await disconnectMutation.mutateAsync({ connectionId: activeConnectionId, silent: true });
      setActiveConnectionId(null);

      // Step 2: Connect to a different database (postgres/mysql default) to drop the target
      // For PostgreSQL, connect to 'postgres' database
      // For MySQL, connect to 'mysql' database
      const defaultDb = selectedConnection.type === 'mysql' ? 'mysql' : 'postgres';

      // Update config temporarily to connect to default DB
      await updateConnectionMutation.mutateAsync({
        id: selectedConfigId!,
        update: { database: defaultDb },
        silent: true,
      });

      // Connect to default DB
      const result = await connectMutation.mutateAsync({
        configId: selectedConfigId!,
        sshSessionId: sessionId,
        silent: true,
      });
      const newConnectionId =
        typeof result === 'object' && result !== null ? result.connectionId : result;

      // Step 3: Now drop the database
      await dropDatabaseMutation.mutateAsync(dbToDelete);

      // Step 4: Disconnect
      if (newConnectionId) {
        await disconnectMutation.mutateAsync({ connectionId: newConnectionId, silent: true });
      }

      // Close dialog
      setShowDeleteDBDialog(false);

      // Refresh database list
      refetchDatabases();
      refetchConnections();

      toast.success(t('db.databaseDeleted', { name: dbToDelete }));
    } catch (error) {
      toast.error(
        `${t('db.deleteDatabaseFailed', 'Failed to delete database')}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  // Handle database switch (instant switch without confirmation)
  const handleDatabaseSwitch = async (newDatabase: string) => {
    if (!selectedConfigId || !selectedConnection || !activeConnectionId) return;

    // Skip if selecting the current database
    if (newDatabase === selectedConnection.database) {
      return;
    }

    // Block switch if export/import is in progress
    if (isOperationInProgress) {
      toast.error(
        t('db.operationInProgress', 'Cannot switch database while export/import is in progress')
      );
      return;
    }

    setIsSwitchingDatabase(true);

    try {
      // Step 1: Disconnect from current database (silently)
      await disconnectMutation.mutateAsync({ connectionId: activeConnectionId, silent: true });
      setActiveConnectionId(null);

      // Step 2: Update connection config with new database (silently)
      await updateConnectionMutation.mutateAsync({
        id: selectedConfigId,
        update: { database: newDatabase },
        silent: true,
      });

      // Step 3: Reconnect with new database (silently)
      const result = await connectMutation.mutateAsync({
        configId: selectedConfigId,
        sshSessionId: sessionId,
        silent: true,
      });
      // Result is an object with connectionId when silent=true
      const connectionId =
        typeof result === 'object' && result !== null ? result.connectionId : result;
      setActiveConnectionId(connectionId || null);

      // Step 4: Invalidate all queries to refresh UI
      refetchDatabases();
      refetchSchemas();
      refetchTables();

      // Reset selection
      setSelectedTable(null);
      setSelectedSchema('public');
      setPage(0);

      toast.success(t('db.databaseSwitched', { name: newDatabase }));
    } catch (error) {
      toast.error(
        `${t('db.switchDatabaseFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsSwitchingDatabase(false);
    }
  };

  return {
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
  };
}
