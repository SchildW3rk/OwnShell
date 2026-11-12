import { shellQuote, shellQuotePath } from '../utils/shell-quote';

function buildPathArguments(paths: string[]): string {
  return paths.map(shellQuote).join(' ');
}

export function buildGitStageFilesCommand(repositoryPath: string, paths: string[]): string {
  return `git -C ${shellQuotePath(repositoryPath)} add -- ${buildPathArguments(paths)}`;
}

export function buildGitUnstageFilesCommand(repositoryPath: string, paths: string[]): string {
  const git = `git -C ${shellQuotePath(repositoryPath)}`;
  const pathArguments = buildPathArguments(paths);
  return `if ${git} rev-parse --verify HEAD >/dev/null 2>&1; then ${git} reset -q HEAD -- ${pathArguments}; else ${git} rm -q --cached --ignore-unmatch -- ${pathArguments}; fi`;
}

export function buildGitCreateCommitCommand(repositoryPath: string, message: string): string {
  return `git -C ${shellQuotePath(repositoryPath)} commit --quiet -m ${shellQuote(message)}`;
}
