/**
 * Auth Editor (v1.18.0)
 *
 * Authentication configuration editor:
 * - No Auth: No authentication
 * - Bearer Token: Bearer token authentication
 * - Basic Auth: Username/password authentication
 * - API Key: Custom header or query parameter
 * - Inherit: Inherit from collection
 */

import React, { useMemo, useCallback } from 'react';
import { Key, User, Lock, Hash, ArrowDownFromLine, Eye, EyeOff } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { VariableInput } from './variables/VariableInput';
import { RequestAuthType } from '@ownshell/core';

// ============================================
// Types
// ============================================

interface AuthEditorProps {
  authType: RequestAuthType;
  authConfig: string;
  onAuthTypeChange: (type: RequestAuthType) => void;
  onAuthConfigChange: (config: string) => void;
  /** Collection/folder-level auth: "inherit" means the parent folder's auth */
  isCollection?: boolean;
}

interface AuthConfig {
  // Bearer
  token?: string;
  // Basic
  username?: string;
  password?: string;
  // API Key
  key?: string;
  value?: string;
  addTo?: 'header' | 'query';
}

// ============================================
// Auth Type Selector
// ============================================

const AUTH_TYPES: Array<{
  value: RequestAuthType;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { value: 'none', label: 'No Auth', icon: Lock },
  { value: 'bearer', label: 'Bearer Token', icon: Key },
  { value: 'basic', label: 'Basic Auth', icon: User },
  { value: 'api-key', label: 'API Key', icon: Hash },
  { value: 'inherit', label: 'Inherit', icon: ArrowDownFromLine },
];

const AuthTypeSelector: React.FC<{
  value: RequestAuthType;
  onChange: (type: RequestAuthType) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1 p-4 border-b border-border bg-secondary/50">
      <span className="text-xs text-muted-foreground mb-2">
        {t('api.auth.type', 'Authentication Type')}
      </span>
      <div className="flex flex-wrap gap-2">
        {AUTH_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => onChange(type.value)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                value === type.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon className="w-4 h-4" />
              {t(`api.auth.types.${type.value}`, type.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// Password Input with Toggle
// ============================================

const PasswordInput: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}> = ({ id, value, onChange, placeholder, label }) => {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        <VariableInput
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          className={cn(
            'w-full px-3 py-2 pr-10 bg-secondary border border-border rounded-md text-sm',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent'
          )}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

// ============================================
// Bearer Token Editor
// ============================================

const BearerTokenEditor: React.FC<{
  config: AuthConfig;
  onChange: (config: AuthConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-bearer-token" className="text-xs text-muted-foreground">
          {t('api.auth.bearer.token', 'Token')}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground px-2">Bearer</span>
          <VariableInput
            id="auth-bearer-token"
            type="text"
            value={config.token || ''}
            onValueChange={(token) => onChange({ ...config, token })}
            placeholder={t('api.auth.bearer.tokenPlaceholder', 'Enter token or {{variable}}')}
            className={cn(
              'flex-1 px-3 py-2 bg-secondary border border-border rounded-md text-sm',
              'text-foreground placeholder:text-muted-foreground font-mono',
              'focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent',
              config.token?.includes('{{') && 'text-primary'
            )}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('api.auth.bearer.hint', 'The token will be sent as: Authorization: Bearer <token>')}
      </p>
    </div>
  );
};

// ============================================
// Basic Auth Editor
// ============================================

const BasicAuthEditor: React.FC<{
  config: AuthConfig;
  onChange: (config: AuthConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-basic-username" className="text-xs text-muted-foreground">
          {t('api.auth.basic.username', 'Username')}
        </label>
        <VariableInput
          id="auth-basic-username"
          type="text"
          value={config.username || ''}
          onValueChange={(username) => onChange({ ...config, username })}
          placeholder={t('api.auth.basic.usernamePlaceholder', 'Enter username or {{variable}}')}
          className={cn(
            'w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent',
            config.username?.includes('{{') && 'text-primary'
          )}
        />
      </div>

      <PasswordInput
        id="auth-basic-password"
        value={config.password || ''}
        onChange={(password) => onChange({ ...config, password })}
        placeholder={t('api.auth.basic.passwordPlaceholder', 'Enter password or {{variable}}')}
        label={t('api.auth.basic.password', 'Password')}
      />

      <p className="text-xs text-muted-foreground">
        {t(
          'api.auth.basic.hint',
          'The credentials will be Base64 encoded and sent as: Authorization: Basic <credentials>'
        )}
      </p>
    </div>
  );
};

// ============================================
// API Key Editor
// ============================================

const ApiKeyEditor: React.FC<{
  config: AuthConfig;
  onChange: (config: AuthConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-apikey-name" className="text-xs text-muted-foreground">
          {t('api.auth.apiKey.key', 'Key Name')}
        </label>
        <VariableInput
          id="auth-apikey-name"
          type="text"
          value={config.key || ''}
          onValueChange={(key) => onChange({ ...config, key })}
          placeholder={t('api.auth.apiKey.keyPlaceholder', 'e.g., X-API-Key, api_key')}
          className={cn(
            'w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent'
          )}
        />
      </div>

      <PasswordInput
        id="auth-apikey-value"
        value={config.value || ''}
        onChange={(value) => onChange({ ...config, value })}
        placeholder={t('api.auth.apiKey.valuePlaceholder', 'Enter API key or {{variable}}')}
        label={t('api.auth.apiKey.value', 'Value')}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">
          {t('api.auth.apiKey.addTo', 'Add to')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...config, addTo: 'header' })}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors border',
              config.addTo === 'header' || !config.addTo
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            )}
          >
            {t('api.auth.apiKey.header', 'Header')}
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...config, addTo: 'query' })}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors border',
              config.addTo === 'query'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            )}
          >
            {t('api.auth.apiKey.query', 'Query Param')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export const AuthEditor: React.FC<AuthEditorProps> = ({
  authType,
  authConfig,
  onAuthTypeChange,
  onAuthConfigChange,
  isCollection = false,
}) => {
  const { t } = useTranslation();

  // Parse config
  const config = useMemo<AuthConfig>(() => {
    try {
      return JSON.parse(authConfig) as AuthConfig;
    } catch {
      return {};
    }
  }, [authConfig]);

  // Update config
  const handleConfigChange = useCallback(
    (newConfig: AuthConfig) => {
      onAuthConfigChange(JSON.stringify(newConfig));
    },
    [onAuthConfigChange]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Auth Type Selector */}
      <AuthTypeSelector value={authType} onChange={onAuthTypeChange} />

      {/* Auth Config Editor */}
      <div className="flex-1 min-h-0 overflow-auto">
        {authType === 'none' && (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {t('api.auth.noAuth', 'This request does not use any authorization')}
              </p>
            </div>
          </div>
        )}

        {authType === 'bearer' && (
          <BearerTokenEditor config={config} onChange={handleConfigChange} />
        )}

        {authType === 'basic' && <BasicAuthEditor config={config} onChange={handleConfigChange} />}

        {authType === 'api-key' && <ApiKeyEditor config={config} onChange={handleConfigChange} />}

        {authType === 'inherit' && (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <ArrowDownFromLine className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {t(isCollection ? 'api.auth.inheritCollection' : 'api.auth.inherit')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Utility Functions
// ============================================

/**
 * Parse auth config JSON string
 */
export function parseAuthConfig(json: string): AuthConfig {
  try {
    return JSON.parse(json) as AuthConfig;
  } catch {
    return {};
  }
}

/**
 * Serialize auth config to JSON string
 */
export function serializeAuthConfig(config: AuthConfig): string {
  return JSON.stringify(config);
}

/**
 * Generate authorization header value from auth config
 */
export function generateAuthHeader(
  authType: RequestAuthType,
  config: AuthConfig
): { header?: string; value?: string; queryParam?: { key: string; value: string } } {
  switch (authType) {
    case 'bearer':
      if (config.token) {
        return { header: 'Authorization', value: `Bearer ${config.token}` };
      }
      break;

    case 'basic':
      if (config.username || config.password) {
        const credentials = btoa(`${config.username || ''}:${config.password || ''}`);
        return { header: 'Authorization', value: `Basic ${credentials}` };
      }
      break;

    case 'api-key':
      if (config.key && config.value) {
        if (config.addTo === 'query') {
          return { queryParam: { key: config.key, value: config.value } };
        }
        return { header: config.key, value: config.value };
      }
      break;
  }

  return {};
}
