/**
 * Transfer Queue Panel (v1.16.0)
 *
 * Collapsible bottom panel showing active and queued file transfers.
 * Similar to VS Code's terminal panel design.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn, formatBytes } from '@ownshell/ui';
import {
  ChevronDown,
  ChevronUp,
  Upload,
  Download,
  Pause,
  Play,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import {
  useTransferQueue,
  useTransferStats,
  useTransferMutations,
  useTransferEvents,
  TransferItem,
} from '../../hooks/sftp';

interface TransferQueuePanelProps {
  /** Whether the panel is expanded */
  isOpen: boolean;
  /** Toggle panel visibility */
  onToggle: () => void;
}

export const TransferQueuePanel: React.FC<TransferQueuePanelProps> = ({ isOpen, onToggle }) => {
  const { t } = useTranslation();
  const { data: queue = [], isLoading } = useTransferQueue();
  const { data: stats } = useTransferStats();
  const { pauseTransfer, resumeTransfer, cancelTransfer } = useTransferMutations();

  // Subscribe to real-time events
  useTransferEvents();

  // Calculate progress across all active transfers
  const activeTransfers = queue.filter((t) => t.status === 'active');
  const pendingTransfers = queue.filter((t) => t.status === 'pending');
  const totalActive = activeTransfers.length + pendingTransfers.length;

  // Format bytes to human-readable
  // Get status icon
  const getStatusIcon = (status: TransferItem['status']) => {
    switch (status) {
      case 'active':
        return <Loader2 className="w-4 h-4 animate-spin text-accent" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'border-t border-border bg-background-secondary flex flex-col',
        'transition-all duration-200 ease-out',
        isOpen ? 'h-64' : 'h-8'
      )}
    >
      {/* Header Bar - Always visible */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center justify-between px-3 h-8 min-h-[32px]',
          'hover:bg-background-tertiary transition-colors',
          'text-muted-foreground text-sm'
        )}
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          <span className="font-medium">{t('transfers.title', 'Transfers')}</span>
          {totalActive > 0 && (
            <span className="px-1.5 py-0.5 bg-accent text-white text-xs rounded-full">
              {totalActive}
            </span>
          )}
        </div>

        {stats && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {stats.activeCount > 0 && (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {stats.activeCount} {t('transfers.active', 'active')}
              </span>
            )}
            {stats.pendingCount > 0 && (
              <span>
                {stats.pendingCount} {t('transfers.pending', 'pending')}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Panel Content - Visible when expanded */}
      {isOpen && (
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {t('common.loading', 'Loading...')}
            </div>
          ) : queue.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('transfers.noTransfers')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-background-tertiary sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">{t('common.file')}</th>
                  <th className="px-3 py-2 w-24">{t('common.size')}</th>
                  <th className="px-3 py-2 w-32">{t('common.progress')}</th>
                  <th className="px-3 py-2 w-20">{t('common.status')}</th>
                  <th className="px-3 py-2 w-24">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((transfer) => {
                  const percentage =
                    transfer.file_size && transfer.file_size > 0
                      ? Math.round((transfer.transferred / transfer.file_size) * 100)
                      : 0;

                  return (
                    <tr
                      key={transfer.id}
                      className="border-t border-border hover:bg-background-tertiary"
                    >
                      {/* Type Icon */}
                      <td className="px-3 py-2">
                        {transfer.type === 'upload' ? (
                          <Upload className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Download className="w-4 h-4 text-green-400" />
                        )}
                      </td>

                      {/* File Name */}
                      <td className="px-3 py-2">
                        <div className="truncate max-w-xs" title={transfer.file_name}>
                          {transfer.file_name}
                        </div>
                        <div
                          className="text-xs text-muted-foreground truncate max-w-xs"
                          title={
                            transfer.type === 'upload' ? transfer.remote_path : transfer.local_path
                          }
                        >
                          {transfer.type === 'upload' ? transfer.remote_path : transfer.local_path}
                        </div>
                      </td>

                      {/* Size */}
                      <td className="px-3 py-2 text-muted-foreground">
                        {transfer.file_size ? formatBytes(transfer.file_size) : '-'}
                      </td>

                      {/* Progress Bar */}
                      <td className="px-3 py-2">
                        {transfer.status === 'active' || transfer.status === 'paused' ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full transition-all duration-300',
                                  transfer.status === 'paused' ? 'bg-yellow-500' : 'bg-accent'
                                )}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">
                              {percentage}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {getStatusIcon(transfer.status)}
                          <span
                            className={cn(
                              'capitalize text-xs',
                              transfer.status === 'active' && 'text-accent',
                              transfer.status === 'paused' && 'text-yellow-500',
                              transfer.status === 'completed' && 'text-green-500',
                              transfer.status === 'failed' && 'text-red-500'
                            )}
                          >
                            {t(`transfers.status.${transfer.status}`, transfer.status)}
                          </span>
                        </div>
                        {transfer.error && (
                          <div className="text-xs text-red-400 truncate" title={transfer.error}>
                            {transfer.error}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {transfer.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => pauseTransfer.mutate(transfer.id)}
                              className="p-1 hover:bg-background rounded"
                              title={t('transfers.pause', 'Pause')}
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}
                          {transfer.status === 'paused' && (
                            <button
                              type="button"
                              onClick={() => resumeTransfer.mutate(transfer.id)}
                              className="p-1 hover:bg-background rounded"
                              title={t('transfers.resume', 'Resume')}
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {(transfer.status === 'active' ||
                            transfer.status === 'pending' ||
                            transfer.status === 'paused') && (
                            <button
                              type="button"
                              onClick={() => cancelTransfer.mutate(transfer.id)}
                              className="p-1 hover:bg-background rounded text-red-400"
                              title={t('transfers.cancel', 'Cancel')}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default TransferQueuePanel;
