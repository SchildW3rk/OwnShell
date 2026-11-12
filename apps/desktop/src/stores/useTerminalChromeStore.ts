import { create } from 'zustand';

interface TerminalChromeState {
  snippetsOpenBySessionId: Record<string, boolean>;
  setSnippetsOpen: (sessionId: string, open: boolean) => void;
  toggleSnippets: (sessionId: string) => void;
  clearSessionChrome: (sessionId: string) => void;
}

export const useTerminalChromeStore = create<TerminalChromeState>((set) => ({
  snippetsOpenBySessionId: {},
  setSnippetsOpen: (sessionId, open) => {
    set((state) => ({
      snippetsOpenBySessionId: {
        ...state.snippetsOpenBySessionId,
        [sessionId]: open,
      },
    }));
  },
  toggleSnippets: (sessionId) => {
    set((state) => ({
      snippetsOpenBySessionId: {
        ...state.snippetsOpenBySessionId,
        [sessionId]: !state.snippetsOpenBySessionId[sessionId],
      },
    }));
  },
  clearSessionChrome: (sessionId) => {
    set((state) => {
      const next = { ...state.snippetsOpenBySessionId };
      delete next[sessionId];
      return { snippetsOpenBySessionId: next };
    });
  },
}));
