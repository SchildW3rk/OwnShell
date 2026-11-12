import { useTranslation } from 'react-i18next';
import type { DBConnectionsTable } from '@ownshell/core';
import { DBConnectionModal } from '../DBConnectionModal';
import { CreateDatabaseDialog } from '../CreateDatabaseDialog';
import { DeleteConfirmDialog } from '../DeleteConfirmDialog';
import { CreateSchemaDialog } from '../CreateSchemaDialog';
import { CreateTableDialog } from '../CreateTableDialog';
import { CreateDatabaseUserDialog } from '../CreateDatabaseUserDialog';
import { ExportDatabaseModal, ExportDatabaseOptions } from '../ExportDatabaseModal';
import { ImportDatabaseModal, ImportDatabaseOptions } from '../ImportDatabaseModal';
import type { DBTransferProgress } from '../../../hooks/db-explorer/useDBExportImport';
import type { CreateDatabaseUserOptions } from '../../../hooks/db-explorer/useDBDDLMutations';

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

type ExportRequestOptions = Pick<
  ExportDatabaseOptions,
  'compress' | 'schemaOnly' | 'dataOnly' | 'clean' | 'noOwner' | 'create'
>;
type ImportRequestOptions = Pick<ImportDatabaseOptions, 'clearMode'>;

export interface DBExplorerDialogsProps {
  showConnectionModal: boolean;
  setShowConnectionModal: (value: boolean) => void;
  onConnectionCreated: (id: string) => void;
  showCreateDBDialog: boolean;
  createDBForConfig: string | null;
  setShowCreateDBDialog: (value: boolean) => void;
  setCreateDBForConfig: (value: string | null) => void;
  handleCreateDatabase: (name: string, options?: Record<string, unknown>) => void;
  createDatabasePending: boolean;
  connections?: DBConnectionsTable[];
  showCreateUserDialog: boolean;
  setShowCreateUserDialog: (value: boolean) => void;
  handleCreateUser: (username: string, options: CreateDatabaseUserOptions) => void;
  createUserPending: boolean;
  showCreateSchemaDialog: boolean;
  setShowCreateSchemaDialog: (value: boolean) => void;
  handleCreateSchema: (name: string, options?: Record<string, unknown>) => void;
  createSchemaPending: boolean;
  showDeleteSchemaDialog: boolean;
  selectedSchemaToManage: string | null;
  setShowDeleteSchemaDialog: (value: boolean) => void;
  setSelectedSchemaToManage: (value: string | null) => void;
  handleDropSchema: () => void;
  dropSchemaPending: boolean;
  showDeleteTableDialog: boolean;
  selectedTableToDelete: string | null;
  setShowDeleteTableDialog: (value: boolean) => void;
  setSelectedTableToDelete: (value: string | null) => void;
  handleDropTable: () => void;
  dropTablePending: boolean;
  showCreateTableDialog: boolean;
  selectedConnection?: DBConnectionsTable;
  selectedSchema?: string;
  setShowCreateTableDialog: (value: boolean) => void;
  handleCreateTable: (name: string, columns: CreateTableColumn[]) => void;
  createTablePending: boolean;
  showDeleteDBDialog: boolean;
  setShowDeleteDBDialog: (value: boolean) => void;
  handleDropDatabase: () => void;
  dropDatabasePending: boolean;
  disconnectPending: boolean;
  connectPending: boolean;
  showExportModal: boolean;
  activeConnectionId: string | null;
  selectedConfigId: string | null;
  setShowExportModal: (value: boolean) => void;
  exportDatabase: (
    connectionId: string,
    configId: string,
    options: ExportRequestOptions
  ) => Promise<boolean>;
  isOperationInProgress: boolean;
  isImporting: boolean;
  transferProgress: DBTransferProgress | null;
  showImportModal: boolean;
  setShowImportModal: (value: boolean) => void;
  importDatabase: (
    connectionId: string,
    configId: string,
    options: ImportRequestOptions
  ) => Promise<boolean>;
}

export function DBExplorerDialogs(props: DBExplorerDialogsProps) {
  const { t } = useTranslation();
  const {
    showConnectionModal,
    setShowConnectionModal,
    onConnectionCreated,
    showCreateDBDialog,
    createDBForConfig,
    setShowCreateDBDialog,
    setCreateDBForConfig,
    handleCreateDatabase,
    createDatabasePending,
    connections,
    showCreateUserDialog,
    setShowCreateUserDialog,
    handleCreateUser,
    createUserPending,
    showCreateSchemaDialog,
    setShowCreateSchemaDialog,
    handleCreateSchema,
    createSchemaPending,
    showDeleteSchemaDialog,
    selectedSchemaToManage,
    setShowDeleteSchemaDialog,
    setSelectedSchemaToManage,
    handleDropSchema,
    dropSchemaPending,
    showDeleteTableDialog,
    selectedTableToDelete,
    setShowDeleteTableDialog,
    setSelectedTableToDelete,
    handleDropTable,
    dropTablePending,
    showCreateTableDialog,
    selectedConnection,
    selectedSchema,
    setShowCreateTableDialog,
    handleCreateTable,
    createTablePending,
    showDeleteDBDialog,
    setShowDeleteDBDialog,
    handleDropDatabase,
    dropDatabasePending,
    disconnectPending,
    connectPending,
    showExportModal,
    activeConnectionId,
    selectedConfigId,
    setShowExportModal,
    exportDatabase,
    isOperationInProgress,
    isImporting,
    transferProgress,
    showImportModal,
    setShowImportModal,
    importDatabase,
  } = props;

  return (
    <>
      {showConnectionModal && (
        <DBConnectionModal
          onClose={() => setShowConnectionModal(false)}
          onCreated={(id) => {
            onConnectionCreated(id);
            setShowConnectionModal(false);
          }}
        />
      )}

      {showCreateDBDialog && createDBForConfig && (
        <CreateDatabaseDialog
          isOpen={showCreateDBDialog}
          onClose={() => {
            setShowCreateDBDialog(false);
            setCreateDBForConfig(null);
          }}
          onConfirm={handleCreateDatabase}
          isLoading={createDatabasePending}
          dbType={
            connections?.find((c) => c.id === createDBForConfig)?.type as 'postgres' | 'mysql'
          }
        />
      )}

      {showCreateUserDialog &&
        selectedConnection &&
        (selectedConnection.type === 'postgres' ||
          selectedConnection.type === 'mysql' ||
          selectedConnection.type === 'mongodb' ||
          selectedConnection.type === 'redis') && (
          <CreateDatabaseUserDialog
            isOpen={showCreateUserDialog}
            onClose={() => setShowCreateUserDialog(false)}
            onConfirm={handleCreateUser}
            isLoading={createUserPending}
            dbType={selectedConnection.type}
            databaseName={selectedConnection.database}
            schemaName={
              selectedConnection.type === 'postgres' ? selectedSchema || 'public' : undefined
            }
          />
        )}

      {showCreateSchemaDialog && (
        <CreateSchemaDialog
          isOpen={showCreateSchemaDialog}
          onClose={() => setShowCreateSchemaDialog(false)}
          onConfirm={handleCreateSchema}
          isLoading={createSchemaPending}
        />
      )}

      {showDeleteSchemaDialog && selectedSchemaToManage && (
        <DeleteConfirmDialog
          isOpen={showDeleteSchemaDialog}
          onClose={() => {
            setShowDeleteSchemaDialog(false);
            setSelectedSchemaToManage(null);
          }}
          onConfirm={handleDropSchema}
          isLoading={dropSchemaPending}
          itemName={selectedSchemaToManage}
          itemType="Schema"
          warningMessage={t(
            'db.deleteSchemaWarning',
            'This will permanently delete the schema. Tables and other objects in this schema will be preserved (schema must be empty).'
          )}
        />
      )}

      {showDeleteTableDialog && selectedTableToDelete && (
        <DeleteConfirmDialog
          isOpen={showDeleteTableDialog}
          onClose={() => {
            setShowDeleteTableDialog(false);
            setSelectedTableToDelete(null);
          }}
          onConfirm={handleDropTable}
          isLoading={dropTablePending}
          itemName={selectedTableToDelete}
          itemType="Table"
        />
      )}

      {showCreateTableDialog && selectedConnection && (
        <CreateTableDialog
          isOpen={showCreateTableDialog}
          onClose={() => setShowCreateTableDialog(false)}
          onConfirm={handleCreateTable}
          isLoading={createTablePending}
          dbType={
            selectedConnection.type === 'postgres' || selectedConnection.type === 'mysql'
              ? selectedConnection.type
              : 'postgres'
          }
        />
      )}

      {showDeleteDBDialog && selectedConnection?.database && (
        <DeleteConfirmDialog
          isOpen={showDeleteDBDialog}
          onClose={() => setShowDeleteDBDialog(false)}
          onConfirm={handleDropDatabase}
          isLoading={dropDatabasePending || disconnectPending || connectPending}
          itemName={selectedConnection.database}
          itemType="Database"
          warningMessage={t(
            'db.deleteDatabaseWarning',
            'This will permanently delete the database and ALL its data. You will be disconnected first. This action cannot be undone!'
          )}
        />
      )}

      {showExportModal && activeConnectionId && selectedConfigId && (
        <ExportDatabaseModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          onExport={(options: ExportDatabaseOptions) => {
            exportDatabase(activeConnectionId, selectedConfigId, {
              compress: options.compress,
              schemaOnly: options.schemaOnly,
              dataOnly: options.dataOnly,
              clean: options.clean,
              noOwner: options.noOwner,
              create: options.create,
            });
            setShowExportModal(false);
          }}
          isExporting={isOperationInProgress}
          databaseName={selectedConnection?.database || selectedConnection?.name}
          databaseType={selectedConnection?.type}
        />
      )}

      {showImportModal && activeConnectionId && selectedConfigId && (
        <ImportDatabaseModal
          isOpen={showImportModal}
          onClose={() => {
            if (!isImporting) {
              setShowImportModal(false);
            }
          }}
          onImport={(options: ImportDatabaseOptions) => {
            void importDatabase(activeConnectionId, selectedConfigId, {
              clearMode: options.clearMode,
            }).then((success) => {
              if (success) {
                setShowImportModal(false);
              }
            });
          }}
          isImporting={isImporting}
          progress={transferProgress}
          databaseName={selectedConnection?.database || selectedConnection?.name}
        />
      )}
    </>
  );
}
