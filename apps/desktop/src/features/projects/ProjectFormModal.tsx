import React, { useState } from 'react';
import type { HostsTable, ProjectDiscoveryCandidate, ProjectsTable } from '@ownshell/core';
import { AlertCircle, Container, GitBranch, Loader2, Search } from 'lucide-react';
import { AppSelect, Button, cn, FormField, FormInput, Modal } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { type ProjectInput, useDiscoverProjectCandidates } from './useProjectQueries';

interface ProjectFormModalProps {
  project?: ProjectsTable;
  hosts: HostsTable[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (data: ProjectInput) => void | Promise<void>;
}

interface FormErrors {
  name?: string;
  host_id?: string;
  repository_path?: string;
}

export const ProjectFormModal: React.FC<ProjectFormModalProps> = ({
  project,
  hosts,
  isSaving,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(project?.name ?? '');
  const [hostId, setHostId] = useState(project?.host_id ?? '');
  const [repositoryPath, setRepositoryPath] = useState(project?.repository_path ?? '');
  const [composeProject, setComposeProject] = useState(project?.compose_project ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const discovery = useDiscoverProjectCandidates();

  const handleHostChange = (nextHostId: string) => {
    setHostId(nextHostId);
    setErrors((current) => ({ ...current, host_id: undefined }));
    discovery.reset();
  };

  const applyCandidate = (candidate: ProjectDiscoveryCandidate) => {
    if (!candidate.repositoryPath) return;
    if (!name.trim()) setName(candidate.composeProject);
    setRepositoryPath(candidate.repositoryPath);
    setComposeProject(candidate.composeProject);
    setErrors((current) => ({ ...current, repository_path: undefined }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = t('projects.nameRequired');
    if (!hostId) nextErrors.host_id = t('projects.hostRequired');
    if (!repositoryPath.trim()) nextErrors.repository_path = t('projects.pathRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void onSubmit({
      name: name.trim(),
      host_id: hostId,
      repository_path: repositoryPath.trim(),
      compose_project: composeProject.trim() || null,
    });
  };

  return (
    <Modal
      isOpen
      size="lg"
      onClose={onClose}
      title={project ? t('projects.editProject') : t('projects.newProject')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : project ? (
              t('common.update')
            ) : (
              t('common.create')
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('projects.name')} required error={errors.name}>
          <FormInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('projects.namePlaceholder')}
            error={errors.name}
          />
        </FormField>

        <FormField label={t('projects.sshHost')} required error={errors.host_id}>
          <AppSelect
            value={hostId}
            onChange={handleHostChange}
            placeholder={t('projects.selectHost')}
            error={errors.host_id}
            options={hosts.map((host) => ({
              value: host.id,
              label: `${host.label} (${host.username}@${host.hostname})`,
            }))}
          />
        </FormField>

        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t('projects.discoveryTitle')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('projects.discoveryHint')}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              disabled={!hostId || discovery.isPending}
              onClick={() => discovery.mutate(hostId)}
            >
              {discovery.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {discovery.isPending
                ? t('projects.discoveringProjects')
                : t('projects.discoverProjects')}
            </Button>
          </div>

          {discovery.isError && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('projects.discoveryFailed', { error: discovery.error.message })}</span>
            </div>
          )}

          {discovery.data && discovery.data.candidates.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('projects.noDiscoveredProjects')}
            </p>
          )}

          {discovery.data && discovery.data.candidates.length > 0 && (
            <div className="mt-3 space-y-2">
              {discovery.data.candidates.map((candidate) => {
                const canApply = Boolean(candidate.repositoryPath);
                return (
                  <button
                    key={`${candidate.composeProject}-${candidate.workingDirectory}`}
                    type="button"
                    disabled={!canApply}
                    onClick={() => applyCandidate(candidate)}
                    className={cn(
                      'w-full rounded-md border border-border bg-card px-3 py-2 text-left transition-colors',
                      canApply
                        ? 'cursor-pointer hover:border-primary/50 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                        : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <Container className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{candidate.composeProject}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t('projects.containerCount', { count: candidate.containerCount })}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-2 truncate font-mono text-xs text-muted-foreground">
                      <GitBranch className="h-3.5 w-3.5 shrink-0" />
                      {candidate.repositoryPath ?? t('projects.noGitRepository')}
                    </p>
                    {candidate.services.length > 0 && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {t('projects.discoveredServices', {
                          services: candidate.services.join(', '),
                        })}
                      </p>
                    )}
                  </button>
                );
              })}
              {discovery.data.truncated && (
                <p className="text-xs text-warning">{t('projects.discoveryTruncated')}</p>
              )}
            </div>
          )}
        </div>

        <FormField
          label={t('projects.repositoryPath')}
          required
          error={errors.repository_path}
          hint={t('projects.repositoryPathHint')}
        >
          <FormInput
            value={repositoryPath}
            onChange={(event) => setRepositoryPath(event.target.value)}
            placeholder={t('projects.repositoryPathPlaceholder')}
            error={errors.repository_path}
            className="font-mono"
          />
        </FormField>

        <FormField label={t('projects.composeProject')} hint={t('projects.composeProjectHint')}>
          <FormInput
            value={composeProject}
            onChange={(event) => setComposeProject(event.target.value)}
            placeholder={t('projects.composeProjectPlaceholder')}
          />
        </FormField>
      </form>
    </Modal>
  );
};
