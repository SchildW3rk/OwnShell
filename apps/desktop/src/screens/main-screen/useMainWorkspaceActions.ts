import type { WorkspacePane } from './types';

interface UseMainWorkspaceActionsOptions {
  panes: WorkspacePane[];
  addPane: (pane: Omit<WorkspacePane, 'id'>) => string;
  setActivePane: (paneId: string) => void;
}

export function useMainWorkspaceActions({
  panes,
  addPane,
  setActivePane,
}: UseMainWorkspaceActionsOptions) {
  const ensureApiPane = () => {
    const existingApiPane = panes.find((p) => p.type === 'api');
    if (existingApiPane) {
      setActivePane(existingApiPane.id);
      return;
    }

    addPane({
      type: 'api',
      contentId: 'api-client',
      title: 'API Client',
    });
  };

  const openS3Pane = (connectionId: string, title: string) => {
    const existingS3Pane = panes.find((p) => p.type === 's3' && p.contentId === connectionId);

    if (existingS3Pane) {
      setActivePane(existingS3Pane.id);
      return;
    }

    addPane({
      type: 's3',
      contentId: connectionId,
      title,
    });
  };

  const openDatabasePane = (connectionId: string, title: string) => {
    const existingDBPanesForConnection = panes.filter(
      (p) => p.type === 'database' && p.contentId === connectionId
    );
    const paneTitle =
      existingDBPanesForConnection.length > 0
        ? `${title} #${existingDBPanesForConnection.length + 1}`
        : title;

    addPane({
      type: 'database',
      contentId: connectionId,
      title: paneTitle,
    });
  };

  const openProjectPane = (projectId: string, title: string) => {
    const existingProjectPane = panes.find(
      (pane) => pane.type === 'project' && pane.contentId === projectId
    );
    if (existingProjectPane) {
      setActivePane(existingProjectPane.id);
      return;
    }

    addPane({
      type: 'project',
      contentId: projectId,
      title,
    });
  };

  return { ensureApiPane, openS3Pane, openDatabasePane, openProjectPane };
}
