/**
 * API Client View (v1.18.0)
 *
 * Main view for the API Client feature:
 * - Split layout (horizontal/vertical toggle)
 * - Environment selector in header
 * - Request editor panel with Params/Auth/Headers/Body tabs
 * - Response viewer panel with syntax highlighting
 */

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { Columns, Rows, Globe, ChevronDown, FileJson } from 'lucide-react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import {
  VaultEnvironmentsTable,
  HttpMethod,
  RequestBodyType,
  RequestAuthType,
} from '@ownshell/core';

import { useApiStore } from '../../stores/useApiStore';
import { useHostStore } from '../../stores/useHostStore';
import { useApiRequest, useUpdateApiRequest } from '../../hooks/api/useApiQueries';
import { useVaultEnvironments } from '../../hooks/vault/useVaultQueries';

import { RequestUrlBar } from './RequestUrlBar';
import { RequestTabs, RequestTab } from './RequestTabs';
import {
  KeyValueEditor,
  KeyValueItem,
  parseKeyValueItems,
  serializeKeyValueItems,
} from './KeyValueEditor';
import { BodyEditor } from './BodyEditor';
import type { BodyEditorMemory, BodyValue } from './body-editor/types';
import { hasBodyContent } from './body-editor/utils';
import { AuthEditor } from './AuthEditor';
import { ResponseViewer, HttpResponse } from './ResponseViewer';

// ============================================
// Types
// ============================================

type LayoutMode = 'horizontal' | 'vertical';

interface RequestDraft {
  method: HttpMethod;
  url: string;
  networkHostId: string | null;
  environmentId: string | null;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  body: BodyValue;
  bodyType: RequestBodyType;
  authType: RequestAuthType;
  authConfig: string;
  activeTab: RequestTab;
  editorMemory: BodyEditorMemory;
}

interface RequestExecution {
  generation: number;
  loading: boolean;
  response: HttpResponse | null;
}

// ============================================
// Main Component
// ============================================

export const ApiClientView: React.FC = () => {
  const { t } = useTranslation();
  const { hosts, loadHosts } = useHostStore();
  const { selectedRequestId } = useApiStore();
  const { data: selectedRequest } = useApiRequest(selectedRequestId);
  const { data: environments = [] } = useVaultEnvironments();
  const updateRequestMutation = useUpdateApiRequest();

  // Layout state
  const [layout, setLayout] = useState<LayoutMode>('horizontal');

  // Request editor state (local draft)
  const [draftMethod, setDraftMethod] = useState<HttpMethod>(selectedRequest?.method ?? 'GET');
  const [draftUrl, setDraftUrl] = useState(selectedRequest?.url ?? '');
  const [draftNetworkHostId, setDraftNetworkHostId] = useState<string | null>(
    selectedRequest?.network_host_id ?? null
  );
  const [draftEnvironmentId, setDraftEnvironmentId] = useState<string | null>(
    selectedRequest?.environment_id ?? null
  );
  const [draftParams, setDraftParams] = useState<KeyValueItem[]>([]);
  const [draftHeaders, setDraftHeaders] = useState<KeyValueItem[]>([]);
  const [draftBody, setDraftBody] = useState<BodyValue>('');
  const [draftBodyType, setDraftBodyType] = useState<RequestBodyType>('none');
  const [draftAuthType, setDraftAuthType] = useState<RequestAuthType>('none');
  const [draftAuthConfig, setDraftAuthConfig] = useState('{}');

  const [activeTab, setActiveTab] = useState<RequestTab>('params');
  const [editorMemory, setEditorMemory] = useState<BodyEditorMemory>(() => ({}));
  const [draftRequestId, setDraftRequestId] = useState<string | null>(null);
  const draftsRef = useRef<Map<string, RequestDraft> | null>(null);
  const drafts = draftsRef.current ??= new Map<string, RequestDraft>();
  const currentDraft = useMemo<RequestDraft>(() => ({
    method: draftMethod,
    url: draftUrl,
    networkHostId: draftNetworkHostId,
    environmentId: draftEnvironmentId,
    params: draftParams,
    headers: draftHeaders,
    body: draftBody,
    bodyType: draftBodyType,
    authType: draftAuthType,
    authConfig: draftAuthConfig,
    activeTab,
    editorMemory,
  }), [
    draftMethod, draftUrl, draftNetworkHostId, draftEnvironmentId, draftParams,
    draftHeaders, draftBody, draftBodyType, draftAuthType, draftAuthConfig, activeTab, editorMemory,
  ]);

  // Environment dropdown
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);

  // Responses and pending execution belong to the request that issued them.
  const [executions, setExecutions] = useState<Record<string, RequestExecution>>({});
  const executionSequence = useRef(0);
  const execution = selectedRequestId ? executions[selectedRequestId] : undefined;
  const isLoading = execution?.loading ?? false;
  const response = execution?.response ?? null;

  // Load hosts on mount
  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  // Query refreshes must not replace a newer local draft after Save/Send.
  useLayoutEffect(() => {
    if (draftRequestId === selectedRequestId) return;
    if (draftRequestId) drafts.set(draftRequestId, currentDraft);
    if (!selectedRequestId) {
      setDraftRequestId(null);
      return;
    }
    const draft = drafts.get(selectedRequestId) ?? (
      selectedRequest?.id === selectedRequestId ? {
        method: selectedRequest.method,
        url: selectedRequest.url,
        networkHostId: selectedRequest.network_host_id,
        environmentId: selectedRequest.environment_id,
        params: parseKeyValueItems(selectedRequest.params),
        headers: parseKeyValueItems(selectedRequest.headers),
        body: selectedRequest.body,
        bodyType: selectedRequest.body_type,
        authType: selectedRequest.auth_type,
        authConfig: selectedRequest.auth_config,
        activeTab: 'params' as RequestTab,
        editorMemory: {},
      } : undefined
    );
    if (!draft) return;
    setDraftMethod(draft.method);
    setDraftUrl(draft.url);
    setDraftNetworkHostId(draft.networkHostId);
    setDraftEnvironmentId(draft.environmentId);
    setDraftParams(draft.params);
    setDraftHeaders(draft.headers);
    setDraftBody(draft.body);
    setDraftBodyType(draft.bodyType);
    setDraftAuthType(draft.authType);
    setDraftAuthConfig(draft.authConfig);
    setActiveTab(draft.activeTab);
    setEditorMemory(draft.editorMemory);
    setDraftRequestId(selectedRequestId);
  }, [selectedRequestId, selectedRequest, draftRequestId, currentDraft, drafts]);

  // Filter SSH hosts (not SFTP-only)
  const sshHosts = useMemo(() => hosts.filter((h) => h.connection_type !== 'sftp_only'), [hosts]);

  // Get selected environment name
  const selectedEnv = environments.find((e) => e.id === draftEnvironmentId);
  const envLabel = selectedEnv
    ? `${selectedEnv.project} / ${selectedEnv.name}`
    : t('api.noEnvironment', 'No Environment');

  // Count enabled items for tabs
  const paramCount = useMemo(
    () => draftParams.filter((p) => p.enabled && p.key.trim()).length,
    [draftParams]
  );

  const headerCount = useMemo(
    () => draftHeaders.filter((h) => h.enabled && h.key.trim()).length,
    [draftHeaders]
  );

  const hasBody = draftBodyType !== 'none' && hasBodyContent(draftBody);
  const hasAuth = draftAuthType !== 'none';

  // Save request to database
  const handleSave = useCallback(async () => {
    const body = draftBody.toString();
    if (!selectedRequestId) return body;

    try {
      await updateRequestMutation.mutateAsync({
        id: selectedRequestId,
        data: {
          method: draftMethod,
          url: draftUrl,
          network_host_id: draftNetworkHostId,
          environment_id: draftEnvironmentId,
          params: serializeKeyValueItems(draftParams),
          headers: serializeKeyValueItems(draftHeaders),
          body,
          body_type: draftBodyType,
          auth_type: draftAuthType,
          auth_config: draftAuthConfig,
        },
      });
    } catch (error) {
      console.error('Failed to save request:', error);
    }
    return body;
  }, [
    selectedRequestId,
    draftMethod,
    draftUrl,
    draftNetworkHostId,
    draftEnvironmentId,
    draftParams,
    draftHeaders,
    draftBody,
    draftBodyType,
    draftAuthType,
    draftAuthConfig,
    updateRequestMutation,
  ]);

  // Send HTTP request
  const handleSend = useCallback(async () => {
    if (!selectedRequestId || !draftUrl.trim()) return;
    const requestId = selectedRequestId;
    const generation = ++executionSequence.current;
    setExecutions(current => ({
      ...current,
      [requestId]: { generation, loading: true, response: null },
    }));
    const publish = (response: HttpResponse) => {
      setExecutions(current => {
        const execution = current[requestId];
        if (!execution || execution.generation !== generation) return current;
        return { ...current, [requestId]: { ...execution, response } };
      });
    };

    try {
      const body = await handleSave();
      // Execute request - vault variables are decrypted automatically in backend via environmentId
      const ipcStarted = performance.now();
      const result = await window.electronAPI.apiClient.requests.execute({
        method: draftMethod,
        url: draftUrl,
        params: serializeKeyValueItems(draftParams),
        headers: serializeKeyValueItems(draftHeaders),
        body,
        bodyType: draftBodyType,
        authType: draftAuthType,
        authConfig: draftAuthConfig,
        networkHostId: draftNetworkHostId,
        environmentId: draftEnvironmentId,
      });

      publish({ ...result, ipcRoundTripMs: performance.now() - ipcStarted } as HttpResponse);

      // Update last_executed_at
      if (selectedRequestId) {
        await updateRequestMutation.mutateAsync({
          id: selectedRequestId,
          data: {
            last_executed_at: Date.now(),
          },
        });
      }
    } catch (error) {
      console.error('Request failed:', error);
      publish({
        status: 0,
        statusText: 'Error',
        headers: {},
        body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        time: 0,
        size: 0,
      });
    } finally {
      setExecutions(current => {
        const execution = current[requestId];
        if (!execution || execution.generation !== generation) return current;
        return { ...current, [requestId]: { ...execution, loading: false } };
      });
    }
  }, [
    draftUrl,
    draftMethod,
    draftParams,
    draftHeaders,
    draftBody,
    draftBodyType,
    draftAuthType,
    draftAuthConfig,
    draftNetworkHostId,
    draftEnvironmentId,
    selectedRequestId,
    handleSave,
    updateRequestMutation,
  ]);

  if (selectedRequestId && draftRequestId !== selectedRequestId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" role="status" aria-label={t('common.loading', 'Loading...')} />
      </div>
    );
  }

  // No request selected state
  if (!selectedRequestId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
            <FileJson className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            {t('api.selectRequest', 'Select a Request')}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t(
              'api.selectRequestHint',
              'Choose a request from the sidebar or create a new one to get started.'
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-background">
        {/* Left: Request Name */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-foreground truncate max-w-[300px]">
            {selectedRequest?.name ?? 'Untitled Request'}
          </h2>
        </div>

        {/* Right: Environment + Layout Toggle */}
        <div className="flex items-center gap-2">
          {/* Environment Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEnvDropdown(!showEnvDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-secondary text-sm hover:bg-accent transition-colors"
            >
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{envLabel}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>

            {showEnvDropdown && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setShowEnvDropdown(false)}
                  onKeyDown={(e) => e.key === 'Escape' && setShowEnvDropdown(false)}
                  tabIndex={-1}
                  aria-label="Close dropdown"
                />
                <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                  {/* No Environment */}
                  <button
                    type="button"
                    onClick={() => {
                      setDraftEnvironmentId(null);
                      setShowEnvDropdown(false);
                    }}
                    className={cn(
                      'w-full px-3 py-1.5 text-sm text-left hover:bg-primary/10 transition-colors',
                      !draftEnvironmentId && 'bg-primary/20'
                    )}
                  >
                    {t('api.noEnvironment', 'No Environment')}
                  </button>

                  {environments.length > 0 && <div className="my-1 border-t border-border" />}

                  {/* Group by project */}
                  {Object.entries(
                    environments.reduce(
                      (acc, env) => {
                        if (!acc[env.project]) acc[env.project] = [];
                        acc[env.project].push(env);
                        return acc;
                      },
                      {} as Record<string, VaultEnvironmentsTable[]>
                    )
                  ).map(([project, envs]) => (
                    <div key={project}>
                      <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {project}
                      </div>
                      {envs.map((env) => (
                        <button
                          key={env.id}
                          type="button"
                          onClick={() => {
                            setDraftEnvironmentId(env.id);
                            setShowEnvDropdown(false);
                          }}
                          className={cn(
                            'w-full px-3 py-1.5 text-sm text-left hover:bg-primary/10 transition-colors',
                            draftEnvironmentId === env.id && 'bg-primary/20'
                          )}
                        >
                          {env.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Layout Toggle */}
          <div className="flex items-center border border-border rounded-md">
            <button
              type="button"
              onClick={() => setLayout('horizontal')}
              className={cn(
                'p-1.5 transition-colors',
                layout === 'horizontal'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title={t('api.layoutHorizontal', 'Horizontal Layout')}
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('vertical')}
              className={cn(
                'p-1.5 transition-colors',
                layout === 'vertical'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title={t('api.layoutVertical', 'Vertical Layout')}
            >
              <Rows className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* URL Bar */}
      <RequestUrlBar
        method={draftMethod}
        url={draftUrl}
        networkHostId={draftNetworkHostId}
        hosts={sshHosts}
        isLoading={isLoading}
        onMethodChange={setDraftMethod}
        onUrlChange={setDraftUrl}
        onNetworkHostChange={setDraftNetworkHostId}
        onSend={handleSend}
      />

      {/* Split Layout: Request Editor + Response Viewer */}
      <Group
        orientation={layout === 'horizontal' ? 'horizontal' : 'vertical'}
        className="flex-1 min-h-0 h-full"
      >
        {/* Request Editor Panel */}
        <Panel defaultSize={50} minSize={20} className="flex flex-col min-h-0 bg-background">
          {/* Tabs */}
          <RequestTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            paramCount={paramCount}
            headerCount={headerCount}
            hasBody={hasBody}
            hasAuth={hasAuth}
          />

          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === 'params' && (
              <KeyValueEditor
                items={draftParams}
                onChange={setDraftParams}
                keyPlaceholder={t('api.params.key', 'Parameter')}
                valuePlaceholder={t('api.params.value', 'Value')}
              />
            )}
            {activeTab === 'auth' && (
              <AuthEditor
                authType={draftAuthType}
                authConfig={draftAuthConfig}
                onAuthTypeChange={setDraftAuthType}
                onAuthConfigChange={setDraftAuthConfig}
              />
            )}
            {activeTab === 'headers' && (
              <KeyValueEditor
                items={draftHeaders}
                onChange={setDraftHeaders}
                keyPlaceholder={t('api.headers.key', 'Header')}
                valuePlaceholder={t('api.headers.value', 'Value')}
              />
            )}
            {activeTab === 'body' && (
              <BodyEditor
                bodyType={draftBodyType}
                body={draftBody}
                memory={editorMemory}
                onBodyTypeChange={setDraftBodyType}
                onBodyChange={setDraftBody}
              />
            )}
          </div>
        </Panel>

        {/* Resize Handle */}
        <Separator
          className={
            layout === 'horizontal'
              ? 'w-1 bg-border hover:bg-primary transition-colors cursor-col-resize'
              : 'h-1 bg-border hover:bg-primary transition-colors cursor-row-resize'
          }
        />

        {/* Response Viewer Panel */}
        <Panel defaultSize={50} minSize={20} className="flex flex-col min-h-0 bg-background">
          <ResponseViewer response={response} isLoading={isLoading} />
        </Panel>
      </Group>
    </div>
  );
};
