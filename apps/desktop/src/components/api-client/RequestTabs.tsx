/**
 * Request Tabs (v1.18.0)
 *
 * Tab navigation for request editor:
 * - Params (Query Parameters)
 * - Auth (Authentication)
 * - Headers
 * - Body
 */

import React from 'react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

// ============================================
// Types
// ============================================

export type RequestTab = 'params' | 'auth' | 'headers' | 'body' | 'variables' | 'tests' | 'settings';

interface RequestTabsProps {
  activeTab: RequestTab;
  onTabChange: (tab: RequestTab) => void;
  paramCount?: number;
  headerCount?: number;
  hasBody?: boolean;
  hasAuth?: boolean;
  variableCount?: number;
  /** TLS verification is off: the settings tab shows a warning dot. */
  settingsWarning?: boolean;
  /** WebSocket requests have no body and no runner checks. */
  kind?: 'http' | 'websocket';
  testCount?: number;
}

// ============================================
// Component
// ============================================

export const RequestTabs: React.FC<RequestTabsProps> = ({
  activeTab,
  onTabChange,
  paramCount = 0,
  headerCount = 0,
  hasBody = false,
  hasAuth = false,
  variableCount = 0,
  settingsWarning = false,
  kind = 'http',
  testCount = 0,
}) => {
  const { t } = useTranslation();

  const tabs: Array<{
    id: RequestTab;
    label: string;
    count?: number;
    indicator?: boolean;
    warning?: boolean;
  }> = [
    {
      id: 'params',
      label: t('api.tabs.params', 'Params'),
      count: paramCount,
    },
    {
      id: 'auth',
      label: t('api.tabs.auth', 'Auth'),
      indicator: hasAuth,
    },
    {
      id: 'headers',
      label: t('api.tabs.headers', 'Headers'),
      count: headerCount,
    },
    {
      id: 'body',
      label: t('api.tabs.body', 'Body'),
      indicator: hasBody,
    },
    {
      id: 'variables',
      label: t('api.tabs.variables'),
      count: variableCount,
    },
    {
      id: 'tests',
      label: t('api.tabs.tests'),
      count: testCount,
    },
    {
      id: 'settings',
      label: t('api.tabs.settings'),
      warning: settingsWarning,
    },
  ];
  const visibleTabs = kind === 'http' ? tabs : tabs.filter((tab) => tab.id !== 'body' && tab.id !== 'tests');

  return (
    <div className="flex items-center h-10 border-b border-border bg-background">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'relative px-4 h-full text-sm font-medium transition-colors',
            activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}

            {/* Count Badge */}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-secondary text-muted-foreground">
                {tab.count}
              </span>
            )}

            {/* Indicator Dot (for Auth/Body when configured) */}
            {tab.indicator && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            {tab.warning && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </span>

          {/* Active Indicator */}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
};

// ============================================
// Tab Content Components (Placeholders)
// ============================================

interface TabContentProps {
  children?: React.ReactNode;
}

export const ParamsTabContent: React.FC<TabContentProps> = ({ children }) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 p-4 overflow-auto">
      {children || (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">{t('api.params.empty', 'No query parameters')}</p>
          <p className="text-xs mt-1">
            {t('api.params.hint', 'Add key-value pairs to include in the URL')}
          </p>
        </div>
      )}
    </div>
  );
};

export const AuthTabContent: React.FC<TabContentProps> = ({ children }) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 p-4 overflow-auto">
      {children || (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">{t('api.auth.empty', 'No authentication configured')}</p>
          <p className="text-xs mt-1">
            {t('api.auth.hint', 'Select an authentication type to add credentials')}
          </p>
        </div>
      )}
    </div>
  );
};

export const HeadersTabContent: React.FC<TabContentProps> = ({ children }) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 p-4 overflow-auto">
      {children || (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">{t('api.headers.empty', 'No custom headers')}</p>
          <p className="text-xs mt-1">
            {t('api.headers.hint', 'Add key-value pairs for request headers')}
          </p>
        </div>
      )}
    </div>
  );
};

export const BodyTabContent: React.FC<TabContentProps> = ({ children }) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 p-4 overflow-auto">
      {children || (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">{t('api.body.empty', 'No request body')}</p>
          <p className="text-xs mt-1">
            {t('api.body.hint', 'Add JSON, form data, or raw content')}
          </p>
        </div>
      )}
    </div>
  );
};
