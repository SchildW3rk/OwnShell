import React, { useState } from 'react';
import type { HostsTable, ProjectsTable } from '@ownshell/core';
import { FolderGit2 } from 'lucide-react';
import { ConfirmDialog } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import { SidebarItem, SidebarSection } from '../../components/sidebar';
import type { WorkspacePane } from '../../stores/useWorkspaceStore';
import { ProjectFormModal } from './ProjectFormModal';
import {
  type ProjectInput,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
} from './useProjectQueries';

interface ProjectsSidebarSectionProps {
  projects: ProjectsTable[];
  hosts: HostsTable[];
  panes: WorkspacePane[];
  isLoading: boolean;
  onProjectSelect: (project: ProjectsTable) => void;
}

export const ProjectsSidebarSection: React.FC<ProjectsSidebarSectionProps> = ({
  projects,
  hosts,
  panes,
  isLoading,
  onProjectSelect,
}) => {
  const { t } = useTranslation();
  const [formProject, setFormProject] = useState<ProjectsTable | null | undefined>(undefined);
  const [deleteProject, setDeleteProject] = useState<ProjectsTable | null>(null);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const sshHosts = hosts.filter((host) => host.connection_type !== 'sftp_only');
  const isFormOpen = formProject !== undefined;

  const handleSubmit = async (data: ProjectInput) => {
    if (formProject) {
      await updateProject.mutateAsync({ id: formProject.id, data });
      setFormProject(undefined);
      return;
    }

    const project = await createProject.mutateAsync(data);
    setFormProject(undefined);
    onProjectSelect(project);
  };

  const handleDelete = async () => {
    if (!deleteProject) return;
    await deleteProjectMutation.mutateAsync(deleteProject.id);
    setDeleteProject(null);
  };

  return (
    <>
      <SidebarSection
        title={t('sidebar.projects')}
        onAdd={() => setFormProject(null)}
        emptyMessage={t('sidebar.noProjects')}
        isLoading={isLoading}
      >
        {projects.map((project) => {
          const host = hosts.find((item) => item.id === project.host_id);
          return (
            <SidebarItem
              key={project.id}
              label={project.name}
              sublabel={host ? `${host.label} · ${project.repository_path}` : project.repository_path}
              icon={<FolderGit2 className="h-4 w-4" />}
              badge={{ label: 'Git', variant: 'info' }}
              isActive={panes.some(
                (pane) => pane.type === 'project' && pane.contentId === project.id
              )}
              onClick={() => onProjectSelect(project)}
              onEdit={() => setFormProject(project)}
              onDelete={() => setDeleteProject(project)}
            />
          );
        })}
      </SidebarSection>

      {isFormOpen && (
        <ProjectFormModal
          key={formProject?.id ?? 'new-project'}
          project={formProject ?? undefined}
          hosts={sshHosts}
          isSaving={createProject.isPending || updateProject.isPending}
          onClose={() => setFormProject(undefined)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteProject)}
        title={t('projects.deleteProject')}
        message={t('projects.deleteConfirm', { name: deleteProject?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isLoading={deleteProjectMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteProject(null)}
      />
    </>
  );
};
