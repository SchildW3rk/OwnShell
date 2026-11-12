import React, { useCallback, useMemo } from 'react';
import { Upload, X } from 'lucide-react';
import { Button, formatBytes } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

interface BinaryEditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface BinaryFileInfo {
  path?: string;
  name?: string;
  size?: number;
  contentType?: string;
}

export const BinaryEditor: React.FC<BinaryEditorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const fileInfo = useMemo<BinaryFileInfo | null>(() => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }, [value]);

  // The main process reads (and re-validates) the file when the request is sent.
  const handlePick = useCallback(async () => {
    const file = await window.electronAPI.apiClient.files.pick();
    if (file) onChange(JSON.stringify(file));
  }, [onChange]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {fileInfo?.name ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-secondary rounded-lg flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{fileInfo.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatBytes(fileInfo.size || 0)}
              {fileInfo.contentType && <span className="ml-2">({fileInfo.contentType})</span>}
            </p>
            {!fileInfo.path && (
              <p className="text-xs text-destructive mt-1">{t('api.body.reselectFile')}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handlePick}>
              {t('api.body.changeFile')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange('')}
              className="text-destructive hover:text-destructive"
            >
              <X className="w-4 h-4 mr-1" />
              {t('api.body.removeFile')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-secondary rounded-lg flex items-center justify-center">
            <Upload className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{t('api.body.selectFile')}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handlePick}>
            <Upload className="w-4 h-4 mr-2" />
            {t('api.body.browseFiles')}
          </Button>
        </div>
      )}
    </div>
  );
};
