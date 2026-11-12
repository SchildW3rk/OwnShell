/**
 * SSH Client Interfaces (Adapter Pattern)
 *
 * These interfaces allow for platform-specific implementations:
 * - Desktop: ssh2 (Node.js native)
 * - Mobile: react-native-ssh-sftp (native bridge)
 *
 * The adapter pattern ensures the core business logic remains platform-agnostic.
 */

export * from './types/connection';
export * from './types/shell';
export * from './types/sftp';
export * from './types/tunnel';
export * from './types/docker';
