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
import { Columns, Rows, Globe, ChevronDown, FileJson, Terminal, ShieldAlert, Save, Cookie } from 'lucide-react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { ConfirmDialog, cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  VaultEnvironmentsTable,
  ApiRequestKind,
  HttpMethod,
  RawRequestContentType,
  RequestBodyType,
  RequestAuthType,
} from '@ownshell/core';

import { useApiStore } from '../../stores/useApiStore';
import { useHostStore } from '../../stores/useHostStore';
import {
  useApiCollections,
  useApiRequest,
  useGlobalApiVariables,
  useInvalidateApiHistory,
  useUpdateApiRequest,
} from '../../hooks/api/useApiQueries';
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
import { INTROSPECTION_QUERY, serializeGraphqlBody } from './body-editor/graphql-schema';
import { AuthEditor, hasInsecureOAuthUrl } from './AuthEditor';
import { CookieManagerDialog } from './CookieManagerDialog';
import { ResponseViewer, HttpResponse } from './ResponseViewer';
import { applyStreamMessage, type StreamState } from './response-viewer/stream-state';
import { RunnerChecksEditor, parseChecks } from './RunnerChecksEditor';
import { WebSocketPanel } from './WebSocketPanel';
import { appendMessage, applyWsEvent, type WsSession } from './websocket-session';
import type { Assertion, Capture } from '../../../electron/http/runner-checks';
import {
  DEFAULT_REQUEST_SETTINGS,
  RequestSettings,
  RequestSettingsEditor,
} from './RequestSettingsEditor';
import { parseCurlWithToast, showCurlImportNotices } from './sidebar/ImportCurlDialog';
import { OVERLAY_SELECTOR, SHORTCUT_LABELS, getShortcutAction } from './shortcuts';
import { createSendFlow, sendErrorMessage } from './send-flow';
import { VariableSuggestionsContext } from './variables/VariableInput';
import { BUILT_IN_NAMES, collectVariableSuggestions } from './variables/variable-suggestions';

// ============================================
// Types
// ============================================

/** Failed sends carry `{ "error": message }` as body (see the execute IPC handler). */
function getErrorMessage(response: HttpResponse): string {
  try {
    const parsed = JSON.parse(response.body) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // fall through to the status text
  }
  return response.statusText;
}

type LayoutMode = 'horizontal' | 'vertical';

interface RequestDraft {
  kind: ApiRequestKind;
  method: HttpMethod;
  url: string;
  networkHostId: string | null;
  environmentId: string | null;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  variables: KeyValueItem[];
  body: BodyValue;
  bodyType: RequestBodyType;
  rawContentType: RawRequestContentType;
  authType: RequestAuthType;
  authConfig: string;
  settings: RequestSettings;
  assertions: Assertion[];
  captures: Capture[];
  activeTab: RequestTab;
  editorMemory: BodyEditorMemory;
}

interface RequestExecution {
  generation: number;
  executionId: string;
  loading: boolean;
  response: HttpResponse | null;
}

/** Stored columns: NULL means the default, so defaults can change later without a migration. */
function settingsColumns(settings: RequestSettings) {
  return {
    timeout_seconds:
      settings.timeoutSeconds === DEFAULT_REQUEST_SETTINGS.timeoutSeconds ? null : settings.timeoutSeconds,
    follow_redirects: settings.followRedirects ? null : (0 as const),
    verify_tls: settings.verifyTls ? null : (0 as const),
    cookie_jar: settings.useCookieJar ? null : (0 as const),
  };
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
  const { data: collections = [] } = useApiCollections();
  const { data: globalVariables = [] } = useGlobalApiVariables();
  const updateRequestMutation = useUpdateApiRequest();
  const invalidateHistory = useInvalidateApiHistory();

  // Layout state
  const [layout, setLayout] = useState<LayoutMode>('horizontal');

  // Request editor state (local draft)
  const [draftKind, setDraftKind] = useState<ApiRequestKind>('http');
  const [draftAssertions, setDraftAssertions] = useState<Assertion[]>([]);
  const [draftCaptures, setDraftCaptures] = useState<Capture[]>([]);
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
  const [draftVariables, setDraftVariables] = useState<KeyValueItem[]>([]);
  const [draftBody, setDraftBody] = useState<BodyValue>('');
  const [draftBodyType, setDraftBodyType] = useState<RequestBodyType>('none');
  const [draftRawContentType, setDraftRawContentType] = useState<RawRequestContentType>('text');
  const [draftAuthType, setDraftAuthType] = useState<RequestAuthType>('none');
  const [draftAuthConfig, setDraftAuthConfig] = useState('{}');
  const [draftSettings, setDraftSettings] = useState<RequestSettings>(DEFAULT_REQUEST_SETTINGS);
  const [showCurlMenu, setShowCurlMenu] = useState(false);
  const [confirmResolvedCurl, setConfirmResolvedCurl] = useState(false);

  const [activeTab, setActiveTab] = useState<RequestTab>('params');
  const [editorMemory, setEditorMemory] = useState<BodyEditorMemory>(() => ({}));
  const [draftRequestId, setDraftRequestId] = useState<string | null>(null);
  const draftsRef = useRef<Map<string, RequestDraft> | null>(null);
  const drafts = draftsRef.current ??= new Map<string, RequestDraft>();
  const currentDraft = useMemo<RequestDraft>(() => ({
    kind: draftKind,
    method: draftMethod,
    url: draftUrl,
    networkHostId: draftNetworkHostId,
    environmentId: draftEnvironmentId,
    params: draftParams,
    headers: draftHeaders,
    variables: draftVariables,
    body: draftBody,
    bodyType: draftBodyType,
    rawContentType: draftRawContentType,
    authType: draftAuthType,
    authConfig: draftAuthConfig,
    settings: draftSettings,
    assertions: draftAssertions,
    captures: draftCaptures,
    activeTab,
    editorMemory,
  }), [
    draftKind, draftAssertions, draftCaptures, draftMethod, draftUrl, draftNetworkHostId, draftEnvironmentId, draftParams,
    draftHeaders, draftVariables, draftBody, draftBodyType, draftRawContentType, draftAuthType, draftAuthConfig,
    draftSettings, activeTab, editorMemory,
  ]);

  // Environment dropdown
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [showCookies, setShowCookies] = useState(false);

  // Responses and pending execution belong to the request that issued them.
  const [executions, setExecutions] = useState<Record<string, RequestExecution>>({});
  const executionSequence = useRef(0);
  const sendFlowRef = useRef<ReturnType<typeof createSendFlow> | null>(null);
  const sendFlow = sendFlowRef.current ??= createSendFlow();
  const execution = selectedRequestId ? executions[selectedRequestId] : undefined;
  const isLoading = execution?.loading ?? false;
  const response = execution?.response ?? null;

  // Live Server-Sent Events by execution id (bounded per stream, see applyStreamMessage).
  const [streams, setStreams] = useState<Record<string, StreamState>>({});
  useEffect(
    () =>
      window.electronAPI.apiClient.requests.onStream((message) =>
        setStreams((current) => ({ ...current, [message.executionId]: applyStreamMessage(current[message.executionId], message) }))
      ),
    []
  );
  const stream = execution ? streams[execution.executionId] : undefined;

  // WebSocket connections by request id, so switching requests keeps the connection and its log.
  const [wsSessions, setWsSessions] = useState<Record<string, WsSession>>({});
  const wsSessionsRef = useRef(wsSessions);
  wsSessionsRef.current = wsSessions;
  useEffect(() => {
    const unsubscribe = window.electronAPI.apiClient.webSocket.onEvent((event) =>
      setWsSessions((current) => {
        const entry = Object.entries(current).find(([, session]) => session.connectionId === event.connectionId);
        return entry ? { ...current, [entry[0]]: applyWsEvent(entry[1], event) } : current;
      })
    );
    return () => {
      unsubscribe();
      // Leaving the API client closes its connections.
      for (const session of Object.values(wsSessionsRef.current)) {
        if (session.state !== 'closed') void window.electronAPI.apiClient.webSocket.close(session.connectionId).catch(() => undefined);
      }
    };
  }, []);
  const wsSession = selectedRequestId ? wsSessions[selectedRequestId] : undefined;
  const wsActive = wsSession?.state === 'connecting' || wsSession?.state === 'open';
  const updateWsSession = useCallback(
    (requestId: string, connectionId: string, update: (session: WsSession) => WsSession) =>
      setWsSessions((current) => {
        const session = current[requestId];
        return session?.connectionId === connectionId ? { ...current, [requestId]: update(session) } : current;
      }),
    []
  );

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
        kind: selectedRequest.kind ?? 'http',
        method: selectedRequest.method,
        url: selectedRequest.url,
        networkHostId: selectedRequest.network_host_id,
        environmentId: selectedRequest.environment_id,
        params: parseKeyValueItems(selectedRequest.params),
        headers: parseKeyValueItems(selectedRequest.headers),
        variables: parseKeyValueItems(selectedRequest.variables ?? '[]'),
        body: selectedRequest.body,
        bodyType: selectedRequest.body_type,
        rawContentType: selectedRequest.raw_content_type ?? 'text',
        authType: selectedRequest.auth_type,
        authConfig: selectedRequest.auth_config,
        settings: {
          timeoutSeconds: selectedRequest.timeout_seconds ?? DEFAULT_REQUEST_SETTINGS.timeoutSeconds,
          followRedirects: selectedRequest.follow_redirects !== 0,
          verifyTls: selectedRequest.verify_tls !== 0,
          useCookieJar: selectedRequest.cookie_jar !== 0,
        },
        assertions: parseChecks<Assertion>(selectedRequest.assertions),
        captures: parseChecks<Capture>(selectedRequest.captures),
        activeTab: 'params' as RequestTab,
        editorMemory: {},
      } : undefined
    );
    if (!draft) return;
    setDraftKind(draft.kind);
    setDraftAssertions(draft.assertions);
    setDraftCaptures(draft.captures);
    setDraftMethod(draft.method);
    setDraftUrl(draft.url);
    setDraftNetworkHostId(draft.networkHostId);
    setDraftEnvironmentId(draft.environmentId);
    setDraftParams(draft.params);
    setDraftHeaders(draft.headers);
    setDraftVariables(draft.variables);
    setDraftBody(draft.body);
    setDraftBodyType(draft.bodyType);
    setDraftRawContentType(draft.rawContentType);
    setDraftAuthType(draft.authType);
    setDraftAuthConfig(draft.authConfig);
    setDraftSettings(draft.settings);
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
    : t('api.noEnvironment');

  // Count enabled items for tabs
  const paramCount = useMemo(
    () => draftParams.filter((p) => p.enabled && p.key.trim()).length,
    [draftParams]
  );

  const headerCount = useMemo(
    () => draftHeaders.filter((h) => h.enabled && h.key.trim()).length,
    [draftHeaders]
  );

  const variableCount = useMemo(
    () => draftVariables.filter((v) => v.enabled && v.key.trim()).length,
    [draftVariables]
  );

  // `{{` autocomplete: every name this request can resolve, with the scope that wins.
  const variableSuggestions = useMemo(() => {
    const chain: typeof collections = [];
    const seen = new Set<string>();
    let id = selectedRequest?.collection_id ?? null;
    while (id && !seen.has(id)) {
      seen.add(id);
      const folder = collections.find((collection) => collection.id === id);
      if (!folder) break;
      chain.push(folder);
      id = folder.parent_id;
    }
    return collectVariableSuggestions({
      request: draftVariables,
      chain,
      environmentVariables: environments.find((env) => env.id === draftEnvironmentId)?.variables,
      globals: globalVariables,
    });
  }, [selectedRequest?.collection_id, collections, draftVariables, environments, draftEnvironmentId, globalVariables]);

  const hasBody = draftBodyType !== 'none' && hasBodyContent(draftBody);
  const hasAuth = draftAuthType !== 'none';

  // Save request to database
  const handleSave = useCallback(async () => {
    const body = draftBody.toString();
    if (!selectedRequestId) return { body, saved: false };
    if (hasInsecureOAuthUrl(draftAuthType, draftAuthConfig)) {
      toast.error(t('api.errors.OAUTH_INSECURE_URL'));
      return { body, saved: false };
    }

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
          variables: serializeKeyValueItems(draftVariables),
          body,
          body_type: draftBodyType,
          raw_content_type: draftRawContentType,
          auth_type: draftAuthType,
          auth_config: draftAuthConfig,
          ...settingsColumns(draftSettings),
          kind: draftKind,
          assertions: JSON.stringify(draftAssertions),
          captures: JSON.stringify(draftCaptures),
        },
      });
    } catch {
      // The mutation hook already shows an error toast.
      return { body, saved: false };
    }
    return { body, saved: true };
  }, [
    selectedRequestId,
    draftMethod,
    draftUrl,
    draftNetworkHostId,
    draftEnvironmentId,
    draftParams,
    draftHeaders,
    draftVariables,
    draftBody,
    draftBodyType,
    draftRawContentType,
    draftAuthType,
    draftAuthConfig,
    draftSettings,
    draftKind,
    draftAssertions,
    draftCaptures,
    updateRequestMutation,
    t,
  ]);

  /** What a send would use; also the input for "Copy as curl". */
  const buildConfig = useCallback(
    (body: string) => ({
      method: draftMethod,
      url: draftUrl,
      params: serializeKeyValueItems(draftParams),
      headers: serializeKeyValueItems(draftHeaders),
      body,
      bodyType: draftBodyType,
      rawContentType: draftRawContentType,
      authType: draftAuthType,
      authConfig: draftAuthConfig,
      collectionId: selectedRequest?.collection_id ?? null,
      requestId: selectedRequestId,
      variables: serializeKeyValueItems(draftVariables),
      networkHostId: draftNetworkHostId,
      environmentId: draftEnvironmentId,
      timeoutSeconds: draftSettings.timeoutSeconds,
      followRedirects: draftSettings.followRedirects,
      verifyTls: draftSettings.verifyTls,
      useCookieJar: draftSettings.useCookieJar,
    }),
    [
      draftMethod,
      draftUrl,
      draftParams,
      draftHeaders,
      draftBodyType,
      draftRawContentType,
      draftAuthType,
      draftAuthConfig,
      selectedRequest?.collection_id,
      selectedRequestId,
      draftVariables,
      draftNetworkHostId,
      draftEnvironmentId,
      draftSettings,
    ]
  );

  /** Introspection through the normal pipeline (auth, variables, SSH host, cookies); not saved. */
  const handleFetchGraphqlSchema = useCallback(async () => {
    if (!draftUrl.trim()) return null;
    try {
      const result = await window.electronAPI.apiClient.requests.execute({
        ...buildConfig(serializeGraphqlBody({ query: INTROSPECTION_QUERY, variables: '', operationName: '' })),
        method: 'POST',
        bodyType: 'graphql',
        requestId: null,
      });
      if (result.errorCode) {
        toast.error(sendErrorMessage(result, t));
        return null;
      }
      return result.body;
    } catch (error) {
      toast.error(t('api.errors.requestFailed', { error: error instanceof Error ? error.message : String(error) }));
      return null;
    }
  }, [buildConfig, draftUrl, t]);

  const handleWsConnect = useCallback(async () => {
    if (!selectedRequestId || !draftUrl.trim() || wsActive) return;
    const requestId = selectedRequestId;
    const connectionId = crypto.randomUUID();
    setWsSessions((current) => ({
      ...current,
      [requestId]: { connectionId, state: 'connecting', messages: [], chars: 0, dropped: 0 },
    }));
    try {
      const { body } = await handleSave();
      const result = await window.electronAPI.apiClient.webSocket.connect(connectionId, buildConfig(body));
      void invalidateHistory();
      updateWsSession(requestId, connectionId, (session) =>
        result.ok
          ? // A close that arrived before this answer wins.
            { ...session, state: session.state === 'closed' ? 'closed' : 'open', status: result.status }
          : { ...session, state: 'closed', status: result.status, error: result.errorCode ? sendErrorMessage(result, t) : result.message }
      );
    } catch (error) {
      updateWsSession(requestId, connectionId, (session) => ({
        ...session,
        state: 'closed',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [selectedRequestId, draftUrl, wsActive, handleSave, buildConfig, invalidateHistory, updateWsSession, t]);

  const handleWsDisconnect = useCallback(() => {
    if (!selectedRequestId || !wsSession || wsSession.state === 'closed') return;
    void window.electronAPI.apiClient.webSocket.close(wsSession.connectionId).catch(() => undefined);
    // A pending connect is aborted; an open connection reports its close through the event.
    if (wsSession.state === 'connecting') {
      updateWsSession(selectedRequestId, wsSession.connectionId, (session) => ({ ...session, state: 'closed' }));
    }
  }, [selectedRequestId, wsSession, updateWsSession]);

  const handleWsSend = useCallback(
    async (text: string) => {
      if (!selectedRequestId || wsSession?.state !== 'open') return false;
      const { connectionId } = wsSession;
      try {
        await window.electronAPI.apiClient.webSocket.send(connectionId, text);
        updateWsSession(selectedRequestId, connectionId, (session) =>
          appendMessage(session, {
            direction: 'out',
            data: text,
            binary: false,
            size: new TextEncoder().encode(text).length,
            time: Date.now(),
          })
        );
        return true;
      } catch (error) {
        toast.error(t('api.ws.sendFailed', { error: error instanceof Error ? error.message : String(error) }));
        return false;
      }
    },
    [selectedRequestId, wsSession, updateWsSession, t]
  );

  const handleCancel = useCallback(() => {
    if (!execution?.loading) return;
    // Also covers a cancel during the save, before the main process has the execution.
    sendFlow.cancel(execution.executionId);
    window.electronAPI.apiClient.requests.cancel(execution.executionId).catch(() => undefined);
  }, [execution, sendFlow]);

  const handleCopyCurl = useCallback(
    async (resolveVariables: boolean) => {
      if (!draftUrl.trim()) return;
      try {
        const result = await window.electronAPI.apiClient.requests.exportCurl(
          buildConfig(draftBody.toString()),
          resolveVariables
        );
        if (!result.command) {
          toast.error(sendErrorMessage(result, t));
          return;
        }
        await navigator.clipboard.writeText(result.command);
        toast.success(t(resolveVariables ? 'api.curl.copiedResolved' : 'api.curl.copiedPlaceholders'));
      } catch (error) {
        toast.error(t('api.curl.copyFailed', { error: error instanceof Error ? error.message : String(error) }));
      }
    },
    [buildConfig, draftBody, draftUrl, t]
  );

  /** A curl command pasted into the URL bar replaces the current draft (saved with Save/Send). */
  const handlePasteCurl = useCallback(
    (command: string) => {
      const result = parseCurlWithToast(command, t);
      if (!result) return;
      setDraftKind('http');
      setDraftMethod(result.method);
      setDraftUrl(result.url);
      setDraftParams(parseKeyValueItems(result.params));
      setDraftHeaders(parseKeyValueItems(result.headers));
      setDraftBody(result.body);
      setDraftBodyType(result.bodyType);
      setDraftRawContentType(result.rawContentType);
      setDraftAuthType(result.authType);
      setDraftAuthConfig(result.authConfig);
      setDraftSettings((current) => ({
        ...current,
        timeoutSeconds: result.timeoutSeconds ?? current.timeoutSeconds,
        followRedirects: result.followRedirects ?? current.followRedirects,
        verifyTls: result.verifyTls ?? current.verifyTls,
      }));
      // The body editor keeps its own document; start fresh for the imported body.
      setEditorMemory({});
      showCurlImportNotices(result, t);
    },
    [t]
  );

  // Send HTTP request
  const handleSend = useCallback(async () => {
    if (!selectedRequestId || !draftUrl.trim() || execution?.loading) return;
    const requestId = selectedRequestId;
    const generation = ++executionSequence.current;
    const executionId = crypto.randomUUID();
    const previous = execution?.executionId;
    // Only the latest execution of a request keeps its stream events.
    if (previous) setStreams(({ [previous]: _dropped, ...rest }) => rest);
    setExecutions(current => ({
      ...current,
      [requestId]: { generation, executionId, loading: true, response: null },
    }));
    const publish = (response: HttpResponse | null) => {
      setExecutions(current => {
        const execution = current[requestId];
        if (!execution || execution.generation !== generation) return current;
        return { ...current, [requestId]: { ...execution, response } };
      });
    };

    try {
      let ipcStarted = 0;
      const sent = await sendFlow.run(executionId, handleSave, ({ body }) => {
        // Execute request - vault variables are decrypted automatically in backend via environmentId
        ipcStarted = performance.now();
        return window.electronAPI.apiClient.requests.execute({ ...buildConfig(body), executionId });
      });
      const result = sent?.result;

      if (!result || result.errorCode === 'CANCELLED') {
        // User-initiated: no error, no stale response.
        publish(null);
        return;
      }
      publish({ ...result, ipcRoundTripMs: performance.now() - ipcStarted });
      void invalidateHistory();
      if (result.errorCode) {
        toast.error(sendErrorMessage(result, t));
      } else if (result.status === 0) {
        toast.error(t('api.errors.requestFailed', { error: getErrorMessage(result) }));
      }

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
      toast.error(
        t('api.errors.requestFailed', { error: error instanceof Error ? error.message : String(error) })
      );
      publish({
        status: 0,
        statusText: t('common.error'),
        headers: {},
        body: JSON.stringify({ error: error instanceof Error ? error.message : t('common.unknownError') }),
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
  }, [draftUrl, execution?.loading, execution?.executionId, selectedRequestId, buildConfig, handleSave, sendFlow, t, updateRequestMutation, invalidateHistory]);

  // Only while focus is inside this view; capture phase so editors (CodeMirror) do not act on them first.
  const handleShortcut = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const overlayOpen =
        showEnvDropdown ||
        showCurlMenu ||
        confirmResolvedCurl ||
        !!target?.closest(OVERLAY_SELECTOR) ||
        !!event.currentTarget.querySelector(`[aria-expanded="true"], ${OVERLAY_SELECTOR}`);
      const webSocket = draftKind === 'websocket';
      const loading = webSocket ? wsActive : !!execution?.loading;
      const action = getShortcutAction(event, { loading, overlayOpen });
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'send') void (webSocket ? handleWsConnect() : handleSend());
      else if (action === 'save') void handleSave().then(({ saved }) => saved && toast.success(t('api.saved')));
      else if (webSocket) handleWsDisconnect();
      else handleCancel();
    },
    [handleSend, handleSave, handleCancel, handleWsConnect, handleWsDisconnect, draftKind, wsActive, execution?.loading, showEnvDropdown, showCurlMenu, confirmResolvedCurl, t]
  );

  if (selectedRequestId && draftRequestId !== selectedRequestId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" role="status" aria-label={t('common.loading')} />
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
            {t('api.selectRequest')}
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
    <VariableSuggestionsContext.Provider value={variableSuggestions}>
      <div className="h-full flex flex-col min-h-0" onKeyDownCapture={handleShortcut}>
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-background">
          {/* Left: Request Name */}
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-foreground truncate max-w-[300px]">
              {selectedRequest?.name}
            </h2>
            {!draftSettings.verifyTls && (
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[11px] font-medium text-amber-600 dark:text-amber-400"
                title={t('api.settings.tlsOffWarning')}
              >
                <ShieldAlert className="w-3 h-3" />
                {t('api.settings.tlsOffBadge')}
              </button>
            )}
          </div>

          {/* Right: Save + Copy as curl + Environment + Layout Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave().then(({ saved }) => saved && toast.success(t('api.saved')))}
              className="p-1.5 rounded-md border border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={`${t('common.save')} (${SHORTCUT_LABELS.save})`}
              aria-label={t('common.save')}
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowCookies(true)}
              className="p-1.5 rounded-md border border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={t('api.cookies.title')}
              aria-label={t('api.cookies.title')}
            >
              <Cookie className="w-4 h-4" />
            </button>
            {showCookies && <CookieManagerDialog onClose={() => setShowCookies(false)} />}
            <div className="relative" onKeyDown={(e) => e.key === 'Escape' && setShowCurlMenu(false)}>
              <button
                type="button"
                onClick={() => setShowCurlMenu(!showCurlMenu)}
                aria-expanded={showCurlMenu}
                disabled={!draftUrl.trim() || draftKind === 'websocket'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-secondary text-sm hover:bg-accent transition-colors disabled:opacity-50"
                title={t('api.curl.copyMenu')}
              >
                <Terminal className="w-4 h-4 text-muted-foreground" />
                <span>curl</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              {showCurlMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setShowCurlMenu(false)}
                    tabIndex={-1}
                    aria-label={t('common.close')}
                  />
                  <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[240px]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCurlMenu(false);
                        void handleCopyCurl(false);
                      }}
                      title={t('api.curl.placeholdersHint')}
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-primary/10 transition-colors"
                    >
                      {t('api.curl.copyPlaceholders')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCurlMenu(false);
                        setConfirmResolvedCurl(true);
                      }}
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-primary/10 transition-colors"
                    >
                      {t('api.curl.copyResolved')}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Environment Selector */}
            <div className="relative" onKeyDown={(e) => e.key === 'Escape' && setShowEnvDropdown(false)}>
              <button
                type="button"
                onClick={() => setShowEnvDropdown(!showEnvDropdown)}
                aria-expanded={showEnvDropdown}
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
                    tabIndex={-1}
                    aria-label={t('common.closeMenu')}
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
                      {t('api.noEnvironment')}
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
                title={t('api.layoutHorizontal')}
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
                title={t('api.layoutVertical')}
              >
                <Rows className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* URL Bar */}
        <RequestUrlBar
          kind={draftKind}
          method={draftKind === 'http' && draftBodyType === 'graphql' ? 'POST' : draftMethod}
          methodLocked={draftKind === 'http' && draftBodyType === 'graphql'}
          url={draftUrl}
          networkHostId={draftNetworkHostId}
          hosts={sshHosts}
          isLoading={draftKind === 'websocket' ? wsActive : isLoading}
          onKindChange={(kind) => {
            setDraftKind(kind);
            if (kind === 'websocket') {
              setDraftMethod('GET');
              if (activeTab === 'body' || activeTab === 'tests') setActiveTab('params');
            }
          }}
          onMethodChange={setDraftMethod}
          onUrlChange={setDraftUrl}
          onNetworkHostChange={setDraftNetworkHostId}
          onSend={draftKind === 'websocket' ? () => void handleWsConnect() : handleSend}
          onCancel={draftKind === 'websocket' ? handleWsDisconnect : handleCancel}
          onPasteCurl={handlePasteCurl}
        />

        <ConfirmDialog
          isOpen={confirmResolvedCurl}
          title={t('api.curl.copyResolved')}
          message={t('api.curl.resolvedWarning')}
          confirmLabel={t('api.curl.copyAnyway')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            setConfirmResolvedCurl(false);
            void handleCopyCurl(true);
          }}
          onCancel={() => setConfirmResolvedCurl(false)}
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
              variableCount={variableCount}
              settingsWarning={!draftSettings.verifyTls}
              kind={draftKind}
              testCount={draftAssertions.length + draftCaptures.length}
            />

            {/* Tab Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === 'params' && (
                <KeyValueEditor
                  items={draftParams}
                  onChange={setDraftParams}
                  keyPlaceholder={t('api.params.key')}
                  valuePlaceholder={t('api.params.value')}
                />
              )}
              {activeTab === 'auth' && (
                <AuthEditor
                  authType={draftAuthType}
                  authConfig={draftAuthConfig}
                  onAuthTypeChange={setDraftAuthType}
                  onAuthConfigChange={setDraftAuthConfig}
                  oauthOwner={selectedRequestId ? { type: 'request', id: selectedRequestId } : null}
                  // The URL does not matter for a token request, but the IPC schema requires one.
                  buildOAuthConfig={() => ({
                    ...buildConfig(draftBody.toString()),
                    url: draftUrl.trim() || 'http://localhost',
                  })}
                />
              )}
              {activeTab === 'headers' && (
                <KeyValueEditor
                  items={draftHeaders}
                  onChange={setDraftHeaders}
                  keyPlaceholder={t('api.headers.key')}
                  valuePlaceholder={t('api.headers.value')}
                />
              )}
              {activeTab === 'body' && draftKind === 'http' && (
                <BodyEditor
                  bodyType={draftBodyType}
                  body={draftBody}
                  memory={editorMemory}
                  rawContentType={draftRawContentType}
                  onRawContentTypeChange={setDraftRawContentType}
                  onBodyTypeChange={(type) => {
                    setDraftBodyType(type);
                    // GraphQL over HTTP is a POST with a JSON body (also enforced in prepare-request).
                    if (type === 'graphql') setDraftMethod('POST');
                  }}
                  onBodyChange={setDraftBody}
                  onFetchGraphqlSchema={handleFetchGraphqlSchema}
                />
              )}
              {activeTab === 'variables' && (
                <div className="flex h-full min-h-0 flex-col">
                  <p className="flex-shrink-0 px-4 pt-3 text-xs text-muted-foreground">
                    {t('api.variables.precedenceHint', BUILT_IN_NAMES)}
                  </p>
                  <div className="min-h-0 flex-1">
                    <KeyValueEditor
                      items={draftVariables}
                      onChange={setDraftVariables}
                      keyPlaceholder={t('api.variables.name')}
                      valuePlaceholder={t('api.params.value')}
                    />
                  </div>
                </div>
              )}
              {activeTab === 'tests' && draftKind === 'http' && (
                <RunnerChecksEditor
                  assertions={draftAssertions}
                  captures={draftCaptures}
                  onAssertionsChange={setDraftAssertions}
                  onCapturesChange={setDraftCaptures}
                />
              )}
              {activeTab === 'settings' && (
                <RequestSettingsEditor settings={draftSettings} onChange={setDraftSettings} />
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
            {draftKind === 'websocket' ? (
              <WebSocketPanel session={wsSession} onSend={handleWsSend} />
            ) : (
              <ResponseViewer response={response} isLoading={isLoading} stream={stream} />
            )}
          </Panel>
        </Group>
      </div>
    </VariableSuggestionsContext.Provider>
  );
};
