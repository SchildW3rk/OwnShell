/**
 * S3 Bucket List
 *
 * Displays buckets for a selected S3 connection.
 */

import React from 'react';
import { Cloud, Database, RefreshCw, ArrowLeft, ChevronRight } from 'lucide-react';
import { Button, LoadingState, SectionHeader } from '@ownshell/ui';
import { S3Bucket } from '@ownshell/core';
import { UseQueryResult } from '@tanstack/react-query';
import { formatDate } from './s3-utils';
import { useTranslation } from 'react-i18next';

interface S3BucketListProps {
  connectionLabel: string | undefined;
  bucketsQuery: UseQueryResult<S3Bucket[]>;
  onSelectBucket: (bucketName: string) => void;
  onBack: () => void;
}

export const S3BucketList: React.FC<S3BucketListProps> = ({
  connectionLabel,
  bucketsQuery,
  onSelectBucket,
  onBack,
}) => {
  const { t } = useTranslation();
  const isLoading = bucketsQuery.isFetching;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="no-drag"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Cloud className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            {connectionLabel || t('s3.title')}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => bucketsQuery.refetch()}
          disabled={isLoading}
          className="no-drag"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Bucket List */}
      <div className="flex-1 overflow-auto p-4">
        <SectionHeader>{t('s3.buckets')}</SectionHeader>

        {isLoading ? (
          <LoadingState className="py-12 h-auto" />
        ) : !bucketsQuery.data || bucketsQuery.data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('s3.noBuckets')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bucketsQuery.data.map((bucket) => (
              <button
                key={bucket.name}
                type="button"
                onClick={() => onSelectBucket(bucket.name)}
                className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-secondary border border-border rounded-lg transition-colors text-left"
              >
                <Database className="w-5 h-5 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">{bucket.name}</p>
                  {bucket.creationDate && (
                    <p className="text-xs text-muted-foreground/60">
                      {t('s3.createdAt', { date: formatDate(bucket.creationDate) })}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
