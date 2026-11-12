/**
 * Session View with Tabs
 *
 * Container component that provides tabbed interface for:
 * - Terminal (default)
 * - SFTP File Browser
 * - Port Forwarding (Tunnels)
 * - Docker Dashboard
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal as TerminalIcon, FolderOpen, Cable, Container, Database } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { LocalTerminalView } from './LocalTerminalView';
import { NativeSshTerminalView } from './NativeSshTerminalView';
import { type TerminalSessionFeatureTab, useTerminalStore } from '../stores/useTerminalStore';
import { cn } from '@ownshell/ui';
import { useShallow } from 'zustand/react/shallow';
import { useFeatureSshSession } from './terminal-view/useFeatureSshSession';

interface SessionViewProps {
  sessionId: string;
  isVisible: boolean;
}

type SessionTab = TerminalSessionFeatureTab;

const TAB_DEFINITIONS: {
  id: SessionTab;
  icon: React.FC<{ className?: string }>;
  labelKey: string;
}[] = [
  { id: 'terminal', icon: TerminalIcon, labelKey: 'tabs.terminal' },
  { id: 'sftp', icon: FolderOpen, labelKey: 'tabs.files' },
  { id: 'tunnels', icon: Cable, labelKey: 'tabs.tunnels' },
  { id: 'docker', icon: Container, labelKey: 'tabs.docker' },
  { id: 'database', icon: Database, labelKey: 'tabs.database' },
];

const SFTPDualPane = React.lazy(() =>
  import('./sftp/SFTPDualPane').then((module) => ({ default: module.SFTPDualPane }))
);
const TunnelView = React.lazy(() =>
  import('./TunnelView').then((module) => ({ default: module.TunnelView }))
);
const DockerViewPro = React.lazy(() =>
  import('./docker/DockerViewPro').then((module) => ({ default: module.DockerViewPro }))
);
const DBExplorerView = React.lazy(() =>
  import('./db-explorer/DBExplorerView').then((module) => ({ default: module.DBExplorerView }))
);

export const SessionView: React.FC<SessionViewProps> = ({ sessionId, isVisible }) => {
  const { t } = useTranslation();
  const session = useTerminalStore((state) => state.sessions.find((s) => s.id === sessionId));
  const setSessionFeatureTab = useTerminalStore((state) => state.setSessionFeatureTab);
  const activeTab = session?.activeFeatureTab ?? 'terminal';
  const visitedTabs = session?.visitedFeatureTabs ?? ['terminal'];
  const isLocalSession = session?.kind === 'local';
  const useNativeTerminal = Boolean(
    session?.kind === 'ssh' && session.host && !session.host.jump_host_id
  );
  const featureSsh = useFeatureSshSession(
    sessionId,
    Boolean(!isLocalSession && activeTab !== 'terminal')
  );

  // Select only the specific session's host ID to avoid re-renders from other sessions
  const hostId = useTerminalStore(
    useShallow((state) => state.sessions.find((s) => s.id === sessionId)?.host?.id)
  );
  const visibleTabs = isLocalSession
    ? TAB_DEFINITIONS.filter((tab) => tab.id === 'terminal' || tab.id === 'docker')
    : TAB_DEFINITIONS;
  const showTabBar = visibleTabs.length > 1;

  const handleTabChange = (tabId: SessionTab) => {
    setSessionFeatureTab(sessionId, tabId);
  };

  const shouldRenderTab = (tabId: SessionTab) => visitedTabs.includes(tabId);
  const panelClassName = (tabId: SessionTab) =>
    cn('h-full min-h-0 overflow-hidden', activeTab === tabId ? 'block' : 'hidden');

  return (
    <div className="flex flex-col h-full min-h-0">
      {showTabBar && (
        <div className="flex overflow-x-auto border-b border-border bg-background">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'no-drag flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'text-foreground bg-background border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <Icon className="w-4 h-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {shouldRenderTab('terminal') && (
          <div className={panelClassName('terminal')}>
            {isLocalSession ? (
              <LocalTerminalView sessionId={sessionId} />
            ) : useNativeTerminal ? (
              <NativeSshTerminalView sessionId={sessionId} />
            ) : (
              <TerminalView sessionId={sessionId} />
            )}
          </div>
        )}

        {!isLocalSession &&
          activeTab !== 'terminal' &&
          featureSsh.status === 'connecting' &&
          !session?.sessionId && <FeatureSshLoading />}
        {!isLocalSession &&
          activeTab !== 'terminal' &&
          featureSsh.status === 'error' &&
          !session?.sessionId && (
            <FeatureSshError message={featureSsh.error || 'Connection failed'} />
          )}

        {shouldRenderTab('sftp') && session?.sessionId && (
          <div className={panelClassName('sftp')}>
            <React.Suspense fallback={<FeatureTabLoading />}>
              <SFTPDualPane primarySessionId={sessionId} />
            </React.Suspense>
          </div>
        )}
        {shouldRenderTab('tunnels') && session?.sessionId && (
          <div className={panelClassName('tunnels')}>
            <React.Suspense fallback={<FeatureTabLoading />}>
              <TunnelView sessionId={sessionId} />
            </React.Suspense>
          </div>
        )}
        {shouldRenderTab('docker') && (isLocalSession || session?.sessionId) && (
          <div className={panelClassName('docker')}>
            <React.Suspense fallback={<FeatureTabLoading />}>
              <DockerViewPro sessionId={sessionId} isVisible={isVisible && activeTab === 'docker'} />
            </React.Suspense>
          </div>
        )}
        {shouldRenderTab('database') && session?.sessionId && (
          <div className={panelClassName('database')}>
            <React.Suspense fallback={<FeatureTabLoading />}>
              <DBExplorerView sessionId={session.sessionId} filteredHostId={hostId} />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  );
};

const FeatureSshLoading: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      {t('workspace.featureSessionPreparing')}
    </div>
  );
};

const FeatureTabLoading: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
  </div>
);

const FeatureSshError: React.FC<{ message: string }> = ({ message }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-md rounded border border-border bg-background p-4 text-sm">
        <div className="font-medium text-destructive mb-2">{t('workspace.featureSessionFailed')}</div>
        <div className="text-muted-foreground">{message}</div>
      </div>
    </div>
  );
};
