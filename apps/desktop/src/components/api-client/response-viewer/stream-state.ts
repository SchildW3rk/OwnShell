import {
  STREAM_BUFFER_CHARS,
  STREAM_BUFFER_EVENTS,
  sseEventChars,
  type SseEvent,
  type StreamMessage,
} from '../../../../electron/http/sse';

/** A live or finished event stream as the response viewer shows it: the newest events, bounded. */
export interface StreamState {
  status?: number;
  statusText?: string;
  headers: Record<string, string>;
  events: SseEvent[];
  chars: number;
  /** Events no longer kept (older ones beyond the buffer, or dropped by the main process). */
  dropped: number;
}

export const EMPTY_STREAM: StreamState = { headers: {}, events: [], chars: 0, dropped: 0 };

export function applyStreamMessage(state: StreamState = EMPTY_STREAM, message: StreamMessage): StreamState {
  if (message.kind === 'open') {
    return { ...state, status: message.status, statusText: message.statusText, headers: message.headers };
  }
  const events = state.events.concat(message.events);
  let chars = state.chars + message.events.reduce((sum, event) => sum + sseEventChars(event), 0);
  let start = 0;
  while (events.length - start > STREAM_BUFFER_EVENTS || (chars > STREAM_BUFFER_CHARS && start < events.length)) {
    chars -= sseEventChars(events[start]);
    start++;
  }
  return { ...state, events: start ? events.slice(start) : events, chars, dropped: state.dropped + message.dropped + start };
}
