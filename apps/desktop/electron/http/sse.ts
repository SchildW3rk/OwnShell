/**
 * Server-Sent Events parser following the WHATWG EventSource stream rules:
 * UTF-8 with an optional leading BOM, lines end in CRLF, LF or CR, `:` lines are
 * comments, `data` lines are joined with LF, an empty line dispatches, an event
 * without data is not dispatched, `id` persists until changed (ids with NUL are
 * ignored). `retry` only matters for reconnecting, which this client does not do,
 * so it is ignored. Memory is bounded: one line and one event's data are capped.
 */

export interface SseEvent {
  event: string;
  data: string;
  /** Last event id at dispatch time ('' when none was set). */
  id: string;
  /** Date.now() at dispatch. */
  time: number;
  /** The data hit MAX_EVENT_CHARS and was cut. */
  truncated?: boolean;
}

export const MAX_EVENT_CHARS = 1024 * 1024;
/** `event` and `id` values are cut to this length. */
export const MAX_SSE_FIELD_CHARS = 1024;
/** What the response viewer keeps of a stream (the newest events win); also caps one IPC batch. */
export const STREAM_BUFFER_EVENTS = 1000;
export const STREAM_BUFFER_CHARS = 5 * 1024 * 1024;

/** Main → renderer messages on 'api:stream'; event contents are never logged. */
export type StreamMessage =
  | { executionId: string; kind: 'open'; status: number; statusText: string; headers: Record<string, string> }
  | { executionId: string; kind: 'events'; events: SseEvent[]; dropped: number };

/** What an event counts against STREAM_BUFFER_CHARS: every string field, not only the data. */
export const sseEventChars = (event: SseEvent) => event.event.length + event.data.length + event.id.length;

export const isEventStream = (contentType: string | undefined) =>
  (contentType ?? '').split(';')[0].trim().toLowerCase() === 'text/event-stream';

export function createSseParser(onEvent: (event: SseEvent) => void, now: () => number = Date.now) {
  const decoder = new TextDecoder('utf-8');
  let started = false;
  let line = '';
  let lineTooLong = false;
  let afterCr = false;
  let data: string[] = [];
  let dataChars = 0;
  let truncated = false;
  let eventType = '';
  let lastId = '';

  const dispatch = () => {
    if (data.length > 0) {
      onEvent({
        event: eventType || 'message',
        data: data.join('\n'),
        id: lastId,
        time: now(),
        ...(truncated && { truncated: true }),
      });
    }
    data = [];
    dataChars = 0;
    truncated = false;
    eventType = '';
  };

  const processLine = (text: string) => {
    if (text === '') return dispatch();
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        eventType = value.slice(0, MAX_SSE_FIELD_CHARS);
        break;
      case 'data': {
        const room = MAX_EVENT_CHARS - dataChars;
        if (room <= 0) {
          truncated = true;
          break;
        }
        if (value.length > room) {
          value = value.slice(0, room);
          truncated = true;
        }
        data.push(value);
        dataChars += value.length + 1;
        break;
      }
      case 'id':
        if (!value.includes('\0')) lastId = value.slice(0, MAX_SSE_FIELD_CHARS);
        break;
      // 'retry' and unknown fields are ignored.
    }
  };

  const feedText = (text: string) => {
    if (!started && text) {
      started = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    let start = 0;
    for (let index = 0; index < text.length; index++) {
      const char = text.charCodeAt(index);
      if (char !== 10 && char !== 13) continue;
      // LF right after a CR (also across chunks) ends the same line.
      if (char === 10 && afterCr && index === start) {
        afterCr = false;
        start = index + 1;
        continue;
      }
      appendToLine(text.slice(start, index));
      processLine(lineTooLong ? line.slice(0, MAX_EVENT_CHARS) : line);
      line = '';
      lineTooLong = false;
      afterCr = char === 13;
      start = index + 1;
    }
    if (start < text.length) {
      afterCr = false;
      appendToLine(text.slice(start));
    }
  };

  const appendToLine = (part: string) => {
    if (lineTooLong) return;
    // A field name plus a capped value; anything longer is cut, not buffered.
    if (line.length + part.length > MAX_EVENT_CHARS + 16) {
      line = (line + part).slice(0, MAX_EVENT_CHARS + 16);
      lineTooLong = true;
      truncated = true;
    } else {
      line += part;
    }
  };

  return {
    feed(chunk: Uint8Array) {
      feedText(decoder.decode(chunk, { stream: true }));
    },
    /** End of stream: an incomplete event is discarded (per spec). */
    end() {
      feedText(decoder.decode());
      line = '';
      data = [];
    },
  };
}
