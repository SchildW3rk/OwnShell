/**
 * Database connection error
 */
export class DBConnectionError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DBConnectionError';
  }
}

/**
 * Database query error
 */
export class DBQueryError extends Error {
  constructor(
    message: string,
    public code?: string,
    public query?: string,
    public position?: number
  ) {
    super(message);
    this.name = 'DBQueryError';
  }
}

/**
 * Database authentication error
 */
export class DBAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DBAuthenticationError';
  }
}
