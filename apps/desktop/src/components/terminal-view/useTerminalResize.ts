import { MutableRefObject, RefObject, useEffect } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

interface ResizeSession {
  sessionId?: string | null;
  state?: string;
}

interface UseTerminalResizeOptions {
  terminalRef: RefObject<HTMLDivElement | null>;
  terminal: MutableRefObject<Terminal | null>;
  fitAddon: MutableRefObject<FitAddon | null>;
  session: ResizeSession | undefined;
}

export function useTerminalResize({
  terminalRef,
  terminal,
  fitAddon,
  session,
}: UseTerminalResizeOptions) {
  useEffect(() => {
    if (!terminalRef.current || !terminal.current || !fitAddon.current) return;
    if (!session) return;

    const term = terminal.current;
    const fit = fitAddon.current;

    let resizeTimerId: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      try {
        fit.fit();

        if (session.sessionId && session.state === 'connected') {
          const { cols, rows } = term;
          window.electronAPI.ssh.resize(session.sessionId, cols, rows);
        }
      } catch (error) {
        console.error('Failed to resize terminal:', error);
      }
    };

    const debouncedResize = () => {
      if (resizeTimerId) {
        clearTimeout(resizeTimerId);
      }
      resizeTimerId = setTimeout(handleResize, 50);
    };

    const resizeObserver = new ResizeObserver(debouncedResize);
    resizeObserver.observe(terminalRef.current);

    setTimeout(handleResize, 100);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimerId) {
        clearTimeout(resizeTimerId);
      }
    };
  }, [terminalRef, terminal, fitAddon, session?.sessionId, session?.state]);
}
