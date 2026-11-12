import { MutableRefObject, useEffect } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { normalizeTerminalFontFamily } from '../../utils/appearance';

interface UseTerminalAppearanceOptions {
  terminal: MutableRefObject<Terminal | null>;
  fitAddon: MutableRefObject<FitAddon | null>;
  fontFamily: string;
  fontSize: number;
  onResize?: (cols: number, rows: number) => void;
}

export function useTerminalAppearance({
  terminal,
  fitAddon,
  fontFamily,
  fontSize,
  onResize,
}: UseTerminalAppearanceOptions): void {
  useEffect(() => {
    if (!terminal.current || !fitAddon.current) return;

    const term = terminal.current;
    const fit = fitAddon.current;
    let isDisposed = false;
    const normalizedFontFamily = normalizeTerminalFontFamily(fontFamily);

    term.options.fontFamily = normalizedFontFamily;
    term.options.fontSize = fontSize;

    const applyTerminalLayout = () => {
      if (isDisposed) return;
      const host = term.element?.parentElement;
      if (!host || host.clientWidth <= 0 || host.clientHeight <= 0) return;
      try {
        fit.fit();
        term.refresh(0, Math.max(0, term.rows - 1));
        onResize?.(term.cols, term.rows);
      } catch (error) {
        console.error('Failed to apply terminal appearance:', error);
      }
    };

    const frameId = requestAnimationFrame(applyTerminalLayout);
    void document.fonts?.ready.then(applyTerminalLayout);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
    };
  }, [terminal, fitAddon, fontFamily, fontSize, onResize]);
}
