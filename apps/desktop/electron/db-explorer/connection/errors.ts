/**
 * Format connection error messages for user display.
 */
export function formatConnectionError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    if (message.includes('ECONNREFUSED')) {
      return 'Connection refused. Please check if the database server is running and accessible.';
    }
    if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
      return 'Connection timed out. Please check the host and port, and ensure the database is reachable.';
    }
    if (message.includes('authentication failed') || message.includes('password')) {
      return 'Authentication failed. Please check your username and password.';
    }
    if (message.includes('database') && message.includes('does not exist')) {
      return 'Database not found. Please verify the database name exists.';
    }
    if (message.includes('SSL')) {
      return 'SSL connection error. Try toggling the SSL option.';
    }
    if (message.includes('ENOTFOUND')) {
      return 'Host not found. Please check the hostname or IP address.';
    }
    if (message.includes('ER_ACCESS_DENIED_ERROR')) {
      return 'Access denied. Please check your username and password.';
    }
    if (message.includes('ER_BAD_DB_ERROR')) {
      return 'Database not found. Please verify the database name.';
    }

    return message;
  }

  return 'An unknown error occurred while connecting to the database.';
}
