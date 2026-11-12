import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
import { Code, Database, Plus, Settings, Table } from 'lucide-react';
import { Button, EmptyState, Tabs } from '@ownshell/ui';
import { DBSidebar } from '../DBSidebar';
import { DBDataGrid } from '../DBDataGrid';
import { DBQueryConsole } from '../DBQueryConsole';
import { DBStructureView } from '../DBStructureView';
import { RedisKeyBrowser } from '../RedisKeyBrowser';
import { MongoDBBrowser } from '../MongoDBBrowser';

export type MainTab = 'data' | 'structure' | 'query';
type SidebarTables = ComponentProps<typeof DBSidebar>['tables'];
type GridData = ComponentProps<typeof DBDataGrid>['data'];
type GridSchema = ComponentProps<typeof DBDataGrid>['tableSchema'];
type StructureSchema = ComponentProps<typeof DBStructureView>['schema'];
type ExplorerTableSchema = (NonNullable<GridSchema> & NonNullable<StructureSchema>) | null | undefined;

export interface DBExplorerContentProps {
  isConnected: boolean;
  isRedisConnection: boolean;
  isMongoDBConnection: boolean;
  isReadOnly: boolean;
  activeConnectionId: string | null;
  selectedTable: string | null;
  selectedSchema: string | undefined;
  mainTab: MainTab;
  page: number;
  mongoSelectedCollection: string | null;
  mongoSelectedDocumentId: string | null;
  mongoFilterJson: string;
  mongoSkip: number;
  rowCount?: number;
  connectionsLength: number;
  tables: SidebarTables;
  tableData: GridData;
  tableSchema: ExplorerTableSchema;
  loadingTables: boolean;
  loadingSchema: boolean;
  loadingData: boolean;
  onSelectTable: (table: string, schema?: string) => void;
  onRefreshTables: () => void;
  onNewConnection: () => void;
  onTabChange: (tab: MainTab) => void;
  onPageChange: (page: number) => void;
  onRefreshData: () => void;
  onMongoViewStateChange: (update: {
    selectedCollection: string | null;
    selectedDocumentId: string | null;
    filterJson: string;
    skip: number;
  }) => void;
}

export function DBExplorerContent({
  isConnected,
  isRedisConnection,
  isMongoDBConnection,
  isReadOnly,
  activeConnectionId,
  selectedTable,
  selectedSchema,
  mainTab,
  page,
  mongoSelectedCollection,
  mongoSelectedDocumentId,
  mongoFilterJson,
  mongoSkip,
  rowCount,
  connectionsLength,
  tables,
  tableData,
  tableSchema,
  loadingTables,
  loadingSchema,
  loadingData,
  onSelectTable,
  onRefreshTables,
  onNewConnection,
  onTabChange,
  onPageChange,
  onRefreshData,
  onMongoViewStateChange,
}: DBExplorerContentProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 overflow-hidden">
      {isConnected && !isRedisConnection && !isMongoDBConnection && (
        <DBSidebar
          tables={tables}
          selectedTable={selectedTable}
          selectedSchema={selectedSchema}
          selectedTableRowCount={rowCount}
          onSelectTable={onSelectTable}
          isLoading={loadingTables}
          onRefresh={onRefreshTables}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {!isConnected ? (
          <EmptyState
            icon={Database}
            title={t('db.noDatabase', 'No Database Connected')}
            subtitle={t(
              'db.noDatabaseSubtitle',
              'Select a connection and click Connect to start exploring'
            )}
            className="flex-1"
            action={
              connectionsLength === 0 ? (
                <Button size="sm" variant="primary" onClick={onNewConnection}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t('database.createConnection', 'Create Connection')}
                </Button>
              ) : undefined
            }
          />
        ) : isRedisConnection && activeConnectionId ? (
          <RedisKeyBrowser connectionId={activeConnectionId} readOnly={isReadOnly} />
        ) : isMongoDBConnection && activeConnectionId ? (
          <MongoDBBrowser
            connectionId={activeConnectionId}
            readOnly={isReadOnly}
            initialSelectedCollection={mongoSelectedCollection}
            initialSelectedDocumentId={mongoSelectedDocumentId}
            initialFilterJson={mongoFilterJson}
            initialSkip={mongoSkip}
            onViewStateChange={onMongoViewStateChange}
          />
        ) : !selectedTable ? (
          <EmptyState
            icon={Table}
            title={t('db.selectTable', 'Select a Table')}
            subtitle={t(
              'db.selectTableSubtitle',
              'Choose a table from the sidebar to view its data'
            )}
            className="flex-1"
          />
        ) : (
          <>
            <Tabs
              tabs={[
                { id: 'data', label: t('db.data', 'Data'), icon: <Table className="w-4 h-4" /> },
                {
                  id: 'structure',
                  label: t('db.structure', 'Structure'),
                  icon: <Settings className="w-4 h-4" />,
                },
                {
                  id: 'query',
                  label: t('db.query', 'Query'),
                  icon: <Code className="w-4 h-4" />,
                },
              ]}
              activeTab={mainTab}
              onChange={(id) => onTabChange(id as MainTab)}
              variant="pills"
              className="px-4 py-2 border-b border-border"
              trailing={
                <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {selectedSchema ? `${selectedSchema}.${selectedTable}` : selectedTable}
                  </span>
                  {rowCount !== undefined && (
                    <span className="px-2 py-0.5 bg-secondary rounded">
                      {rowCount.toLocaleString()} rows
                    </span>
                  )}
                </div>
              }
            />

            <div className="flex-1 overflow-hidden">
              {mainTab === 'data' && (
                <DBDataGrid
                  connectionId={activeConnectionId}
                  tableName={selectedTable}
                  schema={selectedSchema}
                  data={tableData}
                  tableSchema={tableSchema}
                  isLoading={loadingData}
                  page={page}
                  pageSize={100}
                  totalRows={rowCount || 0}
                  readOnly={isReadOnly}
                  onPageChange={onPageChange}
                  onRefresh={onRefreshData}
                />
              )}
              {mainTab === 'structure' && (
                <DBStructureView schema={tableSchema} isLoading={loadingSchema} />
              )}
              {mainTab === 'query' && (
                <DBQueryConsole
                  connectionId={activeConnectionId}
                  tableName={selectedTable}
                  tables={tables}
                  readOnly={isReadOnly}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
