import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AlertTriangle, Clipboard, Terminal } from 'lucide-react';
import { Button, Modal } from '@ownshell/ui';

interface DBShellMissingToolDialogProps {
  isOpen: boolean;
  tool: string | null;
  onClose: () => void;
}

const INSTALL_COMMANDS: Record<string, string> = {
  mongosh: 'brew install mongosh',
  psql: 'brew install libpq && brew link --force libpq',
  mysql: 'brew install mysql-client && brew link --force mysql-client',
  'redis-cli': 'brew install redis',
  sqlite3: 'brew install sqlite',
};

export const DBShellMissingToolDialog: React.FC<DBShellMissingToolDialogProps> = ({
  isOpen,
  tool,
  onClose,
}) => {
  const { t } = useTranslation();
  const displayTool = tool?.trim() || 'Database CLI';
  const installCommand = useMemo(
    () => INSTALL_COMMANDS[displayTool.toLowerCase()] ?? null,
    [displayTool]
  );

  const handleCopyInstallCommand = async () => {
    if (!installCommand) return;

    try {
      await navigator.clipboard.writeText(installCommand);
      toast.success(t('db.openShellInstallCommandCopied', 'Install command copied'));
    } catch {
      toast.error(t('db.openShellInstallCommandCopyFailed', 'Install command could not be copied'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('db.openShellMissingToolTitle', '{{tool}} is missing', { tool: displayTool })}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          {installCommand && (
            <Button type="button" variant="primary" onClick={handleCopyInstallCommand}>
              <Clipboard className="mr-2 h-4 w-4" />
              {t('db.openShellCopyInstallCommand', 'Copy install command')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm leading-6 text-foreground">
            {t(
              'db.openShellMissingToolDescription',
              'OwnShell does not bundle this CLI. Install it locally so OwnShell can open the shell for the connected database.'
            )}
          </p>
        </div>

        {installCommand ? (
          <div className="rounded border border-border bg-surface/50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Terminal className="h-4 w-4 text-primary" />
              {t('db.openShellInstallCommand', 'Install command')}
            </div>
            <pre className="overflow-x-auto rounded bg-background px-3 py-2 text-sm text-muted-foreground">
              <code>{installCommand}</code>
            </pre>
          </div>
        ) : (
          <p className="rounded border border-border bg-surface/50 p-3 text-sm leading-6 text-muted-foreground">
            {t(
              'db.openShellNoInstallCommand',
              'There is no install hint for this tool yet. Install it through your package manager and restart OwnShell afterwards.'
            )}
          </p>
        )}

        <p className="text-sm leading-6 text-muted-foreground">
          {t(
            'db.openShellMissingToolHint',
            'The database connection itself still works. Only the native shell needs the local tool.'
          )}
        </p>
      </div>
    </Modal>
  );
};
