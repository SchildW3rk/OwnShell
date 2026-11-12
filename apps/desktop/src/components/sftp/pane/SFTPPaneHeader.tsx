import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  Home,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

interface SFTPPaneHeaderProps {
  currentPath: string;
  compact: boolean;
  isLoading: boolean;
  isUploading: boolean;
  onNavigateToPath: (path: string) => void;
  onNavigateUp: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onOpenCreateFileDialog: () => void;
  onOpenMkdirDialog: () => void;
}

export const SFTPPaneHeader: React.FC<SFTPPaneHeaderProps> = ({
  currentPath,
  compact,
  isLoading,
  isUploading,
  onNavigateToPath,
  onNavigateUp,
  onRefresh,
  onUpload,
  onOpenCreateFileDialog,
  onOpenMkdirDialog,
}) => {
  const { t } = useTranslation();
  const pathParts = currentPath.split('/').filter((part) => part && part !== '.');
  const breadcrumbs = compact ? pathParts.slice(-2) : pathParts;

  const actionButtonClass = `no-drag relative group ${compact ? 'p-1' : ''}`;
  const tooltipClass =
    'pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100';

  return (
    <div
      className={`flex items-center justify-between ${compact ? 'px-2 py-1.5' : 'px-4 py-2'} bg-surface border-b border-border`}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {compact && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNavigateUp}
              disabled={isLoading || currentPath === '/'}
              className="no-drag p-1"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateToPath('/')}
              className="no-drag p-1"
              disabled={isLoading}
            >
              <Home className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
        {!compact && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateToPath('/')}
            className="no-drag"
            disabled={isLoading}
          >
            <Home className="w-4 h-4" />
          </Button>
        )}

        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {breadcrumbs.map((part, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <button
                onClick={() => {
                  const targetPath = '/' + pathParts.slice(0, pathParts.indexOf(part) + 1).join('/');
                  onNavigateToPath(targetPath);
                }}
                className={`${compact ? 'text-xs' : 'text-sm'} text-foreground hover:text-primary transition-colors truncate no-drag`}
                disabled={isLoading}
              >
                {part}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className={actionButtonClass}
          disabled={isLoading}
          title={t('files.refresh')}
          aria-label={t('files.refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {compact && <span className={tooltipClass}>{t('files.refresh')}</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onUpload}
          className={actionButtonClass}
          disabled={isLoading || isUploading}
          title={t('files.upload')}
          aria-label={t('files.upload')}
        >
          <Upload className={`w-4 h-4 ${compact ? '' : 'mr-1'}`} />
          {!compact && t('files.upload')}
          {compact && <span className={tooltipClass}>{t('files.upload')}</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenCreateFileDialog}
          className={actionButtonClass}
          disabled={isLoading}
          title={t('files.newFile')}
          aria-label={t('files.newFile')}
        >
          <FilePlus2 className={`w-4 h-4 ${compact ? '' : 'mr-1'}`} />
          {!compact && t('files.newFile')}
          {compact && <span className={tooltipClass}>{t('files.newFile')}</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenMkdirDialog}
          className={actionButtonClass}
          disabled={isLoading}
          title={t('files.newFolder')}
          aria-label={t('files.newFolder')}
        >
          <FolderPlus className={`w-4 h-4 ${compact ? '' : 'mr-1'}`} />
          {!compact && t('files.newFolder')}
          {compact && <span className={tooltipClass}>{t('files.newFolder')}</span>}
        </Button>
      </div>
    </div>
  );
};
