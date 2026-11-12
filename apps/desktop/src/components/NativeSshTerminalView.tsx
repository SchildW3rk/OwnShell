/**
 * Native SSH Terminal View
 *
 * Runs /usr/bin/ssh inside node-pty for low-latency, native-feeling terminal I/O.
 * Structured SSH features still use the ssh2 backend through session.sessionId.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useShallow } from 'zustand/react/shallow';
import { useAppearanceStore } from '../stores/useAppearanceStore';
import { useTerminalStore } from '../stores/useTerminalStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTerminalChromeStore } from '../stores/useTerminalChromeStore';
import { normalizeTerminalFontFamily } from '../utils/appearance';
import { SnippetsSidebar } from './SnippetsSidebar';
import {
  activeMounts,
  appendTerminalHistory,
  clearTerminalHistory,
  clearTerminalInputState,
  getTerminalHistory,
  markTerminalInput,
  pendingWrites,
  rafScheduled,
  scheduleWrite,
} from './terminal-view/runtime';
import { TERMINAL_FONT_FAMILY, TERMINAL_THEMES } from './terminal-view/themes';
import { useTerminalAppearance } from './terminal-view/useTerminalAppearance';
import { useSnippetsShortcut } from './terminal-view/useSnippetsShortcut';
import { useTranslation } from 'react-i18next';
import '@xterm/xterm/css/xterm.css';

const nativePtySessionIds = new Map<string, string>();
const nativeConnectionPromises = new Map<string, Promise<string>>();
const nativeListenerCleanups = new Map<string, () => void>();

interface NativeSshTerminalViewProps {
  sessionId: string;
}

const isCurrentMount = (termSessionId: string, mountId: symbol): boolean =>
  activeMounts.get(termSessionId) === mountId;

function fitNativeSurface(host: HTMLDivElement | null, fit: FitAddon): boolean {
  // Hidden/collapsed surfaces retain their last PTY geometry and history.
  if (!host || host.clientWidth <= 0 || host.clientHeight <= 0) return false;
  fit.fit();
  return true;
}

export const NativeSshTerminalView: React.FC<NativeSshTerminalViewProps> = ({
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

  const { setSessionState, setNativePtySessionId, clearNativePtySessionId, closeSession } =
    useTerminalStore(
      useShallow((state) => ({
        setSessionState: state.setSessionState,
        setNativePtySessionId: state.setNativePtySessionId,
        clearNativePtySessionId: state.clearNativePtySessionId,
        closeSession: state.closeSession,
      }))
    );
  const session = useTerminalStore((state) => state.sessions.find((s) => s.id === termSessionId));
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const isActivePane = useWorkspaceStore((state) =>
    state.panes.some(
      (pane) =>
        pane.id === state.activePaneId &&
        pane.type === 'terminal' &&
        pane.contentId === termSessionId
    )
  );
  const host = session?.host;

  const handleToggleSnippets = useCallback(
    () => toggleSnippets(termSessionId),
    [termSessionId, toggleSnippets]
  );
  useSnippetsShortcut(handleToggleSnippets, isActivePane);

  const sendToTerminal = useCallback(
    (text: string) => {
      const ptySessionId = nativePtySessionIds.get(termSessionId);
      if (ptySessionId) {
        window.electronAPI.localPty.write(ptySessionId, text);
      }
    },
    [termSessionId]
  );

  const focusTerminal = useCallback(() => {
    terminal.current?.focus();
  }, []);

  const resizeNativePty = useCallback(
    (cols: number, rows: number) => {
      const ptySessionId = nativePtySessionIds.get(termSessionId);
      if (ptySessionId) {
        window.electronAPI.localPty.resize(ptySessionId, cols, rows);
      }
    },
    [termSessionId]
  );

  const clearNativeSessionState = useCallback(
    (ptySessionId?: string | null) => {
      nativePtySessionIds.delete(termSessionId);
      nativeConnectionPromises.delete(termSessionId);
      pendingWrites.delete(termSessionId);
      rafScheduled.delete(termSessionId);
      clearTerminalInputState(termSessionId);
      clearTerminalHistory(termSessionId);
      clearNativePtySessionId(termSessionId);

      if (ptySessionId) {
        window.electronAPI.localPty.kill(ptySessionId).catch(() => undefined);
      }
    },
    [clearNativePtySessionId, termSessionId]
  );

  const handleExit = useCallback(
    (term: Terminal, event: { exitCode: number; signal?: number }) => {
      const ptySessionId = nativePtySessionIds.get(termSessionId);
      nativePtySessionIds.delete(termSessionId);
      nativeConnectionPromises.delete(termSessionId);
      pendingWrites.delete(termSessionId);
      rafScheduled.delete(termSessionId);
      clearTerminalInputState(termSessionId);
      clearTerminalHistory(termSessionId);
      clearNativePtySessionId(termSessionId);

      if (event.signal) {
        setSessionState(termSessionId, 'error', `Terminal terminated by signal ${event.signal}`);
        term.writeln(`\r\n\x1b[1;31mTerminal terminated by signal: ${event.signal}\x1b[0m\r\n`);
        term.writeln('\x1b[2mPress Command+W to close this terminal\x1b[0m\r\n');
      } else if (event.exitCode !== 0) {
        setSessionState(termSessionId, 'error', `Terminal exited with code ${event.exitCode}`);
        term.writeln(`\r\n\x1b[1;33mTerminal exited with code ${event.exitCode}\x1b[0m\r\n`);
        term.writeln('\x1b[2mPress Command+W to close this terminal\x1b[0m\r\n');
      } else {
        setSessionState(termSessionId, 'disconnected');
        term.writeln('\r\n\x1b[1;32mSSH session ended normally\x1b[0m\r\n');
        setTimeout(() => closeSession(termSessionId), 1200);
      }

      if (ptySessionId) {
        nativeListenerCleanups.delete(termSessionId);
      }
    },
    [clearNativePtySessionId, closeSession, setSessionState, termSessionId]
  );

  const registerNativeListeners = useCallback(
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
      });

      const inputDisposable = term.onData((data) => {
        if (isCleanedUp) return;
        markTerminalInput(termSessionId, data);
        window.electronAPI.localPty.write(ptySessionId, data);
      });

      setTimeout(() => {
        if (isCleanedUp) return;
        if (!fitNativeSurface(terminalRef.current, fit)) return;
        window.electronAPI.localPty.resize(ptySessionId, term.cols, term.rows);
      }, 100);

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        unsubscribeData();
        unsubscribeExit();
        inputDisposable.dispose();
        nativeListenerCleanups.delete(termSessionId);
      };

      nativeListenerCleanups.set(termSessionId, cleanup);
      return cleanup;
    },
    [handleExit, termSessionId]
  );

  const showNativeError = useCallback(
    (term: Terminal, mountId: symbol, error: unknown) => {
      if (!isCurrentMount(termSessionId, mountId)) return;

      const message = error instanceof Error ? error.message : 'Unknown error';
      setSessionState(termSessionId, 'error', message);
      clearNativeSessionState(nativePtySessionIds.get(termSessionId));

      term.clear();
      term.writeln('\x1b[1;31mFailed to start terminal\x1b[0m\r\n');
      term.writeln(`\x1b[31m${message}\x1b[0m\r\n`);
      term.writeln('\r\n\x1b[2mPress Command+W to close this terminal\x1b[0m');
    },
    [clearNativeSessionState, setSessionState, termSessionId]
  );

  const connectNativeSsh = useCallback(
    async (term: Terminal, fit: FitAddon, mountId: symbol) => {
      if (!host) return;

      const existingPtySessionId =
        session?.nativePtySessionId || nativePtySessionIds.get(termSessionId);
      if (existingPtySessionId) {
        if (!isCurrentMount(termSessionId, mountId)) return;
        nativePtySessionIds.set(termSessionId, existingPtySessionId);
        setSessionState(termSessionId, 'connected');
        // Remount (e.g. pane layout change): redraw the output the previous xterm held.
        term.reset();
        term.write(getTerminalHistory(termSessionId));
        registerNativeListeners(term, fit, existingPtySessionId);
        return;
      }

      const existingConnection = nativeConnectionPromises.get(termSessionId);
      if (existingConnection) {
        try {
          const ptySessionId = await existingConnection;
          if (!isCurrentMount(termSessionId, mountId)) return;
          nativePtySessionIds.set(termSessionId, ptySessionId);
          setNativePtySessionId(termSessionId, ptySessionId);
          setSessionState(termSessionId, 'connected');
          registerNativeListeners(term, fit, ptySessionId);
        } catch (error) {
          showNativeError(term, mountId, error);
        }
        return;
      }

      setSessionState(termSessionId, 'connecting');

      try {
        fitNativeSurface(terminalRef.current, fit);
        const connectionPromise = window.electronAPI.nativeSsh
          .create({
            hostId: host.id,
            cols: term.cols,
            rows: term.rows,
          })
          .then((result) => {
            if (!result.success || !result.sessionId) {
              throw new Error(result.error || 'Failed to create terminal');
            }
            return result.sessionId;
          })
          .finally(() => {
            nativeConnectionPromises.delete(termSessionId);
          });

        nativeConnectionPromises.set(termSessionId, connectionPromise);

        const ptySessionId = await connectionPromise;
        if (!isCurrentMount(termSessionId, mountId)) return;

        nativePtySessionIds.set(termSessionId, ptySessionId);
        setNativePtySessionId(termSessionId, ptySessionId);
        setSessionState(termSessionId, 'connected');
        registerNativeListeners(term, fit, ptySessionId);
      } catch (error) {
        showNativeError(term, mountId, error);
      }
    },
    [
      host,
      session?.nativePtySessionId,
      termSessionId,
      setNativePtySessionId,
      setSessionState,
      registerNativeListeners,
      showNativeError,
    ]
  );

  useEffect(() => {
    if (!terminalRef.current || !session || !host) return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const mountId = Symbol(termSessionId);
    activeMounts.set(termSessionId, mountId);

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
    fitNativeSurface(terminalRef.current, fit);

    term.writeln('\x1b[1;36mStarting terminal...\x1b[0m\r\n');
    connectNativeSsh(term, fit, mountId);

    return () => {
      if (activeMounts.get(termSessionId) === mountId) {
        activeMounts.delete(termSessionId);
      }

      const listenerCleanup = nativeListenerCleanups.get(termSessionId);
      if (listenerCleanup) {
        listenerCleanup();
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
        if (!fitNativeSurface(terminalRef.current, fit)) return;
        const ptySessionId = nativePtySessionIds.get(termSessionId);
        if (ptySessionId) {
          window.electronAPI.localPty.resize(ptySessionId, term.cols, term.rows);
        }
      } catch (error) {
        console.error('Failed to resize native SSH terminal:', error);
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
  }, [termSessionId, session?.nativePtySessionId]);

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
    onResize: resizeNativePty,
  });

  useEffect(() => {
    if (!terminal.current) return;
    terminal.current.options.cursorBlink = isActivePane;
    if (isActivePane) {
      terminal.current.focus();
    }
  }, [isActivePane]);

  if (!session || !host) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {t('terminal.sessionNotFound')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="terminal-surface flex-1 flex flex-col min-w-0 min-h-0 p-2" onMouseDownCapture={focusTerminal}>
        <div
          ref={terminalRef}
          className="flex-1 min-w-0 min-h-0 overflow-hidden bg-background"
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
