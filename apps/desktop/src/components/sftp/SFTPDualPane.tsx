/**
 * SFTP Dual-Pane Browser
 *
 * Local Mac on the left, active SSH server on the right.
 * Dragging local files to the server queues uploads; dragging server files to
 * the local pane queues downloads.
 */

import React, { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, HardDrive, Loader2, Server } from 'lucide-react';
import { Button } from '@ownshell/ui';
import type { SFTPFileEntry } from '@ownshell/core';
import { useShallow } from 'zustand/react/shallow';
import toast from 'react-hot-toast';

import { useAddTransfer, useTransferEvents, type TransferProgressEvent } from '../../hooks/sftp';
import { queryKeys } from '../../lib/queryClient';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { SFTPPane } from './SFTPPane';
import { LocalPane } from './standalone/LocalPane';
import type { LocalFileEntry } from './standalone/utils';

interface SFTPDualPaneProps {
  /** Primary session ID (terminal session from SessionView) */
  primarySessionId: string;
}

const joinPath = (basePath: string, name: string) => {
  if (!basePath || basePath === '.') return name;
  if (basePath === '/') return `/${name}`;
  return basePath.endsWith('/') ? `${basePath}${name}` : `${basePath}/${name}`;
};

export const SFTPDualPane: React.FC<SFTPDualPaneProps> = ({ primarySessionId }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const addTransfer = useAddTransfer();
  const sessions = useTerminalStore(useShallow((state) => state.sessions));
  const primarySession = sessions.find((session) => session.id === primarySessionId);
  const primarySshSessionId = primarySession?.sessionId ?? null;
  const hostId = primarySession?.host?.id ?? null;
  const serverLabel = primarySession?.host?.label || t('dualPane.server', 'Server');

  const [localPath, setLocalPath] = useState('/');
  const [remotePath, setRemotePath] = useState('.');
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<Set<string>>(new Set());
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const invalidateRemoteFiles = useCallback(() => {
    if (!primarySshSessionId) return;

    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          key[0] === queryKeys.sftp.all[0] &&
          key[1] === 'files' &&
          key[2] === primarySshSessionId
        );
      },
    });
  }, [primarySshSessionId, queryClient]);

  useTransferEvents(
    useCallback(
      (event: TransferProgressEvent) => {
        if (event.status !== 'completed' || event.hostId !== hostId) return;

        if (event.type === 'upload') {
          invalidateRemoteFiles();
          return;
        }

        if (event.type === 'download') {
          setLocalRefreshKey((key) => key + 1);
        }
      },
      [hostId, invalidateRemoteFiles]
    )
  );

  const queueLocalUpload = useCallback(
    (file: LocalFileEntry, targetPath: string) => {
      if (!hostId) {
        toast.error(t('dualPane.noSession', 'Keine aktive Serververbindung'));
        return;
      }

      if (file.type === 'directory') {
        toast.error(t('transfers.directoryDragUnsupported', 'Ordner bitte einzeln hochladen'));
        return;
      }

      addTransfer.addSingle.mutate(
        {
          hostId,
          type: 'upload',
          localPath: file.path,
          remotePath: joinPath(targetPath, file.name),
          fileSize: file.size,
        },
        {
          onSuccess: () => {
            toast.success(t('transfers.fileQueued', 'Datei zur Übertragung eingereiht'));
          },
          onError: (error: Error) => {
            toast.error(
              t('transfers.queueFailed', 'Übertragung konnte nicht eingereiht werden') +
                `: ${error.message}`
            );
          },
        }
      );
    },
    [addTransfer.addSingle, hostId, t]
  );

  const queueRemoteDownload = useCallback(
    (remoteFilePath: string) => {
      if (!hostId) {
        toast.error(t('dualPane.noSession', 'Keine aktive Serververbindung'));
        return;
      }

      const fileName = remoteFilePath.split('/').pop() || 'file';

      addTransfer.addSingle.mutate(
        {
          hostId,
          type: 'download',
          localPath: joinPath(localPath, fileName),
          remotePath: remoteFilePath,
        },
        {
          onSuccess: () => {
            toast.success(t('transfers.fileQueued', 'Datei zur Übertragung eingereiht'));
          },
          onError: (error: Error) => {
            toast.error(
              t('transfers.queueFailed', 'Übertragung konnte nicht eingereiht werden') +
                `: ${error.message}`
            );
          },
        }
      );
    },
    [addTransfer.addSingle, hostId, localPath, t]
  );

  const uploadSelectedLocalFiles = useCallback(() => {
    if (!hostId || selectedLocalFiles.size === 0) return;

    const items = Array.from(selectedLocalFiles).map((filePath) => {
      const fileName = filePath.split('/').pop() || 'file';
      return {
        hostId,
        type: 'upload' as const,
        localPath: filePath,
        remotePath: joinPath(remotePath, fileName),
      };
    });

    addTransfer.addBulk.mutate(items, {
      onSuccess: () => {
        toast.success(
          t('transfers.bulkQueued', {
            count: selectedLocalFiles.size,
            defaultValue: '{{count}} Datei(en) zur Übertragung eingereiht',
          })
        );
        setSelectedLocalFiles(new Set());
      },
      onError: (error: Error) => {
        toast.error(
          t('transfers.queueFailed', 'Übertragung konnte nicht eingereiht werden') +
            `: ${error.message}`
        );
      },
    });
  }, [addTransfer.addBulk, hostId, remotePath, selectedLocalFiles, t]);

  const isQueueing = addTransfer.addSingle.isPending || addTransfer.addBulk.isPending;

  return (
    <div className="flex h-full flex-col bg-background">
      {selectedLocalFiles.size > 0 && (
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <HardDrive className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="truncate">
              {t('files.localSelected', {
                count: selectedLocalFiles.size,
                defaultValue: '{{count}} lokale Datei(en) ausgewählt',
              })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={uploadSelectedLocalFiles}
              disabled={!hostId || isQueueing}
              className="no-drag"
            >
              {isQueueing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-1 h-4 w-4" />
              )}
              {t('files.uploadSelected', 'Hochladen')} ({selectedLocalFiles.size})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLocalFiles(new Set())}
              className="no-drag"
            >
              {t('common.clearSelection', 'Auswahl leeren')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 border-r border-border">
          <LocalPane
            currentPath={localPath}
            refreshToken={localRefreshKey}
            onPathChange={(path) => {
              setLocalPath(path);
              setSelectedLocalFiles(new Set());
            }}
            onFileDragStart={() => {}}
            onDirectoryDragStart={() => {}}
            isDropTarget={!!hostId}
            onDrop={queueRemoteDownload}
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

        <div className="min-w-0 flex-1">
          {primarySshSessionId ? (
            <SFTPPane
              sshSessionId={primarySshSessionId}
              paneId="right"
              compact
              sessionLabel={serverLabel}
              dualPaneMode
              isDropTarget={!!hostId}
              onPathChange={setRemotePath}
              onFileDrop={(file, _sourcePath, targetPath) => {
                queueLocalUpload(file as unknown as LocalFileEntry, targetPath);
              }}
              onCopyToOtherPane={(file: SFTPFileEntry) => queueRemoteDownload(file.path)}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="p-8 text-center">
                <Server className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('dualPane.noSession', 'Keine aktive Serververbindung')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
