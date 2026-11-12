import React, { useMemo, useState } from 'react';
import type { ApiRequestHistoryTable } from '@ownshell/core';
import { Button, ConfirmDialog, cn, formatBytes } from '@ownshell/ui';
import { FileJson, FilePlus, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useApiHistory,
  useApiRequests,
  useClearApiHistory,
  useCreateApiRequest,
} from '../../../hooks/api/useApiQueries';
import { ContextMenu } from './ContextMenu';
import { methodColors, methodShort } from './method-badges';

/** Path of a history URL template for the draft name ({{placeholders}} stay readable). */
function draftName(entry: ApiRequestHistoryTable): string {
  const withoutOrigin = entry.url.replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '').split('?')[0];
  return `${entry.method} ${withoutOrigin || entry.url}`.slice(0, 255);
}

function statusClass(status: number): string {
  if (status === 0 || status >= 500) return 'text-destructive';
  if (status >= 400) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

interface HistoryPanelProps {
  onOpened: (requestId: string) => void;
}

/**
 * The last sends (method, URL template, status, time, size). A click opens the saved request
 * when it still exists, otherwise a new request from the URL; the context menu offers both.
 */
export const HistoryPanel: React.FC<HistoryPanelProps> = ({ onOpened }) => {
  const { t, i18n } = useTranslation();
  const { data: entries = [], isLoading } = useApiHistory();
  const clearHistory = useClearApiHistory();
  const createRequest = useCreateApiRequest();
  const { data: requests = [] } = useApiRequests();
  const savedIds = useMemo(() => new Set(requests.map((request) => request.id)), [requests]);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: ApiRequestHistoryTable } | null>(null);
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return lower
      ? entries.filter((entry) => `${entry.method} ${entry.url} ${entry.status}`.toLowerCase().includes(lower))
      : entries;
  }, [entries, query]);
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'medium' }),
    [i18n.language]
  );

  const isSaved = (entry: ApiRequestHistoryTable) => !!entry.request_id && savedIds.has(entry.request_id);

  const handleCreate = async (entry: ApiRequestHistoryTable) => {
    // The template keeps {{placeholders}}; nothing resolved was stored.
    const created = await createRequest
      .mutateAsync({ name: draftName(entry), collection_id: null, method: entry.method, url: entry.url })
      .catch(() => null); // the mutation hook shows the error
    if (created) onOpened(created.id);
  };

  const handleOpen = (entry: ApiRequestHistoryTable) => {
    if (isSaved(entry)) onOpened(entry.request_id!);
    else void handleCreate(entry);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-1 px-2 pt-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
            placeholder={t('api.history.filter')}
            aria-label={t('api.history.filter')}
            className="w-full rounded-md border border-border bg-secondary py-1 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          disabled={entries.length === 0}
          onClick={() => setConfirmClear(true)}
          title={t('api.history.clear')}
          aria-label={t('api.history.clear')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2">
        {isLoading ? null : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            {entries.length === 0 ? t('api.history.empty') : t('api.sidebar.noMatches')}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => handleOpen(entry)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY, entry });
                  }}
                  disabled={createRequest.isPending}
                  title={t(isSaved(entry) ? 'api.history.openSavedHint' : 'api.history.openHint')}
                  className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent/10"
                >
                  <span className="flex w-full items-center gap-1.5">
                    <span
                      className={cn(
                        'flex-shrink-0 rounded px-1 text-[9px] font-bold leading-4',
                        methodColors[entry.method]
                      )}
                    >
                      {methodShort[entry.method]}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{entry.url}</span>
                  </span>
                  <span className="flex items-center gap-2 pl-0.5 text-[10px] text-muted-foreground">
                    <span className={cn('font-semibold', statusClass(entry.status))}>
                      {entry.status === 0 ? t('api.history.failed') : entry.status}
                    </span>
                    <span>{entry.duration_ms} ms</span>
                    <span>{formatBytes(entry.response_size)}</span>
                    <span className="ml-auto">{timeFormat.format(entry.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            ...(isSaved(menu.entry)
              ? [
                  {
                    label: t('api.history.openSaved'),
                    icon: <FileJson className="h-4 w-4" />,
                    onClick: () => onOpened(menu.entry.request_id!),
                  },
                ]
              : []),
            {
              label: t('api.history.createFromUrl'),
              icon: <FilePlus className="h-4 w-4" />,
              onClick: () => void handleCreate(menu.entry),
            },
          ]}
          onClose={() => setMenu(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmClear}
        title={t('api.history.clear')}
        message={t('api.history.clearConfirm')}
        confirmLabel={t('api.history.clear')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setConfirmClear(false);
          clearHistory.mutate();
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
};
