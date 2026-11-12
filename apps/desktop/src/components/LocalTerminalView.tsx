/**
 * Local Terminal View
 *
 * Uses node-pty through the Electron main process for low-latency local shell I/O.
 * This is macOS-only for now.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useAppearanceStore } from '../stores/useAppearanceStore';
import { useTerminalStore } from '../stores/useTerminalStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTerminalChromeStore } from '../stores/useTerminalChromeStore';
import { normalizeTerminalFontFamily } from '../utils/appearance';
import { SnippetsSidebar } from './SnippetsSidebar';
import { TERMINAL_FONT_FAMILY, TERMINAL_THEMES } from './terminal-view/themes';
import { useTerminalAppearance } from './terminal-view/useTerminalAppearance';
import { useSnippetsShortcut } from './terminal-view/useSnippetsShortcut';
import {
  activeMounts,
  appendTerminalHistory,
  clearTerminalHistory,
  getTerminalHistory,
  pendingWrites,
  rafScheduled,
  scheduleWrite,
} from './terminal-view/runtime';
import { useTranslation } from 'react-i18next';
import '@xterm/xterm/css/xterm.css';

const localPtySessionIds = new Map<string, string>();
const localConnectionState = new Map<string, 'connecting' | string>();
const localConnectionPromises = new Map<string, Promise<string>>();
const localListenerCleanups = new Map<string, () => void>();
interface LocalTerminalViewProps {
  sessionId: string;
}

export const LocalTerminalView: React.FC<LocalTerminalViewProps> = ({
  sessionId: termSessionId,
}) => {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const hasInitialized = useRef(false);
  const terminalFontFamily = useAppearanceStore((state) => state.terminalFontFamily);
  const terminalFontSize = useAppearanceStore((state) => state.terminalFontSize);
  const snippetsOpen = useTerminalChromeStore(
    (state) => !!state.snippetsOpenBySessionId[termSessionId]
  );
  const toggleSnippets = useTerminalChromeStore((state) => state.toggleSnippets);
  const setSnippetsOpen = useTerminalChromeStore((state) => state.setSnippetsOpen);

  const session = useTerminalStore((state) => state.sessions.find((s) => s.id === termSessionId));
  const setSessionState = useTerminalStore((state) => state.setSessionState);
  const setSessionId = useTerminalStore((state) => state.setSessionId);
  const markStartupCommandSent = useTerminalStore((state) => state.markStartupCommandSent);
  const closeSession = useTerminalStore((state) => state.closeSession);
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const isActivePane = useWorkspaceStore((state) =>
    state.panes.some(
      (pane) =>
        pane.id === state.activePaneId &&
        pane.type === 'terminal' &&
        pane.contentId === termSessionId
    )
  );

  const sendToTerminal = useCallback(
    (text: string) => {
      const ptySessionId = localPtySessionIds.get(termSessionId);
      if (ptySessionId) {
        window.electronAPI.localPty.write(ptySessionId, text);
      }
    },
    [termSessionId]
  );

  const focusTerminal = useCallback(() => {
    terminal.current?.focus();
  }, []);

  const sendStartupCommand = useCallback(
    (ptySessionId: string) => {
      const currentSession = useTerminalStore
        .getState()
        .sessions.find((candidate) => candidate.id === termSessionId);
      const command = currentSession?.startupCommand?.trim();

      if (!currentSession || !command || currentSession.startupCommandSent) return;

      window.electronAPI.localPty.write(ptySessionId, `${command}\r`);
      markStartupCommandSent(termSessionId);
    },
    [markStartupCommandSent, termSessionId]
  );

  const getStartupEnv = useCallback(() => {
    return useTerminalStore
      .getState()
      .sessions.find((candidate) => candidate.id === termSessionId)?.startupEnv;
  }, [termSessionId]);

  const handleToggleSnippets = useCallback(
    () => toggleSnippets(termSessionId),
    [termSessionId, toggleSnippets]
  );
  useSnippetsShortcut(handleToggleSnippets, isActivePane);

  const resizeLocalPty = useCallback(
    (cols: number, rows: number) => {
      const ptySessionId = localPtySessionIds.get(termSessionId);
      if (ptySessionId) {
        window.electronAPI.localPty.resize(ptySessionId, cols, rows);
      }
    },
    [termSessionId]
  );

  const handleExit = useCallback(
    (term: Terminal, event: { exitCode: number; signal?: number }) => {
      setSessionState(termSessionId, 'disconnected');
      localPtySessionIds.delete(termSessionId);
      localConnectionState.delete(termSessionId);
      pendingWrites.delete(termSessionId);
      rafScheduled.delete(termSessionId);
      clearTerminalHistory(termSessionId);

      if (event.signal) {
        term.writeln(`\r\n\x1b[1;31mLocal shell terminated by signal: ${event.signal}\x1b[0m\r\n`);
      } else if (event.exitCode !== 0) {
        term.writeln(`\r\n\x1b[1;33mLocal shell exited with code ${event.exitCode}\x1b[0m\r\n`);
      } else {
        term.writeln('\r\n\x1b[1;32mLocal shell ended normally\x1b[0m\r\n');
        setTimeout(() => closeSession(termSessionId), 1200);
      }
    },
    [termSessionId, setSessionState, closeSession]
  );

  const registerLocalListeners = useCallback(
    (term: Terminal, fit: FitAddon, ptySessionId: string): (() => void) => {
      let isCleanedUp = false;

      const unsubscribeData = window.electronAPI.localPty.onData((event) => {
        if (isCleanedUp || event.sessionId !== ptySessionId) return;
        appendTerminalHistory(termSessionId, event.data);
        scheduleWrite(termSessionId, term, event.data);
      });

      const unsubscribeExit = window.electronAPI.localPty.onExit((event) => {
        if (isCleanedUp || event.sessionId !== ptySessionId) return;
        handleExit(term, event);
        cleanup();
        localListenerCleanups.delete(termSessionId);
      });

      const inputDisposable = term.onData((data) => {
        if (!isCleanedUp) {
          window.electronAPI.localPty.write(ptySessionId, data);
        }
      });

      setTimeout(() => {
        if (isCleanedUp) return;
        fit.fit();
        window.electronAPI.localPty.resize(ptySessionId, term.cols, term.rows);
      }, 100);

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        unsubscribeData();
        unsubscribeExit();
        inputDisposable.dispose();
      };

      localListenerCleanups.set(termSessionId, cleanup);
      return cleanup;
    },
    [termSessionId, handleExit]
  );

  const connectLocalPty = useCallback(
    async (term: Terminal, fit: FitAddon, mountId: symbol) => {
      const existingPtySessionId = session?.sessionId || localPtySessionIds.get(termSessionId);
      if (existingPtySessionId) {
        if (activeMounts.get(termSessionId) !== mountId) return;
        localPtySessionIds.set(termSessionId, existingPtySessionId);
        localConnectionState.set(termSessionId, existingPtySessionId);
        // Remount (e.g. pane layout change): redraw the output the previous xterm held.
        term.reset();
        term.write(getTerminalHistory(termSessionId));
        registerLocalListeners(term, fit, existingPtySessionId);
        setSessionState(termSessionId, 'connected');
        sendStartupCommand(existingPtySessionId);
        return;
      }

      const existingConnection = localConnectionPromises.get(termSessionId);
      if (existingConnection) {
        term.writeln('\x1b[1;36mLocal shell is starting...\x1b[0m\r\n');
        try {
          const ptySessionId = await existingConnection;
          if (activeMounts.get(termSessionId) !== mountId) return;
          localPtySessionIds.set(termSessionId, ptySessionId);
          localConnectionState.set(termSessionId, ptySessionId);
          setSessionId(termSessionId, ptySessionId);
          setSessionState(termSessionId, 'connected');
          registerLocalListeners(term, fit, ptySessionId);
          term.clear();
          sendStartupCommand(ptySessionId);
        } catch (error) {
          if (activeMounts.get(termSessionId) !== mountId) return;
          const message = error instanceof Error ? error.message : 'Unknown error';
          setSessionState(termSessionId, 'error', message);
          term.clear();
          term.writeln('\x1b[1;31mFailed to start terminal\x1b[0m\r\n');
          term.writeln(`\x1b[31m${message}\x1b[0m\r\n`);
        }
        return;
      }

      localConnectionState.set(termSessionId, 'connecting');
      setSessionState(termSessionId, 'connecting');

      try {
        fit.fit();
        const connectionPromise = window.electronAPI.localPty
          .create({
            cols: term.cols,
            rows: term.rows,
            env: getStartupEnv(),
          })
          .then((result) => {
            if (!result.success || !result.sessionId) {
              throw new Error(result.error || 'Failed to create local PTY');
            }
            return result.sessionId;
          })
          .finally(() => {
            localConnectionPromises.delete(termSessionId);
          });
        localConnectionPromises.set(termSessionId, connectionPromise);

        const ptySessionId = await connectionPromise;
        if (activeMounts.get(termSessionId) !== mountId) return;

        localPtySessionIds.set(termSessionId, ptySessionId);
        localConnectionState.set(termSessionId, ptySessionId);
        setSessionId(termSessionId, ptySessionId);
        setSessionState(termSessionId, 'connected');
        registerLocalListeners(term, fit, ptySessionId);
        term.clear();
        sendStartupCommand(ptySessionId);
      } catch (error) {
        if (activeMounts.get(termSessionId) !== mountId) return;
        const message = error instanceof Error ? error.message : 'Unknown error';
        setSessionState(termSessionId, 'error', message);
        localConnectionState.delete(termSessionId);
        localPtySessionIds.delete(termSessionId);
        term.clear();
        term.writeln('\x1b[1;31mFailed to start terminal\x1b[0m\r\n');
        term.writeln(`\x1b[31m${message}\x1b[0m\r\n`);
      }
    },
    [
      session?.sessionId,
      termSessionId,
      setSessionState,
      setSessionId,
      registerLocalListeners,
      sendStartupCommand,
      getStartupEnv,
    ]
  );

  useEffect(() => {
    if (!terminalRef.current || !session || session.kind !== 'local') return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const currentTheme = useThemeStore.getState().getResolvedTheme();
    const initialAppearance = useAppearanceStore.getState();
    const term = new Terminal({
      fontFamily: normalizeTerminalFontFamily(
        initialAppearance.terminalFontFamily || TERMINAL_FONT_FAMILY
      ),
      fontSize: initialAppearance.terminalFontSize,
      lineHeight: 1.2,
      cursorBlink: isActivePane,
      cursorInactiveStyle: 'none',
      cursorStyle: 'block',
      theme: TERMINAL_THEMES[currentTheme],
      scrollback: 5000,
      allowProposedApi: true,
    });

    terminal.current = term;
    const fit = new FitAddon();
    fitAddon.current = fit;
    term.loadAddon(fit);
    term.open(terminalRef.current);
    fit.fit();
    term.writeln('\x1b[1;36mStarting terminal...\x1b[0m\r\n');
    const mountId = Symbol(termSessionId);
    activeMounts.set(termSessionId, mountId);
    connectLocalPty(term, fit, mountId);

    return () => {
      if (activeMounts.get(termSessionId) === mountId) {
        activeMounts.delete(termSessionId);
      }

      const listenerCleanup = localListenerCleanups.get(termSessionId);
      if (listenerCleanup) {
        listenerCleanup();
        localListenerCleanups.delete(termSessionId);
      }

      pendingWrites.delete(termSessionId);
      rafScheduled.delete(termSessionId);

      terminal.current?.dispose();
      terminal.current = null;
      hasInitialized.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Terminal lifecycle is intentionally mount-scoped.
  }, []);

  useEffect(() => {
    if (!terminalRef.current || !terminal.current || !fitAddon.current) return;
    const term = terminal.current;
    const fit = fitAddon.current;
    let resizeTimerId: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      try {
        fit.fit();
        const ptySessionId = localPtySessionIds.get(termSessionId);
        if (ptySessionId) {
          window.electronAPI.localPty.resize(ptySessionId, term.cols, term.rows);
        }
      } catch (error) {
        console.error('Failed to resize local terminal:', error);
      }
    };

    const debouncedResize = () => {
      if (resizeTimerId) clearTimeout(resizeTimerId);
      resizeTimerId = setTimeout(handleResize, 50);
    };

    const resizeObserver = new ResizeObserver(debouncedResize);
    resizeObserver.observe(terminalRef.current);
    setTimeout(handleResize, 100);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimerId) clearTimeout(resizeTimerId);
    };
  }, [termSessionId, session?.sessionId, session?.state]);

  useEffect(() => {
    if (terminal.current) {
      terminal.current.options.theme = TERMINAL_THEMES[resolvedTheme];
    }
  }, [resolvedTheme]);

  useTerminalAppearance({
    terminal,
    fitAddon,
    fontFamily: terminalFontFamily,
    fontSize: terminalFontSize,
    onResize: resizeLocalPty,
  });

  useEffect(() => {
    if (!terminal.current) return;
    terminal.current.options.cursorBlink = isActivePane;
    if (isActivePane) {
      terminal.current.focus();
    }
  }, [isActivePane]);

  if (!session || session.kind !== 'local') {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {t('terminal.sessionNotFound')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div
          ref={terminalRef}
          className="terminal-surface flex-1 min-w-0 min-h-0 overflow-hidden bg-background p-2"
          onMouseDownCapture={focusTerminal}
        />
      </div>

      <SnippetsSidebar
        isOpen={snippetsOpen}
        onClose={() => setSnippetsOpen(termSessionId, false)}
        onRun={(cmd) => sendToTerminal(cmd + '\r')}
        onPaste={(cmd) => sendToTerminal(cmd)}
      />
    </div>
  );
};
