import type { ITheme } from '@xterm/xterm';
import type { ResolvedTheme } from '../../stores/useThemeStore';
import { DEFAULT_TERMINAL_FONT_FAMILY } from '../../utils/appearance';

export const TERMINAL_FONT_FAMILY = DEFAULT_TERMINAL_FONT_FAMILY;

export const TERMINAL_THEMES: Record<ResolvedTheme, ITheme> = {
  dark: {
    background: '#0c0f13',
    foreground: '#cccccc',
    cursor: '#06b6d4',
    cursorAccent: '#0c0f13',
    selectionBackground: 'rgba(6, 182, 212, 0.3)',
    black: '#000000',
    red: '#CD3131',
    green: '#0DBC79',
    yellow: '#E5E510',
    blue: '#2472C8',
    magenta: '#BC3FBC',
    cyan: '#11A8CD',
    white: '#E5E5E5',
    brightBlack: '#666666',
    brightRed: '#F14C4C',
    brightGreen: '#23D18B',
    brightYellow: '#F5F543',
    brightBlue: '#3B8EEA',
    brightMagenta: '#D670D6',
    brightCyan: '#29B8DB',
    brightWhite: '#E5E5E5',
  },
  light: {
    background: '#ffffff',
    foreground: '#0a0a0f',
    cursor: '#06b6d4',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(6, 182, 212, 0.3)',
    black: '#000000',
    red: '#CD3131',
    green: '#0DBC79',
    yellow: '#E5E510',
    blue: '#2472C8',
    magenta: '#BC3FBC',
    cyan: '#11A8CD',
    white: '#E5E5E5',
    brightBlack: '#666666',
    brightRed: '#F14C4C',
    brightGreen: '#23D18B',
    brightYellow: '#F5F543',
    brightBlue: '#3B8EEA',
    brightMagenta: '#D670D6',
    brightCyan: '#29B8DB',
    brightWhite: '#E5E5E5',
  },
};
