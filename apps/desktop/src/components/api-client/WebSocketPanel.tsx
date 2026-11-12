import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Send, Wand2 } from 'lucide-react';
import { Button, cn, formatBytes } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import type { WsSession } from './websocket-session';

interface WebSocketPanelProps {
  session: WsSession | undefined;
  onSend: (text: string) => Promise<boolean>;
}

const timeOf = (time: number) => {
  const date = new Date(time);
  return `${date.toLocaleTimeString([], { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};

/** Live message log (newest kept, bounded) and a text composer for a WebSocket request. */
export const WebSocketPanel: React.FC<WebSocketPanelProps> = ({ session, onSend }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [jsonError, setJsonError] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const open = session?.state === 'open';

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && pinnedRef.current) list.scrollTop = list.scrollHeight;
  }, [session?.messages]);

  const send = async () => {
    if (!draft || !open) return;
    if (await onSend(draft)) setDraft('');
  };

  const formatJson = () => {
    try {
      setDraft(JSON.stringify(JSON.parse(draft), null, 2));
      setJsonError(false);
    } catch {
      setJsonError(true);
    }
  };

  const stateLabel = !session
    ? t('api.ws.notConnected')
    : session.state === 'closed'
      ? t('api.ws.closed', { code: session.closeCode ?? '-', reason: session.closeReason ?? '' })
      : t(`api.ws.${session.state}`);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-b border-border">
        <span className="text-sm font-medium text-foreground">{t('api.ws.messages')}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <span className={cn('w-2 h-2 rounded-full', open ? 'bg-green-500' : session?.state === 'connecting' ? 'bg-amber-500' : 'bg-muted')} />
          {stateLabel}
        </span>
      </div>
      {session?.error && (
        <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-destructive/10 text-xs text-destructive">{session.errorCode ? t(`api.errors.${session.errorCode}`, { detail: session.error ?? '' }) : session.error}</div>
      )}
      {!!session?.dropped && (
        <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
          {t('api.ws.dropped', { count: session.dropped })}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          pinnedRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
        }}
        className="flex-1 min-h-0 overflow-auto font-mono text-xs"
      >
        {!session?.messages.length ? (
          <p className="p-4 font-sans text-sm text-muted-foreground">{t('api.ws.empty')}</p>
        ) : (
          session.messages.map((message, index) => (
            <div key={index} className="flex gap-3 px-4 py-1.5 border-b border-border/50">
              {message.direction === 'in' ? (
                <ArrowDownLeft className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" aria-label={t('api.ws.received')} />
              ) : (
                <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0 text-green-500" aria-label={t('api.ws.sent')} />
              )}
              <span className="flex-shrink-0 text-muted-foreground tabular-nums">{timeOf(message.time)}</span>
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all text-foreground">
                {message.binary ? t('api.ws.binary') : message.data}
              </pre>
              <span className="flex-shrink-0 text-muted-foreground tabular-nums">{formatBytes(message.size)}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex-shrink-0 border-t border-border p-2 space-y-2">
        <textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setJsonError(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          rows={4}
          placeholder={t('api.ws.composerPlaceholder')}
          aria-label={t('api.ws.composerPlaceholder')}
          className="w-full resize-none rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-destructive">{jsonError && t('api.ws.invalidJson')}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={formatJson} disabled={!draft.trim()}>
              <Wand2 className="w-3.5 h-3.5 mr-1" />
              {t('api.ws.formatJson')}
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => void send()} disabled={!open || !draft}>
              <Send className="w-3.5 h-3.5 mr-1" />
              {t('api.ws.send')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
