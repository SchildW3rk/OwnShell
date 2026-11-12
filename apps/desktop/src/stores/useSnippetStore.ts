/**
 * Snippet Store (Zustand)
 *
 * Manages quick commands / snippets for terminal
 * - Global snippets (available for all hosts)
 * - CRUD operations
 * - Category grouping
 */

import { create } from 'zustand';
import toast from 'react-hot-toast';
import { assertIpcSuccess } from '../lib/ipcResult';
import { i18n } from '../i18n';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Snippet from database (snake_case from DB)
 */
export interface Snippet {
  id: string;
  label: string;
  command: string;
  category: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Grouped snippets by category
 */
export interface SnippetGroup {
  category: string | null;
  snippets: Snippet[];
}

interface SnippetStoreState {
  // State
  snippets: Snippet[];
  categories: string[];
  isLoading: boolean;

  // Actions
  loadSnippets: () => Promise<void>;
  loadCategories: () => Promise<void>;
  createSnippet: (data: { label: string; command: string; category?: string }) => Promise<boolean>;
  updateSnippet: (
    id: string,
    update: { label?: string; command?: string; category?: string | null }
  ) => Promise<boolean>;
  deleteSnippet: (id: string) => Promise<boolean>;

  // Getters
  getGroupedSnippets: () => SnippetGroup[];
  getByCategory: (category: string | null) => Snippet[];
}

export const useSnippetStore = create<SnippetStoreState>((set, get) => ({
  snippets: [],
  categories: [],
  isLoading: false,

  loadSnippets: async () => {
    try {
      set({ isLoading: true });
      if (isDev) console.log('[Snippets] Loading snippets...');

      const snippets = await window.electronAPI.snippets.list();

      if (isDev) console.log('[Snippets] Loaded', { count: snippets.length });
      set({ snippets, isLoading: false });

      // Also refresh categories
      await get().loadCategories();
    } catch (error) {
      console.error('[Snippets] Failed to load snippets', error);
      set({ isLoading: false });
      toast.error(i18n.t('snippets.loadFailed'));
    }
  },

  loadCategories: async () => {
    try {
      const categories = await window.electronAPI.snippets.getCategories();
      if (isDev) console.log('[Snippets] Loaded categories', { categories });
      set({ categories });
    } catch (error) {
      console.error('[Snippets] Failed to load categories', error);
    }
  },

  createSnippet: async (data) => {
    try {
      if (isDev) console.log('[Snippets] Creating snippet', data);

      const newSnippet = assertIpcSuccess(await window.electronAPI.snippets.create(data));

      if (isDev) console.log('[Snippets] Snippet created', { id: newSnippet.id });
      toast.success(i18n.t('snippets.created', { label: data.label }));

      // Reload snippets
      await get().loadSnippets();
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Snippets] Failed to create snippet', error);
      toast.error(`${i18n.t('snippets.createFailed')}: ${msg}`);
      return false;
    }
  },

  updateSnippet: async (id, update) => {
    try {
      if (isDev) console.log('[Snippets] Updating snippet', { id, update });

      assertIpcSuccess(await window.electronAPI.snippets.update(id, update));

      if (isDev) console.log('[Snippets] Snippet updated', { id });
      toast.success(i18n.t('snippets.updated'));

      // Reload snippets
      await get().loadSnippets();
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Snippets] Failed to update snippet', error);
      toast.error(`${i18n.t('snippets.updateFailed')}: ${msg}`);
      return false;
    }
  },

  deleteSnippet: async (id) => {
    try {
      if (isDev) console.log('[Snippets] Deleting snippet', { id });

      assertIpcSuccess(await window.electronAPI.snippets.delete(id));

      if (isDev) console.log('[Snippets] Snippet deleted', { id });
      toast.success(i18n.t('snippets.deleted'));

      // Reload snippets
      await get().loadSnippets();
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Snippets] Failed to delete snippet', error);
      toast.error(`${i18n.t('snippets.deleteFailed')}: ${msg}`);
      return false;
    }
  },

  getGroupedSnippets: () => {
    const { snippets } = get();

    // Group by category
    const groups = new Map<string | null, Snippet[]>();

    for (const snippet of snippets) {
      const key = snippet.category;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(snippet);
    }

    // Convert to array and sort
    // Categories alphabetically, null (uncategorized) at the end
    const result: SnippetGroup[] = [];

    // First: categorized groups (sorted alphabetically)
    const categorized = Array.from(groups.entries())
      .filter(([cat]) => cat !== null)
      .sort((a, b) => (a[0] as string).localeCompare(b[0] as string));

    for (const [category, categorySnippets] of categorized) {
      result.push({
        category,
        snippets: categorySnippets.sort((a, b) => a.label.localeCompare(b.label)),
      });
    }

    // Last: uncategorized
    const uncategorized = groups.get(null);
    if (uncategorized && uncategorized.length > 0) {
      result.push({
        category: null,
        snippets: uncategorized.sort((a, b) => a.label.localeCompare(b.label)),
      });
    }

    return result;
  },

  getByCategory: (category) => {
    const { snippets } = get();
    return snippets
      .filter((s) => s.category === category)
      .sort((a, b) => a.label.localeCompare(b.label));
  },
}));
