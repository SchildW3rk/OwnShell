import { shellQuotePath } from '../utils/shell-quote';

export function buildGitInitRepositoryCommand(repositoryPath: string): string {
  const path = shellQuotePath(repositoryPath);

  return [
    `if [ -e ${path} ] && [ ! -d ${path} ]; then printf 'Repository path is not a directory\\n' >&2; exit 1; fi`,
    `mkdir -p -- ${path}`,
    `if git -C ${path} rev-parse --git-dir >/dev/null 2>&1; then printf 'Repository path is already part of a Git repository\\n' >&2; exit 1; fi`,
    `git -C ${path} init`,
    `git -C ${path} symbolic-ref HEAD refs/heads/main`,
  ].join(' && ');
}
