import type { WebSocketEvent } from '../../../electron/ipc/api-client/websocket';

export interface WsMessage {
  direction: 'in' | 'out';
  data: string;
  binary: boolean;
  size: number;
  time: number;
}

/** One request's connection as the panel shows it; the log is bounded like an event stream. */
export interface WsSession {
  connectionId: string;
  state: 'connecting' | 'open' | 'closed';
  messages: WsMessage[];
  chars: number;
  dropped: number;
  status?: number;
  closeCode?: number;
  closeReason?: string;
  error?: string;
  /** Translated in the panel via api.errors.<code>; `error` is the untranslated detail. */
  errorCode?: string;
}

export const WS_LOG_MESSAGES = 1000;
export const WS_LOG_CHARS = 5 * 1024 * 1024;

export function appendMessage(session: WsSession, message: WsMessage): WsSession {
  const messages = [...session.messages, message];
  let chars = session.chars + message.data.length;
  let start = 0;
  while (messages.length - start > WS_LOG_MESSAGES || (chars > WS_LOG_CHARS && start < messages.length - 1)) {
    chars -= messages[start].data.length;
    start++;
  }
  return { ...session, messages: start ? messages.slice(start) : messages, chars, dropped: session.dropped + start };
}

export function applyWsEvent(session: WsSession, event: WebSocketEvent): WsSession {
  if (event.type === 'message') {
    return appendMessage(session, { direction: 'in', data: event.data, binary: event.binary, size: event.size, time: event.time });
  }
  if (event.type === 'close') return { ...session, state: 'closed', closeCode: event.code, closeReason: event.reason };
  return { ...session, error: event.message, errorCode: event.code };
}
