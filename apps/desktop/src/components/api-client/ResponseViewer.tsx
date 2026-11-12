/**
 * Response Viewer (v1.18.0)
 *
 * Displays HTTP responses with status metadata, body, headers, and sandboxed
 * HTML preview tabs.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Code,
  Copy,
  Download,
  Eye,
  FileDown,
  Gauge,
  Info,
  ListTree,
} from 'lucide-react';
import { Button, cn, formatBytes } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { CodeViewer } from './response-viewer/CodeViewer';
import { HeadersTable } from './response-viewer/HeadersTable';
import { HtmlPreview } from './response-viewer/HtmlPreview';
import { StatusBadge } from './response-viewer/StatusBadge';
import { EventStreamView } from './response-viewer/EventStreamView';
import type { StreamState } from './response-viewer/stream-state';
import type { HttpResponse, ResponseContentType, ResponseTab } from './response-viewer/types';

export type { HttpResponse } from './response-viewer/types';

interface ResponseViewerProps {
  response: HttpResponse | null;
  isLoading: boolean;
  /** Server-Sent Events of this execution, when the response is an event stream. */
  stream?: StreamState;
}

function detectContentType(response: HttpResponse | null): ResponseContentType {
  if (!response?.headers) return 'text';
  const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('xml')) return 'xml';
  if (contentType.includes('html')) return 'html';
  return 'text';
}

function headerContentType(response: HttpResponse | null): string {
  if (!response?.headers) return '';
  return response.headers['content-type'] || response.headers['Content-Type'] || '';
}

const BINARY_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/gzip': 'gz',
};

function formatBody(body: string | undefined, contentType: ResponseContentType) {
  const started = performance.now();
  let parsedAt = started;
  if (body && contentType === 'json') {
    try {
      const parsed = JSON.parse(body);
      parsedAt = performance.now();
      const formatted = JSON.stringify(parsed, null, 2);
      return {
        body: formatted,
        parseMs: parsedAt - started,
        formatMs: performance.now() - parsedAt,
      };
    } catch {
      return { body, parseMs: performance.now() - started, formatMs: 0 };
    }
  }
  return { body: body ?? '', parseMs: 0, formatMs: 0 };
}

function formatMs(ms: number): string {
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({ response, isLoading, stream }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const contentType = useMemo(() => detectContentType(response), [response]);
  const preparation = useMemo(
    () => formatBody(response?.body, contentType),
    [response?.body, contentType]
  );
  // Raw is only different from pretty when the body was reformatted (JSON).
  const canShowRaw = Boolean(response?.body) && preparation.body !== response?.body;
  const formattedBody = showRaw && canShowRaw ? response?.body ?? '' : preparation.body;
  const canPreview = contentType === 'html';
  const bodyBytes = response?.bodyBytes;
  const binaryType = headerContentType(response).split(';')[0].trim().toLowerCase();
  const hasBody = Boolean(response?.body || bodyBytes?.length);

  // Images are shown inline; other binary bodies can only be saved.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bodyBytes || !binaryType.startsWith('image/')) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([bodyBytes as BlobPart], { type: binaryType }));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bodyBytes, binaryType]);

  const handleCopy = useCallback(async () => {
    if (!response?.body) return;

    try {
      await navigator.clipboard.writeText(formattedBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [response?.body, formattedBody]);

  const handleDownload = useCallback(() => {
    if (!hasBody) return;

    const extensionMap: Record<string, string> = { json: 'json', xml: 'xml', html: 'html' };
    const ext = bodyBytes
      ? BINARY_EXTENSIONS[binaryType] || 'bin'
      : extensionMap[contentType] || 'txt';
    const blob = bodyBytes
      ? new Blob([bodyBytes as BlobPart], { type: binaryType || 'application/octet-stream' })
      : new Blob([formattedBody], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [hasBody, bodyBytes, binaryType, formattedBody, contentType]);

  if (stream && ((isLoading && stream.status !== undefined) || (!isLoading && response?.streamEnd))) {
    return <EventStreamView stream={stream} response={isLoading ? null : response} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-b border-border">
          <span className="text-sm font-medium text-foreground">
            {t('api.responseTitle', 'Response')}
          </span>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">
              {t('api.response.sending', 'Sending request...')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-b border-border">
          <span className="text-sm font-medium text-foreground">
            {t('api.responseTitle', 'Response')}
          </span>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('api.noResponse', 'Send a request to see the response')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: ResponseTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'body', label: t('api.response.body', 'Body'), icon: Code },
    { id: 'headers', label: t('api.response.headers', 'Headers'), icon: ListTree },
  ];

  if (canPreview) {
    tabs.push({ id: 'preview', label: t('api.response.preview', 'Preview'), icon: Eye });
  }
  if (response.timings) {
    tabs.push({ id: 'timing', label: t('api.response.timing'), icon: Gauge });
  }
  const timingRows = response.timings
    ? [
        { label: t('api.response.timingPrepare'), ms: response.timings.prepareMs },
        { label: t('api.response.timingHeaders'), ms: response.timings.headersMs },
        { label: t('api.response.timingBody'), ms: response.timings.bodyReadMs },
        { label: t('api.response.timingTotal'), ms: response.timings.totalMs },
      ]
    : [];

  return (
    <div
      className="flex flex-col h-full min-h-0"
      data-api-prepare-ms={response.timings?.prepareMs}
      data-api-headers-ms={response.timings?.headersMs}
      data-api-body-read-ms={response.timings?.bodyReadMs}
      data-api-network-total-ms={response.timings?.totalMs}
      data-api-ipc-round-trip-ms={response.ipcRoundTripMs}
      data-api-parse-ms={preparation.parseMs}
      data-api-format-ms={preparation.formatMs}
    >
      <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-b border-border">
        <span className="text-sm font-medium text-foreground">
          {t('api.responseTitle', 'Response')}
        </span>

        <div className="flex items-center gap-3">
          <StatusBadge status={response.status} statusText={response.statusText} />

          {response.time > 0 && (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={t('api.response.requestTimeHint')}
            >
              <Clock className="w-3 h-3" />
              {response.time}ms
            </span>
          )}

          {response.size > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileDown className="w-3 h-3" />
              {formatBytes(response.size)}
            </span>
          )}
        </div>
      </div>

      {response.redirectNotice && (
        <div
          role="status"
          className="flex-shrink-0 flex items-start gap-2 px-4 py-2 border-b border-border bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400"
        >
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>{t(`api.response.${response.redirectNotice}`)}</span>
        </div>
      )}

      <div className="flex-shrink-0 flex items-center justify-between px-2 border-b border-border bg-secondary/30">
        <div className="flex items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === 'headers' && (
                  <span className="ml-1 px-1 py-0.5 text-[10px] bg-secondary rounded">
                    {Object.keys(response.headers).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'body' && hasBody && (
          <div className="flex items-center gap-1">
            {canShowRaw && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRaw((current) => !current)}
                aria-pressed={showRaw}
                className={cn('h-7 text-xs', showRaw && 'text-primary')}
              >
                {t('api.response.raw')}
              </Button>
            )}
            {!bodyBytes && (
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs">
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-green-500" />
                    {t('api.copied', 'Copied!')}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    {t('api.copy', 'Copy')}
                  </>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleDownload} className="h-7 text-xs">
              <Download className="w-3.5 h-3.5 mr-1" />
              {t('api.download', 'Save')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'body' && (
          <div className="flex-1 min-h-0 p-2">
            {imageUrl ? (
              <div className="h-full overflow-auto flex items-center justify-center">
                <img src={imageUrl} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            ) : bodyBytes?.length ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <p className="text-sm text-muted-foreground">
                  {t('api.response.binaryBody', { type: binaryType || 'application/octet-stream' })}
                </p>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  {t('api.download')}
                </Button>
              </div>
            ) : response.body ? (
              <CodeViewer content={formattedBody} language={contentType} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">
                  {t('api.response.emptyBody', 'Response body is empty')}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="flex-1 min-h-0 overflow-auto">
            <HeadersTable headers={response.headers} />
          </div>
        )}

        {activeTab === 'timing' && response.timings && (
          <div className="flex-1 min-h-0 overflow-auto p-4">
            <table className="text-sm">
              <tbody>
                {timingRows.map((row, index) => (
                  <tr
                    key={row.label}
                    className={cn(index === timingRows.length - 1 && 'border-t border-border font-medium')}
                  >
                    <td className="py-1 pr-8 text-muted-foreground">{row.label}</td>
                    <td className="py-1 text-right tabular-nums text-foreground">{formatMs(row.ms)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1 pr-8 text-muted-foreground">{t('api.response.size')}</td>
                  <td className="py-1 text-right tabular-nums text-foreground">{formatBytes(response.size)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'preview' && canPreview && (
          <div className="flex-1 min-h-0">
            <HtmlPreview html={response.body} />
          </div>
        )}
      </div>
    </div>
  );
};
