/**
 * S3 Connection Picker
 *
 * Displays a list of configured S3 connections for the user to select from.
 */

import React from 'react';
import { Cloud, RefreshCw, ChevronRight } from 'lucide-react';
import { Button, LoadingState, SectionHeader } from '@ownshell/ui';
import { S3ConnectionsTable } from '@ownshell/core';
import { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface S3ConnectionPickerProps {
  connectionsQuery: UseQueryResult<S3ConnectionsTable[]>;
  onSelectConnection: (connectionId: string) => void;
}

export const S3ConnectionPicker: React.FC<S3ConnectionPickerProps> = ({
  connectionsQuery,
  onSelectConnection,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t('s3.title')}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => connectionsQuery.refetch()}
          disabled={connectionsQuery.isFetching}
          className="no-drag"
        >
          <RefreshCw
            className={`w-4 h-4 ${connectionsQuery.isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {/* Connection List */}
      <div className="flex-1 overflow-auto p-4">
        <SectionHeader>{t('s3.selectConnection')}</SectionHeader>

        {connectionsQuery.isLoading ? (
          <LoadingState className="py-12 h-auto" />
        ) : !connectionsQuery.data || connectionsQuery.data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Cloud className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('s3.noConnections')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('s3.addConnectionHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {connectionsQuery.data.map((connection) => (
              <button
                key={connection.id}
                type="button"
                onClick={() => onSelectConnection(connection.id)}
                className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-secondary border border-border rounded-lg transition-colors text-left"
              >
                <Cloud className="w-5 h-5 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">
                    {connection.label}
                  </p>
                  <p className="text-xs text-muted-foreground/60 truncate">
                    {connection.endpoint}
                  </p>
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
