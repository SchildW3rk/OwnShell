/**
 * Pane Content (v1.20.0 - Dynamic Grid Layout)
 *
 * Wrapper for different view types in workspace panels
 * Renders appropriate content based on pane type
 *
 * Each pane type has its own wrapper component that subscribes
 * only to the stores it needs, preventing unnecessary re-renders.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../i18n';
import {
  AlertCircle,
  Cable,
  Cloud,
  Container,
  Database,
  FolderOpen,
  FolderGit2,
  Loader2,
  Shield,
  Terminal as TerminalIcon,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { Button, cn, StatusDot } from '@ownshell/ui';
import { WorkspacePane, useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useHostStore } from '../../stores/useHostStore';
import { type TerminalSession, useTerminalStore } from '../../stores/useTerminalStore';
import { useTerminalChromeStore } from '../../stores/useTerminalChromeStore';
import { useDBConnections } from '../../hooks/db-explorer';
import { type SFTPStandaloneConnection, useSFTPConnections } from '../../hooks/sftp';

interface PaneContentProps {
  pane: WorkspacePane;
  isVisible: boolean;
}

const SessionView = React.lazy(() =>
  import('../SessionView').then((module) => ({ default: module.SessionView }))
);
const S3View = React.lazy(() => import('../S3View').then((module) => ({ default: module.S3View })));
const ApiClientView = React.lazy(() =>
  import('../api-client/ApiClientView').then((module) => ({ default: module.ApiClientView }))
);
const DBExplorerView = React.lazy(() =>
  import('../db-explorer/DBExplorerView').then((module) => ({ default: module.DBExplorerView }))
);
const SFTPStandaloneBrowser = React.lazy(() =>
  import('../sftp/SFTPStandaloneBrowser').then((module) => ({
    default: module.SFTPStandaloneBrowser,
  }))
);
const VaultView = React.lazy(() =>
  import('../vault/VaultView').then((module) => ({ default: module.VaultView }))
);
const ProjectView = React.lazy(() =>
  import('../../features/projects/ProjectView').then((module) => ({ default: module.ProjectView }))
);

const PaneLoadingFallback: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
  </div>
);

function PaneTypeIcon({ type }: { type: WorkspacePane['type'] }) {
  const className = "h-3.5 w-3.5";

  switch (type) {
    case 'project':
      return <FolderGit2 className={className} />;
    case 'terminal':
      return <TerminalIcon className={className} />;
    case 's3':
      return <Cloud className={className} />;
    case 'database':
      return <Database className={className} />;
    case 'sftp':
      return <FolderOpen className={className} />;
    case 'api':
      return <Cable className={className} />;
    case 'vault':
      return <Shield className={className} />;
    case 'docker':
      return <Container className={className} />;
    default:
      return <TerminalIcon className={className} />;
  }
}

function TerminalPaneStatus({ session }: { session?: TerminalSession }) {
  if (!session) return null;

  switch (session.state) {
    case 'connecting':
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />;
    case 'connected':
      return <StatusDot variant="success" size="sm" className="shrink-0" />;
    case 'error':
      return <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />;
    case 'disconnected':
      return <WifiOff className="h-3 w-3 shrink-0 text-muted-foreground" />;
    default:
      return null;
  }
}

function getTerminalStatusTitle(session?: TerminalSession): string | undefined {
  if (!session) return undefined;

  if (session.state === 'error') {
    return session.errorMessage || i18n.t('terminal.error');
  }

  if (session.kind === 'local') {
    return session.state === 'connected'
      ? i18n.t('terminal.localConnected')
      : `Local terminal ${session.state}`;
  }

  const target = session.host
    ? `${session.host.username}@${session.host.hostname}:${session.host.port}`
    : 'SSH terminal';

  return `${target} ${session.state}`;
}

function SFTPPaneStatus({ connection }: { connection?: SFTPStandaloneConnection }) {
  if (!connection) return null;

  switch (connection.status) {
    case 'connecting':
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />;
    case 'connected':
      return <StatusDot variant="success" size="sm" className="shrink-0" />;
    case 'error':
      return <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />;
    case 'disconnected':
      return <WifiOff className="h-3 w-3 shrink-0 text-muted-foreground" />;
    default:
      return null;
  }
}

function getSFTPStatusTitle(
  hostLabel: string | undefined,
  connection?: SFTPStandaloneConnection
): string | undefined {
  if (!connection) return hostLabel;
  if (connection.error) return connection.error;
  return `${hostLabel || connection.hostname} ${connection.status}`;
}

/**
 * SFTP Pane - subscribes to host store to resolve host object
 */
const SFTPPaneContent: React.FC<{ pane: WorkspacePane }> = ({ pane }) => {
  const removePane = useWorkspaceStore((state) => state.removePane);
  const sftpHost = useHostStore((state) => state.hosts.find((h) => h.id === pane.contentId));
  const { t } = useTranslation();

  if (!sftpHost) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <p>{t('hosts.notFound')}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removePane(pane.id)}
            className="mt-2"
          >
            {t('workspace.closePane')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<PaneLoadingFallback />}>
      <SFTPStandaloneBrowser host={sftpHost} />
    </React.Suspense>
  );
};

/**
 * Database Pane - subscribes to DB connections and terminal sessions
 * for SSH tunnel resolution
 */
const DatabasePaneContent: React.FC<{ pane: WorkspacePane }> = ({ pane }) => {
  const { data: dbConnections } = useDBConnections();
  const dbConnection = dbConnections?.find((c: any) => c.id === pane.contentId);

  const sshHostId =
    dbConnection?.connection_mode === 'ssh' ? dbConnection?.ssh_host_id : undefined;

  const dbSessionId = useTerminalStore((state) => {
    if (!sshHostId) return undefined;
    return state.sessions.find((s) => s.kind === 'ssh' && s.host?.id === sshHostId && s.sessionId)
      ?.sessionId;
  });

  return (
    <React.Suspense fallback={<PaneLoadingFallback />}>
      <DBExplorerView
        key={pane.id}
        initialConnectionId={pane.contentId}
        sessionId={dbSessionId || undefined}
        viewKey={pane.id}
      />
    </React.Suspense>
  );
};

/**
 * Renders the inner content view based on pane type.
 * Each branch either renders directly or delegates to a
 * type-specific component that subscribes to its own stores.
 */
function PaneInnerContent({ pane, isVisible }: PaneContentProps): React.ReactElement | null {
  switch (pane.type) {
    case 'project':
      return (
        <React.Suspense fallback={<PaneLoadingFallback />}>
          <ProjectView projectId={pane.contentId} />
        </React.Suspense>
      );
    case 'terminal':
      return (
        <React.Suspense fallback={<PaneLoadingFallback />}>
          <SessionView sessionId={pane.contentId} isVisible={isVisible} />
        </React.Suspense>
      );
    case 's3':
      return (
        <React.Suspense fallback={<PaneLoadingFallback />}>
          <S3View initialConnectionId={pane.contentId} />
        </React.Suspense>
      );
    case 'api':
      return (
        <React.Suspense fallback={<PaneLoadingFallback />}>
          <ApiClientView />
        </React.Suspense>
      );
    case 'database':
      return <DatabasePaneContent pane={pane} />;
    case 'sftp':
      return <SFTPPaneContent pane={pane} />;
    case 'vault':
      return (
        <React.Suspense fallback={<PaneLoadingFallback />}>
          <VaultView />
        </React.Suspense>
      );
    default:
      return null;
  }
}

/**
 * Main PaneContent wrapper with header bar and close button.
 * Only subscribes to the workspace actions it needs (removePane, setActivePane).
 */
export const PaneContent = React.memo<PaneContentProps>(function PaneContent({ pane, isVisible }) {
  const { t } = useTranslation();
  const removePane = useWorkspaceStore((state) => state.removePane);
  const setActivePane = useWorkspaceStore((state) => state.setActivePane);
  const activePaneId = useWorkspaceStore((state) => state.activePaneId);
  const closeSession = useTerminalStore((state) => state.closeSession);
  const setActiveSession = useTerminalStore((state) => state.setActiveSession);
  const { data: sftpConnections = [] } = useSFTPConnections();
  const terminalSession = useTerminalStore((state) =>
    pane.type === 'terminal'
      ? state.sessions.find((session) => session.id === pane.contentId)
      : undefined
  );
  const snippetsOpen = useTerminalChromeStore((state) =>
    pane.type === 'terminal' ? !!state.snippetsOpenBySessionId[pane.contentId] : false
  );
  const toggleSnippets = useTerminalChromeStore((state) => state.toggleSnippets);
  const clearSessionChrome = useTerminalChromeStore((state) => state.clearSessionChrome);

  const isActive = activePaneId === pane.id;
  const showTerminalShortcuts =
    pane.type === 'terminal' && terminalSession?.activeFeatureTab === 'terminal';
  const terminalStatusTitle = getTerminalStatusTitle(terminalSession);
  const sftpConnection =
    pane.type === 'sftp'
      ? sftpConnections.find((connection) => connection.hostId === pane.contentId)
      : undefined;
  const sftpStatusTitle = getSFTPStatusTitle(pane.title, sftpConnection);
  const paneStatusTitle = pane.type === 'terminal' ? terminalStatusTitle : sftpStatusTitle;

  const handleActivate = React.useCallback(() => {
    setActivePane(pane.id);
    if (pane.type === 'terminal') {
      setActiveSession(pane.contentId);
    }
  }, [pane.contentId, pane.id, pane.type, setActivePane, setActiveSession]);

  const handleClosePane = React.useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      removePane(pane.id);

      if (pane.type === 'terminal') {
        clearSessionChrome(pane.contentId);
        void closeSession(pane.contentId);
      }
    },
    [clearSessionChrome, closeSession, pane.contentId, pane.id, pane.type, removePane]
  );

  return (
    <div
      className={cn(
        'relative h-full w-full flex flex-col overflow-hidden bg-background transition-colors'
      )}
      onMouseDown={handleActivate}
    >
      {/* Pane Header */}
      <div
        className={cn(
          'flex h-8 items-center justify-between border-b px-2.5 text-xs',
          isActive
            ? 'border-primary/60 bg-background-secondary text-foreground'
            : 'border-border bg-surface/70 text-muted-foreground'
        )}
      >
        <div className="flex min-w-0 items-center gap-2" title={paneStatusTitle}>
          <span className={cn('shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')}>
            <PaneTypeIcon type={pane.type} />
          </span>
          {pane.type === 'terminal' && <TerminalPaneStatus session={terminalSession} />}
          {pane.type === 'sftp' && <SFTPPaneStatus connection={sftpConnection} />}
          <span className="truncate font-medium">{pane.title}</span>
        </div>

        <div className="flex items-center gap-1">
          {showTerminalShortcuts && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                toggleSnippets(pane.contentId);
              }}
              className={cn(
                'h-6 w-6 p-0',
                snippetsOpen
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title={t('terminal.toggleSnippets')}
            >
              <Zap className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClosePane}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title={t('workspace.closePane')}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PaneInnerContent pane={pane} isVisible={isVisible} />
      </div>

      {isActive && (
        <div className="pointer-events-none absolute inset-0 z-20 border border-primary/60" />
      )}
    </div>
  );
});
