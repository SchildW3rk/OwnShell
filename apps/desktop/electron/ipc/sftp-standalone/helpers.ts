import { sftpConnectionManager } from '../../sftp/sftp-connection-manager';

export function errorResponse(error: unknown): { success: false; error: { message: string } } {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: { message } };
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getSFTPClientOrThrow(connectionId: string) {
  const sftp = sftpConnectionManager.getSFTPClient(connectionId);
  if (!sftp) {
    throw new Error('SFTP connection not found or not connected');
  }
  return sftp;
}
