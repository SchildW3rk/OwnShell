import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Textarea } from '@ownshell/ui';
import { Loader2, Play, X } from 'lucide-react';
import {
  MAX_AGGREGATION_RESULTS,
  parseAggregationPipeline,
} from '../../../../electron/db-explorer/mongo-pipeline';
import { mongoPipelineWrites } from '../../../../electron/db-explorer/read-only-guard';

interface AggregationPanelProps {
  connectionId: string;
  collection: string;
  readOnly: boolean;
  pipelineText: string;
  onPipelineTextChange: (value: string) => void;
  onClose: () => void;
}

export const AggregationPanel: React.FC<AggregationPanelProps> = ({
  connectionId,
  collection,
  readOnly,
  pipelineText,
  onPipelineTextChange,
  onClose,
}) => {
  const { t } = useTranslation();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ items: unknown[]; truncated: boolean } | null>(null);

  const run = async () => {
    setResults(null); // never show a previous pipeline's results next to a new error
    const parsed = parseAggregationPipeline(pipelineText);
    if (!parsed.ok) {
      setError(t(`db.mongoAggregation.error.${parsed.error}`, { stage: parsed.stage }));
      return;
    }
    if (readOnly && mongoPipelineWrites(parsed.pipeline)) {
      setError(t('db.mongoAggregation.readOnlyWrite'));
      return;
    }

    setIsRunning(true);
    setError(null);
    try {
      const result = await window.electronAPI.mongodb.aggregate(
        connectionId,
        collection,
        parsed.pipeline
      );
      if (result.success) {
        setResults({ items: result.results ?? [], truncated: result.truncated === true });
      } else {
        setError(result.error || t('db.mongoAggregation.failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('db.mongoAggregation.failed'));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface/50 px-3 py-2">
        <span className="truncate text-sm font-medium text-foreground">
          {t('db.mongoAggregation.title', { collection })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 border-b border-border p-3">
        <Textarea
          value={pipelineText}
          onChange={(event) => onPipelineTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void run();
            }
          }}
          rows={8}
          spellCheck={false}
          className="font-mono text-xs"
          aria-label={t('db.mongoAggregation.pipeline')}
          placeholder='[{"$match": {"status": "active"}}, {"$group": {"_id": "$type", "n": {"$sum": 1}}}]'
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t('db.mongoAggregation.hint', { limit: MAX_AGGREGATION_RESULTS })}
          </p>
          <Button variant="primary" size="sm" onClick={run} disabled={isRunning}>
            {isRunning ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            {t('db.mongoAggregation.run')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {results && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 py-1.5 text-xs text-muted-foreground">
            {t('db.mongoAggregation.resultCount', { count: results.items.length })}
            {results.truncated && ` · ${t('db.mongoAggregation.truncated', { limit: MAX_AGGREGATION_RESULTS })}`}
          </div>
          <pre className="flex-1 overflow-auto px-3 pb-3 font-mono text-xs text-foreground">
            {JSON.stringify(results.items, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
