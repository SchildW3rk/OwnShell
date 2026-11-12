/**
 * Preload Script
 *
 * Secure bridge between Main and Renderer processes.
 * Domain APIs live in ./preload/* so this root stays as a small registry.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { createLocalPtyApi } from './preload/local-pty';
import { createNativeSshApi } from './preload/native-ssh';
import { createCryptoApi, createHostsApi, createKeysApi, createFilePickerApi, createSettingsApi, createSnippetsApi, createBackupApi, createLicenseApi, createSidebarFoldersApi } from './preload/core';
import { createSSHApi, createSftpApi, createTunnelApi } from './preload/ssh';
import { createSftpStandaloneApi, createSftpTransferApi } from './preload/sftp';
import { createDockerApi } from './preload/docker';
import { createS3Api, createS3ConnectionsApi } from './preload/s3';
import { createDbConnectionsApi, createDbExplorerApi } from './preload/database';
import { createRedisApi, createMongodbApi } from './preload/database-engines';
import { createVaultApi } from './preload/vault';
import { createApiClientApi } from './preload/api-client';
import { createReleasesApi, createUpdaterApi } from './preload/updates';
import { createProjectsApi } from './preload/projects';

const api = {
  localPty: createLocalPtyApi(ipcRenderer),
  nativeSsh: createNativeSshApi(ipcRenderer),
  crypto: createCryptoApi(ipcRenderer),
  hosts: createHostsApi(ipcRenderer),
  sidebarFolders: createSidebarFoldersApi(ipcRenderer),
  keys: createKeysApi(ipcRenderer),
  filePicker: createFilePickerApi(ipcRenderer),
  settings: createSettingsApi(ipcRenderer),
  ssh: createSSHApi(ipcRenderer),
  sftp: createSftpApi(ipcRenderer),
  sftpStandalone: createSftpStandaloneApi(ipcRenderer),
  sftpTransfer: createSftpTransferApi(ipcRenderer),
  tunnel: createTunnelApi(ipcRenderer),
  snippets: createSnippetsApi(ipcRenderer),
  docker: createDockerApi(ipcRenderer),
  s3Connections: createS3ConnectionsApi(ipcRenderer),
  s3: createS3Api(ipcRenderer),
  backup: createBackupApi(ipcRenderer),
  license: createLicenseApi(ipcRenderer),
  dbConnections: createDbConnectionsApi(ipcRenderer),
  dbExplorer: createDbExplorerApi(ipcRenderer),
  redis: createRedisApi(ipcRenderer),
  mongodb: createMongodbApi(ipcRenderer),
  vault: createVaultApi(ipcRenderer),
  apiClient: createApiClientApi(ipcRenderer),
  releases: createReleasesApi(ipcRenderer),
  updater: createUpdaterApi(ipcRenderer),
  projects: createProjectsApi(ipcRenderer),
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
