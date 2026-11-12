import { create } from 'zustand';

export type DBExplorerMainTab = 'data' | 'structure' | 'query';

interface DBExplorerViewState {
  selectedConfigId: string | null;
  activeConnectionId: string | null;
  selectedTable: string | null;
  selectedSchema?: string;
  mainTab: DBExplorerMainTab;
  page: number;
  mongoSelectedCollection: string | null;
  mongoSelectedDocumentId: string | null;
  mongoFilterJson: string;
  mongoSkip: number;
}

interface DBExplorerViewStore {
  views: Record<string, DBExplorerViewState>;
  setViewState: (key: string, update: Partial<DBExplorerViewState>) => void;
  clearViewState: (key: string) => void;
}

const defaultState: DBExplorerViewState = {
  selectedConfigId: null,
  activeConnectionId: null,
  selectedTable: null,
  selectedSchema: undefined,
  mainTab: 'data',
  page: 0,
  mongoSelectedCollection: null,
  mongoSelectedDocumentId: null,
  mongoFilterJson: '{}',
  mongoSkip: 0,
};

export const useDBExplorerViewStore = create<DBExplorerViewStore>((set) => ({
  views: {},
  setViewState: (key, update) => {
    set((state) => ({
      views: {
        ...state.views,
        [key]: {
          ...(state.views[key] ?? defaultState),
          ...update,
        },
      },
    }));
  },
  clearViewState: (key) => {
    set((state) => {
      const nextViews = { ...state.views };
      delete nextViews[key];
      return { views: nextViews };
    });
  },
}));
