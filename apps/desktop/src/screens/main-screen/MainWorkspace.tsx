import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, LayoutDashboard, Server, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '@ownshell/ui';

import { TransferQueuePanel } from '../../components/transfers';
import { LayoutSwitcher, WorkspaceView } from '../../components/workspace';
import type { WorkspacePane } from './types';

interface MainWorkspaceProps {
  showSettings: boolean;
  showVault: boolean;
  panes: WorkspacePane[];
  transferPanelOpen: boolean;
  onCloseSettings: () => void;
  onOpenLocalTerminal: () => void;
  onAddHost: () => void;
  onAddStorage: () => void;
  onToggleTransferPanel: () => void;
}

const SettingsView = React.lazy(() =>
  import('../SettingsView').then((module) => ({ default: module.SettingsView }))
);
const VaultView = React.lazy(() =>
  import('../../components/vault/VaultView').then((module) => ({ default: module.VaultView }))
);

const OverlayLoadingFallback: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
  </div>
);

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({
  showSettings,
  showVault,
  panes,
  transferPanelOpen,
  onCloseSettings,
  onOpenLocalTerminal,
  onAddHost,
  onAddStorage,
  onToggleTransferPanel,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-background relative">
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-background">
          <React.Suspense fallback={<OverlayLoadingFallback />}>
            <SettingsView onClose={onCloseSettings} />
          </React.Suspense>
        </div>
      )}
      {showVault && (
        <div className="absolute inset-0 z-50 bg-background">
          <React.Suspense fallback={<OverlayLoadingFallback />}>
            <VaultView />
          </React.Suspense>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {panes.length > 0 ? (
          <>
            <div className="flex h-9 items-center justify-between border-b border-border bg-surface/80 px-3">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <LayoutDashboard className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate font-medium text-foreground">Workspace</span>
                <span className="shrink-0 text-muted-foreground/70">
                  {panes.length} {panes.length === 1 ? 'pane' : 'panes'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenLocalTerminal}
                  className="no-drag"
                >
                  <TerminalIcon className="w-4 h-4 mr-2" />
                  Local
                </Button>

                <LayoutSwitcher />
              </div>
            </div>

            <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
              <WorkspaceView isVisible={!showSettings && !showVault} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 bg-background-secondary rounded-full flex items-center justify-center mx-auto mb-6">
                <Server className="w-12 h-12 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">{t('welcome.title')}</h2>
              <p className="text-muted-foreground mb-6 max-w-md">{t('welcome.description')}</p>
              <div className="flex justify-center gap-3">
                <Button variant="primary" onClick={onAddHost} className="no-drag">
                  <Server className="w-4 h-4 mr-2" />
                  {t('welcome.addHost')}
                </Button>
                <Button variant="secondary" onClick={onOpenLocalTerminal} className="no-drag">
                  <TerminalIcon className="w-4 h-4 mr-2" />
                  Local Terminal
                </Button>
                <Button variant="secondary" onClick={onAddStorage} className="no-drag">
                  <Cloud className="w-4 h-4 mr-2" />
                  {t('welcome.addStorage')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <TransferQueuePanel isOpen={transferPanelOpen} onToggle={onToggleTransferPanel} />
    </div>
  );
};
