import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Circle, Play, Square, X } from 'lucide-react';
import { Button, Modal, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import type { RunRequestResult, RunSummary } from '../../../../electron/http/collection-runner';
import { sendErrorMessage } from '../send-flow';

interface RunnerDialogProps {
  collectionId: string;
  name: string;
  onClose: () => void;
}

/** Runs the saved requests of a folder in order; results live only in this dialog. */
export const RunnerDialog: React.FC<RunnerDialogProps> = ({ collectionId, name, onClose }) => {
  const { t } = useTranslation();
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [results, setResults] = useState<RunRequestResult[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const runIdRef = useRef<string | null>(null);
  const running = runId !== null;

  useEffect(
    () =>
      window.electronAPI.apiClient.runner.onProgress(({ runId: id, result }) => {
        if (id === runIdRef.current) setResults((current) => [...current, result]);
      }),
    []
  );
  // Closing the dialog stops a running run.
  useEffect(
    () => () => {
      if (runIdRef.current) void window.electronAPI.apiClient.requests.cancel(runIdRef.current).catch(() => undefined);
    },
    []
  );

  const start = async () => {
    const id = crypto.randomUUID();
    runIdRef.current = id;
    setRunId(id);
    setResults([]);
    setSummary(null);
    try {
      const done = await window.electronAPI.apiClient.runner.run(id, collectionId, stopOnFailure);
      if (runIdRef.current === id) {
        setResults(done.results);
        setSummary(done);
      }
    } catch (error) {
      toast.error(t('api.runner.failed', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      if (runIdRef.current === id) {
        runIdRef.current = null;
        setRunId(null);
      }
    }
  };

  const cancel = () => {
    if (runId) void window.electronAPI.apiClient.requests.cancel(runId).catch(() => undefined);
  };

  const ran = results.filter((result) => !result.skipped);
  const failed = ran.filter((result) => !result.passed).length;
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('api.runner.title', { name })}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          {running ? (
            <Button type="button" variant="secondary" onClick={cancel}>
              <Square className="w-4 h-4 mr-2" />
              {t('api.cancelRequest')}
            </Button>
          ) : (
            <Button type="button" onClick={() => void start()}>
              <Play className="w-4 h-4 mr-2" />
              {t('api.runner.run')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stopOnFailure}
            disabled={running}
            onChange={(event) => setStopOnFailure(event.target.checked)}
          />
          {t('api.runner.stopOnFailure')}
        </label>
        <div className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {running
            ? t('api.runner.running', { count: results.length })
            : summary &&
              t('api.runner.summary', {
                passed: ran.length - failed,
                failed,
                total: ran.length,
                ms: summary.totalMs,
              })}
          {summary?.cancelled && ` · ${t('api.runner.cancelled')}`}
          {summary?.truncated && ` · ${t('api.runner.truncated')}`}
        </div>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{t('api.runner.hint')}</p>

      <div className="h-[420px] overflow-auto rounded-md border border-border">
        {results.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{running ? t('common.loading') : t('api.runner.empty')}</p>
        ) : (
          results.map((result, index) => {
            const open = expanded.has(`${index}`);
            return (
              <div key={`${result.requestId}-${index}`} className="border-b border-border/60 text-sm">
                <button
                  type="button"
                  onClick={() => toggle(`${index}`)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/40"
                >
                  <ChevronRight className={cn('w-3.5 h-3.5 flex-shrink-0 transition-transform', open && 'rotate-90')} />
                  {result.skipped ? (
                    <Circle className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  ) : result.passed ? (
                    <Check className="w-4 h-4 flex-shrink-0 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 flex-shrink-0 text-destructive" />
                  )}
                  <span className="w-16 flex-shrink-0 font-mono text-xs font-bold">{result.method}</span>
                  <span className="flex-1 truncate">{result.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {result.skipped
                      ? t('api.runner.skippedWebSocket')
                      : result.status
                        ? `${result.status} · ${result.time} ms`
                        : t('api.runner.noResponse')}
                  </span>
                </button>
                {open && (
                  <div className="px-10 pb-2 text-xs space-y-1">
                    {result.errorCode && <p className="text-destructive">{sendErrorMessage(result, t)}</p>}
                    {!result.errorCode && result.errorMessage && <p className="text-destructive">{result.errorMessage}</p>}
                    {result.assertions.length === 0 && !result.skipped && !result.errorCode && (
                      <p className="text-muted-foreground">{t('api.runner.noAssertions')}</p>
                    )}
                    {result.assertions.map((assertion) => (
                      <p key={assertion.id} className="flex gap-2">
                        {assertion.passed ? (
                          <Check className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
                        ) : (
                          <X className="w-3.5 h-3.5 flex-shrink-0 text-destructive" />
                        )}
                        <span>
                          {t(`api.tests.types.${assertion.type}`)}
                          {assertion.target && <span className="font-mono"> {assertion.target}</span>}
                          {assertion.expected && <span className="font-mono"> {assertion.expected}</span>}
                          {!assertion.passed && assertion.actual !== undefined && (
                            <span className="text-muted-foreground"> · {t('api.runner.actual', { value: assertion.actual })}</span>
                          )}
                        </span>
                      </p>
                    ))}
                    {result.captured.length > 0 && (
                      <p className="text-muted-foreground">{t('api.runner.captured', { names: result.captured.join(', ') })}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
};
