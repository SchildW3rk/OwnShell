import { useEffect, useState } from 'react';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useTunnelStore } from '../../stores/useTunnelStore';
import { connectionPromises } from './runtime';

type FeatureSshStatus = 'idle' | 'connecting' | 'connected' | 'error';

export function useFeatureSshSession(termSessionId: string, enabled: boolean): {
  status: FeatureSshStatus;
  error: string | null;
} {
  const [status, setStatus] = useState<FeatureSshStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const session = useTerminalStore((state) => state.sessions.find((s) => s.id === termSessionId));
  const setSessionId = useTerminalStore((state) => state.setSessionId);

  useEffect(() => {
    if (!enabled || !session || session.kind !== 'ssh' || !session.host) {
      setStatus('idle');
      setError(null);
      return;
    }

    if (session.sessionId) {
      setStatus('connected');
      setError(null);
      return;
    }

    let cancelled = false;
    const host = session.host;

    async function connectFeatureSession(): Promise<void> {
      setStatus('connecting');
      setError(null);

      try {
        const existingConnection = connectionPromises.get(termSessionId);
        const connectionPromise =
          existingConnection ||
          (async () => {
            let privateKeyEncrypted: string | undefined;
            let passphraseEncrypted: string | undefined;

            if (host.auth_type === 'key' && host.key_id) {
              const key = await window.electronAPI.keys.getById(host.key_id);
              if (!key) {
                throw new Error('SSH key not found in database');
              }
              privateKeyEncrypted = key.private_key_encrypted;
              passphraseEncrypted = key.passphrase_encrypted || undefined;
            }

            const result = await window.electronAPI.ssh.connect({
              hostId: host.id,
              hostname: host.hostname,
              port: host.port,
              username: host.username,
              passwordEncrypted: host.password_encrypted || undefined,
              privateKeyEncrypted,
              passphraseEncrypted,
              authType: host.auth_type as 'password' | 'key',
              jumpHostId: host.jump_host_id || undefined,
            });

            if (!result.success) {
              throw new Error(result.error?.message || 'Connection failed');
            }

            return result.sessionId;
          })().finally(() => {
            connectionPromises.delete(termSessionId);
          });

        if (!existingConnection) {
          connectionPromises.set(termSessionId, connectionPromise);
        }

        const sshSessionId = await connectionPromise;
        if (cancelled) return;

        setSessionId(termSessionId, sshSessionId);
        setStatus('connected');
        setError(null);
        useTunnelStore.getState().autoStartTunnels(sshSessionId, host.id);
      } catch (connectError) {
        if (cancelled) return;
        const message = connectError instanceof Error ? connectError.message : 'Connection failed';
        setStatus('error');
        setError(message);
      }
    }

    void connectFeatureSession();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    session,
    session?.host,
    session?.sessionId,
    setSessionId,
    termSessionId,
  ]);

  return { status, error };
}
