/**
 * Request URL Bar (v1.18.0)
 *
 * Main input bar for API requests:
 * - Method selector (dropdown)
 * - URL input field
 * - "Via Network" dropdown (direct or SSH tunnel)
 * - Send button
 */

import React, { useState } from 'react';
import { Send, ChevronDown, Wifi, Server } from 'lucide-react';
import { Button, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { HttpMethod, HostsTable } from '@ownshell/core';

// ============================================
// Method Colors
// ============================================

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-blue-500',
  POST: 'text-amber-500',
  PUT: 'text-orange-500',
  PATCH: 'text-purple-500',
  DELETE: 'text-red-500',
  HEAD: 'text-muted-foreground',
  OPTIONS: 'text-muted-foreground',
};

const methodBgColors: Record<HttpMethod, string> = {
  GET: 'bg-blue-500',
  POST: 'bg-amber-500',
  PUT: 'bg-orange-500',
  PATCH: 'bg-purple-500',
  DELETE: 'bg-red-500',
  HEAD: 'bg-muted',
  OPTIONS: 'bg-muted',
};

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// ============================================
// Props
// ============================================

interface RequestUrlBarProps {
  method: HttpMethod;
  url: string;
  networkHostId: string | null;
  hosts: HostsTable[];
  isLoading?: boolean;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onNetworkHostChange: (hostId: string | null) => void;
  onSend: () => void;
}

export const RequestUrlBar: React.FC<RequestUrlBarProps> = ({
  method,
  url,
  networkHostId,
  hosts,
  isLoading = false,
  onMethodChange,
  onUrlChange,
  onNetworkHostChange,
  onSend,
}) => {
  const { t } = useTranslation();
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

  // Get selected host name
  const selectedHost = hosts.find((h) => h.id === networkHostId);
  const networkLabel = selectedHost ? selectedHost.label : t('api.direct', 'Direct');

  // Handle Enter key to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-background border-b border-border">
      {/* Method Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowMethodDropdown(!showMethodDropdown)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-secondary font-bold text-sm transition-colors hover:bg-accent',
            methodColors[method]
          )}
        >
          {method}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>

        {showMethodDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMethodDropdown(false)}
              onKeyDown={(e) => e.key === 'Escape' && setShowMethodDropdown(false)}
            />
            <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[100px]">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onMethodChange(m);
                    setShowMethodDropdown(false);
                  }}
                  className={cn(
                    'w-full px-3 py-1.5 text-sm font-bold text-left hover:bg-primary/10 transition-colors',
                    methodColors[m],
                    method === m && 'bg-primary/20'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* URL Input */}
      <div className="flex-1 relative">
        <input
          type="text"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t(
            'api.urlPlaceholder',
            'Enter request URL (e.g., https://api.example.com/users)'
          )}
          className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* Via Network Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-secondary text-sm transition-colors hover:bg-accent',
            networkHostId ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {networkHostId ? <Server className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
          <span className="max-w-[100px] truncate">{networkLabel}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>

        {showNetworkDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowNetworkDropdown(false)}
              onKeyDown={(e) => e.key === 'Escape' && setShowNetworkDropdown(false)}
            />
            <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[180px]">
              {/* Direct option */}
              <button
                type="button"
                onClick={() => {
                  onNetworkHostChange(null);
                  setShowNetworkDropdown(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary/10 transition-colors',
                  !networkHostId && 'bg-primary/20'
                )}
              >
                <Wifi className="w-4 h-4 text-muted-foreground" />
                {t('api.direct', 'Direct')}
              </button>

              {/* Divider */}
              {hosts.length > 0 && <div className="my-1 border-t border-border" />}

              {/* SSH Hosts */}
              {hosts.map((host) => (
                <button
                  key={host.id}
                  type="button"
                  onClick={() => {
                    onNetworkHostChange(host.id);
                    setShowNetworkDropdown(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary/10 transition-colors',
                    networkHostId === host.id && 'bg-primary/20'
                  )}
                >
                  <Server className="w-4 h-4 text-primary" />
                  <span className="truncate">{host.label}</span>
                </button>
              ))}

              {hosts.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {t('api.noHosts', 'No SSH hosts configured')}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Send Button */}
      <Button
        variant="primary"
        onClick={onSend}
        disabled={isLoading || !url.trim()}
        className={cn('px-4', methodBgColors[method])}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            {t('api.send', 'Send')}
          </>
        )}
      </Button>
    </div>
  );
};
