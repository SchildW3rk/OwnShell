/**
 * Snippets Sidebar
 *
 * Right sidebar for quick commands in terminal view
 * Features:
 * - Search filter
 * - Collapsible category groups
 * - Run (command + Enter) and Paste (command only) buttons
 * - Edit/Delete on hover
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Plus,
  Search,
  Play,
  Clipboard,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  MoreVertical,
} from 'lucide-react';
import { cn } from '@ownshell/ui';
import { Snippet, SnippetGroup, useSnippetStore } from '../stores/useSnippetStore';
import { SnippetModal } from './SnippetModal';

interface SnippetsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (command: string) => void; // Sends command + "\r" (Enter)
  onPaste: (command: string) => void; // Sends command only
}

export const SnippetsSidebar: React.FC<SnippetsSidebarProps> = ({
  isOpen,
  onClose,
  onRun,
  onPaste,
}) => {
  const { t } = useTranslation();
  const { snippets, isLoading, loadSnippets, deleteSnippet } = useSnippetStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string | null>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load snippets on mount
  useEffect(() => {
    if (isOpen) {
      loadSnippets();
    }
  }, [isOpen, loadSnippets]);

  // Get grouped snippets (computed from snippets array)
  const groupedSnippets = useMemo(() => {
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
  }, [snippets]);

  // Expand all categories by default when groups change
  useEffect(() => {
    const allCategories = new Set(groupedSnippets.map((g) => g.category));
    setExpandedCategories(allCategories);
  }, [groupedSnippets]);

  // Filter snippets by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedSnippets;
    }

    const query = searchQuery.toLowerCase();
    return groupedSnippets
      .map((group) => ({
        ...group,
        snippets: group.snippets.filter(
          (s) =>
            s.label.toLowerCase().includes(query) ||
            s.command.toLowerCase().includes(query) ||
            (s.category && s.category.toLowerCase().includes(query))
        ),
      }))
      .filter((group) => group.snippets.length > 0);
  }, [groupedSnippets, searchQuery]);

  const toggleCategory = (category: string | null) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleAddNew = () => {
    setEditingSnippet(undefined);
    setShowModal(true);
  };

  const handleEdit = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setShowModal(true);
  };

  const handleDelete = async (snippet: Snippet) => {
    setDeletingId(snippet.id);
    await deleteSnippet(snippet.id);
    setDeletingId(null);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingSnippet(undefined);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="flex h-full w-72 flex-col border-l border-shell-panel-border bg-shell-panel text-shell-panel-foreground shadow-[-12px_0_24px_rgba(0,0,0,0.18)]">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-shell-panel-border px-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-shell-panel-active" />
            <span className="text-sm font-semibold text-shell-panel-foreground">
              {t('snippets.title')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleAddNew}
              className="rounded p-1.5 text-shell-panel-muted transition-colors hover:bg-shell-panel-hover hover:text-shell-panel-foreground"
              title={t('snippets.addSnippet')}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-shell-panel-muted transition-colors hover:bg-shell-panel-hover hover:text-shell-panel-foreground"
              title={t('snippets.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-shell-panel-border px-3 py-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-shell-panel-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('snippets.searchPlaceholder')}
              className={cn(
                'w-full rounded-md py-2 pl-8 pr-3 text-sm',
                'border border-shell-control-border bg-shell-control',
                'text-shell-control-foreground placeholder:text-shell-panel-muted',
                'focus:outline-none focus:border-shell-focus-soft',
                'transition-colors'
              )}
            />
          </div>
        </div>

        {/* Snippet List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-shell-panel-muted">
              {t('snippets.loading')}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center px-4 text-center text-sm text-shell-panel-muted">
              {searchQuery ? (
                <p>{t('snippets.noMatch', { query: searchQuery })}</p>
              ) : (
                <>
                  <p>{t('snippets.noSnippets')}</p>
                  <button
                    type="button"
                    onClick={handleAddNew}
                    className="mt-2 text-shell-panel-active hover:underline"
                  >
                    {t('snippets.createFirst')}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map((group) => (
                <CategoryGroup
                  key={group.category ?? '__uncategorized__'}
                  group={group}
                  isExpanded={expandedCategories.has(group.category)}
                  onToggle={() => toggleCategory(group.category)}
                  onRun={onRun}
                  onPaste={onPaste}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-shell-panel-border px-3 py-2 text-xs text-shell-panel-muted">
          <div className="flex flex-wrap items-center gap-1.5">
            <kbd className="rounded border border-shell-control-border bg-shell-control px-1.5 py-0.5 text-shell-control-foreground">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="rounded border border-shell-control-border bg-shell-control px-1.5 py-0.5 text-shell-control-foreground">
              Shift
            </kbd>
            <span>+</span>
            <kbd className="rounded border border-shell-control-border bg-shell-control px-1.5 py-0.5 text-shell-control-foreground">
              S
            </kbd>
            <span>{t('snippets.toggleHint')}</span>
          </div>
        </div>
      </div>

      {/* Modal */}
      <SnippetModal isOpen={showModal} onClose={handleModalClose} snippet={editingSnippet} />
    </>
  );
};

// ============================================
// Category Group (Collapsible)
// ============================================

interface CategoryGroupProps {
  group: SnippetGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onRun: (command: string) => void;
  onPaste: (command: string) => void;
  onEdit: (snippet: Snippet) => void;
  onDelete: (snippet: Snippet) => void;
  deletingId: string | null;
  t: (key: string) => string;
}

const CategoryGroup: React.FC<CategoryGroupProps> = ({
  group,
  isExpanded,
  onToggle,
  onRun,
  onPaste,
  onEdit,
  onDelete,
  deletingId,
  t,
}) => {
  const categoryName = group.category || t('snippets.uncategorized');

  return (
    <div>
      {/* Category Header */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left',
          'text-xs font-semibold uppercase text-shell-panel-muted tracking-wide',
          'hover:bg-shell-panel-hover hover:text-shell-panel-foreground transition-colors'
        )}
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="truncate">{categoryName}</span>
        <span className="ml-auto text-shell-panel-muted/80">{group.snippets.length}</span>
      </button>

      {/* Snippets */}
      {isExpanded && (
        <div className="mt-1 space-y-1">
          {group.snippets.map((snippet) => (
            <SnippetItem
              key={snippet.id}
              snippet={snippet}
              onRun={onRun}
              onPaste={onPaste}
              onEdit={onEdit}
              onDelete={onDelete}
              isDeleting={deletingId === snippet.id}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// Snippet Item (Clean Action Menu Design)
// ============================================

interface SnippetItemProps {
  snippet: Snippet;
  onRun: (command: string) => void;
  onPaste: (command: string) => void;
  onEdit: (snippet: Snippet) => void;
  onDelete: (snippet: Snippet) => void;
  isDeleting: boolean;
  t: (key: string) => string;
}

const SnippetItem: React.FC<SnippetItemProps> = ({
  snippet,
  onRun,
  onPaste,
  onEdit,
  onDelete,
  isDeleting,
  t,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Truncate command for display (single line)
  const truncatedCommand =
    snippet.command.length > 35
      ? snippet.command.replace(/\n/g, ' ').slice(0, 35) + '...'
      : snippet.command.replace(/\n/g, ' ');

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    // Use setTimeout to avoid immediate close from the click that opened it
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [menuOpen]);

  const handleMenuAction = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  return (
    <article
      className={cn(
        'group relative rounded-md border border-transparent px-3 py-2.5',
        'hover:border-shell-panel-border hover:bg-shell-panel-hover transition-colors',
        isDeleting && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Left: Label and Command */}
      <div className="pr-14">
        <div className="truncate text-sm font-medium text-shell-panel-foreground">
          {snippet.label}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-shell-panel-muted">
          {truncatedCommand}
        </div>
      </div>

      {/* Right: Action Buttons */}
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
        {/* Primary: Run Button */}
        <button
          type="button"
          onClick={() => onRun(snippet.command)}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-shell-panel-muted hover:text-success hover:bg-success/15'
          )}
          title={t('snippets.run')}
        >
          <Play className="h-4 w-4" />
        </button>

        {/* Secondary: More Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={cn(
              'rounded p-1.5 transition-colors',
              'text-shell-panel-muted hover:text-shell-panel-foreground hover:bg-shell-control',
              menuOpen && 'bg-shell-control text-shell-panel-foreground'
            )}
            title={t('snippets.moreActions')}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div
              className={cn(
                'absolute right-0 top-full z-50 mt-1',
                'w-36 rounded-md py-1 shadow-lg',
                'border border-shell-panel-border bg-popover text-popover-foreground'
              )}
            >
              {/* Copy */}
              <button
                type="button"
                onClick={() => handleMenuAction(() => onPaste(snippet.command))}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                  'text-popover-foreground hover:bg-shell-panel-hover transition-colors'
                )}
              >
                <Clipboard className="h-4 w-4 text-shell-panel-muted" />
                {t('snippets.copy')}
              </button>

              {/* Edit */}
              <button
                type="button"
                onClick={() => handleMenuAction(() => onEdit(snippet))}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                  'text-popover-foreground hover:bg-shell-panel-hover transition-colors'
                )}
              >
                <Pencil className="h-4 w-4 text-shell-panel-muted" />
                {t('snippets.edit')}
              </button>

              {/* Divider */}
              <div className="my-1 border-t border-shell-panel-border" />

              {/* Delete */}
              <button
                type="button"
                onClick={() => handleMenuAction(() => onDelete(snippet))}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                  'text-destructive hover:bg-destructive/10 transition-colors'
                )}
              >
                <Trash2 className="h-4 w-4" />
                {t('snippets.delete')}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
