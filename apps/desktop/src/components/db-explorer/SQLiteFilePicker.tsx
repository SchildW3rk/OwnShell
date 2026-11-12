/**
 * SQLite File Picker Component
 *
 * Allows selecting SQLite database files from:
 * - Local filesystem (direct Electron dialog)
 * - Remote server via SFTP (browse remote files)
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppSelect, Button, SegmentedChoice, cn, formatBytes } from '@ownshell/ui';
import {
  Database,
  HardDrive,
  Server,
  FolderOpen,
  File,
  ChevronRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useHostStore } from '../../stores/useHostStore';

interface SQLiteFilePickerProps {
  /** Current file path */
  value?: string;
  /** Whether file is on remote server */
  isRemote?: boolean;
  /** SSH host ID for remote files */
  remoteHostId?: string;
  /** SSH session ID (if already connected) */
  sshSessionId?: string;
  /** Callback when file is selected */
  onChange: (data: {
    filePath: string;
    isRemote: boolean;
    remoteHostId?: string;
    localCachePath?: string;
  }) => void;
  /** Error message to display */
  error?: string;
}

interface RemoteFileEntry {
  name: string;
  type: 'd' | '-' | 'l'; // directory, file, link
  size: number;
  modifyTime: number;
  accessTime: number;
  rights: { user: string; group: string; other: string };
  owner: number;
  group: number;
}

export const SQLiteFilePicker: React.FC<SQLiteFilePickerProps> = ({
  value,
  isRemote = false,
  remoteHostId,
  sshSessionId,
  onChange,
  error,
}) => {
  const { t } = useTranslation();
  const hosts = useHostStore((state) => state.hosts);

  // Local vs Remote mode
  const [mode, setMode] = useState<'local' | 'remote'>(isRemote ? 'remote' : 'local');
  const [selectedHostId, setSelectedHostId] = useState<string>(remoteHostId || '');

  // Remote browser state
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<RemoteFileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);

  // Sync mode from props
  useEffect(() => {
    setMode(isRemote ? 'remote' : 'local');
  }, [isRemote]);

  /**
   * Handle local file selection via Electron dialog
   */
  const handleLocalSelect = async () => {
    try {
      const result = await window.electronAPI.filePicker.openSQLiteFile();
      if (result.success && result.filePath) {
        onChange({
          filePath: result.filePath,
          isRemote: false,
        });
      }
    } catch (err) {
      console.error('Failed to open file picker:', err);
    }
  };

  /**
   * List remote directory contents
   */
  const listRemoteDirectory = async (path: string) => {
    if (!sshSessionId) {
      setBrowserError('SSH session required to browse remote files');
      return;
    }

    setIsLoading(true);
    setBrowserError(null);

    try {
      const result = await window.electronAPI.sftp.list(sshSessionId, path);
      if (result.success && result.files) {
        // Sort: directories first, then files, alphabetically
        const sorted = [...result.files].sort((a, b) => {
          if (a.type === 'd' && b.type !== 'd') return -1;
          if (a.type !== 'd' && b.type === 'd') return 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(sorted);
        setCurrentPath(path);
      } else {
        setBrowserError(result.error?.message || 'Failed to list directory');
      }
    } catch (err) {
      setBrowserError(err instanceof Error ? err.message : 'Failed to list directory');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle clicking on a file/directory in the browser
   */
  const handleFileClick = (file: RemoteFileEntry) => {
    const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;

    if (file.type === 'd') {
      // Navigate into directory
      listRemoteDirectory(fullPath);
    } else {
      // Check if it's a SQLite file
      const ext = file.name.split('.').pop()?.toLowerCase();
      const sqliteExtensions = ['db', 'sqlite', 'sqlite3', 'db3'];

      if (!ext || !sqliteExtensions.includes(ext)) {
        // Allow selecting anyway but warn
        const confirm = window.confirm(
          `"${file.name}" doesn't have a typical SQLite extension. Select anyway?`
        );
        if (!confirm) return;
      }

      // Select the file
      onChange({
        filePath: fullPath,
        isRemote: true,
        remoteHostId: selectedHostId,
      });
      setShowBrowser(false);
    }
  };

  /**
   * Navigate to parent directory
   */
  const goUp = () => {
    if (currentPath === '/') return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    listRemoteDirectory(parentPath);
  };

  /**
   * Open browser panel
   */
  const openBrowser = () => {
    if (!sshSessionId) {
      setBrowserError('Please connect to the SSH host first');
      return;
    }
    setShowBrowser(true);
    listRemoteDirectory('/');
  };

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div>
        <span className="block text-sm font-medium text-foreground mb-2">
          {t('database.fileLocation', 'File Location')}
        </span>
        <SegmentedChoice
          name="sqlite-file-location"
          value={mode}
          onChange={setMode}
          fullWidth
          itemClassName="h-11"
          options={[
            {
              value: 'local',
              label: t('database.localFile', 'Local File'),
              icon: <HardDrive className="h-4 w-4" />,
            },
            {
              value: 'remote',
              label: t('database.remoteFile', 'Remote File (SFTP)'),
              icon: <Server className="h-4 w-4" />,
            },
          ]}
        />
      </div>

      {/* Local Mode */}
      {mode === 'local' && (
        <div>
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 bg-surface border rounded transition-colors',
              value ? 'border-border' : 'border-border'
            )}
          >
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className={cn('flex-1 text-sm', value ? 'text-foreground' : 'text-muted-foreground')}>
              {value || t('database.noFileSelected', 'No file selected')}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={handleLocalSelect}>
              <FolderOpen className="w-4 h-4 mr-1" />
              {t('common.browse', 'Browse')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('database.localFileHint', 'Select a SQLite database file from your local machine')}
          </p>
        </div>
      )}

      {/* Remote Mode */}
      {mode === 'remote' && (
        <div className="space-y-3">
          {/* SSH Host Selector */}
          <div>
            <label
              htmlFor="sqlite-ssh-host"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {t('database.sshHost', 'SSH Host')} *
            </label>
            <AppSelect
              id="sqlite-ssh-host"
              value={selectedHostId}
              onChange={setSelectedHostId}
              options={[
                { value: '', label: t('database.selectSSHHost', 'Select SSH host...') },
                ...(hosts || []).map((host: { id: string; label: string; hostname?: string }) => ({
                  value: host.id,
                  label: `${host.label}${host.hostname ? ` (${host.hostname})` : ''}`,
                })),
              ]}
              placeholder={t('database.selectSSHHost', 'Select SSH host...')}
            />
          </div>

          {/* Remote File Path */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 bg-surface border rounded transition-colors',
              value ? 'border-border' : 'border-border'
            )}
          >
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className={cn('flex-1 text-sm', value ? 'text-foreground' : 'text-muted-foreground')}>
              {value || t('database.noFileSelected', 'No file selected')}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openBrowser}
              disabled={!selectedHostId || !sshSessionId}
            >
              <FolderOpen className="w-4 h-4 mr-1" />
              {t('common.browse', 'Browse')}
            </Button>
          </div>

          {!sshSessionId && selectedHostId && (
            <p className="text-xs text-amber-400">
              {t(
                'database.sshConnectionRequired',
                'Connect to the SSH host first to browse remote files'
              )}
            </p>
          )}

          {/* Remote File Browser */}
          {showBrowser && sshSessionId && (
            <div className="border border-border rounded bg-surface/50 overflow-hidden">
              {/* Browser Header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-b border-border">
                <button
                  type="button"
                  onClick={goUp}
                  disabled={currentPath === '/' || isLoading}
                  className="p-1 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 text-sm font-mono text-foreground truncate">
                  {currentPath}
                </div>
                <button
                  type="button"
                  onClick={() => listRemoteDirectory(currentPath)}
                  disabled={isLoading}
                  className="p-1 rounded hover:bg-secondary"
                >
                  <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowBrowser(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('common.close', 'Close')}
                </button>
              </div>

              {/* Browser Content */}
              <div className="max-h-64 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading...
                  </div>
                ) : browserError ? (
                  <div className="flex items-center justify-center py-8 text-destructive">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {browserError}
                  </div>
                ) : files.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    {t('database.emptyDirectory', 'Empty directory')}
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {files.map((file) => (
                      <button
                        key={file.name}
                        type="button"
                        onClick={() => handleFileClick(file)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                      >
                        {file.type === 'd' ? (
                          <FolderOpen className="w-4 h-4 text-primary" />
                        ) : (
                          <File className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="flex-1 text-sm text-foreground truncate">
                          {file.name}
                        </span>
                        {file.type !== 'd' && (
                          <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                        )}
                        {file.type === 'd' && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t(
              'database.remoteFileHint',
              'Browse and select a SQLite file from the remote server via SFTP. The file will be downloaded locally for access.'
            )}
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
};

export default SQLiteFilePicker;
