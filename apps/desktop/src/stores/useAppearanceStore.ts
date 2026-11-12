import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  clampEditorFontSize,
  clampTerminalFontSize,
  normalizeTerminalFontFamily,
} from '../utils/appearance';

interface AppearanceState {
  terminalFontFamily: string;
  terminalFontSize: number;
  editorFontFamily: string;
  editorFontSize: number;
  setTerminalFontFamily: (fontFamily: string) => void;
  setTerminalFontSize: (fontSize: number) => void;
  setEditorFontFamily: (fontFamily: string) => void;
  setEditorFontSize: (fontSize: number) => void;
  resetAppearance: () => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
      terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
      editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
      editorFontSize: DEFAULT_EDITOR_FONT_SIZE,

      setTerminalFontFamily: (fontFamily) => {
        set({ terminalFontFamily: normalizeTerminalFontFamily(fontFamily) });
      },

      setTerminalFontSize: (fontSize) => {
        set({ terminalFontSize: clampTerminalFontSize(fontSize) });
      },

      setEditorFontFamily: (fontFamily) => {
        set({ editorFontFamily: fontFamily || DEFAULT_EDITOR_FONT_FAMILY });
      },

      setEditorFontSize: (fontSize) => {
        set({ editorFontSize: clampEditorFontSize(fontSize) });
      },

      resetAppearance: () => {
        set({
          terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
          terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
          editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
          editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
        });
      },
    }),
    {
      name: 'ownshell-appearance',
      version: 2,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState;
        }

        const state = persistedState as Partial<AppearanceState>;
        return {
          ...state,
          terminalFontFamily: normalizeTerminalFontFamily(state.terminalFontFamily),
          terminalFontSize: clampTerminalFontSize(
            state.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE
          ),
          editorFontFamily: state.editorFontFamily || DEFAULT_EDITOR_FONT_FAMILY,
          editorFontSize: clampEditorFontSize(state.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE),
        };
      },
    }
  )
);
