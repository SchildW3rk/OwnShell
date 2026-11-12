/**
 * Releases IPC Handler
 *
 * Fetches release notes from the OwnShell release service for the "What's New" modal.
 */

import { z } from 'zod';
import { noPayloadSchema } from './schemas/common';
import { logger } from '../logger';
import { safeHandle } from './safe-ipc';

const RELEASES_URL = 'https://release.ownshell.app/releases.json';
const releaseVersionSchema = z.string().min(1).max(64);
const releaseLimitSchema = z.number().finite().int().positive().max(100).default(10);

interface ReleaseInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
}

interface ReleaseManifest {
  version?: unknown;
  changelog?: unknown;
  notes?: unknown;
  releaseDate?: unknown;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function releaseText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function mapReleaseManifest(data: ReleaseManifest): ReleaseInfo | null {
  if (typeof data.version !== 'string' || data.version.trim().length === 0) {
    return null;
  }

  const version = normalizeVersion(data.version);
  return {
    version,
    name: `Version ${version}`,
    body:
      releaseText(data.changelog) ||
      releaseText(data.notes) ||
      '## Neuerungen\n\n- Bugfixes und Verbesserungen',
    publishedAt:
      typeof data.releaseDate === 'string' && data.releaseDate.trim().length > 0
        ? data.releaseDate
        : new Date().toISOString(),
  };
}

async function fetchCurrentRelease(): Promise<ReleaseInfo> {
  logger.info('Fetching release notes from release service');

  const response = await fetch(RELEASES_URL, {
    headers: { 'User-Agent': 'OwnShell-Desktop' },
  });

  if (!response.ok) {
    throw new Error(`Release service error: ${response.status}`);
  }

  const release = mapReleaseManifest((await response.json()) as ReleaseManifest);
  if (!release) {
    throw new Error('Release service returned invalid metadata');
  }

  return release;
}

/**
 * Setup release-related IPC handlers
 */
export function setupReleasesHandlers() {
  logger.info('Setting up releases IPC handlers');

  safeHandle(
    'releases:changelog',
    releaseVersionSchema,
    async (
      _event,
      version
    ): Promise<{ success: boolean; release?: ReleaseInfo; error?: string }> => {
      const requestedVersion = normalizeVersion(version);

      try {
        const release = await fetchCurrentRelease();
        if (release.version !== requestedVersion) {
          return { success: false, error: 'Release not found' };
        }

        return { success: true, release };
      } catch (error) {
        logger.error('Failed to fetch release notes:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch release notes',
        };
      }
    }
  );

  safeHandle(
    'releases:latest',
    noPayloadSchema,
    async (): Promise<{ success: boolean; release?: ReleaseInfo; error?: string }> => {
      try {
        return { success: true, release: await fetchCurrentRelease() };
      } catch (error) {
        logger.error('Failed to fetch latest release:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch latest release',
        };
      }
    }
  );

  safeHandle(
    'releases:all',
    releaseLimitSchema,
    async (
      _event,
      limit
    ): Promise<{ success: boolean; releases?: ReleaseInfo[]; error?: string }> => {
      try {
        const release = await fetchCurrentRelease();
        return { success: true, releases: [release].slice(0, limit) };
      } catch (error) {
        logger.error('Failed to fetch releases:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch releases',
        };
      }
    }
  );

  logger.info('Releases IPC handlers setup complete');
}
