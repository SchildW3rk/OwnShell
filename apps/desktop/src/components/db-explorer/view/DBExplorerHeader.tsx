import React from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Database,
  Download,
  FolderPlus,
  Layers,
  Lock,
  Loader2,
  MoreVertical,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Table,
  Terminal,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { AppSelect, Button, DropdownMenu, StatusDot } from '@ownshell/ui';
import type { DBConnectionsTable } from '@ownshell/core';

function getDBTypeColor(type: string): string {
  switch (type) {
    case 'postgres':
      return 'text-primary';
    case 'mysql':
      return 'text-accent';
    case 'redis':
      return 'text-destructive';
    case 'mongodb':
      return 'text-success';
    default:
      return 'text-muted-foreground';
  }
}

export interface DBExplorerHeaderProps {
  selectedConfigId: string | null;
  connections?: DBConnectionsTable[];
  selectedConnection?: DBConnectionsTable;
  isConnected: boolean;
  isPostgres: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isOperationInProgress: boolean;
  isLoadingDatabases: boolean;
  isSwitchingDatabase: boolean;
  isLoadingSchemas: boolean;
  loadingConnections: boolean;
  loadingTables: boolean;
  selectedSchema: string | undefined;
  availableDatabases?: string[];
  availableSchemas?: string[];
  onSelectConnection: (id: string | null) => void;
  onDatabaseSwitch: (database: string) => void;
  onSchemaChange: (schema: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onNewConnection: () => void;
  onRefresh: () => void;
  onCreateDatabase: () => void;
  onCreateUser: () => void;
  onCreateSchema: () => void;
  onDropSchema: () => void;
  onCreateTable: () => void;
  onDropTable: () => void;
  onExportDatabase: () => void;
  onImportDatabase: () => void;
  onDropDatabase: () => void;
  onOpenShell: () => void;
  canCreateDatabase: boolean;
  canCreateUser: boolean;
  canCreateSchema: boolean;
  canDropSchema: boolean;
  canCreateTable: boolean;
  canDropTable: boolean;
  canExportDatabase: boolean;
  canImportDatabase: boolean;
  canDropDatabase: boolean;
  canOpenShell: boolean;
  isReadOnly: boolean;
}

export function DBExplorerHeader(props: DBExplorerHeaderProps) {
  const { t } = useTranslation();
  const {
    selectedConfigId,
    connections,
    selectedConnection,
    isConnected,
    isPostgres,
    isConnecting,
    isDisconnecting,
    isOperationInProgress,
    isLoadingDatabases,
    isSwitchingDatabase,
    isLoadingSchemas,
    loadingConnections,
    loadingTables,
    selectedSchema,
    availableDatabases,
    availableSchemas,
    onSelectConnection,
    onDatabaseSwitch,
    onSchemaChange,
    onConnect,
    onDisconnect,
    onNewConnection,
    onRefresh,
    onCreateDatabase,
    onCreateUser,
    onCreateSchema,
    onDropSchema,
    onCreateTable,
    onDropTable,
    onExportDatabase,
    onImportDatabase,
    onDropDatabase,
    onOpenShell,
    canCreateDatabase,
    canCreateUser,
    canCreateSchema,
    canDropSchema,
    canCreateTable,
    canDropTable,
    canExportDatabase,
    canImportDatabase,
    canDropDatabase,
    canOpenShell,
    isReadOnly,
  } = props;

  const actionMenuItems = [
    canCreateDatabase && {
      id: 'create-db',
      label: t('db.createDatabase', 'Create Database'),
      icon: <Database className="w-4 h-4" />,
      onClick: onCreateDatabase,
    },
    canCreateUser && {
      id: 'create-user',
      label: t('db.createUser', 'Create User'),
      icon: <UserPlus className="w-4 h-4" />,
      onClick: onCreateUser,
    },
    canCreateSchema && {
      id: 'create-schema',
      label: t('db.createSchema', 'Create Schema'),
      icon: <FolderPlus className="w-4 h-4" />,
      onClick: onCreateSchema,
    },
    canDropSchema && {
      id: 'drop-schema',
      label: t('db.dropSchema', 'Drop Schema'),
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger' as const,
      onClick: onDropSchema,
    },
    canCreateTable && {
      id: 'create-table',
      label: t('db.createTable', 'Create Table'),
      icon: <Table className="w-4 h-4" />,
      onClick: onCreateTable,
    },
    canDropTable && {
      id: 'drop-table',
      label: t('db.dropTable', 'Drop Table'),
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger' as const,
      onClick: onDropTable,
    },
    canExportDatabase && {
      id: 'export-db',
      label: t('db.exportDatabase', 'Export Database'),
      icon: <Download className="w-4 h-4" />,
      onClick: onExportDatabase,
    },
    canImportDatabase && {
      id: 'import-db',
      label: t('db.importDatabase', 'Import Database'),
      icon: <Upload className="w-4 h-4" />,
      onClick: onImportDatabase,
    },
    canDropDatabase && {
      id: 'drop-db',
      label: t('db.dropDatabase', 'Delete Database'),
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger' as const,
      onClick: onDropDatabase,
    },
  ].filter(Boolean) as Array<{
    id: string;
    label: string;
    icon?: React.ReactNode;
    variant?: 'default' | 'danger';
    onClick: () => void;
  }>;
  const connectionOptions = [
    { value: '', label: t('db.selectConnection', 'Select connection...') },
    ...(connections ?? []).map((conn) => ({
      value: conn.id,
      label: `${conn.name} (${conn.type})`,
    })),
  ];
  const databaseOptions =
    availableDatabases?.map((db) => ({
      value: db,
      label: db === selectedConnection?.database ? `${db} (current)` : db,
    })) ?? [];
  const schemaOptions =
    availableSchemas?.map((schema) => ({
      value: schema,
      label: schema,
    })) ?? [];
  const isSqlConnection =
    selectedConnection?.type === 'postgres' || selectedConnection?.type === 'mysql';

  return (
    <div className="border-b border-border bg-surface/50 px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-[1_1_230px] items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
          <AppSelect
            value={selectedConfigId || ''}
            onChange={(value) => {
              if (isOperationInProgress) {
                toast.error(
                  t(
                    'db.operationInProgress',
                    'Cannot change connection while export/import is in progress'
                  )
                );
                return;
              }
              onSelectConnection(value || null);
            }}
            options={connectionOptions}
            placeholder={t('db.selectConnection', 'Select connection...')}
            disabled={isConnecting || isDisconnecting || isOperationInProgress}
            className="min-w-0 flex-1"
            triggerClassName="h-8 bg-secondary px-2 text-sm"
            listClassName="max-w-[min(360px,calc(100vw-16px))]"
          />
        </div>

        {isConnected && selectedConnection && isSqlConnection && (
          <div className="flex min-w-[150px] flex-[0_1_210px] items-center gap-2">
            <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <AppSelect
              value={selectedConnection.database || ''}
              onChange={(newDb) => {
                if (newDb && newDb !== selectedConnection.database) {
                  onDatabaseSwitch(newDb);
                }
              }}
              options={databaseOptions}
              placeholder={t('db.databaseName', 'Database')}
              disabled={isLoadingDatabases || isSwitchingDatabase || isOperationInProgress}
              className="min-w-0 flex-1"
              triggerClassName="h-8 bg-background px-2 text-xs"
            />
            {isSwitchingDatabase && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            )}
          </div>
        )}

        {isConnected && isPostgres && (
          <div className="flex min-w-[120px] flex-[0_1_170px] items-center gap-2">
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <AppSelect
              value={selectedSchema || 'public'}
              onChange={(schema) => onSchemaChange(schema || 'public')}
              options={schemaOptions}
              placeholder="public"
              disabled={isLoadingSchemas}
              className="min-w-0 flex-1"
              triggerClassName="h-8 bg-background px-2 text-xs"
            />
          </div>
        )}

        {selectedConnection && actionMenuItems.length > 0 && (
          <DropdownMenu
            items={actionMenuItems}
            align="right"
            triggerClassName="flex h-8 items-center gap-1.5 rounded border border-border px-2.5 text-sm text-muted-foreground cursor-pointer hover:bg-secondary"
            trigger={
              <>
                <MoreVertical className="h-4 w-4" />
                <span className="hidden sm:inline">{t('common.actions', 'Actions')}</span>
              </>
            }
          />
        )}

        {selectedConfigId && (
          <Button
            size="sm"
            variant={isConnected ? 'secondary' : 'primary'}
            onClick={isConnected ? onDisconnect : onConnect}
            disabled={isConnecting || isDisconnecting || isOperationInProgress}
            className="h-8 whitespace-nowrap px-2.5"
          >
            {isConnecting || isDisconnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isConnected ? (
              <>
                <PlugZap className="w-4 h-4 mr-1" />
                {t('database.disconnect', 'Disconnect')}
              </>
            ) : (
              <>
                <Plug className="w-4 h-4 mr-1" />
                {t('database.connect', 'Connect')}
              </>
            )}
          </Button>
        )}

        {selectedConnection && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenShell}
            disabled={!canOpenShell}
            title={
              !isConnected
                ? t('db.openShellConnectFirst', 'Connect to the database first')
                : canOpenShell
                  ? t('db.openShellTitle', 'Open database shell')
                  : t('db.openShellUnsupported', 'Shell is available for local/direct connections')
            }
            className="h-8 whitespace-nowrap px-2.5"
          >
            <Terminal className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">{t('db.openShell', 'Shell')}</span>
          </Button>
        )}

        {selectedConnection && (
          <div className="flex min-w-0 max-w-[220px] items-center gap-1.5">
            <StatusDot variant={isConnected ? 'success' : 'muted'} className="shrink-0" />
            <span className={`shrink-0 text-xs ${getDBTypeColor(selectedConnection.type)}`}>
              {selectedConnection.type.toUpperCase()}
            </span>
            {isReadOnly && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-500"
                title={t('db.readOnlyConnection', 'Read-only connection')}
              >
                <Lock className="h-3 w-3" />
                {t('db.readOnlyBadge', 'Read-only')}
              </span>
            )}
            {selectedConnection.database && (
              <span className="min-w-0 truncate whitespace-nowrap text-xs text-muted-foreground">
                / {selectedConnection.database}
              </span>
            )}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onNewConnection}
            title={t('database.newConnection', 'New Database Connection')}
            className="h-8 px-2.5"
          >
            <Plus className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('database.connection', 'Connection')}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={loadingConnections || loadingTables}
            title={t('common.refresh', 'Refresh')}
            className="h-8 w-8 px-0"
          >
            <RefreshCw
              className={`w-4 h-4 ${loadingConnections || loadingTables ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
