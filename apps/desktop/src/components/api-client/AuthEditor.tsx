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

import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { Key, User, Lock, Hash, ArrowDownFromLine, Eye, EyeOff, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { sendErrorMessage } from './send-flow';
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
  /** Owner of an OAuth 2.0 config and its cached token; null until the request is saved. */
  oauthOwner?: OAuthOwner | null;
  /** The send config used for "Get new token" (variables, inheritance). */
  buildOAuthConfig?: () => OAuthRequestConfig;
}

type OAuthOwner = { type: 'request' | 'collection'; id: string };
type OAuthRequestConfig = Parameters<typeof window.electronAPI.apiClient.oauth.getToken>[0];

interface AuthConfig {
  // Secrets (token, password, value, clientSecret) are only set when typed or when they only
  // reference variables; a stored secret never reaches the renderer, only its has* flag.
  // Bearer
  token?: string;
  hasToken?: boolean;
  // Basic
  username?: string;
  password?: string;
  hasPassword?: boolean;
  // API Key
  key?: string;
  value?: string;
  hasValue?: boolean;
  addTo?: 'header' | 'query';
  // OAuth 2.0
  grantType?: 'client_credentials' | 'authorization_code';
  tokenUrl?: string;
  authUrl?: string;
  clientId?: string;
  clientSecret?: string;
  hasClientSecret?: boolean;
  scopes?: string;
  audience?: string;
  clientAuth?: 'basic' | 'body';
  headerPrefix?: string;
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
  { value: 'oauth2', label: 'OAuth 2.0', icon: ShieldCheck },
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
// Stored Secret Input
// ============================================

type SecretField = 'token' | 'password' | 'value' | 'clientSecret';
const storedFlag = (field: SecretField) =>
  `has${field[0].toUpperCase()}${field.slice(1)}` as 'hasToken' | 'hasPassword' | 'hasValue' | 'hasClientSecret';

/**
 * A secret stored encrypted in the main process: empty keeps it, typing replaces it,
 * removing it is an explicit action (sent as '').
 */
const StoredSecretInput: React.FC<{
  id: string;
  field: SecretField;
  config: AuthConfig;
  onChange: (config: AuthConfig) => void;
  placeholder: string;
  label?: string;
}> = ({ id, field, config, onChange, placeholder, label }) => {
  const { t } = useTranslation();
  const flag = storedFlag(field);
  const stored = Boolean(config[flag]) && config[field] === undefined;
  return (
    <div className="space-y-1 flex-1">
      <PasswordInput
        id={id}
        value={config[field] ?? ''}
        onChange={(value) => {
          const next: AuthConfig = { ...config, [field]: value };
          // With a stored secret, empty means "keep it"; otherwise '' clears the field.
          if (!value && config[flag]) delete next[field];
          onChange(next);
        }}
        placeholder={stored ? t('api.auth.oauth2.clientSecretStored') : placeholder}
        label={label}
      />
      {stored && (
        <button
          type="button"
          onClick={() => onChange({ ...config, [field]: '', [flag]: false })}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          {t('api.auth.oauth2.removeClientSecret')}
        </button>
      )}
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
        <div className="flex items-start gap-2">
          <span className="text-sm text-muted-foreground px-2 py-2">Bearer</span>
          <StoredSecretInput
            id="auth-bearer-token"
            field="token"
            config={config}
            onChange={onChange}
            placeholder={t('api.auth.bearer.tokenPlaceholder', 'Enter token or {{variable}}')}
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

      <StoredSecretInput
        id="auth-basic-password"
        field="password"
        config={config}
        onChange={onChange}
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

      <StoredSecretInput
        id="auth-apikey-value"
        field="value"
        config={config}
        onChange={onChange}
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
// OAuth 2.0 Editor
// ============================================

const inputClass = cn(
  'w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm',
  'text-foreground placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent'
);

function ChoiceButtons<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'px-3 py-1.5 text-sm rounded-md transition-colors border',
            value === option.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const OAuth2Editor: React.FC<{
  config: AuthConfig;
  onChange: (config: AuthConfig) => void;
  owner?: OAuthOwner | null;
  buildConfig?: () => OAuthRequestConfig;
}> = ({ config, onChange, owner, buildConfig }) => {
  const { t } = useTranslation();
  const grantType = config.grantType ?? 'client_credentials';
  const [status, setStatus] = useState<{ hasToken: boolean; expiresAt: number | null } | null>(null);
  const [pending, setPending] = useState(false);
  const ownerType = owner?.type;
  const ownerId = owner?.id;

  const refreshStatus = useCallback(async () => {
    if (!ownerType || !ownerId) return setStatus(null);
    setStatus(await window.electronAPI.apiClient.oauth.status({ type: ownerType, id: ownerId }));
  }, [ownerType, ownerId]);
  useEffect(() => {
    void refreshStatus().catch(() => setStatus(null));
  }, [refreshStatus]);

  const getToken = async () => {
    if (!owner || !buildConfig) return;
    setPending(true);
    try {
      const result = await window.electronAPI.apiClient.oauth.getToken(buildConfig(), owner);
      if (result.ok) toast.success(t('api.auth.oauth2.tokenReceived'));
      else toast.error(sendErrorMessage(result, t));
    } catch (error) {
      toast.error(t('api.errors.requestFailed', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setPending(false);
      void refreshStatus();
    }
  };

  const clearToken = async () => {
    if (!owner) return;
    await window.electronAPI.apiClient.oauth.clearToken(owner);
    void refreshStatus();
  };

  const field = (
    id: string,
    key: 'tokenUrl' | 'authUrl' | 'clientId' | 'scopes' | 'audience' | 'headerPrefix',
    placeholder?: string
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {t(`api.auth.oauth2.${key}`)}
      </label>
      <VariableInput
        id={id}
        type="text"
        value={config[key] || ''}
        onValueChange={(value) => onChange({ ...config, [key]: value })}
        placeholder={placeholder}
        className={cn(inputClass, config[key]?.includes('{{') && 'text-primary')}
        aria-invalid={(key === 'tokenUrl' || key === 'authUrl') && isInsecureOAuthUrl(config[key])}
      />
      {(key === 'tokenUrl' || key === 'authUrl') && isInsecureOAuthUrl(config[key]) && (
        <p role="alert" className="text-xs text-destructive">
          {t('api.auth.oauth2.insecureUrl')}
        </p>
      )}
    </div>
  );

  const expired = status?.expiresAt != null && status.expiresAt <= Date.now();

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">{t('api.auth.oauth2.grantType')}</span>
        <ChoiceButtons
          value={grantType}
          onChange={(value) => onChange({ ...config, grantType: value })}
          options={[
            { value: 'client_credentials', label: t('api.auth.oauth2.clientCredentials') },
            { value: 'authorization_code', label: t('api.auth.oauth2.authorizationCode') },
          ]}
        />
      </div>

      {grantType === 'authorization_code' && field('auth-oauth2-auth-url', 'authUrl', 'https://')}
      {field('auth-oauth2-token-url', 'tokenUrl', 'https://')}
      {field('auth-oauth2-client-id', 'clientId')}

      <StoredSecretInput
        id="auth-oauth2-client-secret"
        field="clientSecret"
        config={config}
        onChange={onChange}
        placeholder={t('api.auth.oauth2.clientSecretPlaceholder')}
        label={t('api.auth.oauth2.clientSecret')}
      />

      {field('auth-oauth2-scopes', 'scopes', t('api.auth.oauth2.scopesPlaceholder'))}
      {field('auth-oauth2-audience', 'audience', t('api.auth.oauth2.optional'))}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">{t('api.auth.oauth2.clientAuth')}</span>
        <ChoiceButtons
          value={config.clientAuth ?? 'basic'}
          onChange={(value) => onChange({ ...config, clientAuth: value })}
          options={[
            { value: 'basic', label: t('api.auth.oauth2.clientAuthBasic') },
            { value: 'body', label: t('api.auth.oauth2.clientAuthBody') },
          ]}
        />
      </div>

      {field('auth-oauth2-header-prefix', 'headerPrefix', 'Bearer')}

      {grantType === 'authorization_code' && (
        <p className="text-xs text-muted-foreground">{t('api.auth.oauth2.redirectHint')}</p>
      )}
      <p className="text-xs text-muted-foreground">{t('api.auth.oauth2.directHint')}</p>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        <span className="text-sm text-muted-foreground">
          {!owner
            ? t('api.auth.oauth2.saveFirst')
            : !status?.hasToken
              ? t('api.auth.oauth2.noToken')
              : status.expiresAt === null
                ? t('api.auth.oauth2.tokenNoExpiry')
                : t(expired ? 'api.auth.oauth2.tokenExpired' : 'api.auth.oauth2.tokenValidUntil', {
                    time: new Date(status.expiresAt).toLocaleString(),
                  })}
        </span>
        <button
          type="button"
          onClick={() => void getToken()}
          disabled={!owner || !buildConfig || pending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-primary bg-primary text-primary-foreground disabled:opacity-50"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending && grantType === 'authorization_code'
            ? t('api.auth.oauth2.waitingForBrowser')
            : t('api.auth.oauth2.getNewToken')}
        </button>
        <button
          type="button"
          onClick={() => void clearToken()}
          disabled={!owner || !status?.hasToken}
          className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {t('api.auth.oauth2.clearToken')}
        </button>
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
  oauthOwner,
  buildOAuthConfig,
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

        {authType === 'oauth2' && (
          <OAuth2Editor
            config={config}
            onChange={handleConfigChange}
            owner={oauthOwner}
            buildConfig={buildOAuthConfig}
          />
        )}

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

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/i;

/**
 * Mirrors the main process rule: OAuth URLs need https except on loopback. URLs with
 * {{variables}} are checked once resolved, on use.
 */
export function isInsecureOAuthUrl(text: string | undefined): boolean {
  if (!text || text.includes('{{')) return false;
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' && !LOOPBACK_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** Blocks saving an OAuth 2.0 config that would send secrets over plain http. */
export function hasInsecureOAuthUrl(authType: RequestAuthType, authConfig: string): boolean {
  if (authType !== 'oauth2') return false;
  const config = parseAuthConfig(authConfig);
  return (
    isInsecureOAuthUrl(config.tokenUrl) ||
    (config.grantType === 'authorization_code' && isInsecureOAuthUrl(config.authUrl))
  );
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
