import { useEffect } from 'react';

import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

function isCommandW(event: KeyboardEvent): boolean {
  return (
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'w'
  );
}

function isEditableNonTerminalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('.xterm') || target.classList.contains('xterm-helper-textarea')) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

export function useCloseActiveTerminalPaneShortcut() {
  const panes = useWorkspaceStore((state) => state.panes);
  const activePaneId = useWorkspaceStore((state) => state.activePaneId);
  const removePane = useWorkspaceStore((state) => state.removePane);
  const closeSession = useTerminalStore((state) => state.closeSession);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCommandW(event)) return;
      if (isEditableNonTerminalTarget(event.target)) return;

      const activePane = panes.find(
        (pane) => pane.id === activePaneId && pane.type === 'terminal'
      );
      if (!activePane) return;

      event.preventDefault();
      event.stopPropagation();

      removePane(activePane.id);
      void closeSession(activePane.contentId);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activePaneId, closeSession, panes, removePane]);
}
