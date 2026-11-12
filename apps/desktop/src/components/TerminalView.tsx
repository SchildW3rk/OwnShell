/**
 * Terminal View Component
 *
 * Integrates xterm.js for SSH terminal display.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useAppearanceStore } from '../stores/useAppearanceStore';
import { useTerminalStore } from '../stores/useTerminalStore';
import { useTunnelStore } from '../stores/useTunnelStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTerminalChromeStore } from '../stores/useTerminalChromeStore';
import { normalizeTerminalFontFamily } from '../utils/appearance';
import { SnippetsSidebar } from './SnippetsSidebar';
import { useShallow } from 'zustand/react/shallow';
import '@xterm/xterm/css/xterm.css';

import {
  activeMounts,
  clearBufferedSSHEvents,
  connectionPromises,
  connectionState,
  clearTerminalInputState,
  ensureSSHEventRouter,
  listenerCleanups,
  markTerminalInput,
  pendingWrites,
  rafScheduled,
  registerSSHRoute,
  scheduleWrite,
  type SSHClosedEvent,
  type SSHErrorEvent,
  sshSessionIds,
} from './terminal-view/runtime';
import { TERMINAL_FONT_FAMILY, TERMINAL_THEMES } from './terminal-view/themes';
import { useSnippetsShortcut } from './terminal-view/useSnippetsShortcut';
import { useTerminalAppearance } from './terminal-view/useTerminalAppearance';
import { useTerminalResize } from './terminal-view/useTerminalResize';
import { useTranslation } from 'react-i18next';

interface TerminalViewProps {
  sessionId: string;
}

const isStaleAttachError = (message: string): boolean =>
  /session (not found|is disconnected)/i.test(message);

const isCurrentMount = (termSessionId: string, mountId: symbol): boolean =>
  activeMounts.get(termSessionId) === mountId;

export const TerminalView: React.FC<TerminalViewProps> = ({ sessionId: termSessionId }) => {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const hasConnected = useRef(false);
  const terminalFontFamily = useAppearanceStore((state) => state.terminalFontFamily);
  const terminalFontSize = useAppearanceStore((state) => state.terminalFontSize);
  const snippetsOpen = useTerminalChromeStore(
    (state) => !!state.snippetsOpenBySessionId[termSessionId]
  );
  const toggleSnippets = useTerminalChromeStore((state) => state.toggleSnippets);
  const setSnippetsOpen = useTerminalChromeStore((state) => state.setSnippetsOpen);

  const { setSessionState, setSessionId, clearSessionId, closeSession } = useTerminalStore(
    useShallow((state) => ({
      setSessionState: state.setSessionState,
      setSessionId: state.setSessionId,
      clearSessionId: state.clearSessionId,
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
  useTerminalResize({ terminalRef, terminal, fitAddon, session });

  const sendToTerminal = useCallback(
    (text: string) => {
      const sshSessionId = sshSessionIds.get(termSessionId);
      if (sshSessionId) {
        window.electronAPI.ssh.send(sshSessionId, text);
      }
    },
    [termSessionId]
  );

  const focusTerminal = useCallback(() => {
    terminal.current?.focus();
  }, []);

  const resizeSshSession = useCallback(
    (cols: number, rows: number) => {
      if (session?.sessionId && session.state === 'connected') {
        window.electronAPI.ssh.resize(session.sessionId, cols, rows);
      }
    },
    [session?.sessionId, session?.state]
  );

  const clearSSHSessionState = useCallback(
    (sshSessionId?: string | null) => {
      sshSessionIds.delete(termSessionId);
      connectionState.delete(termSessionId);
      connectionPromises.delete(termSessionId);
      pendingWrites.delete(termSessionId);
      rafScheduled.delete(termSessionId);
      clearTerminalInputState(termSessionId);
      clearSessionId(termSessionId);

      if (sshSessionId) {
        clearBufferedSSHEvents(sshSessionId);
      }
    },
    [clearSessionId, termSessionId]
  );

  const handleSessionClosed = useCallback(
    (term: Terminal, event: any) => {
      setSessionState(termSessionId, 'disconnected');
      clearSSHSessionState(event.sessionId);

      const { exitCode, exitSignal } = event;

      if (exitSignal) {
        term.writeln(`\r\n\x1b[1;31m✗ Connection terminated by signal: ${exitSignal}\x1b[0m\r\n`);
        term.writeln('\x1b[2mPress Command+W to close this terminal\x1b[0m\r\n');
      } else if (exitCode === null || exitCode === undefined) {
        term.writeln('\r\n\x1b[1;33m⚠ Connection closed by server (EOF)\x1b[0m\r\n');
        term.writeln('\x1b[2mPress Command+W to close this terminal\x1b[0m\r\n');
      } else if (exitCode !== 0) {
        term.writeln(`\r\n\x1b[1;33m✗ Session ended with exit code ${exitCode}\x1b[0m\r\n`);
        term.writeln('\x1b[2mPress Command+W to close this terminal\x1b[0m\r\n');
      } else {
        term.writeln('\r\n\x1b[1;32m✓ Session ended normally\x1b[0m\r\n');
      }

      if (exitCode === 0) {
        setTimeout(() => closeSession(termSessionId), 2000);
      }
    },
    [termSessionId, setSessionState, closeSession, clearSSHSessionState]
  );

  const bindSSHSession = useCallback(
    (term: Terminal, fit: FitAddon, sshSessionId: string): (() => void) => {
      let isCleanedUp = false;
      let cleanupRoute = () => {};

      const handleError = (event: SSHErrorEvent) => {
        if (isCleanedUp) return;
        const errorMsg =
          typeof event.error === 'string' ? event.error : event.error?.message || 'Unknown error';
        term.writeln(`\r\n\x1b[1;31mError: ${errorMsg}\x1b[0m\r\n`);
      };

      const handleClose = (event: SSHClosedEvent) => {
        if (isCleanedUp) return;
        handleSessionClosed(term, event);
        cleanup();
        listenerCleanups.delete(termSessionId);
      };

      cleanupRoute = registerSSHRoute(termSessionId, sshSessionId, {
        onData: (data) => {
          if (!isCleanedUp) {
            scheduleWrite(termSessionId, term, data);
          }
        },
        onError: handleError,
        onClosed: handleClose,
      });

      const termDataDisposable = term.onData((data) => {
        if (!isCleanedUp) {
          markTerminalInput(termSessionId, data);
          window.electronAPI.ssh.send(sshSessionId, data);
        }
      });

      setTimeout(() => {
        if (!isCleanedUp) {
          fit.fit();
          window.electronAPI.ssh.resize(sshSessionId, term.cols, term.rows);
        }
      }, 100);

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        cleanupRoute();
        termDataDisposable.dispose();
      };

      listenerCleanups.set(termSessionId, cleanup);
      return cleanup;
    },
    [handleSessionClosed, termSessionId]
  );

  const setupSSHEventHandlers = useCallback(
    (term: Terminal, fit: FitAddon, sshSessionId: string): (() => void) => {
      if (host) {
        useTunnelStore.getState().autoStartTunnels(sshSessionId, host.id);
      }

      return bindSSHSession(term, fit, sshSessionId);
    },
    [bindSSHSession, host]
  );

  const activateConnectedSession = useCallback(
    (term: Terminal, fit: FitAddon, sshSessionId: string, mountId: symbol) => {
      const sessionStillExists = useTerminalStore
        .getState()
        .sessions.some((terminalSession) => terminalSession.id === termSessionId);

      if (!sessionStillExists) {
        window.electronAPI.ssh.disconnect(sshSessionId);
        clearSSHSessionState(sshSessionId);
        return;
      }

      sshSessionIds.set(termSessionId, sshSessionId);
      connectionState.set(termSessionId, sshSessionId);
      setSessionId(termSessionId, sshSessionId);
      setSessionState(termSessionId, 'connected');

      if (!isCurrentMount(termSessionId, mountId)) {
        return;
      }

      term.clear();
      term.writeln('\x1b[1;32m✓ Connected to ' + (host?.hostname || 'host') + '\x1b[0m\r\n');
      bindSSHSession(term, fit, sshSessionId);

      if (host) {
        useTunnelStore.getState().autoStartTunnels(sshSessionId, host.id);
      }
    },
    [bindSSHSession, clearSSHSessionState, host, setSessionId, setSessionState, termSessionId]
  );

  const showConnectionError = useCallback(
    (term: Terminal, mountId: symbol, error: unknown) => {
      if (!isCurrentMount(termSessionId, mountId)) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      setSessionState(termSessionId, 'error', message);
      listenerCleanups.delete(termSessionId);
      clearSSHSessionState(sshSessionIds.get(termSessionId));

      term.clear();
      term.writeln('\x1b[1;31m✗ Connection failed\x1b[0m\r\n');
      term.writeln('\x1b[31m' + message + '\x1b[0m\r\n');
      term.writeln('\r\n\x1b[2mPress Command+W to close this terminal\x1b[0m');
    },
    [clearSSHSessionState, setSessionState, termSessionId]
  );

  const connectToSSH = useCallback(
    async (term: Terminal, fit: FitAddon, mountId: symbol) => {
      if (!host) return;

      ensureSSHEventRouter();

      const state = connectionState.get(termSessionId);
      if (state && state !== 'connecting') {
        activateConnectedSession(term, fit, state, mountId);
        return;
      }

      const existingConnection = connectionPromises.get(termSessionId);
      if (existingConnection) {
        try {
          const sshSessionId = await existingConnection;
          activateConnectedSession(term, fit, sshSessionId, mountId);
        } catch (error) {
          showConnectionError(term, mountId, error);
        }
        return;
      }

      if (state === 'connecting') {
        connectionState.delete(termSessionId);
      }

      connectionState.set(termSessionId, 'connecting');

      try {
        setSessionState(termSessionId, 'connecting');

        const connectionPromise = (async () => {
          let privateKeyEncrypted: string | undefined;
          let passphraseEncrypted: string | undefined;

          if (host.auth_type === 'key' && host.key_id) {
            const key = await window.electronAPI.keys.getById(host.key_id);
            if (!key) {
              throw new Error('SSH key not found in database');
            }
            privateKeyEncrypted = key.private_key_encrypted;
            passphraseEncrypted = key.passphrase_encrypted || undefined;
          }

          const result = await window.electronAPI.ssh.connect({
            hostId: host.id,
            hostname: host.hostname,
            port: host.port,
            username: host.username,
            passwordEncrypted: host.password_encrypted || undefined,
            privateKeyEncrypted,
            passphraseEncrypted,
            authType: host.auth_type as 'password' | 'key',
            jumpHostId: host.jump_host_id || undefined,
          });

          if (!result.success) {
            throw new Error(result.error?.message || 'Connection failed');
          }

          return result.sessionId;
        })().finally(() => {
          connectionPromises.delete(termSessionId);
        });

        connectionPromises.set(termSessionId, connectionPromise);

        const sshSessionId = await connectionPromise;
        activateConnectedSession(term, fit, sshSessionId, mountId);
      } catch (error) {
        showConnectionError(term, mountId, error);
      }
    },
    [activateConnectedSession, host, showConnectionError, termSessionId, setSessionState]
  );

  const attachToExistingSSH = useCallback(
    async (term: Terminal, fit: FitAddon, sshSessionId: string, mountId: symbol) => {
      try {
        ensureSSHEventRouter();
        const attachResult = await window.electronAPI.ssh.attach(sshSessionId, termSessionId);

        if (!attachResult.success) {
          throw new Error(attachResult.error?.message || 'Failed to attach to session');
        }

        if (!isCurrentMount(termSessionId, mountId)) {
          return;
        }

        sshSessionIds.set(termSessionId, sshSessionId);
        connectionState.set(termSessionId, sshSessionId);

        if (attachResult.replayBuffer && attachResult.replayBuffer.length > 0) {
          term.write(attachResult.replayBuffer);
        } else {
          term.writeln(
            '\x1b[2mSession was running in background. Previous output is not shown.\x1b[0m\r\n'
          );
        }

        setupSSHEventHandlers(term, fit, sshSessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (isStaleAttachError(message)) {
          clearSSHSessionState(sshSessionId);
          setSessionState(termSessionId, 'connecting');
          term.clear();
          term.writeln(
            '\x1b[1;36mPrevious SSH session expired. Reconnecting to ' +
              (host?.hostname || 'host') +
              '...\x1b[0m\r\n'
          );
          await connectToSSH(term, fit, mountId);
          return;
        }

        if (!isCurrentMount(termSessionId, mountId)) {
          return;
        }

        setSessionState(termSessionId, 'error', message);
        term.clear();
        term.writeln('\x1b[1;31m✗ Failed to attach to existing session\x1b[0m\r\n');
        term.writeln('\x1b[31m' + message + '\x1b[0m\r\n');
        term.writeln('\r\n\x1b[2mPress Command+W to close this terminal\x1b[0m');
      }
    },
    [
      clearSSHSessionState,
      connectToSSH,
      host?.hostname,
      termSessionId,
      setSessionState,
      setupSSHEventHandlers,
    ]
  );

  useEffect(() => {
    if (!terminalRef.current || !session || !host) return;
    if (hasConnected.current) return;
    hasConnected.current = true;
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
    fit.fit();

    if (session.sessionId && session.state === 'connected') {
      term.clear();
      term.writeln('\x1b[1;32m✓ Reconnected to ' + host.hostname + '\x1b[0m\r\n');
      attachToExistingSSH(term, fit, session.sessionId, mountId);
    } else {
      term.writeln('\x1b[1;36mConnecting to ' + host.hostname + '...\x1b[0m\r\n');
      connectToSSH(term, fit, mountId);
    }

    return () => {
      if (activeMounts.get(termSessionId) === mountId) {
        activeMounts.delete(termSessionId);
      }

      const listenerCleanup = listenerCleanups.get(termSessionId);
      if (listenerCleanup) {
        listenerCleanup();
        listenerCleanups.delete(termSessionId);
      }

      pendingWrites.delete(termSessionId);
      rafScheduled.delete(termSessionId);

      const sshSessionId = sshSessionIds.get(termSessionId);
      if (sshSessionId) {
        window.electronAPI.ssh.detach(sshSessionId, termSessionId);
      }

      if (terminal.current) {
        terminal.current.dispose();
        terminal.current = null;
      }

      hasConnected.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

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
    onResize: resizeSshSession,
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
