import { v4 as uuidv4 } from 'uuid';
import { SSH2Adapter, JumpHostConfig } from '../../ssh/ssh2-adapter';
import { SSHStreamHandler } from '../../ssh/stream-handler';
import { cryptoManager } from '../../security/crypto';
import { logger } from '../../logger';
import { sshSessionManager } from '../../ssh/session-manager';
import { sshWorkerManager } from '../../ssh/worker-manager';
import { loadHostKeyCheck } from '../../ssh/host-key-store';
import { safeHandle } from '../safe-ipc';
import { sshConnectSchema } from '../schemas/ssh';
import { SSHAuthenticationError, SSHConnectionError, SSHTimeoutError } from '@ownshell/core';
import type { GetHostById, GetKeyById } from './types';
import type { SSHIPCContext } from './context';

export function setupSSHConnectionHandlers(ctx: SSHIPCContext) {
  const { mainWindow, hostQueries, keyQueries, buildJumpChain, useWorkerThreads } = ctx;
  const USE_WORKER_THREADS = useWorkerThreads;
  /**
   * Connect to SSH server and open shell
   * Supports multi-hop connections through jump hosts
   */
  safeHandle(
    'ssh:connect',
    sshConnectSchema,
    async (_event, params) => {
      const sessionId = uuidv4();

      try {
        logger.info('SSH connection requested', {
          sessionId,
          hostId: params.hostId,
          hostname: params.hostname,
          port: params.port,
          username: params.username,
          authType: params.authType,
          jumpHostId: params.jumpHostId || null,
        });

        // Check if app is unlocked
        if (!cryptoManager.isUnlocked()) {
          throw new SSHConnectionError('App is locked. Please unlock to connect.');
        }

        // Decrypt credentials
        let password: string | undefined;
        let privateKey: string | undefined;
        let passphrase: string | undefined;

        // DEBUG: Log what we received
        logger.info('🔍 SSH Auth Parameters:', {
          authType: params.authType,
          hasPasswordEncrypted: !!params.passwordEncrypted,
          hasPrivateKeyEncrypted: !!params.privateKeyEncrypted,
          hasPassphraseEncrypted: !!params.passphraseEncrypted,
          privateKeyEncryptedLength: params.privateKeyEncrypted?.length || 0,
        });

        if (params.authType === 'password' && params.passwordEncrypted) {
          password = cryptoManager.decryptData(params.passwordEncrypted);
          logger.debug('Password decrypted', { length: password?.length });
        } else if (params.authType === 'key') {
          if (params.privateKeyEncrypted) {
            logger.info('🔓 Decrypting private key...', {
              encryptedLength: params.privateKeyEncrypted.length,
            });

            privateKey = cryptoManager.decryptData(params.privateKeyEncrypted);

            if (!privateKey) {
              logger.error('❌ Private key decryption returned empty/undefined!');
            } else {
              logger.info('✅ Private key decrypted successfully', {
                decryptedLength: privateKey.length,
              });

              // Normalize private key (trim and ensure proper line endings)
              privateKey = privateKey.trim();
              // Ensure trailing newline (required by many SSH servers)
              if (!privateKey.endsWith('\n')) {
                privateKey += '\n';
              }

              const lines = privateKey.split('\n');
              const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

              logger.info('🔑 Private key after normalization:', {
                length: privateKey.length,
                firstLine: nonEmptyLines[0]?.substring(0, 50),
                lastLine: nonEmptyLines[nonEmptyLines.length - 1]?.substring(0, 50),
                lineCount: lines.length,
                hasTrailingNewline: privateKey.endsWith('\n'),
              });
            }
          } else {
            logger.warn('⚠️ Auth type is "key" but no privateKeyEncrypted provided!');
          }

          if (params.passphraseEncrypted) {
            passphrase = cryptoManager.decryptData(params.passphraseEncrypted);
            logger.debug('Passphrase decrypted', { length: passphrase?.length });
          }
        }

        // Build jump host chain if jump_host_id is provided
        let jumpChain: JumpHostConfig[] = [];
        if (params.jumpHostId) {
          logger.info('Building jump host chain', { jumpHostId: params.jumpHostId });

          // Define functions to fetch host and key data
          const getHostById: GetHostById = async (id: string) => {
            const host = await hostQueries.getById(id);
            if (!host) return null;
            return {
              id: host.id,
              label: host.label,
              hostname: host.hostname,
              port: host.port,
              username: host.username,
              auth_type: host.auth_type as 'password' | 'key',
              password_encrypted: host.password_encrypted,
              key_id: host.key_id,
              jump_host_id: host.jump_host_id,
            };
          };

          const getKeyById: GetKeyById = async (id: string) => {
            const key = await keyQueries.getById(id);
            if (!key) return null;
            return {
              private_key_encrypted: key.private_key_encrypted,
              passphrase_encrypted: key.passphrase_encrypted,
            };
          };

          jumpChain = await buildJumpChain(params.jumpHostId, getHostById, getKeyById);

          logger.info('Jump host chain built', {
            chainLength: jumpChain.length,
            hops: jumpChain.map((j) => j.label).join(' -> '),
          });
        }

        // Connection config
        const connectionConfig = {
          host: params.hostname,
          port: params.port,
          username: params.username,
          password,
          privateKey,
          passphrase,
          readyTimeout: 20000, // 20 seconds
          keepaliveInterval: 10000, // 10 seconds
          hostKey: await loadHostKeyCheck(params.hostId),
        };

        // Worker Threads path (v1.21.0): Use isolated Worker for SSH connection
        // Note: Jump hosts are not yet supported with Worker Threads
        if (USE_WORKER_THREADS && jumpChain.length === 0) {
          logger.info('Using Worker Thread for SSH connection', { sessionId });

          // Register session with isWorkerSession=true, no client needed
          sshSessionManager.createSession(
            sessionId,
            null, // No client in Main Process
            params.hostId,
            params.hostname,
            params.username,
            null, // No stream handler, worker handles output
            true, // isWorkerSession
            sessionId // workerId = sessionId for simplicity
          );

          // Connect via Worker Manager
          await sshWorkerManager.connect(sessionId, params.hostId, connectionConfig);

          logger.info('SSH session established via Worker', {
            sessionId,
            hostname: params.hostname,
            username: params.username,
          });
        } else {
          // Legacy Main Process path (or jump hosts)
          if (jumpChain.length > 0 && USE_WORKER_THREADS) {
            logger.info('Jump hosts detected, using Main Process path', {
              sessionId,
              jumpHosts: jumpChain.length,
            });
          }

          // Create SSH client
          const client = new SSH2Adapter();

          // Register session in SessionManager
          const managedSession = sshSessionManager.createSession(
            sessionId,
            client,
            params.hostId,
            params.hostname,
            params.username,
            null, // streamHandler added later
            false // not a worker session
          );

          // Connect to SSH server (with or without jump hosts)
          if (jumpChain.length > 0) {
            await client.connectWithJumpChain(connectionConfig, jumpChain);
          } else {
            await client.connect(connectionConfig);
          }

          logger.info('SSH client connected, opening shell', { sessionId });

          // Open interactive shell
          const shell = await client.shell({
            term: 'xterm', // Plain xterm for maximum compatibility
            cols: 80,
            rows: 24,
          });

          // Create stream handler with adaptive buffering
          const streamHandler = new SSHStreamHandler(mainWindow, shell, {
            sessionId,
            maxBufferSize: 8192, // 8KB
          });

          // Attach stream handler to the managed session
          managedSession.streamHandler = streamHandler;

          logger.info('SSH session established', {
            sessionId,
            hostname: params.hostname,
            username: params.username,
            jumpHosts: jumpChain.length,
          });
        }

        return {
          success: true,
          sessionId,
        };
      } catch (error) {
        // Clean up session on error
        sshSessionManager.disconnect(sessionId, 'connection-failed');

        logger.error('SSH connection failed', {
          sessionId,
          error,
        });

        // Map error types for better UI feedback
        let errorMessage = 'Unknown error';
        let errorType = 'SSHConnectionError';

        if (error instanceof SSHAuthenticationError) {
          errorMessage = error.message;
          errorType = 'SSHAuthenticationError';
        } else if (error instanceof SSHTimeoutError) {
          errorMessage = error.message;
          errorType = 'SSHTimeoutError';
        } else if (error instanceof SSHConnectionError) {
          errorMessage = error.message;
          errorType = 'SSHConnectionError';
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        return {
          success: false,
          error: {
            message: errorMessage,
            type: errorType,
          },
        };
      }
    }
  );


}
