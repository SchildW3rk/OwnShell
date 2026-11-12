import type { ProjectDiscoveryData } from '@ownshell/core';

const LABEL_SEPARATOR = '\t';
const LABEL_FIELD_COUNT = 4;
const MAX_CONTAINERS = 500;
const MAX_PROJECTS = 50;

interface MutableCandidate {
  composeProject: string;
  workingDirectory: string;
  configFiles: Set<string>;
  services: Set<string>;
  containerCount: number;
}

function parseLabelString(value: string, maxLength: number): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'string') return null;

    const normalized = parsed.trim();
    if (
      !normalized ||
      normalized.length > maxLength ||
      normalized.includes('\0') ||
      normalized.includes('\n') ||
      normalized.includes('\r')
    ) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export function parseDockerComposeLabelOutput(output: string): ProjectDiscoveryData {
  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  const groups = new Map<string, MutableCandidate>();

  for (const line of lines.slice(0, MAX_CONTAINERS)) {
    const fields = line.split(LABEL_SEPARATOR);
    if (fields.length !== LABEL_FIELD_COUNT) continue;

    const composeProject = parseLabelString(fields[0], 255);
    const service = parseLabelString(fields[1], 255);
    const workingDirectory = parseLabelString(fields[2], 4096);
    const configFilesLabel = parseLabelString(fields[3], 16 * 1024);
    if (!composeProject || !workingDirectory) continue;

    const key = JSON.stringify([composeProject, workingDirectory]);
    const candidate = groups.get(key) ?? {
      composeProject,
      workingDirectory,
      configFiles: new Set<string>(),
      services: new Set<string>(),
      containerCount: 0,
    };

    candidate.containerCount += 1;
    if (service) candidate.services.add(service);
    if (configFilesLabel) {
      for (const configFile of configFilesLabel.split(',')) {
        const normalized = configFile.trim();
        if (normalized) candidate.configFiles.add(normalized);
      }
    }
    groups.set(key, candidate);
  }

  const allCandidates = Array.from(groups.values())
    .map((candidate) => ({
      composeProject: candidate.composeProject,
      workingDirectory: candidate.workingDirectory,
      repositoryPath: null,
      configFiles: Array.from(candidate.configFiles).sort(),
      services: Array.from(candidate.services).sort(),
      containerCount: candidate.containerCount,
    }))
    .sort(
      (left, right) =>
        left.composeProject.localeCompare(right.composeProject) ||
        left.workingDirectory.localeCompare(right.workingDirectory)
    );

  return {
    candidates: allCandidates.slice(0, MAX_PROJECTS),
    truncated: lines.length > MAX_CONTAINERS || allCandidates.length > MAX_PROJECTS,
  };
}
