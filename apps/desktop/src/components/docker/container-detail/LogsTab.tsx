import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Radio, RotateCcw, Square } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';

interface LogsTabProps {
  sessionId: string;
  containerId: string;
  logs: string;
  isLoading: boolean;
  tail: number;
  onTailChange: (tail: number) => void;
  onRefresh: () => void;
  allowStreaming?: boolean;
  isVisible: boolean;
}

interface LogStreamAttachment {
  id: string | null;
  closed: boolean;
  removeData?: () => void;
  removeEnd?: () => void;
}

export const LogsTab: React.FC<LogsTabProps> = ({
  sessionId,
  containerId,
  logs,
  isLoading,
  tail,
  onTailChange,
  onRefresh,
  allowStreaming = true,
  isVisible,
}) => {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevLineCountRef = useRef(0);
  const streamRef = useRef<LogStreamAttachment | null>(null);
  const bufferRef = useRef<string[]>([]);
  const partialLineRef = useRef('');
  const frameRef = useRef<number | null>(null);
  const visibleRef = useRef(isVisible);
  const [isStreaming, setIsStreaming] = useState(false);
  const [liveBuffer, setLiveBuffer] = useState<string[]>([]);
  const staticLines = useMemo(() => (logs ? logs.split('\n') : []), [logs]);
  const logLines = isStreaming ? liveBuffer : staticLines;

  const publishBuffer = useCallback(() => {
    frameRef.current = null;
    if (!visibleRef.current) return;
    const lines = bufferRef.current;
    setLiveBuffer(
      partialLineRef.current ? [...lines, partialLineRef.current].slice(-1000) : lines.slice()
    );
  }, []);

  const scheduleBuffer = useCallback(() => {
    if (visibleRef.current && frameRef.current === null) {
      frameRef.current = requestAnimationFrame(publishBuffer);
    }
  }, [publishBuffer]);

  useLayoutEffect(() => {
    visibleRef.current = isVisible;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (isVisible && streamRef.current) publishBuffer();
  }, [isVisible, publishBuffer]);

  const virtualizer = useVirtualizer({
    count: logLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 18,
    overscan: 20,
  });

  useEffect(() => {
    if (isVisible && logLines.length > prevLineCountRef.current && logLines.length > 0) {
      virtualizer.scrollToIndex(logLines.length - 1, { align: 'end' });
    }
    prevLineCountRef.current = logLines.length;
  }, [isVisible, logLines.length, virtualizer]);

  const releaseStream = useCallback((stream: LogStreamAttachment, stop = true) => {
    if (stream.closed) return;
    stream.closed = true;
    stream.removeData?.();
    stream.removeEnd?.();
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (streamRef.current === stream) streamRef.current = null;
    if (stop && stream.id) {
      return window.electronAPI.docker.logsStreamStop(stream.id).catch((error) => {
        console.error('[Logs] Error stopping stream:', error);
      });
    }
    return undefined;
  }, []);

  const startLiveStreaming = useCallback(async () => {
    if (streamRef.current) return;
    const stream: LogStreamAttachment = { id: null, closed: false };
    streamRef.current = stream;
    bufferRef.current = [];
    partialLineRef.current = '';
    setIsStreaming(true);
    setLiveBuffer([]);

    try {
      const result = await window.electronAPI.docker.logsStreamStart(sessionId, containerId, 100);
      // A tab can close while the real SSH shell is still opening.
      if (stream.closed) {
        if (result.streamId) {
          await window.electronAPI.docker.logsStreamStop(result.streamId);
        }
        return;
      }
      if (!result.success || !result.streamId) {
        console.error('[Logs] Failed to start stream:', result.error);
        releaseStream(stream, false);
        setIsStreaming(false);
        return;
      }

      stream.id = result.streamId;
      stream.removeData = window.electronAPI.docker.onLogsStreamData?.((data) => {
        if (stream.closed || data.streamId !== stream.id) return;
        // SSH/IPC chunks are not line boundaries. Retain the unfinished line,
        // including a CR split from its LF, until the following chunk arrives.
        let offset = 0;
        let newline = data.data.indexOf('\n');
        while (newline !== -1) {
          const line = partialLineRef.current + data.data.slice(offset, newline);
          partialLineRef.current = '';
          if (line.length > 0) bufferRef.current.push(line);
          offset = newline + 1;
          newline = data.data.indexOf('\n', offset);
        }
        partialLineRef.current += data.data.slice(offset);
        if (bufferRef.current.length > 1000) {
          bufferRef.current.splice(0, bufferRef.current.length - 1000);
        }
        scheduleBuffer();
      });
      stream.removeEnd = window.electronAPI.docker.onLogsStreamEnd?.((data) => {
        if (stream.closed || data.streamId !== stream.id) return;
        releaseStream(stream, false);
        setIsStreaming(false);
      });
    } catch (error) {
      if (stream.closed) return;
      console.error('[Logs] Error starting stream:', error);
      releaseStream(stream);
      setIsStreaming(false);
    }
  }, [sessionId, containerId, releaseStream, scheduleBuffer]);

  const stopLiveStreaming = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    await releaseStream(stream);
    if (!streamRef.current) setIsStreaming(false);
  }, [releaseStream]);

  useEffect(() => {
    return () => {
      const stream = streamRef.current;
      if (stream) releaseStream(stream);
    };
  }, [releaseStream]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('docker.tailLines', 'Tail lines')}:
          </span>
          <select
            value={tail}
            onChange={(e) => onTailChange(Number(e.target.value))}
            className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
            aria-label="Tail lines"
            disabled={isStreaming}
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={5000}>5000</option>
          </select>
          <span className="text-xs text-muted-foreground/60 ml-2">
            {logLines.length > 0 ? `${logLines.length} lines` : ''}
            {isStreaming && <span className="ml-1 text-green-400 animate-pulse">(live)</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {allowStreaming &&
            (isStreaming ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={stopLiveStreaming}
                className="text-green-400 hover:text-green-300"
              >
                <Square className="w-4 h-4 mr-1" />
                {t('docker.stopLive', 'Stop Live')}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={startLiveStreaming}
                className="text-muted-foreground hover:text-foreground"
              >
                <Radio className="w-4 h-4 mr-1" />
                {t('docker.goLive', 'Live')}
              </Button>
            ))}
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading || isStreaming}>
            <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {logLines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">
            {isStreaming
              ? t('docker.waitingForLogs', 'Waiting for logs...')
              : t('docker.noLogs', 'No logs available')}
          </p>
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto bg-background">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="px-4 font-mono text-xs text-foreground leading-[18px] whitespace-pre hover:bg-surface"
              >
                {logLines[virtualRow.index]}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
