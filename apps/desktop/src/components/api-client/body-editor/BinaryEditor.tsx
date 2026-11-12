import React, { useCallback, useMemo, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button, formatBytes } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';


interface BinaryEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const BinaryEditor: React.FC<BinaryEditorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fileInfo = useMemo(() => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }, [value]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        onChange(
          JSON.stringify({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          })
        );
      }
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onChange]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />

      {fileInfo || selectedFile ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-secondary rounded-lg flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {selectedFile?.name || fileInfo?.name}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatBytes(selectedFile?.size || fileInfo?.size || 0)}
              {(selectedFile?.type || fileInfo?.type) && (
                <span className="ml-2">({selectedFile?.type || fileInfo?.type})</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              {t('api.body.changeFile', 'Change File')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-destructive hover:text-destructive"
            >
              <X className="w-4 h-4 mr-1" />
              {t('api.body.removeFile', 'Remove')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-secondary rounded-lg flex items-center justify-center">
            <Upload className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {t('api.body.selectFile', 'Select a file to upload')}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {t('api.body.browseFiles', 'Browse Files')}
          </Button>
        </div>
      )}
    </div>
  );
};
