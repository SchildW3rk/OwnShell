/**
 * SFTP Standalone Browser (v1.16.0)
 *
 * Dual-pane file browser for SFTP-only connections.
 * Left pane: Local filesystem
 * Right pane: Remote SFTP server
 *
 * Integrates with BulkTransferEngine for queue-based transfers.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HostsTable } from '@ownshell/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSFTPConnect,
  useSFTPDisconnect,
  useAddTransfer,
  useTransferEvents,
  type TransferProgressEvent,
} from '../../hooks/sftp';
import { ChevronRight, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { queryKeys } from '../../lib/queryClient';
import { LocalPane } from './standalone/LocalPane';
import { RemotePane } from './standalone/RemotePane';
import toast from 'react-hot-toast';

export interface SFTPStandaloneBrowserProps {
  /** Host configuration for SFTP connection */
  host: HostsTable;
  /** Callback to open transfer panel */
  onOpenTransferPanel?: () => void;
}

/**
 * Main SFTP Standalone Browser Component
 */
export const SFTPStandaloneBrowser: React.FC<SFTPStandaloneBrowserProps> = ({
  host,
  onOpenTransferPanel,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const connectMutation = useSFTPConnect();
  const disconnectMutation = useSFTPDisconnect();
  const addTransfer = useAddTransfer();
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState<string>('/');
  const [remotePath, setRemotePath] = useState<string>('/');
  const connectionIdRef = useRef<string | null>(null);

  // Multi-select state (v1.16.0)
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<Set<string>>(new Set());
  const [selectedRemoteFiles, setSelectedRemoteFiles] = useState<Set<string>>(new Set());

  useTransferEvents(
    useCallback(
      (event: TransferProgressEvent) => {
        if (event.status !== 'completed' || event.type !== 'upload' || event.hostId !== host.id) {
          return;
        }

        const activeConnectionId = connectionIdRef.current;
        if (!activeConnectionId) return;

        queryClient.invalidateQueries({
          queryKey: queryKeys.sftpStandalone.files.byConnection(activeConnectionId),
        });
      },
      [host.id, queryClient]
    )
  );

  // Connect on mount - only reconnect when host.id changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reconnect when host.id changes
  useEffect(() => {
    const connect = async () => {
      setIsConnecting(true);
      setConnectionError(null);
      try {
        const connId = await connectMutation.mutateAsync({
          hostId: host.id,
          hostname: host.hostname,
          port: host.port,
          username: host.username,
          authType: host.auth_type,
          passwordEncrypted: host.password_encrypted || undefined,
          privateKeyEncrypted: undefined, // TODO: Handle key auth
          passphraseEncrypted: undefined,
          jumpHostId: host.jump_host_id,
          hostLabel: host.label,
        });
        setConnectionId(connId);
        connectionIdRef.current = connId;
      } catch (err) {
        setConnectionError((err as Error).message);
      } finally {
        setIsConnecting(false);
      }
    };
    connect();

    // Cleanup on unmount
    return () => {
      if (connectionIdRef.current) {
        disconnectMutation.mutate(connectionIdRef.current);
      }
    };
  }, [host.id]);

  // Handle upload (local -> remote)
  const handleUpload = useCallback(
    (localFilePath: string, isDirectory: boolean) => {
      if (!connectionId) return;

      const fileName = localFilePath.split('/').pop() || 'file';
      const remoteFilePath = remotePath.endsWith('/')
        ? `${remotePath}${fileName}`
        : `${remotePath}/${fileName}`;

      if (isDirectory) {
        // Add directory transfer (recursive)
        addTransfer.addDirectory.mutate(
          {
            hostId: host.id,
            type: 'upload',
            connectionId,
            localPath: localFilePath,
            remotePath: remoteFilePath,
          },
          {
            onSuccess: () => {
              toast.success(t('transfers.directoryQueued', 'Directory queued for upload'));
              onOpenTransferPanel?.();
            },
            onError: (err: Error) => {
              toast.error(`${t('transfers.queueFailed')}: ${err.message}`);
            },
          }
        );
      } else {
        // Add single file transfer
        addTransfer.addSingle.mutate(
          {
            hostId: host.id,
            type: 'upload',
            localPath: localFilePath,
            remotePath: remoteFilePath,
          },
          {
            onSuccess: () => {
              toast.success(t('transfers.fileQueued'));
              onOpenTransferPanel?.();
            },
            onError: (err: Error) => {
              toast.error(`${t('transfers.queueFailed')}: ${err.message}`);
            },
          }
        );
      }
    },
    [connectionId, remotePath, addTransfer, onOpenTransferPanel, t, host.id]
  );

  // Handle download (remote -> local)
  const handleDownload = useCallback(
    (remoteFilePath: string) => {
      if (!connectionId) return;

      const fileName = remoteFilePath.split('/').pop() || 'file';
      const localFilePath = localPath.endsWith('/')
        ? `${localPath}${fileName}`
        : `${localPath}/${fileName}`;

      addTransfer.addSingle.mutate(
        {
          hostId: host.id,
          type: 'download',
          localPath: localFilePath,
          remotePath: remoteFilePath,
        },
        {
          onSuccess: () => {
            toast.success(t('transfers.fileQueued'));
            onOpenTransferPanel?.();
          },
          onError: (err: Error) => {
            toast.error(`${t('transfers.queueFailed')}: ${err.message}`);
          },
        }
      );
    },
    [connectionId, localPath, addTransfer, onOpenTransferPanel, t, host.id]
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Bulk Transfer Toolbar (v1.16.0) */}
      {(selectedLocalFiles.size > 0 || selectedRemoteFiles.size > 0) && (
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-4 overflow-x-auto whitespace-nowrap px-4 py-2 bg-primary border-b border-primary">
          <div className="flex shrink-0 items-center gap-4 text-sm text-white">
            {selectedLocalFiles.size > 0 && (
              <span>
                {t('files.localSelected', { count: selectedLocalFiles.size })}
              </span>
            )}
            {selectedRemoteFiles.size > 0 && (
              <span>
                {t('files.remoteSelected', { count: selectedRemoteFiles.size })}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selectedLocalFiles.size > 0 && connectionId && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  selectedLocalFiles.forEach((filePath) => {
                    const fileName = filePath.split('/').pop() || 'file';
                    const remoteFilePath = remotePath.endsWith('/')
                      ? `${remotePath}${fileName}`
                      : `${remotePath}/${fileName}`;
                    addTransfer.addSingle.mutate({
                      hostId: host.id,
                      type: 'upload',
                      localPath: filePath,
                      remotePath: remoteFilePath,
                    });
                  });
                  toast.success(
                    t(
                      'transfers.bulkQueued',
                      `${selectedLocalFiles.size} file(s) queued for upload`
                    )
                  );
                  setSelectedLocalFiles(new Set());
                  onOpenTransferPanel?.();
                }}
                className="no-drag"
              >
                <ChevronRight className="w-4 h-4 mr-1" />
                {t('files.uploadSelected', 'Upload')} ({selectedLocalFiles.size})
              </Button>
            )}
            {selectedRemoteFiles.size > 0 && connectionId && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    selectedRemoteFiles.forEach((filePath) => {
                      const fileName = filePath.split('/').pop() || 'file';
                      const localFilePath = localPath.endsWith('/')
                        ? `${localPath}${fileName}`
                        : `${localPath}/${fileName}`;
                      addTransfer.addSingle.mutate({
                        hostId: host.id,
                        type: 'download',
                        localPath: localFilePath,
                        remotePath: filePath,
                      });
                    });
                    toast.success(
                      t(
                        'transfers.bulkQueued',
                        `${selectedRemoteFiles.size} file(s) queued for download`
                      )
                    );
                    setSelectedRemoteFiles(new Set());
                    onOpenTransferPanel?.();
                  }}
                  className="no-drag"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  {t('files.downloadSelected', 'Download')} ({selectedRemoteFiles.size})
                </Button>
                {!bulkDeleteConfirm ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkDeleteConfirm(true)}
                    className="no-drag text-destructive hover:bg-destructive/20 hover:text-destructive"
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t('files.deleteSelected', 'Delete')} ({selectedRemoteFiles.size})
                  </Button>
                ) : (
                  <div className="flex items-center gap-1 bg-destructive/20 rounded px-2 py-1">
                    <span className="text-xs text-destructive mr-2">
                      {t('files.confirmDelete', 'Delete')} {selectedRemoteFiles.size}{' '}
                      {t('files.files', 'file(s)')}?
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        setIsDeleting(true);
                        try {
                          for (const filePath of selectedRemoteFiles) {
                            await window.electronAPI.sftpStandalone.delete(connectionId, filePath);
                          }
                          toast.success(
                            t('files.filesDeleted', { count: selectedRemoteFiles.size })
                          );
                          setSelectedRemoteFiles(new Set());
                        } catch (err) {
                          toast.error(`${t('transfers.deleteFailed')}: ${(err as Error).message}`);
                        } finally {
                          setIsDeleting(false);
                          setBulkDeleteConfirm(false);
                        }
                      }}
                      className="no-drag text-destructive hover:bg-destructive/30 px-2 py-0.5"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        t('common.yes', 'Yes')
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBulkDeleteConfirm(false)}
                      className="no-drag text-white hover:bg-white/10 px-2 py-0.5"
                      disabled={isDeleting}
                    >
                      {t('common.no', 'No')}
                    </Button>
                  </div>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedLocalFiles(new Set());
                setSelectedRemoteFiles(new Set());
              }}
              className="no-drag text-white hover:bg-primary"
            >
              {t('common.clearSelection', 'Clear')}
            </Button>
          </div>
        </div>
      )}

      {/* Split Panes */}
      <div className="flex-1 flex min-h-0">
        {/* Local Pane */}
        <div className="flex-1 border-r border-border min-w-0">
          <LocalPane
            currentPath={localPath}
            onPathChange={(path) => {
              setLocalPath(path);
              setSelectedLocalFiles(new Set()); // Clear selection on navigate
            }}
            onFileDragStart={() => {}}
            onDirectoryDragStart={() => {}}
            isDropTarget={!!connectionId}
            onDrop={handleDownload}
            selectedFiles={selectedLocalFiles}
            onToggleSelect={(path) => {
              setSelectedLocalFiles((prev) => {
                const next = new Set(prev);
                if (next.has(path)) {
                  next.delete(path);
                } else {
                  next.add(path);
                }
                return next;
              });
            }}
            onSelectAll={(paths) => setSelectedLocalFiles(new Set(paths))}
            onClearSelection={() => setSelectedLocalFiles(new Set())}
          />
        </div>

        {/* Remote Pane */}
        <div className="flex-1 min-w-0">
          <RemotePane
            connectionId={connectionId}
            isConnecting={isConnecting}
            connectionError={connectionError}
            currentPath={remotePath}
            onPathChange={(path) => {
              setRemotePath(path);
              setSelectedRemoteFiles(new Set()); // Clear selection on navigate
            }}
            onFileDragStart={() => {}}
            onDirectoryDragStart={() => {}}
            isDropTarget={!!connectionId}
            onDrop={handleUpload}
            selectedFiles={selectedRemoteFiles}
            onToggleSelect={(path) => {
              setSelectedRemoteFiles((prev) => {
                const next = new Set(prev);
                if (next.has(path)) {
                  next.delete(path);
                } else {
                  next.add(path);
                }
                return next;
              });
            }}
            onSelectAll={(paths) => setSelectedRemoteFiles(new Set(paths))}
            onClearSelection={() => setSelectedRemoteFiles(new Set())}
          />
        </div>
      </div>
    </div>
  );
};

export default SFTPStandaloneBrowser;
