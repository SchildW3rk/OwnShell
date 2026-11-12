/**
 * SFTP Hooks (TanStack Query)
 *
 * Re-exports all SFTP query and mutation hooks
 */

export { useSFTPFiles } from './useSFTPQueries';

export {
  useDownloadFile,
  useUploadFile,
  useDeleteFile,
  useCreateDirectory,
  useRenameFile,
  useChmod,
  useReadFile,
  useWriteFile,
} from './useSFTPMutations';

// Transfer Queue (v1.16.0)
export {
  useTransferQueue,
  useTransferHistory,
  useTransferStats,
  useTransferMutations,
  useTransferEvents,
  useAddTransfer,
} from './useTransferQueue';

export type {
  TransferItem,
  TransferHistoryItem,
  TransferProgressEvent,
  TransferQueueStats,
} from './useTransferQueue';

// Standalone SFTP Connections (v1.16.0)
export {
  useSFTPConnections,
  useSFTPConnect,
  useSFTPDisconnect,
  useSFTPStandaloneFiles,
  useSFTPStandaloneMutations,
  useSFTPDialogs,
} from './useSFTPStandalone';

export type { SFTPStandaloneConnection } from './useSFTPStandalone';
