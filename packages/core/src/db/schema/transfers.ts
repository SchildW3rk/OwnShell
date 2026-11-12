/**
 * Transfer type
 */
export type TransferType = 'upload' | 'download';

/**
 * Transfer status
 */
export type TransferStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Transfer Queue table (v1.16.0 SFTP Standalone & Bulk Engine)
 * Stores active and pending file transfers
 */
export interface TransferQueueTable {
  id: string; // UUID v4
  host_id: string; // Foreign key to hosts table
  type: TransferType; // 'upload' or 'download'
  status: TransferStatus; // Current transfer status
  local_path: string; // Local file path
  remote_path: string; // Remote file path
  file_name: string; // File name (for display)
  file_size: number | null; // Total file size in bytes
  transferred: number; // Bytes transferred so far
  error: string | null; // Error message if failed
  priority: number; // Higher = higher priority (default: 0)
  created_at: number; // Unix timestamp in milliseconds
  started_at: number | null; // When transfer started
  completed_at: number | null; // When transfer completed/failed
}

export interface NewTransferQueueItem {
  id: string;
  host_id: string;
  type: TransferType;
  status?: TransferStatus; // Defaults to 'pending'
  local_path: string;
  remote_path: string;
  file_name: string;
  file_size?: number | null;
  transferred?: number;
  error?: string | null;
  priority?: number;
  created_at: number;
  started_at?: number | null;
  completed_at?: number | null;
}

export interface TransferQueueUpdate {
  status?: TransferStatus;
  transferred?: number;
  error?: string | null;
  started_at?: number | null;
  completed_at?: number | null;
}

/**
 * Transfer History table (v1.16.0 SFTP Standalone & Bulk Engine)
 * Stores completed/failed transfers for reference
 */
export interface TransferHistoryTable {
  id: string; // UUID v4
  host_id: string; // Foreign key to hosts table (may be null if host deleted)
  host_label: string; // Cached host label (for display even after host deletion)
  type: TransferType; // 'upload' or 'download'
  status: 'completed' | 'failed' | 'cancelled'; // Final status
  local_path: string; // Local file path
  remote_path: string; // Remote file path
  file_name: string; // File name (for display)
  file_size: number | null; // Total file size in bytes
  transferred: number; // Bytes transferred
  error: string | null; // Error message if failed
  started_at: number | null; // When transfer started
  completed_at: number; // When transfer completed/failed
}

export interface NewTransferHistoryItem {
  id: string;
  host_id: string;
  host_label: string;
  type: TransferType;
  status: 'completed' | 'failed' | 'cancelled';
  local_path: string;
  remote_path: string;
  file_name: string;
  file_size?: number | null;
  transferred?: number;
  error?: string | null;
  started_at?: number | null;
  completed_at: number;
}
