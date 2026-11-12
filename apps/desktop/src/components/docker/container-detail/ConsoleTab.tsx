import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

interface ConsoleTabProps {
  sessionId: string;
  containerId: string;
  isRunning: boolean;
}

export const ConsoleTab: React.FC<ConsoleTabProps> = ({ sessionId, containerId, isRunning }) => {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const execSessionIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const connectionGenerationRef = useRef(0);
  const connectionTimeoutRef = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const connectToContainer = useCallback(async () => {
    if (!isRunning || !terminalRef.current || isConnecting || execSessionIdRef.current) {
      return;
    }
    const generation = ++connectionGenerationRef.current;
    cleanupRef.current?.();
    cleanupRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitAddonRef.current = null;

    setIsConnecting(true);
    const timeoutId = window.setTimeout(() => {
      if (connectionGenerationRef.current !== generation) return;
      connectionGenerationRef.current++;
      connectionTimeoutRef.current = null;
      console.error('[Console] Connection timeout after 10 seconds');
      setIsConnecting(false);
      xtermRef.current?.writeln(`\r\n\x1b[31m${t('docker.console.timeout')}\x1b[0m`);
    }, 10000);
    connectionTimeoutRef.current = timeoutId;

    try {
      if (!window.electronAPI?.docker?.execStart) {
        throw new Error('Docker Exec API not available');
      }

      const computedStyle = getComputedStyle(document.documentElement);
      const bgColor = computedStyle.getPropertyValue('--background').trim();
      const fgColor = computedStyle.getPropertyValue('--foreground').trim();

      const term = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: bgColor ? `hsl(${bgColor})` : '#1E1E1E',
          foreground: fgColor ? `hsl(${fgColor})` : '#CCCCCC',
          cursor: '#FFFFFF',
          cursorAccent: '#000000',
          selectionBackground: '#264F78',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);

      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        term.loadAddon(webglAddon);
      } catch {
        // Use default DOM renderer.
      }

      fitAddon.fit();
      xtermRef.current = term;
      fitAddonRef.current = fitAddon;
      term.writeln(`\x1b[36m${t('docker.console.connecting')}\x1b[0m`);

      const result = await window.electronAPI.docker.execStart(sessionId, containerId, {
        cols: term.cols,
        rows: term.rows,
      });

      clearTimeout(timeoutId);
      if (connectionTimeoutRef.current === timeoutId) connectionTimeoutRef.current = null;
      // An internal tab close can precede the SSH shell-start reply. Never
      // attach listeners or a terminal to a view that no longer owns it.
      if (connectionGenerationRef.current !== generation) {
        if (result.execSessionId) {
          await window.electronAPI.docker.execClose(result.execSessionId);
        }
        return;
      }

      if (!result.success || !result.execSessionId) {
        const errorMsg = result.error || 'Unknown error';
        console.error('[Console] Failed to start exec session:', errorMsg);
        term.writeln(`\r\n\x1b[31m${t('docker.console.connectFailed')}: ${errorMsg}\x1b[0m`);
        term.writeln(`\x1b[33m${t('docker.console.troubleshooting')}\x1b[0m`);
        term.writeln(`- ${t('docker.console.checkRunning')}`);
        term.writeln(`- ${t('docker.console.checkShell')}`);
        term.writeln(`- ${t('docker.console.checkSsh')}`);
        setIsConnecting(false);
        return;
      }

      execSessionIdRef.current = result.execSessionId;
      setIsConnected(true);
      setIsConnecting(false);

      const removeListener = window.electronAPI.docker.onExecData?.((data) => {
        if (data.execSessionId === execSessionIdRef.current) {
          term.write(data.data);
        }
      });

      term.onData((data) => {
        if (execSessionIdRef.current) {
          window.electronAPI.docker.execSend(execSessionIdRef.current, data);
        }
      });

      const handleResize = () => {
        if (fitAddonRef.current && xtermRef.current && execSessionIdRef.current) {
          fitAddonRef.current.fit();
          window.electronAPI.docker.execResize(
            execSessionIdRef.current,
            xtermRef.current.cols,
            xtermRef.current.rows
          );
        }
      };

      window.addEventListener('resize', handleResize);

      cleanupRef.current = () => {
        window.removeEventListener('resize', handleResize);
        if (removeListener) removeListener();
        if (execSessionIdRef.current) {
          window.electronAPI.docker.execClose(execSessionIdRef.current);
          execSessionIdRef.current = null;
        }
        term.dispose();
        if (xtermRef.current === term) {
          xtermRef.current = null;
          fitAddonRef.current = null;
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (connectionTimeoutRef.current === timeoutId) connectionTimeoutRef.current = null;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Console] Connection error:', errorMsg);
      if (connectionGenerationRef.current !== generation) return;

      if (xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[31m${t('common.error')}: ${errorMsg}\x1b[0m`);
        xtermRef.current.writeln(`\x1b[33m${t('docker.console.checkDevtools')}\x1b[0m`);
      }

      setIsConnecting(false);
    }
  }, [sessionId, containerId, isRunning, isConnecting, t]);

  useEffect(() => {
    return () => {
      connectionGenerationRef.current++;
      if (connectionTimeoutRef.current !== null) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      cleanupRef.current?.();
      if (execSessionIdRef.current) {
        window.electronAPI.docker.execClose(execSessionIdRef.current);
        execSessionIdRef.current = null;
      }
      xtermRef.current?.dispose();
    };
  }, []);

  if (!isRunning) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Terminal className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            {t('docker.containerNotRunning', 'Container is not running')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={terminalRef} className="h-full w-full bg-background p-4" />

      {!isConnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-4">
          <div className="text-center max-w-2xl">
            <Terminal className="w-12 h-12 mx-auto mb-4 text-primary" />
            <p className="text-foreground mb-4">
              {t('docker.attachShell', 'Attach to container shell')}
            </p>

            <button
              type="button"
              className={`px-4 py-2 rounded text-white font-medium ${
                isConnecting
                  ? 'bg-secondary cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
              }`}
              onClick={(e) => {
                e.preventDefault();
                connectToContainer();
              }}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('docker.connecting', 'Connecting...')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  {t('docker.connect', 'Connect')}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
