/**
 * Database Connection Modal
 *
 * Modal for creating/editing database connections.
 * Supports local, SSH tunnel and SQLite file-based connections.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppCheckbox, Input, Modal } from '@ownshell/ui';
import { resolveSslMode } from '../../../electron/db-explorer/connection/ssl-mode';
import { useCreateDBConnection, useUpdateDBConnection } from '../../hooks/db-explorer';
import { useHostStore } from '../../stores/useHostStore';
import { SQLiteFilePicker } from './SQLiteFilePicker';
import toast from 'react-hot-toast';

import { DEFAULT_PORTS } from './db-connection-modal/constants';
import { ConnectionModalActions } from './db-connection-modal/ConnectionModalActions';
import { ConnectionModeFields } from './db-connection-modal/ConnectionModeFields';
import { DatabaseTypeSelector } from './db-connection-modal/DatabaseTypeSelector';
import { ExecutionModeFields } from './db-connection-modal/ExecutionModeFields';
import { NetworkConnectionFields } from './db-connection-modal/NetworkConnectionFields';
import { SslFields } from './db-connection-modal/SslFields';
import { normalizeFormDataFromConnectionUri } from './db-connection-modal/connection-uri';
import type {
  DBConnectionFormData,
  DBConnectionModalProps,
  DBType,
  HostOption,
} from './db-connection-modal/types';

const createInitialFormData = (
  editConnection: DBConnectionModalProps['editConnection']
): DBConnectionFormData => ({
  name: editConnection?.name || '',
  type: (editConnection?.type || 'postgres') as DBType,
  host: editConnection?.host || 'localhost',
  port: editConnection?.port || 5432,
  database: editConnection?.database || '',
  username: editConnection?.username || '',
  password: '',
  connectionUri: editConnection?.connection_uri || '',
  connectionMode: (editConnection?.connection_mode || 'local') as 'local' | 'ssh',
  sshHostId: editConnection?.ssh_host_id || '',
  sshTunnelEnabled: editConnection?.ssh_tunnel_enabled === 1,
  sslMode: editConnection ? resolveSslMode(editConnection) : 'disabled',
  sslCa: '',
  sslCaRemoved: false,
  readOnly: editConnection?.read_only === 1,
  authDatabase: editConnection?.auth_database || '',
  replicaSet: editConnection?.replica_set || '',
  directConnection: editConnection?.direct_connection === 1,
  readPreference: editConnection?.read_preference || '',
  color: editConnection?.color || '',
  filePath: editConnection?.file_path || '',
  isRemote: editConnection?.is_remote === 1,
  remoteHostId: editConnection?.remote_host_id || '',
  executionMode: (editConnection?.execution_mode || 'direct') as 'direct' | 'docker',
  dockerContainer: editConnection?.docker_container || '',
});

export const DBConnectionModal: React.FC<DBConnectionModalProps> = ({
  onClose,
  onCreated,
  editConnection,
  sshSessionId,
}) => {
  const { t } = useTranslation();
  const createMutation = useCreateDBConnection();
  const updateMutation = useUpdateDBConnection();
  const hosts = useHostStore((state) => state.hosts);

  const isEditMode = !!editConnection?.id;
  const [formData, setFormData] = useState<DBConnectionFormData>(() =>
    createInitialFormData(editConnection)
  );
  const [isTesting, setIsTesting] = useState(false);

  const isSQLite = formData.type === 'sqlite';
  const isRedis = formData.type === 'redis';
  const isMongoDB = formData.type === 'mongodb';
  const isSSHMode = formData.connectionMode === 'ssh';
  const supportsDockerTarget = !isSQLite && !isRedis && !isMongoDB;
  const showDatabaseName = !isSQLite && !isRedis;
  const showUsername = !isSQLite && !isRedis;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const hostOptions = hosts as HostOption[] | undefined;

  const handleTypeChange = (type: DBType) => {
    setFormData((prev) => {
      const networkDefaults = {
        host: prev.host || 'localhost',
        filePath: '',
        isRemote: false,
        remoteHostId: '',
        connectionUri: '',
        authDatabase: '',
        replicaSet: '',
        directConnection: false,
        readPreference: '',
      };

      let typeFields: Partial<DBConnectionFormData>;
      switch (type) {
        case 'sqlite':
          typeFields = {
            ...networkDefaults,
            host: '',
            port: 0,
            filePath: prev.filePath || '',
          };
          break;
        case 'redis':
          typeFields = { ...networkDefaults, port: DEFAULT_PORTS.redis, database: '' };
          break;
        case 'mongodb':
          typeFields = {
            ...networkDefaults,
            port: DEFAULT_PORTS.mongodb,
            database: prev.database || '',
          };
          break;
        default:
          typeFields = { ...networkDefaults, port: DEFAULT_PORTS[type] || 0 };
          break;
      }

      return { ...prev, type, ...typeFields };
    });
  };

  const getIsFormValid = () => {
    const normalizedFormData = normalizeFormDataFromConnectionUri(formData);
    const normalizedIsSQLite = normalizedFormData.type === 'sqlite';
    const normalizedIsMongoDB = normalizedFormData.type === 'mongodb';
    const normalizedIsRedis = normalizedFormData.type === 'redis';
    const normalizedSupportsDockerTarget =
      !normalizedIsSQLite && !normalizedIsRedis && !normalizedIsMongoDB;

    if (!normalizedFormData.name) return false;
    if (normalizedIsSQLite) {
      return (
        !!normalizedFormData.filePath.trim() &&
        (!normalizedFormData.isRemote || !!normalizedFormData.remoteHostId)
      );
    }
    if (normalizedFormData.connectionMode === 'ssh' && !normalizedFormData.sshHostId) return false;
    if (
      normalizedSupportsDockerTarget &&
      normalizedFormData.executionMode === 'docker' &&
      !normalizedFormData.dockerContainer.trim()
    ) {
      return false;
    }
    if (normalizedIsMongoDB) return !!normalizedFormData.host && !!normalizedFormData.database;
    return !!normalizedFormData.host;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const normalizedFormData = normalizeFormDataFromConnectionUri(formData);
      const normalizedIsSQLite = normalizedFormData.type === 'sqlite';
      const normalizedIsRedis = normalizedFormData.type === 'redis';
      const normalizedIsMongoDB = normalizedFormData.type === 'mongodb';
      const normalizedSupportsDockerTarget =
        !normalizedIsSQLite && !normalizedIsRedis && !normalizedIsMongoDB;

      const connectionData: Record<string, unknown> = {
        name: normalizedFormData.name,
        type: normalizedFormData.type,
        color: normalizedFormData.color || undefined,
        readOnly: normalizedFormData.readOnly,
      };

      if (normalizedIsSQLite) {
        connectionData.filePath = normalizedFormData.filePath;
        connectionData.isRemote = normalizedFormData.isRemote;
        connectionData.remoteHostId = normalizedFormData.isRemote
          ? normalizedFormData.remoteHostId
          : undefined;
        connectionData.host = null;
        connectionData.port = null;
        connectionData.connectionMode = normalizedFormData.isRemote ? 'ssh' : 'local';
        connectionData.sshHostId = normalizedFormData.isRemote
          ? normalizedFormData.remoteHostId
          : undefined;
        connectionData.sshTunnelEnabled = false;
      } else {
        connectionData.host = normalizedFormData.host;
        connectionData.port = normalizedFormData.port;
        connectionData.password = normalizedFormData.password || undefined;
        connectionData.connectionMode = normalizedFormData.connectionMode;
        connectionData.sshHostId =
          normalizedFormData.connectionMode === 'ssh'
            ? normalizedFormData.sshHostId || undefined
            : undefined;
        connectionData.sshTunnelEnabled = normalizedFormData.connectionMode === 'ssh';
        connectionData.sslMode = normalizedFormData.sslMode;
        const sslCa = normalizedFormData.sslCa.trim();
        if (sslCa) connectionData.sslCa = sslCa;
        else if (isEditMode && normalizedFormData.sslCaRemoved) connectionData.sslCa = null;
        connectionData.connectionUri =
          normalizedFormData.connectionUri || (isEditMode ? null : undefined);

        if (!normalizedIsRedis) {
          connectionData.username = normalizedFormData.username || undefined;
          connectionData.database = normalizedFormData.database || undefined;
        }

        if (normalizedIsMongoDB) {
          connectionData.authDatabase =
            normalizedFormData.authDatabase || (isEditMode ? null : undefined);
          connectionData.replicaSet =
            normalizedFormData.replicaSet || (isEditMode ? null : undefined);
          connectionData.directConnection = normalizedFormData.directConnection;
          connectionData.readPreference =
            normalizedFormData.readPreference || (isEditMode ? null : undefined);
        } else if (isEditMode) {
          connectionData.authDatabase = null;
          connectionData.replicaSet = null;
          connectionData.directConnection = false;
          connectionData.readPreference = null;
        }

        if (normalizedSupportsDockerTarget) {
          connectionData.executionMode = normalizedFormData.executionMode;
          connectionData.dockerContainer =
            normalizedFormData.executionMode === 'docker'
              ? normalizedFormData.dockerContainer.trim()
              : isEditMode
                ? null
                : undefined;
        }
      }

      if (isEditMode && editConnection?.id) {
        await updateMutation.mutateAsync({
          id: editConnection.id,
          update: connectionData as Parameters<typeof updateMutation.mutateAsync>[0]['update'],
        });
        onClose();
      } else {
        const result = await createMutation.mutateAsync(
          connectionData as Parameters<typeof createMutation.mutateAsync>[0]
        );
        if (onCreated && result?.id) {
          onCreated(result.id);
        }
        onClose();
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const normalizedFormData = normalizeFormDataFromConnectionUri(formData);
      const normalizedIsMongoDB = normalizedFormData.type === 'mongodb';
      const normalizedSupportsDockerTarget =
        normalizedFormData.type !== 'sqlite' &&
        normalizedFormData.type !== 'redis' &&
        !normalizedIsMongoDB;
      const result = await window.electronAPI.dbConnections.test({
        name: normalizedFormData.name || t('database.newConnection', 'New Database Connection'),
        type: normalizedFormData.type as 'postgres' | 'mysql' | 'redis' | 'mongodb',
        host: normalizedFormData.host,
        port: normalizedFormData.port,
        database: normalizedFormData.database || undefined,
        username: normalizedFormData.username || undefined,
        password: normalizedFormData.password,
        connectionMode: normalizedFormData.connectionMode,
        sshHostId:
          normalizedFormData.connectionMode === 'ssh'
            ? normalizedFormData.sshHostId || undefined
            : undefined,
        sshTunnelEnabled: normalizedFormData.connectionMode === 'ssh',
        sslMode: normalizedFormData.sslMode,
        sslCa: normalizedFormData.sslCa.trim() || undefined,
        configId:
          isEditMode && !normalizedFormData.sslCaRemoved ? editConnection?.id : undefined,
        connectionUri: normalizedFormData.connectionUri || undefined,
        authDatabase: normalizedIsMongoDB ? normalizedFormData.authDatabase || undefined : undefined,
        replicaSet: normalizedIsMongoDB ? normalizedFormData.replicaSet || undefined : undefined,
        directConnection: normalizedIsMongoDB ? normalizedFormData.directConnection : undefined,
        readPreference: normalizedIsMongoDB ? normalizedFormData.readPreference || undefined : undefined,
        executionMode: normalizedSupportsDockerTarget ? normalizedFormData.executionMode : undefined,
        dockerContainer:
          normalizedSupportsDockerTarget && normalizedFormData.executionMode === 'docker'
            ? normalizedFormData.dockerContainer.trim()
            : undefined,
      });

      if (result.success) {
        toast.success(t('db.connectionSuccess', 'Connection successful!'));
      } else {
        toast.error(result.error || t('db.connectionFailed', 'Connection failed'));
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t('db.connectionFailed', 'Connection failed');
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        editConnection
          ? t('database.editConnection', 'Edit Connection')
          : t('database.newConnection', 'New Database Connection')
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="db-connection-name"
            className="block text-sm font-medium text-foreground mb-1"
          >
            {t('database.connectionName', 'Connection Name')} *
          </label>
          <Input
            id="db-connection-name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="My Database"
            required
          />
        </div>

        <DatabaseTypeSelector value={formData.type} onChange={handleTypeChange} />

        {isSQLite && (
          <SQLiteFilePicker
            value={formData.filePath}
            isRemote={formData.isRemote}
            remoteHostId={formData.remoteHostId}
            sshSessionId={sshSessionId}
            onChange={(data) =>
              setFormData((prev) => ({
                ...prev,
                filePath: data.filePath,
                isRemote: data.isRemote,
                remoteHostId: data.remoteHostId || '',
              }))
            }
          />
        )}

        {!isSQLite && (
          <NetworkConnectionFields
            formData={formData}
            showDatabaseName={showDatabaseName}
            showUsername={showUsername}
            onChange={setFormData}
          />
        )}

        {!isSQLite && (
          <ConnectionModeFields
            formData={formData}
            hosts={hostOptions}
            isSSHMode={isSSHMode}
            onChange={setFormData}
          />
        )}

        {!isSQLite && (
          <SslFields
            formData={formData}
            storedCaFingerprint={editConnection?.ssl_ca_fingerprint}
            showLegacyHint={editConnection?.ssl_legacy_hint === 1}
            onChange={setFormData}
          />
        )}

        <AppCheckbox
          id="db-read-only"
          checked={formData.readOnly}
          onCheckedChange={(readOnly) => setFormData((prev) => ({ ...prev, readOnly }))}
          label={t('db.readOnlyConnection', 'Read-only connection')}
          description={t(
            'db.readOnlyConnectionDescription',
            'Blocks write actions in OwnShell. Use a database read-only user for hard enforcement.'
          )}
        />

        {supportsDockerTarget && (
          <ExecutionModeFields
            formData={formData}
            connectionMode={formData.connectionMode}
            onChange={setFormData}
          />
        )}

        <ConnectionModalActions
          isFormValid={getIsFormValid()}
          isTesting={isTesting}
          isSQLite={isSQLite}
          isSaving={isSaving}
          isEditMode={isEditMode}
          onClose={onClose}
          onTestConnection={handleTestConnection}
        />
      </form>
    </Modal>
  );
};

export default DBConnectionModal;
