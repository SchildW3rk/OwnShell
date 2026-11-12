/**
 * Redis Key Browser Component
 *
 * Main interface for browsing and managing Redis keys.
 * Supports pattern matching, TTL display, and type filtering.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, Input, cn } from '@ownshell/ui';
import {
  Search,
  RefreshCw,
  Trash2,
  Clock,
  Key,
  Hash,
  List,
  Layers,
  BarChart3,
  ChevronRight,
  Loader2,
  AlertCircle,
  Server,
  Database,
} from 'lucide-react';
import { RedisKeyInfo, RedisDataType } from '@ownshell/core';
import { RedisValueViewer } from './RedisValueViewer';

/** Type filter for scanKeys API (excludes stream/none which are display-only) */
type RedisScanType = 'string' | 'hash' | 'list' | 'set' | 'zset';

interface RedisKeyBrowserProps {
  connectionId: string;
  readOnly: boolean;
}

/** Type icons */
const TYPE_ICONS: Record<RedisDataType, React.ReactNode> = {
  string: <Key className="w-4 h-4 text-success" />,
  hash: <Hash className="w-4 h-4 text-primary" />,
  list: <List className="w-4 h-4 text-purple-400" />,
  set: <Layers className="w-4 h-4 text-accent" />,
  zset: <BarChart3 className="w-4 h-4 text-accent" />,
  stream: <ChevronRight className="w-4 h-4 text-cyan-400" />,
  none: <Key className="w-4 h-4 text-muted-foreground" />,
};

/** Type labels */
const TYPE_LABELS: Record<RedisDataType, string> = {
  string: 'String',
  hash: 'Hash',
  list: 'List',
  set: 'Set',
  zset: 'Sorted Set',
  stream: 'Stream',
  none: 'None',
};

/** Format TTL for display */
function formatTTL(ttl: number): string {
  if (ttl === -1) return 'No expiry';
  if (ttl === -2) return 'Expired';
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
  return `${Math.floor(ttl / 86400)}d ${Math.floor((ttl % 86400) / 3600)}h`;
}

export const RedisKeyBrowser: React.FC<RedisKeyBrowserProps> = ({ connectionId, readOnly }) => {
  const { t } = useTranslation();
  // State
  const [pattern, setPattern] = useState('*');
  const [typeFilter, setTypeFilter] = useState<RedisDataType | 'all'>('all');
  const [keys, setKeys] = useState<RedisKeyInfo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected key state
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Server stats
  const [serverStats, setServerStats] = useState<{
    keys: number;
    memoryUsed: number;
  } | null>(null);

  const patternRef = useRef(pattern);
  const typeFilterRef = useRef(typeFilter);
  patternRef.current = pattern;
  typeFilterRef.current = typeFilter;
  const submittedPatternRef = useRef('*');
  const submittedTypeRef = useRef<RedisDataType | 'all'>('all');
  const cursorRef = useRef('0');
  const scanGenerationRef = useRef(0);
  const pendingScanRef = useRef<number | null>(null);
  const statsRequestRef = useRef(0);
  const connectionRef = useRef(connectionId);
  connectionRef.current = connectionId;
  const keyListRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => keyListRef.current,
    estimateSize: () => 57,
    overscan: 20,
  });

  /**
   * Load server stats
   */
  const loadServerStats = useCallback(async () => {
    const request = ++statsRequestRef.current;
    try {
      const result = await window.electronAPI.redis.serverInfo(connectionId);
      if (request !== statsRequestRef.current || connectionId !== connectionRef.current) return;
      if (result.success && result.dbStats) {
        setServerStats({
          keys: result.dbStats.keys,
          memoryUsed: result.dbStats.memoryUsed,
        });
      }
    } catch (err) {
      console.error('Failed to load server stats:', err);
    }
  }, [connectionId]);

  /**
   * Scan keys with pattern
   */
  const scanKeys = useCallback(
    async (reset = false) => {
      if (reset) {
        scanGenerationRef.current++;
        submittedPatternRef.current = patternRef.current;
        submittedTypeRef.current = typeFilterRef.current;
        cursorRef.current = '0';
        setKeys([]);
        setHasMore(false);
        keyListRef.current?.scrollTo({ top: 0 });
      } else if (pendingScanRef.current === scanGenerationRef.current || cursorRef.current === '0') {
        return;
      }
      const generation = scanGenerationRef.current;
      pendingScanRef.current = generation;
      setIsLoading(true);
      setError(null);

      try {
        const scanCursor = cursorRef.current;
        const currentPattern = submittedPatternRef.current;
        const currentTypeFilter = submittedTypeRef.current;

        // Cast to the API type (excludes 'stream' and 'none' which are display-only)
        const apiType =
          currentTypeFilter === 'all' ||
          currentTypeFilter === 'stream' ||
          currentTypeFilter === 'none'
            ? undefined
            : (currentTypeFilter as RedisScanType);

        const result = await window.electronAPI.redis.scanKeys({
          connectionId,
          pattern: currentPattern,
          cursor: scanCursor,
          count: 100,
          type: apiType,
        });
        if (generation !== scanGenerationRef.current || connectionId !== connectionRef.current) return;

        if (result.success && result.result) {
          if (reset) {
            setKeys(result.result.keys);
          } else {
            setKeys((prev) => [...prev, ...result.result.keys]);
          }
          cursorRef.current = result.result.nextCursor;
          setHasMore(result.result.nextCursor !== '0');
        } else {
          setError(result.error || 'Failed to scan keys');
        }
      } catch (err) {
        if (generation !== scanGenerationRef.current || connectionId !== connectionRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to scan keys');
      } finally {
        if (generation === scanGenerationRef.current) {
          pendingScanRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [connectionId]
  );

  /**
   * Delete selected keys
   */
  const deleteKeys = async (keysToDelete: string[]) => {
    if (readOnly) return;
    if (keysToDelete.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${keysToDelete.length} key(s)? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.redis.deleteKeys(connectionId, keysToDelete);
      if (result.success) {
        // Remove deleted keys from list
        setKeys((prev) => prev.filter((k) => !keysToDelete.includes(k.key)));
        if (selectedKey && keysToDelete.includes(selectedKey)) {
          setSelectedKey(null);
        }
        // Refresh stats
        loadServerStats();
      }
    } catch (err) {
      console.error('Failed to delete keys:', err);
    }
  };

  // Scan/loading updates must not rebuild the retained value's collection rows.
  const handleKeyDeleted = useCallback(() => {
    setKeys((prev) => prev.filter((key) => key.key !== selectedKey));
    setSelectedKey((current) => current === selectedKey ? null : current);
    loadServerStats();
  }, [selectedKey, loadServerStats]);

  const handleKeyRenamed = useCallback((newKey: string) => {
    setKeys((prev) => prev.map((key) => key.key === selectedKey ? { ...key, key: newKey } : key));
    setSelectedKey((current) => current === selectedKey ? newKey : current);
  }, [selectedKey]);

  // Load initial data on mount or connection change
  useEffect(() => {
    setSelectedKey(null);
    loadServerStats();
    scanKeys(true);
    return () => {
      scanGenerationRef.current++;
      statsRequestRef.current++;
      pendingScanRef.current = null;
    };
  }, [loadServerStats, scanKeys]);

  // Reset and scan when pattern or filter changes
  const handleSearch = () => {
    scanKeys(true);
  };

  /**
   * Format memory size
   */
  const formatMemory = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="flex h-full">
      {/* Left Panel - Key List */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
        {/* Server Stats Header */}
        {serverStats && (
          <div className="px-3 py-2 bg-surface/50 border-b border-border flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Database className="w-3.5 h-3.5" />
              <span>{serverStats.keys.toLocaleString()} keys</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Server className="w-3.5 h-3.5" />
              <span>{formatMemory(serverStats.memoryUsed)}</span>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex gap-2">
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={t('db.redis.patternPlaceholder')}
              className="flex-1 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button variant="ghost" size="sm" onClick={handleSearch} disabled={isLoading}>
              <Search className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                loadServerStats();
                scanKeys(true);
              }}
              disabled={isLoading}
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          </div>

          {/* Type Filter */}
          <div className="flex gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={cn(
                'px-2 py-0.5 text-xs rounded transition-colors',
                typeFilter === 'all'
                  ? 'bg-primary text-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary'
              )}
            >
              {t('common.all')}
            </button>
            {(['string', 'hash', 'list', 'set', 'zset'] as RedisDataType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1',
                  typeFilter === type
                    ? 'bg-primary text-foreground'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary'
                )}
              >
                {TYPE_ICONS[type]}
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Key List */}
        <div ref={keyListRef} className="flex-1 overflow-y-auto">
          {error ? (
            <div className="flex items-center justify-center p-4 text-destructive">
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          ) : keys.length === 0 && !isLoading && !hasMore ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Key className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">{t('db.redis.noKeys')}</p>
              <p className="text-xs mt-1">{t('db.redis.tryDifferentPattern')}</p>
            </div>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => {
                const keyInfo = keys[row.index];
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setSelectedKey(keyInfo.key)}
                    className={cn(
                      'absolute top-0 left-0 w-full px-3 py-2 text-left border-b border-border/50 hover:bg-secondary/50 transition-colors',
                      selectedKey === keyInfo.key && 'bg-secondary/70'
                    )}
                    style={{ height: row.size, transform: `translateY(${row.start}px)` }}
                  >
                    <div className="flex items-center gap-2">
                      {TYPE_ICONS[keyInfo.type]}
                      <span className="flex-1 font-mono text-sm truncate text-foreground">
                        {keyInfo.key}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{TYPE_LABELS[keyInfo.type]}</span>
                      {keyInfo.ttl !== -1 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTTL(keyInfo.ttl)}
                        </span>
                      )}
                      {keyInfo.length !== undefined && <span>{keyInfo.length} items</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => scanKeys(false)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('s3.loadMore')}
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        {selectedKey && (
          <div className="p-2 border-t border-border flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/20/20"
              onClick={() => deleteKeys([selectedKey])}
              disabled={readOnly}
              title={
                readOnly
                  ? t('db.readOnlyBlocked', 'Read-only connection blocks write actions')
                  : undefined
              }
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {t('common.delete')}
            </Button>
          </div>
        )}
      </div>

      {/* Right Panel - Value Viewer */}
      <div className="flex-1 overflow-hidden">
        {selectedKey ? (
          <RedisValueViewer
            key={`${connectionId}:${selectedKey}`}
            connectionId={connectionId}
            keyName={selectedKey}
            readOnly={readOnly}
            onKeyDeleted={handleKeyDeleted}
            onKeyRenamed={handleKeyRenamed}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Key className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">{t('db.redis.selectKey')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RedisKeyBrowser;
