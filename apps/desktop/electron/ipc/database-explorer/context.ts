import { DBConnectionQueries, DBQueryHistoryQueries } from '@ownshell/core';

export interface DBExplorerHandlerContext {
  dbConnectionQueries: DBConnectionQueries;
  queryHistoryQueries: DBQueryHistoryQueries;
  isQueryHistoryEnabled: () => Promise<boolean>;
}
