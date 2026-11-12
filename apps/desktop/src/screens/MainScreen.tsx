import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import { useHostStore } from '../stores/useHostStore';
import { useTerminalStore } from '../stores/useTerminalStore';
import { useShallow } from 'zustand/react/shallow';
import { useS3Connections } from '../hooks/s3/useS3Queries';
import { useDeleteS3Connection } from '../hooks/s3/useS3Mutations';
import { useDBConnections, useDeleteDBConnection } from '../hooks/db-explorer';
import { HostsTable, DBConnectionsTable, ProjectsTable } from '@ownshell/core';
import { useSidebar, type SidebarSectionId } from '../components/sidebar';
import { AppHeader } from '../components/AppHeader';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { MainSidebar } from './main-screen/MainSidebar';
import { MainWorkspace } from './main-screen/MainWorkspace';
import type { EditingS3Connection } from './main-screen/types';
import { useMainApiActions } from './main-screen/useMainApiActions';
import { useMainNavItems } from './main-screen/useMainNavItems';
import { useCloseActiveTerminalPaneShortcut } from './main-screen/useCloseActiveTerminalPaneShortcut';
import { useMainWorkspaceActions } from './main-screen/useMainWorkspaceActions';
import { queryKeys } from '../lib/queryClient';
import { UpdateNotification } from '../components/UpdateNotification';
import { useProjects } from '../features/projects/useProjectQueries';

const MainDialogs = React.lazy(() =>
  import('./main-screen/MainDialogs').then((module) => ({ default: module.MainDialogs }))
);

export const MainScreen: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { hosts, loadHosts, deleteHost, isLoading: isLoadingHosts } = useHostStore();
  const {
    sessions,
    createSession,
    createLocalSession,
    setActiveSession,
  } = useTerminalStore(
    useShallow((state) => ({
      sessions: state.sessions,
      createSession: state.createSession,
      createLocalSession: state.createLocalSession,
      setActiveSession: state.setActiveSession,
    }))
  );
  const { isSlim } = useSidebar();

  // Workspace store (v1.20.0 - Single Source of Truth)
  const { panes, addPane, removePane, setActivePane, updatePane } = useWorkspaceStore();

  // S3 connections via TanStack Query
  const { data: s3Connections = [], isLoading: isLoadingS3 } = useS3Connections();
  const deleteS3ConnectionMutation = useDeleteS3Connection();

  // Database connections via TanStack Query
  const { data: dbConnections = [], isLoading: isLoadingDB } = useDBConnections();
  const deleteDBConnectionMutation = useDeleteDBConnection();

  const { data: projects = [], isLoading: isLoadingProjects } = useProjects();

  const [isHostFormOpen, setIsHostFormOpen] = useState(false);
  const [isS3ModalOpen, setIsS3ModalOpen] = useState(false);
  const [isDBModalOpen, setIsDBModalOpen] = useState(false);

  // Overlay states (Settings & Vault remain as overlays, not workspace panes)
  const [showSettings, setShowSettings] = useState(false);
  const [showVault, setShowVault] = useState(false);

  // Edit states
  const [editingHost, setEditingHost] = useState<HostsTable | undefined>();
  const [defaultConnectionType, setDefaultConnectionType] = useState<'ssh' | 'sftp_only'>('ssh');
  const [editingS3Connection, setEditingS3Connection] = useState<
    EditingS3Connection | undefined
  >();

  // Delete confirmation states
  const [deleteHostConfirm, setDeleteHostConfirm] = useState<HostsTable | null>(null);
  const [deleteS3Confirm, setDeleteS3Confirm] = useState<string | null>(null);
  const [deleteDBConfirm, setDeleteDBConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Editing states
  const [editingDBConnection, setEditingDBConnection] = useState<DBConnectionsTable | null>(null);

  // Filter hosts: SSH vs SFTP-only (v1.16.0)
  const sshHosts = useMemo(() => hosts.filter((h) => h.connection_type !== 'sftp_only'), [hosts]);
  const sftpTransferHosts = hosts;

  // Transfer panel state (v1.16.0)
  const [transferPanelOpen, setTransferPanelOpen] = useState(false);

  // Active sidebar section (v1.18.0 - VS Code style)
  const [activeSidebarSection, setActiveSidebarSection] = useState<SidebarSectionId>('servers');

  // Close overlay views (Settings & Vault)
  const closeOverlays = () => {
    setShowSettings(false);
    setShowVault(false);
  };

  const navItems = useMainNavItems({
    projectCount: projects.length,
    sshHostCount: sshHosts.length,
    databaseCount: dbConnections.length,
    sftpHostCount: sftpTransferHosts.length,
    s3ConnectionCount: s3Connections.length,
  });

  // Load hosts on mount (S3 connections are auto-loaded by TanStack Query)
  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  useEffect(() => {
    const terminalSessionIds = new Set(sessions.map((session) => session.id));
    const staleTerminalPanes = panes.filter(
      (pane) => pane.type === 'terminal' && !terminalSessionIds.has(pane.contentId)
    );

    for (const pane of staleTerminalPanes) {
      removePane(pane.id);
    }
  }, [panes, removePane, sessions]);

  useEffect(() => {
    if (isLoadingProjects) return;

    const projectsById = new Map(projects.map((project) => [project.id, project]));
    for (const pane of panes) {
      if (pane.type !== 'project') continue;

      const project = projectsById.get(pane.contentId);
      if (!project) {
        removePane(pane.id);
      } else if (pane.title !== project.name) {
        updatePane(pane.id, { title: project.name });
      }
    }
  }, [isLoadingProjects, panes, projects, removePane, updatePane]);

  const { ensureApiPane, openS3Pane, openDatabasePane, openProjectPane } = useMainWorkspaceActions({
    panes,
    addPane,
    setActivePane,
  });
  const apiActions = useMainApiActions({ ensureApiPane });
  useCloseActiveTerminalPaneShortcut();

  // === Event Handlers ===

  const handleSectionChange = (section: SidebarSectionId) => {
    setActiveSidebarSection(section);
    closeOverlays();
  };

  const handleProjectSelect = (project: ProjectsTable) => {
    closeOverlays();
    openProjectPane(project.id, project.name);
  };

  const handleLocalTerminalOpen = () => {
    closeOverlays();
    const termSessionId = createLocalSession();
    addPane({
      type: 'terminal',
      contentId: termSessionId,
      title: 'Local Terminal',
    });
  };

  const handleHostSelect = (hostId: string) => {
    closeOverlays();
    const host = hosts.find((h) => h.id === hostId);
    if (!host) return;

    // Check if this is an SFTP-only host (v1.16.0)
    if (host.connection_type === 'sftp_only') {
      // SFTP is singleton per host - focus existing pane if it exists (v1.20.0 consistency)
      const existingSFTPPane = panes.find((p) => p.type === 'sftp' && p.contentId === hostId);

      if (existingSFTPPane) {
        // ✅ SFTP pane exists! Focus it instead of creating a new one
        setActivePane(existingSFTPPane.id);
      } else {
        // Create new SFTP pane
        addPane({
          type: 'sftp',
          contentId: hostId,
          title: `SFTP: ${host.label}`,
        });
      }

      return;
    }

    // Regular SSH host: every click opens an independent terminal pane.
    const existingHostSessions = sessions.filter(
      (session) => session.kind === 'ssh' && session.host?.id === hostId
    );
    const nextSessionNumber = existingHostSessions.length + 1;
    const termSessionId = createSession(host);

    addPane({
      type: 'terminal',
      contentId: termSessionId,
      title: `${host.label || `${host.username}@${host.hostname}`}${
        nextSessionNumber > 1 ? ` #${nextSessionNumber}` : ''
      }`,
    });
  };

  const handleSFTPHostSelect = (hostId: string) => {
    closeOverlays();
    const host = hosts.find((h) => h.id === hostId);
    if (!host) return;

    const existingSFTPPane = panes.find((p) => p.type === 'sftp' && p.contentId === hostId);

    if (existingSFTPPane) {
      setActivePane(existingSFTPPane.id);
      return;
    }

    addPane({
      type: 'sftp',
      contentId: hostId,
      title: `SFTP: ${host.label}`,
    });
  };

  const handleS3ConnectionSelect = (connectionId: string) => {
    closeOverlays();
    const conn = s3Connections.find((c) => c.id === connectionId);
    openS3Pane(connectionId, `S3: ${conn?.label || 'Browser'}`);
  };

  const handleDeleteS3Connection = (id: string) => {
    setDeleteS3Confirm(id);
  };

  const confirmDeleteS3 = () => {
    if (!deleteS3Confirm) return;
    setIsDeleting(true);
    deleteS3ConnectionMutation.mutate(deleteS3Confirm, {
      onSettled: () => {
        setIsDeleting(false);
        setDeleteS3Confirm(null);
      },
    });
  };

  const handleEditHost = (host: HostsTable) => {
    setEditingHost(host);
    setIsHostFormOpen(true);
  };

  const handleDeleteHost = (host: HostsTable) => {
    setDeleteHostConfirm(host);
  };

  const confirmDeleteHost = async () => {
    if (!deleteHostConfirm) return;
    setIsDeleting(true);
    try {
      await deleteHost(deleteHostConfirm.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('hosts.deleteFailed'));
    } finally {
      setIsDeleting(false);
      setDeleteHostConfirm(null);
    }
  };

  const handleEditS3Connection = (conn: typeof editingS3Connection) => {
    setEditingS3Connection(conn);
    setIsS3ModalOpen(true);
  };

  const handleHostFormClose = () => {
    setIsHostFormOpen(false);
    setEditingHost(undefined);
  };

  const handleS3ModalClose = () => {
    setIsS3ModalOpen(false);
    setEditingS3Connection(undefined);
  };

  // Database connection handlers
  const handleDBConnectionSelect = (connectionId: string) => {
    closeOverlays();
    const connection = dbConnections.find((c: DBConnectionsTable) => c.id === connectionId);

    // Check if this is an SSH-mode connection that needs a session
    if (connection?.connection_mode === 'ssh' && connection?.ssh_host_id) {
      const existingSession = sessions.find(
        (s) => s.kind === 'ssh' && s.host?.id === connection.ssh_host_id && s.state !== 'error'
      );

      if (existingSession) {
        setActiveSession(existingSession.id);
      } else {
        const host = hosts.find((h) => h.id === connection.ssh_host_id);
        if (host) {
          createSession(host);
        }
      }
    }

    openDatabasePane(connectionId, `DB: ${connection?.name || 'Explorer'}`);
  };

  const handleEditDBConnection = (conn: DBConnectionsTable) => {
    setEditingDBConnection(conn);
    setIsDBModalOpen(true);
  };

  const handleDeleteDBConnection = (id: string) => {
    setDeleteDBConfirm(id);
  };

  const handleUpdateHostOrganization = async (
    host: HostsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => {
    await window.electronAPI.hosts.update(host.id, update);
    await loadHosts();
  };

  const handleUpdateS3Organization = async (
    connection: (typeof s3Connections)[number],
    update: { favorite?: number; folder_id?: string | null }
  ) => {
    await window.electronAPI.s3Connections.update(connection.id, update);
    await queryClient.invalidateQueries({ queryKey: queryKeys.s3.connections() });
  };

  const handleUpdateDatabaseOrganization = async (
    connection: DBConnectionsTable,
    update: { favorite?: number; folder_id?: string | null }
  ) => {
    await window.electronAPI.dbConnections.update(connection.id, {
      favorite: update.favorite,
      folderId: update.folder_id,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.dbExplorer.connections() });
  };

  const confirmDeleteDB = () => {
    if (!deleteDBConfirm) return;
    setIsDeleting(true);
    deleteDBConnectionMutation.mutate(deleteDBConfirm, {
      onSettled: () => {
        setIsDeleting(false);
        setDeleteDBConfirm(null);
      },
    });
  };

  const handleDBModalClose = () => {
    setIsDBModalOpen(false);
    setEditingDBConnection(null);
  };

  const handleAddHost = (connectionType: 'ssh' | 'sftp_only') => {
    setEditingHost(undefined);
    setDefaultConnectionType(connectionType);
    setIsHostFormOpen(true);
  };

  const handleOpenVault = () => {
    setShowSettings(false);
    setShowVault(true);
  };

  const hasOpenDialog =
    isHostFormOpen ||
    isS3ModalOpen ||
    isDBModalOpen ||
    !!deleteHostConfirm ||
    !!deleteS3Confirm ||
    !!deleteDBConfirm ||
    !!apiActions.deleteApiCollectionConfirm ||
    !!apiActions.deleteApiRequestConfirm ||
    !!apiActions.editingApiCollection ||
    !!apiActions.editingApiRequest;

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader
        onOpenSettings={() => {
          setShowVault(false);
          setShowSettings(true);
        }}
      />

      <div className="flex flex-1 min-h-0">
        <MainSidebar
          navItems={navItems}
          activeSection={activeSidebarSection}
          onSectionChange={handleSectionChange}
          isSlim={isSlim}
          projects={projects}
          hosts={hosts}
          sshHosts={sshHosts}
          sftpHosts={sftpTransferHosts}
          dbConnections={dbConnections}
          s3Connections={s3Connections}
          panes={panes}
          sessions={sessions}
          isLoadingHosts={isLoadingHosts}
          isLoadingProjects={isLoadingProjects}
          isLoadingDB={isLoadingDB}
          isLoadingS3={isLoadingS3}
          showVault={showVault}
          onAddHost={handleAddHost}
          onProjectSelect={handleProjectSelect}
          onHostSelect={handleHostSelect}
          onSFTPHostSelect={handleSFTPHostSelect}
          onEditHost={handleEditHost}
          onDeleteHost={handleDeleteHost}
          onUpdateHostOrganization={handleUpdateHostOrganization}
          onAddDatabase={() => setIsDBModalOpen(true)}
          onDatabaseSelect={handleDBConnectionSelect}
          onEditDatabase={handleEditDBConnection}
          onDeleteDatabase={handleDeleteDBConnection}
          onUpdateDatabaseOrganization={handleUpdateDatabaseOrganization}
          onAddS3={() => setIsS3ModalOpen(true)}
          onS3Select={handleS3ConnectionSelect}
          onEditS3={handleEditS3Connection}
          onDeleteS3={handleDeleteS3Connection}
          onUpdateS3Organization={handleUpdateS3Organization}
          onOpenVault={handleOpenVault}
          onSelectApiRequest={apiActions.handleSelectApiRequest}
          onCreateApiCollection={apiActions.handleCreateApiCollection}
          onCreateApiRequest={apiActions.handleCreateApiRequest}
          onEditApiCollection={apiActions.handleEditApiCollection}
          onDeleteApiCollection={apiActions.handleDeleteApiCollection}
          onEditApiRequest={apiActions.handleEditApiRequest}
          onDeleteApiRequest={apiActions.handleDeleteApiRequest}
          onDuplicateApiRequest={apiActions.handleDuplicateApiRequest}
        />

        <MainWorkspace
          showSettings={showSettings}
          showVault={showVault}
          panes={panes}
          transferPanelOpen={transferPanelOpen}
          onCloseSettings={() => setShowSettings(false)}
          onOpenLocalTerminal={handleLocalTerminalOpen}
          onAddHost={() => handleAddHost('ssh')}
          onAddStorage={() => setIsS3ModalOpen(true)}
          onToggleTransferPanel={() => setTransferPanelOpen(!transferPanelOpen)}
        />
      </div>

      {hasOpenDialog && (
        <React.Suspense fallback={null}>
          <MainDialogs
            isHostFormOpen={isHostFormOpen}
            editingHost={editingHost}
            defaultConnectionType={defaultConnectionType}
            onHostFormClose={handleHostFormClose}
            isS3ModalOpen={isS3ModalOpen}
            editingS3Connection={editingS3Connection}
            onS3ModalClose={handleS3ModalClose}
            isDBModalOpen={isDBModalOpen}
            editingDBConnection={editingDBConnection}
            onDBModalClose={handleDBModalClose}
            onDBCreated={(id) => {
              handleDBConnectionSelect(id);
              setIsDBModalOpen(false);
              setEditingDBConnection(null);
            }}
            deleteHostConfirm={deleteHostConfirm}
            deleteS3Confirm={deleteS3Confirm}
            deleteDBConfirm={deleteDBConfirm}
            isDeleting={isDeleting}
            onConfirmDeleteHost={confirmDeleteHost}
            onCancelDeleteHost={() => setDeleteHostConfirm(null)}
            onConfirmDeleteS3={confirmDeleteS3}
            onCancelDeleteS3={() => setDeleteS3Confirm(null)}
            onConfirmDeleteDB={confirmDeleteDB}
            onCancelDeleteDB={() => setDeleteDBConfirm(null)}
            deleteApiCollectionConfirm={apiActions.deleteApiCollectionConfirm}
            deleteApiRequestConfirm={apiActions.deleteApiRequestConfirm}
            onConfirmDeleteApiCollection={apiActions.confirmDeleteApiCollection}
            onCancelDeleteApiCollection={apiActions.cancelDeleteApiCollection}
            onConfirmDeleteApiRequest={apiActions.confirmDeleteApiRequest}
            onCancelDeleteApiRequest={apiActions.cancelDeleteApiRequest}
            editingApiCollection={apiActions.editingApiCollection}
            editingApiRequest={apiActions.editingApiRequest}
            editApiName={apiActions.editApiName}
            onEditApiNameChange={apiActions.setEditApiName}
            onCancelEditApiCollection={apiActions.cancelEditApiCollection}
            onSaveApiCollection={apiActions.handleSaveApiCollection}
            isSavingApiCollection={apiActions.isSavingApiCollection}
            onCancelEditApiRequest={apiActions.cancelEditApiRequest}
            onSaveApiRequest={apiActions.handleSaveApiRequest}
            isSavingApiRequest={apiActions.isSavingApiRequest}
          />
        </React.Suspense>
      )}

      <UpdateNotification suppress={showSettings || showVault} />
    </div>
  );
};
