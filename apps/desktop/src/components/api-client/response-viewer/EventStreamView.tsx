import React, { useLayoutEffect, useRef, useState } from 'react';
import { Code, ListTree, Radio } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { HeadersTable } from './HeadersTable';
import { StatusBadge } from './StatusBadge';
import type { StreamState } from './stream-state';
import type { HttpResponse } from './types';

interface EventStreamViewProps {
  stream: StreamState;
  /** Null while the stream is live. */
  response: HttpResponse | null;
}

const timeOf = (time: number) => {
  const date = new Date(time);
  return `${date.toLocaleTimeString([], { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};

/** Server-Sent Events, live while the request runs; Cancel stops the stream. */
export const EventStreamView: React.FC<EventStreamViewProps> = ({ stream, response }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'events' | 'headers'>('events');
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const live = !response;

  // Follow new events while the list is scrolled to the bottom.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && pinnedRef.current) list.scrollTop = list.scrollHeight;
  }, [stream.events]);

  const status = response?.status ?? stream.status ?? 0;
  const statusText = response?.statusText ?? stream.statusText ?? '';
  const headers = response?.headers ?? stream.headers;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-b border-border">
        <span className="text-sm font-medium text-foreground">{t('api.responseTitle')}</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {status > 0 && <StatusBadge status={status} statusText={statusText} />}
          <span className="flex items-center gap-1" role="status" aria-live="polite">
            <Radio className={cn('w-3 h-3', live && 'text-green-500 animate-pulse')} />
            {live ? t('api.stream.live') : t(`api.stream.ended.${response.streamEnd ?? 'complete'}`)}
          </span>
          <span>{t('api.stream.eventCount', { count: stream.events.length })}</span>
        </div>
      </div>

      {stream.dropped > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
          {t('api.stream.dropped', { count: stream.dropped })}
        </div>
      )}

      <div className="flex-shrink-0 flex items-center px-2 border-b border-border bg-secondary/30">
        {(
          [
            { id: 'events', label: t('api.stream.events'), icon: Code },
            { id: 'headers', label: t('api.response.headers'), icon: ListTree },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
              tab === id ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'headers' ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <HeadersTable headers={headers} />
        </div>
      ) : (
        <div
          ref={listRef}
          onScroll={(event) => {
            const list = event.currentTarget;
            pinnedRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
          }}
          className="flex-1 min-h-0 overflow-auto font-mono text-xs"
        >
          {stream.events.length === 0 ? (
            <p className="p-4 font-sans text-sm text-muted-foreground">
              {live ? t('api.stream.waiting') : t('api.stream.empty')}
            </p>
          ) : (
            stream.events.map((event, index) => (
              <div key={index} className="flex gap-3 px-4 py-1.5 border-b border-border/50">
                <span className="flex-shrink-0 text-muted-foreground tabular-nums">{timeOf(event.time)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2 text-[11px]">
                    <span className="text-primary">{event.event}</span>
                    {event.id && <span className="text-muted-foreground">id: {event.id}</span>}
                    {event.truncated && <span className="text-amber-600">{t('api.stream.truncated')}</span>}
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-foreground">{event.data}</pre>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
